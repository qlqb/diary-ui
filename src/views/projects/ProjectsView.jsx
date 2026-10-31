/**
 * 프로젝트 목록.
 *
 * 프로젝트는 "AI와 계속 다루고 싶은 하나의 주제/맥락"이다 — 학교 과목일 수도, 자격증일 수도,
 * 내가 만드는 앱일 수도 있다. 그래서 이 화면의 첫 동작은 "자료 올리기"가 아니라
 * "만들기"다. 제목 하나만 있으면 되고, 만든 즉시 그 안에서 AI와 이야기할 수 있다.
 */

import { useCallback, useEffect, useState } from 'react';
import { Plus, FolderOpen, ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';
import { courseAPI } from '../../api/api.js';

const UNGROUPED = '__ungrouped__';

function groupProjects(projects) {
  const groups = new Map();
  for (const project of projects) {
    const key = project.groupLabel || UNGROUPED;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(project);
  }
  // 분류 없는 묶음은 항상 맨 아래에 둔다.
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === UNGROUPED) return 1;
    if (b === UNGROUPED) return -1;
    return a.localeCompare(b, 'ko');
  });
}

export default function ProjectsView({ projects, loading, error, onReload, onOpen }) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [groupLabel, setGroupLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState(null);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const created = await courseAPI.create({
        title: title.trim(),
        groupLabel: groupLabel.trim() || null,
      });
      setTitle('');
      setGroupLabel('');
      setCreating(false);
      await onReload?.();
      // 만들자마자 그 안으로 들어간다 — 빈 프로젝트도 바로 쓸 수 있는 공간이다.
      onOpen?.(created.courseId);
    } catch (err) {
      setCreateError(err.message || '만들지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const groups = groupProjects(projects);
  const existingGroups = [...new Set(projects.map((p) => p.groupLabel).filter(Boolean))];

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1 className="view-title">프로젝트</h1>
          <p className="view-sub">AI와 계속 이어가고 싶은 주제들</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setCreating((v) => !v)}>
          <Plus size={15} /> 프로젝트 만들기
        </button>
      </header>

      {creating && (
        <form className="project-create" onSubmit={handleCreate}>
          <input
            type="text"
            className="project-create-title"
            placeholder="예: 자료구조, 정보처리기사, diary-app"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="text"
            className="project-create-group"
            placeholder="분류 (선택) — 학교 / 자격증 / 개인"
            value={groupLabel}
            list="project-group-suggestions"
            onChange={(e) => setGroupLabel(e.target.value)}
          />
          <datalist id="project-group-suggestions">
            {existingGroups.map((g) => <option key={g} value={g} />)}
          </datalist>
          <button type="submit" className="btn-primary" disabled={!title.trim() || submitting}>
            {submitting ? '만드는 중...' : '만들기'}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>취소</button>
          <p className="project-create-hint">
            자료는 나중에 올려도 돼요. 만들자마자 AI와 이야기를 시작할 수 있어요.
          </p>
        </form>
      )}

      {createError && <p className="view-error">{createError}</p>}
      {error && <p className="view-error">{error}</p>}
      {loading && <p className="view-dim">불러오는 중...</p>}

      {!loading && projects.length === 0 && (
        <div className="empty-block">
          <p className="empty-title">아직 프로젝트가 없어요</p>
          <p className="empty-desc">
            지금 신경 쓰고 있는 주제를 하나 만들어보세요. 이름만 있으면 됩니다 — 자료가 없어도
            바로 AI와 이야기할 수 있어요.
          </p>
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={15} /> 첫 프로젝트 만들기
          </button>
        </div>
      )}

      {groups.map(([groupKey, groupProjectList]) => (
        <section className="view-section" key={groupKey}>
          <h2 className="section-title">
            <FolderOpen size={14} /> {groupKey === UNGROUPED ? '분류 없음' : groupKey}
          </h2>
          <div className="project-grid">
            {groupProjectList.map((project) => (
              <ProjectCard key={project.courseId} project={project} onOpen={() => onOpen(project.courseId)} />
            ))}
          </div>
        </section>
      ))}

      <ArchiveBox onRestored={onReload} />
    </div>
  );
}

/**
 * 보관함. 이 화면 맨 아래 접기 영역이면 충분하고, 별도 페이지를 만들지 않는다 —
 * 보관은 자주 하는 일이 아니고, 꺼내는 것도 마찬가지다.
 *
 * 보관은 숨김이지 삭제가 아니다. 다시 꺼내면 학습 구조도 자료 연결도 그대로 돌아온다 —
 * 서버가 status만 되돌리기 때문이고, 여기서 복구할 것은 아무것도 없다.
 *
 * 목록은 비어 있어도 한 번은 불러온다. 개수를 먼저 알아야 "보관된 프로젝트 2"를 적을 수 있고,
 * 보관한 것이 없으면 이 영역 자체를 그리지 않는다.
 */
function ArchiveBox({ onRestored }) {
  const [archived, setArchived] = useState([]);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setArchived(await courseAPI.list('ARCHIVED'));
    } catch (err) {
      setError(err.message || '보관함을 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRestore = async (courseId) => {
    setBusyId(courseId);
    setError(null);
    try {
      await courseAPI.restore(courseId);
      await load();
      await onRestored?.();
    } catch (err) {
      setError(err.message || '다시 꺼내지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  if (archived.length === 0) {
    return error ? <p className="view-error">{error}</p> : null;
  }

  return (
    <section className="view-section archive-box">
      <button type="button" className="collapse-head" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span className="section-title">보관된 프로젝트</span>
        <span className="archive-count">{archived.length}</span>
      </button>
      {error && <p className="view-error">{error}</p>}
      {open && (
        <ul className="material-list">
          {archived.map((project) => (
            <li key={project.courseId} className="material-item">
              <span className="material-name">{project.title}</span>
              <span className="chip">보관됨</span>
              <span className="material-actions">
                <button type="button" className="btn-ghost btn-sm" disabled={busyId === project.courseId}
                  onClick={() => handleRestore(project.courseId)}>
                  다시 꺼내기
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * 프로젝트 카드.
 *
 * ★ 진행률 %를 보여주지 않는다. 자료를 추가하면 분모(topicCount)가 늘어 어제 60%가 오늘
 * 35%가 된다 — 사용자가 아무것도 잘못하지 않았는데 숫자가 내려가는 화면은 실패 프레이밍이다.
 * 대신 계획 기준의 개수("3개 중 1개 완료")를 프로젝트 화면에서 보여준다.
 */
function ProjectCard({ project, onOpen }) {
  const hasStructure = project.topicCount > 0;

  return (
    <button type="button" className="project-card" onClick={onOpen}>
      <span className="project-card-title">{project.title}</span>

      <span className="project-card-status">
        {project.currentTopicTitle
          ? <>진행 중 · {project.currentTopicTitle}</>
          : hasStructure
            ? <>학습 구조 {project.topicCount}개 · 아직 시작 안 함</>
            : <>아직 정해진 구조가 없어요</>}
      </span>

      <span className="project-card-foot">
        {project.textbookTitle && <span className="chip">{project.textbookTitle}</span>}
        <span className="project-card-open">열기 <ArrowRight size={13} /></span>
      </span>
    </button>
  );
}
