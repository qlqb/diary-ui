# 프로젝트 상담 작업 공간 — API 계약 (2026-09-19)

`feat/project-consult-workspace`의 UI가 기대하는 서버 계약. 서버(`diary-api` 같은 브랜치)가 이 모양으로 구현한다.
모든 추가 필드는 **없을 수 있다** — 예전 초안·예전 대화에서는 null/빈 목록이고 화면은 있는 것만 그린다.
사용자에게 보이는 말에서 관리 단위는 "프로젝트"다. `courseId` 같은 식별자 이름은 바꾸지 않는다.

## 1. 계획 초안 (`PlanDraftResponse`) — 이미 구현됨(API 1d992d3)

- `proposedMinutes: number|null` — 빼지 않은 항목의 예상 시간 합. **첫 화면의 분량은 이 값이다.**
- `targetMinutes` — 예산(상한). 채워야 할 목표가 아니다. "학습 목표 N분"이라고 단정해 보여 주지 않는다. 제안량이 예산보다
  작다고 미달률을 강조하지 않는다.
- `availabilityBasis: "ALL_ASSUMED" | "PARTLY_ASSUMED" | "CONFIRMED" | "NONE"` — ALL_ASSUMED면 "등록된 일정이 없어 가능한
  시간은 가정이에요. 배치는 임시예요"를 첫 화면에 보인다.
- `strategy.projects: ProjectOutcome[]` — 대상 프로젝트가 모두 정확히 한 번.
  ```
  { courseId, courseTitle,
    disposition: "INCLUDED" | "EXCLUDED_BY_CHOICE" | "UNDECIDED" | "NOT_REVIEWED",
    reason, decidedBy: "MODEL" | "SERVER",
    materialState: "NO_MATERIAL" | "ANALYSIS_PENDING" | "NO_RELEVANT_CONTENT" | "NOT_LISTED" | "OUTLINE_ONLY"
                 | "RETRIEVAL_FAILED" | "TEXT_DELIVERED",
    candidates, shown (null = 선택 재사용), selected, delivered, itemCount, itemMinutes, sectionIds: number[],
    nextAction: "ANSWER_QUESTION" | "UPLOAD_MATERIAL" | "WAIT_ANALYSIS" | "RETRY_ANALYSIS" | "NARROW_SCOPE" | "REVIEW_LATER" | null }
  ```
  NOT_REVIEWED를 "미룸/제외"로 표시하지 않는다. 색만으로 구분하지 않는다(글자 라벨 필수).
- 항목 근거(`GET /plans/drafts/{id}/provenance` 의 항목별 evidence, 그리고 제안 항목 응답의 `evidence`)에
  `origin: "SOURCE_TASK" | "AI_PRACTICE" | "USER_REQUEST" | null`.
  라벨: 자료에 있는 과제·실습 / AI가 만든 추가 연습 / 내가 요청한 준비 작업. null이면 표시하지 않는다.
  초안 응답의 각 항목(`proposal.items[]`)에도 같은 `origin`과 `selectionReason`(왜 지금 하는지 — 모델의 한 문장)이 붙는다.
  "꼭" 항목은 이 이유를 함께 보여 준다.
- `freshness: { state: "CURRENT" | "STALE", reasons: string[] } | null` — STALE이면 "이 초안은 최신 답변을 반영하기 전
  버전이에요"와 [다시 만들기]를 보인다. 갱신 중에는 이전 버전임을 표시한다.
- 다시 만들기 `POST /plans/proposals/{id}/redraft` 응답에 `carriedEdits: [{ title, fields: string[] }]`,
  `editConflicts: [{ title, field, yours, suggested }]` — 사용자가 직접 고친 값은 새 초안에 그대로 옮겨진다. 충돌은
  비교해서 고를 수 있게 보여 준다(기본은 사용자 값 유지).

## 2. 상담 턴 (SSE `message.completed` payload와 `GET /ai/conversations/{id}/messages`의 각 ASSISTANT 메시지)

```
consult: {
  question: { id, text, why: string|null,
              topic: "SUPPORT_LEVEL"|"BLOCKER"|"TIME"|"SCOPE"|"DEPTH"|"SUBMISSION"|"OTHER",
              choices: [{ id, label }], multiSelect: boolean } | null,
  understanding: [{ id: string, source: "MEMORY"|"BRIEF", text,
                    evidenceType: "STATED"|"SELF_REPORT"|"OBSERVED"|"INFERRED",
                    scopeLabel: string|null, isNew: boolean }],
  direction: { before: string|null, after: string, reason: string|null, affectsDraft: boolean } | null,
  activity: { kind: "SELF_CHECK", courseId, title, items: [{ key, label, topicId|null, sectionId|null }] } | null
} | null
```

- 질문 카드: `why`가 있을 때만 짧게 설명. 선택지는 제안일 뿐 — 항상 자유 입력, "둘 다 아님", "잘 모르겠어",
  "이 질문 건너뛰기", "지금까지 얘기로 계획해줘", "나중에 이어하기"가 가능하다. `multiSelect`면 여러 개 고른 뒤 보낸다.
- 답 보내기는 기존 `POST /ai/conversations/{id}/messages`(SSE) 그대로. 본문에 선택적으로
  `answer: { questionId, choiceIds: string[], skipped: boolean }`. `content`가 비면 서버가 선택지 라벨로 사용자 발화를 만든다.
  선택 답과 자유 답은 같은 경로다(둘 다 대화 기록에 남고 고칠 수 있다).
