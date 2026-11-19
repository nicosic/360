// Slanje e-pošte iza jednog sučelja. Pružatelj za produkciju još nije odabran
// (mora imati sjedište i obradu u EU); do tada postoji samo razvojna izvedba.
export interface Poruka {
  prima: string;
  predmet: string;
  tekst: string;
}

export interface PosiljateljEposte {
  posalji(poruka: Poruka): Promise<void>;
}

/** Razvojna izvedba: poruku ispisuje u zapis rada. Dopuštena samo na lokalnoj instanci. */
export class EpostaUKonzolu implements PosiljateljEposte {
  async posalji(poruka: Poruka): Promise<void> {
    console.log(`[e-pošta] prima: ${poruka.prima}\n  predmet: ${poruka.predmet}\n  ${poruka.tekst}`);
  }
}

export function odaberiPosiljatelja(nacin: string | undefined, instanca: string): PosiljateljEposte {
  if (nacin === 'konzola') {
    if (instanca !== 'lokalno') {
      throw new Error('EPOSTA_NACIN=konzola dopušten je samo na lokalnoj instanci');
    }
    return new EpostaUKonzolu();
  }
  throw new Error(`Nepoznat EPOSTA_NACIN: ${nacin ?? '(nije postavljen)'}`);
}
