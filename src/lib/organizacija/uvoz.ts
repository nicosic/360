// Uvoz organizacije iz tablične datoteke (CSV). Ima probni prolaz koji ništa ne upisuje.
// Stupci: oib, ime, prezime, eposta, jedinica, radno_mjesto, nadredeni_oib, radi_od, radi_do, uloge
import { eq } from 'drizzle-orm';
import type { Baza } from '../../db/baza';
import { jedinica, osoba, racun, raspored, uloga } from '../../db/shema';
import { noviId } from '../id';
import type { Korisnik } from '../postupak/stroj';
import { zabiljezi } from '../revizija';

export const STUPCI = ['oib', 'ime', 'prezime', 'eposta', 'jedinica', 'radno_mjesto', 'nadredeni_oib', 'radi_od', 'radi_do', 'uloge'] as const;
/** Uloge koje se mogu dodijeliti uvozom. Administratora stvara samo skripta. */
export const ULOGE_ZA_UVOZ = ['kadrovska', 'odlucitelj'];

export interface RedakUvoza {
  redak: number;
  oib: string;
  ime: string;
  prezime: string;
  eposta: string;
  jedinica: string;
  radnoMjesto: string;
  nadredeniOib: string;
  radiOd: string;
  radiDo: string;
  uloge: string[];
}

export interface IshodUvoza {
  greske: string[];
  redci: RedakUvoza[];
  novihOsoba: number;
  novihRasporeda: number;
  novihJedinica: number;
  novihRacuna: number;
  primijenjeno: boolean;
}

/** Kontrolna znamenka OIB-a (ISO 7064, MOD 11,10). */
export function ispravanOib(oib: string): boolean {
  if (!/^\d{11}$/.test(oib)) return false;
  let a = 10;
  for (let i = 0; i < 10; i++) {
    a = (a + Number(oib[i])) % 10 || 10;
    a = (a * 2) % 11;
  }
  return (11 - a) % 10 === Number(oib[10]);
}

function razdvoji(redak: string, znak: string): string[] {
  const polja: string[] = [];
  let polje = '';
  let uNavodnicima = false;
  for (let i = 0; i < redak.length; i++) {
    const z = redak[i]!;
    if (uNavodnicima) {
      if (z === '"' && redak[i + 1] === '"') { polje += '"'; i++; }
      else if (z === '"') uNavodnicima = false;
      else polje += z;
    } else if (z === '"') uNavodnicima = true;
    else if (z === znak) { polja.push(polje); polje = ''; }
    else polje += z;
  }
  polja.push(polje);
  return polja.map((p) => p.trim());
}

export function procitajCsv(sadrzaj: string): { redci: RedakUvoza[]; greske: string[] } {
  const greske: string[] = [];
  const linije = sadrzaj.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (linije.length < 2) return { redci: [], greske: ['Datoteka nema redaka s podacima.'] };
  const znak = linije[0]!.includes(';') ? ';' : ',';
  const zaglavlje = razdvoji(linije[0]!, znak).map((s) => s.toLowerCase());
  const nedostaju = STUPCI.filter((s) => !zaglavlje.includes(s));
  if (nedostaju.length) return { redci: [], greske: [`Nedostaju stupci: ${nedostaju.join(', ')}.`] };
  const datum = /^\d{4}-\d{2}-\d{2}$/;
  const redci: RedakUvoza[] = [];
  const vidjeni = new Set<string>();
  linije.slice(1).forEach((linija, i) => {
    const polja = razdvoji(linija, znak);
    const v = (stupac: string) => polja[zaglavlje.indexOf(stupac)] ?? '';
    const n = i + 2;
    const r: RedakUvoza = {
      redak: n,
      oib: v('oib'),
      ime: v('ime'),
      prezime: v('prezime'),
      eposta: v('eposta').toLowerCase(),
      jedinica: v('jedinica'),
      radnoMjesto: v('radno_mjesto'),
      nadredeniOib: v('nadredeni_oib'),
      radiOd: v('radi_od'),
      radiDo: v('radi_do'),
      uloge: v('uloge').split('|').map((u) => u.trim()).filter(Boolean),
    };
    if (!ispravanOib(r.oib)) greske.push(`Redak ${n}: OIB nije ispravan.`);
    if (vidjeni.has(r.oib)) greske.push(`Redak ${n}: OIB se ponavlja u datoteci.`);
    vidjeni.add(r.oib);
    if (!r.ime || !r.prezime) greske.push(`Redak ${n}: nedostaje ime ili prezime.`);
    if (r.eposta && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.eposta)) greske.push(`Redak ${n}: adresa e-pošte nije ispravna.`);
    if (!r.jedinica || !r.radnoMjesto) greske.push(`Redak ${n}: nedostaje jedinica ili radno mjesto.`);
    if (!datum.test(r.radiOd)) greske.push(`Redak ${n}: radi_od mora biti datum oblika GGGG-MM-DD.`);
    if (r.radiDo && !datum.test(r.radiDo)) greske.push(`Redak ${n}: radi_do mora biti datum oblika GGGG-MM-DD.`);
    if (r.nadredeniOib && r.nadredeniOib === r.oib) greske.push(`Redak ${n}: osoba ne može biti sama sebi nadređena.`);
    for (const u of r.uloge) if (!ULOGE_ZA_UVOZ.includes(u)) greske.push(`Redak ${n}: uloga '${u}' ne može se dodijeliti uvozom.`);
    redci.push(r);
  });
  return { redci, greske };
}

