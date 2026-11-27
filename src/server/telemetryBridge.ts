import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ExternalTelemetryPayload,
  FaultType,
  MachineStatus,
  MosaicPattern,
  PLCTelemetryV1Payload,
  RobotPhase,
  SimulationState,
  TelemetrySourceMode,
} from '../simulation/palletEngine.ts';

export type ServerCommand =
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'SWAP_PALLET' }
  | { type: 'RESET_SHIFT' }
  | { type: 'TOGGLE_AUTO_SWAP' }
  | { type: 'RESOLVE_FAULT' }
  | { type: 'TRIGGER_DEGRADATION' }
  | { type: 'SET_SPEED'; speedMultiplier: 1 | 2 | 4 }
  | { type: 'SET_SOURCE_MODE'; sourceMode: TelemetrySourceMode }
  | { type: 'TRIGGER_FAULT'; faultType: FaultType }
  | {
      type: 'JUSTIFY_DOWNTIME';
      downtimeId: number;
      reasonCodeId: number;
      justifiedBy: string;
      notes?: string | null;
    }
  | {
      type: 'CHANGE_PATTERN';
      pattern: MosaicPattern;
      shiftTargetBoxes?: number;
    };

export interface PersistedServerSnapshot {
  state: SimulationState;
  speedMultiplier: 1 | 2 | 4;
  sourceMode: TelemetrySourceMode;
  customPatterns: MosaicPattern[];
  lastTelemetryAt: string | null;
}

const VALID_FAULTS: ReadonlySet<string> = new Set([
  'SENSOR_ESTEIRA',
  'PRESSAO_GARRA',
  'DESALINHAMENTO_CAIXA',
  'PARADA_EMERGENCIA',
]);

const VALID_STATUSES: ReadonlySet<string> = new Set([
  'OPERANDO',
  'PAUSADO',
  'FALHA',
  'PALETE_COMPLETO',
  'TROCA_PALETE',
]);

const VALID_PHASES: ReadonlySet<string> = new Set([
  'AGUARDANDO',
  'PEGANDO_CAIXA',
  'MOVENDO',
  'POSICIONANDO',
  'RETORNANDO',
]);

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function clampNumber(val: unknown, min: number, max: number): number | null {
  if (typeof val !== 'number' || !Number.isFinite(val)) return null;
  return Math.min(max, Math.max(min, val));
}

function inRangeNumber(val: unknown, min: number, max: number): number | null {
  if (typeof val !== 'number' || !Number.isFinite(val)) return null;
  if (val < min || val > max) return null;
  return val;
}

export function validatePatternPayload(raw: unknown): MosaicPattern | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.id !== 'string' || raw.id.trim().length === 0 || raw.id.length > 64) return null;
  if (typeof raw.name !== 'string' || raw.name.trim().length === 0 || raw.name.length > 80) return null;
  if (typeof raw.sku !== 'string' || raw.sku.trim().length === 0 || raw.sku.length > 40) return null;

  const cols = clampNumber(raw.cols, 1, 8);
  const rows = clampNumber(raw.rows, 1, 8);
  const layers = clampNumber(raw.layers, 1, 10);
  const boxWeightKg = clampNumber(raw.boxWeightKg, 0.5, 100);
  const cycleTimeSec = clampNumber(raw.cycleTimeSec, 0.5, 30);

  if (cols === null || rows === null || layers === null || boxWeightKg === null || cycleTimeSec === null) {
    return null;
  }

  let dims = { width: 320, depth: 280, height: 240 };
  if (isPlainObject(raw.boxDimensionsMm)) {
    const w = clampNumber(raw.boxDimensionsMm.width, 100, 1000);
    const d = clampNumber(raw.boxDimensionsMm.depth, 100, 1200);
    const h = clampNumber(raw.boxDimensionsMm.height, 80, 600);
    if (w !== null && d !== null && h !== null) {
      dims = { width: Math.round(w), depth: Math.round(d), height: Math.round(h) };
    }
  }

  return {
    id: raw.id.trim(),
    name: raw.name.trim(),
    sku: raw.sku.trim(),
    cols: Math.round(cols),
    rows: Math.round(rows),
    layers: Math.round(layers),
    interlocked: Boolean(raw.interlocked),
    boxWeightKg: Number(boxWeightKg.toFixed(1)),
    boxDimensionsMm: dims,
    cycleTimeSec: Number(cycleTimeSec.toFixed(1)),
  };
}

