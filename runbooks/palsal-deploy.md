# palsal 배포 런북 — 정적(GitHub Pages) + 시세 서버(Supabase)

## 정적 (무심사 콘텐츠)
- 호스트: `https://toss-in-app.github.io/palsal/` — `symbols.json`(종목 찾기 5,901) · `universe.json`(시장 탭 시총 상위 30·30) · `content.json`(도움말·용어·공지) · `terms/` · `privacy/` · `/`
- 저장소 `toss-in-app/palsal` **공개 유지**(무료 조직 플랜은 비공개 저장소의 Pages 를 꺼요 — mandalartplan 2026-10-20 장애).
- 배포: `.github/workflows/pages.yml` — `main` 에 `static/`·`content/`·`contract/`·`scripts/check-contract.mjs` 가 바뀌어 push 되면 `npm run contract` 통과 뒤 `static/` 을 Pages 로(1~2분).
- 클라: 세 파일을 하루 한 번 `If-None-Match`(ETag)로 물어 `contentVersion` 이 번들보다 낮지 않고 `minClientVersion` 이 앱 버전 이하일 때만 바꿔 씀(client/src/content/live.ts). 실패하면 조용히 번들본.

### 콘텐츠 갱신
1. 도움말·용어·공지: `content/content.source.json` 고치고 `contentVersion` 1 올리기.
2. 종목 목록: 공개 목록 3개를 다시 받아(KRX KIND 상장법인목록 · nasdaqlisted.txt · otherlisted.txt — 각각 빈 폴더에) `python3 -I scripts/build-symbols.py --kind … --nasdaq … --other … --version <오늘>.N`. 한글 이름·별칭은 `content/symbols.curated.json`.
3. 시총 목록: `content/universe.source.json`(한국·미국 각 30, `asOfDate`·`contentVersion`).
4. `npm run content` → `npm run contract` → 커밋·push → Actions.
5. **종목·시총 목록을 바꿨으면 서버 표도**: `node scripts/server-seed.mjs > /tmp/s.sql && supabase db query --remote --yes -f /tmp/s.sql`(palsal_track 은 palsal_symbols 에 있는 심볼만 받아요).
6. 확인: `curl -sI https://toss-in-app.github.io/palsal/symbols.json | grep -i "^HTTP\|etag\|access-control-allow-origin"` → 200 · ETag · `*`.

### 롤백 · 동결
- `git revert <커밋> && git push origin main`(Pages 엔 이전 배포로 되돌리기가 없어요). 되돌린 판의 `contentVersion` 도 번들 이상이어야 클라가 받아요.
- **11단계 검토 요청 ~ 승인 사이엔 화면이 바뀌는 콘텐츠 갱신(공지 포함)을 하지 않아요.**
- 수동 배포 `gh workflow run pages.yml --repo toss-in-app/palsal` · Pages 가 꺼졌으면 저장소 공개 확인 뒤 `gh api -X POST repos/toss-in-app/palsal/pages -f build_type=workflow`.

## 시세 서버 (Supabase `vksqtugrlkzmkjsgosej`, 서울)
- 계약·처음 배포 순서: `contract/server.md` '배포 · 운영'. 예약 작업 `palsal-run`(5분마다) · `palsal-cleanup`(매일).
- 함수 고치기: `supabase functions deploy palsal-fetch --project-ref vksqtugrlkzmkjsgosej --no-verify-jwt --use-api --yes` — 계산 규칙(`supabase/functions/_shared/calc.ts`)을 고치면 클라 `src/lib/serverCalc.test.ts` 가 같은지 봐요.
- 표 고치기: `supabase/schema.sql` 에 더하고(여러 번 돌려도 같게) `supabase db query --remote --yes -f supabase/schema.sql`.
- 멈추기: `select cron.unschedule('palsal-run');` · 다시: `supabase db query --remote --yes -f supabase/cron.sql`.
- 막혔을 때(야후 429 등): `select * from palsal_fetch_state;` — 출처별로 5 → 10 → 20 → 60분 쉬어요. 길게 막히면 server.md '출처 바꾸기'.
- 비밀 값 `PALSAL_CRON_KEY` 바꾸기: 새 무작위 값을 `supabase secrets set PALSAL_CRON_KEY=…` 와 `select vault.update_secret((select id from vault.secrets where name='palsal_cron_key'), '<값>')` 에 같이. 값은 어디에도 적지 않아요.
- 11단계 검토 중에도 서버는 돌아요(시세는 화면 구조를 바꾸지 않음). 표·RPC 모양을 바꾸는 변경만 멈춰요.
