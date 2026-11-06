import { colors } from '@toss/tds-colors';
import { Button, SegmentedControl, Text } from '@toss/tds-mobile';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { Icon } from './Icon';
import { ZoomChart } from './ZoomChart';
import { axisText, textWidth } from '../lib/chartText';
import { atLatest, clampView, initialView, MIN_VISIBLE, viewStart, ZOOM_PL, zoomLayout, zoomView, type ChartView } from '../lib/chartView';
import { BAR_UNIT, formatBarPeriod, formatChange, formatPct, formatPrice, formatRsi, INTERVAL_LABEL, type Unit } from '../lib/format';
import { zoneOf } from '../lib/indicators';
import { changeColor, MA_120, MA_200, MA_50W, ZONE_LABEL, zoneInk } from '../lib/palette';
import { fullChart, type Bars, type ExchangeTz, type FullChartModel, type Interval } from '../lib/series';
import { useChartGestures } from '../lib/useChartGestures';

const INTERVALS: Interval[] = ['1d', '1wk', '1mo'];
const tabular = { fontVariantNumeric: 'tabular-nums' } as const;
/** 확대·축소 버튼 한 번에 */
const ZOOM_STEP = 1.5;

export interface ChartViewerProps {
  name: string;
  interval: Interval;
  onInterval: (interval: Interval) => void;
  /** 현재가를 반영한 봉 — 없으면 불러오는 중 */
  bars: Bars | null;
  crypto: boolean;
  tz: ExchangeTz;
  unit: Unit;
  fx: boolean;
  failed: boolean;
  pending: boolean;
  onRetry: () => void;
}

/**
 * 차트 크게 보기 — 자세히 화면에서 차트를 누르면 열려요(사용자 요청 2026-11-06: "증권 앱처럼 차트를 누르면 열리고 손가락으로 좌우 이동·확대").
 * 옆으로 밀기 · 두 손가락으로 벌리기 · 길게 누르면 그 봉의 값. 확대·축소 버튼과 키보드(←→ + − Home End)로도 돼요.
 * 받은 봉 전부(일봉 최대 530개)를 볼 수 있고, 처음엔 자세히 차트와 같은 구간이에요. 토스앱 뒤로가기로 닫혀요.
 */
