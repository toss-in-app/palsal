import { useToast } from '@toss/tds-mobile';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { TabBar } from './components/TabBar';
import { activeNotice, PRIVACY_URL, symbolIndex, TERMS_URL } from './content';
import { loadStatic, useLiveStatic } from './content/live';
import { createMarketSource, type MarketSource } from './data';
import { logEvent } from './lib/analytics';
import { openUrl } from './lib/bridge';
import { AGREEMENT_TOAST, notificationAvailable, requestNotificationAgreement } from './notification/agreement';
import { kstDateKey } from './lib/date';
import { TABS, goBack, navigate, routeToHash, useRoute, type TabName } from './lib/router';
import { rankIndex } from './lib/search';
import { INTERVAL_LABEL, marketOf } from './lib/format';
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
import { addWatch, loadWatch, removeWatch, reorderWatch, useWatch, watchId, watchStore, type WatchItem } from './state/watch';


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
  // 정적 콘텐츠: 번들로 바로 그리고 하루 한 번 원격(GitHub Pages)에서 새 판이 있으면 바꿔 끼워요(⑪)
  const live = useLiveStatic();
  const rank = useMemo(() => rankIndex(live.universe), [live.universe]);

  // 다른 화면으로 가면 맨 위에서 시작해요. 내 종목은 HomeScreen 이 보던 자리로 되돌려요(자식 효과가 먼저 돌아서 여기선 건너뜀).
  // 같은 화면에서 시트를 닫을 때(popstate)는 주소가 그대로라 움직이지 않아요.
  const routeKey = routeToHash(route);
  const isHome = route.name === 'home';
  useLayoutEffect(() => {
    if (!isHome) window.scrollTo(0, 0);
  }, [routeKey, isHome]);

  useEffect(() => {
    // 설정이 처음 만들어지는 날(처음 연 날)에만 예시 종목을 담아요 — 그래서 설정을 먼저 읽어요
    void loadSettings()
      .then((firstOpen) => loadWatch(firstOpen))
      .then(loadChanges);
    void createMarketSource().then((s) => {
      setMarketSource(s);
      setSource(s);
    });
    void loadStatic(today, __APP_VERSION__, (name, code) => logEvent('data_error', { endpoint: name, code }));
    // 앱을 열 때 한 번
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const say = useCallback((text: string) => toast.openToast(text), [toast]);
  useEffect(
    () =>
      onLiveChanges((fresh) => {
        say(liveToast(fresh));
        logEvent('toast_signal', { kind: fresh[0].kind === 'rsi_low_enter' ? 'low' : 'high' });
      }),
    [say],
  );
  /** 자세히를 어디서 열었는지(분석 stock_view.from). 딥링크로 바로 들어오면 link */
  const stockFrom = useRef<'card' | 'banner' | 'changes' | 'market' | 'link'>('link');
  /** 빼기(편집 모드 · 자세히 화면): 담은 목록 · 기기 저장본 · 변화 기록에서 함께 빼요 */
  const removeItem = useCallback(
    (id: string, from: 'edit' | 'stock') => {
      removeWatch(id);
      forgetSaved(id);
      dropChanges(id);
      logEvent('watch_remove', { count: watchStore.get().items.length, from });
      const [symbol, interval] = id.split('|') as [string, WatchItem['interval']];
      say(`${symbolIndex.get(symbol)?.n ?? symbol} ${INTERVAL_LABEL[interval]}을 뺐어요`);
    },
    [say],
  );
  const [homeEditing, setHomeEditing] = useState(false);
  /**
   * 매일 RSI 알림 동의(최근 바뀐 것 카드 · 설정 줄을 누른 뒤에만). 결과를 settings.notification 에 남겨요.
   * 이미 받는 중이면 끄는 길(토스 앱 알림 설정)을 알려요 — SDK 로는 끌 수 없어요.
   */
  const askNotification = useCallback(async (where: 'changes' | 'settings') => {
    const prev = settings.notification;
    if (prev.lastResult === 'agreed') {
      say('알림은 토스 앱의 알림 설정에서 끌 수 있어요');
      return;
    }
    const result = await requestNotificationAgreement();
    const lastResult = result === 'agreed' || result === 'alreadyAgreed' ? 'agreed' : result === 'declined' ? 'declined' : result === 'unsupported' ? 'unsupported' : 'error';
    // 거절하면 최근 바뀐 것 카드는 다시 띄우지 않아요(설정에서만)
    updateSettings({ notification: { lastResult, promptDismissedAt: result === 'declined' ? Date.now() : prev.promptDismissedAt } });
    logEvent('notification_agree', { result: lastResult, where });
    say(AGREEMENT_TOAST[result]);
  }, [settings.notification, say]);
  const notificationReady = notificationAvailable();
  // 시장 탭에 들어갈 때마다(10분 넘게 지났으면) 다시 읽어요
  useEffect(() => {
    if (route.name === 'market' && source) void loadMarket();
  }, [route.name, source]);
  /** 시장·자세히에서 담기 */
  const addOne = useCallback(
    (symbol: string, interval: WatchItem['interval']) => {
      if (addWatch([{ symbol, interval }])) {
        rememberSaved(watchId(symbol, interval));
        logEvent('watch_add', { n: 1, count: watchStore.get().items.length, interval });
        say('내 종목에 담았어요');
      } else say('더 담으려면 몇 개를 빼 주세요');
    },
    [say],
  );
  const openChange = useCallback((c: ChangeItem, from: 'banner' | 'list') => {
    const [symbol, interval] = c.watchId.split('|') as [string, WatchItem['interval']];
    logEvent('change_open', { kind: c.kind, from });
    stockFrom.current = from === 'banner' ? 'banner' : 'changes';
    navigate({ name: 'stock', symbol, interval });
  }, []);
  const openStock = useCallback((it: WatchItem) => {
    stockFrom.current = 'card';
    navigate({ name: 'stock', symbol: it.symbol, interval: it.interval });
  }, []);

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
          notice={activeNotice(live.content, today)}
          disclaimer={live.content.disclaimer}
          online={online}
          onFilter={(filter) => {
            updateSettings({ filter });
            logEvent('filter_change', { filter });
          }}
          onAdd={(from) => {
            logEvent('add_open', { from });
            navigate({ name: 'add' });
          }}
          onOpenMarket={() => navigate({ name: 'market' })}
          onOpen={openStock}
          onToast={say}
          changes={changes}
          onOpenChange={(c) => openChange(c, 'banner')}
          onAllChanges={() => navigate({ name: 'changes' })}
          onRemove={(it) => removeItem(it.id, 'edit')}
          onReorder={reorderWatch}
          onEditingChange={setHomeEditing}
        />
      ) : (
        <main aria-busy="true" style={{ minHeight: '100vh' }} />
      );
  } else if (route.name === 'add') {
    screen = (
      <AddScreen
        symbols={live.symbols.items}
        rank={rank}
        watched={watch.items}
        source={source}
        onAdd={(entries) => {
          const n = addWatch(entries);
          if (n) logEvent('watch_add', { n, count: watchStore.get().items.length, interval: entries[0]?.interval });
          return n;
        }}
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
        universe={live.universe}
        watched={watch.items}
        glossary={live.content.glossary}
        onRetry={() => void loadMarket(true)}
        onOpen={(symbol) => {
          stockFrom.current = 'market';
          navigate({ name: 'stock', symbol, interval: '1d' });
        }}
        onAdd={(symbol, interval) => {
          addOne(symbol, interval);
          logEvent('market_add', { from: 'low', market: marketOf(symbol, symbolIndex.get(symbol)) });
        }}
      />
    );
  } else if (route.name === 'changes') {
    screen = (
      <ChangesScreen
        today={today}
        items={changes}
        cards={cards}
        onOpen={(c) => openChange(c, 'list')}
        notificationCard={
          notificationReady && watch.items.length > 0 && settings.notification.lastResult !== 'agreed' && settings.notification.promptDismissedAt === null
            ? {
                onAgree: () => void askNotification('changes'),
                onDismiss: () => updateSettings({ notification: { ...settings.notification, promptDismissedAt: Date.now() } }),
              }
            : undefined
        }
      />
    );
  } else if (route.name === 'stock') {
    screen = (
      <StockScreen
        key={route.symbol}
        symbol={route.symbol}
        interval={route.interval}
        info={symbolIndex.get(route.symbol)}
        cards={cards}
        watched={watch.items}
        glossary={live.content.glossary}
        disclaimer={live.content.disclaimer}
        from={stockFrom.current}
        onAdd={addOne}
        onRemove={(id) => removeItem(id, 'stock')}
      />
    );
  } else {
    screen = (
      <SettingsScreen
        content={live.content}
        autoRefresh={settings.autoRefresh}
        onAutoRefresh={(autoRefresh) => updateSettings({ autoRefresh })}
        onOpenTerms={() => void openUrl(TERMS_URL)}
        onOpenPrivacy={() => void openUrl(PRIVACY_URL)}
        notification={{ available: notificationReady, status: settings.notification.lastResult, onPress: () => void askNotification('settings') }}
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

