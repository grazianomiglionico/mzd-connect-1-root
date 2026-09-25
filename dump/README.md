# Dump completo della CMU (MZD Connect)

Strumenti per fare un backup completo della CMU su chiavetta USB.
Tutto in **sola lettura dalla CMU**: si scrive solo dentro la cartella di dump
sulla USB. Nessun `dd` scrive mai verso i device della CMU.

## File

- `cmu-dump.sh` — lo script che esegue il dump:
  - `meta/` — info di sistema (`uname`, `mount`, `df`, `/proc/mtd`,
    `/proc/partitions`, `ps`, `dmesg`, file di versione)
  - `fs/rootfs.tar.gz` — tar dell'intero filesystem (esclude `proc sys dev tmp run mnt`)
  - `raw/*.img` — immagini raw `dd` di tutte le partizioni `mmcblk*`/`mtdblock*`
    (eMMC/NAND), con controllo dello spazio libero
  - `md5sums.txt` — checksum per verificare l'integrità
- `autorun.sh` — wrapper per l'esecuzione automatica (vedi sotto)

## Come si usa

1. Copia la cartella `dump/` sulla **radice** della chiavetta USB.
2. Inserisci la USB nella CMU e accendi.

### Esecuzione automatica (best-effort)
Se la CMU ha l'autorun **casdk / MZD-AIO** installato, all'inserimento della
chiavetta parte da solo `autorun.sh` → `cmu-dump.sh`. Alcuni autorun cercano il
file a nomi/percorsi diversi: prova a copiare/rinominare `autorun.sh` come
`config.sh` o `cmu_autorun.sh` sulla radice della USB.

### Esecuzione manuale (fallback garantito)
All'avvio `run.js` apre il terminale JCI e mostra il comando. Eseguilo **una
volta**; da lì il dump è automatico:

```sh
sh /mnt/sda1/dump/cmu-dump.sh
```

(sostituisci `sda1` con la partizione della tua chiavetta se diversa)

Al termine appare `>>> ORA PUOI ESPELLERE LA CHIAVETTA <<<`. Attendi qualche
secondo (per il `sync`) prima di rimuoverla.

## Requisiti

- Chiavetta USB con spazio sufficiente. Le immagini raw di eMMC/NAND possono
  occupare **diversi GB**: usa una USB capiente (per il rootfs completo servono
  in genere 8–16+ GB).
- Gli script **devono** avere fine-riga **LF** (non CRLF). Il repo lo forza via
  `.gitattributes`; se copi/modifichi su Windows, verifica di non introdurre CRLF
  o la shell della CMU non li eseguirà.
