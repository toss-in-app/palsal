import { colors } from '@toss/tds-colors';
import { Button, Text } from '@toss/tds-mobile';
import { memo, type KeyboardEvent, type ReactNode } from 'react';

import { useLongPress } from '../lib/useLongPress';

import type { SymbolEntry } from '../content';
import { BAR_UNIT, codeLine, formatBarDate, formatChange, formatKstTime, formatPct, formatPrice, formatRsi, INTERVAL_LABEL, marketOf, tzOf, unitOf } from '../lib/format';
import { changeColor, DOWN, HIGH_INK, LOW_INK, MA_120, UP, ZONE_LABEL, zoneBg, zoneInk } from '../lib/palette';
import type { Analysis } from '../lib/series';
import { quoteTimeOf } from '../data/types';
import { isStale, type CardEntry } from '../state/cards';
import type { WatchItem } from '../state/watch';
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
  now?: number;
}

// 마디아 원칙(ref/designers/madia-uiux.md): 그림자 없이 평평하게, 모서리 16, 안쪽 20
const card = { display: 'block', background: colors.background, borderRadius: 16, padding: '20px 20px 18px', cursor: 'pointer' } as const;
const tabular = { fontVariantNumeric: 'tabular-nums' } as const;

/** 엇갈림·교차 한 줄 — 상자 없이 아이콘 + 글(둥근 상자 안 둥근 상자 금지) */
function SignalRow({ icon, ink, title, sub }: { icon: IconName; ink: string; title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10 }}>
      <span style={{ marginTop: 1, flex: 'none', display: 'inline-flex' }}>
        <Icon name={icon} size={16} color={ink} strokeWidth={2.2} />
      </span>
      <span>
        <Text display="block" typography="t7" fontWeight="semibold" color={colors.grey800}>
          {title}
        </Text>
        <Text display="block" typography="t7" color={colors.grey600} style={{ marginTop: 1, ...tabular }}>
          {sub}
        </Text>
      </span>
    </div>
  );
}

/** 원화 가격은 숫자와 '원'을 떼어 단위를 작게(핵심 숫자는 크게 · 단위는 작게) */
function PriceText({ text }: { text: string }) {
  const won = text.endsWith('원');
  return (
    <Text display="block" typography="t4" fontWeight="semibold" color={colors.grey900} style={tabular}>
      {won ? text.slice(0, -1) : text}
      {won ? <span style={{ fontSize: 15, fontWeight: 500, marginLeft: 1 }}>원</span> : null}
    </Text>
  );
}

function Skel({ w, h, r = 8 }: { w: number | string; h: number; r?: number }) {
  return <span aria-hidden="true" className="skeleton" style={{ display: 'block', width: w, height: h, borderRadius: r }} />;
}

