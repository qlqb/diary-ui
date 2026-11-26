/**
 * Mantine 루트. 앱 전체(main.jsx)와 테스트(setupTests.js)가 같은 Provider를 쓴다.
 *
 * 디자인은 Mantine 기본 테마 그대로다(2026-11-20, 비교 샌드박스 design-direction의 B안 — "레이아웃은 그대로, 부품만
 * Mantine"). 배치(셸 격자·칸·구획 순서)는 기존 CSS가 계속 정한다. 아직 Mantine 부품으로 바꾸지 않은 곳도 같은 색으로
 * 보이도록 styles/mantine-tokens.css가 기존 색 변수(--ws-*)를 Mantine 팔레트에 묶는다.
 */
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import 'dayjs/locale/ko';
import { theme } from './theme.js';



export default function MantineRoot({ children }) {
  return (
    <MantineProvider theme={theme}>
      <DatesProvider settings={{ locale: 'ko', firstDayOfWeek: 1 }}>{children}</DatesProvider>
    </MantineProvider>
  );
}
