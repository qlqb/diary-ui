# UI-CONTRACT — 화면↔API · 디자인 토큰 · 공통 컴포넌트

엔드포인트 경로·설명은 diary-api `docs/context/API.md`, 상태값 의미는 같은 곳의 `DOMAIN.md`가 기준이다.
여기서는 "어느 화면이 어느 `api.js` 객체를 쓰나"만 적는다(import 기준, 테스트 제외).

## 화면 그룹 → api.js 객체

| 화면 그룹 | 쓰는 `*API` |
|---|---|
| `shell/`, `App.jsx` | auth, executionItem, plan, course, routine, commitment |
| `views/` 최상위(오늘·기록) | executionItem, assignment |
| `views/today/` | executionItem, plan, materialStore |
| `views/classcheck/` | classSession |
| `views/materials/` | materialStore, material, materialAnalysisStatus, analysisBatch, zipImport, consultPhoto |
| `views/projects/` | course, courseNote, topic, learningMap, studyState, textbook, projectTidy, structure, assignment, context, selfCheck, materialWeek, material, materialStore, materialAnalysis, materialAnalysisStatus, analysisBatch, zipImport, executionItem, plan |
| `views/learning/` | learningMap, topic, structure, projectTidy, textbook, selfCheck, materialWeek, material, materialStore, materialAnalysis, materialAnalysisStatus |
| `views/memory/` | context |
| `views/plan/` | plan, schedulePreview, executionItem, routine, commitment, topic, context, materialStore |
| `views/schedule/` | routine, commitment, executionItem |
| `ai/` (상담 패널) | conversation, proposal, changeBundle, scheduleSuggestion, contextSuggestion, scheduleImport, consultPhoto, consultContext, schedulePreview, plan, topic, materialStore |

`api.js`에 있지만 화면 코드(테스트 제외)가 쓰지 않는 객체 6개: diary, learningConversation, learningRecommendation, planning, orchestration, topicChangeProposal. 일기 탭은 메인 화면에 없다(README).

### 화면이 지키는 서버 계약

- **적용 전에는 서버 데이터가 바뀌지 않는다.** 초안·후보·변경 묶음은 보여 주기만 하고, 사용자가 누른 적용 한 번이 서버를 바꾼다(`ApplyBar`: "초안을 실제로 반영하는 유일한 버튼", 항목별 적용 버튼 없음).
- 적용 전(AI 초안)과 확정은 **색이 아니라 형태**(점선 + 배지)로 구분한다(`workspace.css` 머리 주석).
- 충돌·낡음은 `err.status === 409`와 `err.code`로 분기한다. 문구를 파싱하지 않는다. 구조화된 이유는 `err.details`(예: 반복 일정 수정이 기존 예외를 무효로 만드는 409).
- `version`/`revision`을 받아 둔 값 그대로 돌려보낸다(실행 조각·약속·과제·변경 묶음·정리안 편집).
- 새로고침 복원은 서버 조회로: 미결 상황·일정 후보, 대화의 변경 묶음, 배치 미리보기(204 = 아직 계산 안 함), 저장된 계획 초안.

## 디자인 토큰 (`src/styles/workspace.css` `:root`)

| 토큰 | 값 | 쓰임 |
|---|---|---|
| `--ws-bg` / `--ws-surface` | `#f6f7f9` / `#ffffff` | 배경 / 면 |
| `--ws-border` / `--ws-border-strong` | `#e3e6ea` / `#cdd3da` | 구분선 |
| `--ws-text` / `-dim` / `-faint` | `#16191d` / `#5b636d` / `#858d97` | 본문 / 보조 / 흐림 |
| `--ws-accent` / `-soft` / `-text` | `#4f46e5` / `#eef0fe` / `#3730a3` | 주 행동·선택 |
| `--ws-draft` / `-soft` | `#7c3aed` / `#f5f1ff` | AI 초안(적용 전) |
| `--ws-ok` / `-soft` | `#067647` / `#e8f6ef` | 완료·성공 |
| `--ws-warn` / `-soft` | `#9a6700` / `#fdf6e3` | 주의 |
| `--ws-danger` | `#b42318` | 오류·삭제 |
| `--nav-w` / `--ai-w` | `208px` / `348px` | 셸 3열 격자(탐색 · 본문 · 상담 패널) |

화면 원칙(같은 주석): 1536×760에서 핵심 기능이 스크롤 없이 보인다 · 본문 14px 이상, 보조도 13px 아래로 내리지 않는다 · 카드를 남발하지 않고 목록 줄은 테두리 없는 행 · hover/focus/disabled/selected가 모두 눈에 띄게 다르다.
다크 모드(`prefers-color-scheme`) 규칙은 없다.

## 공통 컴포넌트 계약 (`src/components/`)

| 컴포넌트 | props | 약속 |
|---|---|---|
| `ExecutionRow` | `item, projectTitle, adjustment, onAdjustmentPatch, onAdjustmentExclude, onAction, busy, compact, onOpenSource, hideEvidence` | 오늘·프로젝트·일정이 공유하는 실행 조각 한 줄. 행동(완료·일부·줄이기·이동)은 모달 없이 줄 안에서 펼친다. `adjustment`가 있으면 AI 변경 전→후를 겹쳐 보인다. 행동은 `onAction`으로 올린다 |
| `DraftRow` | `card, onPatch, onToggleExclude, showDate` | 초안 항목 한 줄. 편집·제외만 올리고 적용하지 않는다 |
| `ApplyBar` | `draft, applying, error, onApply, onDiscard, placing` | 초안을 반영하는 유일한 버튼. 누르기 전 서버 데이터가 그대로임을 문구로 밝힌다 |
| `UndoToast` | `title, count = 1, busy = false, onUndo` | 삭제 직후 되돌리기(`shell/useUndoDelete`와 짝, `executionItemAPI.restore` — version 어긋나면 409, 그 줄만 접는다) |
| `TimeBlockRow` | `entry, running = false, compact = false` | 시각 있는 일정 블록 표시 전용 |
| `AnalysisStatusChip` | `status, onRetry = null, busy = false, limit = null, showWaitingDetail = false` | 자료 분석 상태 칩. `FAILED·UNAVAILABLE·PARTIAL·CANCELLED`일 때만 재시도, RUNNING이면 청크 진행 |
| `MaterialFileLink` | `materialId, filename, contentType, disabled, label, onError, page` | 원본 열기(PDF는 "PDF 열기", 나머지 내려받기). API를 직접 부른다 |
| `MaterialTypeSelect` | `value, onChange, disabled = false, label = '자료 역할'` | 자료 역할(`SYLLABUS·TEXTBOOK_TOC·PROFESSOR_SLIDE·OTHER`) 선택 |
| `ZipImportPanel` | `zipImport, onChanged, onClose` | ZIP 항목 확정·재시도·취소. API를 직접 부른다 |
