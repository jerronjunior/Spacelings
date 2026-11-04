import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { cachedGet } from './api';
import { useSync } from './sync';
import { breakpoints } from './theme';

/** Fetch a GET endpoint with offline cache. Refetches after each sync and when the link changes. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const { version, status } = useSync();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!path) return;
    const my = ++seq.current;
    setLoading(true);
    try {
      const r = await cachedGet<T>(path);
      if (my !== seq.current) return;
      setData(r.data);
      setFromCache(r.fromCache);
      setCachedAt(r.at);
      setError(null);
    } catch (e: any) {
      if (my !== seq.current) return;
      setError(e?.message || 'Request failed');
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [path]);

  const linkUp = status !== 'OFFLINE';
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, version, linkUp, ...deps]);

  return { data, error, loading, fromCache, cachedAt, reload, setData };
}

export function useLayout() {
  const { width } = useWindowDimensions();
  return {
    width,
    isDesktop: width >= breakpoints.desktop,
    isTablet: width >= breakpoints.tablet && width < breakpoints.desktop,
    isMobile: width < breakpoints.tablet,
    isWide: width >= breakpoints.tablet,
  };
}
