import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bodovi, odsutnost, osoba, predmet, racun, uloga } from '../src/db/shema';
import { noviId } from '../src/lib/id';
import { ispravanOib, uvezi } from '../src/lib/organizacija/uvoz';
import { brojZaposlenihNaDan, imenujTijelo, izracunajKvote, otvoriCiklus, postaviClana, provjeriSastav, ucitajCiklus } from '../src/lib/postupak/ciklus';
import { izracunajRok } from '../src/lib/postupak/rokovi';
import { glasuj, GreskaPostupka, izracunajStanje, izvrsiKorak, dodajZapis, type Korisnik, tekuciKorak } from '../src/lib/postupak/stroj';
import { provjeriLanac } from '../src/lib/revizija';
import { javneSluzbe } from '../src/paketi/javne-sluzbe';
import { PaketS, provjeriPostavke, zadanePostavke } from '../src/paketi/tipovi';
import { testnaBaza } from './pomoc';

let t: Awaited<ReturnType<typeof testnaBaza>>;
let ciklusId: string;
const oibovi: string[] = [];

/** OIB s ispravnom kontrolnom znamenkom, za testne podatke. */
function oib(n: number): string {
  const osnova = String(10000000000 + n).slice(1);
  let a = 10;
  for (const z of osnova) {
    a = (a + Number(z)) % 10 || 10;
    a = (a * 2) % 11;
  }
  return osnova + String((11 - a) % 10);
}

// Ravnateljica (odlučiteljica), kadrovska, voditelj i šest zaposlenika; jedan je došao u rujnu.
const CSV = () =>
  [
    'oib;ime;prezime;eposta;jedinica;radno_mjesto;nadredeni_oib;radi_od;radi_do;uloge',
    `${oibovi[0]};Rita;Ravnatelj;rita@u.hr;Uprava;ravnateljica;;2020-01-01;;odlucitelj`,
    `${oibovi[1]};Kata;Kadrovska;kata@u.hr;Uprava;kadrovska;${oibovi[0]};2020-01-01;;kadrovska`,
    `${oibovi[2]};Vito;Voditelj;vito@u.hr;Odjel;voditelj;${oibovi[0]};2020-01-01;;`,
    ...[3, 4, 5, 6, 7].map((i) => `${oibovi[i]};Zap${i};Radnik;z${i}@u.hr;Odjel;referent;${oibovi[2]};2020-01-01;;`),
    `${oibovi[8]};Novi;Radnik;novi@u.hr;Odjel;referent;${oibovi[2]};2026-09-01;;`,
  ].join('\n');

async function korisnik(eposta: string): Promise<Korisnik> {
  const [r] = await t.db.select().from(racun).where(eq(racun.eposta, eposta));
  const uloge = (await t.db.select().from(uloga).where(eq(uloga.racunId, r!.id))).map((u) => u.uloga);
  return { racunId: r!.id, osobaId: r!.osobaId, uloge };
}
async function stanje() {
  return (await ucitajCiklus(t.db, ciklusId))!;
}
async function pp(eposta: string) {
  const s = await stanje();
  const k = await korisnik(eposta);
  return { s, p: s.predmeti.find((x) => x.predmet.osobaId === k.osobaId)! };
}
const dan = (d: string) => new Date(`${d}T10:00:00Z`);
const ocjeneKriterija = (o: string) => Object.fromEntries(javneSluzbe.kriteriji.filter((k) => javneSluzbe.skupineZaSve.includes(k.skupina)).map((k) => [k.kljuc, o]));

beforeAll(async () => {
  t = await testnaBaza();
  for (let i = 0; i < 9; i++) oibovi.push(oib(1000 + i));
});
afterAll(() => t.zatvori());

