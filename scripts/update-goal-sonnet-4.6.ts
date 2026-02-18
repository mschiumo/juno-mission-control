import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL;
const STORAGE_KEY = 'goals_data';

async function updateGoal() {
  const client = createClient({ url: REDIS_URL });
  await client.connect();
  
  const stored = await client.get(STORAGE_KEY);
  const goals = JSON.parse(stored || '{}');
  
  // Find and update the collaborative goal
  const goalIndex = goals.collaborative?.findIndex((g: any) => g.id === 'c1771342996221');
  
  if (goalIndex !== -1 && goalIndex !== undefined) {
    goals.collaborative[goalIndex].title = 'Update Juno to Sonnet 4.6';
    goals.collaborative[goalIndex].notes = `## Update Juno to Sonnet 4.6 - Research & Decision

### Current Status
- **Current Model:** Kimi K2.5
- **Problem:** Hitting rate limits on high usage days
- **Daily Usage:** ~868K tokens (and growing)

---

## Model Comparison

| Model | Input Cost | Output Cost | Context | Rate Limits | Monthly Est. | Status |
|-------|-----------|-------------|---------|-------------|--------------|--------|
| **Kimi K2.5** (current) | ~$1.50/M | ~$7.50/M | 200K | ~1,000 RPM | $75-100/mo | Current |
| **Claude Sonnet 4.5** | $3/M | $15/M | 200K (1M w/ beta) | 4,000 RPM | $150-200/mo | Previous |
| **Claude Sonnet 4.6** ⭐ NEW | TBD | TBD | 1M tokens | TBD | TBD | **TARGET** |
| **Claude Opus 4.5** | $5/M | $25/M | 200K (1M w/ beta) | 2,000 RPM | $300-400/mo | Alternative |
| **Gemini 2.5 Pro** | ~$35/M | ~$70/M | 1M | 5 RPM (free) | $500+/mo | Expensive |

### Sonnet 4.6 Release Details (Feb 17, 2026)
- **Released:** February 17, 2026
- **Context Window:** 1 million tokens (2x previous Sonnet versions)
- **Improvements:** Coding, instruction-following, computer use
- **Default:** Now the default model for Free and Pro plan users
- **Benchmarks:** 60.4% on ARC-AGI-2, strong OS World and SWE-Bench scores

---

## Recommendations

### Option 1: Switch Primary to Sonnet 4.6 (RECOMMENDED)
**Pros:**
- Latest model with 1M token context window
- Better coding and computer use capabilities
- Higher rate limits expected (4.5 had 4,000 RPM)
- Better agent planning and knowledge work

**Cons:**
- Pricing TBD (likely similar to 4.5)
- Need to verify OpenClaw support

**Command:**
\`\`\`bash
openclaw config set model anthropic/claude-sonnet-4-6
openclaw gateway restart
\`\`\`

### Option 2: Keep Kimi + Add Sonnet 4.6 as Overflow
**Pros:**
- Kimi for simple/fast tasks
- Sonnet 4.6 for complex work
- Lower overall cost

**Cons:**
- Manual model switching
- Less consistent experience

---

## Action Items

- [x] Research Sonnet 4.6 availability - **CONFIRMED: Released Feb 17, 2026**
- [ ] Get exact pricing for Sonnet 4.6 via Anthropic API docs
- [ ] Verify OpenClaw supports Sonnet 4.6 model string
- [ ] Decide: Full switch to Sonnet 4.6 or hybrid setup?
- [ ] Set up Anthropic API key in OpenClaw if not configured
- [ ] Configure model fallback/routing
- [ ] Test for 1 week, monitor costs
- [ ] Adjust if needed

---

## Cost Optimization Tips

1. **Prompt caching:** 90% cheaper on repeated context (Sonnet/Opus)
2. **thinking=low mode:** Reduces output tokens ~30%
3. **Context compaction:** OpenClaw handles automatically
4. **Use cheaper model for heartbeats/simple checks**

---

## Links

- Sonnet 4.6 Announcement: https://www.anthropic.com/news/claude-sonnet-4-6
- TechCrunch Coverage: https://techcrunch.com/2026/02/17/anthropic-releases-sonnet-4-6/
- Claude Pricing: https://platform.claude.com/docs/en/about-claude/pricing
- Rate Limits: https://platform.claude.com/docs/en/api/rate-limits
- OpenClaw Config: ~/.openclaw/config.json`;
    
    await client.set(STORAGE_KEY, JSON.stringify(goals));
    console.log('Goal updated successfully!');
  } else {
    console.log('Goal not found');
  }
  
  await client.disconnect();
}

updateGoal().catch(console.error);
