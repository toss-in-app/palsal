import { colors } from '@toss/tds-colors';
import { Border, List, ListHeader, ListRow, Switch, Text, Top } from '@toss/tds-mobile';
import { useEffect, useState, type ReactNode } from 'react';

import { logEventOnce } from '../lib/analytics';

import type { ContentFile } from '../content';
import { zoneInk, zoneBg } from '../lib/palette';

export interface SettingsScreenProps {
  content: ContentFile;
  autoRefresh: boolean;
  onAutoRefresh: (on: boolean) => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
  /** 매일 RSI 알림: 쓸 수 있는지 · 지난 결과 · 누르면(동의 요청 또는 끄는 길 안내) */
  notification: { available: boolean; status: NotificationStatus; onPress: () => void };
}

export type NotificationStatus = null | 'agreed' | 'declined' | 'error' | 'unsupported';

const STATUS_TEXT: Record<'agreed' | 'declined' | 'ready', string> = { agreed: '받는 중', declined: '받지 않음', ready: '켜기' };

/** 알림이 이렇게 와요 — 콘솔 템플릿 palsal-daily 의 제목·본문(계약 events.md) */
function NotificationPreview() {
  return (
    <div aria-label="알림 미리 보기" style={{ margin: '0 24px 8px', padding: '12px 14px', borderRadius: 14, background: colors.grey50, display: 'flex', gap: 10, alignItems: 'center' }}>
      <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 9, background: colors.blue500, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 16l5.5-5.5 4 4L21 6" />
        </svg>
      </span>
      <span>
        <Text display="block" typography="t7" fontWeight="bold" color={colors.grey900}>
          RSI 확인
        </Text>
        <Text display="block" typography="t7" color={colors.grey700}>
          오늘 내 종목 RSI를 정리했어요
        </Text>
      </span>
      <Text typography="st12" color={colors.grey500} style={{ marginLeft: 'auto', flex: 'none' }}>
        매일 10:00
      </Text>
    </div>
  );
}

type HelpKey = 'read' | 'fearGreed' | 'faq';

/** 누른 도움말만 그 아래로 펼쳐요(다른 것은 접힘) */
function HelpRow({ open, title, onToggle, children }: { open: boolean; title: string; onToggle: () => void; children: ReactNode }) {
  return (
    <>
      <ListRow
        onClick={onToggle}
        aria-expanded={open}
        contents={<ListRow.Texts type="1RowTypeA" top={title} />}
        right={
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.grey400} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        }
      />
      {open ? <div style={{ padding: '0 24px 16px' }}>{children}</div> : null}
    </>
  );
}

const para = { display: 'block', lineHeight: 1.6 } as const;

