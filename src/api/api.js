/**
 * API 서비스 모듈
 * Spring Boot 백엔드와 통신하는 함수들
 */

/**
 * 백엔드 주소. 기본은 로컬 8080이고, 다른 포트에서 띄운 서버를 붙일 때만
 * VITE_API_BASE_URL로 덮어쓴다(예: 개발 중 두 인스턴스를 동시에 띄우는 경우).
 */
const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? 'http://localhost:8080/api';

const TOKEN_KEY = 'token';

const getToken = () => {
    return localStorage.getItem(TOKEN_KEY);
};

const setToken = (token) => {
    localStorage.setItem(TOKEN_KEY, token);
};

const removeToken = () => {
    localStorage.removeItem(TOKEN_KEY);
};

const getTodayString = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

/**
 * 공통 API 요청 함수
 */
async function request(url, options = {}) {
    const token = getToken();

    // null undefined 방어와 options.header를 스프레드해서 집어넣은 것
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
    };

    // 토큰이 있을때만 헤더에 Authorization 추가
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    // response에
    // options를 스프레드하고 headers를 덮어씀
    // 하지만 이미 위에서 options의 headers를 포함시켜놨기 때문에 options의 headers가 사라진 건 아님
    const response = await fetch(`${API_BASE_URL}${url}`, {
        ...options,
        headers,
    });

    // 삭제시에는 response.json()을 실행하면 에러가 나기 때문에 null을 반환해 함수를 종료한다
    if (response.status === 204) {
        return null;
    }

    let data = null;

    try {
        data = await response.json();
    } catch {
        data = null;
    }

    // response가 200~299일때 통과하고 아니라면 에러를 발생시킨다
    if (!response.ok) {
        throw new Error(
            //data가 null일 경우 에러가 생기기 때문에 옵셔널 체이닝 기법을 활용
            //null일때 undefined 반환
            data?.message ||
            data?.error ||
            `요청 실패: ${response.status}`
        );
    }

    return data;
}

/**
 * 파일 업로드(multipart/form-data) 요청. Content-Type을 직접 지정하지 않는다 —
 * 브라우저가 boundary를 포함해 자동으로 설정해야 하므로, request()와 달리 JSON 헤더를 쓰지 않는다.
 */
async function requestMultipart(url, formData) {
    const token = getToken();
    const headers = {};
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
        method: 'POST',
        headers,
        body: formData,
    });

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        throw new Error(data?.message || data?.error || `요청 실패: ${response.status}`);
    }

    return data;
}

/**
 * SSE(POST) 스트리밍 요청. AI 상담 대화 전용.
 *
 * 백엔드는 event: <name>\ndata: <json>\n\n 형식의 SSE 프레임을 내려준다
 * (message.started/message.delta/offer.ready/proposal.ready/message.completed/message.error).
 * 네이티브 EventSource는 POST 요청과 Authorization 헤더를 못 보내므로 fetch의
 * ReadableStream을 직접 읽어 프레임 경계를 스스로 찾는다.
 */
