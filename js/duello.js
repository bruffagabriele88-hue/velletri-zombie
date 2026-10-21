'use strict';
// Duello in rete tra persone vere, da 2 a 4 giocatori, tutti contro tutti (Mac o Windows, basta un browser).
// Ci si trova con un codice di stanza di 4 cifre: niente indirizzi IP e niente porte da aprire sul router.
// Arena: Piazza Cairoli. Ogni round: si parte con la pistola, le casse danno armi e scudo,
// la zona si restringe, si costruiscono muri e rampe. L'ultimo in piedi vince il round.

const D = {
  rete: null, collegato: false, ospite: false, codice: '', base: '', cid: '', cidOspite: null,
  giocatori: [], attivo: false, avvio: false, altri: new Map(), punti: {}, traguardo: 5, round: 0,
  fuori: true, prossimoInvio: 0, attesa: null, bussa: null, casse: [], inizioRound: 0, sorgenteZona: null,
  zonaAnnunciata: false, eroFuori: false, prossimoDannoZona: 0, prossimaCassa: 0, 
  ultimoAggressore: null, ultimoColpoSubito: -99, roundChiuso: false, finito: false,
};
const RAGGIO_ARENA = 24, RAGGIO_FINALE = 5, LIMITE = 32;
const PREFISSO_STANZA = 'velletri-zombie-1v1-';
// suoni della mia arma che anche gli altri sentono, dal punto in cui mi trovo
const SUONI_IN_RETE = new Set(['sgancio', 'inserimento', 'carrello', 'ak_sgancio', 'ak_inserimento', 'ak_otturatore',
  'pompa_indietro', 'pompa_avanti', 'cartuccia', 'arma_estrai', 'raccogli']);
const SERVER_APPOGGIO = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];

// intercetto i suoni "miei" (senza posizione) per mandarli anche agli altri
const suonaBase = suona;
suona = function (nome, opz = {}) { // eslint-disable-line no-global-assign
  if (D.attivo && !opz.dest && SUONI_IN_RETE.has(nome) && (opz.gain ?? 1) > 0.3) duelloInvia({ t: 'suono', n: nome });
  return suonaBase(nome, opz);
};

// ---------------------------------------------------------------- rete
// I computer non si collegano direttamente (spesso i router di casa lo impediscono): si scambiano
// i messaggi attraverso un server di appoggio pubblico (protocollo MQTT su WebSocket).
function duelloInvia(m) {
  if (!D.rete || !D.collegato) return;
  m.c = D.cid;
  try { D.rete.publish(D.base + '/t', JSON.stringify(m), { qos: m.t === 's' ? 0 : 1 }); } catch (e) { /* rete persa */ }
}

function caricaRete() {
  return new Promise((ok, ko) => {
    if (window.mqtt) return ok();
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js';
    s.onload = ok; s.onerror = () => ko(new Error('rete'));
    document.head.appendChild(s);
  });
}

function collegaServer(indice = 0) {
  return new Promise((ok, ko) => {
    if (indice >= SERVER_APPOGGIO.length) return ko(new Error('nessun server'));
    const c = mqtt.connect(SERVER_APPOGGIO[indice], { connectTimeout: 7000, reconnectPeriod: 2000, keepalive: 20, protocolVersion: 5 });
    let deciso = false;
    const scaduto = setTimeout(() => { if (!deciso) { deciso = true; c.end(true); collegaServer(indice + 1).then(ok, ko); } }, 8000);
    c.on('connect', () => { if (!deciso) { deciso = true; clearTimeout(scaduto); ok(c); } });
    c.on('error', () => { if (!deciso) { deciso = true; clearTimeout(scaduto); c.end(true); collegaServer(indice + 1).then(ok, ko); } });
  });
}

async function duelloApriRete(codice, ospite) {
  await caricaRete();
  D.ospite = ospite; D.codice = codice; D.base = PREFISSO_STANZA + codice; D.collegato = false;
  D.cid = Math.random().toString(36).slice(2, 10); D.cidOspite = ospite ? D.cid : null;
  D.giocatori = ospite ? [D.cid] : []; D.avvio = false;
  D.rete = await collegaServer();
  await new Promise(r => D.rete.subscribe(D.base + '/t', { qos: 1, nl: true }, r)); // nl: non mi rimanda i miei messaggi
  D.collegato = true;
  // segnale "ci sono" ogni 2 secondi, anche se il gioco è fermo dietro una finestra del browser o in secondo piano
  clearInterval(D.presenza);
  D.presenza = setInterval(() => { if (D.attivo) duelloInvia({ t: 'vivo' }); }, 2000);
  D.rete.on('message', (topic, dati) => {
    let m; try { m = JSON.parse(dati.toString()); } catch (e) { return; }
    if (!m || !m.c || m.c === D.cid) return;
    try { duelloSmista(m); } catch (e) { console.error(e); }
  });
}

