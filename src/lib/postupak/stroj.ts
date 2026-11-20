// Model postupka: iz paketa pravila i završenih koraka izvodi stanje predmeta
// i izvršava korake. Ne sadrži ništa što vrijedi samo za jedan paket.
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Baza } from '../../db/baza';
import { bodovi, glas, korak, predmet, zapis } from '../../db/shema';
import type { Korak as DefKoraka, Paket, Postavke } from '../../paketi/tipovi';
import { noviId } from '../id';
import { zabiljezi } from '../revizija';
import { danas, datumUGodini, izracunajRok } from './rokovi';

export type RedPredmeta = typeof predmet.$inferSelect;
export type RedKoraka = typeof korak.$inferSelect;
export type RedGlasa = typeof glas.$inferSelect;
export type RedZapisa = typeof zapis.$inferSelect;

export interface Korisnik {
  racunId: string;
  osobaId: string | null;
  uloge: string[];
}

export interface SastavTijela {
  imenovano: boolean;
  clanovi: { osobaId: string; predstavnikRadnika: boolean }[];
}

export interface PodaciPredmeta {
  predmet: RedPredmeta;
  godina: number;
  koraci: RedKoraka[];
  glasovi: RedGlasa[];
  zapisi: RedZapisa[];
}

export type StanjeKoraka = 'zavrsen' | 'bez-odgovora' | 'istekao' | 'preskocen' | 'na-redu' | 'ceka';

export interface PrikazKoraka {
  def: DefKoraka;
  stanje: StanjeKoraka;
  rok: string | null;
  red: RedKoraka | null;
  ishod: Record<string, unknown> | null;
}

export class GreskaPostupka extends Error {}

function ishodKoraka(red: RedKoraka | undefined): Record<string, unknown> | null {
  return red ? (JSON.parse(red.ishod) as Record<string, unknown>) : null;
}

/** Stanje svih koraka predmeta na zadani trenutak. Najviše jedan korak je 'na-redu'. */
export function izracunajStanje(paket: Paket, pp: PodaciPredmeta, sada: Date): PrikazKoraka[] {
  const redovi = new Map(pp.koraci.map((k) => [k.kljuc, k]));
  const datumKoraka = (kljuc: string) => redovi.get(kljuc)?.datum ?? null;
  const ocjenaKoraka = (kljuc: string) => (ishodKoraka(redovi.get(kljuc))?.ocjena as string | undefined) ?? null;
  const indeksOdluke = paket.koraci.findIndex((k) => k.kljuc === paket.odluka.korak);
  const izlaz: PrikazKoraka[] = [];
  let blokirano = pp.predmet.stanje === 'ne-ocjenjuje-se';
  const utvrdeno = new Map<string, StanjeKoraka>();

  paket.koraci.forEach((def, indeks) => {
    const red = redovi.get(def.kljuc) ?? null;
    const rok = izracunajRok(def.rok, pp.godina, datumKoraka);
    let stanje: StanjeKoraka;
    if (red) {
      stanje = red.stanje;
    } else if (blokirano) {
      stanje = 'ceka';
    } else if (pp.predmet.ocjenaPoPropisu && indeks < indeksOdluke) {
      stanje = 'preskocen';
    } else {
      let uvjet: boolean | null = true;
      if (def.uvjet) {
        const prethodni = utvrdeno.get(def.uvjet.korak);
        if (prethodni === 'preskocen' || prethodni === 'istekao') uvjet = false;
        else if (def.uvjet.vrsta === 'ocjena-medu') {
          const o = ocjenaKoraka(def.uvjet.korak);
          uvjet = o === null ? null : def.uvjet.ocjene.includes(o);
        } else {
          const a = ocjenaKoraka(def.uvjet.korak);
          const b = ocjenaKoraka(def.uvjet.od);
          uvjet = a === null || b === null ? null : a !== b;
        }
      }
      if (uvjet === false) stanje = 'preskocen';
      else if (uvjet === null) stanje = 'ceka';
      else if (def.neobavezno && rok !== null && danas(sada) > rok) stanje = 'istekao';
      else stanje = 'na-redu';
    }
    if (stanje === 'na-redu' || stanje === 'ceka') blokirano = true;
    utvrdeno.set(def.kljuc, stanje);
    izlaz.push({ def, stanje, rok, red, ishod: ishodKoraka(red ?? undefined) });
  });
  return izlaz;
}

export function tekuciKorak(stanje: PrikazKoraka[]): PrikazKoraka | null {
  return stanje.find((k) => k.stanje === 'na-redu') ?? null;
}