async function streamRequest(url, body, { onEvent, signal } = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
    });

    if (!response.ok || !response.body) {
        let data = null;
        try {
            data = await response.json();
        } catch {
            data = null;
        }
        throw new Error(data?.message || data?.error || `요청 실패: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let separatorIndex;
        while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
            const rawFrame = buffer.slice(0, separatorIndex);
            buffer = buffer.slice(separatorIndex + 2);
            const frame = parseSseFrame(rawFrame);
            if (frame) {
                onEvent?.(frame.event, frame.data);
            }
        }
    }
}

function parseSseFrame(rawFrame) {
    let eventName = 'message';
    const dataLines = [];
    for (const line of rawFrame.split('\n')) {
        if (line.startsWith('event:')) {
            eventName = line.slice('event:'.length).trim();
        } else if (line.startsWith('data:')) {
            dataLines.push(line.slice('data:'.length).trim());
        }
    }
    if (dataLines.length === 0) {
        return null;
    }
    const raw = dataLines.join('\n');
    try {
        return { event: eventName, data: JSON.parse(raw) };
    } catch {
        return { event: eventName, data: raw };
    }
}

/**
 * 인증 API
 */
export const authAPI = {
    /**
     * 회원가입
     */
    signup: async (email, password, nickname) => {
        const data = await request('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ email, password, nickname }),
        });

        if (data?.token) {
            setToken(data.token);
        }

        return data;
    },

    /**
     * 로그인
     */
    login: async (email, password) => {
        const data = await request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });

        if (data?.token) {
            setToken(data.token);
        }

        return data;
    },

    /**
     * 현재 로그인 사용자 조회
     */
    getCurrentUser: async () => {
        return request('/users/me');
    },

    /**
     * 로그아웃
     */
    logout: () => {
        removeToken();
    },
};

/**
 * 일기 API
 */
export const diaryAPI = {
    /**
     * 일기 목록 조회
     */
    getDiaries: (page = 1, size = 10, filter = {}) => {
        const params = new URLSearchParams();

        const {mood, favorite, keyword} = filter ?? {};

        params.append('page', page);
        params.append('size', size);

        if (mood) {
            params.append('mood', mood);
        }

        /**
         * true false가 둘다 의미 있는 값이라
         * typeof로 boolean인지 검사해서 필터링
         */
        if (typeof favorite === 'boolean') {
            params.append('favorite', favorite);
        }

        if (keyword) {
            params.append('keyword', keyword);
        }

        return request(`/diaries?${params.toString()}`);
    },

    /**
     * 일기 검색
     */
    searchDiaries: (keyword, page = 1, size = 10) => {
        const params = new URLSearchParams();

        params.append('keyword', keyword);
        params.append('page', page);
        params.append('size', size);

        return request(`/diaries/search?${params.toString()}`);
    },

    /**
     * 일기 상세 조회
     */
    getDiary: (diaryId) => {
        return request(`/diaries/${diaryId}`);
    },

    /**
     * 일기 작성
     */
    createDiary: (diaryData) => {
        return request('/diaries', {
            method: 'POST',
            body: JSON.stringify(diaryData),
        });
    },

    /**
     * 일기 수정
     */
    updateDiary: (diaryId, updateData) => {
        return request(`/diaries/${diaryId}`, {
            method: 'PUT',
            body: JSON.stringify(updateData),
        });
    },

    /**
     * 일기 삭제
     */
    deleteDiary: (diaryId) => {
        return request(`/diaries/${diaryId}`, {
            method: 'DELETE',
        });
    },

    /**
     * 즐겨찾기 토글
     */
    toggleFavorite: (diaryId) => {
        return request(`/diaries/${diaryId}/favorite`, {
            method: 'PATCH',
        });
    },

    /**
     * 수정 이력 조회
     */
    getRevisions: (diaryId) => {
        return request(`/diaries/${diaryId}/revisions`);
    },

    /**
     * 수정 이력 복구
     */
    restoreRevision: (diaryId, revisionId) => {
        return request(`/diaries/${diaryId}/revisions/${revisionId}/restore`, {
            method: 'POST',
        });
    },

    /**
     * 통계 요약
     */
    getStatisticsSummary: () => {
        return request('/diaries/statistics/summary');
    },

    /**
     * 기분별 통계
     */
    getMoodStatistics: () => {
        return request('/diaries/statistics/mood');
    },

    /**
     * 월별 통계
     */
    getMonthlyStatistics: (year) => {
        const query = year ? `?year=${year}` : '';
        return request(`/diaries/statistics/monthly${query}`);
    },

    /**
     * 연속 작성 통계
     */
    getStreakStatistics: () => {
        return request('/diaries/statistics/streak');
    },
};

/**
 * 백엔드 ExecutionItemResponse(camelCase)를 화면이 쓰는 ExecutionItemDto 모양으로 맞춘다.
 * scheduledStartAt/scheduledEndAt(ISO datetime)을 startTime/endTime('HH:mm')으로 슬라이스하고,
 * expectedMinutes/orderIndex/sourceExecutionItemId 같은 실제 컬럼명을
 * 화면이 기대하는 estimatedMinutes/displayOrder/parentExecutionItemId로 맞춘다.
 * 응답이 이미 camelCase가 아닐 경우(snake_case)에도 방어적으로 읽는다.
 */
function toFrontendExecutionItem(raw) {
    if (!raw) return raw;

    const pick = (camel, snake) => (raw[camel] !== undefined ? raw[camel] : raw[snake]);
    const toHHmm = (iso) => (iso ? String(iso).slice(11, 16) : null);

    const placementType = pick('placementType', 'placement_type');
    const scheduledStartAt = pick('scheduledStartAt', 'scheduled_start_at');
    const scheduledEndAt = pick('scheduledEndAt', 'scheduled_end_at');

    return {
        executionItemId: pick('executionItemId', 'execution_item_id'),
        userId: pick('userId', 'user_id'),
        // 어느 프로젝트의 실행인지. 화면에서 프로젝트 이름표를 붙이는 데 쓴다.
        courseId: pick('courseId', 'course_id') ?? null,
        topicId: pick('topicId', 'topic_id') ?? null,
        routineId: pick('routineId', 'routine_id') ?? null,
        parentExecutionItemId: pick('sourceExecutionItemId', 'source_execution_item_id') ?? null,
        title: raw.title,
        description: raw.description ?? null,
        placementType,
        scheduledDate: pick('scheduledDate', 'scheduled_date'),
        startTime: toHHmm(scheduledStartAt),
        endTime: toHHmm(scheduledEndAt),
        estimatedMinutes: pick('expectedMinutes', 'expected_minutes') ?? null,
        status: raw.status,
        // isFixed는 "이동·축소·보류 등을 제한하는 잠금 속성"이고 placementType(TIME_FIXED=
        // 시작·종료 시각이 정해진 배치 형식)과는 별개 개념이다. 백엔드 execution_items에는
        // 아직 그 잠금 속성을 담는 컬럼이 없으므로 placementType에서 추론하지 않는다 —
        // TIME_FIXED 항목도 완료·이동·축소가 막히면 안 된다.
        isFixed: false,
        priority: raw.priority,
        displayOrder: pick('orderIndex', 'order_index') ?? 0,
        originType: pick('originType', 'origin_type'),
        modifiedAfterCreation: !!pick('modifiedAfterCreation', 'modified_after_creation'),
        version: raw.version,
        createdAt: pick('createdAt', 'created_at'),
        updatedAt: pick('updatedAt', 'updated_at'),
    };
}

/**
 * ExecutionItem API. Today/Execution 화면의 공식 실행 원본이다.
 */
export const executionItemAPI = {
    getTodayString,

    /** 날짜별 실행 조각 조회 */
    getByDate: async (date) => {
        const params = new URLSearchParams({ date });
        const data = await request(`/execution-items?${params.toString()}`);
        return (data ?? []).map(toFrontendExecutionItem);
    },

    /** 프로젝트에 속한 실행 조각(지난 7일 ~ 앞으로 14일 + 날짜 미정) */
    getByCourse: async (courseId, today) => {
        const params = new URLSearchParams(today ? { today } : {});
        const data = await request(`/execution-items/by-course/${courseId}?${params.toString()}`);
        return (data ?? []).map(toFrontendExecutionItem);
    },

    /** 실제로 일어난 결과(기록 화면). 실행 조각이 아니라 execution_records를 본다 */
    getRecords: (startDate, endDate) => {
        const params = new URLSearchParams({ startDate, endDate });
        return request(`/execution-items/records?${params.toString()}`);
    },

    /** 날짜 범위 실행 조각 조회 (주간 시간표용). getByDate와 같은 원본을 여러 날짜에 걸쳐 투영한다 */
    /**
     * 날짜 범위 조회.
     *
     * includeUnscheduled=true면 아직 날짜를 정하지 않은 항목도 함께 온다 — 계획 기간이
     * 이 범위와 겹치는 것들이다. 주간 시간표는 날짜 칸에 그리므로 이 값을 켜지 않는다
     * (날짜 없는 항목은 놓을 자리가 없다). 계획 화면만 켠다.
     */
    getByDateRange: async (startDate, endDate, includeUnscheduled = false) => {
        const params = new URLSearchParams({ startDate, endDate });
        if (includeUnscheduled) params.append('includeUnscheduled', 'true');
        const data = await request(`/execution-items/range?${params.toString()}`);
        return (data ?? []).map(toFrontendExecutionItem);
    },

    /** 기준일 이전, 아직 결론 나지 않은 항목 조회 */
    getPending: async (beforeDate) => {
        const params = new URLSearchParams({ beforeDate });
        const data = await request(`/execution-items/pending?${params.toString()}`);
        return (data ?? []).map(toFrontendExecutionItem);
    },

    /** 직접 생성 (날짜만 있으면 DATE_ONLY, 시작/종료 시각이 있으면 TIME_FIXED) */
    create: async (payload) => {
        const data = await request('/execution-items', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        return toFrontendExecutionItem(data);
    },

    /** 완료. version은 현재 알고 있는 낙관적 락 값 */
    complete: async (executionItemId, version, extra = {}) => {
        const data = await request(`/execution-items/${executionItemId}/complete`, {
            method: 'POST',
            body: JSON.stringify({ version, ...extra }),
        });
        return toFrontendExecutionItem(data);
    },

    /** 재열기 (완료 취소) */
    reopen: async (executionItemId, version, reason = null) => {
        const data = await request(`/execution-items/${executionItemId}/reopen`, {
            method: 'POST',
            body: JSON.stringify({ version, reason }),
        });
        return toFrontendExecutionItem(data);
    },

    /**
     * 이동 = "언제 할지" 변경. 다른 날짜로 옮기는 것과, 같은 날 안에서 시각만 뒤로 미는 것
     * ("오늘 뒤로")이 모두 이 액션이고 둘 다 MOVED 이벤트로 남는다.
     *
     * options.startTime/endTime('HH:mm')을 주면 그 시각으로 다시 배치한다(시각이 정해진
     * 항목에만 쓸 수 있다). 주지 않으면 예전처럼 날짜만 옮긴다.
     */
    move: async (executionItemId, toDate, version, options = {}) => {
        const { reason = null, startTime = null, endTime = null } = options;
        const data = await request(`/execution-items/${executionItemId}/move`, {
            method: 'POST',
            body: JSON.stringify({ toDate, version, reason, startTime, endTime }),
        });
        return toFrontendExecutionItem(data);
    },

    /** 작게 줄이기 */
    reduce: async (executionItemId, payload) => {
        const data = await request(`/execution-items/${executionItemId}/reduce`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        return toFrontendExecutionItem(data);
    },

    /**
     * 일부 수행 기록. keepOpen=true면 오늘 안에 이어서 할 수 있게 PLANNED로 남고,
     * false면 보류로 내려간다. 어느 쪽이든 실제로 한 만큼은 결과로 남는다.
     */
    partial: async (executionItemId, payload) => {
        const data = await request(`/execution-items/${executionItemId}/partial`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        return toFrontendExecutionItem(data);
    },

    /** 보류 */
    hold: async (executionItemId, version, reason = null) => {
        const data = await request(`/execution-items/${executionItemId}/hold`, {
            method: 'POST',
            body: JSON.stringify({ version, reason }),
        });
        return toFrontendExecutionItem(data);
    },

    /** 보류 해제(다시 시작). HOLD -> PLANNED로 되돌리고 RESUMED 이벤트를 남긴다 */
    resume: async (executionItemId, version, reason = null) => {
        const data = await request(`/execution-items/${executionItemId}/resume`, {
            method: 'POST',
            body: JSON.stringify({ version, reason }),
        });
        return toFrontendExecutionItem(data);
    },

    /** 삭제 (soft delete) */
    delete: (executionItemId, version) => {
        const params = new URLSearchParams({ version });
        return request(`/execution-items/${executionItemId}?${params.toString()}`, {
            method: 'DELETE',
        });
    },
};

/**
 * AI 제안(Proposal) 조회·적용 API. 생성은 여기 없다 — conversationAPI.sendMessage의
 * 대화 흐름에서 사용자가 요청했거나 OFFER에 동의했을 때만 서버가 만든다.
 */
export const proposalAPI = {
    /** 제안 조회 (새로고침 후 PROPOSED 카드 복원용) */
    get: (proposalId) => {
        return request(`/ai/proposals/${proposalId}`);
    },

    /** 편집/제외 항목을 담아 전체 적용. editedItems/excludedItemIds에 없는 항목은 원본 그대로 적용된다 */
    apply: (proposalId, editedItems = [], excludedItemIds = []) => {
        return request(`/ai/proposals/${proposalId}/apply`, {
            method: 'POST',
            body: JSON.stringify({ editedItems, excludedItemIds }),
        });
    },
};

/**
 * 7일 범위 일정 후보 배치 미리보기 API. 이 두 호출 모두 OpenAI를 호출하지 않는다 —
 * 서버가 Timefold만 다시 돌린다. 가용시간 예외를 고치거나 항목을 수정한 뒤 "다시 배치"를
 * 누를 때마다 recompute를 부른다.
 */
export const schedulePreviewAPI = {
    /** 새로고침 후 복원용. 아직 한 번도 계산하지 않았으면 null(204) */
    get: (proposalId) => {
        return request(`/ai/proposals/${proposalId}/schedule-preview`);
    },

    /**
     * 재계산. payload: { horizonStart, horizonEnd, availabilityOverrides, items }
     * horizonStart/horizonEnd를 생략하면 서버가 오늘부터 최대 7일로 계산한다.
     */
    recompute: (proposalId, payload = {}) => {
        return request(`/ai/proposals/${proposalId}/schedule-preview`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },
};

/**
 * AI 상담 대화 API. 자유 대화 -> (필요하면) 계획 초안 제안 -> 사용자 요청/동의 시에만
 * Proposal 생성까지, 대화 하나의 흐름으로 이어진다.
 */
export const conversationAPI = {
    /**
     * 대화 시작. scope를 생략하면 서버가 TODAY로 시작한다.
     * courseId를 주면 그 프로젝트에 묶인 대화가 되고, 서버가 그 프로젝트의 자료·학습 상태·
     * 관련 실행을 컨텍스트로 함께 싣는다.
     */
    create: (scope = 'TODAY', courseId = null) => {
        return request('/ai/conversations', {
            method: 'POST',
            body: JSON.stringify({ scope, courseId }),
        });
    },

    /**
     * 내 대화 목록. 마지막 메시지 시각 내림차순, 첫 메시지를 아직 안 보낸 빈 대화는 제외됨.
     * courseId를 주면 그 프로젝트 대화만, 주지 않으면 프로젝트에 속하지 않은 대화만 돌아온다.
     */
    list: (courseId = null) => {
        const params = courseId != null ? `?courseId=${courseId}` : '';
        return request(`/ai/conversations${params}`);
    },

    /** 새로고침 후 대화 이력 복원 */
    getMessages: (conversationId) => {
        return request(`/ai/conversations/${conversationId}/messages`);
    },

    /**
     * 메시지 한 턴을 스트리밍으로 보낸다.
     * payload: { message, requestedAction, sourceMessageId, idempotencyKey }
     * onEvent(eventName, data)가 message.started/message.delta/offer.ready/proposal.ready/
     * message.completed/message.error 각각에 대해 호출된다.
     */
    sendMessage: (conversationId, payload, { onEvent, signal } = {}) => {
        return streamRequest(`/ai/conversations/${conversationId}/messages`, payload, { onEvent, signal });
    },

    /** 아직 승인/거절하지 않은 Context 변경 후보. 대화 재진입(새로고침 포함) 시 카드 복원용 */
    getContextSuggestions: (conversationId) => {
        return request(`/ai/conversations/${conversationId}/context-suggestions`);
    },

    /**
     * 대화 삭제. 목록에서 사라지지만 서버는 status를 ARCHIVED로 내리는 soft delete다 —
     * 이미 나눈 메시지·제안·승인된 장기 컨텍스트를 함께 지우지 않는다.
     */
    delete: (conversationId) => {
        return request(`/ai/conversations/${conversationId}`, { method: 'DELETE' });
    },
};

/**
 * 사용자 장기 컨텍스트 조회 전용. 실제 반영은 여기 없다 — contextSuggestionAPI.apply를
 * 통해서만 일어난다.
 */
export const contextAPI = {
    /** ACTIVE/STALE 장기 컨텍스트 목록 */
    list: () => {
        return request('/contexts');
    },
};

/**
 * 장기 컨텍스트 변경 후보(AI가 만든 ADD/SUPERSEDE/MARK_STALE/ARCHIVE/CONFIRM 후보) 승인/거절.
 * 생성은 여기 없다 — conversationAPI.sendMessage 흐름에서 SSE(context.suggestions.ready)로
 * 도착하거나, conversationAPI.getContextSuggestions로 복원된다.
 */
export const contextSuggestionAPI = {
    apply: (suggestionId) => {
        return request(`/ai/context-suggestions/${suggestionId}/apply`, { method: 'POST' });
    },
    dismiss: (suggestionId) => {
        return request(`/ai/context-suggestions/${suggestionId}/dismiss`, { method: 'POST' });
    },
};

/**
 * 프로젝트 API. 사용자가 AI와 계속 다루고 싶은 하나의 주제/맥락 단위다 —
 * 자료·대화·학습 상태·관련 실행이 전부 여기에 딸린다.
 *
 * 생성에는 제목만 있으면 된다. 자료가 없는 프로젝트도 완전히 사용 가능한 공간이다.
 */
export const courseAPI = {
    /**
     * 내 프로젝트 목록. 카드 요약(자료 수/학습 구조/진행 중 주제)까지 한 번에 온다.
     * status를 주지 않으면 ACTIVE만 온다 — 보관함은 같은 경로에 'ARCHIVED'로 읽는다.
     */
    list: (status = null) => {
        return request(status ? `/courses?status=${status}` : '/courses');
    },

    /** 프로젝트 상세 */
    get: (courseId) => {
        return request(`/courses/${courseId}`);
    },

    /** 프로젝트 생성. payload: { title, groupLabel? } */
    create: (payload) => {
        return request('/courses', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },

    /** 제목/분류 수정. payload: { title?, groupLabel? } */
    update: (courseId, payload) => {
        return request(`/courses/${courseId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        });
    },

    /**
     * 보관. 목록에서 사라지지만 지우는 것이 아니라 status를 ARCHIVED로 내린다 —
     * 자료 연결·대화·실행 기록이 이 프로젝트를 참조하고 있어 행을 지우면 그 관계가 끊어진다.
     * 사용자에게도 "보관"으로 보이고, 보관함에서 restore로 다시 꺼낼 수 있다.
     */
    archive: (courseId) => {
        return request(`/courses/${courseId}`, { method: 'DELETE' });
    },

    /**
     * 보관 해제. 별도의 복구 절차가 없다 — 자료 연결(material_links)은 애초에 지우지 않고
     * 조회에서만 숨겨져 있었으므로 ACTIVE로 되돌리면 저절로 다시 보인다.
     */
    restore: (courseId) => {
        return request(`/courses/${courseId}/restore`, { method: 'POST' });
    },
};

