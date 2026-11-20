// Ciklus: otvaranje, učitavanje stanja, tijela i kvote.
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Baza } from '../../db/baza';
import { ciklus, clanTijela, glas, korak, odsutnost, osoba, postavke, predmet, raspored, tijelo, zapis } from '../../db/shema';
import { ucitajPaket } from '../../paketi';
import { type Paket, type Postavke, PostavkeS, provjeriPostavke, zadanePostavke } from '../../paketi/tipovi';
import { noviId } from '../id';
import { zabiljezi } from '../revizija';
import { danaUGodini, danaUnutarGodine, datumUGodini } from './rokovi';
import { GreskaPostupka, type Kontekst, type Korisnik, type PodaciPredmeta, type SastavTijela, temeljOdluke } from './stroj';

export type RedOsobe = typeof osoba.$inferSelect;

export interface StanjeCiklusa extends Kontekst {
  ciklus: typeof ciklus.$inferSelect;
  predmeti: PodaciPredmeta[];
  osobe: Map<string, RedOsobe>;
  tijelaRedovi: Map<string, typeof tijelo.$inferSelect>;
}

export function imeOsobe(osobe: Map<string, RedOsobe>, id: string | null): string {
  const o = id ? osobe.get(id) : undefined;
  return o ? `${o.ime} ${o.prezime}` : '–';
}

export async function ucitajPostavke(db: Baza, paket: Paket): Promise<{ id: string; sadrzaj: Postavke; zakljucano: boolean }> {
  const [red] = await db.select().from(postavke).where(eq(postavke.paket, paket.oznaka)).orderBy(desc(postavke.stvoreno)).limit(1);
  if (red) return { id: red.id, sadrzaj: PostavkeS.parse(JSON.parse(red.sadrzaj)), zakljucano: !!red.zakljucanoU };
  const sada = new Date();
  const id = noviId(sada);
  const sadrzaj = zadanePostavke(paket);
  await db.insert(postavke).values({ id, paket: paket.oznaka, sadrzaj: JSON.stringify(sadrzaj), stvoreno: sada.toISOString() });
  return { id, sadrzaj, zakljucano: false };
}

/** Sprema postavke kao novu verziju; zaključane verzije se ne mijenjaju. */
export async function spremiPostavke(db: Baza, paket: Paket, unos: unknown, korisnik: Korisnik, sada: Date): Promise<string[]> {
  const sadrzaj = PostavkeS.parse(unos);
  const greske = provjeriPostavke(paket, sadrzaj);
  if (greske.length) return greske;
  const id = noviId(sada);
  await db.insert(postavke).values({ id, paket: paket.oznaka, sadrzaj: JSON.stringify(sadrzaj), stvoreno: sada.toISOString() });
  await zabiljezi(db, { racunId: korisnik.racunId, radnja: 'postavke.spremljene', predmetVrsta: 'postavke', predmetId: id, poslije: sadrzaj }, sada);
  return [];
}

export interface Razvrstavanje {
  osobaId: string;
  nadredeniOsobaId: string | null;
  stanje: 'u-tijeku' | 'ne-ocjenjuje-se';
  razlog: string | null;
  ocjenaPoPropisu: string | null;
}

/**
 * Razvrstava osobe za godinu prema pravilima paketa. „Mjeseci“ se mjere udjelom godine:
 * šest mjeseci je polovica dana te godine. Propis ne određuje način brojenja.
 */
