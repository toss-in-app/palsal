import { asMarketPayload, isBarsRow, isQuoteRow, validRows, type MarketSource } from './types';

/*
 * Supabase 시세 표 읽기(계약 server.md '휴대폰이 읽는 법'). 휴대폰은 읽기만 하고, 쓰는 건 서버(pg_cron → palsal-fetch)예요.
 * 헤더는 publishable key 를 apikey 로만 보내요(새 키 체계 — Authorization 헤더 없이).
 */

const TIMEOUT_MS = 8000;

export class SourceError extends Error {
  constructor(
    readonly endpoint: 'quotes' | 'bars' | 'track' | 'market',
    readonly code: string,
  ) {
    super(`${endpoint} ${code}`);
  }
}

/** PostgREST in 목록 — 값마다 큰따옴표로 감싸고 통째로 인코딩해요(^ · = · . 이 든 심볼) */
export function inList(values: string[]): string {
  return encodeURIComponent(`(${values.map((v) => `"${v}"`).join(',')})`);
}

export function supabaseSource(baseUrl: string, publishableKey: string): MarketSource {
  async function call(endpoint: 'quotes' | 'bars' | 'track' | 'market', path: string, init?: RequestInit): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${baseUrl}/rest/v1/${path}`, {
        ...init,
        signal: ctrl.signal,
        headers: { apikey: publishableKey, Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
      });
      if (!res.ok) throw new SourceError(endpoint, String(res.status));
      return res.status === 204 ? null : await res.json();
    } catch (e) {
      if (e instanceof SourceError) throw e;
      throw new SourceError(endpoint, ctrl.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async quotes(symbols) {
      if (!symbols.length) return [];
      return validRows(await call('quotes', `palsal_quotes?select=*&symbol=in.${inList(symbols)}`), isQuoteRow);
    },
    async bars(keys) {
      if (!keys.length) return [];
      return validRows(await call('bars', `palsal_bars?select=*&key=in.${inList(keys)}`), isBarsRow);
    },
    async track(symbols) {
      if (!symbols.length) return;
      await call('track', 'rpc/palsal_track', { method: 'POST', body: JSON.stringify({ symbols: symbols.slice(0, 12) }) });
    },
    async market() {
      const rows = await call('market', 'palsal_market?select=payload&id=eq.1');
      return Array.isArray(rows) && rows.length ? asMarketPayload((rows[0] as { payload?: unknown }).payload) : null;
    },
  };
}
