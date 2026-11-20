// Oblik paketa pravila i postavki kupca. Paket opisuje jedan propisani postupak podacima;
// jezgra ga učitava, provjerava i izvršava. Svaki element nosi izvor (propis i članak).
import { z } from 'zod';

const kljuc = z.string().regex(/^[a-z][a-z0-9-]*$/);

export const IzvorS = z.object({ propis: z.string().min(1), clanak: z.string().min(1) });

export const OcjenaS = z.object({
  kljuc,
  naziv: z.string(),
  /** Veći rang je bolja ocjena. */
  rang: z.number().int(),
  /** Bodovi za godinu u kojoj je ocjena dobivena. */
  bodovi: z.number().int().nonnegative(),
});

export const KriterijS = z.object({
  kljuc,
  naziv: z.string(),
  opis: z.string().optional(),
  skupina: kljuc,
  izvor: IzvorS,
});

export const RokS = z.discriminatedUnion('vrsta', [
  /** Datum u godini ciklusa pomaknutoj za `godinaPomak`. */
  z.object({ vrsta: z.literal('datum'), mjesec: z.number().int().min(1).max(12), dan: z.number().int().min(1).max(31), godinaPomak: z.number().int() }),
  z.object({ vrsta: z.literal('kraj-mjeseca'), mjesec: z.number().int().min(1).max(12), godinaPomak: z.number().int() }),
  /** Broj dana od datuma kojim je završio drugi korak. */
  z.object({ vrsta: z.literal('od-koraka'), korak: kljuc, dana: z.number().int().positive() }),
]);

export const UvjetS = z.discriminatedUnion('vrsta', [
  /** Korak postoji samo ako je ishod drugog koraka jedna od navedenih ocjena. */
  z.object({ vrsta: z.literal('ocjena-medu'), korak: kljuc, ocjene: z.array(kljuc).min(1) }),
  /** Korak postoji samo ako se ocjene dvaju koraka razlikuju. */
  z.object({ vrsta: z.literal('razlikuje-se'), korak: kljuc, od: kljuc }),
]);

export const VRSTE_KORAKA = [
  'obrazac',
  'prijedlog',
  'uvid',
  'odgovor-u-roku',
  'odluka-tijela',
  'odluka-pojedinca',
  'dostava',
  'vanjska-radnja',
] as const;

export const IzvrsiteljS = z.union([
  z.enum(['zaposlenik', 'nadredeni', 'odlucitelj', 'kadrovska']),
  z.string().regex(/^tijelo:[a-z][a-z0-9-]*$/),
]);

export const KorakS = z.object({
  kljuc,
  naziv: z.string(),
  vrsta: z.enum(VRSTE_KORAKA),
  izvrsitelj: IzvrsiteljS,
  rok: RokS.optional(),
  /** Neobavezan korak završava i izričitim odustajanjem ili istekom roka. */
  neobavezno: z.boolean().default(false),
  uvjet: UvjetS.optional(),
  izvor: IzvorS,
});

export const TijeloS = z.object({
  kljuc,
  naziv: z.string(),
  najmanjeClanova: z.number().int().positive(),
  neparanBroj: z.boolean(),
  predstavnikRadnika: z.boolean(),
  izvor: IzvorS,
});

