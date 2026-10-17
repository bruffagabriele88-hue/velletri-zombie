'use strict';
// Motore audio: contesto ad alta frequenza, spazializzazione HRTF, riverbero di strada, suoni in loop.

const Audio3D = {
  ctx: null, master: null, mandataRiverbero: null, ambienteGain: null, buf: {},
  ascoltatore: { x: 0, z: 0, rotta: 0 },
};

const ELENCO_SUONI = [
  'sparo', 'sparo2', 'sparo3', 'ak_sparo3', 'ak_sparo4', 'bossolo', 'grilletto_vuoto', 'sgancio', 'caricatore_cade', 'inserimento', 'carrello',
  'passo1', 'passo2', 'passo3', 'passo4', 'passo5', 'passo6', 'verso1', 'verso2', 'verso3', 'verso4',
  'ringhio', 'respiro1', 'respiro2', 'colpo_corpo', 'colpo_testa', 'corpo_cade', 'ambiente',
  'pompa_sparo', 'pompa_indietro', 'pompa_avanti', 'pompa_ciclo', 'cartuccia',
  'ak_sparo', 'ak_sparo2', 'ak_sgancio', 'ak_inserimento', 'ak_otturatore',
  'esplosione', 'lancio', 'granata_rimbalzo', 'arma_estrai', 'arma_riponi',
  'corridore_urlo', 'corridore_urlo2', 'corsa1', 'corsa2', 'corsa3', 'corsa4', 'corsa5', 'corsa6',
  'bruto_ruggito', 'bruto_ruggito2', 'bruto_passo', 'morso', 'lamento', 'soffoco',
  'nemico_raffica', 'nemico_sparo', 'sibilo', 'rimbalzo',
  'dolore1', 'dolore2', 'dolore3', 'battito', 'io_passo1', 'io_passo2', 'io_passo3', 'io_passo4', 'raccogli',
  'martello', 'legno_colpito', 'legno_rotto', 'filo_spinato',
  'fontana', 'campane', 'cani', 'civetta', 'sirena', 'orda',
];

function creaContesto() {
  const AC = window.AudioContext || window.webkitAudioContext;
  for (const sr of [96000, 48000, undefined]) {
    try { return sr ? new AC({ sampleRate: sr, latencyHint: 'interactive' }) : new AC(); } catch (e) { /* prova il successivo */ }
  }
}

function rispostaRiverbero(ctx, durata = 1.6) {
  // Strada stretta di centro storico: prime riflessioni sulle facciate + coda scura
  const sr = ctx.sampleRate, n = Math.floor(sr * durata);
  const ir = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      lp += (Math.random() * 2 - 1 - lp) * (0.35 - 0.25 * Math.min(1, t / durata));
      d[i] = lp * Math.pow(1 - t / durata, 2.2) * Math.exp(-t * 2.2);
    }
    for (const [t, a] of [[0.011, 0.5], [0.019, 0.35], [0.031, 0.3], [0.047, 0.22], [0.066, 0.15], [0.09, 0.1]]) {
      d[Math.floor((t + c * 0.0023) * sr)] += a;
    }
  }
  return ir;
}

// Suono del radiofaro di navigazione: due note brevi, chiare e diverse da qualunque suono del gioco
function creaPing(ctx) {
  const sr = ctx.sampleRate, n = Math.floor(sr * 0.5), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const a = t < 0.12 ? Math.sin(PI2 * 1568 * t) * Math.exp(-t * 30) : 0;
    const t2 = t - 0.12;
    const c = t2 > 0 ? Math.sin(PI2 * 2093 * t2) * Math.exp(-t2 * 9) : 0;
    d[i] = 0.5 * (a + c) * Math.min(1, t * 2000);
  }
  return b;
}
// Suono breve di "incrocio" (non spaziale): due legni
function creaTic(ctx, f = 1200) {
  const sr = ctx.sampleRate, n = Math.floor(sr * 0.08), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) { const t = i / sr; d[i] = Math.sin(PI2 * f * t) * Math.exp(-t * 60) * 0.5; }
  return b;
}

