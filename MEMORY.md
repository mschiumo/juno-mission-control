# MEMORY.md - Key Learnings & Decisions

## Redis Storage Lessons

### Lesson: Vercel KV (Serverless Redis) Loses Data
**What happened:** Dashboard reports kept disappearing after deploys
**Root cause:** Vercel KV is ephemeral - data resets on instance restarts
**Solution:** Use external Redis provider (Redis Labs, Upstash) with persistence

### Implementation Pattern
```typescript
// Use REDIS_URL env var for external Redis
const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});
```

## Cron Job Architecture

### Pattern: POST to Dashboard API
All cron jobs should POST their output to `/api/cron-results`:
1. Generate content
2. POST to dashboard API (stores in Redis)
3. Send Telegram message (if needed)

This ensures reports persist and are viewable in the dashboard.

## Dashboard Design Decisions

### Tab Navigation
- **Dashboard tab:** Grid layout with all cards
- **Activity Log tab:** Single full-width view
- Keeps interface clean while allowing detailed views

### Daily Reports Filter
**Key insight:** Only cron jobs appear in Daily Reports, not manual test posts
- Redis Connection Test (manual) → NOT shown
- Morning Market Briefing (cron job) → Shown

**Filtered from UI (Telegram only):**
- Mid-Day Trading Check-in
- Post-Market Trading Review

**Missing reports:** Show hover tooltip with next scheduled time instead of allowing click

### Refresh UX Pattern
- Show spinner during loading (`animate-spin`)
- Display "updated Xs ago" after refresh
- Disabled button state while loading

## Calendar Integration

### Google Calendar API Issues
- Service account needs explicit calendar sharing
- User must add `juno-calendar@...` with "See all event details" permission
- Fallback to mock data if permissions fail (for dev)

## GitHub Workflow

### PR-Based Development
- All changes go through PRs
- Each feature gets its own branch
- Review and merge via GitHub UI
- Vercel auto-deploys on merge

## Key Preferences (MJ)

### Communication
- Direct, concise
- Percentages over points
- No Saturn emoji
- React to all messages

### Workflow
- Trello for task tracking
- GitHub PRs for code
- Nightly task approval at 10 PM
- Prefers reviewing outputs vs fire-and-forget

### Calendar
- All Juno events use Tangerine color (#6)
- EST timezone for all displays
- Frameworks auto-recurring with reminders
