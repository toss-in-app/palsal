import { colors } from '@toss/tds-colors';
import { Text } from '@toss/tds-mobile';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { DATE_H, PricePanel, RsiPanel } from './ChartPanels';
import { Icon } from './Icon';
import { axisText, textWidth } from '../lib/chartText';
import { atLatest, clampView, initialView, MIN_VISIBLE, viewStart, ZOOM_PL, zoomView, type ChartView } from '../lib/chartView';
import { BAR_UNIT, formatBarPeriod, INTERVAL_LABEL } from '../lib/format';
import { haptic } from '../lib/haptic';
import type { ExchangeTz, FullChartModel, Interval } from '../lib/series';
import { useChartGestures } from '../lib/useChartGestures';

const PRICE_H = 222;
const RSI_H = 112;
/** 확대·축소 단추 한 번에 */
const ZOOM_STEP = 1.5;

export interface ZoomControls {
  zoomIn: () => void;
  zoomOut: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
}

export interface StockChartProps {
  model: FullChartModel;
  name: string;
  tz: ExchangeTz;
  interval: Interval;
  /** 값을 보는 봉(누르고 있는 동안만) — 위 가격 · RSI 자리가 이 봉 값으로 바뀌어요. null = 최신 */
  point: number | null;
  onPoint: (index: number | null) => void;
  /** 쓰는 법 한 줄 — 처음 밀거나 벌리거나 누르고 있어 본 뒤엔 숨겨요 */
  hint: boolean;
  /** 가격 칸과 RSI 칸 사이(범례 · RSI 머리) — 확대·축소 단추를 넣을 수 있게 받아요 */
  between: (zoom: ZoomControls) => ReactNode;
  /** 처음 밀었을 때 · 벌렸을 때 · 값을 봤을 때 한 번씩(분석) */
  onUse?: (kind: 'pan' | 'zoom' | 'point') => void;
}

/**
 * 종목 자세히의 차트 — 들어가는 화면 없이 그 자리에서 바로(사용자 2026-11-06 "클릭하고 들어가는 거 말고 바로, depth 깊지 않게").
 * 옆으로 밀기 · 두 손가락 벌리기 · 누르고 있기(값, 떼면 원래대로 — 짧게 누르기는 아무것도 안 바꿔요). 위아래로 밀면 화면이 스크롤돼요(touch-action: pan-y).
 * 처음엔 예전 자세히 차트와 같은 구간(최근 180봉, 엇갈림이 있으면 더), 받은 봉 전부까지 볼 수 있어요. 봉 단위가 바뀌면 key 로 새로.
 */
