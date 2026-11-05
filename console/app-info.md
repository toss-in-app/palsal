# palsal 콘솔 등록 입력값 (4단계 ①, 2026-11-05)

콘솔 웹 https://apps-in-toss.toss.im → 워크스페이스(기존) → 앱 → '+등록하기'. 등록 후 `appName` 은 바꿀 수 없어요.

| 칸 | 넣을 값 | 근거 |
|----|---------|------|
| 앱 이름(국문) | **팔껄살껄** | 사용자 2026-11-05 "이름 팔껄살껄로 하자". 같은 이름 미니앱 없음(운영 목록 11-05) |
| 앱 이름(영문, 15자 이내 명사형) | **PalSal** (6자) — 안 되면 Palsal RSI | `ref/registration-rules.md` |
| appName | **palsal** → 거절되면 pal-sal → palkkeol-salkkeol | 플랫폼 전체 유일·변경 불가. 바뀌면 `python3 scripts/rename-app.py palsal <새 이름>` |
| 앱 유형 | 비게임 | |
| 카테고리 | 생활 > 재테크 (categoryId 3884 · subCategoryId 94) | `miniapp_category_list` 2026-11-05 |
| 로고 | `console/logo.png` (600×600, 흰 바탕, T5 후회 지점) | `steps/3-design/wireframes/rsi-board-logo-v1.md` |
| 부제(9단계) | RSI로 보는 내 종목 | 국문 이름이 기능을 말하지 않아 부제로 보완 |
| 고객문의 이메일(9단계) | jmsmg1@me.com | 다른 앱과 같음 |

나머지(설명·키워드·스크린샷·약관 URL·주요 기능 3)는 9단계 `console/` 에 따로.

## 주요 기능 3 (9단계, 순서 = 검색 노출)
1. 내 종목 RSI 감시 — `intoss://palsal`
2. 시장 RSI·공포탐욕 — `intoss://palsal/market`
3. 매일 RSI 알림 — `intoss://palsal/settings`
