import { Feather } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, TextProps, TextStyle,
  View, ViewProps, ViewStyle,
} from 'react-native';
import { useLayout } from '@/lib/hooks';
import { colors, fonts, radius, severityColors, sourceColors, space } from '@/lib/theme';

// ---------------------------------------------------------------- typography
type Variant = 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'label' | 'mono' | 'metric';
const variantStyle: Record<Variant, TextStyle> = {
  h1: { fontFamily: fonts.displayBold, fontSize: 28, lineHeight: 34, color: colors.text, letterSpacing: -0.3 },
  h2: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: colors.text },
  h3: { fontFamily: fonts.display, fontSize: 16, lineHeight: 22, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text },
  small: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.text2 },
  label: { fontFamily: fonts.bodySemi, fontSize: 10.5, lineHeight: 14, color: colors.text2, letterSpacing: 1.4, textTransform: 'uppercase' },
  mono: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 17, color: colors.text2 },
  metric: { fontFamily: fonts.monoMedium, fontSize: 30, lineHeight: 36, color: colors.text, letterSpacing: -0.5 },
};

export function Txt({ v = 'body', style, color, ...p }: TextProps & { v?: Variant; color?: string }) {
  return <Text {...p} style={[variantStyle[v], color ? { color } : null, style]} />;
}

// ---------------------------------------------------------------- layout
export function Card({ style, glow, padded = true, ...p }: ViewProps & { glow?: boolean; padded?: boolean }) {
  return <View {...p} style={[s.card, padded && { padding: space.lg }, glow && s.glow, style]} />;
}

export function Row({ style, gap = space.sm, wrap, ...p }: ViewProps & { gap?: number; wrap?: boolean }) {
  return <View {...p} style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]} />;
}

export function Grid({ children, min = 220, gap = space.md }: { children: React.ReactNode; min?: number; gap?: number }) {
  // Responsive card grid: as many columns of at least `min` px as fit.
  const [w, setW] = React.useState(0);
  const cols = w ? Math.max(1, Math.floor((w + gap) / (min + gap))) : 1;
  const itemW = w ? (w - gap * (cols - 1)) / cols : undefined;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {React.Children.toArray(children).filter(Boolean).map((c, i) => (
        <View key={i} style={{ width: itemW ?? '100%' }}>{c}</View>
      ))}
    </View>
  );
}

export function Screen({ children, scroll = true, maxWidth = 1280 }: { children: React.ReactNode; scroll?: boolean; maxWidth?: number }) {
  const { isMobile } = useLayout();
  const inner = <View style={{ width: '100%', maxWidth, alignSelf: 'center', gap: space.lg, padding: isMobile ? space.lg : space.xl, paddingBottom: 120 }}>{children}</View>;
  return scroll ? <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>{inner}</ScrollView> : inner;
}

export function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }} wrap gap={space.md}>
      <View style={{ flexShrink: 1, gap: 2 }}>
        <Txt v="h2">{title}</Txt>
        {subtitle ? <Txt v="small">{subtitle}</Txt> : null}
      </View>
      {right}
    </Row>
  );
}

export function PageTitle({ eyebrow, title, subtitle, right }: { eyebrow?: string; title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }} wrap gap={space.md}>
      <View style={{ gap: 4, flexShrink: 1 }}>
        {eyebrow ? <Txt v="label" color={colors.cyan}>{eyebrow}</Txt> : null}
        <Txt v="h1">{title}</Txt>
        {subtitle ? <Txt v="small" style={{ maxWidth: 640 }}>{subtitle}</Txt> : null}
      </View>
      {right}
    </Row>
  );
}

// ---------------------------------------------------------------- controls
type BtnKind = 'primary' | 'ghost' | 'danger' | 'subtle';
export function Button({ title, onPress, kind = 'primary', icon, loading, disabled, small, style }: {
  title: string; onPress?: () => void; kind?: BtnKind; icon?: keyof typeof Feather.glyphMap; loading?: boolean;
  disabled?: boolean; small?: boolean; style?: ViewStyle;
}) {
  const k = {
    primary: { bg: colors.cyan, fg: '#03121C', border: colors.cyan },
    ghost: { bg: 'transparent', fg: colors.text, border: colors.border },
    subtle: { bg: colors.cyanSoft, fg: colors.cyan, border: 'transparent' },
    danger: { bg: colors.warningSoft, fg: colors.warning, border: 'transparent' },
  }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed, hovered }: any) => [
        s.btn, small && s.btnSmall,
        { backgroundColor: k.bg, borderColor: k.border, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        hovered && !disabled && (kind === 'primary' ? s.glow : { borderColor: colors.borderStrong }),
        style,
      ]}>
      {loading ? <ActivityIndicator size="small" color={k.fg} /> : icon ? <Feather name={icon} size={small ? 14 : 16} color={k.fg} /> : null}
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: small ? 12.5 : 14, color: k.fg }}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color = colors.text2 }: { icon: keyof typeof Feather.glyphMap; onPress: () => void; label: string; color?: string }) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} hitSlop={8}
      style={({ hovered }: any) => [s.iconBtn, hovered && { backgroundColor: colors.cyanSoft }]}>
      <Feather name={icon} size={18} color={color} />
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.seg} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={[s.segItem, on && s.segOn]}>
            <Text style={{ fontFamily: fonts.bodySemi, fontSize: 12.5, color: on ? colors.text : colors.text2 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, hint, error, unit, style, ...p }: TextInputProps & { label: string; hint?: string; error?: string | null; unit?: string }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <View style={{ gap: 6, flex: 1, minWidth: 140 }}>
      <Txt v="label">{label}</Txt>
      <View style={[s.input, focus && { borderColor: colors.cyan }, error ? { borderColor: colors.warning } : null]}>
        <TextInput
          placeholderTextColor={colors.text3}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          accessibilityLabel={label}
          {...p}
          style={[s.inputText, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any), style]}
        />
        {unit ? <Txt v="mono" style={{ paddingRight: 12 }}>{unit}</Txt> : null}
      </View>
      {error ? <Txt v="small" color={colors.warning}>{error}</Txt> : hint ? <Txt v="small" color={colors.text3}>{hint}</Txt> : null}
    </View>
  );
}

