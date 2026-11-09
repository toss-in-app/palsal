# 콘솔 미리보기 스크린샷 (2026-11-09, 12판 화면)

사용자 "검토 요청할 건데 스크린샷 그 만다라트처럼 미리보기로 제대로 만들어 줘" → 만다라트 콘솔 미리보기와 같은 꼴:
브랜드색 바탕(#2272EB, TDS blue600 — 흰 글자 4.5:1) · 큰 제목 두 줄 · 설명 한 줄 · 휴대폰 틀 안에 실제 앱 화면(아래는 잘림).
636×1048 PNG 6장(콘솔 세로 규격). 실제 시세(palsal 서버)로 찍은 개발 화면이고, 개발용 'AIT' 단추와 모의 배너 광고 자리만 숨겼어요.

| 순서 | 파일 | 제목 | 설명 | 화면 |
|---|---|---|---|---|
| 1 | palsal-preview-p1-home.png | 내 종목 RSI를 한눈에 | 주식 · 코인 · 환율을 담으면 차트 카드로 이어져요 | 내 종목 맨 위 |
| 2 | palsal-preview-p2-chart.png | 누르고 있으면 그날의 값이 나와요 | 옆으로 밀고 두 손가락으로 벌려 지난 차트도 봐요 | 삼성전자 자세히, 차트를 누르고 있는 중 |
| 3 | palsal-preview-p3-news.png | RSI 30 · 70 진입을 소식으로 모아요 | 이동평균 교차 · 5년 최고가까지 날짜와 함께 | RSI 14 · 이 종목 소식 |
| 4 | palsal-preview-p4-market.png | 오늘 시장은 공포일까 탐욕일까 | 한국 · 미국 · 코인 공포탐욕지수와 VIX | 시장 맨 위 |
| 5 | palsal-preview-p5-low.png | 지금 RSI 30 아래인 큰 종목 | 시가총액 상위와 주요 코인에서 골라 바로 담아요 | 시장 'RSI 30 아래' |
| 6 | palsal-preview-p6-add.png | 초성으로 찾고 여러 개를 한 번에 | 삼성전자는 ㅅㅅㅈㅈ로도 찾아요 | 종목 담기 'ㅅㅅ', 2개 고름 |

## 다시 만들기
1. 개발 서버(`npm run client:dev -- --port 5191`)를 띄우고 `source/raw-plan.json` · `source/raw-plan-r3.json` 의 `out` 을 바꿔
   `node ~/Desktop/toss/scripts/shot390.mjs <plan>` 으로 앱 화면 6장(390×844, 2배)을 찍어요. r3 는 RSI 14 줄이 맨 위에 오게 페이지 아래에 빈 공간을 잠깐 붙여 스크롤해요.
2. `source/compose-template.html` 의 `{title}`(줄바꿈 `<br>`) · `{sub}` · `{raw}` 를 채운 HTML 6개를 `raw/` 옆 폴더에 두고,
   viewport 318×524 로 같은 도구로 찍으면 2배라 636×1048 이 정확히 나와요. HTML 에 `<meta name="viewport" content="width=device-width, initial-scale=1">` 가 없으면 절반 크기로 찍혀요.
3. 글은 앱 문구 규칙대로: 사고팔라는 말 · 느낌표 · 과장 없이 화면에 실제로 있는 기능만.
