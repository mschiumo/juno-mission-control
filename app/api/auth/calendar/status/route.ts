/**
 * Google Calendar Authorization Status Check
 * 
 * With service account authentication, this always returns authorized
 * since no user OAuth flow is required.
 */

import { NextResponse } from 'next/server';

const GOOGLE_SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

export async function GET(request: Request) {
  try {
    // With service account, we're always "authorized" as long as
    // the service account key is configured
    const isConfigured = !!GOOGLE_SERVICE_ACCOUNT_KEY;

    return NextResponse.json({
      success: true,
      authorized: isConfigured,
      serviceAccount: true,
      message: isConfigured 
        ? 'Service account authentication active' 
        : 'Service account not configured - using demo data'
    });
  } catch (error) {
    console.error('Auth status check error:', error);
    return NextResponse.json({
      success: false,
      authorized: false,
      serviceAccount: true,
      error: 'Failed to check authorization status'
    }, { status: 500 });
  }
}