export function razvrstaj(
  paket: Paket,
  godina: number,
  rasporedi: (typeof raspored.$inferSelect)[],
  odsutnosti: (typeof odsutnost.$inferSelect)[],
): Razvrstavanje[] {
  const dana = danaUGodini(godina);
  const poOsobi = new Map<string, (typeof raspored.$inferSelect)[]>();
  for (const r of rasporedi) {
    if (danaUnutarGodine(r.vrijediOd, r.vrijediDo, godina) > 0) poOsobi.set(r.osobaId, [...(poOsobi.get(r.osobaId) ?? []), r]);
  }
  const izlaz: Razvrstavanje[] = [];
  for (const [osobaId, popis] of poOsobi) {
    popis.sort((a, b) => a.vrijediOd.localeCompare(b.vrijediOd));
    const radio = popis.reduce((s, r) => s + danaUnutarGodine(r.vrijediOd, r.vrijediDo, godina), 0);
    const odsutan = odsutnosti
      .filter((o) => o.osobaId === osobaId && paket.odsutnost.osnove.includes(o.osnova))
      .reduce((s, o) => s + danaUnutarGodine(o.od, o.do, godina), 0);
    const zadnji = popis.at(-1)!;
    const red: Razvrstavanje = { osobaId, nadredeniOsobaId: zadnji.nadredeniOsobaId, stanje: 'u-tijeku', razlog: null, ocjenaPoPropisu: null };
    if (radio * 12 < paket.pravoNaOcjenu.najmanjeMjeseci * dana) {
      red.stanje = 'ne-ocjenjuje-se';
      red.razlog = `Rad kraći od ${paket.pravoNaOcjenu.najmanjeMjeseci} mjeseci u godini (${paket.pravoNaOcjenu.izvor.clanak}).`;
    } else if (odsutan * 12 > paket.odsutnost.duzeOdMjeseci * dana) {
      red.ocjenaPoPropisu = paket.odsutnost.ocjena;
      red.razlog = `Odsutnost dulja od ${paket.odsutnost.duzeOdMjeseci} mjeseci u godini (${paket.odsutnost.izvor.clanak}).`;
    }
    izlaz.push(red);
  }
  return izlaz;
}

/** Otvara ciklus za godinu: zaključava postavke, stvara tijela i predmete. */
export async function otvoriCiklus(db: Baza, paketOznaka: string, paketVerzija: string, godina: number, korisnik: Korisnik, sada: Date): Promise<string> {
  if (!korisnik.uloge.includes('kadrovska')) throw new GreskaPostupka('Ciklus otvara kadrovska služba.');
  const paket = ucitajPaket(paketOznaka, paketVerzija);
  const [postoji] = await db.select({ id: ciklus.id }).from(ciklus).where(eq(ciklus.godina, godina)).limit(1);
  if (postoji) throw new GreskaPostupka(`Ciklus za ${godina}. već postoji.`);
  const p = await ucitajPostavke(db, paket);
  const greske = provjeriPostavke(paket, p.sadrzaj);
  if (greske.length) throw new GreskaPostupka(`Postavke nisu ispravne: ${greske.join(' ')}`);

  const redovi = razvrstaj(paket, godina, await db.select().from(raspored), await db.select().from(odsutnost));
  if (redovi.length === 0) throw new GreskaPostupka(`Nema zaposlenika s rasporedom u ${godina}. godini.`);

  const id = noviId(sada);
  const vrijeme = sada.toISOString();
  await db.update(postavke).set({ zakljucanoU: vrijeme }).where(eq(postavke.id, p.id));
  await db.insert(ciklus).values({ id, godina, paket: paket.oznaka, paketVerzija: paket.verzija, postavkeId: p.id, stanje: 'otvoren', otvoreno: vrijeme });
  for (const t of paket.tijela) await db.insert(tijelo).values({ id: noviId(sada), ciklusId: id, vrsta: t.kljuc });
  // D1 ograničava broj vezanih vrijednosti po naredbi, pa se predmeti upisuju u manjim skupinama.
  for (let i = 0; i < redovi.length; i += 10) {
    await db.insert(predmet).values(redovi.slice(i, i + 10).map((r) => ({ id: noviId(sada), ciklusId: id, ...r, otvoreno: vrijeme })));
  }
  await zabiljezi(
    db,
    { racunId: korisnik.racunId, radnja: 'ciklus.otvoren', predmetVrsta: 'ciklus', predmetId: id, poslije: { godina, paket: `${paket.oznaka}@${paket.verzija}`, predmeta: redovi.length } },
    sada,
  );
  return id;
}

