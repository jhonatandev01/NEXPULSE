import React, { useState } from 'react';
import { Download, Radio, Send } from 'lucide-react';
import { ResilientImage } from './ResilientImage';
import {
  DEFAULT_REASON_CODES,
  calculateBoxesPerMinute,
  calculateOEE,
  calculateShiftProductionPercent,
  computeParetoDowntimes,
  generateShiftCsv,
  getBoxesPerLayer,
  type SimulationState,
} from '../simulation/palletEngine';

interface ProductionHistoryViewProps {
  state: SimulationState;
  lastTelemetryAt?: string | null;
}

export const ProductionHistoryView: React.FC<ProductionHistoryViewProps> = ({
  state,
  lastTelemetryAt,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [telemetryFeedback, setTelemetryFeedback] = useState<string | null>(null);
  const [sendingTelemetry, setSendingTelemetry] = useState(false);

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
      const blob = new Blob([generateShiftCsv(state)], { type: 'text/csv;charset=utf-8;' });
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

  const handleSendSampleTelemetry = async () => {
    setSendingTelemetry(true);
    setTelemetryFeedback(null);
    try {
      const filledNow = state.slots.filter((s) => s.filled).length;
      const perLayer = getBoxesPerLayer(state.activePattern);
      const nextBoxIndex = filledNow + 1;
      const currentLayer = Math.min(
        state.activePattern.layers,
        Math.floor(filledNow / perLayer) + 1,
      );
      const boxesInLayer = ((nextBoxIndex - 1) % perLayer) + 1;
      const nextShiftBoxes =
        (state.lastPlcBoxesShift ?? state.totalProducedBoxes) + 1;

      const sampleV1Payload = {
        line_id: state.lineId ?? 'PAL-01',
        timestamp: new Date().toISOString(),
        machine_state: 1,
        robot_status: 1,
        conveyor_in_ok: true,
        conveyor_out_ok: true,
        sku: state.activePattern.sku,
        boxes_shift: nextShiftBoxes,
        completed_pallets: state.lastPlcCompletedPallets ?? state.completedPallets.length,
        current_layer: currentLayer,
        boxes_in_layer: boxesInLayer,
        cycle_time_sec: state.activePattern.cycleTimeSec,
        alarm_code: 0,
        alarm_description: null,
      };
      const res = await fetch('/api/v1/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleV1Payload),
      });
      if (res.ok) {
        const body = (await res.json()) as { ewma_cycle_sec?: number };
        setTelemetryFeedback(
          `Pacote CLP v1 (${sampleV1Payload.sku} · cx ${nextShiftBoxes}) ingerido. EWMA: ${Number(body.ewma_cycle_sec ?? state.activePattern.cycleTimeSec).toFixed(2)}s.`,
        );
      } else {
        setTelemetryFeedback('Endpoint /api/v1/telemetry retornou erro de validação ou token.');
      }
    } catch {
      setTelemetryFeedback('Servidor backend indisponível no momento.');
    } finally {
      setSendingTelemetry(false);
    }
  };

  const oee = calculateOEE(
    state.operatingSeconds,
    state.downtimeSeconds,
    state.totalProducedBoxes,
    state.activePattern.cycleTimeSec,
    state.rejectedBoxes,
    state.plannedStopSeconds ?? 0,
  );
  const shiftPercent = calculateShiftProductionPercent(
    state.totalProducedBoxes,
    state.shiftTargetBoxes,
  );
  const currentRate = calculateBoxesPerMinute(
    state.totalProducedBoxes,
    state.operatingSeconds,
  );
  const paretoItems = computeParetoDowntimes(
    state.downtimeEvents ?? [],
    DEFAULT_REASON_CODES,
    5,
  );
  const maxParetoSec = Math.max(1, ...paretoItems.map((item) => item.totalDurationSec));

  // SVG Chart Geometry
  const points = state.throughputHistory;
  const chartW = 720;
  const chartH = 220;
  const padL = 44;
  const padR = 20;
  const padT = 20;
  const padB = 34;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const maxY = Math.max(
    40,
    ...points.map((p) => Math.max(p.boxesPerMin, p.targetBoxesPerMin)),
  );
  const yCeiling = Math.ceil(maxY / 10) * 10;

  const getX = (idx: number) =>
    points.length <= 1 ? padL + plotW / 2 : padL + (idx / (points.length - 1)) * plotW;
  const getY = (val: number) => padT + plotH - (val / yCeiling) * plotH;

  const linePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(p.boxesPerMin).toFixed(1)}`)
    .join(' ');

  const areaPath =
    points.length > 1
      ? `${linePath} L ${getX(points.length - 1).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${getX(0).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
      : '';

  const targetLineY = points.length > 0 ? getY(points[points.length - 1].targetBoxesPerMin) : padT;

  const hoveredPoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">
          Produção e Desempenho (OEE)
        </h1>
        <span className="text-xs font-mono tabular-nums text-slate-400">
          {state.totalProducedBoxes} cx produzidas · {state.completedPallets.length} paletes
        </span>
      </div>

      {/* Primary Analytics Cards: Cadência + Eficiência Global */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 panel-surface glass-hover-card rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="font-display text-lg font-bold text-white">
              Cadência (cx/min)
            </h2>
            <div className="text-xs font-mono tabular-nums text-slate-300">
              {hoveredPoint ? (
                <span>
                  {hoveredPoint.timeLabel} · Real <strong className="text-sky-300">{hoveredPoint.boxesPerMin}</strong> · Meta{' '}
                  <strong className="text-white">{hoveredPoint.targetBoxesPerMin}</strong>
                </span>
              ) : (
                <span>Média <strong className="text-sky-300">{currentRate.toFixed(1)} cx/min</strong></span>
              )}
            </div>
          </div>

          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            className="w-full h-auto"
            role="img"
            aria-label="Gráfico de cadência de paletização em caixas por minuto"
          >
            <defs>
              <linearGradient id="throughputAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const val = Math.round(yCeiling * ratio);
              const y = getY(val);
              return (
                <g key={ratio}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={chartW - padR}
                    y2={y}
                    stroke="#1E293B"
                    strokeDasharray={ratio === 0 ? undefined : '3 3'}
                    strokeWidth="1"
                  />
                  <text
                    x={padL - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-400 text-[11px] font-mono"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            <line
              x1={padL}
              y1={targetLineY}
              x2={chartW - padR}
              y2={targetLineY}
              stroke="#64748B"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />

            {points.length > 1 && (
              <>
                <path d={areaPath} fill="url(#throughputAreaGrad)" />
                <path
                  d={linePath}
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </>
            )}

            {points.map((pt, idx) => {
              const cx = getX(idx);
              const cy = getY(pt.boxesPerMin);
              const isHovered = hoverIndex === idx;
              return (
                <g
                  key={`${pt.timeLabel}-${idx}`}
                  onMouseEnter={() => setHoverIndex(idx)}
                  onMouseLeave={() => setHoverIndex(null)}
                  className="cursor-crosshair"
                >
                  {isHovered && (
                    <line
                      x1={cx}
                      y1={padT}
                      x2={cx}
                      y2={chartH - padB}
                      stroke="#475569"
                      strokeWidth="1"
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHovered ? 5.5 : 3.5}
                    fill={pt.status === 'PAUSADO' || pt.status === 'FALHA' ? '#F59E0B' : '#38BDF8'}
                    stroke="#080D18"
                    strokeWidth="2"
                  />
                  <circle cx={cx} cy={cy} r={14} fill="transparent" />
                  <text
                    x={cx}
                    y={chartH - 10}
                    textAnchor="middle"
                    className="fill-slate-400 text-[10px] font-mono"
                  >
                    {pt.timeLabel}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* OEE Hero Breakdown */}
        <div className="panel-surface glass-hover-card rounded-2xl p-6 flex flex-col justify-between gap-5">
          <div>
            <div className="text-xs font-medium text-slate-400">
              Eficiência Global (OEE)
            </div>
            <div className="mt-2 font-display text-5xl font-bold tracking-tight tabular-nums text-emerald-400 leading-none">
              {oee.oee.toFixed(1)}%
            </div>
          </div>

          <div className="space-y-3">
            {[
              { label: 'Disponibilidade', value: oee.availability, color: 'bg-gradient-to-r from-sky-500 to-sky-300' },
              { label: 'Desempenho', value: oee.performance, color: 'bg-gradient-to-r from-blue-500 to-sky-400' },
              { label: 'Qualidade', value: oee.quality, color: 'bg-gradient-to-r from-emerald-500 to-emerald-300' },
              { label: 'Meta do Turno', value: Math.min(100, shiftPercent), color: 'bg-gradient-to-r from-amber-500 to-amber-300' },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-300">{item.label}</span>
                  <span className="font-mono tabular-nums font-bold text-white">
                    {item.value.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[#080D18] overflow-hidden">
                  <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.value}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-800/70 text-xs font-mono tabular-nums text-slate-400 flex justify-between">
            <span>Operação <strong className="text-white">{Math.round(state.operatingSeconds)}s</strong></span>
            <span>Paradas <strong className="text-white">{Math.round(state.downtimeSeconds)}s</strong></span>
          </div>
        </div>
      </section>

      {/* Pareto de Paradas */}
      <section
        data-testid="pareto-section"
        className="panel-surface glass-hover-card rounded-2xl p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="font-display text-lg font-bold text-white">
            Pareto de Paradas
          </h2>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            EWMA <strong className="text-sky-300">{(state.ewmaCycleSec ?? state.activePattern.cycleTimeSec).toFixed(2)}s</strong>
          </span>
        </div>

        {paretoItems.length === 0 ? (
          <div className="text-xs text-slate-400 py-2">
            Nenhuma parada registrada no turno.
          </div>
        ) : (
          <div className="space-y-3">
            {paretoItems.map((entry) => {
              const pct = Math.max(4, (entry.totalDurationSec / maxParetoSec) * 100);
              return (
                <div key={entry.reason} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-white">
                      {entry.reason}
                      {entry.isPlanned && (
                        <span className="ml-2 text-sky-300 font-mono">(Planejada)</span>
                      )}
                    </span>
                    <span className="font-mono tabular-nums text-slate-300">
                      {entry.occurrences}× · <strong className="text-white">{entry.totalDurationSec.toFixed(1)}s</strong>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#080D18] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        entry.isPlanned
                          ? 'bg-gradient-to-r from-sky-500 to-sky-300'
                          : 'bg-gradient-to-r from-amber-500 to-amber-300'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Completed Pallets Ledger Table */}
      <section className="panel-surface glass-border-hover rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-white">
            Paletes Concluídos ({state.completedPallets.length})
          </h2>

          <button
            type="button"
            onClick={handleExportCsv}
            className="btn-glass-hover inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-semibold text-white bg-[#162035] hover:bg-[#1E2C47] border border-slate-600/80 rounded-xl cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
            Exportar CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800/80 bg-[#090E1A]/80 text-xs font-semibold text-slate-400">
                <th className="py-3 px-5">Palete</th>
                <th className="py-3 px-5">Receita</th>
                <th className="py-3 px-5">SKU</th>
                <th className="py-3 px-5 text-right">Caixas</th>
                <th className="py-3 px-5 text-right">Peso</th>
                <th className="py-3 px-5 text-right">Ciclo</th>
                <th className="py-3 px-5 text-right">Hora</th>
                <th className="py-3 px-5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {state.completedPallets.map((rec, rowIdx) => (
                <tr
                  key={rec.palletId}
                  className={`transition-colors hover:bg-sky-500/10 ${
                    rowIdx % 2 === 1 ? 'bg-[#090E1A]/40' : ''
                  }`}
                >
                  <td className="py-3 px-5 font-mono tabular-nums font-bold text-white">
                    {rec.palletId}
                  </td>
                  <td className="py-3 px-5 text-slate-200">{rec.patternName}</td>
                  <td className="py-3 px-5 font-mono text-xs text-sky-300">{rec.sku}</td>
                  <td className="py-3 px-5 text-right font-mono tabular-nums font-semibold text-white">
                    {rec.boxCount}
                  </td>
                  <td className="py-3 px-5 text-right font-mono tabular-nums text-slate-200">
                    {rec.totalWeightKg.toFixed(1)} kg
                  </td>
                  <td className="py-3 px-5 text-right font-mono tabular-nums text-slate-300">
                    {rec.cycleDurationSec}s
                  </td>
                  <td className="py-3 px-5 text-right font-mono tabular-nums text-slate-300">
                    {rec.completedAt}
                  </td>
                  <td className="py-3 px-5 text-xs font-bold">
                    <span
                      className={
                        rec.validationStatus && rec.validationStatus !== 'COMPLETE'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }
                    >
                      {rec.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Industrial Gateway Integration Bridge */}
      <section className="panel-surface glass-hover-card rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="relative w-full sm:w-36 h-24 rounded-xl overflow-hidden border border-slate-700/80 shrink-0 bg-[#080D18]">
            <ResilientImage
              src="/src/assets/images/nexpulse_cell_hero_1795803462214.jpg"
              alt="Célula robótica NexPulse conectada ao gateway IIoT"
              fallbackTitle="Célula PAL-01"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-display font-bold text-white">
              <Radio className="w-4 h-4 text-sky-400" aria-hidden="true" />
              Gateway IIoT · REST v1
            </div>
            <p className="text-xs text-slate-300 font-mono">
              POST /api/v1/telemetry · Último: {lastTelemetryAt ?? 'Aguardando'}
            </p>
            {telemetryFeedback && (
              <p className="text-xs font-medium text-emerald-400 pt-0.5">{telemetryFeedback}</p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSendSampleTelemetry}
          disabled={sendingTelemetry}
          className="btn-glass-hover inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-xl cursor-pointer shrink-0 disabled:opacity-60"
        >
          <Send className="w-3.5 h-3.5" aria-hidden="true" />
          {sendingTelemetry ? 'Enviando...' : 'Testar Ingestão CLP'}
        </button>
      </section>
    </div>
  );
};
