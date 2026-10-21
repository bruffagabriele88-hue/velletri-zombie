#!/usr/bin/env python3
"""Ritaglia i suoni sorgente (suoni/sorgenti) in file WAV 24 bit pronti per il gioco (suoni/).

Ogni taglio conserva la frequenza di campionamento originale (96 kHz dove la sorgente la ha).
Se in suoni/originali/ metti il file WAV/FLAC originale scaricato da Freesound con lo stesso
nome della sorgente (es. sparo_p99.wav), lo script usa quello al posto dell'anteprima compressa.
Richiede ffmpeg.
"""
import os, subprocess, glob

QUI = os.path.dirname(os.path.abspath(__file__))
SORG = os.path.join(QUI, 'suoni', 'sorgenti')
ORIG = os.path.join(QUI, 'suoni', 'originali')
OUT = os.path.join(QUI, 'suoni')

# nome_uscita: (sorgente, inizio s, fine s, mono?)
TAGLI = {
    # Arma: Walther P99 reale, registrata a 96 kHz
    'sparo':            ('sparo_p99', 2.535, 3.361, False),
    'sparo2':           ('sparo_p99', 0.365, 1.40, False),
    'sparo3':           ('sparo_p99', 1.555, 2.50, False),
    'bossolo':          ('bossolo', 0.0, 0.30, True),
    'grilletto_vuoto':  ('maneggio_96k', 4.80, 4.98, True),
    # Ricarica, fasi separate
    'sgancio':          ('ricariche_glock17', 0.60, 0.86, True),   # pulsante + caricatore che esce
    'caricatore_cade':  ('caricatore_cade', 0.02, 1.10, True),     # caricatore che tocca terra e rimbalza
    'inserimento':      ('maneggio_96k', 0.30, 0.68, True),        # caricatore nuovo che scatta
    'carrello':         ('carrello_glock17', 11.66, 12.20, True),  # carrello tirato e rilasciato
    # Zombie
    'passo1':           ('passi_trascinati', 3.84, 4.20, True),
    'passo2':           ('passi_trascinati', 5.02, 5.40, True),
    'passo3':           ('passi_trascinati', 6.22, 6.58, True),
    'passo4':           ('passi_trascinati', 7.52, 7.90, True),
    'passo5':           ('passi_trascinati', 8.64, 9.00, True),
    'passo6':           ('passi_trascinati', 9.78, 10.15, True),
    'verso1':           ('zombie_voce', 63.20, 64.30, True),
    'verso2':           ('zombie_voce', 66.55, 67.70, True),
    'verso3':           ('zombie_voce', 88.25, 89.35, True),
    'verso4':           ('zombie_voce', 99.25, 100.40, True),
    'ringhio':          ('zombie_ringhio', 0.0, 2.70, True),
    'respiro1':         ('zombie_respiro', 0.95, 3.40, True),
    'respiro2':         ('zombie_respiro', 5.15, 8.50, True),
    'colpo_corpo':      ('impatto_corpo', 3.49, 3.95, True),
    'colpo_testa':      ('impatto_testa', 0.04, 0.95, True),
    'corpo_cade':       ('corpo_cade', 1.10, 2.90, True),
    # --- Fucile a pompa (Mossberg 500A / Remington 870 veri)
    'pompa_sparo':      ('fucile_mossberg', 0.05, 1.25, False),
    'pompa_indietro':   ('pompa_remington', 0.09, 0.30, True),
    'pompa_avanti':     ('pompa_remington', 0.28, 0.55, True),
    'pompa_ciclo':      ('pompa_remington', 1.34, 1.80, True),
    'cartuccia':        ('cartuccia_inserita', 0.0, 0.064, True),
    # --- Mitragliatore (AK-47 vero, poligono)
    'ak_sparo':         ('ak47_poligono', 4.60, 5.40, False),
    'ak_sparo2':        ('ak47_poligono', 10.13, 10.95, False),
    'ak_sparo3':        ('ak47_poligono', 0.05, 0.95, False),
    'ak_sparo4':        ('ak47_poligono', 19.62, 20.50, False),
    'ak_sgancio':       ('ak_sgancio', 0.07, 0.55, True),
    'ak_inserimento':   ('akm_inserimento', 0.0, 0.377, True),
    'ak_otturatore':    ('ak_otturatore', 0.15, 0.80, True),
    # --- Granata e cambio arma
    'esplosione':       ('esplosione', 0.0, 3.5, True),
    'lancio':           ('lancio_swish', 2.10, 2.55, True),
    'granata_rimbalzo': ('lattina_coperchio', 8.82, 9.25, True),
    'arma_estrai':      ('fondina_glock', 1.02, 1.40, True),
    'arma_riponi':      ('fondina_glock', 2.64, 3.00, True),
    # --- Nemici
    'corridore_urlo':   ('urlo_demone', 0.05, 2.20, True),
    'corridore_urlo2':  ('urlo_zombie', 0.15, 2.40, True),
    'corsa1':           ('corsa_asfalto', 0.49, 0.64, True),
    'corsa2':           ('corsa_asfalto', 1.13, 1.28, True),
    'corsa3':           ('corsa_asfalto', 1.46, 1.61, True),
    'corsa4':           ('corsa_asfalto', 2.09, 2.24, True),
    'corsa5':           ('corsa_asfalto', 3.31, 3.46, True),
    'corsa6':           ('corsa_asfalto', 3.93, 4.08, True),
    'bruto_ruggito':    ('ruggito2', 0.25, 4.10, True),
    'bruto_ruggito2':   ('ruggito_mostro', 14.05, 15.60, True),
    'bruto_passo':      ('passo_pesante', 0.0, 0.60, True),
    'morso':            ('morso_mostro', 0.35, 1.35, True),
    'lamento':          ('lamento_strano', 0.05, 3.50, True),
    'soffoco':          ('soffoco', 0.30, 3.35, True),
    'nemico_raffica':   ('ak47_strada', 0.10, 3.40, True),
    'nemico_sparo':     ('ak47_poligono', 14.74, 15.50, True),
    'sibilo':           ('proiettile_sibilo', 0.0, 0.0795, True),
    'rimbalzo':         ('rimbalzo', 0.04, 0.90, True),
    # --- Giocatore
    'dolore1':          ('dolore_uomo', 0.05, 0.50, False),
    'dolore2':          ('grugniti_uomo', 4.07, 4.45, False),
    'dolore3':          ('grugniti_uomo', 7.60, 8.00, False),
    'battito':          ('battito', 0.70, 4.30, False),
    'io_passo1':        ('passi_asfalto', 1.045, 1.40, False),
    'io_passo2':        ('passi_asfalto', 4.185, 4.55, False),
    'io_passo3':        ('passi_asfalto', 4.805, 5.16, False),
    'io_passo4':        ('passi_asfalto', 5.475, 5.83, False),
    'raccogli':         ('zaino_zip', 0.93, 1.60, False),
    # --- Costruzioni
    'martello':         ('martello_chiodo', 0.95, 3.00, True),
    'legno_colpito':    ('cassa_rotta', 0.0, 0.35, True),
    'legno_rotto':      ('legno_rotto', 0.03, 1.00, True),
    'filo_spinato':     ('filo_spinato', 2.30, 5.30, True),
    # --- Ambiente di Velletri
    'fontana':          ('fontana', 30.0, 60.0, True),
    'campane':          ('campane', 0.10, 20.60, True),
    'cani':             ('cani_lontani', 0.0, 15.50, True),
    'civetta':          ('civetta', 0.60, 12.0, True),
    'sirena':           ('sirena', 0.90, 16.0, False),
    'orda':             ('orda', 9.80, 22.30, True),
    # Ambiente notturno (stereo, non spazializzato)
    'ambiente':         ('ambiente_notte', 20.0, 110.0, False),
    # passi su superfici diverse (battaglia reale): erba nel bosco, acqua alla fontana, ciottoli in piazza
    'erba1':            ('passi_erba', 0.06, 0.50, True),
    'erba2':            ('passi_erba', 0.77, 1.20, True),
    'erba3':            ('passi_erba', 1.45, 1.90, True),
    'erba4':            ('passi_erba', 3.02, 3.45, True),
    'acqua1':           ('passi_acqua', 0.10, 0.52, True),
    'acqua2':           ('passi_acqua', 3.11, 3.50, True),
    'acqua3':           ('passi_acqua', 3.83, 4.28, True),
    'acqua4':           ('passi_acqua', 6.81, 7.22, True),
    'sassi1':           ('passi_ciottoli', 6.21, 6.48, True),
    'sassi2':           ('passi_ciottoli', 7.16, 7.43, True),
    'sassi3':           ('passi_ciottoli', 8.40, 8.67, True),
    'sassi4':           ('passi_ciottoli', 10.07, 10.34, True),
}

