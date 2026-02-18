# AI Agency Architecture

> **Document Version:** 1.0  
> **Created:** 2026-02-18  
> **Author:** Juno (VP Operations)  
> **Status:** Draft

---

## 1. Overview

This document defines the architecture for a **multi-agent, multi-model AI system** designed to operate as a cohesive digital agency. The system leverages specialized agents running on different AI models to optimize for both cost and capability.

### Core Principles

1. **Specialization over Generalization** - Spawn domain-specific agents for specific tasks
2. **Model Optimization** - Use the right model for the right job (Kimi for operations/coordination, Sonnet for coding/creative)
3. **Hierarchical Supervision** - Clear reporting structure with Juno as VP of Operations
4. **Cost Efficiency** - Only spawn specialist agents when needed, use subagents for isolated tasks

---

## 2. Agent Roles

### 2.1 Juno (VP Operations)

| Attribute | Value |
|-----------|-------|
| **Model** | Kimi K2.5 |
| **Role** | VP of Operations, supervisory coordinator |
| **Responsibilities** | Task orchestration, agent spawning, quality review, escalation handling |
| **Decision Authority** | Can spawn agents, approve PRs, create goals, delegate tasks |

**Primary Functions:**
- Monitor all subagent activity
- Spawn specialists for specific domains
- Review and merge PRs (when explicitly approved by MJ)
- Create and update goals in the dashboard
- Handle escalations from specialist agents
- Maintain Activity Log and system documentation

### 2.2 KeepLiving-Shopify Agent

| Attribute | Value |
|-----------|-------|
| **Model** | Claude Sonnet 4.6 |
| **Domain** | E-commerce, Shopify theme development |
| **Responsibilities** | Theme modifications, product management, store optimization |
| **Spawn Trigger** | Shopify-related tasks |

**Specialized Skills:**
- Shopify Liquid templating
- Theme customization and bug fixes
- Product catalog management
- Store performance optimization
- Shopify API integration

### 2.3 Content-Creator Agent

| Attribute | Value |
|-----------|-------|
| **Model** | Claude Sonnet 4.6 |
| **Domain** | Social media, Buffer automation, content strategy |
| **Responsibilities** | Content creation, scheduling, social media management |
| **Spawn Trigger** | Content marketing tasks |

**Specialized Skills:**
- Buffer API automation
- Social media content creation
- Scheduling and campaign management
- Cross-platform content adaptation
- Analytics and engagement tracking

### 2.4 Future Agents (Roadmap)

| Agent | Domain | Model | Priority |
|-------|--------|-------|----------|
| Trading-Analyst | Market analysis, trading strategies | Sonnet 4.6 | Medium |
| Code-Reviewer | PR review, code quality | Sonnet 4.6 | Medium |
| Research-Assistant | Web research, data gathering | Kimi K2.5 | Low |
| Calendar-Manager | Schedule optimization | Kimi K2.5 | Low |

---

## 3. Communication Flow

### 3.1 Reporting Structure

```
┌─────────────────────────────────────┐
│         Juno (VP Operations)        │
│           Kimi K2.5                 │
│    Supervision & Coordination       │
└─────────────┬───────────────────────┘
              │
    ┌─────────┼─────────┐
    │         │         │
    ▼         ▼         ▼
┌───────┐ ┌───────┐ ┌───────────┐
│KeepLiv│ │Content│ │ Future    │
│-Shopify│ │Creator│ │ Agents    │
│Sonnet │ │Sonnet │ │ ...       │
└───────┘ └───────┘ └───────────┘
```

### 3.2 How Agents Report to Juno

**Standard Reporting Pattern:**

1. **Task Assignment** - Juno spawns specialist agent with clear instructions
2. **Progress Updates** - Subagent logs to Activity Log during execution
3. **Completion Report** - Subagent returns final summary to parent (Juno)
4. **Review & Approval** - Juno reviews output, requests changes if needed
5. **Documentation** - Juno logs completion to Activity Log

**Communication Methods:**

| Method | Use Case | Example |
|--------|----------|---------|
| Return values | Task completion summary | Subagent returns findings to parent |
| Activity Log | Audit trail, progress tracking | POST to `/api/activity-log` |
| File updates | Documentation, reports | Write to `memory/`, `docs/` |
| Goals API | Milestones, collaborative tracking | POST to `/api/goals` |
| PR Comments | Code review feedback | GitHub PR API |

**Escalation Path:**
- Specialist agent encounters blocker → Return to Juno with context
- Juno assesses: resolve directly, respawn, or escalate to MJ
- Critical issues → Immediate notification to MJ

---

## 4. Model Strategy

### 4.1 When to Use Kimi K2.5

**Strengths:**
- Long context handling (excellent for large codebases)
- Strong reasoning and planning
- Good for orchestration and coordination
- Cost-effective for long-context tasks

