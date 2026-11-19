import { describe, expect, it } from 'vitest';
import { izBase32, kodZaKorak, provjeriKod, uBase32, vremenskiKorak } from '../src/lib/prijava/totp';

// Tajna iz RFC 6238, dodatak B: ASCII "12345678901234567890".
const TAJNA = uBase32(new TextEncoder().encode('12345678901234567890'));

describe('TOTP', () => {
  it('daje kodove iz RFC 6238 (SHA-1, zadnjih 6 znamenki)', async () => {
    const primjeri: [number, string][] = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
      [20000000000, '353130'],
    ];
    for (const [sekunde, kod] of primjeri) {
      expect(await kodZaKorak(TAJNA, vremenskiKorak(new Date(sekunde * 1000)))).toBe(kod);
    }
  });

  it('base32 se vraća u iste bajtove', () => {
    const bajtovi = crypto.getRandomValues(new Uint8Array(20));
    expect(Array.from(izBase32(uBase32(bajtovi)))).toEqual(Array.from(bajtovi));
  });

  it('prihvaća susjedni korak, odbija udaljeni i već iskorišteni', async () => {
    const sada = new Date(1111111111 * 1000);
    const korak = vremenskiKorak(sada);
    expect(await provjeriKod(TAJNA, '050471', sada, null)).toBe(korak);
    expect(await provjeriKod(TAJNA, await kodZaKorak(TAJNA, korak - 1), sada, null)).toBe(korak - 1);
    expect(await provjeriKod(TAJNA, await kodZaKorak(TAJNA, korak - 2), sada, null)).toBeNull();
    expect(await provjeriKod(TAJNA, '050471', sada, korak)).toBeNull();
    expect(await provjeriKod(TAJNA, 'abcdef', sada, null)).toBeNull();
  });
});
