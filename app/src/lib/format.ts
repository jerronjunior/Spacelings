export function parseUtc(iso: string): Date {
  // Server timestamps are UTC; accept both "...Z" and naive forms.
  return new Date(/Z$|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + 'Z');
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const s = (Date.now() - parseUtc(iso).getTime()) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function fmtUtc(iso: string | null | undefined, withDate = true): string {
  if (!iso) return '—';
  const d = parseUtc(iso);
  const t = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  if (!withDate) return `${t} UTC`;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${t} UTC`;
}

export function fmtDay(iso: string): string {
  const d = parseUtc(iso);
  return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
}

export function uid(prefix = 'c'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
