import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Bar, CommPill, HealthStatusPill } from '@/components/CrewBits';
import { Button, Card, Empty, Grid, Loading, Notice, PageTitle, Row, Screen, SectionHeader, SeverityBadge, SourceBadge, Txt } from '@/components/ui';
import { request } from '@/lib/api';
import { fmtUtc, timeAgo } from '@/lib/format';
import { useApi, useLayout } from '@/lib/hooks';
import { MEASUREMENTS, fmtValue } from '@/lib/measurements';
import { useSync } from '@/lib/sync';
import { colors, fonts, radius, severityColors, space } from '@/lib/theme';
import type { Astronaut, Mission, Reading } from '@/lib/types';

interface Overview {
  total_astronauts: number; active_missions: number; missions: Mission[]; attention: Astronaut[];
  total_alerts: number; open_alerts: number; alerts_by_severity: Record<string, number>;
  communication: { astronaut_id: string; callsign: string; status: Astronaut['comm_status']; last_sync_at: string }[];
  latest_measurements: Reading[]; crew: Astronaut[]; server_time: string;
}

function Stat({ icon, label, value, sub, tone = colors.cyan }: { icon: any; label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <Card style={{ gap: 10 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="label">{label}</Txt>
        <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: tone + '1F', alignItems: 'center', justifyContent: 'center' }}><Feather name={icon} size={15} color={tone} /></View>
      </Row>
      <Txt v="metric" style={{ fontSize: 34 }}>{value}</Txt>
      {sub ? <Txt v="small">{sub}</Txt> : null}
    </Card>
  );
}