export function ChartViewer({ name, interval, onInterval, bars, crypto, tz, unit, fx, failed, pending, onRetry }: ChartViewerProps) {
  const model = useMemo(() => (bars ? fullChart(bars, crypto) : null), [bars, crypto]);

  return (
    <main
      style={{
        height: '100vh',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        background: colors.background,
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div style={{ padding: '12px 24px 0' }}>
        <Text display="block" typography="t5" fontWeight="bold" color={colors.grey900}>
          {name}
        </Text>
      </div>
      <div style={{ padding: '12px 20px 0' }}>
        <SegmentedControl value={interval} onChange={(v) => onInterval(v as Interval)} aria-label="봉 단위">
          {INTERVALS.map((i) => (
            <SegmentedControl.Item key={i} value={i}>
              {INTERVAL_LABEL[i]}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl>
      </div>
      {model ? (
        <ChartBody key={interval} model={model} name={name} tz={tz} interval={interval} unit={unit} fx={fx} />
      ) : failed ? (
        <div style={{ margin: '40px 20px 0', textAlign: 'center' }}>
          <Text display="block" typography="t6" color={colors.grey700}>
            시세를 불러오지 못했어요
          </Text>
          <Button size="small" variant="weak" style={{ marginTop: 10 }} onClick={onRetry}>
            다시 시도
          </Button>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 260, margin: '16px 20px 0', display: 'flex', flexDirection: 'column' }}>
          <span aria-hidden="true" style={{ flex: 1, borderRadius: 12, background: colors.grey100 }} />
          {pending ? (
            <Text display="block" typography="t7" color={colors.grey600} style={{ marginTop: 12 }}>
              처음 보는 종목이라 시세를 받는 중이에요
            </Text>
          ) : null}
        </div>
      )}
    </main>
  );
}

interface ChartBodyProps {
  model: FullChartModel;
  name: string;
  tz: ExchangeTz;
  interval: Interval;
  unit: Unit;
  fx: boolean;
}

function ChartBody({ model, name, tz, interval, unit, fx }: ChartBodyProps) {
  const n = model.c.length;
  const [view, setViewState] = useState<ChartView>(() => initialView(n, n - model.detailStart));
  const viewRef = useRef(view);
  const setView = useCallback((v: ChartView) => {
    viewRef.current = v;
    setViewState(v);
  }, []);
  const [point, setPoint] = useState<number | null>(null);
  const hintId = useId();

  // 보는 동안 새 봉이 붙으면: 최신을 보던 중이면 최신에 붙어 있어요
  const seenN = useRef(n);
  useEffect(() => {
    if (seenN.current === n) return;
    const was = seenN.current;
    seenN.current = n;
    const v = viewRef.current;
    setView(clampView(v.end >= was - 1 - 0.01 ? { ...v, end: n - 1 } : v, n));
    setPoint(null);
  }, [n, setView]);

  // 그래프 크기 — 남은 높이를 다 써요(jsdom 처럼 잴 수 없으면 기본값)
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 350, h: 420 });
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.floor(r.width);
      const h = Math.floor(r.height);
      if (w > 0 && h > 0) setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // 오른쪽 눈금 자리는 받은 봉 전체의 가장 긴 글자로 고정 — 밀거나 벌릴 때 그래프 폭이 흔들리지 않게
  const gutter = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of model.c) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    const widest = Math.max(...[hi * 1.15, lo, lo * 0.9].map((v) => textWidth(axisText(v))));
    return Math.max(30, Math.ceil(widest + 12));
  }, [model.c]);
  const plotWidth = Math.max(1, size.w - ZOOM_PL - gutter);

  useChartGestures(boxRef, {
    n,
    plot: { left: ZOOM_PL, width: plotWidth },
    getView: () => viewRef.current,
    setView,
    // 짧게 누르면 그 봉 값 — 같은 봉을 한 번 더 누르면 닫혀요
    onPoint: (i, how) => setPoint((cur) => (how === 'tap' && cur === i ? null : i)),
  });

  const latest = atLatest(view, n);
  const minCount = Math.min(MIN_VISIBLE, n);
  const zoomBy = (factor: number) => {
    setPoint(null);
    setView(zoomView(viewRef.current, factor, atLatest(viewRef.current, n) ? 1 : 0.5, n));
  };
  const onKey = (e: KeyboardEvent) => {
    const v = viewRef.current;
    const step = Math.max(1, Math.round(v.count * 0.1));
    let next: ChartView | null = null;
    if (e.key === 'ArrowLeft') next = clampView({ ...v, end: v.end - step }, n);
    else if (e.key === 'ArrowRight') next = clampView({ ...v, end: v.end + step }, n);
    else if (e.key === '+' || e.key === '=') next = zoomView(v, ZOOM_STEP, 0.5, n);
    else if (e.key === '-' || e.key === '_') next = zoomView(v, 1 / ZOOM_STEP, 0.5, n);
    else if (e.key === 'Home') next = clampView({ ...v, end: 0 }, n);
    else if (e.key === 'End') next = clampView({ ...v, end: n - 1 }, n);
    if (!next) return;
    e.preventDefault();
    setPoint(null);
    setView(next);
  };

  const at = point ?? n - 1;
  const close = model.c[at];
  const prev = at > 0 ? model.c[at - 1] : null;
  const rsi = model.rsi[at];
  const zone = rsi === null ? null : zoneOf(rsi);
  const first = Math.max(0, Math.round(viewStart(view)));
  const lastShown = Math.min(n - 1, Math.round(view.end));
  const barUnit = BAR_UNIT[interval];
  const rangeLabel = `${name} ${INTERVAL_LABEL[interval]} 차트, ${formatBarPeriod(model.t[first], tz, interval)}부터 ${formatBarPeriod(model.t[lastShown], tz, interval)}까지 ${lastShown - first + 1}${barUnit}`;
  const roundButton = (disabled: boolean) =>
    ({
      width: 36,
      height: 36,
      borderRadius: 18,
      border: 0,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: colors.grey100,
      color: disabled ? colors.grey400 : colors.grey800,
      cursor: disabled ? 'default' : 'pointer',
      padding: 0,
    }) as const;

  return (
    <>
      {/* 보는 봉의 값 — 누르고 있으면 그 봉, 아니면 최신 봉 */}
      <div aria-live="polite" style={{ display: 'flex', alignItems: 'flex-end', gap: 12, padding: '16px 24px 0', minHeight: 50 }}>
        <div style={{ minWidth: 0 }}>
          <Text display="block" typography="t7" color={colors.grey600} style={tabular}>
            {formatBarPeriod(model.t[at], tz, interval)}
          </Text>
          <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0 6px', marginTop: 2 }}>
            <Text typography="t4" fontWeight="bold" color={colors.grey900} style={tabular}>
              {formatPrice(close, unit, fx)}
            </Text>
            {prev ? (
              <Text typography="t7" fontWeight="medium" color={changeColor(close - prev)} style={tabular}>
                {`${formatChange(close - prev, unit, fx, close)} (${formatPct(((close - prev) / prev) * 100)})`}
              </Text>
            ) : null}
          </div>
        </div>
        {rsi !== null && zone ? (
          <div style={{ marginLeft: 'auto', textAlign: 'right', flex: 'none' }}>
            <Text display="block" typography="t7" color={colors.grey600}>
              {`RSI · ${ZONE_LABEL[zone]}`}
            </Text>
            <Text display="block" typography="t4" fontWeight="bold" color={zoneInk(zone)} style={{ marginTop: 2, ...tabular }}>
              {formatRsi(rsi)}
            </Text>
          </div>
        ) : null}
      </div>

      <div
        ref={boxRef}
        role="img"
        aria-label={rangeLabel}
        aria-describedby={hintId}
        tabIndex={0}
        onKeyDown={onKey}
        style={{ position: 'relative', flex: 1, minHeight: 260, margin: '12px 20px 0', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', outline: 'none', cursor: 'grab' }}
      >
        <ZoomChart model={model} tz={tz} interval={interval} view={view} point={point} width={size.w} height={size.h} gutter={gutter} />
        {!latest ? (
          // 지난 봉을 보는 중이면 가격 칸 오른쪽 아래에 — 누르면 최신 봉으로
          <button
            type="button"
            onClick={() => {
              setPoint(null);
              setView(clampView({ ...viewRef.current, end: n - 1 }, n));
            }}
            style={{
              position: 'absolute',
              right: gutter + 6,
              top: zoomLayout(size.h).priceBottom - 40,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              height: 32,
              padding: '0 8px 0 12px',
              borderRadius: 16,
              border: `1px solid ${colors.grey200}`,
              background: colors.background,
              boxShadow: '0 2px 8px rgba(0, 23, 51, 0.08)',
              font: 'inherit',
              fontSize: 13,
              fontWeight: 600,
              color: colors.grey800,
              cursor: 'pointer',
            }}
          >
            최근으로
            <Icon name="chev" size={14} strokeWidth={2.4} />
          </button>
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px 0 24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', fontSize: 12, color: colors.grey700, minWidth: 0 }}>
          <span>
            <span style={{ color: MA_120 }}>┄</span> {`120${barUnit}선`}
          </span>
          {interval === '1d' ? (
            <>
              <span>
                <span style={{ color: MA_200 }}>—</span> 200일선
              </span>
              <span>
                <span style={{ color: MA_50W }}>—</span> 50주선
              </span>
            </>
          ) : null}
        </div>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, flex: 'none' }}>
          <button type="button" aria-label="축소" disabled={view.count >= n} onClick={() => zoomBy(1 / ZOOM_STEP)} style={roundButton(view.count >= n)}>
            <Icon name="minus" size={18} />
          </button>
          <button type="button" aria-label="확대" disabled={view.count <= minCount} onClick={() => zoomBy(ZOOM_STEP)} style={roundButton(view.count <= minCount)}>
            <Icon name="plus" size={18} />
          </button>
        </span>
      </div>
      <div id={hintId} style={{ padding: '10px 24px 0' }}>
        <Text display="block" typography="t7" color={colors.grey600} style={{ lineHeight: 1.5 }}>
          옆으로 밀면 지난 봉이 보이고, 두 손가락으로 벌리면 커져요. 누르고 있으면 그 봉의 값이 보여요.
        </Text>
      </div>
    </>
  );
}
