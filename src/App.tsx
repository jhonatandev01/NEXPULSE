import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SidebarNav } from './components/SidebarNav';
import { TopBar, type ActiveTab } from './components/TopBar';
import { OperatorToolbar } from './components/OperatorToolbar';
import { KpiStrip } from './components/KpiStrip';
import { PalletVisualizer } from './components/PalletVisualizer';
import { AlertsPanel } from './components/AlertsPanel';
import { MosaicConfigView } from './components/MosaicConfigView';
import { ProductionHistoryView } from './components/ProductionHistoryView';
import { AgentCopilotView } from './components/AgentCopilotView';
import { ArchitectureSpecView } from './components/ArchitectureSpecView';
import {
  PRESET_PATTERNS,
  calculateOEE,
  changeMosaicPattern,
  createInitialSimulationState,
  formatPalletId,
  getPalletCapacity,
  injectCycleDegradation,
  justifyDowntimeEvent,
  resolveFaultAndResume,
  stepSimulationTick,
  swapToNextPallet,
  triggerFault,
  type FaultType,
  type MosaicPattern,
  type SimulationState,
  type TelemetrySourceMode,
} from './simulation/palletEngine';

function getCurrentTimeLabel(): string {
  const now = new Date();
  return now.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

interface ServerSyncPayload {
  state: SimulationState;
  speedMultiplier: 1 | 2 | 4;
  sourceMode: TelemetrySourceMode;
  customPatterns: MosaicPattern[];
  lastTelemetryAt: string | null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('monitoramento');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2 | 4>(1);
  const [sourceMode, setSourceMode] = useState<TelemetrySourceMode>('SIMULADOR');
  const [customPatterns, setCustomPatterns] = useState<MosaicPattern[]>([]);
  const [lastTelemetryAt, setLastTelemetryAt] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [sim, setSim] = useState<SimulationState>(() =>
    createInitialSimulationState(PRESET_PATTERNS[0], 14, getCurrentTimeLabel()),
  );

  const wsConnectedRef = useRef(false);
  wsConnectedRef.current = wsConnected;

  const applyServerSnapshot = useCallback((payload: ServerSyncPayload) => {
    if (payload.state) setSim(payload.state);
    if (payload.speedMultiplier) setSpeedMultiplier(payload.speedMultiplier);
    if (payload.sourceMode) setSourceMode(payload.sourceMode);
    if (Array.isArray(payload.customPatterns)) setCustomPatterns(payload.customPatterns);
    if (payload.lastTelemetryAt !== undefined) setLastTelemetryAt(payload.lastTelemetryAt);
  }, []);

  // Connect to authoritative server WebSocket (/ws) with automatic reconnection
  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const hydrateInitial = async () => {
      try {
        const res = await fetch('/api/state');
        if (res.ok && !disposed) {
          const data = (await res.json()) as ServerSyncPayload;
          applyServerSnapshot(data);
        }
      } catch {
        // Fallback silently to local engine if backend unreachable
      }
    };

    const connectWs = () => {
      if (disposed) return;
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${wsProto}//${window.location.host}/ws`;
      socket = new WebSocket(url);

      socket.onopen = () => {
        if (!disposed) setWsConnected(true);
      };

      socket.onmessage = (event) => {
        if (disposed) return;
        try {
          const msg = JSON.parse(event.data as string) as {
            type?: string;
            payload?: ServerSyncPayload;
          };
          if (msg.type === 'state:sync' && msg.payload) {
            applyServerSnapshot(msg.payload);
          }
        } catch {
          // Ignore malformed frame
        }
      };

      socket.onclose = () => {
        if (disposed) return;
        setWsConnected(false);
        reconnectTimer = window.setTimeout(connectWs, 2000);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    hydrateInitial();
    connectWs();

    return () => {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [applyServerSnapshot]);

  // Fallback local loop ONLY if WebSocket connection is offline and in SIMULADOR mode
  useEffect(() => {
    if (wsConnected || sourceMode !== 'SIMULADOR') return;

    const cycleMs =
      sim.status === 'OPERANDO'
        ? Math.max(350, Math.round((sim.activePattern.cycleTimeSec * 1000) / speedMultiplier))
        : 1000;

    const timer = window.setInterval(() => {
      if (wsConnectedRef.current) return;
      const deltaSec =
        sim.status === 'OPERANDO' ? sim.activePattern.cycleTimeSec : 1;
      setSim((prev) => stepSimulationTick(prev, deltaSec, getCurrentTimeLabel()));
    }, cycleMs);

    return () => window.clearInterval(timer);
  }, [wsConnected, sourceMode, sim.status, sim.activePattern.cycleTimeSec, speedMultiplier]);

  const sendCommand = useCallback(
    async (command: Record<string, unknown>, localFallback: () => void) => {
      try {
        const res = await fetch('/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(command),
        });
        if (res.ok) {
          const data = (await res.json()) as ServerSyncPayload;
          applyServerSnapshot(data);
          return;
        }
      } catch {
        // Fall through to local fallback
      }
      localFallback();
    },
    [applyServerSnapshot],
  );

  const availablePatterns = useMemo(
    () => [...PRESET_PATTERNS, ...customPatterns],
    [customPatterns],
  );

  const handlePrimaryAction = () => {
    const ts = getCurrentTimeLabel();
    const commandType =
      sim.status === 'FALHA'
        ? 'RESOLVE_FAULT'
        : sim.status === 'OPERANDO'
          ? 'PAUSE'
          : sim.status === 'PAUSADO'
            ? 'RESUME'
            : 'SWAP_PALLET';

    void sendCommand({ type: commandType }, () => {
      setSim((prev) => {
        if (prev.status === 'FALHA') return resolveFaultAndResume(prev, ts);
        if (prev.status === 'OPERANDO') {
          return { ...prev, status: 'PAUSADO', robotPhase: 'AGUARDANDO', lastTickTimestamp: ts };
        }
        if (prev.status === 'PAUSADO') {
          return { ...prev, status: 'OPERANDO', robotPhase: 'PEGANDO_CAIXA', lastTickTimestamp: ts };
        }
        return swapToNextPallet(prev, ts);
      });
    });
  };

  const handleSelectPatternById = (patternId: string) => {
    const found = availablePatterns.find((p) => p.id === patternId);
    if (!found) return;
    void sendCommand({ type: 'CHANGE_PATTERN', pattern: found }, () => {
      setSim((prev) => changeMosaicPattern(prev, found, getCurrentTimeLabel()));
    });
  };

  const handleApplyPatternFromConfig = (
    pattern: MosaicPattern,
    newShiftTarget: number,
  ) => {
    void sendCommand(
      { type: 'CHANGE_PATTERN', pattern, shiftTargetBoxes: newShiftTarget },
      () => {
        const isPreset = PRESET_PATTERNS.some((p) => p.id === pattern.id);
        if (!isPreset) {
          setCustomPatterns((prev) => [pattern, ...prev.filter((p) => p.id !== pattern.id)]);
        }
        setSim((prev) => ({
          ...changeMosaicPattern(prev, pattern, getCurrentTimeLabel()),
          shiftTargetBoxes: newShiftTarget,
        }));
      },
    );
    setActiveTab('monitoramento');
  };

  const handleTriggerFault = (faultType: FaultType) => {
    void sendCommand({ type: 'TRIGGER_FAULT', faultType }, () => {
      setSim((prev) => triggerFault(prev, faultType, getCurrentTimeLabel()));
    });
  };

  const handleTriggerDegradation = () => {
    void sendCommand({ type: 'TRIGGER_DEGRADATION' }, () => {
      setSim((prev) => injectCycleDegradation(prev, getCurrentTimeLabel()));
    });
  };

  const handleJustifyDowntime = (
    downtimeId: number,
    reasonCodeId: number,
    justifiedBy: string,
    notes?: string,
  ) => {
    void sendCommand(
      { type: 'JUSTIFY_DOWNTIME', downtimeId, reasonCodeId, justifiedBy, notes },
      () => {
        setSim((prev) =>
          justifyDowntimeEvent(prev, downtimeId, reasonCodeId, justifiedBy, notes ?? null),
        );
      },
    );
  };

  const handleResolveFault = () => {
    void sendCommand({ type: 'RESOLVE_FAULT' }, () => {
      setSim((prev) => resolveFaultAndResume(prev, getCurrentTimeLabel()));
    });
  };

  const handleSwapPalletNow = () => {
    void sendCommand({ type: 'SWAP_PALLET' }, () => {
      setSim((prev) => swapToNextPallet(prev, getCurrentTimeLabel()));
    });
  };

  const handleToggleAutoSwap = () => {
    void sendCommand({ type: 'TOGGLE_AUTO_SWAP' }, () => {
      setSim((prev) => ({
        ...prev,
        autoSwapPallet: !prev.autoSwapPallet,
        swapCountdownSec: !prev.autoSwapPallet && prev.status === 'PALETE_COMPLETO' ? 4 : 0,
      }));
    });
  };

  const handleResetShift = () => {
    void sendCommand({ type: 'RESET_SHIFT' }, () => {
      setSim((prev) =>
        createInitialSimulationState(prev.activePattern, 0, getCurrentTimeLabel()),
      );
    });
  };

  const handleChangeSpeed = (mult: 1 | 2 | 4) => {
    setSpeedMultiplier(mult);
    void sendCommand({ type: 'SET_SPEED', speedMultiplier: mult }, () => {});
  };

  const handleChangeSourceMode = (mode: TelemetrySourceMode) => {
    setSourceMode(mode);
    void sendCommand({ type: 'SET_SOURCE_MODE', sourceMode: mode }, () => {});
  };

  const capacity = getPalletCapacity(sim.activePattern);
  const placedCount = sim.slots.filter((s) => s.filled).length;
  const palletIsFull = placedCount >= capacity;
  const oeeMetrics = calculateOEE(
    sim.operatingSeconds,
    sim.downtimeSeconds,
    sim.totalProducedBoxes,
    sim.activePattern.cycleTimeSec,
    sim.rejectedBoxes,
    sim.plannedStopSeconds ?? 0,
  );

  return (
    <div className="min-h-screen flex bg-[#070B12] text-slate-50">
      <SidebarNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        state={sim}
        sourceMode={sourceMode}
        wsConnected={wsConnected}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          activeTab={activeTab}
          status={sim.status}
          lineId={sim.lineId ?? 'PAL-01'}
          palletCode={formatPalletId(sim.palletNumber)}
          oeePercent={oeeMetrics.oee}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onGoHome={() => setActiveTab('monitoramento')}
          onPrimaryAction={handlePrimaryAction}
        />

        <main
          data-status={sim.status}
          className="flex-1 w-full max-w-[1440px] mx-auto px-5 sm:px-8 py-6 space-y-6"
        >
        {activeTab === 'monitoramento' && (
          <>
            <OperatorToolbar
              status={sim.status}
              speedMultiplier={speedMultiplier}
              onChangeSpeed={handleChangeSpeed}
              sourceMode={sourceMode}
              onChangeSourceMode={handleChangeSourceMode}
              wsConnected={wsConnected}
              activePattern={sim.activePattern}
              availablePatterns={availablePatterns}
              onSelectPattern={handleSelectPatternById}
              autoSwapPallet={sim.autoSwapPallet}
              onToggleAutoSwap={handleToggleAutoSwap}
              onTriggerFault={handleTriggerFault}
              onTriggerDegradation={handleTriggerDegradation}
              onSwapPalletNow={handleSwapPalletNow}
              onResetShift={handleResetShift}
              palletIsFull={palletIsFull}
            />

            <KpiStrip state={sim} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8">
                <PalletVisualizer
                  state={sim}
                  onSwapPalletNow={handleSwapPalletNow}
                />
              </div>
              <div className="lg:col-span-4">
                <AlertsPanel
                  state={sim}
                  onResolveFault={handleResolveFault}
                  onJustifyDowntime={handleJustifyDowntime}
                />
              </div>
            </div>
          </>
        )}

        {activeTab === 'mosaicos' && (
          <MosaicConfigView
            activePattern={sim.activePattern}
            customPatterns={customPatterns}
            shiftTargetBoxes={sim.shiftTargetBoxes}
            onApplyPattern={handleApplyPatternFromConfig}
          />
        )}

        {activeTab === 'producao' && (
          <ProductionHistoryView state={sim} lastTelemetryAt={lastTelemetryAt} />
        )}

        {activeTab === 'agente' && <AgentCopilotView state={sim} />}

        {activeTab === 'especificacao' && <ArchitectureSpecView />}
        </main>
      </div>
    </div>
  );
}
