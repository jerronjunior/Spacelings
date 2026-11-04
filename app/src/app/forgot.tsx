import { Link } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { AuthFrame } from '@/components/AuthFrame';
import { Button, Field, Notice, Txt } from '@/components/ui';
import { request } from '@/lib/api';
import { colors, space } from '@/lib/theme';

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