export function validateCommandPayload(
  raw: unknown,
): { ok: true; command: ServerCommand } | { ok: false; error: string } {
  if (!isPlainObject(raw) || typeof raw.type !== 'string') {
    return { ok: false, error: 'Comando inválido: campo "type" obrigatório.' };
  }

  switch (raw.type) {
    case 'PAUSE':
    case 'RESUME':
    case 'SWAP_PALLET':
    case 'RESET_SHIFT':
    case 'TOGGLE_AUTO_SWAP':
    case 'RESOLVE_FAULT':
    case 'TRIGGER_DEGRADATION':
      return { ok: true, command: { type: raw.type } };

    case 'SET_SPEED':
      if (raw.speedMultiplier === 1 || raw.speedMultiplier === 2 || raw.speedMultiplier === 4) {
        return { ok: true, command: { type: 'SET_SPEED', speedMultiplier: raw.speedMultiplier } };
      }
      return { ok: false, error: 'Velocidade deve ser 1, 2 ou 4.' };

    case 'SET_SOURCE_MODE':
      if (raw.sourceMode === 'SIMULADOR' || raw.sourceMode === 'CLP_EXTERNO') {
        return { ok: true, command: { type: 'SET_SOURCE_MODE', sourceMode: raw.sourceMode } };
      }
      return { ok: false, error: 'Fonte de dados deve ser SIMULADOR ou CLP_EXTERNO.' };

    case 'TRIGGER_FAULT':
      if (typeof raw.faultType === 'string' && VALID_FAULTS.has(raw.faultType)) {
        return {
          ok: true,
          command: { type: 'TRIGGER_FAULT', faultType: raw.faultType as FaultType },
        };
      }
      return { ok: false, error: 'Tipo de falha desconhecido.' };

    case 'JUSTIFY_DOWNTIME': {
      const downtimeId = inRangeNumber(raw.downtimeId, 1, 1_000_000);
      const reasonCodeId = inRangeNumber(raw.reasonCodeId, 1, 100);
      if (
        downtimeId === null ||
        reasonCodeId === null ||
        typeof raw.justifiedBy !== 'string' ||
        raw.justifiedBy.trim().length < 2 ||
        raw.justifiedBy.length > 100
      ) {
        return { ok: false, error: 'Dados de justificativa de parada inválidos.' };
      }
      const notes =
        typeof raw.notes === 'string' && raw.notes.trim().length > 0
          ? raw.notes.trim().slice(0, 300)
          : null;
      return {
        ok: true,
        command: {
          type: 'JUSTIFY_DOWNTIME',
          downtimeId: Math.round(downtimeId),
          reasonCodeId: Math.round(reasonCodeId),
          justifiedBy: raw.justifiedBy.trim(),
          notes,
        },
      };
    }

    case 'CHANGE_PATTERN': {
      const pattern = validatePatternPayload(raw.pattern);
      if (!pattern) {
        return { ok: false, error: 'Receita de mosaico inválida.' };
      }
      const target =
        raw.shiftTargetBoxes !== undefined
          ? clampNumber(raw.shiftTargetBoxes, 12, 10000)
          : undefined;
      return {
        ok: true,
        command: {
          type: 'CHANGE_PATTERN',
          pattern,
          shiftTargetBoxes: target !== null && target !== undefined ? Math.round(target) : undefined,
        },
      };
    }

    default:
      return { ok: false, error: 'Tipo de comando não suportado.' };
  }
}

