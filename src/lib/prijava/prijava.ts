// Prijava bez lozinke: jednokratni kod na e-poštu (prvi faktor),
// zatim kod iz aplikacije (drugi faktor). Svaki korak ulazi u revizijski trag.
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Baza } from '../../db/baza';
import { jednokratniKod, racun } from '../../db/shema';
import type { PosiljateljEposte } from '../eposta';
import { noviId } from '../id';
import { type Bajtovi, desifriraj, hmacHeks, jednako, sifriraj } from '../kripto';
import { zabiljezi } from '../revizija';
import { prekoraceno } from './ogranicenje';
import { type AktivnaSjednica, opozoviSjednicu, stvoriSjednicu } from './sjednica';
import { adresaZaAplikaciju, novaTajna, provjeriKod } from './totp';

export const KOD_VRIJEDI_MINUTA = 10;
export const KOD_NAJVISE_POKUSAJA = 5;
const PROZOR_MINUTA = 15;
const ZAHTJEVA_PO_RACUNU = 5;
const ZAHTJEVA_PO_ADRESI = 20;
const POKUSAJA_DRUGOG_FAKTORA = 5;

export interface Okruzenje {
  db: Baza;
  kljuc: Bajtovi;
  eposta: PosiljateljEposte;
  /** Oznaka instance; prikazuje se u aplikaciji za kodove i u poruci. */
  instanca: string;
  /**
   * Stalni kod prvog faktora. Postavlja se samo na ispitnoj instanci (vidi src/platforma/okolina.ts);
   * tko zna adresu e-pošte računa, s njim prolazi prvi faktor.
   */
  ispitniKod?: string;
}

export function urediEpostu(unos: string): string {
  return unos.trim().toLowerCase();
}

/** Osam nasumičnih znamenki, ravnomjerno raspodijeljenih. */
export function noviJednokratniKod(): string {
  const granica = Math.floor(2 ** 32 / 1e8) * 1e8;
  const polje = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(polje);
    if (polje[0]! < granica) return String(polje[0]! % 1e8).padStart(8, '0');
  }
}

function sazetakKoda(kljuc: Bajtovi, racunId: string, kod: string): Promise<string> {
  return hmacHeks(kljuc, 'jednokratni-kod', `${racunId}:${kod}`);
}

export type IshodZahtjeva = 'poslano' | 'ograniceno';

/**
 * Šalje jednokratni kod ako račun postoji i nije blokiran. Pozivatelju se u oba
 * slučaja vraća isti ishod, da se ne može ispitivati koje adrese imaju račun.
 */
export async function zatraziKod(o: Okruzenje, unosEposte: string, adresa: string, sada: Date): Promise<IshodZahtjeva> {
  const eposta = urediEpostu(unosEposte);
  if (await prekoraceno(o.db, `adresa:${adresa}`, ZAHTJEVA_PO_ADRESI, PROZOR_MINUTA, sada)) return 'ograniceno';
  if (await prekoraceno(o.db, `zahtjev:${eposta}`, ZAHTJEVA_PO_RACUNU, PROZOR_MINUTA, sada)) return 'ograniceno';

  const [r] = await o.db.select().from(racun).where(eq(racun.eposta, eposta)).limit(1);
  if (!r || r.stanje === 'blokiran') return 'poslano';

  const kod = noviJednokratniKod();
  await o.db.insert(jednokratniKod).values({
    id: noviId(sada),
    racunId: r.id,
    sazetak: await sazetakKoda(o.kljuc, r.id, kod),
    istice: new Date(sada.getTime() + KOD_VRIJEDI_MINUTA * 60_000).toISOString(),
    stvoreno: sada.toISOString(),
  });
  await o.eposta.posalji({
    prima: eposta,
    predmet: 'Kod za prijavu',
    tekst: `Vaš kod za prijavu je ${kod}. Vrijedi ${KOD_VRIJEDI_MINUTA} minuta. Ako prijavu niste zatražili, zanemarite ovu poruku.`,
  });
  await zabiljezi(o.db, { racunId: r.id, radnja: 'prijava.kod_poslan', predmetVrsta: 'racun', predmetId: r.id }, sada);
  return 'poslano';
}

