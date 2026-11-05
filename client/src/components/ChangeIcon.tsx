import { Icon } from './Icon';
import type { ChangeView } from '../lib/changeView';

/** 변화 아이콘 상자(시안 v2 배너 카드의 왼쪽) */
export function ChangeIcon({ view, size = 36 }: { view: ChangeView; size?: number }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: 12, background: view.tint, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      <Icon name={view.icon} size={18} color={view.ink} strokeWidth={2.2} />
    </span>
  );
}
