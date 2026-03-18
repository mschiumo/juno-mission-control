import { NextResponse } from 'next/server';

export async function GET() {
  const now = new Date();
  
  // Convert to EST (UTC-5)
  const estOffset = -5 * 60 * 60 * 1000;
  const estDate = new Date(now.getTime() + estOffset);
  const estHour = estDate.getUTCHours();
  const estMinute = estDate.getUTCMinutes();
  const estTime = estHour + estMinute / 60;
  const estDay = estDate.getUTCDay();
  const isWeekday = estDay >= 1 && estDay <= 5;

  // Asia: 7 PM - 2 AM EST (Sunday evening - Friday morning)
  const isAsiaOpen = (estDay === 0 && estTime >= 19) ||
                     ((estDay >= 1 && estDay <= 4) && estTime >= 19) ||
                     ((estDay >= 1 && estDay <= 5) && estTime < 2);

  // London: 3 AM - 11:30 AM EST
  const isLondonOpen = isWeekday && estTime >= 3 && estTime < 11.5;

  // New York: 9:30 AM - 4 PM EST
  const isNYOpen = isWeekday && estTime >= 9.5 && estTime < 16;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return NextResponse.json({
    success: true,
    serverTime: now.toISOString(),
    est: {
      day: dayNames[estDay],
      dayIndex: estDay,
      hour: estHour,
      minute: estMinute,
      time: estTime.toFixed(2)
    },
    markets: {
      asia: { isOpen: isAsiaOpen, hours: '7 PM - 2 AM EST' },
      london: { isOpen: isLondonOpen, hours: '3 AM - 11:30 AM EST' },
      newYork: { isOpen: isNYOpen, hours: '9:30 AM - 4 PM EST' }
    }
  });
}