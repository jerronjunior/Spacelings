import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import React, { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { SeriesChart } from '@/components/Charts';
import { Button, Card, Divider, Field, Grid, KeyValue, Loading, Notice, PageTitle, Pill, Row, Screen, Txt } from '@/components/ui';
import { request } from '@/lib/api';
import { fmtUtc } from '@/lib/format';
import { useApi, useLayout } from '@/lib/hooks';
import { colors, fonts, radius, space } from '@/lib/theme';
import type { NasaDataset, NasaObservation } from '@/lib/types';

const RETRIEVAL: Record<string, { text: string; fg: string }> = {
  live: { text: 'Live from NASA', fg: colors.ok },
  'cached-snapshot': { text: 'Cached NASA snapshot', fg: colors.blue },
  imported: { text: 'Imported file', fg: colors.cyan },
  'catalog-only': { text: 'Catalogue / link', fg: colors.text2 },
  sample: { text: 'Sample data', fg: colors.caution },
};
const SERIES_COLORS = [colors.blue, colors.cyan, colors.purple, colors.ok, colors.caution];

export default function Research() {
  const { isDesktop } = useLayout();
  const ds = useApi<NasaDataset[]>('/nasa/datasets');
  const [sel, setSel] = useState<string>('RADLAB-ISS-REM-2019-12');
  const env = useApi<{ dataset: NasaDataset; label: string; observations: NasaObservation[] }>(`/nasa/environment?dataset_id=${sel}`, [sel]);
  const [report, setReport] = useState<{ ok: boolean; message: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const current = ds.data?.find((d) => d.id === sel);

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await request('/nasa/refresh', { method: 'POST', timeoutMs: 40000 });
      setReport(r.sources);
      ds.reload(); env.reload();
    } catch (e: any) { setReport([{ ok: false, message: e.message }]); } finally { setBusy(false); }
  };

  const chart = useMemo(() => {
    const obs = env.data?.observations ?? [];
    const vars = Array.from(new Set(obs.map((o) => o.variable)));
    const variable = vars[0];
    const bySeries: Record<string, { t: string; v: number }[]> = {};
    for (const o of obs.filter((o) => o.variable === variable)) (bySeries[o.series] ??= []).push({ t: o.timestamp, v: o.value });
    return { variable, unit: obs.find((o) => o.variable === variable)?.unit ?? '', series: Object.entries(bySeries).map(([name, points], i) => ({ name, points, color: SERIES_COLORS[i % SERIES_COLORS.length] })) };
  }, [env.data]);

  return (
    <Screen maxWidth={1400}>
      <PageTitle eyebrow="Mission research dashboard" title="NASA research data"
        subtitle="Historical research and environmental observations from public NASA sources. Kept separate from astronaut health data and never presented as live medical readings."
        right={<Row gap={8} wrap>
          <Button small kind="ghost" icon="upload" title="Import CSV/JSON" onPress={() => setShowImport((v) => !v)} />
          <Button small icon="refresh-cw" title="Refresh from NASA" onPress={refresh} loading={busy} />
        </Row>} />
      <Notice tone="info" icon="database" text="Category: NASA RESEARCH DATA. These datasets describe spacecraft environments and research studies. They are shown for mission context only and are not compared with, or mixed into, crew health measurements." />
      {report && <View style={{ gap: 6 }}>{report.map((r, i) => <Notice key={i} tone={r.ok ? 'ok' : 'caution'} icon={r.ok ? 'check-circle' : 'wifi-off'} text={r.message} />)}</View>}
      {showImport && <ImportForm onDone={(id) => { setShowImport(false); ds.reload(); setSel(id); }} />}

      <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: space.md, alignItems: 'flex-start' }}>
        <View style={{ width: isDesktop ? 360 : '100%', gap: space.sm }}>
          {ds.loading && !ds.data ? <Loading /> : (ds.data ?? []).map((d) => {
            const on = d.id === sel;
            const r = RETRIEVAL[d.retrieval];
            return (
              <Pressable key={d.id} onPress={() => setSel(d.id)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                <Card glow={on} style={{ gap: 6, padding: space.md }}>
                  <Row style={{ justifyContent: 'space-between' }}><Txt v="label" color={on ? colors.cyan : colors.text3}>{d.nasa_source}</Txt><Pill text={r.text} fg={r.fg} bg={r.fg + '1F'} /></Row>
                  <Txt v="h3" style={{ fontSize: 14.5 }}>{d.name}</Txt>
                  <Txt v="small">{d.observation_count ? `${d.observation_count} observations` : 'No stored observations'}{d.date_start ? ` · ${d.date_start} → ${d.date_end}` : ''}</Txt>
                </Card>
              </Pressable>
            );
          })}
        </View>

        {current && (
          <View style={{ flex: 1, gap: space.md, width: '100%' }}>
            <Card style={{ gap: space.md }}>
              <View style={{ gap: 4 }}>
                <Txt v="label" color={colors.blue}>{current.nasa_source}</Txt>
                <Txt v="h2">{current.name}</Txt>
                <Txt v="small">{current.description}</Txt>
              </View>
              <Grid min={260} gap={space.lg}>
                <View>
                  <KeyValue k="Dataset ID" v={current.id} mono />
                  <KeyValue k="Mission / study" v={current.mission_or_study} />
                  <KeyValue k="Date range" v={current.date_start ? `${current.date_start} → ${current.date_end}` : 'see source'} mono />
                </View>
                <View>
                  <KeyValue k="Retrieval" v={RETRIEVAL[current.retrieval].text} />
                  <KeyValue k="Retrieved" v={current.retrieved_at ?? '—'} mono />
                  <KeyValue k="Observations" v={String(current.observation_count)} mono />
                </View>
              </Grid>
              <Divider />
              <Txt v="label">Research variables & measurement units</Txt>
              {current.variables.length ? current.variables.map((v) => (
                <Row key={v.name} style={{ justifyContent: 'space-between' }} gap={space.md}>
                  <Txt v="mono" color={colors.text}>{v.name}</Txt>
                  <Txt v="small" style={{ flex: 1, textAlign: 'center' }}>{v.description}</Txt>
                  <Txt v="mono" color={colors.cyan}>{v.unit || '—'}</Txt>
                </Row>
              )) : <Txt v="small">Reference link only.</Txt>}
              {current.notice ? <Notice tone="info" text={current.notice} /> : null}
              <Row wrap gap={space.sm}>
                <Button small kind="subtle" icon="external-link" title="Original NASA source" onPress={() => Linking.openURL(current.source_url)} />
                {current.api_url && <Button small kind="ghost" icon="code" title="API query" onPress={() => Linking.openURL(current.api_url!)} />}
              </Row>
            </Card>

            {current.observation_count > 0 && (
              <Card style={{ gap: space.md }}>
                <Row style={{ justifyContent: 'space-between' }} wrap>
                  <View><Txt v="h3">Historical observations · {chart.variable}</Txt><Txt v="small">{env.data?.label}</Txt></View>
                  <Pill text="NASA" fg={colors.blue} bg={colors.blueSoft} icon="database" />
                </Row>
                {env.loading && !env.data ? <Loading /> : <SeriesChart series={chart.series} unit={chart.unit} />}
                <Row wrap gap={14}>
                  {chart.series.map((s) => <Row key={s.name} gap={6}><View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: s.color }} /><Txt v="small">{s.name}</Txt></Row>)}
                  <Txt v="small" color={colors.text3}>Unit: {chart.unit}</Txt>
                </Row>
                <Divider />
                <Txt v="label">Observation table (first 12 rows, values as published)</Txt>
                <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                  <Row style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    {['Timestamp', 'Series', 'Variable', 'Value'].map((h, i) => <Txt key={h} v="label" style={{ flex: [1.2, 1.6, 1.2, 1][i] }}>{h}</Txt>)}
                  </Row>
                  {(env.data?.observations ?? []).slice(0, 12).map((o, i) => (
                    <Row key={i} style={{ paddingHorizontal: 10, paddingVertical: 7 }}>
                      <Txt v="mono" style={{ flex: 1.2 }}>{o.timestamp.replace('T', ' ').slice(0, 16)}</Txt>
                      <Txt v="small" style={{ flex: 1.6 }} numberOfLines={1}>{o.series}</Txt>
                      <Txt v="mono" style={{ flex: 1.2 }}>{o.variable}</Txt>
                      <Txt v="mono" color={colors.text} style={{ flex: 1, fontFamily: fonts.monoMedium }}>{o.value.toFixed(3)} {o.unit}</Txt>
                    </Row>
                  ))}
                </View>
              </Card>
            )}
            {current.observation_count === 0 && current.id === 'OSDR-EDA-RR' && (
              <Notice tone="info" icon="upload" text="Open the Environmental Data App, choose a Rodent Research mission, download the telemetry or radiation table as CSV, then use “Import CSV/JSON” above with the dataset’s units." />
            )}
          </View>
        )}
      </View>
      <Txt v="small" color={colors.text3}>Data accessed {env.data ? fmtUtc(new Date().toISOString()) : '—'} via the SPACELINGS backend. NASA sources: OSDR (osdr.nasa.gov), OSDR RadLab and Environmental Data App (visualization.osdr.nasa.gov), NASA Life Sciences Portal (nlsp.nasa.gov).</Txt>
    </Screen>
  );
}

