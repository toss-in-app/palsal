import { colors } from '@toss/tds-colors';
import { Button, Text, Top } from '@toss/tds-mobile';

import { formatDateLabel } from '../lib/date';

export interface HomeScreenProps {
  /** 한국 날짜 'YYYY-MM-DD' */
  today: string;
  /** 담은 종목 수 */
  count: number;
  notice: string | null;
  disclaimer: string;
  onAdd: () => void;
  onOpenMarket: () => void;
}

/**
 * 내 종목(탭 1). 4단계 골격은 머리와 빈 목록까지.
 * 변화 배너 · 칩 · 차트 카드 무한 스크롤 · 길게 눌러 편집은 5단계(흐름 문서 'home — 내 종목').
 */
export function HomeScreen({ today, count, notice, disclaimer, onAdd, onOpenMarket }: HomeScreenProps) {
  return (
    <main style={{ paddingBottom: 120 }}>
      <Top
        title={<Top.TitleParagraph size={22}>{`내 종목 ${count}`}</Top.TitleParagraph>}
        subtitleBottom={<Top.SubtitleParagraph size={15}>{formatDateLabel(today)}</Top.SubtitleParagraph>}
      />
      {notice ? (
        <Text display="block" typography="t7" color={colors.grey700} style={{ margin: '0 24px 12px' }}>
          {notice}
        </Text>
      ) : null}
      {count === 0 ? (
        <section aria-label="담아 둔 종목" style={{ margin: '8px 20px 0', padding: '28px 20px 20px', borderRadius: 20, background: colors.grey50, textAlign: 'center' }}>
          <Text display="block" typography="t5" color={colors.grey900} style={{ fontWeight: 700 }}>
            담아 둔 종목이 없어요
          </Text>
          <Text display="block" typography="t7" color={colors.grey600} style={{ marginTop: 6 }}>
            종목을 담으면 RSI와 차트를 여기서 이어서 볼 수 있어요
          </Text>
          <div style={{ marginTop: 18, display: 'grid', gap: 8 }}>
            <Button display="block" size="large" onClick={onAdd}>
              첫 종목 담기
            </Button>
            <Button display="block" size="large" variant="weak" onClick={onOpenMarket}>
              시장에서 큰 종목 보기
            </Button>
          </div>
        </section>
      ) : null}
      <Text display="block" typography="t7" color={colors.grey500} style={{ margin: '24px 24px 0', lineHeight: 1.6 }}>
        {disclaimer}
      </Text>
    </main>
  );
}
