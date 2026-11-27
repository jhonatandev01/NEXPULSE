import React from 'react';
import {
  Activity,
  BarChart3,
  Bot,
  Download,
  FileCode2,
  Layers,
  X,
} from 'lucide-react';
import { ResilientImage } from './ResilientImage';
import type { ActiveTab } from './TopBar';
import {
  formatPalletId,
  generateShiftCsv,
  type SimulationState,
  type TelemetrySourceMode,
} from '../simulation/palletEngine';

const NEXPULSE_EMBLEM_SRC = '/src/assets/images/nexpulse_logo_emblem_1795803460887.jpg';

interface SidebarNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  state: SimulationState;
  sourceMode: TelemetrySourceMode;
  wsConnected: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const MENU_GROUPS: {
  heading: string;
  items: {
    id: ActiveTab;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }[];
}[] = [
  {
    heading: 'Operação',
    items: [
      { id: 'monitoramento', label: 'Monitoramento 3D', Icon: Activity },
      { id: 'mosaicos', label: 'Mosaicos e Receitas', Icon: Layers },
    ],
  },
  {
    heading: 'Análise',
    items: [
      { id: 'producao', label: 'Produção e OEE', Icon: BarChart3 },
      { id: 'agente', label: 'Agente IA', Icon: Bot },
      { id: 'especificacao', label: 'Especificação', Icon: FileCode2 },
    ],
  },
];

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeTab,
  onSelectTab,
  state,
  sourceMode,
  wsConnected,
  mobileOpen,
  onCloseMobile,
}) => {
  const unresolvedCount = state.alerts.filter((a) => !a.resolved).length;
  const unjustifiedCount = (state.downtimeEvents ?? []).filter(
    (d) => d.reasonCodeId === null,
  ).length;

  const handleExportCsv = async () => {
    try {
      const res = await fetch('/api/export/csv');
      const csvText = res.ok ? await res.text() : generateShiftCsv(state);
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'paletizapro-turno.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      const blob = new Blob([generateShiftCsv(state)], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'paletizapro-turno.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }
  };

  const navContent = (
    <div className="flex flex-col h-full bg-[#090E19] border-r border-slate-800/70 select-none">
      {/* Minimal Brand Header */}
      <div className="h-16 px-5 border-b border-slate-800/70 flex items-center justify-between gap-3 shrink-0">
        <button
          type="button"
          onClick={() => {
            onSelectTab('monitoramento');
            onCloseMobile();
          }}
          className="flex items-center gap-2.5 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400 rounded-lg"
        >
          <div className="nexpulse-emblem-ring w-8 h-8 rounded-xl border border-sky-400/40 shrink-0">
            <ResilientImage
              src={NEXPULSE_EMBLEM_SRC}
              alt="Logotipo NexPulse"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <div className="font-display text-base font-bold tracking-tight text-white leading-none">
              NexPulse
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-1">
              {state.lineId ?? 'PAL-01'} · Célula 01
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Fechar menu"
          className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/70 cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Clean Single-Line Navigation */}
      <nav
        aria-label="Navegação principal"
        className="flex-1 overflow-y-auto px-3.5 py-6 space-y-7"
      >
        {MENU_GROUPS.map((group) => (
          <div key={group.heading} className="space-y-1.5">
            <div className="px-3 text-[11px] font-semibold text-slate-500">
              {group.heading}
            </div>

            <div className="space-y-1">
              {group.items.map(({ id, label, Icon }) => {
                const isActive = activeTab === id;
                const badgeCount =
                  id === 'monitoramento'
                    ? unresolvedCount + unjustifiedCount
                    : 0;

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      onSelectTab(id);
                      onCloseMobile();
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`btn-glass-hover w-full px-3 py-2.5 rounded-xl flex items-center gap-2.5 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400 ${
                      isActive
                        ? 'bg-sky-500/14 text-white border border-sky-400/35'
                        : 'text-slate-300 border border-transparent hover:bg-slate-800/45 hover:text-white'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-sky-300' : 'text-slate-400'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="text-[13px] font-semibold truncate flex-1">
                      {label}
                    </span>
                    {badgeCount > 0 && (
                      <span className="text-[11px] font-mono font-bold tabular-nums text-amber-300">
                        {badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Minimal Bottom Context & CSV Export */}
      <div className="p-4 border-t border-slate-800/70 space-y-3">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1">
          <span className="truncate max-w-[115px] text-slate-300">
            {state.activePattern.sku}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 font-semibold ${
              wsConnected ? 'text-emerald-400' : 'text-amber-300'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                wsConnected ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
              aria-hidden="true"
            />
            {sourceMode === 'CLP_EXTERNO'
              ? 'CLP'
              : wsConnected
                ? 'Online'
                : 'Local'}
          </span>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="btn-glass-hover w-full h-9 px-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-slate-100 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
          Exportar CSV
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:flex lg:w-[244px] lg:shrink-0 lg:sticky lg:top-0 lg:h-screen z-30">
        <div className="w-full h-full">{navContent}</div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <button
            type="button"
            aria-label="Fechar sobreposição de menu"
            onClick={onCloseMobile}
            className="fixed inset-0 bg-black/75 cursor-pointer"
          />
          <div className="relative w-64 max-w-[82vw] h-full z-10 shadow-2xl">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
};