// --- controllo dei messaggi in arrivo: mai fidarsi di ciò che arriva dalla rete
const numOk = v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 500;
const TIPI_COSTRUZIONE = ['barricata', 'rampa'];
const CONTENUTI_VALIDI = ['radar', 'scudo', 'pompa', 'mitra', 'precisione', 'pistola', 'granate', 'kit', 'materiali', 'bende', 'pozione'];
function cassaPulita(c) {
  if (!c || !numOk(c.x) || !numOk(c.z) || typeof c.id !== 'string' || !CONTENUTI_VALIDI.includes(c.cont)) return null;
  return { id: c.id.slice(0, 20), x: c.x, z: c.z, cont: c.cont };
}
function listaPulita(l) { return Array.isArray(l) && l.length >= 1 && l.length <= 4 && l.every(c => typeof c === 'string' && c.length <= 12) ? l : null; }
function puntiPuliti(p) {
  const out = {};
  if (p && typeof p === 'object') for (const c of D.giocatori) out[c] = numOk(p[c]) ? lim(Math.round(p[c]), 0, 99) : 0;
  return out;
}
// restituisce il messaggio ripulito, oppure null se è da scartare
function messaggioValido(m) {
  if (!m || typeof m.t !== 'string' || typeof m.c !== 'string' || m.c.length > 12) return null;
  switch (m.t) {
    case 'ciao': case 'addio': case 'vivo': case 'ripeti': case 'presa': case 'rtc': return m;
    case 'prov': return typeof m.n === 'string' && m.n.length < 30 ? { t: 'prov', c: m.c, n: m.n } : null;
    case 'ok': case 'via': { const l = listaPulita(m.lista); return l ? { ...m, lista: l } : null; }
    case 's': return numOk(m.x) && numOk(m.z) ? { t: 's', c: m.c, x: lim(m.x, -LIMITE, LIMITE), z: lim(m.z, -LIMITE, LIMITE), m: [0, 1, 2].includes(m.m) ? m.m : 0, v: numOk(m.v) ? m.v : 100, h: Number.isInteger(m.h) ? lim(m.h, 0, 6) : 0, f: m.f ? 1 : 0, rn: numOk(m.rn) ? m.rn : 0 } : null;
    case 'sparo': return { t: 'sparo', c: m.c, n: typeof m.n === 'string' ? m.n : 'sparo', r: numOk(m.r) ? m.r : 0 };
    case 'colpo': return numOk(m.d) && m.d > 0 ? { t: 'colpo', c: m.c, a: m.a, d: Math.min(m.d, 200), testa: !!m.testa } : null;
    case 'suono': return typeof m.n === 'string' ? m : null;
    case 'boom': return numOk(m.x) && numOk(m.z) ? m : null;
    case 'trappola': return numOk(m.x) && numOk(m.z) ? { t: 'trappola', c: m.c, x: m.x, z: m.z } : null;
    case 'dannoC': return typeof m.id === 'string' && numOk(m.d) && m.d > 0 ? { ...m, d: Math.min(m.d, 200) } : null;
    case 'costruzione': {
      const k = m.c2;
      if (!k || !TIPI_COSTRUZIONE.includes(k.tipo) || typeof k.id !== 'string' || ![k.x, k.z, k.ax, k.az, k.bx, k.bz].every(numOk)) return null;
      if (G.costruzioni.length >= 40) return null;
      const vita = numOk(k.vita) ? lim(k.vita, 1, 200) : 100;
      const livello = Number.isInteger(k.livello) ? lim(k.livello, 0, 6) : 0, dir = (v) => (typeof v === 'number' && Math.abs(v) <= 1.01 ? v : 0);
      return { t: 'costruzione', c: m.c, c2: { id: k.id.slice(0, 20), tipo: k.tipo, nome: k.tipo === 'rampa' ? 'rampa' : 'muro', x: k.x, z: k.z, ax: k.ax, az: k.az, bx: k.bx, bz: k.bz, livello, dirx: dir(k.dirx), dirz: dir(k.dirz), vita, vitaMax: vita, pronta: true, nato: G.tempo } };
    }
    case 'morto': return { t: 'morto', c: m.c, da: typeof m.da === 'string' ? m.da : null };
    case 'round': {
      if (!numOk(m.n) || !m.pos || typeof m.pos !== 'object') return null;
      const pos = {};
      for (const c of D.giocatori) { const p = m.pos[c]; if (!Array.isArray(p) || !numOk(p[0]) || !numOk(p[1])) return null; pos[c] = [lim(p[0], -LIMITE, LIMITE), lim(p[1], -LIMITE, LIMITE)]; }
      return { t: 'round', c: m.c, n: Math.round(m.n), pos, punti: puntiPuliti(m.punti), casse: (Array.isArray(m.casse) ? m.casse : []).map(cassaPulita).filter(Boolean).slice(0, 6), mod: typeof m.mod === 'string' && ROUND_SPECIALI[m.mod] !== undefined ? m.mod : 'normale' };
    }
    case 'fineRound': return { t: 'fineRound', c: m.c, vincitore: typeof m.vincitore === 'string' ? m.vincitore : null, punti: puntiPuliti(m.punti), fine: !!m.fine };
    case 'cassa': { const k = cassaPulita(m.cassa); return k ? { t: 'cassa', c: m.c, cassa: k } : null; }
    default: return null;
  }
}

function duelloSmista(m) {
  m = messaggioValido(m);
  if (!m) return;
  // --- sala d'attesa
  if (m.t === 'ciao') {
    if (!D.ospite || D.attivo || D.avvio) return;
    if (!D.giocatori.includes(m.c)) {
      if (D.giocatori.length >= 4) return;
      D.giocatori.push(m.c);
      suonaBase('tic', { gain: 0.6 });
      parla(`Giocatore entrato. Siete in ${D.giocatori.length}. Invio per iniziare.`, 2);
      aggiornaPannello();
    }
    duelloInvia({ t: 'ok', per: m.c, lista: D.giocatori });
    return;
  }
  if (m.t === 'ok') {
    if (D.ospite) return;
    if (m.per === D.cid && !D.cidOspite) {
      D.cidOspite = m.c; clearInterval(D.bussa); clearTimeout(D.attesa);
      G.stato = 'attesa';
      parla(`Sei nella stanza. Siete in ${m.lista.length}. Attendi il via.`, 2);
    }
    if (m.c === D.cidOspite) { D.giocatori = m.lista; aggiornaPannello(); }
    return;
  }
  if (m.t === 'via') {
    if (!D.ospite && m.c === D.cidOspite && m.lista.includes(D.cid) && !D.avvio) { D.giocatori = m.lista; D.avvio = true; duelloAvvia(); }
    return;
  }
  if (!D.giocatori.includes(m.c)) return;
  if (m.t === 'addio') { duelloUscito(m.c); return; }
  const a = D.altri.get(m.c);
  if (a) a.ultimoMessaggio = performance.now();
  if (D.attivo) duelloRicevi(m, a);
}

// ---------------------------------------------------------------- stanza
async function duelloCrea() {
  G.stato = 'caricamento'; aggiornaPannello();
  parla('Creo la stanza.', 2);
  try { await duelloApriRete(String(casoInt(1000, 9999)), true); }
  catch (e) { console.error(e); parla('Collegamento non riuscito. Per il duello serve internet.', 2); duelloChiudi(); apriMenu('menu'); return; }
  G.stato = 'attesa'; aggiornaPannello(); duelloDiciCodice();
}
function duelloDiciCodice() {
  if (D.ospite) parla(`Codice stanza: ${D.codice.split('').join(', ')}. Giocatori: ${D.giocatori.length}. Quando siete tutti, premi Invio. Esc per annullare.`, 2);
  else parla(`Siete in ${D.giocatori.length}. Attendi il via.`, 1);
}
function duelloDaiIlVia() {
  if (!D.ospite) return;
  if (D.giocatori.length < 2) { parla('Serve almeno un avversario.', 1); return; }
  D.avvio = true;
  duelloInvia({ t: 'via', lista: D.giocatori });
  duelloAvvia();
}

async function duelloEntra() {
  const codice = G.testo.replace(/\D/g, '');
  if (codice.length !== 4) { parla('Il codice ha 4 cifre.', 1); return; }
  G.stato = 'caricamento'; aggiornaPannello();
  parla('Mi collego.', 2);
  try { await duelloApriRete(codice, false); }
  catch (e) { console.error(e); parla('Collegamento non riuscito. Per il duello serve internet.', 2); duelloChiudi(); apriMenu('menu'); return; }
  const bussa = () => duelloInvia({ t: 'ciao' });
  bussa(); D.bussa = setInterval(bussa, 1000);
  D.attesa = setTimeout(() => { if (!D.cidOspite) { parla('Stanza non trovata. Controlla il codice.', 2); duelloChiudi(); apriMenu('menu'); } }, 15000);
}

