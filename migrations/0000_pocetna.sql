CREATE TABLE `jedinica` (
	`id` text PRIMARY KEY NOT NULL,
	`naziv` text NOT NULL,
	`nadredena_id` text,
	`vrijedi_od` text NOT NULL,
	`vrijedi_do` text
);
--> statement-breakpoint
CREATE INDEX `jedinica_nadredena` ON `jedinica` (`nadredena_id`);--> statement-breakpoint
CREATE TABLE `jednokratni_kod` (
	`id` text PRIMARY KEY NOT NULL,
	`racun_id` text NOT NULL,
	`sazetak` text NOT NULL,
	`istice` text NOT NULL,
	`pokusaja` integer DEFAULT 0 NOT NULL,
	`iskoristen_u` text,
	`stvoreno` text NOT NULL,
	FOREIGN KEY (`racun_id`) REFERENCES `racun`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `jednokratni_kod_racun` ON `jednokratni_kod` (`racun_id`,`stvoreno`);--> statement-breakpoint
CREATE TABLE `odsutnost` (
	`id` text PRIMARY KEY NOT NULL,
	`osoba_id` text NOT NULL,
	`osnova` text NOT NULL,
	`od` text NOT NULL,
	`do` text,
	FOREIGN KEY (`osoba_id`) REFERENCES `osoba`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `odsutnost_osoba` ON `odsutnost` (`osoba_id`,`od`);--> statement-breakpoint
CREATE TABLE `osoba` (
	`id` text PRIMARY KEY NOT NULL,
	`ime` text NOT NULL,
	`prezime` text NOT NULL,
	`identifikacijski_broj` text,
	`stvoreno` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `osoba_identifikacijski_broj` ON `osoba` (`identifikacijski_broj`);--> statement-breakpoint
CREATE TABLE `pokusaj_prijave` (
	`id` text PRIMARY KEY NOT NULL,
	`kljuc` text NOT NULL,
	`vrijeme` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pokusaj_prijave_kljuc` ON `pokusaj_prijave` (`kljuc`,`vrijeme`);--> statement-breakpoint
CREATE TABLE `racun` (
	`id` text PRIMARY KEY NOT NULL,
	`osoba_id` text,
	`eposta` text NOT NULL,
	`stanje` text NOT NULL,
	`totp_tajna_sifrirano` text,
	`totp_potvrden_u` text,
	`totp_zadnji_korak` integer,
	`stvoreno` text NOT NULL,
	FOREIGN KEY (`osoba_id`) REFERENCES `osoba`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `racun_eposta` ON `racun` (`eposta`);--> statement-breakpoint
CREATE TABLE `raspored` (
	`id` text PRIMARY KEY NOT NULL,
	`osoba_id` text NOT NULL,
	`jedinica_id` text NOT NULL,
	`radno_mjesto` text NOT NULL,
	`skupina_radnog_mjesta` text,
	`nadredeni_osoba_id` text,
	`radno_vrijeme_sati` real,
	`vrijedi_od` text NOT NULL,
	`vrijedi_do` text,
	FOREIGN KEY (`osoba_id`) REFERENCES `osoba`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`jedinica_id`) REFERENCES `jedinica`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`nadredeni_osoba_id`) REFERENCES `osoba`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `raspored_osoba` ON `raspored` (`osoba_id`,`vrijedi_od`);--> statement-breakpoint
CREATE INDEX `raspored_nadredeni` ON `raspored` (`nadredeni_osoba_id`,`vrijedi_od`);--> statement-breakpoint
CREATE TABLE `revizija` (
	`rb` integer PRIMARY KEY NOT NULL,
	`vrijeme` text NOT NULL,
	`racun_id` text,
	`radnja` text NOT NULL,
	`predmet_vrsta` text,
	`predmet_id` text,
	`prije` text,
	`poslije` text,
	`zbroj_prethodnog` text NOT NULL,
	`zbroj` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sjednica_prijave` (
	`id` text PRIMARY KEY NOT NULL,
	`racun_id` text NOT NULL,
	`sazetak_tokena` text NOT NULL,
	`razina` text NOT NULL,
	`stvoreno` text NOT NULL,
	`zadnja_aktivnost` text NOT NULL,
	`istice` text NOT NULL,
	`opozvana_u` text,
	FOREIGN KEY (`racun_id`) REFERENCES `racun`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sjednica_prijave_token` ON `sjednica_prijave` (`sazetak_tokena`);--> statement-breakpoint
CREATE INDEX `sjednica_prijave_racun` ON `sjednica_prijave` (`racun_id`);--> statement-breakpoint
CREATE TABLE `uloga` (
	`id` text PRIMARY KEY NOT NULL,
	`racun_id` text NOT NULL,
	`uloga` text NOT NULL,
	`opseg` text,
	`vrijedi_od` text NOT NULL,
	`vrijedi_do` text,
	FOREIGN KEY (`racun_id`) REFERENCES `racun`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `uloga_racun` ON `uloga` (`racun_id`);--> statement-breakpoint
CREATE TABLE `ustanova` (
	`id` text PRIMARY KEY NOT NULL,
	`naziv` text NOT NULL,
	`vrsta` text NOT NULL,
	`nadlezno_tijelo` text,
	`stvoreno` text NOT NULL
);
