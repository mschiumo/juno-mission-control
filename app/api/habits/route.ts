/**
 * Habits API - Daily tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllHabits, getHabitRecords, recordHabit } from '@/lib/habits';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    
    const habits = await getAllHabits(userId);
    
    // Get today's records for each habit
    const habitsWithStatus = await Promise.all(
      habits.map(async (habit) => {
        const records = await getHabitRecords(habit.id, date, date, userId);
        const todayRecord = records.find(r => r.date === date);
        
        // Calculate current streak
        let streak = 0;
        const checkDate = new Date();
        while (true) {
          const dateStr = checkDate.toISOString().split('T')[0];
          const dayRecords = await getHabitRecords(habit.id, dateStr, dateStr, userId);
          const completed = dayRecords.some(r => r.completed);
          
          if (completed) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            // Don't break streak for today if not yet completed
            const today = new Date().toISOString().split('T')[0];
            if (dateStr === today) {
              checkDate.setDate(checkDate.getDate() - 1);
              continue;
            }
            break;
          }
        }
        
        return {
          ...habit,
          completed: todayRecord?.completed || false,
          streak
        };
      })
    );
    
    return NextResponse.json({
      success: true,
      data: {
        habits: habitsWithStatus,
        date
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { habitId, date, completed, userId = 'default' } = body;
    
    if (!habitId || !date) {
      return NextResponse.json(
        { success: false, error: 'Missing habitId or date' },
        { status: 400 }
      );
    }
    
    await recordHabit(habitId, date, completed, userId);
    
    return NextResponse.json({
      success: true,
      message: `Habit ${completed ? 'completed' : 'uncompleted'} successfully`
    });
    
  } catch (error) {
    console.error('Error recording habit:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to record habit' },
      { status: 500 }
    );
  }
}