export function StockChart({ model, name, tz, interval, point, onPoint, hint, between, onUse }: StockChartProps) {
  const n = model.c.length;
  const [view, setViewState] = useState<ChartView>(() => initialView(n, n - model.detailStart));
  const viewRef = useRef(view);
  const onPointRef = useRef(onPoint);
  const onUseRef = useRef(onUse);
  useLayoutEffect(() => {
    onPointRef.current = onPoint;
    onUseRef.current = onUse;
  });
  const used = useRef(new Set<string>());
  const markUsed = useCallback((kind: 'pan' | 'zoom' | 'point') => {
    if (used.current.has(kind)) return;
    used.current.add(kind);
    onUseRef.current?.(kind);
  }, []);
  const setView = useCallback(
    (v: ChartView) => {
      const prev = viewRef.current;
      if (Math.abs(v.count - prev.count) > 1e-6) markUsed('zoom');
      else if (Math.abs(v.end - prev.end) > 1e-6) markUsed('pan');
      viewRef.current = v;
      setViewState(v);
    },
    [markUsed],
  );
  const hintId = useId();

  // 보는 동안 새 봉이 붙으면: 최신을 보던 중이면 최신에 붙어 있어요
  const seenN = useRef(n);
  useEffect(() => {
    if (seenN.current === n) return;
    const was = seenN.current;
    seenN.current = n;
    const v = viewRef.current;
    viewRef.current = clampView(v.end >= was - 1 - 0.01 ? { ...v, end: n - 1 } : v, n);
    setViewState(viewRef.current);
    onPointRef.current(null);
  }, [n]);

  // 그림 폭은 화면 폭에 맞춰요(jsdom 처럼 잴 수 없으면 기본값)
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(350);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w > 0) setWidth((s) => (s === w ? s : w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
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

  const holding = useRef(false);
  const gestures = {
    n,
    plot: { left: ZOOM_PL, width: Math.max(1, width - ZOOM_PL - gutter) },
    getView: () => viewRef.current,
    setView,
    // 누르고 있는 동안 그 봉(시작할 때 짧게 진동), 떼면 최신으로
    onPoint: (i: number | null, how: 'hold' | 'clear') => {
      if (how === 'hold' && !holding.current) haptic('tickWeak');
      holding.current = how === 'hold';
      if (i !== null) markUsed('point');
      onPointRef.current(i);
    },
  };
  const priceRef = useRef<HTMLDivElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  useChartGestures(priceRef, gestures);
  useChartGestures(rsiRef, gestures);

  const latest = atLatest(view, n);
  const minCount = Math.min(MIN_VISIBLE, n);
  const zoomBy = (factor: number) => {
    onPointRef.current(null);
    setView(zoomView(viewRef.current, factor, atLatest(viewRef.current, n) ? 1 : 0.5, n));
  };
  const zoom: ZoomControls = { zoomIn: () => zoomBy(ZOOM_STEP), zoomOut: () => zoomBy(1 / ZOOM_STEP), canZoomIn: view.count > minCount, canZoomOut: view.count < n };
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
    onPointRef.current(null);
    setView(next);
  };

  const first = Math.max(0, Math.round(viewStart(view)));
  const lastShown = Math.min(n - 1, Math.round(view.end));
  const rangeLabel = `${name} ${INTERVAL_LABEL[interval]} 차트, ${formatBarPeriod(model.t[first], tz, interval)}부터 ${formatBarPeriod(model.t[lastShown], tz, interval)}까지 ${lastShown - first + 1}${BAR_UNIT[interval]}`;
  const surface = { position: 'relative', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', outline: 'none', cursor: 'grab' } as const;

  return (
    <>
      <div ref={boxRef} style={{ margin: '14px 20px 0' }}>
        <div ref={priceRef} role="img" aria-label={rangeLabel} aria-describedby={hint ? hintId : undefined} tabIndex={0} onKeyDown={onKey} style={surface}>
          <PricePanel model={model} tz={tz} interval={interval} view={view} point={point} width={width} height={PRICE_H} gutter={gutter} />
          {!latest ? (
            // 지난 봉을 보는 중이면 가격 칸 오른쪽 아래에 — 누르면 최신 봉으로
            <button
              type="button"
              onClick={() => {
                onPointRef.current(null);
                setView(clampView({ ...viewRef.current, end: n - 1 }, n));
              }}
              className="tap"
              style={{
                position: 'absolute',
                right: gutter + 6,
                top: PRICE_H - DATE_H - 40,
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
      </div>
      {between(zoom)}
      <div style={{ margin: '0 20px' }}>
        <div ref={rsiRef} aria-hidden="true" style={surface}>
          <RsiPanel model={model} view={view} point={point} width={width} height={RSI_H} gutter={gutter} />
        </div>
      </div>
      {hint ? (
        <div id={hintId} style={{ margin: '8px 24px 0' }}>
          <Text display="block" typography="t7" color={colors.grey600} style={{ lineHeight: 1.5 }}>
            옆으로 밀면 지난 봉, 두 손가락으로 벌리면 크게 보여요. 누르고 있으면 그 봉의 값이 위에 나와요.
          </Text>
        </div>
      ) : null}
    </>
  );
}
