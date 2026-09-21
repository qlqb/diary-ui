# 프로젝트별 자료 정리 · 업로드 묶음 — 화면 완료 기록 (2026-09-21)

서버 쪽 설계·검증은 diary-api `docs/handoff/project-tidy-2026-09-21.md`,
계약은 `docs/product/15-material-auto-analysis.md` §11·§12와 `api-spec.md`.
브랜치 `feat/project-tidy`(diary-ui `a597a2e` 위).

## 1. 무엇이 달라졌나

| 전 | 후 |
|---|---|
| 파일을 고르면 바로 올라갔다. 몇 분 걸릴지 알 수 없었다 | 목록·크기·예상 분석 시간 범위를 먼저 보여주고 [N개 분석 시작] |
| 올린 뒤 자료함 목록의 칩으로 짐작 | 묶음 진행 카드: 처리 진행률, 자리별 단계, 남은 시간, [새 자료 추가] |
| 분석 중 더 올리면 진행률이 뒤로 갔다 | 새 묶음이 따로 생긴다. 앞 묶음의 분모는 고정 |
| 자료 줄에 "구조 제안(연결)" 단계가 늘 있었다 | 단계는 셋(등록·텍스트 추출·내용 분석). 정리는 누를 때만 |
| 자료마다 변경안 카드 | 프로젝트 하나의 정리안. 변경을 **영향을 받는 항목**으로 묶어 보여준다 |
| 적용 시 배열 순번으로 선택 전달 | 안정적인 `changeId`. 제목 수정·제외는 서버에 저장되어 새로고침해도 남는다 |

## 2. 화면이 지키는 것

1. **진행률·남은 시간을 화면에서 만들지 않는다.** 전부 서버가 준 값을 문장으로 바꿀 뿐이다
   (`src/lib/analysisBatch.js`). 브라우저 타이머로 올리면 실제로는 멈췄는데 화면만 차오르고,
   탭을 옮기면 그 숫자가 사라진다.
2. **100%는 "처리 종료"이지 "전부 성공"이 아니다.** 끝난 묶음의 문장이 성공/실패/제외를 나눠 말한다.
3. **저장 실패를 삼키지 않는다.** 검토 편집 자동 저장이 실패하면 그 자리에서 말하고 적용을 막는다.
   다른 탭이 먼저 고쳤으면(409) 고친 것을 버리지 않고 최신을 읽어 올린 뒤 알린다.
4. **정리안을 숨기지 않는다.** 트리가 바뀌었으면 내용은 그대로 보이고 적용만 막으며 [다시 정리]를 준다.
5. **라우트를 가로채지 않는다.** 검토할 정리안이 있어도 학습 지도·다른 탭으로 자유롭게 간다
   (`ProjectWorkspaceLearningMap.test.jsx`에 회귀 테스트).
6. **색만으로 상태를 말하지 않는다.** 모든 단계·사유에 글자가 함께 있다. 본문 13.5px 이상,
   보조 문구 12px 이상.

## 3. 새 파일

| 파일 | 역할 |
|---|---|
| `src/lib/analysisBatch.js` | 묶음 문구·시간 표기. 순수 함수 |
| `src/lib/tidyLabels.js` | 정리안 문구, 선택 의존성 뒤집기 |
| `src/views/materials/useAnalysisBatches.js` | 묶음 만들기·순차 업로드·폴링·복원 |
| `src/views/materials/useUploadEstimate.js` | 고르는 동안의 예상 시간(디바운스) |
| `src/views/materials/AnalysisBatchCard.jsx` | 묶음 진행 카드 |
| `src/views/projects/ProjectTidyPanel.jsx` | 요청·검토·적용·버리기 |
| `src/styles/project-tidy.css` | 1536×760 기준. 긴 목록만 내부 스크롤 |
| `src/testing/fakeAnalysisBatch.js` | 화면 테스트용 가짜 묶음 API |

지운 것: `src/views/projects/TopicChangeProposalCard.jsx`(+테스트) — 자료별 변경안 카드.
`topicChangeProposalAPI`는 이력 조회용으로 남겨 두었지만 화면에서 쓰지 않는다.

## 4. 레이아웃 (1536×760)

- 정리안 묶음 목록은 `max-height: 340px` 안에서 스크롤한다. 요약과 [선택한 변경 적용]·[나중에]·
  [버리기]는 언제나 보인다 — 항목이 많은 프로젝트에서 액션이 화면 밖으로 나가면 안 된다.
- 묶음 진행 카드의 자리 목록도 `max-height: 232px`. 자료 20개를 올려도 카드가 화면을 삼키지 않는다.
- 실제 화면에서 확인한 목록은 handoff §4.6.

## 5. 테스트

| 파일 | 건수 |
|---|---|
| `src/views/projects/ProjectTidyPanel.test.jsx` | 22 |
| `src/views/materials/AnalysisBatchCard.test.jsx` | 8 |
| `src/views/materials/MaterialsViewBatch.test.jsx` | 5 |
| `src/lib/analysisBatch.test.js` | 14 |
| `src/lib/tidyLabels.test.js` | 10 |

전체 633건 통과, lint 0, build 성공.

`vite.config.js`의 `testTimeout`을 15초로 올렸다. 작업 중 이 스위트를 API 스위트·개발 서버와 같은
머신에서 동시에 돌리면 회차마다 다른 테스트가 1~2건씩 시간을 넘겼다 — 기계가 조용하면 전부
통과한다. 느린 것을 통과시키려는 값이 아니라 부하에 따라 결과가 달라지는 것을 줄이려는 값이다.

## 6. 남은 것

- "분석 중" 중간 상태를 실제 브라우저에서 보지 못했다 — 합성 자료가 작아 5초 안에 끝났다.
  단위 테스트로만 확인했다.
- 한도 대기·부분 정리·판 교체(편집 승계의 "확인 필요") 화면도 단위 테스트로만 봤다.
- ZIP 가져오기는 묶음에 들어가지 않는다. 안에서 꺼낸 자료는 각자 분석되지만 진행 카드에 보이지 않는다.
