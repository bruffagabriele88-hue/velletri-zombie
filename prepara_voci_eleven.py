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

# ---- seconda infornata: dialetti e più frasi
R, N = '[Roman accent] ', '[Neapolitan accent] '
DIALETTI = {
    'romano': ('ErXwobaYiN019PkySvjV', {
        'minaccia': [R + "Aò, l'ho visto! Sta là!", R + "Ndo vai? Te sento, sai.", R + "[whispers] Zitti... sta dentro casa.", R + "Esci fòri, nun te nasconne!", R + "Daje, ce l'avemo davanti!"],
        'attacco': [R + "[shouting] Daje, daje, daje!", R + "[shouting] Mo' te faccio vede' io!", R + "[shouting] Annamo!"],
        'colpito': [R + "[pained] Ahia! M'hanno preso!", R + "Mortacci... so' ferito!", R + "[pained] Aò, fa male!"],
        'carica': [R + "[shouting] Vado, coprime!", R + "Me sposto, statte attento!"],
        'spara': [R + "[shouting] Tiè!", R + "Fuoco, fuoco!"],
        'assalto': [R + "[shouting] Circondatelo, forza!", R + "Pijatelo de lato!"],
        'ricarica': [R + "So' a secco, aspetta!", R + "[shouting] Ricarico, coprime!"],
        'granata': [R + "[shouting] Occhio, granata!"],
    }),
    'napoletano': ('TX3LPaxmHKxFdv7VOQHJ', {
        'minaccia': [N + "Uè, sta llà! L'aggio visto!", N + "Addò vaje? Te sento!", N + "[whispers] Zitto... sta dint' 'a casa.", N + "Iesce fora, nun te ne fuì!", N + "Jamme, ce sta 'nnanze!"],
        'attacco': [N + "[shouting] Jamme, jamme!", N + "[shouting] Mo' t'acconcio io!", N + "[shouting] Avanti, guagliù!"],
        'colpito': [N + "[pained] Ah! M'hanno pigliato!", N + "Mannaggia... so' ferito!", N + "[pained] Uè, che dulore!"],
        'carica': [N + "[shouting] Vaco, copreme!", N + "Me sposto, statte accorto!"],
        'spara': [N + "[shouting] Pigliate chesto!", N + "Fuoco, guagliù!"],
        'assalto': [N + "[shouting] Circundatelo, guagliù!", N + "Pigliatelo 'e lato!"],
        'ricarica': [N + "Nun tengo cchiù colpi, aspetta!", N + "[shouting] Ricarico, copreme!"],
        'granata': [N + "[shouting] Attiento, 'na granata!"],
    }),
}
RADIO_DIALETTI = {
    'radio_romano': ('nPczCjzI2devNBz1zQrb', {
        'contatto': [R + "Aò, c'ho uno davanti.", R + "Contatto, sta là, occhio."], 'ricarica': [R + "Ricarico, coprime un attimo."],
        'colpito': [R + "[pained] M'hanno beccato, ma ce so'."], 'abbattuto': [R + "Fatto fòri. Uno de meno.", R + "Giù, l'ho steso."],
        'rianimo': [R + "Tieni duro, mo' te tiro su."], 'seguo': [R + "So' co' te, tranquillo.", R + "Te guardo le spalle."],
    }),
    'radio_napoletano': ('cjVigY5qzO86Huf0OWal', {
        'contatto': [N + "Uè, ne tengo uno 'nnanze.", N + "Contatto, sta llà, attiento."], 'ricarica': [N + "Ricarico, copreme nu mumento."],
        'colpito': [N + "[pained] M'hanno pigliato, ma sto ccà."], 'abbattuto': [N + "Fatto. Uno 'e meno.", N + "L'aggio stiso."],
        'rianimo': [N + "Tiene botta, mo' t'aizo io."], 'seguo': [N + "Sto cu te, statte tranquillo.", N + "Te guardo 'e spalle."],
    }),
}
# più frasi per i sei soldati e per la radio normale
ALTRE_FRASI = {
    'minaccia': ["[whispers] Ho sentito dei passi.", "Settore libero... no, aspetta. Eccolo.", "[shouting] Ostile, sul tetto!", "Lo sento correre, è vicino."],
    'colpito': ["[pained] Medico! Mi serve un medico!", "[breathing heavily] Sono ancora vivo..."],
    'attacco': ["[shouting] Adesso! Tutti insieme!"],
}
ALTRA_RADIO = {
    'contatto': ["Movimento sulla destra.", "[whispers] Fermo, ce n'è uno vicino."], 'abbattuto': ["Bersaglio giù."],
    'seguo': ["Sono dietro di te, procedi."], 'colpito': ["[pained] Mi hanno colpito, resisto."],
}
ALTRI_ANNUNCI = {
    'eliminazione': "Bersaglio eliminato.", 'giubbotto': "Giubbotto distrutto.", 'tre_rimasti': "Ne restano tre.",
    'meta': "Metà dei combattenti è caduta.", 'squadra_eliminata': "La tua squadra è stata eliminata.", 'zona_finale': "Zona finale. Ultimo scontro.",
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
    # seconda infornata
    for soldato, (voce, cat_frasi) in {**DIALETTI, **RADIO_DIALETTI}.items():
        radio = soldato.startswith('radio')
        for cat, frasi in cat_frasi.items():
            for j, frase in enumerate(frasi):
                nome = f'{soldato}_{cat}{j + 1}'
                caratteri += genera(k, voce, frase, nome, radio=radio)
                elenco.setdefault(soldato, {}).setdefault(cat, []).append(nome)
    for s, (soldato, voce) in enumerate(SOLDATI.items()):
        for cat, frasi in ALTRE_FRASI.items():
            frase = frasi[s % len(frasi)]
            nome = f'{soldato}_{cat}x{s % len(frasi) + 1}'
            caratteri += genera(k, voce, frase, nome)
            elenco[soldato][cat].append(nome)
    for cat, frasi in ALTRA_RADIO.items():
        for j, frase in enumerate(frasi):
            nome = f'radio_{cat}x{j + 1}'
            caratteri += genera(k, RADIO, frase, nome, radio=True)
            elenco['radio'][cat].append(nome)
    for nome, frase in ALTRI_ANNUNCI.items():
        caratteri += genera(k, NARRATORE, frase, 'annuncio_' + nome)
        elenco['narratore'][nome] = ['annuncio_' + nome]
    json.dump(elenco, open(os.path.join(OUT, 'elenco.json'), 'w'), ensure_ascii=False, indent=1)
    print('caratteri usati:', caratteri)

if __name__ == '__main__':
    main()