export async function ucitajCiklus(db: Baza, ciklusId: string): Promise<StanjeCiklusa | null> {
  const [c] = await db.select().from(ciklus).where(eq(ciklus.id, ciklusId)).limit(1);
  if (!c) return null;
  const paket = ucitajPaket(c.paket, c.paketVerzija);
  const [p] = await db.select().from(postavke).where(eq(postavke.id, c.postavkeId)).limit(1);
  const predmeti = await db.select().from(predmet).where(eq(predmet.ciklusId, c.id));
  const tijelaRedovi = await db.select().from(tijelo).where(eq(tijelo.ciklusId, c.id));
  const clanovi = tijelaRedovi.length ? await db.select().from(clanTijela).where(inArray(clanTijela.tijeloId, tijelaRedovi.map((t) => t.id))) : [];

  // Koraci, glasovi i zapisi učitavaju se spajanjem po ciklusu, a ne popisom ključeva predmeta.
  const koraci = (await db.select({ k: korak }).from(korak).innerJoin(predmet, eq(predmet.id, korak.predmetId)).where(eq(predmet.ciklusId, c.id))).map((r) => r.k);
  const glasovi = (await db.select({ g: glas }).from(glas).innerJoin(predmet, eq(predmet.id, glas.predmetId)).where(eq(predmet.ciklusId, c.id))).map((r) => r.g);
  const zapisi = (await db.select({ z: zapis }).from(zapis).innerJoin(predmet, eq(predmet.id, zapis.predmetId)).where(eq(predmet.ciklusId, c.id))).map((r) => r.z);
  const osobe = new Map((await db.select().from(osoba)).map((o) => [o.id, o]));

  const tijela = new Map<string, SastavTijela>();
  for (const t of tijelaRedovi) {
    tijela.set(t.vrsta, {
      imenovano: !!t.imenovanoU,
      clanovi: clanovi.filter((cl) => cl.tijeloId === t.id).map((cl) => ({ osobaId: cl.osobaId, predstavnikRadnika: cl.predstavnikRadnika })),
    });
  }
  return {
    db,
    ciklus: c,
    paket,
    postavke: PostavkeS.parse(JSON.parse(p!.sadrzaj)),
    tijela,
    tijelaRedovi: new Map(tijelaRedovi.map((t) => [t.vrsta, t])),
    osobe,
    predmeti: predmeti.map((pr) => ({
      predmet: pr,
      godina: c.godina,
      koraci: koraci.filter((k) => k.predmetId === pr.id),
      glasovi: glasovi.filter((g) => g.predmetId === pr.id),
      zapisi: zapisi.filter((z) => z.predmetId === pr.id),
    })),
  };
}

export async function sviCiklusi(db: Baza): Promise<(typeof ciklus.$inferSelect)[]> {
  return db.select().from(ciklus).orderBy(desc(ciklus.godina));
}

// ---------- Tijela ----------

export async function postaviClana(s: StanjeCiklusa, vrsta: string, osobaId: string, predstavnikRadnika: boolean, korisnik: Korisnik, sada: Date): Promise<void> {
  if (!korisnik.uloge.includes('kadrovska')) throw new GreskaPostupka('Tijela uređuje kadrovska služba.');
  const t = s.tijelaRedovi.get(vrsta);
  if (!t) throw new GreskaPostupka('Nepoznato tijelo.');
  if (t.imenovanoU) throw new GreskaPostupka('Tijelo je već imenovano; sastav se više ne mijenja.');
  if (!s.osobe.has(osobaId)) throw new GreskaPostupka('Nepoznata osoba.');
  await s.db.insert(clanTijela).values({ id: noviId(sada), tijeloId: t.id, osobaId, predstavnikRadnika }).onConflictDoNothing();
}

export async function ukloniClana(s: StanjeCiklusa, vrsta: string, osobaId: string, korisnik: Korisnik): Promise<void> {
  if (!korisnik.uloge.includes('kadrovska')) throw new GreskaPostupka('Tijela uređuje kadrovska služba.');
  const t = s.tijelaRedovi.get(vrsta);
  if (!t || t.imenovanoU) throw new GreskaPostupka('Sastav se ne može mijenjati.');
  await s.db.delete(clanTijela).where(and(eq(clanTijela.tijeloId, t.id), eq(clanTijela.osobaId, osobaId)));
}

