#!/bin/bash
# Push script for juno-mission-control
# Usage: ./push-to-github.sh YOUR_GITHUB_USERNAME

if [ -z "$1" ]; then
    echo "Usage: ./push-to-github.sh <github-username>"
    echo "Example: ./push-to-github.sh mj"
    exit 1
fi

USERNAME=$1
REPO_URL="https://github.com/$USERNAME/juno-mission-control.git"

echo "🚀 Pushing Juno Mission Control to GitHub..."
echo "Repository: $REPO_URL"

git remote add origin "$REPO_URL" 2>/dev/null || git remote set-url origin "$REPO_URL"
git branch -M main
git push -u origin main

echo "✅ Done! Repository pushed to $REPO_URL"
