// Kriptografske pomoćne funkcije; samo Web Crypto, pa rade i na Workersima i u Nodeu.
const kodiranje = new TextEncoder();
const dekodiranje = new TextDecoder();

export function uHeks(bajtovi: ArrayBuffer | Uint8Array): string {
  const polje = bajtovi instanceof Uint8Array ? bajtovi : new Uint8Array(bajtovi);
  return Array.from(polje, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function uBase64Url(bajtovi: Uint8Array): string {
  let binarno = '';
  for (const b of bajtovi) binarno += String.fromCharCode(b);
  return btoa(binarno).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function izBase64(tekst: string): Uint8Array<ArrayBuffer> {
  const normalizirano = tekst.replace(/-/g, '+').replace(/_/g, '/');
  const binarno = atob(normalizirano);
  return Uint8Array.from(binarno, (z) => z.charCodeAt(0));
}

export async function sha256Heks(tekst: string): Promise<string> {
  return uHeks(await crypto.subtle.digest('SHA-256', kodiranje.encode(tekst)));
}

export function nasumicniToken(bajtova = 32): string {
  return uBase64Url(crypto.getRandomValues(new Uint8Array(bajtova)));
}

/** Usporedba koja ne otkriva na kojem se znaku tekstovi razlikuju. */
export function jednako(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let razlika = 0;
  for (let i = 0; i < a.length; i++) razlika |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return razlika === 0;
}

/** Ključ instance: 32 bajta u base64. Iz njega se izvode ključevi po namjeni. */
export type Bajtovi = Uint8Array<ArrayBuffer>;

export function ucitajKljucInstance(base64: string | undefined): Bajtovi {
  if (!base64) throw new Error('KLJUC_INSTANCE nije postavljen');
  const bajtovi = izBase64(base64.trim());
  if (bajtovi.length !== 32) throw new Error('KLJUC_INSTANCE mora imati 32 bajta (base64)');
  return bajtovi;
}

async function izvedi(kljucInstance: Bajtovi, namjena: string): Promise<ArrayBuffer> {
  const osnovni = await crypto.subtle.importKey('raw', kljucInstance, 'HKDF', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: kodiranje.encode(namjena) },
    osnovni,
    256,
  );
}

export async function hmacHeks(kljucInstance: Bajtovi, namjena: string, poruka: string): Promise<string> {
  const kljuc = await crypto.subtle.importKey(
    'raw',
    await izvedi(kljucInstance, `hmac:${namjena}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return uHeks(await crypto.subtle.sign('HMAC', kljuc, kodiranje.encode(poruka)));
}

async function kljucZaSifriranje(kljucInstance: Bajtovi, namjena: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', await izvedi(kljucInstance, `aes:${namjena}`), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

/** AES-GCM; rezultat je base64url(iv || šifrat). */
export async function sifriraj(kljucInstance: Bajtovi, namjena: string, tekst: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sifrat = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await kljucZaSifriranje(kljucInstance, namjena),
      kodiranje.encode(tekst),
    ),
  );
  const sve = new Uint8Array(iv.length + sifrat.length);
  sve.set(iv);
  sve.set(sifrat, iv.length);
  return uBase64Url(sve);
}

export async function desifriraj(kljucInstance: Bajtovi, namjena: string, zapis: string): Promise<string> {
  const sve = izBase64(zapis);
  const cisto = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: sve.slice(0, 12) },
    await kljucZaSifriranje(kljucInstance, namjena),
    sve.slice(12),
  );
  return dekodiranje.decode(cisto);
}
