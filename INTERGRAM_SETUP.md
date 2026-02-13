# Intergram Chat Setup

To enable the live chat widget in the dashboard:

## 1. Get Your Intergram Chat ID

1. Open Telegram and message **@IntergramBot**
2. Click **Start** or send `/start`
3. The bot will give you a unique URL like:
   `https://www.intergram.xyz/XXXXX`
4. Copy the ID (the XXXXX part)

## 2. Add to Environment Variables

Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_INTERGRAM_CHAT_ID=your_chat_id_here
```

## 3. Test the Widget

- Visit your dashboard
- Look for the orange chat button (bottom-right)
- Click to open chat
- Send a message — it will appear in your Telegram!

## Customization

The widget is branded with:
- **Title:** "Juno - Mission Control"
- **Color:** Tangerine (#ff6b35)
- **Intro:** "Hey MJ! I'm Juno, your AI assistant..."

Edit `components/IntergramWidget.tsx` to customize further.