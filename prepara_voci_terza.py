#!/usr/bin/env python3
"""Terza infornata di voci (ElevenLabs): frasi nuove dei soldati (vista, perso, eliminato, cura, costruisce,
arma trovata, provocazioni) per tutte le voci, anche romana e napoletana, e annunci nuovi del narratore.
  ELEVEN_CHIAVE=/percorso/chiave.txt python3 prepara_voci_terza.py
I file già fatti non si rifanno. Aggiorna suoni/voci/elenco.json senza toccare il resto."""
import os, json, urllib.error
import prepara_voci_eleven as E

FRASI = {
    'visto': ["[shouting] Ti vedo! Sei allo scoperto!", "Eccolo, laggiù!", "[shouting] Bersaglio a vista!", "Ti ho visto, non scappi.",
              "[whispers] Fermo... lo vedo.", "[shouting] Là, vicino alla casa!"],
    'perso': ["Dov'è andato?", "L'ho perso di vista.", "[whispers] Era qui un attimo fa...", "Si è nascosto da qualche parte."],
    'eliminato': ["[laughs] Uno in meno!", "[shouting] Abbattuto!", "Preso. Avanti il prossimo.", "[shouting] Giù!"],
    'cura': ["Mi curo, un attimo!", "[pained] Devo medicarmi...", "Coprimi, mi curo!"],
    'costruisce': ["[shouting] Mi copro!", "Muro, muro!", "[shouting] Su la rampa!"],
    'arma': ["Ho trovato un'arma.", "Questo fa al caso mio.", "[laughs] Adesso sì che si ragiona."],
    'provoca': ["[laughs] Tutto qui?", "Mancato!", "[shouting] Mira meglio!", "Non mi prendi."],
}
QUANTE = {'visto': 2, 'perso': 1, 'eliminato': 2, 'cura': 1, 'costruisce': 1, 'arma': 1, 'provoca': 2}
DIALETTO = {
    'romano': {
        'visto': ["[Roman accent] [shouting] Aò, te vedo! Stai allo scoperto!", "[Roman accent] Eccolo là, er furbetto!"],
        'perso': ["[Roman accent] Ndo' s'è cacciato?"],
        'eliminato': ["[Roman accent] [laughs] Uno de meno!", "[Roman accent] [shouting] Giù, a terra!"],
        'cura': ["[Roman accent] Me curo, aspetta n'attimo!"],
        'costruisce': ["[Roman accent] [shouting] Me riparo!"],
        'arma': ["[Roman accent] Ammazza che arma!"],
        'provoca': ["[Roman accent] [laughs] Tutto qua?", "[Roman accent] Nun me pii manco pe' sbajo!"],
    },
    'napoletano': {
        'visto': ["[Neapolitan accent] [shouting] Uè, te veco! Staje scupierto!", "[Neapolitan accent] Eccolo llà!"],
        'perso': ["[Neapolitan accent] Addò è gghiuto?"],
        'eliminato': ["[Neapolitan accent] [laughs] Uno 'e meno!", "[Neapolitan accent] [shouting] Nterra!"],
        'cura': ["[Neapolitan accent] Me curo, aspetta nu poco!"],
        'costruisce': ["[Neapolitan accent] [shouting] Me reparo!"],
        'arma': ["[Neapolitan accent] Chesta è n'arma overa!"],
        'provoca': ["[Neapolitan accent] [laughs] Tutto ccà?", "[Neapolitan accent] Nun me piglie manco pe' sbaglio!"],
    },
}
ANNUNCI = {
    'primo_sangue': "Primo sangue.", 'doppia': "Doppia eliminazione!", 'tripla': "Tripla eliminazione!", 'inarrestabile': "Inarrestabile!",
    'colpo_testa': "Colpo alla testa.", 'dieci': "Ne restano dieci.", 'cinque': "Ne restano cinque.",
    'fuori_zona': "Sei fuori dalla zona sicura. Muoviti!", 'vita_bassa': "Vita bassa. Trova un riparo e curati.",
    'rianimato': "Sei stato rianimato.", 'munizioni': "Munizioni finite.", 'arma_rara': "Arma delle forze speciali!",
    'cecchino': "Attento, un cecchino ti ha nel mirino.", 'nascosto': "Sei nel cespuglio: nessuno ti vede, finché non spari o corri.",
    'casa': "Sei dentro una casa. I muri fermano i colpi.", 'atterraggio_caldo': "Atterraggio caldo: ci sono nemici vicini!",
    'quasi': "Così vicino alla vittoria...",
}

def main():
    k = E.chiave(); p = os.path.join(E.OUT, 'elenco.json'); el = json.load(open(p))
    lavori = []
    for s, (soldato, voce) in enumerate(E.SOLDATI.items()):
        for cat, frasi in FRASI.items():
            for j in range(QUANTE[cat]):
                lavori.append((soldato, voce, cat, frasi[(s * 2 + j) % len(frasi)], f'{soldato}_{cat}{j + 1}'))
    for soldato, cats in DIALETTO.items():
        voce = E.DIALETTI[soldato][0]
        for cat, frasi in cats.items():
            for j, frase in enumerate(frasi): lavori.append((soldato, voce, cat, frase, f'{soldato}_{cat}{j + 1}'))
    for nome, frase in ANNUNCI.items(): lavori.append(('narratore', E.NARRATORE, nome, frase, 'annuncio_' + nome))
    print('caratteri da generare (al massimo):', sum(len(l[3]) for l in lavori))
    for chi, voce, cat, frase, file in lavori:
        try: E.genera(k, voce, frase, file)
        except urllib.error.HTTPError as e: print('FERMO a', file, e.code, e.read().decode('utf-8', 'replace')[:200]); break
        if not os.path.exists(os.path.join(E.OUT, file + '.wav')): continue
        if chi == 'narratore': el['narratore'][cat] = [file]
        else:
            lista = el.setdefault(chi, {}).setdefault(cat, [])
            if file not in lista: lista.append(file)
    json.dump(el, open(p, 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__': main()
