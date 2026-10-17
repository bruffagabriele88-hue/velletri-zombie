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
  piazza: { nome: 'Piazza', x: 0, z: 0, forzieri: 9 },
  campanile: { nome: 'Campanile', x: 0, z: -62, forzieri: 6, suono: 'campane', ogni: 40, ref: 22, gain: 0.35 },
  fontana: { nome: 'Fontana', x: 62, z: 0, forzieri: 6 },
  canile: { nome: 'Canile', x: 0, z: 62, forzieri: 6, suono: 'cani', ogni: 22, ref: 14, gain: 0.6 },
  bosco: { nome: 'Bosco', x: -62, z: 0, forzieri: 6, suono: 'civetta', ogni: 16, ref: 12, gain: 0.6 },
};
const FASI_TEMPESTA = [{ a: 30, c: 30, r: 55, d: 2 }, { a: 20, c: 25, r: 30, d: 4 }, { a: 15, c: 20, r: 12, d: 7 }, { a: 8, c: 20, r: 0, d: 10 }];
const RARITA = [[1, 'comune', 50], [1.15, 'raro', 30], [1.3, 'epico', 15], [1.5, 'leggendario', 5]];
const NOMI_BOT = ['Rocko', 'Vipera', 'Sandy', 'Lupo', 'Flo', 'Tank', 'Shelley', 'Bruno', 'Eddy', 'Nina', 'Reed'];
const ORDINALI = ['primo', 'secondo', 'terzo', 'quarto', 'quinto', 'sesto', 'settimo', 'ottavo', 'nono', 'decimo', 'undicesimo', 'dodicesimo'];
// come combattono gli avversari con ogni arma
const ARMI_BOT = {
  pistola: { suoni: ['sparo', 'sparo2', 'sparo3'], danno: 15, cadenza: 0.65, prob: 0.5, portata: 35, distanza: 10, valore: 1 },
  pompa: { suoni: ['pompa_sparo'], danno: 42, cadenza: 1.3, prob: 0.75, portata: 13, distanza: 5, valore: 2 },
  mitra: { suoni: ['ak_sparo', 'ak_sparo2', 'ak_sparo3'], danno: 10, cadenza: 0.16, raffica: 4, pausa: 1.1, prob: 0.4, portata: 45, distanza: 14, valore: 3 },
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
  G.arsenale = nuovoArsenale(null);
  G.arsenale.riserva = { '9mm': 45, cal12: 0, '762': 0, '308': 0 };
  G.inventario = { granate: 0, kit: 0, cibo: 2, materiali: 40, pozioni: 0, radar: 0 };
  G.livello = 0; G.prossimaTurbo = 0;
  D.trappole = []; D.radarFino = 0;
  B.lancio = lancio; B.attiva = true; B.morto = false; B.eliminazioni = 0; B.ultimoAggressore = null;
  B.zona = { cx: 0, cz: 0, r: RAGGIO_ISOLA }; B.fase = 0; B.stadio = 'attesa'; B.fine = FASI_TEMPESTA[0].a + 4; B.eroFuori = false;
  B.prossima = prossimaZona(); B.annunciata = false;

  // forzieri nei cinque luoghi
  D.casse = [];
  for (const L of Object.values(LUOGHI)) for (let i = 0; i < L.forzieri; i++) { const [x, z] = attorno(L.x, L.z, 13); D.casse.push(nuovoForziere(x, z, contenutoForziere())); }
  // altri forzieri sparsi per l'isola, lontano dai cinque luoghi
  for (let i = 0; i < 14; i++) { const [x, z] = attorno(0, 0, 88); D.casse.push(nuovoForziere(x, z, contenutoForziere())); }
  B.prossimaCassa = 25;
  creaCaseDiVetro();

  // io
  const mio = LUOGHI[lancio] || LUOGHI.piazza;
  [G.x, G.z] = attorno(mio.x, mio.z, 5);
  G.rotta = rottaVerso(G.x, G.z, mio.x, mio.z);

  // gli undici avversari: almeno due atterrano dove atterro io, così c'è subito da fare
  const chiavi = Object.keys(LUOGHI), voci = Object.keys(Audio3D.voci || {});
  const atterraggi = [lancio, 'piazza', 'piazza', 'piazza', 'campanile', 'campanile', 'fontana', 'fontana', 'canile', 'canile', 'bosco', 'bosco'].filter((k, i) => !(i > 1 && k === lancio && Math.random() < 0.5));
  B.bot = NOMI_BOT.slice(0, B.diff.bot).map((nome, i) => {
    const L = LUOGHI[atterraggi[i % atterraggi.length]] || LUOGHI[scegli(chiavi)];
    let [x, z] = attorno(L.x, L.z, 14);
    if (Math.hypot(x - G.x, z - G.z) < 9) { x += 10; z += 6; }
    const b = {
      bot: true, tipo: 'soldato', def: { nome, raggio: 0.35 }, nome, x, z, vita: 100, scudo: 0, vivo: true, udito: false, ultimoSuono: -99,
      allertato: false, allertaFino: 0, occluso: false, occlusione: 0, alto: false, carica: false, stordito: 0, fase: Math.random() * 9, morteT: 0,
      sorgente: creaSorgente({ ref: 5, riverbero: 0.15 }), voce: voci.length ? voci[i % voci.length] : null, tono: caso(0.94, 1.06),
      arma: 'pistola', rar: 1, materiali: 40, livello: 0, granate: Math.random() < 0.5 ? 1 : 0, bersaglio: null, prossimoPensiero: caso(0, 0.5), prossimoSparo: 4 + caso(0, 2), colpiRaffica: 0,
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
  // la caduta dal cielo: tre secondi di vento, poi i piedi a terra
  G.occupatoFino = 3;
  pianifica(0.05, () => suona('caduta', { gain: 0.9 }));
  pianifica(3, () => { suona('corpo_cade', { gain: 0.5, rate: 1.3 }); colpoInizio(); parla(`${mio.nome}. ${B.bot.length + 1} in gara.`, 2); });
  parla(G.pausa ? 'Clicca per lanciarti.' : 'Ti lanci.', 2);
  aggiornaPannello();
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
  if (f && !B.annunciata && G.tempo > 5) { B.annunciata = true; parla(`Tempesta tra ${Math.round(B.fine - G.tempo)} secondi. ${dovePerLaZona()}`, 1); }
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

function pensa(b) {
  // sceglie il bersaglio: il combattente vivo più vicino entro 38 metri
  let best = null;
  for (const f of ['io', ...B.bot]) {
    if (f === b || !vivoDi(f)) continue;
    if (f === 'io' && G.tempo < 8) continue; // i primi secondi dopo l'atterraggio nessuno mi prende di mira
    if (f === 'io' && nascostoNelVetro() && Math.hypot(G.x - b.x, G.z - b.z) > 4) continue;
    // al massimo due avversari mi prendono di mira insieme: di più non si capirebbe niente
    if (f === 'io' && b.bersaglio !== 'io' && B.bot.filter(o => o.vivo && o !== b && o.bersaglio === 'io').length >= 2) continue;
    const [x, z] = posDi(f), d = Math.hypot(x - b.x, z - b.z);
    if (d < 38 && (!best || d < best.d)) best = { f, d };
  }
  if (b.allertato) { b.allertato = false; b.allertaFino = G.tempo + 8; }
  const sveglio = best && (best.d < 24 || G.tempo < b.allertaFino);
  const prima = b.bersaglio;
  b.bersaglio = sveglio ? best.f : null;
  if (b.bersaglio && b.bersaglio !== prima) {
    b.prossimoSparo = Math.max(b.prossimoSparo, G.tempo + (b.bersaglio === 'io' ? caso(1.2, 2.0) * B.diff.reazione : caso(0.5, 1.1)) / b.bravura); // tempo di reazione
    if (b.bersaglio === 'io') fraseBot(b, 'minaccia');
  }
  // senza nemici: va al forziere più vicino, se ce n'è uno
  if (!b.bersaglio && !b.forziere) {
    let f = null;
    for (const c of D.casse) { const d = Math.hypot(c.x - b.x, c.z - b.z); if (d < 55 && (!f || d < f.d)) f = { c, d }; }
    b.forziere = f ? f.c : null;
  }
}

function aggiornaBot(b, dt) {
  if (!b.vivo) { b.morteT += dt; return; }
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

  if (G.tempo < b.apreFino) { /* sta aprendo un forziere: fermo */ }
  else if (fuoriZona || fuoriProssima) {
    const d = Math.hypot(P.cx - b.x, P.cz - b.z) || 1; mx = (P.cx - b.x) / d; mz = (P.cz - b.z) / d; v = fuoriZona ? 4.6 : 3.2;
  } else if (T) {
    const [tx, tz] = posDi(T), d = Math.hypot(tx - b.x, tz - b.z) || 1, ux = (tx - b.x) / d, uz = (tz - b.z) / d;
    const avanza = d > W.distanza + 3 ? 1 : d < W.distanza - 3 ? -0.6 : 0;
    mx = ux * avanza - uz * b.lato * 0.6; mz = uz * avanza + ux * b.lato * 0.6; v = 2.6;
    if (Math.random() < dt * 0.4) b.lato *= -1;
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
        if (ARMI_BOT[c.cont]) { if (ARMI_BOT[c.cont].valore * (c.rar || 1) > ARMI_BOT[b.arma].valore * b.rar) { b.arma = c.cont; b.rar = c.rar || 1; } }
        else if (c.cont === 'pozione') b.scudo = Math.min(100, b.scudo + 50);
        else if (c.cont === 'granate') b.granate = (b.granate || 0) + 2;
        b.materiali += c.materiali || 5;
      } else { mx = (b.forziere.x - b.x) / d; mz = (b.forziere.z - b.z) / d; v = 3.0; }
    }
  } else {
    // gironzola dentro la zona
    if (!b.meta || G.tempo >= b.prossimaMeta || Math.hypot(b.meta[0] - b.x, b.meta[1] - b.z) < 2) { b.meta = attorno(P.cx, P.cz, Math.max(4, P.r * 0.7)); b.prossimaMeta = G.tempo + caso(6, 12); }
    const d = Math.hypot(b.meta[0] - b.x, b.meta[1] - b.z) || 1; mx = (b.meta[0] - b.x) / d; mz = (b.meta[1] - b.z) / d; v = 2.2;
  }
  if (b.stordito > 0) v = 0;
  // si cura quando può
  if (!T && b.vita < 45 && G.tempo >= b.prossimaCura) { b.prossimaCura = G.tempo + 25; b.apreFino = G.tempo + 3; b.vita = Math.min(100, b.vita + 45); }

  const lung = Math.hypot(mx, mz);
  if (v > 0 && lung > 0.01) {
    const nx = b.x + mx / lung * v * dt, nz = b.z + mz / lung * v * dt;
    if (!muroTra(b.x, b.z, nx, nz, b.livello || 0, b.livello || 0)) { b.x = nx; b.z = nz; }
    else b.lato *= -1; // gira attorno al muro
    const dIo = Math.hypot(b.x - G.x, b.z - G.z);
    if (dIo < 32 && G.tempo >= b.prossimoPasso) {
      b.prossimoPasso = G.tempo + (v > 3.5 ? 0.3 : 0.4);
      suonoBot(b, v > 3.5 ? `corsa${casoInt(1, 6)}` : `io_passo${casoInt(1, 4)}`, { gain: 1.4, rate: caso(0.95, 1.05) });
      // chi cammina su muri e rampe fa passi di legno: si capisce che è in alto
      if ((b.livello || 0) > 0) suonoBot(b, 'legno_colpito', { gain: 0.55, rate: caso(1.5, 1.8) });
    }
  }
  // spara
  if (T && G.tempo >= b.prossimoSparo && G.tempo >= b.apreFino && b.stordito <= 0) {
    const [tx, tz] = posDi(T), d = Math.hypot(tx - b.x, tz - b.z);
    if (d <= W.portata) sparaBot(b, T, tx, tz, d, W);
    else b.prossimoSparo = G.tempo + 0.3;
  }
  posiziona(b.sorgente, b.x, ((b.livello || 0) - (G.livello || 0)) * 2.5, b.z);
  aggiornaPianoBot(b);
  if (T && G.tempo >= (b.prossimaCostruzione || 0)) botCostruisce(b, T);
  if (T === 'io' && b.granate > 0 && G.tempo >= (b.prossimaGranata || 0)) botGranata(b);
}

function sparaBot(b, T, tx, tz, d, W) {
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
  } else if (dIo < 22 && G.tempo >= (B.prossimoSparoAltrui || 0)) {
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
  let p = W.prob * lim(1.25 - d / W.portata, 0.1, 1) * b.bravura;
  const tLiv = T === 'io' ? G.livello || 0 : T.livello || 0;
  if ((b.livello || 0) > tLiv) p *= 1.2;   // dall'alto si colpisce meglio
  const danno = Math.round(W.danno * b.rar * caso(0.85, 1.15));
  if (T === 'io') {
    // contro di me sono meno precisi, e lo diventano di più solo quando restano in pochi
    p *= (rimasti() <= 4 ? 0.5 : 0.36) * (G.inMovimento ? 0.6 : 1) * B.diff.prec;
    if (Math.random() < p) pianifica(d / 600, () => { if (!B.morto) { B.ultimoAggressore = b; feriscimi(danno, true); } });
    else if (Math.random() < 0.5) {
      const lato = Math.random() < 0.5 ? -1 : 1;
      suonaVicino('sibilo', lato * caso(0.6, 1.6), caso(-0.5, 0.5), 0.2, { gain: 1.0, quando: d / 600, rate: caso(0.9, 1.15) });
    }
  } else if (Math.random() < p * 0.4) feritoBot(T, danno, b); // tra di loro si colpiscono meno: la partita deve durare
}

// un avversario viene colpito (da me o da un altro)
function feritoBot(b, danno, da) {
  if (!b.vivo) return;
  const assorbito = Math.min(b.scudo, danno); b.scudo -= assorbito; b.vita -= danno - assorbito;
  b.allertaFino = G.tempo + 10; b.ultimoAggressore = da;
  if (b.vita <= 0) { elimina(b, da); return; }
  // sotto tiro reagisce costruendo subito
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
  const cont = b.arma !== 'pistola' ? { cont: b.arma, rar: b.rar } : { cont: scegli(['pozione', 'bende', 'kit']) };
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
  f += `${armaDef().nome}${st.rarita && st.rarita > 1 ? ' ' + nomeRarita(st.rarita) : ''} ${st.caricatore + st.camera}, riserva ${G.arsenale.riserva[armaDef().munizione]}. Vita ${Math.round(G.vita)}, scudo ${Math.round(G.scudo)}. ${G.inventario.materiali} materiali`;
  if (G.inventario.pozioni) f += `, ${plurale(G.inventario.pozioni, 'pozione', 'pozioni')}`;
  if (G.inventario.cibo) f += `, ${G.inventario.cibo} bende`;
  if (G.inventario.kit) f += `, ${plurale(G.inventario.kit, 'kit', 'kit')}`;
  if (G.inventario.radar) f += `, ${plurale(G.inventario.radar, 'radar', 'radar')}`;
  parla(f + '.', 2);
}

// ferma i suoni continui della battaglia (chiamata quando si esce o si ricomincia)
function battagliaFerma() {
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
function costruisciRapido(tipo) {
  if (B.morto || G.stato !== 'gioco' || G.tempo < 3) return false;
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
    if (caduta >= 2 && !B.morto) { B.ultimoAggressore = null; feriscimi(10 * (caduta - 1)); }
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
  if (!tenuto || B.morto) { B.agganciato = null; return; }
  let b = B.agganciato;
  const portata = Math.max(15, armaDef().portata);
  if (!b || !b.vivo || Math.hypot(b.x - G.x, b.z - G.z) > portata) {
    b = B.bot.filter(x => x.vivo && x.udito && Math.hypot(x.x - G.x, x.z - G.z) < portata).sort((p, q) => Math.hypot(p.x - G.x, p.z - G.z) - Math.hypot(q.x - G.x, q.z - G.z))[0] || null;
    if (b && b !== B.agganciato) { suona('tic', { gain: 0.6, rate: 1.4 }); parla(`agganciato ${b.nome}${descriviAltezza(b)}`, 0); }
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
  const b = B.bot.filter(x => x.vivo && x.udito).sort((p, q) => Math.hypot(p.x - G.x, p.z - G.z) - Math.hypot(q.x - G.x, q.z - G.z))[0];
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
  const vicini = B.bot.filter(b => b.vivo && Math.hypot(b.x - G.x, b.z - G.z) < 60)
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
  if (G.vita < 35 && !B.morto) {
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
  pianifica(0.9, () => { suonaInPunto('granata_rimbalzo', gx, gz, { gain: 1.0, rate: 0.75 }); if (!B.morto && Math.hypot(G.x - gx, G.z - gz) < 8) parla('Granata!', 1); });
  for (let t = 1.4; t < 2.95; t += 0.3 - (t - 1.4) * 0.12) pianifica(t, () => suonaInPunto('bip_granata', gx, gz, { gain: 1.0, ref: 3 }));
  pianifica(3.0, () => esplosioneBot(gx, gz, b));
}
function esplosioneBot(x, z, autore) {
  suonaInPunto('esplosione', x, z, { gain: 1.6, riverbero: 1.2, ref: 4 });
  G.effetti.esplosioni.push({ x, z, t: 0 });
  const raggio = 7;
  const dIo = Math.hypot(G.x - x, G.z - z);
  if (dIo < raggio && !B.morto) { B.ultimoAggressore = autore; feriscimi(Math.round(70 * (1 - dIo / raggio))); }
  for (const b of B.bot) { const d = Math.hypot(b.x - x, b.z - z); if (b.vivo && b !== autore && d < raggio) feritoBot(b, Math.round(80 * (1 - d / raggio)), autore); }
  for (const c of G.costruzioni) if (Math.hypot(c.x - x, c.z - z) < raggio * 0.7) danneggiaCostruzione(c, 80);
}
