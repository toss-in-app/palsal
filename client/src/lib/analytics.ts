import { Analytics } from '@apps-in-toss/web-framework';

/** 분석 이벤트 이름 (contract/events.md 23개). 여기 없는 이름은 보내지 않아요. */
export type EventName =
  | 'home_view'
  | 'change_banner_view'
  | 'change_open'
  | 'changes_view'
  | 'card_load'
  | 'stock_view'
  | 'interval_change'
  | 'chart_use'
  | 'term_open'
  | 'add_open'
  | 'search'
  | 'watch_add'
  | 'watch_remove'
  | 'watch_reorder'
  | 'filter_change'
  | 'market_view'
  | 'market_add'
  | 'refresh'
  | 'toast_signal'
  | 'notification_prompt_view'
  | 'notification_agree'
  | 'ad_banner'
  | 'data_error';

export type EventParams = Record<string, string | number | boolean | null | undefined>;

/** 화면 진입 이벤트는 SDK 의 `Analytics.screen` 과 같은 log_type 으로, 나머지는 'event' 로 보내요. */
const SCREEN_EVENTS: ReadonlySet<EventName> = new Set<EventName>(['home_view', 'changes_view', 'stock_view', 'market_view']);

/** 세션당 1회만 보내는 이벤트의 기록(이름 + 구분 키) */
const sentOnce = new Set<string>();

/**
 * `Analytics.log` 로 이벤트를 보내요 (토스앱 5.208.0+, 샌드박스는 콘솔 출력만, 미지원 버전은 조용히 무시).
 * 계약대로 값은 문자열로 보내고, null·undefined 는 빼요. 개인정보는 넣지 않아요 — 검색어 원문 없이 hasQuery 만, 종목 심볼·봉 단위는 보내요(events.md).
 * 실패해도 화면 흐름에 영향이 없도록 절대 던지지 않아요. (byeol-today·mandalartplan 과 같은 래퍼)
 */
export function logEvent(name: EventName, params: EventParams = {}): void {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    clean[key] = String(value);
  }
  try {
    void Promise.resolve(Analytics.log({ log_name: name, log_type: SCREEN_EVENTS.has(name) ? 'screen' : 'event', params: clean })).catch(() => {
      /* 브릿지 없음·네트워크 실패는 무시 */
    });
  } catch {
    /* 브릿지 자체가 없는 환경(일반 브라우저) */
  }
}

/** 세션당 1회(home_view · change_banner_view · notification_prompt_view 는 where 마다). 다시 켜면(새 세션) 다시 보내요 */
export function logEventOnce(name: EventName, params: EventParams = {}, key = ''): void {
  const k = `${name}|${key}`;
  if (sentOnce.has(k)) return;
  sentOnce.add(k);
  logEvent(name, params);
}

/** 테스트용 */
export function resetAnalyticsForTests(): void {
  sentOnce.clear();
}