/** Provjerava sastav prema paketu i postavkama; vraća popis nedostataka. */
export function provjeriSastav(s: Pick<StanjeCiklusa, 'paket' | 'postavke' | 'tijela'>, vrsta: string): string[] {
  const def = s.paket.tijela.find((t) => t.kljuc === vrsta);
  const sastav = s.tijela.get(vrsta);
  if (!def || !sastav) return ['Nepoznato tijelo.'];
  const greske: string[] = [];
  const trazeno = s.postavke.tijela[vrsta]?.clanova ?? def.najmanjeClanova;
  if (sastav.clanovi.length !== trazeno) greske.push(`Potrebno je ${trazeno} članova, a upisano ih je ${sastav.clanovi.length}.`);
  if (def.predstavnikRadnika && !sastav.clanovi.some((c) => c.predstavnikRadnika)) {
    greske.push(`Najmanje jedan član mora biti predstavnik radničkog vijeća ili sindikata (${def.izvor.clanak}).`);
  }
  return greske;
}

export async function imenujTijelo(s: StanjeCiklusa, vrsta: string, korisnik: Korisnik, sada: Date): Promise<string[]> {
  if (!korisnik.uloge.includes('odlucitelj')) throw new GreskaPostupka('Tijelo imenuje čelnik ili osoba koju ovlasti.');
  const greske = provjeriSastav(s, vrsta);
  if (greske.length) return greske;
  const t = s.tijelaRedovi.get(vrsta)!;
  if (t.imenovanoU) return [];
  await s.db.update(tijelo).set({ imenovanoU: sada.toISOString() }).where(eq(tijelo.id, t.id));
  await zabiljezi(
    s.db,
    { racunId: korisnik.racunId, radnja: 'tijelo.imenovano', predmetVrsta: 'tijelo', predmetId: t.id, poslije: { vrsta, clanovi: s.tijela.get(vrsta)!.clanovi } },
    sada,
  );
  return [];
}

// ---------- Kvote ----------

export interface Kvota {
  ocjena: string;
  udio: number;
  /** Najveći broj prema udjelu; zaokružen samo ako su postavke tako zadane. */
  najvise: number;
  predlozeno: number;
  prekoraceno: boolean;
  clanak: string;
}

export function zaokruzi(vrijednost: number, nacin: Postavke['zaokruzivanjeKvota']): number {
  if (nacin === 'nadolje') return Math.floor(vrijednost);
  if (nacin === 'nagore') return Math.ceil(vrijednost);
  if (nacin === 'najblize') return Math.round(vrijednost);
  return Math.round(vrijednost * 100) / 100;
}

/** Broj prijedloga po ocjeni s kvotom prema broju zaposlenih na dan iz paketa. */
export function izracunajKvote(s: Pick<StanjeCiklusa, 'paket' | 'postavke' | 'predmeti'>, zaposlenih: number): Kvota[] {
  return s.paket.kvote.map((q) => {
    const najvise = zaokruzi(q.udio * zaposlenih, s.postavke.zaokruzivanjeKvota);
    const predlozeno = s.predmeti.filter((pp) => (pp.predmet.konacnaOcjena ?? temeljOdluke(s.paket, pp)) === q.ocjena).length;
    return { ocjena: q.ocjena, udio: q.udio, najvise, predlozeno, prekoraceno: predlozeno > najvise, clanak: q.izvor.clanak };
  });
}

export async function brojZaposlenihNaDan(db: Baza, paket: Paket, godina: number): Promise<number> {
  const dan = datumUGodini(godina, paket.kvotaDan.mjesec, paket.kvotaDan.dan);
  const redovi = await db.select({ osobaId: raspored.osobaId, od: raspored.vrijediOd, do: raspored.vrijediDo }).from(raspored);
  return new Set(redovi.filter((r) => r.od <= dan && (r.do === null || r.do >= dan)).map((r) => r.osobaId)).size;
}
