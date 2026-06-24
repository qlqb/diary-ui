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
    } catch (error) {
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