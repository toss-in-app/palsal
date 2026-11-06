import { colors } from '@toss/tds-colors';
import { Button, SegmentedControl, Text } from '@toss/tds-mobile';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import { Icon, type IconName } from '../components/Icon';
import { StockChart, type ZoomControls } from '../components/StockChart';
import { TermSheet, TermWord } from '../components/TermSheet';
import type { ContentFile, SymbolEntry } from '../content';
import { logEvent } from '../lib/analytics';
import { eventTerm, eventTitle, stockEvents, type StockEvent } from '../lib/events';
import { BAR_UNIT, codeLine, formatBarDate, formatBarPeriod, formatChange, formatKstTime, formatPct, formatPrice, formatRsi, INTERVAL_LABEL, marketOf, tzOf, unitOf } from '../lib/format';
import { zoneOf } from '../lib/indicators';
import { changeColor, DOWN, HIGH_INK, LOW_INK, MA_120, MA_200, MA_50W, UP, ZONE_LABEL, zoneBg, zoneInk } from '../lib/palette';
import { fullChart, type Interval } from '../lib/series';
import { quoteTimeOf } from '../data/types';
import { barsWithQuote, isStale, loadCards, retryCard, type CardsState } from '../state/cards';
import { settingsStore, updateSettings } from '../state/settings';
import { watchId, type WatchItem } from '../state/watch';

const INTERVALS: Interval[] = ['1d', '1wk', '1mo'];

export interface StockScreenProps {
  symbol: string;
  interval: Interval;
  info: SymbolEntry | undefined;
  cards: CardsState;
  watched: WatchItem[];
  glossary: ContentFile['glossary'];
  disclaimer: string;
  onAdd: (symbol: string, interval: Interval) => void;
  onRemove: (id: string) => void;
  /** 어디서 열었는지(분석 stock_view.from) */
  from?: 'card' | 'banner' | 'changes' | 'market' | 'link';
}

const tabular = { fontVariantNumeric: 'tabular-nums' } as const;
/** 화면 읽기 프로그램에만 읽히는 글(차트에서 고른 봉 값) */
const srOnly: CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

function ZoomButton({ label, icon, enabled, onClick }: { label: string; icon: IconName; enabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={!enabled}
      onClick={onClick}
      className="tap tap-soft"
      style={{ width: 32, height: 32, borderRadius: 16, border: 0, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: colors.grey100, color: enabled ? colors.grey800 : colors.grey400, cursor: enabled ? 'pointer' : 'default' }}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

const EVENT_ICON: Record<StockEvent['kind'], [IconName, string]> = {
  rsi_low_enter: ['down', LOW_INK],
  rsi_high_enter: ['up', HIGH_INK],
  ma_cross_up: ['xcross', UP],
  ma_cross_down: ['xcross', DOWN],
  div_bull: ['split', LOW_INK],
  div_bear: ['split', HIGH_INK],
  high5y: ['star', UP],
};

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section style={{ margin: '0 24px', padding: '24px 0 0' }}>
      <Text display="block" typography="t5" fontWeight="bold" color={colors.grey900} style={{ marginBottom: 8 }}>
        {title}
      </Text>
      {children}
    </section>
  );
}

/**
 * 종목 자세히(시안 v1 C2): 가격·등락 → 봉 단위 → 가격 차트 → 범례 → RSI 흐름 → 이 종목 소식 → 담기/빼기.
 * 차트는 그 자리에서 밀고 벌리고 누르고 있으면 그 봉 값(2026-11-06 '들어가는 화면 없이 바로') — 그동안 위 가격 · RSI 자리가 그 봉 값이에요.
 */
