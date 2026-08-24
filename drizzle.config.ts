import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://vaultmind:vaultmind@localhost:5433/vaultmind',
  },
  dialect: 'postgresql',
  out: './drizzle/migrations',
  schema: './src/db/schema.ts',
});
