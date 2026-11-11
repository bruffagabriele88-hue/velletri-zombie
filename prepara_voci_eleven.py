#!/usr/bin/env python3
"""Genera le voci del gioco con ElevenLabs (modello eleven_v3, che sa gridare, sussurrare e lamentarsi).
La chiave NON sta nel gioco: si legge da un file indicato con la variabile ELEVEN_CHIAVE (percorso del file).
  ELEVEN_CHIAVE=/percorso/chiave.txt python3 prepara_voci_eleven.py
Crea suoni/voci/*.wav ed elenco.json. I file già fatti non si rigenerano (si risparmiano caratteri).
Voci sintetiche di ElevenLabs: vanno citate nei crediti."""
import json, os, subprocess, sys, urllib.request

QUI = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(QUI, 'suoni', 'voci')
MODELLO = 'eleven_v3'

# sei soldati nemici, ognuno con la sua voce
SOLDATI = {
    'falco': 'pNInz6obpgDQGcFmaJgB', 'orso': 'VR6AewLTigWG4xSOukaG', 'lince': 'N2lVS1w4EtoT3dr4eOWO',
    'lupo': 'nPczCjzI2devNBz1zQrb', 'corvo': 'cjVigY5qzO86Huf0OWal', 'toro': 'pqHfZKP75CvOlQylNhV4',
}
RADIO = 'onwK4e9ZLuTAKqWW03F9'      # il compagno che parla alla radio
NARRATORE = 'JBFqnCBsd6RMkjVDRZzb'  # la voce degli annunci

FRASI = {
    'minaccia': ["[shouting] Contatto! È là!", "Movimento, a ore dodici.", "[whispers] Lo sento... è vicino.", "[shouting] Eccolo, dietro il muro!",
                 "Bersaglio individuato.", "[shouting] Non hai via di fuga!", "Vieni fuori, sei circondato.", "[whispers] Piano... è dentro la casa."],
    'attacco': ["[shouting] Fuoco!", "[shouting] Avanti, avanti!", "Lo ingaggio!", "[shouting] Addosso!"],
    'colpito': ["[pained] Ah! Sono colpito!", "[pained] Ferito, sono ferito!", "[groans] Maledizione...", "[shouting] Mi hanno preso!"],
    'carica': ["[shouting] Vado!", "Copritemi, avanzo!", "Mi sposto!"],
    'spara': ["Fuoco di copertura!", "[shouting] Lo tengo giù!", "Ingaggio!"],
    'assalto': ["[shouting] Accerchiatelo!", "Prendetelo di lato!", "[shouting] Tutti avanti!"],
    'ricarica': ["Ricarico!", "[shouting] Coprimi, cambio caricatore!", "Sono a secco!"],
    'granata': ["[shouting] Granata!", "Lancio granata!"],
}
QUANTE = {'minaccia': 5, 'attacco': 3, 'colpito': 3, 'carica': 2, 'spara': 2, 'assalto': 2, 'ricarica': 2, 'granata': 1}

FRASI_RADIO = {
    'contatto': ["Contatto, nemico avvistato.", "Ho un ostile davanti.", "Nemico in vista, attento."],
    'ricarica': ["Ricarico, coprimi."],
    'colpito': ["[pained] Sono colpito!", "Mi hanno ferito, ma ci sono."],
    'abbattuto': ["Nemico abbattuto.", "Uno in meno."],
    'rianimo': ["Tieni duro, ti rialzo io."],
    'seguo': ["Sono con te.", "Ti copro le spalle."],
}
ANNUNCI = {
    'benvenuto': "Preparati. Si parte.",
    'lanciati': "[shouting] Lanciati adesso!",
    'paracadute': "Paracadute aperto.",
    'aterra': "A terra. Trova un'arma.",
    'tempesta_arriva': "La tempesta sta arrivando.",
    'tempesta_avanza': "La tempesta avanza. Muoviti.",
    'cassa': "Rifornimento in arrivo.",
    'vittoria': "Sei l'ultimo in piedi. Vittoria.",
    'vittoria_squadra': "La tua squadra è l'ultima in piedi. Vittoria.",
    'eliminato': "Sei stato eliminato.",
    'feritoaterra': "[pained] Sei a terra! Resisti, arriva un compagno.",
    'ultimo': "Ne resta uno solo.",
    'ultima_squadra': "Resta una sola squadra.",
}

def chiave():
    p = os.environ.get('ELEVEN_CHIAVE')
    if not p: sys.exit('Manca ELEVEN_CHIAVE (percorso del file con la chiave).')
    return open(p).read().strip()

def genera(k, voce, testo, nome, radio=False):
    wav = os.path.join(OUT, nome + '.wav')
    if os.path.exists(wav): return 0
    corpo = json.dumps({'text': testo, 'model_id': MODELLO, 'language_code': 'it'}).encode()
    req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{voce}?output_format=mp3_44100_128', data=corpo,
                                 headers={'xi-api-key': k, 'Content-Type': 'application/json'})
    mp3 = os.path.join(OUT, nome + '.mp3')
    with urllib.request.urlopen(req, timeout=60) as r, open(mp3, 'wb') as f: f.write(r.read())
    # tolgo i silenzi all'inizio e alla fine e porto il volume a un livello uguale per tutte
    filtri = 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse'
    if radio: filtri += ',highpass=f=380,lowpass=f=3100,acompressor=threshold=-20dB:ratio=6,volume=2'  # suono da radio
    filtri += ',loudnorm=I=-16:TP=-1.5'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp3, '-ac', '1', '-ar', '48000', '-af', filtri, '-c:a', 'pcm_s16le', wav], check=True)
    os.remove(mp3)
    print(nome, '·', testo)
    return len(testo)

def main():
    k = chiave()
    os.makedirs(OUT, exist_ok=True)
    elenco, caratteri = {}, 0
    # ogni soldato dice frasi un po' diverse dagli altri: le scelgo a giro
    for s, (soldato, voce) in enumerate(SOLDATI.items()):
        for cat, frasi in FRASI.items():
            for j in range(QUANTE[cat]):
                frase = frasi[(s * 3 + j) % len(frasi)]
                nome = f'{soldato}_{cat}{j + 1}'
                caratteri += genera(k, voce, frase, nome)
                elenco.setdefault(soldato, {}).setdefault(cat, []).append(nome)
    for cat, frasi in FRASI_RADIO.items():
        for j, frase in enumerate(frasi):
            nome = f'radio_{cat}{j + 1}'
            caratteri += genera(k, RADIO, frase, nome, radio=True)
            elenco.setdefault('radio', {}).setdefault(cat, []).append(nome)
    for nome, frase in ANNUNCI.items():
        caratteri += genera(k, NARRATORE, frase, 'annuncio_' + nome)
        elenco.setdefault('narratore', {})[nome] = ['annuncio_' + nome]
    json.dump(elenco, open(os.path.join(OUT, 'elenco.json'), 'w'), ensure_ascii=False, indent=1)
    print('caratteri usati:', caratteri)

if __name__ == '__main__':
    main()
