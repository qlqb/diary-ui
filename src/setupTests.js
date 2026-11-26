import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

/*
 * findBy*·waitFor의 기본 대기는 1초다. 프로젝트 작업 공간처럼 무거운 화면은 전체 병렬 실행 아래에서만
 * 그 1초를 넘겨 간헐적으로 실패했다(2026-11-11, ProjectWorkspaceMaterialWeeks — 따로 돌리면 통과).
 * vite.config.js의 testTimeout(15초)과 같은 이유로 늘린다: 느린 것을 통과시키려는 값이 아니라
 * 부하에 따라 결과가 달라지는 것을 없애려는 값이다. 나타나지 않아야 할 것은 여전히 바로 실패한다.
 */
configure({ asyncUtilTimeout: 5000 });

/*
 * Mantine 전환(2026-11-20). 화면 부품이 Mantine이라 Provider가 없으면 렌더가 실패한다. 테스트마다 감싸지 않도록
 * render를 앱과 같은 MantineRoot로 감싼다(호출하는 쪽이 wrapper를 주면 그 안쪽에 둔다).
 * jsdom에 없는 matchMedia·ResizeObserver는 Mantine이 쓰므로 채운다.
 */
import { createElement } from 'react';
import { vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import 'dayjs/locale/ko';
import { theme } from './ui/theme.js';

/** 앱의 MantineRoot와 같은 테마·날짜 설정. 단 CSS 변수 <style>을 렌더 영역에 넣지 않는다("아무것도 그리지 않는다" 확인이 깨진다). */
function TestMantineRoot({ children }) {
  return createElement(MantineProvider, { theme, withCssVariables: false, withGlobalClasses: false },
    createElement(DatesProvider, { settings: { locale: 'ko', firstDayOfWeek: 1 } }, children));
}

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  });
}
if (!window.ResizeObserver) {
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

vi.mock('@testing-library/react', async (importOriginal) => {
  const actual = await importOriginal();
  const withMantine = (Inner) => function MantineWrapper({ children }) {
    return createElement(TestMantineRoot, null, Inner ? createElement(Inner, null, children) : children);
  };
  return {
    ...actual,
    render: (ui, options = {}) => actual.render(ui, { ...options, wrapper: withMantine(options.wrapper) }),
    renderHook: (cb, options = {}) => actual.renderHook(cb, { ...options, wrapper: withMantine(options.wrapper) }),
  };
});
