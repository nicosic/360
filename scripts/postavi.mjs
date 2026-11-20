#!/usr/bin/env node
// Gradi i postavlja trenutni kod na postojeću instancu te upisuje verziju u popis.
// Tajne instance ostaju kakve jesu. Migracije se primjenjuju zasebno (scripts/migriraj.mjs).
//
//   node scripts/postavi.mjs --instanca <oznaka> [--proba]
import { argumenti, napisiKonfiguraciju, obvezno, pokreni, spremiZapis, ucitajZapis, verzijaKoda, wrangler } from './zajednicko.mjs';

try {
  const arg = argumenti();
  const proba = !!arg.proba;
  const zapis = { ...ucitajZapis(obvezno(arg, 'instanca')), verzija: verzijaKoda() };
  const konfiguracija = napisiKonfiguraciju(zapis);
  console.log(`Postavljanje verzije ${zapis.verzija} na instancu '${zapis.oznaka}'${proba ? ' — PROBA' : ''}`);
  pokreni('npx', ['astro', 'build'], { proba, okolina: { WRANGLER_KONFIGURACIJA: konfiguracija } });
  wrangler(['deploy'], { proba });
  if (!proba) spremiZapis(zapis);
  console.log('Gotovo.');
} catch (greska) {
  console.error(`Greška: ${greska.message}`);
  process.exit(1);
}
