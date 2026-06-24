import { useState } from 'react';
import DiaryCard from "./DiaryCard.jsx";

/**
 * 일기 목록 뷰
 */
function DiaryListView({
                           diaries,
                           searchKeyword,
                           onSearchChange,
                           onSearch,
                           filter,
                           onFilterChange,
                           currentPage,
                           totalPages,
                           onPageChange,
                           onEdit,
                           onDelete,
                           onToggleFavorite,
                           loading
                       }) {
    // 검색어 입력 시 디바운스 적용
    const [searchTimer, setSearchTimer] = useState(null);

    const handleSearchInput = (e) => {
        const value = e.target.value;
        onSearchChange(value);

        // 이전 타이머 취소
        if (searchTimer) {
            clearTimeout(searchTimer);
        }

        // 500ms 후 검색 실행
        const timer = setTimeout(() => {
            onSearch();
        }, 500);

        setSearchTimer(timer);
    };

    return (
        <div className="diary-list-view">
            {/* 검색 및 필터 */}
            <div className="search-filter-section">
                <div className="search-box">
                    <input
                        type="text"
                        placeholder="일기 검색... (제목, 내용)"
                        value={searchKeyword}
                        onChange={handleSearchInput}
                    />
                    <button onClick={onSearch}>검색</button>
                </div>

                <div className="filter-box">
                    <select
                        value={filter.mood || ''}
                        onChange={(e) => onFilterChange({ ...filter, mood: e.target.value || undefined })}
                    >
                        <option value="">전체 기분</option>
                        <option value="HAPPY">😊 행복</option>
                        <option value="NEUTRAL">😌 평온</option>
                        <option value="SAD">😢 우울</option>
                        <option value="EXCITED">🤩 신남</option>
                    </select>

                    <select
                        value={filter.favorite === undefined ? '' : filter.favorite}
                        onChange={(e) => {
                            const val = e.target.value;
                            onFilterChange({
                                ...filter,
                                favorite: val === '' ? undefined : val === 'true'
                            });
                        }}
                    >
                        <option value="">전체</option>
                        <option value="true">⭐ 즐겨찾기</option>
                        <option value="false">일반</option>
                    </select>
                </div>
            </div>

            {/* 일기 목록 */}
            {loading ? (
                <div className="loading">로딩 중...</div>
            ) : diaries.length === 0 ? (
                <div className="empty-state">
                    <p>작성된 일기가 없습니다</p>
                    <p>첫 번째 일기를 작성해보세요!</p>
                </div>
            ) : (
                <div className="diary-list">
                    {diaries.map((diary) => (
                        <DiaryCard
                            key={diary.diaryId}
                            diary={diary}
                            onEdit={() => onEdit(diary)}
                            onDelete={() => onDelete(diary.diaryId)}
                            onToggleFavorite={() => onToggleFavorite(diary.diaryId)}
                        />
                    ))}
                </div>
            )}

            {/* 페이지네이션 */}
            {totalPages > 1 && (
                <div className="pagination">
                    <button
                        disabled={currentPage <= 1}
                        onClick={() => onPageChange(currentPage - 1)}
                    >
                        이전
                    </button>

                    <span>
                      {currentPage} / {totalPages}
                    </span>

                    <button
                        disabled={currentPage >= totalPages}
                        onClick={() => onPageChange(currentPage + 1)}
                    >
                        다음
                    </button>
                </div>
            )}
        </div>
    );
}

export default DiaryListView