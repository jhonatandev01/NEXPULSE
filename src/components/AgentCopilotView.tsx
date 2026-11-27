import React, { useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { AgentMarkdown } from './AgentMarkdown';
import {
  calculateOEE,
  type SimulationState,
} from '../simulation/palletEngine';
import type {
  AgentChatResponse,
  PredictiveHealthReport,
  UserRole,
} from '../agent/types';

interface AgentCopilotViewProps {
  state: SimulationState;
}

interface ChatItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolsConsulted?: string[];
  missingFlags?: string[];
}

const QUICK_PROMPTS = [
  {
    label: 'Por que o OEE variou?',
    prompt: 'Analise o OEE atual deste turno (Disponibilidade, Performance e Qualidade) e aponte os principais gargalos do Pareto.',
  },
  {
    label: 'Tendência de ciclo (EWMA)',
    prompt: 'Avalie a tendência atual do tempo de ciclo EWMA em comparação com o ciclo nominal da receita e indique riscos de microparadas.',
  },
  {
    label: 'Resumo da célula agora',
    prompt: 'Faça um resumo técnico objetivo do estado atual da célula PAL-01, sensores das esteiras e andamento do palete.',
  },
];

export const AgentCopilotView: React.FC<AgentCopilotViewProps> = ({ state }) => {
  const lineId = state.lineId ?? 'PAL-01';
  const [userRole, setUserRole] = useState<UserRole>('supervisor');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [asking, setAsking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [hoursWindow, setHoursWindow] = useState<4 | 8 | 24>(4);
  const [predictiveReport, setPredictiveReport] = useState<PredictiveHealthReport | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [predictiveError, setPredictiveError] = useState<string | null>(null);

  const oee = calculateOEE(
    state.operatingSeconds,
    state.downtimeSeconds,
    state.totalProducedBoxes,
    state.activePattern.cycleTimeSec,
    state.rejectedBoxes,
    state.plannedStopSeconds ?? 0,
  );
  const microstopsCount = (state.downtimeEvents ?? []).filter(
    (ev) => ev.downtimeType === 'MICROSTOP',
  ).length;

  const handleSendQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (trimmed.length < 2 || asking) return;

    setChatError(null);
    setAsking(true);
    setInput('');

    const userMsg: ChatItem = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch('/api/v1/agent/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_id: lineId,
          session_id: sessionId,
          user_role: userRole,
          message: trimmed,
        }),
      });

      const body = (await res.json()) as Partial<AgentChatResponse> & { error?: string };
      if (!res.ok) {
        setChatError(body.error ?? 'Falha ao consultar o Agente NexPulse.');
        return;
      }

      if (body.session_id) setSessionId(body.session_id);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: body.answer_markdown ?? '',
          toolsConsulted: body.tools_consulted ?? [],
          missingFlags: body.missing_data_flags ?? [],
        },
      ]);
    } catch {
      setChatError('Servidor indisponível para responder à consulta.');
    } finally {
      setAsking(false);
    }
  };

  const handleRunPredictiveCheck = async () => {
    if (checkingHealth) return;
    setCheckingHealth(true);
    setPredictiveError(null);

    try {
      const res = await fetch(
        `/api/v1/agent/lines/${encodeURIComponent(lineId)}/predictive-check?hours=${hoursWindow}`,
      );
      const body = (await res.json()) as Partial<PredictiveHealthReport> & { error?: string };
      if (!res.ok) {
        setPredictiveError(body.error ?? 'Não foi possível executar a auditoria preditiva.');
        return;
      }
      setPredictiveReport(body as PredictiveHealthReport);
    } catch {
      setPredictiveError('Erro de conexão com o backend do agente.');
    } finally {
      setCheckingHealth(false);
    }
  };

  const riskBadge = predictiveReport
    ? predictiveReport.risk_level === 'CRITICO'
      ? {
          label: 'Risco Crítico',
          textClass: 'text-red-300',
          frameClass: 'bg-red-500/12 border-red-400/35',
          Icon: AlertOctagon,
        }
      : predictiveReport.risk_level === 'ATENCAO'
        ? {
            label: 'Atenção Preditiva',
            textClass: 'text-amber-300',
            frameClass: 'bg-amber-500/12 border-amber-400/35',
            Icon: AlertTriangle,
          }
        : {
            label: 'Operação Normal',
            textClass: 'text-emerald-300',
            frameClass: 'bg-emerald-500/12 border-emerald-400/35',
            Icon: CheckCircle2,
          }
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">
          Agente Industrial
        </h1>
        <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
          Somente Leitura OT · {lineId} · OEE {oee.oee.toFixed(1)}%
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Predictive Health Audit */}
        <section
          data-testid="predictive-health-card"
          aria-label="Auditoria preditiva de ciclo e microparadas"
          className="lg:col-span-5 panel-surface glass-hover-card rounded-2xl p-6 space-y-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-white">
              Saúde Preditiva
            </h2>
            <div
              role="group"
              aria-label="Janela preditiva"
              className="inline-flex items-center bg-[#070B13] border border-slate-800/90 p-0.5 rounded-xl gap-0.5"
            >
              {([4, 8, 24] as const).map((hrs) => (
                <button
                  key={hrs}
                  type="button"
                  onClick={() => setHoursWindow(hrs)}
                  aria-pressed={hoursWindow === hrs}
                  className={`btn-glass-hover px-2.5 py-1 text-xs font-mono font-bold rounded-lg cursor-pointer ${
                    hoursWindow === hrs
                      ? 'bg-[#1D2B48] text-sky-300 border border-sky-400/40'
                      : 'text-slate-400 border border-transparent hover:text-white'
                  }`}
                >
                  {hrs}h
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs font-mono tabular-nums pt-1 border-t border-slate-800/70">
            <div className="pt-3">
              <div className="text-slate-400">EWMA</div>
              <div
                className={`text-base font-bold mt-0.5 ${
                  state.cycleDegradationActive ? 'text-amber-300' : 'text-white'
                }`}
              >
                {(state.ewmaCycleSec ?? state.activePattern.cycleTimeSec).toFixed(2)}s
              </div>
            </div>
            <div className="pt-3">
              <div className="text-slate-400">Nominal</div>
              <div className="text-base font-bold text-slate-200 mt-0.5">
                {state.activePattern.cycleTimeSec.toFixed(1)}s
              </div>
            </div>
            <div className="pt-3">
              <div className="text-slate-400">Microparadas</div>
              <div className="text-base font-bold text-sky-300 mt-0.5">
                {microstopsCount}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunPredictiveCheck}
            disabled={checkingHealth}
            className="btn-glass-hover w-full h-10 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-xs font-bold text-slate-950 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <Activity className="w-4 h-4" aria-hidden="true" />
            {checkingHealth ? 'Analisando tendência...' : 'Executar Varredura Preditiva'}
          </button>

          {predictiveError && (
            <div
              role="alert"
              className="rounded-xl border border-red-400/40 bg-red-950/50 px-3.5 py-2.5 text-xs text-red-200"
            >
              {predictiveError}
            </div>
          )}

          {predictiveReport && riskBadge && (
            <div
              data-testid="predictive-report-result"
              className="space-y-3 pt-2 border-t border-slate-800/70"
            >
              <div
                className={`rounded-xl border px-3.5 py-2.5 flex items-center justify-between gap-2 ${riskBadge.frameClass}`}
              >
                <span className={`inline-flex items-center gap-2 text-xs font-bold ${riskBadge.textClass}`}>
                  <riskBadge.Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {riskBadge.label}
                </span>
                <span className="text-[11px] font-mono text-slate-300">
                  {predictiveReport.cycle_drift_detected ? 'Deriva ativa' : 'Ciclo estável'}
                  {' · '}
                  {predictiveReport.microstop_spike_detected ? 'Pico microparadas' : 'Sem pico'}
                </span>
              </div>

              <p className="text-xs text-slate-200 leading-relaxed">
                {predictiveReport.summary}
              </p>

              {predictiveReport.recommended_inspections.length > 0 && (
                <ul className="space-y-1.5 text-xs text-slate-300">
                  {predictiveReport.recommended_inspections.map((step) => (
                    <li key={step} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-1.5 shrink-0" aria-hidden="true" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* Conversational Copilot */}
        <section
          aria-label="Copiloto conversacional NexPulse"
          className="lg:col-span-7 panel-surface glass-border-hover rounded-2xl flex flex-col overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-400/35 flex items-center justify-center">
                <Bot className="w-4 h-4 text-sky-300" aria-hidden="true" />
              </div>
              <h2 className="font-display text-lg font-bold text-white">
                Copiloto de Chão de Fábrica
              </h2>
            </div>

            <div className="relative">
              <select
                aria-label="Perfil do operador"
                value={userRole}
                onChange={(e) => setUserRole(e.target.value as UserRole)}
                className="input-field appearance-none h-9 pl-3 pr-8 text-xs font-semibold rounded-xl cursor-pointer"
              >
                <option value="operador">Operador</option>
                <option value="manutencao">Manutenção</option>
                <option value="supervisor">Supervisor</option>
              </select>
              <ChevronDown
                className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
            </div>
          </div>

          <div className="px-6 py-3 border-b border-slate-800/60 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q.label}
                type="button"
                disabled={asking}
                onClick={() => void handleSendQuestion(q.prompt)}
                className="btn-glass-hover px-3 py-1.5 rounded-xl bg-[#0B111E] border border-slate-700/80 hover:border-sky-400/50 text-xs font-medium text-slate-200 hover:text-white whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                {q.label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-[300px] max-h-[420px] overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center px-4">
                <Bot className="w-7 h-7 text-slate-600 mb-2" aria-hidden="true" />
                <p className="text-sm font-semibold text-white font-display">
                  Pronto para diagnóstico e análise OEE
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                  Consulte estados em tempo real, gargalos de parada ou deriva de ciclo sem acesso de escrita no CLP.
                </p>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.role === 'user'
                      ? 'ml-auto max-w-[85%] rounded-2xl bg-sky-500/15 border border-sky-400/30 px-4 py-2.5 text-xs font-medium text-white'
                      : 'mr-auto max-w-[94%] rounded-2xl bg-[#080D18] border border-slate-800/90 px-4 py-3 space-y-2'
                  }
                >
                  {m.role === 'user' ? (
                    <p>{m.text}</p>
                  ) : (
                    <>
                      <AgentMarkdown text={m.text} />
                      {(m.toolsConsulted?.length || m.missingFlags?.length) ? (
                        <div className="pt-2 border-t border-slate-800/70 text-[11px] font-mono text-slate-400">
                          {m.toolsConsulted && m.toolsConsulted.length > 0 && (
                            <span>Fontes: {m.toolsConsulted.join(' · ')}</span>
                          )}
                          {m.missingFlags && m.missingFlags.length > 0 && (
                            <span className="text-amber-300 ml-2">
                              · Faltando: {m.missingFlags.join(', ')}
                            </span>
                          )}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ))
            )}

            {asking && (
              <div className="text-xs font-mono text-sky-300">
                Consultando telemetria da linha {lineId}...
              </div>
            )}

            {chatError && (
              <div
                role="alert"
                className="rounded-xl border border-red-400/40 bg-red-950/50 px-3.5 py-2.5 text-xs text-red-200"
              >
                {chatError}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendQuestion(input);
            }}
            className="p-4 border-t border-slate-800/80 flex items-center gap-2.5"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte sobre OEE, alarmes ou sensores..."
              aria-label="Pergunta para o Agente Industrial"
              className="input-field flex-1 h-10 px-3.5 text-xs rounded-xl"
            />
            <button
              type="submit"
              disabled={asking || input.trim().length < 2}
              className="btn-glass-hover h-10 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-xs font-bold text-slate-950 inline-flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              Enviar
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
