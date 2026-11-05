import { colors } from '@toss/tds-colors';
import { Button, Text } from '@toss/tds-mobile';
import { memo, type KeyboardEvent, type ReactNode } from 'react';

import { useLongPress } from '../lib/useLongPress';

import type { SymbolEntry } from '../content';
import { avatarText, BAR_UNIT, codeLine, formatBarDate, formatChange, formatKstTime, formatPct, formatPrice, formatRsi, INTERVAL_LABEL, marketOf, tzOf, unitOf } from '../lib/format';
import { changeColor, DOWN, HIGH_INK, LOW_INK, UP, ZONE_LABEL, zoneBg, zoneInk } from '../lib/palette';
import type { Analysis } from '../lib/series';
import { isStale, type CardEntry } from '../state/cards';
import type { WatchItem } from '../state/watch';
import { AdMark } from './AdMark';
import { Icon, type IconName } from './Icon';
import { PriceChart } from './PriceChart';

export interface StockCardProps {
  item: WatchItem;
  entry: CardEntry | undefined;
  info: SymbolEntry | undefined;
  onOpen: (item: WatchItem) => void;
  onRetry: (item: WatchItem) => void;
  /** 길게 누르면(그 자리 편집 모드) */
  onLongPress?: (item: WatchItem) => void;
  /** 전면 광고 차례인 날 '자세히' 옆 AD 표시 */
  adMark?: boolean;
  now?: number;
}

const card = { display: 'block', background: colors.background, borderRadius: 20, padding: '16px 16px 14px', boxShadow: '0 1px 2px rgba(0,27,55,.04)', cursor: 'pointer' } as const;
const tabular = { fontVariantNumeric: 'tabular-nums' } as const;

function SignalRow({ icon, ink, title, sub }: { icon: IconName; ink: string; title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8, background: colors.grey50, borderRadius: 10, padding: '8px 10px' }}>
      <Icon name={icon} size={18} color={ink} strokeWidth={2.2} />
      <span>
        <Text display="block" typography="t7" fontWeight="semibold" color={colors.grey800}>
          {title}
        </Text>
        <Text display="block" typography="st12" color={colors.grey500} style={{ marginTop: 2, ...tabular }}>
          {sub}
        </Text>
      </span>
    </div>
  );
}

function Skel({ w, h, r = 8 }: { w: number | string; h: number; r?: number }) {
  return <span aria-hidden="true" style={{ display: 'block', width: w, height: h, borderRadius: r, background: colors.grey100 }} />;
}

