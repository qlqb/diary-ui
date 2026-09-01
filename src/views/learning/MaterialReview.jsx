/**
 * Material Agent 분석 draft 편집 화면.
 *
 * 흐름: AI 분석(DRAFT) -> 편집 가능한 초안(이 화면) -> 사용자 수정 -> 적용 -> course_topics 확정.
 * 적용 전에는 어떤 조작도 course_topics를 바꾸지 않는다 — materialAnalysisAPI.edit는 DRAFT의
 * editedJson만 갱신하고, apply를 눌러야만 확정된다.
 *
 * provenance 규칙: 사용자가 새로 추가한 항목은 원문 근거가 없으므로 항상 AI_DERIVED로 만든다.
 * 기존 SOURCE 항목의 제목을 고쳐도 sourceType은 그대로 둔다 — "제목을 다듬었다"와 "근거가
 * 없어졌다"는 다른 일이다.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { materialAnalysisAPI } from '../../api/api.js';
import { MaterialAnalysisStatus, COURSE_NOTE_CATEGORY_LABEL } from '../../types/learning.js';

const NOTE_CATEGORY_ORDER = ['COURSE_INFO', 'ASSESSMENT'];

let localIdSeq = 0;
const nextLocalId = () => `local-${++localIdSeq}`;

function cloneWithLocalIds(node) {
  return {
    ...node,
    _localId: nextLocalId(),
    children: (node.children ?? []).map(cloneWithLocalIds),
  };
}

function stripLocalIds(node) {
  const { _localId, children, ...rest } = node;
  return { ...rest, children: (children ?? []).map(stripLocalIds) };
}

function updateNode(nodes, localId, updater) {
  return nodes.map((node) => {
    if (node._localId === localId) return updater(node);
    if (node.children?.length) {
      return { ...node, children: updateNode(node.children, localId, updater) };
    }
    return node;
  });
}

function removeNode(nodes, localId) {
  return nodes
    .filter((node) => node._localId !== localId)
    .map((node) => ({ ...node, children: removeNode(node.children ?? [], localId) }));
}

function addChild(nodes, parentLocalId) {
  const newNode = { _localId: nextLocalId(), title: '', sourceType: 'AI_DERIVED', sourceLocator: null, children: [] };
  if (parentLocalId === null) return [...nodes, newNode];
  return nodes.map((node) => {
    if (node._localId === parentLocalId) {
      return { ...node, children: [...(node.children ?? []), newNode] };
    }
    if (node.children?.length) {
      return { ...node, children: addChild(node.children, parentLocalId) };
    }
    return node;
  });
}

const COURSE_FIELD_LABELS = [
  ['textbookTitle', '교재명'],
  ['textbookAuthor', '저자'],
  ['textbookPublisher', '출판사'],
  ['textbookIsbn', 'ISBN'],
];

export default function MaterialReview({ analysis, onApplied, onDismiss }) {
  const [courseFields, setCourseFields] = useState(analysis.payload?.courseFields ?? {});
  const [topics, setTopics] = useState((analysis.payload?.topics ?? []).map(cloneWithLocalIds));
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  /*
   * 기본은 접힘이다.
   *
   * 펼친 채로 두면 교재 4필드 + 과목 정보 + 학습 내용 수십 항목이 프로젝트 화면 한가운데
   * 통째로 들어가, 학습 상태도 계획도 화면 밖으로 밀린다. 자료를 둘 연결하고 둘 다 분석하면
   * 그게 두 벌 쌓인다.
   *
   * 접혀 있어도 헤더에 항목 수가 남는다 — "무엇이 얼마나 나왔는지"는 펼치지 않아도 보여야
   * 하고, 그게 없으면 접기는 그냥 숨기기가 된다.
   *
   * 아래 조기 반환보다 위에 있어야 한다. 훅은 렌더마다 같은 순서로 불려야 한다.
   */
  const [open, setOpen] = useState(false);

  if (analysis.status === MaterialAnalysisStatus.FAILED || !analysis.payload) {
    return (
      <p className="learning-error">
        분석에 실패했어요: {analysis.failureReason || '알 수 없는 오류'}
      </p>
    );
  }

  const hasTopics = topics.length > 0;

  const courseNotes = analysis.payload.courseNotes ?? [];

  const hasCourseFields = COURSE_FIELD_LABELS.some(([key]) => {
    const value = courseFields[key];
    return value != null && String(value).trim() !== '';
  });

  /*
   * 적용할 것이 하나라도 있으면 적용할 수 있다.
   *
   * 전에는 topics만 봤다. 그런데 강의계획서에 주차별 토픽이 없는 것은 드문 일이 아니고
   * (이 화면의 요약이 "주차별/주제별 학습 토픽은 제공되지 않습니다"라고 말하는 바로 그
   * 경우다), 그때도 교재 정보와 과목 정보는 멀쩡히 뽑혀 있다.
   *
   * 서버 apply는 이미 그 상태를 정상 처리한다 — topics가 비면 건너뛰고 교재 정보와
   * courseNotes는 그대로 저장한다. 화면만 막고 있었던 셈이라, "과목 정보 6건"이라고 써
   * 놓고 그 6건을 적용할 방법을 주지 않았다. 남는 선택은 폐기뿐이고 그건 제대로 뽑힌
   * 사실을 버리는 것이다.
   */
  const hasAnythingToApply = hasTopics || courseNotes.length > 0 || hasCourseFields;

  const buildPayload = () => ({
    summary: analysis.payload.summary,
    courseFields,
    // 과목 정보/평가 정보는 이 화면에서 편집하지 않는다 — 받은 그대로 유지해서 apply 시 함께 저장한다.
    courseNotes,
    keyDates: analysis.payload.keyDates ?? [],
    topics: topics.map(stripLocalIds),
  });

  const handleApply = async () => {
    setApplying(true);
    setError(null);
    try {
      // 수정 내용을 먼저 저장한 뒤 적용한다 — "저장을 깜빡해서 옛 버전이 적용되는" 실수를 없앤다.
      await materialAnalysisAPI.edit(analysis.analysisId, buildPayload());
      await materialAnalysisAPI.apply(analysis.analysisId);
      await onApplied?.();
    } catch (err) {
      setError(err.message || '적용에 실패했습니다.');
    } finally {
      setApplying(false);
    }
  };

  const topicCount = countNodes(topics);

  return (
    <div className="learning-analysis-review material-review">
      <div className="material-review-head">
        <button
          type="button"
          className="material-review-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="material-review-head-title">구조 분석 결과</span>
          <span className="material-review-head-count">
            학습 내용 {topicCount}개 · 과목 정보 {courseNotes.length}건
          </span>
        </button>
        <div className="material-review-head-actions">
          {/*
            잠겼으면 왜 잠겼는지 그 자리에서 말한다. 눌러도 아무 일이 없는 버튼은 사용자가
            앱이 고장났다고 읽는다 — 실제로 그렇게 보고받았다.
          */}
          {!hasAnythingToApply && (
            <span className="material-review-head-count">적용할 내용이 없어요</span>
          )}
          <button type="button" className="v6-btn-small" onClick={handleApply}
            disabled={applying || !hasAnythingToApply}>
            {applying ? '적용 중...' : '검토 완료 — 적용'}
          </button>
          <button type="button" className="v6-btn-small" onClick={() => onDismiss?.()} disabled={applying}>
            폐기
          </button>
        </div>
      </div>

      <p className="v6-section-desc">{analysis.payload.summary}</p>
      {error && <p className="learning-error">{error}</p>}

      {!open ? null : (
      <div className="material-review-body">
      <div className="material-review-fields">
        {COURSE_FIELD_LABELS.map(([key, label]) => (
          <label key={key} className="material-review-field-row">
            <span>{label}</span>
            <input
              type="text"
              className="learning-input material-review-input"
              value={courseFields?.[key] ?? ''}
              onChange={(e) => setCourseFields((prev) => ({ ...prev, [key]: e.target.value || null }))}
              placeholder="미확인"
            />
          </label>
        ))}
      </div>

      {courseNotes.length > 0 && (
        <div className="material-review-notes">
          {NOTE_CATEGORY_ORDER.map((cat) => {
            const items = courseNotes.filter((n) => n.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} className="material-review-notes-group">
                <h4 className="material-review-notes-title">{COURSE_NOTE_CATEGORY_LABEL[cat]}</h4>
                <ul className="course-notes-list">
                  {items.map((n, i) => (
                    <li key={i}>
                      <span className="course-notes-label">{n.label}</span>
                      <span className="course-notes-detail">{n.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <h4 className="material-review-notes-title">학습 내용</h4>
      {/*
        학습 내용이 0개인 것은 실패가 아니다.
        - 강의계획서에 주차별 목차가 없는 경우
        - 이 자료의 내용이 이미 확정된 학습 구조에 다 들어 있는 경우
        둘 다 정상이고, 화면은 이 둘을 구분할 방법이 없다(payload에 남는 것은 topics: []뿐이다).

        전에는 빨간 오류 상자로 "교재 목차 자료를 올려주세요"라고 시켰다. 두 가지가 잘못됐다.
        첫째, 정상적인 결과를 고장처럼 보이게 했다. 둘째, 알 수 없는 것을 단정하고 행동까지
        지시했다 — 이미 다 들어 있어서 비어 있는 경우에는 그 지시가 틀렸고, 그대로 따르면
        자료를 또 올리고 그 자료에 "구조 분석" 버튼이 또 생기는 고리에 들어간다. 실제로
        그렇게 보고받았다.

        이유는 바로 위 요약(payload.summary)이 이미 말하고 있다. 여기서는 사실만 적는다.
      */}
      {!hasTopics ? (
        <p className="view-dim">이 자료에서 새로 추가할 학습 내용은 없어요.</p>
      ) : (
        <ul className="learning-topic-preview material-review-tree">
          {topics.map((node) => (
            <MaterialReviewNode
              key={node._localId}
              node={node}
              depth={0}
              onChangeTitle={(localId, title) =>
                setTopics((prev) => updateNode(prev, localId, (n) => ({ ...n, title })))
              }
              onRemove={(localId) => setTopics((prev) => removeNode(prev, localId))}
              onAddChild={(localId) => setTopics((prev) => addChild(prev, localId))}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        className="v6-btn-small material-review-add-root"
        onClick={() => setTopics((prev) => addChild(prev, null))}
      >
        <Plus size={13} /> 최상위 항목 추가
      </button>

      </div>
      )}
    </div>
  );
}

/** 트리 전체의 항목 수. 접힌 헤더가 "얼마나 나왔는지"를 말하는 데 쓴다. */
function countNodes(nodes) {
  return (nodes ?? []).reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}

function MaterialReviewNode({ node, depth, onChangeTitle, onRemove, onAddChild }) {
  return (
    <li style={{ marginLeft: depth * 16 }} className="material-review-node">
      <div className="material-review-topic-row">
        <input
          type="text"
          className="learning-input material-review-input material-review-title-input"
          value={node.title}
          onChange={(e) => onChangeTitle(node._localId, e.target.value)}
          placeholder="항목 제목"
        />
        <span className={`learning-badge learning-badge-${node.sourceType === 'SOURCE' ? 'source' : 'derived'}`}>
          {node.sourceType === 'SOURCE' ? '원문 근거' : 'AI 세분화'}
        </span>
        <button
          type="button"
          className="learning-icon-btn"
          onClick={() => onAddChild(node._localId)}
          title="하위 항목 추가"
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          className="learning-icon-btn material-review-remove-btn"
          onClick={() => onRemove(node._localId)}
          title="이 항목 제거"
        >
          <X size={14} />
        </button>
      </div>
      {node.children?.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <MaterialReviewNode
              key={child._localId}
              node={child}
              depth={depth + 1}
              onChangeTitle={onChangeTitle}
              onRemove={onRemove}
              onAddChild={onAddChild}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
