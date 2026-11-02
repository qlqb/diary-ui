# MAP — diary-ui 화면 색인

`src/views/` 100개 파일(테스트 포함)을 디렉터리 = 기능 그룹으로 묶었다. 파일 나열 대신 그룹의 역할과 진입점만 적는다.
구조는 [ARCHITECTURE](ARCHITECTURE.md), 화면↔API는 [UI-CONTRACT](UI-CONTRACT.md), 규칙은 [CONVENTIONS](CONVENTIONS.md).
백엔드 쪽 지도는 diary-api `docs/context/MAP.md`.

## 탭 → 화면 그룹

최상위 탭은 `src/shell/MainShell.jsx`의 `TABS` 6개: 오늘 · 자료 · 프로젝트 · 계획 · 일정 · 기록. AI 상담 패널(`src/ai/`)은 모든 탭 옆에 붙는다.

| 그룹 (파일 수) | 탭 | 맡는 것 | 진입점 |
|---|---|---|---|
| `views/` 최상위 (4) | 오늘·기록 | 오늘 실행 목록 · 수행 기록·조정 이력 | `TodayView`, `RecordView` |
| `views/today/` (4) | 오늘 | 항목 작업 공간(시작 도움·메모), 남은 오늘 다시 짜기 | `ItemWorkspace`, `ReschedulePanel` |
| `views/classcheck/` (5) | 오늘·프로젝트 | 수업 회차 확인 카드·패널 | `TodayClassCheck`, `ClassCheckPanel` |
| `views/materials/` (15) | 자료 | 자료함·업로드·분석 묶음·분석 현황·연결 제안 | `MaterialsView` |
| `views/projects/` (18) | 프로젝트 | 프로젝트 목록·작업 공간(교재·과제·학습 기억·자료 정리) | `ProjectsView`, `ProjectWorkspace` |
| `views/learning/` (15) | 프로젝트 | 학습 지도·항목 상세·구조 편집·자료 주차·자기 점검 | `ProjectLearningMap`, `StructureEditor` |
| `views/memory/` (2) | 프로젝트 | AI가 이해한 내 상황(user_contexts) 보기·고치기 | `MemoryView` |
| `views/plan/` (25) | 계획 | 계획 만들기·초안 검토·말한 범위·근거·주간 미리보기·확정 계획 | `PlanCreateView`, `PlanView` |
| `views/schedule/` (12) | 일정 | 주간 격자·반복 일정·예외·1회성 약속 | `ScheduleView` |

합계 100 = 4 + 4 + 5 + 15 + 18 + 15 + 2 + 25 + 12. 대조: `bash scripts/check-context-layer.sh`.

## views 밖

| 경로 | 맡는 것 |
|---|---|
| `src/shell/` | `MainShell`(탭·프로젝트 선택·상담 범위), 삭제 되돌리기(`useUndoDelete`), 제안 탭 |
| `src/ai/` | 상담 패널(`AiPanel`)과 카드: 변경 묶음·일정 후보·이해 확인·질문·근거·사진·일정 이미지 검토 |
| `src/components/` | 여러 탭이 공유하는 줄·버튼(`ExecutionRow`, `DraftRow`, `ApplyBar`, `UndoToast` …) |
| `src/lib/` | 화면 로직·문구(`*Labels.js`)·시간 계산(`planTime`, `datetime`)·로컬 저장(`tidyEditStore`) |
| `src/api/api.js` | 백엔드 호출 전부(도메인별 `*API` 객체 39개) |
| `src/styles/`, `src/App.css` | 화면별 CSS, 디자인 토큰(`workspace.css`의 `--ws-*`) |
| `src/types/` | 실행·학습 데이터 계약(백엔드 enum과 1:1) |
| `docs/reviews/` | 2026-09 화면 작업 완료 기록(색인 README). 10월 이후는 diary-api `docs/handoff/` |

## 무엇을 알고 싶으면

- 화면이 어떤 API를 부르나 → `UI-CONTRACT.md` 표, 그다음 `src/api/api.js`의 해당 `*API`
- 상태값의 의미 → diary-api `docs/context/DOMAIN.md` (`src/types/*.js`가 그 사본)
- 제품 설계·탭 책임 → diary-api `docs/product/01`·`02`·`08`
