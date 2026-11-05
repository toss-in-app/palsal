import { colors } from '@toss/tds-colors';
import { Text } from '@toss/tds-mobile';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { symbolIndex } from '../content';
import { INTERVAL_LABEL, placeOf } from '../lib/format';
import type { WatchItem } from '../state/watch';

/** 한 줄 높이(끌 때 몇 칸 옮겼는지 셈) */
export const ROW_H = 64;

export interface EditListProps {
  items: WatchItem[];
  onRemove: (item: WatchItem) => void;
  onReorder: (ids: string[]) => void;
}

const nameOf = (it: WatchItem) => symbolIndex.get(it.symbol)?.n ?? it.symbol;

/**
 * 그 자리 편집(시안 v2 '편집'): 줄마다 빨간 빼기 버튼 · 이름 · 봉과 시장 · 손잡이.
 * 손잡이를 끌면 순서가 바뀌고, 놓을 때 저장해요. 손잡이에 초점을 두고 위·아래 화살표로도 옮길 수 있어요.
 */
export function EditList({ items, onRemove, onReorder }: EditListProps) {
  const [order, setOrder] = useState(() => items.map((it) => it.id));
  const orderRef = useRef(order);
  const drag = useRef<{ id: string; startY: number; startIndex: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const byId = new Map(items.map((it) => [it.id, it]));

  // 빼면 그 줄만 사라지고, 나머지 순서는 그대로
  useEffect(() => {
    const prev = orderRef.current;
    const ids = items.map((it) => it.id);
    const next = [...prev.filter((id) => ids.includes(id)), ...ids.filter((id) => !prev.includes(id))];
    orderRef.current = next;
    setOrder(next);
  }, [items]);

  /** 순서를 바로 계산해 ref 와 화면에 같이 넣어요(저장은 그 ref 로) */
  const move = (id: string, to: number) => {
    const prev = orderRef.current;
    const from = prev.indexOf(id);
    const target = Math.max(0, Math.min(prev.length - 1, to));
    if (from < 0 || from === target) return;
    const next = prev.slice();
    next.splice(from, 1);
    next.splice(target, 0, id);
    orderRef.current = next;
    setOrder(next);
  };

  const onDown = (id: string) => (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id, startY: e.clientY, startIndex: orderRef.current.indexOf(id) };
    setDragId(id);
    setOffset(0);
  };
  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const delta = e.clientY - d.startY;
    const steps = Math.round(delta / ROW_H);
    const target = Math.max(0, Math.min(orderRef.current.length - 1, d.startIndex + steps));
    move(d.id, target);
    setOffset(delta - (target - d.startIndex) * ROW_H);
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragId(null);
    setOffset(0);
    onReorder(orderRef.current);
  };
  const onKey = (id: string) => (e: KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    move(id, orderRef.current.indexOf(id) + (e.key === 'ArrowUp' ? -1 : 1));
    onReorder(orderRef.current);
  };

  return (
    <ul aria-label="내 종목 편집" style={{ listStyle: 'none', margin: '18px 16px 0', padding: 0, background: colors.background, borderRadius: 20, overflow: 'hidden' }}>
      {order.map((id, i) => {
        const it = byId.get(id);
        if (!it) return null;
        const name = nameOf(it);
        const label = `${name} ${INTERVAL_LABEL[it.interval]}`;
        const lifted = dragId === id;
        return (
          <li
            key={id}
            style={{
              height: ROW_H,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '0 6px 0 18px',
              background: colors.background,
              borderTop: i ? `1px solid ${colors.grey100}` : 'none',
              boxSizing: 'border-box',
              position: 'relative',
              zIndex: lifted ? 1 : 0,
              transform: lifted ? `translateY(${offset}px)` : undefined,
              boxShadow: lifted ? '0 6px 20px rgba(0,27,55,.12)' : undefined,
            }}
          >
            <button
              type="button"
              aria-label={`${label} 빼기`}
              onClick={() => onRemove(it)}
              style={{ width: 28, height: 28, borderRadius: 14, border: 0, background: colors.red500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer', flex: 'none' }}
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" aria-hidden="true">
                <path d="M8 12h8" />
              </svg>
            </button>
            <span style={{ minWidth: 0, flex: 1 }}>
              <Text display="block" typography="st10" fontWeight="semibold" color={colors.grey900} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {name}
              </Text>
              <Text display="block" typography="st12" color={colors.grey500} style={{ marginTop: 2 }}>
                {`${INTERVAL_LABEL[it.interval]} · ${placeOf(it.symbol, symbolIndex.get(it.symbol))}`}
              </Text>
            </span>
            <button
              type="button"
              aria-label={`${label} 순서 옮기기`}
              onPointerDown={onDown(id)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onKeyDown={onKey(id)}
              style={{ border: 0, background: 'none', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: lifted ? 'grabbing' : 'grab', touchAction: 'none', flex: 'none' }}
            >
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.grey400} strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <path d="M5 9h14M5 15h14" />
              </svg>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
