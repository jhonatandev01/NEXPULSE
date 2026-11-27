import React from 'react';
import { ResilientImage } from './ResilientImage';

export const ArchitectureSpecView: React.FC = () => {
  const stages = [
    {
      step: 'Etapa 2 — Máquina de Estados',
      items: [
        'OPERANDO: coleta, movimento e empilhamento contínuos por ciclo.',
        'PAUSADO: parada controlada pelo operador sem contabilizar falha.',
        'FALHA: bloqueio imediato (ERR-104, ERR-208, EMG-001) com checklist e rearme.',
        'PALETE_COMPLETO: expedição automática ou manual em 100% da capacidade.',
      ],
    },
    {
      step: 'Etapa 3 — Gêmeo Digital 3D & 2D',
      items: [
        'Célula WebGL (Three.js): braço 6 eixos com cinemática inversa (IK) e palete PBR.',
        'Câmera & Camadas: presets instantâneos (Geral, Topo, Garra, Esteira) e filtro C1–CN.',
        'Inspeção direta: clique na caixa exibe código, camada, posição XYZ e peso.',
      ],
    },
    {
      step: 'Etapa 4 — Fórmulas e Indicadores',
      items: [
        'Palete (%): (caixasPosicionadas / (colunas × linhas × camadas)) × 100.',
        'Meta do Turno (%): (totalCaixasProduzidas / metaDoTurno) × 100.',
        'OEE Global: Disponibilidade × Desempenho × Qualidade + EWMA de ciclo.',
        'Alertas e Paradas: priorização por severidade e Pareto para classificação OEE.',
      ],
    },
    {
      step: 'Etapa 5 — Stack e Integração',
      items: [
        'Frontend: React 19 + TypeScript + Tailwind CSS v4 + Three.js procedural.',
        'Backend & Tempo Real: Express + WebSocket (/ws) + ingestão REST (/api/v1/telemetry).',
        'Qualidade: testes unitários automatizados via Node Test Runner (node:test).',
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="panel-surface glass-hover-card relative overflow-hidden rounded-2xl">
        <div className="relative h-44 sm:h-52 w-full overflow-hidden bg-[#080D18]">
          <ResilientImage
            src="/src/assets/images/nexpulse_cell_hero_1795803462214.jpg"
            alt="Célula robótica industrial NexPulse de paletização automatizada"
            fallbackTitle="NexPulse Célula 01"
            className="w-full h-full object-cover object-center"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-[#070B12]/95 via-[#070B12]/65 to-[#070B12]/25"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-[#070B12] via-transparent to-transparent"
          />
          <div className="absolute inset-x-6 bottom-5 max-w-xl">
            <div className="text-xs font-mono text-sky-300 font-semibold">
              NexPulse · PAL-01
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">
              Especificação Técnica
            </h1>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {stages.map((stage, idx) => (
          <article
            key={stage.step}
            className="panel-surface glass-hover-card rounded-2xl p-6 flex flex-col gap-3.5"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center shrink-0 font-display text-xs font-bold text-sky-300">
                0{idx + 2}
              </div>
              <h2 className="font-display text-base font-bold text-white">
                {stage.step}
              </h2>
            </div>
            <ul className="space-y-2 text-xs text-slate-300 leading-relaxed pt-3 border-t border-slate-800/70">
              {stage.items.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-1.5 shrink-0" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
};
