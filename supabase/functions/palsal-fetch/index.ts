/**
 * palsal-fetch — 출처에서 시세를 받아 palsal_ 표에 넣는 Edge Function (계약: contract/server.md)
 *
 * 모드(?mode=)
 *   run    — pg_cron 이 5분마다: tick → daily → market(30분이 지났을 때만). 평소엔 이것만 불려요
 *   tick   — 장이 열린 시장의 추적 종목 현재가(야후 spark 20종목씩 · 바이낸스 묶음) → palsal_quotes
 *   daily  — 봉이 새로 나온 시장(한국 16:10 KST · 미국 16:30 ET · 코인 00:05 UTC · 환율 15:30 UTC 뒤)의 오래된 봉부터
 *            한 번에 DAILY_PER_RUN 개(종목×봉 단위) → palsal_bars. 환율은 Frankfurter 로 현재가까지
 *   market — 시총 상위 60 일봉 RSI · 30 아래 목록 · 공포탐욕 3 → palsal_market (손으로 부르면 바로 다시 계산)
 *   new    — palsal_track 이 부를 때(body {symbols}). 처음 보는 종목(최대 12) 현재가·봉 즉시
 * 추적 = universe 60 + 처음 연 날 예시 4 + 코스피 지수(공포탐욕) + 최근 DEMAND_DAYS 안에 휴대폰이 읽은 종목.
 * 부르는 쪽(cron·palsal_track)은 Authorization: Bearer <PALSAL_CRON_KEY> — 다른 요청은 401.
 */
import { fearGreedLabel, fearGreedScore, headlineRsi, lastRsi, marketOfSymbol, withQuote, type ExchangeTz, type Interval, type Market, type MarketState } from '../_shared/calc.ts';
import { inList, loadStates, patch, recordFailure, recordSuccess, resting, rpc, saveCursor, select, upsert, type FetchState } from './db.ts';
import { binanceBars, binanceQuotes, cryptoFearGreed, frankfurterAll, SourceError, sleep, yahooBars, yahooQuotes, type BarsRow, type QuoteRow, type Source } from './sources.ts';

const CRON_KEY = Deno.env.get('PALSAL_CRON_KEY') ?? '';
const num = (name: string, def: number) => {
  const v = Number(Deno.env.get(name));
  return Number.isFinite(v) && v > 0 ? v : def;
};
const SPARK_BATCH = num('SPARK_BATCH', 20);
const DAILY_PER_RUN = num('DAILY_PER_RUN', 40);
const DEMAND_DAYS = num('DEMAND_DAYS', 14);
const MARKET_MINUTES = num('MARKET_MINUTES', 30);
/** 처음 연 날 예시 4종목(계약 v1.3) + 코스피 지수(한국 공포탐욕). SPY 는 미국 공포탐욕에도 써요 */
const ALWAYS = ['QQQ', 'SPY', '005930.KS', '000660.KS', '^KS11'];
const INTERVALS: Interval[] = ['1d', '1wk', '1mo'];
const MODES = ['run', 'tick', 'daily', 'market', 'new'] as const;
type Mode = (typeof MODES)[number];
type Log = Record<string, unknown>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

function authorized(req: Request): boolean {
  if (!CRON_KEY) return false;
  const h = req.headers.get('Authorization') ?? '';
  const given = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (given.length !== CRON_KEY.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ CRON_KEY.charCodeAt(i);
  return diff === 0;
}

const iso = (ms: number) => new Date(ms).toISOString();

// ---------------------------------------------------------------- 시각

function zoned(ms: number, tz: string): { weekday: number; minutes: number; seconds: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    seconds: Number(get('second')),
  };
}
const isWeekday = (wd: number) => wd >= 1 && wd <= 5;

