// Odluka o pristupu predmetu: uloga, odnos prema predmetu, stanje koraka i izuzeće.
import { eq } from 'drizzle-orm';
import type { Baza } from '../../db/baza';
import { predmet } from '../../db/shema';
import { type StanjeCiklusa, ucitajCiklus } from './ciklus';
import { izracunajStanje, jeIzuzet, type Korisnik, type PodaciPredmeta } from './stroj';

/** Smije li korisnik vidjeti sadržaj predmeta. Administrator bez druge uloge ne smije. */
export function mozeVidjeti(s: StanjeCiklusa, pp: PodaciPredmeta, korisnik: Korisnik, sada: Date): boolean {
  if (korisnik.uloge.includes('kadrovska') || korisnik.uloge.includes('odlucitelj')) return true;
  if (!korisnik.osobaId) return false;
  if (korisnik.osobaId === pp.predmet.osobaId || korisnik.osobaId === pp.predmet.nadredeniOsobaId) return true;
  // Član tijela vidi predmet tek kad korak njegova tijela dođe na red, i samo ako nije izuzet.
  if (jeIzuzet(pp, korisnik.osobaId)) return false;
  return izracunajStanje(s.paket, pp, sada).some((k) => {
    if (!k.def.izvrsitelj.startsWith('tijelo:') || (k.stanje !== 'na-redu' && k.stanje !== 'zavrsen')) return false;
    const sastav = s.tijela.get(k.def.izvrsitelj.slice(7));
    return !!sastav?.imenovano && sastav.clanovi.some((c) => c.osobaId === korisnik.osobaId);
  });
}

export async function ucitajPredmet(db: Baza, predmetId: string): Promise<{ s: StanjeCiklusa; pp: PodaciPredmeta } | null> {
  const [red] = await db.select({ ciklusId: predmet.ciklusId }).from(predmet).where(eq(predmet.id, predmetId)).limit(1);
  if (!red) return null;
  const s = await ucitajCiklus(db, red.ciklusId);
  const pp = s?.predmeti.find((p) => p.predmet.id === predmetId);
  return s && pp ? { s, pp } : null;
}

export function hrDatum(iso: string | null | undefined): string {
  if (!iso) return '–';
  const [g, m, d] = iso.slice(0, 10).split('-');
  return `${Number(d)}. ${Number(m)}. ${g}.`;
}

export const NAZIVI_STANJA: Record<string, string> = {
  'zavrsen': 'završeno',
  'bez-odgovora': 'bez odgovora',
  'istekao': 'rok istekao',
  'preskocen': 'ne primjenjuje se',
  'na-redu': 'na redu',
  'ceka': 'čeka',
};
