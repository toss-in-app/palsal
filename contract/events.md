# palsal 이름표 — 분석 이벤트·광고 그룹·알림 템플릿·딥링크 (계약 v1, 2026-11-05 초안)

개인정보는 어떤 이벤트에도 싣지 않는다. 검색어 원문은 보내지 않고(`hasQuery` 만), 종목 심볼·봉 단위는 보낸다(개인정보 아님).

## 분석 이벤트 (`Analytics.log`)

| 이름 | 언제 | 파라미터 |
|------|------|----------|
| `home_view` | 내 종목이 보일 때(세션당 1회) | `count`(담은 종목 수), `from`(direct/push/link) |
| `change_banner_view` | 변화 배너가 처음 보일 때(세션당 1회) | `count`(배너 카드 수) |
| `change_open` | 변화 카드·최근 바뀐 것 항목을 누를 때 | `kind`(rsi_low_enter/rsi_high_enter/ma_cross_up/ma_cross_down/high5y), `from`(banner/list) |
| `changes_view` | 최근 바뀐 것 화면 | `count` |
| `card_load` | 카드 묶음을 받아 그렸을 때(스크롤 한 번) | `n`(받은 종목 수), `stale`(저장본 수), `error`(실패 수) |
| `stock_view` | 종목 자세히가 보일 때 | `symbol`, `market`(KR/US/CRYPTO/FX), `interval`, `from`(card/banner/changes/market/link) |
| `interval_change` | 자세히에서 봉 단위를 바꿀 때 | `interval` |
| `chart_open` | 자세히에서 차트를 눌러 크게 볼 때(2026-11-06 추가) | `interval`, `from`(price/rsi) |
| `term_open` | 용어 시트를 열 때 | `term`(content.json glossary 키) |
| `add_open` | 종목 담기 화면 | `from`(header/list_end/empty) |
| `search` | 검색 결과가 보일 때(입력 멈춘 뒤 1회) | `tab`(kr/us/crypto/fx), `hasQuery`, `results`(0~) |
| `watch_add` | 담기 완료 | `n`(이번에 담은 수), `count`(담은 뒤 전체), `interval` |
| `watch_remove` | 빼기(편집 모드·자세히) | `count`(뺀 뒤 전체), `from`(edit/stock) |
| `watch_reorder` | 편집에서 순서를 바꾸고 완료 | - |
| `filter_change` | 칩(전체·30 아래·70 위) | `filter` |
| `market_view` | 시장 탭 | `kr_low`·`us_low`·`crypto_low`(30 아래 수, crypto_low 는 2026-11-06 추가) |
| `market_add` | 시장에서 담기 | `from`(low/rank), `market` |
| `refresh` | 새로고침 결과 | `trigger`(manual/auto/open), `result`(ok/stale/error) |
| `toast_signal` | 보는 동안 구간 진입 토스트 | `kind`(low/high/summary) |
| `notification_prompt_view` | 알림 받기 카드·스위치가 처음 보일 때 | `where`(changes/settings) |
| `notification_agree` | 알림 동의 결과 | `result`(agreed/declined/error/unsupported), `where` |
| `ad_banner` | 배너 결과 | `slot`(home/market), `result`(rendered/nofill/failed) |
| `data_error` | Supabase·정적 JSON 실패 | `endpoint`(quotes/bars/market/track/symbols/universe/content), `code` |

**핵심 지표 후보(9단계 콘솔 등록)**: 활성 = `stock_view` · 전환 = `watch_add`(대표), `notification_agree`(agreed), `change_open`.

## 광고 그룹 (콘솔 인앱 광고 — 4단계 등록 뒤 ID. 그룹 생성 전 `notice_list` 로 지면 생성 장애 공지 확인)

| 이름 | 유형 | 지점 | 규칙 |
|------|------|------|------|
| `banner-home` | 배너 | 내 종목 둘째 카드 뒤 1개(카드가 2장 미만이면 마지막 카드 뒤) | refresh 없음, 실패하면 자리 숨김 |
| `banner-market` | 배너 | 시장 '지금 RSI 30 아래인 큰 종목' 뒤 1개 | 같음 |

**배너만** — 전면·리워드 지면 없음(2026-11-05 사용자 결정 "전면광고 띄우지말고 배너만 만들자"; 리워드는 1.1 후보로 남김). 광고를 못 불러와도 기능은 막히지 않는다.

## 알림 (기능성 정기 발송 1개 — 콘솔에서 만들기 전에 사용자 확인)

| 코드 | 종류 | 언제 | 제목(7자 이내 명사형) | 본문(25자 이내) | 누르면 |
|------|------|------|----------------------|-----------------|--------|
| `palsal-daily` | REGULAR | 매일 10:00 | RSI 확인 | 오늘 내 종목 RSI를 정리했어요 | `intoss://palsal?from=push` (home_view from=push 로 셈) |

- 정기 발송 동의문(콘솔) 초안: "매일 오전 10시 내 종목 RSI 정리 알림" — 콘솔 규칙에 맞춰 등록 때 다듬는다.
- 모두에게 같은 문구(개인화 = API 푸시 = 서버·사업자, 1.1).
- 동의 받는 곳: 담은 종목이 있을 때 ① 최근 바뀐 것 화면의 '알림 받기' 카드 ② 설정의 '매일 RSI 알림' **줄**(오른쪽 상태 글자: 켜기 · 받는 중 · 받지 않음 · 준비 중 — SDK 로는 동의를 끌 수 없어 스위치 대신, 받는 중일 때 누르면 '알림은 토스 앱의 알림 설정에서 끌 수 있어요'. mandalartplan 과 같은 방식). **진입 즉시·뒤로가기 때 시트 없음.** 카드에서 '닫기'나 거절하면 카드는 다시 안 띄움(`promptDismissedAt`), 설정 줄은 늘 있음.
- 템플릿 코드는 `.env` 의 `VITE_NOTIFICATION_TEMPLATE_CODE`(콘솔에서 만든 뒤), 개발 빌드만 `palsal-daily` 로 대신. 값이 없는 출시 번들은 설정 줄이 '준비 중'.

## 딥링크 · 콘솔 주요 기능

| 링크 | 화면 | 콘솔 '앱 내 기능' |
|------|------|-------------------|
| `intoss://palsal` | home | 1. 내 종목 RSI 감시 |
| `intoss://palsal/market` | market | 2. 시장 RSI·공포탐욕 |
| `intoss://palsal/settings` | settings | 3. 매일 RSI 알림 |
| `intoss://palsal/changes` | changes | - |
| `intoss://palsal/stock/<symbol>?i=1d` | stock | - |

## 정적 파일 (GitHub Pages `toss-in-app/palsal`)

| 경로 | 스키마 | 갱신 |
|------|--------|------|
| `static/symbols.json` | `content.schema.json#/$defs/symbolsFile` | 월 1회(상장·폐지 반영) |
| `static/universe.json` | `…/universeFile` | 월 1일(시총 순위) |
| `static/content.json` | `…/contentFile` | 수시(도움말·공지) |
| `terms.html` · `privacy.html` · `og.png` | - | 콘솔 등록 |
