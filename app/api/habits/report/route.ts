import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { getTodayInEST } from '@/lib/date-utils';

const HABITS_KEY_PREFIX = 'habits_data';
const DAILY_RECORD_PREFIX = 'habits:daily-record';

interface HabitData {
  id: string;
  name: string;
  icon: string;
  target: string;
  category: string;
  completedToday: boolean;
  streak: number;
  history: boolean[];
  order: number;
}

interface HabitStats {
  id: string;
  name: string;
  icon: string;
  category: string;
  target: string;
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  completionRate7d: number;
  completionRate30d: number;
  last7Days: boolean[];
  last30Days: boolean[];
  trend: 'improving' | 'stable' | 'declining';
  missedLast7Days: number;
  missedLast30Days: number;
}

interface HabitReport {
  generatedAt: string;
  period: {
    startDate: string;
    endDate: string;
    days: number;
  };
  summary: {
    totalHabits: number;
    overallCompletionRate7d: number;
    overallCompletionRate30d: number;
    habitsMetTarget: number;
    habitsAtRisk: number;
    habitsDeclining: number;
  };
  habits: HabitStats[];
  insights: {
    bestPerforming: HabitStats[];
    needsAttention: HabitStats[];
    atRisk: HabitStats[];
    recommendations: string[];
  };
  dailyBreakdown: Array<{
    date: string;
    completedCount: number;
    totalCount: number;
    completionRate: number;
  }>;
}

function getPreviousDate(dateStr: string, daysBack: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - daysBack);
  
  const prevYear = date.getFullYear();
  const prevMonth = String(date.getMonth() + 1).padStart(2, '0');
  const prevDay = String(date.getDate()).padStart(2, '0');
  return `${prevYear}-${prevMonth}-${prevDay}`;
}

function calculateStreakFromHistory(history: boolean[], completedToday: boolean): number {
  let streak = 0;
  
  if (completedToday) {
    streak = 1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i]) {
        streak++;
      } else {
        break;
      }
    }
  } else {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i]) {
        streak++;
      } else {
        break;
      }
    }
  }
  
  return streak;
}

function calculateTrend(last14Days: boolean[]): 'improving' | 'stable' | 'declining' {
  if (last14Days.length < 7) return 'stable';
  
  const firstWeek = last14Days.slice(0, 7).filter(Boolean).length;
  const secondWeek = last14Days.slice(7, 14).filter(Boolean).length;
  
  const diff = secondWeek - firstWeek;
  if (diff >= 2) return 'improving';
  if (diff <= -2) return 'declining';
  return 'stable';
}