/** Ocjena na kojoj se temelji odluka: prvi završeni korak s popisa temelja ili ocjena po propisu. */
export function temeljOdluke(paket: Paket, pp: PodaciPredmeta): string | null {
  if (pp.predmet.ocjenaPoPropisu) return pp.predmet.ocjenaPoPropisu;
  for (const kljuc of paket.odluka.temelj) {
    const o = ishodKoraka(pp.koraci.find((k) => k.kljuc === kljuc))?.ocjena;
    if (typeof o === 'string') return o;
  }
  return null;
}

/** Član tijela ne odlučuje o sebi ni o zaposleniku kojem je sam predložio ocjenu. */
export function jeIzuzet(pp: PodaciPredmeta, osobaId: string): boolean {
  return osobaId === pp.predmet.osobaId || osobaId === pp.predmet.nadredeniOsobaId;
}

export type Svojstvo = 'izvrsitelj' | 'u-ime' | null;

/** Smije li korisnik izvršiti korak; 'u-ime' znači da ga kadrovska služba upisuje s papira. */
export function svojstvoZaKorak(
  def: DefKoraka,
  pp: PodaciPredmeta,
  tijela: Map<string, SastavTijela>,
  korisnik: Korisnik,
): Svojstvo {
  const kadrovska = korisnik.uloge.includes('kadrovska');
  switch (def.izvrsitelj) {
    case 'zaposlenik':
      if (korisnik.osobaId && korisnik.osobaId === pp.predmet.osobaId) return 'izvrsitelj';
      return kadrovska ? 'u-ime' : null;
    case 'nadredeni':
      return korisnik.osobaId && korisnik.osobaId === pp.predmet.nadredeniOsobaId ? 'izvrsitelj' : null;
    case 'odlucitelj':
      return korisnik.uloge.includes('odlucitelj') ? 'izvrsitelj' : null;
    case 'kadrovska':
      return kadrovska ? 'izvrsitelj' : null;
    default: {
      const sastav = tijela.get(def.izvrsitelj.slice(7));
      if (!sastav?.imenovano || !korisnik.osobaId) return null;
      if (!sastav.clanovi.some((c) => c.osobaId === korisnik.osobaId)) return null;
      return jeIzuzet(pp, korisnik.osobaId) ? null : 'izvrsitelj';
    }
  }
}

export function kriterijiZaPredmet(paket: Paket, postavke: Postavke): { kljuc: string; naziv: string; opis?: string; skupina: string }[] {
  return [
    ...paket.kriteriji.filter((k) => paket.skupineZaSve.includes(k.skupina)),
    ...postavke.posebniKriteriji.map((k) => ({ ...k, skupina: 'posebni' })),
  ];
}

const tekst = z.string().trim().min(1).max(20_000);
const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const odgovor = z.union([z.object({ tekst }), z.object({ bez: z.literal(true) })]);

export interface Kontekst {
  db: Baza;
  paket: Paket;
  postavke: Postavke;
  tijela: Map<string, SastavTijela>;
}

async function upisiKorak(
  k: Kontekst,
  pp: PodaciPredmeta,
  def: DefKoraka,
  korisnik: Korisnik,
  sada: Date,
  ishod: Record<string, unknown>,
  opcije: { stanje?: 'zavrsen' | 'bez-odgovora'; datum?: string; uIme?: boolean } = {},
): Promise<void> {
  await k.db.insert(korak).values({
    id: noviId(sada),
    predmetId: pp.predmet.id,
    kljuc: def.kljuc,
    stanje: opcije.stanje ?? 'zavrsen',
    datum: opcije.datum ?? danas(sada),
    ishod: JSON.stringify(ishod),
    izvrsioRacunId: korisnik.racunId,
    uIme: opcije.uIme ?? false,
    zavrsenoU: sada.toISOString(),
  });
  await zabiljezi(
    k.db,
    {
      racunId: korisnik.racunId,
      radnja: `korak.${def.kljuc}`,
      predmetVrsta: 'predmet',
      predmetId: pp.predmet.id,
      poslije: { stanje: opcije.stanje ?? 'zavrsen', uIme: opcije.uIme ?? false, ocjena: ishod.ocjena ?? null },
    },
    sada,
  );
}

function provjeriNaRedu(k: Kontekst, pp: PodaciPredmeta, kljuc: string, korisnik: Korisnik, sada: Date): { def: DefKoraka; svojstvo: 'izvrsitelj' | 'u-ime' } {
  const tekuci = tekuciKorak(izracunajStanje(k.paket, pp, sada));
  if (!tekuci || tekuci.def.kljuc !== kljuc) throw new GreskaPostupka('Ovaj korak trenutačno nije na redu.');
  const svojstvo = svojstvoZaKorak(tekuci.def, pp, k.tijela, korisnik);
  if (!svojstvo) throw new GreskaPostupka('Nemate ovlast za ovaj korak.');
  return { def: tekuci.def, svojstvo };
}

