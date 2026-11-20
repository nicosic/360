CREATE TABLE `bodovi` (
	`id` text PRIMARY KEY NOT NULL,
	`osoba_id` text NOT NULL,
	`godina` integer NOT NULL,
	`bodovi` integer NOT NULL,
	`izvor` text NOT NULL,
	`predmet_id` text,
	`stvoreno` text NOT NULL,
	FOREIGN KEY (`osoba_id`) REFERENCES `osoba`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`predmet_id`) REFERENCES `predmet`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bodovi_osoba_godina` ON `bodovi` (`osoba_id`,`godina`);--> statement-breakpoint
CREATE TABLE `ciklus` (
	`id` text PRIMARY KEY NOT NULL,
	`godina` integer NOT NULL,
	`paket` text NOT NULL,
	`paket_verzija` text NOT NULL,
	`postavke_id` text NOT NULL,
	`stanje` text NOT NULL,
	`otvoreno` text NOT NULL,
	FOREIGN KEY (`postavke_id`) REFERENCES `postavke`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ciklus_godina` ON `ciklus` (`godina`);--> statement-breakpoint
CREATE TABLE `clan_tijela` (
	`id` text PRIMARY KEY NOT NULL,
	`tijelo_id` text NOT NULL,
	`osoba_id` text NOT NULL,
	`predstavnik_radnika` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`tijelo_id`) REFERENCES `tijelo`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`osoba_id`) REFERENCES `osoba`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clan_tijela_osoba` ON `clan_tijela` (`tijelo_id`,`osoba_id`);--> statement-breakpoint
CREATE TABLE `glas` (
	`id` text PRIMARY KEY NOT NULL,
	`predmet_id` text NOT NULL,
	`korak_kljuc` text NOT NULL,
	`osoba_id` text NOT NULL,
	`ocjena` text NOT NULL,
	`vrijeme` text NOT NULL,
	FOREIGN KEY (`predmet_id`) REFERENCES `predmet`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`osoba_id`) REFERENCES `osoba`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `glas_predmet_korak_osoba` ON `glas` (`predmet_id`,`korak_kljuc`,`osoba_id`);--> statement-breakpoint
CREATE TABLE `korak` (
	`id` text PRIMARY KEY NOT NULL,
	`predmet_id` text NOT NULL,
	`kljuc` text NOT NULL,
	`stanje` text NOT NULL,
	`datum` text NOT NULL,
	`ishod` text NOT NULL,
	`izvrsio_racun_id` text,
	`u_ime` integer DEFAULT false NOT NULL,
	`zavrseno_u` text NOT NULL,
	FOREIGN KEY (`predmet_id`) REFERENCES `predmet`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`izvrsio_racun_id`) REFERENCES `racun`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `korak_predmet_kljuc` ON `korak` (`predmet_id`,`kljuc`);--> statement-breakpoint
CREATE TABLE `postavke` (
	`id` text PRIMARY KEY NOT NULL,
	`paket` text NOT NULL,
	`sadrzaj` text NOT NULL,
	`zakljucano_u` text,
	`stvoreno` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `predmet` (
	`id` text PRIMARY KEY NOT NULL,
	`ciklus_id` text NOT NULL,
	`osoba_id` text NOT NULL,
	`nadredeni_osoba_id` text,
	`stanje` text NOT NULL,
	`razlog` text,
	`ocjena_po_propisu` text,
	`konacna_ocjena` text,
	`otvoreno` text NOT NULL,
	FOREIGN KEY (`ciklus_id`) REFERENCES `ciklus`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`osoba_id`) REFERENCES `osoba`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`nadredeni_osoba_id`) REFERENCES `osoba`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `predmet_ciklus_osoba` ON `predmet` (`ciklus_id`,`osoba_id`);--> statement-breakpoint
CREATE INDEX `predmet_nadredeni` ON `predmet` (`nadredeni_osoba_id`);--> statement-breakpoint
CREATE TABLE `tijelo` (
	`id` text PRIMARY KEY NOT NULL,
	`ciklus_id` text NOT NULL,
	`vrsta` text NOT NULL,
	`imenovano_u` text,
	FOREIGN KEY (`ciklus_id`) REFERENCES `ciklus`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tijelo_ciklus_vrsta` ON `tijelo` (`ciklus_id`,`vrsta`);--> statement-breakpoint
CREATE TABLE `zapis` (
	`id` text PRIMARY KEY NOT NULL,
	`predmet_id` text NOT NULL,
	`vrsta` text NOT NULL,
	`datum` text NOT NULL,
	`opis` text NOT NULL,
	`autor_racun_id` text NOT NULL,
	`stvoreno` text NOT NULL,
	FOREIGN KEY (`predmet_id`) REFERENCES `predmet`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`autor_racun_id`) REFERENCES `racun`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `zapis_predmet` ON `zapis` (`predmet_id`,`datum`);