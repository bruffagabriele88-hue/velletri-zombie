'use strict';
// Battaglia reale: tu contro undici combattenti guidati dal computer, su un'isola di 95 metri di raggio.
// Ci si lancia in uno dei cinque luoghi, si aprono i forzieri, si costruisce, si scappa dalla tempesta.
// Ne resta uno solo. Tutto si capisce con le orecchie: i luoghi hanno un loro suono, i forzieri chiamano,
// gli avversari si sentono camminare, sparare e parlare dal punto in cui si trovano.

const B = {
  attiva: false, lancio: 'piazza', bot: [], morto: false, eliminazioni: 0, ultimoAggressore: null,
  zona: { cx: 0, cz: 0, r: 95 }, prossima: null, da: null, fase: 0, stadio: 'attesa', fine: 0,
  sorgTempesta: null, fontana: null, prossimoDanno: 0, eroFuori: false, prossimoLuogo: 0, prossimaVoce: 0,
};
const RAGGIO_ISOLA = 95;
const LUOGHI = {
  piazza: { nome: 'Piazza', x: 0, z: 0, forzieri: 13 },
  campanile: { nome: 'Campanile', x: 0, z: -62, forzieri: 9, suono: 'campane', ogni: 40, ref: 22, gain: 0.35 },
  fontana: { nome: 'Fontana', x: 62, z: 0, forzieri: 6 },
  canile: { nome: 'Canile', x: 0, z: 62, forzieri: 9, suono: 'cani', ogni: 22, ref: 14, gain: 0.6 },
  bosco: { nome: 'Bosco', x: -62, z: 0, forzieri: 9, suono: 'civetta', ogni: 16, ref: 12, gain: 0.6 },
};
// l'isola resta tutta aperta per due minuti dopo l'atterraggio, poi la tempesta comincia a restringerla
const FASI_TEMPESTA = [{ a: 120, c: 40, r: 60, d: 2 }, { a: 40, c: 30, r: 32, d: 4 }, { a: 25, c: 25, r: 14, d: 7 }, { a: 12, c: 20, r: 0, d: 10 }];
const RARITA = [[1, 'comune', 50], [1.15, 'raro', 30], [1.3, 'epico', 15], [1.5, 'leggendario', 5]];
const NOMI_BOT = ['Rocko', 'Vipera', 'Sandy', 'Lupo', 'Flo', 'Tank', 'Shelley', 'Bruno', 'Eddy', 'Nina', 'Reed'];
const ORDINALI = ['primo', 'secondo', 'terzo', 'quarto', 'quinto', 'sesto', 'settimo', 'ottavo', 'nono', 'decimo', 'undicesimo', 'dodicesimo'];
// come combattono gli avversari con ogni arma
const ARMI_BOT = {
  pistola: { suoni: ['sparo', 'sparo2', 'sparo3'], danno: 15, cadenza: 0.65, prob: 0.5, portata: 35, distanza: 10, valore: 1 },
  pompa: { suoni: ['pompa_sparo'], danno: 42, cadenza: 1.3, prob: 0.75, portata: 13, distanza: 5, valore: 2 },
  mitra: { suoni: ['ak_sparo', 'ak_sparo2', 'ak_sparo3'], danno: 10, cadenza: 0.16, raffica: 4, pausa: 1.1, prob: 0.4, portata: 45, distanza: 14, valore: 3 },
  piccone: { mischia: true, danno: 20, cadenza: 0.7, prob: 0.6, portata: 2.4, distanza: 1.2, valore: 0 },
  precisione: { suoni: ['ak_sparo4'], danno: 65, cadenza: 2.4, prob: 0.5, portata: 80, distanza: 30, valore: 3 },
};

function nomeRarita(m) { return (RARITA.find(r => r[0] === m) || RARITA[0])[1]; }
function raritaCasuale() { let r = Math.random() * 100; for (const [m, , peso] of RARITA) { if (r < peso) return m; r -= peso; } return 1; }
function contenutoForziere() {
  const r = Math.random();
  if (r < 0.62) return { cont: scegli(['pompa', 'mitra', 'mitra', 'precisione', 'pistola', 'pompa']), rar: raritaCasuale(), materiali: 15 };
  if (r < 0.78) return { cont: 'pozione', materiali: 5 };
  if (r < 0.90) return { cont: scegli(['kit', 'bende']), materiali: 5 };
  if (r < 0.93) return { cont: 'granate', materiali: 5 };
  if (r < 0.98) return { cont: 'radar', materiali: 5 };
  return { cont: 'materiali', materiali: 0 };
}
function nuovoForziere(x, z, c) { return { id: Math.random().toString(36).slice(2), x, z, ...c, aTerra: true, prossimoPing: 0, detta: false }; }
function attorno(x, z, r) { const a = caso(-Math.PI, Math.PI), d = Math.sqrt(Math.random()) * r; return [x + Math.sin(a) * d, z - Math.cos(a) * d]; }

function leggiStatBR() { try { return JSON.parse(localStorage.getItem('vz_battaglia')) || { vittorie: 0, partite: 0 }; } catch (e) { return { vittorie: 0, partite: 0 }; } }
function salvaStatBR(s) { try { localStorage.setItem('vz_battaglia', JSON.stringify(s)); } catch (e) { /* non disponibile */ } }

// ---------------------------------------------------------------- avvio
const DIFFICOLTA = {
  facile: { nome: 'facile', bot: 7, prec: 0.6, cono: 2.2, reazione: 1.6 },
  normale: { nome: 'normale', bot: 11, prec: 1, cono: 1.7, reazione: 1 },
  difficile: { nome: 'difficile', bot: 11, prec: 1.3, cono: 1.25, reazione: 0.75 },
};
async function battagliaAvvia(lancio, difficolta) {
  B.diff = DIFFICOLTA[difficolta] || B.diff || DIFFICOLTA.normale;
  G.stato = 'caricamento'; aggiornaPannello();
  G.citta = CENTRO_VELLETRI; G.osm = null;
  await preparaMappa();
  pulisciPartita();
  G.modalita = 'battaglia'; G.pos = null; G.ondata = null;
  G.tempo = 0; G.campo = null; G.uccisi = 0; G.punti = 0; G.serie = { n: 0, fino: 0 }; G.ultimaFerita = -99; G.prossimaSpinta = 0;
  G.vita = 100; G.scudo = 0; G.alto = false; G.rampaSotto = null; G.cx = 0; G.cz = 0; G.velocitaExtra = 1;
  // come in Fortnite si parte col solo piccone: le armi si trovano nei forzieri
  G.arsenale = nuovoArsenale(null);
  G.arsenale.armi = { piccone: { caricatore: 0, camera: 0 } }; G.arsenale.corrente = 'piccone';
  G.arsenale.riserva = { '9mm': 0, cal12: 0, '762': 0, '308': 0 };
  G.inventario = { granate: 0, kit: 0, cibo: 2, materiali: 40, pozioni: 0, radar: 0 };
  G.livello = 0; G.prossimaTurbo = 0;
  D.trappole = []; D.radarFino = 0;
  B.lancio = lancio; B.attiva = true; B.morto = false; B.eliminazioni = 0; B.ultimoAggressore = null;
  B.zona = { cx: 0, cz: 0, r: RAGGIO_ISOLA }; B.fase = 0; B.stadio = 'attesa'; B.fine = FASI_TEMPESTA[0].a + 4; B.eroFuori = false;
  B.prossima = prossimaZona(); B.annunciata = false; B.granateVive = [];

  // forzieri nei cinque luoghi
  D.casse = [];
  for (const L of Object.values(LUOGHI)) for (let i = 0; i < L.forzieri; i++) { const [x, z] = attorno(L.x, L.z, 13); D.casse.push(nuovoForziere(x, z, contenutoForziere())); }
  // altri forzieri sparsi per l'isola, lontano dai cinque luoghi
  for (let i = 0; i < 32; i++) { const [x, z] = attorno(0, 0, 88); D.casse.push(nuovoForziere(x, z, contenutoForziere())); }
  B.prossimaCassa = 25;
  creaCaseDiVetro();

  // io: parto sul bus, sopra l'isola
  const mio = LUOGHI[lancio] || LUOGHI.piazza;
  preparaBus(mio);

  // gli undici avversari: almeno due atterrano dove atterro io, così c'è subito da fare
  const chiavi = Object.keys(LUOGHI), voci = Object.keys(Audio3D.voci || {});
  const atterraggi = [lancio, 'piazza', 'piazza', 'piazza', 'campanile', 'campanile', 'fontana', 'fontana', 'canile', 'canile', 'bosco', 'bosco'].filter((k, i) => !(i > 1 && k === lancio && Math.random() < 0.5));
  B.bot = NOMI_BOT.slice(0, B.diff.bot).map((nome, i) => {
    const L = LUOGHI[atterraggi[i % atterraggi.length]] || LUOGHI[scegli(chiavi)];
    let [x, z] = attorno(L.x, L.z, 14);
    if (Math.hypot(x - mio.x, z - mio.z) < 9) { x += 10; z += 6; }
    const b = {
      bot: true, tipo: 'soldato', def: { nome, raggio: 0.35 }, nome, x, z, vita: 100, scudo: 0, vivo: true, udito: false, ultimoSuono: -99,
      allertato: false, allertaFino: 0, occluso: false, occlusione: 0, alto: false, carica: false, stordito: 0, fase: Math.random() * 9, morteT: 0,
      sorgente: creaSorgente({ ref: 9, rolloff: 0.8, riverbero: 0.15 }), voce: voci.length ? voci[i % voci.length] : null, tono: caso(0.94, 1.06),
      arma: 'piccone', rar: 1, materiali: 40, livello: 0, granate: Math.random() < 0.5 ? 1 : 0, bersaglio: null, prossimoPensiero: caso(0, 0.5), prossimoSparo: 4 + caso(0, 2), colpiRaffica: 0,
      colpi: 0, passo: caso(0.88, 1.12), coraggio: caso(0.2, 0.5), sospetto: null, ingaggioT: 0,
      inAria: true, atterraA: caso(4, B.bus.durata) + caso(7, 11),
      meta: null, prossimaMeta: 0, forziere: null, apreFino: 0, prossimoPasso: 0, prossimaCura: 20, ultimoAggressore: null, bravura: caso(0.75, 1.1), lato: Math.random() < 0.5 ? -1 : 1,
    };
    posiziona(b.sorgente, x, 0, z, true);
    return b;
  });
  G.nemici = [...B.bot];

  B.fontana = loopInPunto('fontana', LUOGHI.fontana.x, LUOGHI.fontana.z, 0.35, { ref: 5 });
  B.sorgTempesta = creaSorgente({ ref: 3, riverbero: 0.2 });
  B.sorgTempesta.src = suona('zona', { dest: B.sorgTempesta.ingresso, gain: 0, loop: true });
  B.prossimoLuogo = 6;

  aggiornaAscoltatore(G.x, G.z, G.rotta);
  avviaAmbiente();
  G.stato = 'gioco'; G.pausa = document.pointerLockElement !== tela;
  avviaBus();
  parla(`${G.pausa ? 'Clicca per partire. ' : ''}Sei sul bus della battaglia, ${B.bus.verso}. Vuoi atterrare a ${mio.nome}: ti dico io quando saltare. Spazio per saltare.`, 2);
  aggiornaPannello();
}

