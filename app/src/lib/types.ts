export type Role = 'astronaut' | 'mission_control' | 'admin';
export type SourceType = 'SIMULATED' | 'MANUAL' | 'DEVICE';
export type MeasurementType = 'heart_rate' | 'spo2' | 'body_temperature' | 'sleep_duration' | 'fatigue_score';
export type Severity = 'info' | 'caution' | 'warning';

export interface User {
  id: number;
  email: string;
  display_name: string;
  role: Role;
  astronaut_id: string | null;
}

export interface Mission {
  id: string;
  name: string;
  vehicle: string;
  start_date: string;
  planned_days: number;
  day: number;
  status: string;
}

export interface Reading {
  id: number | null;
  astronaut_id: string;
  timestamp: string;
  type: MeasurementType;
  value: number;
  unit: string;
  source_type: SourceType;
  quality: string;
  scenario?: string | null;
  aggregated?: number;
  pending?: boolean; // waiting in the offline queue
}

export interface Baseline {
  median: number;
  scale: number;
  n: number;
  low: number;
  high: number;
  start: string | null;
  end: string | null;
}

export interface Astronaut {
  id: string;
  callsign: string;
  role_on_mission: string;
  is_fictional: boolean;
  scenario: string | null;
  last_sync_at: string | null;
  comm_status: 'nominal' | 'delayed' | 'loss_of_signal' | 'no_contact';
  mission: Mission;
  open_alerts?: number;
  top_severity?: Severity | null;
  health_status?: 'nominal' | 'review' | 'attention';
  latest?: Partial<Record<MeasurementType, Reading>>;
  baseline?: Partial<Record<MeasurementType, Baseline | null>>;
  indicator_status?: Partial<Record<MeasurementType, string>>;
  counts?: { measurements: number; checkins: number; alerts: number };
}

export interface Evidence {
  indicator: MeasurementType;
  label: string;
  unit: string;
  direction: 'up' | 'down';
  current: number;
  current_at: string;
  recent_median: number;
  recent_values: number[] | null;
  baseline_median: number;
  baseline_low: number;
  baseline_high: number;
  robust_z: number;
  fraction_beyond: number;
  window: string;
  sources: SourceType[];
}

export interface AlertNote {
  id: number;
  author: string;
  text: string;
  created_at: string;
}

export interface Alert {
  id: number | string;
  astronaut_id: string;
  created_at: string;
  title: string;
  severity: Severity;
  indicators: MeasurementType[];
  evidence: Evidence[];
  explanation: string;
  checklist_id: string;
  checklist: string[];
  data_sources: string[];
  status: 'open' | 'acknowledged';
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  origin: 'server' | 'onboard';
  notes: AlertNote[];
}

export interface IndicatorResult {
  indicator: MeasurementType;
  label: string;
  unit: string;
  direction: 'up' | 'down';
  status: 'changed' | 'within_baseline' | 'insufficient_baseline' | 'insufficient_recent' | 'stale' | 'no_data';
  baseline: Baseline | null;
  recent: { median: number; n: number; n_beyond: number; fraction_beyond: number; robust_z: number; window: string; values: number[] | null } | null;
  latest?: { value: number; at: string; source_type: SourceType; age_hours: number };
  sources: SourceType[];
  message: string;
}

export interface Analysis {
  engine: string;
  as_of: string;
  astronaut_id: string;
  indicators: IndicatorResult[];
  changed: MeasurementType[];
  not_analysed: { indicator: MeasurementType; status: string; message: string }[];
  multivariate: { latest_day_is_outlier: boolean; score: number; features: string[]; days_used: number } | null;
  alert: (Omit<Alert, 'id' | 'astronaut_id' | 'created_at' | 'status' | 'acknowledged_by' | 'acknowledged_at' | 'origin' | 'notes'> & { summary: string; checklist_title: string }) | null;
  alert_record?: Alert;
  disclaimer: string;
}

export interface CheckIn {
  id: number | string;
  astronaut_id: string;
  timestamp: string;
  wellbeing: number | null;
  notes: string;
  measured_fields: MeasurementType[];
  values: Partial<Record<MeasurementType, number>>;
  source_type: 'MANUAL';
  created_offline: boolean;
  pending?: boolean;
}

export interface NasaDataset {
  id: string;
  name: string;
  nasa_source: string;
  mission_or_study: string;
  description: string;
  variables: { name: string; unit: string; description: string }[];
  date_start: string | null;
  date_end: string | null;
  source_url: string;
  api_url: string | null;
  retrieval: 'live' | 'cached-snapshot' | 'imported' | 'catalog-only' | 'sample';
  retrieved_at: string | null;
  notice: string;
  observation_count: number;
}

export interface NasaObservation {
  timestamp: string;
  variable: string;
  value: number;
  unit: string;
  series: string;
}
