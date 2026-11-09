import { colors } from '@toss/tds-colors';
import { BottomSheet, Button, SegmentedControl, Text, Top } from '@toss/tds-mobile';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { logEvent } from '../lib/analytics';

import { AD_GROUPS } from '../ads/config';
import { AdBanner } from '../components/AdBanner';
import { FearGreedGauge } from '../components/FearGreedGauge';
import { Icon } from '../components/Icon';
import { Pill } from '../components/Pill';
import { TermSheet } from '../components/TermSheet';
import { symbolIndex, type ContentFile, type UniverseFile } from '../content';
import type { FearGreed, MarketPayload, MarketRow, Vix } from '../data/types';
import { formatDateLabel } from '../lib/date';
import { formatKstTime, formatPct, formatRsi, INTERVAL_LABEL } from '../lib/format';
import { LOW_LINE, zoneOf } from '../lib/indicators';
import { changeColor, LOW_BG, PAGE_BG, zoneInk } from '../lib/palette';
import { VIX_HINT, VIX_LABEL, vixInk, vixZone } from '../lib/vix';
import type { Interval } from '../lib/series';
import type { MarketState } from '../state/market';
import type { WatchItem } from '../state/watch';

const INTERVALS: Interval[] = ['1d', '1wk', '1mo'];

/** 'RSI 30 아래' 버튼(시험자 필귀 2026-11-06 "미장 국장 코인 버튼 있어서 종류별로") */
type Side = 'kr' | 'us' | 'crypto';
type LowTab = 'all' | Side;
const SIDE_LABEL: Record<Side, string> = { kr: '한국', us: '미국', crypto: '코인' };
const EMPTY_TEXT: Record<LowTab, string> = {
  all: '지금은 RSI 30 아래인 큰 종목이 없어요',
  kr: '지금은 RSI 30 아래인 한국 큰 종목이 없어요',
  us: '지금은 RSI 30 아래인 미국 큰 종목이 없어요',
  crypto: '지금은 RSI 30 아래인 코인이 없어요',
};

/** 일봉 RSI 30 이하, 낮은 순 */
function lowOf(rows: MarketRow[]): MarketRow[] {
  return rows.filter((r) => r.rsi !== null && r.rsi <= LOW_LINE).sort((a, b) => (a.rsi as number) - (b.rsi as number));
}

export interface MarketScreenProps {
  today: string;
  market: MarketState;
  universe: UniverseFile;
  watched: WatchItem[];
  glossary: ContentFile['glossary'];
  onRetry: () => void;
  onOpen: (symbol: string) => void;
  onAdd: (symbol: string, interval: Interval) => void;
}

const nameOf = (s: string) => symbolIndex.get(s)?.n ?? s;
// 그림자 없이 평평하게, 모서리 16(ref/designers/madia-uiux.md)
const card = { background: colors.background, borderRadius: 16 } as const;

/** 카드 제목 옆 (i) — 누르면 그 지수의 읽는 법 시트 */
function InfoButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="tap tap-soft" style={{ border: 0, background: 'none', padding: 4, cursor: 'pointer', display: 'inline-flex', color: colors.grey600 }}>
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 11v5" />
        <path d="M12 7.6v.1" />
      </svg>
    </button>
  );
}

function FearGreedCard({ title, v, onInfo }: { title: string; v: FearGreed; onInfo: () => void }) {
  return (
    <>
      {/* 좁은 화면(320)에선 제목이 꺾이지 않고 출처가 다음 줄로 내려가요 */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 4 }}>
        <Text typography="t6" fontWeight="bold" color={colors.grey900} style={{ whiteSpace: 'nowrap' }}>
          {title}
        </Text>
        <InfoButton label="공포탐욕지수 계산 방법" onClick={onInfo} />
        {v.attribution ? (
          <Text typography="st12" color={colors.grey600} style={{ marginLeft: 'auto' }}>
            {v.attribution}
          </Text>
        ) : null}
      </div>
      <div style={{ marginTop: 6 }}>
        <FearGreedGauge score={v.score} label={v.label} />
      </div>
      <Text display="block" typography="t7" color={colors.grey600} style={{ textAlign: 'center', marginTop: 4 }}>
        {v.basis}
      </Text>
    </>
  );
}

const VIX_SPARK_H = 56;
/** 늘 보이게 긋는 기준선(이 위가 공포 쪽) */
const VIX_GUIDES = [20, 30];

