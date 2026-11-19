#!/usr/bin/env node
// Primjenjuje migracije sheme, bazu po bazu, prema popisu instanci.
//
//   node scripts/migriraj.mjs --instanca <oznaka> [--proba]
//   node scripts/migriraj.mjs --sve [--proba]
//
// Migracije primjenjuje isključivo Wrangler; drizzle-kit ih samo izrađuje.
import { argumenti, napisiKonfiguraciju, sviZapisi, ucitajZapis, wrangler } from './zajednicko.mjs';

try {
  const arg = argumenti();
  const zapisi = arg.sve ? sviZapisi() : [ucitajZapis(String(arg.instanca ?? ''))];
  if (zapisi.length === 0) console.log('U popisu nema instanci.');
  for (const zapis of zapisi) {
    console.log(`\nInstanca '${zapis.oznaka}' (${zapis.baza.ime})`);
    wrangler(['d1', 'migrations', 'apply', 'DB', '--remote', '--force', '--config', napisiKonfiguraciju(zapis)], {
      proba: !!arg.proba,
    });
  }
} catch (greska) {
  console.error(`Greška: ${greska.message}`);
  process.exit(1);
}