export const PaketS = z
  .object({
    oznaka: kljuc,
    verzija: z.string().regex(/^\d+\.\d+\.\d+$/),
    naziv: z.string(),
    propisi: z.array(z.object({ oznaka: z.string(), naziv: z.string() })).min(1),
    ocjene: z.array(OcjenaS).min(2),
    kriteriji: z.array(KriterijS),
    /** Skupine kriterija koje se primjenjuju na sve zaposlenike. */
    skupineZaSve: z.array(kljuc),
    koraci: z.array(KorakS).min(1),
    tijela: z.array(TijeloS),
    kvote: z.array(z.object({ ocjena: kljuc, udio: z.number().positive().max(1), izvor: IzvorS })),
    /** Dan u ocjenjivanoj godini na koji se broje zaposleni za kvote. */
    kvotaDan: z.object({ mjesec: z.number().int(), dan: z.number().int(), izvor: IzvorS }),
    /** Najniža ocjena traži pisano upozorenje najkasnije do zadanog dana ocjenjivane godine. */
    upozorenje: z.object({ ocjena: kljuc, najkasnije: z.object({ mjesec: z.number().int(), dan: z.number().int() }), izvor: IzvorS }),
    /** Tko je radio manje od zadanog broja mjeseci, ne ocjenjuje se. */
    pravoNaOcjenu: z.object({ najmanjeMjeseci: z.number().int().positive(), izvor: IzvorS }),
    /** Odsutnost po navedenim osnovama dulja od zadanog broja mjeseci daje ocjenu po propisu. */
    odsutnost: z.object({ osnove: z.array(kljuc), duzeOdMjeseci: z.number().int().positive(), ocjena: kljuc, izvor: IzvorS }),
    /** Korak čiji ishod (uz obvezujuće mišljenje, ako postoji) određuje ocjenu u odluci. */
    odluka: z.object({ korak: kljuc, temelj: z.array(kljuc).min(1), izvor: IzvorS }),
  })
  .superRefine((p, ctx) => {
    const ocjene = new Set(p.ocjene.map((o) => o.kljuc));
    const koraci = new Set<string>();
    const tijela = new Set(p.tijela.map((t) => t.kljuc));
    const greska = (message: string) => ctx.addIssue({ code: 'custom', message });
    for (const k of p.koraci) {
      if (koraci.has(k.kljuc)) greska(`korak '${k.kljuc}' naveden je dvaput`);
      if (k.izvrsitelj.startsWith('tijelo:') && !tijela.has(k.izvrsitelj.slice(7))) greska(`korak '${k.kljuc}': nepoznato tijelo`);
      if (k.rok?.vrsta === 'od-koraka' && !koraci.has(k.rok.korak)) greska(`korak '${k.kljuc}': rok se poziva na kasniji ili nepostojeći korak`);
      if (k.uvjet && !koraci.has(k.uvjet.korak)) greska(`korak '${k.kljuc}': uvjet se poziva na kasniji ili nepostojeći korak`);
      if (k.uvjet?.vrsta === 'razlikuje-se' && !koraci.has(k.uvjet.od)) greska(`korak '${k.kljuc}': uvjet se poziva na nepostojeći korak`);
      if (k.uvjet?.vrsta === 'ocjena-medu') for (const o of k.uvjet.ocjene) if (!ocjene.has(o)) greska(`korak '${k.kljuc}': nepoznata ocjena '${o}'`);
      if (k.neobavezno && !k.rok) greska(`korak '${k.kljuc}': neobavezan korak mora imati rok`);
      koraci.add(k.kljuc);
    }
    for (const q of p.kvote) if (!ocjene.has(q.ocjena)) greska(`kvota: nepoznata ocjena '${q.ocjena}'`);
    for (const o of [p.upozorenje.ocjena, p.odsutnost.ocjena]) if (!ocjene.has(o)) greska(`nepoznata ocjena '${o}'`);
    if (!koraci.has(p.odluka.korak)) greska('odluka: nepoznat korak');
    for (const t of p.odluka.temelj) if (!koraci.has(t)) greska(`odluka: nepoznat korak temelja '${t}'`);
    const skupine = new Set(p.kriteriji.map((k) => k.skupina));
    for (const s of p.skupineZaSve) if (!skupine.has(s)) greska(`skupina '${s}' nema kriterija`);
  });

export type Paket = z.infer<typeof PaketS>;
export type Korak = z.infer<typeof KorakS>;
export type Rok = z.infer<typeof RokS>;

// ---------- Postavke kupca: vrijednosti koje paket ostavlja otvorenima ----------

export const PostavkeS = z.object({
  /** Naziv i broj objave pravilnika ili pisana potvrda kupca da pravilnika nema. */
  temelj: z.object({ pravilnik: z.string().optional(), potvrdaKupca: z.string().optional() }),
  posebniKriteriji: z.array(z.object({ kljuc, naziv: z.string().min(1), opis: z.string().optional() })).default([]),
  /** Broj članova po tijelu; provjerava se prema najmanjem sastavu iz paketa. */
  tijela: z.record(kljuc, z.object({ clanova: z.number().int().positive() })),
  /** Propis ne određuje zaokruživanje kvota; kupac ga bira, a zadano je bez zaokruživanja. */
  zaokruzivanjeKvota: z.enum(['bez', 'nadolje', 'najblize', 'nagore']).default('bez'),
});
export type Postavke = z.infer<typeof PostavkeS>;

/** Provjerava postavke prema ograničenjima paketa; vraća popis grešaka (prazan ako ih nema). */
export function provjeriPostavke(paket: Paket, postavke: Postavke): string[] {
  const greske: string[] = [];
  const zauzeti = new Set(paket.kriteriji.map((k) => k.kljuc));
  for (const k of postavke.posebniKriteriji) {
    if (zauzeti.has(k.kljuc)) greske.push(`Kriterij '${k.kljuc}' već postoji.`);
    zauzeti.add(k.kljuc);
  }
  for (const t of paket.tijela) {
    const n = postavke.tijela[t.kljuc]?.clanova;
    if (n === undefined) greske.push(`${t.naziv}: nije zadan broj članova.`);
    else {
      if (n < t.najmanjeClanova) greske.push(`${t.naziv}: najmanje ${t.najmanjeClanova} članova (${t.izvor.clanak}).`);
      if (t.neparanBroj && n % 2 === 0) greske.push(`${t.naziv}: broj članova mora biti neparan (${t.izvor.clanak}).`);
    }
  }
  return greske;
}

export function zadanePostavke(paket: Paket): Postavke {
  return {
    temelj: {},
    posebniKriteriji: [],
    tijela: Object.fromEntries(paket.tijela.map((t) => [t.kljuc, { clanova: t.najmanjeClanova }])),
    zaokruzivanjeKvota: 'bez',
  };
}
