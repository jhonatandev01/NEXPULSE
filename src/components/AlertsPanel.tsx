import React, { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock,
  Info,
  RotateCcw,
} from 'lucide-react';
import { AgentMarkdown } from './AgentMarkdown';
import {
  DEFAULT_REASON_CODES,
  FAULT_CATALOG,
  type SimulationState,
  type SystemAlert,
} from '../simulation/palletEngine';
import type {
  AlarmDiagnoseResponse,
  OneClickStopClassification,
} from '../agent/types';

interface AlertsPanelProps {
  state: SimulationState;
  onResolveFault: () => void;
  onJustifyDowntime: (
    downtimeId: number,
    reasonCodeId: number,
    justifiedBy: string,
    notes?: string,
  ) => void;
}

type AlertFilter = 'todos' | 'falhas' | 'paletes' | 'paradas';

export const AlertsPanel: React.FC<AlertsPanelProps> = ({
  state,
  onResolveFault,
  onJustifyDowntime,
}) => {
  const [filter, setFilter] = useState<AlertFilter>('todos');
  const [selectedReasons, setSelectedReasons] = useState<Record<number, number>>({});
  const [alarmDiag, setAlarmDiag] = useState<AlarmDiagnoseResponse | null>(null);
  const [alarmDiagLoading, setAlarmDiagLoading] = useState(false);
  const [alarmDiagError, setAlarmDiagError] = useState<string | null>(null);
  const [stopSuggestions, setStopSuggestions] = useState<Record<number, OneClickStopClassification>>({});
  const [suggestLoadingId, setSuggestLoadingId] = useState<number | null>(null);
  const [suggestError, setSuggestError] = useState<Record<number, string>>({});

  const activeFaultMeta = state.activeFault ? FAULT_CATALOG[state.activeFault] : null;
  const lineId = state.lineId ?? 'PAL-01';
  const activeAlarmNumeric =
    state.activeFault === 'PRESSAO_GARRA'
      ? 208
      : state.activeFault === 'SENSOR_ESTEIRA'
        ? 104
        : state.activeFault === 'DESALINHAMENTO_CAIXA'
          ? 312
          : state.activeFault === 'PARADA_EMERGENCIA'
            ? 1
            : 0;

  const handleDiagnoseFault = async () => {
    if (!activeFaultMeta || alarmDiagLoading) return;
    setAlarmDiagLoading(true);
    setAlarmDiagError(null);
    try {
      const res = await fetch('/api/v1/agent/alarms/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_id: lineId,
          alarme_ativo_cod: activeAlarmNumeric,
          alarm_description: activeFaultMeta.title,
        }),
      });
      const body = (await res.json()) as Partial<AlarmDiagnoseResponse> & { error?: string };
      if (!res.ok) {
        setAlarmDiagError(body.error ?? 'Falha ao consultar diagnóstico do agente.');
        return;
      }
      setAlarmDiag(body as AlarmDiagnoseResponse);
    } catch {
      setAlarmDiagError('Servidor do agente indisponível.');
    } finally {
      setAlarmDiagLoading(false);
    }
  };

  const handleSuggestStopReason = async (downtimeId: number) => {
    if (suggestLoadingId === downtimeId) return;
    setSuggestLoadingId(downtimeId);
    setSuggestError((prev) => {
      const next = { ...prev };
      delete next[downtimeId];
      return next;
    });
    try {
      const res = await fetch(
        `/api/v1/agent/lines/${encodeURIComponent(lineId)}/downtimes/${downtimeId}/suggest`,
        { method: 'POST' },
      );
      const body = (await res.json()) as Partial<OneClickStopClassification> & { error?: string };
      if (!res.ok) {
        setSuggestError((prev) => ({
          ...prev,
          [downtimeId]: body.error ?? 'Erro ao sugerir motivo.',
        }));
        return;
      }
      const typed = body as OneClickStopClassification;
      setStopSuggestions((prev) => ({ ...prev, [downtimeId]: typed }));
      if (typed.suggested_reason_code_id) {
        setSelectedReasons((prev) => ({
          ...prev,
          [downtimeId]: typed.suggested_reason_code_id as number,
        }));
      }
    } catch {
      setSuggestError((prev) => ({
        ...prev,
        [downtimeId]: 'Agente indisponível no momento.',
      }));
    } finally {
      setSuggestLoadingId(null);
    }
  };

  const unresolvedCount = state.alerts.filter((a) => !a.resolved).length;
  const downtimes = state.downtimeEvents ?? [];
  const unjustifiedCount = downtimes.filter((d) => d.reasonCodeId === null).length;

  const filteredAlerts = state.alerts.filter((alert) => {
    if (state.status === 'FALHA' && !alert.resolved && alert.severity === 'CRITICO') {
      return false;
    }
    if (filter === 'falhas') return alert.severity === 'CRITICO' || alert.code === 'PRED-EWMA';
    if (filter === 'paletes') {
      return (
        alert.code.startsWith('PLT') ||
        alert.code.startsWith('AVS') ||
        alert.code.startsWith('INFO-102') ||
        alert.code.startsWith('SKU')
      );
    }
    return true;
  });

  const renderSeverityIcon = (alert: SystemAlert) => {
    if (alert.severity === 'CRITICO') {
      return (
        <div className="w-7 h-7 rounded-lg bg-red-500/15 border border-red-400/30 flex items-center justify-center shrink-0 mt-0.5">
          <AlertOctagon className="w-3.5 h-3.5 text-red-400" aria-hidden="true" />
        </div>
      );
    }
    if (alert.severity === 'AVISO') {
      return (
        <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-400/30 flex items-center justify-center shrink-0 mt-0.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
        </div>
      );
    }
    return (
      <div className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-400/30 flex items-center justify-center shrink-0 mt-0.5">
        <Info className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
      </div>
    );
  };

  return (
    <aside
      aria-label="Central de alertas e eventos da linha"
      className="panel-surface glass-border-hover rounded-2xl flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-white tracking-tight">
            Ocorrências
          </h2>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            {unresolvedCount > 0
              ? `${unresolvedCount} ativa(s)`
              : unjustifiedCount > 0
                ? `${unjustifiedCount} parada(s)`
                : 'Nominal'}
          </span>
        </div>

        <div
          role="group"
          aria-label="Filtrar eventos"
          className="w-full grid grid-cols-4 bg-[#070B13] border border-slate-800/90 p-1 rounded-xl gap-0.5"
        >
          {(
            [
              { id: 'todos', label: 'Todos' },
              { id: 'falhas', label: 'Falhas' },
              { id: 'paletes', label: 'Paletes' },
              {
                id: 'paradas',
                label: unjustifiedCount > 0 ? `Paradas (${unjustifiedCount})` : 'Paradas',
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              aria-pressed={filter === tab.id}
              className={`btn-glass-hover px-2 py-1.5 text-[11px] font-semibold rounded-lg whitespace-nowrap text-center cursor-pointer ${
                filter === tab.id
                  ? 'bg-sky-500 text-slate-950 font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active Critical Fault Card */}
      {state.status === 'FALHA' && activeFaultMeta && (
        <div
          data-testid="active-fault-card"
          role="alert"
          className="m-4 p-4 bg-gradient-to-b from-red-950/90 to-[#1D0B10] border border-red-400/50 rounded-2xl flex flex-col gap-3"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/20 border border-red-400/40 flex items-center justify-center shrink-0">
              <AlertOctagon className="w-5 h-5 text-red-300" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-xs font-mono text-red-200">
                <span className="font-bold">{activeFaultMeta.code}</span>
                <span>{activeFaultMeta.station}</span>
              </div>
              <h3 className="font-display text-sm font-semibold text-white mt-0.5">
                {activeFaultMeta.title}
              </h3>
              <p className="text-xs text-red-100/90 mt-1 leading-snug">
                {activeFaultMeta.description}
              </p>
            </div>
          </div>

          <div className="recessed-well rounded-xl p-3 space-y-2 border-red-500/25">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-red-200">
              <span className="font-bold">Checklist</span>
              <span>
                Ar {state.airPressureBar.toFixed(1)} bar · Vácuo {state.gripperVacuumKpa} kPa
              </span>
            </div>
            <ol className="space-y-1 text-xs text-slate-100">
              {activeFaultMeta.checklist.map((step, idx) => (
                <li key={step} className="flex items-start gap-2 leading-snug">
                  <span className="w-4 h-4 rounded-md bg-red-500/20 border border-red-400/35 text-[10px] font-mono font-bold text-red-200 flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={handleDiagnoseFault}
              disabled={alarmDiagLoading}
              className="btn-glass-hover flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-sky-200 bg-[#0B1424] hover:bg-[#132138] border border-sky-400/40 rounded-xl cursor-pointer disabled:opacity-60"
            >
              <Bot className="w-3.5 h-3.5 text-sky-300" aria-hidden="true" />
              {alarmDiagLoading ? 'Diagnosticando...' : 'Diagnosticar IA'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAlarmDiag(null);
                setAlarmDiagError(null);
                onResolveFault();
              }}
              className="btn-glass-hover flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-500 border border-red-400/80 rounded-xl cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Reconhecer e Retomar
            </button>
          </div>

          {alarmDiagError && (
            <div
              role="alert"
              className="rounded-xl border border-red-400/40 bg-red-950/60 px-3 py-2 text-xs text-red-200"
            >
              {alarmDiagError}
            </div>
          )}

          {alarmDiag && alarmDiag.alarm_code === activeAlarmNumeric && (
            <div
              data-testid="agent-alarm-diagnosis"
              className="rounded-xl bg-[#080E1A] border border-sky-400/30 p-3 space-y-2 max-h-60 overflow-y-auto"
            >
              <div className="flex items-center justify-between text-[11px] font-mono text-sky-300">
                <span className="font-bold">Diagnóstico Guiado · CLP #{alarmDiag.alarm_code}</span>
                <span>{alarmDiag.tools_consulted.length} leitura(s)</span>
              </div>
              <AgentMarkdown text={alarmDiag.diagnosis_markdown} compact />
            </div>
          )}
        </div>
      )}

      {/* Minimal Feed */}
      <div className="flex-1 overflow-y-auto max-h-[505px] divide-y divide-slate-800/70">
        {filter === 'paradas' ? (
          downtimes.length === 0 ? (
            <div className="p-10 text-center">
              <CheckCircle2 className="w-6 h-6 text-slate-600 mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm font-semibold text-white font-display">Nenhuma parada registrada</p>
              <p className="text-xs text-slate-400 mt-1">
                Paradas da linha aparecem aqui para classificação OEE.
              </p>
            </div>
          ) : (
            downtimes.map((ev) => {
              const reason = DEFAULT_REASON_CODES.find((r) => r.id === ev.reasonCodeId);
              const selectedId = selectedReasons[ev.id] ?? DEFAULT_REASON_CODES[0].id;
              const typeLabel =
                ev.downtimeType === 'FAULT'
                  ? 'FALHA'
                  : ev.downtimeType === 'MACROSTOP'
                    ? 'PARADA'
                    : 'MICRO';

              return (
                <div
                  key={ev.id}
                  data-testid={`downtime-row-${ev.id}`}
                  className="px-5 py-3.5 space-y-2 hover:bg-slate-800/25 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums">
                    <span
                      className={`font-bold flex items-center gap-1.5 ${
                        ev.downtimeType === 'FAULT'
                          ? 'text-red-400'
                          : ev.downtimeType === 'MACROSTOP'
                            ? 'text-amber-400'
                            : 'text-sky-400'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      #{ev.id} · {typeLabel}
                    </span>
                    <span className="text-slate-200 font-semibold">
                      {ev.durationSec.toFixed(1)}s · {ev.startedAtLabel}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-white truncate">
                    {ev.alarmDescription ?? 'Interrupção registrada na linha'}
                  </div>

                  {reason ? (
                    <div className="text-[11px] font-medium text-emerald-300">
                      {reason.code} · {reason.description}
                    </div>
                  ) : (
                    <div className="space-y-2 pt-0.5">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1 min-w-0">
                          <select
                            aria-label={`Motivo da parada ${ev.id}`}
                            value={selectedId}
                            onChange={(e) =>
                              setSelectedReasons((prev) => ({
                                ...prev,
                                [ev.id]: Number(e.target.value),
                              }))
                            }
                            className="input-field appearance-none w-full h-9 pl-2.5 pr-7 text-xs rounded-xl cursor-pointer"
                          >
                            {DEFAULT_REASON_CODES.map((rc) => (
                              <option key={rc.id} value={rc.id}>
                                {rc.code} · {rc.description}
                              </option>
                            ))}
                          </select>
                          <ChevronDown
                            className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
                            aria-hidden="true"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleSuggestStopReason(ev.id)}
                          disabled={suggestLoadingId === ev.id}
                          title="Sugerir motivo com IA Read-Only"
                          aria-label={`Sugerir motivo IA para parada ${ev.id}`}
                          className="btn-glass-hover h-9 px-2.5 text-xs font-semibold text-sky-200 bg-[#0D1729] border border-sky-400/35 hover:border-sky-300/70 rounded-xl shrink-0 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <Bot className="w-3.5 h-3.5 text-sky-300" aria-hidden="true" />
                          <span>{suggestLoadingId === ev.id ? '...' : 'IA'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onJustifyDowntime(ev.id, selectedId, 'Operador HMI')
                          }
                          className="btn-glass-hover h-9 px-3 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl shrink-0 cursor-pointer"
                        >
                          Justificar
                        </button>
                      </div>

                      {suggestError[ev.id] && (
                        <div className="text-[11px] text-red-300">{suggestError[ev.id]}</div>
                      )}

                      {stopSuggestions[ev.id] && (
                        <div
                          data-testid={`downtime-ai-suggestion-${ev.id}`}
                          className="rounded-xl bg-[#080E1A] border border-sky-400/30 p-2.5 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                            <span className="font-bold text-sky-300 truncate">
                              {stopSuggestions[ev.id].suggested_reason_label}
                            </span>
                            <span className="text-slate-300 shrink-0">
                              Confiança {stopSuggestions[ev.id].confidence}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-snug">
                            {stopSuggestions[ev.id].evidence_summary}
                          </p>
                          {stopSuggestions[ev.id].suggested_reason_code_id !== null && (
                            <button
                              type="button"
                              onClick={() =>
                                onJustifyDowntime(
                                  ev.id,
                                  stopSuggestions[ev.id].suggested_reason_code_id as number,
                                  'Operador HMI (1-Clique IA)',
                                  stopSuggestions[ev.id].evidence_summary,
                                )
                              }
                              className="btn-glass-hover w-full h-8 px-3 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-[11px] font-bold text-slate-950 cursor-pointer"
                            >
                              Confirmar em 1 Clique ({
                                DEFAULT_REASON_CODES.find(
                                  (r) => r.id === stopSuggestions[ev.id].suggested_reason_code_id,
                                )?.code ?? `#${stopSuggestions[ev.id].suggested_reason_code_id}`
                              })
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )
        ) : filteredAlerts.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="w-6 h-6 text-slate-600 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-semibold text-white font-display">Sem ocorrências</p>
          </div>
        ) : (
          filteredAlerts.slice(0, 12).map((alert) => (
            <div
              key={alert.id}
              className="px-5 py-3 flex items-center gap-3 hover:bg-slate-800/30 transition-colors"
            >
              {renderSeverityIcon(alert)}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
                  <span
                    className={`font-bold ${
                      alert.severity === 'CRITICO'
                        ? 'text-red-400'
                        : alert.severity === 'AVISO'
                          ? 'text-amber-400'
                          : 'text-sky-400'
                    }`}
                  >
                    {alert.code}
                  </span>
                  <span className="text-slate-400">{alert.timestamp}</span>
                </div>
                <div className="text-xs font-semibold text-white truncate mt-0.5">
                  {alert.title}
                </div>
                {!alert.resolved && (
                  <p className="text-[11px] text-slate-300 truncate mt-0.5">
                    {alert.description}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
};

