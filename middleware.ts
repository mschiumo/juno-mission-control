import { auth } from "@/lib/auth-config";
import { NextResponse } from "next/server";

// List of public routes that don't require authentication
const publicRoutes = ["/login", "/api/auth"];

export default auth((req) => {
  const { nextUrl } = req;
  const isAuthenticated = !!req.auth;
  const isPublicRoute = publicRoutes.some(
    (route) => nextUrl.pathname.startsWith(route)
  );

  // Allow access to public routes regardless of auth status
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.svg (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.svg|.*\\.png$).*)",
  ],
};
