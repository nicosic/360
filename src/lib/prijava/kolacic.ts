import type { AstroCookies } from 'astro';
import { NAJDULJE_SATI } from './sjednica';

// Prefiks __Host- traži sigurnu vezu; lokalno (http) se koristi ime bez prefiksa.
export function imeKolacica(url: URL): string {
  return url.protocol === 'https:' ? '__Host-p360' : 'p360';
}

export function postaviKolacic(kolacici: AstroCookies, url: URL, token: string): void {
  kolacici.set(imeKolacica(url), token, {
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: NAJDULJE_SATI * 3600,
  });
}

export function obrisiKolacic(kolacici: AstroCookies, url: URL): void {
  kolacici.delete(imeKolacica(url), { path: '/' });
}
