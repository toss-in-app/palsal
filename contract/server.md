# palsal 시세 서버 — Supabase 계약 v1 (2026-11-05 초안 · 같은 날 Cloudflare Worker 안을 대체)

> 사용자 2026-11-05: "굳이 휴대폰에서 호출해야해? 슈퍼베이스에 저장하고, 휴대폰은 그 DB 데이터 view 하는 용도로 쓰는거지 그러면 야후에 호출 수는 5분에 1번만 해도 되잖아"
> → 서버가 **정해진 간격으로** 받아 표에 넣고, 휴대폰은 **읽기만**. 출처 호출 수가 사용자 수와 무관해진다.

```
야후(비공식) · 바이낸스 · Frankfurter · alternative.me
        ▲  5분마다 묶어서(정직한 이름 'palsal/1.0')
Edge Function palsal-fetch  ◄── pg_cron (pg_net 으로 호출)
        ▼ upsert
Postgres 표: palsal_quotes · palsal_bars · palsal_market · palsal_demand
        ▼ 읽기만(PostgREST, publishable key, RLS select)
휴대폰(미니앱) ── 모르는 종목이면 RPC palsal_track(symbols) 로 '지켜봐 줘'
```

## 실측 (2026-11-05, 사용자 맥에서)
- 야후 `v8/finance/chart/<심볼>`(한 종목) — 정직한 이름 `palsal-test/0.1` 로 **200**. 같은 날 앞서 크롬 흉내 User-Agent 로 보낸 3개는 첫 요청부터 429 → 원인 불명(일시 제한 또는 흉내 UA). 이후 **정직한 이름만** 쓴다. 브라우저 흉내·쿠키 조작 같은 차단 우회는 하지 않는다.
- 야후 `v7/finance/spark?symbols=A,B,…&range=1d&interval=5m` — **한 요청에 6종목 200**(15 KB): 종목마다 현재가 · 전일 종가 · 5분 흐름. → 현재가는 **묶어서 5분에 1번** 가능. 한 요청 최대 종목 수는 구현 때 20부터 확인.
- 바이낸스 `data-api.binance.vision`(키 없음) · Frankfurter(키 없음) 정상.

## 무료 한도 (Supabase Free, 2026-11-05 원문)
| 항목 | 한도 | 이 설계 |
|------|------|---------|
| Edge Function 호출 | 500,000 (요금표에 기간 표기 없음, 월로 봄) | cron 5분마다 1회 + 새 종목 즉시 수신 → 월 약 1만 |
| Edge Function CPU | 요청당 2 s(비동기 I/O 제외) · 실행 150 s · 메모리 256 MB | 한 번에 spark 묶음 15개·일봉 30종목까지 |
| DB 용량 | 프로젝트당 500 MB | 종목 300 × 봉 3종 × 약 10 KB ≈ 9 MB |
| **egress** | **5 GB, 조직 전체 합산**(만다라트·사주 앱과 나눠 씀) | 하루 사용자 1명당 약 50 KB → 월 5 GB ≈ 하루 3,000명(다른 앱 몫 빼면 2,000명 안팎). 넘으면 Pro $25/월 또는 읽기만 Cloudflare 로 |
| 프로젝트 | 무료 2개(모든 조직 합산), 1주일 활동 없으면 정지 | **palsal 전용 프로젝트 `vksqtugrlkzmkjsgosej`(서울 ap-northeast-2, 2026-11-05 생성)** — 사용자 "만다라트 말고 프로젝트 하나 더": 출시 중인 mandalartplan DB 와 섞지 않음. 무료 마지막 자리라 사주 앱 서버는 기존 프로젝트와 같이 쓰거나 유료. cron 이 매 5분 돌아 정지되지 않음. egress·함수 호출 한도는 조직 합산이라 나눠도 늘지 않음 |
| Cron | 초 단위까지, 동시 작업 8개·작업당 10분 이하 권장 | 작업 3개 |

