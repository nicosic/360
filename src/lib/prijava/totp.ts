// Jednokratni kodovi iz aplikacije (TOTP, RFC 6238): SHA-1, 6 znamenki, korak 30 sekundi.
const ABECEDA32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const KORAK_SEKUNDI = 30;
const ZNAMENKI = 6;

export function uBase32(bajtovi: Uint8Array): string {
  let bitovi = 0;
  let vrijednost = 0;
  let izlaz = '';
  for (const b of bajtovi) {
    vrijednost = (vrijednost << 8) | b;
    bitovi += 8;
    while (bitovi >= 5) {
      izlaz += ABECEDA32[(vrijednost >>> (bitovi - 5)) & 31];
      bitovi -= 5;
    }
  }
  if (bitovi > 0) izlaz += ABECEDA32[(vrijednost << (5 - bitovi)) & 31];
  return izlaz;
}

export function izBase32(tekst: string): Uint8Array<ArrayBuffer> {
  const cisto = tekst.toUpperCase().replace(/[\s=-]/g, '');
  const izlaz: number[] = [];
  let bitovi = 0;
  let vrijednost = 0;
  for (const znak of cisto) {
    const indeks = ABECEDA32.indexOf(znak);
    if (indeks < 0) throw new Error('neispravan base32');
    vrijednost = (vrijednost << 5) | indeks;
    bitovi += 5;
    if (bitovi >= 8) {
      izlaz.push((vrijednost >>> (bitovi - 8)) & 255);
      bitovi -= 8;
    }
  }
  return Uint8Array.from(izlaz);
}

export function novaTajna(): string {
  return uBase32(crypto.getRandomValues(new Uint8Array(20)));
}

export function vremenskiKorak(sada: Date): number {
  return Math.floor(sada.getTime() / 1000 / KORAK_SEKUNDI);
}

export async function kodZaKorak(tajnaBase32: string, korak: number): Promise<string> {
  const brojac = new ArrayBuffer(8);
  const pogled = new DataView(brojac);
  pogled.setUint32(0, Math.floor(korak / 2 ** 32));
  pogled.setUint32(4, korak >>> 0);
  const kljuc = await crypto.subtle.importKey('raw', izBase32(tajnaBase32), { name: 'HMAC', hash: 'SHA-1' }, false, [
    'sign',
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', kljuc, brojac));
  const pomak = mac[mac.length - 1]! & 15;
  const broj =
    ((mac[pomak]! & 127) << 24) | (mac[pomak + 1]! << 16) | (mac[pomak + 2]! << 8) | mac[pomak + 3]!;
  return String(broj % 10 ** ZNAMENKI).padStart(ZNAMENKI, '0');
}

/**
 * Provjerava kod uz dopušteno odstupanje sata od jednog koraka u oba smjera.
 * Vraća korak na kojem je kod prihvaćen ili null. Korak koji nije veći od zadnjeg
 * iskorištenog se odbija, pa isti kod ne vrijedi dvaput.
 */
export async function provjeriKod(
  tajnaBase32: string,
  kod: string,
  sada: Date,
  zadnjiIskoristeniKorak: number | null,
): Promise<number | null> {
  const cisto = kod.replace(/\s/g, '');
  if (!/^\d{6}$/.test(cisto)) return null;
  const trenutni = vremenskiKorak(sada);
  let prihvacen: number | null = null;
  for (const korak of [trenutni - 1, trenutni, trenutni + 1]) {
    const ocekivani = await kodZaKorak(tajnaBase32, korak);
    let razlika = 0;
    for (let i = 0; i < ZNAMENKI; i++) razlika |= ocekivani.charCodeAt(i) ^ cisto.charCodeAt(i);
    if (razlika === 0 && (zadnjiIskoristeniKorak === null || korak > zadnjiIskoristeniKorak)) prihvacen = korak;
  }
  return prihvacen;
}

export function adresaZaAplikaciju(tajnaBase32: string, racun: string, izdavatelj: string): string {
  const oznaka = encodeURIComponent(`${izdavatelj}:${racun}`);
  return `otpauth://totp/${oznaka}?secret=${tajnaBase32}&issuer=${encodeURIComponent(izdavatelj)}&algorithm=SHA1&digits=6&period=30`;
}
