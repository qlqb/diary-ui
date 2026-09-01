/**
 * 앱 셸. 왼쪽 탐색 · 가운데 작업 화면 · 오른쪽 AI.
 *
 * 최상위는 다섯 곳이다.
 *   오늘     지금 무엇을 하고, 남은 오늘을 어떻게 조정할까
 *   자료      내가 가진 파일들. 프로젝트에 종속되지 않는다
 *   프로젝트  내가 AI와 계속 다루는 주제들
 *   일정      앞으로 언제 무엇을 할까
 *   기록      실제로 무슨 일이 있었나
 *
 * 자료가 최상위인 이유: 하나의 자료를 여러 프로젝트에서 참조할 수 있어서, 어느 한
 * 프로젝트 안에만 두면 "그 파일이 어디 있더라"를 프로젝트를 뒤져 찾아야 한다.
 *
 * 예전의 "계획"과 "실행"을 따로 두지 않는다 — 초안과 확정을 다른 탭에 나눠 놓으면 "지금 보는
 * 게 적용된 것인지"가 흐려진다. 일정 화면 하나에서 확정된 배치와 적용 전 초안을 함께 본다.
 * "학습"도 최상위에서 사라졌다 — 학습은 별도 활동이 아니라 프로젝트의 한 종류다.
 *
 * AI 초안(제안) 상태는 이 셸이 소유한다. AI 패널은 초안을 만들기만 하고, 실제로 보여주고
 * 고치고 적용하는 일은 각 화면이 한다 — "AI에서 생각하고, 결과는 실제 화면에 나타난다".
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sparkles, CalendarCheck2, FolderKanban, CalendarDays, CalendarRange, NotebookPen, FileText,
  LogOut, PanelRightOpen,
} from 'lucide-react';

import AiPanel from '../ai/AiPanel.jsx';
import { useProposalDraft } from '../ai/useProposalDraft.js';
import ApplyBar from '../components/ApplyBar.jsx';
import TodayView from '../views/TodayView.jsx';
import MaterialsView from '../views/materials/MaterialsView.jsx';
import ProjectsView from '../views/projects/ProjectsView.jsx';
import ProjectWorkspace from '../views/projects/ProjectWorkspace.jsx';
import ScheduleView from '../views/schedule/ScheduleView.jsx';
import PlanCreateView from '../views/plan/PlanCreateView.jsx';
import PlanView from '../views/plan/PlanView.jsx';
import RecordView from '../views/RecordView.jsx';
import { commitmentAPI, courseAPI, executionItemAPI, routineAPI } from '../api/api.js';
import useUndoDelete from './useUndoDelete.js';
import UndoToast from '../components/UndoToast.jsx';
import { todayString } from '../lib/datetime.js';
import { tabForProposal } from './proposalTab.js';

const TABS = [
  { key: 'today', label: '오늘', icon: CalendarCheck2 },
  { key: 'materials', label: '자료', icon: FileText },
  { key: 'projects', label: '프로젝트', icon: FolderKanban },
  { key: 'plan', label: '계획', icon: CalendarRange },
  { key: 'schedule', label: '일정', icon: CalendarDays },
  { key: 'record', label: '기록', icon: NotebookPen },
];

/**
 * 지금 화면에 맞는 AI 참고 범위. 사용자에게는 내부 Agent 이름을 노출하지 않고
 * "지금 참고: 자료구조"처럼 무엇을 보고 있는지만 알려준다.
 */
function resolveScope(tab, openProject) {
  if (tab === 'projects' && openProject) {
    return {
      kind: 'project',
      courseId: openProject.courseId,
      conversationScope: 'PLAN',
      label: openProject.title,
      placeholder: `${openProject.title}에 대해 물어보거나, 계획을 부탁해보세요`,
      emptyHint: `${openProject.title}에 대해 편하게 이야기해보세요. 자료가 없어도 괜찮아요.`,
    };
  }
  if (tab === 'schedule') {
    return {
      kind: 'schedule',
      courseId: null,
      conversationScope: 'EXECUTION',
      label: '이번 주 일정과 프로젝트',
      placeholder: '예: 이번 주 자료구조 시험 공부 계획 짜줘',
      emptyHint: '이번 주를 어떻게 쓸지 이야기해보세요. 초안은 왼쪽 격자에 바로 나타나요.',
    };
  }
  if (tab === 'today') {
    return {
      kind: 'today',
      courseId: null,
      conversationScope: 'TODAY',
      label: '오늘 실행과 일정',
      placeholder: '예: 오늘 너무 피곤해. 남은 걸 줄여줘',
      emptyHint: '지금 상황을 편하게 말해주세요. 오늘 뭐가 잡혀 있는지는 이미 보고 있어요.',
    };
  }
  return {
    kind: 'all',
    courseId: null,
    conversationScope: 'MIXED',
    label: '전체',
    placeholder: '무엇이든 물어보세요',
    emptyHint: '요즘 어떤지 편하게 이야기해보세요.',
  };
}