export function validateTelemetryPayload(
  raw: unknown,
): { ok: true; payload: ExternalTelemetryPayload } | { ok: false; error: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'Payload de telemetria deve ser um objeto JSON.' };
  }

  const payload: ExternalTelemetryPayload = {};

  if (raw.cellState !== undefined) {
    if (typeof raw.cellState !== 'string' || !VALID_STATUSES.has(raw.cellState)) {
      return { ok: false, error: 'Campo "cellState" inválido.' };
    }
    payload.cellState = raw.cellState as MachineStatus;
  }

  if (raw.robotPhase !== undefined) {
    if (typeof raw.robotPhase !== 'string' || !VALID_PHASES.has(raw.robotPhase)) {
      return { ok: false, error: 'Campo "robotPhase" inválido.' };
    }
    payload.robotPhase = raw.robotPhase as RobotPhase;
  }

  if (raw.faultType !== undefined) {
    if (typeof raw.faultType !== 'string' || !VALID_FAULTS.has(raw.faultType)) {
      return { ok: false, error: 'Campo "faultType" inválido.' };
    }
    payload.faultType = raw.faultType as FaultType;
  }

  if (raw.placeBox !== undefined) payload.placeBox = Boolean(raw.placeBox);
  if (raw.clearFault !== undefined) payload.clearFault = Boolean(raw.clearFault);
  if (raw.swapPallet !== undefined) payload.swapPallet = Boolean(raw.swapPallet);

  if (raw.boxCode !== undefined) {
    if (typeof raw.boxCode !== 'string' || raw.boxCode.length > 32) {
      return { ok: false, error: 'Campo "boxCode" inválido.' };
    }
    payload.boxCode = raw.boxCode.trim();
  }

  if (raw.boxWeightKg !== undefined) {
    const val = inRangeNumber(raw.boxWeightKg, 0.5, 150);
    if (val === null) return { ok: false, error: 'Campo "boxWeightKg" inválido.' };
    payload.boxWeightKg = val;
  }

  if (raw.conveyorBoxes !== undefined) {
    const val = inRangeNumber(raw.conveyorBoxes, 0, 12);
    if (val === null) return { ok: false, error: 'Campo "conveyorBoxes" inválido.' };
    payload.conveyorBoxes = val;
  }

  if (raw.airPressureBar !== undefined) {
    const val = inRangeNumber(raw.airPressureBar, 0, 12);
    if (val === null) return { ok: false, error: 'Campo "airPressureBar" inválido.' };
    payload.airPressureBar = val;
  }

  if (raw.gripperVacuumKpa !== undefined) {
    const val = inRangeNumber(raw.gripperVacuumKpa, -100, 0);
    if (val === null) return { ok: false, error: 'Campo "gripperVacuumKpa" inválido.' };
    payload.gripperVacuumKpa = val;
  }

  if (raw.cycleTimeSec !== undefined) {
    const val = inRangeNumber(raw.cycleTimeSec, 0.4, 30);
    if (val === null) return { ok: false, error: 'Campo "cycleTimeSec" inválido.' };
    payload.cycleTimeSec = val;
  }

  return { ok: true, payload };
}

export function validatePlcV1Payload(
  raw: unknown,
): { ok: true; payload: PLCTelemetryV1Payload } | { ok: false; error: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'Payload CLP v1 deve ser um objeto JSON.' };
  }

  if (typeof raw.line_id !== 'string' || raw.line_id.trim().length < 2 || raw.line_id.length > 64) {
    return { ok: false, error: 'Campo "line_id" inválido.' };
  }
  if (typeof raw.sku !== 'string' || raw.sku.trim().length < 1 || raw.sku.length > 64) {
    return { ok: false, error: 'Campo "sku" inválido.' };
  }

  const machineState = inRangeNumber(raw.machine_state, 0, 5);
  const robotStatus = inRangeNumber(raw.robot_status, 0, 5);
  const boxesShift = inRangeNumber(raw.boxes_shift, 0, 1_000_000);
  const completedPallets = inRangeNumber(raw.completed_pallets, 0, 100_000);
  const currentLayer = inRangeNumber(raw.current_layer, 0, 50);
  const boxesInLayer = inRangeNumber(raw.boxes_in_layer, 0, 100);
  const cycleTimeSec = inRangeNumber(raw.cycle_time_sec, 0, 300);
  const alarmCode = raw.alarm_code !== undefined ? inRangeNumber(raw.alarm_code, 0, 99999) : 0;

  if (
    machineState === null ||
    robotStatus === null ||
    boxesShift === null ||
    completedPallets === null ||
    currentLayer === null ||
    boxesInLayer === null ||
    cycleTimeSec === null ||
    alarmCode === null ||
    typeof raw.conveyor_in_ok !== 'boolean' ||
    typeof raw.conveyor_out_ok !== 'boolean'
  ) {
    return { ok: false, error: 'Campos numéricos ou booleanos obrigatórios fora do padrão.' };
  }

  const alarmDesc =
    typeof raw.alarm_description === 'string' && raw.alarm_description.trim().length > 0
      ? raw.alarm_description.trim().slice(0, 255)
      : null;

  const timestamp =
    typeof raw.timestamp === 'string' && !Number.isNaN(Date.parse(raw.timestamp))
      ? new Date(raw.timestamp).toISOString()
      : new Date().toISOString();

  return {
    ok: true,
    payload: {
      line_id: raw.line_id.trim(),
      timestamp,
      machine_state: Math.round(machineState),
      robot_status: Math.round(robotStatus),
      conveyor_in_ok: raw.conveyor_in_ok,
      conveyor_out_ok: raw.conveyor_out_ok,
      sku: raw.sku.trim(),
      boxes_shift: Math.round(boxesShift),
      completed_pallets: Math.round(completedPallets),
      current_layer: Math.round(currentLayer),
      boxes_in_layer: Math.round(boxesInLayer),
      cycle_time_sec: Number(cycleTimeSec.toFixed(2)),
      alarm_code: Math.round(alarmCode),
      alarm_description: alarmDesc,
    },
  };
}

