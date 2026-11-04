import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

export default function Index() {
  const { ready, session } = useAuth();
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}><ActivityIndicator color={colors.cyan} /></View>;
  if (!session) return <Redirect href="/login" />;
  return <Redirect href={session.user.role === 'astronaut' ? '/crew' : '/control'} />;
}