/** Izvršava korak koji nije odluka tijela. Unos se provjerava prema vrsti koraka. */
export async function izvrsiKorak(
  k: Kontekst,
  pp: PodaciPredmeta,
  kljuc: string,
  unos: unknown,
  korisnik: Korisnik,
  sada: Date,
): Promise<void> {
  const { def, svojstvo } = provjeriNaRedu(k, pp, kljuc, korisnik, sada);
  const uIme = svojstvo === 'u-ime';
  const ocjene = new Set(k.paket.ocjene.map((o) => o.kljuc));

  switch (def.vrsta) {
    case 'obrazac':
    case 'odgovor-u-roku': {
      const p = odgovor.parse(unos);
      if ('bez' in p) {
        if (!def.neobavezno) throw new GreskaPostupka('Ovaj korak je obvezan.');
        return upisiKorak(k, pp, def, korisnik, sada, {}, { stanje: 'bez-odgovora', uIme });
      }
      return upisiKorak(k, pp, def, korisnik, sada, { tekst: p.tekst }, { uIme });
    }
    case 'prijedlog': {
      const p = z
        .object({ ocjeneKriterija: z.record(z.string(), z.string()), napomene: z.string().max(20_000).optional(), ocjena: z.string(), obrazlozenje: tekst })
        .parse(unos);
      for (const kr of kriterijiZaPredmet(k.paket, k.postavke)) {
        if (!ocjene.has(p.ocjeneKriterija[kr.kljuc] ?? '')) throw new GreskaPostupka(`Nedostaje ocjena kriterija: ${kr.naziv}.`);
      }
      if (!ocjene.has(p.ocjena)) throw new GreskaPostupka('Odaberite prijedlog ocjene.');
      const u = k.paket.upozorenje;
      if (p.ocjena === u.ocjena) {
        const najkasnije = datumUGodini(pp.godina, u.najkasnije.mjesec, u.najkasnije.dan);
        const imaUpozorenje = pp.zapisi.some((z2) => z2.vrsta === 'pisano-upozorenje' && z2.datum <= najkasnije && z2.datum >= `${pp.godina}-01-01`);
        if (!imaUpozorenje) {
          throw new GreskaPostupka(
            `Ocjena „${k.paket.ocjene.find((o) => o.kljuc === u.ocjena)!.naziv}“ nije moguća bez pisanog upozorenja izdanog najkasnije ${najkasnije} (${u.izvor.clanak}).`,
          );
        }
      }
      return upisiKorak(k, pp, def, korisnik, sada, p);
    }
    case 'uvid': {
      const p = z.object({ datum: datum.optional() }).parse(unos ?? {});
      // Datum s papira može upisati samo kadrovska služba; izvršitelj potvrđuje uvid danas.
      const dan = uIme && p.datum ? p.datum : danas(sada);
      if (dan > danas(sada)) throw new GreskaPostupka('Datum uvida ne može biti u budućnosti.');
      return upisiKorak(k, pp, def, korisnik, sada, { nacin: uIme ? 'papir' : 'u-sustavu' }, { datum: dan, uIme });
    }
    case 'odluka-pojedinca': {
      const p = z.object({ obrazlozenje: tekst }).parse(unos);
      const ocjena = temeljOdluke(k.paket, pp);
      if (!ocjena) throw new GreskaPostupka('Nema prijedloga na kojem bi se odluka temeljila.');
      await upisiKorak(k, pp, def, korisnik, sada, { ocjena, obrazlozenje: p.obrazlozenje });
      if (def.kljuc === k.paket.odluka.korak) {
        await k.db.update(predmet).set({ stanje: 'odlucen', konacnaOcjena: ocjena }).where(eq(predmet.id, pp.predmet.id));
        await k.db
          .insert(bodovi)
          .values({
            id: noviId(sada),
            osobaId: pp.predmet.osobaId,
            godina: pp.godina,
            bodovi: k.paket.ocjene.find((o) => o.kljuc === ocjena)!.bodovi,
            izvor: 'odluka',
            predmetId: pp.predmet.id,
            stvoreno: sada.toISOString(),
          })
          .onConflictDoNothing();
      }
      return;
    }
    case 'dostava': {
      const p = z.object({ datum, nacin: z.string().trim().min(1).max(200) }).parse(unos);
      if (p.datum > danas(sada)) throw new GreskaPostupka('Datum dostave ne može biti u budućnosti.');
      await upisiKorak(k, pp, def, korisnik, sada, { nacin: p.nacin }, { datum: p.datum });
      await k.db.update(predmet).set({ stanje: 'dostavljen' }).where(eq(predmet.id, pp.predmet.id));
      return;
    }
    case 'vanjska-radnja': {
      const p = z.object({ datum }).parse(unos);
      if (p.datum > danas(sada)) throw new GreskaPostupka('Datum ne može biti u budućnosti.');
      await upisiKorak(k, pp, def, korisnik, sada, {}, { datum: p.datum });
      await k.db.update(predmet).set({ stanje: 'zakljucen' }).where(eq(predmet.id, pp.predmet.id));
      return;
    }
    case 'odluka-tijela':
      throw new GreskaPostupka('O ovom koraku se glasuje.');
  }
}

