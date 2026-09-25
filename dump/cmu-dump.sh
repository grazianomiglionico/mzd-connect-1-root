#!/bin/sh
# =============================================================================
# cmu-dump.sh  -  Dump COMPLETO della CMU Mazda (MZD Connect) su chiavetta USB.
#
# COSA FA
#   - Raccoglie i metadati di sistema (mount, df, /proc/mtd, partizioni, versioni)
#   - Crea un archivio tar.gz dell'INTERO filesystem (escludendo pseudo-fs e le USB)
#   - Crea immagini raw (dd) di TUTTE le partizioni a blocchi e MTD (eMMC/NAND)
#   - Calcola i checksum md5 per verificare l'integrita' del dump
#
# SICUREZZA
#   - Legge SOLO dalla CMU. Scrive SOLO dentro la cartella di dump sulla USB.
#   - Nessun dd scrive MAI su un device della CMU (of= sempre sotto la USB).
#
# COME LANCIARLO (dal terminale JCI test mode, testId 11):
#     sh /mnt/sda1/dump/cmu-dump.sh
#   (sostituisci sda1 con la partizione della tua chiavetta se diversa)
#
# Compatibile busybox ash. NON usa bashismi.
# =============================================================================

set -u

# ------------------------------------------------------------------ config ---
# Spazio minimo libero sulla USB per tentare il dump raw di un device (KB).
MIN_FREE_KB=51200          # 50 MB di margine
# Escludi dal tar i mount pseudo/volatili e le stesse chiavette USB.
TAR_EXCLUDES="proc sys dev tmp run mnt lost+found"

# --------------------------------------------------------------- utility ---
log() {
    # scrive a schermo e nel logfile (se gia' definito)
    echo "$@"
    if [ -n "${LOGFILE:-}" ]; then
        echo "$@" >> "$LOGFILE" 2>/dev/null
    fi
}

die() {
    log "ERRORE: $*"
    exit 1
}

# Ritorna lo spazio libero in KB del filesystem che contiene $1
free_kb() {
    df -k "$1" 2>/dev/null | awk 'NR==2 {print $4}'
}

# Dimensione (KB) di un block device leggendo /proc/partitions
dev_size_kb() {
    _name=$(basename "$1")
    awk -v n="$_name" '$4==n {print $3}' /proc/partitions 2>/dev/null
}

# ------------------------------------------------- trova la USB di destinazione ---
# Cerca una partizione USB montata (rw) sotto /mnt/sd*1 con piu' spazio libero.
find_usb() {
    _best=""
    _best_free=0
    for _m in /mnt/sda1 /mnt/sdb1 /mnt/sdc1 /mnt/sdd1 /mnt/sde1 \
              /tmp/mnt/sda1 /tmp/mnt/sdb1 /tmp/mnt/sdc1 /tmp/mnt/sdd1; do
        [ -d "$_m" ] || continue
        # deve essere scrivibile
        if ( : > "$_m/.cmudump_wtest" ) 2>/dev/null; then
            rm -f "$_m/.cmudump_wtest" 2>/dev/null
            _f=$(free_kb "$_m")
            [ -z "$_f" ] && _f=0
            if [ "$_f" -gt "$_best_free" ]; then
                _best_free=$_f
                _best=$_m
            fi
        fi
    done
    echo "$_best"
}

# =============================================================================
# START
# =============================================================================
echo "=== CMU FULL DUMP ==="

USB=$(find_usb)
[ -n "$USB" ] || die "nessuna chiavetta USB scrivibile trovata sotto /mnt/sd*1"

TS=$(date +%Y%m%d_%H%M%S 2>/dev/null)
[ -n "$TS" ] || TS="dump"
OUT="$USB/cmu_dump_$TS"
mkdir -p "$OUT" || die "impossibile creare $OUT"
mkdir -p "$OUT/meta" "$OUT/fs" "$OUT/raw" || die "impossibile creare le sottocartelle"

LOGFILE="$OUT/dump.log"
: > "$LOGFILE"

log "Destinazione : $OUT"
log "Data/ora     : $TS"
log "Spazio libero: $(free_kb "$USB") KB su $USB"
log ""