// ---------------------------------------------------------------- il bus e la caduta
// Come in Fortnite: il bus attraversa l'isola in linea retta, si salta con Spazio, si cade in picchiata
// e poi si apre il deltaplano. Durante la caduta W va avanti, il mouse e le frecce girano.
// Un segnale sonoro arriva dal luogo scelto, così si sa dove planare.
const BUS = { quota: 110, velocita: 15, raggio: 118, picchiata: 24, vela: 6, apriA: 35, avantiPicchiata: 22, avantiVela: 12 };

function preparaBus(meta) {
  // una rotta dritta che passa a non più di 25 metri dal centro
  const a = caso(-Math.PI, Math.PI), [ux, uz] = avanti(a), [px, pz] = destraDi(a), o = caso(-25, 25);
  const ax = px * o - ux * BUS.raggio, az = pz * o - uz * BUS.raggio;
  const durata = 2 * BUS.raggio / BUS.velocita;
  // il momento migliore per saltare: quando il bus passa più vicino al luogo scelto, un po' prima
  const tMeglio = lim(((meta.x - ax) * ux + (meta.z - az) * uz) / BUS.velocita - 2.5, 1, durata - 1);
  B.bus = { ax, az, ux, uz, rotta: a, durata, t: 0, tMeglio, detto: false, prossimoTic: 0, verso: `da ${puntoCardinale(a + Math.PI)} verso ${puntoCardinale(a)}` };
  B.meta = meta; B.cielo = 'bus'; B.quota = BUS.quota; B.atterratoA = 1e9;
  G.x = ax; G.z = az; G.rotta = a; G.occupatoFino = Infinity;
}

function avviaBus() {
  const ctx = Audio3D.ctx, t = ctx.currentTime, uscita = ctx.createGain();
  uscita.gain.setValueAtTime(0, t); uscita.gain.linearRampToValueAtTime(0.22, t + 1.5);
  const filtro = ctx.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = 380; filtro.Q.value = 2;
  filtro.connect(uscita).connect(Audio3D.master);
  // motore: due onde a dente di sega leggermente stonate, più il rombo dell'aria
  const osc = [52, 53.3, 104.5].map((f, i) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = i === 2 ? 0.25 : 0.5; o.connect(g).connect(filtro); o.start(t); return o; });
  B.suonoBus = { uscita, osc, vento: ventoContinuo(0.05) };
  // il clacson del bus
  clacson(t + 0.6); clacson(t + 1.0);
}
function clacson(quando) {
  const ctx = Audio3D.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 1800; g.gain.setValueAtTime(0, quando);
  g.gain.linearRampToValueAtTime(0.12, quando + 0.02); g.gain.setValueAtTime(0.12, quando + 0.28); g.gain.linearRampToValueAtTime(0, quando + 0.34);
  for (const fr of [349, 440]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr; o.connect(f); o.start(quando); o.stop(quando + 0.36); }
  f.connect(g).connect(Audio3D.master);
}
// il vento durante il volo: rumore filtrato, il volume e il timbro seguono la velocità
function ventoContinuo(volume) {
  const ctx = Audio3D.ctx, n = ctx.sampleRate * 2, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.7;
  const g = ctx.createGain(); g.gain.value = volume;
  src.connect(f).connect(g).connect(Audio3D.master); src.start();
  return { src, f, g };
}
function fermaSuonoBus() {
  const S = B.suonoBus; if (!S) return;
  const t = Audio3D.ctx.currentTime;
  S.uscita.gain.setTargetAtTime(0, t, 0.3); S.vento.g.gain.setTargetAtTime(0, t, 0.3);
  setTimeout(() => { try { S.osc.forEach(o => o.stop()); S.vento.src.stop(); } catch (e) { /* già fermi */ } }, 1500);
  B.suonoBus = null;
}

// Spazio sul bus: salto
function saltaDalBus() {
  if (B.cielo !== 'bus') return;
  B.cielo = 'caduta'; B.prossimaGuida = G.tempo + 0.3; B.prossimaFrase = G.tempo + 4;
  const S = B.suonoBus;
  if (S) { const t = Audio3D.ctx.currentTime; S.uscita.gain.setTargetAtTime(0, t, 0.4); S.vento.g.gain.setTargetAtTime(0.35, t, 0.2); S.vento.f.frequency.setTargetAtTime(900, t, 0.3); }
  suona('lancio', { gain: 0.9, rate: 0.7 });
  parla(`Salto! ${guidaCielo()} Tieni W per andare avanti.`, 1);
}

function guidaCielo() {
  const L = B.meta, d = Math.hypot(L.x - G.x, L.z - G.z);
  if (d < 6) return `${L.nome} sotto di te.`;
  return `${L.nome} ${direzioneRelativa(avvolgi(rottaVerso(G.x, G.z, L.x, L.z) - G.rotta))}, ${metri(d)}.`;
}
// tasto O in volo
function cieloInfo() {
  if (B.cielo === 'bus') {
    const manca = B.bus.tMeglio - B.bus.t;
    parla(manca > 0.5 ? `Salta tra ${Math.round(manca)} secondi per ${B.meta.nome}.` : `Salta adesso per ${B.meta.nome}!`, 1);
  } else parla(`${guidaCielo()} Altezza ${Math.round(B.quota)} metri${B.quota < BUS.apriA ? ', deltaplano aperto' : ''}.`, 1);
}

function aggiornaCielo(dt) {
  if (B.cielo === 'bus') {
    const U = B.bus;
    U.t += dt;
    G.x = U.ax + U.ux * BUS.velocita * U.t; G.z = U.az + U.uz * BUS.velocita * U.t;
    // un tic che accelera mentre ci si avvicina al momento giusto, poi l'avviso a voce
    const manca = U.tMeglio - U.t;
    if (G.tempo >= U.prossimoTic && manca > 0) { suona('tic', { gain: 0.35, rate: 1 + lim(1 - manca / 10, 0, 1) * 0.6 }); U.prossimoTic = G.tempo + lim(manca / 6, 0.2, 1.2); }
    if (!U.detto && manca <= 0) { U.detto = true; suona('cassa_ping', { gain: 0.9 }); parla(`Salta adesso per ${B.meta.nome}! Spazio.`, 2); }
    if (U.t >= U.durata - 0.5) { parla('Fine della corsa, ti butto giù io.', 1); saltaDalBus(); }
    return;
  }
  // caduta: prima in picchiata, poi col deltaplano
  const vela = B.quota < BUS.apriA;
  if (vela && !B.velaAperta) {
    B.velaAperta = true; suona('raccogli', { gain: 0.8, rate: 1.2 }); suona('lancio', { gain: 0.6, rate: 0.5 });
    const S = B.suonoBus; if (S) { const t = Audio3D.ctx.currentTime; S.vento.g.gain.setTargetAtTime(0.16, t, 0.3); S.vento.f.frequency.setTargetAtTime(420, t, 0.3); }
    parla('Deltaplano aperto.', 0);
  }
  B.quota -= (vela ? BUS.vela : BUS.picchiata) * dt;
  let f = 0;
  if (G.tasti.KeyW || G.tasti.ArrowUp) f += 1;
  if (G.tasti.KeyS || G.tasti.ArrowDown) f -= 0.5;
  if (f) {
    const [fx, fz] = avanti(G.rotta), v = (vela ? BUS.avantiVela : BUS.avantiPicchiata) * f * dt;
    G.x += fx * v; G.z += fz * v;
    const r = Math.hypot(G.x, G.z), max = RAGGIO_ISOLA - 2;
    if (r > max) { G.x *= max / r; G.z *= max / r; }
  }
  // il segnale dal luogo scelto: sempre più fitto man mano che ci si avvicina
  if (G.tempo >= B.prossimaGuida) {
    const L = B.meta, d = Math.hypot(L.x - G.x, L.z - G.z);
    suonaInPunto('cassa_ping', L.x, L.z, { gain: 1.3, ref: 60, riverbero: 0.1, rate: d < 10 ? 1.3 : 1 });
    B.prossimaGuida = G.tempo + lim(d / 60, 0.35, 1.2);
  }
  if (G.tempo >= B.prossimaFrase) { B.prossimaFrase = G.tempo + 5; parla(`${guidaCielo()} ${Math.round(B.quota)} metri.`, 0); }
  if (B.quota <= 0) atterra();
}

