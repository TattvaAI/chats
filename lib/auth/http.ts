import { NextResponse } from 'next/server';

export function privateResponse<T extends Response>(response: T): T {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export function privateJson(data: unknown, status = 200) {
  return privateResponse(NextResponse.json(data, { status }));
}
