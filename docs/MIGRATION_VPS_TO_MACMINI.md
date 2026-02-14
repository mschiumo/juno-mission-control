# OpenClaw Migration Guide: VPS → Mac Mini

A complete walkthrough for transferring your OpenClaw instance from a VPS to a local Mac Mini.

---

## Phase 1: Pre-Migration Checklist

### Current VPS (Source)
- [ ] Document current OpenClaw version
- [ ] List all installed skills
- [ ] Note all API keys and tokens (Trello, Shopify, etc.)
- [ ] Export cron jobs
- [ ] Identify all session data to preserve

### Mac Mini (Destination)
- [ ] macOS version (Big Sur or later recommended)
- [ ] At least 8GB RAM (16GB+ preferred)
- [ ] 50GB+ free storage
- [ ] Static IP or dynamic DNS setup (for external access)
- [ ] User account with admin privileges

---

## Phase 2: Backup Current System

### 1. Export OpenClaw Configuration
```bash
# On current VPS, run as clawd user
mkdir -p ~/openclaw-backup-$(date +%Y%m%d)
cd ~/openclaw-backup-$(date +%Y%m%d)

# Copy workspace
cp -r ~/.openclaw/workspace .

# Copy config
cp ~/.openclaw/openclaw.json .

# Copy skills
cp -r ~/.npm-global/lib/node_modules/openclaw/skills ./skills

# List cron jobs
crontab -l > crontab-backup.txt 2>/dev/null || echo "No crontab"

# Create archive
tar czf ~/openclaw-backup-$(date +%Y%m%d).tar.gz .
```

### 2. Export Important Data
```bash
# SSH keys
cp -r ~/.ssh ~/openclaw-backup-$(date +%Y%m%d)/

# Environment variables
env > ~/openclaw-backup-$(date +%Y%m%d)/environment.txt

# Node version
node --version > ~/openclaw-backup-$(date +%Y%m%d)/node-version.txt
```

### 3. Transfer Backup to Mac Mini
```bash
# Option A: SCP (if Mac Mini has SSH exposed)
scp ~/openclaw-backup-*.tar.gz user@mac-mini-ip:~/

# Option B: Cloud storage (recommended)
# Upload to Dropbox/iCloud/Drive, download on Mac Mini

# Option C: Physical transfer
# USB drive, AirDrop, etc.
```

---

## Phase 3: Mac Mini Setup

### 1. Install Homebrew
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Install Dependencies
```bash
# Node.js (match version from VPS)
brew install node@22

# Git (usually pre-installed, but ensure latest)
brew install git

# Optional: Process manager
brew install pm2

# Optional: Database if needed
brew install redis
```

### 3. Create OpenClaw User (Recommended)
```bash
# Create dedicated user for OpenClaw
sudo sysadminctl -addUser clawd -fullName "OpenClaw User" -password "temp-password" -admin

# Or use existing user and create directory
mkdir -p ~/.openclaw
```

---

## Phase 4: Install OpenClaw

### 1. Install OpenClaw Globally
```bash
# Using npm
npm install -g openclaw

# Or specific version matching VPS
npm install -g openclaw@VERSION
```

### 2. Initialize Configuration
```bash
# Create config directory
mkdir -p ~/.openclaw

# Create initial config (edit with your settings)
cat > ~/.openclaw/openclaw.json << 'EOF'
{
  "agent": {
    "id": "main",
    "model": "kimi-coding/k2p5"
  },
  "gateway": {
    "enabled": true,
    "host": "127.0.0.1",
    "port": 18789,
    "telegram": {
      "enabled": true,
      "botToken": "YOUR_BOT_TOKEN"
    }
  },
  "workspace": {
    "path": "~/.openclaw/workspace"
  }
}
EOF
```

### 3. Restore Workspace
```bash
# Extract backup
cd ~
tar xzf openclaw-backup-*.tar.gz
cd openclaw-backup-*

# Copy workspace
cp -r workspace/* ~/.openclaw/workspace/

# Copy SSH keys
cp -r ssh/* ~/.ssh/
chmod 600 ~/.ssh/*
chmod 644 ~/.ssh/*.pub

# Copy skills (if custom)
cp -r skills/* ~/.npm-global/lib/node_modules/openclaw/skills/ 2>/dev/null || true
```

---

## Phase 5: Configure Services

