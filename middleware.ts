import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const isLoggedIn = !!session;

  // Allow cron/internal API routes without session
  const isInternalApi =
    nextUrl.pathname.startsWith('/api/cron') ||
    nextUrl.pathname.startsWith('/api/cron-jobs') ||
    nextUrl.pathname.startsWith('/api/run-cron') ||
    nextUrl.pathname.startsWith('/api/cron-results');

  if (isInternalApi) return NextResponse.next();

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
