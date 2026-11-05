# palsal 약관·처리방침

배포본이 원문이에요(두 벌을 따로 두지 않으려고 여기엔 요약만):
- 이용약관 `static/terms/index.html` → https://toss-in-app.github.io/palsal/terms/
- 개인정보처리방침 `static/privacy/index.html` → https://toss-in-app.github.io/palsal/privacy/

2026-11-05 첫 판(시행일 2026년 11월 5일) 요지
- 약관: 시세 지표 정보 서비스 · 무료(배너 광고) · **투자 권유·가격 예측·수익 보장 아님** · 시세 출처 4곳과 지연·오류 가능 · 데이터는 기기에만 · 변경·중단 · 책임(고의·중대한 과실은 예외) · 문의 jmsmg1@me.com
- 처리방침: 개인정보 입력 없음 · 담은 종목·설정·기록은 기기에만 · 시세 서버(Supabase 서울)에는 종목 기호와 처음·마지막 요청 시각만(누가 보냈는지 알 수 있는 값 없음, 14일 안 본 종목은 추적 끝) · 접속 기록(Supabase, GitHub Pages 미국)은 각 회사 정책 · 배너 광고 · 매일 10시 알림(동의한 경우만) · 분석(종목 기호·봉 단위, 검색어 없음)

고칠 때: 앱의 데이터 흐름(계약 `contract/state.schema.json` · `server.md` · `events.md`)이 바뀌면 같이 고치고 시행일을 올려요. 배포는 `runbooks/palsal-deploy.md` 정적 갱신 절차. 11단계 검토 중엔 동결.