/** Provjerava kod iz e-pošte. Uspjeh daje token sjednice razine 'kod'. */
export async function potvrdiKod(o: Okruzenje, unosEposte: string, kod: string, sada: Date): Promise<string | null> {
  const eposta = urediEpostu(unosEposte);
  const cisto = kod.replace(/\s/g, '');
  const [r] = await o.db.select().from(racun).where(eq(racun.eposta, eposta)).limit(1);
  if (!r || r.stanje === 'blokiran') return null;

  if (o.ispitniKod && jednako(cisto, o.ispitniKod)) {
    await zabiljezi(
      o.db,
      { racunId: r.id, radnja: 'prijava.kod_potvrden', predmetVrsta: 'racun', predmetId: r.id, poslije: { ispitniKod: true } },
      sada,
    );
    return stvoriSjednicu(o.db, r.id, 'kod', sada);
  }
  if (!/^\d{8}$/.test(cisto)) return null;

  const [zadnji] = await o.db
    .select()
    .from(jednokratniKod)
    .where(and(eq(jednokratniKod.racunId, r.id), isNull(jednokratniKod.iskoristenU)))
    .orderBy(desc(jednokratniKod.stvoreno))
    .limit(1);
  if (!zadnji || sada.getTime() >= Date.parse(zadnji.istice) || zadnji.pokusaja >= KOD_NAJVISE_POKUSAJA) {
    return null;
  }

  const ispravan = jednako(zadnji.sazetak, await sazetakKoda(o.kljuc, r.id, cisto));
  await o.db
    .update(jednokratniKod)
    .set({ pokusaja: zadnji.pokusaja + 1, iskoristenU: ispravan ? sada.toISOString() : null })
    .where(eq(jednokratniKod.id, zadnji.id));
  if (!ispravan) {
    await zabiljezi(o.db, { racunId: r.id, radnja: 'prijava.kod_odbijen', predmetVrsta: 'racun', predmetId: r.id }, sada);
    return null;
  }
  await zabiljezi(o.db, { racunId: r.id, radnja: 'prijava.kod_potvrden', predmetVrsta: 'racun', predmetId: r.id }, sada);
  return stvoriSjednicu(o.db, r.id, 'kod', sada);
}

export interface UpisDrugogFaktora {
  tajna: string;
  adresa: string;
}

/**
 * Ako račun još nema potvrđen drugi faktor, vraća tajnu za upis u aplikaciju.
 * Nepotvrđena tajna se ponovno koristi, da osvježavanje stranice ne poništi upis.
 */
export async function pripremiDrugiFaktor(o: Okruzenje, racunId: string): Promise<UpisDrugogFaktora | null> {
  const [r] = await o.db.select().from(racun).where(eq(racun.id, racunId)).limit(1);
  if (!r) throw new Error('račun ne postoji');
  if (r.totpPotvrdenU) return null;

  let tajna: string;
  if (r.totpTajnaSifrirano) {
    tajna = await desifriraj(o.kljuc, 'totp', r.totpTajnaSifrirano);
  } else {
    tajna = novaTajna();
    await o.db
      .update(racun)
      .set({ totpTajnaSifrirano: await sifriraj(o.kljuc, 'totp', tajna) })
      .where(eq(racun.id, r.id));
  }
  return { tajna, adresa: adresaZaAplikaciju(tajna, r.eposta, `Ocjenjivanje (${o.instanca})`) };
}

export type IshodDrugogFaktora = { token: string } | 'odbijeno' | 'ograniceno';

/**
 * Provjerava kod iz aplikacije. Uspjeh potvrđuje drugi faktor (pri prvom upisu),
 * opoziva sjednicu prvog faktora i izdaje novu, potpunu.
 */
export async function potvrdiDrugiFaktor(
  o: Okruzenje,
  sjednica: AktivnaSjednica,
  kod: string,
  sada: Date,
): Promise<IshodDrugogFaktora> {
  if (await prekoraceno(o.db, `drugi-faktor:${sjednica.racunId}`, POKUSAJA_DRUGOG_FAKTORA, PROZOR_MINUTA, sada)) {
    return 'ograniceno';
  }
  const [r] = await o.db.select().from(racun).where(eq(racun.id, sjednica.racunId)).limit(1);
  if (!r?.totpTajnaSifrirano || r.stanje === 'blokiran') return 'odbijeno';

  const tajna = await desifriraj(o.kljuc, 'totp', r.totpTajnaSifrirano);
  const korak = await provjeriKod(tajna, kod, sada, r.totpZadnjiKorak);
  if (korak === null) {
    await zabiljezi(
      o.db,
      { racunId: r.id, radnja: 'prijava.drugi_faktor_odbijen', predmetVrsta: 'racun', predmetId: r.id },
      sada,
    );
    return 'odbijeno';
  }

  const prviUpis = !r.totpPotvrdenU;
  await o.db
    .update(racun)
    .set({
      totpZadnjiKorak: korak,
      totpPotvrdenU: r.totpPotvrdenU ?? sada.toISOString(),
      stanje: 'aktivan',
    })
    .where(eq(racun.id, r.id));
  await opozoviSjednicu(o.db, sjednica.id, sada);
  const token = await stvoriSjednicu(o.db, r.id, 'potpuna', sada);
  await zabiljezi(
    o.db,
    {
      racunId: r.id,
      radnja: prviUpis ? 'prijava.drugi_faktor_upisan' : 'prijava.uspjesna',
      predmetVrsta: 'racun',
      predmetId: r.id,
    },
    sada,
  );
  return { token };
}

export async function odjavi(o: Okruzenje, sjednica: AktivnaSjednica, sada: Date): Promise<void> {
  await opozoviSjednicu(o.db, sjednica.id, sada);
  await zabiljezi(
    o.db,
    { racunId: sjednica.racunId, radnja: 'prijava.odjava', predmetVrsta: 'racun', predmetId: sjednica.racunId },
    sada,
  );
}
