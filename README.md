# palsal — 살껄팔껄 (2026-11-06 팔껄살껄에서 바꿈, appName palsal 은 그대로)

내 종목의 RSI(14)와 이동평균을 차트 카드로 이어서 보여 주고, RSI 30 아래·70 위 진입 같은 바뀐 것을 먼저 알려 주는 앱인토스 미니앱. 종목 추천·매매 지시는 하지 않아요.

| 폴더 | 내용 |
|------|------|
| `client/` | 미니앱(React 18 · Vite · `@apps-in-toss/web-framework` 3.8.1 · TDS) |
| `contract/` | 계약 v1 — 표·정적 파일·기기 저장 스키마, 이벤트·광고·알림 이름표, 서버 설계(`server.md`), 샘플 |
| `content/` | 정적 콘텐츠 원본(종목 목록·시총 상위 목록·도움말) |
| `static/` | GitHub Pages 에 올릴 것(`npm run content` 가 JSON 을 만듦, 약관·처리방침 자리) |
| `supabase/` | 시세 서버 — 표 `schema.sql`, Edge Function `palsal-fetch`(5단계 구현, 8단계 배포) |
| `console/` | 콘솔 등록 입력값·로고 |
| `scripts/` | 콘텐츠 빌드·계약 검사 |

```bash
npm install                 # 계약 검사 도구(ajv)
npm run content             # content/*.source.json → static/ + client/src/content/*.bundled.json
npm run contract            # 콘텐츠 3벌 + 계약 샘플 7개 검사
npm run check               # contract + client typecheck·lint·test·build(→ client/palsal.ait)
npm run client:dev          # AIT Devtools 로 개발 서버
```

설계: `~/Desktop/toss/apps/palsal.md`(카드) · `steps/3-design/wireframes/palsal-flow.md`(흐름) · v2 시안 캔버스 https://claude.ai/artifact/PG3DTSk5cCaH4mrwRKmeEA
