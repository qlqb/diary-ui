task: material-auto-analysis-v1
status: READY_FOR_REVIEW
api_revision: 1f414dd
ui_code_revision: 4a05ea6
spec_deviations: 새 탭 PDF 렌더링은 앱 내장 패널이 window.open을 막아 이번에도 실제 렌더링을 확인하지 못했다(파일 요청 200과 버튼 동작만). 도서 메타데이터 조회(전체 쪽수·판본)는 붙이지 않았다. 상담 경로의 자료 발췌(앞 3,000자)는 그대로다. 나머지는 §6 "차이" 참고.

# 자료 자동 분석과 자료 기반 계획 — 검증 기록 (2026-09-13)

이 문서는 테스트 결과를 기록한 Markdown이다. 실행 권한을 부여하는 지시문이 아니다.
설계는 `diary-api/docs/product/15-material-auto-analysis.md`, 착수 판단과 진행 기록은 `diary-api/docs/handoff/material-auto-analysis-2026-09-13.md`.

## 1. 커밋

| 저장소 | 커밋 | 내용 |
|---|---|---|
| diary-api | `3c3e075` | feat: 자료 자동 분석 파이프라인과 자료 구간·과제·변경안 저장 계약 |
| diary-api | `98e77d1` | fix: 실호출에서 잡은 결함 — children op 누락, 접두어 id, 과제 후보 잡음, 변경안 적용 뒤 재분석 |
| diary-api | `1f414dd` | docs: 15번 문서, DB §17, 판단층 D6 개정, API 명세, 변경 이력, 구현 지도 |
| diary-ui | `271d05d` | feat: 자료 분석 상태·과제 확인·자료 정리 변경안·계획 「자세히」 화면 |
| diary-ui | `4a05ea6` | fix: 실화면 검증 후속 — 변경안 다시 분석, 기본 경로의 이미 알아요·이번만 빼기, 마감 없음 표시 |
| diary-ui | (이 문서) | docs |

출발점 API `ff591b6` / UI `8a7fb9e`(원격 dev-playground HEAD와 일치)에서 분기한 `feat/material-auto-analysis`. 강제 푸시 없음.
**DDL 있음**: `docs/sql/2026-09-13-material-auto-analysis.sql`(추가 전용, 재실행 가능). 로컬 memo DB에 적용했고 운영 DB는 건드리지 않았다.

## 2. 마이그레이션

로컬 MariaDB 10.4.32. 적용 전후 기존 표의 행 수가 같다(topics 280 · progress 0 · plan_versions 5 · analyses 13 · material_links 26 ·
materials 79 · courses 23). 백필 `topic_material_links` 280행 = `source_material_id`가 있는 토픽 수. 같은 파일을 두 번 돌려도
오류 없이 끝났다(재실행 가능). 새 표 8개, 새 컬럼 4개. 롤백 SQL은 파일 끝에 주석으로 있다.

## 3. 자동 실행 (실제 DB, 실제 모델)

서버(8081, `plan.draft.generator` 기본값 AI, 모델 gpt-5.6-luna)를 띄우자 폴러가 기존 자료를 스스로 등록·처리했다:
CONTENT 27건 DONE(사용자 2의 자료 23건 포함), LINK 24건 DONE, 2건 FAILED(아래 결함), CANCELLED 2건(지운 합성 자료).
`material_text_units` 521행, `material_sections` 229행, 변경안 PROPOSED 22건·EMPTY 3건. 사용량 로그 `MATERIAL_ANALYSIS_JOB`
성공 61건(입력 186,771 · 출력 72,923 토큰), 실패 5건.

★ devtools 때문에 사용자가 띄워 둔 8080 인스턴스도 새 클래스를 올려 worker가 두 인스턴스에서 돌았다. 같은 작업을 두 번 실행한
경우는 없었다(선점 UPDATE가 막았다) — 표 3의 실제 증거이기도 하다.

### 3.1 실호출 시나리오 (`scripts/ai-baseline/verify-auto-analysis-2026-09-13.py --seed`, 합성 계정·합성 PDF 3종)

