/** 선 아이콘(24 격자, 2px 선) — 시안 v2 에서 쓴 모양 */
const PATHS = {
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4.5H15" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  expand: <path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" />,
  chev: <path d="M9 5l7 7-7 7" />,
  xcross: (
    <>
      <path d="M4 17c4-1 6-8 16-10" />
      <path d="M4 8c5 1 8 6 16 9" />
    </>
  ),
  split: (
    <>
      <path d="M4 16l5-6 4 3 7-8" />
      <path d="M4 9l6 3 4-2 6 6" strokeDasharray="2 3" />
    </>
  ),
  check: <path d="M6 12.5l4 4 8-9" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  star: <path d="M12 3.8l2.5 5.1 5.6.8-4 3.9 1 5.6L12 16.6l-5.1 2.6 1-5.6-4-3.9 5.6-.8z" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, color = 'currentColor', strokeWidth = 2 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: 'none' }}
    >
      {PATHS[name]}
    </svg>
  );
}
