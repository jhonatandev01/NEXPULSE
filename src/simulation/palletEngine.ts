export type MachineStatus =
  | 'OPERANDO'
  | 'PAUSADO'
  | 'FALHA'
  | 'PALETE_COMPLETO'
  | 'TROCA_PALETE';

export type FaultType =
  | 'SENSOR_ESTEIRA'
  | 'PRESSAO_GARRA'
  | 'DESALINHAMENTO_CAIXA'
  | 'PARADA_EMERGENCIA';

export type AlertSeverity = 'CRITICO' | 'AVISO' | 'INFO';

export type RobotPhase = 'AGUARDANDO' | 'PEGANDO_CAIXA' | 'MOVENDO' | 'POSICIONANDO' | 'RETORNANDO';

export type TelemetrySourceMode = 'SIMULADOR' | 'CLP_EXTERNO';

export interface ExternalTelemetryPayload {
  cellState?: MachineStatus;
  robotPhase?: RobotPhase;
  placeBox?: boolean;
  boxCode?: string;
  boxWeightKg?: number;
  conveyorBoxes?: number;
  airPressureBar?: number;
  gripperVacuumKpa?: number;
  faultType?: FaultType;
  clearFault?: boolean;
  swapPallet?: boolean;
  cycleTimeSec?: number;
}

export interface MosaicPattern {
  id: string;
  name: string;
  sku: string;
  cols: number;
  rows: number;
  layers: number;
  interlocked: boolean;
  boxWeightKg: number;
  boxDimensionsMm: { width: number; depth: number; height: number };
  cycleTimeSec: number;
}

export interface PalletBoxSlot {
  index: number;
  sequenceNumber: number;
  layer: number;
  row: number;
  col: number;
  xMm: number;
  yMm: number;
  zMm: number;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  rotated: boolean;
  filled: boolean;
  boxCode: string | null;
  weightKg: number;
  placedAt: string | null;
}

export interface SystemAlert {
  id: string;
  code: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  station: string;
  timestamp: string;
  acknowledged: boolean;
  resolved: boolean;
  faultType?: FaultType;
}

export type PalletValidationStatus =
  | 'COMPLETE'
  | 'INCOMPLETE_ABORTED'
  | 'OVERCOUNT_ANOMALY';

export type DowntimeClassification = 'MICROSTOP' | 'MACROSTOP' | 'FAULT';

export interface ReasonCode {
  id: number;
  code: string;
  category: 'Mecânica' | 'Elétrica' | 'Logística' | 'Operacional';
  description: string;
  isPlannedStop: boolean;
}

export interface DowntimeEventRecord {
  id: number;
  lineId: string;
  machineState: number;
  downtimeType: DowntimeClassification;
  alarmCode: number;
  alarmDescription: string | null;
  reasonCodeId: number | null;
  justifiedBy: string | null;
  justificationNotes: string | null;
  startedAtIso: string;
  startedAtLabel: string;
  endedAtIso: string | null;
  durationSec: number;
}

export interface ParetoEntry {
  reason: string;
  category: string;
  occurrences: number;
  totalDurationSec: number;
  isPlanned: boolean;
}

export interface PLCTelemetryV1Payload {
  line_id: string;
  timestamp: string;
  machine_state: number; // 0..5
  robot_status: number;
  conveyor_in_ok: boolean;
  conveyor_out_ok: boolean;
  sku: string;
  boxes_shift: number;
  completed_pallets: number;
  current_layer: number;
  boxes_in_layer: number;
  cycle_time_sec: number;
  alarm_code: number;
  alarm_description?: string | null;
}

export interface CompletedPalletRecord {
  palletId: string;
  patternName: string;
  sku: string;
  boxCount: number;
  totalWeightKg: number;
  cycleDurationSec: number;
  completedAt: string;
  status: 'Expedido' | 'Aguardando Retirada';
  validationStatus?: PalletValidationStatus;
}

export interface ThroughputPoint {
  timeLabel: string;
  boxesPerMin: number;
  targetBoxesPerMin: number;
  status: MachineStatus;
  ewmaCycleSec?: number;
}

export interface SimulationState {
  lineId: string;
  status: MachineStatus;
  robotPhase: RobotPhase;
  activePattern: MosaicPattern;
  slots: PalletBoxSlot[];
  activeSlotIndex: number;
  palletNumber: number;
  palletElapsedSec: number;
  totalProducedBoxes: number;
  shiftTargetBoxes: number;
  completedPallets: CompletedPalletRecord[];
  operatingSeconds: number;
  downtimeSeconds: number;
  plannedStopSeconds: number;
  faultCount: number;
  rejectedBoxes: number;
  autoSwapPallet: boolean;
  swapCountdownSec: number;
  activeFault: FaultType | null;
  alerts: SystemAlert[];
  throughputHistory: ThroughputPoint[];
  lastTickTimestamp: string;
  conveyorLoadCount: number;
  gripperVacuumKpa: number;
  airPressureBar: number;
  ewmaCycleSec: number;
  degradationStreak: number;
  cycleDegradationActive: boolean;
  downtimeEvents: DowntimeEventRecord[];
  openDowntimeId: number | null;
  nextDowntimeId: number;
  lastPlcBoxesShift: number | null;
  lastPlcCompletedPallets: number | null;
}

export const MICROSTOP_THRESHOLD_SEC = 60;
export const EWMA_ALPHA = 0.2;
export const CYCLE_DEGRADATION_FACTOR = 1.25;

export const DEFAULT_REASON_CODES: ReasonCode[] = [
  {
    id: 1,
    code: 'LOG-01',
    category: 'Logística',
    description: 'Falta de caixas na esteira de alimentação',
    isPlannedStop: false,
  },
  {
    id: 2,
    code: 'MEC-02',
    category: 'Mecânica',
    description: 'Queda de vácuo / troca de ventosa da garra',
    isPlannedStop: false,
  },
  {
    id: 3,
    code: 'ELE-03',
    category: 'Elétrica',
    description: 'Obstrução ou recalibração do sensor óptico S2',
    isPlannedStop: false,
  },
  {
    id: 4,
    code: 'LOG-04',
    category: 'Logística',
    description: 'Aguardando empilhadeira na saída de paletes',
    isPlannedStop: false,
  },
  {
    id: 5,
    code: 'OP-05',
    category: 'Operacional',
    description: 'Setup / troca programada de receita ou turno',
    isPlannedStop: true,
  },
];

