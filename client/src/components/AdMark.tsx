import config from '../../apps-in-toss.config.ts';

const brandColor = config.brand.primaryColor;

/**
 * 광고가 나오는 버튼·행의 AD 표시(노출 정책 UX 원칙 2, mandalartplan 3.0.1 반려 교훈: 광고를 띄우는 버튼마다 — 재시도 포함 — 표시와 안내가 있어야 해요).
 * onBrand = 브랜드 색 버튼 위.
 */
export function AdMark({ onBrand = false }: { onBrand?: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        padding: '1px 5px',
        marginRight: 6,
        borderRadius: 4,
        background: onBrand ? '#ffffff' : brandColor,
        color: onBrand ? brandColor : '#ffffff',
        fontSize: 11,
        fontWeight: 700,
        lineHeight: '16px',
        verticalAlign: 'middle',
      }}
    >
      AD
    </span>
  );
}
