import { Feather } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { useLayout } from '@/lib/hooks';
import { LinkStatus, useSync } from '@/lib/sync';
import { colors, fonts, radius, space } from '@/lib/theme';
import { LogoMark, SpaceBackground, Wordmark } from './Brand';
import { Row, Txt } from './ui';

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  badge?: number;
  exact?: boolean;
}

const statusStyle: Record<LinkStatus, { fg: string; icon: keyof typeof Feather.glyphMap; text: string }> = {
  ONLINE: { fg: colors.ok, icon: 'wifi', text: 'ONLINE' },
  OFFLINE: { fg: colors.caution, icon: 'wifi-off', text: 'OFFLINE' },
  SYNCING: { fg: colors.cyan, icon: 'refresh-cw', text: 'SYNCING' },
};

export function LinkStatusChip({ compact }: { compact?: boolean }) {
  const { status, queue } = useSync();
  const st = statusStyle[status];
  return (
    <View style={[styles.chip, { borderColor: st.fg + '55', backgroundColor: st.fg + '14' }]} accessibilityLabel={`Link status ${st.text}, ${queue.length} queued`}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: st.fg }} />
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1, color: st.fg }}>{st.text}</Text>
      {!compact && queue.length > 0 && <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.text2 }}>· {queue.length} queued</Text>}
    </View>
  );
}

function UtcClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return <Txt v="mono">{now.toISOString().slice(11, 16)} UTC</Txt>;
}

function isActive(path: string, item: NavItem) {
  return item.exact ? path === item.href : path === item.href || path.startsWith(item.href + '/');
}

export function AppShell({ nav, area, children }: { nav: NavItem[]; area: string; children: React.ReactNode }) {
  const { isDesktop, isMobile } = useLayout();
  const path = usePathname();
  const router = useRouter();
  const { session, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const doLogout = async () => {
    await logout();
    router.replace('/login');
  };

  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
        <SpaceBackground />
        <View style={styles.sidebar}>
          <View style={{ paddingHorizontal: space.lg, paddingVertical: space.xl }}><Wordmark size={15} /></View>
          <Txt v="label" style={{ paddingHorizontal: space.xl, marginBottom: space.sm }} color={colors.text3}>{area}</Txt>
          <View style={{ gap: 4, paddingHorizontal: space.md }}>
            {nav.map((n) => {
              const on = isActive(path, n);
              return (
                <Pressable key={n.href} onPress={() => router.push(n.href as any)} accessibilityRole="link" accessibilityState={{ selected: on }}
                  style={({ hovered }: any) => [styles.sideItem, on && styles.sideOn, hovered && !on && { backgroundColor: 'rgba(148,163,184,0.06)' }]}>
                  {on && <View style={styles.sideBar} />}
                  <Feather name={n.icon} size={17} color={on ? colors.cyan : colors.text2} />
                  <Text style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: on ? colors.text : colors.text2 }}>{n.label}</Text>
                  {n.badge ? <Badge n={n.badge} /> : null}
                </Pressable>
              );
            })}
          </View>
          <View style={{ flex: 1 }} />
          <View style={styles.sideFooter}>
            <View style={styles.avatar}><Feather name={session?.user.role === 'astronaut' ? 'user' : 'radio'} size={15} color={colors.cyan} /></View>
            <View style={{ flex: 1 }}>
              <Txt v="body" numberOfLines={1} style={{ fontFamily: fonts.bodySemi, fontSize: 13 }}>{session?.user.display_name}</Txt>
              <Txt v="small" numberOfLines={1}>{session?.user.role.replace('_', ' ')}</Txt>
            </View>
            <Pressable onPress={doLogout} accessibilityLabel="Sign out" hitSlop={8}><Feather name="log-out" size={17} color={colors.text2} /></Pressable>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.topbar}>
            <Txt v="label" color={colors.text3}>Decision-support prototype · not a medical device</Txt>
            <Row gap={space.lg}><UtcClock /><LinkStatusChip /></Row>
          </View>
          <View style={{ flex: 1 }}>{children}</View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SpaceBackground />
      <View style={[styles.mobileTop, { paddingTop: insets.top + 10 }]}>
        <Row gap={10}>
          <LogoMark size={28} />
          <Text style={{ fontFamily: fonts.displayBold, fontSize: 14, letterSpacing: 2.4, color: colors.text }}>SPACELINGS</Text>
        </Row>
        <Row gap={10}>
          {!isMobile && <UtcClock />}
          <LinkStatusChip compact={isMobile} />
          <Pressable onPress={doLogout} accessibilityLabel="Sign out" hitSlop={8}><Feather name="log-out" size={18} color={colors.text2} /></Pressable>
        </Row>
      </View>
      <View style={{ flex: 1 }}>{children}</View>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {nav.map((n) => {
          const on = isActive(path, n);
          return (
            <Pressable key={n.href} onPress={() => router.push(n.href as any)} style={styles.bottomItem} accessibilityRole="tab" accessibilityLabel={n.label} accessibilityState={{ selected: on }}>
              <View style={[styles.bottomIcon, on && { backgroundColor: colors.cyanSoft }]}>
                <Feather name={n.icon} size={19} color={on ? colors.cyan : colors.text2} />
                {n.badge ? <View style={{ position: 'absolute', top: -3, right: -6 }}><Badge n={n.badge} /></View> : null}
              </View>
              <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 10.5, color: on ? colors.text : colors.text3 }}>{n.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <View style={styles.badge}><Text style={{ fontFamily: fonts.monoMedium, fontSize: 10, color: '#1A0B10' }}>{n > 9 ? '9+' : n}</Text></View>
  );
}

const styles = StyleSheet.create({
  sidebar: { width: 248, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: 'rgba(6,11,24,0.72)', ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(12px)' } as any) : {}) },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, height: 42, borderRadius: radius.md },
  sideOn: { backgroundColor: colors.cyanSoft },
  sideBar: { position: 'absolute', left: -12, top: 10, bottom: 10, width: 3, borderRadius: 2, backgroundColor: colors.cyan },
  sideFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardGlass },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cyanSoft, alignItems: 'center', justifyContent: 'center' },
  topbar: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, borderBottomWidth: 1, borderBottomColor: colors.border },
  mobileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: 'rgba(6,11,24,0.8)' },
  bottom: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: 'rgba(8,14,30,0.96)', paddingTop: 8 },
  bottomItem: { flex: 1, alignItems: 'center', gap: 3 },
  bottomIcon: { width: 44, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 28, borderRadius: 14, borderWidth: 1 },
  badge: { minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.warning, alignItems: 'center', justifyContent: 'center' },
});
