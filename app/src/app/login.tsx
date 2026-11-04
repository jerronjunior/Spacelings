import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { AuthFrame } from '@/components/AuthFrame';
import { Button, Divider, Field, Notice, Row, Txt } from '@/components/ui';
import { NetworkError } from '@/lib/api';
import { DEMO_ACCOUNTS, useAuth } from '@/lib/auth';
import { colors, space } from '@/lib/theme';

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = async (e: string, p: string, key: string) => {
    setBusy(key);
    setError(null);
    try {
      const s = await login(e.trim(), p);
      router.replace(s.user.role === 'astronaut' ? '/crew' : '/control');
    } catch (err: any) {
      setError(err instanceof NetworkError ? 'Cannot reach the SPACELINGS server. Start the backend or check the server address below.' : err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <AuthFrame title="Sign in" subtitle="Astronaut app and Mission Control share one secure backend.">
      <View style={{ gap: space.md }}>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@mission.space" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" placeholder="••••••••" onSubmitEditing={() => go(email, password, 'form')} />
        {error && <Notice tone="warning" icon="alert-circle" text={error} />}
        <Button title="Sign in" icon="log-in" onPress={() => go(email, password, 'form')} loading={busy === 'form'} disabled={!email || !password} />
        <Row style={{ justifyContent: 'space-between' }} wrap>
          <Link href="/forgot"><Txt v="small" color={colors.cyan}>Forgot password?</Txt></Link>
          <Link href="/register"><Txt v="small" color={colors.cyan}>Create an account</Txt></Link>
        </Row>
      </View>
      <Divider />
      <View style={{ gap: space.sm }}>
        <Txt v="label">Demo mode · no external services needed</Txt>
        <Button kind="subtle" icon="user" title="Demo astronaut · SIM-01" loading={busy === 'astro'} onPress={() => go(DEMO_ACCOUNTS.astronaut.email, DEMO_ACCOUNTS.astronaut.password, 'astro')} />
        <Button kind="ghost" icon="radio" title="Demo Mission Control" loading={busy === 'mc'} onPress={() => go(DEMO_ACCOUNTS.control.email, DEMO_ACCOUNTS.control.password, 'mc')} />
      </View>
    </AuthFrame>
  );
}