- "지금까지 얘기로 계획해줘" = `requestedAction: "PLAN_NOW"` — 서버는 남은 질문을 가정으로 돌리고 OFFER를 낸다.
- `understanding`은 중요한 해석이 생겼을 때만 온다. 각 줄에 [조금 달라요] → 인라인 편집 → §3 PATCH.
- `direction`은 "이번 답변으로 바뀐 방향"이다. 아직 확인하지 않은 파일·문제 조건은 서버가 넣지 않는다.
  `affectsDraft`가 true이고 열린 초안이 있으면 그 초안을 STALE로 표시한다.
- 기존 `quickReplies: string[]`는 호환용으로 남는다(`consult.question`이 있으면 그쪽이 우선).

## 3. AI가 이해한 내 상황 (`/api/contexts`)

- `GET /api/contexts` → `[{ contextId, content, status: "ACTIVE"|"STALE", evidenceType, courseId|null, courseTitle|null,
  scopeStart|null, scopeEnd|null, sourceMessageId|null, confirmedAt, updatedAt }]`
  evidenceType 라벨: STATED=내가 말한 것 / SELF_REPORT=내 자기평가 / OBSERVED=실행 기록에서 확인 / INFERRED=AI 추정(확인 전).
- `PATCH /api/contexts/{id}` `{ content }` → 고친 새 항목(이전 것은 SUPERSEDED). 사용자가 고친 것은 evidenceType=STATED.
- `POST /api/contexts/{id}/confirm` → INFERRED를 STATED로.
- `DELETE /api/contexts/{id}` → 철회(WITHDRAWN). 다시 저장되지 않는다.
- 세 변경 모두 응답에 `staleDraftIds: number[]` — 영향받는 열린 초안. 적용된 일정은 바뀌지 않는다.
- 필드명을 개발 용어로 노출하지 않는다.

## 4. 학습 지도 `GET /api/courses/{courseId}/learning-map`

```
{ courseId, title, treeVersion,
  state: { materials, analysisPending, analysisFailed, linkWaiting, openProposals, topics, hasRecords },
  topics: [ { topicId, parentTopicId, title, progressStatus, userMark, selfCheck: "KNOW"|"UNSURE"|"NEW"|null,
              materials: [{ materialId, filename, sectionId|null, locator|null }],
              plannedItems, doneItems, children: [...] } ],
  proposed: [ { proposalId, materialId, filename, summary,
                nodes: [{ tempId, title, parentTempId|null, parentTopicId|null, op: "ADD"|"LINK"|"RENAME"|"MOVE"|"MERGE"|"SPLIT",
                          sections: [{ sectionId, title, locator }] }] } ],
  unlinked: [ { materialId, filename, analysisState, sections: [{ sectionId, title, locator, roles: string[] }] } ],
  weeks: [ { label, basis: "MATERIAL_LABEL"|"DATE_CANDIDATE", confirmed: false,
             materialIds: number[], sectionIds: number[], topicIds: number[] } ] }
```

- `proposed`는 **승인 전 자동 분석 제안**이다. 읽기 전용, "자동 분석 제안(승인 전)" 라벨. 학습 항목처럼 진도를 표시하지 않는다.
- `weeks`가 비면 주차 보기 탭을 숨긴다. `confirmed:false`면 "자료에 적힌 주차 — 실제 수업 진행과 다를 수 있어요".
- 다섯 상태를 구분한다: 자료 없음 / 구조 제안 대기 / 분석 대기 / 분석 실패 / 학습 기록 없음.

## 5. 자료 분석 상태 `GET /api/materials/analysis/overview`

추가: `limit: { contentUsed, contentLimit, linkUsed, linkLimit, reached: boolean, resumesAt: ISO|null }`,
각 material에 `waitingReason: "DAILY_LIMIT"|"QUEUED"|"PAUSED"|"SERVICE_UNAVAILABLE"|null`, `linkState: string|null`.
DAILY_LIMIT이면 "오늘 분석 한도에 닿아 대기 중이에요. {resumesAt}부터 이어서 처리해요" — 실패나 영구 정지처럼 보이지 않게.
업로드 허용 확장자에 `sh` 추가("실행하지 않는 텍스트 자료로 읽어요").

## 6. 실행 기록

`POST /execution-items/{id}/partial|complete`, 못 했음 기록에 선택 필드 `blockerKind: "TIME"|"CONCEPT"|"ENERGY"|"OTHER"`.
화면 문구: 시간이 없었어 / 개념에서 막혔어 / 컨디션이 안 좋았어 / 다른 이유. 필수 아님. 미완료를 비난하지 않는다.
`actualMinutes`는 사용자가 적은 값이다 — 화면·근거에서 "측정"이 아니라 "내가 적은 시간"으로 부른다. 없으면 "시간 미기록".

## 7. 점검 활동(선택) `POST /api/courses/{courseId}/self-checks`

`{ items: [{ key, label, topicId|null, sectionId|null, level: "KNOW"|"UNSURE"|"NEW", note|null }] }` → 204.
자기평가로 저장된다(숙달·완료가 아니다). 다음 상담·재생성 입력에 들어간다. 필수 진단시험이 아니다 — 건너뛸 수 있다.