/**
 * GET /api/habits/report
 * 
 * Generates a comprehensive habits report with streaks and analysis
 * Query params:
 * - days: number of days to analyze (default: 30, max: 90)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const daysParam = parseInt(searchParams.get('days') || '30', 10);
    const days = Math.min(Math.max(daysParam, 7), 90); // Clamp between 7 and 90
    
    const today = getTodayInEST();
    const redis = await getRedisClient();
    
    if (!redis) {
      return NextResponse.json(
        { success: false, error: 'Redis not available' },
        { status: 503 }
      );
    }
    
    // Fetch habit data for the specified period
    const dailyData: Map<string, HabitData[]> = new Map();
    const startDate = getPreviousDate(today, days - 1);
    
    for (let i = 0; i < days; i++) {
      const date = getPreviousDate(today, i);
      
      // Try daily record first, then fall back to habits data
      const dailyRecordKey = `${DAILY_RECORD_PREFIX}:${date}`;
      const habitsKey = `${HABITS_KEY_PREFIX}:${date}`;
      
      let data = await redis.get(dailyRecordKey);
      if (data) {
        const record = JSON.parse(data);
        dailyData.set(date, record.habits);
      } else {
        data = await redis.get(habitsKey);
        if (data) {
          dailyData.set(date, JSON.parse(data));
        }
      }
    }
    
    // Get current habits configuration (for habit list)
    const todayKey = `${HABITS_KEY_PREFIX}:${today}`;
    const todayData = await redis.get(todayKey);
    const currentHabits: HabitData[] = todayData ? JSON.parse(todayData) : [];
    
    if (currentHabits.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No habits configured' },
        { status: 404 }
      );
    }
    
    // Calculate stats for each habit
    const habitStats: HabitStats[] = currentHabits.map(habit => {
      const completions: boolean[] = [];
      let longestStreak = 0;
      let currentStreak = 0;
      let streakCount = 0;
      let totalCompletions = 0;
      
      // Walk through days and collect completion data
      const sortedDates = Array.from(dailyData.keys()).sort();
      for (const date of sortedDates) {
        const dayHabits = dailyData.get(date) || [];
        const dayHabit = dayHabits.find(h => h.id === habit.id);
        const completed = dayHabit?.completedToday || false;
        completions.push(completed);
        
        if (completed) {
          streakCount++;
          totalCompletions++;
          longestStreak = Math.max(longestStreak, streakCount);
        } else {
          streakCount = 0;
        }
      }
      
      // Calculate current streak using history + today's data
      const last7Days = completions.slice(-7);
      const last30Days = completions.slice(-30);
      const last14Days = completions.slice(-14);
      
      const completedToday = habit.completedToday;
      currentStreak = calculateStreakFromHistory(last7Days.slice(0, -1), completedToday);
      
      // Calculate completion rates
      const completionRate7d = last7Days.length > 0 
        ? Math.round((last7Days.filter(Boolean).length / last7Days.length) * 100)
        : 0;
      
      const completionRate30d = last30Days.length > 0
        ? Math.round((last30Days.filter(Boolean).length / last30Days.length) * 100)
        : 0;
      
      // Calculate trend
      const trend = calculateTrend(last14Days);
      
      return {
        id: habit.id,
        name: habit.name,
        icon: habit.icon,
        category: habit.category,
        target: habit.target,
        currentStreak,
        longestStreak: Math.max(longestStreak, currentStreak),
        totalCompletions,
        completionRate7d,
        completionRate30d,
        last7Days,
        last30Days: last30Days.slice(-30),
        trend,
        missedLast7Days: 7 - last7Days.filter(Boolean).length,
        missedLast30Days: 30 - last30Days.filter(Boolean).length
      };
    });
    
    // Calculate daily breakdown
    const dailyBreakdown = Array.from(dailyData.keys())
      .sort()
      .map(date => {
        const habits = dailyData.get(date) || [];
        const completedCount = habits.filter(h => h.completedToday).length;
        return {
          date,
          completedCount,
          totalCount: habits.length,
          completionRate: habits.length > 0 
            ? Math.round((completedCount / habits.length) * 100)
            : 0
        };
      });
    
    // Calculate summary stats
    const overallCompletionRate7d = Math.round(
      habitStats.reduce((sum, h) => sum + h.completionRate7d, 0) / habitStats.length
    );
    
    const overallCompletionRate30d = Math.round(
      habitStats.reduce((sum, h) => sum + h.completionRate30d, 0) / habitStats.length
    );
    
    // Categorize habits
    const bestPerforming = habitStats
      .filter(h => h.completionRate7d >= 80)
      .sort((a, b) => b.completionRate7d - a.completionRate7d);
    
    const needsAttention = habitStats
      .filter(h => h.completionRate7d < 50 || h.trend === 'declining')
      .sort((a, b) => a.completionRate7d - b.completionRate7d);
    
    const atRisk = habitStats
      .filter(h => h.completionRate7d < 30 && h.currentStreak === 0)
      .sort((a, b) => a.completionRate7d - b.completionRate7d);
    
    // Generate recommendations
    const recommendations: string[] = [];
    
    if (atRisk.length > 0) {
      recommendations.push(
        `🚨 ${atRisk.length} habit${atRisk.length > 1 ? 's are' : ' is'} at risk. Consider setting reminders or reducing complexity.`
      );
    }
    
    if (needsAttention.length > 0) {
      const declining = needsAttention.filter(h => h.trend === 'declining');
      if (declining.length > 0) {
        recommendations.push(
          `📉 ${declining.length} habit${declining.length > 1 ? 's are' : ' is'} declining. Review what changed recently.`
        );
      }
    }
    
    const habitsMetTarget = habitStats.filter(h => h.completionRate7d >= 70).length;
    if (habitsMetTarget === habitStats.length) {
      recommendations.push('🎉 All habits meeting target! Keep up the great work!');
    } else if (habitsMetTarget >= habitStats.length * 0.7) {
      recommendations.push('👍 Most habits on track. Focus on the struggling ones.');
    }
    
    // Find best streak
    const bestStreakHabit = habitStats.reduce((best, current) => 
      current.currentStreak > best.currentStreak ? current : best
    );
    if (bestStreakHabit.currentStreak >= 7) {
      recommendations.push(
        `🔥 ${bestStreakHabit.name} has a ${bestStreakHabit.currentStreak}-day streak! Great consistency!`
      );
    }
    
    const report: HabitReport = {
      generatedAt: new Date().toISOString(),
      period: {
        startDate,
        endDate: today,
        days
      },
      summary: {
        totalHabits: habitStats.length,
        overallCompletionRate7d,
        overallCompletionRate30d,
        habitsMetTarget,
        habitsAtRisk: atRisk.length,
        habitsDeclining: habitStats.filter(h => h.trend === 'declining').length
      },
      habits: habitStats,
      insights: {
        bestPerforming,
        needsAttention,
        atRisk,
        recommendations
      },
      dailyBreakdown
    };
    
    return NextResponse.json({
      success: true,
      data: report
    });
    
  } catch (error) {
    console.error('Habits report error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to generate habits report',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
