import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';

import { db } from '../../../lib/db';
import { emailSubscribers } from '../../../lib/db/schema';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const origin = new URL(request.url).origin;
  const token = url.searchParams.get('token')?.trim();
  if (!token) {
    return Response.redirect(`${origin}/subscribe/invalid`, 302);
  }

  const [row] = await db
    .select()
    .from(emailSubscribers)
    .where(eq(emailSubscribers.verificationToken, token))
    .limit(1);

  if (!row) {
    return Response.redirect(`${origin}/subscribe/invalid`, 302);
  }

  await db
    .update(emailSubscribers)
    .set({
      confirmed: true,
      confirmedAt: new Date(),
      verificationToken: null,
    })
    .where(eq(emailSubscribers.id, row.id));

  return Response.redirect(`${origin}/subscribe/confirmed`, 302);
};
