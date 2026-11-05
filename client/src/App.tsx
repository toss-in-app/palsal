import { useToast } from '@toss/tds-mobile';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { TabBar } from './components/TabBar';
import { activeNotice, bundledContent, bundledSymbols, bundledUniverse, symbolIndex } from './content';
import { createMarketSource, type MarketSource } from './data';
import { kstDateKey } from './lib/date';
import { INTERVAL_LABEL } from './lib/format';
import { TABS, goBack, navigate, useRoute, type Route, type TabName } from './lib/router';
import { rankIndex } from './lib/search';
import { AddScreen } from './screens/AddScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PlaceholderScreen } from './screens/PlaceholderScreen';
import { setMarketSource, useCards } from './state/cards';
import { loadSettings, updateSettings, useSettings } from './state/settings';
import { addWatch, loadWatch, useWatch, type WatchItem } from './state/watch';

/** 아직 만들지 않은 화면의 이름(5단계에서 실제 화면으로 바꿔요) */
const TITLES: Record<Exclude<Route['name'], 'home' | 'stock' | 'add'>, string> = {
  changes: '최근 바뀐 것',
  market: '시장',
  settings: '설정',
};

function placeholderTitle(route: Exclude<Route, { name: 'home' | 'add' }>): string {
  if (route.name !== 'stock') return TITLES[route.name];
  return `${symbolIndex.get(route.symbol)?.n ?? route.symbol} · ${INTERVAL_LABEL[route.interval]}`;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export default function App() {
  const route = useRoute();
  const [today] = useState(() => kstDateKey());
  const [source, setSource] = useState<MarketSource | null>(null);
  const watch = useWatch();
  const settings = useSettings();
  const cards = useCards();
  const online = useOnline();
  const toast = useToast();
  const rank = useMemo(() => rankIndex(bundledUniverse), []);

  useEffect(() => {
    void loadWatch();
    void loadSettings();
    void createMarketSource().then((s) => {
      setMarketSource(s);
      setSource(s);
    });
  }, []);

  const say = useCallback((text: string) => toast.openToast(text), [toast]);
  const openStock = useCallback((it: WatchItem) => navigate({ name: 'stock', symbol: it.symbol, interval: it.interval }), []);

  const tab = (TABS as readonly string[]).includes(route.name) ? (route.name as TabName) : null;
  let screen;
  if (route.name === 'home') {
    screen =
      watch.ready && source ? (
        <HomeScreen
          today={today}
          items={watch.items}
          cards={cards}
          filter={settings.filter}
          autoRefresh={settings.autoRefresh}
          notice={activeNotice(bundledContent, today)}
          disclaimer={bundledContent.disclaimer}
          online={online}
          onFilter={(filter) => updateSettings({ filter })}
          onAdd={() => navigate({ name: 'add' })}
          onOpenMarket={() => navigate({ name: 'market' })}
          onOpen={openStock}
          onToast={say}
        />
      ) : (
        <main aria-busy="true" style={{ minHeight: '100vh' }} />
      );
  } else if (route.name === 'add') {
    screen = (
      <AddScreen
        symbols={bundledSymbols.items}
        rank={rank}
        watched={watch.items}
        source={source}
        onAdd={(entries) => addWatch(entries)}
        onToast={say}
        onDone={(n) => {
          say(n ? `${n}개 담았어요` : '이미 담은 종목이에요');
          if (n) goBack();
        }}
      />
    );
  } else {
    screen = <PlaceholderScreen title={placeholderTitle(route)} onBack={goBack} />;
  }

  return (
    <>
      {screen}
      {tab ? <TabBar active={tab} onSelect={(t) => navigate(t === 'home' ? { name: 'home' } : { name: t })} /> : null}
    </>
  );
}