export const PRESET_PATTERNS: MosaicPattern[] = [
  {
    id: '3x4_padrao',
    name: 'Mosaico 3×4 Padrão (48 cx)',
    sku: 'SKU-ALIM-402',
    cols: 3,
    rows: 4,
    layers: 4,
    interlocked: false,
    boxWeightKg: 14.5,
    boxDimensionsMm: { width: 320, depth: 280, height: 240 },
    cycleTimeSec: 2.2,
  },
  {
    id: '2x3_pesado',
    name: 'Mosaico 2×3 Carga Pesada (24 cx)',
    sku: 'SKU-BEBID-118',
    cols: 2,
    rows: 3,
    layers: 4,
    interlocked: false,
    boxWeightKg: 22.0,
    boxDimensionsMm: { width: 480, depth: 380, height: 260 },
    cycleTimeSec: 2.6,
  },
  {
    id: '4x3_intertravado',
    name: 'Mosaico 4×3 Intertravado (60 cx)',
    sku: 'SKU-QUIM-805',
    cols: 4,
    rows: 3,
    layers: 5,
    interlocked: true,
    boxWeightKg: 11.2,
    boxDimensionsMm: { width: 240, depth: 380, height: 210 },
    cycleTimeSec: 1.9,
  },
];

export const FAULT_CATALOG: Record<
  FaultType,
  {
    code: string;
    title: string;
    description: string;
    station: string;
    severity: AlertSeverity;
    checklist: string[];
  }
> = {
  SENSOR_ESTEIRA: {
    code: 'ERR-104',
    title: 'Obstrução no sensor óptico da esteira',
    description: 'Sensor fotoelétrico S2 detectou retenção de caixa na zona de alimentação por mais de 4s.',
    station: 'Esteira de Entrada',
    severity: 'CRITICO',
    checklist: [
      'Remover caixa tombada ou obstrução na zona do sensor S2.',
      'Limpar lente do refletor óptico e confirmar LED verde estável.',
      'Validar livre giro dos rolos antes do rearme automático.',
    ],
  },
  PRESSAO_GARRA: {
    code: 'ERR-208',
    title: 'Queda de pressão na garra a vácuo',
    description: 'Pressão pneumática caiu abaixo de 4,2 bar durante ciclo de sucção da caixa.',
    station: 'Garra Robótica',
    severity: 'CRITICO',
    checklist: [
      'Conferir manômetro principal (mínimo nominal: 5,8 a 6,5 bar).',
      'Inspecionar ventosas e mangueiras de vácuo quanto a fissuras.',
      'Confirmar vedação na face superior da caixa antes de retomar.',
    ],
  },
  DESALINHAMENTO_CAIXA: {
    code: 'WARN-312',
    title: 'Desalinhamento na estação de posicionamento',
    description: 'Caixa fora da tolerância de ±8 mm na guia lateral. Verificação do operador requerida.',
    station: 'Mesa Centralizadora',
    severity: 'CRITICO',
    checklist: [
      'Realinhar caixa contra o batente lateral da zona de pega.',
      'Verificar pressão dos cilindros centralizadores da esteira.',
      'Confirmar integridade das abas da embalagem antes do ciclo.',
    ],
  },
  PARADA_EMERGENCIA: {
    code: 'EMG-001',
    title: 'Botoeira de emergência acionada',
    description: 'Circuito de segurança NR-12 aberto. Liberar botoeira e rearme antes de retomar.',
    station: 'Painel de Segurança',
    severity: 'CRITICO',
    checklist: [
      'Certificar área interna da célula livre de pessoas ou obstáculos.',
      'Destravar botoeira de emergência girando no sentido horário.',
      'Pressionar botão azul de Reset do relé de segurança NR-12.',
    ],
  },
};

export function getPalletCapacity(pattern: MosaicPattern): number {
  return pattern.cols * pattern.rows * pattern.layers;
}

export function getBoxesPerLayer(pattern: MosaicPattern): number {
  return pattern.cols * pattern.rows;
}

export function buildPalletSlots(pattern: MosaicPattern, prefilledCount = 0): PalletBoxSlot[] {
  const slots: PalletBoxSlot[] = [];
  const palletWidthMm = 1000;
  const palletDepthMm = 1200;
  const boxesPerLayer = getBoxesPerLayer(pattern);
  const total = getPalletCapacity(pattern);

  for (let idx = 0; idx < total; idx++) {
    const layer = Math.floor(idx / boxesPerLayer) + 1;
    const withinLayer = idx % boxesPerLayer;
    const isInterlockedOddLayer = pattern.interlocked && layer % 2 === 0;

    // On interlocked odd layers, reverse column/row traversal for mechanical stability
    const rawRow = Math.floor(withinLayer / pattern.cols);
    const rawCol = withinLayer % pattern.cols;
    const row = isInterlockedOddLayer ? pattern.rows - 1 - rawRow : rawRow;
    const col = isInterlockedOddLayer ? pattern.cols - 1 - rawCol : rawCol;

    const cellW = palletWidthMm / pattern.cols;
    const cellD = palletDepthMm / pattern.rows;

    const xMm = Math.round(col * cellW + cellW / 2);
    const yMm = Math.round(row * cellD + cellD / 2);
    const zMm = (layer - 1) * pattern.boxDimensionsMm.height;

    const isFilled = idx < prefilledCount;

    slots.push({
      index: idx,
      sequenceNumber: idx + 1,
      layer,
      row,
      col,
      xMm,
      yMm,
      zMm,
      widthMm: pattern.boxDimensionsMm.width,
      depthMm: pattern.boxDimensionsMm.depth,
      heightMm: pattern.boxDimensionsMm.height,
      rotated: isInterlockedOddLayer,
      filled: isFilled,
      boxCode: isFilled ? formatBoxCode(idx + 1) : null,
      weightKg: pattern.boxWeightKg,
      placedAt: isFilled ? '08:00:00' : null,
    });
  }

  return slots;
}

export function formatBoxCode(seq: number): string {
  return `CX-${String(seq).padStart(5, '0')}`;
}

export function formatPalletId(palletNumber: number): string {
  return `PLT-${String(palletNumber).padStart(4, '0')}`;
}

export function calculatePalletProgressPercent(placedBoxes: number, capacity: number): number {
  if (capacity <= 0) return 0;
  const raw = (placedBoxes / capacity) * 100;
  return Math.min(100, Math.max(0, Number(raw.toFixed(1))));
}

export function calculateShiftProductionPercent(producedBoxes: number, targetBoxes: number): number {
  if (targetBoxes <= 0) return 0;
  const raw = (producedBoxes / targetBoxes) * 100;
  return Math.max(0, Number(raw.toFixed(1)));
}

export function calculateBoxesPerMinute(producedBoxes: number, operatingSeconds: number): number {
  if (operatingSeconds <= 0) return 0;
  return Number(((producedBoxes / operatingSeconds) * 60).toFixed(1));
}

