import { currentProfile } from './access';

export async function isAuthorizedAdmin(req: Request): Promise<boolean> {
  // 1. Check ADMIN_SECRET header or cookie
  const adminSecret = (process.env.ADMIN_SECRET || 'frank-admin-2026').trim();
  const authHeader = req.headers.get('x-admin-key')?.trim();
  const cookies = req.headers.get('cookie') || '';
  const adminCookieMatch = cookies.split(';').map(c => c.trim()).find(c => c.startsWith('frank_admin='));
  const adminCookie = adminCookieMatch ? adminCookieMatch.split('=')[1]?.trim() : undefined;

  if (authHeader && authHeader === adminSecret) return true;
  if (adminCookie && adminCookie === adminSecret) return true;

  // 2. Check signed-in profile against ADMIN_EMAIL / ADMIN_EMAILS
  try {
    const profile = await currentProfile(req);
    if (profile?.email) {
      const allowedEmails = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || 'userj5334@gmail.com')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);
      if (allowedEmails.includes(profile.email.toLowerCase())) {
        return true;
      }
    }
  } catch {
    // ignore
  }

  return false;
}