function atterra() {
  B.cielo = null; B.quota = 0; B.velaAperta = false; B.atterratoA = G.tempo;
  fermaSuonoBus();
  G.occupatoFino = G.tempo;
  // se fuori dall'isola (non dovrebbe), dentro
  const r = Math.hypot(G.x, G.z); if (r > RAGGIO_ISOLA - 2) { G.x *= (RAGGIO_ISOLA - 2) / r; G.z *= (RAGGIO_ISOLA - 2) / r; }
  // la tempesta e le casse col paracadute partono da adesso
  B.fine = G.tempo + FASI_TEMPESTA[0].a; B.annunciata = false; B.prossimaCassa = G.tempo + 25;
  suona('corpo_cade', { gain: 0.6, rate: 1.3 });
  colpoInizio();
  let vicino = null;
  for (const L of Object.values(LUOGHI)) { const d = Math.hypot(L.x - G.x, L.z - G.z); if (!vicino || d < vicino.d) vicino = { L, d }; }
  const dove = vicino.d < 20 ? vicino.L.nome : `${metri(vicino.d)} da ${vicino.L.nome}`;
  parla(`A terra. ${dove}. Hai solo il piccone: trova un forziere e prendi un'arma. ${B.bot.length + 1} in gara.`, 2);
}

// ---------------------------------------------------------------- tempesta
function prossimaZona() {
  const f = FASI_TEMPESTA[B.fase]; if (!f) return null;
  const a = caso(-Math.PI, Math.PI), d = Math.random() * Math.max(0, B.zona.r - f.r) * 0.8;
  return { cx: B.zona.cx + Math.sin(a) * d, cz: B.zona.cz - Math.cos(a) * d, r: f.r };
}

function dovePerLaZona() {
  const P = B.prossima || B.zona, d = Math.hypot(P.cx - G.x, P.cz - G.z);
  if (d <= Math.max(P.r - 2, 1)) return 'Sei nella zona sicura.';
  return `Zona sicura ${direzioneRelativa(avvolgi(rottaVerso(G.x, G.z, P.cx, P.cz) - G.rotta))}, ${metri(Math.max(1, d - P.r))}.`;
}

function aggiornaTempesta() {
  const f = FASI_TEMPESTA[B.fase];
  if (B.cielo) return;
  if (f && !B.annunciata && B.fine - G.tempo < (B.fase === 0 ? 20 : 999) && G.tempo > (B.atterratoA || 0) + 5) { B.annunciata = true; parla(`Tempesta tra ${Math.round(B.fine - G.tempo)} secondi. ${dovePerLaZona()}`, 1); }
  if (f && G.tempo >= B.fine) {
    if (B.stadio === 'attesa') {
      B.stadio = 'chiusura'; B.da = { ...B.zona }; B.fine = G.tempo + f.c;
      parla(`La tempesta avanza. ${dovePerLaZona()}`, 1);
    } else {
      B.zona = { ...B.prossima }; B.fase++; B.stadio = 'attesa';
      const n = FASI_TEMPESTA[B.fase];
      if (n) { B.fine = G.tempo + n.a; B.prossima = prossimaZona(); B.annunciata = false; } else B.prossima = null;
    }
  }
  if (B.stadio === 'chiusura' && f && B.da) {
    const k = lim(1 - (B.fine - G.tempo) / f.c, 0, 1), P = B.prossima;
    B.zona = { cx: B.da.cx + (P.cx - B.da.cx) * k, cz: B.da.cz + (P.cz - B.da.cz) * k, r: B.da.r + (P.r - B.da.r) * k };
  }
  // io e la tempesta: ronzio dal bordo quando è vicino, danni se sono fuori (lo scudo non protegge)
  const Z = B.zona, dx = G.x - Z.cx, dz = G.z - Z.cz, c = Math.hypot(dx, dz), fuori = c > Z.r;
  const [ux, uz] = c > 0.5 ? [dx / c, dz / c] : avanti(G.rotta);
  if (fuori) posiziona(B.sorgTempesta, G.x, 0.3, G.z); else posiziona(B.sorgTempesta, Z.cx + ux * Z.r, 0, Z.cz + uz * Z.r);
  B.sorgTempesta.src.guadagno.gain.setTargetAtTime(B.morto ? 0 : fuori ? 1.2 : Z.r - c < 10 ? 0.6 : 0, Audio3D.ctx.currentTime, 0.3);
  const danno = (FASI_TEMPESTA[Math.min(B.fase, FASI_TEMPESTA.length - 1)] || { d: 10 }).d;
  if (fuori && !B.morto && G.tempo > 4) {
    if (!B.eroFuori) { parla(`Sei nella tempesta! ${dovePerLaZona()}`, 1); B.prossimoDanno = G.tempo + 1; }
    if (G.tempo >= B.prossimoDanno) {
      B.prossimoDanno = G.tempo + 1;
      G.vita -= danno; G.effetti.dolore = 0.6; G.ultimaFerita = G.tempo;
      suona(scegli(['dolore1', 'dolore2', 'dolore3']), { gain: 0.5 });
      if (G.vita <= 0) { G.vita = 0; B.ultimoAggressore = null; morte(); }
    }
  }
  B.eroFuori = fuori;
  for (const b of B.bot) {
    if (b.vivo && Math.hypot(b.x - Z.cx, b.z - Z.cz) > Z.r && G.tempo >= (b.prossimoDannoT || 0)) { b.prossimoDannoT = G.tempo + 1; b.vita -= danno; if (b.vita <= 0) elimina(b, null); }
  }
  // la tempesta si porta via forzieri e costruzioni
  D.casse = D.casse.filter(k => Math.hypot(k.x - Z.cx, k.z - Z.cz) <= Z.r + 3);
  for (const k of G.costruzioni) if (Math.hypot(k.x - Z.cx, k.z - Z.cz) > Z.r + 3) k.vita = 0;
}

// ---------------------------------------------------------------- avversari
function suonoBot(b, nome, opz = {}) { b.ultimoSuono = G.tempo; b.udito = true; return suona(nome, { dest: b.sorgente.ingresso, ...opz }); }
function fraseBot(b, categoria) {
  if (G.tempo < B.prossimaVoce || Math.hypot(b.x - G.x, b.z - G.z) > 30) return; // uno alla volta, e solo se è vicino
  B.prossimaVoce = G.tempo + 3.5;
  b.ultimoSuono = G.tempo;
  fraseNemico(b, categoria);
}
// un muro ferma la linea tra due punti solo se nessuno dei due sta più in alto del muro
function muroTra(ax, az, bx, bz, la = 0, lb = 0) {
  return G.costruzioni.find(c => c.tipo === 'barricata' && c.vita > 0 && (c.livello || 0) >= Math.max(la, lb) && segmentiIncrociati(ax, az, bx, bz, c.ax, c.az, c.bx, c.bz)) || null;
}
const posDi = f => f === 'io' ? [G.x, G.z] : [f.x, f.z];
const vivoDi = f => f === 'io' ? !B.morto : f.vivo;

// Un avversario si accorge di me solo se mi vede da vicino o mi sente: uno sparo, una corsa, un colpo ricevuto.
// Se poi mi perde, va a controllare l'ultimo punto in cui mi ha sentito, con passo cauto.
const CAPIENZA_BOT = { pistola: 15, pompa: 6, mitra: 30, precisione: 5, piccone: 0 };
function miPercepisce(b, d) {
  if (d < 11) return true;
  if (G.tempo - (B.ultimoMioSparo || -99) < 2.5 && d < 110) return true;
  if (G.tempo - (G.ultimaCorsa || -99) < 0.8 && d < 24) return true;
  if (b.ultimoAggressore === 'io' && G.tempo < b.allertaFino) return true;
  if (b.bersaglio === 'io' && G.tempo - (b.vistoIo || -99) < 2.5 && d < 60) return true; // mi segue ancora per un attimo
  return false;
}
function pensa(b) {
  // sceglie il bersaglio: il combattente vivo più vicino entro 38 metri
  let best = null;
  for (const f of ['io', ...B.bot]) {
    if (f === b || !vivoDi(f)) continue;
    if (f === 'io' && (B.cielo || G.tempo < B.atterratoA + 6)) continue; // in volo e nei primi secondi dopo l'atterraggio nessuno mi prende di mira
    if (f === 'io' && nascostoNelVetro() && Math.hypot(G.x - b.x, G.z - b.z) > 4) continue;
    // al massimo due avversari mi prendono di mira insieme: di più non si capirebbe niente
    if (f === 'io' && b.bersaglio !== 'io' && B.bot.filter(o => o.vivo && o !== b && o.bersaglio === 'io').length >= 2) continue;
    const [x, z] = posDi(f), d = Math.hypot(x - b.x, z - b.z);
    if (f !== 'io' && f.inAria) continue;
    if (f === 'io') {
      if (!miPercepisce(b, d)) continue;
      b.vistoIo = G.tempo; b.sospetto = { x: G.x + caso(-3, 3), z: G.z + caso(-3, 3), t: G.tempo };
    }
    if (d < (b.arma === 'piccone' ? 9 : f === 'io' ? 70 : 45) && (!best || d < best.d)) best = { f, d };
  }
  if (b.allertato) { b.allertato = false; b.allertaFino = G.tempo + 8; }
  const sveglio = best && (best.f === 'io' || best.d < 28 || G.tempo < b.allertaFino);
  const prima = b.bersaglio;
  b.bersaglio = sveglio ? best.f : null;
  if (b.bersaglio && b.bersaglio !== prima) {
    b.ingaggioT = G.tempo; // la mira si assesta nei primi secondi, come per una persona
    b.prossimoSparo = Math.max(b.prossimoSparo, G.tempo + (b.bersaglio === 'io' ? caso(1.2, 2.0) * B.diff.reazione : caso(0.5, 1.1)) / b.bravura); // tempo di reazione
    if (b.bersaglio === 'io') fraseBot(b, 'minaccia');
  }
  // senza nemici: va al forziere più vicino, se ce n'è uno
  if (!b.bersaglio && !b.forziere) {
    let f = null;
    const cerca = b.arma === 'piccone' ? 150 : 55; // senza armi va a cercarle anche lontano
    for (const c of D.casse) { const d = Math.hypot(c.x - b.x, c.z - b.z); if (d < cerca && (!f || d < f.d)) f = { c, d }; }
    b.forziere = f ? f.c : null;
  }
}

