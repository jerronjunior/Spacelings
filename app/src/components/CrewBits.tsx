import React from 'react';
import { View } from 'react-native';
import { colors } from '@/lib/theme';
import type { Astronaut } from '@/lib/types';
import { Pill } from './ui';

export const commLabel: Record<Astronaut['comm_status'], { text: string; fg: string }> = {
  nominal: { text: 'Link nominal', fg: colors.ok },
  delayed: { text: 'Delayed', fg: colors.caution },
  loss_of_signal: { text: 'Loss of signal', fg: colors.warning },
  no_contact: { text: 'No contact', fg: colors.text3 },
};

export function HealthStatusPill({ a }: { a: Astronaut }) {
  const s = a.health_status ?? 'nominal';
  const c = s === 'attention' ? (a.top_severity === 'warning' ? colors.warning : colors.caution) : s === 'review' ? colors.cyan : colors.ok;
  return <Pill text={s === 'attention' ? 'Needs attention' : s === 'review' ? 'Review' : 'Nominal'} fg={c} bg={c + '22'} dot />;
}

export function CommPill({ a }: { a: Astronaut }) {
  const c = commLabel[a.comm_status];
  return <Pill text={c.text} fg={c.fg} bg={c.fg + '1F'} icon={a.comm_status === 'nominal' ? 'radio' : 'wifi-off'} />;
}

export function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(148,163,184,0.12)' }}>
      <View style={{ width: `${max ? (value / max) * 100 : 0}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}