/** 현재가를 받는 시간: 한국 평일 08:55–16:00 KST · 미국 평일 03:55–20:15 ET(프리·정규·애프터 + 마감 표시 한 번) · 코인 늘 · 환율은 daily */
function quoting(market: Market, now: number): boolean {
  if (market === 'CRYPTO') return true;
  if (market === 'FX') return false;
  const z = zoned(now, market === 'KR' ? 'Asia/Seoul' : 'America/New_York');
  if (!isWeekday(z.weekday)) return false;
  return market === 'KR' ? z.minutes >= 8 * 60 + 55 && z.minutes <= 16 * 60 : z.minutes >= 3 * 60 + 55 && z.minutes <= 20 * 60 + 15;
}

const READY: Record<Market, { tz: string; minutes: number; weekdays: boolean }> = {
  KR: { tz: 'Asia/Seoul', minutes: 16 * 60 + 10, weekdays: true },
  US: { tz: 'America/New_York', minutes: 16 * 60 + 30, weekdays: true },
  CRYPTO: { tz: 'UTC', minutes: 5, weekdays: false },
  FX: { tz: 'UTC', minutes: 15 * 60 + 30, weekdays: true },
};

/** 그 시장의 봉이 새로 나왔다고 보는 가장 최근 시각 — 이보다 먼저 받은 봉은 다시 받아요 */
function readyAt(market: Market, now: number): number {
  const spec = READY[market];
  for (let back = 0; back < 10; back++) {
    const probe = now - back * 86_400_000;
    const z = zoned(probe, spec.tz);
    if (spec.weekdays && !isWeekday(z.weekday)) continue;
    const ready = probe - (z.minutes - spec.minutes) * 60_000 - z.seconds * 1000;
    if (ready <= now) return ready;
  }
  return now - 7 * 86_400_000;
}

// ---------------------------------------------------------------- 추적 종목

interface UniverseRow {
  side: 'kr' | 'us';
  rank: number;
  symbol: string;
  version: string;
}

const universe = () => select<UniverseRow>('palsal_universe?select=side,rank,symbol,version&order=side.asc,rank.asc');

async function tracked(now: number): Promise<{ all: string[]; fixed: Set<string> }> {
  const since = iso(now - DEMAND_DAYS * 86_400_000);
  const [u, d] = await Promise.all([universe(), select<{ symbol: string }>(`palsal_demand?select=symbol&last_seen=gte.${since}&or=(not_found_until.is.null,not_found_until.lt.${iso(now)})`)]);
  const fixed = new Set([...ALWAYS, ...u.map((r) => r.symbol)]);
  return { all: [...new Set([...fixed, ...d.map((r) => r.symbol)])], fixed };
}

function byMarket(symbols: string[]): Record<Market, string[]> {
  const out: Record<Market, string[]> = { KR: [], US: [], CRYPTO: [], FX: [] };
  for (const s of symbols) out[marketOfSymbol(s)].push(s);
  return out;
}

/** 출처 하나로 일을 하다 막히면(429·5xx·연결 실패) 쉬기를 적고 그 출처는 이번 실행에서 그만 */
async function guarded<T>(states: Map<string, FetchState>, source: Source, now: number, log: Log, work: () => Promise<T>): Promise<T | null> {
  if (resting(states, source, now)) {
    log[`${source}_resting`] = states.get(source)?.rest_until;
    return null;
  }
  try {
    const out = await work();
    await recordSuccess(states, source, now);
    return out;
  } catch (e) {
    if (e instanceof SourceError) {
      await recordFailure(states, source, e.status, now);
      log[`${source}_error`] = e.message;
      return null;
    }
    throw e;
  }
}

async function markNotFound(symbols: string[], now: number): Promise<void> {
  if (!symbols.length) return;
  await patch('palsal_demand', `symbol=${inList(symbols)}`, { not_found_until: iso(now + 86_400_000) });
}

// ---------------------------------------------------------------- tick