export function calculateOEE(
  operatingSeconds: number,
  downtimeSeconds: number,
  producedBoxes: number,
  idealCycleTimeSec: number,
  rejectedBoxes: number,
  plannedStopSeconds = 0,
): { oee: number; availability: number; performance: number; quality: number } {
  const unplannedDowntime = Math.max(0, downtimeSeconds - Math.max(0, plannedStopSeconds));
  const totalTime = operatingSeconds + unplannedDowntime;
  if (totalTime <= 0 || operatingSeconds <= 0) {
    return { oee: 100, availability: 100, performance: 100, quality: 100 };
  }

  const availability = Math.min(100, Math.max(0, (operatingSeconds / totalTime) * 100));
  const idealOutput = operatingSeconds / Math.max(0.5, idealCycleTimeSec);
  const performance =
    idealOutput > 0 ? Math.min(100, Math.max(0, (producedBoxes / idealOutput) * 100)) : 100;
  const totalAttempted = producedBoxes + rejectedBoxes;
  const quality =
    totalAttempted > 0 ? Math.min(100, Math.max(0, (producedBoxes / totalAttempted) * 100)) : 100;

  const oee = (availability * performance * quality) / 10000;

  return {
    oee: Number(oee.toFixed(1)),
    availability: Number(availability.toFixed(1)),
    performance: Number(performance.toFixed(1)),
    quality: Number(quality.toFixed(1)),
  };
}

export function getCurrentLayerInfo(
  placedCount: number,
  pattern: MosaicPattern,
): { currentLayer: number; boxesInCurrentLayer: number; boxesPerLayer: number } {
  const boxesPerLayer = getBoxesPerLayer(pattern);
  const capacity = getPalletCapacity(pattern);
  if (placedCount >= capacity) {
    return {
      currentLayer: pattern.layers,
      boxesInCurrentLayer: boxesPerLayer,
      boxesPerLayer,
    };
  }
  const currentLayer = Math.floor(placedCount / boxesPerLayer) + 1;
  const boxesInCurrentLayer = placedCount % boxesPerLayer;
  return {
    currentLayer,
    boxesInCurrentLayer,
    boxesPerLayer,
  };
}

export function createInitialSimulationState(
  pattern: MosaicPattern = PRESET_PATTERNS[0],
  initialPrefill = 14,
  timestampLabel = '09:14:30',
): SimulationState {
  const capacity = getPalletCapacity(pattern);
  const clampedPrefill = Math.min(initialPrefill, capacity - 1);
  const slots = buildPalletSlots(pattern, clampedPrefill);

  const completedHistory: CompletedPalletRecord[] = [
    {
      palletId: 'PLT-0001',
      patternName: pattern.name,
      sku: pattern.sku,
      boxCount: capacity,
      totalWeightKg: Number((capacity * pattern.boxWeightKg).toFixed(1)),
      cycleDurationSec: Math.round(capacity * pattern.cycleTimeSec),
      completedAt: '08:32:14',
      status: 'Expedido',
    },
    {
      palletId: 'PLT-0002',
      patternName: pattern.name,
      sku: pattern.sku,
      boxCount: capacity,
      totalWeightKg: Number((capacity * pattern.boxWeightKg).toFixed(1)),
      cycleDurationSec: Math.round(capacity * pattern.cycleTimeSec + 6),
      completedAt: '08:54:40',
      status: 'Expedido',
    },
  ];

  const baseProduced = completedHistory.length * capacity + clampedPrefill;
  const targetRate = Number((60 / pattern.cycleTimeSec).toFixed(1));

  const throughputHistory: ThroughputPoint[] = [
    { timeLabel: '08:20', boxesPerMin: Number((targetRate * 0.94).toFixed(1)), targetBoxesPerMin: targetRate, status: 'OPERANDO' },
    { timeLabel: '08:30', boxesPerMin: Number((targetRate * 0.97).toFixed(1)), targetBoxesPerMin: targetRate, status: 'OPERANDO' },
    { timeLabel: '08:40', boxesPerMin: Number((targetRate * 0.88).toFixed(1)), targetBoxesPerMin: targetRate, status: 'PAUSADO' },
    { timeLabel: '08:50', boxesPerMin: Number((targetRate * 0.96).toFixed(1)), targetBoxesPerMin: targetRate, status: 'OPERANDO' },
    { timeLabel: '09:00', boxesPerMin: Number((targetRate * 0.99).toFixed(1)), targetBoxesPerMin: targetRate, status: 'OPERANDO' },
    { timeLabel: '09:10', boxesPerMin: Number((targetRate * 0.95).toFixed(1)), targetBoxesPerMin: targetRate, status: 'OPERANDO' },
  ];

  const initialAlerts: SystemAlert[] = [
    {
      id: 'init-2',
      code: 'INFO-102',
      severity: 'INFO',
      title: 'Palete PLT-0002 expedido com sucesso',
      description: `${capacity} caixas validadas por peso e código de barras antes da saída.`,
      station: 'Saída de Paletes',
      timestamp: '08:54:40',
      acknowledged: true,
      resolved: true,
    },
    {
      id: 'init-1',
      code: 'INFO-100',
      severity: 'INFO',
      title: 'Turno matutino iniciado na Célula 01',
      description: `Receita ativa: ${pattern.name} (${pattern.sku}).`,
      station: 'Controlador CLP',
      timestamp: '08:00:00',
      acknowledged: true,
      resolved: true,
    },
  ];

  const initialDowntimes: DowntimeEventRecord[] =
    initialPrefill > 0
      ? [
          {
            id: 1,
            lineId: 'PAL-01',
            machineState: 2,
            downtimeType: 'MICROSTOP',
            alarmCode: 0,
            alarmDescription: 'Aguardando alimentação inicial da esteira',
            reasonCodeId: 1,
            justifiedBy: 'Operador Turno A',
            justificationNotes: 'Acomodação de lote inicial na entrada.',
            startedAtIso: new Date(Date.now() - 40 * 60_000).toISOString(),
            startedAtLabel: '08:40:12',
            endedAtIso: new Date(Date.now() - 39.5 * 60_000).toISOString(),
            durationSec: 32,
          },
        ]
      : [];

  return {
    lineId: 'PAL-01',
    status: 'OPERANDO',
    robotPhase: 'PEGANDO_CAIXA',
    activePattern: pattern,
    slots,
    activeSlotIndex: clampedPrefill,
    palletNumber: 3,
    palletElapsedSec: Math.round(clampedPrefill * pattern.cycleTimeSec),
    totalProducedBoxes: baseProduced,
    shiftTargetBoxes: 480,
    completedPallets: completedHistory,
    operatingSeconds: Math.round(baseProduced * pattern.cycleTimeSec),
    downtimeSeconds: initialPrefill > 0 ? 32 : 0,
    plannedStopSeconds: 0,
    faultCount: 0,
    rejectedBoxes: initialPrefill > 0 ? 1 : 0,
    autoSwapPallet: true,
    swapCountdownSec: 0,
    activeFault: null,
    alerts: initialAlerts,
    throughputHistory,
    lastTickTimestamp: timestampLabel,
    conveyorLoadCount: 4,
    gripperVacuumKpa: -68,
    airPressureBar: 6.2,
    ewmaCycleSec: pattern.cycleTimeSec,
    degradationStreak: 0,
    cycleDegradationActive: false,
    downtimeEvents: initialDowntimes,
    openDowntimeId: null,
    nextDowntimeId: initialDowntimes.length + 1,
    lastPlcBoxesShift: null,
    lastPlcCompletedPallets: null,
  };
}