# ambienti registrati in binaurale (stereo per cuffie): anelli senza giunture, in FLAC per non pesare troppo
# nome_uscita: (sorgente, inizio s, durata s)
ANELLI = {
    'amb_campagna': ('amb_campagna', 40.0, 50.0),
    'amb_bosco':    ('amb_bosco', 120.0, 40.0),
    'amb_uccelli':  ('amb_uccelli', 30.0, 45.0),
}
SOVRAPPOSIZIONE = 4.0

def anello(out, src, a, dur):
    import numpy as np
    path = next(p for p in (os.path.join(ORIG, f'{src}.{e}') for e in ('wav', 'flac', 'mp3')) if os.path.exists(p))
    sr = 48000
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(a), '-t', str(dur + SOVRAPPOSIZIONE), '-i', path, '-ac', '2', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, 2).copy()
    n, o = int(dur * sr), int(SOVRAPPOSIZIONE * sr)
    corpo, coda = x[:n].copy(), x[n:n + o]
    k = np.linspace(0, 1, len(coda))[:, None]
    corpo[:len(coda)] = corpo[:len(coda)] * np.sqrt(k) + coda * np.sqrt(1 - k)  # la fine sfuma nell'inizio
    corpo *= 0.7 / max(1e-6, np.abs(corpo).max())
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(sr), '-ac', '2', '-i', '-', '-c:a', 'flac', '-sample_fmt', 's16', os.path.join(OUT, out + '.flac')], input=corpo.astype(np.float32).tobytes(), check=True)
    print(f"{out:16s} <- {os.path.basename(path)} (anello)")

