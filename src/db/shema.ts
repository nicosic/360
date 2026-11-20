// Shema jezgre, prvi korak: organizacija, pristup i revizijski trag.
// Tablice postupka i dokaza (ciklus, predmet, korak, dokument...) dolaze sa svojim koracima izrade.
//
// Pravila sheme (tehnička specifikacija, odjeljak 10):
//  - ključevi su tekstualni i vremenski poredivi (vidi src/lib/id.ts)
//  - datumi i vremena su ISO tekst
//  - sve što ovisi o vremenu ima stupce vrijedi_od / vrijedi_do
//  - nijedan stupac ne vrijedi samo za jednu vrstu ustanove ili jednog kupca
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ---------- Organizacija ----------

export const ustanova = sqliteTable('ustanova', {
  id: text('id').primaryKey(),
  naziv: text('naziv').notNull(),
  // Slobodna oznaka koju tumači paket pravila, a ne jezgra.
  vrsta: text('vrsta').notNull(),
  nadleznoTijelo: text('nadlezno_tijelo'),
  stvoreno: text('stvoreno').notNull(),
});

export const jedinica = sqliteTable(
  'jedinica',
  {
    id: text('id').primaryKey(),
    naziv: text('naziv').notNull(),
    nadredenaId: text('nadredena_id'),
    vrijediOd: text('vrijedi_od').notNull(),
    vrijediDo: text('vrijedi_do'),
  },
  (t) => [index('jedinica_nadredena').on(t.nadredenaId)],
);

export const osoba = sqliteTable(
  'osoba',
  {
    id: text('id').primaryKey(),
    ime: text('ime').notNull(),
    prezime: text('prezime').notNull(),
    // Čita se samo za ispis propisanog obrasca i izvoz u registar.
    identifikacijskiBroj: text('identifikacijski_broj'),
    stvoreno: text('stvoreno').notNull(),
  },
  (t) => [uniqueIndex('osoba_identifikacijski_broj').on(t.identifikacijskiBroj)],
);

export const raspored = sqliteTable(
  'raspored',
  {
    id: text('id').primaryKey(),
    osobaId: text('osoba_id')
      .notNull()
      .references(() => osoba.id),
    jedinicaId: text('jedinica_id')
      .notNull()
      .references(() => jedinica.id),
    radnoMjesto: text('radno_mjesto').notNull(),
    skupinaRadnogMjesta: text('skupina_radnog_mjesta'),
    nadredeniOsobaId: text('nadredeni_osoba_id').references(() => osoba.id),
    // Tjedni sati; treba za razmjerne bodove kod rada u nepunom radnom vremenu.
    radnoVrijemeSati: real('radno_vrijeme_sati'),
    vrijediOd: text('vrijedi_od').notNull(),
    vrijediDo: text('vrijedi_do'),
  },
  (t) => [
    index('raspored_osoba').on(t.osobaId, t.vrijediOd),
    index('raspored_nadredeni').on(t.nadredeniOsobaId, t.vrijediOd),
  ],
);

export const odsutnost = sqliteTable(
  'odsutnost',
  {
    id: text('id').primaryKey(),
    osobaId: text('osoba_id')
      .notNull()
      .references(() => osoba.id),
    // Samo oznaka osnove koju tumači paket pravila; bez pojedinosti.
    osnova: text('osnova').notNull(),
    od: text('od').notNull(),
    do: text('do'),
  },
  (t) => [index('odsutnost_osoba').on(t.osobaId, t.od)],
);

// ---------- Pristup ----------

export const racun = sqliteTable(
  'racun',
  {
    id: text('id').primaryKey(),
    osobaId: text('osoba_id').references(() => osoba.id),
    // Uvijek mala slova, bez razmaka.
    eposta: text('eposta').notNull(),
    stanje: text('stanje', { enum: ['pozvan', 'aktivan', 'blokiran'] }).notNull(),
    // Tajna za jednokratne kodove, šifrirana ključem instance (AES-GCM).
    totpTajnaSifrirano: text('totp_tajna_sifrirano'),
    totpPotvrdenU: text('totp_potvrden_u'),
    // Zadnji iskorišteni vremenski korak; isti kod ne vrijedi dvaput.
    totpZadnjiKorak: integer('totp_zadnji_korak'),
    stvoreno: text('stvoreno').notNull(),
  },
  (t) => [uniqueIndex('racun_eposta').on(t.eposta)],
);

