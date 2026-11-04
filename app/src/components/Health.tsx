import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { fmtUtc, parseUtc, timeAgo } from '@/lib/format';
import { MEASUREMENTS, fmtValue } from '@/lib/measurements';
import { analyseLocal, buildLocalAlert } from '@/lib/localEngine';
import { useApi } from '@/lib/hooks';
import { QueueItem, useSync } from '@/lib/sync';
import { colors, fonts, radius, severityColors, sourceColors, space } from '@/lib/theme';
import type { Alert, Baseline, MeasurementType, Reading } from '@/lib/types';
import { Sparkline } from './Charts';
import { Button, Card, Divider, Pill, Row, SeverityBadge, SourceBadge, Txt } from './ui';

/** Queued (not yet synchronized) check-in values shown as pending MANUAL readings. */
export function pendingReadings(queue: QueueItem[], aid: string | null | undefined): Reading[] {
  if (!aid) return [];
  const out: Reading[] = [];
  for (const q of queue) {
    if (q.astronaut_id !== aid) continue;
    if (q.kind === 'checkin') {
      for (const k of Object.keys(MEASUREMENTS) as MeasurementType[]) {
        const v = q.payload[k];
        if (v === null || v === undefined) continue;
        out.push({ id: null, astronaut_id: aid, timestamp: q.payload.timestamp, type: k, value: v, unit: MEASUREMENTS[k].unit, source_type: 'MANUAL', quality: 'good', pending: true });
      }
    } else if (q.kind === 'reading') {
      out.push({ ...q.payload, id: null, pending: true });
    }
  }
  return out;
}