function aggiornaBot(b, dt) {
  if (!b.vivo) { b.morteT += dt; return; }
  if (b.inAria) {
    // ancora in volo: non si sente e non si vede finché non tocca terra
    b.udito = false;
    if (G.tempo < b.atterraA) return;
    b.inAria = false; b.prossimoSparo = G.tempo + 3;
    if (!B.cielo && Math.hypot(b.x - G.x, b.z - G.z) < 45) suonoBot(b, 'corpo_cade', { gain: 0.9, rate: 1.2 });
  }
  b.fase += dt;
  b.udito = G.tempo - b.ultimoSuono < 6; // chi sta zitto e fermo non si sa dov'è
  if (b.stordito > 0) b.stordito -= dt;
  if (G.tempo >= b.prossimoPensiero) { b.prossimoPensiero = G.tempo + 0.4; pensa(b); }
  const Z = B.zona, P = B.prossima || B.zona;
  const fuoriZona = Math.hypot(b.x - Z.cx, b.z - Z.cz) > Z.r - 2;
  const fuoriProssima = B.stadio === 'chiusura' && Math.hypot(b.x - P.cx, b.z - P.cz) > P.r - 3;
  let mx = 0, mz = 0, v = 0;
  const T = b.bersaglio && vivoDi(b.bersaglio) ? b.bersaglio : null;
  const W = ARMI_BOT[b.arma];

  // una granata che fa bip lì vicino: scappa dalla parte opposta
  const granata = B.granateVive.find(g => g.boom > G.tempo && g.boom - G.tempo < 2.7 && Math.hypot(g.x - b.x, g.z - b.z) < 8.5);
  b.cauto = false;
  if (granata) {
    const d = Math.hypot(b.x - granata.x, b.z - granata.z) || 1; mx = (b.x - granata.x) / d; mz = (b.z - granata.z) / d; v = 5.2;
    if (!b.urlatoGranata) { b.urlatoGranata = true; if (Math.random() < 0.5) fraseBot(b, 'colpito'); }
  } else if (G.tempo < b.apreFino) { b.urlatoGranata = false; /* sta aprendo un forziere o si cura: fermo */ }
  else if (G.tempo < (b.fugaFino || 0)) {
    // ferito grave: scappa via da chi lo colpisce, poi si ferma a curarsi
    const [ax, az] = b.fugaDa ? posDi(b.fugaDa) : [G.x, G.z], d = Math.hypot(b.x - ax, b.z - az) || 1;
    mx = (b.x - ax) / d - (az - b.z) / d * b.lato * 0.5; mz = (b.z - az) / d + (ax - b.x) / d * b.lato * 0.5; v = 4.6;
    if (G.tempo + dt >= b.fugaFino) { b.apreFino = G.tempo + 3.2; suonoBot(b, 'raccogli', { gain: 0.6, rate: 0.75 }); pianifica(3.2, () => { if (b.vivo) b.vita = Math.min(100, b.vita + 40); }); }
  } else if (fuoriZona || fuoriProssima) {
    const d = Math.hypot(P.cx - b.x, P.cz - b.z) || 1; mx = (P.cx - b.x) / d; mz = (P.cz - b.z) / d; v = fuoriZona ? 4.6 : 3.2;
  } else if (T) {
    const [tx, tz] = posDi(T), d = Math.hypot(tx - b.x, tz - b.z) || 1, ux = (tx - b.x) / d, uz = (tz - b.z) / d;
    const avanza = d > W.distanza + 3 ? 1 : d < W.distanza - 3 ? -0.6 : 0;
    mx = ux * avanza - uz * b.lato * 0.6; mz = uz * avanza + ux * b.lato * 0.6; v = 2.6;
    if (Math.random() < dt * 0.4) b.lato *= -1;
    if (G.tempo < (b.ricaricaFino || 0)) { mx = -ux * 0.5 - uz * b.lato; mz = -uz * 0.5 + ux * b.lato; v = 3.4; } // ricarica spostandosi di lato
  } else if (b.sospetto && G.tempo - b.sospetto.t < 14 && b.arma !== 'piccone') {
    // mi ha sentito e poi perso: va a controllare, piano piano, e si guarda intorno
    const d = Math.hypot(b.sospetto.x - b.x, b.sospetto.z - b.z);
    if (d < 2) { b.sospetto = null; b.pausaFino = G.tempo + caso(1.5, 3.5); }
    else { mx = (b.sospetto.x - b.x) / d; mz = (b.sospetto.z - b.z) / d; v = 1.9; b.cauto = true; }
  } else if (b.forziere) {
    if (!D.casse.includes(b.forziere)) b.forziere = null;
    else {
      const d = Math.hypot(b.forziere.x - b.x, b.forziere.z - b.z);
      if (d < 1.5) {
        // apre il forziere e si tiene quel che gli serve
        b.apreFino = G.tempo + 1.2;
        const c = b.forziere; b.forziere = null;
        D.casse = D.casse.filter(x => x !== c);
        suonoBot(b, 'raccogli', { gain: 0.8 });
        if (ARMI_BOT[c.cont]) { if (ARMI_BOT[c.cont].valore * (c.rar || 1) > ARMI_BOT[b.arma].valore * b.rar) { b.arma = c.cont; b.rar = c.rar || 1; b.colpi = CAPIENZA_BOT[b.arma]; } }
        else if (c.cont === 'pozione') b.scudo = Math.min(100, b.scudo + 50);
        else if (c.cont === 'granate') b.granate = (b.granate || 0) + 2;
        b.materiali += c.materiali || 5;
      } else { mx = (b.forziere.x - b.x) / d; mz = (b.forziere.z - b.z) / d; v = 3.0; }
    }
  } else {
    // gironzola; dopo due minuti va a caccia dell'avversario più vicino (ne conosce solo la zona, non il punto esatto)
    const caccia = G.tempo - B.atterratoA > 120;
    if (!b.meta || G.tempo >= b.prossimaMeta || Math.hypot(b.meta[0] - b.x, b.meta[1] - b.z) < 2) {
      let preda = null;
      if (caccia) for (const f of ['io', ...B.bot]) { if (f === b || !vivoDi(f) || (f !== 'io' && f.inAria)) continue; const [x, z] = posDi(f), d = Math.hypot(x - b.x, z - b.z); if (!preda || d < preda.d) preda = { x, z, d }; }
      b.meta = preda ? attorno(preda.x, preda.z, 10) : attorno(P.cx, P.cz, Math.max(4, P.r * 0.7));
      b.prossimaMeta = G.tempo + caso(6, 12);
    }
    const d = Math.hypot(b.meta[0] - b.x, b.meta[1] - b.z) || 1; mx = (b.meta[0] - b.x) / d; mz = (b.meta[1] - b.z) / d; v = caccia ? 2.6 : 2.2;
    // ogni tanto si ferma un attimo, come chi si guarda intorno
    if (G.tempo >= (b.pausaFino || 0) && Math.random() < dt * 0.07) b.pausaFino = G.tempo + caso(0.8, 2.5);
    if (G.tempo < (b.pausaFino || 0)) v = 0;
  }
  v *= b.passo;
  if (b.stordito > 0) v = 0;
  // si cura quando può
  if (!T && b.vita < 45 && G.tempo >= b.prossimaCura) { b.prossimaCura = G.tempo + 25; b.apreFino = G.tempo + 3; b.vita = Math.min(100, b.vita + 45); }

  const lung = Math.hypot(mx, mz);
  if (v > 0 && lung > 0.01) {
    const nx = b.x + mx / lung * v * dt, nz = b.z + mz / lung * v * dt;
    if (!muroTra(b.x, b.z, nx, nz, b.livello || 0, b.livello || 0)) { b.x = nx; b.z = nz; }
    else b.lato *= -1; // gira attorno al muro
    const dIo = Math.hypot(b.x - G.x, b.z - G.z);
    if (dIo < 50 && G.tempo >= b.prossimoPasso) {
      b.prossimoPasso = G.tempo + (v > 3.5 ? 0.3 : b.cauto ? 0.6 : 0.4) * caso(0.9, 1.12);
      const P = passoSulTerreno(v > 3.5 ? `corsa${casoInt(1, 6)}` : `io_passo${casoInt(1, 4)}`, b.x, b.z, b.livello, { gain: b.cauto ? 1.3 : 2.4, rate: caso(0.93, 1.07) });
      suonoBot(b, P.nome, P.opz);
      // chi cammina su muri e rampe fa passi di legno: si capisce che è in alto
      if (P.legno) suonoBot(b, 'legno_colpito', { gain: 0.55, rate: caso(1.5, 1.8) });
    }
  }
  // spara
  if (T && G.tempo >= b.prossimoSparo && G.tempo >= b.apreFino && b.stordito <= 0) {
    const [tx, tz] = posDi(T), d = Math.hypot(tx - b.x, tz - b.z);
    if (d <= W.portata * (W.mischia ? 1 : 1.6) && G.tempo >= (b.ricaricaFino || 0)) sparaBot(b, T, tx, tz, d, W);
    else b.prossimoSparo = G.tempo + 0.3;
  }
  occludi(b.sorgente, !!muroTra(G.x, G.z, b.x, b.z, G.livello || 0, b.livello || 0), dt);
  posiziona(b.sorgente, b.x, ((b.livello || 0) - (G.livello || 0)) * 2.5, b.z);
  aggiornaPianoBot(b);
  if (T && G.tempo >= (b.prossimaCostruzione || 0)) botCostruisce(b, T);
  if (T === 'io' && b.granate > 0 && G.tempo >= (b.prossimaGranata || 0)) botGranata(b);
}

