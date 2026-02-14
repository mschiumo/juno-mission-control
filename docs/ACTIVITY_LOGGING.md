# Activity Logging System

## Rule: Log Everything Significant

**Always log to `/api/activity-log` when you:**
- Create/update/delete any data (goals, habits, projects, etc.)
- Create or modify PRs
- Deploy changes
- Fix bugs
- Add new features
- Run significant cron jobs
- Make configuration changes

## Quick Log Template

```bash
curl -X POST https://juno-mission-control.vercel.app/api/activity-log \
  -H "Content-Type: application/json" \
  -d '{
    "action": "Brief action description",
    "details": "Detailed explanation of what was done",
    "type": "system|user|cron|api",
    "url": "optional-link-to-pr-or-resource"
  }'
```

## Types
- **system** - Automated/system changes
- **user** - User-requested changes  
- **cron** - Scheduled job execution
- **api** - API/database changes

## Examples

**Creating a PR:**
```json
{
  "action": "Created PR #52 - UI Responsiveness Fixes",
  "details": "Fixed text overflow, added Tasks tab, moved Projects",
  "type": "system",
  "url": "https://github.com/mschiumo/juno-mission-control/pull/52"
}
```

**Updating a Goal:**
```json
{
  "action": "Advanced Goal to In-Progress",
  "details": "Moved 'Research Apify' to In-Progress with research notes",
  "type": "user"
}
```

**Cron Job:**
```json
{
  "action": "Morning Market Briefing Executed",
  "details": "Posted S&P 500, Nasdaq, Dow futures data",
  "type": "cron"
}
```

## Checklist

Before completing any task, ask:
- [ ] Did I create/modify any data? → **LOG IT**
- [ ] Did I create a PR? → **LOG IT**
- [ ] Did I fix a bug? → **LOG IT**
- [ ] Did I add a feature? → **LOG IT**
- [ ] Did a cron job run? → **LOG IT** (if significant)

## When in Doubt

**If you're not sure if something is significant enough to log - LOG IT ANYWAY.**

It's better to have too much visibility than too little.

---

## PR Creation Process (CRITICAL)

**Rule: Always verify builds before notifying user**

When creating a PR:

1. **Create the PR** with proper title/description
2. **WAIT for Vercel build** to complete (~1-2 minutes)
3. **Check build status** - must be "success"
4. **If build fails:**
   - Fix errors immediately (without user intervention if possible)
   - Commit fixes to the same branch
   - Re-check build status
   - Repeat until build passes
5. **Only THEN** notify user that PR is ready

**Why:** Users shouldn't have to deal with broken builds. Fix it first, then announce.

**Build Error Patterns to Check:**
- TypeScript errors (`npx tsc --noEmit`)
- Missing closing tags in JSX (`>`, `/>`)
- Import errors
- Syntax errors

**Self-Fix Priority:**
1. Missing brackets/tags (common)
2. TypeScript type issues
3. Import/export fixes
4. Only ask user if truly blocked