function duelloUscito(cid) {
  const i = D.giocatori.indexOf(cid); if (i < 0) return;
  if (!D.attivo && cid !== D.cidOspite) {
    // in sala d'attesa: tolgo chi se ne va
    D.giocatori.splice(i, 1); aggiornaPannello();
    if (D.ospite) { parla(`Un giocatore è uscito. Siete in ${D.giocatori.length}.`, 1); duelloInvia({ t: 'ok', per: '', lista: D.giocatori }); }
    return;
  }
  if (cid === D.cidOspite || D.giocatori.length <= 2) {
    // se esce chi ha creato la stanza, o resto solo, la partita finisce
    if (!D.attivo && G.stato !== 'attesa') return;
    duelloChiudi(); pulisciPartita();
    if (document.pointerLockElement) document.exitPointerLock();
    apriMenu('menu', 'Partita finita: gli altri sono usciti. ');
    return;
  }
  const nome = nomeAvversario(cid);
  D.giocatori.splice(i, 1);
  const a = D.altri.get(cid);
  if (a) { a.vivo = false; a.morteT = 99; a.uscito = true; chiudiSorgente(a.sorgente); chiudiSorgente(a.sorgenteVoce); G.nemici = G.nemici.filter(n => n !== a); D.altri.delete(cid); }
  vocaleChiudi(cid);
  parla(`${nome} è uscito.`, 1);
  if (D.ospite) duelloControllaRound();
}

function duelloChiudi() {
  clearTimeout(D.attesa); clearInterval(D.bussa); clearInterval(D.presenza);
  if (D.collegato) duelloInvia({ t: 'addio' });
  D.attivo = false; D.avvio = false; D.collegato = false; D.finito = false;
  if (D.sorgenteZona) { fermaLoop(D.sorgenteZona); D.sorgenteZona = null; }
  for (const cid of [...Vocale.pc.keys()]) vocaleChiudi(cid);
  if (Vocale.flusso) { Vocale.flusso.getTracks().forEach(t => t.stop()); Vocale.flusso = null; }
  Vocale.pronta = null;
  D.altri.clear(); D.casse = []; D.giocatori = [];
  const r = D.rete; D.rete = null;
  if (r) setTimeout(() => { try { r.end(true); } catch (e) { /* già chiusa */ } }, 300);
}

function nomeAvversario(cid) {
  const altri = D.giocatori.filter(c => c !== D.cid);
  return altri.length <= 1 ? 'avversario' : `avversario ${altri.indexOf(cid) + 1}`;
}

// ---------------------------------------------------------------- partita
async function duelloAvvia() {
  G.citta = CENTRO_VELLETRI; G.osm = null;
  G.stato = 'caricamento';
  await preparaMappa();
  pulisciPartita();
  G.modalita = 'duello'; G.pos = null; G.ondata = null;
  G.tempo = 0; G.campo = null; G.uccisi = 0; G.punti = 0; G.serie = { n: 0, fino: 0 }; G.ultimaFerita = -99; G.prossimaSpinta = 0;
  G.x = 0; G.z = 0; G.rotta = 0; G.vita = 100; G.scudo = 0; G.alto = false; G.occupatoFino = Infinity;
  duelloEquipaggia();
  D.altri.clear(); D.punti = {}; D.casse = [];
  for (const cid of D.giocatori) {
    D.punti[cid] = 0;
    if (cid === D.cid) continue;
    const a = {
      remoto: true, cid, tipo: 'soldato', nome: nomeAvversario(cid), livello: 0, def: { nome: nomeAvversario(cid), raggio: 0.35, versi: [] },
      x: 0, z: -10, tx: 0, tz: -10, vita: 100, vivo: false, udito: true, allertato: true, occluso: false, occlusione: 0, alto: false,
      sorgente: creaSorgente({ ref: 9, rolloff: 0.8, riverbero: 0.15 }), sorgenteVoce: creaSorgente({ ref: 6, riverbero: 0.1 }),
      mov: 0, prossimoPasso: 0, fase: 0, morteT: 99, stordito: 0, carica: false, tono: 1, ultimoMessaggio: performance.now(),
    };
    D.altri.set(cid, a); G.nemici.push(a);
  }
  D.attivo = true; D.round = 0; D.fuori = true; D.finito = false;
  if (!D.sorgenteZona) { D.sorgenteZona = creaSorgente({ ref: 3, riverbero: 0.2 }); D.sorgenteZona.src = suonaBase('zona', { dest: D.sorgenteZona.ingresso, gain: 0, loop: true }); }
  aggiornaAscoltatore(G.x, G.z, G.rotta);
  avviaAmbiente();
  G.stato = 'gioco'; G.pausa = false;
  aggiornaPannello();
  parla(`Si comincia. ${D.giocatori.length > 2 ? 'Tutti contro tutti. ' : ''}Vince chi arriva a ${D.traguardo} round. ${document.pointerLockElement === tela ? '' : 'Clicca per agganciare il mouse.'}`, 2);
  vocaleAvvia();
  if (D.ospite) pianifica(4, duelloNuovoRound);
}

// si parte leggeri: pistola, pochi materiali. Il resto si trova nelle casse.
function duelloEquipaggia(mod = 'normale') {
  G.arsenale = nuovoArsenale(null);
  G.arsenale.riserva = { '9mm': 45, cal12: 0, '762': 0, '308': 0 };
  G.inventario = { granate: 0, kit: 0, cibo: 0, materiali: 12, radar: 0 };
  G.scudo = 0; G.alto = false; G.livello = 0; G.rampaSotto = null; G.velocitaExtra = 1;
  D.trappole = [];
  // round speciali
  if (mod === 'pompa') { G.arsenale.armi.pompa = { caricatore: 6, camera: 1 }; G.arsenale.riserva.cal12 = 30; G.arsenale.corrente = 'pompa'; }
  if (mod === 'precisione') { G.arsenale.armi.precisione = { caricatore: 5, camera: 1 }; G.arsenale.riserva['308'] = 20; G.arsenale.corrente = 'precisione'; }
  if (mod === 'veloce') G.velocitaExtra = 1.5;
  if (mod === 'granate') G.inventario.granate = 5;
  if (mod === 'torri') G.inventario.materiali = 100;
  if (mod === 'scudi') G.scudo = 100;
  if (mod === 'costruttori') G.inventario.materiali = 60;
}
const ROUND_SPECIALI = {
  normale: '', pompa: 'solo fucili a pompa', precisione: 'solo fucili di precisione', veloce: 'tutti velocissimi',
  scudi: 'tutti con lo scudo pieno', costruttori: '60 materiali a testa: costruite!',
  granate: 'cinque granate a testa', tempesta: 'la tempesta si chiude subito, e in fretta', torri: 'cento materiali, si combatte in alto',
};

