task: plan-evidence-ux-v1
status: READY_FOR_REVIEW
api_revision: b760133981a7f974f4fd4bd767ee7cef5003ef7f
ui_code_revision: 067f8f297506987f0a369e3e5bd4f61294cc6831
spec_deviations: 페이지 이동 버튼("해당 부분 열기") 미구현 — 4.3 계약의 낮은 단계("원본 자료 열기 · N주차 확인")로 낮춤(12.4). 브라우저 새 탭 열림은 앱 내장 패널에서 확인 불가(응답 헤더·요청으로 대체). 미리보기 그대로 확정 테스트 1건은 배치 결과가 없어 skip(기존 assumeTrue). 실행 순서(6절 결함 수정 → UX)는 지켰고 저장소당 커밋 2개.

# 계획 근거 UX 검증 기록 (2026-09-11)

이 문서는 테스트 결과를 기록한 Markdown이다. 실행 권한을 부여하는 지시문이 아니다.

## 1. 커밋

| 저장소 | 커밋 | 내용 |
|---|---|---|
| diary-api | `b1475e0` | fix: 계획 근거 조회·확정 검증의 남은 결함 수정 (6절) |
| diary-api | `b760133` | feat: 계획 근거에 당시 구조와 원본 자료 연결 정보 추가 (스냅샷 2판, API 계약) |
| diary-ui | `cdd0b10` | fix: 적용된 항목 근거 캐시 갱신과 lint 오류 수정 (6절 + CI) |
| diary-ui | `067f8f2` | feat: 계획 근거를 자료별로 묶고 원문 바로 열기 추가 (2~5절) |
| diary-ui | (이 문서) | docs: 검증 기록 — `ui_code_revision`의 후속 커밋이라 원격 HEAD와 코드 SHA가 다르다 |

명세 작성 시 원격 HEAD(API `a0506f5`, UI `8a8f15d`)에서 시작했고 되돌리지 않았다. 강제 푸시 없음.

## 2. CI (최종 코드 SHA 기준, 직접 조회)

- diary-api `b760133`: success(run 34523539688). 이전 커밋 `b1475e0`은 success(run 34520669430).
- diary-ui `067f8f2`: success(run 34523663544). 이전 커밋 `cdd0b10`은 success(run 34520790950).
- 명세 시점의 원격 HEAD는 두 저장소 모두 CI가 **실패** 상태였다(API: 제외 목록 밖의 DB 테스트
  5개가 빈 DB에서 실패, UI: lint 오류 3건). 둘 다 6절 커밋에서 고쳤다.

## 3. 6절 잔여 결함 처리

