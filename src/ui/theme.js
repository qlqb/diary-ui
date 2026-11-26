/**
 * Mantine 테마. 기본 테마 그대로이고(비교 샌드박스 design-direction B안), 글꼴만 기존 화면의 것을 쓴다 —
 * 한글이 섞인 본문에서 글꼴이 바뀌면 줄 높이가 달라져 기존 배치가 흔들린다.
 *
 * 부품 기본값: 배지는 기존 칩 자리(문장 안·행 끝)에 들어가므로 옅은 색·작은 크기로 두고, 영문 대문자 변환을 끈다
 * ("AI 세분화" 같은 혼용 문구가 바뀌지 않게).
 */
import { Badge, createTheme } from '@mantine/core';

export const theme = createTheme({
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  components: {
    Badge: Badge.extend({ defaultProps: { variant: 'light', radius: 'sm', size: 'md', tt: 'none' } }),
  },
});
