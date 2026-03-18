# Upstash Redis Setup Guide

## Quick Setup (5 minutes)

### 1. Create Upstash Account
1. Go to https://console.upstash.com/
2. Sign up with GitHub or email
3. Verify your email

### 2. Create Redis Database
1. Click "Create Database"
2. Name: `juno-mission-control`
3. Region: Select closest to your users (e.g., `us-east-1` for US)
4. Click "Create"

### 3. Get Connection Details
1. In your database dashboard, go to "Details" tab
2. Copy the `UPSTASH_REDIS_URL` (it looks like: `rediss://default:...@...-...-...-...-...-...-...-....com:6379`)

### 4. Add to Vercel Environment Variables
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add new variable:
   - **Name**: `UPSTASH_REDIS_URL`
   - **Value**: Paste the URL from step 3
   - **Environment**: Production (and Preview if needed)
3. Click "Save"

### 5. Redeploy
1. Go to Deployments tab
2. Click "Redeploy" on latest deployment
3. Wait for build to complete

## Testing

After deployment, test with:
```bash
curl https://your-app.vercel.app/api/cron-results
```

Should return:
```json
{
  "success": true,
  "data": [],
  "count": 0
}
```

## Features

✅ **Persistent storage** — survives hard refreshes  
✅ **Serverless optimized** — works with Vercel's edge network  
✅ **Free tier** — 10,000 requests/day  
✅ **Global replication** — low latency worldwide  

## Troubleshooting

**"Redis unavailable" error:**
- Check `UPSTASH_REDIS_URL` is set correctly in Vercel
- Ensure URL starts with `rediss://` (with double 's' for TLS)
- Redeploy after adding env var

**Data not persisting:**
- Verify Redis connection in Vercel logs
- Check Upstash dashboard for connection stats

## Free Tier Limits

- **Daily requests**: 10,000
- **Storage**: 256 MB
- **Bandwidth**: 1 GB/month

More than enough for cron results and goal data!