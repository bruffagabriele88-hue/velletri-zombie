'use strict';
// Realismo dell'audio nelle arene (battaglia reale e duello), per avvicinarsi a quello che si sente davvero:
// 1. chi sta dietro un muro si sente attutito;
// 2. uno sparo lontano arriva in due tempi: prima lo schiocco del proiettile che passa, poi il botto, con una coda che rimbomba;
// 3. gli echi tornano dai muri costruiti e dai luoghi dell'isola, ognuno col suo ritardo;
// 4. i passi cambiano col terreno: erba nel bosco, acqua alla fontana, ciottoli in piazza, legno sulle costruzioni;
// 5. il mio respiro dopo una corsa e il cuore che accelera quando sono sotto tiro;
// 6. effetto Doppler: proiettili e granate che passano cambiano tono mentre attraversano lo spazio;
// 7. ambienti registrati in binaurale (campagna, bosco, uccelli), da ascoltare in cuffia.

const Reale = { fiato: 0, stress: 0, prossimoRespiro: 0, inspira: true, prossimoBattito: 0, anelli: null, avviato: false };

// ---------------------------------------------------------------- suoni generati
function creaSuoniRealismo(ctx) {
  const sr = ctx.sampleRate;
  const crea = (durata, fn, canali = 1) => {
    const n = Math.floor(sr * durata), b = ctx.createBuffer(canali, n, sr);
    for (let c = 0; c < canali; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = fn(i / sr, durata, c); }
    return b;
  };
  // rumore filtrato (passa banda grezzo, fatto con due passa basso) per il respiro
  const respiro = (durata, centro, attacco) => {
    let a = 0, b2 = 0;
    const ka = 1 - Math.exp(-PI2 * centro * 1.6 / sr), kb = 1 - Math.exp(-PI2 * centro * 0.5 / sr);
    return crea(durata, (t, D) => {
      const r = Math.random() * 2 - 1; a += (r - a) * ka; b2 += (r - b2) * kb;
      const inv = Math.min(1, t / attacco) * Math.pow(Math.max(0, 1 - t / D), 1.5);
      return (a - b2) * inv * 1.6;
    });
  };
  return {
    // schiocco supersonico: il proiettile rompe il muro del suono vicino alla testa (onda a N, poi un attimo di fruscio)
    crack: crea(0.03, t => t < 0.0005 ? 1 - 2 * t / 0.0005 : (Math.random() * 2 - 1) * Math.exp(-(t - 0.0005) * 500) * 0.35),
    // inspirazione ed espirazione dopo una corsa
    inspira: respiro(0.55, 1300, 0.12),
    espira: respiro(0.5, 900, 0.04),
    // porta di legno che cigola: un tono che sale e scende, ruvido
    porta: crea(0.7, (t, D) => {
      const f = 420 + 160 * Math.sin(t * 9) + 90 * Math.sin(t * 23);
      const v = Math.sin(PI2 * f * t) + 0.5 * Math.sin(PI2 * f * 2.01 * t) + 0.3 * (Math.random() * 2 - 1);
      return v * 0.18 * Math.min(1, t * 20) * Math.pow(1 - t / D, 1.3) * (0.6 + 0.4 * Math.sin(t * 61));
    }),
    // battito del cuore: "tu-tum", due colpi bassi
    cuore: crea(0.4, t => {
      const c = (t0, f, a) => t > t0 ? Math.sin(PI2 * f * (t - t0)) * Math.exp(-(t - t0) * 30) * a : 0;
      return c(0, 48, 0.9) + c(0.16, 42, 0.6);
    }),
  };
}

