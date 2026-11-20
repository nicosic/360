import { javneSluzbe } from './javne-sluzbe';
import type { Paket } from './tipovi';

const PAKETI: Paket[] = [javneSluzbe];

export function sviPaketi(): Paket[] {
  return PAKETI;
}

export function ucitajPaket(oznaka: string, verzija: string): Paket {
  const paket = PAKETI.find((p) => p.oznaka === oznaka && p.verzija === verzija);
  if (!paket) throw new Error(`Paket pravila ${oznaka}@${verzija} nije dostupan u ovoj verziji koda.`);
  return paket;
}
