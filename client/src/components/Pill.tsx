import { colors } from '@toss/tds-colors';

/** 눌린 상태가 있는 알약 버튼(내 종목 걸러 보기 · 담기 분류) — 시안 v2 칩 */
export function Pill({ on, children, onClick }: { on: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={{
        height: 32,
        padding: '0 12px',
        borderRadius: 16,
        border: `1px solid ${on ? colors.grey900 : colors.grey200}`,
        background: on ? colors.grey900 : colors.background,
        color: on ? colors.background : colors.grey600,
        font: 'inherit',
        fontSize: 13,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        flex: 'none',
        cursor: 'pointer',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </button>
  );
}
