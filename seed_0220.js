const { createClient } = require('redis');

async function seed() {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  
  // 02/20 data - all habits completed
  const habitsData = [
    { id: 'make-bed', name: 'Make Bed', icon: '🛏️', target: 'Daily', category: 'productivity', completedToday: true, streak: 1, history: [false,false,false,false,false,false,true], order: 0 },
    { id: 'take-meds', name: 'Take Meds (Morning)', icon: '💊', target: 'Daily', category: 'health', completedToday: true, streak: 1, history: [false,false,false,false,false,false,true], order: 1 },
    { id: 'market-brief', name: 'Read Market Brief, Stock Screeners', icon: '📈', target: 'Weekdays', category: 'trading', completedToday: true, streak: 1, history: [false,false,false,false,false,false,true], order: 2 },
    { id: 'exercise', name: 'Exercise / Lift', icon: '💪', target: '4x/week', category: 'fitness', completedToday: true, streak: 1, history: [false,false,false,false,false,false,true], order: 3 },
    { id: 'read', name: 'Read', icon: '📚', target: '30 min', category: 'learning', completedToday: true, streak: 1, history: [false,false,false,false,false,false,true], order: 4 },
    { id: 'drink-water', name: 'Drink Water', icon: '💧', target: '2L daily', category: 'health', completedToday: true, streak: 1, history: [false,false,false,false,false,false,true], order: 5 },
    { id: 'journal', name: 'Journal', icon: '📝', target: 'Daily', category: 'mindfulness', completedToday: true, streak: 1, history: [false,false,false,false,false,false,true], order: 6 },
    { id: 'trade-journal', name: 'Trade Journal', icon: '📊', target: 'Trading days', category: 'trading', completedToday: true, streak: 1, history: [false,false,false,false,false,false,true], order: 7 }
  ];
  
  await client.set('habits_data:2026-02-20', JSON.stringify(habitsData));
  console.log('✅ Seeded 02/20 with 100% completion');
  
  // Check for custom habits in wrong date keys
  const keys = await client.keys('habits_data:2026-*');
  console.log('Found keys:', keys);
  
  for (const key of keys) {
    const data = await client.get(key);
    const habits = JSON.parse(data);
    const customHabits = habits.filter(h => !['make-bed','take-meds','market-brief','exercise','read','drink-water','journal','trade-journal'].includes(h.id));
    if (customHabits.length > 0) {
      console.log(`Custom habits in ${key}:`, customHabits.map(h => h.name));
    }
  }
  
  await client.disconnect();
}

seed().catch(console.error);
