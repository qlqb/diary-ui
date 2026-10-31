# CONVENTIONS — diary-ui 작업 규약

코드·설정·README에서 관찰한 규약. 새 규칙을 만들지 않는다. 백엔드 규약은 diary-api `docs/context/CONVENTIONS.md`.

## 파일·이름

- 컴포넌트 `PascalCase.jsx`, 훅 `useXxx.js(x)`, 로직·문구 `camelCase.js`(`lib/`, 화면 옆 `*Model.js`·`*Api.js`). 테스트는 같은 폴더에 `*.test.js(x)`.
- 화면 전용 파일은 `views/<그룹>/`, 두 탭 이상이 쓰면 `components/`, React 없는 순수 로직은 `lib/`. 그룹은 [MAP.md](MAP.md).
- 주석·테스트 이름·화면 문구는 한국어. 상태값 → 문구 변환은 `lib/*Labels.js`에 모은다(화면에서 enum 문자열을 직접 보여 주지 않는다).

## 컴포넌트 작성 규칙

- `export default function Xxx({ ...props })` — 함수 컴포넌트, props 구조 분해와 기본값(`busy = false`). 클래스 컴포넌트·PropTypes·TypeScript 없음(비테스트 JSX 69개 중 67개가 이 형태).
- 파일 머리 JSDoc에 "무엇을 하고 **왜 그렇게** 하는가"를 적는다(예: `ApplyBar`, `ExecutionRow`, `workspace.css`).
- 상태는 지역 `useState` + 콜백 props로 올린다. 공유 컴포넌트는 API를 부르지 않고 `onAction`/`onPatch` 같은 콜백으로 올리는 것이 기본(예외 `MaterialFileLink`, `ZipImportPanel`).
- 서버 호출은 `src/api/api.js`의 `*API` 객체로만. `fetch`를 화면에서 직접 쓰지 않는다. 오류는 `err.status`·`err.code`로 분기하고 `err.message` 문자열을 파싱하지 않는다.
- 데이터 필드 이름·상태 언어는 `src/types/*.js`(백엔드 enum과 1:1)를 따른다. 화면용 임시 필드명을 만들지 않는다.
- ESLint(`eslint.config.js`): `js.recommended` + `react-hooks` recommended + `react-refresh`(vite). `no-unused-vars`는 대문자·`_` 시작 이름만 예외.

## 스타일 · Tailwind 사용 규약

- Tailwind 4는 `src/index.css`의 `@import "tailwindcss"` 한 줄로만 들어와 있고 `tailwind.config.js`는 확장이 없다. **실제로는 거의 쓰지 않는다** — `className` 문자열 2,170개 중 유틸리티 클래스가 섞인 것은 약 29개.
- 기본은 **의미 있는 클래스 이름 + 손으로 쓴 CSS**: 전역 `App.css`, 기능별 `src/styles/*.css`(그 화면 파일이 import). 색·폭은 `workspace.css`의 `--ws-*` 변수를 쓴다([UI-CONTRACT.md](UI-CONTRACT.md) §디자인 토큰).
- 적용 전(AI 초안)과 확정은 색이 아니라 형태(점선 + 배지)로 구분, 본문 14px·보조 13px 이상, 1536×760에서 핵심 기능 무스크롤(`workspace.css` 머리 주석).
- 아이콘은 `lucide-react`.

## Vitest 구조

- `vite.config.js`의 `test`: `environment: 'jsdom'`, `globals: true`, `setupFiles: ./src/setupTests.js`(`@testing-library/jest-dom/vitest`), `testTimeout: 15000`(전체 병렬 실행 부하에서 무거운 화면 테스트가 5초를 넘긴 일 때문).
- 테스트 파일 73개, 화면 옆에 둔다. `describe('한국어 문장', …)` 186개, 안의 케이스는 `it`/`test` 문장.
- API는 모듈째 mock: `vi.mock('../../api/api.js', …)`(51곳). 그래서 화면이 없는 export를 읽어도 깨지지 않게 `views/classcheck/classSessionApi.js`·`views/learning/materialWeekApi.js` 같은 null-안전 접근자를 둔다.
- 상호작용은 `@testing-library/user-event`가 기본(47개 파일), `fireEvent`는 5개 파일.
- 가짜 데이터 헬퍼는 `src/testing/`(예: `fakeAnalysisBatch.js`).
- 실행: `npm test`(= `vitest run`). CI(`.github/workflows/ci.yml`, Node 24): `npm ci` → `npm test` → `npm run build` → `npm run lint`.

## 브랜치·커밋

- 백엔드와 같다: 통합 브랜치 `dev-playground`, 작업은 `feat/…`·`fix/…` 브랜치에서 하고 `merge: <브랜치>(<요약>)를 dev-playground에 합침`으로 합친다.
- 커밋 제목 `<type>(<scope>)?: <한국어 문장>`(`feat`·`fix`·`docs`·`merge`). 백엔드 작업 단계와 짝이면 단계 표시(예: `(S5)`, `(이벤트 진도 1단계 D)`).
- 공개 저장소. `.githooks/` + `scripts/check-private-names.sh`가 비공개 이름을 막는다.
- 개행: `.gitattributes`는 `*.sh`·`.githooks/*`만 `eol=lf`. 나머지는 각자 `core.autocrlf`.
- 화면 작업 기록은 2026-10부터 diary-api `docs/handoff/`에 남긴다(`docs/reviews/README.md`).

## 문서 레이어 유지 (docs/context)

변경이 `docs/context/*.md`의 기술(화면 그룹·화면↔API 대응·토큰·공통 컴포넌트 props)을 무효화하면 **같은 커밋에서** 갱신한다.
`views/`에 새 디렉터리를 만들면 MAP.md 표에 그룹을 더한다. 확인: `bash scripts/check-context-layer.sh`(그룹 커버리지·분량 상한).
