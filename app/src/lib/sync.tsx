/**
 * Offline-first layer.
 *  - Link status: ONLINE / OFFLINE / SYNCING, from NetInfo + a server heartbeat
 *    (+ a "simulate communication loss" switch for the demo).
 *  - Synchronization queue persisted on the device (check-ins, readings, acknowledgements).
 *  - Each queued item carries a client_uid; the server ignores uids it has already stored,
 *    so retries after a dropped connection never create duplicates.
 *  - Onboard alerts from the local engine are kept in a local alert history.
 */
import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { NetworkError, request, setForcedOffline } from './api';
import { load, save } from './storage';
import type { Alert } from './types';

export type LinkStatus = 'ONLINE' | 'OFFLINE' | 'SYNCING';

export interface QueueItem {
  uid: string;
  kind: 'checkin' | 'reading' | 'ack';
  astronaut_id: string;
  payload: any;
  created_at: string;
  attempts: number;
  last_error?: string;
}

interface SyncCtx {
  status: LinkStatus;
  queue: QueueItem[];
  lastSyncAt: string | null;
  lastSyncReport: string | null;
  simulatedOffline: boolean;
  setSimulatedOffline: (v: boolean) => void;
  enqueue: (item: Omit<QueueItem, 'attempts' | 'created_at'>) => Promise<void>;
  syncNow: () => Promise<void>;
  version: number; // bumps after every successful sync so screens refetch
  localAlerts: Alert[];
  saveLocalAlert: (a: Alert) => Promise<void>;
  ackLocalAlert: (id: string) => Promise<void>;
}

const Ctx = createContext<SyncCtx | null>(null);