export function validateDowntimeJustifyPayload(
  raw: unknown,
):
  | { ok: true; reasonCodeId: number; justifiedBy: string; notes: string | null }
  | { ok: false; error: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'Corpo JSON inválido.' };
  }
  const reasonCodeId = inRangeNumber(raw.reason_code_id, 1, 100);
  if (
    reasonCodeId === null ||
    typeof raw.justified_by !== 'string' ||
    raw.justified_by.trim().length < 2 ||
    raw.justified_by.length > 100
  ) {
    return { ok: false, error: 'Informe reason_code_id válido e justified_by (>= 2 caracteres).' };
  }
  const notes =
    typeof raw.notes === 'string' && raw.notes.trim().length > 0
      ? raw.notes.trim().slice(0, 300)
      : null;
  return {
    ok: true,
    reasonCodeId: Math.round(reasonCodeId),
    justifiedBy: raw.justified_by.trim(),
    notes,
  };
}

export function verifyOptionalIngestToken(
  expectedToken: string | undefined,
  providedHeader: string | undefined,
): boolean {
  if (!expectedToken || expectedToken.trim().length === 0) {
    return true;
  }
  if (!providedHeader) return false;
  const cleanProvided = providedHeader.replace(/^Bearer\s+/i, '').trim();
  const a = crypto.createHash('sha256').update(expectedToken.trim()).digest();
  const b = crypto.createHash('sha256').update(cleanProvided).digest();
  return crypto.timingSafeEqual(a, b);
}

export function getStoreFilePath(baseDir = process.cwd()): string {
  const dataDir = path.resolve(baseDir, 'data');
  const filePath = path.resolve(dataDir, 'palletizer-store.json');
  if (!filePath.startsWith(dataDir + path.sep)) {
    throw new Error('Invalid persistence path');
  }
  return filePath;
}

export function loadPersistedSnapshot(filePath: string): PersistedServerSnapshot | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedServerSnapshot>;
    if (!parsed || !parsed.state || !Array.isArray(parsed.state.slots)) {
      return null;
    }
    const rawState = parsed.state as Partial<SimulationState>;
    const normalizedState: SimulationState = {
      ...(rawState as SimulationState),
      lineId: typeof rawState.lineId === 'string' ? rawState.lineId : 'PAL-01',
      plannedStopSeconds:
        typeof rawState.plannedStopSeconds === 'number' ? rawState.plannedStopSeconds : 0,
      ewmaCycleSec:
        typeof rawState.ewmaCycleSec === 'number'
          ? rawState.ewmaCycleSec
          : rawState.activePattern?.cycleTimeSec ?? 2.2,
      degradationStreak:
        typeof rawState.degradationStreak === 'number' ? rawState.degradationStreak : 0,
      cycleDegradationActive: Boolean(rawState.cycleDegradationActive),
      downtimeEvents: Array.isArray(rawState.downtimeEvents) ? rawState.downtimeEvents : [],
      openDowntimeId:
        typeof rawState.openDowntimeId === 'number' ? rawState.openDowntimeId : null,
      nextDowntimeId:
        typeof rawState.nextDowntimeId === 'number' ? rawState.nextDowntimeId : 1,
      lastPlcBoxesShift:
        typeof rawState.lastPlcBoxesShift === 'number' ? rawState.lastPlcBoxesShift : null,
      lastPlcCompletedPallets:
        typeof rawState.lastPlcCompletedPallets === 'number'
          ? rawState.lastPlcCompletedPallets
          : null,
    };

    return {
      state: normalizedState,
      speedMultiplier:
        parsed.speedMultiplier === 1 || parsed.speedMultiplier === 2 || parsed.speedMultiplier === 4
          ? parsed.speedMultiplier
          : 1,
      sourceMode: parsed.sourceMode === 'CLP_EXTERNO' ? 'CLP_EXTERNO' : 'SIMULADOR',
      customPatterns: Array.isArray(parsed.customPatterns) ? parsed.customPatterns : [],
      lastTelemetryAt: typeof parsed.lastTelemetryAt === 'string' ? parsed.lastTelemetryAt : null,
    };
  } catch {
    return null;
  }
}

export function savePersistedSnapshot(filePath: string, snapshot: PersistedServerSnapshot): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  } catch {
    // Non-fatal persistence error; keep server operational
  }
}
