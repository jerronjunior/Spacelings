import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { apiBase, defaultApiBase, setApiBase } from '@/lib/api';
import { useLayout } from '@/lib/hooks';
import { colors, space } from '@/lib/theme';
import { SpaceBackground, Wordmark } from './Brand';
import { Button, Card, Field, Row, Txt } from './ui';

/** Shared frame for login / register / forgot-password, with an editable server address. */
export function AuthFrame({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  const { isDesktop } = useLayout();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SpaceBackground />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space.lg }}>
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 64 : space.xl, alignItems: isDesktop ? 'center' : 'stretch', maxWidth: 1080, width: '100%', alignSelf: 'center' }}>
            <View style={{ flex: isDesktop ? 1 : undefined, gap: space.lg }}>
              <Wordmark size={isDesktop ? 24 : 18} tagline />
              {isDesktop && (
                <View style={{ gap: space.md, marginTop: space.xl }}>
                  <Txt v="h1" style={{ fontSize: 38, lineHeight: 46 }}>Health monitoring for long-duration missions.</Txt>
                  <Txt v="body" color={colors.text2} style={{ maxWidth: 460 }}>
                    Each astronaut is compared with their own personal baseline. The Crew Context Engine flags sustained changes,
                    explains the evidence and points to the right checklist — on board, even without a link to the ground.
                  </Txt>
                  <Row gap={space.xl} style={{ marginTop: space.md }}>
                    {[['Personal', 'baselines'], ['Offline', 'first'], ['NASA', 'research data']].map(([a, b]) => (
                      <View key={a}><Txt v="h3" color={colors.cyan}>{a}</Txt><Txt v="small">{b}</Txt></View>
                    ))}
                  </Row>
                </View>
              )}
            </View>
            <Card style={{ width: '100%', maxWidth: isDesktop ? 440 : undefined, alignSelf: 'center', gap: space.lg, padding: space.xl }}>
              <View style={{ gap: 4 }}>
                <Txt v="h2">{title}</Txt>
                {subtitle ? <Txt v="small">{subtitle}</Txt> : null}
              </View>
              {children}
              <ServerSetting />
            </Card>
          </View>
          <Txt v="small" color={colors.text3} style={{ textAlign: 'center', marginTop: space.xl }}>
            Decision-support prototype for NASA Space Apps Challenge 2026 · not a medical device · does not diagnose
          </Txt>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function ServerSetting() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(apiBase());
  const [saved, setSaved] = useState(false);
  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button">
        <Txt v="small" color={colors.text3}>Server: <Txt v="mono" color={colors.text2}>{apiBase()}</Txt> · change</Txt>
      </Pressable>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <Field label="Backend server URL" value={url} onChangeText={(t) => { setUrl(t); setSaved(false); }} autoCapitalize="none" autoCorrect={false}
        hint="On a phone, use your computer's LAN address, e.g. http://192.168.1.20:8000" />
      <Row gap={8}>
        <Button small title={saved ? 'Saved' : 'Save'} icon="check" kind="subtle" onPress={async () => { await setApiBase(url.trim() || null); setSaved(true); }} />
        <Button small title="Reset" kind="ghost" onPress={async () => { await setApiBase(null); setUrl(defaultApiBase()); setSaved(true); }} />
      </Row>
    </View>
  );
}
