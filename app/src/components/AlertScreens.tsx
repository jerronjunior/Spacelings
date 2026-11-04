import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { NetworkError, request } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtUtc, uid } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useSync } from '@/lib/sync';
import { colors, space } from '@/lib/theme';
import type { Alert } from '@/lib/types';
import { AlertCard, AlertDetail } from './Health';
import { Button, Card, Empty, Field, Loading, Notice, PageTitle, Row, Screen, Segmented, Txt } from './ui';

export function AlertList({ base, control }: { base: string; control?: boolean }) {
  const router = useRouter();
  const { localAlerts } = useSync();
  const [status, setStatus] = useState<'open' | 'acknowledged' | 'all'>('open');
  const [sev, setSev] = useState<'all' | 'info' | 'caution' | 'warning'>('all');
  const q = useApi<Alert[]>(`/alerts?limit=200${status !== 'all' ? `&status=${status}` : ''}${sev !== 'all' ? `&severity=${sev}` : ''}`, [status, sev]);
  const items = useMemo(() => {
    const local = control ? [] : localAlerts.filter((a) => (status === 'all' || a.status === status) && (sev === 'all' || a.severity === sev));
    return [...local, ...(q.data ?? [])];
  }, [q.data, localAlerts, status, sev, control]);
  return (
    <Screen maxWidth={1000}>
      <PageTitle eyebrow={control ? 'Alert management' : 'AI health alerts'} title="Alert centre"
        subtitle="Alerts come from the Crew Context Engine: sustained changes compared with each astronaut's own baseline. Open an alert to see the evidence, explanation and checklist." />
      <Row wrap gap={space.md}>
        <Segmented value={status} onChange={setStatus} options={[{ value: 'open', label: 'Open' }, { value: 'acknowledged', label: 'Acknowledged' }, { value: 'all', label: 'History' }]} />
        <Segmented value={sev} onChange={setSev} options={[{ value: 'all', label: 'All severities' }, { value: 'warning', label: 'Warning' }, { value: 'caution', label: 'Caution' }, { value: 'info', label: 'Info' }]} />
      </Row>
      {q.fromCache && <Notice tone="caution" icon="wifi-off" text={`Offline — server alerts as of ${fmtUtc(q.cachedAt)}. Onboard alerts are generated locally.`} />}
      {q.loading && !q.data ? <Loading /> : items.length ? items.map((a) => (
        <AlertCard key={a.id} alert={a} showAstronaut={control} onPress={() => router.push(`${base}/alert/${a.id}` as any)} />
      )) : <Card><Empty icon="shield" title="No alerts match these filters" /></Card>}
    </Screen>
  );
}

export function AlertDetailScreen({ id, base, control }: { id: string; base: string; control?: boolean }) {
  const router = useRouter();
  const { session } = useAuth();
  const { localAlerts, ackLocalAlert, enqueue } = useSync();
  const onboard = id.startsWith('onboard-');
  const q = useApi<Alert>(onboard ? null : `/alerts/${id}`);
  const local = localAlerts.find((a) => String(a.id) === id);
  const [acking, setAcking] = useState(false);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const alert = onboard ? local : q.data;

  const ack = async () => {
    if (!alert) return;
    setAcking(true);
    if (onboard) {
      await ackLocalAlert(id);
    } else {
      try {
        q.setData(await request<Alert>(`/alerts/${id}/acknowledge`, { method: 'POST' }));
      } catch (e: any) {
        if (e instanceof NetworkError) {
          await enqueue({ uid: uid('ack'), kind: 'ack', astronaut_id: alert.astronaut_id, payload: { alert_id: alert.id } });
          q.setData({ ...alert, status: 'acknowledged', acknowledged_by: `${session?.user.display_name} (queued)`, acknowledged_at: new Date().toISOString() });
          setMsg('Acknowledged on board — will synchronize when the link returns.');
        } else setMsg(e.message);
      }
    }
    setAcking(false);
  };

  const addNote = async () => {
    try {
      q.setData(await request<Alert>(`/alerts/${id}/notes`, { body: { text: note.trim() } }));
      setNote('');
    } catch (e: any) {
      setMsg(e instanceof NetworkError ? 'Notes need a connection to the server.' : e.message);
    }
  };

  return (
    <Screen maxWidth={980}>
      <Button small kind="ghost" icon="arrow-left" title="All alerts" onPress={() => router.push(`${base}/alerts` as any)} style={{ alignSelf: 'flex-start' }} />
      {!alert ? (q.loading ? <Loading /> : <Notice tone="warning" text={q.error ?? 'Alert not found on this device.'} />) : (
        <AlertDetail alert={alert} onAck={ack} acking={acking} footer={
          <View style={{ gap: space.md }}>
            {msg && <Notice text={msg} tone="caution" />}
            {control && !onboard && (
              <Card style={{ gap: space.md }}>
                <Txt v="label" color={colors.cyan}>Operator notes</Txt>
                {alert.notes.length ? alert.notes.map((n) => (
                  <View key={n.id} style={{ gap: 2, paddingVertical: 4 }}>
                    <Txt v="small" color={colors.text3}>{n.author} · {fmtUtc(n.created_at)}</Txt>
                    <Txt v="body">{n.text}</Txt>
                  </View>
                )) : <Txt v="small">No notes yet.</Txt>}
                <Field label="Add note" value={note} onChangeText={setNote} multiline placeholder="e.g. Crew contacted, sensor re-seated, follow-up at 18:00 UTC" style={{ minHeight: 64, textAlignVertical: 'top' }} />
                <Button title="Add note" icon="message-square" kind="subtle" onPress={addNote} disabled={!note.trim()} style={{ alignSelf: 'flex-start' }} />
              </Card>
            )}
            {control && (
              <Button kind="ghost" icon="user" title={`Open ${alert.astronaut_id} details`} onPress={() => router.push(`/control/astronaut/${alert.astronaut_id}` as any)} style={{ alignSelf: 'flex-start' }} />
            )}
          </View>
        } />
      )}
    </Screen>
  );
}