**Use For:**
- Supervisory roles (Juno)
- Large codebase analysis
- Multi-step planning and orchestration
- Documentation and report writing
- Research synthesis

### 4.2 When to Use Claude Sonnet 4.6

**Strengths:**
- Superior coding capabilities
- Excellent creative writing
- Strong tool use and function calling
- Better at UI/UX and visual tasks

**Use For:**
- Code generation and modification
- Shopify theme development
- Content creation and copywriting
- PR review and code quality
- Creative tasks (design, marketing)

### 4.3 Model Selection Matrix

| Task Type | Recommended Model | Rationale |
|-----------|------------------|-----------|
| Operations & Supervision | Kimi K2.5 | Long context, planning |
| Code Development | Sonnet 4.6 | Superior coding skills |
| Content Writing | Sonnet 4.6 | Creative excellence |
| Research & Analysis | Kimi K2.5 | Long context for sources |
| E-commerce/Shopify | Sonnet 4.6 | Visual/UI focus |
| Documentation | Either | Context-dependent |

---

## 5. Cost Optimization

### 5.1 Spawn Strategies

**1. Just-in-Time Spawning**
```javascript
// Only spawn when task arrives
if (task.type === 'shopify') {
  spawnAgent({ model: 'sonnet-4.6', role: 'shopify-specialist' });
}
```

**2. Task Batching**
- Group similar tasks
- Spawn one agent to handle batch
- Reduces model switching overhead

**3. Context Sharing**
- Pass relevant context to subagent
- Avoid redundant data fetching
- Use file references over full content

### 5.2 Cost Control Measures

| Strategy | Implementation | Savings |
|----------|---------------|---------|
| Spawn on demand | No idle agents | ~100% baseline cost |
| Use Kimi for planning | Plan with Kimi, execute with Sonnet | ~40% on planning tasks |
| Context compression | Summarize before passing | ~30% on token usage |
| Subagent timeouts | Kill stuck agents | Prevents runaway costs |
| Model fallback | Degrade gracefully if rate limited | Availability protection |

### 5.3 Subagent Lifecycle

1. **Spawn** - Create with minimal context
2. **Execute** - Task-specific work
3. **Report** - Return essential results only
4. **Terminate** - Immediate cleanup after completion

---

## 6. Implementation

### 6.1 Spawning Agents on Different Models

**Via API/CLI:**
```bash
# Spawn Sonnet agent for coding task
openclaw agent spawn \
  --model claude-sonnet-4.6 \
  --role shopify-specialist \
  --task "Fix mobile navigation bug"

# Spawn Kimi agent for analysis
openclaw agent spawn \
  --model kimi-k2.5 \
  --role research-analyst \
  --task "Analyze codebase structure"
```

**Programmatic (Internal):**
```javascript
// System spawns subagent with specific model
const subagent = await spawnSubagent({
  model: 'claude-sonnet-4.6',
  instructions: 'Specialized Shopify developer',
  task: specificTask,
  context: relevantContext
});

const result = await subagent.run();
```

### 6.2 Agent Configuration

**Base Configuration:**
```yaml
agent_defaults:
  timeout: 300s
  max_retries: 3
  log_level: info
  
model_profiles:
  kimi-k2.5:
    context_window: 256k
    strengths: [reasoning, planning, long_context]
    
  sonnet-4.6:
    context_window: 200k
    strengths: [coding, creativity, tool_use]
```

### 6.3 Context Passing

**Efficient Context Transfer:**
```javascript
// Good: Pass references and summaries
const context = {
  taskDescription: task.summary,
  relevantFiles: ['/docs/THEME_GUIDE.md', '/src/shopify/'],
  previousWork: lastResult.id, // Reference, not full content
  constraints: ['keep mobile-first', 'maintain accessibility']
};

// Bad: Passing full file contents
const context = {
  fileContents: readFileSync('huge-file.txt'), // Too expensive!
  // ...
};
```

---

## 7. Monitoring

### 7.1 Activity Log

**Purpose:** Central audit trail of all agent activities

**Log Entry Structure:**
```json
{
  "timestamp": "2026-02-18T20:22:00Z",
  "agent": "juno",
  "action": "spawned_subagent",
  "details": {
    "subagent_model": "sonnet-4.6",
    "task": "shopify_theme_fix",
    "duration_ms": 45000
  },
  "type": "system"
}
```

**Key Events to Log:**
- Agent spawn/termination
- Task completion/failure
- PR creation/merge
- Goal updates
- Escalations
- Model failures and retries

### 7.2 PR Review Process

**Juno's PR Review Checklist:**

1. **Pre-Merge Verification**
   - [ ] Vercel build passes (required)
   - [ ] Code review completed
   - [ ] No security concerns
   - [ ] Documentation updated (if needed)

