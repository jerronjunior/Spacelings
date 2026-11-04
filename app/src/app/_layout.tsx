import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SyncProvider } from '@/lib/sync';
import { colors } from '@/lib/theme';

function Providers({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  return <SyncProvider enabled={!!session}>{children}</SyncProvider>;
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
    SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold,
    JetBrainsMono_400Regular, JetBrainsMono_500Medium,
  });
  if (!loaded) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.cyan} /></View>;
  }
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Providers>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }} />
        </Providers>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