/** 최근 반년 VIX 선 — 20 · 30 기준선을 늘 보이게 세로 범위를 잡고, 30 위는 공포 구간이라 옅게 칠해요(RSI 차트의 30 · 70 과 같은 말투) */
function VixSpark({ closes }: { closes: number[] }) {
  const W = 300;
  const n = closes.length;
  const top = Math.max(34, ...closes) * 1.04;
  const bottom = Math.min(10, ...closes) * 0.96;
  const y = (v: number) => ((top - v) / (top - bottom)) * VIX_SPARK_H;
  const x = (i: number) => (i / Math.max(1, n - 1)) * W;
  const d = closes.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const last = closes[n - 1];
  // 글자 · 끝점은 늘어나지 않게 SVG 밖(HTML)에, 선은 폭에 맞춰 늘려요(굵기는 그대로)
  return (
    <div aria-hidden="true" style={{ position: 'relative', display: 'flex', gap: 6, height: VIX_SPARK_H }}>
      <svg viewBox={`0 0 ${W} ${VIX_SPARK_H}`} preserveAspectRatio="none" width="100%" height={VIX_SPARK_H} style={{ flex: 1, minWidth: 0, display: 'block', overflow: 'visible' }}>
        <rect x={0} y={0} width={W} height={y(30)} fill={LOW_BG} />
        {VIX_GUIDES.map((v) => (
          <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} stroke={colors.grey300} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={d} fill="none" stroke={colors.grey800} strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span style={{ position: 'absolute', right: 24 - 4, top: y(last) - 4, width: 8, height: 8, borderRadius: 4, background: vixInk(vixZone(last)), boxShadow: '0 0 0 2px #fff' }} />
      <span style={{ position: 'relative', width: 18, flex: 'none' }}>
        {VIX_GUIDES.map((v) => (
          <span key={v} style={{ position: 'absolute', right: 0, top: y(v) - 7, fontSize: 11, lineHeight: '14px', color: colors.grey600, fontVariantNumeric: 'tabular-nums' }}>
            {v}
          </span>
        ))}
      </span>
    </div>
  );
}

/** VIX 카드(v1.18, 사용자 2026-11-09 "공포탐욕지수 칸에 VIX도 + 활용법(몇 넘으면 어떤지)") — 공포탐욕 카드와 같은 높이 */
function VixCard({ vix, onInfo }: { vix: Vix; onInfo: () => void }) {
  const zone = vixZone(vix.value);
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Text typography="t6" fontWeight="bold" color={colors.grey900}>
          VIX 변동성지수
        </Text>
        <InfoButton label="VIX 읽는 법" onClick={onInfo} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <span style={{ fontSize: 34, fontWeight: 700, lineHeight: '40px', color: colors.grey900, fontVariantNumeric: 'tabular-nums' }}>{vix.value.toFixed(2)}</span>
        <span>
          <Text display="block" typography="t6" fontWeight="bold" color={vixInk(zone)}>
            {VIX_LABEL[zone]}
          </Text>
          {/* 등락은 앱의 다른 가격처럼 퍼센트만(전일 대비) — 320 화면에서도 한 줄 */}
          {vix.changePct !== null ? (
            <Text display="block" typography="t7" fontWeight="medium" color={changeColor(vix.changePct)} style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {formatPct(vix.changePct)}
            </Text>
          ) : null}
        </span>
      </div>
      <div style={{ marginTop: 8 }}>
        <VixSpark closes={vix.closes} />
      </div>
      <Text display="block" typography="t7" color={colors.grey600} style={{ textAlign: 'center', marginTop: 6 }}>
        {VIX_HINT}
      </Text>
    </>
  );
}

function FearGreedStrip({ fg, vix, onInfo, onVixInfo }: { fg: MarketPayload['fearGreed']; vix: Vix | undefined; onInfo: () => void; onVixInfo: () => void }) {
  const strip = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  // VIX 는 미국 공포탐욕 바로 뒤(둘 다 미국 시장). 서버가 아직 안 넣었으면 카드 없이 3장
  const items: { key: string; label: string; node: ReactNode }[] = [
    { key: 'kr', label: '한국 공포탐욕', node: <FearGreedCard title="한국 공포탐욕" v={fg.kr} onInfo={onInfo} /> },
    { key: 'us', label: '미국 공포탐욕', node: <FearGreedCard title="미국 공포탐욕" v={fg.us} onInfo={onInfo} /> },
    ...(vix ? [{ key: 'vix', label: 'VIX 변동성지수', node: <VixCard vix={vix} onInfo={onVixInfo} /> }] : []),
    { key: 'crypto', label: '코인 공포탐욕', node: <FearGreedCard title="코인 공포탐욕" v={fg.crypto} onInfo={onInfo} /> },
  ];
  const onScroll = () => {
    const el = strip.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (el && first) setPage(Math.round(el.scrollLeft / (first.offsetWidth + 12)));
  };
  return (
    <section aria-label={vix ? '공포탐욕지수와 VIX' : '공포탐욕지수'}>
      <div ref={strip} onScroll={onScroll} style={{ display: 'flex', gap: 12, overflowX: 'auto', scrollSnapType: 'x mandatory', padding: '4px 20px 0', scrollPadding: '0 20px', scrollbarWidth: 'none' }}>
        {/* 다음 카드가 24px 보이게(전엔 8px 라 옆으로 넘길 수 있다는 걸 점 3개로만 알 수 있었어요) */}
        {items.map((it) => (
          // 카드마다 이름 붙은 묶음 — 화면 읽기 프로그램에서 카드 단위로 넘겨 들을 수 있게
          <div key={it.key} role="group" aria-label={it.label} style={{ ...card, flex: 'none', width: 'calc(100% - 56px)', scrollSnapAlign: 'start', padding: '20px 20px 16px' }}>
            {it.node}
          </div>
        ))}
      </div>
      <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 8 }}>
        {items.map((it, i) => (
          <span key={it.key} style={{ width: i === page ? 16 : 6, height: 6, borderRadius: 3, background: i === page ? colors.grey700 : colors.grey300 }} />
        ))}
      </div>
    </section>
  );
}

