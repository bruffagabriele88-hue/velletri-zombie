#!/usr/bin/env python3
"""Il menù letto dal narratore (ElevenLabs). Legge le voci da js/gioco.js, così testo e voce restano uguali.
  ELEVEN_CHIAVE=/percorso/chiave.txt python3 prepara_voci_menu.py
Crea suoni/voci/menu/*.mp3 ed elenco.json. I file già fatti non si rifanno."""
import os, re, json, subprocess, urllib.error
import prepara_voci_eleven as E

DEST = os.path.join(E.OUT, 'menu')
FISSE = {'aiuto': "Frecce su e giù, Invio per scegliere.", 'benvenuto': "Velletri Zombie.", 'mappa': "Mappa pronta."}

def voci_menu():
    s = open(os.path.join(E.QUI, 'js', 'gioco.js'), encoding='utf-8').read()
    blocco = s[s.index('const MENU = {'):]; blocco = blocco[:blocco.index('\n};')]
    for riga in blocco.split('\n')[1:]:
        m = re.match(r"\s*(\w+): \{ titolo: (['\"])(.*?)\2, voci: \[(.*)\] \},?$", riga)
        if not m: continue
        nome, titolo, voci = m.group(1), m.group(3), m.group(4)
        yield f'{nome}_titolo', titolo if titolo.endswith(('.', '?')) else titolo + '.'
        for id_, _, testo in re.findall(r"\['(\w+)', (['\"])(.*?)\2\]", voci):
            yield f'{nome}_{id_}', testo.replace("\\'", "'")

def main():
    k = E.chiave(); os.makedirs(DEST, exist_ok=True)
    tutte = list(FISSE.items()) + list(voci_menu())
    for nome, testo in tutte:
        mp3 = os.path.join(DEST, f'menu_{nome}.mp3')
        if os.path.exists(mp3): continue
        try: E.genera(k, E.NARRATORE, testo, 'menu_' + nome)
        except urllib.error.HTTPError as e: print('FERMO a', nome, e.code, e.read().decode('utf-8', 'replace')[:200]); break
        wav = os.path.join(E.OUT, f'menu_{nome}.wav')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ac', '1', '-b:a', '80k', mp3], check=True); os.remove(wav)
    fatti = [n for n, _ in tutte if os.path.exists(os.path.join(DEST, f'menu_{n}.mp3'))]
    json.dump(fatti, open(os.path.join(DEST, 'elenco.json'), 'w'))
    print('voci del menù pronte:', len(fatti), 'su', len(tutte), '· caratteri:', sum(len(t) for _, t in tutte))

if __name__ == '__main__': main()
