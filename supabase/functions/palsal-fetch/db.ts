/**
 * palsal_ 표 읽기·쓰기 — PostgREST 를 서버 키로(RLS 를 넘어 쓰기). 새 secret key 가 있으면 그걸, 없으면 예전 service_role.
 * (mandalartplan mandalart-draft 와 같은 키 읽기 방식)
 */
import type { Source } from './sources.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

function serverHeaders(): Record<string, string> {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, unknown>;
    if (typeof keys.default === 'string' && keys.default) return { apikey: keys.default };
  } catch {
    /* 아래 예전 키로 */
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return { apikey: legacy, Authorization: `Bearer ${legacy}` };
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...serverHeaders(), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`db ${init.method ?? 'GET'} ${path.split('?')[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

export async function select<T>(path: string): Promise<T[]> {
  return (await (await rest(path)).json()) as T[];
}

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  return (await (await rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })).json()) as T;
}

/** 묶어서 upsert(같은 키면 덮어쓰기) */
export async function upsert(table: string, rows: unknown[], onConflict: string, chunk = 50): Promise<void> {
  for (let i = 0; i < rows.length; i += chunk) {
    await rest(`${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + chunk)),
    });
  }
}

export async function patch(table: string, filter: string, body: Record<string, unknown>): Promise<void> {
  await rest(`${table}?${filter}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
}

export const inList = (values: string[]) => `in.(${values.map((v) => `"${v.replace(/"/g, '')}"`).join(',')})`;

// ---------------------------------------------------------------- 출처별 쉬기(429·5xx 뒤 5 → 10 → 20 → 최대 60분, 429 세 번 연속이면 30분 이상)

export interface FetchState {
  source: string;
  fail_count: number;
  rest_until: string | null;
  cursor: string | null;
}

export async function loadStates(): Promise<Map<string, FetchState>> {
  const rows = await select<FetchState>('palsal_fetch_state?select=source,fail_count,rest_until,cursor');
  return new Map(rows.map((r) => [r.source, r]));
}

export function resting(states: Map<string, FetchState>, source: Source, now: number): boolean {
  const s = states.get(source);
  return !!s?.rest_until && Date.parse(s.rest_until) > now;
}

export async function recordFailure(states: Map<string, FetchState>, source: Source, status: number, now: number): Promise<void> {
  const prev = states.get(source);
  const n = (prev?.fail_count ?? 0) + 1;
  let minutes = Math.min(5 * 2 ** (n - 1), 60);
  if (status === 429 && n >= 3) minutes = Math.max(minutes, 30);
  const row: FetchState = { source, fail_count: n, rest_until: new Date(now + minutes * 60_000).toISOString(), cursor: prev?.cursor ?? null };
  states.set(source, row);
  await upsert('palsal_fetch_state', [{ ...row, updated_at: new Date(now).toISOString() }], 'source');
}

export async function recordSuccess(states: Map<string, FetchState>, source: Source, now: number): Promise<void> {
  const prev = states.get(source);
  if (prev && prev.fail_count === 0 && !prev.rest_until) return;
  const row: FetchState = { source, fail_count: 0, rest_until: null, cursor: prev?.cursor ?? null };
  states.set(source, row);
  await upsert('palsal_fetch_state', [{ ...row, updated_at: new Date(now).toISOString() }], 'source');
}

export async function saveCursor(states: Map<string, FetchState>, source: string, cursor: string, now: number): Promise<void> {
  const prev = states.get(source);
  const row: FetchState = { source, fail_count: prev?.fail_count ?? 0, rest_until: prev?.rest_until ?? null, cursor };
  states.set(source, row);
  await upsert('palsal_fetch_state', [{ ...row, updated_at: new Date(now).toISOString() }], 'source');
}
