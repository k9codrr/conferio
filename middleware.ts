// Module access gate.
//
// Runs only on module routes (see `config.matcher`). It asks /api/platform/access which
// modules the signed-in user may use in the current workspace and blocks the rest:
// pages redirect to /module-unavailable, APIs get a 403 JSON error. Platform admins pass
// everything. Results are cached per session + team for 30s.
//
// Note: the previous middleware (session-cookie redirect, mobile redirect, CSP) never ran
// because its matcher contained an empty alternative that matched no path. It is kept in
// git history; switching it on would change login/mobile behaviour app-wide.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { matchPath, MODULE_BY_KEY, MODULE_COOKIE, type ModuleKey } from './lib/platform/modules';

type Access = { signedIn: boolean; isPlatformAdmin?: boolean; modules?: Record<ModuleKey, boolean> };

const TTL_MS = 10_000;
const cache = new Map<string, { at: number; data: Access }>();

const SESSION_COOKIES = ['__Secure-next-auth.session-token', 'next-auth.session-token'];

async function getAccess(req: NextRequest, slug: string | null): Promise<Access | null> {
  const token = SESSION_COOKIES.map((n) => req.cookies.get(n)?.value).find(Boolean);
  if (!token) return { signedIn: false };

  const key = `${token}|${slug ?? ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const url = new URL('/api/platform/access', req.nextUrl.origin);
  if (slug) url.searchParams.set('teamSlug', slug);
  try {
    const r = await fetch(url, { headers: { cookie: req.headers.get('cookie') ?? '' }, cache: 'no-store' });
    if (!r.ok) return null;
    const data = (await r.json()) as Access;
    if (cache.size > 5000) cache.clear();
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

export default async function Middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const match = matchPath(pathname);
  if (!match) return NextResponse.next();

  const slug =
    match.slug ||
    searchParams.get('teamSlug') ||
    searchParams.get('slug') ||
    (req.cookies.get(MODULE_COOKIE)?.value ? decodeURIComponent(req.cookies.get(MODULE_COOKIE)!.value) : null);

  const access = await getAccess(req, slug);
  // Fail open if access can't be resolved: route handlers still do their own auth.
  if (!access || !access.signedIn || access.isPlatformAdmin) return NextResponse.next();
  if (access.modules?.[match.module] !== false) return NextResponse.next();

  const label = MODULE_BY_KEY[match.module].label;
  if (match.isApi) {
    return NextResponse.json(
      {
        error: {
          message: `${label} is not available in this workspace. Ask your workspace admin to upgrade the plan or enable it.`,
          code: 'MODULE_DISABLED',
          module: match.module,
        },
      },
      { status: 403 }
    );
  }
  const url = req.nextUrl.clone();
  url.pathname = '/module-unavailable';
  url.search = '';
  url.searchParams.set('module', match.module);
  url.searchParams.set('from', pathname);
  return NextResponse.redirect(url);
}

// Keep in sync with MODULES in lib/platform/modules.ts (Next needs static matchers).
export const config = {
  matcher: [
    '/mail/:path*',
    '/api/integrations/google/gmail/:path*',
    '/meetings/:path*',
    '/scheduled/:path*',
    '/chat/:path*',
    '/conversations/:path*',
    '/team/:slug/chat/:path*',
    '/team/:slug/channels/:path*',
    '/team/:slug/conversations/:path*',
    '/api/channels/:path*',
    '/api/messages/:path*',
    '/api/direct-messages/:path*',
    '/api/servers/:path*',
    '/api/chat/:path*',
    '/api/teams/:slug/conversations/:path*',
    '/api/teams/:slug/messages/:path*',
    '/scrumboard/:path*',
    '/board/:path*',
    '/task/:path*',
    '/api/boards/:path*',
    '/api/columns/:path*',
    '/api/subtasks/:path*',
    '/api/labels/:path*',
    '/crm/:path*',
    '/api/teams/:slug/crm/:path*',
    '/docs/:path*',
    '/team/:slug/docs/:path*',
    '/api/docSearch/:path*',
    '/notes/:path*',
    '/api/notes/:path*',
    '/teams/:slug/workload/:path*',
    '/workload/:path*',
    '/api/teams/:slug/workload/:path*',
    '/time-tracking/:path*',
    '/api/time-tracking/:path*',
    '/api/time/:path*',
    '/drive/:path*',
    '/files/:path*',
    '/team/:slug/drive/:path*',
    '/api/drive/:path*',
    '/api/files/:path*',
    '/events/:path*',
    '/calendar/:path*',
    '/clips/:path*',
    '/team/:slug/whiteboard/:path*',
    '/calls/:path*',
    '/api/calls/:path*',
    '/api/ai/:path*',
    '/api/agents/:path*',
    '/api/voice/:path*',
  ],
};


// import micromatch from 'micromatch';
// import { NextResponse } from 'next/server';
// import type { NextRequest } from 'next/server';
// import env from './lib/env';

// // Constants for security headers
// const SECURITY_HEADERS = {
//   'Referrer-Policy': 'strict-origin-when-cross-origin',
//   'Permissions-Policy': 'geolocation=(), microphone=()',
//   'Cross-Origin-Embedder-Policy': 'require-corp',
//   'Cross-Origin-Opener-Policy': 'same-origin',
//   'Cross-Origin-Resource-Policy': 'same-site',
// } as const;

// // Generate CSP
// const generateCSP = (): string => {
//   const policies = {
//     'default-src': ["'self'"],
//     'img-src': [
//       "'self'",
//       'data:',
//     ],
//     'script-src': [
//       "'self'",
//       "'unsafe-inline'",
//       "'unsafe-eval'",
//       '*.gstatic.com',
//       '*.google.com',
//     ],
//     'style-src': ["'self'", "'unsafe-inline'"],
//     'connect-src': [
//       "'self'",
//       '*.google.com',
//       '*.gstatic.com',
//       '*.ingest.sentry.io',
//       '*.mixpanel.com',
//     ],
//     'frame-src': ["'self'", '*.google.com', '*.gstatic.com'],
//     'font-src': ["'self'"],
//     'object-src': ["'none'"],
//     'base-uri': ["'self'"],
//     'form-action': ["'self'"],
//     'frame-ancestors': ["'none'"],
//   };

//   return Object.entries(policies)
//     .map(([key, values]) => `${key} ${values.join(' ')}`)
//     .concat(['upgrade-insecure-requests'])
//     .join('; ');
// };

// // Add routes that don't require authentication
// const unAuthenticatedRoutes = [
//   '/api/hello',
//   '/api/health',
//   '/api/auth/**',
//   '/api/auth/session',    
//   '/api/oauth/**',
//   '/api/scim/v2.0/**',
//   '/api/invitations/*',
//   '/api/webhooks/stripe',
//   '/api/webhooks/dsync',
//   '/api/webhooks/meetingbaas',
//   '/api/integrations/**',
//   '/auth/**',
//   '/invitations/*',
//   '/terms-condition',
//   '/unlock-account',
//   '/login/saml',
//   '/.well-known/*',
//   '/meeting/*',

// ];

// export default async function Middleware(req: NextRequest) {
//   const { pathname } = req.nextUrl;

//   if (micromatch.isMatch(pathname, unAuthenticatedRoutes)) {
//     return NextResponse.next();
//   }

//   const redirectUrl = new URL('/auth/login', req.url);
//   redirectUrl.searchParams.set('callbackUrl', encodeURI(req.url));

//   // ✅ Database strategy session check
//   const sessionRes = await fetch(new URL('/api/auth/session', req.url), {
//     headers: {
//       'Content-Type': 'application/json',
//       cookie: req.headers.get('cookie') || '',
//     },
//   });
//   const session = await sessionRes.json();

//   if (!session?.user) {
//     return NextResponse.redirect(redirectUrl);
//   }

//   const requestHeaders = new Headers(req.headers);
//   const csp = generateCSP();
//   requestHeaders.set('Content-Security-Policy', csp);

//   const response = NextResponse.next({ request: { headers: requestHeaders } });

//   const ua = req.headers.get('user-agent') || '';
//   const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(ua);
//   if (isMobile && !pathname.startsWith('/mobile-development')) {
//     const url = req.nextUrl.clone();
//     url.pathname = '/mobile-development';
//     return NextResponse.redirect(url);
//   }

//   if (env.securityHeadersEnabled) {
//     response.headers.set('Content-Security-Policy', csp);
//     Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
//       response.headers.set(key, value);
//     });
//   }

//   return response;
// }

// export const config = {
//   matcher: ['/((?!_next/static|_next/image|favicon.ico|).*)'],
// };

// export default async function proxy(req: NextRequest) {
//   const { pathname } = req.nextUrl;

//   // Bypass routes that don't require authentication
//   if (micromatch.isMatch(pathname, unAuthenticatedRoutes)) {
//     return NextResponse.next();
//   }

//   const redirectUrl = new URL('/auth/login', req.url);
//   redirectUrl.searchParams.set('callbackUrl', encodeURI(req.url));

//   // JWT strategy
//   // if (env.nextAuth.sessionStrategy === 'jwt') {
//   //   const token = await getToken({
//   //     req,
//   //   });

//   //   if (!token) {
//   //     return NextResponse.redirect(redirectUrl);
//   //   }
//   // }

//   // Database strategy
//   const sessionres (env.nextAuth.sessionStrategy === 'database') {
//     const url = new URL('/api/auth/session', req.url);

//     const response = await fetch(url, {
//       headers: {
//         'Content-Type': 'application/json',
//         cookie: req.headers.get('cookie') || '',
//       },
//     });

//     const session = await response.json();

//     if (!session.user) {
//       return NextResponse.redirect(redirectUrl);
//     }
//   }

//   const requestHeaders = new Headers(req.headers);
//   const csp = generateCSP();

//   requestHeaders.set('Content-Security-Policy', csp);

//   const response = NextResponse.next({
//     request: { headers: requestHeaders },
//   });

//   const ua = req.headers.get("user-agent") || "";
//   const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(ua);

  
//   if (isMobile && !req.nextUrl.pathname.startsWith("/mobile-development")) {
//     const url = req.nextUrl.clone();
//     url.pathname = "/mobile-development";
//     return NextResponse.redirect(url);
//   }

//   if (env.securityHeadersEnabled) {
//     // Set security headers
//     response.headers.set('Content-Security-Policy', csp);
//     Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
//       response.headers.set(key, value);
//     });
//   }

//   // All good, let the request through
//   return response;
// }

// export const config = {
//   matcher: ['/((?!_next/static|_next/image|favicon.ico|).*)'],
// };

// import micromatch from 'micromatch';
// import { getToken } from 'next-auth/jwt';
// import { NextResponse } from 'next/server';
// import type { NextRequest } from 'next/server';

// import env from './lib/env';

// // FIXED: Removed Cross-Origin-Embedder-Policy and updated Permissions-Policy
// const SECURITY_HEADERS = {
//   'Referrer-Policy': 'strict-origin-when-cross-origin',
//   'Permissions-Policy': 'microphone=(self), camera=(self)', // FIXED: Allow mic/camera
//   'Cross-Origin-Opener-Policy': 'same-origin',
//   'Cross-Origin-Resource-Policy': 'cross-origin', // FIXED: Changed to cross-origin
// } as const;

// // FIXED: Added WebRTC and TURN server support
// const generateCSP = (): string => {
//   const policies = {
//     'default-src': ["'self'"],
//     'img-src': ["'self'", 'data:', 'blob:'],
//     'script-src': [
//       "'self'",
//       "'unsafe-inline'",
//       "'unsafe-eval'",
//       '*.gstatic.com',
//       '*.google.com',
//     ],
//     'style-src': ["'self'", "'unsafe-inline'"],
//     'connect-src': [
//       "'self'",
//       '*.google.com',
//       '*.gstatic.com',
//       '*.ingest.sentry.io',
//       '*.mixpanel.com',
//       // FIXED: Added TURN/STUN servers for WebRTC
//       'openrelay.metered.ca',
//       'relay.metered.ca',
//       'stun.l.google.com',
//       'stun1.l.google.com',
//       'stun2.l.google.com',
//       // FIXED: Added protocols for WebRTC
//       'blob:',
//       'data:',
//       'wss:',
//       'ws:',
//       'stun:',
//       'turn:',
//     ],
//     'media-src': ["'self'", 'blob:', 'data:'], // FIXED: Allow media streams
//     'frame-src': ["'self'", '*.google.com', '*.gstatic.com'],
//     'font-src': ["'self'"],
//     'object-src': ["'none'"],
//     'base-uri': ["'self'"],
//     'form-action': ["'self'"],
//     'frame-ancestors': ["'none'"],
//   };

//   return Object.entries(policies)
//     .map(([key, values]) => `${key} ${values.join(' ')}`)
//     .concat(['upgrade-insecure-requests'])
//     .join('; ');
// };

// // FIXED: Added socket routes to bypass auth
// const unAuthenticatedRoutes = [
//   '/api/hello',
//   '/api/health',
//   '/api/auth/**',
//   '/api/oauth/**',
//   '/api/scim/v2.0/**',
//   '/api/invitations/*',
//   '/api/webhooks/stripe',
//   '/api/webhooks/dsync',
//   '/api/webhooks/meetingbaas',
//   '/api/integrations/**',
//   '/auth/**',
//   '/invitations/*',
//   '/terms-condition',
//   '/unlock-account',
//   '/login/saml',
//   '/.well-known/*',
//   '/api/socket/**',        // ADDED: Socket.io endpoint
//   '/api/socket/io/**',     // ADDED: Socket.io endpoint
// ];

// export default async function proxy(req: NextRequest) {
//   const { pathname } = req.nextUrl;

//   // Bypass routes that don't require authentication
//   if (micromatch.isMatch(pathname, unAuthenticatedRoutes)) {
//     return NextResponse.next();
//   }

//   const redirectUrl = new URL('/auth/login', req.url);
//   redirectUrl.searchParams.set('callbackUrl', encodeURI(req.url));

//   // JWT strategy
//   if (env.nextAuth.sessionStrategy === 'jwt') {
//     const token = await getToken({
//       req,
//     });

//     if (!token) {
//       return NextResponse.redirect(redirectUrl);
//     }
//   }

//   // Database strategy
//   else if (env.nextAuth.sessionStrategy === 'database') {
//     const url = new URL('/api/auth/session', req.url);

//     const response = await fetch(url, {
//       headers: {
//         'Content-Type': 'application/json',
//         cookie: req.headers.get('cookie') || '',
//       },
//     });

//     const session = await response.json();

//     if (!session.user) {
//       return NextResponse.redirect(redirectUrl);
//     }
//   }

//   const requestHeaders = new Headers(req.headers);
//   const csp = generateCSP();

//   requestHeaders.set('Content-Security-Policy', csp);

//   const response = NextResponse.next({
//     request: { headers: requestHeaders },
//   });

//   const ua = req.headers.get("user-agent") || "";
//   const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(ua);

  
//   if (isMobile && !req.nextUrl.pathname.startsWith("/mobile-development")) {
//     const url = req.nextUrl.clone();
//     url.pathname = "/mobile-development";
//     return NextResponse.redirect(url);
//   }

//   if (env.securityHeadersEnabled) {
//     // Set security headers
//     response.headers.set('Content-Security-Policy', csp);
//     Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
//       response.headers.set(key, value);
//     });
//   }

//   // All good, let the request through
//   return response;
// }

// export const config = {
//   matcher: ['/((?!_next/static|_next/image|favicon.ico|).*)'],
// };