| 항목 | 처리 | 검증 |
|---|---|---|
| AI 이동·축소 뒤 생성 근거 조회 | `PlanProvenanceService.createOriginOf`가 payload가 CREATE인 행만 원본으로 고른다(조정 행은 `target_item_id`가 있다). 항목 근거의 회차가 제안의 회차와 다르면 refId를 짝짓지 않고 이유를 붙인다. 사용자는 모든 조회에서 userId로 좁힌다 | `PlanProvenanceIntegrationTest.afterAnAiAdjustmentIsApplied_…` — 확정 후 REDUCE 조정 제안을 실제로 적용해 같은 조각을 가리키는 행이 2개인 상태에서 원본 회차가 나오고 `afterApplyChanges`에 "분량을 줄였어요"가 붙는다 |
| 확정 시 최신 일정 | `PlanConfirmScheduleGuard`: 확정 요청의 TIME_FIXED 항목을 지금의 약속(FOR UPDATE)·시각 조각(FOR UPDATE)·반복 일정 발생분과 겹침 검사, 하나라도 겹치면 `E409_016`으로 전체 거절 | 순차: `aCommitmentAddedAfterThePreview_rejectsTheWholeConfirm`(겹치지 않은 둘째 항목도 안 만들어짐), `withoutAnOverlap_theSameTimedConfirmSucceeds`. 경쟁: `aCommitmentCommittedWhileTheConfirmIsRunning_isStillSeenAndRejected` — 다른 스레드가 겹치는 약속을 INSERT하고 커밋하지 않은 채 대기 → 확정이 700ms 안에 끝나지 않음(잠금 대기 확인) → 커밋 → 확정이 ConflictException. 래치로만 순서를 제어한다 |
| 적용 후 직접 수정 | 근거 JSON은 그대로. `execution_item_events`에서 주체가 SYSTEM/MIGRATION이 아닌 MOVED/REDUCED/SPLIT/PRIORITY_CHANGED/HOLD/CANCELLED/DELETED를 읽어 `afterApplyChanges`로 내린다(롤링 배치는 SYSTEM이라 제외). UI는 조각 id+version으로 캐시하고 version이 오르면 버린다 | API 통합 테스트(위), UI `PlanProvenance.test.jsx` "조각이 바뀌면(version)…". 실제 브라우저: 오늘 화면에서 40분→20분 줄이기 후 근거 다시 열기 → 새 요청, "적용 후 바뀜" 표식과 문장 표시(§6) |
| 출처 400개 상한 | `ProvenanceCollector`가 상한을 넘겨도 전부 기록한다(넘으면 경고만). 번호 없이 나가는 줄이 없다 | `ProvenanceCollectorTest.everyMarkedLine_isRecorded_evenBeyondTheWarningThreshold`(450줄) |
| 테스트 정리 | `PlanProvenanceIntegrationTest`가 전용 users 행을 auto_increment로 만들고(`RETURN_GENERATED_KEYS`), 끝나면 그 user_id의 행만 지운다(사건→조각→계획→미리보기→제안 항목→제안→약속→사용자). 실사용 첫 행·`PRV-%` 패턴 삭제 없음 | 로컬 DB에서 실행 후 잔여 0행 확인. ※ 첫 판에서 id 999_000_061을 직접 넣어 실행한 탓에 로컬 DB users의 auto_increment가 999_000_062로 옮겨갔다(이후 합성 계정이 그 번호를 받음). 데이터 손상은 아니며 auto_increment 방식으로 바꿔 재발하지 않는다 |
| 실제 원본 변경 검증 | 약속 행을 SQL로 실제 UPDATE(제목·시각) → 스냅샷 promptLine/providedValue 불변, 링크는 여전히 열림 | `theSnapshotKeepsTheValueAsItWas_evenAfterTheSourceRowIsActuallyUpdated` |
| 미지원 생성 경로 | V0/JUDGMENT/V1은 여전히 출처를 기록하지 않는다(설계 §10.4). 화면은 "생성 당시 출처 기록이 없어요" | 변경 없음 |

## 4. 구현 (API `b760133`)