const CONTENUTI_CASSA = [['scudo', 22], ['pompa', 18], ['mitra', 18], ['precisione', 11], ['radar', 10], ['granate', 9], ['kit', 7], ['materiali', 5]];
function contenutoCasuale() {
  let r = Math.random() * 100;
  for (const [nome, peso] of CONTENUTI_CASSA) { if (r < peso) return nome; r -= peso; }
  return 'scudo';
}
function puntoCasuale(raggio) { const a = caso(-Math.PI, Math.PI), r = Math.sqrt(Math.random()) * raggio; return [Math.sin(a) * r, -Math.cos(a) * r]; }

// solo chi ha creato la stanza decide posizioni, casse e punteggio, e li comunica agli altri
function duelloNuovoRound() {
  if (!D.attivo || !D.ospite) return;
  D.round++;
  const a0 = caso(-Math.PI, Math.PI), r = RAGGIO_ARENA * 0.7, pos = {};
  D.giocatori.forEach((cid, i) => { const a = a0 + i * PI2 / D.giocatori.length; pos[cid] = [Math.sin(a) * r, -Math.cos(a) * r]; });
  const casse = [0, 1, 2, 3, 4].map(() => { const [x, z] = puntoCasuale(16); return { id: Math.random().toString(36).slice(2), x, z, cont: contenutoCasuale() }; });
  // dal secondo round, uno su tre è speciale
  const mod = D.round > 1 && Math.random() < 0.34 ? scegli(Object.keys(ROUND_SPECIALI).filter(k => k !== 'normale')) : 'normale';
  const m = { t: 'round', n: D.round, pos, punti: D.punti, casse, mod };
  D.ultimoRound = m;
  duelloInvia(m);
  duelloApplicaRound(m);
}

function duelloApplicaRound(m) {
  D.round = m.n; D.punti = m.punti; D.fuori = false; D.finito = false; D.roundChiuso = false;
  D.inizioRound = G.tempo; D.zonaAnnunciata = false; D.eroFuori = false; D.prossimaCassa = G.tempo + 16; D.ultimoAggressore = null;
  G.stato = 'gioco'; G.pausa = false;
  G.eventi = []; G.costruzioni = [];
  [G.x, G.z] = m.pos[D.cid] || [0, 0];
  G.rotta = rottaVerso(G.x, G.z, 0, 0); G.vita = 100;
  D.mod = ROUND_SPECIALI[m.mod] !== undefined ? m.mod : 'normale';
  duelloEquipaggia(D.mod);
  G.occupatoFino = G.tempo + 1.5;
  for (const [cid, a] of D.altri) {
    const p = m.pos[cid]; if (!p) continue;
    a.x = a.tx = p[0]; a.z = a.tz = p[1]; a.vivo = true; a.vita = 100; a.morteT = 0; a.mov = 0; a.alto = false;
    a.ultimoMessaggio = performance.now();
    posiziona(a.sorgente, a.x, 0, a.z, true);
  }
  D.casse = m.casse.map(c => ({ ...c, aTerra: true, prossimoPing: G.tempo + caso(0.5, 1.5), detta: false }));
  colpoInizio();
  parla(`Round ${m.n}${D.mod !== 'normale' ? ', speciale: ' + ROUND_SPECIALI[D.mod] : ''}. ${descriviPunteggio()} Via.`, 2);
  aggiornaPannello();
}

function descriviPunteggio() {
  const altri = D.giocatori.filter(c => c !== D.cid);
  if (altri.length === 1) return `${D.punti[D.cid] || 0} a ${D.punti[altri[0]] || 0}.`;
  return `Tu ${D.punti[D.cid] || 0}. ` + altri.map(c => `${nomeAvversario(c)} ${D.punti[c] || 0}`).join(', ') + '.';
}

function duelloMorte() {
  if (D.fuori) return;
  D.fuori = true; G.occupatoFino = Infinity; G.arsenale.grilletto = false; G.alto = false;
  const da = G.tempo - D.ultimoColpoSubito < 6 ? D.ultimoAggressore : null;
  duelloInvia({ t: 'morto', da });
  parla(da ? `Abbattuto da ${nomeAvversario(da)}.` : 'Sei stato abbattuto.', 2);
  if (D.ospite) duelloControllaRound();
}

// chi ha creato la stanza controlla se è rimasto un solo giocatore in piedi
function duelloControllaRound() {
  if (!D.ospite || D.roundChiuso || !D.attivo) return;
  const vivi = D.giocatori.filter(cid => cid === D.cid ? !D.fuori : (D.altri.get(cid) && D.altri.get(cid).vivo));
  if (vivi.length > 1) return;
  D.roundChiuso = true;
  const vincitore = vivi[0] || null;
  if (vincitore) D.punti[vincitore] = (D.punti[vincitore] || 0) + 1;
  const fine = vincitore && D.punti[vincitore] >= D.traguardo;
  const m = { t: 'fineRound', vincitore, punti: D.punti, fine };
  duelloInvia(m);
  duelloFineRound(m);
  if (!fine) pianifica(5, duelloNuovoRound);
}

function duelloFineRound(m) {
  D.punti = m.punti; D.fuori = true; G.occupatoFino = Infinity;
  const chi = !m.vincitore ? 'Nessuno in piedi.' : m.vincitore === D.cid ? 'Round tuo!' : `Round a ${nomeAvversario(m.vincitore)}.`;
  if (m.fine) {
    if (m.vincitore === D.cid) suonaBase('vittoria', { gain: 0.9 });
    setTimeout(() => {
      if (!D.attivo) return;
      G.stato = 'morto'; D.finito = true; G.eventi = [];
      aggiornaPuntamento(null);
      parla(`${m.vincitore === D.cid ? 'Hai vinto la partita!' : `Ha vinto ${nomeAvversario(m.vincitore)}.`} ${descriviPunteggio()} ${D.ospite ? 'Invio per la rivincita, ' : ''}M per il menù.`, 2);
    }, 1500);
  } else setTimeout(() => { if (D.attivo) parla(`${chi} ${descriviPunteggio()}`, 2); }, 1200);
}

function duelloRivincita() {
  if (!D.attivo) return;
  if (!D.ospite) { parla('La rivincita la avvia chi ha creato la stanza.', 1); return; }
  for (const c of D.giocatori) D.punti[c] = 0;
  D.round = 0; G.stato = 'gioco'; G.pausa = false; G.eventi = [];
  duelloNuovoRound();
}

