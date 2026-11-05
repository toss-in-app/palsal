import { useToast } from '@toss/tds-mobile';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { TabBar } from './components/TabBar';
import { activeNotice, bundledContent, bundledSymbols, bundledUniverse, PRIVACY_URL, symbolIndex, TERMS_URL } from './content';
import { createMarketSource, type MarketSource } from './data';
import { openUrl } from './lib/bridge';
import { kstDateKey } from './lib/date';
import { TABS, goBack, navigate, useRoute, type TabName } from './lib/router';
import { rankIndex } from './lib/search';
import { INTERVAL_LABEL } from './lib/format';
import { AddScreen } from './screens/AddScreen';
import { ChangesScreen } from './screens/ChangesScreen';
import { MarketScreen } from './screens/MarketScreen';
import { HomeScreen } from './screens/HomeScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StockScreen } from './screens/StockScreen';
import { forgetSaved, rememberSaved, setMarketSource, useCards } from './state/cards';
import { dropChanges, loadChanges, onLiveChanges, useChanges, type ChangeItem } from './state/changes';
import { loadMarket, useMarket } from './state/market';
import { loadSettings, updateSettings, useSettings } from './state/settings';
import { addWatch, loadWatch, removeWatch, reorderWatch, useWatch, watchId, type WatchItem } from './state/watch';


/** 보는 동안 새로 생긴 RSI 진입 토스트 — 여러 개면 첫 종목 외 N개 */
function liveToast(fresh: ChangeItem[]): string {
  const [symbol, interval] = fresh[0].watchId.split('|') as [string, keyof typeof INTERVAL_LABEL];
  const name = symbolIndex.get(symbol)?.n ?? symbol;
  const what = fresh[0].kind === 'rsi_low_enter' ? 'RSI가 30 아래로 내려왔어요' : 'RSI가 70을 넘었어요';
  return fresh.length === 1 ? `${name} ${INTERVAL_LABEL[interval]} ${what}` : `${name} ${INTERVAL_LABEL[interval]} 외 ${fresh.length - 1}개 종목의 RSI 구간이 바뀌었어요`;
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
  const changes = useChanges();
  const market = useMarket();
  const online = useOnline();
  const toast = useToast();
  const rank = useMemo(() => rankIndex(bundledUniverse), []);

  useEffect(() => {
    // 설정이 처음 만들어지는 날(처음 연 날)에만 예시 종목을 담아요 — 그래서 설정을 먼저 읽어요
    void loadSettings()
      .then((firstOpen) => loadWatch(firstOpen))
      .then(loadChanges);
    void createMarketSource().then((s) => {
      setMarketSource(s);
      setSource(s);
    });
  }, []);

  const say = useCallback((text: string) => toast.openToast(text), [toast]);
  useEffect(() => onLiveChanges((fresh) => say(liveToast(fresh))), [say]);
  /** 빼기(편집 모드 · 자세히 화면): 담은 목록 · 기기 저장본 · 변화 기록에서 함께 빼요 */
  const removeItem = useCallback(
    (id: string) => {
      removeWatch(id);
      forgetSaved(id);
      dropChanges(id);
      const [symbol, interval] = id.split('|') as [string, WatchItem['interval']];
      say(`${symbolIndex.get(symbol)?.n ?? symbol} ${INTERVAL_LABEL[interval]}을 뺐어요`);
    },
    [say],
  );
  const [homeEditing, setHomeEditing] = useState(false);
  // 시장 탭에 들어갈 때마다(10분 넘게 지났으면) 다시 읽어요
  useEffect(() => {
    if (route.name === 'market' && source) void loadMarket();
  }, [route.name, source]);
  /** 시장·자세히에서 담기 */
  const addOne = useCallback(
    (symbol: string, interval: WatchItem['interval']) => {
      if (addWatch([{ symbol, interval }])) {
        rememberSaved(watchId(symbol, interval));
        say('내 종목에 담았어요');
      } else say('더 담으려면 몇 개를 빼 주세요');
    },
    [say],
  );
  const openChange = useCallback((c: ChangeItem) => {
    const [symbol, interval] = c.watchId.split('|') as [string, WatchItem['interval']];
    navigate({ name: 'stock', symbol, interval });
  }, []);
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
          changes={changes}
          onOpenChange={openChange}
          onAllChanges={() => navigate({ name: 'changes' })}
          onRemove={(it) => removeItem(it.id)}
          onReorder={reorderWatch}
          onEditingChange={setHomeEditing}
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
  } else if (route.name === 'market') {
    screen = (
      <MarketScreen
        today={today}
        market={market}
        universe={bundledUniverse}
        watched={watch.items}
        glossary={bundledContent.glossary}
        onRetry={() => void loadMarket(true)}
        onOpen={(symbol) => navigate({ name: 'stock', symbol, interval: '1d' })}
        onAdd={addOne}
      />
    );
  } else if (route.name === 'changes') {
    screen = <ChangesScreen today={today} items={changes} cards={cards} onOpen={openChange} />;
  } else if (route.name === 'stock') {
    screen = (
      <StockScreen
        key={route.symbol}
        symbol={route.symbol}
        interval={route.interval}
        info={symbolIndex.get(route.symbol)}
        cards={cards}
        watched={watch.items}
        glossary={bundledContent.glossary}
        disclaimer={bundledContent.disclaimer}
        onAdd={addOne}
        onRemove={removeItem}
      />
    );
  } else {
    screen = (
      <SettingsScreen
        content={bundledContent}
        autoRefresh={settings.autoRefresh}
        onAutoRefresh={(autoRefresh) => updateSettings({ autoRefresh })}
        onOpenTerms={() => void openUrl(TERMS_URL)}
        onOpenPrivacy={() => void openUrl(PRIVACY_URL)}
      />
    );
  }

  return (
    <>
      {screen}
      {tab && !(route.name === 'home' && homeEditing) ? <TabBar active={tab} onSelect={(t) => navigate(t === 'home' ? { name: 'home' } : { name: t })} /> : null}
    </>
  );
}

