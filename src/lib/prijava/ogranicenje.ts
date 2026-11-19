// Ograničenje broja pokušaja po ključu (račun ili adresa) u vremenskom prozoru.
import { and, count, eq, gt, lt } from 'drizzle-orm';
import type { Baza } from '../../db/baza';
import { pokusajPrijave } from '../../db/shema';
import { noviId } from '../id';

/** Bilježi pokušaj i vraća true ako je njime prekoračeno ograničenje. */
export async function prekoraceno(
  db: Baza,
  kljuc: string,
  najvise: number,
  prozorMinuta: number,
  sada: Date,
): Promise<boolean> {
  const od = new Date(sada.getTime() - prozorMinuta * 60_000).toISOString();
  const [red] = await db
    .select({ broj: count() })
    .from(pokusajPrijave)
    .where(and(eq(pokusajPrijave.kljuc, kljuc), gt(pokusajPrijave.vrijeme, od)));
  if ((red?.broj ?? 0) >= najvise) return true;
  await db.insert(pokusajPrijave).values({ id: noviId(sada), kljuc, vrijeme: sada.toISOString() });
  return false;
}

/** Briše pokušaje starije od jednog dana; poziva se povremeno. */
export async function pocistiPokusaje(db: Baza, sada: Date): Promise<void> {
  const granica = new Date(sada.getTime() - 24 * 3600_000).toISOString();
  await db.delete(pokusajPrijave).where(lt(pokusajPrijave.vrijeme, granica));
}
