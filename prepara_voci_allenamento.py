#!/usr/bin/env python3
"""Le spiegazioni dell'allenamento con la voce vera del narratore (ElevenLabs).
Legge i testi da js/tutorial.js, così voce e sottotitoli restano uguali.
  ELEVEN_CHIAVE=/percorso/chiave.txt python3 prepara_voci_allenamento.py
I file già fatti non si rigenerano. Se i caratteri del mese finiscono si ferma: le lezioni senza voce
registrata le legge la voce del computer, e si completano rilanciando lo script il mese dopo."""
import os, re, sys, json, urllib.error
import prepara_voci_eleven as E

LETTERE = {'W': 'doppia vu', 'S': 'esse', 'D': 'di', 'X': 'ics', 'V': 'vu', 'Z': 'zeta', 'C': 'ci', 'R': 'erre', 'P': 'pi', 'H': 'acca',
           'Q': 'cu', 'B': 'bi', 'N': 'enne', 'T': 'ti', 'K': 'cappa', 'L': 'elle', 'F': 'effe', 'G': 'gi', 'Y': 'ipsilon', 'M': 'emme', 'U': 'u'}

def lezioni():
    s = open(os.path.join(E.QUI, 'js', 'tutorial.js'), encoding='utf-8').read()
    invio = re.search(r"const INVIO = '((?:[^'\\]|\\.)*)'", s).group(1)
    for m in re.finditer(r"\{ id: '(\w+)'.*?testo: '((?:[^'\\]|\\.)*)'( \+ INVIO)?", s, re.S):
        yield m.group(1), m.group(2).replace("\\'", "'") + (invio if m.group(3) else '')

def da_dire(testo):
    # i nomi dei tasti detti per esteso, così la voce non li storpia
    testo = re.sub(r"(?<![\w'’])([A-Z])(?![\w'’])", lambda m: LETTERE.get(m.group(1), m.group(1)), testo)
    return testo.replace('«', '').replace('»', '').replace('ARX 160', 'ARX centosessanta')

# frasi brevi dell'allenamento che non stanno tra le lezioni
EXTRA = {
    'clicca': "Allenamento. Clicca sul trackpad per cominciare.",
    'fine': "Allenamento completato. Sei pronto per la battaglia. Lo puoi rifare quando vuoi dal menù, alla voce Allenamento.",
    'saltato': "Saltato.",
    'prova': "Qui devi provare il comando. Cancella ripete la spiegazione, Maiuscolo più Invio salta.",
    'obbligo': "La prima volta l'allenamento va finito. Clicca per riprendere.",
    'prima': "Velletri Zombie. È la prima volta: si comincia con l'allenamento.",
}
DEST = os.path.join(E.OUT, 'allenamento')

def main():
    import subprocess
    k = E.chiave(); os.makedirs(DEST, exist_ok=True)
    tutte = [(n, da_dire(t)) for n, t in lezioni()] + list(EXTRA.items())
    caratteri = 0
    for nome, testo in tutte:
        mp3 = os.path.join(DEST, f'tut_{nome}.mp3'); wav = os.path.join(E.OUT, f'annuncio_tut_{nome}.wav')
        if os.path.exists(mp3): continue
        try:
            caratteri += E.genera(k, E.NARRATORE, testo, 'annuncio_tut_' + nome)
        except urllib.error.HTTPError as e:
            print('FERMO a', nome, e.code, e.read().decode('utf-8', 'replace')[:300]); break
        # in mp3: sette minuti di voce in wav peserebbero troppo da scaricare
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ac', '1', '-b:a', '80k', mp3], check=True)
        os.remove(wav)
    fatti = [n for n, _ in tutte if os.path.exists(os.path.join(DEST, f'tut_{n}.mp3'))]
    json.dump(fatti, open(os.path.join(DEST, 'elenco.json'), 'w'))
    # le lezioni non stanno nell'elenco generale: si caricano solo quando parte l'allenamento
    p = os.path.join(E.OUT, 'elenco.json'); elenco = json.load(open(p))
    for n in [x for x in elenco['narratore'] if x.startswith('tut_')]: del elenco['narratore'][n]
    json.dump(elenco, open(p, 'w'), ensure_ascii=False, indent=1)
    print('caratteri usati ora:', caratteri, '· voci pronte:', len(fatti), 'su', len(tutte))

if __name__ == '__main__': main()
