import { NextResponse } from 'next/server';

export async function GET() {
  // Placeholder habit data
  // In production, this would fetch from a database
  const today = new Date().toISOString().split('T')[0];
  
  const habits = [
    {
      id: '1',
      name: 'Morning Meditation',
      icon: '🧘',
      streak: 12,
      completedToday: true,
      target: '10 min',
      category: 'wellness',
      history: [true, true, true, true, false, true, true]
    },
    {
      id: '2',
      name: 'Read 30 Minutes',
      icon: '📚',
      streak: 5,
      completedToday: true,
      target: '30 min',
      category: 'learning',
      history: [true, false, true, true, true, false, true]
    },
    {
      id: '3',
      name: 'Exercise',
      icon: '💪',
      streak: 3,
      completedToday: false,
      target: '45 min',
      category: 'fitness',
      history: [false, true, true, false, true, true, false]
    },
    {
      id: '4',
      name: 'Drink 2L Water',
      icon: '💧',
      streak: 8,
      completedToday: true,
      target: '8 glasses',
      category: 'health',
      history: [true, true, true, true, true, true, true]
    },
    {
      id: '5',
      name: 'Journal',
      icon: '📝',
      streak: 21,
      completedToday: false,
      target: 'Daily entry',
      category: 'mindfulness',
      history: [true, true, true, true, true, true, false]
    }
  ];

  const stats = {
    totalHabits: habits.length,
    completedToday: habits.filter(h => h.completedToday).length,
    longestStreak: Math.max(...habits.map(h => h.streak)),
    weeklyCompletion: Math.round(
      habits.reduce((acc, h) => acc + h.history.filter(Boolean).length, 0) / 
      (habits.length * 7) * 100
    )
  };

  return NextResponse.json({ 
    success: true, 
    data: {
      habits,
      stats,
      date: today
    },
    timestamp: new Date().toISOString()
  });
}
