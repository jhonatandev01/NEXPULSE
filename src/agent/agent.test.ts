import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESET_PATTERNS,
  createInitialSimulationState,
  triggerFault,
} from '../simulation/palletEngine.ts';
import {
  NexPulseReadOnlyTools,
  applyOtSafetyGuardrail,
  seedTelemetryHistoryFromState,
  validateAgentChatRequest,
  validateAlarmDiagnoseRequest,
  validateHoursParam,
  validateLineId,
} from './readOnlyTools.ts';

test('NexPulseReadOnlyTools translates simulation state into official PLC tags cleanly', () => {
  let state = createInitialSimulationState(PRESET_PATTERNS[0], 14, '10:00:00');
  state = triggerFault(state, 'PRESSAO_GARRA', '10:00:05');

  const history = seedTelemetryHistoryFromState(state, 20);
  const tools = new NexPulseReadOnlyTools({
    getStateSnapshot: () => state,
    getTelemetryHistory: () => history,
  });

  const snap = tools.get_realtime_cell_snapshot('PAL-01');
  assert.equal(snap.found, true);
  assert.equal(snap.linha_estado, 5);
  assert.equal(snap.linha_estado_label, 'FAULT');
  assert.equal(snap.alarme_ativo_cod, 208);
  assert.equal(snap.sku_ativo, 'SKU-ALIM-402');

  const missingSnap = tools.get_realtime_cell_snapshot('PAL-99');
  assert.equal(missingSnap.found, false);
  assert.ok(Array.isArray(missingSnap.missing));

  const windowRes = tools.get_telemetry_context_window('PAL-01', 120);
  assert.equal(windowRes.found, true);
  assert.equal(windowRes.samples_count, 20);

  const oeeRes = tools.get_shift_oee_and_pareto('PAL-01', 8);
  assert.equal(oeeRes.found, true);
  assert.ok(Array.isArray(oeeRes.pareto_paradas));
  assert.ok(Array.isArray(oeeRes.eventos_paradas_alarmes_recentes));

  const latestDowntimeId = state.downtimeEvents[0].id;
  const stopCtx = tools.get_downtime_classification_context('PAL-01', latestDowntimeId);
  assert.equal(stopCtx.found, true);
  assert.ok(Array.isArray(stopCtx.reason_codes_disponiveis));
});

test('get_predictive_cycle_health detects cycle drift and handles low sample counts', () => {
  const state = createInitialSimulationState(PRESET_PATTERNS[0], 14, '10:00:00');
  const now = Date.now();
  const baseHistory = seedTelemetryHistoryFromState(state, 20, now).map((pt, idx) => ({
    ...pt,
    machineState: 1,
    cycleTimeSec: idx < 10 ? 2.2 : 3.1,
  }));

  const tools = new NexPulseReadOnlyTools({
    getStateSnapshot: () => state,
    getTelemetryHistory: () => baseHistory,
  });

  const health = tools.get_predictive_cycle_health('PAL-01', 4);
  assert.equal(health.found, true);
  assert.equal(health.samples, 20);
  assert.ok((health.deriva_percentual as number) > 35);

  const sparseTools = new NexPulseReadOnlyTools({
    getStateSnapshot: () => state,
    getTelemetryHistory: () => baseHistory.slice(0, 4),
  });
  const sparse = sparseTools.get_predictive_cycle_health('PAL-01', 4);
  assert.equal(sparse.found, false);
  assert.ok(Array.isArray(sparse.missing));
});

test('OT safety guardrail catches forbidden PLC write / bypass commands and validators reject invalid input', () => {
  const safe = applyOtSafetyGuardrail('Verifique o manômetro e inspecione as ventosas da garra.');
  assert.equal(safe.triggered, false);

  const unsafe = applyOtSafetyGuardrail('Você pode fazer force bit ou bypass cortina para testar.');
  assert.equal(unsafe.triggered, true);
  assert.ok(unsafe.text.includes('Aviso de Segurança OT'));

  assert.equal(validateLineId('PAL-01'), 'PAL-01');
  assert.equal(validateLineId('../etc'), null);
  assert.equal(validateHoursParam('4'), 4);
  assert.equal(validateHoursParam('999'), null);

  assert.equal(
    validateAgentChatRequest({
      line_id: 'PAL-01',
      user_role: 'supervisor',
      message: 'Por que o OEE caiu?',
    }).ok,
    true,
  );
  assert.equal(
    validateAgentChatRequest({ line_id: 'PAL-01', message: 'a' }).ok,
    false,
  );

  assert.equal(
    validateAlarmDiagnoseRequest({
      line_id: 'PAL-01',
      alarme_ativo_cod: 208,
      alarm_description: 'FALHA GARRA VACUO',
    }).ok,
    true,
  );
  assert.equal(
    validateAlarmDiagnoseRequest({ line_id: 'PAL-01', alarme_ativo_cod: -1 }).ok,
    false,
  );
});