// i tre ambienti binaurali, in FLAC (stereo, da ascoltare direttamente, senza spazializzazione)
async function caricaAmbientiReali() {
  try { await caricaInGruppi(['amb_campagna', 'amb_bosco', 'amb_uccelli'].map(n => [n, `suoni/${n}.flac?v=30`])); } catch (e) { /* senza ambienti si gioca lo stesso */ }
  // riverbero lungo e scuro per le code degli spari lontani, come in una valle
  const ctx = Audio3D.ctx, conv = ctx.createConvolver();
  conv.buffer = rispostaRiverbero(ctx, 3.2);
  const scuro = ctx.createBiquadFilter(); scuro.type = 'lowpass'; scuro.frequency.value = 1400;
  Audio3D.mandataLontana = ctx.createGain(); Audio3D.mandataLontana.gain.value = 0.5;
  Audio3D.mandataLontana.connect(scuro).connect(conv).connect(Audio3D.mondo);
}

// ---------------------------------------------------------------- 1. muri che attutiscono
function occludi(s, bloccato, dt) {
  if (!s) return;
  const prima = s.occl || 0;
  s.occl = prima + ((bloccato ? 1 : 0) - prima) * Math.min(1, dt * 8);
  if (Math.abs(s.occl - prima) > 0.002) s.ingresso.gain.setTargetAtTime(1 - 0.45 * s.occl, Audio3D.ctx.currentTime, 0.04);
}

// ---------------------------------------------------------------- 2. spari lontani
// Il proiettile viaggia a circa 850 metri al secondo, il suono a 343: chi spara da lontano verso di me
// lo sento prima schioccare accanto alla testa e solo dopo arriva il botto.
function schioccoProiettile(sx, sz, quando = 0) {
  const d = Math.hypot(G.x - sx, G.z - sz); if (d < 12 || !Audio3D.buf.crack) return;
  const rel = avvolgi(rottaVerso(G.x, G.z, sx, sz) - G.rotta), lato = Math.sin(rel) >= 0 ? 1 : -1;
  suonaVicino('crack', lato * caso(0.4, 1.2), caso(0.3, 1.5), 0.2, { gain: lim(0.5 + d / 120, 0.5, 1.1), quando: quando + d / 850, riverbero: 0.3 });
}
// la coda che rimbomba: più lontano è lo sparo, più conta rispetto al botto
function codaLontana(nome, d, forza) {
  if (d < 25 || !Audio3D.mandataLontana) return;
  suona(nome, { dest: Audio3D.mandataLontana, gain: forza * lim(d / 90, 0.25, 1), rate: 0.75, quando: d / 343 + 0.04 });
}

// ---------------------------------------------------------------- 3. echi veri nelle arene
// Ogni superficie riflette lo sparo verso di me: il ritardo è la strada in più che fa il suono.
const RIFLETTORI_ISOLA = [
  { x: 0, z: -62, k: 0.9 },                                       // il campanile, pietra alta
  { x: 0, z: 62, k: 0.55 }, { x: 62, z: 0, k: 0.35 },              // canile e fontana
  { x: -62, z: 0, k: 0.4, scuro: true },                           // il bosco: eco morbida
  { x: 16, z: 16, k: 0.5 }, { x: -16, z: 16, k: 0.5 }, { x: 16, z: -16, k: 0.5 }, { x: -16, z: -16, k: 0.5 }, // le case della piazza
];
function echiArena(nome, x, z, forza) {
  const L = Audio3D.ascoltatore, diretto = Math.hypot(x - L.x, z - L.z), ris = [];
  const superfici = [...(G.modalita === 'battaglia' ? RIFLETTORI_ISOLA : [])];
  for (const c of G.costruzioni) if (c.tipo === 'barricata' && c.vita > 0) superfici.push({ x: c.x, z: c.z, k: 0.6 });
  for (const R of superfici) {
    const strada = Math.hypot(x - R.x, z - R.z) + Math.hypot(R.x - L.x, R.z - L.z);
    if (strada - diretto < 4 || strada > 220) continue;
    ris.push({ R, strada, forza: forza * R.k * Math.min(1, 14 / strada) });
  }
  ris.sort((a, b) => b.forza - a.forza);
  for (const { R, strada, forza: f } of ris.slice(0, 4)) {
    suonaInPunto(nome, R.x, R.z, { quando: strada / 343, gain: f, rate: R.scuro ? 0.85 : 0.97, ref: Math.max(3, strada * 0.25), riverbero: 0.7 });
  }
}