// Carica i suoni otto alla volta, riprovando fino a tre volte quelli che non arrivano.
// Un suono che proprio non si carica viene saltato: il gioco parte lo stesso, senza quel suono.
async function caricaInGruppi(elenco, fatto) {
  const ctx = Audio3D.ctx;
  const uno = async ([nome, url]) => {
    for (let tentativo = 1; tentativo <= 3; tentativo++) {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        Audio3D.buf[nome] = await ctx.decodeAudioData(await r.arrayBuffer());
        break;
      } catch (e) {
        if (tentativo === 3) { console.error('suono non caricato', nome, e); if (typeof annota === 'function') annota(`suono non caricato: ${nome}`); }
        else await new Promise(r => setTimeout(r, 300 * tentativo));
      }
    }
    if (fatto) fatto();
  };
  let i = 0;
  const lavoratori = Array.from({ length: 8 }, async () => { while (i < elenco.length) await uno(elenco[i++]); });
  await Promise.all(lavoratori);
}

async function inizializzaAudio(avanzamento) {
  const A = Audio3D;
  A.ctx = creaContesto();
  const ctx = A.ctx;
  A.master = ctx.createGain(); A.master.gain.value = 0.9;
  const limitatore = ctx.createDynamicsCompressor(); // interviene solo sui picchi
  limitatore.threshold.value = -2; limitatore.knee.value = 0; limitatore.ratio.value = 20;
  limitatore.attack.value = 0.001; limitatore.release.value = 0.12;
  A.master.connect(limitatore).connect(ctx.destination);
  // "mondo": tutto ciò che sta fuori da me. Dopo un mio sparo si abbassa per un attimo, come fa l'orecchio vero.
  A.mondo = ctx.createGain(); A.mondo.connect(A.master);

  const riverbero = ctx.createConvolver();
  riverbero.buffer = rispostaRiverbero(ctx);
  A.mandataRiverbero = ctx.createGain(); A.mandataRiverbero.gain.value = 0.22;
  A.mandataRiverbero.connect(riverbero).connect(A.master);
  A.rumoreBreve = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
  { const d = A.rumoreBreve.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }

  A.ambienteGain = ctx.createGain(); A.ambienteGain.gain.value = 0.10;
  A.ambienteGain.connect(A.mondo);

  const L = ctx.listener;
  if (L.forwardX) {
    L.positionY.value = 0; L.forwardY.value = 0; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
  }
  aggiornaAscoltatore(0, 0, 0);

  A.buf.ping = creaPing(ctx);
  A.buf.tic = creaTic(ctx, 1200);
  A.buf.tic2 = creaTic(ctx, 800);
  Object.assign(A.buf, creaSuoniDuello(ctx));
  let fatti = 0;
  await caricaInGruppi(ELENCO_SUONI.map(nome => [nome, `suoni/${nome}.wav`]), () => { fatti++; if (avanzamento) avanzamento(fatti / ELENCO_SUONI.length); });
  // frasi dei nemici: voce -> categoria -> elenco di suoni
  try {
    A.voci = await (await fetch('suoni/voci/elenco.json')).json();
    const nomi = Object.values(A.voci).flatMap(c => Object.values(c).flat());
    await caricaInGruppi(nomi.map(nome => [nome, `suoni/voci/${nome}.wav`]));
  } catch (e) { console.error('voci non caricate', e); A.voci = {}; }
  console.log('Audio pronto a', ctx.sampleRate, 'Hz, HRTF');
}

function aggiornaAscoltatore(x, z, rotta) {
  const A = Audio3D, L = A.ctx.listener, t = A.ctx.currentTime;
  A.ascoltatore = { x, z, rotta };
  const [fx, fz] = avanti(rotta);
  if (L.forwardX) {
    L.positionX.setTargetAtTime(x, t, 0.01); L.positionZ.setTargetAtTime(z, t, 0.01);
    L.forwardX.setTargetAtTime(fx, t, 0.005); L.forwardZ.setTargetAtTime(fz, t, 0.005);
  } else {
    L.setPosition(x, 0, z);
    L.setOrientation(fx, 0, fz, 0, 1, 0);
  }
}