# ----------------------------------------------------------------- metadati ---
log ">>> Raccolgo i metadati di sistema..."
{
    echo "### uname -a";        uname -a
    echo; echo "### date";      date
    echo; echo "### mount";     mount
    echo; echo "### df -k";     df -k
    echo; echo "### /proc/mtd"; cat /proc/mtd 2>/dev/null
    echo; echo "### /proc/partitions"; cat /proc/partitions 2>/dev/null
    echo; echo "### ps";        ps 2>/dev/null
    echo; echo "### free";      free 2>/dev/null
    echo; echo "### env";       env
} > "$OUT/meta/system_info.txt" 2>&1

# File di versione noti sulla CMU (best effort)
for vf in /jci/version /jci/gui/version /etc/version /etc/os-release \
          /jci/sm/sm.conf /jci/settings/settings.db; do
    [ -f "$vf" ] || continue
    _dst="$OUT/meta/$(echo "$vf" | sed 's#/#_#g')"
    cp "$vf" "$_dst" 2>/dev/null && log "  copiato $vf"
done
dmesg > "$OUT/meta/dmesg.txt" 2>/dev/null
log "  metadati salvati in meta/"
log ""

# ---------------------------------------------------- tar dell'intero rootfs ---
log ">>> Archivio dell'intero filesystem (tar.gz)... puo' richiedere parecchi minuti"
EXC=""
for e in $TAR_EXCLUDES; do
    EXC="$EXC --exclude=./$e"
done
# escludi anche esplicitamente la cartella di output (per sicurezza, se la USB
# fosse sotto la root in qualche mapping)
FS_TGZ="$OUT/fs/rootfs.tar.gz"
if ( cd / && tar cf - $EXC . 2>>"$LOGFILE" | gzip -1 > "$FS_TGZ" ) ; then
    log "  rootfs -> $FS_TGZ ($(free_kb "$USB") KB liberi rimasti)"
else
    log "  ATTENZIONE: tar del rootfs terminato con errori (vedi dump.log)"
fi
log ""

# -------------------------------------------- immagini raw dei block device ---
log ">>> Immagini raw (dd) delle partizioni eMMC/NAND..."
# Elenco device a blocchi da /proc/partitions (mmcblk*, mtdblock*, sd* interni)
DEVS=$(awk 'NR>2 {print $4}' /proc/partitions 2>/dev/null \
        | grep -E '^(mmcblk|mtdblock|nand)' )

if [ -z "$DEVS" ]; then
    log "  nessun device mmcblk/mtdblock trovato in /proc/partitions"
fi

for d in $DEVS; do
    DEV="/dev/$d"
    [ -b "$DEV" ] || { log "  salto $DEV (non e' un block device)"; continue; }

    SZ=$(dev_size_kb "$DEV")
    [ -z "$SZ" ] && SZ=0
    FREE=$(free_kb "$USB")
    [ -z "$FREE" ] && FREE=0

    OUTIMG="$OUT/raw/$d.img"
    # --- guardia di sicurezza: of= DEVE stare sotto $OUT ---
    case "$OUTIMG" in
        "$OUT"/*) : ;;
        *) log "  SALTO $DEV: destinazione non sicura"; continue ;;
    esac

    if [ "$SZ" -gt 0 ] && [ $((FREE - MIN_FREE_KB)) -lt "$SZ" ]; then
        log "  SALTO $DEV: servono ${SZ}KB ma liberi solo ${FREE}KB"
        continue
    fi

    log "  dd $DEV (${SZ}KB) -> raw/$d.img"
    if dd if="$DEV" of="$OUTIMG" bs=1M 2>>"$LOGFILE"; then
        log "    ok"
    else
        log "    ATTENZIONE: dd di $DEV terminato con errori"
    fi
done
log ""

# ----------------------------------------------------------------- checksum ---
log ">>> Calcolo i checksum md5 (integrita')..."
( cd "$OUT" && find . -type f ! -name md5sums.txt -exec md5sum {} \; \
    > md5sums.txt 2>/dev/null )
log "  checksum -> md5sums.txt"
log ""

# Sincronizza la scrittura sulla USB prima di dichiarare finito
sync 2>/dev/null

log "=== DUMP COMPLETATO ==="
log "Cartella: $OUT"
log "Spazio libero finale: $(free_kb "$USB") KB"
echo ""
echo ">>> ORA PUOI ESPELLERE LA CHIAVETTA (dopo qualche secondo). <<<"
