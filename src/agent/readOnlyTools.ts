import { Type, type FunctionDeclaration } from '@google/genai';
import {
  DEFAULT_REASON_CODES,
  FAULT_CATALOG,
  calculateOEE,
  computeParetoDowntimes,
  getBoxesPerLayer,
  getCurrentLayerInfo,
  mapMachineStateToCode,
  type SimulationState,
} from '../simulation/palletEngine.ts';
import type {
  AgentChatRequest,
  AlarmDiagnoseRequest,
  TelemetrySample,
  UserRole,
} from './types.ts';

const LINE_ID_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;
const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{4,64}$/;
const VALID_ROLES: ReadonlySet<string> = new Set(['operador', 'manutencao', 'supervisor']);

export const FORBIDDEN_OT_PATTERNS: RegExp[] = [
  /\bforce\s*(i\/o|bit|coil|tag)\b/i,
  /\bbypass\s*(cortina|segurança|interlock|emergência)\b/i,
  /\bescrever\s+diretamente\s+no\s+clp\b/i,
  /\bwrite_register\b/i,
];

export function applyOtSafetyGuardrail(text: string): { text: string; triggered: boolean } {
  for (const pattern of FORBIDDEN_OT_PATTERNS) {
    if (pattern.test(text)) {
      return {
        triggered: true,
        text:
          text +
          '\n\n> Aviso de Segurança OT: Nenhuma alteração física ou escrita de parâmetro no CLP/robô deve ser executada sem bloqueio LOTO e validação presencial da engenharia de automação.',
      };
    }
  }
  return { triggered: false, text };
}

export function validateLineId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return LINE_ID_REGEX.test(trimmed) ? trimmed : null;
}

export function validateHoursParam(raw: unknown, fallback = 4): number | null {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 1 || num > 72) return null;
  return Math.round(num);
}

export function validateAgentChatRequest(
  raw: unknown,
): { ok: true; value: AgentChatRequest } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'Corpo JSON inválido.' };
  }
  const obj = raw as Record<string, unknown>;
  const lineId = validateLineId(obj.line_id);
  if (!lineId) {
    return { ok: false, error: 'Identificador "line_id" inválido (2 a 64 caracteres alfanuméricos).' };
  }
  const role: UserRole =
    typeof obj.user_role === 'string' && VALID_ROLES.has(obj.user_role)
      ? (obj.user_role as UserRole)
      : 'operador';

  if (typeof obj.message !== 'string') {
    return { ok: false, error: 'Campo "message" obrigatório.' };
  }
  const msg = obj.message.trim();
  if (msg.length < 2 || msg.length > 2000) {
    return { ok: false, error: 'Mensagem deve ter entre 2 e 2000 caracteres.' };
  }

  let sessionId: string | null = null;
  if (obj.session_id !== undefined && obj.session_id !== null && obj.session_id !== '') {
    if (typeof obj.session_id !== 'string' || !SESSION_ID_REGEX.test(obj.session_id.trim())) {
      return { ok: false, error: 'Campo "session_id" inválido.' };
    }
    sessionId = obj.session_id.trim();
  }

  return {
    ok: true,
    value: {
      line_id: lineId,
      session_id: sessionId,
      user_role: role,
      message: msg,
    },
  };
}

export function validateAlarmDiagnoseRequest(
  raw: unknown,
): { ok: true; value: AlarmDiagnoseRequest } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'Corpo JSON inválido.' };
  }
  const obj = raw as Record<string, unknown>;
  const lineId = validateLineId(obj.line_id);
  if (!lineId) {
    return { ok: false, error: 'Campo "line_id" inválido.' };
  }
  const alarmCode = Number(obj.alarme_ativo_cod);
  if (!Number.isInteger(alarmCode) || alarmCode < 0 || alarmCode > 99999) {
    return { ok: false, error: 'Código de alarme "alarme_ativo_cod" deve ser inteiro entre 0 e 99999.' };
  }
  const desc =
    typeof obj.alarm_description === 'string' && obj.alarm_description.trim().length > 0
      ? obj.alarm_description.trim().slice(0, 255)
      : null;

  return {
    ok: true,
    value: {
      line_id: lineId,
      alarme_ativo_cod: alarmCode,
      alarm_description: desc,
    },
  };
}

