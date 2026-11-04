// HTTP client for the SPACELINGS FastAPI backend, with an offline response cache.
import { Platform } from 'react-native';
import { load, save } from './storage';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export class NetworkError extends Error {}

let token: string | null = null;
let baseOverride: string | null = null;
let forcedOffline = false; // set by the "simulate communication loss" switch

export function setToken(t: string | null) {
  token = t;
}
export function setForcedOffline(v: boolean) {
  forcedOffline = v;
}
export function isForcedOffline() {
  return forcedOffline;
}

export function defaultApiBase(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return 'http://localhost:8000';
}

export function apiBase(): string {
  return baseOverride || defaultApiBase();
}

export async function initApiBase() {
  baseOverride = await load<string | null>('apiBase', null);
}

export async function setApiBase(url: string | null) {
  baseOverride = url ? url.replace(/\/$/, '') : null;
  await save('apiBase', baseOverride);
}

function detailToMessage(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: any) => (typeof d?.msg === 'string' ? d.msg.replace(/^Value error, /, '') : JSON.stringify(d)))
      .join('\n');
  }
  return 'Request failed';
}

export async function request<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData; timeoutMs?: number } = {}): Promise<T> {
  if (forcedOffline) throw new NetworkError('Offline (simulated communication loss)');
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12000);
  let res: Response;
  try {
    res = await fetch(apiBase() + path, {
      method: opts.method || (opts.body || opts.form ? 'POST' : 'GET'),
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: ctrl.signal,
    });
  } catch {
    throw new NetworkError('Cannot reach the SPACELINGS server');
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) throw new ApiError(res.status, detailToMessage(data?.detail ?? res.statusText));
  return data as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

export interface Cached<T> {
  data: T;
  at: string;
  fromCache: boolean;
}

/** GET with cache: online responses are stored; when offline the last stored copy is returned. */
export async function cachedGet<T>(path: string): Promise<Cached<T>> {
  try {
    const data = await request<T>(path);
    const at = new Date().toISOString();
    save('cache:' + path, { data, at });
    return { data, at, fromCache: false };
  } catch (e) {
    if (e instanceof NetworkError) {
      const hit = await load<{ data: T; at: string } | null>('cache:' + path, null);
      if (hit) return { ...hit, fromCache: true };
    }
    throw e;
  }
}