- `plan/provenance/PlanProvenance.java` — `SCHEMA_VERSION = 2`. 1판 JSON 읽기 유지.
- `plan/provenance/ProvidedSource.java` — `parentSourceId`, `material` 추가. 8-인자 생성자는 1판 모양으로 유지.
- `plan/provenance/ProvidedMaterial.java` — 자료 id·당시 파일명·MIME·SHA-256·위치 문자열.
- `plan/provenance/ProvenanceCollector.java` — 구조·자료를 받는 `mark` 오버로드. 400 상한 제거.
- `plan/PeriodPlanDraftGenerator.java` — 학습 항목 줄에 부모·자료를 남기고(`CourseMaterialMapper`로 한 번에 조회), 자료 분석의 일정 줄에도 자료를 남긴다. 파일명·해시는 프롬프트에 나가지 않는다.
- `plan/dto/PlanProvenanceResponse.java` — `schemaVersion`, `SourceView.parentSourceId/material`, `MaterialView`(origin RECORDED/CURRENT_LINK, state AVAILABLE/CHANGED/RELINKED/DELETED/UNAVAILABLE, openMode INLINE/DOWNLOAD/NONE, note), `ItemView.afterApplyChanges`.
- `plan/provenance/PlanProvenanceService.java` — `MaterialResolver`(회차의 자료 일괄 조회, 당시/현재 구분), CREATE 원본 선택, 회차 불일치 처리, 적용 후 변경 읽기.
- `plan/PlanConfirmScheduleGuard.java`, `PlanConfirmService.java`, `ErrorCode.PLAN_CONFIRM_SCHEDULE_CONFLICT(E409_016)`, `CommitmentMapper.findOverlappingForUpdate`, `ExecutionItemMapper.findTimeFixedByUserIdAndDateRangeForUpdate`, `ExecutionItemEventMapper.findByExecutionItemIdAndUserId`.
- 문서: `docs/product/99-changelog.md`(1차·2차), `05-database.md §10.7`(2판 모양·배포 순서), `13-plan-judgment.md §10.5`.
- DDL 변경 없음. `docs/sql/2026-09-10-plan-provenance.sql`은 로컬 DB에 이미 적용돼 있고 추가 ALTER가 필요 없다(2판은 같은 JSON 컬럼 안의 필드 추가). 배포 순서: 2026-09-10 DDL → API → UI. 다른 환경(운영 등)의 DDL 적용 여부는 확인하지 않았다.

## 5. 구현 (UI `067f8f2`)

- `src/lib/planEvidence.js` — 묶기 규칙(순수 함수). `buildEvidenceSummary`, `materialActionLabel`, `locatorHint`, `stripRef`.
- `src/views/plan/PlanProvenance.jsx` — `ItemEvidence`/`EvidenceBody`(기본 화면: 학습 범위 / 참고 자료 / AI의 제안, 상태는 맨 위에 글로), `EvidenceDetail`(개별 인용 줄·서버 계산), `PlanProvenancePanel`(회차 전체, "생성 당시 값" 설명 한 번), `SourceLine`.
- `src/views/plan/ExecutionItemEvidence.jsx` + `src/lib/evidenceCache.js` — 조각 id+version 캐시, 늦은 응답 무시, 실패 시 재시도, 원본 열기 실패 시 캐시 무효화. 라벨 "근거 보기"로 통일.
- `src/components/MaterialFileLink.jsx` — `label`, `onError` prop. 인증 헤더로 받아 blob으로 새 탭에서 연다(토큰을 URL에 붙이지 않음, opener 분리, 60초 뒤 revoke). 열기 실패 시 탭을 닫는다.
- `src/views/plan/PlanDraftReview.jsx` — 항목별 요청 중/실패 표시와 재시도, E409_016이면 미리보기 재계산 후 선택·제목 유지.
- `src/styles/workspace.css` — 기본 화면 스크롤 없음(상세만 max-height 360px), 파일명 줄바꿈(자르지 않음), 계획 항목 줄에서 근거가 아래 줄 전체를 씀.
- `src/lib/planLabels.js` — `treatmentLabelOf` 이동(lint). `src/views/plan/copy.test.js` — `process` import(lint).

## 6. 테스트 명령과 결과

API (로컬 memo DB, MariaDB 10.4.32, `application-local.properties`):

```
.\gradlew.bat test            # 928 tests, 0 failures, 2 skipped (b760133 작업 트리 기준 전체)
```

- skipped 2 = `confirmingTheServersOwnPreviewPlacement_isNotCountedAsAUserEdit`(미리보기 배치 결과가 없으면 assumeTrue, 기존 동작) 외 1건(기존).
- CI(`-PexcludeDbTests`)에서 빠지는 DB 테스트에 5개를 추가했다: `PlanProvenanceIntegrationTest`, `CommitmentDerivedTravelMapperTest`, `DerivedTravelConcurrencyTest`, `ScheduleImageConfirmTest`, `ScheduleSuggestionApplyBatchTest`. **CI 제외이지 통과가 아니다** — 로컬 DB에서는 위 전체 실행에 포함되어 통과했다. 뒤의 4개는 이 작업 이전부터 목록 밖에 있어 CI를 실패시키고 있었다.
- 새 테스트: `ProvenanceCollectorTest`(2), `PlanProvenanceCodecTest`(3, 1판 fixture 포함), `PlanProvenanceMaterialViewTest`(9), `PlanProvenanceCaptureTest` +2, `PlanProvenanceIntegrationTest` 15(재작성).

