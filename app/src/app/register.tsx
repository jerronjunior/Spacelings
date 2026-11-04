import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { AuthFrame } from '@/components/AuthFrame';
import { Button, Field, Notice, Segmented, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, space } from '@/lib/theme';

export default function Register() {
  const { register } = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<'astronaut' | 'mission_control'>('astronaut');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pwError = password && password.length < 8 ? 'At least 8 characters' : null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await register({ email: email.trim(), password, display_name: name.trim(), role, invite_code: invite || undefined });
      router.replace(s.user.role === 'astronaut' ? '/crew' : '/control');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame title="Create an account" subtitle="Volunteers receive an anonymous ID (VOL-xxx). Your name is only shown to you.">
      <View style={{ gap: space.md }}>
        <Segmented value={role} onChange={setRole} options={[{ value: 'astronaut', label: 'Astronaut / volunteer' }, { value: 'mission_control', label: 'Mission Control' }]} />
        <Field label="Display name" value={name} onChangeText={setName} placeholder="e.g. Sam" />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry error={pwError} hint="Stored as a bcrypt hash" />
        {role === 'mission_control' && <Field label="Invite code" value={invite} onChangeText={setInvite} autoCapitalize="characters" hint="Demo invite code: SPACEAPPS2026" />}
        {error && <Notice tone="warning" icon="alert-circle" text={error} />}
        <Button title="Create account" icon="user-plus" onPress={submit} loading={busy} disabled={!name || !email || password.length < 8} />
        <Link href="/login"><Txt v="small" color={colors.cyan}>Already have an account? Sign in</Txt></Link>
      </View>
    </AuthFrame>
  );
}
