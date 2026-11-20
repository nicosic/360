// Zajedničko rukovanje greškama obrazaca na stranicama.
import { ZodError } from 'zod';
import { GreskaPostupka } from './postupak/stroj';

/** Izvršava radnju i vraća poruku greške za prikaz, ili null ako je uspjela. */
export async function pokusaj(radnja: () => Promise<unknown>): Promise<string | null> {
  try {
    await radnja();
    return null;
  } catch (greska) {
    if (greska instanceof GreskaPostupka) return greska.message;
    if (greska instanceof ZodError) return 'Unos nije potpun ili nije ispravan. Provjerite obvezna polja i datume.';
    throw greska;
  }
}
