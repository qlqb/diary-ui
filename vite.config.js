import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    globals: true,
    /*
     * 기본 5초는 이 규모에서 부족하다. 무거운 화면 테스트(프로젝트 작업 공간·실행 줄)가 전체
     * 병렬 실행 아래에서만 간헐적으로 5초를 넘겼다 — 따로 돌리면 2초 안에 끝난다. 느린 것을
     * 통과시키려는 값이 아니라, 부하에 따라 결과가 달라지는 것을 없애려는 값이다.
     */
    testTimeout: 15000,
  },
})