function sparaBot(b, T, tx, tz, d, W) {
  if (W.mischia) {
    // colpo di piccone: si sente il fendente da dove sta, e se prende il colpo sordo
    b.prossimoSparo = G.tempo + W.cadenza * caso(0.9, 1.3);
    suonoBot(b, 'lancio', { gain: 1.0, rate: caso(1.25, 1.45) });
    if (Math.random() >= W.prob * b.bravura) return;
    if (T === 'io') pianifica(0.12, () => { if (!B.morto) { B.ultimoAggressore = b; feriscimi(W.danno, true); } });
    else feritoBot(T, W.danno, b);
    return;
  }
  // cadenza, con le raffiche del mitragliatore
  if (W.raffica) { b.colpiRaffica++; b.prossimoSparo = G.tempo + (b.colpiRaffica % W.raffica === 0 ? W.pausa : W.cadenza); }
  else b.prossimoSparo = G.tempo + W.cadenza * caso(0.9, 1.3);
  const dIo = Math.hypot(b.x - G.x, b.z - G.z);
  // preavviso: prima di cominciare a spararmi fa il clic dell'arma, e ho mezzo secondo per reagire
  if (T === 'io' && G.tempo - (b.ultimoSparoAMe || -99) > 2.5 && !b.avvisoFatto) {
    b.avvisoFatto = true; b.prossimoSparo = G.tempo + 0.55;
    suonoBot(b, 'grilletto_vuoto', { gain: 1.3, rate: 0.9 });
    return;
  }
  if (T === 'io') { b.avvisoFatto = false; b.ultimoSparoAMe = G.tempo; }
  // il caricatore finisce: ricarica, e si sente. È il momento buono per attaccarlo.
  if (!b.colpi) b.colpi = CAPIENZA_BOT[b.arma];
  if (--b.colpi <= 0) {
    const t = caso(1.8, 2.6); b.ricaricaFino = G.tempo + t; b.prossimoSparo = b.ricaricaFino + caso(0.1, 0.4); b.colpi = CAPIENZA_BOT[b.arma];
    if (dIo < 40) {
      const ak = b.arma === 'mitra' || b.arma === 'precisione';
      if (b.arma === 'pompa') for (let i = 0; i < 3; i++) pianifica(0.4 + i * 0.5, () => { if (b.vivo) suonoBot(b, 'cartuccia', { gain: 1.0 }); });
      else { pianifica(0.3, () => { if (b.vivo) suonoBot(b, ak ? 'ak_sgancio' : 'sgancio', { gain: 1.0 }); }); pianifica(t - 0.5, () => { if (b.vivo) suonoBot(b, ak ? 'ak_inserimento' : 'inserimento', { gain: 1.0 }); }); }
      if (T === 'io' && Math.random() < 0.3 && G.tempo - (B.ultimoAvvisoRicarica || -9) > 8) { B.ultimoAvvisoRicarica = G.tempo; parla(`${b.nome} ricarica`, 0); }
    }
  }
  if (T === 'io') {
    // spara a me: lo sento bene, dal punto in cui si trova. Gli echi solo sul primo colpo, per non fare un muro di rumore.
    b.ultimoSuono = G.tempo; b.udito = true; b.lampo = 1;
    sparoLontano(scegli(W.suoni), b.x, b.z, b.sorgente, 1, G.tempo - (b.ultimoEco || -9) > 1.5);
    b.ultimoEco = G.tempo;
    // la prima volta che qualcuno mi prende di mira, la voce mi dice chi e da dove
    if (G.tempo - (b.ultimoAvviso || -99) > 10 && G.tempo - (B.ultimoAvvisoTiro || -9) > 3) {
      b.ultimoAvviso = G.tempo; B.ultimoAvvisoTiro = G.tempo;
      const sopra = (b.livello || 0) > (G.livello || 0) ? ", dall'alto" : (b.livello || 0) < (G.livello || 0) ? ', da sotto' : '';
      parla(`${b.nome} ti spara, ${direzioneRelativa(avvolgi(rottaVerso(G.x, G.z, b.x, b.z) - G.rotta))}${sopra}`, 1);
    }
  } else if (dIo < 45 && G.tempo >= (B.prossimoSparoAltrui || 0)) {
    // scontri tra altri: solo se sono vicini, bassi, e al massimo un colpo ogni secondo e mezzo
    B.prossimoSparoAltrui = G.tempo + 1.5;
    b.ultimoSuono = G.tempo; b.udito = true; b.lampo = 1;
    sparoLontano(scegli(W.suoni), b.x, b.z, b.sorgente, 0.3, false);
  }
  if (T === 'io' && Math.random() < 0.12) fraseBot(b, 'spara');
  for (const c of G.costruzioni) if (c.tipo === 'vetro' && c.vita > 0 && segmentiIncrociati(b.x, b.z, tx, tz, c.ax, c.az, c.bx, c.bz)) rompiVetro(c, b);
  // un muro in mezzo ferma il colpo (non contro chi è in alto su una rampa)
  const tAlto = T === 'io' ? G.alto : false;
  const muro = muroTra(b.x, b.z, tx, tz, b.livello || 0, T === 'io' ? G.livello || 0 : T.livello || 0);
  if (muro) {
    if (dIo < 60) suonaInPunto('legno_colpito', muro.x, muro.z, { gain: 1.0, rate: caso(0.9, 1.2), quando: d / 500 });
    danneggiaCostruzione(muro, W.danno * 0.6);
    if (Math.random() < 0.3) b.lato *= -1;
    return;
  }
  let p = W.prob * lim(1.25 - d / W.portata, 0.08, 1) * b.bravura;
  p *= lim((G.tempo - (b.ingaggioT || 0)) / 2.5, 0.45, 1); // i primi colpi sono meno precisi
  const tLiv = T === 'io' ? G.livello || 0 : T.livello || 0;
  if ((b.livello || 0) > tLiv) p *= 1.2;   // dall'alto si colpisce meglio
  const danno = Math.round(W.danno * b.rar * caso(0.85, 1.15));
  if (T === 'io') {
    // contro di me sono meno precisi, e lo diventano di più solo quando restano in pochi
    p *= (rimasti() <= 4 ? 0.5 : 0.36) * (G.inMovimento ? 0.6 : 1) * B.diff.prec;
    stressa(0.2);
    if (Math.random() < p) { schioccoProiettile(b.x, b.z); pianifica(d / 850, () => { if (!B.morto) { B.ultimoAggressore = b; feriscimi(danno, true); } }); }
    else if (Math.random() < 0.6) proiettilePassa(b.x, b.z); // il proiettile mi sfiora: schiocco e fischio che passa
  } else if (Math.random() < p * (G.tempo - B.atterratoA > 120 ? 0.7 : 0.4)) feritoBot(T, danno, b); // tra di loro si colpiscono meno all'inizio: la partita deve durare, ma non troppo
}

// un avversario viene colpito (da me o da un altro)
function feritoBot(b, danno, da) {
  if (!b.vivo) return;
  const assorbito = Math.min(b.scudo, danno); b.scudo -= assorbito; b.vita -= danno - assorbito;
  b.allertaFino = G.tempo + 10; b.ultimoAggressore = da;
  if (b.vita <= 0) { elimina(b, da); return; }
  // ferito grave: a volte scappa per curarsi, a volte resiste; altrimenti costruisce per coprirsi
  if (b.vita + b.scudo < 40 && G.tempo >= (b.prossimaFuga || 0) && Math.random() > b.coraggio) {
    b.fugaFino = G.tempo + caso(2.5, 4.5); b.fugaDa = da; b.prossimaFuga = G.tempo + 20;
    if (da === 'io' && Math.random() < 0.5) fraseBot(b, 'colpito');
    return;
  }
  if (Math.random() < 0.55) { b.prossimaCostruzione = 0; botCostruisce(b, da); }
}

// colpito da me (chiamato dal motore dei colpi)
function battagliaColpito(b, danno, testa, ritardo, esplosivo) {
  const eraVivo = b.vivo, avevaScudo = b.scudo > 0;
  if (avevaScudo && !esplosivo) suona('scudo_colpo', { dest: b.sorgente.ingresso, gain: 0.9, quando: ritardo });
  // conferma del colpo, subito, al centro: tic, oppure "ding" se è alla testa
  suona(testa ? 'testa_marker' : 'colpito_marker', { gain: 0.7 });
  b.ultimoSuono = G.tempo; b.udito = true;
  b.stordito = Math.max(b.stordito, 0.25);
  feritoBot(b, danno, 'io');
  if (avevaScudo && b.scudo <= 0 && b.vivo) suona('scudo_rotto', { gain: 0.6, quando: 0.05 });
  if (typeof mostraNumero3D === 'function') { mostraNumero3D(b.x, b.z, b.livello, String(danno), testa); sangue3D(b.x, b.z, b.livello || 0, testa, danno); }
  if (b.vivo) {
    suona(scegli(['dolore1', 'dolore2', 'dolore3']), { dest: b.sorgente.ingresso, gain: 1.0, rate: b.tono, quando: ritardo + 0.05 });
    if (Math.random() < 0.25) fraseBot(b, 'colpito');
  }
  Resoconto.danno += danno; Resoconto.colpi++; Resoconto.testa ||= testa; Resoconto.esplosivo ||= esplosivo;
  annullaEventi('resoconto');
  if (eraVivo && !b.vivo) { Object.assign(Resoconto, { danno: 0, testa: false, colpi: 0, uccisi: 0, esplosivo: false, serie: 0 }); return; } // l'eliminazione si annuncia da sé
  pianifica(ARMI[G.arsenale.corrente].auto && !esplosivo ? 0.35 : 0.05, annunciaResoconto, 'resoconto');
}

function rimasti() { return B.bot.filter(b => b.vivo).length + (B.morto ? 0 : 1); }

