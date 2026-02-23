# n8n Integration with OpenClaw/Juno - Research Notes

## 1. What is n8n?

**n8n** is an open-source, self-hostable workflow automation platform that combines:
- **Visual workflow builder**: Drag-and-drop interface for building automations
- **400+ native integrations**: Connect to apps like Telegram, Discord, Twitter/X, Google Sheets, etc.
- **Code flexibility**: Write JavaScript/Python for custom logic when needed
- **AI capabilities**: Native AI nodes for LLM integration
- **Fair-code license**: Source-available, can self-host for free

### How It Works
1. **Triggers** start workflows (webhooks, schedules, app events)
2. **Nodes** process data (HTTP requests, transformations, conditionals)
3. **Connections** pass data between nodes
4. **Execution** runs on the n8n server (self-hosted or cloud)

---

## 2. Installation Options

### Option A: Self-Hosted (Recommended for MJ)
**Pros:**
- Full data privacy
- No usage limits
- Cost-effective long-term
- Direct integration with local services

**Cons:**
- Requires server management
- Responsible for backups/security

**Platforms:**
- **Mac Mini** (ideal for home setup)
- **VPS** (DigitalOcean, Linode, Hetzner ~$5-10/month)
- **Docker** (any machine with Docker support)

### Option B: n8n Cloud
**Pros:**
- Zero maintenance
- Automatic updates
- Managed security

**Cons:**
- Subscription cost (starts at ~$20/month)
- Execution limits
- Less control over data

---

## 3. OpenClaw/Juno Integration Points

### A. Webhook Triggers (n8n receives from OpenClaw)
OpenClaw can send HTTP requests to n8n webhooks:
```
POST https://n8n.yourdomain.com/webhook/openclaw-event
{
  "event": "trading_alert",
  "symbol": "BTCUSDT",
  "price": 95000,
  "alert_type": "breakout"
}
```

**Use cases:**
- Trading alerts from Juno analysis
- Content approval workflows
- Status updates from agents

### B. HTTP Request Nodes (n8n calls OpenClaw)
n8n workflows can call OpenClaw's Gateway API:
```
POST http://openclaw-gateway:8080/v1/message
{
  "channel": "telegram",
  "message": "Daily report ready",
  "target": "mj_chat"
}
```

**Use cases:**
- Send processed data back to MJ
- Trigger Juno agent actions
- Post scheduled content

### C. Schedule Triggers (Replace/Enhance Cron)
n8n's Schedule node replaces cron with visual monitoring:
- Same cron syntax support
- Built-in execution logs
- Error handling & retries
- Visual workflow status

---

## 4. Specific Use Cases for MJ's Workflow

### Trading Alerts & Market Monitoring
**Current:** Cron + script polling exchanges
**n8n Enhancement:**
- **Webhook from TradingView**: Real-time alerts → n8n → Filter logic → Telegram/Discord
- **Multi-exchange aggregation**: Coinbase + Binance + Kraken → Compare prices → Alert on arbitrage
- **AI-powered analysis**: Price data → GPT-4o → Natural language summary → Voice message via TTS

**Example Workflow:**
```
TradingView Webhook → Filter (price > threshold) 
→ Format Message → Telegram to MJ
→ Log to Google Sheets → Conditional: If BTC > $100k → Alert VIP channel
```

### Content Automation Pipeline
**Current:** Manual posting or simple scripts
**n8n Enhancement:**
- **RSS → AI Summary → Multi-platform**: Blog post → GPT summary → Twitter/X + LinkedIn + Telegram
- **Content calendar**: Google Sheets → Schedule trigger → Pull topic → AI generate → Queue for review
- **Cross-posting**: Post to Telegram → Auto-forward to Discord + Twitter

**Example Workflow:**
```
Schedule (daily 9am) → HTTP GET news API 
→ Filter by keywords → GPT-4o rewrite 
→ Send to OpenClaw for approval → If approved → Post to socials
```

