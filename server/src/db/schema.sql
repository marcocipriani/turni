-- Schema di partenza, per un archivio vuoto.
--
-- Non si scrive a mano: si estrae dall'archivio di sviluppo, che è la copia
-- fedele di ciò che `schema.ts` descrive.
--
--   mysqldump --no-data --skip-comments --compact --skip-add-drop-table turni
--
-- Le modifiche successive alla prima installazione stanno in `migra.ts`, che
-- esegue questo file solo quando le tabelle non ci sono ancora.

CREATE TABLE `absence` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `data_inizio` date NOT NULL,
  `data_fine` date NOT NULL,
  `causale` varchar(40) NOT NULL,
  `creato_il` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ix_absence_user` (`user_id`,`data_inizio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `absence_reason` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `codice` varchar(40) NOT NULL,
  `etichetta` varchar(120) NOT NULL,
  `attiva` tinyint(1) NOT NULL DEFAULT 1,
  `ordine` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_reason_codice` (`codice`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `absence_rule` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `giorno_settimana` tinyint(4) NOT NULL,
  `causale` varchar(40) NOT NULL,
  `valido_da` date NOT NULL,
  `valido_a` date DEFAULT NULL,
  `creato_il` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ix_absrule_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `assignment` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `period_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `data` date NOT NULL,
  `stato` enum('presenza','smart') NOT NULL,
  `room_id` int(11) DEFAULT NULL,
  `desk_id` int(11) DEFAULT NULL,
  `bloccata` tinyint(1) NOT NULL DEFAULT 0,
  `origine` enum('manuale','generata','copiata','scambio') NOT NULL,
  `motivazione` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_assignment_cell` (`period_id`,`user_id`,`data`),
  KEY `ix_assignment_data` (`period_id`,`data`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `audit_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `entita` varchar(60) NOT NULL,
  `entita_id` varchar(60) DEFAULT NULL,
  `azione` varchar(60) NOT NULL,
  `utente` int(11) DEFAULT NULL,
  `prima` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `dopo` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `motivazione` varchar(500) DEFAULT NULL,
  `creato_il` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ix_audit_entita` (`entita`,`entita_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `desk` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `room_id` int(11) NOT NULL,
  `numero` varchar(20) NOT NULL,
  `x` int(11) NOT NULL DEFAULT 0,
  `y` int(11) NOT NULL DEFAULT 0,
  `rotazione` int(11) NOT NULL DEFAULT 0,
  `attiva` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `ix_desk_room` (`room_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `holiday` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `data` date NOT NULL,
  `descrizione` varchar(120) NOT NULL,
  `unit_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_holiday_data` (`data`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `notification` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `tipo` varchar(60) NOT NULL,
  `titolo` varchar(200) NOT NULL,
  `corpo` varchar(600) NOT NULL,
  `link` varchar(200) DEFAULT NULL,
  `letta_il` timestamp NULL DEFAULT NULL,
  `creato_il` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ix_notif_user` (`user_id`,`letta_il`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `organizer` (
  `user_id` int(11) NOT NULL,
  `unit_id` int(11) NOT NULL,
  `nominato_da` int(11) NOT NULL,
  `creato_il` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`user_id`,`unit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `period` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `unit_id` int(11) NOT NULL,
  `data_inizio` date NOT NULL,
  `data_fine` date NOT NULL,
  `stato` enum('bozza','in_approvazione','pubblicato') NOT NULL DEFAULT 'bozza',
  `versione` int(11) NOT NULL DEFAULT 1,
  `assegna_scrivanie` tinyint(1) NOT NULL DEFAULT 0,
  `smart_min_settimana` tinyint(4) DEFAULT NULL,
  `smart_max_settimana` tinyint(4) DEFAULT NULL,
  `nota_approvazione` text DEFAULT NULL,
  `creato_da` int(11) NOT NULL,
  `pubblicato_da` int(11) DEFAULT NULL,
  `pubblicato_il` timestamp NULL DEFAULT NULL,
  `creato_il` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ix_period_unit` (`unit_id`,`data_inizio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `period_snapshot` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `period_id` int(11) NOT NULL,
  `versione` int(11) NOT NULL,
  `assegnazioni` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `motivo` varchar(500) DEFAULT NULL,
  `autore` int(11) NOT NULL,
  `creato_il` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ix_snapshot_period` (`period_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `push_subscription` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `endpoint` varchar(500) NOT NULL,
  `p256dh` varchar(255) NOT NULL,
  `auth` varchar(255) NOT NULL,
  `dispositivo` varchar(200) DEFAULT NULL,
  `creato_il` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_push_endpoint` (`endpoint`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `recurring_rule` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `unit_id` int(11) NOT NULL,
  `ambito` enum('utente','settore') NOT NULL,
  `target_id` int(11) NOT NULL,
  `giorno_settimana` tinyint(4) NOT NULL,
  `stato` enum('presenza','smart') NOT NULL,
  `valido_da` date NOT NULL,
  `valido_a` date DEFAULT NULL,
  `creata_da` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_rule_unit` (`unit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `room` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `unit_id` int(11) NOT NULL,
  `etichetta` varchar(60) NOT NULL,
  `piano` varchar(40) DEFAULT NULL,
  `larghezza_cm` int(11) NOT NULL DEFAULT 600,
  `altezza_cm` int(11) NOT NULL DEFAULT 400,
  `attiva` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `ix_room_unit` (`unit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `scambio` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `period_id` int(11) NOT NULL,
  `tipo` enum('offro','chiedo','permuta') NOT NULL,
  `proponente_id` int(11) NOT NULL,
  `destinatario_id` int(11) NOT NULL,
  `data_proponente` date NOT NULL,
  `data_destinatario` date NOT NULL,
  `stato` enum('proposto','accettato','rifiutato','ritirato') NOT NULL DEFAULT 'proposto',
  `messaggio` varchar(280) DEFAULT NULL,
  `creato_il` timestamp NOT NULL DEFAULT current_timestamp(),
  `chiuso_il` timestamp NULL DEFAULT NULL,
  `blocco_proponente` varchar(40) GENERATED ALWAYS AS (case when `stato` = 'proposto' then concat(`proponente_id`,':',`data_proponente`) else NULL end) STORED,
  `blocco_destinatario` varchar(40) GENERATED ALWAYS AS (case when `stato` = 'proposto' then concat(`destinatario_id`,':',`data_destinatario`) else NULL end) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_scambio_blocco_prop` (`blocco_proponente`),
  UNIQUE KEY `uk_scambio_blocco_dest` (`blocco_destinatario`),
  KEY `ix_scambio_periodo` (`period_id`,`stato`),
  KEY `ix_scambio_proponente` (`proponente_id`,`stato`),
  KEY `ix_scambio_destinatario` (`destinatario_id`,`stato`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `sector` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `unit_id` int(11) NOT NULL,
  `nome` varchar(120) NOT NULL,
  `richiede_presidio` tinyint(1) NOT NULL DEFAULT 0,
  `ordine` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `ix_sector_unit` (`unit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `session` (
  `id` varchar(64) NOT NULL,
  `user_id` int(11) NOT NULL,
  `scade_il` timestamp NOT NULL,
  `user_agent` varchar(300) DEFAULT NULL,
  `creato_il` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ix_session_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `unit` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `parent_id` int(11) DEFAULT NULL,
  `nome` varchar(160) NOT NULL,
  `sigla` varchar(32) DEFAULT NULL,
  `attiva` tinyint(1) NOT NULL DEFAULT 1,
  `smart_min_settimana` tinyint(4) DEFAULT NULL,
  `smart_max_settimana` tinyint(4) DEFAULT NULL,
  `creato_il` timestamp NOT NULL DEFAULT current_timestamp(),
  `scambio_attivo` tinyint(1) NOT NULL DEFAULT 1,
  `scambio_ora_limite` varchar(5) NOT NULL DEFAULT '10:00',
  PRIMARY KEY (`id`),
  KEY `ix_unit_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `user` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(190) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `nome` varchar(80) NOT NULL,
  `cognome` varchar(80) NOT NULL,
  `ruolo` enum('admin','dirigente','dipendente') NOT NULL,
  `unit_id` int(11) DEFAULT NULL,
  `sector_id` int(11) DEFAULT NULL,
  `attivo` tinyint(1) NOT NULL DEFAULT 1,
  `password_da_cambiare` tinyint(1) NOT NULL DEFAULT 0,
  `creato_il` timestamp NOT NULL DEFAULT current_timestamp(),
  `dirigente_unit_id` int(11) GENERATED ALWAYS AS (case when `ruolo` = 'dirigente' then `unit_id` else NULL end) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_email` (`email`),
  UNIQUE KEY `uk_dirigente_unit` (`dirigente_unit_id`),
  KEY `ix_user_unit` (`unit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `user_preference` (
  `user_id` int(11) NOT NULL,
  `giorni_preferiti` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `giorni_da_evitare` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `nota` varchar(500) DEFAULT NULL,
  `avatar_tinta` tinyint(4) DEFAULT NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
