import crypto from 'node:crypto';
import { GoogleGenAI, ThinkingLevel, Type, type Content, type Part } from '@google/genai';
import { NEXPULSE_SYSTEM_PROMPT } from './prompts.ts';
import {
  NexPulseReadOnlyTools,
  TOOL_DECLARATIONS,
  applyOtSafetyGuardrail,
  type ReadOnlyStateSource,
} from './readOnlyTools.ts';
import type {
  AgentChatResponse,
  AlarmDiagnoseResponse,
  OneClickStopClassification,
  PredictiveHealthReport,
  UserRole,
} from './types.ts';

const DEFAULT_MODEL = 'gemini-4-hydrogen';
const MAX_TOOL_TURNS = 6;
const SESSION_TTL_MS = 3600_000;
const MAX_SESSIONS = 50;

interface StoredTurn {
  role: 'user' | 'model';
  text: string;
}

interface ChatSessionEntry {
  turns: StoredTurn[];
  updatedAt: number;
}

export class AgentConfigError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 503) {
    super(message);
    this.name = 'AgentConfigError';
    this.statusCode = statusCode;
  }
}

export class NexPulseAgentService {
  private readonly toolsImpl: NexPulseReadOnlyTools;
  private readonly sessions = new Map<string, ChatSessionEntry>();

  constructor(source: ReadOnlyStateSource) {
    this.toolsImpl = new NexPulseReadOnlyTools(source);
  }

  private getModelName(): string {
    const configured = process.env.GEMINI_MODEL?.trim();
    if (!configured) return DEFAULT_MODEL;
    // Allow explicit versioned Gemini 3/4 aliases; map legacy/reference alias cleanly
    if (configured === 'gemini-3.8-flash') return DEFAULT_MODEL;
    return configured;
  }

  private createClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      throw new AgentConfigError(
        'GEMINI_API_KEY não configurada no ambiente do servidor. Configure a chave no painel Settings > Secrets.',
        503,
      );
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  /**
   * Dispatcher estrito via allowlist explícita — impossível invocar qualquer método fora das 5 ferramentas Read-Only.
   */
  private dispatchReadOnlyTool(name: string, args: Record<string, unknown>): Record<string, unknown> {
    const lineId = typeof args.line_id === 'string' && args.line_id.trim() ? args.line_id.trim() : 'PAL-01';

    switch (name) {
      case 'get_realtime_cell_snapshot':
        return this.toolsImpl.get_realtime_cell_snapshot(lineId);
      case 'get_telemetry_context_window': {
        const secondsBefore = typeof args.seconds_before === 'number' ? args.seconds_before : 90;
        const refIso = typeof args.reference_iso === 'string' ? args.reference_iso : null;
        return this.toolsImpl.get_telemetry_context_window(lineId, secondsBefore, refIso);
      }
      case 'get_shift_oee_and_pareto': {
        const hours = typeof args.hours === 'number' ? args.hours : 8;
        return this.toolsImpl.get_shift_oee_and_pareto(lineId, hours);
      }
      case 'get_downtime_classification_context': {
        const downtimeId = Number(args.downtime_id);
        if (!Number.isInteger(downtimeId) || downtimeId <= 0) {
          return { found: false, missing: ['downtime_id inteiro válido'] };
        }
        return this.toolsImpl.get_downtime_classification_context(lineId, downtimeId);
      }
      case 'get_predictive_cycle_health': {
        const hours = typeof args.hours === 'number' ? args.hours : 4;
        return this.toolsImpl.get_predictive_cycle_health(lineId, hours);
      }
      default:
        return { error: `Ferramenta não autorizada ou inexistente: ${name}` };
    }
  }

  private pruneExpiredSessions(now = Date.now()): void {
    for (const [key, entry] of this.sessions.entries()) {
      if (now - entry.updatedAt > SESSION_TTL_MS) {
        this.sessions.delete(key);
      }
    }
    while (this.sessions.size > MAX_SESSIONS) {
      const oldestKey = this.sessions.keys().next().value;
      if (!oldestKey) break;
      this.sessions.delete(oldestKey);
    }
  }

