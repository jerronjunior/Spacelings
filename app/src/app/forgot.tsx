import { Link } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { AuthFrame } from '@/components/AuthFrame';
import { Button, Field, Notice, Txt } from '@/components/ui';
import { request } from '@/lib/api';
import { colors, space } from '@/lib/theme';

function ResetSatellite() {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotateY = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['-18deg', '342deg'],
  });
  const orbitRotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View
      accessible
      accessibilityLabel="Animated three-dimensional reset satellite"
      style={styles.satellite}
      pointerEvents="none"
    >
      <Animated.View style={[styles.orbit, { transform: [{ rotate: orbitRotate }] }]} />
      <Animated.View style={[styles.orbit, styles.orbitTilted, { transform: [{ rotate: orbitRotate }] }]} />
      <Animated.View style={[styles.planet, { transform: [{ perspective: 700 }, { rotateY }] }]}>
        <View style={styles.planetHighlight} />
        <View style={styles.signalLine} />
      </Animated.View>
      <Animated.View style={[styles.moon, { transform: [{ rotate: orbitRotate }] }]}>
        <View style={styles.moonDot} />
      </Animated.View>
    </View>
  );
}

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [pw, setPw] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'request' | 'reset' | 'done'>('request');
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    setBusy(true); setError(null);
    try {
      const r = await request('/auth/forgot-password', { body: { email: email.trim() } });
      setInfo(r.demo_reset_token ? `${r.message} ${r.demo_notice}` : r.message);
      if (r.demo_reset_token) setToken(r.demo_reset_token);
      setStage('reset');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const reset = async () => {
    setBusy(true); setError(null);
    try {
      const r = await request('/auth/reset-password', { body: { token: token.trim(), new_password: pw } });
      setInfo(r.message); setStage('done');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <AuthFrame title="Reset password" subtitle="A production deployment emails a reset link. This prototype has no email service, so demo mode shows the token here.">
      <View style={{ gap: space.md }}>
        <ResetSatellite />
        {stage === 'request' && <>
          <Field label="Account email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Button title="Request reset" icon="send" onPress={ask} loading={busy} disabled={!email} />
        </>}
        {info && <Notice tone={stage === 'done' ? 'ok' : 'info'} text={info} />}
        {stage === 'reset' && <>
          <Field label="Reset token" value={token} onChangeText={setToken} autoCapitalize="none" multiline style={{ minHeight: 70, fontSize: 12 }} />
          <Field label="New password" value={pw} onChangeText={setPw} secureTextEntry error={pw && pw.length < 8 ? 'At least 8 characters' : null} />
          <Button title="Set new password" icon="lock" onPress={reset} loading={busy} disabled={!token || pw.length < 8} />
        </>}
        {error && <Notice tone="warning" icon="alert-circle" text={error} />}
        <Link href="/login"><Txt v="small" color={colors.cyan}>Back to sign in</Txt></Link>
      </View>
    </AuthFrame>
  );
}

const styles = StyleSheet.create({
  satellite: {
    alignSelf: 'center',
    height: 142,
    width: 220,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: space.xs,
  },
  orbit: {
    position: 'absolute',
    width: 196,
    height: 76,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.55)',
    transform: [{ rotate: '-18deg' }],
  },
  orbitTilted: {
    width: 166,
    height: 106,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    transform: [{ rotate: '62deg' }],
  },
  planet: {
    width: 70,
    height: 70,
    borderRadius: 35,
    overflow: 'hidden',
    backgroundColor: colors.blue,
    borderWidth: 1,
    borderColor: 'rgba(63, 227, 255, 0.9)',
    shadowColor: colors.cyan,
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  planetHighlight: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
    top: -12,
    left: -8,
    backgroundColor: 'rgba(63, 227, 255, 0.45)',
  },
  signalLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 33,
    height: 2,
    backgroundColor: colors.text,
    opacity: 0.9,
    transform: [{ rotate: '-8deg' }],
  },
  moon: {
    position: 'absolute',
    width: 196,
    height: 76,
    justifyContent: 'flex-start',
    alignItems: 'center',
    transform: [{ rotate: '-18deg' }],
  },
  moonDot: {
    width: 11,
    height: 11,
    marginTop: 1,
    borderRadius: 6,
    backgroundColor: colors.cyan,
    borderWidth: 2,
    borderColor: colors.bg,
  },
});
