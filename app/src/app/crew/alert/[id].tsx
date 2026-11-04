import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { AlertDetailScreen } from '@/components/AlertScreens';

export default function CrewAlert() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AlertDetailScreen id={String(id)} base="/crew" />;
}
