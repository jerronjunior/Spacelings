import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { BaselineTable } from '@/components/BaselineTable';
import { Button, Card, Field, Grid, KeyValue, Loading, Notice, PageTitle, Row, Screen, SourceBadge, Txt } from '@/components/ui';
import { apiBase, setApiBase } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtUtc, timeAgo } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { clearAll } from '@/lib/storage';
import { useSync } from '@/lib/sync';
import { colors, space } from '@/lib/theme';
import type { Astronaut } from '@/lib/types';

export default function Profile() {
  const { session, logout } = useAuth();
  const router = useRouter();
  const aid = session!.user.astronaut_id!;
  const p = useApi<Astronaut>(`/astronauts/${aid}`);
  const sync = useSync();
  const [url, setUrl] = useState(apiBase());
  const [msg, setMsg] = useState<string | null>(null);

  if (!p.data) return <Screen>{p.loading ? <Loading /> : <Notice tone="warning" text={p.error ?? ''} />}</Screen>;
  const a = p.data;
  return (
    <Screen maxWidth={1100}>
      <PageTitle eyebrow="Astronaut profile" title={`${a.callsign} · ${a.id}`} subtitle={`${session!.user.display_name} · ${session!.user.email}`} />
      <Grid min={320}>
        <Card style={{ gap: 2 }}>
          <Txt v="label" color={colors.cyan}>Identity & mission</Txt>
          <KeyValue k="Astronaut ID" v={a.id} mono />
          <KeyValue k="Role" v={a.role_on_mission} />
          <KeyValue k="Mission" v={`${a.mission.name} (${a.mission.id})`} />
          <KeyValue k="Vehicle" v={a.mission.vehicle} />
          <KeyValue k="Mission day" v={`${a.mission.day} of ${a.mission.planned_days}`} mono />
          <KeyValue k="Mission start" v={fmtUtc(a.mission.start_date)} mono />
          <KeyValue k="Record type" v={a.is_fictional ? 'Fictional demo astronaut' : 'Volunteer (anonymous ID)'} />
        </Card>
        <Card style={{ gap: 2 }}>
          <Txt v="label" color={colors.cyan}>Measurement history</Txt>
          <KeyValue k="Stored readings" v={String(a.counts?.measurements ?? 0)} mono />
          <KeyValue k="Daily check-ins" v={String(a.counts?.checkins ?? 0)} mono />
          <KeyValue k="Alerts (all time)" v={String(a.counts?.alerts ?? 0)} mono />
          <KeyValue k="Last synchronization" v={timeAgo(a.last_sync_at)} />
          <Row gap={8} wrap style={{ marginTop: 8 }}>
            <Button small kind="subtle" icon="activity" title="Health history" onPress={() => router.push('/crew/health')} />
            <Button small kind="ghost" icon="edit-3" title="Check-in history" onPress={() => router.push('/crew/checkin')} />
          </Row>
        </Card>
      </Grid>
      <Card style={{ gap: space.md }}>
        <Txt v="label" color={colors.cyan}>Personal health baseline</Txt>
        <BaselineTable a={a} />
      </Card>
      <Card style={{ gap: space.md }}>
        <Txt v="label" color={colors.cyan}>Data sources</Txt>
        <Row gap={8} wrap><SourceBadge source="SIMULATED" /><Txt v="small">illustrative synthetic readings from the generator — not clinically validated</Txt></Row>
        <Row gap={8} wrap><SourceBadge source="MANUAL" /><Txt v="small">values you entered in a check-in</Txt></Row>
        <Row gap={8} wrap><SourceBadge source="DEVICE" /><Txt v="small">actual sensor measurements (when a device is connected)</Txt></Row>
      </Card>
      <Card style={{ gap: space.md }}>
        <Txt v="label" color={colors.cyan}>Application settings</Txt>
        <Row style={{ justifyContent: 'space-between' }} gap={space.md}>
          <View style={{ flex: 1 }}>
            <Txt v="body">Simulate communication loss</Txt>
            <Txt v="small">Demo offline mode: all server calls are blocked; data stays on board.</Txt>
          </View>
          <Switch value={sync.simulatedOffline} onValueChange={sync.setSimulatedOffline} trackColor={{ true: colors.caution, false: '#334155' }} thumbColor={colors.text} accessibilityLabel="Simulate communication loss" />
        </Row>
        <Row style={{ justifyContent: 'space-between' }} wrap gap={space.md}>
          <View style={{ flex: 1, minWidth: 220 }}>
            <Txt v="body">Synchronization · {sync.status}</Txt>
            <Txt v="small">{sync.queue.length} queued · last sync {sync.lastSyncAt ? timeAgo(sync.lastSyncAt) : 'never'}{sync.lastSyncReport ? ` · ${sync.lastSyncReport}` : ''}</Txt>
          </View>
          <Button small kind="subtle" icon="refresh-cw" title="Sync now" onPress={sync.syncNow} disabled={sync.status === 'OFFLINE'} />
        </Row>
        <Row wrap gap={space.md} style={{ alignItems: 'flex-end' }}>
          <Field label="Backend server" value={url} onChangeText={setUrl} autoCapitalize="none" />
          <Button small kind="ghost" title="Save" icon="save" onPress={async () => { await setApiBase(url.trim() || null); setMsg('Server address saved.'); }} />
        </Row>
        <Row wrap gap={space.md}>
          <Button small kind="danger" icon="trash-2" title="Clear on-board cache" onPress={async () => {
            if (sync.queue.length) { setMsg(`Cannot clear: ${sync.queue.length} items still waiting to synchronize.`); return; }
            await clearAll(); await logout(); router.replace('/login');
          }} />
          <Button small kind="ghost" icon="log-out" title="Sign out" onPress={async () => { await logout(); router.replace('/login'); }} />
        </Row>
        {msg && <Notice text={msg} />}
      </Card>
    </Screen>
  );
}
