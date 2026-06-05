import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import clerk from '@clerk/astro';

const clerkPublishableKey = process.env.PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

export default defineConfig({
  site: 'https://yieldtofreedom.com',
  output: 'static',
  adapter: vercel({
    webAnalytics: { enabled: true },
    edgeMiddleware: true,
    maxDuration: 60,
  }),
  integrations: [
    ...(clerkPublishableKey ? [clerk()] : []),
  ],
});
