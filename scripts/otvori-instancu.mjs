#!/usr/bin/env node
// Otvara instancu kupca: baza, spremište, migracije, aplikacija, poddomena, zapis u popisu,
// prvi administrator i provjera. Tehnička specifikacija, odjeljak 9.
//
//   node scripts/otvori-instancu.mjs --oznaka skola-primjer --naziv "OŠ Primjer" \
//     --domena ocjenjivanje.example --administrator ravnatelj@skola.hr --eposta-nacin <način> [--proba]
//
// Ispitna instanca (bez stvarnih podataka): --ispitna, bez --domena; adresa je na workers.dev,
// a kod za prijavu se čita iz zapisa rada (--eposta-nacin konzola).
//
// --proba ispisuje naredbe bez izvršavanja i ne mijenja ništa.
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  argumenti,
  napisiKonfiguraciju,
  obvezno,
  poddomenaWorkersDev,
  pokreni,
  provjeriOznaku,
  putZapisa,
  spremiZapis,
  verzijaKoda,
  wrangler,
} from './zajednicko.mjs';
import { stvoriAdministratora } from './prvi-administrator.mjs';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

function korak(broj, opis) {
  console.log(`\n${broj}. ${opis}`);
}

try {
  const arg = argumenti();
  const proba = !!arg.proba;
  const oznaka = provjeriOznaku(obvezno(arg, 'oznaka'));
  const naziv = obvezno(arg, 'naziv');
  const ispitna = !!arg.ispitna;
  const domena = ispitna && !arg.domena ? null : obvezno(arg, 'domena');
  const administrator = obvezno(arg, 'administrator');
  const epostaNacin = obvezno(arg, 'eposta-nacin');
  if (epostaNacin === 'konzola' && !ispitna) {
    throw new Error("Način 'konzola' dopušten je samo lokalno i na ispitnoj instanci (--ispitna).");
  }
  if (existsSync(putZapisa(oznaka))) throw new Error(`Instanca '${oznaka}' već je u popisu.`);

  const ime = `p360-${oznaka}`;
  const adresa = domena ? `${oznaka}.${domena}` : `${ime}.${proba ? '<workers-dev>' : await poddomenaWorkersDev()}.workers.dev`;
  console.log(`Otvaranje ${ispitna ? 'ISPITNE ' : ''}instance '${oznaka}' (${naziv})${proba ? ' — PROBA, ništa se ne mijenja' : ''}`);

  korak(1, 'Baza D1 s jurisdikcijom „eu“');
  const izlazBaze = wrangler(['d1', 'create', ime, '--jurisdiction=eu'], { proba });
  const bazaId = proba ? '00000000-0000-0000-0000-000000000000' : izlazBaze.match(UUID)?.[0];
  if (!bazaId) throw new Error('Iz izlaza naredbe nije pročitan identifikator baze.');
  if (!proba) {
    const podaci = JSON.parse(wrangler(['d1', 'info', ime, '--json'], { tiho: true }));
    if (podaci.jurisdiction !== 'eu') {
      throw new Error(
        `Jurisdikcija baze nije potvrđena (pročitano: ${JSON.stringify(podaci.jurisdiction)}). ` +
          'Jurisdikcija se ne može naknadno promijeniti: provjerite bazu ručno prije nastavka.',
      );
    }
  }

  korak(2, 'Spremište R2 s jurisdikcijom „eu“');
  wrangler(['r2', 'bucket', 'create', ime, '--jurisdiction', 'eu'], { proba });
  // Spremište u jurisdikciji dohvatljivo je samo uz tu jurisdikciju, pa uspjeh ove naredbe potvrđuje smještaj.
  wrangler(['r2', 'bucket', 'info', ime, '--jurisdiction', 'eu', '--json'], { proba, tiho: true });

  const zapis = {
    oznaka,
    naziv,
    adresa,
    vlastitaDomena: !!domena,
    ispitna,
    aplikacija: ime,
    baza: { ime, id: bazaId },
    spremiste: ime,
    epostaNacin,
    verzija: verzijaKoda(),
    otvoreno: new Date().toISOString(),
    stanje: 'otvaranje',
  };
  const konfiguracija = proba ? `.instance/${oznaka}/wrangler.jsonc` : napisiKonfiguraciju(zapis);

  korak(3, 'Migracije sheme');
  wrangler(['d1', 'migrations', 'apply', 'DB', '--remote', '--force', '--config', konfiguracija], { proba });

  korak(4, 'Izgradnja i postavljanje aplikacije, zatim tajna instance');
  pokreni('npx', ['astro', 'build'], { proba, okolina: { WRANGLER_KONFIGURACIJA: konfiguracija } });
  wrangler(['deploy'], { proba });
  // Ključ se stvara ovdje i predaje izravno Cloudflareu; ne zapisuje se ni na disk ni u popis.
  wrangler(['secret', 'put', 'KLJUC_INSTANCE', '--config', konfiguracija], {
    proba,
    ulaz: randomBytes(32).toString('base64'),
  });

  korak(5, `Adresa ${zapis.adresa}`);
  console.log(`  Povezana pri postavljanju (${domena ? 'vlastita poddomena' : 'workers.dev'}).`);

  korak(6, 'Zapis u središnjem popisu (instance/)');
  if (!proba) spremiZapis({ ...zapis, stanje: 'aktivna' });
  console.log(`  instance/${oznaka}.json — bez osobnih podataka`);

  korak(7, 'Prvi administrator');
  stvoriAdministratora({ eposta: administrator, konfiguracija, proba });

  korak(8, 'Provjera');
  if (proba) {
    console.log(`  [proba] GET https://${zapis.adresa}/prijava → očekuje se 200`);
  } else {
    const odgovor = await fetch(`https://${zapis.adresa}/prijava`, { redirect: 'manual' });
    if (odgovor.status !== 200) throw new Error(`Stranica za prijavu vraća ${odgovor.status}.`);
    console.log('  Stranica za prijavu odgovara.');
  }

  console.log(`\nGotovo${proba ? ' (proba)' : ''}. Zapis instance treba predati u repozitorij.`);
} catch (greska) {
  console.error(`\nGreška: ${greska.message}`);
  process.exit(1);
}