function elimina(b, da) {
  if (!b.vivo) return;
  b.vivo = false; b.morteT = 0; b.vita = 0;
  const vicino = Math.hypot(b.x - G.x, b.z - G.z) < 60;
  if (vicino) {
    suona(scegli(['dolore1', 'dolore2', 'dolore3']), { dest: b.sorgente.ingresso, gain: 1.2, rate: b.tono * 0.85 });
    suona('corpo_cade', { dest: b.sorgente.ingresso, gain: 1, quando: 0.4 });
  }
  chiudiSorgente(b.sorgente, 4);
  // lascia a terra il suo bottino
  const cont = b.arma !== 'piccone' ? { cont: b.arma, rar: b.rar } : { cont: scegli(['pozione', 'bende', 'kit']) };
  D.casse.push(nuovoForziere(b.x, b.z, { ...cont, materiali: Math.min(80, b.materiali) + 15 }));
  const n = rimasti();
  if (da === 'io') { B.eliminazioni++; parla(n > 1 ? `Eliminato ${b.nome}! ${n} rimasti.` : `Eliminato ${b.nome}!`, 2); }
  else if (n > 1) parla(n === 2 ? 'Ne resta uno solo, oltre a te.' : `${n} rimasti.`, n <= 3 ? 1 : 0);
  if (n === 1 && !B.morto) pianifica(1.2, vittoria);
}

function vittoria() {
  if (B.morto || G.stato !== 'gioco') return;
  const s = leggiStatBR(); s.vittorie++; s.partite++; salvaStatBR(s);
  G.stato = 'morto'; G.eventi = []; B.attiva = false;
  aggiornaPuntamento(null);
  B.sorgTempesta.src.guadagno.gain.value = 0;
  suona('vittoria', { gain: 0.9 });
  setTimeout(() => parla(`Vittoria reale! ${plurale(B.eliminazioni, 'eliminazione', 'eliminazioni')}. Vittorie totali: ${s.vittorie}. Invio per rigiocare, M per il menù.`, 2), 1500);
}

function battagliaMorte() {
  if (B.morto) return;
  B.morto = true;
  const posto = rimasti() + 1, s = leggiStatBR(); s.partite++; salvaStatBR(s);
  G.stato = 'morto'; G.eventi = []; G.arsenale.grilletto = false; B.attiva = false;
  aggiornaPuntamento(null);
  B.sorgTempesta.src.guadagno.gain.value = 0;
  const chi = B.ultimoAggressore ? `Eliminato da ${B.ultimoAggressore.nome}.` : 'Eliminato dalla tempesta.';
  setTimeout(() => parla(`${chi} ${ORDINALI[posto - 1] || posto} su ${B.bot.length + 1}, ${plurale(B.eliminazioni, 'eliminazione', 'eliminazioni')}. Invio per rigiocare, M per il menù.`, 2), 900);
}

// ---------------------------------------------------------------- ogni fotogramma
function aggiornaBattaglia(dt) {
  if (B.cielo) { aggiornaCielo(dt); for (const b of B.bot) aggiornaBot(b, dt); return; }
  aggiornaAggancio(dt);
  controllaCabina();
  aggiornaCasseParacadute();
  battitoBattaglia();
  muoviLibero(dt, 0, 0, RAGGIO_ISOLA, false);
  aggiornaTempesta();
  for (const b of B.bot) aggiornaBot(b, dt);
  // il suono del luogo più vicino, per orientarsi (uno solo alla volta)
  if (G.tempo >= B.prossimoLuogo) {
    let best = null;
    for (const L of Object.values(LUOGHI)) { if (!L.suono) continue; const d = Math.hypot(L.x - G.x, L.z - G.z); if (!best || d < best.d) best = { L, d }; }
    if (best && best.d < 90) { suonaInPunto(best.L.suono, best.L.x, best.L.z, { gain: best.L.gain, ref: best.L.ref, y: 6 }); B.prossimoLuogo = G.tempo + best.L.ogni; }
    else B.prossimoLuogo = G.tempo + 5;
  }
}

function bevePozione() {
  if (!puoAgire()) return;
  if (!G.inventario.pozioni) { parla('Niente pozioni.', 1); return; }
  if (G.scudo >= 100) { parla('Scudo pieno.', 1); return; }
  G.inventario.pozioni--;
  G.occupatoFino = G.tempo + 2;   // mentre bevo sono scoperto
  suona('raccogli', { gain: 0.5, rate: 0.8 });
  pianifica(2, () => { G.scudo = Math.min(100, G.scudo + 50); suona('scudo_su', { gain: 0.6 }); parla(`scudo ${G.scudo}`, 1); });
}

// tasto O: dove andare
function battagliaZona() {
  let vicino = null;
  for (const L of Object.values(LUOGHI)) { const d = Math.hypot(L.x - G.x, L.z - G.z); if (!vicino || d < vicino.d) vicino = { L, d }; }
  const f = FASI_TEMPESTA[B.fase];
  const tempo = !f ? '' : B.stadio === 'attesa' ? ` Tempesta tra ${Math.max(0, Math.round(B.fine - G.tempo))} secondi.` : ' La tempesta sta avanzando.';
  parla(`${dovePerLaZona()}${tempo} ${vicino.L.nome} ${vicino.d < 8 ? 'qui' : direzioneRelativa(avvolgi(rottaVerso(G.x, G.z, vicino.L.x, vicino.L.z) - G.rotta)) + ', ' + metri(vicino.d)}. Guardi verso ${puntoCardinale(G.rotta)}.`, 1);
}

// Spazio: la situazione
function battagliaRicognizione() {
  let f = `${rimasti()} rimasti, ${plurale(B.eliminazioni, 'eliminazione', 'eliminazioni')}. `;
  const sentiti = B.bot.filter(b => b.vivo && b.udito).map(b => ({ b, d: Math.hypot(b.x - G.x, b.z - G.z) })).sort((a, b) => a.d - b.d);
  if (sentiti.length) f += sentiti.slice(0, 2).map(({ b, d }) => `${b.nome} ${direzioneRelativa(avvolgi(rottaVerso(G.x, G.z, b.x, b.z) - G.rotta))}, ${metri(d)}`).join('. ') + '. ';
  else f += 'Nessuno vicino che si senta. ';
  let cassa = null;
  for (const c of D.casse) { const d = Math.hypot(c.x - G.x, c.z - G.z); if (!cassa || d < cassa.d) cassa = { c, d }; }
  if (cassa && cassa.d < 60) f += `Forziere ${direzioneRelativa(avvolgi(rottaVerso(G.x, G.z, cassa.c.x, cassa.c.z) - G.rotta))}, ${metri(cassa.d)}. `;
  f += `${dovePerLaZona()} `;
  const st = armaStato();
  f += `${armaDef().nome}${st.rarita && st.rarita > 1 ? ' ' + nomeRarita(st.rarita) : ''} ${testoColpi(armaDef(), st)}. Vita ${Math.round(G.vita)}, scudo ${Math.round(G.scudo)}. ${G.inventario.materiali} materiali`;
  if (G.inventario.pozioni) f += `, ${plurale(G.inventario.pozioni, 'pozione', 'pozioni')}`;
  if (G.inventario.cibo) f += `, ${G.inventario.cibo} bende`;
  if (G.inventario.kit) f += `, ${plurale(G.inventario.kit, 'kit', 'kit')}`;
  if (G.inventario.radar) f += `, ${plurale(G.inventario.radar, 'radar', 'radar')}`;
  parla(f + '.', 2);
}

// ferma i suoni continui della battaglia (chiamata quando si esce o si ricomincia)
function battagliaFerma() {
  fermaSuonoBus(); B.cielo = null;
  if (B.sorgTempesta) { fermaLoop(B.sorgTempesta); B.sorgTempesta = null; }
  if (B.fontana) { fermaLoop(B.fontana); B.fontana = null; }
  B.attiva = false;
}

// ---------------------------------------------------------------- costruzioni a piani
// Ogni pezzo ha un piano (livello): 0 è il terreno. Una rampa costruita al piano L porta al piano L+1.
// Un muro al piano L ferma i colpi tra chi sta al piano L o più in basso.
function nuovoPezzo(tipo, x, z, ux, uz, livello) {
  const mezza = tipo === 'rampa' ? 1.2 : 1.7;
  return { id: Math.random().toString(36).slice(2), tipo, nome: tipo === 'rampa' ? 'rampa' : 'muro', x, z, livello,
    dirx: ux, dirz: uz, vita: tipo === 'rampa' ? 120 : 150, vitaMax: tipo === 'rampa' ? 120 : 150, pronta: true,
    ax: x - uz * mezza, az: z + ux * mezza, bx: x + uz * mezza, bz: z - ux * mezza, nato: G.tempo };
}
function pezzoGiaLi(tipo, x, z, livello) {
  return G.costruzioni.some(c => c.tipo === tipo && c.vita > 0 && (c.livello || 0) === livello && Math.hypot(c.x - x, c.z - z) < 1.3);
}

// costruzione istantanea (la usa il giocatore: un tasto premuto, o tenuto premuto per costruire a raffica)
// avversari della modalità in corso: i combattenti del computer, oppure gli amici del duello
function avversariArena() { return G.modalita === 'duello' ? [...D.altri.values()] : B.bot; }
function sonoFuori() { return G.modalita === 'duello' ? D.fuori : B.morto; }

