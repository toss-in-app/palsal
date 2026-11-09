import { colors } from '@toss/tds-colors';
import { BottomSheet, Text } from '@toss/tds-mobile';
import { useEffect, useState, type ReactNode } from 'react';

import type { ContentFile } from '../content';
import { logEvent } from '../lib/analytics';

/** 글 속의 말 — 회색 바탕이 누를 수 있다는 신호. 누르면 그 말 하나만 시트로(saju-today 와 같은 모양) */
export function TermWord({ children, label, onClick }: { children: ReactNode; label?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="tap"
      style={{ display: 'inline', margin: 0, padding: '1px 5px', border: 0, borderRadius: 6, background: colors.grey100, font: 'inherit', fontWeight: 600, color: 'inherit', cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}

export interface TermSheetProps {
  glossary: ContentFile['glossary'];
  /** 보여 줄 말(content.json glossary 키). null 이면 닫힘 */
  term: string | null;
  onChange: (term: string | null) => void;
}

/**
 * 용어 시트 — 누른 말 하나만. '같이 보면 좋은 말'을 누르면 그 말로 바꿔 띄워요.
 * 뒤로가기는 TDS 시트가 받아 시트만 닫아요. 닫히는 동안 글이 사라지지 않게 마지막 말을 들고 있어요.
 */
export function TermSheet({ glossary, term, onChange }: TermSheetProps) {
  const [shown, setShown] = useState<string | null>(term);
  useEffect(() => {
    if (!term) return;
    setShown(term);
    logEvent('term_open', { term });
  }, [term]);
  const g = shown ? glossary[shown] : undefined;
  const close = () => onChange(null);

  return (
    <BottomSheet open={term !== null && !!glossary[term]} onClose={close} aria-label={g?.title ?? '용어'} expandBottomSheet cta={<BottomSheet.CTA onClick={close}>닫기</BottomSheet.CTA>}>
      {g ? (
        <div style={{ padding: '4px 24px 8px' }}>
          <Text display="block" typography="t4" fontWeight="bold" color={colors.grey900}>
            {g.title}
          </Text>
          {/* 줄바꿈(\n)은 그대로 — VIX 구간처럼 줄마다 나눈 설명이 있어요 */}
          <Text display="block" typography="t6" color={colors.grey800} style={{ marginTop: 10, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
            {g.body}
          </Text>
          {g.caution ? (
            <Text display="block" typography="t7" color={colors.grey600} style={{ marginTop: 10, lineHeight: 1.5 }}>
              {g.caution}
            </Text>
          ) : null}
          {g.related.some((k) => glossary[k]) ? (
            <>
              <Text display="block" typography="t7" fontWeight="semibold" color={colors.grey600} style={{ marginTop: 18 }}>
                같이 보면 좋은 말
              </Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {g.related
                  .filter((k) => glossary[k])
                  .map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => onChange(k)}
                      className="tap"
                      style={{ height: 32, padding: '0 12px', borderRadius: 16, border: `1px solid ${colors.grey200}`, background: colors.background, font: 'inherit', fontSize: 13, fontWeight: 600, color: colors.grey700, cursor: 'pointer' }}
                    >
                      {glossary[k].title}
                    </button>
                  ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </BottomSheet>
  );
}