// ---------------------------------------------------------------- 4. passi sul terreno
function superficie(x, z, livello) {
  if (G.modalita !== 'battaglia') return null;
  if ((livello || 0) > 0 || (typeof casaDi === 'function' && casaDi(x, z))) return 'legno';
  if (Math.hypot(x - LUOGHI.fontana.x, z - LUOGHI.fontana.z) < 8) return 'acqua';
  if (Math.hypot(x - LUOGHI.bosco.x, z - LUOGHI.bosco.z) < 30) return 'erba';
  if (Math.hypot(x, z) < 20) return 'sassi';
  return null;
}
// i campioni del terreno sono registrati più forti del passo base: questo è quanto abbassarli
const VOLUME_TERRENO = { erba: 0.16, acqua: 0.3, sassi: 0.2 };
// suona un passo: se il terreno è speciale usa le registrazioni di quel terreno, altrimenti il passo normale
function passoSulTerreno(base, x, z, livello, opz) {
  const sup = superficie(x, z, livello);
  if (sup && VOLUME_TERRENO[sup] && Audio3D.buf[`${sup}1`]) {
    return { nome: `${sup}${casoInt(1, 4)}`, opz: { ...opz, gain: opz.gain * VOLUME_TERRENO[sup] * (base.startsWith('corsa') ? 1.3 : 1), rate: caso(0.93, 1.07) * (base.startsWith('corsa') ? 1.08 : 1) } };
  }
  return { nome: base, opz, legno: sup === 'legno' };
}

// ---------------------------------------------------------------- 5. respiro e cuore
function stressa(quanto) { Reale.stress = Math.min(1, Reale.stress + quanto); }
function aggiornaCorpo(dt) {
  const corro = G.tempo - (G.ultimaCorsa || -9) < 0.25;
  Reale.fiato = lim(Reale.fiato + (corro ? dt / 14 : -dt / 11), 0, 1);
  const ferito = lim((45 - G.vita) / 45, 0, 1);
  Reale.stress = Math.max(0, Reale.stress - dt / 9);
  // respiro: dopo una corsa lunga si sente il fiato corto, più veloce e forte quanto più sono stanco
  if (Reale.fiato > 0.3 && G.tempo >= Reale.prossimoRespiro) {
    const f = Reale.fiato, nome = Reale.inspira ? 'inspira' : 'espira';
    suona(nome, { gain: 0.04 + 0.1 * f, rate: caso(0.92, 1.08) });
    Reale.prossimoRespiro = G.tempo + (Reale.inspira ? 0.5 : 0.35) + (1 - f) * 1.1 + caso(0, 0.15);
    Reale.inspira = !Reale.inspira;
  }
  // cuore: si sente quando sono sotto tiro, ferito o senza fiato, e accelera con la paura
  const livello = Math.max(Reale.stress, ferito, Reale.fiato * 0.6);
  if (livello > 0.3 && G.tempo >= Reale.prossimoBattito) {
    const bpm = 70 + 100 * livello;
    suona('cuore', { gain: 0.1 + 0.35 * (livello - 0.3), rate: 1 + livello * 0.15 });
    Reale.prossimoBattito = G.tempo + 60 / bpm;
  }
}