// ---------------------------------------------------------------- messaggi dagli altri
function duelloRicevi(m, a) {
  switch (m.t) {
    case 's':
      if (!a) break;
      a.tx = m.x; a.tz = m.z; a.mov = m.m; a.vita = m.v; a.livello = m.h; a.alto = m.h > 0;
      // recupero di messaggi persi: se dice di essere a terra e io non lo sapevo, lo segno abbattuto
      if (m.f && a.vivo && m.rn === D.round && !D.roundChiuso && G.tempo - D.inizioRound > 2) {
        a.vivo = false; a.morteT = 0; a.alto = false;
        suonaBase('corpo_cade', { dest: a.sorgente.ingresso, gain: 1 });
        parla(`${a.def.nome} abbattuto.`, 2);
        if (D.ospite) duelloControllaRound();
      }
      // se chi ha creato la stanza è già a un round successivo, gli chiedo di ripetermelo
      if (m.c === D.cidOspite && m.rn > D.round && performance.now() - (D.ultimaRichiesta || 0) > 1500) { D.ultimaRichiesta = performance.now(); duelloInvia({ t: 'ripeti' }); }
      break;
    case 'ripeti': if (D.ospite && D.ultimoRound) duelloInvia(D.ultimoRound); break;
    case 'sparo': {
      if (!a) break;
      const nome = Audio3D.buf[m.n] ? m.n : 'sparo';
      sparoLontano(nome, a.x, a.z, a.sorgente, 1);
      a.lampo = 1;
      // se il colpo mi passa vicino sento il proiettile fischiare dal lato giusto
      const d = Math.hypot(G.x - a.x, G.z - a.z), errore = avvolgi(rottaVerso(a.x, a.z, G.x, G.z) - m.r);
      if (Math.abs(errore) < 12 * GRADI && d > 3) {
        const [fx, fz] = avanti(m.r);
        suonaInPunto('sibilo', a.x + fx * d, a.z + fz * d, { gain: 1, quando: d / 700, y: 0.2, ref: 1 });
      }
      break;
    }
    case 'colpo': if (m.a === D.cid && !D.fuori) { D.ultimoAggressore = m.c; D.ultimoColpoSubito = G.tempo; feriscimi(m.d, true); } break;
    case 'suono': if (a && Audio3D.buf[m.n] && SUONI_IN_RETE.has(m.n)) suonaBase(m.n, { dest: a.sorgente.ingresso, gain: 0.9 }); break;
    case 'boom':
      pianifica(1.0, () => { suonaInPunto('granata_rimbalzo', m.x, m.z, { gain: 0.9, rate: 0.75 }); if (!D.fuori && Math.hypot(G.x - m.x, G.z - m.z) < 8) parla('Granata!', 1); });
      for (let t = 1.5; t < 2.85; t += 0.3 - (t - 1.5) * 0.12) pianifica(t, () => suonaInPunto('bip_granata', m.x, m.z, { gain: 1.0, ref: 3 }));
      pianifica(2.9, () => { suonaInPunto('esplosione', m.x, m.z, { gain: 1.6, riverbero: 1.2, ref: 4 }); G.effetti.esplosioni.push({ x: m.x, z: m.z, t: 0 }); });
      break;
    case 'costruzione': if (m.c2 && typeof m.c2.x === 'number') { m.c2.nato = G.tempo; G.costruzioni.push(m.c2); suonaInPunto('legno_colpito', m.c2.x, m.c2.z, { gain: 1.0, rate: m.c2.tipo === 'rampa' ? 1.15 : 1.45, y: ((m.c2.livello || 0) - (G.livello || 0)) * 2.5 }); } break;
    case 'dannoC': { const c = G.costruzioni.find(c => c.id === m.id); if (c) danneggiaCostruzione(c, m.d); break; }
    case 'morto':
      if (a && a.vivo) {
        a.vivo = false; a.morteT = 0; a.alto = false;
        suonaBase('corpo_cade', { dest: a.sorgente.ingresso, gain: 1, quando: 0.3 });
        parla(m.da === D.cid ? `Abbattuto! ${a.def.nome}.` : `${a.def.nome} abbattuto.`, 2);
      }
      if (D.ospite) duelloControllaRound();
      break;
    case 'round': if (m.c === D.cidOspite && m.n !== D.round) duelloApplicaRound(m); break;
    case 'fineRound': if (m.c === D.cidOspite) duelloFineRound(m); break;
    case 'cassa': if (m.c === D.cidOspite) duelloArrivaCassa(m.cassa); break;
    case 'presa': D.casse = D.casse.filter(c => c.id !== m.id); break;
    case 'rtc': if (m.a === D.cid) vocaleSegnale(m); break;
    case 'prov': if (a && /^[a-z]+_(minaccia|attacco|colpito)\d+$/.test(m.n) && Audio3D.buf[m.n]) suonaBase(m.n, { dest: a.sorgenteVoce.ingresso, gain: 1.4 }); break;
    // una trappola di qualcun altro è scattata: lo sento da lì
    case 'trappola': suonaInPunto('grilletto_vuoto', m.x, m.z, { gain: 1.2, rate: 0.6 }); suonaInPunto('colpo_corpo', m.x, m.z, { gain: 1.2, rate: 0.7, quando: 0.08 }); break;
  }
}

// il mio colpo ha preso un avversario: lo comunico, la sua vita la gestisce il suo computer
function duelloColpito(n, danno, testa) { duelloInvia({ t: 'colpo', a: n.cid, d: danno, testa }); }

// ---------------------------------------------------------------- casse di rifornimento
function duelloArrivaCassa(c) {
  const cassa = { ...c, aTerra: false, prossimoPing: 0, detta: false };
  D.casse.push(cassa);
  // scende col paracadute: un fischio che cala dall'alto per tre secondi, poi tocca terra
  suonaInPunto('cassa_cade', c.x, c.z, { gain: 1.0, y: 12, ref: 8 });
  pianifica(3, () => { cassa.aTerra = true; cassa.prossimoPing = G.tempo; suonaInPunto('legno_colpito', c.x, c.z, { gain: 1.0, rate: 0.7 }); });
  parla('Cassa in arrivo.', 0);
}

