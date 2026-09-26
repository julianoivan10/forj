import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // `@forj/db` throws at import time without a URL. The pool is lazy, so
    // this placeholder is never connected to — tests inject a fake `ctx.db`.
    env: {
      DATABASE_URL: 'postgres://test:test@127.0.0.1:1/test',
      NEXT_PUBLIC_CHAIN_ID: '84532',
      ADMIN_USER_IDS: '00000000-0000-4000-8000-00000000ad01',
    },
  },
});
