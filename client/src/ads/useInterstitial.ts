import { useCallback, useEffect, useRef, useState } from 'react';

import { fullScreenAdsEnabled } from './config';
import { fullScreenAdSupported, loadAd, showAd } from './fullScreen';

type Phase = 'idle' | 'loading' | 'ready' | 'showing';

/**
 * 전면 광고 1개 (홈 목록·내 별자리 → 별자리 자세히). mandalartplan 의 훅과 같아요.
 * eligible 이 true 가 되면 미리 불러오고, show() 는 준비된 광고가 있을 때만 보여줘요 — 없으면 바로 'skipped' 라 전환이 막히지 않아요.
 * 불러오기는 2번까지만 시도하고, 보여준 뒤에는 다시 불러오지 않아요(하루 1회는 호출한 쪽이 settings 로 막아요).
 *
 * upcoming: 다음 탭에 전면 광고가 나올 수 있으면 true. 홈의 AD 표시와 사전 안내 문구에 써요
 * (노출 정책 UX 원칙 2 "전면광고가 나오기 전에 문구나 광고 아이콘으로 미리 알려주세요").
 * 불러오는 중이어도 true 로 미리 알려요 — 탭할 때 준비가 덜 됐으면 광고 없이 넘어가니 안내가 광고보다 앞서는 쪽으로만 틀려요.
 * 광고를 띄우지 않는 동안(`fullScreenAdsEnabled()` false)은 불러오지도 않고 upcoming 도 false.
 */
export function useInterstitial(adGroupId: string, eligible: boolean) {
  const phase = useRef<Phase>('idle');
  const attempts = useRef(0);
  const [exhausted, setExhausted] = useState(false);

  const preload = useCallback(() => {
    if (!fullScreenAdsEnabled() || !fullScreenAdSupported() || phase.current !== 'idle' || attempts.current >= 2) return;
    phase.current = 'loading';
    attempts.current += 1;
    setExhausted(false);
    void loadAd(adGroupId).then((ok) => {
      if (phase.current !== 'loading') return;
      phase.current = ok ? 'ready' : 'idle';
      if (!ok) setExhausted(true);
    });
  }, [adGroupId]);

  useEffect(() => {
    if (eligible) preload();
  }, [eligible, preload]);

  /** 준비된 광고를 보여주고 닫힐 때까지 기다려요. 준비 안 됐으면 바로 'skipped', 띄우다 실패하면 'failed'. */
  const show = useCallback(async (): Promise<'shown' | 'skipped' | 'failed'> => {
    if (phase.current !== 'ready') return 'skipped';
    phase.current = 'showing';
    const result = await showAd(adGroupId);
    phase.current = 'idle';
    setExhausted(true);
    return result.shown ? 'shown' : 'failed';
  }, [adGroupId]);

  const upcoming = eligible && !exhausted && fullScreenAdsEnabled() && fullScreenAdSupported();

  return { show, upcoming };
}