export function updateEwmaCycle(
  prevEwma: number,
  sampleSec: number,
  alpha = EWMA_ALPHA,
): number {
  if (sampleSec <= 0) return prevEwma;
  if (prevEwma <= 0) return Number(sampleSec.toFixed(2));
  return Number((alpha * sampleSec + (1 - alpha) * prevEwma).toFixed(2));
}

export function mapMachineStateToCode(status: MachineStatus): number {
  switch (status) {
    case 'OPERANDO':
      return 1;
    case 'PAUSADO':
      return 2;
    case 'PALETE_COMPLETO':
      return 3;
    case 'TROCA_PALETE':
      return 4;
    case 'FALHA':
      return 5;
  }
}

function openDowntimeRecord(
  state: SimulationState,
  machineStateNum: number,
  alarmCode: number,
  alarmDescription: string | null,
  timestampLabel: string,
): SimulationState {
  const existingEvents = state.downtimeEvents ?? [];
  if (state.openDowntimeId !== null) {
    return state;
  }
  const id = state.nextDowntimeId ?? existingEvents.length + 1;
  const newEv: DowntimeEventRecord = {
    id,
    lineId: state.lineId ?? 'PAL-01',
    machineState: machineStateNum,
    downtimeType: machineStateNum === 5 ? 'FAULT' : 'MICROSTOP',
    alarmCode,
    alarmDescription,
    reasonCodeId: null,
    justifiedBy: null,
    justificationNotes: null,
    startedAtIso: new Date().toISOString(),
    startedAtLabel: timestampLabel,
    endedAtIso: null,
    durationSec: 0,
  };
  return {
    ...state,
    downtimeEvents: [newEv, ...existingEvents].slice(0, 60),
    openDowntimeId: id,
    nextDowntimeId: id + 1,
  };
}

function advanceOpenDowntime(state: SimulationState, deltaSec: number): SimulationState {
  if (state.openDowntimeId === null) return state;
  const events = state.downtimeEvents ?? [];
  const nextEvents = events.map((ev) => {
    if (ev.id !== state.openDowntimeId) return ev;
    const nextDur = Number((ev.durationSec + deltaSec).toFixed(1));
    const nextType: DowntimeClassification =
      ev.downtimeType === 'FAULT'
        ? 'FAULT'
        : nextDur >= MICROSTOP_THRESHOLD_SEC
          ? 'MACROSTOP'
          : 'MICROSTOP';
    return { ...ev, durationSec: nextDur, downtimeType: nextType };
  });
  return { ...state, downtimeEvents: nextEvents };
}

export function closeOpenDowntime(state: SimulationState): SimulationState {
  if (state.openDowntimeId === null) return state;
  const events = state.downtimeEvents ?? [];
  const nowIso = new Date().toISOString();
  const nextEvents = events.map((ev) => {
    if (ev.id !== state.openDowntimeId) return ev;
    const nextType: DowntimeClassification =
      ev.downtimeType === 'FAULT'
        ? 'FAULT'
        : ev.durationSec >= MICROSTOP_THRESHOLD_SEC
          ? 'MACROSTOP'
          : 'MICROSTOP';
    return { ...ev, endedAtIso: nowIso, downtimeType: nextType };
  });
  return {
    ...state,
    downtimeEvents: nextEvents,
    openDowntimeId: null,
  };
}

export function justifyDowntimeEvent(
  state: SimulationState,
  downtimeId: number,
  reasonCodeId: number,
  justifiedBy: string,
  notes: string | null = null,
): SimulationState {
  const reason = DEFAULT_REASON_CODES.find((r) => r.id === reasonCodeId);
  if (!reason) return state;
  const nextEvents = (state.downtimeEvents ?? []).map((ev) =>
    ev.id === downtimeId
      ? {
          ...ev,
          reasonCodeId,
          justifiedBy: justifiedBy.trim(),
          justificationNotes: notes?.trim() || null,
        }
      : ev,
  );
  const plannedStopSeconds = nextEvents.reduce((acc, ev) => {
    const r = DEFAULT_REASON_CODES.find((c) => c.id === ev.reasonCodeId);
    return r?.isPlannedStop ? acc + ev.durationSec : acc;
  }, 0);
  return {
    ...state,
    downtimeEvents: nextEvents,
    plannedStopSeconds: Number(plannedStopSeconds.toFixed(1)),
  };
}

export function computeParetoDowntimes(
  events: DowntimeEventRecord[],
  reasonCodes: ReasonCode[] = DEFAULT_REASON_CODES,
  limit = 5,
): ParetoEntry[] {
  const map = new Map<string, ParetoEntry>();
  for (const ev of events) {
    const reasonObj = reasonCodes.find((r) => r.id === ev.reasonCodeId);
    const key = reasonObj
      ? `${reasonObj.code} · ${reasonObj.description}`
      : ev.alarmDescription
        ? `Não Justificada (${ev.alarmDescription})`
        : 'Não Justificada / Microparada';
    const existing = map.get(key) ?? {
      reason: key,
      category: reasonObj?.category ?? (ev.downtimeType === 'FAULT' ? 'Falha' : 'Pendente'),
      occurrences: 0,
      totalDurationSec: 0,
      isPlanned: reasonObj?.isPlannedStop ?? false,
    };
    existing.occurrences += 1;
    existing.totalDurationSec = Number((existing.totalDurationSec + ev.durationSec).toFixed(1));
    map.set(key, existing);
  }
  return Array.from(map.values())
    .sort((a, b) => b.totalDurationSec - a.totalDurationSec)
    .slice(0, limit);
}

