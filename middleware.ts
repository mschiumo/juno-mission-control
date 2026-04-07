import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const isLoggedIn = !!session;

  // Vercel-scheduled cron routes bypass user session auth but require CRON_SECRET.
  const isVercelCron =
    nextUrl.pathname.startsWith('/api/cron/') ||
    nextUrl.pathname.startsWith('/api/cron-jobs/');

  if (isVercelCron) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
    }
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  const publicPaths = ['/', '/login', '/signup'];
  const authPages = ['/login', '/signup']; // redirect away from these when already logged in

  if (!isLoggedIn && !publicPaths.includes(nextUrl.pathname)) {
    const loginUrl = new URL('/login', nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && authPages.includes(nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/', nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon|.*\\.svg$).*)',
  ],
};