export interface IshodGlasovanja {
  odluceno: boolean;
  ocjena?: string;
  glasova: number;
  potrebno: number;
}

/**
 * Bilježi glas člana tijela. Odluka je donesena kad jedna ocjena dobije većinu glasova
 * svih imenovanih članova; tada se korak zatvara s tom ocjenom.
 */
export async function glasuj(
  k: Kontekst,
  pp: PodaciPredmeta,
  kljuc: string,
  ocjena: string,
  korisnik: Korisnik,
  sada: Date,
): Promise<IshodGlasovanja> {
  const { def } = provjeriNaRedu(k, pp, kljuc, korisnik, sada);
  if (def.vrsta !== 'odluka-tijela') throw new GreskaPostupka('O ovom koraku se ne glasuje.');
  if (!k.paket.ocjene.some((o) => o.kljuc === ocjena)) throw new GreskaPostupka('Nepoznata ocjena.');
  const sastav = k.tijela.get(def.izvrsitelj.slice(7))!;
  const osobaId = korisnik.osobaId!;

  await k.db.delete(glas).where(and(eq(glas.predmetId, pp.predmet.id), eq(glas.korakKljuc, kljuc), eq(glas.osobaId, osobaId)));
  await k.db.insert(glas).values({ id: noviId(sada), predmetId: pp.predmet.id, korakKljuc: kljuc, osobaId, ocjena, vrijeme: sada.toISOString() });
  await zabiljezi(k.db, { racunId: korisnik.racunId, radnja: `glas.${kljuc}`, predmetVrsta: 'predmet', predmetId: pp.predmet.id, poslije: { ocjena } }, sada);

  const clanovi = new Set(sastav.clanovi.map((c) => c.osobaId));
  const glasovi = [...pp.glasovi.filter((g) => g.korakKljuc === kljuc && g.osobaId !== osobaId && clanovi.has(g.osobaId)), { ocjena }];
  const brojevi = new Map<string, number>();
  for (const g of glasovi) brojevi.set(g.ocjena, (brojevi.get(g.ocjena) ?? 0) + 1);
  const potrebno = Math.floor(sastav.clanovi.length / 2) + 1;
  const pobjednik = [...brojevi].find(([, n]) => n >= potrebno);
  if (!pobjednik) return { odluceno: false, glasova: glasovi.length, potrebno };

  await upisiKorak(k, pp, def, korisnik, sada, {
    ocjena: pobjednik[0],
    glasovi: Object.fromEntries(brojevi),
    clanova: sastav.clanovi.length,
    potrebno,
  });
  return { odluceno: true, ocjena: pobjednik[0], glasova: glasovi.length, potrebno };
}

export async function dodajZapis(
  db: Baza,
  pp: PodaciPredmeta,
  unos: { vrsta: RedZapisa['vrsta']; datum: string; opis: string },
  korisnik: Korisnik,
  sada: Date,
): Promise<void> {
  if (!(korisnik.osobaId && korisnik.osobaId === pp.predmet.nadredeniOsobaId) && !korisnik.uloge.includes('kadrovska')) {
    throw new GreskaPostupka('Evidenciju rada vodi neposredno nadređeni.');
  }
  const p = z.object({ vrsta: z.enum(['primjedba', 'pisano-upozorenje', 'pohvala', 'postignuce']), datum, opis: tekst }).parse(unos);
  if (p.datum > danas(sada)) throw new GreskaPostupka('Datum ne može biti u budućnosti.');
  const id = noviId(sada);
  await db.insert(zapis).values({ id, predmetId: pp.predmet.id, ...p, autorRacunId: korisnik.racunId, stvoreno: sada.toISOString() });
  await zabiljezi(db, { racunId: korisnik.racunId, radnja: `zapis.${p.vrsta}`, predmetVrsta: 'predmet', predmetId: pp.predmet.id, poslije: { datum: p.datum } }, sada);
}