### Agent Coordination
**Use as orchestration layer:**
- Centralized agent status dashboard
- Agent heartbeat monitoring (alert if agent silent > X hours)
- Task queue management for True Agent Team
- Decision routing: If condition A → Agent X, else → Agent Y

### Data Collection & Reporting
- **Daily digest**: Aggregate logs → Format report → Morning summary to MJ
- **Analytics pipeline**: Trading performance → Calculate metrics → Weekly PDF report
- **Webhook logging**: All OpenClaw events → PostgreSQL → Grafana dashboard

---

## 5. Step-by-Step Setup Guide

### Mac Mini Setup (Recommended for Home)

#### Prerequisites
```bash
# Install Homebrew if not present
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Docker Desktop
brew install --cask docker
```

#### Docker Compose Configuration

Create `~/n8n/docker-compose.yml`:

```yaml
version: '3.8'

services:
  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    container_name: n8n
    restart: always
    ports:
      - "5678:5678"
    environment:
      # Timezone
      - GENERIC_TIMEZONE=America/New_York
      - TZ=America/New_York
      
      # Basic Config
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=secure_password_here
      
      # Webhook URL (for external access)
      - WEBHOOK_URL=https://n8n.yourdomain.com/
      
      # Security
      - N8N_ENCRYPTION_KEY=your_random_32_char_key_here
      - N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true
      
      # Performance
      - N8N_RUNNERS_ENABLED=true
      - EXECUTIONS_MODE=regular
      
      # Optional: Email notifications
      - N8N_EMAIL_MODE=smtp
      - N8N_SMTP_HOST=smtp.gmail.com
      - N8N_SMTP_PORT=587
      - N8N_SMTP_USER=your-email@gmail.com
      - N8N_SMTP_PASS=app_password
      
    volumes:
      - n8n_data:/home/node/.n8n
      - ./files:/files  # For file storage
    networks:
      - n8n-network

  # Optional: PostgreSQL for production use
  postgres:
    image: postgres:15-alpine
    container_name: n8n-postgres
    restart: always
    environment:
      - POSTGRES_USER=n8n
      - POSTGRES_PASSWORD=postgres_password_here
      - POSTGRES_DB=n8n
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - n8n-network

volumes:
  n8n_data:
  postgres_data:

networks:
  n8n-network:
    driver: bridge
```

#### Start n8n
```bash
cd ~/n8n
docker compose up -d

# View logs
docker compose logs -f n8n

# Access at http://localhost:5678
```

#### Configure Reverse Proxy (for external access)

**Using Caddy (simplest):**
```bash
brew install caddy
```

Create `Caddyfile`:
```
n8n.yourdomain.com {
    reverse_proxy localhost:5678
}
```

**Using Nginx:**
```nginx
server {
    listen 80;
    server_name n8n.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:5678;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### VPS Setup (Production)

Same Docker Compose approach, plus:
1. **UFW firewall**: `sudo ufw allow 5678`
2. **SSL with Let's Encrypt**: Use Caddy or Certbot
3. **Backup strategy**: Automated volume backups
4. **Monitoring**: Uptime Kuma or similar

---

## 6. n8n vs Current Cron-Based Approach

| Feature | Cron + Scripts | n8n |
|---------|---------------|-----|
| **Setup Complexity** | Low (familiar) | Medium (learning curve) |
| **Visual Monitoring** | ❌ Logs only | ✅ Visual execution flow |
| **Error Handling** | Manual try/catch | Built-in retries, alerts |
| **Debugging** | Console logs | Visual step-through |
| **Modifications** | Edit code, redeploy | Drag-and-drop changes |
| **Integration Variety** | Write custom code | 400+ pre-built nodes |
| **AI Integration** | Custom API calls | Native AI nodes |
| **Webhook Triggers** | Need separate server | Built-in |
| **Collaboration** | Git only | Share workflows visually |
| **Execution History** | Custom logging | Built-in, searchable |
| **Cost (Self-hosted)** | Free | Free |
| **Resource Usage** | Light | Moderate (needs Docker) |

### When to Keep Cron
- Simple, single-purpose tasks
- Resource-constrained environments
- Tasks requiring minimal dependencies
- Quick one-off scripts

### When to Use n8n
- Multi-step workflows with conditionals
- Multiple service integrations
- Need visual monitoring/debugging
- Team collaboration on workflows
- AI-powered processing
- Webhook-based triggers
- Complex error handling needs

### Hybrid Approach (Recommended)
Keep existing cron for simple tasks, migrate complex workflows to n8n gradually:

```
Cron Jobs                    n8n Workflows
─────────────────────────────────────────────────
Daily backup script    →     Keep in cron
Simple price check     →     Keep in cron
Multi-step trading     →     Migrate to n8n
  alert pipeline