// Catena spaziale: ingresso -> filtro aria -> panner HRTF -> master (+ mandata al riverbero)
function creaSorgente(opz = {}) {
  const ctx = Audio3D.ctx;
  const ingresso = ctx.createGain();
  const aria = ctx.createBiquadFilter();
  aria.type = 'lowpass'; aria.frequency.value = 20000; aria.Q.value = 0.5;
  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = opz.ref || 1.5;
  panner.rolloffFactor = opz.rolloff || 1;
  panner.maxDistance = 200;
  ingresso.connect(aria).connect(panner).connect(opz.diretto ? Audio3D.master : Audio3D.mondo);
  const mandata = ctx.createGain();
  mandata.gain.value = opz.riverbero ?? 0.5;
  aria.connect(mandata).connect(Audio3D.mandataRiverbero);
  return { ingresso, aria, panner, mandata, x: 0, y: 0, z: 0, chiara: (opz.ref || 1.5) >= 5 };
}
function chiudiSorgente(s, dopo = 0) {
  setTimeout(() => { try { s.panner.disconnect(); s.mandata.disconnect(); } catch (e) { /* già chiusa */ } }, dopo * 1000);
}

function posiziona(s, x, y, z, subito = false) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return; // mai valori impossibili nel motore audio
  const A = Audio3D, p = s.panner, t = A.ctx.currentTime;
  s.x = x; s.y = y; s.z = z;
  if (p.positionX) {
    if (subito) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
    else { p.positionX.setTargetAtTime(x, t, 0.01); p.positionY.setTargetAtTime(y, t, 0.01); p.positionZ.setTargetAtTime(z, t, 0.01); }
  } else p.setPosition(x, y, z);
  const d = Math.hypot(x - A.ascoltatore.x, y, z - A.ascoltatore.z);
  s.aria.frequency.setTargetAtTime(20000 * Math.exp(-d / (s.chiara ? 90 : 30)), t, 0.05); // assorbimento dell'aria
}

function suona(nome, { dest, gain = 1, rate = 1, quando = 0, riverbero = 0, loop = false, offset = 0 } = {}) {
  const A = Audio3D, b = A.buf[nome]; if (!b) return null;
  const src = A.ctx.createBufferSource();
  src.buffer = b; src.playbackRate.value = rate; src.loop = loop;
  const g = A.ctx.createGain(); g.gain.value = gain;
  src.connect(g).connect(dest || A.master);
  if (riverbero) { const m = A.ctx.createGain(); m.gain.value = riverbero; g.connect(m).connect(A.mandataRiverbero); }
  src.start(A.ctx.currentTime + quando, offset);
  src.guadagno = g;
  return src;
}

// Suono una tantum in un punto del mondo
function suonaInPunto(nome, x, z, opz = {}) {
  const s = creaSorgente(opz);
  posiziona(s, x, opz.y ?? 0, z, true);
  const src = suona(nome, { ...opz, dest: s.ingresso });
  if (src) src.onended = () => chiudiSorgente(s);
  return src;
}
// Suono una tantum vicino a me: destra, avanti, alto in metri rispetto a dove guardo
function suonaVicino(nome, dx, df, alto, opz = {}) {
  const A = Audio3D.ascoltatore, [rx, rz] = destraDi(A.rotta), [fx, fz] = avanti(A.rotta);
  return suonaInPunto(nome, A.x + dx * rx + df * fx, A.z + dx * rz + df * fz, { ...opz, y: alto });
}

// Sorgente in loop in un punto fisso (fontane, campane...)
function loopInPunto(nome, x, z, gain, opz = {}) {
  const s = creaSorgente({ ref: opz.ref || 3, riverbero: 0.3 });
  posiziona(s, x, 0, z, true);
  s.src = suona(nome, { dest: s.ingresso, gain, loop: true, offset: Math.random() * (Audio3D.buf[nome]?.duration || 0) });
  return s;
}
function fermaLoop(s) { if (!s) return; try { s.src.stop(); } catch (e) { /* ferma */ } chiudiSorgente(s, 0.1); }

