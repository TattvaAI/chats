import { requireAuthentication } from '@/lib/auth/access';
import { privateJson } from '@/lib/auth/http';

export const dynamic = 'force-dynamic';

export function GET() {
  return privateJson({
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    email: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    requireAuth: requireAuthentication(),
  });
}
