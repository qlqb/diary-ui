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
 * 계획 탭의 기본 화면은 "상담으로 계획하기"다(왼쪽 범위·자료 · 가운데 대화 · 오른쪽 계획 방향/초안). 가운데 대화는
 * 새로 만든 것이 아니라 늘 있던 AI 패널 그 하나다 — 자리만 가운데로 옮긴다. 그래서 오른쪽 좁은 AI 칸과 작업 공간이
 * 같은 대화·같은 초안을 보고, 같은 질문이나 서로 다른 초안이 두 군데에 뜨지 않는다. 조건을 직접 정해 만드는 기존
 * 화면은 "직접 조건 정해서 만들기"로 그대로 남아 있다.
 *
 * AI 초안(제안) 상태는 이 셸이 소유한다. AI 패널은 초안을 만들기만 하고, 실제로 보여주고
 * 고치고 적용하는 일은 각 화면이 한다 — "AI에서 생각하고, 결과는 실제 화면에 나타난다".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, CalendarCheck2, FolderKanban, CalendarDays, CalendarRange, NotebookPen, FileText,
  LogOut, PanelRightOpen, BrainCircuit,
} from 'lucide-react';

import AiPanel from '../ai/AiPanel.jsx';
import { useProposalDraft } from '../ai/useProposalDraft.js';
import { useConsultDraft } from '../ai/useConsultDraft.js';
import { useViewportLayout } from '../ai/useViewportLayout.js';
import ConsultPaneFrame from '../views/plan/ConsultPaneFrame.jsx';
import ConsultScopePane from '../views/plan/ConsultScopePane.jsx';
import ConsultPlanPane from '../views/plan/ConsultPlanPane.jsx';
import { draftCoverageNotice } from '../lib/planLabels.js';
import { formatMinutes } from '../lib/planTime.js';
import '../styles/consult.css';
import ApplyBar from '../components/ApplyBar.jsx';
import TodayView from '../views/TodayView.jsx';
import MaterialsView from '../views/materials/MaterialsView.jsx';
import ProjectsView from '../views/projects/ProjectsView.jsx';
import ProjectWorkspace from '../views/projects/ProjectWorkspace.jsx';
import ScheduleView from '../views/schedule/ScheduleView.jsx';
import PlanCreateView from '../views/plan/PlanCreateView.jsx';
import PlanView from '../views/plan/PlanView.jsx';
import RecordView from '../views/RecordView.jsx';
import MemoryView from '../views/memory/MemoryView.jsx';
import { commitmentAPI, courseAPI, executionItemAPI, planAPI, routineAPI } from '../api/api.js';
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
function projectScope(project) {
  return {
    kind: 'project',
    courseId: project.courseId,
    conversationScope: 'PLAN',
    label: project.title,
    placeholder: `${project.title}에 대해 물어보거나, 계획을 부탁해보세요`,
    emptyHint: `${project.title}에 대해 편하게 이야기해보세요. 자료가 없어도 괜찮아요.`,
  };
}

