import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REASON_CODES,
  FAULT_CATALOG,
  PRESET_PATTERNS,
  applyExternalTelemetry,
  applyPlcV1Telemetry,
  buildPalletSlots,
  calculateBoxesPerMinute,
  calculateOEE,
  calculatePalletProgressPercent,
  calculateShiftProductionPercent,
  changeMosaicPattern,
  computeParetoDowntimes,
  createInitialSimulationState,
  escapeCsvCell,
  generateShiftCsv,
  getCurrentLayerInfo,
  getPalletCapacity,
  injectCycleDegradation,
  justifyDowntimeEvent,
  resolveFaultAndResume,
  stepSimulationTick,
  swapToNextPallet,
  triggerFault,
  updateEwmaCycle,
} from './palletEngine.ts';
import {
  validateCommandPayload,
  validateDowntimeJustifyPayload,
  validatePlcV1Payload,
  validateTelemetryPayload,
  verifyOptionalIngestToken,
} from '../server/telemetryBridge.ts';

test('pallet capacity and slot geometry respect pattern dimensions and interlocked layers', () => {
  const interlocked = PRESET_PATTERNS[2]; // 4x3x5 = 60
  assert.equal(getPalletCapacity(interlocked), 60);

  const slots = buildPalletSlots(interlocked, 15);
  assert.equal(slots.length, 60);
  assert.equal(slots.filter((s) => s.filled).length, 15);

  // Layer 1 (index 0) is not rotated; Layer 2 (index 12) is rotated for interlocking
  assert.equal(slots[0].layer, 1);
  assert.equal(slots[0].rotated, false);
  assert.equal(slots[12].layer, 2);
  assert.equal(slots[12].rotated, true);
});

test('percentage and throughput calculations handle bounds and formatting cleanly', () => {
  assert.equal(calculatePalletProgressPercent(24, 48), 50);
  assert.equal(calculatePalletProgressPercent(48, 48), 100);
  assert.equal(calculatePalletProgressPercent(0, 0), 0);

  assert.equal(calculateShiftProductionPercent(240, 480), 50);
  assert.equal(calculateBoxesPerMinute(30, 60), 30);

  const oee = calculateOEE(900, 100, 400, 2.2, 4);
  assert.ok(oee.availability === 90);
  assert.ok(oee.quality > 98 && oee.quality <= 100);
  assert.ok(oee.oee > 0 && oee.oee <= 100);
});

test('stepSimulationTick fills boxes sequentially until PALETE_COMPLETO and swaps cleanly', () => {
  const smallPattern = PRESET_PATTERNS[1]; // 2x3x4 = 24
  let state = createInitialSimulationState(smallPattern, 22, '10:00:00');
  state.autoSwapPallet = true;

  // Box 23 placed
  state = stepSimulationTick(state, 2.6, '10:00:03');
  assert.equal(state.slots.filter((s) => s.filled).length, 23);
  assert.equal(state.status, 'OPERANDO');

  // Box 24 placed -> pallet complete
  state = stepSimulationTick(state, 2.6, '10:00:06');
  assert.equal(state.slots.filter((s) => s.filled).length, 24);
  assert.equal(state.status, 'PALETE_COMPLETO');
  assert.equal(state.swapCountdownSec, 4);

  // Countdown reaches 0 -> automatic swap
  state = stepSimulationTick(state, 4.0, '10:00:10');
  assert.equal(state.status, 'OPERANDO');
  assert.equal(state.palletNumber, 4);
  assert.equal(state.slots.filter((s) => s.filled).length, 0);
  assert.equal(state.completedPallets.length, 3);
});

test('fault injection halts production, exposes diagnostic checklist, and recovery resumes operation', () => {
  let state = createInitialSimulationState(PRESET_PATTERNS[0], 10, '10:05:00');
  const producedBefore = state.totalProducedBoxes;

  assert.ok(FAULT_CATALOG.PRESSAO_GARRA.checklist.length >= 3);

  state = triggerFault(state, 'PRESSAO_GARRA', '10:05:02');
  assert.equal(state.status, 'FALHA');
  assert.equal(state.activeFault, 'PRESSAO_GARRA');
  assert.equal(state.alerts[0].severity, 'CRITICO');
  assert.equal(state.alerts[0].resolved, false);

  // Ticking during fault adds downtime and does not place boxes
  state = stepSimulationTick(state, 5, '10:05:07');
  assert.equal(state.totalProducedBoxes, producedBefore);
  assert.equal(state.downtimeSeconds, 37);

  // Resolving fault resumes OPERANDO and marks critical alert resolved
  state = resolveFaultAndResume(state, '10:05:10');
  assert.equal(state.status, 'OPERANDO');
  assert.equal(state.activeFault, null);
  assert.equal(state.alerts.some((a) => a.severity === 'CRITICO' && !a.resolved), false);
});

