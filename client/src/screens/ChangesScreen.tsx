import { colors } from '@toss/tds-colors';
import { Button, Text, Top } from '@toss/tds-mobile';

import { AdMark } from '../components/AdMark';
import { ChangeIcon } from '../components/ChangeIcon';
import { AD_MESSAGES } from '../ads/rules';
import { changeView } from '../lib/changeView';
import { formatDateLabel } from '../lib/date';
import { formatRsi } from '../lib/format';
import type { CardsState } from '../state/cards';
import type { ChangeItem } from '../state/changes';

export interface ChangesScreenProps {
  today: string;
  items: ChangeItem[];
  cards: CardsState;
  onOpen: (c: ChangeItem) => void;
  /** 알림 받기 카드(담은 종목이 있고 · 아직 동의 전이고 · 닫은 적 없을 때만 App 이 넘겨요) */
  notificationCard?: { onAgree: () => void; onDismiss: () => void };
  /** 전면 광고 차례인 날: 위 안내 한 줄 + 줄마다 AD */
  adUpcoming?: boolean;
}

/** 최근 바뀐 것 전체(7일) + (조건이 맞을 때) 매일 알림 받기 카드 */
export function ChangesScreen({ today, items, cards, onOpen, notificationCard, adUpcoming = false }: ChangesScreenProps) {
  return (
    <main style={{ paddingBottom: 40 }}>
      <Top
        subtitleTop={<Top.SubtitleParagraph size={13}>{formatDateLabel(today)}</Top.SubtitleParagraph>}
        title={<Top.TitleParagraph size={22}>최근 바뀐 것</Top.TitleParagraph>}
      />
      {adUpcoming && items.length ? (
        <Text display="block" typography="t7" color={colors.grey700} style={{ margin: '0 24px 8px' }}>
          {AD_MESSAGES.interstitialNotice}
        </Text>
      ) : null}
      {items.length ? (
        <ul aria-label="최근 바뀐 것" style={{ listStyle: 'none', margin: 0, padding: '0 20px' }}>
          {items.map((c) => {
            const v = changeView(c);
            const now = cards.entries[c.watchId]?.analysis?.rsi ?? null;
            const rsiNow = (c.kind === 'rsi_low_enter' || c.kind === 'rsi_high_enter') && now !== null ? ` · 지금 ${formatRsi(now)}` : '';
            return (
              <li key={`${c.watchId}|${c.kind}|${c.date}`}>
                <button
                  type="button"
                  onClick={() => onOpen(c)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', border: 0, background: 'none', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
                >
                  <ChangeIcon view={v} size={40} />
                  <span style={{ minWidth: 0 }}>
                    <Text display="block" typography="t6" fontWeight="semibold" color={colors.grey900}>
                      {v.title}
                    </Text>
                    <Text display="block" typography="st12" color={colors.grey500} style={{ marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                      {adUpcoming ? <AdMark /> : null}
                      {v.sub + rsiNow}
                    </Text>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <Text display="block" typography="t6" color={colors.grey700} style={{ margin: '8px 24px 0' }}>
          최근 7일 동안 바뀐 것이 없어요
        </Text>
      )}
      {notificationCard ? (
        <section aria-label="알림 받기" style={{ margin: '16px 20px 0', padding: '18px 18px 14px', borderRadius: 20, background: colors.grey50 }}>
          <Text display="block" typography="t6" fontWeight="bold" color={colors.grey900}>
            이런 소식을 매일 오전 10시에 알림으로 받을까요?
          </Text>
          <Text display="block" typography="t7" color={colors.grey600} style={{ marginTop: 4 }}>
            'RSI 확인 · 오늘 내 종목 RSI를 정리했어요'로 알려 드려요
          </Text>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button size="medium" variant="weak" color="dark" style={{ flex: 1 }} onClick={notificationCard.onDismiss}>
              닫기
            </Button>
            <Button size="medium" style={{ flex: 1 }} onClick={notificationCard.onAgree}>
              알림 받기
            </Button>
          </div>
        </section>
      ) : null}
      <Text display="block" typography="t7" color={colors.grey500} style={{ margin: '20px 24px 0', lineHeight: 1.6 }}>
        RSI 30 아래·70 위 진입, 60일선과 120일선 교차, 5년 최고가가 여기에 와요. 담은 종목을 볼 때 찾아서 기록하고, 7일 지난 소식은 지워져요.
      </Text>
    </main>
  );
}