function resolveScope(tab, openProject, consultProject = null) {
  if (tab === 'projects' && openProject) return projectScope(openProject);
  /*
   * 계획 탭의 대화는 상담이다. 프로젝트에서 [상담으로 계획하기]로 들어왔으면 그 프로젝트의 대화 범위를 그대로
   * 쓴다 — 프로젝트 화면에서 하던 이야기가 끊기지 않고 가운데 칸에서 이어진다(범위 열쇠가 같아 다시 읽지도 않는다).
   * 상담 ↔ 직접 만들기 ↔ 계획 보기를 오가도 범위가 같아서 대화가 새로 붙지 않는다.
   */
  if (tab === 'plan') {
    if (consultProject) return projectScope(consultProject);
    return {
      kind: 'consult',
      courseId: null,
      conversationScope: 'PLAN',
      label: '전체 프로젝트 계획 상담',
      placeholder: '예: 이번 주에 뭘 어떻게 하면 좋을지 같이 정하고 싶어',
      emptyHint: '요즘 상황을 편하게 이야기해 주세요. 답에 따라 계획 방향이 오른쪽에 바로 보이고, 초안은 확인한 뒤에만 적용돼요.',
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
  /**
   * 계획 탭의 방식. 'consult'는 상담 작업 공간(기본), 'manual'은 기간·강도를 직접 정해 만드는 기존 화면이다.
   */
  const [planMode, setPlanMode] = useState('consult');
  /** 상담의 대화 범위. null이면 전체 프로젝트, 값이 있으면 그 프로젝트의 대화다. 사용자가 고를 때만 바뀐다. */
  const [consultCourseId, setConsultCourseId] = useState(null);
  /** AI 패널이 올려 준 상담 상태(대화 유무·방향·이해한 내용·진행 단계). 옆 칸은 이것을 읽기만 한다. */
  const [consultState, setConsultState] = useState(null);
  /** 좁은 화면에서 열려 있는 옆 칸. 'scope' | 'preview' | null */
  const [openPane, setOpenPane] = useState(null);
  /** 프로젝트를 열 때 먼저 보여 줄 구역(학습 지도로 바로 가기). 프로젝트 화면이 읽는다. */
  const [projectInitialSection, setProjectInitialSection] = useState(null);
  const layout = useViewportLayout();
  /**
   * "AI가 이해한 내 상황" 화면. 탭이 아니라 어느 탭에서든 여는 보기다 — AI가 나에 대해 들고 있는 이해는
   * 특정 탭의 것이 아니다. 탭을 누르면 닫힌다.
   */
  const [memoryOpen, setMemoryOpen] = useState(false);
  /**
   * 이번 계획에서 중심으로 볼 자료(자료함의 [이 자료로 계획]). 이번 요청의 지정일 뿐 영구 연결이 아니다.
   */
  const [planRequestedMaterials, setPlanRequestedMaterials] = useState([]);
  /**
   * AI 패널에서 만든 기간 계획 초안(PlanDraftResponse). 어느 탭에서 만들었든 계획 탭의 같은
   * 검토·확정 화면으로 데려간다 — 일반 제안의 ghost·적용 바가 아니라 PlanVersion 확정이다.
   * 상담 작업 공간의 오른쪽 칸과 직접 만들기 화면이 이 하나를 본다(초안을 둘로 들지 않는다).
   */
  const consultDraft = useConsultDraft();
  const aiPeriodDraft = consultDraft.draft;
  const [openProjectId, setOpenProjectId] = useState(null);
  /*
   * 넓은 화면에서는 AI 칸이 늘 열려 있다. 좁은 화면에서는 AI가 화면을 덮는 보기라서 닫힌 채로 시작한다 —
   * 안 그러면 앱을 열자마자 본문이 가려진다.
   */
  const [aiOpen, setAiOpen] = useState(() => (
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? true : window.matchMedia('(min-width: 1100px)').matches
  ));
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
  const consultProject = useMemo(
    () => (consultCourseId != null ? projects.find((p) => p.courseId === consultCourseId) ?? null : null),
    [projects, consultCourseId],
  );
  const scope = resolveScope(tab, openProject, consultProject);
  /** 상담 작업 공간이 화면에 떠 있는가. 이때 AI 패널은 오른쪽 칸이 아니라 가운데 칸이다. */
  const consultActive = !memoryOpen && tab === 'plan' && !openPlanId && planMode === 'consult';

  /**
   * 근거 화면에서 "지금 원본 보기"를 눌렀을 때 어디로 갈 것인가.
   *
   * ★ 라벨이 약속한 곳으로만 보낸다. 학습 항목 단건으로 바로 가는 경로가 아직 없어서
   * 그 항목이 있는 프로젝트를 열고, 화면도 "프로젝트에서 보기"라고 말한다. 갈 곳이 없는
   * 종류는 여기서 아무것도 하지 않고 근거 화면이 버튼을 아예 그리지 않는다 —
   * 눌러도 안 되는 버튼이 깨진 링크다.
   */
  const openSource = useCallback((target, targetId, providedValue) => {
    if (target === 'COURSE' && targetId != null) {
      setTab('projects');
      setOpenProjectId(targetId);
      return;
    }
    if (target === 'TOPIC' && providedValue?.courseId != null) {
      setTab('projects');
      setOpenProjectId(providedValue.courseId);
      return;
    }
    if (target === 'ROUTINE' || target === 'COMMITMENT' || target === 'EXECUTION_ITEM') {
      setTab('schedule');
    }
  }, []);

  const ask = useCallback((text) => {
    setAiOpen(true);
    // 좁은 화면에서는 옆 칸(시트)이 대화를 가리고 있다 — 닫아야 채워진 입력창이 보인다.
    setOpenPane(null);
    setPrefill({ text, nonce: Date.now() });
  }, []);

  /** 입력창을 채우지 않고 대화로 돌아오기만 한다([계속 상담]). 쓰던 글은 그대로다. */
  const focusChat = useCallback(() => {
    setAiOpen(true);
    setOpenPane(null);
    setPrefill({ text: '', focusOnly: true, nonce: Date.now() });
  }, []);

  /**
   * 상담 작업 공간 열기. 프로젝트 화면이 부르면(courseId) 같은 대화를 그 프로젝트 범위로 이어 간다.
   */
  const openConsult = useCallback((courseId = null) => {
    setMemoryOpen(false);
    setTab('plan');
    setOpenPlanId(null);
    setPlanMode('consult');
    setConsultCourseId(courseId ?? null);
    setOpenPane(null);
  }, []);

  /** 프로젝트의 학습 지도로 간다. 지도 자체는 프로젝트 화면이 그린다 — 여기서는 어느 구역을 먼저 열지만 알린다. */
  const openLearningMap = useCallback((courseId) => {
    if (courseId == null) return;
    setOpenPane(null);
    setMemoryOpen(false);
    setProjectInitialSection('map');
    setOpenProjectId(courseId);
    setTab('projects');
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

  /**
   * 기간 계획 초안은 탭과 무관하게 계획 화면의 검토로 간다. 오늘·일정·프로젝트 탭에서 시작해도
   * 같은 컴포넌트, 같은 confirm API, 같은 PlanVersion 기록이다.
   */
  const placeRef = useRef({ tab, planMode, openProjectId, openDraftId: null });
  useEffect(() => {
    placeRef.current = { tab, planMode, openProjectId, openDraftId: consultDraft.draft?.proposalId ?? null };
  });
  const acceptConsultDraft = consultDraft.accept;
  const handlePeriodPlan = useCallback((periodDraft, { restored = false } = {}) => {
    if (!periodDraft) return;
    const at = placeRef.current;
    /*
     * 대화를 다시 열면서 되살린 초안(restored)은 지금 열려 있는 다른 초안을 밀어내지 않는다. 오늘 탭에서 방금 만든
     * 초안을 보러 계획 탭에 왔는데, 계획 탭의 옛 대화가 자기 옛 초안을 되살려 그것을 덮으면 안 된다.
     */
    if (restored && at.openDraftId != null && at.openDraftId !== periodDraft.proposalId) return;
    // 상담 초안은 자기 요청 맥락(기간·범위·지정 자료)을 들고 온다. 계획 화면에 남아 있던 범위·지정 자료를 섞지 않는다.
    setPlanScopeCourseId(null);
    setPlanRequestedMaterials([]);
    acceptConsultDraft(periodDraft);
    setMemoryOpen(false);
    setOpenPlanId(null);
    if (at.tab === 'plan') {
      // 계획 탭 안에서는 보고 있던 방식(상담 / 직접 만들기)을 그대로 둔다.
    } else if (at.tab === 'projects' && at.openProjectId != null) {
      // 프로젝트에서 만든 초안은 그 프로젝트 범위의 상담으로 간다 — 범위가 같아 대화가 끊기지 않는다.
      setConsultCourseId(at.openProjectId);
      setPlanMode('consult');
    } else {
      // 오늘·일정에서 만든 초안은 예전처럼 검토 화면으로 간다. 그 탭의 대화는 계획 탭의 대화와 다른 범위다.
      setPlanMode('manual');
    }
    setTab('plan');
    // 좁은 화면에서는 초안이 시트 안에 있다. 새 초안이 왔으면 열어서 보여 준다.
    if (!restored) setOpenPane('preview');
  }, [acceptConsultDraft]);

  /**
   * "AI가 이해한 내 상황"에서 고친 내용이 열린 초안을 낡게 했을 때, 그 초안을 열어 준다. 저장된 초안을 서버에서
   * 다시 읽는다(모델 호출 없음) — 낡았다는 표시(freshness)도 그 응답에 실려 온다.
   */
  const openDraftById = useCallback(async (proposalId) => {
    try {
      const stored = await planAPI.loadDraft(proposalId);
      if (stored?.proposalId != null) handlePeriodPlan(stored);
    } catch { /* 못 읽으면 그대로 둔다 — 이해한 내용 화면은 계속 쓸 수 있다 */ }
  }, [handlePeriodPlan]);

  const focusDraft = useCallback(() => {
    if (!draft) return;
    if (tab === 'projects') return;
    const dates = new Set(draft.cards.map((c) => c.scheduledDate ?? c.beforeScheduledDate));
    setTab(dates.size === 1 && dates.has(today) ? 'today' : 'schedule');
  }, [draft, tab, today]);

  const nickname = user?.nickname || user?.email?.split('@')[0] || '사용자';

  const aiVisible = aiOpen || consultActive;
  /*
   * 좁은 화면에서 입력창 위에 늘 보이는 한 줄. 빠진 프로젝트·가정한 시간·낡은 초안은 시트를 열지 않아도 보인다.
   */
  const draftNotice = useMemo(() => {
    const base = draftCoverageNotice(consultDraft.draft, formatMinutes);
    if (!base) return null;
    const alreadySaid = consultDraft.draft?.freshness?.state === 'STALE';
    return consultDraft.stale && !alreadySaid ? `${base} · 최신 답변 반영 전` : base;
  }, [consultDraft.draft, consultDraft.stale]);
  const paneOpenOf = (name) => layout !== 'inline' && openPane === name;

  return (
    <div className={`shell${aiVisible ? '' : ' ai-collapsed'}${consultActive ? ' is-consult' : ''}${aiVisible && !consultActive ? ' ai-open' : ''}`}>
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
                className={`nav-item${tab === t.key && !memoryOpen ? ' is-active' : ''}`}
                onClick={() => {
                  setTab(t.key);
                  setMemoryOpen(false);
                  setOpenPane(null);
                  if (t.key === 'projects') { setOpenProjectId(null); setProjectInitialSection(null); }
                  // 계획 탭의 기본 화면은 상담이다. 직접 만들기는 그 안에서 고른다.
                  if (t.key === 'plan') {
                    setOpenPlanId(null); setPlanScopeCourseId(null); setPlanMode('consult'); setConsultCourseId(null);
                  }
                }}
                aria-current={tab === t.key && !memoryOpen ? 'page' : undefined}
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
                onClick={() => {
                  setMemoryOpen(false); setTab('projects'); setProjectInitialSection(null); setOpenProjectId(project.courseId);
                }}
                title={project.title}
              >
                {project.title}
              </button>
            ))}
          </div>
        )}

        <div className="nav-foot">
          <button type="button" className={`nav-item nav-memory${memoryOpen ? ' is-active' : ''}`}
            aria-current={memoryOpen ? 'page' : undefined}
            onClick={() => { setMemoryOpen(true); setOpenPane(null); }}>
            <BrainCircuit size={16} /><span>AI가 이해한 내 상황</span>
          </button>
          <span className="nav-user">{nickname}님</span>
          <button type="button" className="nav-item" onClick={onLogout}>
            <LogOut size={16} /><span>로그아웃</span>
          </button>
        </div>
      </aside>

      <main className="workspace">
        {/* 상담 작업 공간에서는 본문 자리를 세 칸(범위·대화·초안)이 쓴다. 이 main에는 되돌리기·적용 바만 남는다. */}
        {!consultActive && memoryOpen && (
          <div className="workspace-scroll">
            <MemoryView onOpenDraft={openDraftById} />
          </div>
        )}
        {!consultActive && !memoryOpen && (
        <div className="workspace-scroll">
          {tab === 'today' && (
            <TodayView
              onOpenSource={openSource}
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
            <MaterialsView projects={projects} onProjectsChanged={loadProjects}
              onPlanWithMaterial={(material) => {
                // 연결된 프로젝트가 하나면 그 프로젝트로 좁힌다. 여럿이거나 없으면 전체 — 서버가 지정 자료를 범위와 대조한다.
                const links = material.links ?? [];
                setPlanScopeCourseId(links.length === 1 ? links[0].courseId : null);
                setPlanRequestedMaterials([{ materialId: material.materialId, filename: material.originalFilename }]);
                consultDraft.clear();
                setOpenPlanId(null);
                // 자료를 지정해 만드는 것은 조건을 직접 정하는 길이다.
                setPlanMode('manual');
                setTab('plan');
              }} />
          )}

          {tab === 'projects' && !openProjectId && (
            <ProjectsView
              projects={projects}
              loading={projectsLoading}
              error={projectsError}
              onReload={loadProjects}
              onOpen={(courseId) => { setProjectInitialSection(null); setOpenProjectId(courseId); }}
            />
          )}

          {tab === 'plan' && !openPlanId && (
            <PlanCreateView
              onOpenSource={openSource}
              projectTitles={projectTitles}
              scopeCourseId={planScopeCourseId}
              onClearScope={() => setPlanScopeCourseId(null)}
              requestedMaterials={planRequestedMaterials}
              onClearRequestedMaterial={(materialId) =>
                setPlanRequestedMaterials((prev) => prev.filter((m) => m.materialId !== materialId))}
              initialDraft={aiPeriodDraft}
              onInitialDraftCleared={consultDraft.clear}
              onOpenSchedule={() => setTab('schedule')}
              onOpenConsult={() => openConsult(planScopeCourseId)}
              onAsk={ask}
              onFocusChat={focusChat}
              onConfirmed={(plan) => {
                // 확정하면 바로 그 계획으로 들어간다 — 확정 직후 할 일은 "이번 주 배치하기"다.
                consultDraft.clear();
                setOpenPlanId(plan.planVersionId);
                refreshAll();
              }}
            />
          )}

          {tab === 'plan' && openPlanId && (
            <PlanView
              onOpenSource={openSource}
              planVersionId={openPlanId}
              projectTitles={projectTitles}
              onBack={() => setOpenPlanId(null)}
              onChanged={refreshAll}
            />
          )}

          {tab === 'projects' && openProjectId && (
            <ProjectWorkspace
              /* initialSection은 처음 뜰 때만 읽힌다 — 같은 프로젝트에서 학습 지도로 바로 가려면 새로 떠야 한다. */
              key={`${openProjectId}:${projectInitialSection ?? ''}`}
              courseId={openProjectId}
              onCreatePlan={(courseId) => {
                setTab('plan');
                setOpenPlanId(null);
                setPlanMode('manual');
                setPlanRequestedMaterials([]);
                setPlanScopeCourseId(courseId ?? null);
              }}
              /* 같은 대화를 이 프로젝트 범위로 이어 가는 상담 작업 공간. */
              onOpenConsult={openConsult}
              /* 'map'이면 학습 지도를 먼저 연다(상담의 [학습 지도] 버튼). */
              initialSection={projectInitialSection ?? undefined}
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
        )}

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

      {consultActive && (
        <ConsultPaneFrame side="left" title="범위·자료" layout={layout}
          open={paneOpenOf('scope')} onClose={() => setOpenPane(null)}>
          <ConsultScopePane
            projects={projects}
            scopeCourseId={consultCourseId}
            onSelectScope={(courseId) => { setConsultCourseId(courseId); setOpenPane(null); }}
            consultState={consultState}
            draft={consultDraft.draft}
            onOpenLearningMap={openLearningMap}
            onOpenSource={openSource}
            onOpenManual={() => { setPlanMode('manual'); setPlanScopeCourseId(consultCourseId); setOpenPane(null); }}
          />
        </ConsultPaneFrame>
      )}

      {/*
        AI 패널은 하나뿐이다. 상담 작업 공간에서는 같은 인스턴스가 가운데 칸으로 자리만 옮긴다(variant) —
        다시 만들지 않으므로 대화·입력 중인 글·진행 중인 응답이 그대로 이어진다.
      */}
      {aiVisible ? (
        <AiPanel
          variant={consultActive ? 'workspace' : 'side'}
          onConsultState={setConsultState}
          onDraftStale={consultDraft.markStale}
          draftNotice={consultActive && layout !== 'inline' ? draftNotice : null}
          onOpenScopePane={consultActive && layout !== 'inline' ? () => setOpenPane('scope') : undefined}
          onOpenPreviewPane={consultActive && layout !== 'inline' ? () => setOpenPane('preview') : undefined}
          /* 좁은 화면에서는 AI가 본문을 덮고 있다 — 닫아야 방금 연 화면이 보인다. */
          onOpenMemory={() => { setMemoryOpen(true); setOpenPane(null); if (layout !== 'inline') setAiOpen(false); }}
          scope={scope}
          draft={draft}
          prefill={prefill}
          onProposal={handleProposal}
          onPeriodPlan={handlePeriodPlan}
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

      {consultActive && (
        <ConsultPaneFrame side="right" title="계획 미리보기" layout={layout}
          open={paneOpenOf('preview')} onClose={() => setOpenPane(null)}>
          <ConsultPlanPane
            consultState={consultState}
            consultDraft={consultDraft}
            projectTitles={projectTitles}
            onOpenSource={openSource}
            onOpenSchedule={() => setTab('schedule')}
            onOpenPlan={(planVersionId) => setOpenPlanId(planVersionId)}
            onConfirmed={() => refreshAll()}
            onAsk={ask}
            onFocusChat={focusChat}
          />
        </ConsultPaneFrame>
      )}
    </div>
  );
}