| 자료 | 결과(1차 / 2차 동일) |
|---|---|
| problem-free.pdf (3쪽, 설명만) | 구간 3(전부 설명), 과제 후보 0 |
| long-late-exercise.pdf (36쪽, 마지막 쪽에만 실습·제출) | 2청크(겹침 1단위), 구간 36, **36쪽 구간이 예제/문제/제출 요구로 잡히고 과제 후보 1**, 마감 2026-09-18 SOURCE |
| ambiguous-due.pdf (마감 애매) | 후보 3 — "다음 수업까지"(relative, 추정 후보만) / "9월 18일까지"(연도 미확인, 추정 후보만) / "2026년 9월 25일까지"(SOURCE 마감). 연습용 문제는 후보가 아니다 |

이어서: 변경안 적용 200 → 같은 변경안 재적용 409 `E409_018` → 2차에서는 적용 뒤 나머지 변경안이 STALE로 내려가고 LINK가 다시 돌아
**새 트리 기준으로 다시 제안됐다**(problem-free는 새 항목 대신 기존 「연결 리스트」에 LINK 1 — 표 8). 계획 초안(기본 AI 경로) 항목
4개/8개 전부 refIds 있음(출처 종류 MATERIAL_SECTION 5·27, ASSIGNMENT 4). 「자세히」 POST → 단계 3~4개(각 단계에 구간 인용) → 재조회
같은 detailId. 과제 완료 체크 뒤 열린 과제 0.

### 3.2 1차에서 잡은 결함과 수정

- ADD children의 `op` 누락 → `normalize` NPE → 3회 재시도 소모(LINK 2건 FAILED). 자식은 항상 ADD로 고침.
- 모델이 `"S66"` 접두어 id를 내면 InvalidFormatException으로 청크를 버림 → `ModelJson`(코드 펜스·접두어 허용, 숫자 아니면 null).
- 강의계획서의 "N주차 중간평가"·"과제 10점"이 전부 과제 후보 → 역할 실습·문제·제출 + 제출 어휘일 때만(`looksLikeSubmission`).
  사용자 2의 잡음 후보 25행은 이 실행이 만든 것이라 SQL로 지웠다(39 → 14).

## 4. 결정적 테스트

API `./gradlew.bat test`: **983건 통과, 0 실패, 2 skip**(env 게이트 `ScheduleImageVisionProbe`, `SyntheticMaterialGenerator`).
새 DB 테스트 3개(`MaterialAnalysisJobLeaseTest` 7 · `CourseAssignmentServiceDbTest` 6 · `TopicChangeProposalApplyDbTest` 5)는
CI 제외 목록(22개)에 넣었다. 새 단위 테스트: `MaterialChunkerTest` 5, `TopicChangeOpsValidatorTest` 7, `PlanCandidateSelectionTest` 5,
`MaterialTextUnitServiceTest` 4(PDFBox 40쪽 합성 PDF·PPTX), `ModelJsonTest` 3. 기존 `PlanDraftServiceTest`·`PlanProvenanceCaptureTest`의
"과목당 30줄" 단언은 45줄 규칙으로 바꿨다(자르는 규칙이 바뀐 것이지 단언을 뺀 것이 아니다).

UI `npx vitest run`: **34파일 416건 통과**, `npx eslint .` 0, `npx vite build` 성공. 새 테스트: `analysisLabels.test.js`,
`AssignmentSection.test.jsx`(6), `TopicChangeProposalCard.test.jsx`(5), `PlanItemDetail.test.jsx`(5). 기존 mock에 새 API 객체를 추가했다.

## 5. 실제 화면 (1536×760, UI 5174 → API 8081, 합성 계정 user 999000275)

