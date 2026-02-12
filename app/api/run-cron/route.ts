import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'Job ID is required' },
        { status: 400 }
      );
    }

    // Placeholder: In production, this would trigger the actual cron job
    // You might use a library like node-cron or call an external service
    
    console.log(`Triggering cron job: ${jobId}`);

    // Simulate job execution
    await new Promise(resolve => setTimeout(resolve, 1000));

    return NextResponse.json({ 
      success: true, 
      message: `Cron job ${jobId} triggered successfully`,
      jobId,
      executedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error triggering cron job:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to trigger cron job' },
      { status: 500 }
    );
  }
}
