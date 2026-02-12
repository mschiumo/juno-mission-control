# 🚀 Quick Setup Guide for MJ

## Option 1: Create Repo via GitHub Website (Easiest)

1. Go to https://github.com/new
2. Repository name: `juno-mission-control`
3. Set to **Public** or **Private** (your choice)
4. **DO NOT** initialize with README (we already have one)
5. Click **Create repository**
6. Copy the repository URL (e.g., `https://github.com/mj/juno-mission-control.git`)
7. Run this command in the juno-dashboard folder:
   ```bash
   ./setup-repo.sh https://github.com/YOUR_USERNAME/juno-mission-control.git
   ```

## Option 2: Create Repo via GitHub CLI

If you have `gh` installed and authenticated:

```bash
# Install gh if needed
# Mac: brew install gh
# Windows: winget install GitHub.cli
# Linux: see https://github.com/cli/cli#installation

# Login to GitHub
gg auth login

# Create the repository
cd /home/clawd/.openclaw/workspace/juno-dashboard
gh repo create juno-mission-control --public --source=. --push
```

## Option 3: Manual Push

```bash
cd /home/clawd/.openclaw/workspace/juno-dashboard
git remote add origin https://github.com/YOUR_USERNAME/juno-mission-control.git
git branch -M main
git push -u origin main
```

## After Repository is Created

### 1. Set Up Environment Variables

Copy the example file and fill in your credentials:

```bash
cp .env.local.example .env.local
# Edit .env.local with your credentials
```

### 2. Deploy to Vercel

**One-click deploy:**
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

**Or manually:**
1. Go to https://vercel.com/new
2. Import your `juno-mission-control` repository
3. Add environment variables from `.env.local`
4. Deploy!

### 3. Configure Domain (Optional)

Add custom domain in Vercel dashboard:
- Settings → Domains → Add
- Or use the default `.vercel.app` URL

## Repository Structure

```
juno-mission-control/
├── app/              # Next.js app router
├── components/       # React components
├── lib/              # Utility functions
├── .github/          # GitHub Actions
├── .env.local.example # Environment template
└── README.md         # Full documentation
```

## Need Help?

- Check `README.md` for full documentation
- API routes are in `app/api/`
- Components are in `components/`
- Environment variables template in `.env.local.example`

---

**Status:** Code is ready and committed locally ✅  
**Next:** Create GitHub repo and push 🚀
