import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { fmtUtc } from '@/lib/format';
import { useApi, useLayout } from '@/lib/hooks';
import { MEASUREMENTS, MEASUREMENT_ORDER, fmtValue } from '@/lib/measurements';
import { useSync } from '@/lib/sync';
import { colors, space } from '@/lib/theme';
import type { Baseline, MeasurementType, Reading } from '@/lib/types';
import { ChartLegend, TrendChart } from './Charts';
import { pendingReadings } from './Health';
import { Card, Loading, Notice, Row, Segmented, SourceBadge, Txt } from './ui';

const RANGES = [{ value: '24', label: '24 h' }, { value: '168', label: '7 days' }, { value: '720', label: '30 days' }] as const;
type Src = 'ALL' | 'SIMULATED' | 'MANUAL' | 'DEVICE';

export function HealthCharts({ aid, baseline, initialRange = '168', types = MEASUREMENT_ORDER }: {
  aid: string; baseline?: Partial<Record<MeasurementType, Baseline | null>>; initialRange?: '24' | '168' | '720'; types?: MeasurementType[];
}) {
  const [range, setRange] = useState<string>(initialRange);
  const [src, setSrc] = useState<Src>('ALL');
  const [only, setOnly] = useState<MeasurementType | 'all'>('all');
  const { isWide } = useLayout();
  const { queue } = useSync();
  const q = useApi<{ series: Record<string, Reading[]> }>(`/readings/history?astronaut_id=${aid}&hours=${range}&max_points=240`, [range]);
  const pending = useMemo(() => pendingReadings(queue, aid), [queue, aid]);

  const series = useMemo(() => {
    const out: Partial<Record<MeasurementType, Reading[]>> = {};
    for (const t of types) {
      let arr = [...(q.data?.series[t] ?? []), ...pending.filter((p) => p.type === t)];
      if (src !== 'ALL') arr = arr.filter((r) => r.source_type === src);
      out[t] = arr;
    }
    return out;
  }, [q.data, pending, src, types]);

  const shown = only === 'all' ? types : [only];
  return (
    <View style={{ gap: space.lg }}>
      <Row wrap gap={space.md} style={{ justifyContent: 'space-between' }}>
        <Segmented value={range} onChange={setRange} options={RANGES as any} />
        <Row wrap gap={space.md}>
          <Segmented value={only} onChange={setOnly} options={[{ value: 'all', label: 'All' }, ...types.map((t) => ({ value: t, label: MEASUREMENTS[t].short }))] as any} />
          <Segmented value={src} onChange={setSrc} options={[{ value: 'ALL', label: 'All sources' }, { value: 'SIMULATED', label: 'Simulated' }, { value: 'MANUAL', label: 'Manual' }]} />
        </Row>
      </Row>
      <ChartLegend />
      {q.fromCache && <Notice tone="caution" icon="wifi-off" text={`Offline — charts show data stored on board (cached ${fmtUtc(q.cachedAt)}). Queued entries are drawn with dashed rings.`} />}
      {q.loading && !q.data ? <Loading /> : q.error && !q.data ? <Notice tone="warning" text={q.error} /> : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
          {shown.map((t) => {
            const arr = series[t] ?? [];
            const last = arr.length ? [...arr].sort((a, b) => a.timestamp.localeCompare(b.timestamp))[arr.length - 1] : null;
            const bl = baseline?.[t] ?? null;
            const full = only !== 'all' || !isWide || !MEASUREMENTS[t].daily ? '100%' : '49.3%';
            return (
              <Card key={t} style={{ gap: space.md, width: full as any, flexGrow: 1 }}>
                <Row style={{ justifyContent: 'space-between' }} wrap>
                  <View style={{ gap: 2 }}>
                    <Txt v="h3">{MEASUREMENTS[t].label} history</Txt>
                    <Txt v="small">
                      {last ? `Current ${fmtValue(t, last.value)} ${MEASUREMENTS[t].unit} · ${fmtUtc(last.timestamp)}` : 'No readings in this period'}
                      {bl ? `  ·  Baseline ${fmtValue(t, bl.median)} (${fmtValue(t, bl.low)}–${fmtValue(t, bl.high)})` : ''}
                    </Txt>
                  </View>
                  <Row gap={6}>{Array.from(new Set(arr.map((r) => r.source_type))).map((s) => <SourceBadge key={s} source={s} />)}</Row>
                </Row>
                <TrendChart type={t} readings={arr} baseline={bl} height={MEASUREMENTS[t].daily ? 170 : 210} />
                {MEASUREMENTS[t].daily && <Txt v="small" color={colors.text3}>Recorded once per day.</Txt>}
              </Card>
            );
          })}
        </View>
      )}
    </View>
  );
}
