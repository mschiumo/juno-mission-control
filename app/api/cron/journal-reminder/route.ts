import { NextResponse } from 'next/server';
import { message } from '@/lib/telegram';

/**
 * Cron job to send daily journal reminder at market close (4pm EST)
 * This runs every day at 4:00 PM EST
 */
export async function POST() {
  try {
    // Send Telegram notification
    await message.send({
      message: '📓 Market Close Journal\n\nThe market just closed. Time to reflect on today\'s trading.\n\nTap the button below to add your journal entry:',
      buttons: [[
        { text: '📝 Add Journal Entry', callback_data: '/trading?subtab=journal&openJournal=true' }
      ]]
    });

    return NextResponse.json({
      success: true,
      message: 'Journal reminder sent'
    });
  } catch (error) {
    console.error('Error sending journal reminder:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send reminder' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Journal reminder endpoint - POST to trigger notification'
  });
}
