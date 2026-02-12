#!/bin/bash
# Setup script for Juno Mission Control Dashboard
# Run this after creating the GitHub repository

set -e

echo "🚀 Setting up Juno Mission Control Dashboard..."

# Check if repo URL is provided
if [ -z "$1" ]; then
    echo "Usage: ./setup-repo.sh <github-repo-url>"
    echo "Example: ./setup-repo.sh https://github.com/mj/juno-mission-control.git"
    exit 1
fi

REPO_URL=$1

# Add remote and push
echo "📤 Pushing code to GitHub..."
git remote add origin "$REPO_URL" 2>/dev/null || git remote set-url origin "$REPO_URL"
git branch -M main
git push -u origin main

echo "✅ Code pushed successfully!"
echo ""
echo "Next steps:"
echo "1. Go to your GitHub repository"
echo "2. Copy .env.local.example to .env.local and fill in your credentials"
echo "3. Deploy to Vercel: https://vercel.com/new"
echo ""
echo "🎉 Juno Mission Control is ready for deployment!"