// ---------------------------------------------------------------- suono di puntamento
// Altezza: sale man mano che mi avvicino alla direzione del bersaglio; centrato = tono pieno e fisso.
// Pulsazione: tanto più rapida quanto più il bersaglio è vicino.
const Mira = { osc: null, osc2: null, arm: null, impulso: null, uscita: null, prossimo: 0, centrato: false, impulsi: [], freq: 220 };

function creaPuntamento() {
  const ctx = Audio3D.ctx;
  Mira.osc = ctx.createOscillator(); Mira.osc.type = 'sine';
  Mira.osc2 = ctx.createOscillator(); Mira.osc2.type = 'sine';
  Mira.arm = ctx.createGain(); Mira.arm.gain.value = 0;
  Mira.impulso = ctx.createGain(); Mira.impulso.gain.value = 0;
  Mira.uscita = ctx.createGain(); Mira.uscita.gain.value = 0.05;
  Mira.osc.connect(Mira.impulso);
  Mira.osc2.connect(Mira.arm).connect(Mira.impulso);
  Mira.impulso.connect(Mira.uscita).connect(Audio3D.master);
  Mira.osc.start(); Mira.osc2.start();
}

// bersaglio: {errore (rad, assoluto), distanza, centrato} oppure null per silenzio
function aggiornaPuntamento(bersaglio) {
  const t = Audio3D.ctx.currentTime;
  if (!bersaglio) {
    Mira.impulso.gain.cancelScheduledValues(t);
    Mira.impulso.gain.setTargetAtTime(0, t, 0.02);
    Mira.prossimo = 0; Mira.centrato = false;
    return;
  }
  Mira.centrato = bersaglio.centrato;
  const vicinanza = Math.pow(1 - bersaglio.errore / Math.PI, 2);          // 0 alle spalle, 1 davanti
  Mira.freq = Mira.centrato ? 880 : 220 * Math.pow(2, 2 * vicinanza) * 0.97;
  Mira.osc.frequency.setTargetAtTime(Mira.freq, t, 0.015);
  // sopra di me: una quinta in su che rende il suono più brillante; sotto: un'ottava in giù, più cupo
  const disl = bersaglio.dislivello || 0;
  Mira.osc2.frequency.setTargetAtTime(Mira.freq * (disl > 0 ? 1.5 : disl < 0 ? 0.5 : 2), t, 0.015);
  Mira.arm.gain.setTargetAtTime(Mira.centrato ? 0.35 : disl ? 0.45 : 0, t, 0.01);
  const k = Math.pow(lim((bersaglio.distanza - 1) / 29, 0, 1), 0.8);
  const intervallo = 0.07 + 0.63 * k;
  const durata = intervallo * (Mira.centrato ? 0.72 : 0.4);
  if (Mira.prossimo < t) Mira.prossimo = t + 0.02;
  while (Mira.prossimo < t + 0.1) {           // pianificazione in anticipo, a prova di scatti del frame
    const s = Mira.prossimo, g = Mira.impulso.gain;
    g.setValueAtTime(0, s);
    g.linearRampToValueAtTime(1, s + 0.006);
    g.setValueAtTime(1, s + durata - 0.012);
    g.linearRampToValueAtTime(0, s + durata);
    Mira.impulsi.push({ s, d: durata, centrato: Mira.centrato, freq: Mira.freq });
    Mira.prossimo = s + intervallo;
  }
  while (Mira.impulsi.length > 8) Mira.impulsi.shift();
}

// ---------------------------------------------------------------- musica di tensione
// Generata dal gioco: bordone cupo e tamburi bassi, al centro e sotto i 400 Hz,
// così non copre i suoni acuti da cui si capisce la direzione dei nemici.
// Più i nemici sono vicini e numerosi, più il ritmo accelera e il suono si apre.
const Musica = { attiva: true, gain: null, filtro: null, bordone: null, prossimo: 0, passo: 0, intensita: 0, rumore: null };

