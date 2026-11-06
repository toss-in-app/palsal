# palsal 계약 CHANGELOG

## v1.13 — 2026-11-06 (시세가 얼마나 새것인지 정직하게 · 환율 장중값)
- 사용자 질문 "켰을 때 5분 이내로 항상 최신이야?" → 확인: 미국 주식·코인은 원천이 거의 실시간, **한국 주식·지수는 야후가 약 20분 늦게** 줌(장 시작 19분째에도 오늘 체결 없음), 환율은 하루 1번(Frankfurter)이었음. 사용자 결정: 체결 시각으로 표시 · 환율도 야후 5분마다.
- `[server]` `palsal_quotes.market_time`(원천 마지막 체결 시각, 프리·애프터 값이면 그 시각) 추가 — `quotes.schema.json` 필수(null 가능). 예전 앱은 이 칸을 무시해요.
- `[server]` 환율을 **야후**로(현재가 5분마다 · 봉 5년). 외환 시장 시간(일 21:00 ~ 금 22:00 UTC) 밖은 CLOSED. 일봉은 런던 0시에 끊겨서 런던 날짜의 UTC 0시로 맞춰 넣어요. 환율 봉 새로 넣는 때 00:20 런던(앱 기준 09:40 KST). Frankfurter 는 안 씀.
- `[server]` 같은 날·주·달 칸은 하나로 합쳐 넣어요(야후 주봉·월봉 끝의 '지금' 칸).
- `[server]` 장 시작 뒤 아직 체결이 없을 때 처음 40분은 REGULAR(예전엔 바로 CLOSED라 한국 장 첫 20분이 '장 마감'으로 보였음), 그 뒤에도 없으면 휴장일 CLOSED.
- `[client]` 화면 '기준' 시각 = `market_time`(없으면 fetched_at). 종목 자세히에 한국 장중이면 '약 20분 늦은 시세', 내 종목 머리 시각은 'HH:MM 업데이트'(서버에서 받은 때), 국내 종목이 있으면 범례 아래 '국내 주식·지수는 약 20분 늦은 시세예요' 한 줄. 환율 봉 '그날' 경계 01:00 → 09:40 KST.
- `[content]` 도움말 '실시간 시세인가요?' 답 · 시세 출처(환율 → Yahoo Finance) · 약관 4항(시행일 2026-11-06).

## v1.12 — 2026-11-06 (추적이 14일 뒤 끊기던 버그)
- 버그: 앱은 '지켜봐 줘'(palsal_track)를 봉이 없을 때 한 번만 불러서, 시총 상위 · 예시 종목 밖의 종목은 담은 지 14일이 지나면 서버 추적에서 빠지고 시세 · 봉이 멈췄어요.
- `[server]` `palsal_track` 반환을 int → **text[]**(서버가 지금 새로 받기 시작한 종목). 새 종목 · **14일 넘게 아무도 알리지 않아 빠졌던 종목** · 현재가가 없는 종목은 바로 새로 받아요(pg_net → mode=new). 예전 앱은 반환을 쓰지 않아 그대로 돌아요.
- `[client]` 담은 종목(시총 상위 · 예시 종목 빼고)을 **하루 한 번** 알려요 — Storage `palsal.track.v1`({version, day, symbols}, 선택 키). 서버가 새로 받기 시작한 종목은 오래된 봉을 쓰지 않고 6초 뒤 다시 읽어요.

## v1.11 — 2026-11-05 (8단계 시세 서버 첫 배포)
- `[server]` **palsal 전용 Supabase 프로젝트**(서울 `vksqtugrlkzmkjsgosej`) — mandalartplan 프로젝트와 따로(사용자 결정). 휴대폰이 읽는 표·열·RPC 는 그대로.
- `[server]` 봉은 일·주·월 모두 **5년**(원본과 같은 범위, high5y = 받은 종가 최댓값 → '5년 최고가 ≥ 저장된 종가' 규칙이 늘 맞음). 주봉 약 261개 · 월봉 60개.
- `[server]` 예약 작업 하나(`palsal-run`, 5분마다 tick → daily → market 30분마다), 표 `palsal_universe` · 함수 `palsal_market_inputs` 더함, `palsal_track` 이 처음 보는 종목을 pg_net 으로 바로 받음.
- `[client]` 시세 서버 주소·publishable key 를 `client/.env`(모든 빌드)로 — QR 시험 번들도 진짜 서버를 읽게. 출시 번들 검사가 서버 주소·publishable key 가 들었는지, 비밀 키가 없는지 봄.

