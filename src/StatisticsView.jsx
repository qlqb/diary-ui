import  {diaryAPI} from "./api/api.js";
import { useEffect, useState } from 'react';
/**
 * 통계 뷰
 */
function StatisticsView() {
    const [summary, setSummary] = useState(null);
    const [moodStats, setMoodStats] = useState(null);
    const [monthlyStats, setMonthlyStats] = useState(null);
    const [streakStats, setStreakStats] = useState(null);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStatistics();
    }, [selectedYear]);

    const loadStatistics = async () => {
        setLoading(true);

        try {
            const [summaryData, moodData, monthlyData, streakData] = await Promise.all([
                diaryAPI.getStatisticsSummary(),
                diaryAPI.getMoodStatistics(),
                diaryAPI.getMonthlyStatistics(selectedYear),
                diaryAPI.getStreakStatistics(),
            ]);

            setSummary(summaryData);
            setMoodStats(moodData);
            setMonthlyStats(monthlyData);
            setStreakStats(streakData);
        } catch (error) {
            alert('통계를 불러오는데 실패했습니다: ' + error.message);
        }

        setLoading(false);
    };

    if (loading) {
        return <div className="loading">통계 로딩 중...</div>;
    }

    return (
        <div className="statistics-view">
            <h2>📊 나의 일기 통계</h2>

            {/* 요약 통계 */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon">📝</div>
                    <div className="stat-content">
                        <h3>전체 일기</h3>
                        <p className="stat-value">{summary?.totalCount || 0}개</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon">📅</div>
                    <div className="stat-content">
                        <h3>이번 달</h3>
                        <p className="stat-value">{summary?.thisMonthCount || 0}개</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon">⭐</div>
                    <div className="stat-content">
                        <h3>즐겨찾기</h3>
                        <p className="stat-value">{summary?.favoriteCount || 0}개</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon">🔥</div>
                    <div className="stat-content">
                        <h3>연속 작성</h3>
                        <p className="stat-value">{streakStats?.currentStreak || 0}일</p>
                        <p className="stat-sub">최장 {streakStats?.longestStreak || 0}일</p>
                    </div>
                </div>
            </div>

            {/* 기분별 통계 */}
            <div className="stat-section">
                <h3>😊 기분별 통계</h3>
                <div className="mood-stats">
                    {moodStats && Object.entries(moodStats.moodCounts).map(([mood, count]) => {
                        const moodInfo = {
                            HAPPY: { emoji: '😊', label: '행복' },
                            NEUTRAL: { emoji: '😌', label: '평온' },
                            SAD: { emoji: '😢', label: '우울' },
                            EXCITED: { emoji: '🤩', label: '신남' },
                        };

                        const info = moodInfo[mood] || { emoji: '📝', label: mood };
                        const percentage = ((count / moodStats.totalCount) * 100).toFixed(1);

                        return (
                            <div key={mood} className="mood-stat-item">
                                <div className="mood-stat-header">
                                    <span>{info.emoji} {info.label}</span>
                                    <span>{count}개 ({percentage}%)</span>
                                </div>
                                <div className="mood-stat-bar">
                                    <div
                                        className="mood-stat-fill"
                                        style={{ width: `${percentage}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 월별 통계 */}
            <div className="stat-section">
                <div className="section-header">
                    <h3>📈 월별 작성량</h3>
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    >
                        {[2024, 2025, 2026].map(year => (
                            <option key={year} value={year}>{year}년</option>
                        ))}
                    </select>
                </div>

                <div className="monthly-stats">
                    {monthlyStats?.monthlyCounts.map((count, index) => (
                        <div key={index} className="monthly-stat-item">
                            <span className="month">{index + 1}월</span>
                            <div className="monthly-stat-bar">
                                <div
                                    className="monthly-stat-fill"
                                    style={{
                                        height: `${Math.max((count / Math.max(...monthlyStats.monthlyCounts)) * 100, 5)}%`
                                    }}
                                />
                            </div>
                            <span className="count">{count}</span>
                        </div>
                    ))}
                </div>

                <p className="total-text">
                    {selectedYear}년 전체: {monthlyStats?.totalCount || 0}개
                </p>
            </div>
        </div>
    );
}

export default StatisticsView