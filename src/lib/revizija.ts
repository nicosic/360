// Revizijski trag: zapisi se samo dodaju, a svaki nosi kontrolni zbroj prethodnog,
// pa se naknadna izmjena ili brisanje mogu otkriti provjerom lanca.
import { asc, desc } from 'drizzle-orm';
import type { Baza } from '../db/baza';
import { revizija } from '../db/shema';
import { sha256Heks } from './kripto';

export const POCETNI_ZBROJ = '0'.repeat(64);

export interface UnosRevizije {
  racunId?: string | null;
  radnja: string;
  predmetVrsta?: string | null;
  predmetId?: string | null;
  prije?: unknown;
  poslije?: unknown;
}

type Redak = typeof revizija.$inferSelect;

function uTekst(vrijednost: unknown): string | null {
  return vrijednost === undefined || vrijednost === null ? null : JSON.stringify(vrijednost);
}

export function zbrojZapisa(z: Omit<Redak, 'zbroj'>): Promise<string> {
  return sha256Heks(
    JSON.stringify([
      z.rb,
      z.vrijeme,
      z.racunId,
      z.radnja,
      z.predmetVrsta,
      z.predmetId,
      z.prije,
      z.poslije,
      z.zbrojPrethodnog,
    ]),
  );
}

/**
 * Dodaje zapis u trag. Redni broj se zadaje izričito (prethodni + 1), pa dva istodobna
 * upisa ne mogu dobiti isti broj: drugi se odbija na primarnom ključu i ponavlja.
 */
export async function zabiljezi(db: Baza, unos: UnosRevizije, sada: Date = new Date()): Promise<number> {
  for (let pokusaj = 0; pokusaj < 8; pokusaj++) {
    const [zadnji] = await db
      .select({ rb: revizija.rb, zbroj: revizija.zbroj })
      .from(revizija)
      .orderBy(desc(revizija.rb))
      .limit(1);
    const bezZbroja = {
      rb: (zadnji?.rb ?? 0) + 1,
      vrijeme: sada.toISOString(),
      racunId: unos.racunId ?? null,
      radnja: unos.radnja,
      predmetVrsta: unos.predmetVrsta ?? null,
      predmetId: unos.predmetId ?? null,
      prije: uTekst(unos.prije),
      poslije: uTekst(unos.poslije),
      zbrojPrethodnog: zadnji?.zbroj ?? POCETNI_ZBROJ,
    };
    const zapis = { ...bezZbroja, zbroj: await zbrojZapisa(bezZbroja) };
    try {
      await db.insert(revizija).values(zapis);
      return zapis.rb;
    } catch (greska) {
      const poruka = String((greska as Error)?.message ?? greska) + String((greska as { cause?: unknown })?.cause ?? '');
      if (!/UNIQUE|PRIMARY KEY|constraint/i.test(poruka)) throw greska;
    }
  }
  throw new Error('revizija: upis nije uspio nakon ponovljenih pokušaja');
}

export interface IshodProvjere {
  ispravno: boolean;
  zapisa: number;
  /** Redni broj prvog zapisa koji ne odgovara lancu. */
  prekidNa?: number;
}

/** Prolazi cijeli trag i provjerava redne brojeve i kontrolne zbrojeve. */
export async function provjeriLanac(db: Baza): Promise<IshodProvjere> {
  const zapisi = await db.select().from(revizija).orderBy(asc(revizija.rb));
  let prethodni = POCETNI_ZBROJ;
  let ocekivaniRb = 1;
  for (const z of zapisi) {
    const { zbroj, ...bezZbroja } = z;
    if (z.rb !== ocekivaniRb || z.zbrojPrethodnog !== prethodni || (await zbrojZapisa(bezZbroja)) !== zbroj) {
      return { ispravno: false, zapisa: zapisi.length, prekidNa: z.rb };
    }
    prethodni = zbroj;
    ocekivaniRb++;
  }
  return { ispravno: true, zapisa: zapisi.length };
}
