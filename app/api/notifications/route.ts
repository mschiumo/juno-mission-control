import { NextResponse } from 'next/server';
import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

export async function GET() {
  const timestamp = new Date().toISOString();
  
  try {
    await redis.connect();
    
    // Fetch pending notifications
    const notificationsJson = await redis.get('juno:notifications');
    const notifications = notificationsJson ? JSON.parse(notificationsJson) : [];
    
    // Filter unread notifications
    const unread = notifications.filter((n: any) => !n.read);
    
    await redis.disconnect();
    
    return NextResponse.json({
      success: true,
      notifications: unread,
      count: unread.length,
      timestamp,
    });
    
  } catch (error) {
    console.error('Notifications fetch error:', error);
    
    return NextResponse.json({
      success: true,
      notifications: [],
      count: 0,
      timestamp,
      error: 'Failed to fetch notifications',
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, title, message, action, priority = 'normal' } = body;
    
    await redis.connect();
    
    // Get existing notifications
    const notificationsJson = await redis.get('juno:notifications');
    const notifications = notificationsJson ? JSON.parse(notificationsJson) : [];
    
    // Add new notification
    const newNotification = {
      id: `notif_${Date.now()}`,
      type, // 'approval', 'blocker', 'info'
      title,
      message,
      action, // URL or action description
      priority, // 'low', 'normal', 'high', 'urgent'
      read: false,
      createdAt: new Date().toISOString(),
    };
    
    notifications.unshift(newNotification);
    
    // Keep only last 50 notifications
    const trimmed = notifications.slice(0, 50);
    
    await redis.set('juno:notifications', JSON.stringify(trimmed));
    await redis.disconnect();
    
    return NextResponse.json({
      success: true,
      notification: newNotification,
    });
    
  } catch (error) {
    console.error('Notification create error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create notification' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Notification ID required' },
        { status: 400 }
      );
    }
    
    await redis.connect();
    
    const notificationsJson = await redis.get('juno:notifications');
    const notifications = notificationsJson ? JSON.parse(notificationsJson) : [];
    
    // Mark as read
    const updated = notifications.map((n: any) => 
      n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n
    );
    
    await redis.set('juno:notifications', JSON.stringify(updated));
    await redis.disconnect();
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Notification update error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update notification' },
      { status: 500 }
    );
  }
}