export default function MainShell({ user, onLogout }) {
  const [tab, setTab] = useState('today');
  /** 계획 탭의 상태: null이면 만들기 화면, 값이 있으면 그 계획을 본다. */
  const [openPlanId, setOpenPlanId] = useState(null);
  /**
   * 계획 만들기의 범위. 프로젝트 화면에서 들어오면 그 프로젝트로 좁힌다 —
   * "자료구조 계획을 만들려고 [계획 만들기]를 눌렀는데 전체 프로젝트가 대상"이면
   * 사용자가 누른 버튼과 결과가 어긋난다. null이면 전체 프로젝트다.
   */
  const [planScopeCourseId, setPlanScopeCourseId] = useState(null);
  const [openProjectId, setOpenProjectId] = useState(null);
  const [aiOpen, setAiOpen] = useState(true);
  const [prefill, setPrefill] = useState(null);

  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState(null);

  const today = todayString();
  const [todayItems, setTodayItems] = useState([]);
  /**
   * 오늘 도는 반복 일정. 실행 조각과 합치지 않고 따로 들고 간다 — 저장 원본이 다르고,
   * 오늘 화면이 둘을 합치는 것은 "언제가 비어 있는가"를 셀 때뿐이다.
   */
  const [todayOccurrences, setTodayOccurrences] = useState([]);
  /** 오늘 걸치는 일회성 약속. 루틴과 같은 이유로 실행 조각과 합치지 않고 따로 들고 간다. */
  const [todayCommitments, setTodayCommitments] = useState([]);
  const [todayLoading, setTodayLoading] = useState(true);
  const [todayError, setTodayError] = useState(null);
  /** 일부만 읽은 상태를 알리는 문구. 전체 실패(todayError)와 구분한다. */
  const [todayNotice, setTodayNotice] = useState(null);
  /** 적용 후 다른 화면들이 자기 데이터를 다시 읽게 만드는 신호. */
  const [refreshToken, setRefreshToken] = useState(0);

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      setProjects(await courseAPI.list());
    } catch (err) {
      setProjectsError(err.message || '프로젝트를 불러오지 못했습니다.');
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  /*
   * occurrences는 오늘~오늘로만 부른다. 자정 넘김(22:00~02:00 알바)은 서버가 이미
   * 처리한다 — RoutineOccurrenceService가 창 하루 앞에서부터 전개한 뒤 반열린 구간으로
   * 거르므로, 어제 22시에 시작해 오늘 02시에 끝나는 발생분이 이 응답에 들어 있다.
   * 여기서 전날부터 다시 부르면 오늘과 안 겹치는 어제치까지 받아 다시 걸러야 한다.
   */
  const loadToday = useCallback(async () => {
    setTodayLoading(true);
    setTodayError(null);
    try {
      const [itemsResult, occurrencesResult, commitmentsResult] = await Promise.allSettled([
        executionItemAPI.getByDate(today),
        routineAPI.occurrences(today, today),
        commitmentAPI.list(today, today),
      ]);
      if (itemsResult.status === 'rejected') throw itemsResult.reason;
      setTodayItems(itemsResult.value);
      /*
       * 시간축 소스 하나만 못 읽었으면 실행 조각은 그대로 보여주되, 불완전하다는 것을
       * 말한다. 조용히 빈 배열로 두면 화면이 "다음 일정 없음"이라고 단언하는데, 그건
       * 못 읽었다는 사실을 없는 일정으로 바꿔 말하는 것이다.
       */
      const missing = [];
      if (occurrencesResult.status === 'rejected') {
        setTodayOccurrences([]);
        missing.push('반복 일정');
      } else {
        setTodayOccurrences(occurrencesResult.value ?? []);
      }
      if (commitmentsResult.status === 'rejected') {
        setTodayCommitments([]);
        missing.push('약속');
      } else {
        setTodayCommitments(commitmentsResult.value ?? []);
      }
      setTodayNotice(missing.length === 0 ? null
        : `${missing.join('과 ')}을 불러오지 못했어요. 그 시간이 빠진 채로 보고 있어요.`);
    } catch (err) {
      setTodayError(err.message || '오늘 항목을 불러오지 못했습니다.');
    } finally {
      setTodayLoading(false);
    }
  }, [today]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // 오늘 탭에 들어올 때마다 다시 읽는다 — 프로젝트 화면에서 완료 처리를 하고 돌아왔을 때
  // 화면마다 다른 시점의 스냅샷을 들고 있으면 안 된다.
  useEffect(() => {
    if (tab === 'today') loadToday();
  }, [tab, loadToday]);

  /** 적용된 뒤에는 모든 화면이 새 상태를 봐야 한다 — 화면마다 다른 시점의 스냅샷을 들고 있지 않게 한다. */
  const refreshAll = useCallback(async () => {
    setRefreshToken((v) => v + 1);
    await Promise.all([loadToday(), loadProjects()]);
  }, [loadToday, loadProjects]);

  const {
    undoTarget, undoCount, undoBusy, rememberDeleted, undoDelete,
  } = useUndoDelete({ onRestored: refreshAll });

  const {
    draft, openDraft, patchCard, toggleExclude, discardDraft, apply, applying, applyError, placing,
  } = useProposalDraft({ onApplied: refreshAll });

  const openProject = useMemo(
    () => projects.find((p) => p.courseId === openProjectId) ?? null,
    [projects, openProjectId],
  );
  const projectTitles = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.courseId, p.title])),
    [projects],
  );
  const scope = resolveScope(tab, openProject);

  const ask = useCallback((text) => {
    setAiOpen(true);
    setPrefill({ text, nonce: Date.now() });
  }, []);

  /**
   * 초안이 만들어지면 그 초안이 실제로 보이는 화면으로 데려간다 — 제안이 어딘가에 생겼는데
   * 사용자가 그것을 못 보는 상태를 만들지 않는다. 프로젝트 안에서 만든 초안은 그 프로젝트
   * 화면에 이미 보이므로 그대로 둔다.
   */
  const handleProposal = useCallback(async (proposal) => {
    await openDraft(proposal, { courseId: scope.courseId ?? null });
    if (tab === 'projects') return;
    setTab(tabForProposal(proposal.items, today));
  }, [openDraft, scope.courseId, tab, today]);

  const focusDraft = useCallback(() => {
    if (!draft) return;
    if (tab === 'projects') return;
    const dates = new Set(draft.cards.map((c) => c.scheduledDate ?? c.beforeScheduledDate));
    setTab(dates.size === 1 && dates.has(today) ? 'today' : 'schedule');
  }, [draft, tab, today]);

  const nickname = user?.nickname || user?.email?.split('@')[0] || '사용자';

  return (
    <div className={`shell${aiOpen ? '' : ' ai-collapsed'}`}>
      <aside className="nav">
        <div className="nav-logo">
          <span className="nav-logo-icon"><Sparkles size={17} /></span>
          <span className="nav-logo-text">오늘조각</span>
        </div>

        <nav className="nav-menu">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                className={`nav-item${tab === t.key ? ' is-active' : ''}`}
                onClick={() => {
                  setTab(t.key);
                  if (t.key === 'projects') setOpenProjectId(null);
                  if (t.key === 'plan') { setOpenPlanId(null); setPlanScopeCourseId(null); }
                }}
                aria-current={tab === t.key ? 'page' : undefined}
              >
                <Icon size={17} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        {projects.length > 0 && (
          <div className="nav-projects">
            <p className="nav-projects-label">프로젝트</p>
            {projects.slice(0, 6).map((project) => (
              <button
                key={project.courseId}
                type="button"
                className={`nav-project${openProjectId === project.courseId && tab === 'projects' ? ' is-active' : ''}`}
                onClick={() => { setTab('projects'); setOpenProjectId(project.courseId); }}
                title={project.title}
              >
                {project.title}
              </button>
            ))}
          </div>
        )}

        <div className="nav-foot">
          <span className="nav-user">{nickname}님</span>
          <button type="button" className="nav-item" onClick={onLogout}>
            <LogOut size={16} /><span>로그아웃</span>
          </button>
        </div>
      </aside>

      <main className="workspace">
        <div className="workspace-scroll">
          {tab === 'today' && (
            <TodayView
              items={todayItems}
              occurrences={todayOccurrences}
              commitments={todayCommitments}
              notice={todayNotice}
              loading={todayLoading}
              error={todayError}
              onRefresh={loadToday}
              onItemDeleted={rememberDeleted}
              projectTitles={projectTitles}
              draft={draft}
              onPatchCard={patchCard}
              onToggleExclude={toggleExclude}
              onOpenAi={() => setAiOpen(true)}
              onAsk={ask}
            />
          )}

          {tab === 'materials' && (
            <MaterialsView projects={projects} onProjectsChanged={loadProjects} />
          )}

          {tab === 'projects' && !openProjectId && (
            <ProjectsView
              projects={projects}
              loading={projectsLoading}
              error={projectsError}
              onReload={loadProjects}
              onOpen={(courseId) => setOpenProjectId(courseId)}
            />
          )}

          {tab === 'plan' && !openPlanId && (
            <PlanCreateView
              projectTitles={projectTitles}
              scopeCourseId={planScopeCourseId}
              onClearScope={() => setPlanScopeCourseId(null)}
              onConfirmed={(plan) => {
                // 확정하면 바로 그 계획으로 들어간다 — 확정 직후 할 일은 "이번 주 배치하기"다.
                setOpenPlanId(plan.planVersionId);
                refreshAll();
              }}
            />
          )}

          {tab === 'plan' && openPlanId && (
            <PlanView
              planVersionId={openPlanId}
              projectTitles={projectTitles}
              onBack={() => setOpenPlanId(null)}
              onChanged={refreshAll}
            />
          )}

          {tab === 'projects' && openProjectId && (
            <ProjectWorkspace
              courseId={openProjectId}
              onCreatePlan={(courseId) => {
                setTab('plan');
                setOpenPlanId(null);
                setPlanScopeCourseId(courseId ?? null);
              }}
              onOpenPlan={(planVersionId) => { setTab('plan'); setOpenPlanId(planVersionId); }}
              onBack={() => setOpenProjectId(null)}
              onAsk={ask}
              draft={draft}
              onPatchCard={patchCard}
              onToggleExclude={toggleExclude}
              onProjectsChanged={loadProjects}
              onItemDeleted={rememberDeleted}
              refreshToken={refreshToken}
            />
          )}

          {tab === 'schedule' && (
            <ScheduleView
              draft={draft}
              onPatchCard={patchCard}
              onToggleExclude={toggleExclude}
              onOpenAi={() => setAiOpen(true)}
              onItemDeleted={rememberDeleted}
              refreshToken={refreshToken}
              projectTitles={projectTitles}
              projects={projects}
            />
          )}

          {tab === 'record' && <RecordView projectTitles={projectTitles} refreshToken={refreshToken} />}
        </div>

        {/*
          삭제 확인을 없앤 대신 여기서 되돌릴 수 있다고 말한다. 이 안내가 곧 되돌릴 수 있는
          시간이다 — 사라지면 단축키도 함께 꺼진다.
        */}
        {undoTarget && (
          <UndoToast title={undoTarget.title} count={undoCount} busy={undoBusy} onUndo={undoDelete} />
        )}

        <ApplyBar
          draft={draft}
          applying={applying}
          error={applyError}
          placing={placing}
          onApply={apply}
          onDiscard={discardDraft}
        />
      </main>

      {aiOpen ? (
        <AiPanel
          scope={scope}
          draft={draft}
          prefill={prefill}
          onProposal={handleProposal}
          onFocusDraft={focusDraft}
          onDiscardDraft={discardDraft}
          /* 약속·반복 일정이 저장되면 오늘 시간축과 주간 격자가 새 사실을 봐야 한다. */
          onScheduleApplied={refreshAll}
          onCollapse={() => setAiOpen(false)}
        />
      ) : (
        <button type="button" className="ai-reopen" onClick={() => setAiOpen(true)} title="AI 열기">
          <PanelRightOpen size={16} /> AI
        </button>
      )}
    </div>
  );
}
