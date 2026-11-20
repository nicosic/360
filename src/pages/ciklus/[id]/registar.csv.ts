// Popis odluka za ručni unos u Registar zaposlenih. Oblik koji bi registar propisao još nije poznat.
import type { APIRoute } from 'astro';
import { ucitajCiklus } from '../../../lib/postupak/ciklus';
import { zabiljezi } from '../../../lib/revizija';

const polje = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export const GET: APIRoute = async ({ params, locals }) => {
  const korisnik = locals.korisnik!;
  if (!korisnik.uloge.includes('kadrovska')) return new Response('Nemate ovlast za ovaj izvoz.', { status: 403 });
  const s = await ucitajCiklus(locals.okruzenje.db, params.id!);
  if (!s) return new Response('Ciklus ne postoji.', { status: 404 });

  const redci = [['oib', 'ime', 'prezime', 'godina', 'ocjena', 'bodovi', 'datum_odluke', 'uneseno_u_registar'].join(';')];
  for (const pp of s.predmeti) {
    if (!pp.predmet.konacnaOcjena) continue;
    const o = s.osobe.get(pp.predmet.osobaId)!;
    const ocjena = s.paket.ocjene.find((x) => x.kljuc === pp.predmet.konacnaOcjena)!;
    const odluka = pp.koraci.find((k) => k.kljuc === s.paket.odluka.korak);
    const unos = pp.koraci.find((k) => k.kljuc === 'unos-u-registar');
    redci.push([o.identifikacijskiBroj, o.ime, o.prezime, s.ciklus.godina, ocjena.naziv, ocjena.bodovi, odluka?.datum ?? '', unos?.datum ?? ''].map(polje).join(';'));
  }
  await zabiljezi(locals.okruzenje.db, { racunId: korisnik.racunId, radnja: 'izvoz.registar', predmetVrsta: 'ciklus', predmetId: s.ciklus.id, poslije: { redaka: redci.length - 1 } });
  return new Response('﻿' + redci.join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="odluke-${s.ciklus.godina}.csv"` },
  });
};