def sorgente(nome):
    for ext in ('wav', 'flac', 'aif', 'aiff', 'ogg'):
        p = os.path.join(ORIG, f'{nome}.{ext}')
        if os.path.exists(p):
            return p, True
    return glob.glob(os.path.join(SORG, nome + '.*'))[0], False

def main():
    for out, (src, a, dur) in ANELLI.items():
        if any(os.path.exists(os.path.join(ORIG, f'{src}.{e}')) for e in ('wav', 'flac', 'mp3')): anello(out, src, a, dur)
    for out, (src, a, b, mono) in TAGLI.items():
        if not any(os.path.exists(p) for p in [os.path.join(ORIG, f'{src}.{e}') for e in ('wav', 'flac', 'aif', 'aiff', 'ogg')] + glob.glob(os.path.join(SORG, src + '.*'))): continue
        path, originale = sorgente(src)
        # dalle anteprime compresse rifaccio solo i suoni che mancano: quelli già fatti dagli originali restano
        if not originale and os.path.exists(os.path.join(OUT, out + '.wav')): continue
        dur = b - a
        fade = min(0.004, dur / 10)
        filtri = [f'afade=t=in:d={fade}', f'afade=t=out:st={dur - min(0.03, dur / 5)}:d={min(0.03, dur / 5)}']
        if out in ('ambiente', 'fontana', 'battito', 'orda', 'sirena', 'civetta', 'cani', 'campane', 'filo_spinato'):
            fd = {'ambiente': 2, 'sirena': 2, 'battito': 0.03, 'fontana': 0.3}.get(out, min(1, dur / 6)); filtri = [f'afade=t=in:d={fd}', f'afade=t=out:st={dur - fd}:d={fd}']
        cmd = ['ffmpeg', '-v', 'error', '-y', '-ss', str(a), '-t', str(dur), '-i', path]
        if mono:
            cmd += ['-ac', '1']
        cmd += ['-af', ','.join(filtri), '-c:a', 'pcm_s24le', os.path.join(OUT, out + '.wav')]
        subprocess.run(cmd, check=True)
        print(f"{out:16s} <- {os.path.basename(path)}{' (ORIGINALE)' if originale else ''}")

if __name__ == '__main__':
    main()