function costruisciRapido(tipo) {
  if (sonoFuori() || G.stato !== 'gioco' || (G.modalita === 'battaglia' && G.tempo < 3)) return false;
  const costo = 2;
  if (G.inventario.materiali < costo) { if (G.tempo - (B.avvisoMateriali || -9) > 2) { B.avvisoMateriali = G.tempo; parla('Materiali finiti.', 1); } return false; }
  const [fx, fz] = avanti(G.rotta), liv = G.livello || 0;
  if (tipo === 'rampa' && liv >= 6) { if (G.tempo - (B.avvisoPiano || -9) > 2) { B.avvisoPiano = G.tempo; parla('Piano massimo.', 1); } return false; }
  const dist = tipo === 'rampa' ? 2.2 : 2.0;
  const x = G.x + fx * dist, z = G.z + fz * dist;
  if (pezzoGiaLi(tipo, x, z, liv)) return false;
  G.inventario.materiali -= costo;
  const c = nuovoPezzo(tipo === 'rampa' ? 'rampa' : 'barricata', x, z, fx, fz, liv);
  G.costruzioni.push(c);
  if (G.modalita === 'duello') duelloInvia({ t: 'costruzione', c2: c });
  suonaInPunto('legno_colpito', x, z, { gain: 0.9, rate: tipo === 'rampa' ? 1.15 : 1.45, y: liv * 2.5 - liv * 2.5 });
  B.ultimaCostruzione = G.tempo;
  return true;
}

// tenendo premuto B o N si costruisce a raffica: un muro ogni 0,18 secondi, una rampa ogni 0,25
function aggiornaTurbo() {
  if (G.tempo < (G.prossimaTurbo || 0)) return;
  if (G.tasti.KeyB) { if (costruisciRapido('barricata')) G.prossimaTurbo = G.tempo + 0.1; }
  else if (G.tasti.KeyN) { if (costruisciRapido('rampa')) G.prossimaTurbo = G.tempo + 0.14; }
}

// su che piano sono: salgo sulle rampe, cado se sotto di me non c'è più niente
function pianoSotto(x, z, attuale) {
  let piano = 0;
  for (const c of G.costruzioni) {
    if (c.tipo !== 'rampa' || c.vita <= 0) continue;
    const l = c.livello || 0;
    if (Math.hypot(c.x - x, c.z - z) < 1.7 && l <= attuale && l + 1 > piano) piano = l + 1; // ci salgo dal suo piano o da sopra
  }
  return piano;
}
function aggiornaPianoMio() {
  const prima = G.livello || 0;
  let dopo = pianoSotto(G.x, G.z, prima);
  // posso salire di un solo piano alla volta
  if (dopo > prima + 1) dopo = prima + 1;
  if (dopo === prima) return;
  G.livello = dopo; G.alto = dopo > 0;
  if (dopo > prima) { suona('legno_colpito', { gain: 0.45, rate: 1.3 }); if (dopo === 1 || dopo % 2 === 0) parla(`piano ${dopo}`, 0); }
  else {
    const caduta = prima - dopo;
    suona('corpo_cade', { gain: 0.4, rate: 1.4 });
    parla(dopo === 0 ? 'a terra' : `piano ${dopo}`, 0);
    if (caduta >= 2 && !sonoFuori()) { B.ultimoAggressore = null; if (G.modalita === 'duello') D.ultimoColpoSubito = -99; feriscimi(10 * (caduta - 1)); }
  }
}
function aggiornaPianoBot(b) {
  const prima = b.livello || 0;
  let dopo = pianoSotto(b.x, b.z, prima);
  if (dopo > prima + 1) dopo = prima + 1;
  if (dopo !== prima) { b.livello = dopo; b.alto = dopo > 0; if (Math.hypot(b.x - G.x, b.z - G.z) < 40) suonoBot(b, 'legno_colpito', { gain: 0.6 }); }
}

// gli avversari costruiscono: muro verso chi gli spara, scatola quando sono feriti, rampe per salirti sopra
function botCostruisce(b, T) {
  if (!b.vivo || b.materiali < 2 || !T) return;
  b.prossimaCostruzione = G.tempo + caso(1.2, 2.6) / b.bravura;
  const [tx, tz] = posDi(T), d = Math.hypot(tx - b.x, tz - b.z) || 1, ux = (tx - b.x) / d, uz = (tz - b.z) / d;
  const liv = b.livello || 0, tLiv = T === 'io' ? G.livello || 0 : T.livello || 0;
  const piazza = (tipo, x, z, dx, dz, l) => {
    if (b.materiali < 2 || pezzoGiaLi(tipo, x, z, l)) return;
    b.materiali -= 2;
    G.costruzioni.push(nuovoPezzo(tipo, x, z, dx, dz, l));
    if (Math.hypot(x - G.x, z - G.z) < 50) { suonaInPunto('legno_colpito', x, z, { gain: 1.0, rate: tipo === 'rampa' ? 1.15 : 1.45, y: (l - (G.livello || 0)) * 2.5 }); b.ultimoSuono = G.tempo; b.udito = true; }
  };
  if (b.vita < 50 && !b.scatolaFatta && b.materiali >= 8) {
    // scatola: quattro muri intorno
    b.scatolaFatta = true;
    for (let i = 0; i < 4; i++) { const a = Math.atan2(ux, -uz) + i * Math.PI / 2, [fx, fz] = avanti(a); piazza('barricata', b.x + fx * 1.6, b.z + fz * 1.6, fx, fz, liv); }
  } else if (tLiv >= liv && liv < 5 && d < 30 && Math.random() < 0.5) {
    // corre in alto: rampa verso di te, e ci sale sopra
    piazza('rampa', b.x + ux * 2.2, b.z + uz * 2.2, ux, uz, liv);
    b.meta = [b.x + ux * 2.6, b.z + uz * 2.6]; b.prossimaMeta = G.tempo + 1.5;
  } else {
    piazza('barricata', b.x + ux * 1.8, b.z + uz * 1.8, ux, uz, liv);
  }
}

// ---------------------------------------------------------------- aiuti per giocare senza vista
// Opzione tenuto premuto: la mira si aggancia all'avversario più vicino che senti e lo segue
function aggiornaAggancio(dt) {
  const tenuto = G.tasti.AltLeft || G.tasti.AltRight;
  if (!tenuto || sonoFuori()) { B.agganciato = null; return; }
  let b = B.agganciato;
  const portata = Math.max(15, armaDef().portata);
  if (!b || !b.vivo || Math.hypot(b.x - G.x, b.z - G.z) > portata) {
    b = avversariArena().filter(x => x.vivo && x.udito && Math.hypot(x.x - G.x, x.z - G.z) < portata).sort((p, q) => Math.hypot(p.x - G.x, p.z - G.z) - Math.hypot(q.x - G.x, q.z - G.z))[0] || null;
    if (b && b !== B.agganciato) { suona('tic', { gain: 0.6, rate: 1.4 }); parla(`agganciato ${b.nome || b.def.nome}${descriviAltezza(b)}`, 0); }
    B.agganciato = b;
  }
  if (!b) return;
  const voluta = rottaVerso(G.x, G.z, b.x, b.z), diff = avvolgi(voluta - G.rotta);
  G.rotta = avvolgi(G.rotta + Math.sign(diff) * Math.min(Math.abs(diff), 7 * dt));
}

function descriviAltezza(b) {
  const d = (b.livello || 0) - (G.livello || 0);
  return d > 0 ? `, sopra di te${d > 1 ? ' di ' + d + ' piani' : ''}` : d < 0 ? ', sotto di te' : '';
}

// Z: mi giro verso l'avversario più vicino che sento; Maiuscolo più Z: verso il forziere più vicino
function giratiVerso(forziere) {
  if (forziere) {
    let c = null;
    for (const k of D.casse) { if (k.aTerra === false) continue; const d = Math.hypot(k.x - G.x, k.z - G.z); if (!c || d < c.d) c = { k, d }; }
    if (!c) { parla('Nessun forziere.', 1); return; }
    G.rotta = rottaVerso(G.x, G.z, c.k.x, c.k.z);
    suona('tic', { gain: 0.5 });
    parla(`forziere, ${metri(c.d)}`, 1);
    return;
  }
  const b = avversariArena().filter(x => x.vivo && x.udito).sort((p, q) => Math.hypot(p.x - G.x, p.z - G.z) - Math.hypot(q.x - G.x, q.z - G.z))[0];
  if (!b) { parla('Non senti nessuno. Prova con Ctrl.', 1); return; }
  G.rotta = rottaVerso(G.x, G.z, b.x, b.z);
  suona('tic', { gain: 0.6, rate: 1.4 });
  parla(`${b.nome}, ${metri(Math.hypot(b.x - G.x, b.z - G.z))}${descriviAltezza(b)}`, 1);
}

// Ctrl: modalità ascolto. Un sonar da ogni avversario entro 60 metri, uno dopo l'altro, dal più vicino:
// più acuto se è sopra di me, più grave se è sotto. Poi la voce riassume. Si può usare ogni 6 secondi.
function ascolta() {
  if (G.tempo < (B.prossimoAscolto || 0)) { parla('Ascolto non ancora pronto.', 0); return; }
  B.prossimoAscolto = G.tempo + 6;
  const vicini = avversariArena().filter(b => b.vivo && Math.hypot(b.x - G.x, b.z - G.z) < 60)
    .sort((p, q) => Math.hypot(p.x - G.x, p.z - G.z) - Math.hypot(q.x - G.x, q.z - G.z)).slice(0, 5);
  if (!vicini.length) { parla('Nessuno entro 60 metri.', 1); return; }
  vicini.forEach((b, i) => {
    const d = (b.livello || 0) - (G.livello || 0);
    suonaInPunto('sonar', b.x, b.z, { gain: 1.3, ref: 12, rate: d > 0 ? 1.35 : d < 0 ? 0.7 : 1, quando: 0.15 + i * 0.4, y: d * 2.5, riverbero: 0.1 });
    b.ultimoSuono = G.tempo + 3; b.udito = true; // per qualche secondo li segue anche il suono di puntamento
  });
  const sopra = vicini.filter(b => (b.livello || 0) > (G.livello || 0)).length;
  const primo = vicini[0], dPrimo = Math.hypot(primo.x - G.x, primo.z - G.z);
  pianifica(0.2 + vicini.length * 0.4, () => parla(`${plurale(vicini.length, 'vicino', 'vicini')}${sopra ? `, ${sopra} sopra di te` : ''}. Il più vicino ${direzioneRelativa(avvolgi(rottaVerso(G.x, G.z, primo.x, primo.z) - G.rotta))}, ${metri(dPrimo)}.`, 1));
}