## 무엇을 지켜보나 (추적 종목)
- 서버는 휴대폰에 담긴 종목을 모른다 → 추적 = `universe.json` 시총 상위 60 + **처음 연 날 예시 4종목(QQQ · SPY · 005930.KS · 000660.KS — 새 사용자가 기다리지 않게 늘)** + `palsal_demand` 에서 **최근 14일 안에 누군가 읽은 종목**.
- 휴대폰은 읽으려는 종목이 `palsal_quotes` 에 없으면 RPC `palsal_track(symbols text[])` 를 부른다(최대 12개, 심볼 꼴 검사). 처음 보는 종목이면 RPC 가 `pg_net` 으로 `palsal-fetch?mode=new` 를 바로 불러 **몇 초 안에** 채운다. 휴대폰은 5~10초 뒤 다시 읽는다(카드엔 '불러오는 중').
- **(v1.12) 휴대폰은 담은 종목을 하루 한 번 `palsal_track` 으로 알린다**(시총 상위 · 예시 종목 빼고) — 서버는 14일 동안 아무도 알리지 않은 종목을 추적에서 빼므로. RPC 는 새 종목 · 14일 넘게 빠졌던 종목 · 현재가 없는 종목을 바로 새로 받고 그 목록(text[])을 돌려준다 → 휴대폰은 그 종목의 오래된 봉을 쓰지 않고 잠깐 뒤 다시 읽는다.
- 없는 심볼은 `palsal_demand.not_found_until` 로 하루 동안 다시 안 부른다.

## 작업 (pg_cron → pg_net → `palsal-fetch`)
> 구현(2026-11-05): 예약은 **`palsal-run` 하나가 5분마다** `?mode=run` → tick · daily · market(30분 지났을 때만)을 차례로(`supabase/cron.sql`). 아래 표의 모드는 손으로도 부를 수 있어요. 함수는 `Authorization: Bearer <PALSAL_CRON_KEY>` 만 받아요(cron·palsal_track 이 vault 의 같은 값을 씀).
| 작업 | 언제 | 하는 일 | 야후 요청 |
|------|------|---------|-----------|
| `tick` | **5분마다** | 장이 열린 시장의 추적 종목 현재가: 한국 09:00–15:30 KST · 미국 04:00–20:00 ET(프리·정규·애프터) 평일 · 코인 늘 · 환율 안 함. 야후 spark **20종목씩 묶어서**, 코인은 바이낸스 `ticker/24hr?symbols=[…]` 한 번 → `palsal_quotes` upsert | 추적 300이면 5분에 15 |
| `daily` | 봉이 새로 나온 뒤(한국 평일 16:10 KST · 미국 평일 16:30 ET · 코인 매일 00:05 UTC · 환율 평일 15:30 UTC) 오래된 것부터 한 번에 40개(종목×봉 단위) | 일·주·월봉 모두 `chart?range=5y`(원본 RSIngTime 과 같은 범위 — 2026-11-05 구현 때 10y·max 에서 바꿈) → 종가·저가 마지막 530개 + 5년 최고가(= 받은 종가 최댓값) → `palsal_bars` upsert. 코인은 바이낸스 klines(일봉 두 번), 환율은 Frankfurter 5년 일별 한 번으로 일·주·월봉 + 현재가 | 하루 추적 종목 × 3 |
| `market` | 장중 30분마다 + 마감 뒤 1회 | 시총 상위 60 일봉 RSI(14)·종가·등락, RSI ≤ 30 목록, 공포탐욕(한국 `^KS11` · 미국 `SPY` = RSI × 0.6 + 120일선 위치 × 0.4 / 코인 alternative.me 하루 1회) → `palsal_market` | 0(저장된 봉 + 현재가로 계산) |
| `new` | RPC 가 부를 때 | 처음 보는 종목(최대 12)의 현재가·봉 즉시 | 종목 수만큼 |

공포탐욕 이름: ≤24 극단적 공포 · ≤44 공포 · ≤55 중립 · ≤75 탐욕 · 그 위 극단적 탐욕.