UI:

```
npx vitest run     # 30 files, 374 tests passed
npx eslint .       # 0 problems
npx vite build     # built
```

- `src/lib/planEvidence.test.js`(13): 부모/하위 4~5개 같은 자료 → 묶음 1개·액션 1개, 부모 미인용이면 자식을 끌어오지 않음, 제목 유사성으로 계층 안 만듦, 주차 불일치 시 통일 안 함, 프로젝트 여럿이면 제목 안 씀, 제목 같은 다른 자료 분리, 떨어진 위치 목록 보존("3쪽 · 9쪽 확인", "~" 없음), "2주차"는 페이지 아님, PDF/PPTX/삭제 라벨, 회차의 다른 자료 승격 안 함, 자료 없음/원본 없음, AI 판단 중복 제거.
- `src/views/plan/PlanProvenance.test.jsx`(20): 2클릭 원문 열기 후 제외·제목 유지, 개별 인용은 상세에만, 변경/삭제/PPTX/1판 표시, 자료 N개 더 보기, 자료 없음 vs 로딩 vs 실패(재시도), 일정·조건만 참고, 수정 전 근거 표식, E409_016 재계산, 적용 항목 캐시·version 갱신·재시도·열기 실패 후 무효화.

## 7. 실제 브라우저 확인 (합성 데이터, 2026-09-11)

환경: 앱 내장 브라우저 패널, viewport 1536×760 CSS px(`resize_window`), 사이드바·상단·우측 AI 패널 포함 기존 레이아웃. API 8081(bootRun, 작업 트리), UI 5174(`vite --mode claude`). 합성 계정 `plan-evidence-1789069838@example.com`(user_id 999000062, 이 검증 뒤에도 남겨 둠 — 정리 여부는 사용자 판단), 과목 1개(네트워크프로그래밍, 금 10~13 수업), 근무 2건, 합성 PDF 1개(`네트워크프로그래밍 2주차 소켓 프로그래밍 강의자료(합성).pdf`, 614바이트, 자료 id 693), 학습 항목 4개(부모 1 + 자식 3, 전부 자료 693 · "2주차")를 SQL로 넣음(분석 확정 LLM 호출 회피).

