import { TossAds, type TossAdsAttachBannerResult } from '@apps-in-toss/web-framework';
import { useEffect, useRef, useState } from 'react';

import { ensureBannerSdk } from '../ads/banner';

interface AdBannerProps {
  adGroupId: string;
  /** 결과(분석 이벤트 ad_banner 에 씀 — 기능 ⑩) */
  onResult?: (result: 'rendered' | 'nofill' | 'failed') => void;
}

type Status = 'loading' | 'shown' | 'hidden';

/**
 * 토스 배너 1개 (TossAds.attachBanner, 카드형·라이트·회색 톤). 광고 UI 는 SDK 가 그려요 — 색·글꼴·문구를 바꾸지 않아요(SSP 정책).
 * 초기화 실패·광고 없음·렌더 실패면 영역을 숨기고, 화면을 떠나면 destroy 해요. 자체 refresh 없음. (byeol-today·mandalartplan 과 같은 컴포넌트)
 */
export function AdBanner({ adGroupId, onResult }: AdBannerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  const report = useRef(onResult);
  report.current = onResult;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    let attached: TossAdsAttachBannerResult | null = null;
    void ensureBannerSdk().then((ok) => {
      if (cancelled) return;
      if (!ok) {
        setStatus('hidden');
        return;
      }
      try {
        attached = TossAds.attachBanner(adGroupId, el, {
          theme: 'light',
          tone: 'grey',
          variant: 'card',
          callbacks: {
            onAdRendered: () => {
              if (!cancelled) setStatus('shown');
              report.current?.('rendered');
            },
            onNoFill: () => {
              if (!cancelled) setStatus('hidden');
              report.current?.('nofill');
            },
            onAdFailedToRender: () => {
              if (!cancelled) setStatus('hidden');
              report.current?.('failed');
            },
          },
        });
      } catch {
        setStatus('hidden');
      }
    });
    return () => {
      cancelled = true;
      try {
        attached?.destroy();
      } catch {
        /* 무시 */
      }
    };
  }, [adGroupId]);

  // 부착 요소 안은 비워 둬요(가이드). 너비는 화면 너비(100%), 높이는 SDK 가 정해요.
  return <div ref={ref} data-testid="ad-banner" style={{ width: '100%', display: status === 'hidden' ? 'none' : 'block' }} />;
}