## 표 (public 스키마, 접두사 `palsal_`)
> 실제 정의는 `supabase/schema.sql`(여러 번 돌려도 같음). 구현 때 더한 것: `palsal_universe`(시장 탭 시총 상위 60 — `scripts/server-seed.mjs` 가 static/universe.json 에서 채움) · `palsal_market_inputs(keys)`(시장 계산용 종가 배열 + 마지막 봉 시각만, 서버 키만) · `palsal_symbols` 는 static/symbols.json 에서 채움(5,901).
```sql
create table palsal_quotes (
  symbol text primary key,
  price double precision not null, prev_close double precision not null, change_pct double precision not null,
  market_state text not null check (market_state in ('PRE','REGULAR','POST','CLOSED','24H')),
  ext_session text check (ext_session in ('pre','post')), ext_price double precision, ext_change_pct double precision,
  source text not null check (source in ('yahoo','binance','frankfurter')),
  fetched_at timestamptz not null
);
create table palsal_bars (
  key text primary key,                       -- 'symbol|interval'
  symbol text not null, interval text not null check (interval in ('1d','1wk','1mo')),
  currency text not null, tz text not null, source text not null,
  t bigint[] not null, c double precision[] not null, l double precision[] not null,   -- 같은 길이, 최대 530(180봉 화면에 코인 50주선 350일을 끝까지 그릴 만큼)
  high5y double precision not null,
  updated_at timestamptz not null
);
create table palsal_market (id int primary key check (id = 1), payload jsonb not null, computed_at timestamptz not null);
create table palsal_demand (
  symbol text primary key, last_seen timestamptz not null, first_seen timestamptz not null,
  not_found_until timestamptz
);
-- RLS: quotes·bars·market 은 anon select 만, demand 는 직접 접근 없음(RPC 로만)
```
- 봉은 **종가·저가만**(시가·고가는 화면에 안 씀 — △ 장중 30 아래 계산에 저가만 필요). 용량·전송량이 절반.
- **값 반올림**(v1.9): 출처의 부동소수 꼬리(예: 야후 `614.2000122070312`)를 지우려고 넣기 전에 반올림한다 — 한국 원은 정수, 미국 달러·지수·환율은 소수 4자리, 코인은 유효숫자 8자리. 휴대폰이 봉을 기기에 하루 저장하는데(종목당 약 14 KB, 최대 100종목) 꼬리가 남으면 두 배 가까이 커진다. `npm run contract` 가 유효숫자 10자리 넘는 값을 막는다(8단계에서 실제 응답도 이 검사로 본다).
- 휴대폰이 받는 모양 = 위 열 그대로(PostgREST JSON). 스키마 `quotes.schema.json` · `bars.schema.json` · `market.schema.json`(= `palsal_market.payload`).

- 휴대폰은 봉을 **서버가 다시 넣는 시각이 지난 뒤 처음 볼 때만** 받는다: 한국 16:40 · 미국 07:10 · 코인 09:20 · 환율 01:00(모두 한국 시간, `daily` 가 끝날 즈음). 그 전엔 기기 저장본 + 현재가로 마지막 봉을 고쳐 쓴다. `daily` 가 이 시각보다 오래 걸리면 휴대폰 시각을 함께 늦춘다(클라 `state/cards.ts` BARS_READY_KST).

## 휴대폰이 읽는 법
| 언제 | 요청 | 크기 |
|------|------|------|
| 앱 열 때·보고 있는 동안 5분마다 | `GET /rest/v1/palsal_quotes?symbol=in.(…)` (보이는 카드 + 다음 몇 장) | 종목당 약 150 B |
| 종목의 봉을 **그날 처음** 볼 때만 | `GET /rest/v1/palsal_bars?key=in.(…)` → 기기 `Storage` 에 그날 하루 저장 | 종목당 약 4 KB(gzip) |
| 시장 탭 | `GET /rest/v1/palsal_market?id=eq.1` | 약 5 KB |
| 추적 안 된 종목 | `POST /rest/v1/rpc/palsal_track` | - |
- 마지막 봉은 휴대폰이 `palsal_quotes.price` 로 덮어써서 RSI 를 다시 계산(장중 값).
- 헤더: `apikey: <publishable key>` 만(새 키 체계, `ref` memory supabase-api-keys-2026). 비밀 키는 Edge Function 에만.

