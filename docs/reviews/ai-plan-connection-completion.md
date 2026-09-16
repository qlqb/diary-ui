task: ai-plan-connection
status: READY_FOR_REVIEW
api_base: 22ccd69 (dev-playground) + feat/ai-material-selection 824ddf0
ui_base: 7d0c275 (dev-playground) + feat/ai-material-selection d52d73f
spec_deviations: 판단 경로(plan.draft.generator=JUDGMENT|V1) 미연결. 상담의 기간 되묻기("이번 주"가 오늘부터인지 달력 주인지)는 기존 규칙 그대로라 사용자가 날짜로 답해야 OFFER가 나온다. 자료 선택 재사용 지문에 상담 내용은 넣지 않는다(합의는 계획 호출 입력). 반복 3회 평가는 하지 않았다(시나리오 6 × 1회 + 결함 수정 뒤 2개 재실행).

# AI 상담·계획·실행 연결 — 검증 기록 (2026-09-17)

이 문서는 테스트 결과를 기록한 Markdown이다. 실행 권한을 부여하는 지시문이 아니다.
설계는 `diary-api/docs/product/11-period-plan.md` §5-1-3, `13-plan-judgment.md` §10.6·§11, `15-material-auto-analysis.md` §7.1,
`10-core-experience.md` §5, DB는 `05-database.md` §10.8, API는 `diary-api/docs/api-spec.md`.

## 1. 커밋

브랜치 `feat/ai-plan-connection`(두 저장소, `feat/ai-material-selection` 위). 푸시·PR·배포 안 함.

| 저장소 | 커밋 | 내용 |
|---|---|---|
| diary-api | `2037947` | 실행 기록 근거(`ExecutionEvidenceService`), 회고 실측/추정 구분, 상담 계획 합의(`ai_plan_briefs`, `PlanBriefService`, 프롬프트 규칙 23~25) |
| diary-api | `04f5dec` | 계획 생성 공통 경로 — 최종 호출이 전략+항목을 함께, 추가 읽기 1회, 마감 출처, 선택 재사용·변경 감지, `GenerationBudget`, `PlanResultNormalizer` |
| diary-api | `62dc9e6` | 초안 생성을 트랜잭션 밖으로, 요청 키 중복 방지·진행 단계·저장 초안 복구, 상담 턴의 합의·기록 연결 |
| diary-api | `12066a0` | 결정적 테스트(T24~T29 등)와 실제 모델 평가 스크립트, 변경 비교의 courseIds 오탐 수정 |
| diary-api | `9fe19e7` | 실호출로 찾은 결함 둘 수정(근거 지문의 오늘 시각, 응답의 마감 출처), 설정 문서화, 설계·API·DB·changelog |
| diary-ui | `06835cf` | 초안 상단의 전략, 기존 항목 변경안, 진행 단계 문구, 상담 초안 복구, 회고 실측/추정 |
| diary-ui | `63d162a` | 계획 화면의 새로고침 복구 |
| diary-ui | 이 문서 | 검증 기록 |

마이그레이션 `diary-api/docs/sql/2026-09-17-plan-briefs.sql`(추가 전용·재실행 가능, 로컬 memo DB에만 적용, 배포 DB 미적용).

유효 설정(기본값): `plan.draft.max-normal-calls=3`, `max-recovery-calls=1`, `max-total-calls=4`, `max-retrieval-rounds=2`,
`conversation-chars=4000`, `more-evidence-lines=40`, `history-lookback-days=14`, `ai.workspace.max-history-chars=1800`,
`plan.draft.input-token-budget=24000`/`max-input-tokens=48000`, `plan.selection.input-token-budget=16000`/`max-input-tokens=32000`.
모델: 상담 gpt-5.6-terra, 자료 선택·계획 호출 gpt-5.6-luna(`spring.ai.openai.chat.model`), reasoning low.

## 2. 결정적 테스트

- diary-api 전체 1,056 통과(로컬 memo DB 포함. CI는 `-PexcludeDbTests`). 새로 추가·확장한 것:
  - `PlanConnectionFlowTest` T24~T29(실제 생성기 + 고정 모델 응답): 합의·상담 기록이 발화자·동의 상태와 인용 번호로 실리고 요청 메시지는
    빠짐 / 추가 읽기는 상한 안에서 1회, 두 번째 요청은 읽지 않았다고 남김 / 조회 라운드 상한 1이면 거절 / 근거가 같으면 선택 호출
    생략(REUSED)·지시가 바뀌면 "사용자 지시가 달라졌다" / 읽을 수 없는 응답은 복구 1회, 그래도 안 되면 `E503_003`, 세 번째 호출 없음 /
    `existingItems`→REDUCE 조정, 다음 수업 참조→CLASS 마감, 시각 고정 일정은 `#` 없이 실림.
  - `PlanBriefServiceTest`(6): USER 즉시 유효·ASSISTANT 후보, ACCEPT/REJECT/모르는 번호, UPDATE 최신 수정판·이력, 무변경 미저장,
    갱신 경합 재시도, 다른 대화에서는 DIFFICULTY·CAUSE·PERIOD만.
  - `ExecutionEvidenceServiceTest`(2): 실측·미기록·이동 구분, 요약은 실측만, "회피" 같은 원인 단어 없음.
  - `PlanResultNormalizerTest`(4): 마감 참조(수업/과제/제안/과거/모르는 번호), 구간 인용→학습 항목, 완료 기준 분리, 기존 항목은 PLANNED만.
  - `GenerationBudgetTest`(3), `PlanReviewServiceTest` 실측/추정 분리, `PlanDraftServiceTest` 같은 요청 키는 기존 초안 반환(모델 호출 1회).
