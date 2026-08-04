/**
 * API 서비스 모듈
 * Spring Boot 백엔드와 통신하는 함수들
 */

const API_BASE_URL = 'http://localhost:8080/api';

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
 * Todo API
 */
export const todoAPI = {
    /**
     * 오늘 날짜 문자열 반환 (UTC 밀림 방지, 로컬 기준)
     */
    getTodayString,

    /**
     * 날짜별 Todo 목록 조회
     * status 파라미터는 선택 (TODO / DONE / null=전체)
     */
    getTodosByDate: (date, status = null) => {
        const params = new URLSearchParams({ date });
        if (status) params.append('status', status);
        return request(`/todos?${params.toString()}`);
    },

    /**
     * Todo 생성
     */
    createTodo: (todoData) => {
        return request('/todos', {
            method: 'POST',
            body: JSON.stringify(todoData),
        });
    },

    /**
     * Todo 완료 처리 (TODO → DONE)
     */
    markDone: (todoId) => {
        return request(`/todos/${todoId}/done`, {
            method: 'PATCH',
        });
    },

    /**
     * Todo 미완료 처리 (DONE → TODO)
     */
    markTodo: (todoId) => {
        return request(`/todos/${todoId}/todo`, {
            method: 'PATCH',
        });
    },

    /**
     * Todo 삭제 (소프트 삭제)
     */
    deleteTodo: (todoId) => {
        return request(`/todos/${todoId}`, {
            method: 'DELETE',
        });
    },
};

/**
 * ScheduleBlock API
 */
export const scheduleBlockAPI = {
    /**
     * 오늘 날짜 문자열 반환 (UTC 밀림 방지, 로컬 기준)
     */
    getTodayString,

    /**
     * 날짜별 오늘 해볼 것 조회
     */
    getByDate: (date) => {
        const params = new URLSearchParams({ date });
        return request(`/schedule-blocks?${params.toString()}`);
    },

    /**
     * 오늘 해볼 것 생성
     */
    create: (scheduleBlockData) => {
        return request('/schedule-blocks', {
            method: 'POST',
            body: JSON.stringify(scheduleBlockData),
        });
    },

    /**
     * 완료 처리
     */
    complete: (scheduleBlockId) => {
        return request(`/schedule-blocks/${scheduleBlockId}/complete`, {
            method: 'POST',
        });
    },

    /**
     * 완료 취소
     */
    uncomplete: (scheduleBlockId) => {
        return request(`/schedule-blocks/${scheduleBlockId}/uncomplete`, {
            method: 'POST',
        });
    },

    /**
     * 내일 또는 다른 날짜로 이동
     */
    move: (scheduleBlockId, toDate, memo = null) => {
        return request(`/schedule-blocks/${scheduleBlockId}/move`, {
            method: 'POST',
            body: JSON.stringify({ toDate, memo }),
        });
    },

    /**
     * 작게 줄이기
     */
    reduce: (scheduleBlockId, payload) => {
        return request(`/schedule-blocks/${scheduleBlockId}/reduce`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },

    /**
     * 보류
     */
    hold: (scheduleBlockId, memo = null) => {
        return request(`/schedule-blocks/${scheduleBlockId}/hold`, {
            method: 'POST',
            body: JSON.stringify({ memo }),
        });
    },

    /**
     * 삭제
     */
    delete: (scheduleBlockId) => {
        return request(`/schedule-blocks/${scheduleBlockId}`, {
            method: 'DELETE',
        });
    },

    /**
     * 지난 계획 정리(pending) 조회.
     * date는 pending 판단 기준 운영일이며, 이전 block_date의 PLANNED 블록을 반환한다.
     */
    getPending: (date) => {
        const params = new URLSearchParams({ date });
        return request(`/schedule-blocks/pending?${params.toString()}`);
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
        planItemId: pick('planItemId', 'plan_item_id') ?? null,
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
        isFixed: placementType === 'TIME_FIXED',
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
 * scheduleBlockAPI를 대체한다 — schedule_blocks에는 더 이상 쓰지 않는다.
 */
export const executionItemAPI = {
    getTodayString,

    /** 날짜별 실행 조각 조회 */
    getByDate: async (date) => {
        const params = new URLSearchParams({ date });
        const data = await request(`/execution-items?${params.toString()}`);
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

    /** 다른 날짜로 이동 */
    move: async (executionItemId, toDate, version, reason = null) => {
        const data = await request(`/execution-items/${executionItemId}/move`, {
            method: 'POST',
            body: JSON.stringify({ toDate, version, reason }),
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

    /** 보류 */
    hold: async (executionItemId, version, reason = null) => {
        const data = await request(`/execution-items/${executionItemId}/hold`, {
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
 * AI 상담 대화 API. 자유 대화 -> (필요하면) 계획 초안 제안 -> 사용자 요청/동의 시에만
 * Proposal 생성까지, 대화 하나의 흐름으로 이어진다.
 */
export const conversationAPI = {
    /** 대화 시작. scope를 생략하면 서버가 TODAY로 시작한다 */
    create: (scope = 'TODAY') => {
        return request('/ai/conversations', {
            method: 'POST',
            body: JSON.stringify({ scope }),
        });
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
};