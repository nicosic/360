// Prvi dio odluke o pristupu: ima li račun ulogu na zadani dan.
// Odnos prema predmetu, stanje koraka i izuzeće dolaze s modelom postupka.
import { and, eq, gt, isNull, lte, or } from 'drizzle-orm';
import type { Baza } from '../db/baza';
import { uloga } from '../db/shema';

export const ADMINISTRATOR = 'administrator';

export async function ulogeRacuna(db: Baza, racunId: string, sada: Date): Promise<string[]> {
  const dan = sada.toISOString();
  const redci = await db
    .select({ uloga: uloga.uloga })
    .from(uloga)
    .where(
      and(eq(uloga.racunId, racunId), lte(uloga.vrijediOd, dan), or(isNull(uloga.vrijediDo), gt(uloga.vrijediDo, dan))),
    );
  return redci.map((r) => r.uloga);
}

export async function imaUlogu(db: Baza, racunId: string, trazena: string, sada: Date): Promise<boolean> {
  return (await ulogeRacuna(db, racunId, sada)).includes(trazena);
}
