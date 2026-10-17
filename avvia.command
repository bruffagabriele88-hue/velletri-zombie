#!/bin/bash
# Avvia Velletri Zombie: server locale + Safari. Per chiudere, chiudi questa finestra del Terminale.
cd "$(dirname "$0")"
PORTA=8765
lsof -ti tcp:$PORTA | xargs kill 2>/dev/null   # chiude un eventuale server vecchio
sleep 0.3
python3 server.py $PORTA &
sleep 1
open -a Safari "http://127.0.0.1:$PORTA/index.html"
say -v Alice "Velletri Zombie aperto in Safari. Premi Invio per iniziare." 2>/dev/null || say "Velletri Zombie aperto in Safari. Premi Invio per iniziare."
wait
