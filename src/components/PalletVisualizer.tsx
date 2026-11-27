import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  Box,
  Check,
  CheckCircle2,
  Grid2x2,
  PackageCheck,
} from 'lucide-react';
import { Pallet3DViewport } from './Pallet3DViewport';
import {
  calculatePalletProgressPercent,
  formatPalletId,
  getBoxesPerLayer,
  getCurrentLayerInfo,
  getPalletCapacity,
  type PalletBoxSlot,
  type SimulationState,
} from '../simulation/palletEngine';

interface PalletVisualizerProps {
  state: SimulationState;
  onSwapPalletNow: () => void;
}

type ViewMode = '3d' | 'camada';

export const PalletVisualizer: React.FC<PalletVisualizerProps> = ({
  state,
  onSwapPalletNow,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('3d');
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [layerFilter3D, setLayerFilter3D] = useState<number | null>(null);
  const [inspectedLayer2D, setInspectedLayer2D] = useState<number | null>(null);

  const capacity = getPalletCapacity(state.activePattern);
  const boxesPerLayer = getBoxesPerLayer(state.activePattern);
  const placedSlots = useMemo(
    () => state.slots.filter((s) => s.filled),
    [state.slots],
  );
  const placedCount = placedSlots.length;
  const palletPercent = calculatePalletProgressPercent(placedCount, capacity);
  const layerInfo = getCurrentLayerInfo(placedCount, state.activePattern);

  const activeLayerToShow = inspectedLayer2D ?? layerInfo.currentLayer;

  const lastPlacedSlot = placedCount > 0 ? placedSlots[placedCount - 1] : null;
  const inspectedSlot: PalletBoxSlot | null =
    selectedSlotIndex !== null && state.slots[selectedSlotIndex]
      ? state.slots[selectedSlotIndex]
      : lastPlacedSlot;

  const nextTargetSlot: PalletBoxSlot | undefined = state.slots.find((s) => !s.filled);

  const layerSlots = useMemo(() => {
    return state.slots
      .filter((s) => s.layer === activeLayerToShow)
      .sort((a, b) => (a.row !== b.row ? a.row - b.row : a.col - b.col));
  }, [state.slots, activeLayerToShow]);

  return (
    <section
      aria-label="Representação visual 3D do processo de paletização"
      className="panel-surface glass-border-hover rounded-2xl overflow-hidden flex flex-col"
    >
      {/* Clean Header with Mode Switcher */}
      <div className="px-6 py-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-display text-lg font-bold text-white tracking-tight">
            Célula Robótica — {formatPalletId(state.palletNumber)}
          </h2>
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            {state.activePattern.sku} · {state.activePattern.cols}×{state.activePattern.rows}×{state.activePattern.layers} · {placedCount}/{capacity} cx
          </span>
        </div>

        <div
          role="group"
          aria-label="Modo de visualização do palete"
          className="inline-flex items-center bg-[#070B13] border border-slate-800/90 p-1 rounded-xl gap-0.5"
        >
          <button
            type="button"
            onClick={() => setViewMode('3d')}
            aria-pressed={viewMode === '3d'}
            className={`btn-glass-hover inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
              viewMode === '3d'
                ? 'bg-sky-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Box className="w-3.5 h-3.5" aria-hidden="true" />
            Célula 3D
          </button>
          <button
            type="button"
            onClick={() => setViewMode('camada')}
            aria-pressed={viewMode === 'camada'}
            className={`btn-glass-hover inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
              viewMode === 'camada'
                ? 'bg-sky-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Grid2x2 className="w-3.5 h-3.5" aria-hidden="true" />
            Mapa 2D
          </button>
        </div>
      </div>

      {/* Slim Layer Progress Strip */}
      <div className="px-6 py-2.5 bg-[#090E1A]/75 border-b border-slate-800/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Avanço por camada">
          {Array.from({ length: state.activePattern.layers }, (_, i) => i + 1).map((layerNum) => {
            const filledInLayer = state.slots.filter((s) => s.layer === layerNum && s.filled).length;
            const layerRatio = Math.min(100, (filledInLayer / Math.max(1, boxesPerLayer)) * 100);
            const isComplete = filledInLayer >= boxesPerLayer;
            const isCurrent = layerNum === layerInfo.currentLayer && !isComplete;
            const isSelectedLayer = viewMode === 'camada' && activeLayerToShow === layerNum;

            return (
              <button
                key={layerNum}
                type="button"
                onClick={() => {
                  setInspectedLayer2D(layerNum);
                  setViewMode('camada');
                }}
                className={`btn-glass-hover relative overflow-hidden inline-flex items-center gap-1.5 px-2.5 pt-1 pb-1.5 text-xs font-mono font-semibold tabular-nums rounded-lg border cursor-pointer whitespace-nowrap shrink-0 ${
                  isSelectedLayer
                    ? 'bg-sky-500/20 text-white border-sky-400/80'
                    : isComplete
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/60'
                      : isCurrent
                        ? 'bg-sky-950/60 text-sky-200 border-sky-500/40 hover:bg-sky-900/60'
                        : 'bg-slate-900/70 text-slate-400 border-slate-800 hover:text-white hover:border-slate-600'
                }`}
              >
                {isComplete && <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" />}
                <span>C{layerNum}</span>
                <span>
                  {filledInLayer}/{boxesPerLayer}
                </span>
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-[2px] bg-slate-800/80"
                >
                  <span
                    className={`block h-full transition-all duration-300 ${
                      isComplete ? 'bg-emerald-400' : isCurrent ? 'bg-sky-400' : 'bg-slate-500'
                    }`}
                    style={{ width: `${layerRatio}%` }}
                  />
                </span>
              </button>
            );
          })}
        </div>

        <span className="text-xs font-mono text-slate-400 tabular-nums">
          {palletPercent.toFixed(0)}% · {state.activePattern.interlocked ? 'Intertravado' : 'Alinhado'}
        </span>
      </div>

      {/* Stage Area */}
      <div className="relative bg-[#070B13] flex flex-col justify-between">
        {state.status === 'PALETE_COMPLETO' && (
          <div
            data-testid="pallet-complete-banner"
            style={{ backgroundColor: 'rgba(6, 78, 59, 0.94)' }}
            className="sm:absolute sm:top-3 sm:inset-x-5 mx-4 sm:mx-0 mt-3 sm:mt-0 px-4 py-2.5 border border-emerald-400/60 rounded-xl flex flex-wrap items-center justify-between gap-3 z-20 shadow-lg"
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" aria-hidden="true" />
              <div>
                <div className="text-sm font-semibold text-white font-display">
                  Palete {formatPalletId(state.palletNumber)} Completo ({capacity} cx)
                </div>
                <div className="text-xs text-emerald-200 font-mono tabular-nums">
                  {state.autoSwapPallet
                    ? `Troca em ${state.swapCountdownSec.toFixed(0)}s`
                    : 'Aguardando expedição'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onSwapPalletNow}
              className="btn-glass-hover inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <PackageCheck className="w-4 h-4" aria-hidden="true" />
              Expedir Palete
            </button>
          </div>
        )}

        {state.status === 'FALHA' && (
          <div
            data-testid="pallet-fault-banner"
            style={{ backgroundColor: 'rgba(127, 29, 29, 0.94)' }}
            className="sm:absolute sm:top-3 sm:inset-x-5 mx-4 sm:mx-0 mt-3 sm:mt-0 px-4 py-2.5 border border-red-400/70 rounded-xl flex items-center gap-2.5 z-20 shadow-lg"
          >
            <AlertOctagon className="w-4 h-4 text-red-200 shrink-0" aria-hidden="true" />
            <div className="text-xs font-semibold text-white">
              Célula interrompida — reconheça a falha em Ocorrências para retomar.
            </div>
          </div>
        )}

        {viewMode === '3d' ? (
          <Pallet3DViewport
            state={state}
            selectedSlotIndex={selectedSlotIndex}
            onSelectSlot={setSelectedSlotIndex}
            layerFilter={layerFilter3D}
            onChangeLayerFilter={setLayerFilter3D}
          />
        ) : (
          <div className="flex-1 px-6 py-6 flex flex-col justify-center gap-4 min-h-[465px]">
            <div className="flex items-center justify-between max-w-[560px] w-full mx-auto text-xs text-slate-200">
              <span className="font-display text-sm font-semibold text-white">
                Camada {activeLayerToShow}
              </span>
              <span className="font-mono font-semibold tabular-nums text-slate-300">
                {layerSlots.filter((s) => s.filled).length}/{layerSlots.length} posições
              </span>
            </div>

            <div
              className="recessed-well grid gap-3 max-w-[560px] w-full mx-auto p-4 rounded-2xl"
              style={{
                gridTemplateColumns: `repeat(${state.activePattern.cols}, minmax(0, 1fr))`,
              }}
              data-testid="pallet-layer-grid"
            >
              {layerSlots.map((slot) => {
                const isNext = nextTargetSlot?.index === slot.index;
                const isSelected = inspectedSlot?.index === slot.index;

                return (
                  <button
                    key={slot.index}
                    type="button"
                    onClick={() => setSelectedSlotIndex(slot.index)}
                    aria-label={`Posição ${slot.sequenceNumber}, Coluna ${slot.col + 1}, Linha ${slot.row + 1}, ${slot.filled ? 'Ocupada' : 'Vazia'}`}
                    className={`btn-glass-hover relative overflow-hidden min-h-[76px] p-2.5 rounded-xl border text-left cursor-pointer flex flex-col justify-between ${
                      slot.filled
                        ? isSelected
                          ? 'bg-gradient-to-b from-sky-500 to-blue-600 border-sky-200 text-white'
                          : 'bg-gradient-to-b from-[#BA8954] to-[#8F6438] border-[#E7C091]/70 text-white hover:from-[#C7945E] hover:to-[#9B6E3F]'
                        : isNext
                          ? 'bg-sky-950/60 border-sky-400/90 border-dashed text-sky-200'
                          : 'bg-[#090E1A] border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                    }`}
                  >
                    {slot.filled && (
                      <span
                        aria-hidden="true"
                        className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 ${
                          isSelected ? 'bg-white/15' : 'bg-[#F3D7B3]/20'
                        }`}
                      />
                    )}
                    <div className="relative z-10 flex items-center justify-between text-[11px] font-mono font-bold tabular-nums">
                      <span>#{slot.sequenceNumber}</span>
                      <span className={slot.filled ? 'opacity-90' : 'opacity-70'}>
                        {slot.col + 1},{slot.row + 1}
                      </span>
                    </div>
                    <div className="relative z-10 text-xs font-mono font-bold truncate">
                      {slot.filled ? slot.boxCode : isNext ? 'Próxima' : 'Livre'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Minimal 1-Line Inspector Footer */}
        <div className="px-6 py-3 bg-[#090E1A]/85 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#BA8954]" aria-hidden="true" />
              Caixa
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs border border-dashed border-sky-400" aria-hidden="true" />
              Próximo
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-sky-500" aria-hidden="true" />
              Seleção
            </span>
          </div>

          <div
            data-testid="box-inspector"
            className="font-mono tabular-nums text-slate-300 flex flex-wrap items-center gap-2"
          >
            {inspectedSlot ? (
              <>
                <span className="font-bold text-white">
                  {inspectedSlot.boxCode ?? `Slot #${inspectedSlot.sequenceNumber}`}
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span>
                  C{inspectedSlot.layer} ({inspectedSlot.col + 1},{inspectedSlot.row + 1})
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span>{inspectedSlot.weightKg} kg</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-slate-400">
                  {inspectedSlot.xMm}/{inspectedSlot.yMm}/{inspectedSlot.zMm} mm
                </span>
              </>
            ) : (
              <span className="text-slate-400">Aguardando primeira caixa</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
