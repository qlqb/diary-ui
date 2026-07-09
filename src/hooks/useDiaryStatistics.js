import { useCallback, useEffect, useState } from 'react';
import { diaryAPI } from '../api/api.js';

export function useDiaryStatistics(selectedYear) {
    const [summary, setSummary] = useState(null);
    const [moodStats, setMoodStats] = useState(null);
    const [monthlyStats, setMonthlyStats] = useState(null);
    const [streakStats, setStreakStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadStatistics = useCallback(async () => {
        setLoading(true);
        setError(null);

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
            setError(error);
            alert('통계를 불러오는데 실패했습니다: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [selectedYear]);

    useEffect(() => {
        loadStatistics();
    }, [loadStatistics]);

    return {
        summary,
        moodStats,
        monthlyStats,
        streakStats,
        loading,
        error,
        refetch: loadStatistics,
    };
}
