import { defineConfig } from 'drizzle-kit';

// drizzle-kit samo IZRAĐUJE SQL migracije. Primjenjuje ih isključivo Wrangler
// (`wrangler d1 migrations apply`), bazu po bazu.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/shema.ts',
  out: './migrations',
});
