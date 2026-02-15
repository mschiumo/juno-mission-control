#!/bin/bash
# Apply cron job timeout fixes
# Run this script to update the cron jobs with optimized settings

echo "Applying cron job timeout fixes..."

# Daily Motivational Message - reduced timeout, static quotes
echo "Updating Daily Motivational Message..."
openclaw cron edit 73d12d70-c138-477e-bc3a-9a419a48d1a0 \
  --file cron-daily-motivational.yaml

# Morning Market Briefing - optimized search, increased timeout slightly
echo "Updating Morning Market Briefing..."
openclaw cron edit eec931e9-19ed-4f29-9177-2d963b7daee2 \
  --file cron-morning-market.yaml

# Nightly Task Approval - increased timeout from 60s to 120s
echo "Updating Nightly Task Approval..."
openclaw cron edit c0ffc357-5677-456c-abd9-e6eb8822d377 \
  --file cron-nightly-task-approval.yaml

# Nightly Goals Audit - added model fallback support
echo "Updating Nightly Goals Audit..."
openclaw cron edit 5f620420-b269-4579-a3cb-7f26785dcb1b \
  --file cron-nightly-goals-audit.yaml

echo "All cron jobs updated!"
echo ""
echo "Verifying changes..."
openclaw cron list