export function injectCycleDegradation(
  state: SimulationState,
  timestampLabel: string,
): SimulationState {
  const degradedCycle = Number((state.activePattern.cycleTimeSec * 1.48).toFixed(2));
  let ewma = state.ewmaCycleSec || state.activePattern.cycleTimeSec;
  for (let i = 0; i < 6; i++) {
    ewma = updateEwmaCycle(ewma, degradedCycle);
  }
  const alert: SystemAlert = {
    id: `ewma-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    code: 'PRED-EWMA',
    severity: 'AVISO',
    title: 'Degradação preditiva no tempo de ciclo (EWMA)',
    description: `Ciclo suavizado EWMA atingiu ${ewma.toFixed(2)}s (>25% acima do nominal ${state.activePattern.cycleTimeSec.toFixed(1)}s). Verificar atuadores e fluxo.`,
    station: 'Análise Preditiva EWMA',
    timestamp: timestampLabel,
    acknowledged: false,
    resolved: false,
  };
  return {
    ...state,
    ewmaCycleSec: ewma,
    degradationStreak: 10,
    cycleDegradationActive: true,
    alerts: [alert, ...state.alerts].slice(0, 40),
    lastTickTimestamp: timestampLabel,
  };
}

export function triggerFault(
  state: SimulationState,
  faultType: FaultType,
  timestampLabel: string,
): SimulationState {
  const catalog = FAULT_CATALOG[faultType];
  const alert: SystemAlert = {
    id: `fault-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    code: catalog.code,
    severity: catalog.severity,
    title: catalog.title,
    description: catalog.description,
    station: catalog.station,
    timestamp: timestampLabel,
    acknowledged: false,
    resolved: false,
    faultType,
  };

  const nextWithAlert: SimulationState = {
    ...state,
    status: 'FALHA',
    robotPhase: 'AGUARDANDO',
    activeFault: faultType,
    faultCount: state.faultCount + 1,
    gripperVacuumKpa: faultType === 'PRESSAO_GARRA' ? -18 : -52,
    airPressureBar: faultType === 'PRESSAO_GARRA' ? 3.8 : 6.1,
    alerts: [alert, ...state.alerts].slice(0, 40),
    lastTickTimestamp: timestampLabel,
  };
  return openDowntimeRecord(
    nextWithAlert,
    5,
    faultType === 'PRESSAO_GARRA' ? 208 : faultType === 'SENSOR_ESTEIRA' ? 104 : faultType === 'DESALINHAMENTO_CAIXA' ? 312 : 1,
    catalog.title,
    timestampLabel,
  );
}

export function resolveFaultAndResume(
  state: SimulationState,
  timestampLabel: string,
): SimulationState {
  const updatedAlerts = state.alerts.map((a) =>
    !a.resolved && a.severity === 'CRITICO'
      ? { ...a, acknowledged: true, resolved: true }
      : a,
  );

  const recoveryAlert: SystemAlert = {
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    code: 'OK-200',
    severity: 'INFO',
    title: 'Falha reconhecida e ciclo retomado',
    description: 'Operador validou desobstrução e rearme do sistema de segurança.',
    station: 'Operação HMI',
    timestamp: timestampLabel,
    acknowledged: true,
    resolved: true,
  };

  return closeOpenDowntime({
    ...state,
    status: 'OPERANDO',
    robotPhase: 'PEGANDO_CAIXA',
    activeFault: null,
    gripperVacuumKpa: -68,
    airPressureBar: 6.2,
    alerts: [recoveryAlert, ...updatedAlerts].slice(0, 40),
    lastTickTimestamp: timestampLabel,
  });
}

export function swapToNextPallet(
  state: SimulationState,
  timestampLabel: string,
): SimulationState {
  const placedCount = state.slots.filter((s) => s.filled).length;
  const totalWeightKg = Number((placedCount * state.activePattern.boxWeightKg).toFixed(1));
  const newRecord: CompletedPalletRecord = {
    palletId: formatPalletId(state.palletNumber),
    patternName: state.activePattern.name,
    sku: state.activePattern.sku,
    boxCount: placedCount,
    totalWeightKg,
    cycleDurationSec: Math.max(1, Math.round(state.palletElapsedSec)),
    completedAt: timestampLabel,
    status: 'Expedido',
  };

  const nextPalletNumber = state.palletNumber + 1;
  const freshSlots = buildPalletSlots(state.activePattern, 0);

  const swapAlert: SystemAlert = {
    id: `swap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    code: 'PLT-OK',
    severity: 'INFO',
    title: `Palete ${newRecord.palletId} concluído e expedido`,
    description: `${placedCount} caixas (${totalWeightKg} kg). Novo palete ${formatPalletId(nextPalletNumber)} posicionado.`,
    station: 'Saída de Paletes',
    timestamp: timestampLabel,
    acknowledged: true,
    resolved: true,
  };

  return {
    ...state,
    status: 'OPERANDO',
    robotPhase: 'PEGANDO_CAIXA',
    slots: freshSlots,
    activeSlotIndex: 0,
    palletNumber: nextPalletNumber,
    palletElapsedSec: 0,
    swapCountdownSec: 0,
    completedPallets: [newRecord, ...state.completedPallets],
    alerts: [swapAlert, ...state.alerts].slice(0, 40),
    lastTickTimestamp: timestampLabel,
  };
}

export function changeMosaicPattern(
  state: SimulationState,
  pattern: MosaicPattern,
  timestampLabel: string,
): SimulationState {
  const freshSlots = buildPalletSlots(pattern, 0);
  const patternAlert: SystemAlert = {
    id: `pat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    code: 'CFG-101',
    severity: 'INFO',
    title: `Receita alterada para ${pattern.name}`,
    description: `Configuração ${pattern.cols}×${pattern.rows} × ${pattern.layers} camadas (${getPalletCapacity(pattern)} caixas/palete).`,
    station: 'Configuração de Mosaico',
    timestamp: timestampLabel,
    acknowledged: true,
    resolved: true,
  };

  return {
    ...state,
    status: state.status === 'FALHA' ? 'FALHA' : 'OPERANDO',
    robotPhase: 'PEGANDO_CAIXA',
    activePattern: pattern,
    slots: freshSlots,
    activeSlotIndex: 0,
    palletElapsedSec: 0,
    swapCountdownSec: 0,
    alerts: [patternAlert, ...state.alerts].slice(0, 40),
    lastTickTimestamp: timestampLabel,
  };
}

