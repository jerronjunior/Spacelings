import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { CommPill, HealthStatusPill } from '@/components/CrewBits';
import { Card, Field, Loading, Notice, PageTitle, Pill, Row, Screen, Segmented, SeverityBadge, Txt } from '@/components/ui';
import { fmtUtc, timeAgo } from '@/lib/format';
import { useApi, useLayout } from '@/lib/hooks';
import { MEASUREMENTS, fmtValue } from '@/lib/measurements';
import { colors, fonts, space } from '@/lib/theme';
import type { Astronaut } from '@/lib/types';

export default function CrewMonitoring() {
  const router = useRouter();
  const { isWide } = useLayout();
  const q = useApi<Astronaut[]>('/astronauts');
  const [filter, setFilter] = useState<'all' | 'attention' | 'nominal'>('all');
  const [search, setSearch] = useState('');
  const crew = (q.data ?? []).filter((a) =>
    (filter === 'all' || (filter === 'attention' ? a.health_status !== 'nominal' : a.health_status === 'nominal')) &&
    (!search || `${a.id} ${a.callsign} ${a.mission.id} ${a.mission.name}`.toLowerCase().includes(search.toLowerCase())));
  const open = (a: Astronaut) => router.push(`/control/astronaut/${a.id}`);

  return (
    <Screen maxWidth={1400}>
      <PageTitle eyebrow="Astronaut monitoring" title="Crew" subtitle="Latest health status, synchronization and alerts for every astronaut. Select a row for full details." />
      <Row wrap gap={space.md}>
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'attention', label: 'Needs attention' }, { value: 'nominal', label: 'Nominal' }]} />
        <View style={{ width: 280 }}><Field label="Search" value={search} onChangeText={setSearch} placeholder="ID, callsign or mission" /></View>
      </Row>
      {q.fromCache && <Notice tone="caution" icon="wifi-off" text={`Showing crew list cached ${fmtUtc(q.cachedAt)}.`} />}
      {q.loading && !q.data ? <Loading /> : isWide ? (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <Row style={{ paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            {['Astronaut', 'Mission', 'Health status', 'Heart rate', 'Last sync', 'Alerts'].map((h, i) => (
              <Txt key={h} v="label" style={{ flex: [1.4, 1.6, 1.2, 1, 1.2, 1][i] }}>{h}</Txt>
            ))}
          </Row>
          {crew.map((a) => (
            <Pressable key={a.id} onPress={() => open(a)} accessibilityRole="button" accessibilityLabel={`Open ${a.id}`}
              style={({ hovered }: any) => [{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }, hovered && { backgroundColor: colors.cyanSoft }]}>
              <View style={{ flex: 1.4 }}>
                <Txt v="mono" color={colors.text} style={{ fontFamily: fonts.monoMedium }}>{a.id}</Txt>
                <Txt v="small">{a.callsign} · {a.role_on_mission}</Txt>
              </View>
              <View style={{ flex: 1.6 }}><Txt v="body">{a.mission.name}</Txt><Txt v="small">{a.mission.id} · day {a.mission.day}</Txt></View>
              <View style={{ flex: 1.2 }}><HealthStatusPill a={a} /></View>
              <View style={{ flex: 1 }}><Txt v="mono" color={colors.text}>{a.latest?.heart_rate ? `${fmtValue('heart_rate', a.latest.heart_rate.value)} ${MEASUREMENTS.heart_rate.unit}` : '—'}</Txt></View>
              <View style={{ flex: 1.2, gap: 4 }}><Txt v="small" color={colors.text}>{timeAgo(a.last_sync_at)}</Txt><CommPill a={a} /></View>
              <View style={{ flex: 1 }}>{a.open_alerts ? <Row gap={6}><SeverityBadge severity={a.top_severity!} /><Txt v="mono">{a.open_alerts}</Txt></Row> : <Pill text="none" />}</View>
            </Pressable>
          ))}
        </Card>
      ) : crew.map((a) => (
        <Pressable key={a.id} onPress={() => open(a)}>
          <Card style={{ gap: 8 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={8}><Txt v="mono" color={colors.text}>{a.id}</Txt><Txt v="h3">{a.callsign}</Txt></Row>
              <HealthStatusPill a={a} />
            </Row>
            <Txt v="small">{a.mission.name} · day {a.mission.day}</Txt>
            <Row wrap gap={8}><CommPill a={a} />{a.open_alerts ? <SeverityBadge severity={a.top_severity!} /> : null}<Txt v="small">synced {timeAgo(a.last_sync_at)}</Txt></Row>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
