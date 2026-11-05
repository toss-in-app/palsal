import { useState } from 'react';

import { TabBar } from './components/TabBar';
import { activeNotice, bundledContent, symbolIndex } from './content';
import { kstDateKey } from './lib/date';
import { TABS, goBack, navigate, useRoute, type Route, type TabName } from './lib/router';
import { HomeScreen } from './screens/HomeScreen';
import { PlaceholderScreen } from './screens/PlaceholderScreen';

/** 아직 만들지 않은 화면의 이름(5단계에서 실제 화면으로 바꿔요) */
const TITLES: Record<Exclude<Route['name'], 'home' | 'stock'>, string> = {
  changes: '최근 바뀐 것',
  add: '종목 담기',
  market: '시장',
  settings: '설정',
};
const INTERVAL_LABEL = { '1d': '일봉', '1wk': '주봉', '1mo': '월봉' } as const;

function placeholderTitle(route: Exclude<Route, { name: 'home' }>): string {
  if (route.name !== 'stock') return TITLES[route.name];
  return `${symbolIndex.get(route.symbol)?.n ?? route.symbol} · ${INTERVAL_LABEL[route.interval]}`;
}

export default function App() {
  const route = useRoute();
  const [today] = useState(() => kstDateKey());

  const tab = (TABS as readonly string[]).includes(route.name) ? (route.name as TabName) : null;
  const screen =
    route.name === 'home' ? (
      <HomeScreen
        today={today}
        count={0}
        notice={activeNotice(bundledContent, today)}
        disclaimer={bundledContent.disclaimer}
        onAdd={() => navigate({ name: 'add' })}
        onOpenMarket={() => navigate({ name: 'market' })}
      />
    ) : (
      <PlaceholderScreen title={placeholderTitle(route)} onBack={goBack} />
    );

  return (
    <>
      {screen}
      {tab ? <TabBar active={tab} onSelect={(t) => navigate(t === 'home' ? { name: 'home' } : { name: t })} /> : null}
    </>
  );
}