const MACHINE_STATE_NAMES: Record<number, string> = {
  0: 'OFFLINE',
  1: 'RUNNING',
  2: 'STARVED_OR_PAUSED',
  3: 'BLOCKED_PALLET_FULL',
  4: 'CHANGEOVER',
  5: 'FAULT',
};

export function createTelemetrySampleFromState(
  state: SimulationState,
  timeIso = new Date().toISOString(),
): TelemetrySample {
  const placedCount = state.slots.filter((s) => s.filled).length;
  const layerInfo = getCurrentLayerInfo(placedCount, state.activePattern);
  const machineState = mapMachineStateToCode(state.status);
  const faultCode =
    state.activeFault === 'PRESSAO_GARRA'
      ? 208
      : state.activeFault === 'SENSOR_ESTEIRA'
        ? 104
        : state.activeFault === 'DESALINHAMENTO_CAIXA'
          ? 312
          : state.activeFault === 'PARADA_EMERGENCIA'
            ? 1
            : 0;

  return {
    timeIso,
    lineId: state.lineId ?? 'PAL-01',
    machineState,
    robotStatus: state.status === 'OPERANDO' ? 1 : state.status === 'FALHA' ? 5 : 0,
    conveyorInOk: state.activeFault !== 'SENSOR_ESTEIRA' && state.conveyorLoadCount > 0,
    conveyorOutOk: state.status !== 'PALETE_COMPLETO',
    sku: state.activePattern.sku,
    cycleTimeSec:
      state.cycleDegradationActive
        ? Number((state.ewmaCycleSec || state.activePattern.cycleTimeSec * 1.35).toFixed(2))
        : state.activePattern.cycleTimeSec,
    ewmaCycleSec: Number((state.ewmaCycleSec || state.activePattern.cycleTimeSec).toFixed(2)),
    currentLayer: layerInfo.currentLayer,
    boxesInLayer: layerInfo.boxesInCurrentLayer,
    alarmCode: faultCode,
  };
}

export function seedTelemetryHistoryFromState(
  state: SimulationState,
  count = 24,
  nowMs = Date.now(),
): TelemetrySample[] {
  const stepMs = Math.max(1000, Math.round(state.activePattern.cycleTimeSec * 1000));
  const samples: TelemetrySample[] = [];
  const basePlaced = state.slots.filter((s) => s.filled).length;
  const boxesPerLayer = getBoxesPerLayer(state.activePattern);

  for (let i = count - 1; i >= 0; i--) {
    const tIso = new Date(nowMs - i * stepMs).toISOString();
    const simPlaced = Math.max(0, basePlaced - Math.floor(i / 2));
    const layerInfo = getCurrentLayerInfo(simPlaced, state.activePattern);
    const jitter = ((count - i) % 3) * 0.04;
    const isLatest = i === 0;
    const baseSample = createTelemetrySampleFromState(state, tIso);

    if (isLatest) {
      samples.push(baseSample);
    } else {
      samples.push({
        ...baseSample,
        machineState: 1,
        robotStatus: 1,
        conveyorInOk: true,
        conveyorOutOk: true,
        cycleTimeSec: Number((state.activePattern.cycleTimeSec + jitter).toFixed(2)),
        ewmaCycleSec: Number((state.activePattern.cycleTimeSec + jitter * 0.5).toFixed(2)),
        currentLayer: layerInfo.currentLayer,
        boxesInLayer: Math.min(boxesPerLayer, layerInfo.boxesInCurrentLayer),
        alarmCode: 0,
      });
    }
  }
  return samples;
}

export interface ReadOnlyStateSource {
  getStateSnapshot: () => SimulationState;
  getTelemetryHistory: () => readonly TelemetrySample[];
}

/**
 * Conjunto estrito de ferramentas READ-ONLY para o Agente NexPulse.
 * Não possui referência a comandos de escrita, mutação de estado ou publicação em CLP.
 */
export class NexPulseReadOnlyTools {
  private readonly source: ReadOnlyStateSource;

  constructor(source: ReadOnlyStateSource) {
    this.source = source;
  }