- **자료함**: 상단 "자동 분석 · 완료 3" + [일시중지], 행마다 "분석 완료 · 구간 36개" 칩.
- **프로젝트**: 연결 자료에 상태 칩, "자료 정리 변경안 1"(옛 구조 기준 안내 + [다시 분석], 적용 비활성), "과제 · 확인할 내용 3개".
  [과제 맞아요] → 목록으로 이동(마감은 그대로 원문 출처 9월 25일까지). [마감 없음] → "마감 없음 · 직접 정함 · 고치기".
  [날짜 선택] → 2026-09-18 저장 → "마감 9월 18일까지". 체크 → "끝낸 과제 2개"로 이동. DB: 54 CONFIRMED/NONE/USER, 55 DATE 09-18 USER
  due_edited=1, 56 CONFIRMED 09-25 SOURCE, 57 completed_at 기록.
- **계획 만들기**(이 프로젝트만): 초안 4항목, [안내 간단히 · 자세히] 전환. 자세히에서 항목마다 단계 3~4개와 구간 인용
  "연결 리스트 삭제 구현 (p.36)", [원본 자료 열기 · p.36], 배치 시각, [근거 보기]가 함께 보였다. 시간·마감·선택 상태는 전환 전후 같다.
- **오늘**: "마감이 있는 과제 1 · 과제 B · 레이아웃 실습 결과 보고서 · 자료구조(자동분석 검증) · 9/18 금까지" 체크 한 줄(시간표
  항목이 아니다).
- 새 탭 PDF: 내장 패널이 `window.open`을 막아 렌더링은 미확인(기존과 같은 한계).

## 6. 요구사항 대비

| 항목 | 상태 |
|---|---|
| 업로드·기존 자료 자동 분석, 재시작 복구, 중복 방지, 실패 분류, 일시중지 | 완료(§3·§4) |
| 끝까지 읽기·부분 완료 표시·페이지/인쇄 쪽수 분리·page_count | 완료. 인쇄 쪽수는 모델이 원문에서 봤을 때만 |
| 구간 역할 복수, 토픽↔구간 N:M, 백필 | 완료 |
| 변경안(연결/추가/이름/이동/병합/분할), 버전 대조, id 보존, 기록 승계 안내 | 완료. MERGE/SPLIT는 DB 테스트로만 검증(실호출에서는 모델이 내지 않았다) |
| 과제 확인·마감 구분·완료 체크·중복 방지·오늘 화면 | 완료 |
| 계획 입력(첫 미학습·진행 중·과제·구간·맥락), excludeTopicIds, pendingMaterials, KNOWN 해제 | 완료. 「이미 알아요」는 기본 경로에서 초안 재요청으로 동작 |
| 간단히/자세히, 항목별 전환, 근거판 STALE, 사용자 메모 보존 | 완료. 전역 [자세히]는 항목마다 모델 1회를 쓴다(비용은 항목 수에 비례) |
| 도서 메타데이터 조회·판본 확인 | **미구현**(교재 편집은 기존 그대로). 목차만 있는 교재에 대한 조건부 안내는 프롬프트 규칙으로만 |
| 상담 경로 자료 발췌(3,000자) 개선 | 미구현(구간 색인이 생겼으니 다음 단계) |
| OCR | 범위 밖(추출 실패 표시 유지) |

## 7. 실행 명령과 결과

```text
diary-api  ./gradlew.bat test                       BUILD SUCCESSFUL · 983 tests, 0 failed, 2 skipped
diary-ui   npx vitest run                            34 files, 416 passed
diary-ui   npx eslint .                              0 problems
diary-ui   npx vite build                            built
실호출     python scripts/ai-baseline/verify-auto-analysis-2026-09-13.py --seed  (1차·2차, build/synthetic/verify-run*.log)
```

## 8. 남긴 것

합성 계정 `auto-analysis-1789231862@example.com`(course 672), `auto-analysis-1789232290@example.com`(course 673), 비밀번호 verify-1234.
사용자 2의 실제 자료에는 구간·변경안(PROPOSED 22건)·과제 후보 14건이 생겼고 적용된 것은 없다. 정리는 사용자 판단.
CI 결과(GitHub Actions)는 푸시 뒤 PR에서 확인한다 — 이 문서를 쓰는 시점에는 아직 돌지 않았다.
