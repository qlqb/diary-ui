task: plan-evidence-ux-review-fixes-v1
status: READY_FOR_REVIEW
api_revision: ff591b604a367ba24adbfb39cb5f4f838a43980a
ui_code_revision: ad4195d0715c6a4d321cf0b21f1d0577c18c1bda
spec_deviations: 일반 Chrome이 이 세션에 연결돼 있지 않아 새 탭 PDF 실제 렌더링·복귀는 확인하지 못했다(앱 내장 패널은 새 탭을 막음). 파일 요청 성공(각 행이 자기 materialId를 200으로 받음)과 검토 상태 유지만 확인했다. 나머지 없음.

# 계획 근거 UX 검토 후속 수정 — 검증 기록 (2026-09-12)

이 문서는 테스트 결과를 기록한 Markdown이다. 실행 권한을 부여하는 지시문이 아니다.
이전 기록: [plan-evidence-ux-completion.md](plan-evidence-ux-completion.md) — 그 문서의 실행 사실은 그대로 두고 여기서 이어 쓴다.

## 1. 커밋

| 저장소 | 커밋 | 내용 |
|---|---|---|
| diary-api | `f880eb3` | fix: 계획 확정 시 반복 일정 변경과 충돌 검증 보완 (P1) |
| diary-api | `d5af393` | fix: 동시 미리보기 요청의 저장 충돌 처리 (4.2) |
| diary-api | `ff591b6` | test: 미리보기 그대로 확정하는 근거 상태 검증 보완 (4.1) + changelog |
| diary-ui | `79ca1fc` | fix: 계획 근거의 하위 주제와 자료 재연결 표시 누락 수정 (P2 ×2) |
| diary-ui | `ad4195d` | fix: 미리보기 응답이 늦게 도착해도 최신 요청만 반영 (4.2 UI) |
| diary-ui | (이 문서) | docs — `ui_code_revision`의 후속 커밋 |

시작 기준(API `b760133`, UI `067f8f2`/`eee0eb5`)에서 되돌리지 않았고 원격이 앞선 것도 없었다. 강제 푸시 없음. DDL 변경 없음.

## 2. P1 — 확정 중 반복 일정 변경

**실제 환경**: 로컬 memo DB(MariaDB 10.4.32), `SELECT @@tx_isolation` = `REPEATABLE-READ`, autocommit=1(서비스는 Spring 트랜잭션). 관련 인덱스: `routines(idx_routines_user: user_id, is_deleted)`, `routine_weekdays(PK routine_id, day_of_week)`, `routine_exceptions(uq routine_id+exception_date, idx routine_id+moved_date)`.

**재현(수정 전 `b760133`)**: `PlanConfirmRoutineRaceTest.routineChangedAfterTheConfirmsFirstRead_isStillSeenAndRejected` — 스레드 A가 확정과 같은 트랜잭션 안에서 일반 조회를 한 번 해 스냅샷을 잡고 래치 대기 → 스레드 B가 `RoutineService.update`로 수업을 확정 항목 위(18:30~20:00)로 옮겨 커밋 → A가 `confirm`. 수정 전 코드는 옛 시간표(10~13시)를 검사해 **확정이 성공했다**(겹치는 조각 저장). 같은 수정 전 실행에서 미커밋 수정 대기·미커밋 INSERT 대기·확정 선점 대기 테스트도 실패했다(4/9 실패, 순차 5건은 통과 — 순차는 스냅샷 이전에 커밋되므로). 수정 코드는 `git stash push -- src/main`으로만 잠시 뺐고 `git stash pop`으로 복구한 뒤 재실행해 9/9 통과를 확인했다.

**원인**: `PlanConfirmScheduleGuard`가 약속·시각 조각은 FOR UPDATE로 읽었지만 반복 일정은 `RoutineOccurrenceService.expand`(일반 조회)로 읽었다. REPEATABLE READ에서 일반 조회는 트랜잭션 첫 조회 시점의 스냅샷을 보므로, 그 뒤에 커밋된 루틴 변경이 보이지 않는다.