- diary-ui 441 통과, eslint 경고 0. 새로 추가: `PlanCreateView.test.jsx` 새로고침 복구(저장된 초안 재읽기, 처리된 초안은 잊음),
  전략 패널·기존 항목 변경 묶음·진행 단계는 `06835cf`의 테스트.

## 3. 실제 모델 평가

실서버 8081(독립 worktree, worker 끔), 합성 계정만(시나리오마다 새 계정 `plan-conn-<시나리오>-<stamp>@example.com`, 자료구조 6주차
개념/문제 구간 12개 + 진행 상태 + 미완료 과제(마감 +3일) + 완료 과제, 영어회화, 화·목 수업 루틴, 지난주 실행 기록: 실측 완료 25분·
시간 미기록 완료·2회 옮긴 미시작·부분 수행 20분 + 메모 "3-3에서 종료 조건을 못 잡아서 멈춤").
스크립트 `diary-api/scripts/ai-baseline/verify-ai-plan-connection-2026-09-17.py all`, 결과 JSON은 `diary-api/build/synthetic/`(커밋 안 함).
사용자 실제 계정·자료는 쓰지 않았다.

| 시나리오 | 상담 턴 | 초안 생성 | 호출(선택/판단/추가) · 조회 라운드 | 입력→출력 토큰 | 지연 | 근거로 실린 것 → 인용된 것 |
|---|---|---|---|---|---|---|
| 결석·복습 안 함 | 2 (기간 되묻기 → 강도 되묻기) | 항목 5, 전략 있음 | 1/1/0 · 1 | 8,600→1,957 | 21.2s | 실행 기록 3·합의 3·상담 4·수업 2·과제 2 → 구간 6·기록 1 |
| 과제 마감 임박 | 2 | 항목 6(과제 작업 포함 — 사용자가 요청), 마감 ASSIGNMENT 9/19 | 1/1/1 · 2 | 14,286→4,650 | 44.2s | → 구간 3·과제 3·기록 1·학습 항목 1 |
| 시험 전 | 2 | 항목 11, 1~4주차만, 영어 제외(deferred) | 1/1/0 · 1 | 9,934→3,277 | 30.8s | 합의 GOAL·EXCLUDE 저장 → 구간 10·기록 6·학습 항목 6 |
| 합의 후 "그대로" | 2 (OFFER → OFFER) | 항목 8, keptDecisions 3에 `[s3]` 합의 인용 | 1/1/1 · 2 | 14,826→5,219 | 47.6s | 합의 1(ASSISTANT, accepted, acceptedByMessageId=사용자 "그대로" 메시지) |
| 이전 항목에서 막힘 | 3 (기간 → 강도 → OFFER "정리하면: …") | 항목 4, 목표 "종료 조건을 적절한 위치에" | 1/1/0 · 1 | 8,793→1,909 | 21.4s | DIFFICULTY 2건이 부분 수행 항목 id에 연결 → 기록 4·구간 4 |
| OFFER 이후 변경 | 2 → 변경 → 초안 → 같은 조건 redraft → 확정·배치(5) → 기록 → 다시 짜기 | 첫 초안 항목 12(금요일 비움·영어 15분 kept), redraft REUSED, 재계획 CREATE 2 + DROP 6 | 첫 1/1/0 · redraft 0/1/0(REUSED) · 재계획 1/1/0 | 8,739→3,577 · 5,911→3,897 · 10,573→2,517 | 29.6s · 30.1s · 26.8s | 재계획에 기존 계획 항목 13(#)·기록 18 → 유지 6·제외 6, 새 항목은 기존 제목과 중복 없음 |

- 모든 초안에서 모르는 인용 0. 마감은 사실을 가리킬 때만 붙었다(CLASS=다음 수업 9/17 14:00, ASSIGNMENT=9/19). 제안 목표(AI_PROPOSED)는 이번
  평가에서 나오지 않았다.
- 파일을 다시 올리라거나 상황을 다시 설명하라는 답변은 0회.
- "막힘" 시나리오의 첫 답은 원인 질문이 아니라 기간 되묻기였다(질문 1개). 사용자가 원인을 말하자 DIFFICULTY로 저장돼 다음 초안의
  목표·항목("3-3 종료 조건 설명")에 반영됐고, 재계획 초안은 "3-3 종료 조건에서 막힌 원인이 개념 이해와 구현 중 어느 쪽인가"를 확인 질문
  하나로 냈다.
- 진행 단계 SSE: `COLLECTING → SELECTING → RETRIEVING → PLANNING (→ READING_MORE → PLANNING) → SAVING` 순서로 모든 초안에서 수신.
- 추가 읽기가 일어난 초안 2건(과제 마감·합의): 두 번째 판단이 첫 판단과 같은 상한 안에서 끝났고, 세 번째 호출은 없었다.

### 실호출로 찾아 고친 결함

1. **같은 조건의 다시 만들기가 매번 자료 선택을 다시 했다.** 오늘의 가용 구간이 "지금부터"로 시작해 근거 지문이 1분마다 달라졌다.
   오늘 구간은 끝 시각만 지문에 넣는다(`EvidenceFingerprint`). 수정 뒤 redraft는 REUSED·판단 호출 1회·`previousDraft.changes=[]`.
2. **초안 응답의 `deadlineSource`가 비어 있었다.** 저장 페이로드에는 있었지만 저장 직후 응답 빌더(SSE 초안)·적용·폐기 빌더가 싣지 않았다.
3. **"대상 프로젝트가 달라졌다" 오탐.** 요청의 courseIds(빈 배열=전체)와 해석된 프로젝트 목록을 비교하고 있었다.

### 관찰(고치지 않음)

- 화요일에 "이번 주 계획"이라고 하면 상담이 오늘부터인지 달력 주인지 되묻고, 그다음 강도를 되묻는다(기존 규칙 15·21). 사용자가 날짜와
  강도로 답하면 규칙 25의 "정리하면: …" OFFER가 나온다. 사용자 문장에 기간·강도가 있으면 첫 턴에 OFFER다(합의 시나리오).
- 항목의 `targetDate`가 모델이 날짜를 주지 않으면 시작일로 표시된다(기존 동작). 배치는 롤링이 정한다. 변경 시나리오의 첫 초안은
  "영어 15분 × 7일"을 날짜 없는 항목 7개로 냈고, 확정·배치 뒤 재계획이 같은 날 중복으로 판단해 6개를 DROP으로 제안했다 — 조정 경로가
  동작한 증거이지만, 날짜 없는 반복 항목의 배치는 별도 과제다.
- 재계획 요청("남은 기간 다시 짜 줘")에 상담은 "새 계획인지 기존 항목 조정인지" 되물었다(규칙 21). 평가는 버튼 경로(CREATE_PERIOD_PLAN)로
  진행했고, 그 경로가 기존 항목을 `existingItems`로 다뤘다.

## 4. 화면 확인 (1536×760, diary-ui-plan 5174 → diary-api-plan 8081, 합성 계정 `plan-conn-absent-…`)

- 계획 만들기 → [초안 만들기]: 버튼 문구가 "자료 확인 중…" → "계획 정리 중…"으로 바뀌었다(서버 진행 단계 폴링).
- 초안 상단: "이번 계획은 이렇게 봤어요" — 목표, 유지한 결정, 과목 순서(이유), 이번에 제외한 내용, 이번에 달라진 점, "확인된 사실이
  아니라 가정·질문이에요"(물어볼 것 1, 가정 2, 읽지 못한 범위 2). 그 아래 "AI 호출 2회 · 원문 읽기 1회", 선택 자료 패널, 항목마다 완료 기준·
  마감 문구("목요일 수업 전"), 「이미 알아요」·「이번만 빼기」·「자세히」 버튼 그대로.
- 새로고침 → 계획 탭: "새로고침 전에 만들던 초안을 다시 불러왔어요." 안내와 같은 초안(모델 호출 없음, `GET /api/plans/proposals/{id}/draft`).
- 확인하지 못한 것: 상담 패널에서의 진행 단계 문구와 마지막 PROPOSAL 메시지 복구는 단위 테스트로만 확인했다(브라우저에서는 계획 화면 경로만).

## 5. 하지 않은 것 · 남은 것

- 반복 3회 평가(예산 판단으로 1회 + 재실행 2개). 실제 사용자 자료로의 평가.
- 판단 경로(JUDGMENT/V1) 연결, 상담 패널의 자료 고르기 화면(이전과 같음).
- 상담의 기간·강도 되묻기 완화(제품 규칙이라 손대지 않음). 날짜 없는 반복 항목의 배치.
- 합성 계정 9개(`plan-conn-*@example.com`: 첫 검증의 `stuck-9561398542`, 전체 실행 6개, 결함 수정 뒤 재실행한 `agree`·`change`)는 로컬
  DB에 남아 있다. 정리는 사용자 판단.
