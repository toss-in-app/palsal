import { Icon } from './Icon';
import type { ChangeView } from '../lib/changeView';

/** 변화 아이콘 — 장식 상자 없이 아이콘만, 색이 종류를 말해요(제목 글이 뜻을 전해요) */
export function ChangeIcon({ view, size = 20 }: { view: ChangeView; size?: number }) {
  return (
    <span aria-hidden="true" style={{ display: 'inline-flex', flex: 'none' }}>
      <Icon name={view.icon} size={size} color={view.ink} strokeWidth={2.2} />
    </span>
  );
}