// ---------------------------------------------------------------- metric card
export function MetricCard({ type, reading, baseline, spark, status }: {
  type: MeasurementType; reading?: Reading | null; baseline?: Baseline | null; spark?: number[]; status?: string;
}) {
  const m = MEASUREMENTS[type];
  const v = reading?.value;
  const changed = status === 'changed';
  const stale = status === 'stale';
  let delta: string | null = null;
  if (v !== undefined && baseline) {
    const d = v - baseline.median;
    const inRange = v >= baseline.low && v <= baseline.high;
    delta = `${d >= 0 ? '+' : ''}${d.toFixed(m.decimals || (Math.abs(d) < 1 ? 1 : 0))} vs baseline ${fmtValue(type, baseline.median)}${inRange ? '' : ' · outside range'}`;
  }
  return (
    <Card glow={changed} style={{ gap: 10, minHeight: 156 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={8}>
          <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: changed ? colors.warningSoft : colors.cyanSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name={m.icon as any} size={15} color={changed ? colors.warning : colors.cyan} />
          </View>
          <Txt v="label" numberOfLines={1}>{m.label}</Txt>
        </Row>
      </Row>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Row gap={6} style={{ alignItems: 'flex-end' }}>
          <Txt v="metric" color={v === undefined ? colors.text3 : colors.text}>{fmtValue(type, v)}</Txt>
          <Txt v="mono" style={{ marginBottom: 6 }}>{m.unit}</Txt>
        </Row>
        {spark && spark.length > 1 ? <Sparkline values={spark} color={changed ? colors.warning : colors.cyan} /> : null}
      </Row>
      <View style={{ gap: 2 }}>
        <Txt v="small" color={changed ? colors.warning : colors.text2}>
          {v === undefined ? 'Not measured' : stale ? 'Stale — not analysed' : changed ? 'Pattern flagged: sustained change' : delta ?? 'Baseline building'}
        </Txt>
        {reading ? (
          <Row gap={6} wrap>
            <SourceBadge source={reading.source_type} />
            <Txt v="small" color={colors.text3}>{reading.pending ? 'Queued · ' : ''}{timeAgo(reading.timestamp)} · {fmtUtc(reading.timestamp, false)}</Txt>
          </Row>
        ) : null}
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------- alerts
export function AlertCard({ alert, onPress, showAstronaut }: { alert: Alert; onPress: () => void; showAstronaut?: boolean }) {
  const sc = severityColors[alert.severity];
  const summary = alert.explanation.split('\n')[0];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open alert ${alert.title}`}
      style={({ hovered }: any) => [{ borderRadius: radius.lg }, hovered && { transform: [{ translateY: -1 }] }]}>
      <Card style={{ gap: 10, borderLeftWidth: 3, borderLeftColor: alert.status === 'open' ? sc.fg : colors.border }}>
        <Row style={{ justifyContent: 'space-between' }} wrap>
          <Row gap={8} wrap>
            <SeverityBadge severity={alert.severity} />
            {alert.origin === 'onboard' && <Pill text="onboard · offline" fg={colors.purple} bg={colors.purpleSoft} icon="cpu" />}
            {alert.status === 'acknowledged' && <Pill text="acknowledged" fg={colors.ok} bg={colors.okSoft} icon="check" />}
            {showAstronaut && <Pill text={alert.astronaut_id} fg={colors.text} />}
          </Row>
          <Txt v="mono">{fmtUtc(alert.created_at)}</Txt>
        </Row>
        <Txt v="h3">{alert.title}</Txt>
        <Txt v="small" numberOfLines={3}>{summary}</Txt>
        <Row wrap gap={6}>
          {alert.indicators.map((i) => <Pill key={i} text={MEASUREMENTS[i].label} fg={colors.text2} />)}
        </Row>
      </Card>
    </Pressable>
  );
}

export function EvidenceTable({ alert }: { alert: Alert }) {
  return (
    <View style={{ gap: 10 }}>
      {alert.evidence.map((e) => {
        const m = MEASUREMENTS[e.indicator];
        const u = m.unit;
        const range = Math.max(1e-6, e.baseline_high - e.baseline_low);
        const pos = (v: number) => Math.min(1, Math.max(0, (v - (e.baseline_low - range * 0.6)) / (range * 2.2)));
        return (
          <View key={e.indicator} style={{ gap: 8, padding: space.md, borderRadius: radius.md, backgroundColor: 'rgba(6,11,24,0.45)', borderWidth: 1, borderColor: colors.border }}>
            <Row style={{ justifyContent: 'space-between' }} wrap>
              <Row gap={8}><Feather name={m.icon as any} size={14} color={colors.warning} /><Txt v="h3">{m.label}</Txt></Row>
              <Row gap={6}>{e.sources.map((s) => <SourceBadge key={s} source={s} />)}</Row>
            </Row>
            <Row wrap gap={space.xl}>
              <Stat label="Current" value={`${fmtValue(e.indicator, e.current)} ${u}`} color={colors.warning} />
              <Stat label={`Recent median (${e.window})`} value={`${fmtValue(e.indicator, e.recent_median)} ${u}`} />
              <Stat label="Personal baseline" value={`${fmtValue(e.indicator, e.baseline_median)} ${u}`} color={colors.cyan} />
              <Stat label="Baseline range" value={`${fmtValue(e.indicator, e.baseline_low)}–${fmtValue(e.indicator, e.baseline_high)}`} />
              <Stat label="Robust z" value={e.robust_z.toFixed(1)} />
            </Row>
            {/* range bar: baseline band vs recent median */}
            <View style={{ height: 14, justifyContent: 'center' }} accessibilityLabel="Baseline comparison bar">
              <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(148,163,184,0.15)' }} />
              <View style={{ position: 'absolute', height: 8, borderRadius: 4, backgroundColor: colors.cyan + '55', left: `${pos(e.baseline_low) * 100}%`, width: `${(pos(e.baseline_high) - pos(e.baseline_low)) * 100}%` }} />
              <View style={{ position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.warning, backgroundColor: colors.bg, left: `${pos(e.recent_median) * 100}%`, marginLeft: -6 }} />
            </View>
            <Txt v="small" color={colors.text3}>{Math.round(e.fraction_beyond * 100)}% of readings in the {e.window} were {e.direction === 'up' ? 'above' : 'below'} the baseline range{e.recent_values ? ` · values: ${e.recent_values.map((v) => fmtValue(e.indicator, v)).join(', ')} ${u}` : ''}</Txt>
          </View>
        );
      })}
    </View>
  );
}

function Stat({ label, value, color = colors.text }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Txt v="label" style={{ fontSize: 9.5 }}>{label}</Txt>
      <Txt v="mono" color={color} style={{ fontFamily: fonts.monoMedium, fontSize: 15 }}>{value}</Txt>
    </View>
  );
}

export function Checklist({ steps, title, id }: { steps: string[]; title?: string; id: string }) {
  const [done, setDone] = useState<Record<number, boolean>>({});
  const n = Object.values(done).filter(Boolean).length;
  return (
    <View style={{ gap: 8 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="label">{title ?? 'Suggested checklist'} · {id}</Txt>
        <Txt v="mono">{n}/{steps.length}</Txt>
      </Row>
      {steps.map((st, i) => (
        <Pressable key={i} onPress={() => setDone((d) => ({ ...d, [i]: !d[i] }))} accessibilityRole="checkbox" accessibilityState={{ checked: !!done[i] }}
          style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 }}>
          <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: done[i] ? colors.ok : colors.text3, backgroundColor: done[i] ? colors.okSoft : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
            {done[i] && <Feather name="check" size={13} color={colors.ok} />}
          </View>
          <Txt v="body" style={{ flex: 1, textDecorationLine: done[i] ? 'line-through' : 'none' }} color={done[i] ? colors.text3 : colors.text}>{st}</Txt>
        </Pressable>
      ))}
    </View>
  );
}

export function AlertDetail({ alert, onAck, acking, footer }: { alert: Alert; onAck: () => void; acking?: boolean; footer?: React.ReactNode }) {
  const [summary, ...rest] = alert.explanation.split('\n').filter((l) => l.trim());
  return (
    <View style={{ gap: space.lg }}>
      <Card style={{ gap: space.md }} glow={alert.status === 'open' && alert.severity === 'warning'}>
        <Row wrap gap={8}>
          <SeverityBadge severity={alert.severity} />
          {alert.origin === 'onboard' && <Pill text="onboard · offline analysis" fg={colors.purple} bg={colors.purpleSoft} icon="cpu" />}
          {alert.data_sources.map((s) => <SourceBadge key={s} source={s} />)}
          <Pill text={alert.astronaut_id} fg={colors.text} />
        </Row>
        <Txt v="h1" style={{ fontSize: 24 }}>{alert.title}</Txt>
        <Txt v="mono">Generated {fmtUtc(alert.created_at)} · Crew Context Engine</Txt>
        <Divider />
        <Txt v="label" color={colors.cyan}>Why this alert was generated</Txt>
        <Txt v="body" style={{ fontFamily: fonts.bodyMedium }}>{summary}</Txt>
        <View style={{ gap: 6 }}>{rest.map((l, i) => <Txt key={i} v="small" color={colors.text2}>{l}</Txt>)}</View>
        <Txt v="small" color={colors.text3}>Compares readings with this astronaut's own baseline. This is not a diagnosis.</Txt>
      </Card>
      <Card style={{ gap: space.md }}>
        <Txt v="label" color={colors.cyan}>Evidence · current vs personal baseline</Txt>
        <EvidenceTable alert={alert} />
      </Card>
      <Card style={{ gap: space.md }}>
        <Checklist steps={alert.checklist} id={alert.checklist_id} />
        <Divider />
        {alert.status === 'acknowledged' ? (
          <Row gap={8}><Feather name="check-circle" size={16} color={colors.ok} /><Txt v="small" color={colors.ok}>Acknowledged by {alert.acknowledged_by} · {fmtUtc(alert.acknowledged_at)}</Txt></Row>
        ) : (
          <Button title="Acknowledge alert" icon="check" onPress={onAck} loading={acking} style={{ alignSelf: 'flex-start' }} />
        )}
      </Card>
      {footer}
    </View>
  );
}

// ---------------------------------------------------------------- onboard engine
/** Runs the local engine while OFFLINE so the astronaut still gets basic alerts on board. */
export function useOnboardEngine(aid: string | null | undefined) {
  const { status, queue, saveLocalAlert, localAlerts } = useSync();
  const cache = useApi<{ series: Record<string, Reading[]> }>(aid ? `/readings/history?astronaut_id=${aid}&hours=600&max_points=5000` : null);
  const pending = useMemo(() => pendingReadings(queue, aid), [queue, aid]);
  const result = useMemo(() => {
    if (!cache.data) return null;
    const all = [...Object.values(cache.data.series).flat(), ...pending];
    return analyseLocal(all);
  }, [cache.data, pending]);
  useEffect(() => {
    if (status !== 'OFFLINE' || !aid || !result?.changed.length) return;
    const a = buildLocalAlert(aid, result.changed);
    if (!a) return;
    const prev = localAlerts.find((x) => x.id === a.id);
    if (!prev || prev.status === 'acknowledged' && parseUtc(prev.created_at).getTime() < Date.now() - 6 * 3600_000) saveLocalAlert(a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, aid, result]);
  return { result, cachedAt: cache.cachedAt, fromCache: cache.fromCache };
}

export { sourceColors };