function duelloApriCassa() {
  if (!puoAgire() || (G.modalita === 'duello' && D.fuori)) return false;
  let vicina = null;
  for (const c of D.casse) { const d = Math.hypot(c.x - G.x, c.z - G.z); if (c.aTerra && d < 2.6 && (!vicina || d < vicina.d)) vicina = { c, d }; }
  if (!vicina) { if (G.modalita !== 'esplorazione') parla('Nessuna cassa qui.', 1); return false; }
  const tempoApertura = G.modalita === 'battaglia' ? 0.7 : 1.2;
  G.occupatoFino = G.tempo + tempoApertura;   // mentre apro sono vulnerabile
  suona('raccogli', { gain: 0.7 });
  pianifica(tempoApertura, () => {
    const c = vicina.c;
    if (!D.casse.includes(c)) { parla('Già presa.', 1); return; }
    D.casse = D.casse.filter(x => x !== c);
    duelloInvia({ t: 'presa', id: c.id });
    const A = G.arsenale, I = G.inventario;
    let f;
    switch (c.cont) {
      case 'scudo': G.scudo = Math.min(100, G.scudo + 50); suonaBase('scudo_su', { gain: 0.6 }); f = `scudo ${G.scudo}`; break;
      case 'granate': I.granate += 2; f = '2 granate, tasto Q'; break;
      case 'kit': I.kit += 1; f = 'kit medico, tasto H'; break;
      case 'materiali': I.materiali += 10; f = '10 materiali'; break;
      case 'bende': I.cibo += 3; f = '3 bende, tasto H'; break;
      case 'pozione': I.pozioni = (I.pozioni || 0) + 1; f = 'pozione scudo, tasto P'; break;
      case 'radar': I.radar = (I.radar || 0) + 1; f = 'radar, tasto L'; break;
      default: {
        const def = ARMI[c.cont], scorta = { pistola: 30, pompa: 12, mitra: 60, precisione: 10 }[c.cont];
        const rar = c.rar || 1, nomeRar = c.rar ? ' ' + nomeRarita(rar) : '';
        A.riserva[def.munizione] += scorta;
        if (A.armi[c.cont] && (A.armi[c.cont].rarita || 1) >= rar) f = `munizioni per ${def.nome}`;
        else if (A.armi[c.cont]) { A.armi[c.cont].rarita = rar; f = `${def.nome}${nomeRar}, migliore del tuo`; }
        else {
          A.armi[c.cont] = { caricatore: def.capacita, camera: 1, rarita: rar }; f = `${def.nome}${nomeRar}, tasto ${def.tasto}`;
          // se avevo in mano solo il piccone, la prima arma trovata me la metto subito in mano
          if (A.corrente === 'piccone') { A.corrente = c.cont; suona('arma_estrai', { gain: 0.8 }); f = `${def.nome}${nomeRar}, in mano. Piccone col 5`; }
        }
      }
    }
    if (c.materiali) { I.materiali += c.materiali; }
    parla(G.modalita === 'battaglia' ? `${f}.` : `Cassa: ${f}.`, 1);
  });
  return true;
}

// ---------------------------------------------------------------- zona che si restringe
function raggioZona() {
  const t = G.tempo - D.inizioRound, veloce = D.mod === 'tempesta';
  const attesa = veloce ? 5 : 20, durata = veloce ? 30 : 60;
  if (t < attesa) return RAGGIO_ARENA;
  return Math.max(RAGGIO_FINALE, RAGGIO_ARENA - (t - attesa) * (RAGGIO_ARENA - RAGGIO_FINALE) / durata);
}

function aggiornaZona() {
  const r = raggioZona(), c = Math.hypot(G.x, G.z), fuori = c > r;
  if (!D.zonaAnnunciata && raggioZona() < RAGGIO_ARENA && !D.roundChiuso) { D.zonaAnnunciata = true; parla('La zona si chiude.', 1); }
  // il ronzio viene dal punto del bordo più vicino a me; più mi avvicino, più è forte
  const [dx, dz] = c > 0.5 ? [G.x / c, G.z / c] : avanti(G.rotta);
  const s = D.sorgenteZona;
  if (s) {
    if (fuori) posiziona(s, G.x, 0.3, G.z); else posiziona(s, dx * r, 0, dz * r);
    // il ronzio si sente solo quando il bordo è a meno di 8 metri: prima sarebbe solo rumore in più
    const vicinoAlBordo = r - c < 8;
    s.src.guadagno.gain.setTargetAtTime(D.roundChiuso ? 0 : fuori ? 1.2 : vicinoAlBordo ? 0.6 : 0, Audio3D.ctx.currentTime, 0.3);
  }
  if (fuori && !D.fuori) {
    if (!D.eroFuori) { parla('Fuori zona! Torna indietro.', 1); D.prossimoDannoZona = G.tempo + 0.8; }
    if (G.tempo >= D.prossimoDannoZona) { D.prossimoDannoZona = G.tempo + 1; D.ultimoColpoSubito = -99; feriscimi(6); }
  }
  D.eroFuori = fuori;
  // la zona distrugge le costruzioni rimaste fuori
  for (const k of G.costruzioni) if (Math.hypot(k.x, k.z) > r + 2) k.vita = 0;
  D.casse = D.casse.filter(k => Math.hypot(k.x, k.z) <= r + 2 || !k.aTerra);
}

// ---------------------------------------------------------------- ogni fotogramma
function aggiornaDuello(dt) {
  const mov = muoviLibero(dt, 0, 0, LIMITE, D.fuori);
  if (!D.fuori) controllaTrappole();
  aggiornaRadar();
  if (!D.fuori) { aggiornaTurbo(); aggiornaPianoMio(); }
  aggiornaAggancio(dt);
  battitoBattaglia();
  if (!D.roundChiuso) aggiornaZona();

  // stato inviato 10 volte al secondo
  if (G.tempo >= D.prossimoInvio) {
    D.prossimoInvio = G.tempo + 1 / 10;
    duelloInvia({ t: 's', x: +G.x.toFixed(2), z: +G.z.toFixed(2), m: mov, v: Math.round(G.vita), h: G.livello || 0, f: D.fuori ? 1 : 0, rn: D.round });
  }
  // avversari: posizione ammorbidita, passi e voce che vengono da dove si trovano (anche dall'alto)
  const k = Math.min(1, dt * 12), ora = performance.now(), mioY = (G.livello || 0) * 2.5;
  for (const [cid, a] of [...D.altri]) {
    if (ora - a.ultimoMessaggio > 30000) { duelloUscito(cid); continue; }
    a.x += (a.tx - a.x) * k; a.z += (a.tz - a.z) * k; a.fase += dt * (a.mov ? 1 : 0);
    const y = (a.livello || 0) * 2.5 - mioY;
    posiziona(a.sorgente, a.x, y, a.z); posiziona(a.sorgenteVoce, a.x, y + 0.3, a.z);
    if (a.vivo && a.mov && G.tempo >= a.prossimoPasso) {
      a.prossimoPasso = G.tempo + (a.mov === 2 ? 0.33 : 0.55);
      suonaBase(a.mov === 2 ? `corsa${casoInt(1, 6)}` : `io_passo${casoInt(1, 4)}`, { dest: a.sorgente.ingresso, gain: a.mov === 2 ? 2.6 : 2.4, rate: caso(0.95, 1.05) });
      // sulle costruzioni i passi sono di legno: si capisce che sta in alto
      if ((a.livello || 0) > 0) suonaBase('legno_colpito', { dest: a.sorgente.ingresso, gain: 0.55, rate: caso(1.5, 1.8) });
    }
  }
  aggiornaCasse(D.fuori);
  // chi ha creato la stanza fa cadere una cassa nuova ogni tanto, dentro la zona
  if (D.ospite && !D.roundChiuso && G.tempo >= D.prossimaCassa) {
    D.prossimaCassa = G.tempo + 18;
    if (D.casse.length < 6) {
      const [x, z] = puntoCasuale(raggioZona() * 0.8);
      const cassa = { id: Math.random().toString(36).slice(2), x, z, cont: contenutoCasuale() };
      duelloInvia({ t: 'cassa', cassa });
      duelloArrivaCassa(cassa);
    }
  }
}