2. **Merge Authorization**
   - [ ] MJ explicitly approved OR
   - [ ] Emergency hotfix flagged by MJ

3. **Post-Merge**
   - Log merge to Activity Log
   - Update relevant documentation
   - Notify stakeholders if needed

### 7.3 Escalation Procedures

**Escalation Levels:**

| Level | Trigger | Action | Response Time |
|-------|---------|--------|---------------|
| 1 | Subagent failure | Respawn with clearer instructions | 5 min |
| 2 | Repeated failures (3x) | Juno notifies MJ with context | 15 min |
| 3 | Critical system issue | Immediate MJ notification | Immediate |
| 4 | Security concern | Halt operations, alert MJ | Immediate |

**Escalation Notification Format:**
```
🚨 ESCALATION [Level X]
Agent: [name]
Issue: [brief description]
Context: [relevant log excerpt]
Recommended Action: [suggested next step]
```

### 7.4 Heartbeat Monitoring

**Subagent Health Checks:**
- Check `process.list` during heartbeat
- Detect failed/incomplete subagents
- Auto-respawn if configured
- Log retry attempts

**Heartbeat Tasks:**
1. Check for failed subagents
2. Review pending PRs
3. Monitor goal deadlines
4. Sync Activity Log

---

## 8. PDF Preview Research

### 8.1 Research Summary: PDF Preview Options for Next.js Dashboard

Based on research into displaying documents within the Next.js dashboard, here are the recommended approaches:

#### Option 1: react-pdf (Recommended)

**Pros:**
- Purpose-built React component
- Good performance with lazy loading
- Supports text selection
- Active maintenance

**Cons:**
- Adds ~200KB to bundle
- Requires worker configuration
- Some browser compatibility considerations

**Implementation:**
```tsx
import { Document, Page } from 'react-pdf';

function PDFViewer({ url }) {
  return (
    <Document file={url}>
      <Page pageNumber={1} />
    </Document>
  );
}
```

**Best For:** Full-featured PDF viewing with text selection

#### Option 2: PDF.js (Mozilla)

**Pros:**
- Industry standard, battle-tested
- Highly customizable
- Free and open source

**Cons:**
- Steeper learning curve
- More complex setup
- Larger bundle size

**Best For:** Custom PDF rendering requirements

#### Option 3: Simple iframe Embed

**Pros:**
- Zero dependencies
- Uses browser native PDF viewer
- Simplest implementation

**Cons:**
- Limited styling control
- Browser-dependent experience
- No text extraction capability

**Implementation:**
```tsx
<iframe src="/document.pdf" width="100%" height="600px" />
```

**Best For:** Quick implementation, minimal requirements

#### Option 4: Markdown-based Documents with Print-to-PDF

**Pros:**
- Documents remain editable
- Version control friendly
- Can generate PDF on-demand
- Consistent styling

**Cons:**
- Requires markdown-to-PDF pipeline
- Not true PDF preview

**Implementation:**
```tsx
// Display markdown
<ReactMarkdown>{content}</ReactMarkdown>

// Generate PDF via API route
const pdf = await generatePDF(markdownContent);
```

**Best For:** Internal documentation that may need editing

### 8.2 Recommendation

**For AI Agency Architecture docs:** Use **Markdown-based with print-to-PDF** option:

1. Store architecture docs as Markdown (like this file)
2. Display with syntax highlighting via `react-markdown`
3. Add "Download PDF" button that generates on-demand
4. Benefits: Editable, searchable, version-controlled

**For external/sharing documents:** Use **react-pdf** for a polished viewer experience.

---

## Appendix A: Quick Reference

### A.1 Agent Spawn Commands

```bash
# Shopify specialist
openclaw agent spawn --model sonnet-4.6 --role shopify

# Content creator
openclaw agent spawn --model sonnet-4.6 --role content

# Operations coordinator (Juno level)
openclaw agent spawn --model kimi-k2.5 --role operations
```

### A.2 Activity Log API

```bash
# Log activity
curl -X POST /api/activity-log \
  -H "Content-Type: application/json" \
  -d '{
    "action": "task_completed",
    "details": "...",
    "type": "system"
  }'
```

### A.3 Goal Creation API

```bash
# Create collaborative goal
curl -X POST /api/goals \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Goal Name",
    "category": "collaborative",
    "description": "...",
    "junoAssisted": true,
    "source": "juno"
  }'
```

---

## Related Documents

- [AGENTS.md](./AGENTS.md) - Agent workspace conventions
- [DOCUMENT_LIBRARY.md](./DOCUMENT_LIBRARY.md) - System documentation index
- [MONITORING_CHECKLIST.md](./MONITORING_CHECKLIST.md) - Operational monitoring guide