export function stepSimulationTick(
  state: SimulationState,
  deltaSeconds: number,
  timestampLabel: string,
): SimulationState {
  if (state.status === 'PAUSADO' || state.status === 'FALHA') {
    const withOpen =
      state.openDowntimeId === null
        ? openDowntimeRecord(
            state,
            mapMachineStateToCode(state.status),
            state.status === 'FALHA' ? 208 : 0,
            state.status === 'PAUSADO' ? 'Parada programada' : 'Falha ativa',
            timestampLabel,
          )
        : state;
    const advanced = advanceOpenDowntime(withOpen, deltaSeconds);
    return {
      ...advanced,
      downtimeSeconds: Number((state.downtimeSeconds + deltaSeconds).toFixed(1)),
      lastTickTimestamp: timestampLabel,
    };
  }

  if (state.status === 'PALETE_COMPLETO') {
    if (!state.autoSwapPallet) {
      const advanced = advanceOpenDowntime(
        openDowntimeRecord(state, 3, 0, 'Aguardando retirada de palete completo', timestampLabel),
        deltaSeconds,
      );
      return {
        ...advanced,
        downtimeSeconds: Number((state.downtimeSeconds + deltaSeconds).toFixed(1)),
        lastTickTimestamp: timestampLabel,
      };
    }

    const remaining = state.swapCountdownSec - deltaSeconds;
    if (remaining <= 0) {
      return swapToNextPallet(closeOpenDowntime(state), timestampLabel);
    }
    return {
      ...state,
      status: 'PALETE_COMPLETO',
      swapCountdownSec: Number(remaining.toFixed(1)),
      lastTickTimestamp: timestampLabel,
    };
  }

  // OPERANDO: place next box when cycle step completes
  const capacity = getPalletCapacity(state.activePattern);
  const nextIdx = state.slots.findIndex((s) => !s.filled);

  if (nextIdx === -1) {
    // Already full
    return {
      ...state,
      status: 'PALETE_COMPLETO',
      robotPhase: 'AGUARDANDO',
      swapCountdownSec: state.autoSwapPallet ? 4 : 0,
      lastTickTimestamp: timestampLabel,
    };
  }

  const nextTotalBoxes = state.totalProducedBoxes + 1;
  const boxCode = formatBoxCode(nextTotalBoxes);

  const updatedSlots = state.slots.map((slot, i) =>
    i === nextIdx
      ? {
          ...slot,
          filled: true,
          boxCode,
          placedAt: timestampLabel,
        }
      : slot,
  );

  const placedAfter = nextIdx + 1;
  const palletJustCompleted = placedAfter >= capacity;

  const newOperatingSeconds = state.operatingSeconds + deltaSeconds;
  const currentRate = calculateBoxesPerMinute(nextTotalBoxes, newOperatingSeconds);
  const targetRate = Number((60 / state.activePattern.cycleTimeSec).toFixed(1));

  // Append throughput sample every 4 boxes to keep chart clean & responsive
  const shouldAppendChart = nextTotalBoxes % 4 === 0 || palletJustCompleted;
  const nextHistory = shouldAppendChart
    ? [
        ...state.throughputHistory.slice(-14),
        {
          timeLabel: timestampLabel.slice(0, 5),
          boxesPerMin: currentRate,
          targetBoxesPerMin: targetRate,
          status: palletJustCompleted ? ('PALETE_COMPLETO' as MachineStatus) : ('OPERANDO' as MachineStatus),
        },
      ]
    : state.throughputHistory;

  const phases: RobotPhase[] = ['PEGANDO_CAIXA', 'MOVENDO', 'POSICIONANDO', 'RETORNANDO'];
  const nextPhase = palletJustCompleted
    ? 'AGUARDANDO'
    : phases[(nextIdx + 1) % phases.length];

  const completionAlert: SystemAlert[] = palletJustCompleted
    ? [
        {
          id: `full-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          code: 'AVS-400',
          severity: 'AVISO',
          title: `Palete ${formatPalletId(state.palletNumber)} completo (100%)`,
          description: state.autoSwapPallet
            ? `Capacidade máxima de ${capacity} caixas atingida. Troca automática iniciada.`
            : `Capacidade máxima de ${capacity} caixas atingida. Aguardando liberação do operador.`,
          station: 'Célula Robótica',
          timestamp: timestampLabel,
          acknowledged: false,
          resolved: false,
        },
      ]
    : [];

  const nextEwma = updateEwmaCycle(state.ewmaCycleSec ?? state.activePattern.cycleTimeSec, deltaSeconds);
  const degraded = nextEwma > state.activePattern.cycleTimeSec * CYCLE_DEGRADATION_FACTOR;

  return closeOpenDowntime({
    ...state,
    status: palletJustCompleted ? 'PALETE_COMPLETO' : 'OPERANDO',
    robotPhase: nextPhase,
    slots: updatedSlots,
    activeSlotIndex: palletJustCompleted ? nextIdx : placedAfter,
    palletElapsedSec: state.palletElapsedSec + deltaSeconds,
    totalProducedBoxes: nextTotalBoxes,
    operatingSeconds: newOperatingSeconds,
    swapCountdownSec: palletJustCompleted && state.autoSwapPallet ? 4 : 0,
    throughputHistory: nextHistory.map((pt, idx) =>
      idx === nextHistory.length - 1 ? { ...pt, ewmaCycleSec: nextEwma } : pt,
    ),
    alerts: [...completionAlert, ...state.alerts].slice(0, 40),
    conveyorLoadCount: Math.max(2, Math.min(6, 3 + (nextTotalBoxes % 3))),
    gripperVacuumKpa: -66 - (nextTotalBoxes % 5),
    airPressureBar: Number((6.1 + ((nextTotalBoxes % 3) * 0.1)).toFixed(1)),
    ewmaCycleSec: nextEwma,
    cycleDegradationActive: degraded,
    degradationStreak: degraded ? (state.degradationStreak ?? 0) + 1 : 0,
    lastTickTimestamp: timestampLabel,
  });
}

export function applyExternalTelemetry(
  state: SimulationState,
  payload: ExternalTelemetryPayload,
  timestampLabel: string,
): SimulationState {
  let next = { ...state, lastTickTimestamp: timestampLabel };

  if (payload.faultType) {
    return triggerFault(next, payload.faultType, timestampLabel);
  }

  if (payload.clearFault && next.status === 'FALHA') {
    next = resolveFaultAndResume(next, timestampLabel);
  }

  if (payload.swapPallet) {
    next = swapToNextPallet(next, timestampLabel);
  }

  if (payload.placeBox) {
    const cycleDelta =
      typeof payload.cycleTimeSec === 'number' && payload.cycleTimeSec > 0
        ? payload.cycleTimeSec
        : next.activePattern.cycleTimeSec;
    if (next.status === 'PALETE_COMPLETO') {
      next = swapToNextPallet(next, timestampLabel);
    }
    if (next.status !== 'OPERANDO') {
      next = { ...next, status: 'OPERANDO' };
    }
    next = stepSimulationTick(next, cycleDelta, timestampLabel);

    // Override last placed box code/weight if external barcode scanner/scale provided values
    if (payload.boxCode || typeof payload.boxWeightKg === 'number') {
      const lastPlacedIdx = next.slots.reduce(
        (acc, slot, idx) => (slot.filled ? idx : acc),
        -1,
      );
      if (lastPlacedIdx >= 0) {
        next = {
          ...next,
          slots: next.slots.map((slot, idx) =>
            idx === lastPlacedIdx
              ? {
                  ...slot,
                  boxCode: payload.boxCode ? payload.boxCode.slice(0, 32) : slot.boxCode,
                  weightKg:
                    typeof payload.boxWeightKg === 'number' && payload.boxWeightKg > 0
                      ? Number(payload.boxWeightKg.toFixed(1))
                      : slot.weightKg,
                }
              : slot,
          ),
        };
      }
    }
  }

  if (payload.cellState && payload.cellState !== 'FALHA') {
    next = { ...next, status: payload.cellState };
  }
  if (payload.robotPhase) {
    next = { ...next, robotPhase: payload.robotPhase };
  }
  if (typeof payload.conveyorBoxes === 'number') {
    next = {
      ...next,
      conveyorLoadCount: Math.max(0, Math.min(12, Math.round(payload.conveyorBoxes))),
    };
  }
  if (typeof payload.airPressureBar === 'number') {
    next = {
      ...next,
      airPressureBar: Number(Math.max(0, Math.min(12, payload.airPressureBar)).toFixed(1)),
    };
  }
  if (typeof payload.gripperVacuumKpa === 'number') {
    next = {
      ...next,
      gripperVacuumKpa: Math.round(Math.max(-100, Math.min(0, payload.gripperVacuumKpa))),
    };
  }

  return next;
}

export function escapeCsvCell(raw: string | number): string {
  const str = String(raw);
  const needsFormulaGuard = /^[=+\-@\t\r]/.test(str);
  const safe = needsFormulaGuard ? `'${str}` : str;
  if (/[",\n\r;]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function generateShiftCsv(state: SimulationState): string {
  const header = [
    'ID_Palete',
    'Receita',
    'SKU',
    'Caixas',
    'Peso_Total_kg',
    'Ciclo_s',
    'Conclusao',
    'Situacao',
  ].join(';');

  const rows = state.completedPallets.map((rec) =>
    [
      escapeCsvCell(rec.palletId),
      escapeCsvCell(rec.patternName),
      escapeCsvCell(rec.sku),
      escapeCsvCell(rec.boxCount),
      escapeCsvCell(rec.totalWeightKg.toFixed(1)),
      escapeCsvCell(rec.cycleDurationSec),
      escapeCsvCell(rec.completedAt),
      escapeCsvCell(rec.status),
    ].join(';'),
  );

  return `\uFEFF${[header, ...rows].join('\r\n')}\r\n`;
}

function mapPlcMachineState(machineState: number): {
  status: MachineStatus;
  phase: RobotPhase;
  faultType: FaultType | null;
} {
  switch (machineState) {
    case 1:
      return { status: 'OPERANDO', phase: 'MOVENDO', faultType: null };
    case 3:
      return { status: 'PALETE_COMPLETO', phase: 'AGUARDANDO', faultType: null };
    case 4:
      return { status: 'TROCA_PALETE', phase: 'AGUARDANDO', faultType: null };
    case 5:
      return { status: 'FALHA', phase: 'AGUARDANDO', faultType: 'PRESSAO_GARRA' };
    case 0:
    case 2:
    default:
      return { status: 'PAUSADO', phase: 'AGUARDANDO', faultType: null };
  }
}

export function applyPlcV1Telemetry(
  state: SimulationState,
  payload: PLCTelemetryV1Payload,
  timestampLabel: string,
  availablePatterns: MosaicPattern[] = PRESET_PATTERNS,
): SimulationState {
  let next: SimulationState = {
    ...state,
    lineId: payload.line_id,
    lastTickTimestamp: timestampLabel,
  };

  // 1. Check SKU switch mid-pallet
  if (payload.sku && payload.sku !== next.activePattern.sku) {
    const filledOnCurrent = next.slots.filter((s) => s.filled).length;
    if (filledOnCurrent > 0) {
      const abortedRecord: CompletedPalletRecord = {
        palletId: formatPalletId(next.palletNumber),
        patternName: next.activePattern.name,
        sku: next.activePattern.sku,
        boxCount: filledOnCurrent,
        totalWeightKg: Number((filledOnCurrent * next.activePattern.boxWeightKg).toFixed(1)),
        cycleDurationSec: Math.max(1, Math.round(next.palletElapsedSec)),
        completedAt: timestampLabel,
        status: 'Expedido',
        validationStatus: 'INCOMPLETE_ABORTED',
      };
      const skuAlert: SystemAlert = {
        id: `sku-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        code: 'SKU-CHG',
        severity: 'AVISO',
        title: `Troca de SKU (${next.activePattern.sku} → ${payload.sku}) com palete aberto`,
        description: `Palete ${abortedRecord.palletId} encerrado com ${filledOnCurrent} caixas (INCOMPLETE_ABORTED).`,
        station: 'Rastreio CLP',
        timestamp: timestampLabel,
        acknowledged: false,
        resolved: false,
      };
      next = {
        ...next,
        palletNumber: next.palletNumber + 1,
        palletElapsedSec: 0,
        completedPallets: [abortedRecord, ...next.completedPallets],
        alerts: [skuAlert, ...next.alerts].slice(0, 40),
      };
    }
    const matchedPattern = availablePatterns.find((p) => p.sku === payload.sku);
    const nextPattern = matchedPattern ?? { ...next.activePattern, sku: payload.sku };
    next = {
      ...next,
      activePattern: nextPattern,
      slots: buildPalletSlots(nextPattern, 0),
      activeSlotIndex: 0,
    };
  }

  // 2. Machine State & Downtime Lifecycle (0..5)
  const mapped = mapPlcMachineState(payload.machine_state);
  const isStopped = payload.machine_state !== 1;
  const elapsedDelta = payload.cycle_time_sec > 0 ? payload.cycle_time_sec : 1;

  if (isStopped) {
    if (next.openDowntimeId === null) {
      next = openDowntimeRecord(
        next,
        payload.machine_state,
        payload.alarm_code,
        payload.alarm_description ??
          (payload.machine_state === 5
            ? 'Falha reportada pelo CLP'
            : payload.machine_state === 2
              ? 'Aguardando material na esteira'
              : 'Parada de linha'),
        timestampLabel,
      );
    }
    next = advanceOpenDowntime(next, elapsedDelta);
    next = {
      ...next,
      status: mapped.status,
      robotPhase: mapped.phase,
      activeFault:
        payload.machine_state === 5
          ? payload.alarm_code === 104
            ? 'SENSOR_ESTEIRA'
            : payload.alarm_code === 312
              ? 'DESALINHAMENTO_CAIXA'
              : payload.alarm_code === 1
                ? 'PARADA_EMERGENCIA'
                : 'PRESSAO_GARRA'
          : null,
      faultCount:
        payload.machine_state === 5 && state.status !== 'FALHA'
          ? next.faultCount + 1
          : next.faultCount,
      downtimeSeconds: Number((next.downtimeSeconds + elapsedDelta).toFixed(1)),
      conveyorLoadCount: payload.conveyor_in_ok ? Math.max(2, next.conveyorLoadCount) : 0,
      gripperVacuumKpa: payload.machine_state === 5 ? -20 : -55,
      airPressureBar: payload.machine_state === 5 ? 4.0 : 6.1,
    };
  } else {
    next = closeOpenDowntime({
      ...next,
      status: 'OPERANDO',
      robotPhase: mapped.phase,
      activeFault: null,
      conveyorLoadCount: payload.conveyor_in_ok ? Math.max(3, next.conveyorLoadCount) : 1,
      gripperVacuumKpa: -68,
      airPressureBar: 6.2,
    });
  }

  // 3. Layer / Pattern Overflow Anomaly Detection
  const boxesPerLayer = getBoxesPerLayer(next.activePattern);
  if (
    payload.boxes_in_layer > boxesPerLayer ||
    payload.current_layer > next.activePattern.layers
  ) {
    const anomalyAlert: SystemAlert = {
      id: `ovf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code: 'PAT-OVF',
      severity: 'CRITICO',
      title: `Excesso no padrão do SKU ${payload.sku}`,
      description: `Camada ${payload.current_layer}/${next.activePattern.layers} · ${payload.boxes_in_layer}/${boxesPerLayer} cx/camada (PALLET_PATTERN_ANOMALY).`,
      station: 'Inspeção de Mosaico',
      timestamp: timestampLabel,
      acknowledged: false,
      resolved: false,
    };
    next = {
      ...next,
      alerts: [anomalyAlert, ...next.alerts].slice(0, 40),
    };
  }

  // 4. PLC Counter Rollover Detection & Box Accumulation
  let deltaBoxes = 0;
  if (next.lastPlcBoxesShift === null) {
    deltaBoxes = payload.machine_state === 1 ? 1 : 0;
  } else if (payload.boxes_shift >= next.lastPlcBoxesShift) {
    deltaBoxes = payload.boxes_shift - next.lastPlcBoxesShift;
  } else {
    // Rollover / reset detected on PLC counter
    deltaBoxes = payload.boxes_shift;
    const rolloverAlert: SystemAlert = {
      id: `rol-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code: 'CLP-RST',
      severity: 'INFO',
      title: 'Reset / rollover no contador do CLP detectado',
      description: `Contador reiniciou de ${next.lastPlcBoxesShift} para ${payload.boxes_shift}. Delta seguro aplicado.`,
      station: 'Gateway IIoT',
      timestamp: timestampLabel,
      acknowledged: true,
      resolved: true,
    };
    next = {
      ...next,
      alerts: [rolloverAlert, ...next.alerts].slice(0, 40),
    };
  }
  next = { ...next, lastPlcBoxesShift: payload.boxes_shift };

  const capacity = getPalletCapacity(next.activePattern);
  const clampedDelta = Math.min(deltaBoxes, capacity);
  if (clampedDelta > 0) {
    let totalBoxes = next.totalProducedBoxes;
    let updatedSlots = [...next.slots];
    let placedNow = 0;

    for (let b = 0; b < clampedDelta; b++) {
      const idx = updatedSlots.findIndex((s) => !s.filled);
      if (idx === -1) break;
      totalBoxes += 1;
      placedNow += 1;
      updatedSlots[idx] = {
        ...updatedSlots[idx],
        filled: true,
        boxCode: formatBoxCode(totalBoxes),
        placedAt: timestampLabel,
      };
    }

    const filledCount = updatedSlots.filter((s) => s.filled).length;
    const cycleDelta = payload.cycle_time_sec > 0 ? payload.cycle_time_sec : next.activePattern.cycleTimeSec;
    const newOpSec = next.operatingSeconds + cycleDelta * Math.max(1, placedNow);
    const rate = calculateBoxesPerMinute(totalBoxes, newOpSec);
    const targetRate = Number((60 / next.activePattern.cycleTimeSec).toFixed(1));

    next = {
      ...next,
      slots: updatedSlots,
      activeSlotIndex: Math.min(capacity - 1, filledCount),
      totalProducedBoxes: totalBoxes,
      operatingSeconds: Number(newOpSec.toFixed(1)),
      palletElapsedSec: Number((next.palletElapsedSec + cycleDelta).toFixed(1)),
      throughputHistory: [
        ...next.throughputHistory.slice(-14),
        {
          timeLabel: timestampLabel.slice(0, 5),
          boxesPerMin: rate,
          targetBoxesPerMin: targetRate,
          status: next.status,
          ewmaCycleSec: next.ewmaCycleSec,
        },
      ],
    };
  }

  // 5. Completed Pallet Counter Roll-up from PLC
  const prevCompleted = next.lastPlcCompletedPallets;
  if (prevCompleted !== null && payload.completed_pallets > prevCompleted) {
    const filledOnPallet = next.slots.filter((s) => s.filled).length;
    const validationStatus: PalletValidationStatus =
      filledOnPallet > capacity
        ? 'OVERCOUNT_ANOMALY'
        : filledOnPallet < capacity
          ? 'INCOMPLETE_ABORTED'
          : 'COMPLETE';
    const swapped = swapToNextPallet(next, timestampLabel);
    if (swapped.completedPallets.length > 0) {
      swapped.completedPallets = swapped.completedPallets.map((rec, i) =>
        i === 0 ? { ...rec, validationStatus } : rec,
      );
    }
    next = swapped;
  }
  next = { ...next, lastPlcCompletedPallets: payload.completed_pallets };

  // 6. Predictive Cycle Degradation (EWMA)
  if (payload.machine_state === 1 && payload.cycle_time_sec > 0) {
    const nextEwma = updateEwmaCycle(
      next.ewmaCycleSec || payload.cycle_time_sec,
      payload.cycle_time_sec,
    );
    const isDegraded =
      nextEwma > next.activePattern.cycleTimeSec * CYCLE_DEGRADATION_FACTOR;
    const nextStreak = isDegraded ? (next.degradationStreak ?? 0) + 1 : 0;

    next = {
      ...next,
      ewmaCycleSec: nextEwma,
      degradationStreak: nextStreak,
      cycleDegradationActive: isDegraded,
    };

    if (nextStreak >= 5) {
      const ewmaAlert: SystemAlert = {
        id: `ewma-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        code: 'PRED-EWMA',
        severity: 'AVISO',
        title: 'Degradação preditiva no tempo de ciclo (EWMA)',
        description: `EWMA em ${nextEwma.toFixed(2)}s vs nominal ${next.activePattern.cycleTimeSec.toFixed(1)}s (>25%).`,
        station: 'Análise Preditiva EWMA',
        timestamp: timestampLabel,
        acknowledged: false,
        resolved: false,
      };
      next = {
        ...next,
        degradationStreak: 0,
        alerts: [ewmaAlert, ...next.alerts].slice(0, 40),
      };
    }
  }

  return next;
}