Content approval       →     Migrate to n8n
  workflow
Agent coordination     →     Migrate to n8n
```

---

## 7. Practical Configuration Examples

### Example 1: OpenClaw → n8n Webhook

**OpenClaw Action:**
```javascript
// In Juno agent - send trading alert to n8n
fetch('https://n8n.yourdomain.com/webhook/trading-alert', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    symbol: 'BTCUSDT',
    price: 95000,
    alert_type: 'resistance_break',
    confidence: 0.87,
    timestamp: new Date().toISOString()
  })
});
```

**n8n Workflow:**
1. **Webhook Node** (POST /trading-alert)
2. **IF Node** (confidence > 0.8?)
3. **True Branch:** Format Message → Telegram Send
4. **False Branch:** Log to "Low Confidence" Google Sheet

### Example 2: Scheduled Report → OpenClaw

**n8n Workflow:**
1. **Schedule Trigger** (Cron: 0 9 * * 1 = Mondays 9am)
2. **HTTP Request** (GET trading API for weekly data)
3. **Code Node** (Calculate weekly performance)
4. **HTTP Request** (POST to OpenClaw Gateway)
   - URL: `http://host.docker.internal:8080/v1/message`
   - Body: `{"message": "Weekly report: +5.2%", "target": "mj_telegram"}`

### Example 3: Agent Heartbeat Monitor

**n8n Workflow:**
1. **Schedule Trigger** (Every 15 minutes)
2. **HTTP Request** (GET OpenClaw agent status)
3. **IF Node** (Last heartbeat > 1 hour?)
4. **True:** Send Telegram alert "Agent X appears down"
5. **False:** No action (or log to monitoring sheet)

---

## 8. Security Considerations

1. **Authentication**: Enable basic auth or OAuth
2. **Webhook Security**: Use header auth tokens
3. **Network**: Run on private network or VPN
4. **Encryption**: Set `N8N_ENCRYPTION_KEY`
5. **Updates**: Regular `docker compose pull && up -d`
6. **Backups**: Automate volume backups

---

## 9. Migration Strategy

### Phase 1: Parallel Setup (Week 1)
- Install n8n on Mac Mini
- Migrate one simple cron job (e.g., daily greeting)
- Test OpenClaw ↔ n8n communication

### Phase 2: Trading Workflows (Week 2-3)
- Set up TradingView webhook → n8n
- Build price alert pipeline
- Keep existing cron as fallback

### Phase 3: Content Automation (Week 4)
- Build content calendar workflow
- Integrate with OpenClaw for approval

### Phase 4: Agent Orchestration (Ongoing)
- Use n8n for True Agent Team coordination
- Centralized monitoring dashboard

---

## Resources

- **n8n Docs**: https://docs.n8n.io/
- **Workflow Templates**: https://n8n.io/workflows
- **Community Forum**: https://community.n8n.io/
- **Docker Guide**: https://docs.n8n.io/hosting/installation/docker/
- **Environment Variables**: https://docs.n8n.io/hosting/configuration/environment-variables/

---

*Research compiled: 2026-02-23*
*For Goal: Create True Agent Team (w1771737693847)*