function ImportForm({ onDone }: { onDone: (id: string) => void }) {
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [f, setF] = useState({ dataset_id: 'EDA-IMPORT-1', name: '', mission_or_study: '', source_url: 'https://visualization.osdr.nasa.gov/eda/', units: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/tab-separated-values', 'application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
    if (!r.canceled) setFile(r.assets[0]);
  };
  const submit = async () => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const form = new FormData();
      if (Platform.OS === 'web' && (file as any).file) form.append('file', (file as any).file, file.name);
      else form.append('file', { uri: file.uri, name: file.name, type: file.mimeType ?? 'text/csv' } as any);
      const units: Record<string, string> = {};
      f.units.split(',').map((s) => s.split('=')).forEach(([k, v]) => { if (k && v) units[k.trim()] = v.trim(); });
      Object.entries({ dataset_id: f.dataset_id, name: f.name, mission_or_study: f.mission_or_study, source_url: f.source_url, units_json: JSON.stringify(units) }).forEach(([k, v]) => form.append(k, v));
      const ds = await request<NasaDataset>('/nasa/import', { form, timeoutMs: 60000 });
      onDone(ds.id);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Card style={{ gap: space.md }}>
      <Row gap={8}><Feather name="upload" size={15} color={colors.cyan} /><Txt v="h3">Import a NASA export</Txt></Row>
      <Txt v="small">CSV, TSV or JSON with a timestamp/date column. Every numeric column becomes a variable. Units must come from the NASA source — they are never guessed.</Txt>
      <Row wrap gap={space.md}>
        <Field label="Dataset ID" value={f.dataset_id} onChangeText={(v) => setF({ ...f, dataset_id: v })} autoCapitalize="characters" />
        <Field label="Dataset name" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder="e.g. RR-6 ISS cabin telemetry" />
      </Row>
      <Row wrap gap={space.md}>
        <Field label="Mission or study" value={f.mission_or_study} onChangeText={(v) => setF({ ...f, mission_or_study: v })} placeholder="e.g. Rodent Research-6" />
        <Field label="Original NASA source URL" value={f.source_url} onChangeText={(v) => setF({ ...f, source_url: v })} autoCapitalize="none" />
      </Row>
      <Field label="Units (column=unit, comma separated)" value={f.units} onChangeText={(v) => setF({ ...f, units: v })} placeholder="ISS Temperature=°C, ISS CO2=mmHg" autoCapitalize="none" />
      <Row wrap gap={space.sm}>
        <Button small kind="ghost" icon="file" title={file ? file.name : 'Choose file'} onPress={pick} />
        <Button small icon="upload-cloud" title="Import" onPress={submit} loading={busy} disabled={!file || !f.name || !f.mission_or_study} />
      </Row>
      {err && <Notice tone="warning" text={err} />}
    </Card>
  );
}