/**
 * 학습 topic이 아닌 과목 정보/평가 정보(course_notes) 조회 API. Material Agent 분석의 apply()를
 * 통해서만 생성된다 — 여기서는 조회만 한다.
 */
export const courseNoteAPI = {
    list: (courseId) => {
        return request(`/courses/${courseId}/notes`);
    },
};

/**
 * 학습 자료 업로드/조회 API. 업로드 직후 텍스트 추출까지 동기로 끝나고 extractionStatus로
 * 결과(SUCCESS/FAILED_NO_TEXT/FAILED)를 알려준다 — 별도 폴링이 필요 없다.
 */
export const materialAPI = {
    /**
     * 자료 업로드 + 이 프로젝트에 연결까지 한 번에. materialType은 자료의 종류가 아니라
     * 이 프로젝트에서 맡는 역할이고, 만들어지는 material_links 행에 붙는다.
     * SYLLABUS|TEXTBOOK_TOC|PROFESSOR_SLIDE|OTHER
     */
    upload: (courseId, materialType, file) => {
        const formData = new FormData();
        formData.append('materialType', materialType);
        formData.append('file', file);
        return requestMultipart(`/courses/${courseId}/materials?materialType=${materialType}`, formData);
    },

    /** 과목의 업로드 자료 목록 */
    listByCourse: (courseId) => {
        return request(`/courses/${courseId}/materials`);
    },
};