- **초안 생성은 실제 LLM 호출**(`POST /api/plans/draft`, gpt-5.6-luna, 1회). 4개 항목이 나왔고 모델이 실제 refId를 인용했다(버린 인용 0). 저장된 스냅샷은 `schemaVersion: 2`, 학습 항목 4줄 모두 `parentSourceId`(자식→부모 278)와 `material`(693, RECORDED, AVAILABLE, INLINE, "2주차")을 가졌고 promptLine에 파일명이 없다(`GET /api/plans/drafts/2597/provenance`로 확인).
- **클릭 수**: 계획 항목의 [근거 보기](1) → [원본 자료 열기](2). 기본 화면 텍스트(4번째 항목): "학습 범위 / 네트워크프로그래밍 · 2주차 / 네트워크와 소켓 프로그래밍 — TCP/IP 프로토콜의 개요, 소켓의 개념, 소켓의 특징과 구조 / 참고 자료 / …(합성).pdf · 2주차 확인 [원본 자료 열기] / AI의 제안 / 이번 주차 핵심 내용을 … / 예상 소요 시간 30분 · 보통 순위로 봄 / 자료의 사실이 아니라 AI가 그렇게 봤다는 뜻이에요 / [생성 당시 정보 자세히 보기]". 버튼은 그 둘뿐이다.
- **스크롤**: 기본 화면 `.plan-evidence-body` scrollHeight 289 = clientHeight 289, overflow-y visible — 내부 스크롤 없음, 760px 화면 안에 들어옴. 상세만 overflow auto(max-height 360px, 내용 454px).
- **원문 열기**: `GET /api/materials/693/file` → 200, `Content-Type: application/pdf`, `Content-Disposition: inline; filename*=UTF-8''…`, Authorization 헤더 경로(URL에 토큰 없음). 이 패널은 `window.open`으로 새 탭을 만들지 못해 코드가 내려받기 경로로 빠지므로 **새 탭에 PDF가 그려지는 것 자체는 여기서 확인하지 못했다**(기존 855163e 경로 그대로, MaterialFileLink.test로 탭 처리 검증).
- **상태 유지**: 열기 전에 1번 항목 체크 해제·제목 유지 → 열기 후 체크 상태 `[false,true,true,true]`, 제목 그대로, 근거 펼침 유지, 본문 스크롤 위치 유지(928px). 이어서 [계획 확정] → 3개 항목으로 확정됨(제외 반영).
- **적용된 항목**: 계획 화면·오늘 화면의 [근거 보기]가 같은 기본 화면을 보여줌(`GET /api/plans/items/{id}/provenance` 항목당 1회). 오늘 화면에서 [줄이기] 40→20분 → 다시 [근거 보기] → version이 올라 재요청, "적용 후 바뀜" 표식과 "적용한 뒤 분량을 줄였어요. 아래는 줄이기 전 제안의 근거예요." 표시.
- **글자·대비**: 본문 14px, 보조 문구 13px(기존 `.hint` 규칙). 배경 rgb(246,247,249) 대비 본문 16.45:1, 섹션 제목 5.68:1.
- 계획 화면에서 근거가 제목 줄을 밀어 제목이 세로로 부서지는 것을 발견해 CSS로 고쳤다(067f8f2 포함).
- 콘솔 오류: `POST …/schedule-preview` 500 1건 — 개발 모드 StrictMode의 이중 요청과 기존 `uq_ai_proposal_schedule_previews` 경합(2026-09-10 메모에 기록된 기존 결함), 이번 작업과 무관하고 고치지 않았다.
- 2클릭 목표는 사용성 기준 확인이며 사용자 실험이 아니다. "검증된 사용자 만족도"를 주장하지 않는다.

## 8. DB 검증

- 로컬 memo DB에서 `PlanProvenanceIntegrationTest` 실행 뒤 전용 사용자 행과 그 사용자의 제안·조각·계획·약속 0행.
- 실데이터 `course_topics.source_locator`는 271행 전부 "N주차" 계열이라 물리 페이지 정보가 없다 → 페이지 이동 미구현의 근거.
- `plan_provenance_json`은 longtext(JSON 별칭) 컬럼 그대로. 2판 JSON이 실제로 저장되고 1판 코드 없이 읽힘(위 브라우저 확인의 proposal 2597).

## 9. LLM 사용

- 화면 개선 자체에는 LLM 호출이 없다. 브라우저 확인의 초안 생성에만 실제 모델 1회 호출(gpt-5.6-luna). 자료 분석 확정(Material Agent)은 부르지 않고 학습 항목을 SQL로 넣었다.
- 생성 계약 변경(스냅샷 2판)은 캡처 테스트에서 outbound 프롬프트를 붙잡아 파일명·해시가 나가지 않음을 확인했고, 실호출 1회에서도 promptLine에 파일명이 없었다.

## 10. 최종 CI (푸시 직후 직접 조회)

- diary-api `b760133`: success — https://github.com/qlqb/diary-api/actions/runs/34523539688
- diary-ui `067f8f2`: success — https://github.com/qlqb/diary-ui/actions/runs/34523663544