## v1.10 — 2026-11-05 (전체 종목 목록 · 시총 30·30)
- `content.schema.json` symbols `maxItems` 6000 → 8000(여유). 이번 판 5,901개: 한국 2,612(KRX KIND 상장법인목록의 유가증권·코스닥 전부, 코넥스·스팩 뺌 + 한국 ETF 21 · 지수 2) · 미국 3,281(나스닥 Global Select·NYSE 보통주 + 고른 ETF·종목, 워런트·우선주·채권형·폐쇄형 펀드·스팩 뺌) · 코인 6 · 환율 2. 만드는 법 `scripts/build-symbols.py`(공개 목록 3개 + `content/symbols.curated.json` 한국어 이름·별칭).
- `universe.json` 한국·미국 시총 상위 각 30(2026-11-05 공개 순위 기준, ADR·우선주 코드는 KRX 보통주로). 서버 추적 = 이 60 + 예시 4 + 최근 14일 읽힌 종목.

## v1.9 — 2026-11-05 (6단계 테스트)
- `[server]` **값 반올림**: `palsal_quotes`·`palsal_bars` 의 가격은 넣기 전에 반올림(한국 원 정수 · 미국 달러·지수·환율 소수 4자리 · 코인 유효숫자 8자리) — 기기 봉 저장 크기를 지키려고(`server.md`).
- `npm run contract` 가 스키마 밖 규칙까지 본다(봉 길이·순서·high5y, 키 꼴·중복, 금지 표현, 시장 목록 순서, 반올림 안 된 값) — `contract/scripts/validate.py` 와 같은 규칙을 Node 로 옮김.

## v1.8 — 2026-11-05 (5단계 ⑪ 정적 콘텐츠 원격 갱신)
- `[client]` Storage 키 `palsal.static.v1:<symbols|universe|content>` 추가(선택) — 원격본의 그날 저장(물어본 날·ETag·본문). 번들로 바로 그리고, 하루 한 번 `If-None-Match` 로 물어 새 판이면 바꿔 끼움(byeol-today 와 같은 방식). contentVersion 이 번들보다 낮거나 minClientVersion 이 앱보다 높으면 안 씀. 실패는 data_error(endpoint symbols·universe·content).

## v1.7 — 2026-11-05 (5단계 ⑩ 분석 이벤트)
- `[client]` 분석 이벤트 22개 연결(`client/src/lib/analytics.ts`, 화면 진입 4개는 log_type screen). 알림 랜딩을 `intoss://palsal?from=push` 로 — `home_view.from` 이 push 를 셀 수 있게(콘솔 템플릿 만들 때 이 주소로).

## v1.6 — 2026-11-05 (전면 광고 뺌 — 사용자 결정)
- `[client]` **전면 광고 `interstitial-stock` 뺌, 배너 2개만**(`banner-home` · `banner-market`). 사용자 "전면광고 띄우지말고 배너만 만들자". 분석 이벤트 `ad_interstitial` 도 뺌(22개). `state.schema.json` settings 의 `ads.lastInterstitialDate` 뺌. 안내 한 줄·AD 표시도 없음(배너는 SDK 가 광고 표시를 그림).
- 출시 번들 검사는 배너 라이브 ID 2개만 요구.

## v1.5 — 2026-11-05 (5단계 ⑧ 알림 동의)
- `[client]` 설정의 '매일 RSI 알림'을 스위치 → **상태 글자가 있는 줄**로(켜기·받는 중·받지 않음·준비 중). SDK 로는 동의를 끌 수 없어서(mandalartplan 경험). `events.md` 알림 절에 동의 받는 곳·문구·템플릿 코드(.env) 규칙.

## v1.4 — 2026-11-05 (5단계 ⑥ 시장 탭)
- `market.schema.json` 제목·설명을 Supabase(`palsal_market.payload`)로 바로잡음(Worker 안의 흔적). 한국·미국 공포탐욕 공식은 클라 `lib/market.ts` `fearGreedScore` 와 같아야 한다고 적음 — 개발용 예시 데이터도 이 함수로 계산.
- `content.json` glossary 에 `fear-greed`(공포탐욕지수 계산 방법) 추가 — 시장 탭 (i) 시트.