export function SyncProvider({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const [netUp, setNetUp] = useState(true);
  const [serverUp, setServerUp] = useState(true);
  const [simulatedOffline, setSim] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSyncReport, setReport] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [localAlerts, setLocalAlerts] = useState<Alert[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const localAlertsRef = useRef<Alert[]>([]);
  const busy = useRef(false);

  const online = netUp && serverUp && !simulatedOffline;
  const status: LinkStatus = syncing ? 'SYNCING' : online ? 'ONLINE' : 'OFFLINE';

  useEffect(() => {
    (async () => {
      const q = await load<QueueItem[]>('queue', []);
      queueRef.current = q;
      setQueue(q);
      const sim = await load<boolean>('simulatedOffline', false);
      setForcedOffline(sim);
      setSim(sim);
      setLastSyncAt(await load<string | null>('lastSyncAt', null));
      localAlertsRef.current = await load<Alert[]>('localAlerts', []);
      setLocalAlerts(localAlertsRef.current);
    })();
    return NetInfo.addEventListener((s) => setNetUp(s.isConnected !== false));
  }, []);

  const persistQueue = async (q: QueueItem[]) => {
    queueRef.current = q;
    setQueue(q);
    await save('queue', q);
  };

  // Heartbeat: NetInfo only knows about the local network; this checks the ground link itself.
  useEffect(() => {
    let alive = true;
    const ping = async () => {
      try {
        await request('/health', { timeoutMs: 5000 });
        if (alive) setServerUp(true);
      } catch (e) {
        if (alive && e instanceof NetworkError) setServerUp(false);
      }
    };
    ping();
    const t = setInterval(ping, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [simulatedOffline]);

  const syncNow = useCallback(async () => {
    if (busy.current || !enabled) return;
    busy.current = true;
    const pending = [...queueRef.current];
    if (!pending.length) {
      busy.current = false;
      setVersion((v) => v + 1);
      return;
    }
    setSyncing(true);
    let sent = 0, dup = 0;
    const failed: QueueItem[] = [];
    const touched = new Set<string>();
    try {
      for (const item of pending.filter((i) => i.kind === 'checkin')) {
        try {
          const r = await request('/checkins', { body: { ...item.payload, client_uid: item.uid, created_offline: true } });
          r.status === 'duplicate' ? dup++ : sent++;
          touched.add(item.astronaut_id);
        } catch (e: any) {
          if (e instanceof NetworkError) throw e;
          failed.push({ ...item, attempts: item.attempts + 1, last_error: e.message });
        }
      }
      const readings = pending.filter((i) => i.kind === 'reading');
      if (readings.length) {
        const r = await request('/readings/bulk', { body: { readings: readings.map((i) => ({ ...i.payload, client_uid: i.uid })) } });
        sent += r.accepted;
        dup += r.duplicate;
        readings.forEach((i) => touched.add(i.astronaut_id));
      }
      for (const item of pending.filter((i) => i.kind === 'ack')) {
        try {
          await request(`/alerts/${item.payload.alert_id}/acknowledge`, { method: 'POST' });
          sent++;
        } catch (e: any) {
          if (e instanceof NetworkError) throw e;
          failed.push({ ...item, attempts: item.attempts + 1, last_error: e.message });
        }
      }
      // Ground engine re-runs on the newly synchronized data.
      for (const aid of touched) await request('/analysis/analyze', { body: { astronaut_id: aid } }).catch(() => {});
      // Onboard alerts are now superseded by the ground engine's analysis of the synchronized data.
      if (touched.size) {
        const resolved = localAlertsRef.current.map((a) => (touched.has(a.astronaut_id) && a.status === 'open'
          ? { ...a, status: 'acknowledged' as const, acknowledged_by: 'Superseded after sync — ground engine re-analysed', acknowledged_at: new Date().toISOString() } : a));
        localAlertsRef.current = resolved;
        setLocalAlerts(resolved);
        save('localAlerts', resolved);
      }
      const done = new Set(pending.map((p) => p.uid));
      await persistQueue([...queueRef.current.filter((q) => !done.has(q.uid)), ...failed]);
      const at = new Date().toISOString();
      setLastSyncAt(at);
      save('lastSyncAt', at);
      setReport(`${sent} item${sent === 1 ? '' : 's'} synchronized${dup ? `, ${dup} duplicate${dup === 1 ? '' : 's'} skipped` : ''}${failed.length ? `, ${failed.length} rejected` : ''}.`);
      setVersion((v) => v + 1);
    } catch {
      setReport('Link lost during synchronization — items stay queued.');
    } finally {
      setSyncing(false);
      busy.current = false;
    }
  }, [enabled]);

  // Automatic synchronization when the link comes back.
  const prevOnline = useRef(online);
  useEffect(() => {
    if (online && !prevOnline.current) syncNow();
    prevOnline.current = online;
  }, [online, syncNow]);

  const enqueue = useCallback(async (item: Omit<QueueItem, 'attempts' | 'created_at'>) => {
    if (queueRef.current.some((q) => q.uid === item.uid)) return; // local duplicate prevention
    await persistQueue([...queueRef.current, { ...item, attempts: 0, created_at: new Date().toISOString() }]);
    if (online) syncNow();
  }, [online, syncNow]);

  const setSimulatedOffline = (v: boolean) => {
    setForcedOffline(v);
    setSim(v);
    save('simulatedOffline', v);
  };

  const saveLocalAlert = async (a: Alert) => {
    const others = localAlertsRef.current.filter((x) => x.id !== a.id);
    const next = [a, ...others].slice(0, 50);
    localAlertsRef.current = next;
    setLocalAlerts(next);
    await save('localAlerts', next);
  };
  const ackLocalAlert = async (id: string) => {
    const next = localAlertsRef.current.map((a) => (a.id === id ? { ...a, status: 'acknowledged' as const, acknowledged_by: 'Crew (onboard)', acknowledged_at: new Date().toISOString() } : a));
    localAlertsRef.current = next;
    setLocalAlerts(next);
    await save('localAlerts', next);
  };

  return (
    <Ctx.Provider value={{ status, queue, lastSyncAt, lastSyncReport, simulatedOffline, setSimulatedOffline, enqueue, syncNow, version, localAlerts, saveLocalAlert, ackLocalAlert }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSync() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSync outside SyncProvider');
  return c;
}