  private async runAgentLoop(
    initialPrompt: string,
    historyContents: Content[] = [],
  ): Promise<{ answer: string; toolsConsulted: string[]; missingDataFlags: string[] }> {
    const ai = this.createClient();
    const model = this.getModelName();

    const contents: Content[] = [
      ...historyContents,
      { role: 'user', parts: [{ text: initialPrompt }] },
    ];

    const toolsUsed: string[] = [];
    const missingFlags: string[] = [];

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: NEXPULSE_SYSTEM_PROMPT,
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const calls = response.functionCalls;
      if (!calls || calls.length === 0) {
        const rawText = (response.text ?? '').trim();
        const guarded = applyOtSafetyGuardrail(rawText);
        return {
          answer: guarded.text || 'Sem resposta textual gerada para a consulta.',
          toolsConsulted: Array.from(new Set(toolsUsed)),
          missingDataFlags: Array.from(new Set(missingFlags)),
        };
      }

      const modelContent = response.candidates?.[0]?.content;
      if (modelContent) {
        contents.push(modelContent);
      }

      const toolResponseParts: Part[] = [];
      for (const fc of calls) {
        const fnName = fc.name ?? '';
        const fnArgs = (fc.args ?? {}) as Record<string, unknown>;
        if (fnName) toolsUsed.push(fnName);

        let payload: Record<string, unknown>;
        try {
          const result = this.dispatchReadOnlyTool(fnName, fnArgs);
          if (Array.isArray(result.missing)) {
            for (const m of result.missing) {
              if (typeof m === 'string') missingFlags.push(m);
            }
          }
          payload = { result };
        } catch (err) {
          payload = { error: err instanceof Error ? err.message : 'Erro interno ao consultar ferramenta' };
        }

        toolResponseParts.push({
          functionResponse: {
            id: fc.id,
            name: fnName,
            response: payload,
          },
        });
      }

      contents.push({
        role: 'user',
        parts: toolResponseParts,
      });
    }