async function tick(now: number, states: Map<string, FetchState>, log: Log): Promise<void> {
  const { all } = await tracked(now);
  const m = byMarket(all);
  const stocks = [...(quoting('KR', now) ? m.KR : []), ...(quoting('US', now) ? m.US : [])];
  const rows: QuoteRow[] = [];
  if (stocks.length) {
    await guarded(states, 'yahoo', now, log, async () => {
      for (let i = 0; i < stocks.length; i += SPARK_BATCH) {
        if (i) await sleep(300);
        rows.push(...(await yahooQuotes(stocks.slice(i, i + SPARK_BATCH), now)).rows);
      }
    });
  }
  if (m.CRYPTO.length) {
    const r = await guarded(states, 'binance', now, log, () => binanceQuotes(m.CRYPTO, now));
    if (r) rows.push(...r.rows);
  }
  await upsert('palsal_quotes', rows, 'symbol');
  log.tick = { stocks: stocks.length, crypto: m.CRYPTO.length, quotes: rows.length };
}

// ---------------------------------------------------------------- daily

async function daily(now: number, states: Map<string, FetchState>, log: Log, limit = DAILY_PER_RUN): Promise<void> {
  const { all, fixed } = await tracked(now);
  const keys = all.flatMap((s) => INTERVALS.map((i) => `${s}|${i}`));
  const updated = new Map<string, number>();
  for (let i = 0; i < keys.length; i += 80) {
    const rows = await select<{ key: string; updated_at: string }>(`palsal_bars?select=key,updated_at&key=${inList(keys.slice(i, i + 80))}`);
    for (const r of rows) updated.set(r.key, Date.parse(r.updated_at));
  }
  const ready = new Map<Market, number>((['KR', 'US', 'CRYPTO', 'FX'] as Market[]).map((mk) => [mk, readyAt(mk, now)]));
  const due = keys
    .filter((k) => {
      const u = updated.get(k);
      return u === undefined || u < ready.get(marketOfSymbol(k.split('|')[0]))!;
    })
    .sort((a, b) => (updated.get(a) ?? 0) - (updated.get(b) ?? 0))
    .slice(0, limit);

  const bars: BarsRow[] = [];
  const quotes: QuoteRow[] = [];
  const empty = new Set<string>();
  const fxDone = new Set<string>();
  for (const key of due) {
    const [symbol, interval] = key.split('|') as [string, Interval];
    const market = marketOfSymbol(symbol);
    if (market === 'FX') {
      if (fxDone.has(symbol)) continue;
      fxDone.add(symbol);
      const r = await guarded(states, 'frankfurter', now, log, () => frankfurterAll(symbol, now));
      if (r) {
        bars.push(...r.bars);
        quotes.push(r.quote);
      }
      continue;
    }
    const source: Source = market === 'CRYPTO' ? 'binance' : 'yahoo';
    if (resting(states, source, now)) continue;
    const row = await guarded(states, source, now, log, () => (source === 'binance' ? binanceBars(symbol, interval, now) : yahooBars(symbol, interval, now)));
    if (row) bars.push(row);
    else if (!resting(states, source, now)) empty.add(symbol);
    await sleep(source === 'yahoo' ? 250 : 100);
  }
  await upsert('palsal_bars', bars, 'key', 10);
  await upsert('palsal_quotes', quotes, 'symbol');
  await markNotFound([...empty].filter((s) => !fixed.has(s)), now);
  log.daily = { due: due.length, bars: bars.length, notFound: [...empty] };
}

// ---------------------------------------------------------------- market

interface MarketInput {
  key: string;
  tz: ExchangeTz;
  t_last: number;
  c: number[];
}
interface QuoteLite {
  symbol: string;
  price: number;
  change_pct: number;
  market_state: MarketState;
  fetched_at: string;
}

async function cryptoFg(states: Map<string, FetchState>, now: number, log: Log): Promise<{ score: number; date: string } | null> {
  const cur = states.get('alternative')?.cursor;
  let saved: { score: number; date: string; at: number } | null = null;
  try {
    saved = cur ? (JSON.parse(cur) as { score: number; date: string; at: number }) : null;
  } catch {
    saved = null;
  }
  if (saved && now - saved.at < 60 * 60_000) return saved;
  const fresh = await guarded(states, 'alternative', now, log, () => cryptoFearGreed());
  if (fresh) {
    await saveCursor(states, 'alternative', JSON.stringify({ ...fresh, at: now }), now);
    return fresh;
  }
  return saved;
}

