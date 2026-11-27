import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import {
  DEFAULT_REASON_CODES,
  PRESET_PATTERNS,
  applyExternalTelemetry,
  applyPlcV1Telemetry,
  calculateOEE,
  changeMosaicPattern,
  closeOpenDowntime,
  computeParetoDowntimes,
  createInitialSimulationState,
  generateShiftCsv,
  getBoxesPerLayer,
  getPalletCapacity,
  injectCycleDegradation,
  justifyDowntimeEvent,
  resolveFaultAndResume,
  stepSimulationTick,
  swapToNextPallet,
  triggerFault,
  type MosaicPattern,
  type SimulationState,
  type TelemetrySourceMode,
} from './src/simulation/palletEngine.ts';
import {
  getStoreFilePath,
  loadPersistedSnapshot,
  savePersistedSnapshot,
  validateCommandPayload,
  validateDowntimeJustifyPayload,
  validatePatternPayload,
  validatePlcV1Payload,
  validateTelemetryPayload,
  verifyOptionalIngestToken,
  type PersistedServerSnapshot,
  type ServerCommand,
} from './src/server/telemetryBridge.ts';
import {
  AgentConfigError,
  NexPulseAgentService,
} from './src/agent/nexpulseAgent.ts';
import {
  createTelemetrySampleFromState,
  seedTelemetryHistoryFromState,
  validateAgentChatRequest,
  validateAlarmDiagnoseRequest,
  validateHoursParam,
  validateLineId,
} from './src/agent/readOnlyTools.ts';
import type { TelemetrySample } from './src/agent/types.ts';

