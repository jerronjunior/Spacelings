import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { request } from '@/lib/api';
import { useSync } from '@/lib/sync';
import { colors, radius, space } from '@/lib/theme';
import { Button, Card, Notice, Row, Txt } from './ui';

/** Guided demo console for SIM-01 (README → Demo workflow). Every button calls the real backend. */
export function DemoPanel({ base = '/crew' }: { base?: string }) {
  const router = useRouter();
  const { syncNow, simulatedOffline, setSimulatedOffline, status } = useSync();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'warning' | 'info' } | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    setMsg(null);
    try {
      const text = await fn();
      setDone((d) => ({ ...d, [key]: true }));
      setMsg({ text, tone: 'ok' });
      await syncNow(); // refresh every screen
    } catch (e: any) {
      setMsg({ text: e.message, tone: 'warning' });
    } finally {
      setBusy(null);
    }
  };

  const steps: { key: string; n: string; title: string; text: string; action: React.ReactNode }[] = [
    { key: 'hr', n: '4', title: 'Introduce elevated heart rate', text: 'Adds 30 h of SIMULATED heart-rate readings above SIM-01’s baseline.',
      action: <Button small kind="subtle" icon="activity" title="Inject" loading={busy === 'hr'} onPress={() => run('hr', async () => {
        const r = await request('/demo/step', { body: { step: 'elevated_heart_rate' } });
        return `${r.inserted} SIMULATED heart-rate readings added.`;
      })} /> },
    { key: 'sleep', n: '5', title: 'Introduce reduced sleep + fatigue', text: 'Two short nights and two high fatigue scores (daily SIMULATED values).',
      action: <Button small kind="subtle" icon="moon" title="Inject" loading={busy === 'sleep'} onPress={() => run('sleep', async () => {
        const r = await request('/demo/step', { body: { step: 'reduced_sleep_fatigue' } });
        return `${r.inserted} SIMULATED sleep/fatigue values added.`;
      })} /> },
    { key: 'engine', n: '6', title: 'Run the Crew Context Engine', text: 'Compares recent readings with the personal baseline and creates an alert if changes are sustained.',
      action: <Button small icon="cpu" title="Analyse" loading={busy === 'engine'} onPress={() => run('engine', async () => {
        const r = await request('/analysis/analyze', { body: { astronaut_id: 'SIM-01' } });
        if (r.alert_record) {
          setTimeout(() => router.push(`${base}/alert/${r.alert_record.id}` as any), 600);
          return `${r.alert_record.title} — opening the explanation…`;
        }
        return 'No sustained change — all indicators are within the personal baseline.';
      })} /> },
  ];

  return (
    <Card style={{ gap: space.md, borderColor: colors.purple + '55' }}>
      <Row style={{ justifyContent: 'space-between' }} wrap>
        <Row gap={8}><Feather name="play-circle" size={16} color={colors.purple} /><Txt v="h3">Demo console · SIM-01</Txt></Row>
        <Button small kind="ghost" icon="rotate-ccw" title="Reset demo" loading={busy === 'reset'} onPress={() => run('reset', async () => {
          await request('/demo/reset', { method: 'POST' });
          setDone({});
          return 'SIM-01 reset to a normal SIMULATED pattern.';
        })} />
      </Row>
      <Txt v="small">Steps 1–3: the dashboard shows normal readings and the personal baseline. Then:</Txt>
      {steps.map((s) => (
        <Row key={s.key} gap={space.md} style={{ padding: space.md, borderRadius: radius.md, backgroundColor: 'rgba(6,11,24,0.45)' }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: done[s.key] ? colors.okSoft : colors.purpleSoft }}>
            {done[s.key] ? <Feather name="check" size={13} color={colors.ok} /> : <Txt v="mono" color={colors.purple}>{s.n}</Txt>}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="body" style={{ fontFamily: 'Inter_600SemiBold' }}>{s.title}</Txt>
            <Txt v="small">{s.text}</Txt>
          </View>
          {s.action}
        </Row>
      ))}
      <Row gap={space.md} style={{ padding: space.md, borderRadius: radius.md, backgroundColor: 'rgba(6,11,24,0.45)' }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.purpleSoft }}>
          <Txt v="mono" color={colors.purple}>12</Txt>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="body" style={{ fontFamily: 'Inter_600SemiBold' }}>Simulate communication loss</Txt>
          <Txt v="small">Blocks all server calls. Submit a check-in: it is stored on board and synchronized automatically when the link returns. Link: {status}</Txt>
        </View>
        <Switch value={simulatedOffline} onValueChange={setSimulatedOffline} trackColor={{ true: colors.caution, false: '#334155' }} thumbColor={colors.text} accessibilityLabel="Simulate communication loss" />
      </Row>
      {msg && <Notice tone={msg.tone} text={msg.text} icon={msg.tone === 'ok' ? 'check-circle' : 'alert-circle'} />}
    </Card>
  );
}