test('layer info and mosaic change work accurately', () => {
  const pattern = PRESET_PATTERNS[0]; // 3x4 = 12/layer
  const info = getCurrentLayerInfo(14, pattern);
  assert.equal(info.currentLayer, 2);
  assert.equal(info.boxesInCurrentLayer, 2);
  assert.equal(info.boxesPerLayer, 12);

  let state = createInitialSimulationState(pattern, 14, '10:10:00');
  state = changeMosaicPattern(state, PRESET_PATTERNS[1], '10:10:05');
  assert.equal(state.activePattern.id, '2x3_pesado');
  assert.equal(state.slots.length, 24);
  assert.equal(state.slots.filter((s) => s.filled).length, 0);

  state = swapToNextPallet(state, '10:10:10');
  assert.equal(state.palletNumber, 4);
});

test('external PLC telemetry applies box scans, sensor readings, and CSV export guards formulas', () => {
  let state = createInitialSimulationState(PRESET_PATTERNS[0], 14, '10:20:00');
  state = applyExternalTelemetry(
    state,
    {
      placeBox: true,
      boxCode: 'CX-CLP-9001',
      boxWeightKg: 14.8,
      airPressureBar: 6.4,
      gripperVacuumKpa: -71,
      conveyorBoxes: 5,
    },
    '10:20:02',
  );

  assert.equal(state.slots[14].filled, true);
  assert.equal(state.slots[14].boxCode, 'CX-CLP-9001');
  assert.equal(state.slots[14].weightKg, 14.8);
  assert.equal(state.airPressureBar, 6.4);
  assert.equal(state.gripperVacuumKpa, -71);
  assert.equal(state.conveyorLoadCount, 5);

  assert.equal(escapeCsvCell('=CMD()'), "'=CMD()");
  const csv = generateShiftCsv(state);
  assert.ok(csv.includes('PLT-0001'));
  assert.ok(csv.includes('ID_Palete;Receita;SKU'));
});

test('server command and telemetry validation enforce schemas and ingest token checks', () => {
  assert.equal(validateCommandPayload({ type: 'SET_SPEED', speedMultiplier: 4 }).ok, true);
  assert.equal(validateCommandPayload({ type: 'SET_SPEED', speedMultiplier: 99 }).ok, false);
  assert.equal(validateCommandPayload({ type: 'TRIGGER_FAULT', faultType: 'UNKNOWN' }).ok, false);

  assert.equal(
    validateTelemetryPayload({ placeBox: true, airPressureBar: 6.2, boxCode: 'CX-01' }).ok,
    true,
  );
  assert.equal(validateTelemetryPayload({ airPressureBar: 999 }).ok, false);

  assert.equal(verifyOptionalIngestToken(undefined, undefined), true);
  assert.equal(verifyOptionalIngestToken('secret-123', 'Bearer secret-123'), true);
  assert.equal(verifyOptionalIngestToken('secret-123', 'Bearer wrong'), false);

  assert.equal(
    validatePlcV1Payload({
      line_id: 'PAL-01',
      machine_state: 1,
      robot_status: 1,
      conveyor_in_ok: true,
      conveyor_out_ok: true,
      sku: 'SKU-ALIM-402',
      boxes_shift: 10,
      completed_pallets: 1,
      current_layer: 1,
      boxes_in_layer: 4,
      cycle_time_sec: 2.2,
      alarm_code: 0,
    }).ok,
    true,
  );
  assert.equal(validatePlcV1Payload({ line_id: 'PAL-01', machine_state: 9 }).ok, false);
  assert.equal(
    validateDowntimeJustifyPayload({ reason_code_id: 5, justified_by: 'Operador A' }).ok,
    true,
  );
  assert.equal(
    validateDowntimeJustifyPayload({ reason_code_id: 5, justified_by: '' }).ok,
    false,
  );
});

