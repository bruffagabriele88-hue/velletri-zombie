#!/usr/bin/env python3
"""Genera le frasi dei nemici con le voci italiane del Mac (comando say) e le salva in suoni/voci.
Sono voci sintetiche provvisorie: si possono sostituire con registrazioni vere usando gli stessi nomi di file."""
import subprocess, os, json

QUI = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(QUI, 'suoni', 'voci')
VOCI = {'eddy': 'Eddy (Italiano (Italia))', 'reed': 'Reed (Italiano (Italia))', 'rocko': 'Rocko (Italiano (Italia))',
        'sandy': 'Sandy (Italiano (Italia))', 'flo': 'Flo (Italiano (Italia))', 'shelley': 'Shelley (Italiano (Italia))'}
FRASI = {
    # quando ti cercano o ti hanno visto
    'minaccia': ["Ti ammazzo, coglione!", "Vieni fuori, stronzo!", "Sei morto, hai capito? Morto!", "Dove scappi, eh?",
                 "Ti ho sentito, bastardo!", "Non hai scampo!", "Ti faccio a pezzi!", "Eccolo, è là!",
                 "Tanto ti prendo!", "Esci fuori, vigliacco!", "Adesso ti sistemo io!", "Questa è casa nostra, pezzo di merda!"],
    # quando ti saltano addosso
    'attacco': ["Prendi questo!", "Crepa!", "Tieni, stronzo!", "Muori!"],
    # quando li colpisci
    'colpito': ["Ah! Bastardo!", "Mi ha preso!", "Cazzo!", "Figlio di puttana!"],
    # chi corre
    'carica': ["Addosso!", "Ti prendo!", "Adesso sei mio!"],
    # chi spara
    'spara': ["Lo vedo, sparo!", "Fuoco!", "Beccati questa!"],
    # all'inizio di un assalto
    'assalto': ["Circondatelo!", "Prendetelo, forza!", "Tutti addosso!"],
}

def main():
    os.makedirs(OUT, exist_ok=True)
    elenco = {}
    for chiave, voce in VOCI.items():
        for cat, frasi in FRASI.items():
            for i, frase in enumerate(frasi):
                nome = f'{chiave}_{cat}{i + 1}'
                aiff = os.path.join(OUT, nome + '.aiff')
                subprocess.run(['say', '-v', voce, '-r', '200', '-o', aiff, frase], check=True)
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', aiff, '-ac', '1', '-ar', '48000',
                                '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-16:TP=-1.5',
                                '-c:a', 'pcm_s16le', os.path.join(OUT, nome + '.wav')], check=True)
                os.remove(aiff)
                elenco.setdefault(chiave, {}).setdefault(cat, []).append(nome)
    json.dump(elenco, open(os.path.join(OUT, 'elenco.json'), 'w'), ensure_ascii=False, indent=1)
    print(sum(len(v) for c in elenco.values() for v in c.values()), 'frasi')

if __name__ == '__main__':
    main()