// battito del cuore quando la vita è bassa
function battitoBattaglia() {
  // il cuore ora lo fa il realismo (realismo.js), che accelera anche con la paura e la fatica
  if (G.battito) { try { G.battito.stop(); } catch (e) { /* già fermo */ } G.battito = null; }
  if (false) {
    if (!G.battito) G.battito = suona('battito', { loop: true, gain: 0 });
    G.battito.guadagno.gain.setTargetAtTime(0.25 + (35 - G.vita) / 35 * 0.5, Audio3D.ctx.currentTime, 0.3);
  } else if (G.battito) { try { G.battito.stop(); } catch (e) { /* già fermo */ } G.battito = null; }
}

// casse col paracadute: ogni 25-35 secondi ne cade una dentro la zona sicura, con contenuto migliore dei forzieri
function aggiornaCasseParacadute() {
  if (G.tempo < (B.prossimaCassa || 25) || B.morto) return;
  B.prossimaCassa = G.tempo + caso(25, 35);
  const Z = B.prossima || B.zona;
  const [x, z] = attorno(Z.cx, Z.cz, Math.max(5, Z.r * 0.7));
  const c = contenutoForziere();
  if (c.rar) c.rar = Math.max(c.rar, 1.15); // almeno rara
  duelloArrivaCassa({ id: Math.random().toString(36).slice(2), x, z, ...c, materiali: 25 });
}

// K: senti le costruzioni più vicine. Un colpo di legno dal punto di ognuna (dalle più vicine), poi la voce.
function senteCostruzioni() {
  const vicine = G.costruzioni.filter(c => c.vita > 0 && (c.tipo === 'barricata' || c.tipo === 'rampa') && !c.cabina)
    .map(c => ({ c, d: Math.hypot(c.x - G.x, c.z - G.z) })).filter(o => o.d < 25).sort((a, b) => a.d - b.d).slice(0, 4);
  const cab = (B.cabine || []).map(c => ({ c, d: Math.hypot(c.x - G.x, c.z - G.z) })).filter(o => o.d < 30).sort((a, b) => a.d - b.d)[0];
  if (cab) suonaInPunto('luccichio', cab.c.x, cab.c.z, { gain: 0.5, rate: 0.6, ref: 6 });
  const casa = cab ? ` Casa di vetro ${direzioneRelativa(avvolgi(rottaVerso(G.x, G.z, cab.c.x, cab.c.z) - G.rotta))}, ${metri(cab.d)}.` : '';
  if (!vicine.length) { parla(`Nessuna costruzione vicina.${casa}`, 1); return; }
  vicine.forEach(({ c }, i) => suonaInPunto('legno_colpito', c.x, c.z, { gain: 1.1, rate: c.tipo === 'rampa' ? 1.05 : 1.4, quando: 0.1 + i * 0.35, y: ((c.livello || 0) - (G.livello || 0)) * 2.5 }));
  const descrivi = ({ c, d }) => {
    const piano = (c.livello || 0) - (G.livello || 0);
    return `${c.tipo === 'rampa' ? 'rampa' : 'muro'} ${direzioneRelativa(avvolgi(rottaVerso(G.x, G.z, c.x, c.z) - G.rotta))}, ${metri(d)}${piano > 0 ? ', sopra' : piano < 0 ? ', sotto' : ''}, ${Math.round(c.vita / c.vitaMax * 100)} per cento`;
  };
  pianifica(0.15 + vicine.length * 0.35, () => parla(vicine.slice(0, 3).map(descrivi).join('. ') + '.' + casa, 1));
}

// ---------------------------------------------------------------- case di vetro
// Cabine di vetro sparse per l'isola. Da dentro senti tutto, ma gli avversari a più di 4 metri non ti vedono,
// finché non spari. Chi spara al vetro lo manda in pezzi, e le schegge feriscono chi sta lì intorno.
function creaCaseDiVetro() {
  B.cabine = [];
  for (let k = 0; k < 8; k++) {
    let x, z;
    for (let tent = 0; tent < 30; tent++) { [x, z] = attorno(0, 0, 80); if (Object.values(LUOGHI).every(L => Math.hypot(L.x - x, L.z - z) > 12)) break; }
    const cab = { x, z, id: 'cab' + k };
    B.cabine.push(cab);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2, [fx, fz] = avanti(a), cx = x + fx * 1.5, cz = z + fz * 1.5;
      G.costruzioni.push({ id: `${cab.id}-${i}`, cabina: cab.id, tipo: 'vetro', nome: 'vetro', x: cx, z: cz, livello: 0, dirx: fx, dirz: fz,
        vita: 30, vitaMax: 30, pronta: true, ax: cx - fz * 1.5, az: cz + fx * 1.5, bx: cx + fz * 1.5, bz: cz - fx * 1.5, nato: -9 });
    }
  }
}
function cabinaDi(x, z) { return (B.cabine || []).find(c => Math.hypot(c.x - x, c.z - z) < 1.4) || null; }
// sono nascosto se sono dentro una cabina con almeno tre vetri interi e non ho sparato negli ultimi 3 secondi
function nascostoNelVetro() {
  const cab = cabinaDi(G.x, G.z); if (!cab) return false;
  const interi = G.costruzioni.filter(c => c.cabina === cab.id && c.vita > 0).length;
  return interi >= 3 && G.tempo - (B.ultimoMioSparo || -99) > 3 && (G.livello || 0) === 0;
}
function rompiVetro(c, da) {
  if (c.vita <= 0) return;
  c.vita = 0;
  suonaInPunto('vetro_rotto', c.x, c.z, { gain: 1.4, ref: 4, riverbero: 0.4 });
  if (typeof scheggeVetro3D === 'function') scheggeVetro3D(c);
  // le schegge colpiscono chi sta entro due metri e mezzo
  if (!B.morto && Math.hypot(G.x - c.x, G.z - c.z) < 2.6 && (G.livello || 0) === 0 && G.tempo - (B.ultimaScheggia || -9) > 1) {
    B.ultimaScheggia = G.tempo; // più vetri rotti insieme feriscono una volta sola
    if (da && da !== 'io') B.ultimoAggressore = da;
    parla('Schegge!', 1);
    feriscimi(15);
  }
  for (const b of B.bot) if (b.vivo && Math.hypot(b.x - c.x, b.z - c.z) < 2.6) feritoBot(b, 15, da || 'io');
}
// entrata e uscita dalla cabina, annunciate
function controllaCabina() {
  const dentro = !!cabinaDi(G.x, G.z);
  if (dentro !== !!B.inCabina) {
    B.inCabina = dentro;
    parla(dentro ? (nascostoNelVetro() ? 'Casa di vetro: nessuno ti vede finché non spari.' : 'Casa di vetro, ma i vetri sono rotti.') : 'Fuori dalla casa di vetro.', 1);
  }
}

// ---------------------------------------------------------------- granate degli avversari
// Lanciano una granata quando sei dietro un muro, in alto o nascosto. Dove cade si sente il rimbalzo,
// poi un bip sempre più fitto, e la voce avvisa se è vicina.
function botGranata(b) {
  b.prossimaGranata = G.tempo + caso(8, 14);
  const dIo = Math.hypot(G.x - b.x, G.z - b.z);
  const riparato = muroTra(b.x, b.z, G.x, G.z, b.livello || 0, G.livello || 0) || (G.livello || 0) > (b.livello || 0) || nascostoNelVetro();
  if (!riparato || dIo > 25 || dIo < 5 || Math.random() < 0.4) return;
  b.granate--;
  const gx = G.x + caso(-2.5, 2.5), gz = G.z + caso(-2.5, 2.5);
  suonoBot(b, 'lancio', { gain: 1.0 });
  volo('granata_rimbalzo', b.x, b.z, gx, gz, 0.85, { gain: 0.25, doppler: 1.08, y: 2, ref: 2 }); // la granata in volo, che si avvicina
  B.granateVive.push({ x: gx, z: gz, boom: G.tempo + 3 });
  pianifica(0.9, () => {
    suonaInPunto('granata_rimbalzo', gx, gz, { gain: 1.0, rate: 0.75 });
    if (!B.morto && Math.hypot(G.x - gx, G.z - gz) < 8) parla(`Granata ${direzioneRelativa(avvolgi(rottaVerso(G.x, G.z, gx, gz) - G.rotta))}! Corri dall'altra parte.`, 1);
  });
  for (let t = 1.4; t < 2.95; t += 0.3 - (t - 1.4) * 0.12) pianifica(t, () => suonaInPunto('bip_granata', gx, gz, { gain: 1.0, ref: 3 }));
  pianifica(3.0, () => esplosioneBot(gx, gz, b));
}
function esplosioneBot(x, z, autore) {
  suonaInPunto('esplosione', x, z, { gain: 1.6, riverbero: 1.2, ref: 4 });
  G.effetti.esplosioni.push({ x, z, t: 0 });
  const raggio = 7;
  const dIo = Math.hypot(G.x - x, G.z - z);
  // un muro in mezzo o un piano più in alto riparano dallo scoppio
  const riparo = muroTra(x, z, G.x, G.z, 0, 0) ? 0.3 : (G.livello || 0) > 0 ? 0.5 : 1;
  if (dIo < raggio && !B.morto) { B.ultimoAggressore = autore; feriscimi(Math.round(70 * (1 - dIo / raggio) * riparo)); }
  B.granateVive = B.granateVive.filter(g => g.boom > G.tempo + 0.1);
  for (const b of B.bot) { const d = Math.hypot(b.x - x, b.z - z); if (b.vivo && b !== autore && d < raggio) feritoBot(b, Math.round(80 * (1 - d / raggio)), autore); }
  for (const c of G.costruzioni) if (Math.hypot(c.x - x, c.z - z) < raggio * 0.7) danneggiaCostruzione(c, 80);
}