describe('paket pravila i postavke', () => {
  it('paket za javne službe prolazi provjeru i svaki korak ima izvor', () => {
    expect(javneSluzbe.koraci.map((k) => k.kljuc)).toEqual([
      'samoprocjena', 'prijedlog', 'uvid', 'ocitovanje', 'konacni-prijedlog', 'uvid-konacnog', 'misljenje-odbora', 'odluka', 'dostava', 'unos-u-registar',
    ]);
    for (const k of javneSluzbe.koraci) expect(k.izvor.clanak).toBeTruthy();
  });

  it('provjera odbija paket koji se poziva na nepostojeći korak', () => {
    const los = structuredClone(javneSluzbe) as any;
    los.koraci[3].rok = { vrsta: 'od-koraka', korak: 'nema-ga', dana: 8 };
    expect(PaketS.safeParse(los).success).toBe(false);
  });

  it('postavke ne mogu ići ispod propisanog sastava tijela', () => {
    const p = zadanePostavke(javneSluzbe);
    expect(provjeriPostavke(javneSluzbe, p)).toEqual([]);
    expect(provjeriPostavke(javneSluzbe, { ...p, tijela: { povjerenstvo: { clanova: 3 }, odbor: { clanova: 4 } } })).toHaveLength(2);
  });

  it('rokovi: 15. siječnja, kraj veljače i osam dana od uvida', () => {
    const k = (kljuc: string) => javneSluzbe.koraci.find((x) => x.kljuc === kljuc)!.rok;
    expect(izracunajRok(k('samoprocjena'), 2026, () => null)).toBe('2027-01-15');
    expect(izracunajRok(k('konacni-prijedlog'), 2026, () => null)).toBe('2027-02-28');
    expect(izracunajRok(k('konacni-prijedlog'), 2027, () => null)).toBe('2028-02-29');
    expect(izracunajRok(k('ocitovanje'), 2026, () => '2027-01-20')).toBe('2027-01-28');
    expect(izracunajRok(k('ocitovanje'), 2026, () => null)).toBeNull();
  });
});

describe('uvoz organizacije', () => {
  it('kontrolna znamenka OIB-a', () => {
    expect(ispravanOib(oibovi[0]!)).toBe(true);
    expect(ispravanOib(oibovi[0]!.slice(0, 10) + ((Number(oibovi[0]![10]) + 1) % 10))).toBe(false);
  });

  it('probni prolaz ništa ne upisuje, a primjena je ponovljiva', async () => {
    const admin: Korisnik = { racunId: (await (async () => { const id = noviId(); await t.db.insert(racun).values({ id, eposta: 'admin@u.hr', stanje: 'aktivan', stvoreno: new Date().toISOString() }); return id; })()), osobaId: null, uloge: ['administrator'] };
    const proba = await uvezi(t.db, CSV(), false, admin, new Date());
    expect(proba).toMatchObject({ greske: [], novihOsoba: 9, novihRasporeda: 9, novihJedinica: 2, primijenjeno: false });
    expect(await t.db.select().from(osoba)).toHaveLength(0);

    expect((await uvezi(t.db, CSV(), true, admin, new Date())).primijenjeno).toBe(true);
    expect(await t.db.select().from(osoba)).toHaveLength(9);
    expect(await uvezi(t.db, CSV(), true, admin, new Date())).toMatchObject({ novihOsoba: 0, novihRasporeda: 0, novihRacuna: 0 });
  });

  it('odbija neispravan OIB, nepostojećeg nadređenog i kružni odnos', async () => {
    const admin = await korisnik('admin@u.hr');
    const a = oib(2001), b = oib(2002);
    const csv = ['oib;ime;prezime;eposta;jedinica;radno_mjesto;nadredeni_oib;radi_od;radi_do;uloge',
      `12345678901;A;A;;J;m;;2020-01-01;;`, `${a};B;B;;J;m;${b};2020-01-01;;`, `${b};C;C;;J;m;${a};2020-01-01;;administrator`].join('\n');
    const ishod = await uvezi(t.db, csv, true, admin, new Date());
    expect(ishod.primijenjeno).toBe(false);
    expect(ishod.greske.join(' ')).toMatch(/OIB nije ispravan/);
    expect(ishod.greske.join(' ')).toMatch(/kružni odnos/);
    expect(ishod.greske.join(' ')).toMatch(/ne može se dodijeliti uvozom/);
  });
});