    return {
      answer:
        'Limite de consultas atingido para esta análise. Informe o código de alarme ou janela específica.',
      toolsConsulted: Array.from(new Set(toolsUsed)),
      missingDataFlags: Array.from(new Set(missingFlags)),
    };
  }

  async ask(
    lineId: string,
    userRole: UserRole,
    message: string,
    sessionId?: string | null,
  ): Promise<AgentChatResponse> {
    this.pruneExpiredSessions();
    const sid = sessionId || crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const sessionKey = `${lineId}:${sid}`;
    const existing = this.sessions.get(sessionKey);
    const storedTurns = existing?.turns ?? [];

    const historyContents: Content[] = storedTurns.slice(-6).map((t) => ({
      role: t.role,
      parts: [{ text: t.text }],
    }));

    const prompt = `[Contexto: Linha=${lineId} | Perfil=${userRole}]\n${message}`;
    const { answer, toolsConsulted, missingDataFlags } = await this.runAgentLoop(
      prompt,
      historyContents,
    );

    const updatedTurns: StoredTurn[] = [
      ...storedTurns,
      { role: 'user' as const, text: prompt },
      { role: 'model' as const, text: answer },
    ].slice(-12);

    this.sessions.set(sessionKey, { turns: updatedTurns, updatedAt: Date.now() });

    return {
      session_id: sid,
      line_id: lineId,
      answer_markdown: answer,
      tools_consulted: toolsConsulted,
      missing_data_flags: missingDataFlags,
    };
  }

  async diagnoseAlarm(
    lineId: string,
    alarmCode: number,
    description?: string | null,
  ): Promise<AlarmDiagnoseResponse> {
    const prompt =
      `A célula ${lineId} registrou o alarme alarme_ativo_cod=${alarmCode} ` +
      `(descrição CLP: '${description || 'não informada'}'). ` +
      'Consulte o snapshot em tempo real e a janela de telemetria dos últimos 90 segundos antes da falha. ' +
      'Entregue: (1) Causas raízes mais prováveis em ordem de probabilidade, ' +
      '(2) Passos objetivos e seguros de verificação física para o técnico, ' +
      '(3) Quais dados faltam no catálogo ou sensores caso o diagnóstico não feche 100%.';

    const { answer, toolsConsulted, missingDataFlags } = await this.runAgentLoop(prompt);
    return {
      line_id: lineId,
      alarm_code: alarmCode,
      diagnosis_markdown: answer,
      tools_consulted: toolsConsulted,
      missing_data_flags: missingDataFlags,
    };
  }

  async classifyDowntimeOneClick(
    lineId: string,
    downtimeId: number,
  ): Promise<OneClickStopClassification> {
    const ctx = this.toolsImpl.get_downtime_classification_context(lineId, downtimeId);
    if (!ctx.found) {
      return {
        downtime_id: downtimeId,
        suggested_reason_code_id: null,
        suggested_reason_label: 'Dados da parada não encontrados',
        confidence: 'BAIXA',
        evidence_summary: 'Evento de parada não localizado para esta linha.',
        missing_variables: Array.isArray(ctx.missing) ? (ctx.missing as string[]) : [],
      };
    }

    const ai = this.createClient();
    const prompt =
      'Analise o JSON abaixo contendo o evento de parada, os sensores dos 60s anteriores e a lista ' +
      'oficial de reason_codes_disponiveis. Escolha o reason_code_id mais provável para o operador confirmar com 1 clique.\n\n' +
      JSON.stringify(ctx);

    const response = await ai.models.generateContent({
      model: this.getModelName(),
      contents: prompt,
      config: {
        systemInstruction: NEXPULSE_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            downtime_id: { type: Type.INTEGER },
            suggested_reason_code_id: {
              type: Type.INTEGER,
              nullable: true,
              description: 'ID oficial na tabela reason_codes; null se não houver correspondência clara.',
            },
            suggested_reason_label: { type: Type.STRING },
            confidence: { type: Type.STRING, enum: ['ALTA', 'MEDIA', 'BAIXA'] },
            evidence_summary: {
              type: Type.STRING,
              description: 'Resumo técnico curto baseado nos sensores pré-parada.',
            },
            missing_variables: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: [
            'downtime_id',
            'suggested_reason_label',
            'confidence',
            'evidence_summary',
            'missing_variables',
          ],
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as OneClickStopClassification;
    return {
      downtime_id: downtimeId,
      suggested_reason_code_id:
        typeof parsed.suggested_reason_code_id === 'number'
          ? parsed.suggested_reason_code_id
          : null,
      suggested_reason_label: parsed.suggested_reason_label || 'Motivo não determinado',
      confidence:
        parsed.confidence === 'ALTA' || parsed.confidence === 'MEDIA' || parsed.confidence === 'BAIXA'
          ? parsed.confidence
          : 'MEDIA',
      evidence_summary: applyOtSafetyGuardrail(parsed.evidence_summary || '').text,
      missing_variables: Array.isArray(parsed.missing_variables) ? parsed.missing_variables : [],
    };
  }

  async runPredictiveCheck(lineId: string, hours = 4): Promise<PredictiveHealthReport> {
    const healthCtx = this.toolsImpl.get_predictive_cycle_health(lineId, hours);
    if (!healthCtx.found) {
      return {
        line_id: lineId,
        risk_level: 'NORMAL',
        cycle_drift_detected: false,
        microstop_spike_detected: false,
        summary: 'Amostras insuficientes em produção para análise preditiva confiável.',
        recommended_inspections: [],
        missing_variables: Array.isArray(healthCtx.missing) ? (healthCtx.missing as string[]) : [],
      };
    }

    const ai = this.createClient();
    const prompt =
      `Avalie os indicadores preditivos das últimas ${hours}h para a linha ${lineId} e retorne o relatório estruturado:\n\n` +
      JSON.stringify(healthCtx);

    const response = await ai.models.generateContent({
      model: this.getModelName(),
      contents: prompt,
      config: {
        systemInstruction: NEXPULSE_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            line_id: { type: Type.STRING },
            risk_level: { type: Type.STRING, enum: ['NORMAL', 'ATENCAO', 'CRITICO'] },
            cycle_drift_detected: { type: Type.BOOLEAN },
            microstop_spike_detected: { type: Type.BOOLEAN },
            summary: { type: Type.STRING },
            recommended_inspections: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            missing_variables: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: [
            'line_id',
            'risk_level',
            'cycle_drift_detected',
            'microstop_spike_detected',
            'summary',
            'recommended_inspections',
            'missing_variables',
          ],
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as PredictiveHealthReport;
    return {
      line_id: lineId,
      risk_level:
        parsed.risk_level === 'ATENCAO' || parsed.risk_level === 'CRITICO'
          ? parsed.risk_level
          : 'NORMAL',
      cycle_drift_detected: Boolean(parsed.cycle_drift_detected),
      microstop_spike_detected: Boolean(parsed.microstop_spike_detected),
      summary: applyOtSafetyGuardrail(parsed.summary || '').text,
      recommended_inspections: Array.isArray(parsed.recommended_inspections)
        ? parsed.recommended_inspections
        : [],
      missing_variables: Array.isArray(parsed.missing_variables) ? parsed.missing_variables : [],
    };
  }
}
