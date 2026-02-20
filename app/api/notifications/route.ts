import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

const NOTIFICATION_PREFIX = 'notification:';

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  action?: {
    label: string;
    href: string;
  };
  createdAt: string;
  read: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unread') === 'true';
    
    const redis = await getRedisClient();
    const keys = await redis.keys(`${NOTIFICATION_PREFIX}*`);
    const notifications: Notification[] = [];
    
    for (const key of keys) {
      const data = await redis.hGetAll(key);
      if (data && data.id) {
        const notification: Notification = {
          id: data.id,
          type: data.type,
          title: data.title,
          message: data.message,
          action: data.action ? JSON.parse(data.action) : undefined,
          createdAt: data.createdAt,
          read: data.read === 'true'
        };
        
        if (!unreadOnly || !notification.read) {
          notifications.push(notification);
        }
      }
    }
    
    // Sort by createdAt descending
    notifications.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    return NextResponse.json({
      success: true,
      notifications,
      unreadCount: notifications.filter(n => !n.read).length
    });
    
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const markAll = searchParams.get('all') === 'true';
    
    const redis = await getRedisClient();
    
    if (markAll) {
      // Mark all as read
      const keys = await redis.keys(`${NOTIFICATION_PREFIX}*`);
      for (const key of keys) {
        await redis.hSet(key, 'read', 'true');
      }
      return NextResponse.json({ success: true, message: 'All notifications marked as read' });
    }
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Notification ID required' },
        { status: 400 }
      );
    }
    
    await redis.hSet(`${NOTIFICATION_PREFIX}${id}`, 'read', 'true');
    
    return NextResponse.json({ success: true, message: 'Notification marked as read' });
    
  } catch (error) {
    console.error('Error updating notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update notification' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Notification ID required' },
        { status: 400 }
      );
    }
    
    const redis = await getRedisClient();
    await redis.del(`${NOTIFICATION_PREFIX}${id}`);
    
    return NextResponse.json({ success: true, message: 'Notification deleted' });
    
  } catch (error) {
    console.error('Error deleting notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete notification' },
      { status: 500 }
    );
  }
}
