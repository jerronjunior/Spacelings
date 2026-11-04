import { Redirect, Slot } from 'expo-router';
import React from 'react';
import { AppShell, NavItem } from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import type { Alert } from '@/lib/types';

export default function ControlLayout() {
  const { ready, session } = useAuth();
  const isControl = session?.user.role === 'mission_control' || session?.user.role === 'admin';
  const alerts = useApi<Alert[]>(isControl ? '/alerts?status=open' : null);
  if (!ready) return null;
  if (!session) return <Redirect href="/login" />;
  if (!isControl) return <Redirect href="/crew" />;
  const nav: NavItem[] = [
    { href: '/control', label: 'Overview', icon: 'grid', exact: true },
    { href: '/control/crew', label: 'Crew', icon: 'users' },
    { href: '/control/alerts', label: 'Alerts', icon: 'bell', badge: alerts.data?.length },
    { href: '/control/research', label: 'NASA Research', icon: 'database' },
  ];
  return <AppShell nav={nav} area="Mission Control"><Slot /></AppShell>;
}