function creaMusica() {
  const ctx = Audio3D.ctx;
  Musica.gain = ctx.createGain(); Musica.gain.gain.value = 0.10;
  Musica.gain.connect(Audio3D.master);
  Musica.filtro = ctx.createBiquadFilter(); Musica.filtro.type = 'lowpass'; Musica.filtro.frequency.value = 180; Musica.filtro.Q.value = 3;
  Musica.bordone = ctx.createGain(); Musica.bordone.gain.value = 0;
  for (const [f, tipo] of [[55, 'sawtooth'], [55.35, 'sawtooth'], [82.4, 'triangle'], [41.2, 'sine']]) {
    const o = ctx.createOscillator(); o.type = tipo; o.frequency.value = f; o.connect(Musica.filtro); o.start();
  }
  Musica.filtro.connect(Musica.bordone).connect(Musica.gain);
  const n = Math.floor(ctx.sampleRate * 0.2), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  Musica.rumore = b;
}

function tamburo(t, f0, f1, durata, forza) {
  const ctx = Audio3D.ctx, o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + durata * 0.6);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(forza, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + durata);
  o.connect(g).connect(Musica.gain); o.start(t); o.stop(t + durata + 0.05);
}
function spazzola(t, forza) {
  const ctx = Audio3D.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = Musica.rumore; f.type = 'bandpass'; f.frequency.value = 300; f.Q.value = 1.5;
  g.gain.setValueAtTime(forza, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  s.connect(f).connect(g).connect(Musica.gain); s.start(t);
}

// intensita da 0 (calma) a 1 (circondato)
function aggiornaMusica(intensita) {
  if (!Musica.gain) return;
  const ctx = Audio3D.ctx, t = ctx.currentTime, M = Musica;
  M.intensita += (Math.max(0, intensita) - M.intensita) * 0.03;
  const zitta = !M.attiva || intensita < 0;
  const I = zitta ? 0 : M.intensita;
  M.bordone.gain.setTargetAtTime(zitta ? 0 : 0.10 + 0.25 * I, t, 0.5);
  M.filtro.frequency.setTargetAtTime(150 + 450 * I, t, 0.5);
  if (zitta) { M.prossimo = 0; return; }
  const ottavo = 60 / (64 + 76 * I) / 2;
  if (M.prossimo < t) M.prossimo = t + 0.05;
  while (M.prossimo < t + 0.15) {
    const s = M.prossimo, k = M.passo % 16;
    if (k === 0 || k === 8 || (I > 0.45 && (k === 6 || k === 14))) tamburo(s, 95, 38, 0.45, 0.9);
    if (I > 0.2 && (k === 4 || k === 12)) tamburo(s, 150, 90, 0.25, 0.45);
    if (I > 0.65 && k % 2 === 1) spazzola(s, 0.12 + 0.1 * I);
    M.passo++; M.prossimo += ottavo;
  }
}
// colpo di tamburo profondo a inizio ondata
function colpoInizio() {
  if (!Musica.gain) return;
  const t = Audio3D.ctx.currentTime + 0.05;
  tamburo(t, 70, 28, 1.8, 1.3); tamburo(t + 0.5, 70, 28, 1.8, 1.0);
}

// ---------------------------------------------------------------- realismo degli spari
// Uno sparo vero non è un solo suono: c'è lo schiocco secco, il botto basso che si sente nel petto,
// la meccanica dell'arma, gli echi che tornano dalle facciate dei palazzi e l'orecchio che per un attimo si chiude.

// botto basso (pressione dello sparo)
function bottoBasso(f0, f1, durata, forza, quando = 0) {
  const ctx = Audio3D.ctx, t = ctx.currentTime + quando, o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + durata * 0.7);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(forza, t + 0.003); g.gain.exponentialRampToValueAtTime(0.001, t + durata);
  o.connect(g).connect(Audio3D.master); o.start(t); o.stop(t + durata + 0.05);
}
// schiocco secco iniziale (transiente acuto che le registrazioni compresse perdono)
function schiocco(forza, quando = 0) {
  const ctx = Audio3D.ctx, t = ctx.currentTime + quando, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = Audio3D.rumoreBreve; f.type = 'highpass'; f.frequency.value = 2500;
  g.gain.setValueAtTime(forza, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
  s.connect(f).connect(g).connect(Audio3D.master); s.start(t); s.stop(t + 0.03);
}
// l'orecchio si chiude per un attimo dopo il mio sparo; col fucile a pompa resta un leggero fischio
function orecchie(forza) {
  const ctx = Audio3D.ctx, t = ctx.currentTime, g = Audio3D.mondo.gain;
  g.cancelScheduledValues(t);
  g.setTargetAtTime(1 - 0.5 * forza, t, 0.004);
  g.setTargetAtTime(1, t + 0.09 + 0.1 * forza, 0.18 + 0.25 * forza);
  if (forza >= 0.9) {
    const o = ctx.createOscillator(), gg = ctx.createGain();
    o.frequency.value = 4300; gg.gain.setValueAtTime(0.006, t + 0.05); gg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(gg).connect(Audio3D.master); o.start(t + 0.05); o.stop(t + 1.7);
  }
}
// echi dello sparo sulle facciate: tre riflessioni a distanze diverse, sempre le stesse per ogni luogo
function echiStrada(nome, x, z, forza, quanti = 3) {
  const cx = Math.floor(x / 20), cz = Math.floor(z / 20);
  let seme = Math.abs((cx * 73856093) ^ (cz * 19349663)) % 2147483647 || 1;
  const rnd = () => (seme = (seme * 16807) % 2147483647) / 2147483647;
  const base = rnd() * PI2;
  for (const [ang, dMin, dMax, k] of [[0, 14, 28, 0.55], [Math.PI * (0.8 + rnd() * 0.4), 22, 45, 0.45], [Math.PI * (0.4 + rnd() * 0.3), 55, 110, 0.35]].slice(0, quanti)) {
    const d = dMin + rnd() * (dMax - dMin), [fx, fz] = avanti(base + ang);
    suonaInPunto(nome, x + fx * d, z + fz * d, { quando: 2 * d / 343, gain: forza * k, rate: 0.96, ref: d * 0.6, riverbero: 0.9 });
  }
}
// sparo di qualcun altro, sentito da lontano: arriva in ritardo (il suono viaggia a 343 metri al secondo), più scuro, con i suoi echi
function sparoLontano(nome, x, z, sorgente, forza = 1, echi = true) {
  const A = Audio3D.ascoltatore, d = Math.hypot(x - A.x, z - A.z), ritardo = d / 343;
  const opz = { gain: 1.3 * forza, rate: caso(0.97, 1.03), quando: ritardo, riverbero: 0.8 };
  if (sorgente) suona(nome, { ...opz, dest: sorgente.ingresso }); else suonaInPunto(nome, x, z, { ...opz, ref: 5 });
  if (echi) echiStrada(nome, x, z, 0.35 * forza);
}

// ---------------------------------------------------------------- suoni generati per il duello
function creaSuoniDuello(ctx) {
  const sr = ctx.sampleRate;
  const crea = (durata, fn) => { const n = Math.floor(sr * durata), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = fn(i / sr, durata); return b; };
  return {
    // zona che si chiude: ronzio elettrico minaccioso, in loop
    zona: crea(2, t => (Math.sin(PI2 * 58 * t) * 0.5 + Math.sin(PI2 * 116 * t + Math.sin(PI2 * 7 * t)) * 0.3 + Math.sin(PI2 * 232 * t) * 0.12 * (0.5 + 0.5 * Math.sin(PI2 * 3 * t))) * 0.6),
    // cassa a terra: tre note calde che si ripetono, diverse da ogni altro suono
    cassa_ping: crea(0.6, t => { const k = Math.floor(t / 0.14), f = [523, 659, 784][Math.min(k, 2)], tl = t - Math.min(k, 2) * 0.14; return Math.sin(PI2 * f * t) * Math.exp(-tl * 14) * 0.5; }),
    // cassa che scende col paracadute: fischio che cala per tre secondi
    cassa_cade: crea(3, (t, D) => Math.sin(PI2 * (1400 * t - 180 * t * t)) * 0.25 * Math.min(1, t * 8) * Math.min(1, (D - t) * 6) * (0.7 + 0.3 * Math.sin(PI2 * 9 * t))),
    // colpo assorbito dallo scudo
    scudo_colpo: crea(0.25, t => Math.sin(PI2 * (1800 - 4000 * t) * t) * Math.exp(-t * 18) * 0.5),
    // fanfara di vittoria: quattro note che salgono
    vittoria: crea(2.2, t => { const n = [392, 523, 659, 784, 1047], k = Math.min(4, Math.floor(t / 0.22)), tl = t - k * 0.22; return (Math.sin(PI2 * n[k] * t) * 0.35 + Math.sin(PI2 * n[k] * 2 * t) * 0.12 + Math.sin(PI2 * n[k] * 1.5 * t) * 0.1) * Math.exp(-tl * (k === 4 ? 1.6 : 5)); }),
    // caduta dal cielo: vento che fischia
    caduta: crea(3, (t, D) => (Math.random() * 2 - 1) * 0.25 * Math.min(1, t * 3) * Math.min(1, (D - t) * 4) * (0.6 + 0.4 * Math.sin(PI2 * (2 + t) * t))),
    // conferma del colpo: tic secco; alla testa un "ding" a due note; scudo spaccato: vetro
    colpito_marker: crea(0.06, t => Math.sin(PI2 * 2600 * t) * Math.exp(-t * 90) * 0.45),
    testa_marker: crea(0.25, t => (Math.sin(PI2 * 1760 * t) + 0.6 * Math.sin(PI2 * 3520 * t)) * Math.exp(-t * 16) * 0.35),
    scudo_rotto: crea(0.5, t => ((Math.random() * 2 - 1) * Math.exp(-t * 22) * 0.5 + Math.sin(PI2 * 4200 * t) * Math.exp(-t * 8) * 0.15 + Math.sin(PI2 * 5300 * t) * Math.exp(-t * 10) * 0.12)),
    // sonar della modalità ascolto
    sonar: crea(0.35, t => Math.sin(PI2 * 1100 * t) * Math.exp(-t * 11) * 0.6 * Math.min(1, t * 400)),
    // vetro che va in mille pezzi: lo schianto e poi i frammenti che tintinnano cadendo
    vetro_rotto: crea(1.6, t => {
      const schianto = (Math.random() * 2 - 1) * Math.exp(-t * 14) * 0.7;
      let tintinni = 0;
      for (let k = 0; k < 9; k++) { const t0 = 0.04 + k * 0.13 + (k * 0.037) % 0.09; if (t > t0) tintinni += Math.sin(PI2 * (3200 + k * 410) * (t - t0)) * Math.exp(-(t - t0) * 30) * 0.18; }
      return schianto + tintinni;
    }),
    // bip della granata innescata
    bip_granata: crea(0.07, t => Math.sin(PI2 * 2100 * t) * Math.min(1, t * 600) * Math.min(1, (0.07 - t) * 300) * 0.45),
    // luccichio magico di un forziere vicino: campanelle che salgono e un soffio d'aria
    luccichio: crea(1.5, t => {
      let v = (Math.random() * 2 - 1) * 0.03 * Math.sin(Math.PI * t / 1.5);
      const note = [2093, 2637, 3136, 3951, 4186, 3520];
      for (let k = 0; k < note.length; k++) { const t0 = k * 0.17; if (t > t0) v += Math.sin(PI2 * note[k] * (t - t0)) * Math.exp(-(t - t0) * 5) * 0.14; }
      return v;
    }),
    scudo_su: crea(0.5, t => Math.sin(PI2 * (300 + 900 * t) * t) * Math.sin(Math.PI * t / 0.5) * 0.4),
  };
}

// Nel duello il missaggio è "essenziale": restano solo i suoni che servono a giocare,
// e quelli che dicono dove sono avversari e casse sono più forti di tutto il resto.
function mixEssenziale() { return typeof G !== 'undefined' && (G.modalita === 'duello' || G.modalita === 'battaglia'); }
// modalità con arena aperta e muri che fermano i proiettili
function inArena() { return G.modalita === 'duello' || G.modalita === 'battaglia'; }
