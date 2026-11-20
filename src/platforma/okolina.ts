// Jedino mjesto na kojem jezgra dodiruje Cloudflare: veze na bazu i spremište te tajne instance.
// Sve ostalo prima `Okruzenje` kao podatak, pa se može pokrenuti i testirati izvan Workersa.
import { env } from 'cloudflare:workers';
import { otvoriBazu } from '../db/baza';
import { odaberiPosiljatelja } from '../lib/eposta';
import { ucitajKljucInstance } from '../lib/kripto';
import type { Okruzenje } from '../lib/prijava/prijava';

export function stvoriOkruzenje(): Okruzenje {
  return {
    db: otvoriBazu(env.DB),
    kljuc: ucitajKljucInstance(env.KLJUC_INSTANCE),
    eposta: odaberiPosiljatelja(env.EPOSTA_NACIN, env.INSTANCA, ispitna()),
    instanca: env.INSTANCA,
    // Stalni kod vrijedi samo ako je instanca označena kao ispitna.
    ispitniKod: (ispitna() && (env.ISPITNI_KOD as string)) || undefined,
  };
}

/** Ispitna instanca: bez stvarnih podataka, uz razvojne iznimke. */
export function ispitna(): boolean {
  return (env.ISPITNA as string) === 'da';
}

export function verzija(): string {
  return env.VERZIJA;
}

export function spremisteDokumenata(): R2Bucket {
  return env.DOKUMENTI;
}