describe('postupak za javne službe', () => {
  it('otvaranje ciklusa razvrstava zaposlenike', async () => {
    // Zap7 je bio na roditeljskom dopustu dulje od šest mjeseci.
    const z7 = await korisnik('z7@u.hr');
    await t.db.insert(odsutnost).values({ id: noviId(), osobaId: z7.osobaId!, osnova: 'rodiljne-i-roditeljske-potpore', od: '2026-02-01', do: '2026-09-30' });

    await expect(otvoriCiklus(t.db, 'hr-javne-sluzbe', '1.0.0', 2026, await korisnik('vito@u.hr'), dan('2026-12-01'))).rejects.toThrow(GreskaPostupka);
    ciklusId = await otvoriCiklus(t.db, 'hr-javne-sluzbe', '1.0.0', 2026, await korisnik('kata@u.hr'), dan('2026-12-01'));
    const s = await stanje();
    expect(s.predmeti).toHaveLength(9);
    expect((await pp('novi@u.hr')).p.predmet).toMatchObject({ stanje: 'ne-ocjenjuje-se' });
    expect((await pp('z7@u.hr')).p.predmet).toMatchObject({ stanje: 'u-tijeku', ocjenaPoPropisu: 'uspjesan' });
    expect((await pp('z3@u.hr')).p.predmet.nadredeniOsobaId).toBe((await korisnik('vito@u.hr')).osobaId);
    await expect(otvoriCiklus(t.db, 'hr-javne-sluzbe', '1.0.0', 2026, await korisnik('kata@u.hr'), dan('2026-12-01'))).rejects.toThrow(/već postoji/);
  });

  it('tijelo se ne može imenovati bez propisanog sastava', async () => {
    const kata = await korisnik('kata@u.hr');
    const rita = await korisnik('rita@u.hr');
    let s = await stanje();
    const osobaOd = async (e: string) => (await korisnik(e)).osobaId!;
    for (const e of ['rita@u.hr', 'kata@u.hr', 'vito@u.hr', 'z5@u.hr']) await postaviClana(s, 'povjerenstvo', await osobaOd(e), false, kata, dan('2026-12-10'));
    s = await stanje();
    expect(provjeriSastav(s, 'povjerenstvo')).toHaveLength(2);
    expect(await imenujTijelo(s, 'povjerenstvo', rita, dan('2026-12-10'))).toHaveLength(2);

    await postaviClana(s, 'povjerenstvo', await osobaOd('z6@u.hr'), true, kata, dan('2026-12-10'));
    for (const [e, predstavnik] of [['rita@u.hr', false], ['kata@u.hr', false], ['z6@u.hr', true]] as const) {
      await postaviClana(s, 'odbor', await osobaOd(e), predstavnik, kata, dan('2026-12-10'));
    }
    s = await stanje();
    await expect(imenujTijelo(s, 'povjerenstvo', kata, dan('2026-12-10'))).rejects.toThrow(/imenuje čelnik/);
    expect(await imenujTijelo(s, 'povjerenstvo', rita, dan('2026-12-10'))).toEqual([]);
    expect(await imenujTijelo(s, 'odbor', rita, dan('2026-12-10'))).toEqual([]);
    await expect(postaviClana(await stanje(), 'odbor', await osobaOd('z3@u.hr'), false, kata, dan('2026-12-11'))).rejects.toThrow(/već imenovano/);
  });

  it('redovni tijek: samoprocjena, prijedlog, uvid, očitovanje, Povjerenstvo, Odbor, odluka', async () => {
    const z3 = await korisnik('z3@u.hr');
    const vito = await korisnik('vito@u.hr');
    let { s, p } = await pp('z3@u.hr');

    // Nadređeni ne može predložiti ocjenu dok teče rok za samoprocjenu.
    await expect(izvrsiKorak(s, p, 'prijedlog', {}, vito, dan('2027-01-05'))).rejects.toThrow(/nije na redu/);
    await izvrsiKorak(s, p, 'samoprocjena', { tekst: 'Obavio sam sve zadatke.' }, z3, dan('2027-01-05'));

    ({ s, p } = await pp('z3@u.hr'));
    await expect(izvrsiKorak(s, p, 'prijedlog', {}, z3, dan('2027-01-10'))).rejects.toThrow(/Nemate ovlast/);
    const prijedlog = { ocjeneKriterija: ocjeneKriterija('izvrstan'), ocjena: 'izvrstan', obrazlozenje: 'Iznimni rezultati.' };
    await expect(izvrsiKorak(s, p, 'prijedlog', { ...prijedlog, ocjeneKriterija: {} }, vito, dan('2027-01-10'))).rejects.toThrow(/Nedostaje ocjena kriterija/);
    await izvrsiKorak(s, p, 'prijedlog', prijedlog, vito, dan('2027-01-10'));

    ({ s, p } = await pp('z3@u.hr'));
    await izvrsiKorak(s, p, 'uvid', {}, z3, dan('2027-01-12'));

    // Povjerenstvo ne može odlučivati dok teče rok od osam dana za očitovanje.
    ({ s, p } = await pp('z3@u.hr'));
    const rita = await korisnik('rita@u.hr');
    expect(tekuciKorak(izracunajStanje(s.paket, p, dan('2027-01-20')))?.def.kljuc).toBe('ocitovanje');
    await expect(glasuj(s, p, 'konacni-prijedlog', 'izvrstan', rita, dan('2027-01-20'))).rejects.toThrow(/nije na redu/);
    expect(tekuciKorak(izracunajStanje(s.paket, p, dan('2027-01-21')))?.def.kljuc).toBe('konacni-prijedlog');
    await izvrsiKorak(s, p, 'ocitovanje', { tekst: 'Slažem se.' }, z3, dan('2027-01-15'));

    // Glasovanje: izuzeti su zaposlenik i predlagatelj; treba većina svih pet članova.
    ({ s, p } = await pp('z3@u.hr'));
    await expect(glasuj(s, p, 'konacni-prijedlog', 'izvrstan', vito, dan('2027-02-01'))).rejects.toThrow(/Nemate ovlast/);
    expect(await glasuj(s, p, 'konacni-prijedlog', 'izvrstan', rita, dan('2027-02-01'))).toMatchObject({ odluceno: false, potrebno: 3 });
    ({ s, p } = await pp('z3@u.hr'));
    await glasuj(s, p, 'konacni-prijedlog', 'narocito-uspjesan', await korisnik('kata@u.hr'), dan('2027-02-01'));
    ({ s, p } = await pp('z3@u.hr'));
    await glasuj(s, p, 'konacni-prijedlog', 'narocito-uspjesan', await korisnik('z5@u.hr'), dan('2027-02-01'));
    ({ s, p } = await pp('z3@u.hr'));
    // Član smije promijeniti glas dok odluka nije donesena.
    expect(await glasuj(s, p, 'konacni-prijedlog', 'narocito-uspjesan', rita, dan('2027-02-02'))).toMatchObject({ odluceno: true, ocjena: 'narocito-uspjesan' });

    // Konačni prijedlog se razlikuje od prijedloga: ide na uvid, a zatim Odboru jer je među dvije najviše ocjene.
    ({ s, p } = await pp('z3@u.hr'));
    expect(tekuciKorak(izracunajStanje(s.paket, p, dan('2027-02-03')))?.def.kljuc).toBe('uvid-konacnog');
    await izvrsiKorak(s, p, 'uvid-konacnog', { datum: '2027-02-04' }, await korisnik('kata@u.hr'), dan('2027-02-05'));
    ({ s, p } = await pp('z3@u.hr'));
    expect(p.koraci.find((k) => k.kljuc === 'uvid-konacnog')).toMatchObject({ datum: '2027-02-04', uIme: true });
    const st = izracunajStanje(s.paket, p, dan('2027-02-05'));
    expect(tekuciKorak(st)?.def.kljuc).toBe('misljenje-odbora');
    expect(st.find((k) => k.def.kljuc === 'misljenje-odbora')?.rok).toBe('2027-02-10');

    await expect(izvrsiKorak(s, p, 'odluka', { obrazlozenje: 'x' }, rita, dan('2027-02-05'))).rejects.toThrow(/nije na redu/);
    await glasuj(s, p, 'misljenje-odbora', 'narocito-uspjesan', rita, dan('2027-02-06'));
    ({ s, p } = await pp('z3@u.hr'));
    expect(await glasuj(s, p, 'misljenje-odbora', 'narocito-uspjesan', await korisnik('kata@u.hr'), dan('2027-02-06'))).toMatchObject({ odluceno: true });

    ({ s, p } = await pp('z3@u.hr'));
    await expect(izvrsiKorak(s, p, 'odluka', { obrazlozenje: 'x' }, vito, dan('2027-02-10'))).rejects.toThrow(/Nemate ovlast/);
    await expect(izvrsiKorak(s, p, 'odluka', { obrazlozenje: '  ' }, rita, dan('2027-02-10'))).rejects.toThrow();
    await izvrsiKorak(s, p, 'odluka', { obrazlozenje: 'Na temelju mišljenja Odbora.' }, rita, dan('2027-02-10'));

    ({ s, p } = await pp('z3@u.hr'));
    expect(p.predmet).toMatchObject({ stanje: 'odlucen', konacnaOcjena: 'narocito-uspjesan' });
    expect(await t.db.select().from(bodovi).where(eq(bodovi.osobaId, z3.osobaId!))).toMatchObject([{ godina: 2026, bodovi: 4, izvor: 'odluka' }]);

    const kata = await korisnik('kata@u.hr');
    await izvrsiKorak(s, p, 'dostava', { datum: '2027-02-11', nacin: 'osobno uz potpis' }, kata, dan('2027-02-12'));
    ({ s, p } = await pp('z3@u.hr'));
    await izvrsiKorak(s, p, 'unos-u-registar', { datum: '2027-02-12' }, kata, dan('2027-02-12'));
    ({ s, p } = await pp('z3@u.hr'));
    expect(p.predmet.stanje).toBe('zakljucen');
    expect(tekuciKorak(izracunajStanje(s.paket, p, dan('2027-02-13')))).toBeNull();
  });

  it('najniža ocjena traži pisano upozorenje izdano do 30. rujna', async () => {
    const vito = await korisnik('vito@u.hr');
    const kata = await korisnik('kata@u.hr');
    let { s, p } = await pp('z4@u.hr');
    await izvrsiKorak(s, p, 'samoprocjena', { bez: true }, kata, dan('2027-01-05'));
    const prijedlog = { ocjeneKriterija: ocjeneKriterija('ne-zadovoljava'), ocjena: 'ne-zadovoljava', obrazlozenje: 'Propusti nisu otklonjeni.' };

    ({ s, p } = await pp('z4@u.hr'));
    await expect(izvrsiKorak(s, p, 'prijedlog', prijedlog, vito, dan('2027-01-10'))).rejects.toThrow(/pisanog upozorenja/);
    await expect(dodajZapis(t.db, p, { vrsta: 'pisano-upozorenje', datum: '2026-10-15', opis: 'Kasno.' }, await korisnik('z5@u.hr'), dan('2026-10-15'))).rejects.toThrow(/neposredno nadređeni/);
    await dodajZapis(t.db, p, { vrsta: 'pisano-upozorenje', datum: '2026-10-15', opis: 'Upozorenje izdano prekasno.' }, vito, dan('2026-10-15'));
    ({ s, p } = await pp('z4@u.hr'));
    await expect(izvrsiKorak(s, p, 'prijedlog', prijedlog, vito, dan('2027-01-10'))).rejects.toThrow(/pisanog upozorenja/);

    await dodajZapis(t.db, p, { vrsta: 'pisano-upozorenje', datum: '2026-09-30', opis: 'Upozorenje na propuste.' }, vito, dan('2026-09-30'));
    ({ s, p } = await pp('z4@u.hr'));
    await izvrsiKorak(s, p, 'prijedlog', prijedlog, vito, dan('2027-01-10'));

    // Bez očitovanja: nakon isteka roka Povjerenstvo odlučuje; Odbor se preskače.
    ({ s, p } = await pp('z4@u.hr'));
    await izvrsiKorak(s, p, 'uvid', {}, await korisnik('z4@u.hr'), dan('2027-01-11'));
    ({ s, p } = await pp('z4@u.hr'));
    for (const e of ['rita@u.hr', 'kata@u.hr', 'z5@u.hr']) {
      ({ s, p } = await pp('z4@u.hr'));
      await glasuj(s, p, 'konacni-prijedlog', 'ne-zadovoljava', await korisnik(e), dan('2027-01-25'));
    }
    ({ s, p } = await pp('z4@u.hr'));
    const st = izracunajStanje(s.paket, p, dan('2027-01-26'));
    expect(st.find((k) => k.def.kljuc === 'ocitovanje')?.stanje).toBe('istekao');
    expect(st.find((k) => k.def.kljuc === 'uvid-konacnog')?.stanje).toBe('preskocen');
    expect(st.find((k) => k.def.kljuc === 'misljenje-odbora')?.stanje).toBe('preskocen');
    expect(tekuciKorak(st)?.def.kljuc).toBe('odluka');
  });

  it('ocjena po propisu ide ravno na odluku, a tko se ne ocjenjuje nema koraka', async () => {
    let { s, p } = await pp('z7@u.hr');
    expect(tekuciKorak(izracunajStanje(s.paket, p, dan('2027-01-05')))?.def.kljuc).toBe('odluka');
    await izvrsiKorak(s, p, 'odluka', { obrazlozenje: 'Odsutnost dulja od šest mjeseci.' }, await korisnik('rita@u.hr'), dan('2027-01-05'));
    ({ s, p } = await pp('z7@u.hr'));
    expect(p.predmet.konacnaOcjena).toBe('uspjesan');

    ({ s, p } = await pp('novi@u.hr'));
    expect(tekuciKorak(izracunajStanje(s.paket, p, dan('2027-01-05')))).toBeNull();
  });

  it('kvote se računaju na broj zaposlenih 31. prosinca, bez zaokruživanja', async () => {
    const s = await stanje();
    const zaposlenih = await brojZaposlenihNaDan(t.db, s.paket, 2026);
    expect(zaposlenih).toBe(9);
    const kvote = izracunajKvote(s, zaposlenih);
    expect(kvote.find((k) => k.ocjena === 'izvrstan')).toMatchObject({ najvise: 0.45, predlozeno: 0, prekoraceno: false });
    expect(kvote.find((k) => k.ocjena === 'narocito-uspjesan')).toMatchObject({ najvise: 1.35, predlozeno: 1, prekoraceno: false });
    expect(izracunajKvote({ ...s, postavke: { ...s.postavke, zaokruzivanjeKvota: 'nadolje' } }, zaposlenih)[0]).toMatchObject({ najvise: 0 });
  });

  it('svi koraci su u revizijskom tragu i lanac je ispravan', async () => {
    expect((await provjeriLanac(t.db)).ispravno).toBe(true);
    expect(await t.db.select().from(predmet).where(eq(predmet.stanje, 'zakljucen'))).toHaveLength(1);
  });
});
