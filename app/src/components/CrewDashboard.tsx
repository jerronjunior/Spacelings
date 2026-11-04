import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { fmtUtc, timeAgo } from '@/lib/format';
import { useApi, useLayout } from '@/lib/hooks';
import { MEASUREMENTS, MEASUREMENT_ORDER, fmtValue } from '@/lib/measurements';
import { useSync } from '@/lib/sync';
import { colors, radius, space } from '@/lib/theme';
import type { Alert, Analysis, Astronaut, CheckIn, MeasurementType, Reading } from '@/lib/types';
import { ChartLegend, TrendChart } from './Charts';
import { AlertCard, MetricCard, pendingReadings } from './Health';
import { Button, Card, Empty, Grid, KeyValue, Loading, Notice, PageTitle, Pill, Row, SectionHeader, Segmented, SourceBadge, Txt } from './ui';

const WELLBEING = ['', 'Very poor', 'Poor', 'Okay', 'Good', 'Very good'];
const statusText: Record<string, string> = {
  changed: 'Changed', within_baseline: 'Within baseline', stale: 'Stale data', no_data: 'No data',
  insufficient_baseline: 'Building baseline', insufficient_recent: 'Few recent readings',
};

/** Health dashboard for one astronaut. Used by the astronaut app and by Mission Control's detail view. */
export function CrewDashboard({ aid, base, header = true, extra }: { aid: string; base: string; header?: boolean; extra?: React.ReactNode }) {
  const router = useRouter();
  const { isDesktop } = useLayout();
  const { queue, localAlerts, status } = useSync();
  const profile = useApi<Astronaut>(`/astronauts/${aid}`);
  const analysis = useApi<Analysis>(`/analysis/${aid}`);
  const hist = useApi<{ series: Record<string, Reading[]> }>(`/readings/history?astronaut_id=${aid}&hours=168&max_points=168`);
  const alerts = useApi<Alert[]>(`/alerts?astronaut_id=${aid}&limit=5`);
  const checkins = useApi<CheckIn[]>(`/checkins/${aid}?limit=1`);
  const [chartType, setChartType] = useState<MeasurementType>('heart_rate');
  const pending = useMemo(() => pendingReadings(queue, aid), [queue, aid]);

  const latest = useMemo(() => {
    const l: Partial<Record<MeasurementType, Reading>> = { ...(profile.data?.latest ?? {}) };
    for (const p of pending) if (!l[p.type] || p.timestamp > l[p.type]!.timestamp) l[p.type] = p;
    return l;
  }, [profile.data, pending]);

  if (profile.loading && !profile.data) return <Loading />;
  if (!profile.data) return <Notice tone="warning" text={profile.error ?? 'Astronaut not found'} />;
  const a = profile.data;
  const ind = analysis.data?.indicators ?? [];
  const changed = ind.filter((i) => i.status === 'changed');
  const lastAt = Object.values(latest).map((r) => r!.timestamp).sort().pop();
  const lastSrc = lastAt ? Object.values(latest).find((r) => r!.timestamp === lastAt)?.source_type : null;
  const openLocal = aid === a.id ? localAlerts.filter((x) => x.astronaut_id === aid) : [];
  const allAlerts = [...openLocal, ...(alerts.data ?? [])].slice(0, 3);
  const spark = (t: MeasurementType) => (hist.data?.series[t] ?? []).slice(-36).map((r) => r.value);
  const ci = checkins.data?.[0];
  const dayPct = Math.min(1, a.mission.day / a.mission.planned_days);

  const summary = (
    <Card glow={changed.length > 0} style={{ gap: space.md, flex: 1 }}>
      <Row style={{ justifyContent: 'space-between' }} wrap>
        <Txt v="label" color={colors.cyan}>Daily wellbeing summary</Txt>
        <Txt v="mono">{analysis.data ? `analysed ${fmtUtc(analysis.data.as_of, false)}` : ''}</Txt>
      </Row>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: changed.length ? colors.warningSoft : colors.okSoft }}>
          <Feather name={changed.length ? 'alert-triangle' : 'check-circle'} size={20} color={changed.length ? colors.warning : colors.ok} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt v="h2">{changed.length ? `${changed.length} indicator${changed.length > 1 ? 's' : ''} changed vs personal baseline` : 'All analysed indicators within your personal baseline'}</Txt>
          <Txt v="small">
            {changed.length ? changed.map((c) => c.label).join(' · ') + ' — review the alert and checklist.' : 'Keep logging check-ins so the baseline stays accurate.'}
            {analysis.data?.not_analysed.length ? `  Not analysed: ${analysis.data.not_analysed.map((n) => MEASUREMENTS[n.indicator].label + ' (' + statusText[n.status] + ')').join(', ')}.` : ''}
          </Txt>
        </View>
      </Row>
      <Row wrap gap={6}>
        {ind.map((i) => (
          <Pill key={i.indicator} text={`${MEASUREMENTS[i.indicator].short}: ${statusText[i.status]}`}
            fg={i.status === 'changed' ? colors.warning : i.status === 'within_baseline' ? colors.ok : colors.text2}
            bg={i.status === 'changed' ? colors.warningSoft : i.status === 'within_baseline' ? colors.okSoft : 'rgba(148,163,184,0.12)'} dot />
        ))}
      </Row>
      <Row wrap gap={space.lg}>
        <Txt v="small">Latest check-in: <Txt v="small" color={colors.text}>{ci ? `${ci.wellbeing ? WELLBEING[ci.wellbeing] : 'wellbeing not rated'} · ${timeAgo(ci.timestamp)}` : 'none yet'}</Txt></Txt>
        {analysis.data?.multivariate && <Txt v="small">Multivariate check (Isolation Forest): <Txt v="small" color={analysis.data.multivariate.latest_day_is_outlier ? colors.caution : colors.text}>{analysis.data.multivariate.latest_day_is_outlier ? 'latest day unusual' : 'latest day typical'}</Txt></Txt>}
      </Row>
      {changed.length > 0 && allAlerts[0] && <Button title="Open alert explanation" icon="arrow-right" kind="subtle" style={{ alignSelf: 'flex-start' }}
        onPress={() => router.push(`${base}/alert/${allAlerts[0].id}` as any)} />}
    </Card>
  );

  const mission = (
    <Card style={{ gap: 4, width: isDesktop ? 340 : undefined }}>
      <Txt v="label" color={colors.cyan}>Mission</Txt>
      <Txt v="h3" style={{ marginTop: 4 }}>{a.mission.name}</Txt>
      <Txt v="small">{a.mission.vehicle}</Txt>
      <View style={{ marginVertical: 10, gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}><Txt v="mono" color={colors.text}>Day {a.mission.day}</Txt><Txt v="mono">of {a.mission.planned_days}</Txt></Row>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(148,163,184,0.15)' }}>
          <View style={{ width: `${dayPct * 100}%`, height: 6, borderRadius: 3, backgroundColor: colors.cyan }} />
        </View>
      </View>
      <KeyValue k="Mission ID" v={a.mission.id} mono />
      <KeyValue k="Ground link" v={status === 'OFFLINE' ? 'Offline · on-board mode' : 'Connected'} />
      <KeyValue k="Last measurement" v={lastAt ? timeAgo(lastAt) : '—'} />
      <KeyValue k="Data source" v={lastSrc ? <SourceBadge source={lastSrc} /> : '—'} />
    </Card>
  );

  return (
    <View style={{ gap: space.lg }}>
      {header && (
        <PageTitle eyebrow={`Mission day ${a.mission.day} · ${a.mission.id}`} title={`${a.callsign} · ${a.id}`}
          subtitle={`${a.role_on_mission}${a.is_fictional ? ' · fictional demo astronaut' : ''} · last measurement ${lastAt ? timeAgo(lastAt) : '—'}`}
          right={<Button small kind="ghost" icon="edit-3" title="Daily check-in" onPress={() => router.push(`${base}/checkin` as any)} />} />
      )}
      {(profile.fromCache || analysis.fromCache) && <Notice tone="caution" icon="wifi-off" text={`No ground link. Showing data stored on board (cached ${fmtUtc(profile.cachedAt)}). New check-ins are saved locally and synchronized automatically.`} />}
      {extra}
      <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: space.md }}>{summary}{mission}</View>
      <Grid min={200}>
        {MEASUREMENT_ORDER.map((t) => (
          <MetricCard key={t} type={t} reading={latest[t]} baseline={a.baseline?.[t]} spark={MEASUREMENTS[t].daily ? undefined : spark(t)}
            status={ind.find((i) => i.indicator === t)?.status} />
        ))}
      </Grid>
      <Card style={{ gap: space.md }}>
        <SectionHeader title="7-day trend vs personal baseline" subtitle="Shaded band = personal baseline range (robust median ± 2.5 spread). Dashed line = baseline median."
          right={<Segmented value={chartType} onChange={setChartType} options={MEASUREMENT_ORDER.map((t) => ({ value: t, label: MEASUREMENTS[t].short }))} />} />
        <TrendChart type={chartType} readings={[...(hist.data?.series[chartType] ?? []), ...pending.filter((p) => p.type === chartType)]} baseline={a.baseline?.[chartType]} height={240} />
        <ChartLegend />
        {a.baseline?.[chartType] && (
          <Txt v="small" color={colors.text3}>
            Baseline for {MEASUREMENTS[chartType].label.toLowerCase()}: {fmtValue(chartType, a.baseline[chartType]!.median)} {MEASUREMENTS[chartType].unit} from {a.baseline[chartType]!.n} readings ({fmtUtc(a.baseline[chartType]!.start)} → {fmtUtc(a.baseline[chartType]!.end)}).
          </Txt>
        )}
      </Card>
      <View style={{ gap: space.md }}>
        <SectionHeader title="Latest alerts" right={<Button small kind="ghost" title="Alert centre" icon="bell" onPress={() => router.push(`${base}/alerts` as any)} />} />
        {allAlerts.length ? allAlerts.map((al) => <AlertCard key={al.id} alert={al} onPress={() => router.push(`${base}/alert/${al.id}` as any)} />)
          : <Card><Empty icon="shield" title="No alerts" text="The Crew Context Engine has not found sustained changes from the personal baseline." /></Card>}
      </View>
    </View>
  );
}

export const cardRadius = radius.lg;
