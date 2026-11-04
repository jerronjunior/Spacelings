import React from 'react';
import { HealthCharts } from '@/components/HealthCharts';
import { Loading, Notice, PageTitle, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import type { Astronaut } from '@/lib/types';

export default function Health() {
  const { session } = useAuth();
  const aid = session!.user.astronaut_id!;
  const p = useApi<Astronaut>(`/astronauts/${aid}`);
  return (
    <Screen>
      <PageTitle eyebrow="Health monitoring" title="Measurement history"
        subtitle="Every reading keeps its provenance: SIMULATED (generator), MANUAL (check-in) or DEVICE (sensor). Simulated and actual readings are drawn differently and never blended." />
      {p.loading && !p.data ? <Loading /> : p.data ? <HealthCharts aid={aid} baseline={p.data.baseline} /> : <Notice tone="warning" text={p.error ?? 'Unavailable'} />}
    </Screen>
  );
}
