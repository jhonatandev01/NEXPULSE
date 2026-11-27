import React, { useState } from 'react';
import { Check, Layers, SlidersHorizontal } from 'lucide-react';
import { ResilientImage } from './ResilientImage';
import {
  PRESET_PATTERNS,
  getPalletCapacity,
  type MosaicPattern,
} from '../simulation/palletEngine';

const RECIPE_IMAGE_MAP: Record<string, string> = {
  padrao_3x4: '/src/assets/images/recipe_padrao_cartons_1795803462494.jpg',
  carga_pesada_2x3: '/src/assets/images/recipe_heavy_cartons_1795803463353.jpg',
  intertravado_4x3: '/src/assets/images/recipe_interlocked_cartons_1795803464108.jpg',
};
const DEFAULT_CELL_PHOTO = '/src/assets/images/nexpulse_cell_hero_1795803462214.jpg';

interface MosaicConfigViewProps {
  activePattern: MosaicPattern;
  customPatterns: MosaicPattern[];
  shiftTargetBoxes: number;
  onApplyPattern: (pattern: MosaicPattern, newShiftTarget: number) => void;
}

export const MosaicConfigView: React.FC<MosaicConfigViewProps> = ({
  activePattern,
  customPatterns,
  shiftTargetBoxes,
  onApplyPattern,
}) => {
  const [cols, setCols] = useState(activePattern.cols);
  const [rows, setRows] = useState(activePattern.rows);
  const [layers, setLayers] = useState(activePattern.layers);
  const [interlocked, setInterlocked] = useState(activePattern.interlocked);
  const [boxWeightKg, setBoxWeightKg] = useState(activePattern.boxWeightKg);
  const [cycleTimeSec, setCycleTimeSec] = useState(activePattern.cycleTimeSec);
  const [targetBoxes, setTargetBoxes] = useState(shiftTargetBoxes);
  const [customName, setCustomName] = useState('Mosaico Personalizado');

  const allPresets = [...PRESET_PATTERNS, ...customPatterns];
  const previewCapacity = cols * rows * layers;
  const previewWeight = (previewCapacity * boxWeightKg).toFixed(1);
  const previewRate = (60 / Math.max(0.5, cycleTimeSec)).toFixed(1);

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = customName.trim() || `Mosaico ${cols}×${rows} (${previewCapacity} cx)`;
    const customPattern: MosaicPattern = {
      id: `custom_${cols}x${rows}x${layers}_${interlocked ? 'int' : 'std'}`,
      name: `${cleanName} (${previewCapacity} cx)`,
      sku: `SKU-CUST-${cols}${rows}${layers}`,
      cols,
      rows,
      layers,
      interlocked,
      boxWeightKg,
      boxDimensionsMm: {
        width: Math.round(960 / cols),
        depth: Math.round(1140 / rows),
        height: 230,
      },
      cycleTimeSec,
    };
    onApplyPattern(customPattern, targetBoxes);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">
          Mosaicos e Receitas
        </h1>
        <span className="text-xs font-mono text-slate-400">
          {allPresets.length} receitas disponíveis
        </span>
      </div>

      {/* Preset Recipes Grid */}
      <section aria-label="Receitas homologadas" className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {allPresets.map((preset) => {
          const isCurrent = activePattern.id === preset.id;
          const cap = getPalletCapacity(preset);
          const totalWeight = (cap * preset.boxWeightKg).toFixed(1);
          const photoSrc = RECIPE_IMAGE_MAP[preset.id] ?? DEFAULT_CELL_PHOTO;

          return (
            <div
              key={preset.id}
              className={`panel-surface glass-hover-card group rounded-2xl overflow-hidden flex flex-col justify-between ${
                isCurrent
                  ? 'border-sky-400/70 ring-1 ring-sky-400/30'
                  : ''
              }`}
            >
              {/* Photographic Recipe Banner */}
              <div className="relative h-32 w-full overflow-hidden bg-[#080D18]">
                <ResilientImage
                  src={photoSrc}
                  alt={`Padrão de paletização ${preset.name}`}
                  fallbackTitle={preset.sku}
                  className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-[#101829] via-[#101829]/45 to-transparent"
                />

                {/* Mini Mosaic Matrix */}
                <div
                  aria-hidden="true"
                  className="absolute bottom-3 right-4 p-1.5 rounded-xl grid gap-1 w-[52px] bg-[#080D18]/90 border border-slate-700/70"
                  style={{
                    gridTemplateColumns: `repeat(${preset.cols}, minmax(0, 1fr))`,
                  }}
                >
                  {Array.from({ length: preset.cols * preset.rows }, (_, idx) => (
                    <span
                      key={idx}
                      className={`h-2 rounded-[2px] ${
                        isCurrent
                          ? 'bg-gradient-to-b from-sky-400 to-sky-500'
                          : 'bg-gradient-to-b from-[#BA8954] to-[#8F6438]'
                      }`}
                    />
                  ))}
                </div>

                <div className="absolute bottom-3 left-5 right-20">
                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-300">
                    <span className="text-sky-300 font-semibold">{preset.sku}</span>
                    <span className="text-slate-500" aria-hidden="true">·</span>
                    <span>{preset.interlocked ? 'Intertravado' : 'Alinhado'}</span>
                  </div>
                </div>
              </div>

              <div className="p-5 pt-3 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-4">
                  <h2 className="font-display text-lg font-bold text-white leading-snug">
                    {preset.name}
                  </h2>

                  <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-xs text-slate-400 font-mono tabular-nums pt-3 border-t border-slate-800/70">
                    <span>Matriz <strong className="text-white">{preset.cols}×{preset.rows}×{preset.layers}</strong></span>
                    <span>Capacidade <strong className="text-white">{cap} cx</strong></span>
                    <span>Peso <strong className="text-white">{totalWeight} kg</strong></span>
                    <span>Ciclo <strong className="text-white">{preset.cycleTimeSec.toFixed(1)} s</strong></span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onApplyPattern(preset, targetBoxes)}
                  disabled={isCurrent}
                  className={`btn-glass-hover w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold tracking-wide rounded-xl cursor-pointer ${
                    isCurrent
                      ? 'bg-sky-500/15 text-sky-300 border border-sky-400/50 cursor-default'
                      : 'bg-[#162035] text-white border border-slate-600/80 hover:bg-[#1E2C47]'
                  }`}
                >
                  {isCurrent && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                  {isCurrent ? 'Receita Ativa' : 'Carregar Receita'}
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {/* Custom Mosaic Builder */}
      <section
        aria-label="Configurador de mosaico personalizado"
        className="panel-surface glass-border-hover rounded-2xl p-6"
      >
        <div className="flex items-center gap-2.5 mb-5">
          <SlidersHorizontal className="w-4 h-4 text-sky-400" aria-hidden="true" />
          <h2 className="font-display text-lg font-bold text-white">
            Mosaico Personalizado e Meta do Turno
          </h2>
        </div>

        <form onSubmit={handleApplyCustom} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="custom-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                Nome da receita
              </label>
              <input
                id="custom-name"
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                required
                className="input-field w-full h-10 px-3 text-sm rounded-xl"
              />
            </div>

            <div>
              <label htmlFor="shift-target" className="block text-xs font-medium text-slate-300 mb-1.5">
                Meta do turno (caixas)
              </label>
              <input
                id="shift-target"
                type="number"
                min={24}
                max={5000}
                step={12}
                value={targetBoxes}
                onChange={(e) => setTargetBoxes(Math.max(24, Number(e.target.value) || 24))}
                className="input-field w-full h-10 px-3 text-sm font-mono tabular-nums rounded-xl"
              />
            </div>

            <div className="space-y-2 py-1">
              <label htmlFor="mosaic-cols" className="flex items-center justify-between text-xs font-medium text-slate-300">
                <span>Colunas / camada</span>
                <span className="text-sky-300 font-mono font-bold tabular-nums">{cols}</span>
              </label>
              <input
                id="mosaic-cols"
                type="range"
                min={2}
                max={5}
                value={cols}
                onChange={(e) => setCols(Number(e.target.value))}
                className="range-industrial w-full cursor-pointer"
              />
            </div>

            <div className="space-y-2 py-1">
              <label htmlFor="mosaic-rows" className="flex items-center justify-between text-xs font-medium text-slate-300">
                <span>Linhas / camada</span>
                <span className="text-sky-300 font-mono font-bold tabular-nums">{rows}</span>
              </label>
              <input
                id="mosaic-rows"
                type="range"
                min={2}
                max={5}
                value={rows}
                onChange={(e) => setRows(Number(e.target.value))}
                className="range-industrial w-full cursor-pointer"
              />
            </div>

            <div className="space-y-2 py-1">
              <label htmlFor="mosaic-layers" className="flex items-center justify-between text-xs font-medium text-slate-300">
                <span>Camadas</span>
                <span className="text-sky-300 font-mono font-bold tabular-nums">{layers}</span>
              </label>
              <input
                id="mosaic-layers"
                type="range"
                min={1}
                max={6}
                value={layers}
                onChange={(e) => setLayers(Number(e.target.value))}
                className="range-industrial w-full cursor-pointer"
              />
            </div>

            <div>
              <label htmlFor="box-weight" className="block text-xs font-medium text-slate-300 mb-1.5">
                Peso unitário (kg)
              </label>
              <input
                id="box-weight"
                type="number"
                min={1}
                max={50}
                step={0.5}
                value={boxWeightKg}
                onChange={(e) => setBoxWeightKg(Math.max(1, Number(e.target.value) || 1))}
                className="input-field w-full h-10 px-3 text-sm font-mono tabular-nums rounded-xl"
              />
            </div>

            <div>
              <label htmlFor="cycle-time" className="block text-xs font-medium text-slate-300 mb-1.5">
                Ciclo nominal (s/caixa)
              </label>
              <input
                id="cycle-time"
                type="number"
                min={1.0}
                max={8.0}
                step={0.1}
                value={cycleTimeSec}
                onChange={(e) => setCycleTimeSec(Math.max(1, Number(e.target.value) || 1.5))}
                className="input-field w-full h-10 px-3 text-sm font-mono tabular-nums rounded-xl"
              />
            </div>

            <div className="flex items-end pb-1">
              <button
                type="button"
                role="switch"
                aria-checked={interlocked}
                onClick={() => setInterlocked((prev) => !prev)}
                className="w-full bg-[#080D18] border border-slate-800 px-3.5 h-10 rounded-xl flex items-center justify-between gap-3 text-xs font-medium text-slate-200 hover:border-slate-600 transition-colors cursor-pointer"
              >
                <span>Camadas intertravadas</span>
                <span
                  aria-hidden="true"
                  className={`relative w-8 h-[18px] rounded-full transition-colors shrink-0 ${
                    interlocked ? 'bg-sky-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`absolute top-[2px] left-[2px] w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      interlocked ? 'translate-x-3.5' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>
            </div>
          </div>

          {/* Live Mosaic Preview Summary */}
          <div className="border-t lg:border-t-0 lg:border-l border-slate-800/80 pt-5 lg:pt-0 lg:pl-6 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Layers className="w-4 h-4 text-sky-400" aria-hidden="true" />
                Camada ({cols}×{rows})
              </div>
              <div
                className="mt-3 grid gap-1.5 p-3 bg-[#070B13] border border-slate-800/90 rounded-xl"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: cols * rows }, (_, i) => (
                  <div
                    key={i}
                    className="h-8 rounded-md bg-gradient-to-b from-[#BA8954] to-[#8F6438] border border-[#E7C091]/60 flex items-center justify-center text-[10px] font-mono font-bold text-white"
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2 text-xs font-mono tabular-nums text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Capacidade</span>
                  <span className="font-bold text-white">{previewCapacity} cx</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Peso total</span>
                  <span className="font-bold text-white">{previewWeight} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Cadência</span>
                  <span className="font-bold text-sky-300">{previewRate} cx/min</span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="btn-glass-hover w-full px-4 py-2.5 text-sm font-bold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-xl cursor-pointer"
            >
              Aplicar Receita na Linha
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
