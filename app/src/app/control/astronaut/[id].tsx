import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { BaselineTable } from '@/components/BaselineTable';
import { CrewDashboard } from '@/components/CrewDashboard';
import { DemoPanel } from '@/components/DemoPanel';
import { HealthCharts } from '@/components/HealthCharts';
import { AlertCard } from '@/components/Health';
import { Button, Card, Empty, Loading, Pill, Row, Screen, Segmented, Txt } from '@/components/ui';
import { request } from '@/lib/api';
import { fmtUtc } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { MEASUREMENTS, fmtValue } from '@/lib/measurements';
import { useSync } from '@/lib/sync';
import { colors, radius, severityColors, space } from '@/lib/theme';
import type { Alert, Astronaut, CheckIn, MeasurementType } from '@/lib/types';

type Tab = 'dashboard' | 'charts' | 'alerts' | 'checkins' | 'timeline';

export default function AstronautDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const aid = String(id);
  const router = useRouter();
  const { syncNow } = useSync();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [busy, setBusy] = useState(false);
  const p = useApi<Astronaut>(`/astronauts/${aid}`, [aid]);
  const alerts = useApi<Alert[]>(`/alerts?astronaut_id=${aid}&limit=200`, [aid]);
  const checkins = useApi<CheckIn[]>(`/checkins/${aid}?limit=100`, [aid]);

  const analyse = async () => {
    setBusy(true);
    try {
      const r = await request('/analysis/analyze', { body: { astronaut_id: aid } });
      await syncNow();
      if (r.alert_record) router.push(`/control/alert/${r.alert_record.id}`);
    } finally { setBusy(false); }
  };

  const timeline = useMemo(() => {
    const ev: { t: string; icon: any; color: string; title: string; text: string }[] = [];
    if (p.data) ev.push({ t: p.data.mission.start_date, icon: 'navigation', color: colors.blue, title: 'Mission start', text: `${p.data.mission.name} · ${p.data.mission.vehicle}` });
    for (const a of alerts.data ?? []) {
      ev.push({ t: a.created_at, icon: 'alert-triangle', color: severityColors[a.severity].fg, title: a.title, text: a.indicators.map((i) => MEASUREMENTS[i].label).join(', ') });
      if (a.acknowledged_at) ev.push({ t: a.acknowledged_at, icon: 'check', color: colors.ok, title: 'Alert acknowledged', text: `by ${a.acknowledged_by}` });
      for (const n of a.notes) ev.push({ t: n.created_at, icon: 'message-square', color: colors.text2, title: `Note · ${n.author}`, text: n.text });
    }
    for (const c of checkins.data ?? []) ev.push({ t: c.timestamp, icon: 'edit-3', color: colors.cyan, title: `Daily check-in${c.created_offline ? ' (created offline)' : ''}`, text: c.measured_fields.map((f) => MEASUREMENTS[f].short).join(', ') || 'no measurements' });
    if (p.data?.last_sync_at) ev.push({ t: p.data.last_sync_at, icon: 'refresh-cw', color: colors.purple, title: 'Last synchronization', text: 'Data received by Mission Control' });
    return ev.sort((a, b) => b.t.localeCompare(a.t));
  }, [p.data, alerts.data, checkins.data]);

  return (
    <Screen maxWidth={1400}>
      <Row style={{ justifyContent: 'space-between' }} wrap gap={space.md}>
        <Button small kind="ghost" icon="arrow-left" title="Crew" onPress={() => router.push('/control/crew')} />
        <Button small icon="cpu" title="Run Crew Context Engine" onPress={analyse} loading={busy} />
      </Row>
      <Segmented value={tab} onChange={setTab} options={[
        { value: 'dashboard', label: 'Dashboard' }, { value: 'charts', label: 'History' }, { value: 'alerts', label: `Alerts (${alerts.data?.length ?? 0})` },
        { value: 'checkins', label: 'Check-ins' }, { value: 'timeline', label: 'Timeline' },
      ]} />
      {tab === 'dashboard' && <>
        <CrewDashboard aid={aid} base="/control" />
        {p.data && <Card style={{ gap: space.md }}><Txt v="label" color={colors.cyan}>Personal baseline</Txt><BaselineTable a={p.data} /></Card>}
        {aid === 'SIM-01' && <DemoPanel base="/control" />}
      </>}
      {tab === 'charts' && (p.data ? <HealthCharts aid={aid} baseline={p.data.baseline} /> : <Loading />)}
      {tab === 'alerts' && ((alerts.data ?? []).length ? alerts.data!.map((a) => <AlertCard key={a.id} alert={a} onPress={() => router.push(`/control/alert/${a.id}`)} />)
        : <Card><Empty icon="shield" title="No alerts for this astronaut" /></Card>)}
      {tab === 'checkins' && ((checkins.data ?? []).length ? checkins.data!.map((c) => (
        <Card key={c.id} style={{ gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }} wrap>
            <Txt v="mono" color={colors.text}>{fmtUtc(c.timestamp)}</Txt>
            <Row gap={6}><Pill text="MANUAL" fg={colors.cyan} bg={colors.cyanSoft} dot />{c.created_offline && <Pill text="created offline" fg={colors.purple} bg={colors.purpleSoft} />}</Row>
          </Row>
          <Row wrap gap={space.lg}>
            {(Object.keys(c.values) as MeasurementType[]).map((k) => <Txt key={k} v="small">{MEASUREMENTS[k].short} <Txt v="mono" color={colors.text}>{fmtValue(k, c.values[k]!)} {MEASUREMENTS[k].unit}</Txt></Txt>)}
            {c.wellbeing ? <Txt v="small">Wellbeing <Txt v="mono" color={colors.text}>{c.wellbeing}/5</Txt></Txt> : null}
            <Txt v="small" color={colors.text3}>Not measured: {(Object.keys(MEASUREMENTS) as MeasurementType[]).filter((k) => !c.measured_fields.includes(k)).map((k) => MEASUREMENTS[k].short).join(', ') || '—'}</Txt>
          </Row>
          {c.notes ? <Txt v="small" color={colors.text}>“{c.notes}”</Txt> : null}
        </Card>
      )) : <Card><Empty icon="edit-3" title="No check-ins yet" text="Check-ins submitted in the astronaut app appear here after synchronization." /></Card>)}
      {tab === 'timeline' && (
        <Card style={{ gap: 0 }}>
          <Txt v="label" color={colors.cyan} style={{ marginBottom: space.md }}>Mission timeline</Txt>
          {timeline.map((e, i) => (
            <Row key={i} gap={space.md} style={{ alignItems: 'flex-start' }}>
              <View style={{ alignItems: 'center', width: 28 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: e.color + '22', alignItems: 'center', justifyContent: 'center' }}><Feather name={e.icon} size={13} color={e.color} /></View>
                {i < timeline.length - 1 && <View style={{ width: 1, flex: 1, minHeight: 22, backgroundColor: colors.border }} />}
              </View>
              <View style={{ flex: 1, paddingBottom: space.md, gap: 2 }}>
                <Txt v="body" style={{ fontFamily: 'Inter_600SemiBold' }}>{e.title}</Txt>
                <Txt v="small">{e.text}</Txt>
                <Txt v="mono" style={{ fontSize: 11 }}>{fmtUtc(e.t)}</Txt>
              </View>
            </Row>
          ))}
        </Card>
      )}
      <View style={{ height: radius.sm }} />
    </Screen>
  );
}