/**
 * 전역 자료함 API. 자료는 프로젝트가 아니라 사용자가 소유한다 — 하나의 자료를 여러
 * 프로젝트에서 참조할 수 있다.
 *
 * materialType은 업로드가 아니라 연결 시점에 정해진다("이 프로젝트가 이 자료를 무엇으로
 * 쓰는가"). 어떤 프로젝트에도 연결되지 않은 자료는 타입이 없는 것이 정상 상태다.
 */
export const materialStoreAPI = {
    /** 내 전체 자료. 각 항목의 links에 연결된 프로젝트가 함께 온다 */
    list: () => {
        return request('/materials');
    },

    /** 프로젝트 없이 업로드. materialType을 보내지 않는다 */
    upload: (file) => {
        const formData = new FormData();
        formData.append('file', file);
        return requestMultipart('/materials', formData);
    },

    /** 단건 + 연결 목록 + 분석 이력 */
    get: (materialId) => {
        return request(`/materials/${materialId}`);
    },

    /**
     * 자료 삭제. 원본 파일까지 지운다 — 연결 해제와는 다른 액션이다.
     * 이미 적용한 학습 내용과 프로젝트 상태는 그대로 남는다.
     */
    delete: (materialId) => {
        return request(`/materials/${materialId}`, { method: 'DELETE' });
    },

    /**
     * 미연결 자료를 어느 프로젝트에 넣을지 제안받는다. 아무것도 저장하지 않는다.
     *
     * materialIds를 비워 보내면 미연결 자료 전체가 대상이다. 값을 주는 경로는 둘 —
     * 방금 올린 배치, 그리고 직전 응답의 remainingMaterialIds(`남은 N개 보기`).
     *
     * 모델 호출 실패는 200 + status='UNAVAILABLE'로 온다. 던지는 것은 사용량 한도 초과처럼
     * 다시 눌러도 결과가 같은 실패뿐이다.
     */
    proposeLinks: (materialIds) => {
        return request('/materials/link-proposal', {
            method: 'POST',
            body: JSON.stringify({ materialIds: materialIds ?? [] }),
        });
    },

    /**
     * 승인한 묶음을 적용한다. 서버가 단일 트랜잭션으로 처리하므로 부분 적용이 없다 —
     * 제안 응답을 그대로 돌려보내지 않고 사용자가 실제로 고친 값만 보낸다.
     */
    applyLinkProposal: (groups) => {
        return request('/materials/link-proposal/apply', {
            method: 'POST',
            body: JSON.stringify({ groups }),
        });
    },

    /** 프로젝트에 연결. payload: { courseId, materialType } */
    addLink: (materialId, courseId, materialType) => {
        return request(`/materials/${materialId}/links`, {
            method: 'POST',
            body: JSON.stringify({ courseId, materialType }),
        });
    },

    /**
     * 그 프로젝트에서 이 자료가 맡는 역할만 바꾼다. payload: { materialType }
     *
     * 연결 해제 후 재연결이 유일한 우회로가 되지 않게 하는 경로다. 보관된 프로젝트의
     * 링크는 신규 연결과 같은 이유로 막힌다(409).
     */
    updateLinkType: (materialId, courseId, materialType) => {
        return request(`/materials/${materialId}/links/${courseId}`, {
            method: 'PATCH',
            body: JSON.stringify({ materialType }),
        });
    },

    /** 연결만 끊는다. 자료도 다른 프로젝트 연결도 그대로 남는다 */
    removeLink: (materialId, courseId) => {
        return request(`/materials/${materialId}/links/${courseId}`, { method: 'DELETE' });
    },
};

