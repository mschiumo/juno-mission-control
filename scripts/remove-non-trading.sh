#!/bin/bash
# Remove non-trading components and API routes

echo "=== Phase 1: Removing Non-Trading Components ==="

# Components to remove
echo "Removing non-trading components..."
rm -f components/CalendarCard.tsx
rm -f components/GoalsCard.tsx
rm -f components/HabitCard.tsx
rm -f components/DailyReportsCard.tsx
rm -f components/EveningCheckinModal.tsx
rm -f components/EveningCheckinReminder.tsx
rm -f components/ActivityLogCard.tsx
rm -f components/CronJobCard.tsx
rm -f components/DailyCronsCard.tsx
rm -f components/SubagentCard.tsx
rm -f components/ProjectsCard.tsx
rm -f components/NotificationsBell.tsx
rm -f components/MotivationalBanner.tsx
rm -f components/QuickActions.tsx
rm -f components/JunoWidget.tsx

echo "Removing non-trading API routes..."
# Remove non-trading API routes
rm -rf app/api/habits
rm -rf app/api/habit-status
rm -rf app/api/calendar-events
rm -rf app/api/create-event
rm -rf app/api/daily-journal
rm -rf app/api/evening-checkin
rm -rf app/api/goals
rm -rf app/api/cron-jobs
rm -rf app/api/cron-results
rm -rf app/api/cron-status
rm -rf app/api/agent-status
rm -rf app/api/activity-log
rm -rf app/api/subagent-register
rm -rf app/api/subagent-status
rm -rf app/api/subagents
rm -rf app/api/notifications
rm -rf app/api/run-cron

echo "Removing non-trading lib files..."
rm -f lib/habits.ts
rm -f lib/calendar.ts
rm -f lib/goals.ts
rm -f lib/redis.ts

echo "=== Phase 1 Complete ==="
echo ""
echo "Remaining components:"
ls -1 components/*.tsx 2>/dev/null | wc -l
echo "Remaining API routes:"
ls -1 app/api/ 2>/dev/null | wc -l
