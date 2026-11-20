import { defineMiddleware } from 'astro:middleware';
import { ucitajKorisnika } from './lib/korisnik';
import { imeKolacica } from './lib/prijava/kolacic';
import { ucitajSjednicu } from './lib/prijava/sjednica';
import { ispitna, stvoriOkruzenje, verzija } from './platforma/okolina';

const JAVNE = new Set(['/prijava', '/prijava/kod']);
const PRVI_FAKTOR = new Set(['/prijava/drugi-faktor', '/odjava']);

const ZAGLAVLJA: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
};

export const onRequest = defineMiddleware(async (kontekst, dalje) => {
  const put = kontekst.url.pathname.replace(/\/$/, '') || '/';
  const okruzenje = stvoriOkruzenje();
  kontekst.locals.okruzenje = okruzenje;
  kontekst.locals.verzija = verzija();
  kontekst.locals.ispitna = ispitna();

  const token = kontekst.cookies.get(imeKolacica(kontekst.url))?.value;
  const sjednica = await ucitajSjednicu(okruzenje.db, token, new Date());
  kontekst.locals.sjednica = sjednica;
  kontekst.locals.korisnik = sjednica?.razina === 'potpuna' ? await ucitajKorisnika(okruzenje.db, sjednica.racunId, new Date()) : null;

  let odgovor: Response;
  if (JAVNE.has(put)) {
    odgovor = sjednica?.razina === 'potpuna' ? kontekst.redirect('/') : await dalje();
  } else if (!sjednica) {
    odgovor = kontekst.redirect('/prijava');
  } else if (sjednica.razina !== 'potpuna' && !PRVI_FAKTOR.has(put)) {
    odgovor = kontekst.redirect('/prijava/drugi-faktor');
  } else {
    odgovor = await dalje();
  }

  for (const [ime, vrijednost] of Object.entries(ZAGLAVLJA)) odgovor.headers.set(ime, vrijednost);
  if (kontekst.url.protocol === 'https:') {
    odgovor.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return odgovor;
});