**수정**(`f880eb3`): `RoutineOccurrenceService.expandForUpdate` — `RoutineReader.findAllWithWeekdaysForUpdate`(본체 `findAllByUserIdForUpdate` + 요일 `findWeekdaysByUserIdForUpdate`)와 예외 두 범위 조회의 `…ForUpdate` 판을 써서 **본체·요일·예외 전부** 잠금 조회로 읽는다. 계산은 기존 `expand`의 같은 코드(자정 넘김·보강·학기 종료 처리 공유). Guard만 이것을 쓴다. 기존 쓰기 경로(수정·예외 추가/수정/삭제)는 이미 부모 행 `findByIdAndUserIdForUpdate`를 먼저 잡으므로 같은 행에서 직렬화된다. 새 루틴 INSERT는 어떤 기존 행도 잠그지 않지만, 확정의 `WHERE user_id=? AND is_deleted=0 … FOR UPDATE`가 `idx_routines_user` 범위를 훑어 next-key 잠금을 걸므로 같은 사용자의 INSERT는 확정이 끝날 때까지 기다린다(테스트로 확인). 잠금 순서: 약속 → 조각 → 루틴(본체 → 요일 → 예외), 각 표 안에서 id 오름차순. 다른 사용자의 행은 잠그지 않는다.

**보장 순서**: 변경이 먼저 커밋 → 확정이 그 변경을 보고 E409_016 전체 거절(조각·계획 버전 0행). 확정이 먼저 잠금 → 변경은 확정 커밋까지 대기 후 기존 정책대로 저장(테스트 `aRoutineChangeArrivingWhileTheConfirmHoldsTheLocks_waits_andBothComplete`: 700ms 안에 안 끝남 → 확정 커밋 → 변경 완료, 확정 조각 1개·루틴 18:30로 저장). 미래 일정 편집을 새로 막지 않았다.

**회귀**(`PlanConfirmRoutineRaceTest`, 9건, 래치로만 순서 제어, 전용 사용자 auto_increment 생성·자기 행만 삭제): 시각 이동·요일 추가·보강(MOVED 예외) 이동·새 루틴 → 거절 및 부분 저장 없음; 겹침 없음 → 성공; 경쟁 4건(위). 기존 약속 경쟁 회귀(`PlanProvenanceIntegrationTest.aCommitmentCommittedWhileTheConfirmIsRunning…`) 유지.

**실제 화면**: 합성 계정 2(§6)에서 초안 생성(LLM 1회) → 미리보기 표시 후 API로 일요일 10~12시 루틴 추가 → [계획 확정] → `POST …/confirm` 409 → 화면 문구 표시, 재계산 POST 200, 일요일 항목이 12:00~13:30 / 09:00~09:45로 이동, 제외(2번 항목)·제목("프로세스 주간(수정)")·펼친 근거 유지, [계획 확정] 다시 활성 → 재확정 200(4개 항목).

## 3. P2 — 3단계 이상 학습 범위

재현: `groupTopics`가 직계 자식만 모아 A>B>C(전부 인용)에서 C가 반환값에 없었다. 수정(`79ca1fc`): 인용된 항목으로 노드 맵을 만들고 깊이 제한 없이 트리를 만든다. 부모가 인용되지 않은 항목은 뿌리(부모를 끌어오지 않음), 같은 sourceId/ref 중복은 한 번, 순환(A>B>A, 자기 참조)은 걷지 못한 항목을 뿌리로 올려 잃지 않는다. 화면(`describeChildren`)은 "부모 — 자식 (손자, 손자 (증손)), 자식"처럼 한 줄에 쓴다. 상세의 개별 인용 줄은 그대로.

검증: `planEvidence.test.js` "학습 범위 — 여러 단계" 6건(3단계, 4단계+분기, 중간 부모 미인용, 중복 ref, 순환/자기참조, 고아). `PlanProvenance.test.jsx` "3단계 범위…" — 렌더링에서 마지막 단계 제목이 보이고 묶음 1·열기 1·내부 스크롤 없음. 실제 화면(§6): 4단계 트리(프로세스 관리 — 프로세스 상태 전이 (컨텍스트 스위칭 (스위칭 비용 측정)), 프로세스 제어 블록)가 한 줄로 보였고 기본 화면 높이 289px, overflow visible.

