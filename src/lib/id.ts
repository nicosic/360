// Vremenski poredivi tekstualni ključevi: 10 znakova vremena + 16 nasumičnih (Crockford base32).
const ABECEDA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function noviId(sada: Date = new Date()): string {
  let vrijeme = sada.getTime();
  let prefiks = '';
  for (let i = 0; i < 10; i++) {
    prefiks = ABECEDA[vrijeme % 32] + prefiks;
    vrijeme = Math.floor(vrijeme / 32);
  }
  const bajtovi = crypto.getRandomValues(new Uint8Array(16));
  let sufiks = '';
  for (const b of bajtovi) sufiks += ABECEDA[b % 32];
  return prefiks + sufiks;
}
