/// <reference types="astro/client" />

// Tajne koje nisu u wrangler.jsonc, pa ih `wrangler types` ne vidi bez .dev.vars.
declare namespace Cloudflare {
  interface Env {
    /** 32 nasumična bajta u base64; po instanci. */
    KLJUC_INSTANCE: string;
  }
}

declare namespace App {
  interface Locals {
    okruzenje: import('./lib/prijava/prijava').Okruzenje;
    sjednica: import('./lib/prijava/sjednica').AktivnaSjednica | null;
    verzija: string;
  }
}
