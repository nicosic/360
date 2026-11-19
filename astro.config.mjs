import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Jedan kod za sve kupce. Koja se instanca gradi određuje Wrangler konfiguracija:
// lokalno wrangler.jsonc, a za kupca datoteka koju izradi scripts/otvori-instancu.mjs.
const configPath = process.env.WRANGLER_KONFIGURACIJA ?? './wrangler.jsonc';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({ configPath }),
  // Sjednice vodimo sami, u bazi instance (D1), a ne u zajedničkom KV spremištu.
  session: false,
  security: { checkOrigin: true },
  devToolbar: { enabled: false },
});