async function market(now: number, states: Map<string, FetchState>, log: Log, force: boolean): Promise<void> {
  if (!force) {
    const last = await select<{ computed_at: string }>('palsal_market?select=computed_at&id=eq.1');
    if (last[0] && now - Date.parse(last[0].computed_at) < (MARKET_MINUTES - 2) * 60_000) {
      log.market = 'skip';
      return;
    }
  }
  const u = await universe();
  if (!u.length) {
    log.market = 'no universe';
    return;
  }
  const need = [...new Set([...u.map((r) => r.symbol), '^KS11', 'SPY'])];
  const [inputs, quotes] = await Promise.all([
    rpc<MarketInput[]>('palsal_market_inputs', { keys: need.map((s) => `${s}|1d`) }),
    select<QuoteLite>(`palsal_quotes?select=symbol,price,change_pct,market_state,fetched_at&symbol=${inList(need)}`),
  ]);
  const inBy = new Map(inputs.map((r) => [r.key.split('|')[0], r]));
  const qBy = new Map(quotes.map((q) => [q.symbol, q]));
  const closesOf = (symbol: string): number[] | null => {
    const b = inBy.get(symbol);
    if (!b || !b.c?.length) return null;
    const q = qBy.get(symbol);
    const merged = withQuote(
      { interval: '1d', tz: b.tz, t: b.c.map(() => b.t_last), c: b.c, l: b.c.slice() },
      q ? { price: q.price, marketState: q.market_state, fetchedAt: Date.parse(q.fetched_at) } : null,
    );
    return merged.c;
  };
  const rowOf = (r: UniverseRow) => {
    const c = closesOf(r.symbol);
    const q = qBy.get(r.symbol);
    return { symbol: r.symbol, rank: r.rank, rsi: c ? headlineRsi(lastRsi(c)) : null, close: q?.price ?? (c ? c[c.length - 1] : null), changePct: q?.change_pct ?? null };
  };
  const kr = u.filter((r) => r.side === 'kr').map(rowOf);
  const us = u.filter((r) => r.side === 'us').map(rowOf);
  const low = [...kr, ...us]
    .filter((r) => r.rsi !== null && r.rsi <= 30)
    .sort((a, b) => (a.rsi as number) - (b.rsi as number))
    .map((r) => r.symbol);
  const fg = (closes: number[] | null, basis: string) => {
    const score = closes ? fearGreedScore(closes) : null;
    return score === null ? { score: 50, label: fearGreedLabel(50), basis: '값을 아직 계산하지 못했어요' } : { score, label: fearGreedLabel(score), basis };
  };
  const crypto = await cryptoFg(states, now, log);
  const fetched = quotes.filter((q) => u.some((r) => r.symbol === q.symbol)).map((q) => Date.parse(q.fetched_at));
  const asOf = fetched.length ? Math.max(...fetched) : now;
  const payload = {
    schema: 1,
    asOf: iso(asOf),
    computedAt: iso(now),
    stale: now - asOf > 4 * 86_400_000,
    universeVersion: u[0].version,
    fearGreed: {
      kr: fg(closesOf('^KS11'), '코스피 RSI와 120일선 위치'),
      us: fg(closesOf('SPY'), 'SPY RSI와 120일선 위치'),
      crypto: crypto
        ? { score: crypto.score, label: fearGreedLabel(crypto.score), basis: 'alternative.me 코인 공포탐욕지수', attribution: '출처 alternative.me', sourceDate: crypto.date }
        : { score: 50, label: fearGreedLabel(50), basis: '코인 공포탐욕을 아직 받지 못했어요', attribution: '출처 alternative.me', sourceDate: iso(now).slice(0, 10) },
    },
    universe: { kr, us },
    low,
  };
  await upsert('palsal_market', [{ id: 1, payload, computed_at: iso(now) }], 'id');
  log.market = { kr: kr.length, us: us.length, low: low.length, withRsi: [...kr, ...us].filter((r) => r.rsi !== null).length };
}

