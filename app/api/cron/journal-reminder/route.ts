import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

/**
 * Cron job to create daily journal reminder notification at market close (4pm EST)
 * This runs every day at 4:00 PM EST
 * Stores notification in Redis for in-app display
 */
export async function POST() {
  try {
    const redis = await getRedisClient();
    const today = new Date().toISOString().split('T')[0];
    
    // Create in-app notification
    const notification = {
      id: `journal-reminder:${today}`,
      type: 'journal-reminder',
      title: '📓 Market Close - Time to Journal',
      message: 'The market just closed. Take a moment to reflect on today\'s trading session.',
      action: {
        label: 'Add Journal Entry',
        href: '/trading?subtab=journal&openJournal=true'
      },
      createdAt: new Date().toISOString(),
      read: false
    };
    
    // Store notification (expires in 24 hours)
    await redis.hSet(`notification:${notification.id}`, {
      ...notification,
      action: JSON.stringify(notification.action)
    });
    await redis.expire(`notification:${notification.id}`, 86400); // 24 hours
    
    // Add to notification index
    await redis.sAdd('notifications', notification.id);

    return NextResponse.json({
      success: true,
      message: 'In-app journal reminder created'
    });
  } catch (error) {
    console.error('Error creating journal reminder:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create reminder' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Journal reminder endpoint - POST to create in-app notification'
  });
}
