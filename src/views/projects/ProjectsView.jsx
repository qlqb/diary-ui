/**
 * 프로젝트 목록.
 *
 * 프로젝트는 "AI와 계속 다루고 싶은 하나의 주제/맥락"이다 — 학교 과목일 수도, 자격증일 수도,
 * 내가 만드는 앱일 수도 있다. 그래서 이 화면의 첫 동작은 "자료 올리기"가 아니라
 * "만들기"다. 제목 하나만 있으면 되고, 만든 즉시 그 안에서 AI와 이야기할 수 있다.
 */

import { useState } from 'react';
import { Plus, FolderOpen, ArrowRight } from 'lucide-react';
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
    </div>
  );
}

function ProjectCard({ project, onOpen }) {
  const hasStructure = project.topicCount > 0;
  const progress = hasStructure
    ? Math.round((project.learnedTopicCount / project.topicCount) * 100)
    : null;

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

      {progress !== null && (
        <span className="project-card-progress">
          <span className="project-card-progress-fill" style={{ width: `${progress}%` }} />
        </span>
      )}

      <span className="project-card-foot">
        {project.textbookTitle && <span className="chip">{project.textbookTitle}</span>}
        <span className="project-card-open">열기 <ArrowRight size={13} /></span>
      </span>
    </button>
  );
}
