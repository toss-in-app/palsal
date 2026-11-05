import { supabaseSource } from './supabase';
import type { MarketSource } from './types';

/*
 * 시세 출처 고르기.
 * - `npm run dev`: 예시 데이터(data/fixture.ts). 서버(8단계)를 띄운 뒤엔 .env.local 에 VITE_MARKET_SOURCE=supabase 로 진짜 표를 읽어요.
 * - 출시 번들: Supabase(.env 의 VITE_SUPABASE_URL · VITE_SUPABASE_PUBLISHABLE_KEY — 둘 다 공개 값).
 * import.meta.env.DEV 가 false 인 번들에서는 예시 데이터 코드가 통째로 빠져요.
 */
export async function createMarketSource(): Promise<MarketSource> {
  if (import.meta.env.DEV && import.meta.env.VITE_MARKET_SOURCE !== 'supabase') {
    const { fixtureSource } = await import('./fixture');
    return fixtureSource();
  }
  return supabaseSource(import.meta.env.VITE_SUPABASE_URL ?? '', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '');
}

export type { BarsRow, MarketSource, QuoteRow } from './types';
