import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { kvNamespaces: ['FEED_CACHE'] },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/live/**'],
  },
});