test('EWMA predictive degradation, microstop-to-macrostop promotion, justification, and Pareto work accurately', () => {
  const ewma1 = updateEwmaCycle(2.2, 3.6, 0.2);
  assert.equal(ewma1, 2.48);

  let state = createInitialSimulationState(PRESET_PATTERNS[0], 10, '10:30:00');
  state = injectCycleDegradation(state, '10:30:05');
  assert.equal(state.cycleDegradationActive, true);
  assert.equal(state.alerts[0].code, 'PRED-EWMA');

  // Pause & advance 65 seconds -> MICROSTOP becomes MACROSTOP
  state = { ...state, status: 'PAUSADO', robotPhase: 'AGUARDANDO' };
  state = stepSimulationTick(state, 30, '10:30:35');
  assert.equal(state.downtimeEvents[0].downtimeType, 'MICROSTOP');
  state = stepSimulationTick(state, 35, '10:31:10');
  assert.equal(state.downtimeEvents[0].downtimeType, 'MACROSTOP');
  assert.equal(state.downtimeEvents[0].durationSec, 65);

  const downtimeId = state.downtimeEvents[0].id;
  // Justify with OP-05 (id=5, isPlannedStop=true)
  state = justifyDowntimeEvent(state, downtimeId, 5, 'Supervisor', 'Setup programado');
  assert.equal(state.plannedStopSeconds, 65);

  const oeeWithoutDiscount = calculateOEE(
    state.operatingSeconds,
    state.downtimeSeconds,
    state.totalProducedBoxes,
    state.activePattern.cycleTimeSec,
    state.rejectedBoxes,
    0,
  );
  const oee = calculateOEE(
    state.operatingSeconds,
    state.downtimeSeconds,
    state.totalProducedBoxes,
    state.activePattern.cycleTimeSec,
    state.rejectedBoxes,
    state.plannedStopSeconds,
  );
  // Planned stop discounted -> availability rises significantly vs counting planned stop as unplanned
  assert.ok(oee.availability > oeeWithoutDiscount.availability + 10);
  assert.equal(oee.availability, 87.9);

  const pareto = computeParetoDowntimes(state.downtimeEvents, DEFAULT_REASON_CODES, 5);
  assert.ok(pareto.length >= 2);
  assert.equal(pareto[0].totalDurationSec, 65);
  assert.equal(pareto[0].isPlanned, true);
});

test('applyPlcV1Telemetry handles counter rollover, layer overflow anomaly, and SKU mid-pallet abort', () => {
  let state = createInitialSimulationState(PRESET_PATTERNS[0], 5, '11:00:00');

  // First packet establishes lastPlcBoxesShift = 100
  state = applyPlcV1Telemetry(
    state,
    {
      line_id: 'PAL-01',
      timestamp: new Date().toISOString(),
      machine_state: 1,
      robot_status: 1,
      conveyor_in_ok: true,
      conveyor_out_ok: true,
      sku: 'SKU-ALIM-402',
      boxes_shift: 100,
      completed_pallets: 2,
      current_layer: 1,
      boxes_in_layer: 6,
      cycle_time_sec: 2.2,
      alarm_code: 0,
    },
    '11:00:02',
  );
  const producedAfterFirst = state.totalProducedBoxes;

  // Rollover (boxes_shift drops from 100 to 3) + layer overflow (boxes_in_layer 14 > 12)
  state = applyPlcV1Telemetry(
    state,
    {
      line_id: 'PAL-01',
      timestamp: new Date().toISOString(),
      machine_state: 1,
      robot_status: 1,
      conveyor_in_ok: true,
      conveyor_out_ok: true,
      sku: 'SKU-ALIM-402',
      boxes_shift: 3,
      completed_pallets: 2,
      current_layer: 1,
      boxes_in_layer: 14,
      cycle_time_sec: 2.2,
      alarm_code: 0,
    },
    '11:00:05',
  );
  assert.equal(state.totalProducedBoxes, producedAfterFirst + 3);
  assert.ok(state.alerts.some((a) => a.code === 'CLP-RST'));
  assert.ok(state.alerts.some((a) => a.code === 'PAT-OVF'));

  // Mid-pallet SKU change aborts current pallet
  state = applyPlcV1Telemetry(
    state,
    {
      line_id: 'PAL-01',
      timestamp: new Date().toISOString(),
      machine_state: 1,
      robot_status: 1,
      conveyor_in_ok: true,
      conveyor_out_ok: true,
      sku: 'SKU-BEBID-118',
      boxes_shift: 4,
      completed_pallets: 2,
      current_layer: 1,
      boxes_in_layer: 1,
      cycle_time_sec: 2.6,
      alarm_code: 0,
    },
    '11:00:10',
  );
  assert.equal(state.activePattern.sku, 'SKU-BEBID-118');
  assert.equal(state.completedPallets[0].validationStatus, 'INCOMPLETE_ABORTED');
});