export function StockScreen({ symbol, interval: initial, info, cards, watched, glossary, disclaimer, onAdd, onRemove, from = 'link' }: StockScreenProps) {
  const [interval, setBarInterval] = useState<Interval>(initial);
  const [term, setTerm] = useState<string | null>(null);
  const id = watchId(symbol, interval);
  const item = useMemo<WatchItem>(() => ({ id, symbol, interval, addedAt: 0 }), [id, symbol, interval]);

  useEffect(() => {
    void loadCards([item]);
  }, [item]);
  useEffect(() => {
    logEvent('stock_view', { symbol, market: marketOf(symbol, info), interval: initial, from });
    // 화면에 들어올 때 한 번(봉 단위를 바꾸면 interval_change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const market = marketOf(symbol, info);
  const tz = tzOf(market);
  const unit = unitOf(symbol, market);
  const fx = market === 'FX';
  const name = info?.n ?? symbol;
  const entry = cards.entries[id];
  const a = entry?.analysis ?? null;
  const quote = entry?.quote ?? null;
  const barUnit = BAR_UNIT[interval];
  const inWatch = watched.some((w) => w.id === id);
  const liveBars = useMemo(() => barsWithQuote(entry), [entry]);
  const events = useMemo(() => (liveBars && entry?.analysis ? stockEvents(liveBars, entry.analysis) : []), [liveBars, entry]);
  /** 움직이는 차트용 — 받은 봉 전부(처음 보이는 구간은 예전 자세히 차트와 같아요) */
  const full = useMemo(() => (liveBars ? fullChart(liveBars, marketOf(symbol, info) === 'CRYPTO') : null), [liveBars, symbol, info]);
  /** 차트에서 누르고 있는 봉. null 이면 최신 */
  const [point, setPoint] = useState<number | null>(null);
  /** 차트 쓰는 법 한 줄 — 처음 다뤄 보기 전까지(이 화면에 있는 동안은 그대로) */
  const [chartHint] = useState(() => settingsStore.get().chartUsedAt === null);
  const changeInterval = (v: Interval) => {
    setPoint(null);
    setBarInterval(v);
    logEvent('interval_change', { interval: v });
  };

  // 차트를 누르고 있으면 위 가격 · RSI 가 그 봉 값(전 봉 대비)이에요(떼면 최신)
  const picked = point !== null && full && point < full.c.length ? point : null;
  const price = picked !== null ? full!.c[picked] : (a?.price ?? null);
  const prevClose =
    picked !== null
      ? picked > 0
        ? full!.c[picked - 1]
        : null
      : (quote?.prev_close ?? (a && interval === '1d' && a.chart.c.length > 1 ? a.chart.c[a.chart.c.length - 2] : null));
  const rsiNow = picked !== null ? full!.rsi[picked] : (a?.rsi ?? null);
  const zone = picked !== null ? (rsiNow === null ? null : zoneOf(Math.round(rsiNow * 10) / 10)) : (a?.zone ?? null);
  const pickedLabel = picked !== null ? formatBarPeriod(full!.t[picked], tz, interval) : null;
  const failed = !a && entry?.status === 'error';
  const pending = !a && entry?.status === 'pending';
  const at = quote ? quoteTimeOf(quote) : null;
  // 한국 주식·지수는 야후가 약 20분 늦게 줘요(장중에만 덧붙여요)
  const delayed = market === 'KR' && quote?.market_state === 'REGULAR';
  const stale = isStale(quote);
  const legendRow = { display: 'flex', flexWrap: 'wrap', gap: '6px 8px', fontSize: 12, color: colors.grey700, margin: '8px 24px 0', alignItems: 'center' } as const;

  // 가격 칸과 RSI 칸 사이: 범례 두 줄(첫 줄 오른쪽에 확대·축소) · RSI 머리(고른 봉이면 그 봉 RSI)
  const legend = (zoom: ZoomControls | null) => (
    <>
      <div style={legendRow}>
        <TermWord onClick={() => setTerm('mark-close-below')}>
          <span style={{ color: LOW_INK }}>▲</span> 30 아래 마감
        </TermWord>
        <TermWord onClick={() => setTerm('mark-intraday-below')}>
          <span style={{ color: LOW_INK }}>△</span> 장중만
        </TermWord>
        <TermWord onClick={() => setTerm('mark-div-peak')}>
          <span style={{ color: HIGH_INK }}>▼</span> 엇갈린 고점
        </TermWord>
        {zoom ? (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
            <ZoomButton label="축소" icon="minus" enabled={zoom.canZoomOut} onClick={zoom.zoomOut} />
            <ZoomButton label="확대" icon="plus" enabled={zoom.canZoomIn} onClick={zoom.zoomIn} />
          </span>
        ) : null}
      </div>
      <div style={{ ...legendRow, marginTop: 6 }}>
        <TermWord onClick={() => setTerm('ma120')}>
          <span style={{ color: MA_120 }}>┄</span> {`120${barUnit}선`}
        </TermWord>
        {interval === '1d' ? (
          <>
            <TermWord onClick={() => setTerm('ma200')}>
              <span style={{ color: MA_200 }}>—</span> 200일선
            </TermWord>
            <TermWord onClick={() => setTerm('ma50w')}>
              <span style={{ color: MA_50W }}>—</span> 50주선
            </TermWord>
          </>
        ) : null}
      </div>
    </>
  );
  const rsiHead = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '24px 24px 8px' }}>
      <Text typography="t5" fontWeight="bold" color={colors.grey900}>
        <TermWord label="RSI 14 뜻 보기" onClick={() => setTerm('rsi14')}>
          RSI 14
        </TermWord>
      </Text>
      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {rsiNow !== null && zone ? (
          <>
            <span style={{ fontSize: 24, fontWeight: 700, color: zoneInk(zone), ...tabular }}>{formatRsi(rsiNow)}</span>
            <button
              type="button"
              onClick={() => setTerm(`zone-${zone}`)}
              className="tap"
              style={{ border: 0, cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 700, borderRadius: 6, padding: '3px 7px', color: zoneInk(zone), background: zoneBg(zone) }}
            >
              {ZONE_LABEL[zone]}
            </button>
          </>
        ) : null}
      </span>
    </div>
  );

  return (
    <main style={{ paddingBottom: 40 }}>
      <div style={{ padding: '12px 24px 0' }}>
        <Text display="block" typography="t7" color={colors.grey600}>
          {codeLine(symbol, info)}
        </Text>
        <Text display="block" typography="t3" fontWeight="bold" color={colors.grey900} style={{ marginTop: 2 }}>
          {name}
        </Text>
        {price !== null ? (
          <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0 8px', marginTop: 6 }}>
            <Text typography="t2" fontWeight="bold" color={colors.grey900} style={tabular}>
              {formatPrice(price, unit, fx)}
            </Text>
            {prevClose ? (
              <Text typography="t6" fontWeight="medium" color={changeColor(price - prevClose)} style={tabular}>
                {`${formatChange(price - prevClose, unit, fx, price)} (${formatPct(((price - prevClose) / prevClose) * 100)})`}
              </Text>
            ) : null}
          </div>
        ) : (
          <span aria-hidden="true" style={{ display: 'block', width: 160, height: 30, borderRadius: 8, background: colors.grey100, marginTop: 8 }} />
        )}
        {/* 차트를 누르고 있는 동안: 아래 줄들은 자리를 지킨 채 숨기고 그 봉의 날짜를 보여 줘요 — 높이가 바뀌어 차트가 손가락 밑에서 움직이지 않게 */}
        <div style={{ position: 'relative' }}>
          <div style={pickedLabel !== null ? { visibility: 'hidden' } : undefined} aria-hidden={pickedLabel !== null || undefined}>
            {quote?.ext_session && quote.ext_price && quote.ext_change_pct !== null ? (
              <Text display="block" typography="t7" color={colors.grey600} style={{ marginTop: 4, ...tabular }}>
                <TermWord label="프리마켓·애프터마켓 뜻 보기" onClick={() => setTerm('ext-hours')}>
                  {quote.ext_session === 'pre' ? '프리마켓' : '애프터마켓'}
                </TermWord>{' '}
                {formatPrice(quote.ext_price, unit, fx)} <span style={{ color: changeColor(quote.ext_change_pct) }}>{formatPct(quote.ext_change_pct)}</span>
              </Text>
            ) : null}
            {a ? (
              <Text display="block" typography="t7" color={colors.grey600} style={{ marginTop: 4, ...tabular }}>
                <TermWord label="5년 최고가 뜻 보기" onClick={() => setTerm('high5y')}>
                  5년 최고가
                </TermWord>
                {a.fromHigh >= 0 ? (
                  '를 새로 썼어요'
                ) : (
                  <>
                    {`보다 ${a.fromHigh.toFixed(1)}%`}
                  </>
                )}
              </Text>
            ) : null}
            {at ? (
              <Text display="block" typography="st12" color={stale ? colors.orange700 : colors.grey600} style={{ marginTop: 4, ...tabular }}>
                {stale ? `${formatKstTime(at)} 기준 · 갱신이 늦어지고 있어요` : `${formatKstTime(at)} 기준${delayed ? ' · 약 20분 늦은 시세' : ''}`}
              </Text>
            ) : null}
          </div>
          {pickedLabel !== null ? (
            <Text display="block" typography="t7" fontWeight="semibold" color={colors.grey700} style={{ position: 'absolute', left: 0, top: 4, ...tabular }}>
              {pickedLabel}
            </Text>
          ) : null}
        </div>
        <span role="status" style={srOnly}>
          {pickedLabel !== null && price !== null ? `${pickedLabel} 종가 ${formatPrice(price, unit, fx)}${rsiNow !== null ? `, RSI ${formatRsi(rsiNow)}` : ''}` : ''}
        </span>
      </div>

      <div style={{ padding: '16px 20px 0' }}>
        <SegmentedControl value={interval} onChange={(v) => changeInterval(v as Interval)} aria-label="봉 단위">
          {INTERVALS.map((i) => (
            <SegmentedControl.Item key={i} value={i}>
              {INTERVAL_LABEL[i]}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl>
      </div>

      {failed ? (
        <div style={{ margin: '24px 20px 0', textAlign: 'center' }}>
          <Text display="block" typography="t6" color={colors.grey700}>
            시세를 불러오지 못했어요
          </Text>
          <Button size="small" variant="weak" style={{ marginTop: 10 }} onClick={() => void retryCard(item)}>
            다시 시도
          </Button>
        </div>
      ) : (
        <>
          {full && a ? (
            <StockChart
              key={interval}
              model={full}
              name={name}
              tz={tz}
              interval={interval}
              point={picked}
              onPoint={setPoint}
              hint={chartHint}
              onUse={(kind) => {
                logEvent('chart_use', { interval, kind });
                if (settingsStore.get().chartUsedAt === null) updateSettings({ chartUsedAt: Date.now() });
              }}
              between={(zoom) => (
                <>
                  {legend(zoom)}
                  {rsiHead}
                </>
              )}
            />
          ) : (
            <>
              <div style={{ margin: '14px 20px 0' }}>
                <span aria-hidden="true" className="skeleton" style={{ display: 'block', height: 222, borderRadius: 12 }} />
              </div>
              {legend(null)}
              {rsiHead}
              <div style={{ margin: '0 20px' }}>
                <span aria-hidden="true" className="skeleton" style={{ display: 'block', height: 112, borderRadius: 12 }} />
              </div>
            </>
          )}
          {pending ? (
            <Text display="block" typography="t7" color={colors.grey600} style={{ margin: '12px 24px 0' }}>
              처음 보는 종목이라 시세를 받는 중이에요
            </Text>
          ) : null}

          {a ? (
            <Section title="이 종목 소식">
              {events.length ? (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {events.map((e) => {
                    const [icon, ink] = EVENT_ICON[e.kind];
                    const sub =
                      e.kind === 'div_bull' || e.kind === 'div_bear'
                        ? `${formatBarDate(e.fromT!, tz)} → ${formatBarDate(e.t, tz)} · RSI ${formatRsi(e.from!)} → ${formatRsi(e.to!)}`
                        : e.from !== undefined
                          ? `${formatBarDate(e.t, tz)} · RSI ${formatRsi(e.from)} → ${formatRsi(e.to!)}`
                          : formatBarDate(e.t, tz);
                    return (
                      <li key={`${e.kind}${e.t}`}>
                        <button
                          type="button"
                          onClick={() => setTerm(eventTerm(e.kind))}
                          className="tap-row"
                          style={{ width: 'calc(100% + 16px)', margin: '0 -8px', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 8px', borderRadius: 12, border: 0, background: 'none', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
                        >
                          <span style={{ marginTop: 2, display: 'inline-flex', flex: 'none' }}>
                            <Icon name={icon} size={18} color={ink} strokeWidth={2.2} />
                          </span>
                          <span>
                            <Text display="block" typography="t6" fontWeight="semibold" color={colors.grey800}>
                              {eventTitle(e, interval)}
                            </Text>
                            <Text display="block" typography="t7" color={colors.grey600} style={{ marginTop: 2, ...tabular }}>
                              {sub}
                            </Text>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Text display="block" typography="t7" color={colors.grey600}>
                  최근 1년 동안 RSI 30·70 진입이나 이동평균 교차가 없었어요
                </Text>
              )}
            </Section>
          ) : null}
        </>
      )}

      <div style={{ margin: '24px 20px 0' }}>
        {inWatch ? (
          <Button display="block" size="large" variant="weak" color="dark" onClick={() => onRemove(id)}>
            내 종목에서 빼기
          </Button>
        ) : (
          <Button display="block" size="large" onClick={() => onAdd(symbol, interval)}>
            {`내 종목에 담기 · ${INTERVAL_LABEL[interval]}`}
          </Button>
        )}
      </div>
      <Text display="block" typography="t7" color={colors.grey600} style={{ margin: '20px 24px 0', lineHeight: 1.6 }}>
        {disclaimer}
      </Text>

      <TermSheet glossary={glossary} term={term} onChange={setTerm} />
    </main>
  );
}
