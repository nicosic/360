import type { APIRoute } from 'astro';
import { obrisiKolacic } from '../lib/prijava/kolacic';
import { odjavi } from '../lib/prijava/prijava';

export const POST: APIRoute = async ({ locals, cookies, url, redirect }) => {
  if (locals.sjednica) await odjavi(locals.okruzenje, locals.sjednica, new Date());
  obrisiKolacic(cookies, url);
  return redirect('/prijava');
};
