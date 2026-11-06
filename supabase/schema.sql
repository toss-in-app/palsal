-- palsal(팔껄살껄) 시세 표 — palsal 전용 Supabase 프로젝트(vksqtugrlkzmkjsgosej, 서울 ap-northeast-2), public 스키마 palsal_ 접두사
-- 2026-11-05 사용자 결정: mandalartplan 프로젝트와 따로(출시 중인 앱 DB 와 섞지 않음, 무료 프로젝트 2개 중 마지막 자리).
-- 계약: contract/server.md · quotes.schema.json · bars.schema.json · market.schema.json
-- 적용: supabase db query --remote --yes -f supabase/schema.sql (여러 번 돌려도 같게 — if not exists · or replace)
-- 서버가 출처에서 받아 넣고(Edge Function palsal-fetch, 서버 키), 휴대폰은 읽기만(publishable key, RLS select).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists public.palsal_symbols (
  symbol text primary key check (symbol ~ '^\^?[A-Z0-9.=\-]{1,20}$'),
  market text not null check (market in ('KR', 'US', 'CRYPTO', 'FX'))
);
comment on table public.palsal_symbols is 'static/symbols.json 을 옮겨 둔 것 — palsal_track 은 여기 있는 심볼만 받아요(아무 문자열로 서버가 출처를 부르지 않게). 8단계 배포 스크립트가 채움';

create table if not exists public.palsal_quotes (
  symbol text primary key references public.palsal_symbols (symbol),
  price double precision not null check (price > 0),
  prev_close double precision not null check (prev_close > 0),
  change_pct double precision not null,
  market_state text not null check (market_state in ('PRE', 'REGULAR', 'POST', 'CLOSED', '24H')),
  ext_session text check (ext_session in ('pre', 'post')),
  ext_price double precision check (ext_price > 0),
  ext_change_pct double precision,
  source text not null check (source in ('yahoo', 'binance', 'frankfurter')),
  fetched_at timestamptz not null
);

-- v1.13: 원천의 마지막 체결 시각(한국 주식·지수는 야후가 약 20분 늦게 줘요 — 화면 '기준' 시각은 이것)
alter table public.palsal_quotes add column if not exists market_time timestamptz;

create table if not exists public.palsal_bars (
  key text primary key,
  symbol text not null references public.palsal_symbols (symbol),
  interval text not null check (interval in ('1d', '1wk', '1mo')),
  currency text not null check (currency in ('KRW', 'USD', 'JPY')),
  tz text not null check (tz in ('Asia/Seoul', 'America/New_York', 'UTC')),
  source text not null check (source in ('yahoo', 'binance', 'frankfurter')),
  t bigint[] not null,
  c double precision[] not null,
  l double precision[] not null,
  high5y double precision not null check (high5y > 0),
  updated_at timestamptz not null,
  check (key = symbol || '|' || interval),
  check (cardinality(t) between 1 and 530 and cardinality(c) = cardinality(t) and cardinality(l) = cardinality(t))
);

create table if not exists public.palsal_market (
  id int primary key check (id = 1),
  payload jsonb not null,
  computed_at timestamptz not null
);

create table if not exists public.palsal_demand (
  symbol text primary key references public.palsal_symbols (symbol),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  not_found_until timestamptz
);

-- 시장 탭 시총 상위(static/universe.json 을 옮겨 둔 것, scripts/server-seed.mjs 가 채움)
create table if not exists public.palsal_universe (
  side text not null check (side in ('kr', 'us', 'crypto')),
  rank int not null check (rank between 1 and 30),
  symbol text not null references public.palsal_symbols (symbol),
  version text not null,
  primary key (side, rank)
);

create table if not exists public.palsal_fetch_state (
  source text primary key,
  fail_count int not null default 0,
  rest_until timestamptz,
  cursor text,
  updated_at timestamptz not null default now()
);

