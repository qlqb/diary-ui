/**
 * Mantine 테마. 기본 테마 그대로이고(비교 샌드박스 design-direction B안), 글꼴만 기존 화면의 것을 쓴다 —
 * 한글이 섞인 본문에서 글꼴이 바뀌면 줄 높이가 달라져 기존 배치가 흔들린다.
 *
 * 부품 기본값: 배지는 기존 칩 자리(문장 안·행 끝)에 들어가므로 옅은 색·작은 크기로 두고, 영문 대문자 변환을 끈다
 * ("AI 세분화" 같은 혼용 문구가 바뀌지 않게).
 */
import { Badge, createTheme } from '@mantine/core';

/*
 * 강조색. 로고 바탕의 남색(#4f46e5)이 6번 단계(버튼·선택 표시의 기본 단계)에 오는 10단계다.
 * 기존 CSS의 --ws-accent* 도 이 팔레트에 묶여 있다(styles/mantine-tokens.css).
 */
const brand = ['#eef0fe', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81'];

export const theme = createTheme({
  colors: { brand },
  primaryColor: 'brand',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  components: {
    Badge: Badge.extend({ defaultProps: { variant: 'light', radius: 'sm', size: 'md', tt: 'none' } }),
  },
});