  get_realtime_cell_snapshot(lineId: string): Record<string, unknown> {
    const snap = this.source.getStateSnapshot();
    const expectedLine = snap.lineId ?? 'PAL-01';
    if (lineId !== expectedLine) {
      return {
        found: false,
        line_id: lineId,
        missing: [`snapshot_em_tempo_real (linha ${lineId} não localizada; linha ativa: ${expectedLine})`],
      };
    }

    const placedCount = snap.slots.filter((s) => s.filled).length;
    const layerInfo = getCurrentLayerInfo(placedCount, snap.activePattern);
    const machineState = mapMachineStateToCode(snap.status);
    const faultMeta = snap.activeFault ? FAULT_CATALOG[snap.activeFault] : null;
    const activeAlarmCode =
      snap.activeFault === 'PRESSAO_GARRA'
        ? 208
        : snap.activeFault === 'SENSOR_ESTEIRA'
          ? 104
          : snap.activeFault === 'DESALINHAMENTO_CAIXA'
            ? 312
            : snap.activeFault === 'PARADA_EMERGENCIA'
              ? 1
              : 0;

    return {
      found: true,
      line_id: expectedLine,
      timestamp: snap.lastTickTimestamp,
      linha_estado: machineState,
      linha_estado_label: MACHINE_STATE_NAMES[machineState] ?? snap.status,
      robo_status: snap.robotPhase,
      esteira_entrada_ok: snap.activeFault !== 'SENSOR_ESTEIRA' && snap.conveyorLoadCount > 0,
      esteira_saida_ok: snap.status !== 'PALETE_COMPLETO',
      caixas_turno: snap.totalProducedBoxes,
      paletes_concluidos: snap.completedPallets.length,
      ciclo_atual_seg: snap.cycleDegradationActive
        ? Number((snap.ewmaCycleSec || snap.activePattern.cycleTimeSec * 1.4).toFixed(2))
        : snap.activePattern.cycleTimeSec,
      ciclo_ewma_seg: snap.ewmaCycleSec ?? snap.activePattern.cycleTimeSec,
      ciclo_ideal_receita_seg: snap.activePattern.cycleTimeSec,
      sku_ativo: snap.activePattern.sku,
      camada_atual: layerInfo.currentLayer,
      camadas_total: snap.activePattern.layers,
      caixas_na_camada: layerInfo.boxesInCurrentLayer,
      caixas_por_camada: layerInfo.boxesPerLayer,
      alarme_ativo_cod: activeAlarmCode,
      alarme_descricao: faultMeta ? `${faultMeta.code} - ${faultMeta.title}` : null,
      em_parada_aberta: snap.openDowntimeId !== null,
      pressao_ar_bar: snap.airPressureBar,
      vacuo_garra_kpa: snap.gripperVacuumKpa,
    };
  }

  get_telemetry_context_window(
    lineId: string,
    secondsBefore = 90,
    referenceIso?: string | null,
  ): Record<string, unknown> {
    const clampedSec = Math.min(Math.max(Math.round(secondsBefore || 90), 10), 600);
    const refMs =
      referenceIso && !Number.isNaN(Date.parse(referenceIso))
        ? Date.parse(referenceIso)
        : Date.now();
    const startMs = refMs - clampedSec * 1000;

    const history = this.source.getTelemetryHistory();
    const rows = history
      .filter((pt) => {
        if (pt.lineId !== lineId) return false;
        const t = Date.parse(pt.timeIso);
        return t >= startMs && t <= refMs;
      })
      .slice(-120);

    if (rows.length === 0) {
      return {
        found: false,
        window_start: new Date(startMs).toISOString(),
        window_end: new Date(refMs).toISOString(),
        missing: ['telemetry_points (histórico de sensores vazio para esta janela temporal)'],
      };
    }

    return {
      found: true,
      samples_count: rows.length,
      timeline: rows.map((r) => ({
        time: r.timeIso,
        linha_estado: r.machineState,
        robo_status: r.robotStatus,
        esteira_entrada_ok: r.conveyorInOk,
        esteira_saida_ok: r.conveyorOutOk,
        ciclo_atual_seg: r.cycleTimeSec,
        camada_atual: r.currentLayer,
        caixas_na_camada: r.boxesInLayer,
        alarme_ativo_cod: r.alarmCode,
      })),
    };
  }