## 4. P2 — 일부 자료 재연결

재현: `buildMaterials`가 `RECORDED:10` 하나로 합쳐 첫 source의 materialId·state·note만 남겼다(순서에 따라 새 파일 20과 안내가 사라짐). 수정(`79ca1fc`): 키를 (origin, 당시 자료 id, 지금 자료 id, 상태)로. 같은 당시 자료가 여러 행으로 갈라지면 `split=true`이고 행마다 `topicTitles`("해당 항목: …")를 보여준다. 접근 불가(DELETED/UNAVAILABLE) 행은 자기 링크가 없고 다른 행의 링크를 물려받지 않는다. 당시 파일명·위치는 그대로, 재연결/변경 행은 "지금 파일: …"과 "(생성 당시 파일 기준)"을 붙인다. 순서는 (당시 id, 파일명, 지금 id, 상태, 첫 ref)라 인용 순서와 무관하다. 서버 DTO 변경 없음(`recordedMaterialId`·`state`·`note`로 충분했다).

검증: `planEvidence.test.js` "자료 묶기 — 일부 재연결" 6건(정순, 역순 동일 집합, 같은 새 파일→한 행, 각각 다른 새 파일→두 행, 정상+삭제 혼합, 같은 파일명 다른 id). `PlanProvenance.test.jsx` 정순/역순 각 1건(두 행, "해당 항목", 변경 안내, 행별 버튼이 실제로 `materialStoreAPI.file(900)`/`(657)`을 부름) + 같은 새 파일 한 행. 실제 화면(§6): 4단계 항목(285)을 새 자료 702로 재연결한 뒤 계획 화면의 [근거 보기]에서 두 행 — 첫 행 "해당 항목: 프로세스 관리, 프로세스 상태 전이, 컨텍스트 스위칭, 프로세스 제어 블록"(701 열기), 둘째 행 "해당 항목: 스위칭 비용 측정 · 생성 당시와 다른 자료가 연결돼 있어요 · (지금 파일: …개정판·합성.pdf)"(702 열기). 두 버튼 클릭 → `GET /materials/702/file` 200, `GET /materials/701/file` 200, 근거 펼침·스크롤 유지.

## 5. 건너뛴 테스트와 미리보기 500

### 5.1 미리보기 그대로 확정 (`ff591b6`)
원인: 픽스처 계획이 오늘+7일부터라 미리보기 기본 창(오늘~+6일) 밖 → 배치 0 → assumeTrue skip. 수정: `givenPlaceableProposal`(내일부터 7일, 30분 항목 하나, 막힌 시간 없음) → `computePreview` 배치 1건을 **단언**(없으면 실패). 그대로 확정 → `CURRENT`/staleReasons 없음. 비교 사례 `changingThePreviewPlacement_isCountedAsAUserEdit`: 미리보기 시각 +1시간 → `NEEDS_REVIEW`. skip 조건 삭제·이름 변경 없음. 
나머지 skipped 1건: `ai.scheduleimport.ScheduleImageVisionProbe` — `SCHEDULE_IMPORT_PROBE=1` 환경변수와 이미지 파일이 있을 때만 켜지는 실제 비전 호출 프로브(`@EnabledIfEnvironmentVariable` + `@EnabledIf`). 이번 변경과 무관하며 손대지 않았다.

