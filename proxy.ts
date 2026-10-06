import { NextRequest, NextResponse } from 'next/server';

function privateResponse(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export function proxy(req: NextRequest) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    let expected: string;
    try {
      if (!process.env.APP_URL && process.env.NODE_ENV === 'production') throw new Error('Missing public origin');
      const configured = new URL(process.env.APP_URL || 'http://localhost:3000');
      if (configured.username || configured.password || configured.search || configured.hash || configured.pathname !== '/' || !['http:', 'https:'].includes(configured.protocol)
        || (process.env.NODE_ENV === 'production' && configured.protocol !== 'https:')) throw new Error('Invalid public origin');
      expected = configured.origin;
    } catch {
      return privateResponse(NextResponse.json({ error: 'The public site address needs configuration.' }, { status: 503 }));
    }
    if (req.headers.get('sec-fetch-site') === 'cross-site' || req.headers.get('origin') !== expected) {
      return privateResponse(NextResponse.json({ error: 'This request must come from Frank.' }, { status: 403 }));
    }
  }
  return privateResponse(NextResponse.next());
}

export const config = { matcher: ['/api/:path*', '/c/:path*', '/account/:path*', '/setup/:path*', '/login/:path*', '/chat/:path*'] };
