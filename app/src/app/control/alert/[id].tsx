import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { AlertDetailScreen } from '@/components/AlertScreens';

export default function ControlAlert() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AlertDetailScreen id={String(id)} base="/control" control />;
}