/**
 * Material Agent 분석 draft/review/apply API. draft 상태는 course_topics에 전혀 영향을
 * 주지 않는다 — apply()를 호출해야만 확정된다.
 */
export const materialAnalysisAPI = {
    /** 분석 실행 (draft 생성) */
    analyze: (courseId, materialId) => {
        return request(`/courses/${courseId}/materials/${materialId}/analyses`, { method: 'POST' });
    },

    /**
     * 이 프로젝트 맥락의 분석 이력만. 같은 자료가 다른 프로젝트에도 걸려 있어도 그쪽 해석은
     * 오지 않는다 — 전체 이력은 전역 자료 상세(materialStoreAPI.get)가 맡는다.
     * 연결되지 않은 자료면 빈 배열이 아니라 404 MATERIAL_NOT_LINKED_TO_COURSE다.
     */
    listByMaterial: (courseId, materialId) => {
        return request(`/courses/${courseId}/materials/${materialId}/analyses`);
    },

    /** 분석 단건 조회 */
    get: (analysisId) => {
        return request(`/material-analyses/${analysisId}`);
    },

    /** 사용자가 검토 중 수정한 내용 저장. payload: { payload: MaterialAnalysisPayload } */
    edit: (analysisId, payload) => {
        return request(`/material-analyses/${analysisId}`, {
            method: 'PUT',
            body: JSON.stringify({ payload }),
        });
    },

    /** 확정 반영 — course_topics 생성, courses 교재 필드 갱신 */
    apply: (analysisId) => {
        return request(`/material-analyses/${analysisId}/apply`, { method: 'POST' });
    },

    /** 폐기 */
    dismiss: (analysisId) => {
        return request(`/material-analyses/${analysisId}/dismiss`, { method: 'POST' });
    },
};

