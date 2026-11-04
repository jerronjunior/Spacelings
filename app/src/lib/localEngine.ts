/**
 * Onboard (offline) Crew Context Engine — a compact TypeScript port of the backend's
 * rule set (backend/app/engine/crew_context.py) so astronauts still get basic analysis
 * during a communication loss. Same idea: personal baseline (median + MAD), robust
 * z-scores, sustained-change rule, stale data is never treated as abnormal.
 * When the link returns, the ground engine re-runs on the synchronized data.
 */
import { MEASUREMENTS, MEASUREMENT_ORDER } from './measurements';
import { parseUtc } from './format';
import type { Alert, Evidence, MeasurementType, Reading } from './types';

type IndCfg = { direction: 'up' | 'down'; recent_hours?: number; recent_days?: number; min_recent_points: number; sustained_fraction: number; scale_floor: number; stale_after_hours: number };

export const DEFAULT_CONFIG = {
  baseline: { lookback_days: 21, exclude_recent_hours: 24, min_points_continuous: 48, min_points_daily: 5 },
  robust_z_threshold: 2.5,
  indicators: {
    heart_rate: { direction: 'up', recent_hours: 24, min_recent_points: 12, sustained_fraction: 0.6, scale_floor: 2.0, stale_after_hours: 6 },
    spo2: { direction: 'down', recent_hours: 24, min_recent_points: 6, sustained_fraction: 0.6, scale_floor: 0.5, stale_after_hours: 6 },
    body_temperature: { direction: 'up', recent_hours: 24, min_recent_points: 6, sustained_fraction: 0.6, scale_floor: 0.1, stale_after_hours: 6 },
    sleep_duration: { direction: 'down', recent_days: 2, min_recent_points: 2, sustained_fraction: 1.0, scale_floor: 0.25, stale_after_hours: 40 },
    fatigue_score: { direction: 'up', recent_days: 2, min_recent_points: 2, sustained_fraction: 1.0, scale_floor: 0.5, stale_after_hours: 40 },
  } as Record<MeasurementType, IndCfg>,
};

const PHRASE: Record<MeasurementType, string> = {
  heart_rate: 'heart-rate readings are above the personal baseline',
  spo2: 'blood-oxygen readings are below the personal baseline',
  body_temperature: 'body-temperature readings are above the personal baseline',
  sleep_duration: 'sleep duration has decreased',
  fatigue_score: 'fatigue has increased',
};
const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five'];

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface LocalResult {
  indicator: MeasurementType;
  status: 'changed' | 'within_baseline' | 'stale' | 'no_data' | 'insufficient';
  message: string;
  evidence?: Evidence;
}

