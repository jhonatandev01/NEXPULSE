export type UserRole = 'operador' | 'manutencao' | 'supervisor';

export interface TelemetrySample {
  timeIso: string;
  lineId: string;
  machineState: number; // 0..5
  robotStatus: number; // 0=Idle, 1=Active, 5=Fault
  conveyorInOk: boolean;
  conveyorOutOk: boolean;
  sku: string;
  cycleTimeSec: number;
  ewmaCycleSec: number;
  currentLayer: number;
  boxesInLayer: number;
  alarmCode: number;
}

export interface AgentChatRequest {
  line_id: string;
  session_id?: string | null;
  user_role: UserRole;
  message: string;
}

export interface AgentChatResponse {
  session_id: string;
  line_id: string;
  answer_markdown: string;
  tools_consulted: string[];
  missing_data_flags: string[];
}

export interface AlarmDiagnoseRequest {
  line_id: string;
  alarme_ativo_cod: number;
  alarm_description?: string | null;
}

export interface AlarmDiagnoseResponse {
  line_id: string;
  alarm_code: number;
  diagnosis_markdown: string;
  tools_consulted: string[];
  missing_data_flags: string[];
}

export interface OneClickStopClassification {
  downtime_id: number;
  suggested_reason_code_id: number | null;
  suggested_reason_label: string;
  confidence: 'ALTA' | 'MEDIA' | 'BAIXA';
  evidence_summary: string;
  missing_variables: string[];
}

export interface PredictiveHealthReport {
  line_id: string;
  risk_level: 'NORMAL' | 'ATENCAO' | 'CRITICO';
  cycle_drift_detected: boolean;
  microstop_spike_detected: boolean;
  summary: string;
  recommended_inspections: string[];
  missing_variables: string[];
}