/**
 * 확정된 topic 트리 + 진행 상태 API. topic 자체는 Material Agent apply()를 통해서만
 * 생성된다 — 여기서는 조회와 진행 상태 변경만 한다.
 */
export const topicAPI = {
    /** 과목의 topic 트리 (진행 상태 포함, 계층 구조 그대로) */
    getTree: (courseId) => {
        return request(`/courses/${courseId}/topics`);
    },

    /**
     * 사용자가 학습 화면에서 직접 진행 상태를 바꾸는 액션.
     * status: NOT_STARTED|IN_PROGRESS|LEARNED
     */
    updateProgress: (topicId, status) => {
        return request(`/topics/${topicId}/progress`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        });
    },
};

/**
 * Learning Agent 개인과외 대화 API. conversationAPI(Today 상담)와 같은 SSE 패턴이 아니라
 * 동기 요청/응답이다 — 학습 상담은 잦고 짧은 호출이라 스트리밍 없이도 충분하다.
 */
export const learningConversationAPI = {
    /** 새 대화 시작 */
    create: () => {
        return request('/learning/conversations', { method: 'POST' });
    },

    /** 대화 이력 */
    getMessages: (conversationId) => {
        return request(`/learning/conversations/${conversationId}/messages`);
    },

    /** 질문 전송. payload: { topicId, message } */
    sendMessage: (conversationId, topicId, message) => {
        return request(`/learning/conversations/${conversationId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ topicId, message }),
        });
    },
};

/**
 * Learning Agent 다음 학습 추천 API. WHAT(무엇을 공부할지)만 결정한다 — 시간 배치는
 * planningAPI로 넘긴다.
 */
export const learningRecommendationAPI = {
    /** 다음 학습 추천 받기 */
    recommend: (courseId) => {
        return request(`/courses/${courseId}/learning/recommendation`, { method: 'POST' });
    },

    /** 추천 단건 조회 */
    get: (recommendationId) => {
        return request(`/learning/recommendations/${recommendationId}`);
    },
};

/**
 * Planning Agent API. 계획 초안은 기존 proposalAPI/schedulePreviewAPI가 다루는
 * ai_proposals/스케줄 미리보기를 그대로 재사용한다 — 여기 draft 응답의 proposal.proposalId로
 * 그 두 API를 계속 쓰면 된다(재배치, 검토 등). apply만 이 API로 한다 — 실행 조각에 학습
 * topic을 연결하는 처리가 얹혀 있기 때문이다.
 */
export const planningAPI = {
    /** 계획 초안 생성. instruction(자연어, 선택): 예) "이번 주에 공부하게 계획해줘" */
    createDraft: (recommendationId, instruction = null) => {
        return request(`/learning/recommendations/${recommendationId}/planning-draft`, {
            method: 'POST',
            body: JSON.stringify({ instruction }),
        });
    },

    /** 계획 확정 적용. proposalAPI.apply와 같은 payload(editedItems/excludedItemIds) */
    apply: (proposalId, editedItems = [], excludedItemIds = []) => {
        return request(`/planning/proposals/${proposalId}/apply`, {
            method: 'POST',
            body: JSON.stringify({ editedItems, excludedItemIds }),
        });
    },
};

/** "다음 추천 + 바로 계획까지" 복합 요청 전용 편의 API. */
export const orchestrationAPI = {
    recommendAndPlan: (courseId, planningInstruction = null) => {
        return request(`/courses/${courseId}/learning/recommend-and-plan`, {
            method: 'POST',
            body: JSON.stringify({ planningInstruction }),
        });
    },
};

/**
 * 기간 계획 API.
 *
 * 초안은 아무것도 저장하지 않는다 — 확정해야 execution_items와 plan_versions가 생긴다.
 * 확정 요청은 기간·강도·목표를 보내지 않는다: 서버가 초안 시점의 값을 갖고 있고,
 * 다시 보내면 초안과 다른 값으로 확정될 수 있다.
 */
export const planAPI = {
    /** 초안 생성. intensity를 생략하면 서버가 직전 계획에서 승계한다. */
    createDraft: ({ startDate, endDate, intensity = null, title = null, instruction = null, courseIds = null }) => {
        return request('/plans/draft', {
            method: 'POST',
            body: JSON.stringify({ startDate, endDate, intensity, title, instruction, courseIds }),
        });
    },

    confirm: (proposalId, { editedItems = null, excludedItemIds = null, title = null, goalSummary = null }) => {
        return request(`/plans/proposals/${proposalId}/confirm`, {
            method: 'POST',
            body: JSON.stringify({ editedItems, excludedItemIds, title, goalSummary }),
        });
    },

    /**
     * 그 날짜를 포함하는 계획 목록. 기간 짧은 순으로 정렬돼 오므로 첫 번째가 대표다 —
     * 화면이 재정렬하지 않는다.
     *
     * courseId를 넘기지 않으면 프로젝트 화면에 기간이 더 짧은 남의 계획이 뜬다.
     */
    findCoveringDate: (date, courseId = null) => {
        const params = new URLSearchParams({ date });
        if (courseId != null) params.append('courseId', String(courseId));
        return request(`/plans?${params.toString()}`);
    },

    get: (planVersionId) => request(`/plans/${planVersionId}`),

    /**
     * 이 계획의 현재 항목. execution-items/range로 기간만 걸러 오면 같은 기간의 다른
     * 계획 항목이 섞이므로 계획 화면은 이 경로를 쓴다.
     */
    items: async (planVersionId) => {
        const data = await request(`/plans/${planVersionId}/items`);
        return (data ?? []).map(toFrontendExecutionItem);
    },

    review: (planVersionId) => request(`/plans/${planVersionId}/review`),

    /**
     * 배치 해제. 롤링 배치를 되돌린다.
     *
     * planningStartDate/EndDate를 함께 보낸다 — 서버가 "그 계획의 기간"을 추론할 수 없다
     * (같은 날짜에 계획이 여럿 걸린다). 안 보내면 미분류로 나가 기간 조회에서 사라진다.
     */
    unschedule: (executionItemId, { planningStartDate, planningEndDate, version, reason = null }) => {
        return request(`/execution-items/${executionItemId}/unschedule`, {
            method: 'PATCH',
            body: JSON.stringify({ planningStartDate, planningEndDate, version, reason }),
        });
    },

    /** 롤링 배치. 결과는 바로 적용된다 — 시각은 unschedule로 즉시 되돌릴 수 있다. */
    place: (planVersionId, windowStart = null) => {
        return request(`/plans/${planVersionId}/place`, {
            method: 'POST',
            body: JSON.stringify({ windowStart }),
        });
    },
};