function getCurrentTimeLabel(): string {
  return new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  const storePath = getStoreFilePath();
  const restored = loadPersistedSnapshot(storePath);

  let store: PersistedServerSnapshot = restored ?? {
    state: createInitialSimulationState(PRESET_PATTERNS[0], 14, getCurrentTimeLabel()),
    speedMultiplier: 1,
    sourceMode: 'SIMULADOR',
    customPatterns: [],
    lastTelemetryAt: null,
  };

  // Bounded telemetry ring buffer for Read-Only AI Agent context windows & predictive drift checks
  let telemetrySamples: TelemetrySample[] = seedTelemetryHistoryFromState(store.state, 24);
  const recordTelemetrySample = (stateSnapshot: SimulationState) => {
    const sample = createTelemetrySampleFromState(stateSnapshot);
    telemetrySamples = [...telemetrySamples.slice(-599), sample];
  };

  const agentService = new NexPulseAgentService({
    getStateSnapshot: () => store.state,
    getTelemetryHistory: () => telemetrySamples,
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const reqUrl = request.url ?? '';
    const pathname = reqUrl.split('?')[0];
    if (pathname === '/ws' || /^\/ws\/lines\/[a-zA-Z0-9_-]{1,64}$/.test(pathname)) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  const buildClientPayload = () => ({
    state: store.state,
    speedMultiplier: store.speedMultiplier,
    sourceMode: store.sourceMode,
    customPatterns: store.customPatterns,
    lastTelemetryAt: store.lastTelemetryAt,
    connectedClients: wss.clients.size,
  });

  const broadcastState = () => {
    const message = JSON.stringify({
      type: 'state:sync',
      payload: buildClientPayload(),
    });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  };

  let persistDirty = false;
  const markDirty = (immediate = false) => {
    persistDirty = true;
    if (immediate) {
      persistDirty = false;
      savePersistedSnapshot(storePath, store);
    }
  };

  // Flush persisted state every 5 seconds if changed
  setInterval(() => {
    if (persistDirty) {
      persistDirty = false;
      savePersistedSnapshot(storePath, store);
    }
  }, 5000);

  // Authoritative simulation loop on the server when sourceMode === 'SIMULADOR'
  let simTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleNextTick = () => {
    if (simTimer) clearTimeout(simTimer);
    const delayMs =
      store.state.status === 'OPERANDO'
        ? Math.max(
            350,
            Math.round((store.state.activePattern.cycleTimeSec * 1000) / store.speedMultiplier),
          )
        : 1000;

    simTimer = setTimeout(() => {
      if (store.sourceMode === 'SIMULADOR') {
        const deltaSec =
          store.state.status === 'OPERANDO' ? store.state.activePattern.cycleTimeSec : 1;
        store = {
          ...store,
          state: stepSimulationTick(store.state, deltaSec, getCurrentTimeLabel()),
        };
        recordTelemetrySample(store.state);
        markDirty(false);
        broadcastState();
      }
      scheduleNextTick();
    }, delayMs);
  };
  scheduleNextTick();

  const applyCommand = (cmd: ServerCommand) => {
    const ts = getCurrentTimeLabel();
    const prev = store.state;
    let nextState: SimulationState = prev;
    let nextSpeed = store.speedMultiplier;
    let nextSource: TelemetrySourceMode = store.sourceMode;
    let nextCustom: MosaicPattern[] = store.customPatterns;

    switch (cmd.type) {
      case 'PAUSE':
        if (prev.status === 'OPERANDO') {
          nextState = {
            ...prev,
            status: 'PAUSADO',
            robotPhase: 'AGUARDANDO',
            alerts: [
              {
                id: `pause-${Date.now()}`,
                code: 'OP-110',
                severity: 'AVISO' as const,
                title: 'Parada programada acionada pelo operador',
                description: 'Linha pausada manualmente via painel de controle.',
                station: 'Operação HMI',
                timestamp: ts,
                acknowledged: true,
                resolved: true,
              },
              ...prev.alerts,
            ].slice(0, 40),
            lastTickTimestamp: ts,
          };
        }
        break;

      case 'RESUME':
        if (prev.status === 'PAUSADO') {
          nextState = closeOpenDowntime({
            ...prev,
            status: 'OPERANDO',
            robotPhase: 'PEGANDO_CAIXA',
            alerts: [
              {
                id: `resume-${Date.now()}`,
                code: 'OP-112',
                severity: 'INFO' as const,
                title: 'Operação retomada pelo operador',
                description: 'Célula robótica em ciclo automático de paletização.',
                station: 'Operação HMI',
                timestamp: ts,
                acknowledged: true,
                resolved: true,
              },
              ...prev.alerts,
            ].slice(0, 40),
            lastTickTimestamp: ts,
          });
        } else if (prev.status === 'FALHA') {
          nextState = resolveFaultAndResume(prev, ts);
        }
        break;

      case 'RESOLVE_FAULT':
        nextState = resolveFaultAndResume(prev, ts);
        break;

      case 'TRIGGER_FAULT':
        nextState = triggerFault(prev, cmd.faultType, ts);
        break;

      case 'TRIGGER_DEGRADATION':
        nextState = injectCycleDegradation(prev, ts);
        break;

      case 'JUSTIFY_DOWNTIME':
        nextState = justifyDowntimeEvent(
          prev,
          cmd.downtimeId,
          cmd.reasonCodeId,
          cmd.justifiedBy,
          cmd.notes,
        );
        break;

      case 'SWAP_PALLET':
        nextState = swapToNextPallet(closeOpenDowntime(prev), ts);
        break;

      case 'TOGGLE_AUTO_SWAP':
        nextState = {
          ...prev,
          autoSwapPallet: !prev.autoSwapPallet,
          swapCountdownSec: !prev.autoSwapPallet && prev.status === 'PALETE_COMPLETO' ? 4 : 0,
        };
        break;

      case 'RESET_SHIFT':
        nextState = createInitialSimulationState(prev.activePattern, 0, ts);
        break;

      case 'SET_SPEED':
        nextSpeed = cmd.speedMultiplier;
        break;

      case 'SET_SOURCE_MODE':
        nextSource = cmd.sourceMode;
        nextState = {
          ...prev,
          alerts: [
            {
              id: `src-${Date.now()}`,
              code: nextSource === 'CLP_EXTERNO' ? 'NET-201' : 'SIM-200',
              severity: 'INFO' as const,
              title:
                nextSource === 'CLP_EXTERNO'
                  ? 'Modo CLP / Telemetria Externa ativado'
                  : 'Modo Simulador Interno ativado',
              description:
                nextSource === 'CLP_EXTERNO'
                  ? 'Aguardando pacotes JSON em POST /api/v1/telemetry ou /api/telemetry.'
                  : 'Motor local determinístico assumiu o ciclo automático da célula.',
              station: 'Gateway IIoT',
              timestamp: ts,
              acknowledged: true,
              resolved: true,
            },
            ...prev.alerts,
          ].slice(0, 40),
        };
        break;

      case 'CHANGE_PATTERN': {
        const isPreset = PRESET_PATTERNS.some((p) => p.id === cmd.pattern.id);
        if (!isPreset) {
          nextCustom = [cmd.pattern, ...store.customPatterns.filter((p) => p.id !== cmd.pattern.id)];
        }
        nextState = changeMosaicPattern(prev, cmd.pattern, ts);
        if (cmd.shiftTargetBoxes !== undefined) {
          nextState = { ...nextState, shiftTargetBoxes: cmd.shiftTargetBoxes };
        }
        break;
      }
    }

    store = {
      ...store,
      state: nextState,
      speedMultiplier: nextSpeed,
      sourceMode: nextSource,
      customPatterns: nextCustom,
    };

    recordTelemetrySample(store.state);
    markDirty(true);
    broadcastState();
    scheduleNextTick();
  };

  wss.on('connection', (socket) => {
    socket.send(
      JSON.stringify({
        type: 'state:sync',
        payload: buildClientPayload(),
      }),
    );

    socket.on('close', () => {
      // Keep client count fresh on next broadcast
    });
  });

  // REST API Endpoints
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      sourceMode: store.sourceMode,
      status: store.state.status,
      connectedClients: wss.clients.size,
    });
  });

  app.get('/api/state', (_req, res) => {
    res.json(buildClientPayload());
  });

  app.post('/api/command', (req, res) => {
    const check = validateCommandPayload(req.body);
    if (!check.ok) {
      res.status(400).json({ ok: false, error: check.error });
      return;
    }
    applyCommand(check.command);
    res.json({ ok: true, ...buildClientPayload() });
  });

  app.post('/api/telemetry', (req, res) => {
    const expectedToken = process.env.TELEMETRY_INGEST_TOKEN;
    const providedToken =
      req.header('x-telemetry-token') ?? req.header('authorization') ?? undefined;
    if (!verifyOptionalIngestToken(expectedToken, providedToken)) {
      res.status(401).json({ ok: false, error: 'Token de telemetria inválido.' });
      return;
    }

    const check = validateTelemetryPayload(req.body);
    if (!check.ok) {
      res.status(400).json({ ok: false, error: check.error });
      return;
    }

    const ts = getCurrentTimeLabel();
    const updatedState = applyExternalTelemetry(store.state, check.payload, ts);

    store = {
      ...store,
      sourceMode: 'CLP_EXTERNO',
      state: updatedState,
      lastTelemetryAt: ts,
    };

    recordTelemetrySample(store.state);
    markDirty(true);
    broadcastState();
    res.json({ ok: true, ...buildClientPayload() });
  });

  app.get('/api/export/csv', (_req, res) => {
    const csv = generateShiftCsv(store.state);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="paletizapro-turno.csv"');
    res.send(csv);
  });

  // ==========================================
  // Industrial /api/v1/* Analytics & PLC API
  // ==========================================
  app.get('/api/v1/health', (_req, res) => {
    res.json({
      status: 'healthy',
      storage: 'atomic-json',
      realtime_ws: 'up',
      line_id: store.state.lineId,
      connected_clients: wss.clients.size,
    });
  });

  app.get('/api/v1/recipes', (_req, res) => {
    const all = [...PRESET_PATTERNS, ...store.customPatterns];
    res.json(
      all.map((r, idx) => ({
        id: idx + 1,
        pattern_id: r.id,
        sku: r.sku,
        name: r.name,
        boxes_per_layer: getBoxesPerLayer(r),
        total_layers: r.layers,
        ideal_cycle_sec: r.cycleTimeSec,
      })),
    );
  });

  app.post('/api/v1/recipes', (req, res) => {
    const raw = req.body as Record<string, unknown> | undefined;
    const candidate = raw
      ? {
          id:
            typeof raw.pattern_id === 'string'
              ? raw.pattern_id
              : `sku_${String(raw.sku ?? 'custom').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`,
          name: raw.name,
          sku: raw.sku,
          cols: typeof raw.cols === 'number' ? raw.cols : 3,
          rows:
            typeof raw.rows === 'number'
              ? raw.rows
              : typeof raw.boxes_per_layer === 'number'
                ? Math.max(1, Math.round(raw.boxes_per_layer / 3))
                : 4,
          layers: typeof raw.total_layers === 'number' ? raw.total_layers : raw.layers,
          interlocked: Boolean(raw.interlocked),
          boxWeightKg: typeof raw.boxWeightKg === 'number' ? raw.boxWeightKg : 14.5,
          cycleTimeSec:
            typeof raw.ideal_cycle_sec === 'number' ? raw.ideal_cycle_sec : raw.cycleTimeSec,
        }
      : null;
    const validated = validatePatternPayload(candidate);
    if (!validated) {
      res.status(400).json({ ok: false, error: 'Receita inválida.' });
      return;
    }
    const all = [...PRESET_PATTERNS, ...store.customPatterns];
    if (all.some((p) => p.sku === validated.sku)) {
      res.status(409).json({ ok: false, error: 'SKU já cadastrado.' });
      return;
    }
    store = {
      ...store,
      customPatterns: [validated, ...store.customPatterns],
    };
    markDirty(true);
    res.status(201).json({ ok: true, id: all.length + 1, sku: validated.sku });
  });

  app.post('/api/v1/telemetry', (req, res) => {
    const expectedToken = process.env.TELEMETRY_INGEST_TOKEN;
    const providedToken =
      req.header('x-telemetry-token') ?? req.header('authorization') ?? undefined;
    if (!verifyOptionalIngestToken(expectedToken, providedToken)) {
      res.status(401).json({ ok: false, error: 'Token de telemetria inválido.' });
      return;
    }

    const check = validatePlcV1Payload(req.body);
    if (!check.ok) {
      res.status(400).json({ ok: false, error: check.error });
      return;
    }

    const ts = getCurrentTimeLabel();
    const allPatterns = [...PRESET_PATTERNS, ...store.customPatterns];
    const updatedState = applyPlcV1Telemetry(store.state, check.payload, ts, allPatterns);

    store = {
      ...store,
      sourceMode: 'CLP_EXTERNO',
      state: updatedState,
      lastTelemetryAt: ts,
    };

    recordTelemetrySample(store.state);
    markDirty(true);
    broadcastState();
    res.json({
      ok: true,
      line_id: updatedState.lineId,
      ewma_cycle_sec: updatedState.ewmaCycleSec,
      cycle_degradation_active: updatedState.cycleDegradationActive,
      in_downtime: updatedState.openDowntimeId !== null,
      ...buildClientPayload(),
    });
  });

  app.get('/api/v1/lines/:lineId/downtimes', (req, res) => {
    const onlyUnjustified = req.query.only_unjustified === 'true';
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));
    const events = store.state.downtimeEvents
      .filter((ev) => ev.lineId === req.params.lineId || req.params.lineId === 'PAL-01')
      .filter((ev) => (!onlyUnjustified ? true : ev.reasonCodeId === null))
      .slice(0, limit);
    res.json(events);
  });

  app.post('/api/v1/downtimes/:downtimeId/justify', (req, res) => {
    const downtimeId = Number(req.params.downtimeId);
    if (!Number.isInteger(downtimeId) || downtimeId <= 0) {
      res.status(400).json({ ok: false, error: 'ID de parada inválido.' });
      return;
    }
    const evExists = store.state.downtimeEvents.some((ev) => ev.id === downtimeId);
    if (!evExists) {
      res.status(404).json({ ok: false, error: 'Evento de parada não encontrado.' });
      return;
    }
    const check = validateDowntimeJustifyPayload(req.body);
    if (!check.ok) {
      res.status(400).json({ ok: false, error: check.error });
      return;
    }
    const reason = DEFAULT_REASON_CODES.find((r) => r.id === check.reasonCodeId);
    if (!reason) {
      res.status(404).json({ ok: false, error: 'Código de motivo não encontrado.' });
      return;
    }
    const updatedState = justifyDowntimeEvent(
      store.state,
      downtimeId,
      check.reasonCodeId,
      check.justifiedBy,
      check.notes,
    );
    store = { ...store, state: updatedState };
    markDirty(true);
    broadcastState();
    res.json({ status: 'justified', downtime_id: downtimeId, reason: reason.description });
  });

  app.get('/api/v1/lines/:lineId/pallets', (req, res) => {
    const skuFilter = typeof req.query.sku === 'string' ? req.query.sku : null;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));
    const capacity = getPalletCapacity(store.state.activePattern);
    const list = store.state.completedPallets
      .filter((p) => (!skuFilter ? true : p.sku === skuFilter))
      .slice(0, limit)
      .map((p) => ({
        pallet_uid: p.palletId,
        sku: p.sku,
        target_boxes: capacity,
        actual_boxes: p.boxCount,
        status: p.validationStatus ?? 'COMPLETE',
        completed_at: p.completedAt,
      }));
    res.json(list);
  });

  app.get('/api/v1/lines/:lineId/alerts', (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30) || 30));
    res.json(store.state.alerts.slice(0, limit));
  });

  app.get('/api/v1/lines/:lineId/oee', (req, res) => {
    const oee = calculateOEE(
      store.state.operatingSeconds,
      store.state.downtimeSeconds,
      store.state.totalProducedBoxes,
      store.state.activePattern.cycleTimeSec,
      store.state.rejectedBoxes,
      store.state.plannedStopSeconds,
    );
    res.json({
      line_id: req.params.lineId,
      availability: oee.availability,
      performance: oee.performance,
      quality: oee.quality,
      oee: oee.oee,
      total_boxes: store.state.totalProducedBoxes,
      total_pallets: store.state.completedPallets.length,
      running_time_sec: store.state.operatingSeconds,
      downtime_sec: Math.max(0, store.state.downtimeSeconds - store.state.plannedStopSeconds),
      planned_stop_sec: store.state.plannedStopSeconds,
      ewma_cycle_sec: store.state.ewmaCycleSec,
    });
  });

  app.get('/api/v1/lines/:lineId/pareto', (_req, res) => {
    res.json(computeParetoDowntimes(store.state.downtimeEvents, DEFAULT_REASON_CODES, 5));
  });

  app.get('/api/v1/lines/:lineId/timeseries', (_req, res) => {
    res.json(
      store.state.throughputHistory.map((pt) => ({
        time: pt.timeLabel,
        boxes_per_min: pt.boxesPerMin,
        target_boxes_per_min: pt.targetBoxesPerMin,
        ewma_cycle_sec: pt.ewmaCycleSec ?? store.state.ewmaCycleSec,
        status: pt.status,
      })),
    );
  });

  // ==========================================
  // Industrial Read-Only AI Agent (/api/v1/agent/*)
  // ==========================================
  const handleAgentError = (res: express.Response, err: unknown) => {
    if (err instanceof AgentConfigError) {
      res.status(err.statusCode).json({ ok: false, error: err.message });
      return;
    }
    const rawMsg = err instanceof Error ? err.message : 'Erro inesperado no serviço do Agente NexPulse.';
    const lower = rawMsg.toLowerCase();
    if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('403')) {
      res.status(403).json({
        ok: false,
        error: 'Chave Gemini API inválida ou sem permissão. Verifique Settings > Secrets.',
      });
      return;
    }
    if (lower.includes('resource_exhausted') || lower.includes('429')) {
      res.status(429).json({
        ok: false,
        error: 'Cota da Gemini API atingida no momento. Tente novamente em instantes.',
      });
      return;
    }
    if (lower.includes('not_found') || lower.includes('404')) {
      res.status(502).json({
        ok: false,
        error: 'Modelo Gemini configurado não disponível neste endpoint.',
      });
      return;
    }
    res.status(502).json({ ok: false, error: rawMsg });
  };

  app.post('/api/v1/agent/ask', async (req, res) => {
    const check = validateAgentChatRequest(req.body);
    if (!check.ok) {
      res.status(400).json({ ok: false, error: check.error });
      return;
    }
    try {
      const result = await agentService.ask(
        check.value.line_id,
        check.value.user_role,
        check.value.message,
        check.value.session_id,
      );
      res.json(result);
    } catch (err) {
      handleAgentError(res, err);
    }
  });

  app.post('/api/v1/agent/alarms/diagnose', async (req, res) => {
    const check = validateAlarmDiagnoseRequest(req.body);
    if (!check.ok) {
      res.status(400).json({ ok: false, error: check.error });
      return;
    }
    try {
      const result = await agentService.diagnoseAlarm(
        check.value.line_id,
        check.value.alarme_ativo_cod,
        check.value.alarm_description,
      );
      res.json(result);
    } catch (err) {
      handleAgentError(res, err);
    }
  });

  app.post('/api/v1/agent/lines/:lineId/downtimes/:downtimeId/suggest', async (req, res) => {
    const lineId = validateLineId(req.params.lineId);
    const downtimeId = Number(req.params.downtimeId);
    if (!lineId || !Number.isInteger(downtimeId) || downtimeId <= 0) {
      res.status(400).json({ ok: false, error: 'Parâmetros lineId ou downtimeId inválidos.' });
      return;
    }
    try {
      const result = await agentService.classifyDowntimeOneClick(lineId, downtimeId);
      res.json(result);
    } catch (err) {
      handleAgentError(res, err);
    }
  });

  app.get('/api/v1/agent/lines/:lineId/predictive-check', async (req, res) => {
    const lineId = validateLineId(req.params.lineId);
    const hours = validateHoursParam(req.query.hours, 4);
    if (!lineId || hours === null) {
      res.status(400).json({ ok: false, error: 'Parâmetros lineId ou hours (1..72) inválidos.' });
      return;
    }
    try {
      const result = await agentService.runPredictiveCheck(lineId, hours);
      res.json(result);
    } catch (err) {
      handleAgentError(res, err);
    }
  });

  // Vite dev middleware vs static production assets
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`PaletizaPro server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start PaletizaPro server:', err);
  process.exit(1);
});
