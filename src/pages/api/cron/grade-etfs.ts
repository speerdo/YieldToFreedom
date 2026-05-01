import type { APIRoute } from 'astro';

import { cronAuthorized, cronUnauthorizedResponse } from '../../../lib/http/cron-auth';
import { gradeAllActiveEtfs } from '../../../lib/grader/run-all';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!cronAuthorized(request)) return cronUnauthorizedResponse();
  const result = await gradeAllActiveEtfs();
  return Response.json({ ok: true, ...result });
};