/** Probni prolaz (primijeni = false) samo izvješćuje što bi se dodalo. */
export async function uvezi(db: Baza, sadrzaj: string, primijeni: boolean, korisnik: Korisnik, sada: Date): Promise<IshodUvoza> {
  const { redci, greske } = procitajCsv(sadrzaj);
  const postojeceOsobe = await db.select().from(osoba);
  const poOibu = new Map(postojeceOsobe.filter((o) => o.identifikacijskiBroj).map((o) => [o.identifikacijskiBroj!, o.id]));
  const jedinice = new Map((await db.select().from(jedinica)).map((j) => [j.naziv, j.id]));
  const racuni = new Map((await db.select().from(racun)).map((r) => [r.eposta, r]));
  const rasporedi = await db.select().from(raspored);

  const uDatoteci = new Map(redci.map((r) => [r.oib, r]));
  for (const r of redci) {
    if (r.nadredeniOib && !uDatoteci.has(r.nadredeniOib) && !poOibu.has(r.nadredeniOib)) greske.push(`Redak ${r.redak}: nadređeni s tim OIB-om ne postoji.`);
    // Kružni odnos: praćenjem nadređenih ne smije se vratiti na istu osobu.
    let trenutni = r.nadredeniOib;
    for (let koraka = 0; trenutni && koraka <= redci.length; koraka++) {
      if (trenutni === r.oib) { greske.push(`Redak ${r.redak}: kružni odnos nadređenih.`); break; }
      trenutni = uDatoteci.get(trenutni)?.nadredeniOib ?? '';
    }
    const racunZaAdresu = r.eposta ? racuni.get(r.eposta) : undefined;
    if (racunZaAdresu?.osobaId && racunZaAdresu.osobaId !== poOibu.get(r.oib)) greske.push(`Redak ${r.redak}: adresa e-pošte pripada drugoj osobi.`);
  }

  const ishod: IshodUvoza = { greske, redci, novihOsoba: 0, novihRasporeda: 0, novihJedinica: 0, novihRacuna: 0, primijenjeno: false };
  const idOsobe = new Map<string, string>(poOibu);
  for (const r of redci) if (!idOsobe.has(r.oib)) { idOsobe.set(r.oib, noviId(sada)); ishod.novihOsoba++; }
  const idJedinice = new Map<string, string>(jedinice);
  for (const r of redci) if (r.jedinica && !idJedinice.has(r.jedinica)) { idJedinice.set(r.jedinica, noviId(sada)); ishod.novihJedinica++; }
  const istiRaspored = (r: RedakUvoza) =>
    rasporedi.some((x) => x.osobaId === idOsobe.get(r.oib) && x.vrijediOd === r.radiOd && x.jedinicaId === idJedinice.get(r.jedinica) && x.radnoMjesto === r.radnoMjesto);
  ishod.novihRasporeda = redci.filter((r) => !istiRaspored(r)).length;
  ishod.novihRacuna = redci.filter((r) => r.eposta && !racuni.has(r.eposta)).length;
  if (greske.length || !primijeni) return ishod;

  const vrijeme = sada.toISOString();
  for (const [naziv, id] of idJedinice) if (!jedinice.has(naziv)) await db.insert(jedinica).values({ id, naziv, vrijediOd: vrijeme.slice(0, 10) });
  for (const r of redci) {
    const id = idOsobe.get(r.oib)!;
    if (!poOibu.has(r.oib)) await db.insert(osoba).values({ id, ime: r.ime, prezime: r.prezime, identifikacijskiBroj: r.oib, stvoreno: vrijeme });
  }
  for (const r of redci) {
    const id = idOsobe.get(r.oib)!;
    if (!istiRaspored(r)) {
      // Novi raspored zatvara prethodni otvoreni raspored iste osobe.
      for (const stari of rasporedi.filter((x) => x.osobaId === id && x.vrijediDo === null && x.vrijediOd < r.radiOd)) {
        const dan = new Date(`${r.radiOd}T00:00:00Z`);
        dan.setUTCDate(dan.getUTCDate() - 1);
        await db.update(raspored).set({ vrijediDo: dan.toISOString().slice(0, 10) }).where(eq(raspored.id, stari.id));
      }
      await db.insert(raspored).values({
        id: noviId(sada),
        osobaId: id,
        jedinicaId: idJedinice.get(r.jedinica)!,
        radnoMjesto: r.radnoMjesto,
        nadredeniOsobaId: r.nadredeniOib ? idOsobe.get(r.nadredeniOib)! : null,
        vrijediOd: r.radiOd,
        vrijediDo: r.radiDo || null,
      });
    }
    if (r.eposta) {
      let racunId = racuni.get(r.eposta)?.id;
      if (!racunId) {
        racunId = noviId(sada);
        await db.insert(racun).values({ id: racunId, osobaId: id, eposta: r.eposta, stanje: 'pozvan', stvoreno: vrijeme });
      } else if (!racuni.get(r.eposta)!.osobaId) {
        await db.update(racun).set({ osobaId: id }).where(eq(racun.id, racunId));
      }
      const postojece = (await db.select({ uloga: uloga.uloga }).from(uloga).where(eq(uloga.racunId, racunId))).map((u) => u.uloga);
      for (const u of r.uloge) if (!postojece.includes(u)) await db.insert(uloga).values({ id: noviId(sada), racunId, uloga: u, vrijediOd: vrijeme });
    }
  }
  await zabiljezi(
    db,
    {
      racunId: korisnik.racunId,
      radnja: 'organizacija.uvoz',
      poslije: { redaka: redci.length, novihOsoba: ishod.novihOsoba, novihRasporeda: ishod.novihRasporeda, novihRacuna: ishod.novihRacuna },
    },
    sada,
  );
  ishod.primijenjeno = true;
  return ishod;
}