/** 내 종목 카드(시안 v2 '카드 ㄱ': 숫자 위, 차트 아래 — 원본 카드 정보 전부) */
export const StockCard = memo(function StockCard({ item, entry, info, onOpen, onRetry, onLongPress, now = Date.now() }: StockCardProps) {
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
  const at = quote ? quoteTimeOf(quote) : (last?.fetchedAt ?? null);

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
  const label = `${name} ${INTERVAL_LABEL[item.interval]}${price !== null ? `, ${formatPrice(price, unit, fx)}` : ''}${rsi !== null && zoneKey ? `, RSI ${formatRsi(rsi)} ${ZONE_LABEL[zoneKey]}` : ''}, 자세히 보기`;

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

  // 카드 아래 한 줄은 필요할 때만: 늦은 시세 · 처음 받는 중 · 불러오는 중 · 주봉/월봉의 120선 표시(범례는 일봉 기준)
  const footNote: { text: ReactNode; ink: string } | null = failed
    ? null
    : stale && at
      ? // 글이 뜻을 다 말해요 — 주황(orange700)은 흰 바탕에 2.8:1 이라 13px 글자로는 안 읽혀 진회색으로
        { text: `${formatKstTime(at)} 기준 · 갱신이 늦어지고 있어요`, ink: colors.grey700 }
      : entry?.status === 'pending' && !a
        ? { text: '처음 보는 종목이라 시세를 받는 중이에요', ink: colors.grey600 }
        : !a
          ? { text: '불러오는 중', ink: colors.grey600 }
          : item.interval !== '1d'
            ? {
                text: (
                  <>
                    <span style={{ color: MA_120 }}>┄</span>
                    {` 120${barUnit}선`}
                  </>
                ),
                ink: colors.grey600,
              }
            : null;

  return (
    <article role="link" tabIndex={0} aria-label={label} {...press} onKeyDown={onKey} className="tap" style={{ ...card, userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
      {/* 훑어볼 때 먼저 보이게 상태(RSI · 구간)를 이름 옆 맨 위에 — 카드의 주인공 숫자는 이것 하나 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ minWidth: 0, flex: 1 }}>
          <Text display="block" typography="st10" fontWeight="semibold" color={colors.grey900} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name}
          </Text>
          <Text display="block" typography="t7" color={colors.grey600} style={{ marginTop: 2 }}>
            {/* 일봉이 기본이라 주봉·월봉일 때만 적어요(같은 문구를 카드마다 되풀이하지 않기) */}
            {`${codeLine(item.symbol, info)}${item.interval !== '1d' ? ` · ${INTERVAL_LABEL[item.interval]}` : ''}`}
          </Text>
        </span>
        {failed ? null : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
            {rsi !== null && zoneKey ? (
              <>
                <span style={{ fontSize: 28, fontWeight: 700, lineHeight: '34px', color: rsiInk, ...tabular }}>{formatRsi(rsi)}</span>
                <span style={{ fontSize: 12, fontWeight: 600, borderRadius: 6, padding: '3px 7px', color: zoneInk(zoneKey), background: zoneBg(zoneKey) }}>{ZONE_LABEL[zoneKey]}</span>
              </>
            ) : (
              <Skel w={72} h={30} />
            )}
          </span>
        )}
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
          {/* 변화율은 값 옆에 */}
          <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0 8px', marginTop: 12 }}>
            {price !== null ? <PriceText text={formatPrice(price, unit, fx)} /> : <Skel w={110} h={24} />}
            {price !== null && prevClose ? (
              <Text typography="t7" fontWeight="medium" color={changeColor(price - prevClose)} style={tabular}>
                {`${formatChange(price - prevClose, unit, fx, price)} (${formatPct(((price - prevClose) / prevClose) * 100)})`}
              </Text>
            ) : null}
          </div>
          {quote?.ext_session && quote.ext_price && quote.ext_change_pct !== null ? (
            <Text display="block" typography="t7" color={colors.grey600} style={{ marginTop: 4, ...tabular }}>
              {`${quote.ext_session === 'pre' ? '프리마켓' : '애프터마켓'} ${formatPrice(quote.ext_price, unit, fx)} `}
              <span style={{ color: changeColor(quote.ext_change_pct) }}>{formatPct(quote.ext_change_pct)}</span>
            </Text>
          ) : null}
          {a ? (
            <Text display="block" typography="t7" color={colors.grey600} style={{ marginTop: 4, ...tabular }}>
              {a.fromHigh >= 0 ? '5년 최고가를 새로 썼어요' : `5년 최고가보다 ${a.fromHigh.toFixed(1)}%`}
            </Text>
          ) : null}

          <div key={a ? 'chart' : 'skeleton'} className={a ? 'fade-in' : undefined} style={{ marginTop: 12 }}>
            {a ? (
              <PriceChart model={a.chart} tz={tz} interval={item.interval} label={`${name} 최근 ${a.chart.c.length}${barUnit} 가격과 이동평균`} />
            ) : (
              <Skel w="100%" h={168} r={12} />
            )}
          </div>
          {signals}
        </>
      )}

      {footNote ? (
        <Text display="block" typography="t7" color={footNote.ink} style={{ marginTop: 10, ...tabular }}>
          {footNote.text}
        </Text>
      ) : null}
    </article>
  );
});
