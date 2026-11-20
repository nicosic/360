import { eq } from 'drizzle-orm';
import type { Baza } from '../db/baza';
import { racun } from '../db/shema';
import { ulogeRacuna } from './ovlasti';
import type { Korisnik } from './postupak/stroj';

export async function ucitajKorisnika(db: Baza, racunId: string, sada: Date): Promise<Korisnik> {
  const [r] = await db.select({ osobaId: racun.osobaId }).from(racun).where(eq(racun.id, racunId)).limit(1);
  return { racunId, osobaId: r?.osobaId ?? null, uloge: await ulogeRacuna(db, racunId, sada) };
}
