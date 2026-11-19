#!/usr/bin/env node
// Stvara račun s ulogom administratora. Račun je u stanju 'pozvan': osoba se prvi put
// prijavljuje kodom iz e-pošte i tada upisuje drugi faktor.
//
//   node scripts/prvi-administrator.mjs --eposta ime@ustanova.hr --lokalno
//   node scripts/prvi-administrator.mjs --eposta ime@ustanova.hr --instanca <oznaka> [--proba]
import { createHash } from 'node:crypto';
import { argumenti, napisiKonfiguraciju, noviId, obvezno, sqlTekst, ucitajZapis, wrangler } from './zajednicko.mjs';

const POCETNI_ZBROJ = '0'.repeat(64);

/** Isti izračun kao zbrojZapisa u src/lib/revizija.ts; test/skripte.test.ts provjerava da se slažu. */
export function zbrojZapisa(z) {
  const polja = [z.rb, z.vrijeme, z.racunId, z.radnja, z.predmetVrsta, z.predmetId, z.prije, z.poslije, z.zbrojPrethodnog];
  return createHash('sha256').update(JSON.stringify(polja)).digest('hex');
}

/**
 * SQL za račun, ulogu i zapis u revizijskom tragu. `zadnji` je zadnji zapis traga
 * ({ rb, zbroj }) ili null ako je trag prazan.
 */
export function sqlZaAdministratora(eposta, zadnji = null, sada = new Date()) {
  const uredeno = eposta.trim().toLowerCase();
  if (!/^[^\s@']+@[^\s@']+\.[^\s@']+$/.test(uredeno)) throw new Error(`Neispravna adresa e-pošte: ${eposta}`);
  const racunId = noviId();
  const vrijeme = sada.toISOString();
  const bezZbroja = {
    rb: (zadnji?.rb ?? 0) + 1,
    vrijeme,
    racunId: null,
    radnja: 'racun.stvoren_skriptom',
    predmetVrsta: 'racun',
    predmetId: racunId,
    prije: null,
    poslije: JSON.stringify({ uloga: 'administrator' }),
    zbrojPrethodnog: zadnji?.zbroj ?? POCETNI_ZBROJ,
  };
  return [
    `INSERT INTO revizija (rb, vrijeme, racun_id, radnja, predmet_vrsta, predmet_id, prije, poslije, zbroj_prethodnog, zbroj) VALUES (${bezZbroja.rb}, ${sqlTekst(vrijeme)}, NULL, ${sqlTekst(bezZbroja.radnja)}, 'racun', ${sqlTekst(racunId)}, NULL, ${sqlTekst(bezZbroja.poslije)}, ${sqlTekst(bezZbroja.zbrojPrethodnog)}, ${sqlTekst(zbrojZapisa(bezZbroja))});`,
    `INSERT INTO racun (id, eposta, stanje, stvoreno) VALUES (${sqlTekst(racunId)}, ${sqlTekst(uredeno)}, 'pozvan', ${sqlTekst(vrijeme)});`,
    `INSERT INTO uloga (id, racun_id, uloga, vrijedi_od) VALUES (${sqlTekst(noviId())}, ${sqlTekst(racunId)}, 'administrator', ${sqlTekst(vrijeme)});`,
  ].join(' ');
}

export function stvoriAdministratora({ eposta, konfiguracija, lokalno, proba }) {
  const cilj = ['d1', 'execute', 'DB', lokalno ? '--local' : '--remote', '--yes'];
  if (konfiguracija) cilj.push('--config', konfiguracija);
  let zadnji = null;
  if (!proba) {
    const izlaz = wrangler([...cilj, '--json', '--command', 'SELECT rb, zbroj FROM revizija ORDER BY rb DESC LIMIT 1'], {
      tiho: true,
    });
    zadnji = JSON.parse(izlaz.slice(izlaz.indexOf('[')))[0]?.results?.[0] ?? null;
  }
  wrangler([...cilj, '--command', sqlZaAdministratora(eposta, zadnji)], { proba, tiho: true });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const arg = argumenti();
    const eposta = obvezno(arg, 'eposta');
    if (arg.lokalno) {
      stvoriAdministratora({ eposta, lokalno: true, proba: !!arg.proba });
    } else {
      const zapis = ucitajZapis(obvezno(arg, 'instanca'));
      stvoriAdministratora({ eposta, konfiguracija: napisiKonfiguraciju(zapis), proba: !!arg.proba });
    }
    console.log('Administrator je stvoren. Adresa e-pošte se ne upisuje u popis instanci.');
  } catch (greska) {
    console.error(`Greška: ${greska.message}`);
    process.exit(1);
  }
}
