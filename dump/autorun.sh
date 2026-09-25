#!/bin/sh
# =============================================================================
# autorun.sh  -  Entry point per l'esecuzione AUTOMATICA del dump della CMU.
#
# Sulle CMU moddate con casdk/MZD-AIO e' presente un helper che, all'inserimento
# della chiavetta, esegue automaticamente uno script di autorun dalla USB.
# Questo file e' quel wrapper: si limita a lanciare cmu-dump.sh.
#
# NON e' garantito su tutte le unita': dipende dall'autorun installato sul
# firmware. Se il tuo CMU non ha l'autorun, usa il comando mostrato a schermo:
#     sh /mnt/sda1/dump/cmu-dump.sh
#
# Alcuni autorun cercano il file a percorsi/nomi diversi. Candidati comuni da
# provare (copia/rinomina questo file di conseguenza sulla radice della USB):
#     /mnt/sd*/config.sh
#     /mnt/sd*/autorun.sh
#     /mnt/sd*/cmu_autorun.sh
#
# Compatibile busybox ash. Deve avere fine-riga LF (vedi .gitattributes).
# =============================================================================

set -u

# Cartella in cui si trova QUESTO script (cosi' trova cmu-dump.sh accanto a se').
SELF_DIR=$(dirname "$0" 2>/dev/null)
[ -n "$SELF_DIR" ] || SELF_DIR="."

DUMP="$SELF_DIR/cmu-dump.sh"

# Fallback: cerca cmu-dump.sh sulle partizioni USB note.
if [ ! -f "$DUMP" ]; then
    for c in /mnt/sda1/dump/cmu-dump.sh /mnt/sdb1/dump/cmu-dump.sh \
             /mnt/sdc1/dump/cmu-dump.sh /mnt/sdd1/dump/cmu-dump.sh \
             /tmp/mnt/sda1/dump/cmu-dump.sh /tmp/mnt/sdb1/dump/cmu-dump.sh; do
        if [ -f "$c" ]; then
            DUMP="$c"
            break
        fi
    done
fi

if [ ! -f "$DUMP" ]; then
    echo "autorun: cmu-dump.sh non trovato"
    exit 1
fi

echo "autorun: avvio $DUMP"
exec sh "$DUMP"
