import React from 'react';
import {
  Activity,
  AlertOctagon,
  Boxes,
  CheckCircle2,
  PauseCircle,
} from 'lucide-react';
import {
  calculateBoxesPerMinute,
  calculateOEE,
  calculatePalletProgressPercent,
  calculateShiftProductionPercent,
  formatPalletId,
  getCurrentLayerInfo,
  getPalletCapacity,
  type SimulationState,
} from '../simulation/palletEngine';

interface KpiStripProps {
  state: SimulationState;
}

const ROBOT_PHASE_LABELS: Record<SimulationState['robotPhase'], string> = {
  AGUARDANDO: 'Em espera',
  PEGANDO_CAIXA: 'Coletando caixa',
  MOVENDO: 'Movendo ao palete',
  POSICIONANDO: 'Posicionando',
  RETORNANDO: 'Retornando',
};

export const KpiStrip: React.FC<KpiStripProps> = ({ state }) => {
  const capacity = getPalletCapacity(state.activePattern);
  const placedCount = state.slots.filter((s) => s.filled).length;
  const palletPercent = calculatePalletProgressPercent(placedCount, capacity);
  const shiftPercent = calculateShiftProductionPercent(
    state.totalProducedBoxes,
    state.shiftTargetBoxes,
  );
  const layerInfo = getCurrentLayerInfo(placedCount, state.activePattern);
  const ratePerMin = calculateBoxesPerMinute(
    state.totalProducedBoxes,
    state.operatingSeconds,
  );
  const oeeMetrics = calculateOEE(
    state.operatingSeconds,
    state.downtimeSeconds,
    state.totalProducedBoxes,
    state.activePattern.cycleTimeSec,
    state.rejectedBoxes,
    state.plannedStopSeconds ?? 0,
  );
  const ewmaSec = state.ewmaCycleSec ?? state.activePattern.cycleTimeSec;

  const statusConfig = {
    OPERANDO: {
      label: 'Operando',
      textColor: 'text-emerald-400',
      iconFrame: 'bg-emerald-500/15 border-emerald-400/35 text-emerald-400',
      Icon: Activity,
    },
    PAUSADO: {
      label: 'Pausada',
      textColor: 'text-amber-300',
      iconFrame: 'bg-amber-500/15 border-amber-400/35 text-amber-300',
      Icon: PauseCircle,
    },
    FALHA: {
      label: 'Falha Crítica',
      textColor: 'text-red-400',
      iconFrame: 'bg-red-500/15 border-red-400/40 text-red-400',
      Icon: AlertOctagon,
    },
    PALETE_COMPLETO: {
      label: 'Palete Completo',
      textColor: 'text-sky-300',
      iconFrame: 'bg-sky-500/15 border-sky-400/40 text-sky-300',
      Icon: CheckCircle2,
    },
    TROCA_PALETE: {
      label: 'Trocando Palete',
      textColor: 'text-slate-200',
      iconFrame: 'bg-slate-700/40 border-slate-500/40 text-slate-200',
      Icon: Boxes,
    },
  }[state.status];

  const StatusIcon = statusConfig.Icon;
  const currentWeightKg = (placedCount * state.activePattern.boxWeightKg).toFixed(1);

  const ringR = 22;
  const ringCirc = 2 * Math.PI * ringR;
  const ringDashOffset = ringCirc * (1 - Math.min(100, Math.max(0, oeeMetrics.oee)) / 100);

  return (
    <section
      aria-label="Indicadores principais de produção"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5"
    >
      {/* 1. Estado da Linha */}
      <div
        data-testid="kpi-status"
        className="panel-surface glass-hover-card rounded-2xl p-6 min-h-[164px] flex flex-col justify-between gap-4"
      >
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-medium">Estado da Linha</span>
          <span className="font-mono tabular-nums text-slate-400">{state.lastTickTimestamp}</span>
        </div>

        <div className="flex items-center gap-3.5">
          <div
            className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${statusConfig.iconFrame}`}
          >
            <StatusIcon className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className={`font-display text-xl xl:text-[22px] font-bold tracking-tight leading-tight ${statusConfig.textColor}`}>
              {statusConfig.label}
            </div>
            <div className="text-xs text-slate-300 truncate mt-1.5">
              {state.status === 'FALHA' && state.activeFault
                ? state.activeFault.replace(/_/g, ' ')
                : ROBOT_PHASE_LABELS[state.robotPhase]}
            </div>
          </div>
        </div>

        <div className="text-xs font-mono tabular-nums text-slate-400 flex items-center justify-between pt-3 border-t border-slate-800/60">
          <span>Ar <strong className="text-slate-200">{state.airPressureBar.toFixed(1)} bar</strong></span>
          <span>Vácuo <strong className="text-slate-200">{state.gripperVacuumKpa} kPa</strong></span>
        </div>
      </div>

      {/* 2. Palete Atual */}
      <div
        data-testid="kpi-pallet"
        className="panel-surface glass-hover-card rounded-2xl p-6 min-h-[164px] flex flex-col justify-between gap-4"
      >
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-medium">Palete {formatPalletId(state.palletNumber)}</span>
          <span className="font-mono tabular-nums text-slate-300 font-semibold">
            C{layerInfo.currentLayer}/{state.activePattern.layers}
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <div className="font-display text-4xl font-bold tabular-nums tracking-tight text-white leading-none">
            {placedCount}
            <span className="font-mono text-sm font-medium text-slate-400 ml-1.5">/ {capacity}</span>
          </div>
          <span className="font-mono text-xl font-bold tabular-nums text-sky-400">
            {palletPercent.toFixed(1)}%
          </span>
        </div>

        <div className="space-y-2.5">
          <div
            className="h-1.5 w-full rounded-full bg-[#080D18] overflow-hidden"
            role="progressbar"
            aria-valuenow={palletPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Preenchimento do palete atual"
          >
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                palletPercent >= 100
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-300'
                  : 'bg-gradient-to-r from-blue-500 to-sky-300'
              }`}
              style={{ width: `${palletPercent}%` }}
            />
          </div>
          <div className="text-xs text-slate-400 font-mono tabular-nums flex justify-between">
            <span>Peso atual</span>
            <span className="text-slate-200 font-semibold">{currentWeightKg} kg</span>
          </div>
        </div>
      </div>

      {/* 3. Produção do Turno */}
      <div
        data-testid="kpi-production"
        className="panel-surface glass-hover-card rounded-2xl p-6 min-h-[164px] flex flex-col justify-between gap-4"
      >
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-medium">Produção do Turno</span>
          <span className="font-mono tabular-nums text-slate-300 font-semibold">
            {ratePerMin.toFixed(1)} cx/min
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <div className="font-display text-4xl font-bold tabular-nums tracking-tight text-white leading-none">
            {state.totalProducedBoxes}
            <span className="font-mono text-sm font-medium text-slate-400 ml-1.5">
              / {state.shiftTargetBoxes}
            </span>
          </div>
          <span className="font-mono text-xl font-bold tabular-nums text-amber-400">
            {shiftPercent.toFixed(1)}%
          </span>
        </div>

        <div className="space-y-2.5">
          <div
            className="h-1.5 w-full rounded-full bg-[#080D18] overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.min(100, shiftPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Percentual da meta de produção do turno"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-200"
              style={{ width: `${Math.min(100, shiftPercent)}%` }}
            />
          </div>
          <div className="text-xs text-slate-400 font-mono tabular-nums flex items-center justify-between gap-2">
            <span>
              Esteira <strong className="text-slate-200">{state.conveyorLoadCount} cx</strong>
            </span>
            <span
              data-testid="kpi-ewma"
              className={state.cycleDegradationActive ? 'text-amber-300 font-bold' : 'text-slate-300'}
              title={`Ciclo nominal: ${state.activePattern.cycleTimeSec.toFixed(1)}s`}
            >
              EWMA {ewmaSec.toFixed(2)}s{state.cycleDegradationActive ? ' (!)' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Expedição & OEE */}
      <div
        data-testid="kpi-oee"
        className="panel-surface glass-hover-card rounded-2xl p-6 min-h-[164px] flex flex-col justify-between gap-4"
      >
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-medium">Eficiência OEE</span>
          <span className="font-mono tabular-nums text-slate-300 font-semibold">
            {state.completedPallets.length} paletes
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="font-display text-4xl font-bold tabular-nums tracking-tight text-emerald-400 leading-none">
            {oeeMetrics.oee.toFixed(1)}%
          </div>

          <svg className="w-13 h-13 -rotate-90 shrink-0" viewBox="0 0 52 52" aria-hidden="true">
            <circle
              cx="26"
              cy="26"
              r={ringR}
              fill="none"
              stroke="#0F172A"
              strokeWidth="4.5"
            />
            <circle
              cx="26"
              cy="26"
              r={ringR}
              fill="none"
              stroke={oeeMetrics.oee >= 85 ? '#34D399' : '#FBBF24'}
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeDasharray={ringCirc}
              strokeDashoffset={ringDashOffset}
            />
          </svg>
        </div>

        <div className="text-xs text-slate-400 font-mono tabular-nums flex items-center justify-between pt-3 border-t border-slate-800/60">
          <span>
            Disp <strong className="text-slate-200">{oeeMetrics.availability.toFixed(0)}%</strong>
          </span>
          <span>
            Qual <strong className="text-slate-200">{oeeMetrics.quality.toFixed(0)}%</strong>
          </span>
          <span>
            Falhas <strong className="text-slate-200">{state.faultCount}</strong>
          </span>
        </div>
      </div>
    </section>
  );
};

