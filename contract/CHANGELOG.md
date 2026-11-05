# palsal 계약 CHANGELOG

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
