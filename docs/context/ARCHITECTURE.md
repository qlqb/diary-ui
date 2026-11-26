# ARCHITECTURE — diary-ui 구조 요약

코드에서 관찰한 사실만 적는다. 백엔드 구조는 diary-api `docs/context/ARCHITECTURE.md`.

## 스택 (package.json)

- React 19 · Vite 7 · JavaScript(JSX, TypeScript 없음) · lucide-react 아이콘
- Tailwind CSS 4(`@import "tailwindcss"`, `tailwind.config.js` 확장 없음) — 실제 스타일은 대부분 손으로 쓴 CSS(아래)
- 테스트: Vitest 4 + jsdom + Testing Library(react·user-event·jest-dom)
- 라우터·상태 라이브러리·데이터 패칭 라이브러리 없음

## 역할 경계

```text
main.jsx → App.jsx(로그인 여부) → shell/MainShell.jsx(탭 6개 + 상담 패널)
                                     ├─ views/<탭 그룹>/  화면
                                     ├─ ai/AiPanel.jsx    상담(모든 탭 옆)
                                     └─ components/       공유 줄·버튼
views·ai·components ─▶ lib/(화면 로직·문구·시간 계산) ─▶ api/api.js ─▶ diary-api (/api)
```

| 디렉터리 | 경계 |
|---|---|
| `shell/` | 최상위 탭 전환(`TABS`), 선택 프로젝트·상담 범위, 삭제 되돌리기(`useUndoDelete`). 화면 상태를 탭 사이에 나눠 주는 곳 |
| `views/` | 탭별 화면. 자기 데이터는 스스로 `api.js`에서 읽는다. 그룹은 [MAP.md](MAP.md) |
| `ai/` | 상담 패널과 그 카드들. 서버가 돌려준 제안·후보·변경 묶음을 보여 주고 사용자가 고른 것만 적용 요청 |
| `components/` | 두 탭 이상이 쓰는 표시 단위. API를 직접 부르지 않고 props 콜백으로 올린다(예외: `MaterialFileLink`, `ZipImportPanel`) |
| `lib/` | 순수 함수 위주: 상태값 → 한국어 문구(`*Labels.js`), 시간·배치 계산, 초안 변환. 대부분 단위 테스트가 붙어 있다 |
| `api/api.js` | 유일한 HTTP 경계. `views/classcheck/classSessionApi.js`, `views/learning/materialWeekApi.js`는 해당 `*API`를 null-안전하게 꺼내는 접근자(api 모듈을 통째로 mock한 테스트에서 없으면 null → 그 부분 없이 화면을 그린다) |
| `types/` | 실행·학습 데이터의 필드 이름·상태 언어(백엔드 enum과 1:1) |

## 상태 관리

- 전역 저장소 없음. 컴포넌트 지역 상태(`useState` ≈500곳, `useMemo`/`useCallback`/`useRef` 각 ≈100)와 props 전달이 기본.
- Context는 하나: `views/today/itemWorkspaceContext.js`(항목 작업 공간). `useSyncExternalStore` 2곳.
- **서버가 상태의 원본이다.** 화면은 적용 전 초안·검토 상태도 서버에 저장하고(`PUT …/review-state`, 변경 묶음 `selection`), 새로고침 후 서버에서 복원한다(미결 후보·변경 묶음·미리보기 조회 경로).
- 브라우저 저장소: `localStorage`는 JWT(`token`), 수업 확인 "나중에"(`lib/classCheck.js`), 정리안 편집 임시본(`lib/tidyEditStore.js`). `sessionStorage`는 상담 입력 임시본(`AiPanel`, 사용자가 직접 친 순간에만 저장).

## API 호출 경로

- `api.js`의 `request(url, options)`: `API_BASE_URL`(기본 `http://localhost:8081/api`, `VITE_API_BASE_URL`로 덮음) + `Authorization: Bearer <token>`. 204는 `null`.
- 오류: `!response.ok`면 `Error`를 던진다. `message` = 문자열 `details` → `message` → `error` → `요청 실패: <status>` 순. `err.status`·`err.code`(예 `E409_040`)·`err.details`(구조화)를 붙인다. 화면은 문구를 파싱하지 않고 `code`/`details`로 분기한다.
- 파일 업로드는 `requestMultipart`(Content-Type을 브라우저에 맡김).
- 상담 턴은 **SSE**지만 `EventSource`를 쓰지 않는다 — POST·Authorization 헤더가 필요해 `fetch` + `response.body.getReader()`로 직접 읽는다.
- 도메인별 객체 39개(`authAPI`, `executionItemAPI`, `planAPI`, `conversationAPI`, `changeBundleAPI`, `materialStoreAPI` …). 대응은 [UI-CONTRACT.md](UI-CONTRACT.md).

## 스타일

- `App.css`(≈8,300줄, 전역·대부분의 화면) + `styles/*.css`(기능별 11개). `App.jsx`가 `App.css`·`workspace.css`를, 각 화면이 자기 CSS를 import.
- 의미 있는 클래스 이름 + CSS 변수 방식. `className` 문자열 2,170개 중 Tailwind 유틸리티가 섞인 것은 29개 정도다.
- 토큰과 화면 원칙은 `styles/workspace.css` 머리 주석·`:root`([UI-CONTRACT.md](UI-CONTRACT.md) §디자인 토큰).
