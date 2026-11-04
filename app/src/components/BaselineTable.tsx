import React from 'react';
import { View } from 'react-native';
import { fmtUtc } from '@/lib/format';
import { MEASUREMENTS, MEASUREMENT_ORDER, fmtValue } from '@/lib/measurements';
import { colors, space } from '@/lib/theme';
import type { Astronaut } from '@/lib/types';
import { Divider, Row, Txt } from './ui';

export function BaselineTable({ a }: { a: Astronaut }) {
  return (
    <View style={{ gap: space.sm }}>
      <Row style={{ paddingVertical: 4 }}>
        <Txt v="label" style={{ flex: 1.4 }}>Indicator</Txt>
        <Txt v="label" style={{ flex: 1 }}>Median</Txt>
        <Txt v="label" style={{ flex: 1.3 }}>Range</Txt>
        <Txt v="label" style={{ flex: 0.6 }}>n</Txt>
      </Row>
      <Divider />
      {MEASUREMENT_ORDER.map((t) => {
        const b = a.baseline?.[t];
        return (
          <Row key={t} style={{ paddingVertical: 6 }}>
            <Txt v="body" style={{ flex: 1.4 }}>{MEASUREMENTS[t].label}</Txt>
            <Txt v="mono" color={colors.cyan} style={{ flex: 1 }}>{b ? `${fmtValue(t, b.median)} ${MEASUREMENTS[t].unit}` : '—'}</Txt>
            <Txt v="mono" color={colors.text} style={{ flex: 1.3 }}>{b ? `${fmtValue(t, b.low)}–${fmtValue(t, b.high)}` : 'building'}</Txt>
            <Txt v="mono" style={{ flex: 0.6 }}>{b?.n ?? 0}</Txt>
          </Row>
        );
      })}
      <Txt v="small" color={colors.text3}>
        Baselines use the median and MAD (robust spread) of readings from the last 21 days, excluding the most recent window.
        {a.baseline?.heart_rate ? ` Heart-rate period: ${fmtUtc(a.baseline.heart_rate.start)} → ${fmtUtc(a.baseline.heart_rate.end)}.` : ''}
        {' '}Ranges are statistical, personal and not clinical thresholds.
      </Txt>
    </View>
  );
}
