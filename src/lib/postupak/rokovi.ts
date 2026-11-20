// Rokovi su datumi (YYYY-MM-DD) izvedeni iz godine ciklusa ili iz datuma drugog koraka.
// Dani se broje kalendarski; propis ne određuje drukčije, pa je to otvoreno pitanje iz specifikacije.
import type { Rok } from '../../paketi/tipovi';

export function danas(sada: Date): string {
  return sada.toISOString().slice(0, 10);
}

export function dodajDane(datum: string, dana: number): string {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dana);
  return d.toISOString().slice(0, 10);
}

const dvije = (n: number) => String(n).padStart(2, '0');

export function datumUGodini(godina: number, mjesec: number, dan: number): string {
  return `${godina}-${dvije(mjesec)}-${dvije(dan)}`;
}

/** Vraća rok ili null ako ovisi o koraku koji još nije završen. */
export function izracunajRok(rok: Rok | undefined, godina: number, datumKoraka: (kljuc: string) => string | null): string | null {
  if (!rok) return null;
  switch (rok.vrsta) {
    case 'datum':
      return datumUGodini(godina + rok.godinaPomak, rok.mjesec, rok.dan);
    case 'kraj-mjeseca': {
      const zadnji = new Date(Date.UTC(godina + rok.godinaPomak, rok.mjesec, 0)).getUTCDate();
      return datumUGodini(godina + rok.godinaPomak, rok.mjesec, zadnji);
    }
    case 'od-koraka': {
      const od = datumKoraka(rok.korak);
      return od ? dodajDane(od, rok.dana) : null;
    }
  }
}

export function danaUGodini(godina: number): number {
  return (Date.UTC(godina + 1, 0, 1) - Date.UTC(godina, 0, 1)) / 86_400_000;
}

/** Broj dana koje razdoblje [od, do] (do uključivo; null = bez kraja) ima unutar godine. */
export function danaUnutarGodine(od: string, doDatuma: string | null, godina: number): number {
  const pocetak = Math.max(Date.parse(`${od}T00:00:00Z`), Date.UTC(godina, 0, 1));
  const kraj = Math.min(doDatuma ? Date.parse(`${doDatuma}T00:00:00Z`) : Infinity, Date.UTC(godina, 11, 31));
  return kraj < pocetak ? 0 : Math.round((kraj - pocetak) / 86_400_000) + 1;
}