/** 내 종목 카드(시안 v2 '카드 ㄱ': 숫자 위, 차트 아래 — 원본 카드 정보 전부) */
export const StockCard = memo(function StockCard({ item, entry, info, onOpen, onRetry, onLongPress, adMark = false, now = Date.now() }: StockCardProps) {
  const market = marketOf(item.symbol, info);
  const tz = tzOf(market);
  const unit = unitOf(item.symbol, market);
  const fx = market === 'FX';
  const name = info?.n ?? item.symbol;
  const a: Analysis | null = entry?.analysis ?? null;
  const quote = entry?.quote ?? null;
  const last = entry?.last ?? null;
  const barUnit = BAR_UNIT[item.interval];

  const price = a?.price ?? last?.price ?? null;
  const prevClose = quote?.prev_close ?? (a && item.interval === '1d' && a.chart.c.length > 1 ? a.chart.c[a.chart.c.length - 2] : (last?.prevClose ?? null));
  const rsi = a ? a.rsi : (last?.rsi ?? null);
  const zone = a?.zone ?? null;
  const failed = !a && entry?.status === 'error';
  const stale = isStale(quote, now);
  const at = quote ? Date.parse(quote.fetched_at) : (last?.fetchedAt ?? null);

  const open = () => onOpen(item);
  const press = useLongPress(() => onLongPress?.(item), open);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  };

  const rsiInk = rsi === null ? colors.grey400 : zoneInk(zone ?? (rsi < 20 ? 'vlow' : rsi <= 30 ? 'low' : rsi < 70 ? 'mid' : 'high'));
  const zoneKey = zone ?? (rsi === null ? null : rsi < 20 ? 'vlow' : rsi <= 30 ? 'low' : rsi < 70 ? 'mid' : 'high');
  const label = `${name} ${INTERVAL_LABEL[item.interval]}${price !== null ? `, ${formatPrice(price, unit, fx)}` : ''}${rsi !== null && zoneKey ? `, RSI ${formatRsi(rsi)} ${ZONE_LABEL[zoneKey]}` : ''}, 자세히 보기${adMark ? '(광고가 나와요)' : ''}`;

  let signals: ReactNode = null;
  if (a) {
    const rows: ReactNode[] = [];
    if (a.divergence) {
      const d = a.divergence;
      rows.push(
        <SignalRow
          key="div"
          icon="split"
          ink={d.type === 'bull' ? LOW_INK : HIGH_INK}
          title={d.type === 'bull' ? '가격은 내리고 RSI는 올랐어요' : '가격은 오르고 RSI는 내렸어요'}
          sub={`${formatBarDate(d.fromT, tz)} → ${formatBarDate(d.toT, tz)} · RSI ${formatRsi(d.rsiFrom)} → ${formatRsi(d.rsiTo)}`}
        />,
      );
    }
    if (a.cross) {
      rows.push(
        <SignalRow
          key="cross"
          icon="xcross"
          ink={a.cross.type === 'up' ? UP : DOWN}
          title={a.cross.type === 'up' ? `60${barUnit}선이 120${barUnit}선을 위로 넘었어요` : `60${barUnit}선이 120${barUnit}선 아래로 내려갔어요`}
          sub={formatBarDate(a.cross.t, tz)}
        />,
      );
    }
    signals = rows;
  }

  return (
    <article role="link" tabIndex={0} aria-label={label} {...press} onKeyDown={onKey} style={{ ...card, userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          aria-hidden="true"
          style={{ width: 36, height: 36, borderRadius: 18, background: colors.grey100, color: colors.grey700, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}
        >
          {avatarText(name)}
        </span>
        <span style={{ minWidth: 0 }}>
          <Text display="block" typography="st10" fontWeight="bold" color={colors.grey900} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name}
          </Text>
          <Text display="block" typography="st12" color={colors.grey500} style={{ marginTop: 2 }}>
            {codeLine(item.symbol, info)}
          </Text>
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: colors.grey600, background: colors.grey100, borderRadius: 6, padding: '3px 7px', flex: 'none' }}>
          {INTERVAL_LABEL[item.interval]}
        </span>
      </div>

      {failed ? (
        <div style={{ marginTop: 14, padding: '18px 0 6px', textAlign: 'center' }}>
          <Text display="block" typography="t6" color={colors.grey700}>
            시세를 불러오지 못했어요
          </Text>
          <Button
            size="small"
            variant="weak"
            style={{ marginTop: 10 }}
            onClick={(e) => {
              e.stopPropagation();
              onRetry(item);
            }}
          >
            다시 시도
          </Button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 12 }}>
            <div style={{ minWidth: 0 }}>
              {price !== null ? (
                <Text display="block" typography="t4" fontWeight="bold" color={colors.grey900} style={tabular}>
                  {formatPrice(price, unit, fx)}
                </Text>
              ) : (
                <Skel w={110} h={24} />
              )}
              {price !== null && prevClose ? (
                <Text display="block" typography="t7" fontWeight="semibold" color={changeColor(price - prevClose)} style={{ marginTop: 2, ...tabular }}>
                  {`${formatChange(price - prevClose, unit, fx, price)} (${formatPct(((price - prevClose) / prevClose) * 100)})`}
                </Text>
              ) : null}
              {quote?.ext_session && quote.ext_price && quote.ext_change_pct !== null ? (
                <Text display="block" typography="st12" color={colors.grey600} style={{ marginTop: 3, ...tabular }}>
                  {`${quote.ext_session === 'pre' ? '프리마켓' : '애프터마켓'} ${formatPrice(quote.ext_price, unit, fx)} `}
                  <span style={{ color: changeColor(quote.ext_change_pct) }}>{formatPct(quote.ext_change_pct)}</span>
                </Text>
              ) : null}
              {a ? (
                a.fromHigh >= 0 ? (
                  <Text display="block" typography="st12" color={UP} style={{ marginTop: 3 }}>
                    5년 최고가를 새로 썼어요
                  </Text>
                ) : (
                  <Text display="block" typography="st12" color={colors.grey600} style={{ marginTop: 3, ...tabular }}>
                    5년 최고가보다 <b style={{ color: DOWN }}>{`${a.fromHigh.toFixed(1)}%`}</b>
                  </Text>
                )
              ) : null}
            </div>
            <div style={{ textAlign: 'right', flex: 'none' }}>
              <Text display="block" typography="st12" color={colors.grey500}>
                RSI 14
              </Text>
              <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                {rsi !== null && zoneKey ? (
                  <>
                    <span style={{ fontSize: 26, fontWeight: 700, lineHeight: '28px', color: rsiInk, ...tabular }}>{formatRsi(rsi)}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 6, padding: '3px 7px', color: zoneInk(zoneKey), background: zoneBg(zoneKey) }}>{ZONE_LABEL[zoneKey]}</span>
                  </>
                ) : (
                  <Skel w={60} h={28} />
                )}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            {a ? (
              <PriceChart model={a.chart} tz={tz} interval={item.interval} label={`${name} 최근 ${a.chart.c.length}${barUnit} 가격과 이동평균`} />
            ) : (
              <Skel w="100%" h={168} r={12} />
            )}
          </div>
          {signals}
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <Text typography="st12" color={colors.grey500}>
          {a
            ? `${INTERVAL_LABEL[item.interval]} · 최근 ${a.chart.c.length}${barUnit}${item.interval === '1d' ? '' : ` · ┄ 120${barUnit}선`}`
            : entry?.status === 'pending'
              ? '처음 보는 종목이라 시세를 받는 중이에요'
              : failed
                ? INTERVAL_LABEL[item.interval]
                : '불러오는 중'}
        </Text>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flex: 'none' }}>
          {at && !failed ? (
            <Text typography="st12" color={stale ? colors.orange700 : colors.grey500} style={tabular}>
              {stale ? `${formatKstTime(at)} · 갱신이 늦어지고 있어요` : formatKstTime(at)}
            </Text>
          ) : null}
          <Text typography="st12" fontWeight="semibold" color={colors.grey600} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {adMark ? <AdMark /> : null}
            자세히
            <Icon name="chev" size={14} color={colors.grey500} />
          </Text>
        </span>
      </div>
    </article>
  );
});
