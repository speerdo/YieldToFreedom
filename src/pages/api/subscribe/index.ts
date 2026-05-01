import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Resend } from 'resend';

import { db } from '../../../lib/db';
import { emailSubscribers } from '../../../lib/db/schema';
import { normalizeEmail, readJsonBody } from '../../../lib/http/json-body';
import { publicSiteOrigin } from '../../../lib/site/url';

export const prerender = false;

function newToken(): string {
  return randomBytes(24).toString('hex');
}

export const POST: APIRoute = async ({ request }) => {
  const body = await readJsonBody(request);
  const email = normalizeEmail(body.email);
  if (!email) {
    return Response.json({ error: 'invalid_email' }, { status: 400 });
  }

  const sourceRaw = body.source;
  const source =
    typeof sourceRaw === 'string' && sourceRaw.trim().slice(0, 50).length
      ? sourceRaw.trim().slice(0, 50)
      : 'homepage';

  const token = newToken();

  const [existing] = await db
    .select()
    .from(emailSubscribers)
    .where(eq(emailSubscribers.email, email))
    .limit(1);

  if (existing?.unsubscribed) {
    await db
      .update(emailSubscribers)
      .set({
        unsubscribed: false,
        verificationToken: token,
        confirmed: false,
        confirmedAt: null,
        source,
      })
      .where(eq(emailSubscribers.email, email));
  } else if (existing) {
    if (existing.confirmed) {
      return Response.json({ ok: true, alreadyConfirmed: true });
    }
    await db
      .update(emailSubscribers)
      .set({ verificationToken: token, source })
      .where(eq(emailSubscribers.email, email));
  } else {
    await db.insert(emailSubscribers).values({
      email,
      source,
      verificationToken: token,
      confirmed: false,
      unsubscribed: false,
    });
  }

  const key =
    (typeof import.meta !== 'undefined' && 'env' in import.meta
      ? (import.meta.env as Record<string, string | undefined>).RESEND_API_KEY
      : undefined) ?? process.env.RESEND_API_KEY;

  const fromAddress =
    (typeof import.meta !== 'undefined' && 'env' in import.meta
      ? (import.meta.env as Record<string, string | undefined>).RESEND_FROM
      : undefined) ??
    process.env.RESEND_FROM ??
    'Yield to Freedom <onboarding@resend.dev>';

  const origin = publicSiteOrigin();
  const confirmUrl = `${origin}/api/subscribe/confirm?token=${encodeURIComponent(token)}`;

  if (key) {
    const resend = new Resend(key);
    await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: 'Confirm your Yield to Freedom subscription',
      html: `
        <p>You asked for the free Income ETF Starter Guide from Yield to Freedom.</p>
        <p><a href="${confirmUrl}">Confirm your email address</a> to finish subscribing.</p>
        <p style="color:#666;font-size:12px;">If you did not request this, you can ignore this message.</p>
      `,
      text: `Confirm your Yield to Freedom subscription: ${confirmUrl}`,
    });
  }

  return Response.json({
    ok: true,
    emailSent: Boolean(key),
  });
};
