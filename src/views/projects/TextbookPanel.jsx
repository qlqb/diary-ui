/**
 * 프로젝트 교재 — 어느 책인가(서지)와 그 책이 다루는 범위(목차).
 *
 * 강의계획서만 올려도 서버가 그 안의 교재 이름으로 웹(지원 서점의 상품 페이지)에서 책·판·목차를 찾는다. 이 구역은
 * 그 진행과 결과를 보여 주고, 사용자가 확인·정정할 길을 준다. 상태의 원본은 서버다 — 화면을 닫거나 새로고침해도 이어진다.
 *
 * 화면이 지키는 것:
 *  - "강의계획서에 적힌 교재"(후보)와 "지금 쓰는 교재"를 따로 보인다. 찾은 책을 조용히 지금 교재로 정하지 않는다.
 *  - 같은 제목의 판이 여럿이면 차이(발행일·ISBN·목차가 같은지)만 좁혀 보여 주고 고르게 한다.
 *  - 찾는 중 / 찾음 / 판 확인 필요 / 책은 있으나 목차 없음 / 못 찾음 / 접속 실패 / 처리 실패를 글자로 구분한다(아이콘만 쓰지 않는다).
 *  - 못 찾았을 때만 상황에 맞는 대안 하나씩(다시 찾기·ISBN/판 적기·링크로 찾기·목차 사진·PDF 올리기).
 *  - 교재를 고칠 때는 화면이 본 교재 판을 함께 보낸다 — 그 사이 다른 곳에서 바뀌었으면 서버가 409로 멈추고 여기서 다시 읽는다.
 *  - 목차가 없어도 계획·학습은 그대로 된다고 함께 말한다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, ExternalLink, Loader2, RotateCcw } from 'lucide-react';
import { courseAPI, textbookAPI } from '../../api/api.js';

import '../../styles/learning-flow.css';
import { countBelow, tocTree } from '../../lib/tocTree.js';

const FIELD_LABEL = { title: '제목', author: '저자', publisher: '출판사', isbn: 'ISBN', edition: '판' };
const SOURCE_LABEL = { USER: '직접 적음', MATERIAL: '자료에서 찾아 적용함', WEB: '웹에서 판을 확인함' };
const ROLE_LABEL = { MAIN: '주교재', SUPPLEMENT: '부교재', REFERENCE: '참고', UNKNOWN: '교재' };
const SITE_LABEL = { yes24: '예스24', aladin: '알라딘', kyobo: '교보문고', other: '웹 페이지' };
const COVERAGE_LABEL = {
  PAGE_FULL: '페이지에 실린 목차 전체',
  PARTIAL: '목차 일부만',
  UNKNOWN: '목차 범위 확인 못 함',
  NONE: '목차 없음',
};
/** 조회 상태 → 사람이 읽는 말. 아이콘 없이도 상태가 읽혀야 한다. */
const LOOKUP_LABEL = {
  QUEUED: '찾는 중',
  RUNNING: '찾는 중',
  FOUND: '책과 목차를 찾았어요',
  NEEDS_CHOICE: '판 확인 필요',
  BOOK_NO_TOC: '책은 찾았지만 목차 없음',
  NOT_FOUND: '맞는 책을 찾지 못함',
  ACCESS_FAILED: '페이지에 접속하지 못함',
  FAILED: '처리하지 못함',
  CLUE_CONFLICT: '주교재가 여럿',
};
const POLL_MS = 3000;

const isSearching = (lookup) => lookup && (lookup.status === 'QUEUED' || lookup.status === 'RUNNING');

