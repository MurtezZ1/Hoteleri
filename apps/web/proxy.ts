import { NextRequest, NextResponse } from 'next/server';

const publicRoutes = new Set([
  '/',
  '/features',
  '/pricing',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/privacy',
  '/terms',
  '/contact',
]);

const protectedPrefixes = [
  '/dashboard',
  '/front-desk',
  '/calendar',
  '/reservations',
  '/guests',
  '/rooms',
  '/housekeeping',
  '/payments',
  '/invoices',
  '/automations',
  '/messages',
  '/channels',
  '/booking-engine',
  '/reports',
  '/staff',
  '/notifications',
  '/settings',
  '/subscription',
  '/billing',
  '/properties',
  '/audit-logs',
  '/onboarding',
  '/choose-plan',
];

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.get('odeoniflow_session')?.value === '1';

  if (hasSession && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (publicRoutes.has(pathname) || !isProtected(pathname)) {
    return NextResponse.next();
  }

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set(
      'returnTo',
      safeReturnPath(`${pathname}${search}`),
    );
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};

function isProtected(pathname: string): boolean {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function safeReturnPath(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    return '/dashboard';
  }
  return path;
}
