import React from 'react';
import { CrewDashboard } from '@/components/CrewDashboard';
import { DemoPanel } from '@/components/DemoPanel';
import { useOnboardEngine } from '@/components/Health';
import { Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function CrewHome() {
  const { session } = useAuth();
  const aid = session!.user.astronaut_id!;
  useOnboardEngine(aid); // local analysis keeps working during communication loss
  return (
    <Screen>
      <CrewDashboard aid={aid} base="/crew" />
      {aid === 'SIM-01' && <DemoPanel base="/crew" />}
    </Screen>
  );
}