// ---------------------------------------------------------------- 6. Doppler
// Un oggetto che vola da un punto all'altro: si sposta davvero nello spazio e il tono cala mentre passa.
function volo(nome, x1, z1, x2, z2, durata, opz = {}) {
  if (!Audio3D.buf[nome]) return;
  const ctx = Audio3D.ctx, t0 = ctx.currentTime + (opz.quando || 0), s = creaSorgente({ ref: opz.ref || 1.2, riverbero: 0.1 });
  const p = s.panner, y = opz.y || 0.2;
  if (p.positionX) {
    p.positionX.setValueAtTime(x1, t0); p.positionY.setValueAtTime(y, t0); p.positionZ.setValueAtTime(z1, t0);
    p.positionX.linearRampToValueAtTime(x2, t0 + durata); p.positionZ.linearRampToValueAtTime(z2, t0 + durata);
  } else p.setPosition(x1, y, z1);
  const src = suona(nome, { dest: s.ingresso, gain: opz.gain || 1, quando: opz.quando || 0 });
  if (!src) return;
  // Doppler: si avvicina (tono più alto) e poi si allontana (più basso)
  const alto = opz.doppler || 1.18;
  src.playbackRate.setValueAtTime(alto, t0); src.playbackRate.linearRampToValueAtTime(2 - alto, t0 + durata);
  src.onended = () => chiudiSorgente(s);
}
// un proiettile che mi passa accanto, sparato da (sx, sz)
function proiettilePassa(sx, sz, quando = 0) {
  const d = Math.hypot(G.x - sx, G.z - sz) || 1, ux = (G.x - sx) / d, uz = (G.z - sz) / d;
  const lato = (Math.random() < 0.5 ? -1 : 1) * caso(0.6, 1.8), px = -uz * lato, pz = ux * lato;
  volo('sibilo', G.x - ux * 9 + px, G.z - uz * 9 + pz, G.x + ux * 9 + px, G.z + uz * 9 + pz, 0.2, { quando: quando + Math.max(0, d / 850 - 0.1), gain: 1.1, doppler: 1.22 });
  schioccoProiettile(sx, sz, quando);
}

// ---------------------------------------------------------------- 7. ambienti binaurali
function aggiornaAmbientiReali(attivo) {
  const A = Audio3D, ctx = A.ctx;
  if (!A.buf.amb_campagna || !A.mondo) return;
  if (!Reale.anelli) {
    Reale.anelli = {};
    for (const n of ['amb_campagna', 'amb_bosco', 'amb_uccelli']) {
      if (!A.buf[n]) continue;
      const g = ctx.createGain(); g.gain.value = 0; g.connect(A.mondo);
      const src = ctx.createBufferSource(); src.buffer = A.buf[n]; src.loop = true; src.connect(g); src.start(ctx.currentTime, Math.random() * 20);
      Reale.anelli[n] = g;
    }
  }
  let campagna = 0, bosco = 0, uccelli = 0;
  if (attivo && G.ambienteAcceso && G.modalita === 'battaglia') {
    const dBosco = Math.hypot(G.x - LUOGHI.bosco.x, G.z - LUOGHI.bosco.z);
    bosco = lim(1 - (dBosco - 20) / 50, 0, 1) * 0.5;
    const dentro = typeof casaDi === 'function' && casaDi(G.x, G.z);
    campagna = 0.3 * (1 - bosco * 0.6) * (B.cielo === 'bus' ? 0.2 : 1) * (dentro ? 0.35 : 1);
    if (dentro) bosco *= 0.35;
  } else if (attivo && G.ambienteAcceso && G.modalita === 'duello') uccelli = 0.22;
  const t = ctx.currentTime, R = Reale.anelli;
  if (R.amb_campagna) R.amb_campagna.gain.setTargetAtTime(campagna, t, 0.8);
  if (R.amb_bosco) R.amb_bosco.gain.setTargetAtTime(bosco, t, 0.8);
  if (R.amb_uccelli) R.amb_uccelli.gain.setTargetAtTime(uccelli, t, 0.8);
}

// ---------------------------------------------------------------- ogni fotogramma
function aggiornaRealismo(dt, inGioco) {
  if (!Audio3D.ctx) return;
  const attivo = inGioco && typeof inArena === 'function' && inArena();
  aggiornaAmbientiReali(attivo);
  if (attivo && !(G.modalita === 'battaglia' && (B.cielo || B.morto)) && !(G.modalita === 'duello' && D.fuori)) aggiornaCorpo(dt);
}
