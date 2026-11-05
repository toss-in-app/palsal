import { colors } from '@toss/tds-colors';
import { Text, Top } from '@toss/tds-mobile';

import { ChangeIcon } from '../components/ChangeIcon';
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
}

/** 최근 바뀐 것 전체(7일). 알림 받기 카드는 기능 ⑧ 에서 이 화면 아래에 더해요 */
export function ChangesScreen({ today, items, cards, onOpen }: ChangesScreenProps) {
  return (
    <main style={{ paddingBottom: 40 }}>
      <Top
        subtitleTop={<Top.SubtitleParagraph size={13}>{formatDateLabel(today)}</Top.SubtitleParagraph>}
        title={<Top.TitleParagraph size={22}>최근 바뀐 것</Top.TitleParagraph>}
      />
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
      <Text display="block" typography="t7" color={colors.grey500} style={{ margin: '20px 24px 0', lineHeight: 1.6 }}>
        RSI 30 아래·70 위 진입, 60일선과 120일선 교차, 5년 최고가가 여기에 와요. 담은 종목을 볼 때 찾아서 기록하고, 7일 지난 소식은 지워져요.
      </Text>
    </main>
  );
}
