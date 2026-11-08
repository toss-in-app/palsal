# palsal 콘솔 등록 (4단계 ①) — 2026-11-05 등록 완료

- **miniAppId 97559** · appName **`palsal`**(확정, 변경 불가) · 워크스페이스 '곤'(10169) · 비게임 · 콘솔 MCP `miniapp_create` 로 등록
- 사용자가 '검토 요청 전 확약 5개'에 동의(2026-11-05): ① 앱인토스에서 오픈할 수 있는 서비스 ② 환전·현금화·자금세탁 우려 없음 ③ 인허가·등록·신고 마침 ④ 부정행위·위법 행위 없음 ⑤ 위반 시 책임은 파트너사, 토스 손해 보상
- 등록 직후 검토 요청은 4103('최초 등록이 끝나기 전에는 앱 정보와 번들을 함께 제출해요')으로 멈춤 — 정상. **앱 이름 외의 앱 정보는 저장되지 않았다** → 11단계 `initial_review_submit(miniAppId=97559)` 의 appInfo 에 아래 값을 다시 담는다(`initial-review.appinfo.json`).
- 로고 uploadId `mcp-image:10169:1793859989:cd38798c-a8ae-475c-904e-108c60edcdea:png` — **2026-11-12 만료**. 그 뒤엔 `image_upload_url` 로 `console/logo.png` 를 다시 올린다.
- **2026-11-08 확인: 콘솔에 저장된 앱 아이콘은 우리 로고가 아니라 기본 그림**(`miniapp_get` iconUri `…/live-managed-v1-6e77ef36-….png`, 파란 픽셀 무늬). `miniapp_create` 의 iconUploadId 가 안 붙었어요. 최초 검토 전엔 `miniapp_update_icon` 이 4103 으로 막혀 MCP 로 못 바꿔요 → **사용자가 콘솔 웹(미니앱 홈 https://apps-in-toss.toss.im/workspace/10169/mini-app/97559/home → 앱 정보 → 앱 로고)에 `console/logo.png` 를 올리거나**, 11단계 `initial_review_submit` 의 appInfo 에 새 uploadId 로 넣는다(그때 `image_upload_url` 로 다시 올려 uploadId 갱신 — 7일 만료). 앱 안에는 9판부터 로고 표(내 종목 머리 · 설정 맨 아래)가 있어요(`client/src/components/Logo.tsx`).
- 사용 연령은 신규 앱 기본 19~99, 고객문의 이메일은 콘솔 계정 이메일로 자동(바꾸려면 콘솔 웹 '앱 정보 > 고객센터 정보').

| 칸 | 넣은 값 |
|----|---------|
| 앱 이름(국문) | 팔껄살껄 |
| 앱 이름(영문) | Palsal (단어마다 첫 글자만 대문자 규칙이라 'PalSal' 은 불가, 사용자 선택) |
| 부제(20자 이내) | RSI로 보는 내 종목 |
| 카테고리 | 생활 > 재테크 (categoryIds [3884] · subCategoryIds [94]) |
| 검색 키워드(10) | RSI · RSI 알림 · 주식 RSI · 코인 RSI · 보조지표 · 이동평균 · 공포탐욕지수 · 관심종목 · 주식 차트 · 시가총액 |
| 로고 | `console/logo.png` (600×600 PNG, T5 후회 지점) |

상세 설명(500자 이내):
> 담아 둔 국내·미국 주식과 코인, 환율의 RSI(14)와 이동평균을 차트 카드로 이어서 보여 줘요. 내 종목 화면 맨 위에는 RSI가 30 아래로 내려오거나 70을 넘은 종목, 60일선과 120일선이 교차한 종목, 5년 최고가를 새로 쓴 종목이 먼저 보여요. 카드를 누르면 가격 차트와 RSI 흐름, 가격과 RSI가 엇갈린 지점을 자세히 볼 수 있어요. 시장 탭에서는 한국·미국 시가총액 상위 종목의 RSI 순위와 공포탐욕지수를 보고 바로 담을 수 있어요. 알림을 켜면 매일 오전 10시에 내 종목 RSI 정리를 알려 드려요. 지난 가격으로 계산한 보조 지표를 보여 줄 뿐 투자를 권하지 않아요.

## 9단계 (2026-11-05 Claude 초안)
- **이용약관** `https://toss-in-app.github.io/palsal/terms/` · **개인정보처리방침** `https://toss-in-app.github.io/palsal/privacy/` — 둘 다 라이브(8단계 배포, 원문은 `static/terms/index.html` · `static/privacy/index.html`, 정리는 `console/policies/README.md`).
- **주요 기능 3**: `console/features.md` — 1 주식 RSI 보기 `intoss://palsal` · 2 공포탐욕지수 보기 `intoss://palsal/market` · 3 RSI 알림 받기 `intoss://palsal/settings`.
- **세로 스크린샷 636×1048 4장**(초안, 실제 시세 · 개발 화면에서 개발용 패널·모의 광고 자리만 숨김): `console/screenshots/palsal-1-home.png`(내 종목) · `-2-stock.png`(종목 자세히, 두산에너빌리티 RSI 24.6) · `-3-market.png`(시장 공포탐욕 · 30 아래 큰 종목) · `-4-add.png`(종목 담기 초성 찾기). 실기기(10단계 QR) 캡처로 바꿔도 돼요. 시세는 찍은 날(2026-11-05) 값이라 숫자가 오래되면 다시 찍기.
- 가로 썸네일 1932×828 은 선택 — 아직 없음.
- 상세 설명은 위 문단 그대로 써도 돼요(배너만·알림 10시·투자 권유 아님 모두 지금 앱과 같음).
- 입력은 사용자 몫(콘솔 웹 또는 11단계 `initial_review_submit` 의 appInfo 로 앱 정보·번들 함께 — 최초 등록 전 앱은 MCP 로 앱 정보만 따로 고칠 수 없음).
