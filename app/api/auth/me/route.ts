import { currentProfile } from '@/lib/auth/access';
import { privateJson } from '@/lib/auth/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const profile = await currentProfile(req);
    return profile ? privateJson(profile) : privateJson({ error: 'Sign in to access your account.' }, 401);
  } catch {
    return privateJson({ error: 'Account storage is unavailable. Please try again.' }, 503);
  }
}