export function analyseLocal(readings: Reading[], cfg = DEFAULT_CONFIG, asOf = new Date()) {
  const zt = cfg.robust_z_threshold;
  const now = asOf.getTime();
  const H = 3600_000;
  const results: LocalResult[] = MEASUREMENT_ORDER.map((ind) => {
    const c = cfg.indicators[ind];
    const meta = MEASUREMENTS[ind];
    const d = readings
      .filter((r) => r.type === ind && r.quality !== 'uncertain' && !r.aggregated)
      .map((r) => ({ t: parseUtc(r.timestamp).getTime(), v: r.value, s: r.source_type, at: r.timestamp }))
      .filter((r) => r.t <= now)
      .sort((a, b) => a.t - b.t);
    if (!d.length) return { indicator: ind, status: 'no_data', message: 'No readings stored on board.' };
    const last = d[d.length - 1];
    const age = (now - last.t) / H;
    if (age > c.stale_after_hours)
      return { indicator: ind, status: 'stale', message: `Latest reading is ${age.toFixed(0)} h old — not analysed.` };
    const lookStart = now - cfg.baseline.lookback_days * 24 * H;
    let recent: typeof d, base: typeof d, minBase: number;
    if (meta.daily) {
      recent = d.slice(-(c.recent_days ?? 2)).filter((r) => r.t >= now - (24 * (c.recent_days ?? 2) + 12) * H);
      const cut = recent.length ? recent[0].t : now;
      base = d.filter((r) => r.t >= lookStart && r.t < cut);
      minBase = cfg.baseline.min_points_daily;
    } else {
      recent = d.filter((r) => r.t > now - (c.recent_hours ?? 24) * H);
      base = d.filter((r) => r.t >= lookStart && r.t < now - cfg.baseline.exclude_recent_hours * H);
      minBase = cfg.baseline.min_points_continuous;
    }
    if (base.length < minBase || recent.length < c.min_recent_points)
      return { indicator: ind, status: 'insufficient', message: 'Not enough stored data for an onboard baseline.' };
    const med = median(base.map((r) => r.v));
    const scale = Math.max(1.4826 * median(base.map((r) => Math.abs(r.v - med))), c.scale_floor);
    const zs = recent.map((r) => (r.v - med) / scale);
    const beyond = zs.filter((z) => (c.direction === 'up' ? z > zt : z < -zt)).length;
    const frac = beyond / recent.length;
    const rmed = median(recent.map((r) => r.v));
    if (frac < c.sustained_fraction) return { indicator: ind, status: 'within_baseline', message: 'Consistent with personal baseline.' };
    const unit = meta.unit === '/10' ? '/10' : ' ' + meta.unit;
    const f = (v: number) => v.toFixed(meta.decimals);
    const side = c.direction === 'up' ? 'above' : 'below';
    const message = meta.daily
      ? `${meta.label}: the last ${recent.length} ${ind === 'sleep_duration' ? 'nights' : 'days'} (${recent.map((r) => f(r.v) + unit).join(', ')}) were ${side} the personal baseline range (${f(med - zt * scale)}–${f(med + zt * scale)}${unit}).`
      : `${meta.label}: ${beyond} of ${recent.length} recent readings (${Math.round(frac * 100)}%) were ${side} the personal baseline range (${f(med - zt * scale)}–${f(med + zt * scale)}${unit}).`;
    return {
      indicator: ind,
      status: 'changed',
      message,
      evidence: {
        indicator: ind, label: meta.label, unit: meta.unit, direction: c.direction, current: last.v, current_at: last.at,
        recent_median: rmed, recent_values: meta.daily ? recent.map((r) => r.v) : null, baseline_median: med,
        baseline_low: med - zt * scale, baseline_high: med + zt * scale, robust_z: (rmed - med) / scale,
        fraction_beyond: frac, window: meta.daily ? `last ${c.recent_days} days` : `last ${c.recent_hours} h`,
        sources: Array.from(new Set(recent.map((r) => r.s))),
      },
    };
  });
  const changed = results.filter((r) => r.status === 'changed');
  return { results, changed };
}

export function buildLocalAlert(astronautId: string, changed: LocalResult[]): Alert | null {
  if (!changed.length) return null;
  const n = changed.length;
  const phrases = changed.map((r) => PHRASE[r.indicator]);
  const joined = n === 1 ? phrases[0] : phrases.slice(0, -1).join(', ') + (n > 2 ? ', and ' : ' and ') + phrases[n - 1];
  const summary = `${WORDS[n] ?? n} unusual change${n > 1 ? 's' : ''} detected: ${joined}. Review the latest measurements and follow the appropriate mission health procedure.`;
  const sources = Array.from(new Set(changed.flatMap((r) => r.evidence!.sources)));
  return {
    id: `onboard-${changed.map((c) => c.indicator).sort().join('+')}`,
    astronaut_id: astronautId,
    created_at: new Date().toISOString(),
    title: n >= 2 ? 'Unusual Health Pattern Detected' : `${MEASUREMENTS[changed[0].indicator].label} Change Detected`,
    severity: n >= 3 ? 'warning' : n === 2 ? 'caution' : 'info',
    indicators: changed.map((c) => c.indicator),
    evidence: changed.map((c) => c.evidence!),
    explanation: [summary, '', ...changed.map((c) => '• ' + c.message), '• Generated ON BOARD while offline. Mission Control will re-check after synchronization.'].join('\n'),
    checklist_id: n >= 2 ? 'CL-MULTI-01' : 'ONBOARD',
    checklist: [
      'Repeat continuous measurements at rest and confirm sensor quality.',
      'Complete a daily check-in with notes on sleep, workload and how you feel.',
      'Review the upcoming timeline for safety-critical tasks.',
      'When communication returns, confirm the alert with mission control per mission protocol.',
    ],
    data_sources: sources,
    status: 'open',
    acknowledged_by: null,
    acknowledged_at: null,
    origin: 'onboard',
    notes: [],
  };
}
