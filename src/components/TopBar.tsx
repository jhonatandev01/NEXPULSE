import React from 'react';
import { Menu, Pause, Play, RotateCcw } from 'lucide-react';
import { ResilientImage } from './ResilientImage';
import type { MachineStatus } from '../simulation/palletEngine';

export type ActiveTab = 'monitoramento' | 'mosaicos' | 'producao' | 'agente' | 'especificacao';

const NEXPULSE_EMBLEM_SRC = '/src/assets/images/nexpulse_logo_emblem_1795803460887.jpg';

interface TopBarProps {
  activeTab: ActiveTab;
  status: MachineStatus;
  lineId: string;
  palletCode: string;
  oeePercent: number;
  onOpenMobileMenu: () => void;
  onGoHome: () => void;
  onPrimaryAction: () => void;
}

const VIEW_LABELS: Record<ActiveTab, string> = {
  monitoramento: 'Monitoramento 3D',
  mosaicos: 'Mosaicos e Receitas',
  producao: 'Produção e OEE',
  agente: 'Agente Industrial',
  especificacao: 'Especificação Técnica',
};

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  status,
  lineId,
  onOpenMobileMenu,
  onGoHome,
  onPrimaryAction,
}) => {
  const isFault = status === 'FALHA';
  const isRunning = status === 'OPERANDO' || status === 'PALETE_COMPLETO';

  const primaryLabel = isFault
    ? 'Reconhecer Falha'
    : isRunning
      ? 'Pausar Linha'
      : 'Iniciar Linha';

  return (
    <header className="sticky top-0 z-20 bg-[#080D18]/95 border-b border-slate-800/70">
      <div className="px-4 sm:px-8 h-16 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        {/* Zone 1: Mobile Menu Trigger + Minimal Context */}
        <div className="flex items-center gap-3 min-w-0 justify-self-start">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Abrir menu principal"
            className="btn-glass-hover lg:hidden p-2 rounded-xl bg-slate-900 border border-slate-700/80 text-slate-200 hover:text-white cursor-pointer"
          >
            <Menu className="w-4 h-4" aria-hidden="true" />
          </button>

          <div className="hidden md:flex items-center gap-2 text-sm min-w-0">
            <span className="font-mono text-xs text-slate-400 whitespace-nowrap">
              {lineId}
            </span>
            <span className="text-slate-600" aria-hidden="true">
              /
            </span>
            <span className="font-display font-semibold text-slate-100 truncate">
              {VIEW_LABELS[activeTab]}
            </span>
          </div>
        </div>

        {/* Zone 2: Centered Animated NexPulse Logo Lockup */}
        <div className="relative justify-self-center flex items-center justify-center">
          <div
            aria-hidden="true"
            className="nexpulse-halo absolute -inset-x-5 -inset-y-1.5 rounded-full bg-radial from-sky-400/20 via-sky-500/5 to-transparent pointer-events-none"
          />
          <button
            type="button"
            onClick={onGoHome}
            aria-label="NexPulse — Voltar para o Monitoramento 3D"
            className="btn-glass-hover relative flex items-center gap-2.5 px-3.5 py-1.5 rounded-2xl bg-[#0D1526]/90 border border-sky-400/25 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <div className="nexpulse-emblem-ring w-7 h-7 sm:w-8 sm:h-8 rounded-xl border border-sky-300/45 shadow-[0_0_16px_rgba(56,189,248,0.28)] shrink-0">
              <ResilientImage
                src={NEXPULSE_EMBLEM_SRC}
                alt="Logotipo NexPulse"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="nexpulse-wordmark font-display text-lg sm:text-xl font-bold tracking-tight leading-none whitespace-nowrap">
              NexPulse
            </span>
          </button>
        </div>

        {/* Zone 3: Single Primary Operational Action */}
        <div className="justify-self-end flex items-center shrink-0">
          <button
            type="button"
            onClick={onPrimaryAction}
            className={`btn-glass-hover inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold tracking-wide rounded-xl whitespace-nowrap shrink-0 cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] focus-visible:outline-2 focus-visible:outline-offset-2 ${
              isFault
                ? 'bg-red-600 text-white border border-red-400/80 hover:bg-red-500 focus-visible:outline-red-400'
                : isRunning
                  ? 'bg-[#162035] text-white border border-slate-600/80 hover:bg-[#1E2C47] focus-visible:outline-white'
                  : 'bg-sky-500 text-slate-950 font-bold border border-sky-300/80 hover:bg-sky-400 focus-visible:outline-sky-400'
            }`}
          >
            {isFault ? (
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            ) : isRunning ? (
              <Pause className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{primaryLabel}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

