-- palsal(팔껄살껄) 시세 표 — Supabase 서울 프로젝트(elpwdczwgcjbkqqjxpuh)에 함께, public 스키마 palsal_ 접두사
-- 계약: contract/server.md · quotes.schema.json · bars.schema.json · market.schema.json
-- 4단계에선 파일만. 적용은 8단계: supabase db query --linked -f supabase/schema.sql
-- 서버가 출처에서 받아 넣고(Edge Function palsal-fetch, service role), 휴대폰은 읽기만(publishable key, RLS select).

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
  check (cardinality(t) between 1 and 430 and cardinality(c) = cardinality(t) and cardinality(l) = cardinality(t))
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

drop policy if exists palsal_quotes_read on public.palsal_quotes;
create policy palsal_quotes_read on public.palsal_quotes for select to anon, authenticated using (true);
drop policy if exists palsal_bars_read on public.palsal_bars;
create policy palsal_bars_read on public.palsal_bars for select to anon, authenticated using (true);
drop policy if exists palsal_market_read on public.palsal_market;
create policy palsal_market_read on public.palsal_market for select to anon, authenticated using (true);
-- symbols·demand·fetch_state 는 정책 없음 = anon 접근 불가(서버·RPC 만)

-- 휴대폰이 '이 종목들 지켜봐 줘'. 아는 심볼만, 한 번에 12개까지. 처음 보는 종목은 서버를 바로 깨워요(10분에 60개까지).
create or replace function public.palsal_track(symbols text[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  s text;
  is_new boolean;
  fresh text[] := '{}';
  touched int := 0;
  recent_new int;
begin
  if symbols is null or cardinality(symbols) = 0 then
    return 0;
  end if;
  if cardinality(symbols) > 12 then
    raise exception 'palsal_track: 한 번에 12개까지' using errcode = '22023';
  end if;
  foreach s in array symbols loop
    continue when not exists (select 1 from palsal_symbols where symbol = s);
    continue when exists (select 1 from palsal_demand where symbol = s and not_found_until > now());
    insert into palsal_demand (symbol) values (s)
      on conflict (symbol) do update set last_seen = now()
      returning (xmax = 0) into is_new;
    touched := touched + 1;
    if is_new or not exists (select 1 from palsal_quotes where symbol = s) then
      fresh := array_append(fresh, s);
    end if;
  end loop;
  select count(*) into recent_new from palsal_demand where first_seen > now() - interval '10 minutes';
  if cardinality(fresh) > 0 and recent_new <= 60 then
    -- 8단계: vault 에 palsal_fetch_url · palsal_cron_key 를 넣은 뒤 주석을 풀어요
    -- perform net.http_post(
    --   url := (select decrypted_secret from vault.decrypted_secrets where name = 'palsal_fetch_url') || '?mode=new',
    --   headers := jsonb_build_object('Content-Type', 'application/json',
    --     'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'palsal_cron_key')),
    --   body := jsonb_build_object('symbols', fresh));
    null;
  end if;
  return touched;
end;
$$;
revoke all on function public.palsal_track(text[]) from public;
grant execute on function public.palsal_track(text[]) to anon, authenticated;

-- 예약 작업(8단계에서 적용, 시각은 UTC — 한국 = UTC+9)
-- select cron.schedule('palsal-tick',   '*/5 * * * *',            $$ select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'palsal_fetch_url') || '?mode=tick',   headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'palsal_cron_key'))) $$);
-- select cron.schedule('palsal-daily',  '*/5 7-8,21-22 * * 1-6',  $$ … '?mode=daily'  … $$);   -- 한국 16:10~17:55 · 미국 마감 뒤 06:00~07:55 KST
-- select cron.schedule('palsal-market', '*/30 * * * *',           $$ … '?mode=market' … $$);