export const jednokratniKod = sqliteTable(
  'jednokratni_kod',
  {
    id: text('id').primaryKey(),
    racunId: text('racun_id')
      .notNull()
      .references(() => racun.id),
    // HMAC koda ključem instance; sam kod se nigdje ne sprema.
    sazetak: text('sazetak').notNull(),
    istice: text('istice').notNull(),
    pokusaja: integer('pokusaja').notNull().default(0),
    iskoristenU: text('iskoristen_u'),
    stvoreno: text('stvoreno').notNull(),
  },
  (t) => [index('jednokratni_kod_racun').on(t.racunId, t.stvoreno)],
);

export const sjednicaPrijave = sqliteTable(
  'sjednica_prijave',
  {
    id: text('id').primaryKey(),
    racunId: text('racun_id')
      .notNull()
      .references(() => racun.id),
    // SHA-256 tokena iz kolačića; sam token se ne sprema.
    sazetakTokena: text('sazetak_tokena').notNull(),
    // 'kod' = potvrđen samo prvi faktor; 'potpuna' = potvrđena oba.
    razina: text('razina', { enum: ['kod', 'potpuna'] }).notNull(),
    stvoreno: text('stvoreno').notNull(),
    zadnjaAktivnost: text('zadnja_aktivnost').notNull(),
    istice: text('istice').notNull(),
    opozvanaU: text('opozvana_u'),
  },
  (t) => [
    uniqueIndex('sjednica_prijave_token').on(t.sazetakTokena),
    index('sjednica_prijave_racun').on(t.racunId),
  ],
);

export const uloga = sqliteTable(
  'uloga',
  {
    id: text('id').primaryKey(),
    racunId: text('racun_id')
      .notNull()
      .references(() => racun.id),
    // Naziv uloge tumači paket pravila; jezgra poznaje samo 'administrator'.
    uloga: text('uloga').notNull(),
    opseg: text('opseg'),
    vrijediOd: text('vrijedi_od').notNull(),
    vrijediDo: text('vrijedi_do'),
  },
  (t) => [index('uloga_racun').on(t.racunId)],
);

export const pokusajPrijave = sqliteTable(
  'pokusaj_prijave',
  {
    id: text('id').primaryKey(),
    // Npr. 'kod:<račun>' ili 'adresa:<IP>'; služi samo ograničenju broja pokušaja.
    kljuc: text('kljuc').notNull(),
    vrijeme: text('vrijeme').notNull(),
  },
  (t) => [index('pokusaj_prijave_kljuc').on(t.kljuc, t.vrijeme)],
);

// ---------- Postupak ----------

export const postavke = sqliteTable('postavke', {
  id: text('id').primaryKey(),
  paket: text('paket').notNull(),
  // JSON provjeren prema obliku postavki i ograničenjima paketa.
  sadrzaj: text('sadrzaj').notNull(),
  // Postavke se zaključavaju kad ih ciklus počne koristiti.
  zakljucanoU: text('zakljucano_u'),
  stvoreno: text('stvoreno').notNull(),
});

export const ciklus = sqliteTable(
  'ciklus',
  {
    id: text('id').primaryKey(),
    godina: integer('godina').notNull(),
    paket: text('paket').notNull(),
    paketVerzija: text('paket_verzija').notNull(),
    postavkeId: text('postavke_id')
      .notNull()
      .references(() => postavke.id),
    stanje: text('stanje', { enum: ['otvoren', 'zakljucen'] }).notNull(),
    otvoreno: text('otvoreno').notNull(),
  },
  (t) => [uniqueIndex('ciklus_godina').on(t.godina)],
);

export const predmet = sqliteTable(
  'predmet',
  {
    id: text('id').primaryKey(),
    ciklusId: text('ciklus_id')
      .notNull()
      .references(() => ciklus.id),
    osobaId: text('osoba_id')
      .notNull()
      .references(() => osoba.id),
    nadredeniOsobaId: text('nadredeni_osoba_id').references(() => osoba.id),
    stanje: text('stanje', { enum: ['u-tijeku', 'ne-ocjenjuje-se', 'odlucen', 'dostavljen', 'zakljucen'] }).notNull(),
    // Zašto se predmet ne vodi redovnim postupkom, s pozivom na članak.
    razlog: text('razlog'),
    // Ocjena koju propis određuje bez postupka (npr. dulja odsutnost).
    ocjenaPoPropisu: text('ocjena_po_propisu'),
    konacnaOcjena: text('konacna_ocjena'),
    otvoreno: text('otvoreno').notNull(),
  },
  (t) => [uniqueIndex('predmet_ciklus_osoba').on(t.ciklusId, t.osobaId), index('predmet_nadredeni').on(t.nadredeniOsobaId)],
);

