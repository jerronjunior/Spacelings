import { Redirect, Slot } from 'expo-router';
import React from 'react';
import { AppShell, NavItem } from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { useSync } from '@/lib/sync';
import type { Alert } from '@/lib/types';

export default function CrewLayout() {
  const { ready, session } = useAuth();
  const { localAlerts } = useSync();
  const alerts = useApi<Alert[]>(session?.user.role === 'astronaut' ? '/alerts?status=open' : null);
  if (!ready) return null;
  if (!session) return <Redirect href="/login" />;
  if (session.user.role !== 'astronaut') return <Redirect href="/control" />;
  const open = (alerts.data?.length ?? 0) + localAlerts.filter((a) => a.status === 'open').length;
  const nav: NavItem[] = [
    { href: '/crew', label: 'Dashboard', icon: 'home', exact: true },
    { href: '/crew/health', label: 'Health', icon: 'activity' },
    { href: '/crew/checkin', label: 'Check-in', icon: 'edit-3' },
    { href: '/crew/alerts', label: 'Alerts', icon: 'bell', badge: open },
    { href: '/crew/profile', label: 'Profile', icon: 'user' },
  ];
  return <AppShell nav={nav} area="Astronaut"><Slot /></AppShell>;
}
