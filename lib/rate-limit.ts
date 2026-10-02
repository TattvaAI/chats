const hits = new Map<string, number[]>();

function getIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'local';
}

export function checkRateLimit(
  req: Request,
  opts: { limit: number; windowMs: number }
): boolean {
  const ip = getIp(req);
  const now = Date.now();
  const windowStart = now - opts.windowMs;
  const existing = hits.get(ip) ?? [];
  const recent = existing.filter((t) => t > windowStart);
  if (recent.length >= opts.limit) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}