// Završeni koraci predmeta. Koji je korak na redu, izvodi se iz paketa i ovih redaka.
export const korak = sqliteTable(
  'korak',
  {
    id: text('id').primaryKey(),
    predmetId: text('predmet_id')
      .notNull()
      .references(() => predmet.id),
    kljuc: text('kljuc').notNull(),
    stanje: text('stanje', { enum: ['zavrsen', 'bez-odgovora'] }).notNull(),
    // Datum na koji se korak računa (npr. datum uvida s papira); od njega teku rokovi.
    datum: text('datum').notNull(),
    ishod: text('ishod').notNull(),
    izvrsioRacunId: text('izvrsio_racun_id').references(() => racun.id),
    // Kadrovska služba upisala je korak umjesto izvršitelja, na temelju papira.
    uIme: integer('u_ime', { mode: 'boolean' }).notNull().default(false),
    zavrsenoU: text('zavrseno_u').notNull(),
  },
  (t) => [uniqueIndex('korak_predmet_kljuc').on(t.predmetId, t.kljuc)],
);

// Evidencija rada tijekom godine: primjedbe, upozorenja, pohvale, postignuća.
export const zapis = sqliteTable(
  'zapis',
  {
    id: text('id').primaryKey(),
    predmetId: text('predmet_id')
      .notNull()
      .references(() => predmet.id),
    vrsta: text('vrsta', { enum: ['primjedba', 'pisano-upozorenje', 'pohvala', 'postignuce'] }).notNull(),
    datum: text('datum').notNull(),
    opis: text('opis').notNull(),
    autorRacunId: text('autor_racun_id')
      .notNull()
      .references(() => racun.id),
    stvoreno: text('stvoreno').notNull(),
  },
  (t) => [index('zapis_predmet').on(t.predmetId, t.datum)],
);

export const tijelo = sqliteTable(
  'tijelo',
  {
    id: text('id').primaryKey(),
    ciklusId: text('ciklus_id')
      .notNull()
      .references(() => ciklus.id),
    vrsta: text('vrsta').notNull(),
    // Sastav je potvrđen odlukom o imenovanju; do tada tijelo ne može odlučivati.
    imenovanoU: text('imenovano_u'),
  },
  (t) => [uniqueIndex('tijelo_ciklus_vrsta').on(t.ciklusId, t.vrsta)],
);

export const clanTijela = sqliteTable(
  'clan_tijela',
  {
    id: text('id').primaryKey(),
    tijeloId: text('tijelo_id')
      .notNull()
      .references(() => tijelo.id),
    osobaId: text('osoba_id')
      .notNull()
      .references(() => osoba.id),
    predstavnikRadnika: integer('predstavnik_radnika', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [uniqueIndex('clan_tijela_osoba').on(t.tijeloId, t.osobaId)],
);

export const glas = sqliteTable(
  'glas',
  {
    id: text('id').primaryKey(),
    predmetId: text('predmet_id')
      .notNull()
      .references(() => predmet.id),
    korakKljuc: text('korak_kljuc').notNull(),
    osobaId: text('osoba_id')
      .notNull()
      .references(() => osoba.id),
    ocjena: text('ocjena').notNull(),
    vrijeme: text('vrijeme').notNull(),
  },
  (t) => [uniqueIndex('glas_predmet_korak_osoba').on(t.predmetId, t.korakKljuc, t.osobaId)],
);

// ---------- Dokazi ----------

export const bodovi = sqliteTable(
  'bodovi',
  {
    id: text('id').primaryKey(),
    osobaId: text('osoba_id')
      .notNull()
      .references(() => osoba.id),
    godina: integer('godina').notNull(),
    bodovi: integer('bodovi').notNull(),
    // 'odluka' ili 'pocetno-stanje'.
    izvor: text('izvor').notNull(),
    predmetId: text('predmet_id').references(() => predmet.id),
    stvoreno: text('stvoreno').notNull(),
  },
  (t) => [uniqueIndex('bodovi_osoba_godina').on(t.osobaId, t.godina)],
);


// Zapisi se samo dodaju. Izmjenu i brisanje odbija i sama baza
// (okidači u migraciji 0001_revizija_zastita.sql).
export const revizija = sqliteTable('revizija', {
  rb: integer('rb').primaryKey(),
  vrijeme: text('vrijeme').notNull(),
  racunId: text('racun_id'),
  radnja: text('radnja').notNull(),
  predmetVrsta: text('predmet_vrsta'),
  predmetId: text('predmet_id'),
  prije: text('prije'),
  poslije: text('poslije'),
  zbrojPrethodnog: text('zbroj_prethodnog').notNull(),
  zbroj: text('zbroj').notNull(),
});
