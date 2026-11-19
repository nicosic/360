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
    eposta: odaberiPosiljatelja(env.EPOSTA_NACIN, env.INSTANCA),
    instanca: env.INSTANCA,
  };
}

export function verzija(): string {
  return env.VERZIJA;
}

export function spremisteDokumenata(): R2Bucket {
  return env.DOKUMENTI;
}
