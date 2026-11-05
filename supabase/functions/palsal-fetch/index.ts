// palsal-fetch — 출처에서 시세를 받아 palsal_ 표에 넣는 Edge Function (계약: contract/server.md)
// 4단계 골격: 모드 확인과 응답 모양만. 출처 어댑터·추적 종목·upsert 는 5단계, 배포·cron 은 8단계.
//
// 모드
//   tick   — 5분마다. 장이 열린 시장의 추적 종목 현재가(야후 spark 20종목씩 · 바이낸스 ticker 묶음) → palsal_quotes
//   daily  — 장 마감 뒤. 봉(종가·저가 530개 + 그 봉 단위 종가의 5년 최댓값, 30종목씩) → palsal_bars. 환율은 Frankfurter
//   market — 30분마다. 시총 상위 60 RSI · 30 아래 목록 · 공포탐욕 3 → palsal_market
//   new    — palsal_track 이 부를 때. 처음 보는 종목(최대 12) 현재가·봉 즉시
//
// 지킬 것: User-Agent 는 정직한 이름(USER_AGENT, 기본 'palsal/1.0'). 브라우저 흉내·쿠키 재사용·IP 돌리기 같은
// 차단 우회는 하지 않아요. 429·5xx 는 palsal_fetch_state 로 쉬었다가(5 → 10 → 20 → 최대 60분) 다시.

const MODES = ['tick', 'daily', 'market', 'new'] as const;
type Mode = (typeof MODES)[number];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

Deno.serve((req: Request) => {
  const mode = new URL(req.url).searchParams.get('mode');
  if (!mode || !(MODES as readonly string[]).includes(mode)) return json({ error: 'BAD_MODE', modes: MODES }, 400);
  // 8단계: cron·palsal_track 만 부르도록 Authorization 의 palsal_cron_key 를 확인해요.
  return json({ mode: mode as Mode, done: false, note: '5단계에서 구현' }, 501);
});