  get_shift_oee_and_pareto(lineId: string, hours = 8): Record<string, unknown> {
    const snap = this.source.getStateSnapshot();
    const expectedLine = snap.lineId ?? 'PAL-01';
    if (lineId !== expectedLine) {
      return {
        found: false,
        line_id: lineId,
        missing: [`dados_turno (linha ${lineId} não localizada)`],
      };
    }

    const clampedHours = Math.min(Math.max(Math.round(hours || 8), 1), 168);
    const cutoffMs = Date.now() - clampedHours * 3600_000;

    const oee = calculateOEE(
      snap.operatingSeconds,
      snap.downtimeSeconds,
      snap.totalProducedBoxes,
      snap.activePattern.cycleTimeSec,
      snap.rejectedBoxes,
      snap.plannedStopSeconds ?? 0,
    );

    const recentDowntimes = (snap.downtimeEvents ?? [])
      .filter((d) => Date.parse(d.startedAtIso) >= cutoffMs)
      .slice(0, 15);
    const pareto = computeParetoDowntimes(recentDowntimes, DEFAULT_REASON_CODES, 5);

    const palletStatusCounts = snap.completedPallets.reduce<Record<string, number>>((acc, p) => {
      const key = p.validationStatus ?? 'COMPLETE';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return {
      found: true,
      line_id: expectedLine,
      window_hours: clampedHours,
      oee_metrics: {
        ...oee,
        caixas_turno: snap.totalProducedBoxes,
        meta_turno: snap.shiftTargetBoxes,
        paletes_concluidos: snap.completedPallets.length,
        tempo_operando_seg: snap.operatingSeconds,
        tempo_parado_nao_planejado_seg: Math.max(0, snap.downtimeSeconds - (snap.plannedStopSeconds ?? 0)),
        tempo_parado_planejado_seg: snap.plannedStopSeconds ?? 0,
        caixas_rejeitadas: snap.rejectedBoxes,
      },
      pareto_paradas: pareto,
      resumo_paletes_por_status: palletStatusCounts,
      eventos_paradas_alarmes_recentes: recentDowntimes.map((d) => ({
        id: d.id,
        tipo: d.downtimeType,
        linha_estado: d.machineState,
        alarme_ativo_cod: d.alarmCode,
        alarme_descricao: d.alarmDescription,
        inicio: d.startedAtIso,
        duracao_seg: d.durationSec,
        justificada: d.reasonCodeId !== null,
      })),
    };
  }

  get_downtime_classification_context(lineId: string, downtimeId: number): Record<string, unknown> {
    const snap = this.source.getStateSnapshot();
    const ev = (snap.downtimeEvents ?? []).find((d) => d.id === downtimeId && d.lineId === lineId);
    if (!ev) {
      return {
        found: false,
        missing: [`DowntimeEvent id=${downtimeId} para linha ${lineId}`],
      };
    }

    const preWindow = this.get_telemetry_context_window(lineId, 60, ev.startedAtIso);

    return {
      found: true,
      downtime_event: {
        id: ev.id,
        linha_estado: ev.machineState,
        tipo: ev.downtimeType,
        alarme_ativo_cod: ev.alarmCode,
        alarme_descricao: ev.alarmDescription,
        started_at: ev.startedAtIso,
        duration_sec: ev.durationSec,
      },
      reason_codes_disponiveis: DEFAULT_REASON_CODES.map((r) => ({
        id: r.id,
        code: r.code,
        category: r.category,
        description: r.description,
        is_planned_stop: r.isPlannedStop,
      })),
      telemetria_60s_antes: preWindow,
    };
  }

  get_predictive_cycle_health(lineId: string, hours = 4): Record<string, unknown> {
    const snap = this.source.getStateSnapshot();
    const expectedLine = snap.lineId ?? 'PAL-01';
    if (lineId !== expectedLine) {
      return {
        found: false,
        line_id: lineId,
        missing: [`telemetria_linha (${lineId} não localizada)`],
      };
    }

    const clampedHours = Math.min(Math.max(Math.round(hours || 4), 1), 72);
    const cutoffMs = Date.now() - clampedHours * 3600_000;

    const rows = this.source
      .getTelemetryHistory()
      .filter((pt) => {
        if (pt.lineId !== lineId) return false;
        return pt.machineState === 1 && pt.cycleTimeSec > 0 && Date.parse(pt.timeIso) >= cutoffMs;
      });

    const microstopsCount = (snap.downtimeEvents ?? []).filter(
      (ev) => ev.downtimeType === 'MICROSTOP' && Date.parse(ev.startedAtIso) >= cutoffMs,
    ).length;

    const recentAlerts = snap.alerts
      .filter((a) => a.severity !== 'INFO' || a.code === 'PRED-EWMA')
      .slice(0, 10)
      .map((a) => ({
        codigo: a.code,
        severidade: a.severity,
        mensagem: `${a.title}: ${a.description}`,
        em: a.timestamp,
        resolvido: a.resolved,
      }));

    if (rows.length < 10) {
      return {
        found: false,
        microstops_na_janela: microstopsCount,
        missing: ['amostras_suficientes_de_ciclo_em_producao (mínimo 10 pontos com linha_estado=1)'],
      };
    }

    const cycles = rows.map((r) => r.cycleTimeSec);
    const mid = Math.floor(cycles.length / 2);
    const firstHalf = cycles.slice(0, mid);
    const secondHalf = cycles.slice(mid);
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const driftPct = avgFirst > 0 ? ((avgSecond - avgFirst) / avgFirst) * 100 : 0;

    return {
      found: true,
      samples: cycles.length,
      sku_referencia: snap.activePattern.sku,
      ciclo_ideal_receita_seg: snap.activePattern.cycleTimeSec,
      ciclo_medio_primeira_metade_seg: Number(avgFirst.toFixed(3)),
      ciclo_medio_segunda_metade_seg: Number(avgSecond.toFixed(3)),
      deriva_percentual: Number(driftPct.toFixed(2)),
      ultimo_ewma_seg: Number((snap.ewmaCycleSec || rows[rows.length - 1].ewmaCycleSec).toFixed(3)),
      degradacao_ativa_ewma: snap.cycleDegradationActive,
      microparadas_na_janela: microstopsCount,
      alertas_anomalia_recentes: recentAlerts,
    };
  }
}

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'get_realtime_cell_snapshot',
    description:
      'Obtém o snapshot em tempo real da célula de paletização (linha_estado, sensores das esteiras, alarme_ativo_cod, camada atual e ciclo).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        line_id: { type: Type.STRING, description: 'Identificador da célula, ex: PAL-01' },
      },
      required: ['line_id'],
    },
  },
  {
    name: 'get_telemetry_context_window',
    description:
      'Busca a série temporal dos sensores nos segundos anteriores a uma falha ou momento atual.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        line_id: { type: Type.STRING },
        seconds_before: { type: Type.INTEGER, description: 'Janela em segundos (10 a 600).' },
        reference_iso: { type: Type.STRING, description: 'Timestamp ISO-8601 opcional.' },
      },
      required: ['line_id'],
    },
  },
  {
    name: 'get_shift_oee_and_pareto',
    description:
      'Calcula OEE (Disponibilidade, Performance, Qualidade), Pareto de paradas e contagens de paletes no turno.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        line_id: { type: Type.STRING },
        hours: { type: Type.INTEGER, description: 'Janela em horas, padrão 8 para um turno.' },
      },
      required: ['line_id'],
    },
  },
  {
    name: 'get_downtime_classification_context',
    description:
      'Obtém detalhes de uma parada específica, lista oficial de ReasonCodes e sensores dos 60s anteriores.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        line_id: { type: Type.STRING },
        downtime_id: { type: Type.INTEGER },
      },
      required: ['line_id', 'downtime_id'],
    },
  },
  {
    name: 'get_predictive_cycle_health',
    description:
      'Analisa deriva de tempo de ciclo (EWMA), degradação gradual e picos de microparadas para manutenção preditiva.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        line_id: { type: Type.STRING },
        hours: { type: Type.INTEGER, description: 'Janela de análise em horas (padrão 4).' },
      },
      required: ['line_id'],
    },
  },
];