// ---------------------------------------------------------------- badges
export function Pill({ text, fg = colors.text2, bg = 'rgba(148,163,184,0.12)', icon, dot }: { text: string; fg?: string; bg?: string; icon?: keyof typeof Feather.glyphMap; dot?: boolean }) {
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} /> : null}
      {icon ? <Feather name={icon} size={11} color={fg} /> : null}
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: 10.5, letterSpacing: 0.8, color: fg, textTransform: 'uppercase' }}>{text}</Text>
    </View>
  );
}

export function SourceBadge({ source }: { source: string }) {
  const fg = sourceColors[source] ?? colors.text2;
  return <Pill text={source} fg={fg} bg={fg + '22'} dot />;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const c = severityColors[severity] ?? severityColors.info;
  return <Pill text={severity} fg={c.fg} bg={c.bg} icon={severity === 'warning' ? 'alert-octagon' : severity === 'caution' ? 'alert-triangle' : 'info'} />;
}

// ---------------------------------------------------------------- states
export function Loading({ label = 'Loading telemetry…' }: { label?: string }) {
  return (
    <Row style={{ padding: space.xl, justifyContent: 'center' }}>
      <ActivityIndicator color={colors.cyan} />
      <Txt v="small">{label}</Txt>
    </Row>
  );
}

export function Notice({ text, tone = 'info', icon }: { text: string; tone?: 'info' | 'caution' | 'warning' | 'ok' | 'purple'; icon?: keyof typeof Feather.glyphMap }) {
  const c = { info: colors.cyan, caution: colors.caution, warning: colors.warning, ok: colors.ok, purple: colors.purple }[tone];
  return (
    <View style={[s.notice, { borderColor: c + '55', backgroundColor: c + '12' }]}>
      <Feather name={icon ?? 'info'} size={15} color={c} style={{ marginTop: 2 }} />
      <Txt v="small" color={colors.text} style={{ flex: 1 }}>{text}</Txt>
    </View>
  );
}

export function Empty({ icon = 'inbox', title, text }: { icon?: keyof typeof Feather.glyphMap; title: string; text?: string }) {
  return (
    <View style={{ alignItems: 'center', padding: space.xl, gap: 8 }}>
      <View style={s.emptyIcon}><Feather name={icon} size={20} color={colors.cyan} /></View>
      <Txt v="h3">{title}</Txt>
      {text ? <Txt v="small" style={{ textAlign: 'center', maxWidth: 420 }}>{text}</Txt> : null}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}

export function KeyValue({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }} gap={space.md}>
      <Txt v="small">{k}</Txt>
      {typeof v === 'string' || typeof v === 'number' ? <Txt v={mono ? 'mono' : 'body'} color={colors.text} style={{ textAlign: 'right', flexShrink: 1 }}>{v}</Txt> : v}
    </Row>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.cardGlass,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web'
      ? ({ backdropFilter: 'blur(14px)', boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 18px 40px -24px rgba(0,0,0,0.8)' } as any)
      : { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 4 }),
  },
  glow: Platform.OS === 'web'
    ? ({ boxShadow: '0 0 0 1px rgba(0,212,255,0.35), 0 0 28px -6px rgba(0,212,255,0.45)' } as any)
    : { borderColor: colors.borderStrong, shadowColor: colors.cyan, shadowOpacity: 0.4, shadowRadius: 16 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18, height: 44, borderRadius: radius.md, borderWidth: 1 },
  btnSmall: { height: 34, paddingHorizontal: 12, borderRadius: radius.sm },
  iconBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', backgroundColor: 'rgba(6,11,24,0.6)', borderRadius: radius.md, padding: 3, borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start' },
  segItem: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  segOn: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong },
  input: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(6,11,24,0.55)', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, minHeight: 46 },
  inputText: { flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 15, paddingHorizontal: 14, paddingVertical: 11 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  notice: { flexDirection: 'row', gap: 10, padding: space.md, borderRadius: radius.md, borderWidth: 1 },
  emptyIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.cyanSoft, alignItems: 'center', justifyContent: 'center' },
});