export default function TextbookPanel({ courseId, refreshToken = 0, onChanged, onLookupSettled }) {
  const [review, setReview] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState({});
  const [tocOpen, setTocOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const ticket = useRef(0);
  const wasSearching = useRef(false);

  const load = useCallback(async () => {
    if (!textbookAPI?.get) return;
    const mine = ++ticket.current;
    try {
      const next = await textbookAPI.get(courseId);
      if (mine !== ticket.current) return; // 늦게 도착한 옛 응답은 버린다
      setReview(next);
      setError(null);
      // 지금 값과 다른 칸만 기본 선택. 지금 값이 있는 칸은 사용자가 직접 골라야 한다(조용히 덮지 않는다).
      const initial = {};
      (next?.candidates ?? []).forEach((c) => c.fields.forEach((f) => {
        if (!f.same && !f.current) initial[`${c.materialId}:${f.field}`] = true;
      }));
      setPicked(initial);
    } catch (err) {
      if (mine !== ticket.current) return;
      setError(err.message || '교재 정보를 불러오지 못했어요.');
    }
  }, [courseId]);

  useEffect(() => { load(); }, [load, refreshToken]);

  // 찾는 중이면 서버를 다시 본다. 끝나면 알린다(목차를 찾았으면 서버가 정리안을 만들기 시작한다 — 정리 구역이 다시 읽게).
  const searching = isSearching(review?.lookup);
  useEffect(() => {
    if (!searching) {
      if (wasSearching.current) {
        wasSearching.current = false;
        onLookupSettled?.();
      }
      return undefined;
    }
    wasSearching.current = true;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [searching, load, onLookupSettled]);

  if (!review && !error) return null;

  const current = review?.current ?? {};
  const version = current.version ?? 0;
  const currentLine = ['title', 'author', 'publisher', 'edition'].map((k) => current[k]).filter(Boolean).join(' · ');

  /** 바꾸는 요청 하나. 실패하면 지금 값을 다시 읽은 뒤에 이유를 보인다(다시 읽기가 오류 문구를 지우지 않게). */
  const act = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      // 교재 구역 응답(current가 있는 것)만 그대로 쓴다. 다른 응답(프로젝트 수정 등)이면 다시 읽는다.
      if (next && next.current !== undefined && next.lookup !== undefined) setReview(next);
      else await load();
      await onChanged?.();
      return true;
    } catch (err) {
      await load();
      setError(err.message || '처리하지 못했어요.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const applyFrom = (candidate) => {
    const values = {};
    const expected = {};
    candidate.fields.forEach((f) => {
      if (picked[`${candidate.materialId}:${f.field}`]) {
        values[f.field] = f.value;
        expected[f.field] = f.current ?? null;
      }
    });
    if (Object.keys(values).length === 0) return;
    act(() => textbookAPI.apply(courseId, { materialId: candidate.materialId, values, expected, expectedVersion: version }))
      .then((ok) => ok && setPicked({}));
  };

  const lookup = review?.lookup;
  const toc = review?.toc;
  const syllabus = review?.syllabusClues ?? [];

  return (
    <section className="view-section textbook-panel" aria-label="교재">
      <h2 className="section-title"><BookOpen size={15} /> 교재</h2>
      {error && <p className="view-error" role="alert">{error}</p>}
      {review && (
        <>
          {/* 지금 쓰는 교재 */}
          <div className="textbook-block">
            <p className="textbook-block-head">지금 쓰는 교재</p>
            <p className="textbook-current">
              {currentLine || <span className="view-dim">아직 정한 교재가 없어요.</span>}
              {current.isbn && <span className="view-sub-dim"> · ISBN {current.isbn}</span>}
              {SOURCE_LABEL[current.source] && <span className="chip chip-status">{SOURCE_LABEL[current.source]}</span>}
            </p>
            {current.web && (
              <p className="view-sub-dim textbook-source">
                근거: {SITE_LABEL[current.web.site] ?? '웹 페이지'}
                {current.web.publishedDate && ` · ${current.web.publishedDate} 발행`}
                {current.web.fetchedAt && ` · ${current.web.fetchedAt.replace('T', ' ')} 조회`}
                {current.web.url && (
                  <a href={current.web.url} target="_blank" rel="noopener noreferrer" className="textbook-link">
                    <ExternalLink size={13} /> 출처 열기
                  </a>
                )}
              </p>
            )}
            {!editing && (
              <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(true)}>
                {currentLine ? '실제 교재가 달라요' : '교재 직접 적기'}
              </button>
            )}
            {editing && (
              <TextbookEditForm current={current} busy={busy} onCancel={() => setEditing(false)}
                onSave={(values) => act(() => courseAPI.update(courseId, { ...values, expectedTextbookVersion: version }))
                  .then((ok) => ok && setEditing(false))} />
            )}
          </div>

          {/* 강의계획서에 적힌 교재(후보) */}
          {syllabus.length > 0 && (
            <div className="textbook-block">
              <p className="textbook-block-head">강의계획서에 적힌 교재 <span className="view-sub-dim">· 후보예요</span></p>
              <ul className="textbook-clues">
                {syllabus.map((c, i) => (
                  <li key={`${c.materialId}-${i}`}>
                    <span className="chip chip-status">{ROLE_LABEL[c.role] ?? '교재'}</span>{' '}
                    <strong>{c.title}</strong>
                    {[c.author, c.publisher, c.edition].filter(Boolean).length > 0 && (
                      <span className="view-sub-dim"> · {[c.author, c.publisher, c.edition].filter(Boolean).join(' · ')}</span>
                    )}
                    <span className="view-sub-dim textbook-quote">「{c.filename}」 p.{c.unit}{c.source === 'MODEL' ? ' · AI가 표에서 짚은 칸' : ''}</span>
                    {c.sameAsCurrent
                      ? <span className="chip chip-ok">지금 교재와 같아요</span>
                      : (
                        <button type="button" className="btn-ghost btn-sm" disabled={busy}
                          onClick={() => act(() => textbookAPI.applyClue(courseId,
                            { materialId: c.materialId, title: c.title, expectedVersion: version }))}>
                          이 교재로 정하기
                        </button>
                      )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 웹에서 찾기 */}
          <LookupBlock courseId={courseId} review={review} lookup={lookup} version={version} busy={busy} act={act}
            onEdit={() => setEditing(true)} linkOpen={linkOpen} setLinkOpen={setLinkOpen} />

          {/* 목차 */}
          {toc?.status === 'FOUND' ? (
            <div className="textbook-block">
              <p className="textbook-block-head">목차</p>
              <p className="view-sub-dim">
                {toc.label ?? (toc.filename ? `「${toc.filename}」 목차` : '교재 목차')} · 항목 {toc.entryCount}개
                {toc.kind === 'WEB' && toc.coverage === 'PARTIAL' && ' · 일부만 확보했어요'}
                {toc.kind === 'WEB' && toc.unread > 0 && ` · 목차로 읽지 못한 줄 ${toc.unread}개`}
              </p>
              <button type="button" className="collapse-head" aria-expanded={tocOpen} onClick={() => setTocOpen((v) => !v)}>
                {tocOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />} 목차 보기
              </button>
              {tocOpen && <TocTreeList nodes={tocTree(toc.entries)} />}
            </div>
          ) : null}

          {(review.unlinkedTocs ?? []).map((u) => (
            <div key={u.materialId} className="textbook-candidate">
              <p className="textbook-candidate-head">「{u.filename}」의 목차가 어느 책의 것인지 적혀 있지 않아요</p>
              <p className="view-sub-dim">지금 교재의 목차가 맞으면 이어 주세요. 다른 책의 목차라면 그대로 두면 돼요(쓰지 않아요).</p>
              <button type="button" className="btn-primary btn-sm" disabled={busy}
                onClick={() => act(() => textbookAPI.linkToc(courseId, { materialId: u.materialId, expectedVersion: version }))}>
                이 교재 목차로 쓰기
              </button>
            </div>
          ))}

          <p className="textbook-next">{review.nextAction}</p>

          {(review.candidates ?? []).map((candidate) => {
            const open = candidate.fields.filter((f) => !f.same);
            if (open.length === 0) return null;
            return (
              <div key={candidate.materialId} className="textbook-candidate">
                <p className="textbook-candidate-head">「{candidate.filename}」에서 찾은 교재 정보 · 적용 전</p>
                <ul>
                  {open.map((f) => {
                    const key = `${candidate.materialId}:${f.field}`;
                    return (
                      <li key={key}>
                        <label>
                          <input type="checkbox" checked={!!picked[key]} disabled={busy}
                            onChange={() => setPicked((prev) => ({ ...prev, [key]: !prev[key] }))} />
                          <span className="textbook-field">{FIELD_LABEL[f.field]}</span> {f.value}
                        </label>
                        {f.current && (
                          <span className="textbook-conflict"> — 지금 값 「{f.current}」과 달라요. 고르면 바뀌어요</span>
                        )}
                        <span className="view-sub-dim textbook-quote"> p.{f.unit}: “{f.quote}”</span>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" className="btn-primary btn-sm" disabled={busy
                  || !open.some((f) => picked[`${candidate.materialId}:${f.field}`])}
                  onClick={() => applyFrom(candidate)}>
                  {busy ? <Loader2 size={13} className="spin" /> : null} 고른 칸 적용
                </button>
              </div>
            );
          })}
          {review.pending > 0 && (
            <p className="view-sub-dim">아직 원문을 읽는 중인 자료 {review.pending}개는 끝나면 다시 확인해요.</p>
          )}
        </>
      )}
    </section>
  );
}

/** 웹 조회 상태와 결과, 상황별 다음 행동. */
function LookupBlock({ courseId, review, lookup, version, busy, act, onEdit, linkOpen, setLinkOpen }) {
  const enabled = review.webLookupEnabled !== false;
  const settled = lookup && !isSearching(lookup);
  const sent = lookup?.query;
  const sentLine = sent ? [sent.title, sent.author, sent.publisher, sent.edition, sent.isbn && `ISBN ${sent.isbn}`]
    .filter(Boolean).join(' · ') : null;
  const skipped = (lookup?.failures ?? []).filter((f) => f.status === 'NOT_OPENED_AUTOMATICALLY').length;
  const status = lookup?.status;
  const showAlternatives = settled && ['BOOK_NO_TOC', 'NOT_FOUND', 'ACCESS_FAILED', 'FAILED'].includes(status);

  return (
    <div className="textbook-block" aria-live="polite">
      <p className="textbook-block-head">
        웹에서 찾기
        {lookup && <span className={`chip ${status === 'FOUND' ? 'chip-ok' : status === 'NEEDS_CHOICE' || status === 'CLUE_CONFLICT' ? 'chip-warn' : 'chip-status'}`}>
          {isSearching(lookup) && <Loader2 size={12} className="spin" />} {LOOKUP_LABEL[status] ?? status}
        </span>}
      </p>

      {!lookup && enabled && (
        <p className="view-sub-dim">교재 이름이 생기면 서버가 서점 페이지에서 책·판·목차를 찾아요.</p>
      )}
      {!enabled && (
        <p className="view-sub-dim">이 프로젝트는 교재 웹 검색을 꺼 두었어요. 교재 단서를 밖으로 보내지 않아요.</p>
      )}

      {lookup && sentLine && !sent?.needsClue && (
        <p className="view-sub-dim">보낸 정보: {sentLine}{lookup.searchedWith === 'reused' ? ' · 이전에 찾은 결과를 다시 썼어요' : ''}</p>
      )}
      {lookup?.query?.needsClue && isSearching(lookup) && (
        <p className="view-sub-dim">강의계획서의 교재 칸을 읽고 있어요.</p>
      )}
      {lookup?.note && <p className="view-sub-dim">{lookup.note}</p>}

      {status === 'FOUND' && lookup.editions?.[0] && (
        <EditionLine edition={lookup.editions[0]} />
      )}

      {status === 'NEEDS_CHOICE' && (
        <>
          <p>{lookup.editions.length === 1
            ? '준 링크의 책이 지금 교재와 같은지 확인하지 못했어요. 맞으면 이 판으로 정해 주세요.'
            : `같은 제목의 책이 ${lookup.editions.length}가지예요. 지금 쓰는 판을 골라 주세요.`}</p>
          <ul className="textbook-editions">
            {lookup.editions.map((e) => (
              <li key={e.key}>
                <EditionLine edition={e} others={lookup.editions} />
                <button type="button" className="btn-primary btn-sm" disabled={busy}
                  onClick={() => act(() => textbookAPI.choose(courseId,
                    { lookupId: lookup.lookupId, revisionId: e.bestRevisionId, expectedVersion: version }))}>
                  이 판으로 정하기
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {status === 'CLUE_CONFLICT' && (
        <ul className="textbook-editions">
          {(lookup.clueOptions ?? []).map((o, i) => (
            <li key={i}>
              <strong>{o.title}</strong>
              <span className="view-sub-dim"> · {[o.author, o.publisher].filter(Boolean).join(' · ')} · 「{o.filename}」</span>
              <button type="button" className="btn-primary btn-sm" disabled={busy}
                onClick={() => act(() => textbookAPI.applyClue(courseId, { materialId: o.materialId, title: o.title, expectedVersion: version }))}>
                이 교재로 정하기
              </button>
            </li>
          ))}
        </ul>
      )}

      {skipped > 0 && settled && (
        <p className="view-sub-dim">자동으로 열지 않는 사이트의 페이지 {skipped}개는 열지 않았어요. 그 상세 페이지 링크를 주면 열어 볼게요.</p>
      )}

      {showAlternatives && (
        <div className="textbook-alternatives">
          {status === 'BOOK_NO_TOC' && <p className="view-sub-dim">목차 쪽 사진이나 PDF를 자료로 올리면 그 목차를 써요.</p>}
          {status === 'NOT_FOUND' && (
            <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={onEdit}>ISBN·판 적기</button>
          )}
        </div>
      )}

      <div className="textbook-actions">
        {settled && enabled && (
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => act(() => textbookAPI.retry(courseId))}>
            <RotateCcw size={13} /> 다시 찾기
          </button>
        )}
        {enabled && (
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setLinkOpen((v) => !v)}>
            상세 페이지 링크로 찾기
          </button>
        )}
        <label className="textbook-toggle">
          <input type="checkbox" checked={enabled} disabled={busy}
            onChange={(e) => act(() => textbookAPI.setEnabled(courseId, e.target.checked))} />
          교재 이름으로 웹에서 목차 찾기 <span className="view-sub-dim">(제목·저자·출판사·판·ISBN만 보내요)</span>
        </label>
      </div>
      {linkOpen && enabled && (
        <LinkForm busy={busy} onSubmit={(url) => act(() => textbookAPI.link(courseId, url)).then((ok) => ok && setLinkOpen(false))} />
      )}
    </div>
  );
}

function EditionLine({ edition, others = [] }) {
  const same = (edition.sameTocAs ?? []).map((k) => others.find((o) => o.key === k)?.publishedDate ?? k);
  return (
    <span className="textbook-edition">
      <strong>{edition.title}</strong>
      {edition.edition && ` ${edition.edition}`}
      <span className="view-sub-dim">
        {' · '}{[edition.publisher, edition.publishedDate && `${edition.publishedDate} 발행`, edition.isbn13 && `ISBN ${edition.isbn13}`]
          .filter(Boolean).join(' · ')}
        {' · '}{edition.tocEntryCount > 0 ? `목차 ${edition.tocEntryCount}항목 · ${COVERAGE_LABEL[edition.tocCoverage] ?? ''}` : '목차 없음'}
        {same.length > 0 && ` · 목차는 ${same.join(', ')} 판과 같아요`}
      </span>
      {edition.url && (
        <a href={edition.url} target="_blank" rel="noopener noreferrer" className="textbook-link">
          <ExternalLink size={13} /> {SITE_LABEL[edition.site] ?? '출처'}
        </a>
      )}
    </span>
  );
}

function LinkForm({ busy, onSubmit }) {
  const [url, setUrl] = useState('');
  return (
    <form className="textbook-link-form" onSubmit={(e) => { e.preventDefault(); if (url.trim()) onSubmit(url.trim()); }}>
      <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (출판사·서점의 책 상세 페이지)"
        aria-label="교재 상세 페이지 링크" />
      <button type="submit" className="btn-primary btn-sm" disabled={busy || !url.trim()}>이 링크로 찾기</button>
    </form>
  );
}

/** 지금 교재 고치기. 다섯 칸을 모두 보낸다(다른 책으로 바꿀 때 이전 책의 ISBN·판이 남지 않게). */
function TextbookEditForm({ current, busy, onCancel, onSave }) {
  const [values, setValues] = useState({
    textbookTitle: current.title ?? '',
    textbookAuthor: current.author ?? '',
    textbookPublisher: current.publisher ?? '',
    textbookIsbn: current.isbn ?? '',
    textbookEdition: current.edition ?? '',
  });
  const set = (key) => (e) => setValues((prev) => ({ ...prev, [key]: e.target.value }));
  return (
    <form className="textbook-edit" onSubmit={(e) => {
      e.preventDefault();
      const trimmed = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim() || null]));
      onSave(trimmed);
    }}>
      <input value={values.textbookTitle} onChange={set('textbookTitle')} placeholder="교재명" aria-label="교재명" />
      <input value={values.textbookAuthor} onChange={set('textbookAuthor')} placeholder="저자" aria-label="교재 저자" />
      <input value={values.textbookPublisher} onChange={set('textbookPublisher')} placeholder="출판사" aria-label="교재 출판사" />
      <input value={values.textbookIsbn} onChange={set('textbookIsbn')} placeholder="ISBN" aria-label="교재 ISBN" />
      <input value={values.textbookEdition} onChange={set('textbookEdition')} placeholder="판 (예: 개정 2판)" aria-label="교재 판" />
      <p className="view-sub-dim">저장하면 이 교재로 다시 찾아요. 강의계획서의 교재는 후보로 남고, 이 교재가 계획·상담에 쓰여요.</p>
      <div className="textbook-actions">
        <button type="submit" className="btn-primary btn-sm" disabled={busy || !values.textbookTitle.trim() && !values.textbookIsbn.trim()}>
          저장
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>취소</button>
      </div>
    </form>
  );
}

/**
 * 목차 트리. 장(최상위)만 보이고 하위항목은 접혀 있다 — 눌러 펼친다. 깊이 단계를 자르지 않는다.
 */
function TocTreeList({ nodes, depth = 0 }) {
  return (
    <ol className={depth === 0 ? 'textbook-toc' : 'textbook-toc-children'}>
      {nodes.map((node) => <TocTreeNode key={node.key} node={node} depth={depth} />)}
    </ol>
  );
}

function TocTreeNode({ node, depth }) {
  const [open, setOpen] = useState(false);
  const { entry } = node;
  const below = countBelow(node);
  const label = (
    <>
      {entry.number ? `${entry.number} ` : ''}{entry.title}
      {entry.page ? <span className="view-sub-dim"> · p.{entry.page}</span> : null}
    </>
  );
  return (
    <li className="textbook-toc-item">
      {node.children.length > 0 ? (
        <button type="button" className="textbook-toc-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {label}
          {!open && <span className="view-sub-dim"> · 하위 {below}개</span>}
        </button>
      ) : <span className="textbook-toc-leaf">{label}</span>}
      {open && node.children.length > 0 && <TocTreeList nodes={node.children} depth={depth + 1} />}
    </li>
  );
}
