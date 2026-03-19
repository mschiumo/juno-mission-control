/**
 * Habits API - Get consistency data
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllHabits, getAllHabitRecords } from '@/lib/habits';

function getDateRange(period: string): { startDate: string; endDate: string } {
  const today = new Date();
  const endDate = today.toISOString().split('T')[0];
  
  switch (period) {
    case 'week': {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { startDate: weekAgo.toISOString().split('T')[0], endDate };
    }
    case 'month': {
      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 30);
      return { startDate: monthAgo.toISOString().split('T')[0], endDate };
    }
    case 'quarter': {
      const quarterAgo = new Date(today);
      quarterAgo.setDate(quarterAgo.getDate() - 90);
      return { startDate: quarterAgo.toISOString().split('T')[0], endDate };
    }
    default: {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { startDate: weekAgo.toISOString().split('T')[0], endDate };
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'week';
    const userId = searchParams.get('userId') || 'default';
    
    const { startDate, endDate } = getDateRange(period);
    
    // Get habits and records
    const [habits, records] = await Promise.all([
      getAllHabits(userId),
      getAllHabitRecords(startDate, endDate, userId)
    ]);
    
    // Calculate streaks and stats
    const habitsWithStats = habits.map(habit => {
      const habitRecords = records[habit.id] || [];
      const completedDates = new Set(
        habitRecords.filter(r => r.completed).map(r => r.date)
      );
      
      // Calculate current streak
      let currentStreak = 0;
      const checkDate = new Date();
      while (true) {
        const dateStr = checkDate.toISOString().split('T')[0];
        if (completedDates.has(dateStr)) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          // Check if it's today and not completed yet (doesn't break streak)
          const today = new Date().toISOString().split('T')[0];
          if (dateStr === today) {
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
          }
          break;
        }
      }
      
      // Calculate longest streak
      let longestStreak = 0;
      let tempStreak = 0;
      const sortedDates = Array.from(completedDates).sort();
      
      for (let i = 0; i < sortedDates.length; i++) {
        if (i === 0) {
          tempStreak = 1;
        } else {
          const prev = new Date(sortedDates[i - 1]);
          const curr = new Date(sortedDates[i]);
          const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
          
          if (diff === 1) {
            tempStreak++;
          } else {
            longestStreak = Math.max(longestStreak, tempStreak);
            tempStreak = 1;
          }
        }
      }
      longestStreak = Math.max(longestStreak, tempStreak);
      
      // Calculate completion rate
      const totalDays = Math.ceil(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;
      const completionRate = Math.round((completedDates.size / totalDays) * 100);
      
      return {
        ...habit,
        currentStreak,
        longestStreak,
        completionRate,
        completedDays: completedDates.size,
        totalDays,
        records: habitRecords
      };
    });
    
    // Calculate overall stats
    const totalCompletions = habitsWithStats.reduce((sum, h) => sum + h.completedDays, 0);
    const possibleCompletions = habitsWithStats.reduce((sum, h) => sum + h.totalDays, 0);
    const overallRate = possibleCompletions > 0 
      ? Math.round((totalCompletions / possibleCompletions) * 100)
      : 0;
    
    return NextResponse.json({
      success: true,
      data: {
        habits: habitsWithStats,
        overallStats: {
          totalHabits: habits.length,
          totalCompletions,
          possibleCompletions,
          overallRate,
          bestStreak: Math.max(...habitsWithStats.map(h => h.longestStreak), 0)
        },
        period,
        dateRange: { startDate, endDate }
      }
    });
    
  } catch (error) {
    console.error('Error fetching habits:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch habits' },
      { status: 500 }
    );
  }
}
