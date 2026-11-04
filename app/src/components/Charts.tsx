/**
 * Lightweight SVG charts (react-native-svg works on iOS, Android and web).
 * - Personal baseline drawn as a shaded band with a dashed median.
 * - Provenance visible: SIMULATED as a purple trace, MANUAL/DEVICE as distinct markers.
 * - Hover (web) / touch-drag (mobile) shows the nearest reading.
 */
import React, { useMemo, useState } from 'react';
import { GestureResponderEvent, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { fmtDay, fmtUtc, parseUtc } from '@/lib/format';
import { MEASUREMENTS, fmtValue } from '@/lib/measurements';
import { colors, fonts, sourceColors } from '@/lib/theme';
import type { Baseline, MeasurementType, Reading } from '@/lib/types';
import { Row, Txt } from './ui';

const PAD = { l: 42, r: 12, t: 12, b: 26 };

function niceTicks(min: number, max: number, n = 4) {
  const span = max - min || 1;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

interface ChartProps {
  type: MeasurementType;
  readings: Reading[];
  baseline?: Baseline | null;
  height?: number;
  hours?: number;
  compact?: boolean;
}

export function TrendChart({ type, readings, baseline, height = 220, compact }: ChartProps) {
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const meta = MEASUREMENTS[type];
  const pts = useMemo(() => readings.map((r) => ({ ...r, t: parseUtc(r.timestamp).getTime() })).sort((a, b) => a.t - b.t), [readings]);
  if (!pts.length) {
    return <View style={{ height, alignItems: 'center', justifyContent: 'center' }}><Txt v="small">No readings in this period.</Txt></View>;
  }
  const vals = pts.map((p) => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (baseline) { lo = Math.min(lo, baseline.low); hi = Math.max(hi, baseline.high); }
  const padV = (hi - lo) * 0.12 || 1;
  lo -= padV; hi += padV;
  if (type === 'spo2') hi = Math.min(hi, 100.5);
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
  const iw = Math.max(1, w - PAD.l - PAD.r), ih = height - PAD.t - PAD.b;
  const x = (t: number) => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * iw;
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * ih;

  const sim = pts.filter((p) => p.source_type === 'SIMULATED');
  const real = pts.filter((p) => p.source_type !== 'SIMULATED');
  const path = (arr: typeof pts) => arr.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = sim.length > 1 ? `${path(sim)} L${x(sim[sim.length - 1].t)},${PAD.t + ih} L${x(sim[0].t)},${PAD.t + ih} Z` : '';
  const ticks = niceTicks(lo, hi, compact ? 3 : 4);
  const xTicks = Array.from({ length: compact ? 3 : 5 }, (_, i) => t0 + ((t1 - t0) * i) / ((compact ? 3 : 5) - 1));
  const spanH = (t1 - t0) / 3600_000;

  const pick = (lx: number) => {
    let best = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = Math.abs(x(p.t) - lx); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  };
  const hp = hover !== null ? pts[hover] : null;
  const touch = (e: GestureResponderEvent) => pick(e.nativeEvent.locationX);

  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ height }}
      onStartShouldSetResponder={() => true}
      onResponderGrant={touch}
      onResponderMove={touch}
      onResponderRelease={() => setTimeout(() => setHover(null), 1800)}
      {...({ onPointerMove: (e: any) => pick(e.nativeEvent.offsetX ?? e.nativeEvent.locationX), onPointerLeave: () => setHover(null) } as any)}
      accessibilityLabel={`${meta.label} chart with ${pts.length} readings`}
    >
      {w > 0 && (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id={`fill-${type}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.purple} stopOpacity="0.28" />
              <Stop offset="1" stopColor={colors.purple} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {ticks.map((tv) => (
            <G key={tv}>
              <Line x1={PAD.l} x2={w - PAD.r} y1={y(tv)} y2={y(tv)} stroke={colors.border} strokeWidth={1} />
              <SvgText x={PAD.l - 8} y={y(tv) + 4} fill={colors.text3} fontSize={10} fontFamily={fonts.mono} textAnchor="end">{+tv.toFixed(2)}</SvgText>
            </G>
          ))}
          {baseline && (
            <G>
              <Rect x={PAD.l} width={iw} y={y(baseline.high)} height={Math.max(1, y(baseline.low) - y(baseline.high))} fill={colors.cyan} opacity={0.07} />
              <Line x1={PAD.l} x2={w - PAD.r} y1={y(baseline.median)} y2={y(baseline.median)} stroke={colors.cyan} strokeOpacity={0.6} strokeDasharray="5 5" strokeWidth={1} />
            </G>
          )}
          {xTicks.map((tt, i) => (
            <SvgText key={i} x={x(tt)} y={height - 8} fill={colors.text3} fontSize={10} fontFamily={fonts.mono}
              textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}>
              {spanH <= 36 ? fmtUtc(new Date(tt).toISOString(), false).replace(' UTC', '') : fmtDay(new Date(tt).toISOString())}
            </SvgText>
          ))}
          {area ? <Path d={area} fill={`url(#fill-${type})`} /> : null}
          {sim.length > 1 && <Path d={path(sim)} stroke={colors.purple} strokeWidth={1.6} fill="none" strokeLinejoin="round" />}
          {sim.length === 1 && <Circle cx={x(sim[0].t)} cy={y(sim[0].value)} r={3} fill={colors.purple} />}
          {meta.daily && sim.map((p, i) => <Circle key={'d' + i} cx={x(p.t)} cy={y(p.value)} r={2.6} fill={colors.purple} />)}
          {real.map((p, i) => (
            <G key={'r' + i}>
              <Circle cx={x(p.t)} cy={y(p.value)} r={6} fill={sourceColors[p.source_type]} opacity={0.18} />
              <Circle cx={x(p.t)} cy={y(p.value)} r={3.4} fill={colors.bg} stroke={sourceColors[p.source_type]} strokeWidth={2} strokeDasharray={p.pending ? '2 2' : undefined} />
            </G>
          ))}
          {hp && (
            <G>
              <Line x1={x(hp.t)} x2={x(hp.t)} y1={PAD.t} y2={PAD.t + ih} stroke={colors.text2} strokeOpacity={0.4} />
              <Circle cx={x(hp.t)} cy={y(hp.value)} r={4.5} fill={sourceColors[hp.source_type]} stroke={colors.text} strokeWidth={1.5} />
            </G>
          )}
        </Svg>
      )}
      {hp && w > 0 && (
        <View pointerEvents="none" style={{
          position: 'absolute', top: 4, left: Math.min(Math.max(x(hp.t) - 80, 4), w - 164), width: 160,
          backgroundColor: colors.cardGlassStrong, borderColor: colors.borderStrong, borderWidth: 1, borderRadius: 10, padding: 8, gap: 2,
        }}>
          <Txt v="mono" color={colors.text}>{fmtValue(type, hp.value)} {meta.unit}{hp.aggregated ? ` · avg of ${hp.aggregated}` : ''}</Txt>
          <Txt v="small">{fmtUtc(hp.timestamp)}</Txt>
          <Txt v="small" color={sourceColors[hp.source_type]}>{hp.source_type}{hp.pending ? ' · queued' : ''}</Txt>
        </View>
      )}
    </View>
  );
}

export function ChartLegend({ baseline = true }: { baseline?: boolean }) {
  return (
    <Row wrap gap={14}>
      <LegendItem color={colors.purple} label="Simulated" line />
      <LegendItem color={colors.cyan} label="Manual entry" ring />
      <LegendItem color={colors.ok} label="Device" ring />
      {baseline && <LegendItem color={colors.cyan} label="Personal baseline range" band />}
    </Row>
  );
}

function LegendItem({ color, label, line, ring, band }: { color: string; label: string; line?: boolean; ring?: boolean; band?: boolean }) {
  return (
    <Row gap={6}>
      <Svg width={18} height={10}>
        {line && <Line x1={0} x2={18} y1={5} y2={5} stroke={color} strokeWidth={2} />}
        {ring && <Circle cx={9} cy={5} r={3.5} fill={colors.bg} stroke={color} strokeWidth={2} />}
        {band && <Rect x={0} y={0} width={18} height={10} fill={color} opacity={0.18} rx={2} />}
      </Svg>
      <Txt v="small">{label}</Txt>
    </Row>
  );
}

/** Tiny trend line for metric cards. */
export function Sparkline({ values, width = 96, height = 32, color = colors.cyan }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return <View style={{ width, height }} />;
  const lo = Math.min(...values), hi = Math.max(...values);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - lo) / (hi - lo || 1)) * (height - 4)).toFixed(1)}`).join(' ');
  return (
    <Svg width={width} height={height}>
      <Path d={d} stroke={color} strokeWidth={1.6} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

/** Simple bar chart for NASA daily series or counts; colour reflects the NASA category. */
export function SeriesChart({ series, unit, height = 240 }: { series: { name: string; color: string; points: { t: string; v: number }[] }[]; unit: string; height?: number }) {
  const [w, setW] = useState(0);
  const all = series.flatMap((s) => s.points);
  if (!all.length) return <View style={{ height, justifyContent: 'center', alignItems: 'center' }}><Txt v="small">No observations stored.</Txt></View>;
  const ts = all.map((p) => parseUtc(p.t).getTime());
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  let lo = Math.min(...all.map((p) => p.v)), hi = Math.max(...all.map((p) => p.v));
  const pv = (hi - lo) * 0.15 || 1; lo -= pv; hi += pv;
  const iw = Math.max(1, w - PAD.l - PAD.r), ih = height - PAD.t - PAD.b;
  const x = (t: number) => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * iw;
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * ih;
  const ticks = niceTicks(lo, hi, 4);
  return (
    <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityLabel={`Chart in ${unit}`}>
      {w > 0 && (
        <Svg width={w} height={height}>
          {ticks.map((tv) => (
            <G key={tv}>
              <Line x1={PAD.l} x2={w - PAD.r} y1={y(tv)} y2={y(tv)} stroke={colors.border} />
              <SvgText x={PAD.l - 8} y={y(tv) + 4} fill={colors.text3} fontSize={10} fontFamily={fonts.mono} textAnchor="end">{+tv.toFixed(2)}</SvgText>
            </G>
          ))}
          {[t0, (t0 + t1) / 2, t1].map((tt, i) => (
            <SvgText key={i} x={x(tt)} y={height - 8} fill={colors.text3} fontSize={10} fontFamily={fonts.mono} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>
              {new Date(tt).toISOString().slice(0, 10)}
            </SvgText>
          ))}
          {series.map((s) => {
            const pts = [...s.points].sort((a, b) => a.t.localeCompare(b.t));
            const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(parseUtc(p.t).getTime())},${y(p.v)}`).join(' ');
            return (
              <G key={s.name}>
                <Path d={d} stroke={s.color} strokeWidth={1.8} fill="none" />
                {pts.map((p, i) => <Circle key={i} cx={x(parseUtc(p.t).getTime())} cy={y(p.v)} r={2.6} fill={s.color} />)}
              </G>
            );
          })}
        </Svg>
      )}
    </View>
  );
}
