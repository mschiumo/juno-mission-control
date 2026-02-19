const { createClient } = require('redis');

const REDIS_URL = 'redis://localhost:6379';
const GOALS_KEY = 'goals_data';
const ACTIVITY_KEY = 'activity_log';

// New notes section to add to Gap Scanner goal
const NEW_NOTES_SECTION = `### Market Data Cron Jobs - Timeout Fixes (2026-02-18)

**Issue:** London Session and Asia Session cron jobs were timing out due to slow web_search calls

**Solution Applied:**
- London Session: Timeout increased from 180s → 240s
- Asia Session: Timeout increased from 120s → 180s
- Simplified web_search queries to 3 targeted searches per job

**Current Status:**
- London Session: Next run tomorrow 3:00 AM EST
- Asia Session: Next run tonight 7:00 PM EST

**Related:** These jobs post market updates to the dashboard's Daily Reports section`;

// New Documents Page goal
const NEW_GOAL = {
  id: `c${Date.now()}`,
  title: "Create Documents Page for Research & Notes",
  phase: "not-started",
  category: "collaborative",
  description: "Build a dedicated Documents page in the dashboard to store research reports, project briefs, and shared notes between MJ and Juno. This will centralize knowledge and make it easier to reference past research and decisions.",
  notes: "## Documents Page\n\n### Purpose\nCentral repository for all research, reports, and notes shared between MJ and Juno\n\n### Content Types\n- Research reports (market analysis, API comparisons, tool research)\n- Project briefs and specifications\n- Meeting notes and decisions\n- Decision logs with rationale\n\n### Features\n- Rich text editing\n- Categorization/tags\n- Search functionality\n- Version history\n\n### Integration\n- Link from Goals, Projects, and other dashboard sections\n- Reference documents in activity logs\n\n### Access\n- Both MJ and Juno can add/edit documents\n- Documents are collaborative and editable",
  junoAssisted: true,
  source: "juno",
  actionItems: []
};

async function main() {
  const client = createClient({ url: REDIS_URL });
  
  client.on('error', (err) => console.error('Redis Client Error:', err));
  
  try {
    await client.connect();
    console.log('Connected to Redis');
    
    // 1. Get current goals
    const storedGoals = await client.get(GOALS_KEY);
    let goals = storedGoals ? JSON.parse(storedGoals) : null;
    
    if (!goals) {
      console.log('No goals found in Redis. Using default structure.');
      goals = {
        yearly: [],
        weekly: [],
        daily: [],
        collaborative: []
      };
    }
    
    // Ensure collaborative category exists
    if (!goals.collaborative) goals.collaborative = [];
    
    console.log('\n=== Current Goals ===');
    console.log(`Yearly: ${goals.yearly?.length || 0} goals`);
    console.log(`Weekly: ${goals.weekly?.length || 0} goals`);
    console.log(`Daily: ${goals.daily?.length || 0} goals`);
    console.log(`Collaborative: ${goals.collaborative?.length || 0} goals`);
    
    // Find Gap Scanner goal
    const gapScannerGoal = goals.collaborative?.find(g => g.id === 'c1771335662046');
    
    if (!gapScannerGoal) {
      console.error('\n❌ Gap Scanner goal not found!');
      console.log('Available collaborative goals:', goals.collaborative?.map(g => ({ id: g.id, title: g.title })));
      process.exit(1);
    }
    
    console.log(`\n✅ Found Gap Scanner goal: "${gapScannerGoal.title}"`);
    
    // 2. Update Gap Scanner goal with new notes
    const existingNotes = gapScannerGoal.notes || '';
    const updatedNotes = existingNotes 
      ? `${existingNotes}\n\n${NEW_NOTES_SECTION}`
      : NEW_NOTES_SECTION;
    
    gapScannerGoal.notes = updatedNotes;
    
    console.log('\n=== Task 1: Updated Gap Scanner Goal Notes ===');
    console.log('Notes added successfully');
    
    // 3. Create new Documents Page goal
    goals.collaborative.push(NEW_GOAL);
    
    console.log('\n=== Task 2: Created New Documents Page Goal ===');
    console.log(`Title: ${NEW_GOAL.title}`);
    console.log(`ID: ${NEW_GOAL.id}`);
    console.log(`Category: ${NEW_GOAL.category}`);
    
    // Save goals back to Redis
    await client.set(GOALS_KEY, JSON.stringify(goals));
    console.log('\n✅ Goals saved to Redis');
    
    // 4. Log activities to Activity Log
    const activityLog = await client.get(ACTIVITY_KEY);
    let activities = activityLog ? JSON.parse(activityLog) : [];
    
    // Activity 1: Gap Scanner notes update
    const activity1 = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      action: "Updated Gap Scanner API Improvements goal",
      details: "Added Market Data Cron Jobs timeout fixes notes (2026-02-18). London Session timeout: 180s→240s, Asia Session timeout: 120s→180s.",
      type: "system"
    };
    
    // Activity 2: New Documents Page goal
    const activity2 = {
      id: (Date.now() + 1).toString(),
      timestamp: new Date().toISOString(),
      action: "Created new collaborative goal: Documents Page",
      details: `Created goal "${NEW_GOAL.title}" (ID: ${NEW_GOAL.id}) for storing research reports, project briefs, and shared notes.`,
      type: "system"
    };
    
    activities.push(activity1, activity2);
    
    // Keep only last 25 activities
    if (activities.length > 25) {
      activities = activities.slice(-25);
    }
    
    await client.set(ACTIVITY_KEY, JSON.stringify(activities));
    console.log('✅ Activities logged to Activity Log');
    
    console.log('\n=== Summary ===');
    console.log('✅ Task 1: Gap Scanner goal notes updated');
    console.log('✅ Task 2: Documents Page goal created');
    console.log('✅ Both actions logged to Activity Log');
    
    await client.disconnect();
    console.log('\nDone!');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