### 1. Set Up LaunchAgent (macOS Auto-Start)
```bash
# Create LaunchAgent plist
mkdir -p ~/Library/LaunchAgents

cat > ~/Library/LaunchAgents/com.openclaw.gateway.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.gateway</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/openclaw</string>
        <string>gateway</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>~/.openclaw/logs/gateway.log</string>
    <key>StandardErrorPath</key>
    <string>~/.openclaw/logs/gateway-error.log</string>
</dict>
</plist>
EOF

# Load the service
launchctl load ~/Library/LaunchAgents/com.openclaw.gateway.plist
```

### 2. Alternative: PM2 Process Manager
```bash
# Install PM2 globally
npm install -g pm2

# Create ecosystem file
cat > ~/.openclaw/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'openclaw-gateway',
    script: 'openclaw',
    args: 'gateway start',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    log_file: '~/.openclaw/logs/combined.log',
    out_file: '~/.openclaw/logs/out.log',
    error_file: '~/.openclaw/logs/error.log'
  }]
};
EOF

# Start with PM2
pm2 start ~/.openclaw/ecosystem.config.js
pm2 save
pm2 startup
```

### 3. Restore Cron Jobs
```bash
# On Mac, use launchd instead of cron (recommended)
# Or restore crontab
crontab crontab-backup.txt
```

---

## Phase 6: Network Configuration

### 1. Local Access
```bash
# OpenClaw will run on localhost by default
# Access via: http://localhost:18789
```

### 2. External Access (Optional)
```bash
# Option A: Port forwarding on router
# Forward external port 18789 → Mac Mini IP:18789

# Option B: Tailscale (Recommended)
brew install tailscale
sudo tailscale up
# Access via Tailscale IP from anywhere

# Option C: ngrok for temporary access
brew install ngrok
ngrok http 18789
```

### 3. Update Telegram Bot Webhook (If Using)
```bash
# If Telegram bot was pointing to VPS IP
# Update webhook to new Mac Mini address
curl -F "url=https://your-new-address/webhook" \
  https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook
```

---

## Phase 7: Testing

### 1. Verify Installation
```bash
# Check OpenClaw version
openclaw --version

# Check gateway status
openclaw gateway status

# Test agent session
openclaw agent start
```

### 2. Verify Data Migration
```bash
# Check workspace files exist
ls -la ~/.openclaw/workspace/

# Verify skills installed
ls ~/.npm-global/lib/node_modules/openclaw/skills/

# Test SSH keys
ssh -T git@github.com
```

### 3. Test Integrations
- [ ] Telegram bot responds
- [ ] Trello connection works
- [ ] GitHub SSH access works
- [ ] Cron jobs fire correctly
- [ ] All API keys functional

---

## Phase 8: Post-Migration

### 1. Update Documentation
- [ ] Update USER.md with new system info
- [ ] Document Mac Mini IP/hostname
- [ ] Update any hardcoded paths

### 2. Security
```bash
# Enable firewall
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on

# Set strong password for clawd user
passwd

# Disable SSH if not needed
sudo systemsetup -setremotelogin off
```

### 3. Monitoring
```bash
# Install monitoring tools
brew install htop

# Set up log rotation
sudo logrotate -s /var/log/logrotate.status /etc/logrotate.d/openclaw
```

---

## Troubleshooting

### Issue: OpenClaw won't start
```bash
# Check logs
tail -f ~/.openclaw/logs/gateway-error.log

# Check Node version
node --version

# Reinstall OpenClaw
npm uninstall -g openclaw
npm install -g openclaw
```

### Issue: SSH keys not working
```bash
# Check permissions
chmod 700 ~/.ssh
chmod 600 ~/.ssh/*
chmod 644 ~/.ssh/*.pub

# Test SSH agent
ssh-add -l
ssh-add ~/.ssh/github_keepliving
```

### Issue: Skills missing
```bash
# Reinstall skills
openclaw skills install skill-name

# Or copy from backup
cp -r ~/openclaw-backup-*/skills/* ~/.npm-global/lib/node_modules/openclaw/skills/
```

### Issue: Cron jobs not running
```bash
# macOS uses launchd, not cron
# Convert cron jobs to launchd plists
# Or use: brew install cron
```

---

## Quick Reference Commands

```bash
# Start OpenClaw
openclaw gateway start

# Check status
openclaw gateway status

# View logs
tail -f ~/.openclaw/logs/gateway.log

# Restart
openclaw gateway restart

# Stop
openclaw gateway stop

# PM2 commands (if using PM2)
pm2 status
pm2 logs openclaw-gateway
pm2 restart openclaw-gateway
```

---

## Rollback Plan

If migration fails:
1. Keep VPS running until Mac Mini is confirmed working
2. Document any issues encountered
3. Can switch back by updating Telegram webhook to VPS IP
4. Re-migrate after fixing issues

---

*Last updated: February 12, 2026*
