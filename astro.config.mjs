import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import clerk from '@clerk/astro';

export default defineConfig({
  site: 'https://yieldtofreedom.com',
  output: 'static',
  adapter: vercel({
    webAnalytics: { enabled: true },
    edgeMiddleware: true,
  }),
  integrations: [clerk()],
});
