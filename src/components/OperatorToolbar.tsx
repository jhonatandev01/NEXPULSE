import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  OctagonAlert,
  PackageCheck,
  RefreshCw,
} from 'lucide-react';
import {
  PRESET_PATTERNS,
  type FaultType,
  type MachineStatus,
  type MosaicPattern,
  type TelemetrySourceMode,
} from '../simulation/palletEngine';

interface OperatorToolbarProps {
  status: MachineStatus;
  speedMultiplier: 1 | 2 | 4;
  onChangeSpeed: (speed: 1 | 2 | 4) => void;
  sourceMode: TelemetrySourceMode;
  onChangeSourceMode: (mode: TelemetrySourceMode) => void;
  wsConnected: boolean;
  activePattern: MosaicPattern;
  availablePatterns: MosaicPattern[];
  onSelectPattern: (patternId: string) => void;
  autoSwapPallet: boolean;
  onToggleAutoSwap: () => void;
  onTriggerFault: (faultType: FaultType) => void;
  onTriggerDegradation: () => void;
  onSwapPalletNow: () => void;
  onResetShift: () => void;
  palletIsFull: boolean;
}

export const OperatorToolbar: React.FC<OperatorToolbarProps> = ({
  status,
  speedMultiplier,
  onChangeSpeed,
  sourceMode,
  onChangeSourceMode,
  activePattern,
  availablePatterns,
  onSelectPattern,
  autoSwapPallet,
  onToggleAutoSwap,
  onTriggerFault,
  onTriggerDegradation,
  onSwapPalletNow,
  onResetShift,
  palletIsFull,
}) => {
  const [faultMenuOpen, setFaultMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const patterns = availablePatterns.length > 0 ? availablePatterns : PRESET_PATTERNS;

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setFaultMenuOpen(false);
      }
    };
    if (faultMenuOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [faultMenuOpen]);

  const handleSelectFault = (faultType: FaultType) => {
    setFaultMenuOpen(false);
    onTriggerFault(faultType);
  };

  return (
    <section
      aria-label="Controles do operador e simulação"
      className="bg-[#0B111E]/90 border border-slate-800/80 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3"
    >
      {/* Left group: Recipe Select, Speed, Source Mode, Auto-swap Toggle */}
      <div className="flex flex-wrap items-center gap-3 xl:gap-4">
        <div className="relative">
          <select
            id="recipe-select"
            aria-label="Receita ativa"
            value={activePattern.id}
            onChange={(e) => onSelectPattern(e.target.value)}
            className="input-field appearance-none h-9 pl-3 pr-7 text-xs font-semibold rounded-xl cursor-pointer w-[188px] xl:w-[210px]"
          >
            {patterns.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown
            className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
        </div>

        <div
          role="group"
          aria-label="Velocidade da simulação"
          className="inline-flex items-center bg-[#070B13] border border-slate-800/90 p-0.5 rounded-xl gap-0.5"
        >
          {([1, 2, 4] as const).map((mult) => (
            <button
              key={mult}
              type="button"
              disabled={sourceMode === 'CLP_EXTERNO'}
              onClick={() => onChangeSpeed(mult)}
              aria-pressed={speedMultiplier === mult}
              className={`btn-glass-hover px-2.5 py-1 text-xs font-mono font-bold rounded-lg whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                speedMultiplier === mult
                  ? 'bg-[#1D2B48] text-sky-300 border border-sky-400/40'
                  : 'text-slate-400 border border-transparent hover:text-white'
              }`}
            >
              {mult}x
            </button>
          ))}
        </div>

        <div
          role="group"
          aria-label="Fonte de dados da célula"
          className="inline-flex items-center bg-[#070B13] border border-slate-800/90 p-0.5 rounded-xl gap-0.5"
        >
          {(
            [
              { id: 'SIMULADOR', label: 'Simulador' },
              { id: 'CLP_EXTERNO', label: 'CLP / API' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChangeSourceMode(opt.id)}
              aria-pressed={sourceMode === opt.id}
              className={`btn-glass-hover px-2.5 py-1 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                sourceMode === opt.id
                  ? 'bg-sky-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoSwapPallet}
            onChange={onToggleAutoSwap}
            className="sr-only peer"
          />
          <span
            aria-hidden="true"
            className={`w-8 h-[18px] rounded-full p-0.5 transition-colors flex items-center border ${
              autoSwapPallet
                ? 'bg-sky-500/90 border-sky-300/60 justify-end'
                : 'bg-[#080D18] border-slate-700 justify-start'
            }`}
          >
            <span className="w-3 h-3 rounded-full bg-white shadow-sm" />
          </span>
          <span className="whitespace-nowrap">Troca automática</span>
        </label>
      </div>

      {/* Right group: Fault simulation menu + direct operator actions */}
      <div className="flex items-center gap-2">
        {palletIsFull && (
          <button
            type="button"
            onClick={onSwapPalletNow}
            className="btn-glass-hover inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <PackageCheck className="w-4 h-4" aria-hidden="true" />
            Trocar Palete
          </button>
        )}

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setFaultMenuOpen((prev) => !prev)}
            disabled={status === 'FALHA'}
            aria-expanded={faultMenuOpen}
            aria-haspopup="menu"
            className="btn-glass-hover inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold text-amber-200 bg-amber-950/55 border border-amber-500/45 rounded-xl hover:bg-amber-900/65 hover:border-amber-400/70 disabled:opacity-45 disabled:cursor-not-allowed shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
            <span>Simular Falha</span>
            <ChevronDown className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
          </button>

          {faultMenuOpen && (
            <div
              role="menu"
              aria-label="Opções de simulação de falha"
              className="absolute right-0 mt-2 w-72 bg-[#0F1729] border border-slate-700/90 rounded-2xl shadow-2xl py-2 z-40"
            >
              <div className="px-4 py-1 text-[11px] font-semibold text-slate-400">
                Testes de Falha e Preditiva
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => handleSelectFault('SENSOR_ESTEIRA')}
                className="w-full px-4 py-2.5 text-left text-xs text-slate-100 hover:bg-slate-800/70 flex items-center gap-3 cursor-pointer transition-colors"
              >
                <span className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                </span>
                <div>
                  <div className="font-semibold text-white">Sensor da Esteira</div>
                  <div className="text-[11px] text-slate-400 font-mono">ERR-104 · Obstrução óptica</div>
                </div>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => handleSelectFault('PRESSAO_GARRA')}
                className="w-full px-4 py-2.5 text-left text-xs text-slate-100 hover:bg-slate-800/70 flex items-center gap-3 cursor-pointer transition-colors"
              >
                <span className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                </span>
                <div>
                  <div className="font-semibold text-white">Pressão da Garra</div>
                  <div className="text-[11px] text-slate-400 font-mono">ERR-208 · Queda de vácuo</div>
                </div>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => handleSelectFault('DESALINHAMENTO_CAIXA')}
                className="w-full px-4 py-2.5 text-left text-xs text-slate-100 hover:bg-slate-800/70 flex items-center gap-3 cursor-pointer transition-colors"
              >
                <span className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                </span>
                <div>
                  <div className="font-semibold text-white">Desalinhamento</div>
                  <div className="text-[11px] text-slate-400 font-mono">WARN-312 · Guia lateral</div>
                </div>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFaultMenuOpen(false);
                  onTriggerDegradation();
                }}
                className="w-full px-4 py-2.5 text-left text-xs text-slate-100 hover:bg-slate-800/70 flex items-center gap-3 cursor-pointer transition-colors"
              >
                <span className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-400/30 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                </span>
                <div>
                  <div className="font-semibold text-white">Degradação de Ciclo (EWMA)</div>
                  <div className="text-[11px] text-amber-300 font-mono">PRED-EWMA · Alerta preditivo</div>
                </div>
              </button>
              <div className="my-1.5 border-t border-slate-800" />
              <button
                type="button"
                role="menuitem"
                onClick={() => handleSelectFault('PARADA_EMERGENCIA')}
                className="w-full px-4 py-2.5 text-left text-xs text-red-200 hover:bg-red-950/60 flex items-center gap-3 cursor-pointer transition-colors"
              >
                <span className="w-7 h-7 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
                  <OctagonAlert className="w-3.5 h-3.5 text-red-400" aria-hidden="true" />
                </span>
                <div>
                  <div className="font-semibold text-white">Parada de Emergência</div>
                  <div className="text-[11px] text-red-300 font-mono">EMG-001 · Circuito NR-12</div>
                </div>
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onResetShift}
          className="btn-glass-hover inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold text-slate-100 bg-[#151F34] border border-slate-700/80 rounded-xl hover:bg-[#1C2945] hover:border-slate-500/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] whitespace-nowrap shrink-0 cursor-pointer"
          title="Reiniciar contadores do turno"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
          <span>Resetar Turno</span>
        </button>
      </div>
    </section>
  );
};

