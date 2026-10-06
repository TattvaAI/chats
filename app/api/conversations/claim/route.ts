import { z } from 'zod';
import { claimConversations, currentProfile } from '@/lib/auth/access';
import { privateJson, privateResponse } from '@/lib/auth/http';
import { readJson, RequestError, requestFailure } from '@/lib/requests';

const claimsSchema = z.object({
  claims: z.array(z.object({ id: z.uuid(), token: z.string().min(32).max(128) })).max(100),
});

export async function POST(req: Request) {
  try {
    const { claims } = claimsSchema.parse(await readJson(req, 30_000));
    const profile = await currentProfile(req);
    if (!profile) throw new RequestError('Sign in to save these reports to your account.', 401);
    return privateJson(await claimConversations(profile.id, claims));
  } catch (error) { return privateResponse(requestFailure(error)); }
}