function RsiTrack({ rsi }: { rsi: number }) {
  const ink = zoneInk(zoneOf(rsi));
  return (
    <span aria-hidden="true" style={{ position: 'relative', display: 'inline-block', width: 64, height: 6, borderRadius: 3, background: colors.grey100, flex: 'none' }}>
      <span style={{ position: 'absolute', left: '30%', top: -2, width: 1, height: 10, background: colors.grey300 }} />
      <span style={{ position: 'absolute', left: '70%', top: -2, width: 1, height: 10, background: colors.grey300 }} />
      <span style={{ position: 'absolute', left: `calc(${Math.max(0, Math.min(100, rsi))}% - 5px)`, top: -2, width: 10, height: 10, borderRadius: 5, background: ink }} />
    </span>
  );
}

/** 시장(탭 2, 흐름 문서 'market'): 공포탐욕 3 + VIX · 지금 RSI 30 아래인 큰 종목 · 시가총액 순위 */
export function MarketScreen({ today, market, universe, watched, glossary, onRetry, onOpen, onAdd }: MarketScreenProps) {
  const [rankTab, setRankTab] = useState<'kr' | 'us'>('kr');
  const [lowTab, setLowTab] = useState<LowTab>('all');
  const [term, setTerm] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [shownAdding, setShownAdding] = useState<string | null>(null);
  const [interval, setBarInterval] = useState<Interval>('1d');
  useEffect(() => {
    if (adding) setShownAdding(adding);
  }, [adding]);
  const viewed = useRef(false);
  useEffect(() => {
    const d = market.data;
    if (!d || viewed.current) return;
    viewed.current = true;
    logEvent('market_view', { kr_low: lowOf(d.universe.kr).length, us_low: lowOf(d.universe.us).length, crypto_low: lowOf(d.universe.crypto ?? []).length });
  }, [market.data]);

  const data = market.data;
  const groups: Record<Side, MarketRow[]> = { kr: data?.universe.kr ?? [], us: data?.universe.us ?? [], crypto: data?.universe.crypto ?? [] };
  const sideOf = new Map<string, Side>((['kr', 'us', 'crypto'] as Side[]).flatMap((side) => groups[side].map((r) => [r.symbol, side] as const)));
  const lows: Record<LowTab, MarketRow[]> = {
    all: lowOf([...groups.kr, ...groups.us, ...groups.crypto]),
    kr: lowOf(groups.kr),
    us: lowOf(groups.us),
    crypto: lowOf(groups.crypto),
  };
  // 서버가 아직 코인 줄을 안 넣었으면(예전 계산) 코인 버튼은 숨겨요
  const tabs: LowTab[] = groups.crypto.length ? ['all', 'kr', 'us', 'crypto'] : ['all', 'kr', 'us'];
  const shownLow = lows[lowTab];
  const isWatched = (s: string) => watched.some((w) => w.symbol === s);
  const stockTotal = groups.kr.length + groups.us.length;
  const lowNote = {
    all: groups.crypto.length ? `한국·미국 시총 상위 ${stockTotal}개 · 코인 ${groups.crypto.length}개 중` : `한국·미국 시가총액 상위 ${stockTotal}개 중`,
    kr: `한국 시가총액 상위 ${groups.kr.length}개 중`,
    us: `미국 시가총액 상위 ${groups.us.length}개 중`,
    crypto: `주요 코인 ${groups.crypto.length}개 중`,
  }[lowTab];
  const rank: MarketRow[] = data ? data.universe[rankTab].slice(0, 15) : [];
  const asOf = universe.asOfDate;

  return (
    <main style={{ minHeight: '100vh', background: PAGE_BG, paddingBottom: 120 }}>
      <Top style={{ background: PAGE_BG }} subtitleTop={<Top.SubtitleParagraph size={13}>{formatDateLabel(today)}</Top.SubtitleParagraph>} title={<Top.TitleParagraph size={28}>시장</Top.TitleParagraph>} />

      {!data && market.status === 'error' ? (
        <section style={{ ...card, margin: '8px 20px 0', padding: '28px 20px 20px', textAlign: 'center' }}>
          <Text display="block" typography="t6" color={colors.grey700}>
            시장 정보를 불러오지 못했어요
          </Text>
          <Button size="small" variant="weak" style={{ marginTop: 10 }} onClick={onRetry}>
            다시 시도
          </Button>
        </section>
      ) : !data ? (
        <div aria-label="시장 정보를 불러오는 중" style={{ margin: '4px 20px 0' }}>
          <span aria-hidden="true" style={{ ...card, display: 'block', height: 210 }} />
          <span aria-hidden="true" style={{ ...card, display: 'block', height: 240, marginTop: 12 }} />
        </div>
      ) : (
        <>
          <FearGreedStrip fg={data.fearGreed} vix={data.vix} onInfo={() => setTerm('fear-greed')} onVixInfo={() => setTerm('vix')} />

          <section aria-label="지금 RSI 30 아래인 큰 종목" style={{ ...card, margin: '12px 20px 0', padding: '20px 0 8px' }}>
            <div style={{ padding: '0 20px 8px' }}>
              <Text display="block" typography="t5" fontWeight="bold" color={colors.grey900}>
                지금 RSI 30 아래인 큰 종목
              </Text>
              <Text display="block" typography="t7" color={colors.grey600} style={{ marginTop: 2 }}>
                {`${lowNote} · 일봉 RSI 14`}
              </Text>
            </div>
            <div role="group" aria-label="시장 고르기" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '6px 20px 6px' }}>
              {tabs.map((t) => (
                <Pill key={t} on={lowTab === t} onClick={() => setLowTab(t)}>
                  {`${t === 'all' ? '전체' : SIDE_LABEL[t]} ${lows[t].length}`}
                </Pill>
              ))}
            </div>
            {shownLow.length ? (
              // 버튼을 바꾸면 목록을 새로 그려 줄마다 차례로 올라와요
              <ul key={lowTab} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {shownLow.map((r, i) => {
                  const s = r.symbol;
                  const side = sideOf.get(s);
                  const done = isWatched(s);
                  return (
                    <li key={s} className="rise-in" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 0 20px', minHeight: 60, animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                      {/* 줄 어디를 눌러도 자세히(row-stretch), 담기 단추만 따로 */}
                      <button type="button" onClick={() => onOpen(s)} className="row-stretch" style={{ flex: 1, minWidth: 0, border: 0, background: 'none', padding: '8px 0', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}>
                        <Text display="block" typography="t6" fontWeight="semibold" color={colors.grey900} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {nameOf(s)}
                        </Text>
                        <Text display="block" typography="t7" color={colors.grey600} style={{ marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                          {/* 한 시장만 볼 때는 시장 이름을 되풀이하지 않아요 */}
                          {`${lowTab === 'all' && side ? `${SIDE_LABEL[side]} · ` : ''}RSI ${formatRsi(r.rsi as number)}`}
                        </Text>
                      </button>
                      <Button size="small" variant="weak" disabled={done} onClick={() => setAdding(s)} style={{ position: 'relative', zIndex: 1 }}>
                        {done ? '담음' : '담기'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Text display="block" typography="t7" color={colors.grey600} style={{ padding: '10px 20px 12px' }}>
                {EMPTY_TEXT[lowTab]}
              </Text>
            )}
          </section>

          {/* 배너 광고 banner-market: '지금 RSI 30 아래인 큰 종목' 뒤 1개 — 계약 events.md */}
          <div style={{ margin: '12px 20px 0' }}>
            <AdBanner adGroupId={AD_GROUPS.bannerMarket} onResult={(result) => logEvent('ad_banner', { slot: 'market', result })} />
          </div>

          <section aria-label="시가총액 순위" style={{ ...card, margin: '12px 20px 0', padding: '20px 0 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 8px' }}>
              <Text typography="t5" fontWeight="bold" color={colors.grey900}>
                시가총액 순위
              </Text>
              <div role="group" aria-label="시장" style={{ display: 'flex', gap: 6 }}>
                <Pill on={rankTab === 'kr'} onClick={() => setRankTab('kr')}>
                  한국
                </Pill>
                <Pill on={rankTab === 'us'} onClick={() => setRankTab('us')}>
                  미국
                </Pill>
              </div>
            </div>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {rank.map((r) => (
                <li key={r.symbol}>
                  <button
                    type="button"
                    onClick={() => onOpen(r.symbol)}
                    className="tap-row"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', border: 0, background: 'none', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
                  >
                    <Text typography="t7" fontWeight="medium" color={colors.grey600} style={{ width: 20, flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
                      {r.rank}
                    </Text>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <Text display="block" typography="t6" fontWeight="semibold" color={colors.grey900} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {nameOf(r.symbol)}
                      </Text>
                      {r.changePct !== null ? (
                        <Text display="block" typography="t7" color={changeColor(r.changePct)} style={{ marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                          {formatPct(r.changePct)}
                        </Text>
                      ) : null}
                    </span>
                    {r.rsi !== null ? (
                      <>
                        <RsiTrack rsi={r.rsi} />
                        <Text typography="t7" fontWeight="bold" color={zoneInk(zoneOf(r.rsi))} style={{ width: 40, textAlign: 'right', flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
                          {formatRsi(r.rsi)}
                        </Text>
                      </>
                    ) : null}
                    <Icon name="chev" size={16} color={colors.grey400} />
                  </button>
                </li>
              ))}
            </ol>
            <Text display="block" typography="st12" color={colors.grey600} style={{ padding: '8px 20px 4px' }}>
              {`${rank.length}위까지 · ${Number(asOf.slice(5, 7))}월 ${Number(asOf.slice(8, 10))}일 기준 순위 · 오른쪽 숫자는 일봉 RSI 14`}
            </Text>
          </section>

          <Text display="block" typography="st12" color={colors.grey700} style={{ margin: '16px 24px 0' }}>
            {`30분마다 다시 계산해요 · ${formatKstTime(Date.parse(data.computedAt))} 기준`}
          </Text>
        </>
      )}

      <BottomSheet
        open={adding !== null}
        onClose={() => setAdding(null)}
        aria-label="내 종목에 담기"
        cta={
          <BottomSheet.CTA
            onClick={() => {
              if (adding) onAdd(adding, interval);
              setAdding(null);
            }}
          >
            {`${INTERVAL_LABEL[interval]}으로 담기`}
          </BottomSheet.CTA>
        }
      >
        <div style={{ padding: '4px 24px 12px' }}>
          <Text display="block" typography="t4" fontWeight="bold" color={colors.grey900}>
            {shownAdding ? `${nameOf(shownAdding)} 담기` : '담기'}
          </Text>
          <Text display="block" typography="t7" color={colors.grey600} style={{ margin: '6px 0 14px' }}>
            어떤 봉으로 볼지 골라 주세요
          </Text>
          <SegmentedControl value={interval} onChange={(v) => setBarInterval(v as Interval)} aria-label="봉 단위">
            {INTERVALS.map((i) => (
              <SegmentedControl.Item key={i} value={i}>
                {INTERVAL_LABEL[i]}
              </SegmentedControl.Item>
            ))}
          </SegmentedControl>
        </div>
      </BottomSheet>

      <TermSheet glossary={glossary} term={term} onChange={setTerm} />
    </main>
  );
}