export default function ControlOverview() {
  const router = useRouter();
  const { isDesktop } = useLayout();
  const { syncNow } = useSync();
  const q = useApi<Overview>('/overview');
  const [tool, setTool] = useState<{ busy?: string; msg?: string }>({});

  const exportSim = async (fmt: 'csv' | 'json') => {
    setTool({ busy: fmt });
    try {
      const data = await request<any>(`/simulator/export?fmt=json&days=7&seed=42`);
      if (Platform.OS === 'web') {
        let body: string, type: string;
        if (fmt === 'json') { body = JSON.stringify(data, null, 1); type = 'application/json'; }
        else {
          const cols = Object.keys(data.readings[0]);
          body = `# ${data.disclaimer}\n${cols.join(',')}\n${data.readings.map((x: any) => cols.map((c) => x[c]).join(',')).join('\n')}\n`;
          type = 'text/csv';
        }
        const url = URL.createObjectURL(new Blob([body], { type }));
        const el = document.createElement('a');
        el.href = url; el.download = `spacelings_simulated_seed42.${fmt}`; el.click();
        URL.revokeObjectURL(url);
      }
      setTool({ msg: `${data.readings.length} SIMULATED readings generated (seed 42, 7 days)${Platform.OS === 'web' ? ' and downloaded' : ''}.` });
    } catch (e: any) { setTool({ msg: e.message }); }
  };
  const resetCrew = async () => {
    setTool({ busy: 'reset' });
    try { await request('/demo/reset?scope=crew', { method: 'POST' }); await syncNow(); setTool({ msg: 'All five fictional astronauts regenerated with fresh SIMULATED data and re-analysed.' }); }
    catch (e: any) { setTool({ msg: e.message }); }
  };

  if (!q.data) return <Screen>{q.loading ? <Loading /> : <Notice tone="warning" text={q.error ?? 'Unavailable'} />}</Screen>;
  const o = q.data;
  const maxSev = Math.max(1, ...Object.values(o.alerts_by_severity));

  const right = (
    <View style={{ gap: space.md, width: isDesktop ? 330 : undefined }}>
      <Card style={{ gap: space.md }}>
        <Txt v="label" color={colors.cyan}>Communication status</Txt>
        {o.communication.map((c) => (
          <Row key={c.astronaut_id} style={{ justifyContent: 'space-between' }}>
            <Row gap={8}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.status === 'nominal' ? colors.ok : c.status === 'delayed' ? colors.caution : colors.warning }} />
              <Txt v="mono" color={colors.text}>{c.astronaut_id}</Txt>
              <Txt v="small">{c.callsign}</Txt>
            </Row>
            <Txt v="mono">{timeAgo(c.last_sync_at)}</Txt>
          </Row>
        ))}
      </Card>
      <Card style={{ gap: space.sm }}>
        <Txt v="label" color={colors.cyan}>Latest synchronized measurements</Txt>
        {o.latest_measurements.length ? o.latest_measurements.slice(0, 8).map((m, i) => (
          <Row key={i} style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
            <View>
              <Txt v="small" color={colors.text}>{m.astronaut_id} · {MEASUREMENTS[m.type].short} <Txt v="mono" color={colors.text}>{fmtValue(m.type, m.value)} {MEASUREMENTS[m.type].unit}</Txt></Txt>
              <Txt v="small" color={colors.text3}>{fmtUtc(m.timestamp, false)}</Txt>
            </View>
            <SourceBadge source={m.source_type} />
          </Row>
        )) : <Txt v="small">No measurements in the last hour.</Txt>}
      </Card>
    </View>
  );

  return (
    <Screen maxWidth={1400}>
      <PageTitle eyebrow="Mission Control" title="Mission overview" subtitle={`Ground view of all crews · server time ${fmtUtc(o.server_time)}`}
        right={<Button small kind="ghost" icon="refresh-cw" title="Refresh" onPress={q.reload} />} />
      {q.fromCache && <Notice tone="caution" icon="wifi-off" text={`Server unreachable — showing overview cached ${fmtUtc(q.cachedAt)}.`} />}
      <Grid min={210}>
        <Stat icon="users" label="Total astronauts" value={o.total_astronauts} sub={`${o.crew.filter((c) => c.is_fictional).length} fictional demo crew`} />
        <Stat icon="navigation" label="Active missions" value={o.active_missions} sub={o.missions.map((m) => m.id).join(' · ')} tone={colors.blue} />
        <Stat icon="alert-triangle" label="Need attention" value={o.attention.length} sub="Astronauts with open alerts" tone={colors.warning} />
        <Stat icon="bell" label="Total alerts" value={o.total_alerts} sub={`${o.open_alerts} open`} tone={colors.purple} />
      </Grid>
      <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: space.md, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: space.md, width: '100%' }}>
          <Card style={{ gap: space.md }}>
            <SectionHeader title="Crew requiring attention" right={<Button small kind="ghost" title="All crew" icon="users" onPress={() => router.push('/control/crew')} />} />
            {o.attention.length ? o.attention.map((a) => (
              <Pressable key={a.id} onPress={() => router.push(`/control/astronaut/${a.id}`)} accessibilityRole="button"
                style={({ hovered }: any) => [{ padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 6 }, hovered && { borderColor: colors.borderStrong }]}>
                <Row style={{ justifyContent: 'space-between' }} wrap>
                  <Row gap={10}><Txt v="mono" color={colors.text} style={{ fontFamily: fonts.monoMedium }}>{a.id}</Txt><Txt v="h3">{a.callsign}</Txt><Txt v="small">{a.mission.id}</Txt></Row>
                  <Row gap={6}>{a.top_severity && <SeverityBadge severity={a.top_severity} />}<HealthStatusPill a={a} /></Row>
                </Row>
                <Txt v="small">{a.open_alerts} open alert{a.open_alerts === 1 ? '' : 's'} · last sync {timeAgo(a.last_sync_at)}</Txt>
              </Pressable>
            )) : <Empty icon="check-circle" title="All crew nominal" />}
          </Card>
          <Grid min={300}>
            <Card style={{ gap: space.md }}>
              <Txt v="label" color={colors.cyan}>Open alerts by severity</Txt>
              {(['warning', 'caution', 'info'] as const).map((s) => (
                <Row key={s} gap={space.md}>
                  <View style={{ width: 80 }}><SeverityBadge severity={s} /></View>
                  <Bar value={o.alerts_by_severity[s]} max={maxSev} color={severityColors[s].fg} />
                  <Txt v="mono" color={colors.text} style={{ width: 24, textAlign: 'right' }}>{o.alerts_by_severity[s]}</Txt>
                </Row>
              ))}
            </Card>
            <Card style={{ gap: space.md }}>
              <Txt v="label" color={colors.cyan}>Missions</Txt>
              {o.missions.map((m) => (
                <View key={m.id} style={{ gap: 6 }}>
                  <Row style={{ justifyContent: 'space-between' }}><Txt v="body">{m.name}</Txt><Txt v="mono">Day {m.day}/{m.planned_days}</Txt></Row>
                  <Bar value={m.day} max={m.planned_days} color={colors.blue} />
                </View>
              ))}
            </Card>
          </Grid>
          <Card style={{ gap: space.md }}>
            <Row gap={8}><Feather name="sliders" size={15} color={colors.purple} /><Txt v="h3">Simulation tools</Txt></Row>
            <Txt v="small">Generator output is always labelled SIMULATED: illustrative synthetic readings, not clinically validated physiological simulations. Seed 42 reproduces the same scenarios.</Txt>
            <Row wrap gap={space.sm}>
              <Button small kind="subtle" icon="download" title="Export CSV" loading={tool.busy === 'csv'} onPress={() => exportSim('csv')} />
              <Button small kind="subtle" icon="download" title="Export JSON" loading={tool.busy === 'json'} onPress={() => exportSim('json')} />
              <Button small kind="ghost" icon="rotate-ccw" title="Regenerate crew data" loading={tool.busy === 'reset'} onPress={resetCrew} />
            </Row>
            {tool.msg && <Notice text={tool.msg} tone="ok" icon="check-circle" />}
          </Card>
        </View>
        {right}
      </View>
      <Card style={{ gap: space.sm }}>
        <Txt v="label" color={colors.cyan}>Crew at a glance</Txt>
        {o.crew.map((a) => (
          <Pressable key={a.id} onPress={() => router.push(`/control/astronaut/${a.id}`)} style={{ paddingVertical: 6 }}>
            <Row wrap style={{ justifyContent: 'space-between' }}>
              <Row gap={10}><Txt v="mono" color={colors.text}>{a.id}</Txt><Txt v="body">{a.callsign}</Txt></Row>
              <Row gap={6}><CommPill a={a} /><HealthStatusPill a={a} /></Row>
            </Row>
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}