function duelloRicognizione() {
  let f = `${descriviPunteggio()} `;
  for (const [cid, a] of D.altri) {
    if (!a.vivo) { f += `${a.def.nome} abbattuto. `; continue; }
    const d = Math.hypot(a.x - G.x, a.z - G.z), rel = avvolgi(rottaVerso(G.x, G.z, a.x, a.z) - G.rotta);
    f += `${a.def.nome} ${direzioneRelativa(rel)}, ${metri(d)}${a.alto ? ', in alto' : ''}. `;
  }
  let cassa = null;
  for (const c of D.casse) { const d = Math.hypot(c.x - G.x, c.z - G.z); if (c.aTerra && (!cassa || d < cassa.d)) cassa = { c, d }; }
  if (cassa) f += `Cassa ${direzioneRelativa(avvolgi(rottaVerso(G.x, G.z, cassa.c.x, cassa.c.z) - G.rotta))}, ${metri(cassa.d)}. `;
  const bordo = raggioZona() - Math.hypot(G.x, G.z);
  f += bordo < 0 ? 'Sei fuori zona. ' : `Bordo della zona a ${metri(bordo)}. `;
  f += `${descriviArma()}. Vita ${Math.round(G.vita)}${G.scudo > 0 ? `, scudo ${Math.round(G.scudo)}` : ''}. ${G.inventario.materiali} materiali.`;
  parla(f, 2);
}

// ---------------------------------------------------------------- chat vocale nello spazio
// La voce di ogni avversario esce dal punto dell'arena in cui si trova: più è lontano, più è debole.
// Qui il collegamento è diretto tra i computer (WebRTC); se la rete non lo permette, il gioco continua senza voce.
const Vocale = { flusso: null, pc: new Map(), muto: false, pronta: null, coda: [] };
const SERVER_VOCE = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
];

function vocaleAvvia() {
  if (Vocale.pronta) return;
  Vocale.pronta = (async () => {
    // all'inizio solo ascolto: nessuna finestra di permesso che blocca la partita.
    // Il microfono si accende col tasto J, quando lo decido io.
    // tra due giocatori chiama sempre quello con l'identificativo più piccolo, così non si chiamano a vicenda
    for (const cid of D.giocatori) if (cid !== D.cid && D.cid < cid) vocaleChiama(cid);
    const coda = Vocale.coda; Vocale.coda = [];
    for (const m of coda) vocaleSegnale(m);
  })();
}

function vocalePC(cid) {
  let pc = Vocale.pc.get(cid); if (pc) return pc;
  pc = new RTCPeerConnection({ iceServers: SERVER_VOCE });
  if (Vocale.flusso) Vocale.flusso.getTracks().forEach(t => pc.addTrack(t, Vocale.flusso));
  else pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.onicecandidate = e => { if (e.candidate) duelloInvia({ t: 'rtc', a: cid, ice: e.candidate }); };
  pc.ontrack = e => {
    const a = D.altri.get(cid), flusso = e.streams[0] || new MediaStream([e.track]);
    if (!a || a.voce) return;
    // alcuni browser fanno partire l'audio remoto solo se è collegato anche a un elemento audio (qui muto)
    const el = new Audio(); el.srcObject = flusso; el.muted = true; el.play().catch(() => {});
    const src = Audio3D.ctx.createMediaStreamSource(flusso), g = Audio3D.ctx.createGain();
    g.gain.value = 2.2;
    src.connect(g).connect(a.sorgenteVoce.ingresso);
    a.voce = { src, g, el };
  };
  Vocale.pc.set(cid, pc);
  return pc;
}

async function vocaleChiama(cid) {
  try {
    const pc = vocalePC(cid);
    await pc.setLocalDescription(await pc.createOffer());
    duelloInvia({ t: 'rtc', a: cid, sdp: pc.localDescription });
  } catch (e) { console.error('voce', e); }
}

async function vocaleSegnale(m) {
  if (!Vocale.pronta) { Vocale.coda.push(m); return; }
  await Vocale.pronta;
  try {
    const pc = vocalePC(m.c);
    if (m.sdp) {
      if (m.sdp.type === 'offer' && pc.signalingState === 'have-local-offer') {
        // ci siamo chiamati insieme: cede chi ha l'identificativo più grande
        if (D.cid < m.c) return;
        await pc.setLocalDescription({ type: 'rollback' });
      }
      await pc.setRemoteDescription(m.sdp);
      if (m.sdp.type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        duelloInvia({ t: 'rtc', a: m.c, sdp: pc.localDescription });
      }
    } else if (m.ice) await pc.addIceCandidate(m.ice);
  } catch (e) { console.error('voce', e); }
}

function vocaleChiudi(cid) {
  const pc = Vocale.pc.get(cid);
  if (pc) { try { pc.close(); } catch (e) { /* già chiusa */ } Vocale.pc.delete(cid); }
}

// J: la prima volta chiede il permesso del microfono e comincia a trasmettere; poi lo spegne e lo riaccende
async function vocaleMuto() {
  if (!Vocale.flusso) {
    parla('Accendo il microfono. Se il browser chiede il permesso, accetta.', 1);
    try {
      Vocale.flusso = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) { Vocale.flusso = null; parla('Microfono non disponibile.', 1); return; }
    Vocale.muto = false;
    // aggiungo la mia voce ai collegamenti già aperti e li rinegozio
    for (const [cid, pc] of Vocale.pc) {
      try {
        const traccia = Vocale.flusso.getAudioTracks()[0];
        const tx = pc.getTransceivers().find(t => t.receiver && t.receiver.track && t.receiver.track.kind === 'audio');
        if (tx) { tx.direction = 'sendrecv'; await tx.sender.replaceTrack(traccia); } else pc.addTrack(traccia, Vocale.flusso);
        await pc.setLocalDescription(await pc.createOffer());
        duelloInvia({ t: 'rtc', a: cid, sdp: pc.localDescription });
      } catch (e) { console.error('voce', e); }
    }
    parla('Microfono acceso.', 1);
    return;
  }
  Vocale.muto = !Vocale.muto;
  for (const t of Vocale.flusso.getAudioTracks()) t.enabled = !Vocale.muto;
  parla(Vocale.muto ? 'Microfono spento.' : 'Microfono acceso.', 1);
}

window.addEventListener('beforeunload', () => { if (D.collegato) duelloInvia({ t: 'addio' }); });

