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

/** Razvojna izvedba: poruku ispisuje u zapis rada. Dopuštena samo lokalno i na ispitnoj instanci. */
export class EpostaUKonzolu implements PosiljateljEposte {
  async posalji(poruka: Poruka): Promise<void> {
    console.log(`[e-pošta] prima: ${poruka.prima}\n  predmet: ${poruka.predmet}\n  ${poruka.tekst}`);
  }
}

export function odaberiPosiljatelja(
  nacin: string | undefined,
  instanca: string,
  ispitna = false,
): PosiljateljEposte {
  if (nacin === 'konzola') {
    // Tko može čitati zapis rada, može se prijaviti kao bilo tko. Zato samo bez stvarnih podataka.
    if (instanca !== 'lokalno' && !ispitna) {
      throw new Error('EPOSTA_NACIN=konzola dopušten je samo lokalno i na ispitnoj instanci');
    }
    return new EpostaUKonzolu();
  }
  throw new Error(`Nepoznat EPOSTA_NACIN: ${nacin ?? '(nije postavljen)'}`);
}
