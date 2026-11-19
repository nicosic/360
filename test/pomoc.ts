// Lokalna D1 baza (Miniflare) s primijenjenim migracijama, za testove.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { type Baza, otvoriBazu } from '../src/db/baza';
import type { Poruka, PosiljateljEposte } from '../src/lib/eposta';
import type { Okruzenje } from '../src/lib/prijava/prijava';

export async function testnaBaza(): Promise<{ db: Baza; d1: D1Database; zatvori: () => Promise<void> }> {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ persist: false });
  const d1 = proxy.env.DB;
  const mapa = join(import.meta.dirname, '..', 'migrations');
  for (const datoteka of readdirSync(mapa).filter((d) => d.endsWith('.sql')).sort()) {
    for (const naredba of readFileSync(join(mapa, datoteka), 'utf8').split('--> statement-breakpoint')) {
      if (naredba.trim()) await d1.prepare(naredba).run();
    }
  }
  return { db: otvoriBazu(d1), d1, zatvori: () => proxy.dispose() };
}

export class EpostaZaTest implements PosiljateljEposte {
  poruke: Poruka[] = [];
  async posalji(poruka: Poruka): Promise<void> {
    this.poruke.push(poruka);
  }
  zadnjiKod(): string {
    const nadjen = this.poruke.at(-1)?.tekst.match(/\b\d{8}\b/);
    if (!nadjen) throw new Error('u poruci nema koda');
    return nadjen[0];
  }
}

export function testnoOkruzenje(db: Baza): Okruzenje & { eposta: EpostaZaTest } {
  return { db, kljuc: new Uint8Array(32).fill(7), eposta: new EpostaZaTest(), instanca: 'test' };
}