## v1.3 — 2026-11-05 (처음 연 날 예시 종목)
- `[client]` 처음 연 날(설정·담은 종목 키가 모두 없을 때) 한 번만 **원본과 같은 예시 4종목**(QQQ · SPY · 삼성전자 · SK하이닉스, 일봉)을 담는다. 다 빼도 다시 채우지 않음(원본의 `rsi_seeded` 와 같은 뜻 — 따로 키를 두지 않고 설정 키가 처음 만들어지는 날로 판단). `state.schema.json` watch 설명.
- 서버 추적에 예시 4종목을 늘 넣는다(`server.md`) — 새 사용자의 첫 화면이 '불러오는 중'에 걸리지 않게. `symbols.json` 에 QQQ 추가(contentVersion 2026-11-05.2).

## v1.2 — 2026-11-05 (5단계 ④ 변화 감지)
- `[client]` **`palsal.signals.v1` 뺌.** 구간에 '있는지'를 기억하는 대신, 카드 값을 계산할 때마다 그 종목 봉에서 최근 7일 안의 일을 다시 찾아 `palsal.changes.v1` 에 합친다(같은 watchId·kind·date 는 한 번만). 앱을 닫아 둔 동안 생긴 일도 남고, 새로 담은 종목도 같은 규칙.
- 토스트: 이번 세션에 이미 계산한 종목에서 새로 생긴 RSI 30 아래·70 위 진입만(원본처럼 30·70 만). 앱을 열 때는 요약 한 번('지금 RSI 30 아래 2개, 70 위 1개예요').
- 5년 최고가 변화: 서버 `high5y`(5년 종가 최댓값)와 같거나 넘는 가장 최근 봉 = 새로 쓴 날(그보다 앞선 날은 알 수 없어 하나만). 현재가가 넘으면 `from` = 이전 최고가.

## v1.1 — 2026-11-05 (5단계 ① 지표·카드)
- `[client]` 봉 최대 **430 → 530개**(`bars.schema.json` · `state.schema.json` barsCache · `supabase/schema.sql`). 180봉 화면에 코인 50주선(350일)을 끝까지 그리려면 529개가 필요해서 — 원본은 300 + 350개를 들고 그린다.
- `high5y` 는 **그 봉 단위 종가의 5년 최댓값**(원본 '고점대비'와 같게 — 고가가 아니라 종가). 주봉·월봉 행도 각자 계산.
- barsCache `day` 의미: '거래소 현지 오늘' → **서버가 봉을 다시 넣는 시각(한국 16:40 · 미국 07:10 · 코인 09:20 · 환율 01:00)이 가장 최근에 지난 날**. 하루 한 번만 봉을 받게(전송량), `server.md` '휴대폰이 읽는 법'에 한 줄.

## v1 — 2026-11-05 (초안, 3단계 승인 대기)
- 서버: **Supabase**(`server.md`) — 서버가 5분마다 묶어서 받아 표에 넣고 휴대폰은 읽기만. 같은 날 먼저 쓴 Cloudflare Worker 안(`worker.md`, 요청 시 갱신)은 사용자 제안으로 대체하고 지웠다.
- `quotes.schema.json` — `palsal_quotes` 행(현재가·전일 종가·등락률·장 상태·프리/애프터·출처·받은 시각).
- `bars.schema.json` — `palsal_bars` 행(종가·저가 최대 430개 + 5년 최고가, 열 배열). 시가·고가는 안 씀.
- `market.schema.json` — `palsal_market.payload`: 시총 상위 한국·미국 30 RSI, RSI ≤ 30 목록, 공포탐욕 3(코인은 '출처 alternative.me').
- `content.schema.json` — 정적 3파일: `symbols.json` · `universe.json` · `content.json`(구간 설명 4 · 읽는 법 · 공포탐욕 계산 · 자주 묻는 질문 · 용어 시트 · 출처 · 면책 · 공지).
- `state.schema.json` — Storage 키: `palsal.watch.v1` · `palsal.settings.v1` · `palsal.signals.v1` · `palsal.changes.v1` · `palsal.cache.v1` · `palsal.bars.v1:<watchId>`(봉 하루 저장, 키마다 따로).
- `events.md` — 분석 이벤트 23 · 광고 그룹 3(전면 1·배너 2) · 알림 `palsal-daily` · 딥링크 5.
- `samples/` — 7개(예시 데이터, 실제 시세 아님). `python3 scripts/validate.py` 로 스키마 + 스키마 밖 규칙(봉 길이·순서, 금지 표현, 키 꼴) 확인 — 2026-11-05 전부 통과.