## 실패와 차단
- 출처가 429·5xx·시간 초과면 그 작업에서 그 출처를 건너뛰고 `palsal_fetch_state` 에 실패 수 기록, 다음 실행 간격을 늘림(5 → 10 → 20 → 최대 60분). 같은 출처 3번 연속 429 면 30분 쉼.
- `palsal_quotes.fetched_at` 이 장중 20분보다 오래되면 휴대폰이 '갱신이 늦어지고 있어요'. 저장본이 없으면 '시세를 불러오지 못했어요 · 다시 시도'.
- 정직한 User-Agent `palsal/1.0`. 브라우저 흉내·쿠키 재사용·IP 돌리기 같은 차단 우회는 하지 않는다 — 막히면 막힌 대로 저장본, 길게 막히면 유료 출처로 바꾼다.

## 출처 바꾸기 (어댑터)
`palsal-fetch` 안에서 심볼 꼴로 출처를 고른다: `.KS`·`.KQ`·`^`·미국 티커 → `yahoo` / `-USD` → `binance` / `=X` → `frankfurter`. 유료로 바꿀 때(광고 수익 월 $10 이상 또는 야후가 길게 막힐 때) `marketstack`·KRX 어댑터를 더하고 라우팅만 바꾼다. 표·휴대폰은 그대로.

## 설정값 (Edge Function 환경 변수 — 바꾸면 즉시, 앱 재심사 없음)
| 이름 | 기본 | 뜻 |
|------|------|----|
| `TICK_MINUTES` | 5 | 현재가 받는 간격(cron 식과 함께) |
| `SPARK_BATCH` | 20 | 야후 spark 한 요청 종목 수 |
| `DAILY_PER_RUN` | 40 | daily 한 번에 받을 봉 수(종목×봉 단위) — 미국 추적 60여 종목 × 3 을 휴대폰 봉 시각(07:10 KST) 전에 끝내려고 40 |
| `MARKET_MINUTES` | 30 | 시장 계산 간격 |
| `PALSAL_CRON_KEY` | (비밀) | cron·palsal_track 만 함수를 부르게 하는 키. vault `palsal_cron_key` 와 같은 값 |
| `DEMAND_DAYS` | 14 | 이 기간 안에 읽힌 종목만 추적 |
| `USER_AGENT` | palsal/1.0 | 정직한 이름 |

## 배포 · 운영 (2026-11-05 첫 배포)
- 프로젝트 `vksqtugrlkzmkjsgosej`(서울). 휴대폰은 `https://vksqtugrlkzmkjsgosej.supabase.co` + publishable key(client/.env, 공개 값)로 읽기만.
- 처음 한 번: `supabase link --project-ref vksqtugrlkzmkjsgosej` → `supabase db query --remote --yes -f supabase/schema.sql` → `node scripts/server-seed.mjs > /tmp/s.sql && supabase db query --remote --yes -f /tmp/s.sql` → `supabase functions deploy palsal-fetch --project-ref vksqtugrlkzmkjsgosej --no-verify-jwt --use-api --yes` → 비밀 값(아래) → `supabase db query --remote --yes -f supabase/cron.sql`.
- 비밀 값 `PALSAL_CRON_KEY`: 무작위 값을 함수 비밀(`supabase secrets set`)과 vault(`palsal_cron_key`)에 **같이** 넣어요. 바꿀 때도 둘 다(`vault.update_secret`). 값은 어디에도 적지 않아요.
- 종목 목록·시총 목록을 바꾸면 `server-seed.mjs` 를 다시(정적 배포와 같이). 함수 고치면 deploy 만.
- 첫 배포 확인: daily 5번으로 봉 189개(63종목×3), tick 33+1, market 60종목 RSI, palsal_track → pg_net → mode=new 4초 안에 현재가 3 · 봉 9, 공개 키로 palsal_symbols·palsal_demand 0행 · palsal_market_inputs 401, cron 14:20 UTC 성공.
- 보기: 대시보드 Edge Functions 로그(모드별 한 줄 JSON) · `select * from net._http_response order by created desc limit 5` · `select * from cron.job_run_details order by start_time desc limit 5` · `select * from palsal_fetch_state`(출처별 쉬기).
