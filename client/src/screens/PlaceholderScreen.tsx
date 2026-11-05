import { colors } from '@toss/tds-colors';
import { Button, Text, Top } from '@toss/tds-mobile';

export interface PlaceholderScreenProps {
  title: string;
  onBack: () => void;
}

/** 5단계에서 채울 화면의 자리(4단계 골격). 라우터·딥링크·뒤로가기를 먼저 확인하려고 둬요. */
export function PlaceholderScreen({ title, onBack }: PlaceholderScreenProps) {
  return (
    <div>
      <Top title={<Top.TitleParagraph size={22}>{title}</Top.TitleParagraph>} />
      <Text display="block" typography="t6" color={colors.grey700} style={{ margin: '0 24px 24px' }}>
        곧 만들 화면이에요.
      </Text>
      <div style={{ margin: '0 20px' }}>
        <Button display="block" size="large" variant="weak" onClick={onBack}>
          돌아가기
        </Button>
      </div>
    </div>
  );
}