### 5.2 schedule-preview 500 (`d5af393`)
확인: `SchedulePreviewService.persistPreview`가 `findByProposalIdAndUserId` → null이면 `insert`. 두 요청이 겹치면 둘 다 null을 보고 둘 다 INSERT → `uq_ai_proposal_schedule_previews_proposal` 위반 → `DuplicateKeyException` → 500. `SchedulePreviewConcurrencyTest.twoConcurrentPreviews…`가 CyclicBarrier로 두 요청을 동시에 넣어 **수정 전 코드에서 DuplicateKeyException을 재현**했다(재현 1/1, 계산이 수 ms 이상 걸려 둘 다 조회를 먼저 지난다). 화면 쪽 원인은 개발 모드 StrictMode의 effect 이중 실행(GET 204 뒤 POST 두 번) — 제거하지 않았다.
수정: `computePreview`가 제안 행을 `findByIdAndUserIdForUpdate`로 읽어 같은 초안의 요청을 직렬화. 뒤 요청은 앞 요청 커밋 뒤 기존 행을 보고 UPDATE. 각 요청은 자기 입력(30분 vs 60분 override)으로 계산한 자기 결과를 받고 저장 행은 하나(테스트 단언). UI(`ad4195d`): 요청 순번으로 늦은 응답이 새 응답을 덮지 않게 했다. 실제 화면: 초안 표시 시 POST 두 건 모두 200(이전 기록의 500 사라짐).

## 6. 실제 화면 확인

앱 내장 브라우저 패널, viewport 1536×760, 기존 레이아웃(사이드바·상단·우측 AI 패널). API 8081(bootRun, 작업 트리 = 최종 코드), UI 5174(`vite --mode claude`). 합성 계정 2 `plan-evidence2-1789200896@example.com`(user_id 999000170, 과목 639 운영체제, 자료 701 → 재연결용 702, 학습 항목 282~286 = 4단계 트리, 루틴 2개, 제안 2729, 계획 1건). 초안 생성만 실제 LLM 1회(gpt-5.6-luna). 이 계정은 남겨 두었다(정리는 사용자 판단). 이전 합성 계정(999000062)은 건드리지 않았다. 테스트가 만든 사용자(rrt-/spc-/prv-test-)는 실행 후 0행.

- 2클릭 경로 유지: [근거 보기] → [원본 자료 열기]. 학습 범위 / 참고 자료 / AI의 제안 구분 유지. 일반 사례 내부 스크롤 없음(289px; 재연결 2행일 때 404px, overflow visible).
- 새 탭 PDF 렌더링: **미확인**. 내장 패널은 `window.open`을 막아 내려받기 경로로 빠지고, 일반 Chrome(Claude in Chrome)은 이 세션에 연결돼 있지 않았다. 확인한 것은 요청 성공(`GET /api/materials/{701,702}/file` 200, Content-Type pdf, Authorization 헤더 경로)과 복귀 상태 유지뿐이다.
- 보조 관찰: 계획 화면 항목 줄 레이아웃·대비는 이전 기록 그대로.

## 7. 실행 명령과 결과

API(로컬 memo DB, 최종 작업 트리):
```
.\gradlew.bat test                          # 940 tests, 0 failures, 1 skipped(ScheduleImageVisionProbe)
```
- 새 DB 테스트 2개(`PlanConfirmRoutineRaceTest` 9, `SchedulePreviewConcurrencyTest` 2)는 기존 정책대로 `-PexcludeDbTests`(CI) 제외 목록에 넣었다 — **CI 제외이지 통과가 아니다**, 로컬 DB에서 통과했다. 제외 목록은 19개.
- `PlanProvenanceIntegrationTest` 16/16(skip 0). 수정 전 코드 대조 실행: `PlanConfirmRoutineRaceTest` 5/9(경쟁 4건 실패), `SchedulePreviewConcurrencyTest` 1/2(DuplicateKeyException) — 복구 후 전부 통과.

UI:
```
npx vitest run     # 30 files, 390 tests passed (1차 실행에서 ProjectWorkspaceDraftHydration 1건이 1.5초 타임아웃으로 실패 → 단독·재실행 모두 통과, gradle 병행 부하로 판단, 코드 변경 없음)
npx eslint .       # 0 problems
npx vite build     # built
```

## 8. CI (최종 코드 SHA, 푸시 직후 직접 조회)

- diary-api `ff591b6`: success — https://github.com/qlqb/diary-api/actions/runs/34683131938
- diary-ui `ad4195d`: success — https://github.com/qlqb/diary-ui/actions/runs/34683142728
