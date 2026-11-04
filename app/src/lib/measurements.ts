import type { MeasurementType } from './types';

export interface MeasurementMeta {
  key: MeasurementType;
  label: string;
  short: string;
  unit: string;
  icon: string; // Feather icon name
  min: number; // input validation bounds (not clinical thresholds)
  max: number;
  decimals: number;
  daily: boolean;
}

export const MEASUREMENTS: Record<MeasurementType, MeasurementMeta> = {
  heart_rate: { key: 'heart_rate', label: 'Heart rate', short: 'HR', unit: 'bpm', icon: 'activity', min: 25, max: 230, decimals: 0, daily: false },
  spo2: { key: 'spo2', label: 'Blood oxygen', short: 'SpO₂', unit: '%', icon: 'wind', min: 50, max: 100, decimals: 0, daily: false },
  body_temperature: { key: 'body_temperature', label: 'Body temperature', short: 'Temp', unit: '°C', icon: 'thermometer', min: 30, max: 43, decimals: 1, daily: false },
  sleep_duration: { key: 'sleep_duration', label: 'Sleep duration', short: 'Sleep', unit: 'h', icon: 'moon', min: 0, max: 16, decimals: 1, daily: true },
  fatigue_score: { key: 'fatigue_score', label: 'Fatigue score', short: 'Fatigue', unit: '/10', icon: 'battery', min: 1, max: 10, decimals: 0, daily: true },
};

export const MEASUREMENT_ORDER: MeasurementType[] = ['heart_rate', 'spo2', 'body_temperature', 'sleep_duration', 'fatigue_score'];

export function fmtValue(type: MeasurementType, v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toFixed(MEASUREMENTS[type].decimals);
}
