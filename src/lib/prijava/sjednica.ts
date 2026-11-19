// Sjednice prijave u bazi instance. U kolačiću je samo nasumičan token; u bazi njegov SHA-256.
import { and, eq, isNull } from 'drizzle-orm';
import type { Baza } from '../../db/baza';
import { racun, sjednicaPrijave } from '../../db/shema';
import { noviId } from '../id';
import { nasumicniToken, sha256Heks } from '../kripto';

export const NEAKTIVNOST_MINUTA = 30;
export const NAJDULJE_SATI = 12;
/** Sjednica s potvrđenim samo prvim faktorom vrijedi kratko. */
export const PRVI_FAKTOR_MINUTA = 10;
/** Zadnja aktivnost se ne upisuje pri svakom zahtjevu, nego najviše jednom u minuti. */
const OSVJEZI_NAKON_SEKUNDI = 60;

export type Razina = 'kod' | 'potpuna';

export interface AktivnaSjednica {
  id: string;
  racunId: string;
  eposta: string;
  razina: Razina;
}

export async function stvoriSjednicu(db: Baza, racunId: string, razina: Razina, sada: Date): Promise<string> {
  const token = nasumicniToken();
  const trajanjeMs = razina === 'potpuna' ? NAJDULJE_SATI * 3600_000 : PRVI_FAKTOR_MINUTA * 60_000;
  await db.insert(sjednicaPrijave).values({
    id: noviId(sada),
    racunId,
    sazetakTokena: await sha256Heks(token),
    razina,
    stvoreno: sada.toISOString(),
    zadnjaAktivnost: sada.toISOString(),
    istice: new Date(sada.getTime() + trajanjeMs).toISOString(),
  });
  return token;
}

export async function ucitajSjednicu(db: Baza, token: string | undefined, sada: Date): Promise<AktivnaSjednica | null> {
  if (!token) return null;
  const [red] = await db
    .select({
      id: sjednicaPrijave.id,
      racunId: sjednicaPrijave.racunId,
      razina: sjednicaPrijave.razina,
      zadnjaAktivnost: sjednicaPrijave.zadnjaAktivnost,
      istice: sjednicaPrijave.istice,
      opozvanaU: sjednicaPrijave.opozvanaU,
      eposta: racun.eposta,
      stanje: racun.stanje,
    })
    .from(sjednicaPrijave)
    .innerJoin(racun, eq(racun.id, sjednicaPrijave.racunId))
    .where(eq(sjednicaPrijave.sazetakTokena, await sha256Heks(token)))
    .limit(1);
  if (!red || red.opozvanaU || red.stanje === 'blokiran') return null;

  const sadaMs = sada.getTime();
  if (sadaMs >= Date.parse(red.istice)) return null;
  const neaktivnoMs = sadaMs - Date.parse(red.zadnjaAktivnost);
  if (neaktivnoMs >= NEAKTIVNOST_MINUTA * 60_000) return null;

  if (neaktivnoMs >= OSVJEZI_NAKON_SEKUNDI * 1000) {
    await db
      .update(sjednicaPrijave)
      .set({ zadnjaAktivnost: sada.toISOString() })
      .where(eq(sjednicaPrijave.id, red.id));
  }
  return { id: red.id, racunId: red.racunId, eposta: red.eposta, razina: red.razina };
}

export async function opozoviSjednicu(db: Baza, id: string, sada: Date): Promise<void> {
  await db
    .update(sjednicaPrijave)
    .set({ opozvanaU: sada.toISOString() })
    .where(and(eq(sjednicaPrijave.id, id), isNull(sjednicaPrijave.opozvanaU)));
}

export async function opozoviSveSjednice(db: Baza, racunId: string, sada: Date): Promise<void> {
  await db
    .update(sjednicaPrijave)
    .set({ opozvanaU: sada.toISOString() })
    .where(and(eq(sjednicaPrijave.racunId, racunId), isNull(sjednicaPrijave.opozvanaU)));
}