-- 읽기 권한: 휴대폰(anon)은 quotes·bars·market 만 select
alter table public.palsal_symbols enable row level security;
alter table public.palsal_quotes enable row level security;
alter table public.palsal_bars enable row level security;
alter table public.palsal_market enable row level security;
alter table public.palsal_demand enable row level security;
alter table public.palsal_fetch_state enable row level security;
alter table public.palsal_universe enable row level security;
-- v1.15: 주요 코인(side 'crypto') — 이미 만든 표의 check 도 바꿔요(여러 번 돌려도 같게)
alter table public.palsal_universe drop constraint if exists palsal_universe_side_check;
alter table public.palsal_universe add constraint palsal_universe_side_check check (side in ('kr', 'us', 'crypto'));

drop policy if exists palsal_quotes_read on public.palsal_quotes;
create policy palsal_quotes_read on public.palsal_quotes for select to anon, authenticated using (true);
drop policy if exists palsal_bars_read on public.palsal_bars;
create policy palsal_bars_read on public.palsal_bars for select to anon, authenticated using (true);
drop policy if exists palsal_market_read on public.palsal_market;
create policy palsal_market_read on public.palsal_market for select to anon, authenticated using (true);
-- symbols·demand·fetch_state·universe 는 정책 없음 = anon 접근 불가(서버·RPC 만)

-- 시장 계산 입력: 종가 배열과 마지막 봉 시각만(봉 전체를 읽지 않아 전송량을 줄여요). 서버 키만
create or replace function public.palsal_market_inputs(keys text[])
returns table (key text, tz text, t_last bigint, c double precision[])
language sql
stable
security definer
set search_path = public
as $$
  select b.key, b.tz, b.t[cardinality(b.t)], b.c from palsal_bars b where b.key = any(keys)
$$;
revoke all on function public.palsal_market_inputs(text[]) from public, anon, authenticated;
grant execute on function public.palsal_market_inputs(text[]) to service_role;

-- 휴대폰이 '이 종목들 지켜봐 줘'. 아는 심볼만, 한 번에 12개까지.
-- 앱은 담은 종목을 하루 한 번 알려요(시총 상위·예시 종목은 빼고) → last_seen 이 갱신돼 서버가 계속 지켜봐요(palsal-fetch DEMAND_DAYS 14일).
-- 새 종목 · 14일 넘게 아무도 알리지 않아 추적에서 빠졌던 종목 · 현재가가 없는 종목은 서버를 바로 깨워(10분에 60개까지) 몇 초 안에
-- 새로 받고, 그 목록을 돌려줘요 — 앱은 그 종목의 오래된 봉을 쓰지 않고 잠깐 뒤 다시 읽어요. (2026-11-06: 반환 int → text[], 계약 v1.12)
drop function if exists public.palsal_track(text[]);
create function public.palsal_track(symbols text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  s text;
  prev_seen timestamptz;
  fresh text[] := '{}';
  recent_new int;
begin
  if symbols is null or cardinality(symbols) = 0 then
    return '{}';
  end if;
  if cardinality(symbols) > 12 then
    raise exception 'palsal_track: 한 번에 12개까지' using errcode = '22023';
  end if;
  foreach s in array symbols loop
    continue when not exists (select 1 from palsal_symbols where symbol = s);
    continue when exists (select 1 from palsal_demand where symbol = s and not_found_until > now());
    select d.last_seen into prev_seen from palsal_demand d where d.symbol = s;
    insert into palsal_demand (symbol) values (s)
      on conflict (symbol) do update set last_seen = now();
    if prev_seen is null or prev_seen < now() - interval '14 days' or not exists (select 1 from palsal_quotes where symbol = s) then
      fresh := array_append(fresh, s);
    end if;
  end loop;
  select count(*) into recent_new from palsal_demand where first_seen > now() - interval '10 minutes';
  if cardinality(fresh) = 0 or recent_new > 60 then
    return '{}';
  end if;
  -- 서버를 바로 깨워요(vault 의 palsal_fetch_url · palsal_cron_key — supabase/cron.sql 앞에서 넣음)
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'palsal_fetch_url') || '?mode=new',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'palsal_cron_key')),
    body := jsonb_build_object('symbols', fresh),
    timeout_milliseconds := 120000);
  return fresh;
end;
$$;
revoke all on function public.palsal_track(text[]) from public;
grant execute on function public.palsal_track(text[]) to anon, authenticated;

-- 예약 작업은 supabase/cron.sql(vault 비밀 값을 넣은 뒤 한 번)