/** 설정(탭 3, 흐름 문서 'settings'): (알림) · 새로고침 · 도움말 3 · 이용약관·처리방침 · 시세 출처 · 면책 · 버전 */
export function SettingsScreen({ content, autoRefresh, onAutoRefresh, onOpenTerms, onOpenPrivacy, notification }: SettingsScreenProps) {
  const [open, setOpen] = useState<HelpKey | null>(null);
  useEffect(() => {
    if (notification.available) logEventOnce('notification_prompt_view', { where: 'settings' }, 'settings');
  }, [notification.available]);
  const toggle = (k: HelpKey) => setOpen((v) => (v === k ? null : k));

  return (
    <main style={{ paddingBottom: 120 }}>
      <Top title={<Top.TitleParagraph size={22}>설정</Top.TitleParagraph>} />

      <ListHeader title={<ListHeader.TitleParagraph typography="t7" fontWeight="bold" color={colors.grey700}>알림</ListHeader.TitleParagraph>} />
      <List>
        <ListRow
          onClick={notification.available ? notification.onPress : undefined}
          disabled={!notification.available}
          contents={<ListRow.Texts type="2RowTypeA" top="매일 RSI 알림" bottom="매일 오전 10시에 내 종목 RSI를 확인하라고 알려요" />}
          right={
            <Text typography="t7" fontWeight="semibold" color={notification.status === 'agreed' ? colors.blue500 : colors.grey500}>
              {!notification.available ? '준비 중' : STATUS_TEXT[notification.status === 'agreed' ? 'agreed' : notification.status === 'declined' ? 'declined' : 'ready']}
            </Text>
          }
        />
      </List>
      <NotificationPreview />

      <Border variant="height16" />

      <ListHeader title={<ListHeader.TitleParagraph typography="t7" fontWeight="bold" color={colors.grey700}>새로고침</ListHeader.TitleParagraph>} />
      <List>
        <ListRow
          contents={<ListRow.Texts type="2RowTypeA" top="보고 있을 때 5분마다 새로고침" bottom="장이 열려 있을 때 현재가를 다시 읽어요" />}
          right={<Switch checked={autoRefresh} onChange={(_e, checked) => onAutoRefresh(checked)} aria-label="보고 있을 때 5분마다 새로고침" />}
        />
      </List>

      <Border variant="height16" />
      <ListHeader title={<ListHeader.TitleParagraph typography="t7" fontWeight="bold" color={colors.grey700}>도움말</ListHeader.TitleParagraph>} />
      <List>
        <HelpRow open={open === 'read'} title="RSI 구간과 표시 읽는 법" onToggle={() => toggle('read')}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {content.zones.map((z) => (
              <li key={z.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ flex: 'none', minWidth: 74, textAlign: 'center', fontSize: 12, fontWeight: 700, borderRadius: 6, padding: '3px 6px', color: zoneInk(z.key), background: zoneBg(z.key) }}>
                  {`${z.name} ${z.range}`}
                </span>
                <Text typography="t7" color={colors.grey700} style={para}>
                  {z.body}
                </Text>
              </li>
            ))}
          </ul>
          {content.howToRead.map((h) => (
            <div key={h.title} style={{ marginTop: 14 }}>
              <Text display="block" typography="t6" fontWeight="semibold" color={colors.grey900}>
                {h.title}
              </Text>
              <Text typography="t7" color={colors.grey700} style={{ ...para, marginTop: 4 }}>
                {h.body}
              </Text>
            </div>
          ))}
        </HelpRow>
        <HelpRow open={open === 'fearGreed'} title={content.fearGreed.title} onToggle={() => toggle('fearGreed')}>
          <Text typography="t7" color={colors.grey700} style={para}>
            {content.fearGreed.body}
          </Text>
        </HelpRow>
        <HelpRow open={open === 'faq'} title="자주 묻는 질문" onToggle={() => toggle('faq')}>
          {content.faq.map((f, i) => (
            <div key={f.q} style={{ marginTop: i ? 14 : 0 }}>
              <Text display="block" typography="t6" fontWeight="semibold" color={colors.grey900}>
                {f.q}
              </Text>
              <Text typography="t7" color={colors.grey700} style={{ ...para, marginTop: 4 }}>
                {f.a}
              </Text>
            </div>
          ))}
        </HelpRow>
      </List>

      <Border variant="height16" />
      <List>
        <ListRow withArrow onClick={onOpenTerms} contents={<ListRow.Texts type="1RowTypeA" top="이용약관" />} />
        <ListRow withArrow onClick={onOpenPrivacy} contents={<ListRow.Texts type="1RowTypeA" top="개인정보처리방침" />} />
      </List>

      <div style={{ padding: '24px 24px 0' }}>
        <Text display="block" typography="t7" fontWeight="semibold" color={colors.grey700}>
          시세 출처
        </Text>
        <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
          {content.sources.map((s) => (
            <li key={s.what}>
              <Text typography="t7" color={colors.grey600} style={para}>{`${s.what} · ${s.name}`}</Text>
            </li>
          ))}
        </ul>
        <Text display="block" typography="t7" color={colors.grey600} style={{ ...para, marginTop: 14 }}>
          {content.disclaimer}
        </Text>
        <Text display="block" typography="t7" color={colors.grey500} style={{ marginTop: 14 }}>
          {`앱 버전 ${__APP_VERSION__} · 도움말 버전 ${content.contentVersion}`}
        </Text>
      </div>
    </main>
  );
}
