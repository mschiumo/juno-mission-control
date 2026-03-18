# 📚 Juno Document Library

**Last Updated:** 2026-02-14
**Purpose:** Central index of all documentation, rules, and systems

---

## 🎯 Core Documentation

### Activity & Logging
| Document | Purpose | Location |
|----------|---------|----------|
| **Activity Logging Rules** | When and how to log all work | `docs/ACTIVITY_LOGGING.md` |
| **Activity Log API** | Dashboard activity tracking | `/api/activity-log` |
| **Cron Results API** | Cron job output storage | `/api/cron-results` |

### System Architecture
| Document | Purpose | Location |
|----------|---------|----------|
| **Migration Guide** | VPS to MacMini migration notes | `docs/MIGRATION_VPS_TO_MACMINI.md` |
| **Knowledge Base** | Technical decisions & patterns | `KNOWLEDGE_BASE.md` |
| **Memory (Long-term)** | Persistent learnings | `MEMORY.md` |

---

## 🗂️ Project Documentation

### Dashboard (`juno-dashboard/`)
| Document | Purpose | Location |
|----------|---------|----------|
| **Dashboard Reports** | Cron report formatting rules | `DASHBOARD_REPORTS.md` |
| **Intergram Setup** | Telegram widget integration | `INTERGRAM_SETUP.md` |
| **README** | Project overview | `README.md` |

### KeepLiving Shopify (`keepliving-shopify/`)
| Document | Purpose | Location |
|----------|---------|----------|
| **README** | Theme documentation | `README.md` |
| **Products** | Product descriptions | `content/products.md` |
| **About Page** | Brand story content | `content/about-page.html` |

---

## 🔧 Scripts & Tools

| Script | Purpose | Location |
|--------|---------|----------|
| **log_activity.sh** | Quick activity logging | `scripts/log_activity.sh` |
| **upload_theme.py** | Shopify theme uploader | `upload_theme.py` |

---

## 📋 Rules & Standards

### Always Follow These Rules:

1. **Activity Logging** (`docs/ACTIVITY_LOGGING.md`)
   - Log all PRs, data changes, bug fixes, features
   - Use correct type: system|user|cron|api
   - Include URL when applicable

2. **GitHub Workflow**
   - All changes through PRs
   - Feature branches: `feature/description`
   - Never push directly to main

3. **Cron Job Architecture**
   - POST output to `/api/cron-results`
   - Include jobName, content, type
   - Set appropriate timeoutSeconds

4. **Communication Style** (MJ Preferences)
   - Direct and concise
   - Percentages over points
   - No Saturn emoji 🪐
   - React to all messages

5. **Memory Management**
   - Log to `memory/YYYY-MM-DD.md` daily
   - Update `MEMORY.md` with key learnings
   - Read MEMORY.md every session

---

## 🎨 Design System

### Colors
- **Primary:** `#ff6b35` (Orange)
- **Success:** `#238636` (Green)
- **Background:** `#0d1117` (Dark)
- **Card BG:** `#161b22` (Darker)
- **Border:** `#30363d` (Gray)

### Components
- Cards: `bg-[#161b22] border border-[#30363d] rounded-lg p-6`
- Buttons Primary: `bg-[#ff6b35] hover:bg-[#ff8c5a]`
- Text Muted: `text-[#8b949e]`

---

## 🔑 API Endpoints

### Dashboard APIs
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/activity-log` | GET/POST | Activity tracking |
| `/api/cron-results` | GET/POST | Cron job storage |
| `/api/cron-status` | GET | Cron job status |
| `/api/goals` | GET/POST/PUT/PATCH/DELETE | Goals CRUD |
| `/api/habit-status` | GET/POST/PUT/DELETE | Habits CRUD |
| `/api/notifications` | GET/POST/PATCH | Notifications |
| `/api/projects` | (inline) | Projects data |

---

## ⏰ Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| Morning Wake-up Check | 7:30 AM EST daily | Daily check-in |
| Morning Market Briefing | 8:00 AM EST weekdays | Market data |
| Mid-Day Trading Check-in | 12:30 PM EST weekdays | Trading discipline |
| Market Close Report | 5:00 PM EST Sun-Thu | Market close data |
| Post-Market Trading Review | 5:00 PM EST Sun-Thu | Trading review |
| Asia Session Update | 7:00 PM EST Sun-Thu | Asia market open |
| London Session Update | 3:00 AM EST Sun-Thu | Europe market open |
| Evening Habit Check-in | 8:00 PM EST daily | Habit review |
| Nightly Task Approval | 10:00 PM EST daily | Task queue |
| Daily Token Usage Summary | 11:00 PM EST daily | Usage stats |
| Activity Log Check | Every 4 hours | Verify logging |
| Monday Gap Scanner Fix Reminder | Monday 8 AM | Gap scanner fix |
| Monday GitHub Token Fix Reminder | Monday 8 AM | Token fix |
| Gap Scanner Monday Test | Monday 9:05 AM | Live test |
| Weekly Habit Review | Friday 7 PM | Weekly review |

---

## 🚫 Disabled Jobs
| Job | Status | Reason |
|-----|--------|--------|
| GitHub PR Monitor #1 | DISABLED | Token expired |
| GitHub PR Monitor #2 | DISABLED | Token expired |

---

## 📊 Environment Variables

Required in Vercel:
- `REDIS_URL` - External Redis connection
- `FINNHUB_API_KEY` - Market data
- `POLYGON_API_KEY` - Gap scanner
- `GITHUB_TOKEN` - PR monitoring (needs refresh)
- `GOOGLE_CALENDAR_CREDENTIALS` - Calendar API (base64)

---

## 🔄 Refresh Cycle

**Every Session I Must:**
1. Read `MEMORY.md`
2. Read `USER.md`
3. Read `SOUL.md`
4. Read `DOCUMENT_LIBRARY.md` (this file)
5. Check `memory/YYYY-MM-DD.md` for today

**Before Completing Any Task:**
1. Check if it needs to be logged
2. Log to Activity Log if yes
3. Update relevant docs if needed

---

## 📈 Active PRs

| PR | Title | Status |
|----|-------|--------|
| #48 | Dashboard improvements + Cron fixes | Open |
| #50 | Goals Notes feature | Open |
| #51 | Habits CRUD | Open |
| #52 | UI responsiveness + Tasks tab | Open |

---

## 🎯 Current Priorities

1. **Monday 8 AM:** Fix Gap Scanner market cap filter
2. **Monday 8 AM:** Fix GitHub token for PR Monitor
3. **Merge PRs #48-52** to production
4. **Overseas Move:** March 2026 preparation

---

*This document is updated whenever new systems, rules, or documentation is created.*