// ---------------------------------------------------------------- new

const SYMBOL = /^\^?[A-Z0-9.=\-]{1,20}$/;

async function fetchNew(symbols: string[], now: number, states: Map<string, FetchState>, log: Log): Promise<void> {
  const list = [...new Set(symbols.filter((s) => typeof s === 'string' && SYMBOL.test(s)))].slice(0, 12);
  const m = byMarket(list);
  const quotes: QuoteRow[] = [];
  const bars: BarsRow[] = [];
  const missingQuote = new Set<string>();
  const stocks = [...m.KR, ...m.US];
  if (stocks.length) {
    const r = await guarded(states, 'yahoo', now, log, () => yahooQuotes(stocks, now));
    if (r) {
      quotes.push(...r.rows);
      r.missing.forEach((s) => missingQuote.add(s));
    }
  }
  if (m.CRYPTO.length) {
    const r = await guarded(states, 'binance', now, log, () => binanceQuotes(m.CRYPTO, now));
    if (r) {
      quotes.push(...r.rows);
      r.missing.forEach((s) => missingQuote.add(s));
    }
  }
  for (const s of m.FX) {
    const r = await guarded(states, 'frankfurter', now, log, () => frankfurterAll(s, now));
    if (r) {
      quotes.push(r.quote);
      bars.push(...r.bars);
    } else missingQuote.add(s);
  }
  for (const s of [...stocks, ...m.CRYPTO]) {
    if (missingQuote.has(s)) continue;
    for (const interval of INTERVALS) {
      const source: Source = m.CRYPTO.includes(s) ? 'binance' : 'yahoo';
      const row = await guarded(states, source, now, log, () => (source === 'binance' ? binanceBars(s, interval, now) : yahooBars(s, interval, now)));
      if (row) bars.push(row);
      await sleep(source === 'yahoo' ? 250 : 100);
    }
  }
  await upsert('palsal_quotes', quotes, 'symbol');
  await upsert('palsal_bars', bars, 'key', 10);
  const notFound = [...missingQuote].filter((s) => !resting(states, marketOfSymbol(s) === 'CRYPTO' ? 'binance' : marketOfSymbol(s) === 'FX' ? 'frankfurter' : 'yahoo', now));
  await markNotFound(notFound, now);
  log.new = { asked: list.length, quotes: quotes.length, bars: bars.length, notFound };
}

// ---------------------------------------------------------------- 들어오는 곳

Deno.serve(async (req: Request) => {
  const mode = new URL(req.url).searchParams.get('mode') as Mode | null;
  if (!mode || !(MODES as readonly string[]).includes(mode)) return json({ error: 'BAD_MODE', modes: MODES }, 400);
  if (!authorized(req)) return json({ error: 'UNAUTHORIZED' }, 401);
  const started = Date.now();
  const log: Log = { mode };
  const errors: string[] = [];
  const step = async (name: string, work: () => Promise<void>) => {
    try {
      await work();
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`);
    }
  };
  const states = await loadStates();
  const now = Date.now();
  if (mode === 'run' || mode === 'tick') await step('tick', () => tick(now, states, log));
  if (mode === 'run' || mode === 'daily') await step('daily', () => daily(now, states, log));
  if (mode === 'run' || mode === 'market') await step('market', () => market(now, states, log, mode === 'market'));
  if (mode === 'new') {
    const body = (await req.json().catch(() => ({}))) as { symbols?: unknown };
    const symbols = Array.isArray(body.symbols) ? (body.symbols as string[]) : [];
    await step('new', () => fetchNew(symbols, now, states, log));
  }
  if (errors.length) log.errors = errors;
  log.ms = Date.now() - started;
  console.log(JSON.stringify(log));
  return json(log, errors.length ? 500 : 200);
});
