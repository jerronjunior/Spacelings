import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Card, Empty, Field, Notice, PageTitle, Pill, Row, Screen, SectionHeader, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fmtUtc, uid } from '@/lib/format';
import { useApi, useLayout } from '@/lib/hooks';
import { MEASUREMENTS, fmtValue } from '@/lib/measurements';
import { useSync } from '@/lib/sync';
import { colors, fonts, radius, space } from '@/lib/theme';
import type { CheckIn, MeasurementType } from '@/lib/types';

const NUMERIC: MeasurementType[] = ['heart_rate', 'spo2', 'body_temperature', 'sleep_duration'];
const WELLBEING = ['Very poor', 'Poor', 'Okay', 'Good', 'Very good'];

function Scale({ n, value, onChange, labels, label }: { n: number; value: number | null; onChange: (v: number | null) => void; labels?: string[]; label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="label">{label}</Txt>
        {value !== null && <Pressable onPress={() => onChange(null)}><Txt v="small" color={colors.text3}>clear</Txt></Pressable>}
      </Row>
      <Row wrap gap={6}>
        {Array.from({ length: n }, (_, i) => i + 1).map((v) => {
          const on = v === value;
          return (
            <Pressable key={v} onPress={() => onChange(on ? null : v)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${label} ${labels ? labels[v - 1] : v}`}
              style={({ hovered }: any) => [{
                minWidth: labels ? 92 : 40, height: 40, paddingHorizontal: 10, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1,
                borderColor: on ? colors.cyan : colors.border, backgroundColor: on ? colors.cyanSoft : hovered ? 'rgba(148,163,184,0.06)' : 'rgba(6,11,24,0.5)',
              }]}>
              <Txt v="mono" color={on ? colors.cyan : colors.text} style={{ fontFamily: fonts.monoMedium }}>{labels ? labels[v - 1] : v}</Txt>
            </Pressable>
          );
        })}
      </Row>
    </View>
  );
}

export default function CheckInScreen() {
  const { session } = useAuth();
  const aid = session!.user.astronaut_id!;
  const { enqueue, status, queue } = useSync();
  const { isWide } = useLayout();
  const history = useApi<CheckIn[]>(`/checkins/${aid}?limit=20`);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [fatigue, setFatigue] = useState<number | null>(null);
  const [wellbeing, setWellbeing] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const errors = useMemo(() => {
    const e: Record<string, string | null> = {};
    for (const k of NUMERIC) {
      const raw = (vals[k] ?? '').trim().replace(',', '.');
      if (!raw) { e[k] = null; continue; }
      const v = Number(raw);
      const m = MEASUREMENTS[k];
      e[k] = Number.isNaN(v) ? 'Enter a number' : v < m.min || v > m.max ? `Accepted input range ${m.min}–${m.max} ${m.unit}` : null;
    }
    return e;
  }, [vals]);
  const measured = NUMERIC.filter((k) => (vals[k] ?? '').trim() && !errors[k]);
  const hasErrors = Object.values(errors).some(Boolean);
  const empty = !measured.length && fatigue === null && wellbeing === null && !notes.trim();

  const submit = async () => {
    setBusy(true);
    const payload: any = { astronaut_id: aid, timestamp: new Date().toISOString(), notes: notes.trim(), wellbeing, fatigue_score: fatigue };
    for (const k of NUMERIC) payload[k] = measured.includes(k) ? Number(vals[k].replace(',', '.')) : null; // unmeasured stays null
    await enqueue({ uid: uid('chk'), kind: 'checkin', astronaut_id: aid, payload });
    setResult(status === 'OFFLINE'
      ? 'Saved on board. No ground link — the check-in is queued and will synchronize automatically.'
      : 'Check-in saved and sent to the ground. The Crew Context Engine will re-analyse your data.');
    setVals({}); setFatigue(null); setWellbeing(null); setNotes('');
    setBusy(false);
  };

  const pending = queue.filter((q) => q.kind === 'checkin' && q.astronaut_id === aid);

  return (
    <Screen maxWidth={980}>
      <PageTitle eyebrow="Daily health check-in" title="How are you today?"
        subtitle="Fill in only what you actually measured. Empty fields are stored as “not measured” — never as a value. Entries are labelled MANUAL." />
      <Card style={{ gap: space.lg }}>
        <Row wrap gap={space.md} style={{ alignItems: 'flex-start' }}>
          {NUMERIC.map((k) => (
            <View key={k} style={{ width: isWide ? '48%' : '100%', flexGrow: 1 }}>
              <Field label={MEASUREMENTS[k].label} unit={MEASUREMENTS[k].unit} keyboardType="decimal-pad" placeholder="not measured"
                value={vals[k] ?? ''} onChangeText={(t) => setVals((v) => ({ ...v, [k]: t }))} error={errors[k]} />
            </View>
          ))}
        </Row>
        <Scale label="Fatigue score (1 = rested, 10 = exhausted)" n={10} value={fatigue} onChange={setFatigue} />
        <Scale label="General wellbeing" n={5} value={wellbeing} onChange={setWellbeing} labels={WELLBEING} />
        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Workload, symptoms, anything unusual…" style={{ minHeight: 84, textAlignVertical: 'top' }} />
        <Row wrap gap={space.md} style={{ justifyContent: 'space-between' }}>
          <Txt v="small">Will store: {[...measured.map((k) => MEASUREMENTS[k].short), fatigue !== null ? 'Fatigue' : null, wellbeing !== null ? 'Wellbeing' : null].filter(Boolean).join(', ') || 'nothing yet'}</Txt>
          <Button title={status === 'OFFLINE' ? 'Save on board' : 'Submit check-in'} icon="check" onPress={submit} loading={busy} disabled={empty || hasErrors} />
        </Row>
        {result && <Notice tone={status === 'OFFLINE' ? 'caution' : 'ok'} icon={status === 'OFFLINE' ? 'hard-drive' : 'check-circle'} text={result} />}
      </Card>

      <SectionHeader title="Check-in history" subtitle={pending.length ? `${pending.length} waiting to synchronize` : 'Synchronized with Mission Control'} />
      {pending.map((q) => <HistoryRow key={q.uid} c={{ ...q.payload, id: q.uid, measured_fields: [], values: q.payload, pending: true }} />)}
      {history.data?.length ? history.data.map((c) => <HistoryRow key={c.id} c={c} />) : !pending.length ? <Card><Empty icon="edit-3" title="No check-ins yet" /></Card> : null}
    </Screen>
  );
}

function HistoryRow({ c }: { c: CheckIn & { pending?: boolean } }) {
  const keys = (Object.keys(MEASUREMENTS) as MeasurementType[]).filter((k) => c.values?.[k] !== null && c.values?.[k] !== undefined);
  return (
    <Card style={{ gap: 8 }}>
      <Row style={{ justifyContent: 'space-between' }} wrap>
        <Row gap={8}>
          <Feather name={c.pending ? 'clock' : 'check-circle'} size={14} color={c.pending ? colors.caution : colors.ok} />
          <Txt v="mono" color={colors.text}>{fmtUtc(c.timestamp)}</Txt>
        </Row>
        <Row gap={6}>
          {c.pending ? <Pill text="queued on board" fg={colors.caution} bg={colors.cautionSoft} /> : <Pill text="MANUAL" fg={colors.cyan} bg={colors.cyanSoft} dot />}
          {c.created_offline && !c.pending ? <Pill text="created offline" fg={colors.purple} bg={colors.purpleSoft} /> : null}
        </Row>
      </Row>
      <Row wrap gap={space.lg}>
        {keys.map((k) => <Txt key={k} v="small">{MEASUREMENTS[k].short} <Txt v="mono" color={colors.text}>{fmtValue(k, c.values[k]!)} {MEASUREMENTS[k].unit}</Txt></Txt>)}
        {c.wellbeing ? <Txt v="small">Wellbeing <Txt v="mono" color={colors.text}>{WELLBEING[c.wellbeing - 1]}</Txt></Txt> : null}
        {!keys.length && !c.wellbeing ? <Txt v="small">No measurements recorded</Txt> : null}
      </Row>
      {c.notes ? <Txt v="small" color={colors.text}>“{c.notes}”</Txt> : null}
    </Card>
  );
}
