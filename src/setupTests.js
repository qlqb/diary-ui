import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

/*
 * findBy*·waitFor의 기본 대기는 1초다. 프로젝트 작업 공간처럼 무거운 화면은 전체 병렬 실행 아래에서만
 * 그 1초를 넘겨 간헐적으로 실패했다(2026-11-11, ProjectWorkspaceMaterialWeeks — 따로 돌리면 통과).
 * vite.config.js의 testTimeout(15초)과 같은 이유로 늘린다: 느린 것을 통과시키려는 값이 아니라
 * 부하에 따라 결과가 달라지는 것을 없애려는 값이다. 나타나지 않아야 할 것은 여전히 바로 실패한다.
 */
configure({ asyncUtilTimeout: 5000 });