// casse a terra, in tutte le modalità: chiama solo la più vicina, forte e chiara; sopra una cassa, un avviso
function aggiornaCasse(fermo = false) {
  let piuVicina = null;
  for (const c of D.casse) {
    if (!c.aTerra) continue;
    const d = Math.hypot(c.x - G.x, c.z - G.z);
    if (!piuVicina || d < piuVicina.d) piuVicina = { c, d };
    if (d < 2.4 && !c.detta && !fermo) { c.detta = true; suonaBase('tic', { gain: 0.5 }); parla('cassa, E', 0); }
    if (d > 4) c.detta = false;
  }
  if (piuVicina && G.tempo >= (D.prossimoPingCassa || 0)) {
    D.prossimoPingCassa = G.tempo + 1.3;
    const luccica = inArena() && piuVicina.d < 15;
    if (luccica) D.prossimoPingCassa = G.tempo + 1.6;
    suonaInPunto(luccica ? 'luccichio' : 'cassa_ping', piuVicina.c.x, piuVicina.c.z, { gain: luccica ? 1.2 : 1.0, ref: luccica ? 4 : 9, riverbero: 0.15 });
  }
}

// contro i nemici del computer: ogni tanto cade una cassa non lontano da me
function aggiornaCasseSolitario() {
  aggiornaCasse(false);
  if (G.tempo < (G.prossimaCassa || 30)) return;
  G.prossimaCassa = G.tempo + caso(35, 50);
  if (D.casse.length >= 2) return;
  let x, z;
  if (G.modalita === 'esplorazione') {
    const nodi = nodiDiPartenza(10, 30); if (!nodi.length) return;
    const N = G.mappa.nodi[scegli(nodi)]; x = N.x; z = N.z;
  } else { const a = caso(-Math.PI, Math.PI), r = caso(5, 13); x = G.cx + Math.sin(a) * r; z = G.cz - Math.cos(a) * r; }
  duelloArrivaCassa({ id: Math.random().toString(36).slice(2), x, z, cont: contenutoCasuale() });
}

// ---------------------------------------------------------------- trappole e radar
// Trappola (tasto F): la piazzo sotto i piedi. Gli altri non la sentono. Chi ci passa sopra perde 40 di vita.
function duelloTrappola() {
  if (!puoAgire() || (G.modalita === 'duello' && D.fuori)) return;
  if (!D.trappole) D.trappole = [];
  if (G.inventario.materiali < 5) { parla(`Servono 5 materiali, ne hai ${G.inventario.materiali}.`, 1); return; }
  if ((D.trappole || []).length >= 3) { parla('Hai già tre trappole.', 1); return; }
  G.inventario.materiali -= 5;
  G.occupatoFino = G.tempo + 0.8;
  D.trappole.push({ x: G.x, z: G.z, armata: G.tempo + 1.5 });
  suona('grilletto_vuoto', { gain: 0.5, rate: 0.7 });
  pianifica(0.4, () => suona('grilletto_vuoto', { gain: 0.5, rate: 1.0 }));
  parla('trappola piazzata', 0);
}
function controllaTrappole() {
  if (!D.trappole || !D.trappole.length) return;
  // contro i nemici del computer: chi ci passa sopra si prende i 40 punti di danno
  if (G.modalita !== 'duello') {
    for (const n of G.nemici) {
      if (!n.vivo || n.remoto) continue;
      const t = D.trappole.find(t => G.tempo >= t.armata && Math.hypot(t.x - n.x, t.z - n.z) < 1.3);
      if (!t) continue;
      D.trappole = D.trappole.filter(x => x !== t);
      suonaInPunto('grilletto_vuoto', t.x, t.z, { gain: 1.2, rate: 0.6 });
      suonaInPunto('colpo_corpo', t.x, t.z, { gain: 1.2, rate: 0.7, quando: 0.08 });
      parla(`Trappola! ${n.def.nome}.`, 1);
      registraDanno(n, 40, false, 0);
    }
    return;
  }
  for (const [cid, a] of D.altri) {
    if (!a.vivo) continue;
    const t = D.trappole.find(t => G.tempo >= t.armata && Math.hypot(t.x - a.x, t.z - a.z) < 1.3);
    if (!t) continue;
    D.trappole = D.trappole.filter(x => x !== t);
    suonaInPunto('grilletto_vuoto', t.x, t.z, { gain: 1.2, rate: 0.6 });
    suonaInPunto('colpo_corpo', t.x, t.z, { gain: 1.2, rate: 0.7, quando: 0.08 });
    duelloInvia({ t: 'trappola', x: t.x, z: t.z });
    duelloInvia({ t: 'colpo', a: cid, d: 40, testa: false });
    parla(`Trappola! ${a.def.nome} preso.`, 1);
  }
}
// Radar (tasto L, si trova nelle casse): per 5 secondi un segnale dal punto in cui si trova ogni avversario
function duelloRadar() {
  if (G.modalita === 'duello' && D.fuori) return;
  if (!G.inventario.radar) { parla('Niente radar.', 1); return; }
  G.inventario.radar--;
  D.radarFino = G.tempo + 5; D.prossimoRadar = G.tempo;
  parla('radar', 0);
}
function aggiornaRadar() {
  if (!D.radarFino || G.tempo > D.radarFino || G.tempo < D.prossimoRadar) return;
  D.prossimoRadar = G.tempo + 1;
  // nel duello tutti gli avversari; altrove i cinque nemici più vicini entro 60 metri
  const bersagli = G.modalita === 'duello' ? [...D.altri.values()].filter(a => a.vivo)
    : G.nemici.filter(n => n.vivo && Math.hypot(n.x - G.x, n.z - G.z) < 60).sort((a, b) => Math.hypot(a.x - G.x, a.z - G.z) - Math.hypot(b.x - G.x, b.z - G.z)).slice(0, 5);
  for (const a of bersagli) { suonaInPunto('ping', a.x, a.z, { gain: 1.2, ref: 10, riverbero: 0.1, y: a.alto ? 2.5 : 0 }); a.ultimoSuono = G.tempo; a.udito = true; }
}

// Maiuscolo più 1, 2 o 3: una provocazione (minaccia, attacco, insulto) che gli altri sentono dal punto in cui mi trovo
function provocazione(categoria) {
  if (G.tempo < (D.prossimaProvocazione || 0)) return;
  D.prossimaProvocazione = G.tempo + 3;
  const voci = Object.keys(Audio3D.voci || {}); if (!voci.length) return;
  // ogni giocatore ha sempre la stessa voce, scelta dal suo identificativo
  const mia = voci[[...D.cid].reduce((h, ch) => h + ch.charCodeAt(0), 0) % voci.length];
  const frasi = (Audio3D.voci[mia] || {})[categoria] || []; if (!frasi.length) return;
  const n = scegli(frasi);
  suonaBase(n, { gain: 0.5 });
  duelloInvia({ t: 'prov', n });
}
