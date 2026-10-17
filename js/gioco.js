'use strict';
// Velletri Zombie — logica di gioco: menù, assedio a ondate, esplorazione della città, orientamento, input.

const CENTRO_VELLETRI = { lat: 41.6889914, lon: 12.7793312, nome: 'Velletri', piazza: 'Piazza Cairoli' };

const G = {
  stato: 'inizio',          // inizio | caricamento | menu | armi | digitazione | gioco | morto
  pausa: true, modalita: 'assedio', principale: 'pompa',
  tempo: 0, eventi: [],
  x: 0, z: 0, rotta: 0, vita: 100, occupatoFino: 0, inMovimento: false,
  arsenale: null, inventario: null, nemici: [], costruzioni: [], uccisi: 0,
  ondata: null, mappa: null, citta: CENTRO_VELLETRI, pos: null, scorte: [],
  destinazione: null, selezionePoi: -1, elencoPoi: [], annunciati: new Set(),
  effetti: { lampo: 0, fase: '', esplosioni: [], dolore: 0 },
  sensibilita: 4, graficaAccesa: true, ambienteAcceso: true, tasti: {},
  loopAmbiente: null, fontaneAttive: new Map(), battito: null, testo: '',
};

// ---------------------------------------------------------------- tempo di gioco ed eventi
// Tutto ciò che è programmato usa il tempo di gioco, che si ferma in pausa.
function pianifica(dopo, fn, tag = '') { G.eventi.push({ t: G.tempo + dopo, fn, tag }); }
function annullaEventi(tag) { G.eventi = G.eventi.filter(e => e.tag !== tag); }
function eseguiEventi() {
  for (;;) {
    let i = -1, min = Infinity;
    for (let k = 0; k < G.eventi.length; k++) if (G.eventi[k].t <= G.tempo && G.eventi[k].t < min) { min = G.eventi[k].t; i = k; }
    if (i < 0) break;
    const e = G.eventi.splice(i, 1)[0];
    try { e.fn(); } catch (err) { console.error(err); }
  }
}

// ---------------------------------------------------------------- menù (voce + tastiera)
const MENU = {
  menu: { titolo: 'Menù', voci: [['battaglia', 'Battaglia reale: tu contro undici'], ['assedio', `Assedio a ${CENTRO_VELLETRI.piazza}, Velletri`], ['esplora', 'Esplorazione di Velletri'], ['altra', 'Esplorazione di un\'altra città'], ['duello', 'Duello uno contro uno in rete']] },
  difficolta: { titolo: 'Difficoltà', voci: [['facile', 'Facile: sette avversari, meno precisi, mira molto assistita'], ['normale', 'Normale: undici avversari'], ['difficile', 'Difficile: avversari più svelti e precisi, poca assistenza']] },
  lancio: { titolo: 'Dove ti lanci?', voci: [['piazza', 'Piazza, al centro: tanti forzieri, tanta gente'], ['campanile', 'Campanile, a nord'], ['fontana', 'Fontana, a est'], ['canile', 'Canile, a sud'], ['bosco', 'Bosco, a ovest']] },
  duello: { titolo: 'Duello', voci: [['crea', 'Crea una stanza'], ['entra', 'Entra in una stanza con un codice']] },
  armi: { titolo: 'Arma principale', voci: [['pompa', 'Fucile a pompa'], ['mitra', 'Mitragliatore'], ['precisione', 'Fucile di precisione']] },
};
let sceltaMenu = 0, sceltaModalita = 'assedio';

function apriMenu(nome, intro = '') {
  G.stato = nome; sceltaMenu = 0;
  const m = MENU[nome];
  parla(`${intro}${m.titolo}. ${m.voci[0][1]}. Frecce su e giù, Invio per scegliere.`, 2);
  aggiornaPannello();
}
function muoviMenu(d) {
  const m = MENU[G.stato];
  sceltaMenu = (sceltaMenu + d + m.voci.length) % m.voci.length;
  suona('tic', { gain: 0.5 });
  parla(m.voci[sceltaMenu][1], 1);
  aggiornaPannello();
}
function confermaMenu() {
  const id = MENU[G.stato].voci[sceltaMenu][0];
  suona('tic2', { gain: 0.5 });
  if (G.stato === 'menu') {
    if (id === 'battaglia') { apriMenu('lancio'); return; }
    if (id === 'duello') { apriMenu('duello'); return; }
    if (id === 'altra') { G.stato = 'digitazione'; G.scopoTesto = 'citta'; G.testo = ''; parla('Scrivi il nome della città, poi Invio. Esc per tornare.', 2); aggiornaPannello(); return; }
    sceltaModalita = id === 'assedio' ? 'assedio' : 'esplorazione';
    G.citta = CENTRO_VELLETRI; G.osm = null;
    apriMenu('armi');
  } else if (G.stato === 'armi') {
    G.principale = id;
    avviaPartita();
  } else if (G.stato === 'lancio') {
    B.lancio = id; apriMenu('difficolta');
  } else if (G.stato === 'difficolta') {
    battagliaAvvia(B.lancio, id);
  } else if (G.stato === 'duello') {
    if (id === 'crea') duelloCrea();
    else { G.stato = 'digitazione'; G.scopoTesto = 'codice'; G.testo = ''; parla('Scrivi il codice di 4 cifre, poi Invio. Esc per tornare.', 2); aggiornaPannello(); }
  }
}

async function confermaCitta() {
  const nome = G.testo.trim();
  if (!nome) { parla('Scrivi un nome.', 1); return; }
  G.stato = 'caricamento'; aggiornaPannello();
  parla(`Cerco ${nome}.`, 2);
  try {
    const c = await cercaCitta(nome);
    if (!c) { parla('Città non trovata. Riprova.', 2); G.stato = 'digitazione'; aggiornaPannello(); return; }
    parla(`Trovata: ${c.nome}. Scarico le strade, attendi.`, 2);
    const attesa = setInterval(() => suona('tic', { gain: 0.25 }), 1500);
    try { G.osm = await scaricaMappa(c.lat, c.lon); } finally { clearInterval(attesa); }
    G.citta = { lat: c.lat, lon: c.lon, nome: c.nome.split(',')[0], piazza: c.nome.split(',')[0] };
    sceltaModalita = 'esplorazione';
    apriMenu('armi', 'Mappa pronta. ');
  } catch (e) {
    console.error(e);
    parla('Scaricamento non riuscito. Controlla la connessione e riprova.', 2);
    G.stato = 'digitazione'; aggiornaPannello();
  }
}

// ---------------------------------------------------------------- partita
async function preparaMappa() {
  if (!G.osm) {
    const r = await fetch('mappe/velletri.json', { cache: 'no-cache' });
    G.osm = await r.json();
  }
  if (!G.mappa || G.mappa.osm !== G.osm) {
    G.mappa = costruisciMappa(G.osm, G.citta.lat, G.citta.lon, G.citta.nome);
    G.mappa.osm = G.osm;
  }
}

async function avviaPartita() {
  G.modalita = sceltaModalita;
  G.stato = 'caricamento'; aggiornaPannello();
  await preparaMappa();
  pulisciPartita();
  G.arsenale = nuovoArsenale(G.principale);
  G.inventario = { granate: 2, kit: 1, cibo: 0, materiali: G.modalita === 'assedio' ? 12 : 6, radar: 1 };
  G.vita = 100; G.scudo = 0; G.alto = false; G.rampaSotto = null; G.velocitaExtra = 1; D.trappole = []; D.radarFino = 0; G.prossimaCassa = 30; D.casse = []; G.uccisi = 0; G.punti = 0; G.serie = { n: 0, fino: 0 }; G.tempo = 0; G.campo = null; G.prossimoCampo = 0; G.ultimaFerita = -99; G.prossimaSpinta = 0; G.occupatoFino = 0; G.inizioPartita = 0;
  G.rotta = 0;
  if (G.modalita === 'assedio') {
    G.nodoPiazza = nodoPiuVicino(G.mappa, 0, 0);
    G.x = G.cx = G.mappa.nodi[G.nodoPiazza].x; G.z = G.cz = G.mappa.nodi[G.nodoPiazza].z; G.pos = null;
    G.ondata = { numero: 0, rimasti: 0, daGenerare: [], inPausa: true, fine: 6 };
  } else {
    const n = nodoPiuVicino(G.mappa, 0, 0);
    G.pos = { nodo: n }; G.x = G.mappa.nodi[n].x; G.z = G.mappa.nodi[n].z;
    const primo = G.mappa.nodi[n].adj[0];
    if (primo) {
      G.rotta = rottaVerso(G.x, G.z, G.mappa.nodi[primo.v].x, G.mappa.nodi[primo.v].z);
      G.pos.nome = G.mappa.archi[primo.e].nome;
    }
    preparaScorte();
    G.regia = { prossimoControllo: 4, prossimaOrda: 90 };
  }
  aggiornaAscoltatore(G.x, G.z, G.rotta);
  avviaAmbiente();
  G.stato = 'gioco';
  const arma = ARMI[G.principale].nome;
  parla(document.pointerLockElement === tela ? 'Via.' : 'Clicca per iniziare.', 2);
  if (document.pointerLockElement === tela) { G.pausa = false; if (G.modalita === 'esplorazione') { pianifica(1.5, annunciaIncrocio); pianifica(2.5, primoIncontro); } else G.ondata.fine = 0.5; }
  aggiornaPannello();
}

function pulisciPartita() {
  battagliaFerma();
  for (const n of G.nemici) chiudiSorgente(n.sorgente);
  G.nemici = []; G.costruzioni = []; G.eventi = []; G.annunciati = new Set(); G.destinazione = null;
  G.effetti.esplosioni = []; G.effetti.fase = '';
  if (G.battito) { try { G.battito.stop(); } catch (e) { /* già fermo */ } G.battito = null; }
  for (const s of G.fontaneAttive.values()) fermaLoop(s);
  G.fontaneAttive.clear();
  taci();
}

function leggiRecord() { try { return +localStorage.getItem('vz_record_' + G.modalita) || 0; } catch (e) { return 0; } }
function salvaRecord(p) { try { localStorage.setItem('vz_record_' + G.modalita, String(p)); } catch (e) { /* non disponibile */ } }

function morte() {
  if (G.modalita === 'duello') { duelloMorte(); return; }
  if (G.modalita === 'battaglia') { battagliaMorte(); return; }
  G.stato = 'morto';
  G.arsenale.grilletto = false;
  G.eventi = [];
  aggiornaPuntamento(null);
  const record = leggiRecord();
  let f = `Sei morto. ${G.punti} punti`;
  if (G.modalita === 'assedio') f += `, ondata ${G.ondata.numero}`;
  f += G.punti > record ? '. Nuovo record!' : `. Record ${record}.`;
  if (G.punti > record) salvaRecord(G.punti);
  setTimeout(() => parla(f + ' Invio per ricominciare.', 2), 900);
}

// punti: 100 a uccisione, 50 in più per la testa; uccisioni ravvicinate formano una serie che moltiplica
function premiaUccisione(n, testa) {
  const S = G.serie;
  S.n = G.tempo <= S.fino ? S.n + 1 : 1;
  S.fino = G.tempo + 3;
  const base = { camminatore: 100, corridore: 150, soldato: 200, bruto: 500 }[n.tipo] + (testa ? 50 : 0);
  G.punti += base * Math.min(S.n, 5);
  return S.n;
}

// quanto è vicino il pericolo, per la musica
function intensitaPericolo() {
  if (G.modalita === 'assedio' && G.ondata && G.ondata.inPausa) return 0.05;
  let vicino = 99, quanti = 0;
  for (const n of G.nemici) {
    if (!n.vivo || !n.udito) continue;
    const d = Math.hypot(n.x - G.x, n.z - G.z);
    if (d < 30) quanti++;
    vicino = Math.min(vicino, d);
  }
  return lim(quanti / 10, 0, 0.4) + lim((25 - vicino) / 25, 0, 0.6);
}

// esplorazione: il primo zombie compare presto, non lontano
function primoIncontro() {
  const nodi = nodiDiPartenza(15, 25);
  if (nodi.length) creaNemicoSuNodo('camminatore', scegli(nodi), true);
}

function feriscimi(danno, proiettile = false) {
  if (G.stato !== 'gioco') return;
  if (!Number.isFinite(danno) || danno <= 0) return;
  danno = Math.min(danno, 300);
  // lo scudo assorbe i colpi prima della vita
  if (G.scudo > 0) {
    const assorbito = Math.min(G.scudo, danno);
    G.scudo -= assorbito; danno -= assorbito;
    suona('scudo_colpo', { gain: 0.7 });
    if (G.scudo <= 0) parla('scudo rotto', 1);
    if (danno <= 0) return;
  }
  const prima = G.vita;
  G.vita -= danno;
  G.ultimaFerita = G.tempo;
  G.effetti.dolore = 1;
  suona(scegli(['dolore1', 'dolore2', 'dolore3']), { gain: 0.7, rate: caso(0.95, 1.05) });
  if (proiettile) suona('colpo_corpo', { gain: 0.7, rate: 1.2 });
  if (G.vita <= 0) { G.vita = 0; morte(); return; }
  for (const soglia of [75, 50, 25]) if (prima > soglia && G.vita <= soglia) { parla(`vita ${Math.round(G.vita)}`, 1); break; }
}

function cura() {
  if (!puoAgire()) return;
  if (G.vita >= 100) { parla('Vita piena.', 1); return; }
  const inv = G.inventario;
  const usa = inv.kit > 0 ? 'kit' : inv.cibo > 0 ? 'cibo' : null;
  if (!usa) { parla('Niente per curarti.', 1); return; }
  inv[usa]--;
  const tempo = usa === 'kit' ? 2.5 : 1.5;
  G.occupatoFino = G.tempo + tempo;   // mentre mi curo sono vulnerabile
  suona('raccogli', { gain: 0.6 });
  pianifica(tempo, () => { G.vita = Math.min(100, G.vita + (usa === 'kit' ? 50 : 20)); parla(`vita ${Math.round(G.vita)}`, 1); });
}

// ---------------------------------------------------------------- assedio a ondate
function composizioneOndata(n) {
  // subito azione, poi sempre di più: 5, 7, 9, 12, 15, 18...
  const tot = 4 + n + Math.floor(n * n / 5), lista = [];
  for (let i = 0; i < tot; i++) {
    let t = 'camminatore';
    const r = Math.random();
    if (n >= 2 && r < 0.10 + n * 0.02) t = 'corridore';
    else if (n >= 4 && r < 0.20 + n * 0.02) t = 'soldato';
    lista.push(t);
  }
  if (n >= 4 && n % 2 === 0) lista.push('bruto');
  return lista;
}

// sceglie da quali vie arrivano: nodi a 35-55 metri a piedi, in direzioni diverse tra loro
function sceglIngressi(quanti) {
  const candidati = nodiDiPartenza(22, 38);
  const scelti = [];
  for (let tent = 0; tent < 200 && scelti.length < quanti && candidati.length; tent++) {
    const c = scegli(candidati), N = G.mappa.nodi[c], dir = rottaVerso(G.x, G.z, N.x, N.z);
    if (scelti.every(s => Math.abs(avvolgi(s.dir - dir)) > 50 * GRADI)) scelti.push({ nodo: c, dir, via: nomeViaDelNodo(c) });
  }
  return scelti;
}

function iniziaOndata() {
  const O = G.ondata;
  O.numero++; O.inPausa = false;
  annullaEventi('pausa');
  const lista = composizioneOndata(O.numero);
  // dalla terza ondata, una su tre è speciale
  O.mod = O.numero >= 3 && Math.random() < 0.34 ? scegli(['veloci', 'giganti', 'tiratori', 'orda']) : null;
  if (O.mod === 'giganti') lista.push('bruto', 'bruto');
  if (O.mod === 'tiratori') for (let i = 1; i < lista.length; i += 2) lista[i] = 'soldato';
  if (O.mod === 'orda') for (let i = 0; i < 5; i++) lista.push('camminatore');
  O.rimasti = lista.length;
  const ingressi = sceglIngressi(O.numero < 2 ? 1 : O.numero < 5 ? 2 : 3);
  O.direzioni = ingressi.map(i => i.dir);
  colpoInizio();
  if (O.numero > 1) suona('sirena', { gain: 0.2 });
  const N0 = G.mappa.nodi[ingressi[0].nodo];
  gridoAssalto(N0.x, N0.z);
  const vie = [...new Set(ingressi.map(i => i.via))];
  const speciale = { veloci: 'tutti di corsa', giganti: 'arrivano i giganti', tiratori: 'pieni di tiratori', orda: 'il doppio di gente' }[O.mod];
  parla(`Ondata ${O.numero}${speciale ? ', speciale: ' + speciale : ''}, da ${vie.join(' e ')}.`, 2);
  // il primo zombie è già vicino: l'azione comincia subito
  const [fx, fz] = avanti(ingressi[0].dir);
  pianifica(0.8, () => creaNemico(lista[0], G.x + fx * 12, G.z + fz * 12, null, true), 'ondata');
  let t = 2.5;
  for (const tipo of lista.slice(1)) {
    const ing = scegli(ingressi);
    pianifica(t, () => { const n = creaNemicoSuNodo(tipo, ing.nodo, true); if (O.mod === 'veloci') n.velocita *= 1.5; }, 'ondata');
    t += caso(1.2, 2.8) / Math.min(1.8, 1 + O.numero * 0.08);
  }
}

function fineOndata() {
  const O = G.ondata, A = G.arsenale;
  O.inPausa = true; O.fine = G.tempo + 12;
  // rifornimenti e un po' di riposo
  A.riserva['9mm'] += 30;
  if (A.armi.pompa) A.riserva.cal12 += 12;
  if (A.armi.mitra) A.riserva['762'] += 60;
  if (A.armi.precisione) A.riserva['308'] += 10;
  G.inventario.materiali += 6;
  G.inventario.kit++;
  if (O.numero % 2 === 0) G.inventario.granate++;
  G.vita = Math.min(100, G.vita + 30);
  const bonus = 250 * O.numero; G.punti += bonus;
  let extra = '';
  const mancante = ['pompa', 'mitra', 'precisione'].find(k => !A.armi[k]);
  if ((O.numero === 2 || O.numero === 4) && mancante) {
    A.armi[mancante] = { caricatore: ARMI[mancante].capacita, camera: 1 };
    A.riserva[ARMI[mancante].munizione] += { pompa: 18, mitra: 60, precisione: 15 }[mancante];
    extra = ` Nuova arma: ${ARMI[mancante].nome}, tasto ${ARMI[mancante].tasto}.`;
  }
  if (O.numero % 3 === 0) { G.inventario.radar = (G.inventario.radar || 0) + 1; extra += ' Un radar in più, tasto L.'; }
  suona('raccogli', { gain: 0.5 });
  parla(`Ondata superata. ${G.punti} punti.${extra}`, 2);
  pianifica(9, () => parla('Arrivano.', 1), 'pausa');
}

function aggiornaAssedio() {
  const O = G.ondata;
  if (O.inPausa) { if (G.tempo >= O.fine) iniziaOndata(); return; }
  const inArrivo = G.eventi.some(e => e.tag === 'ondata');
  if (!inArrivo && O.rimasti <= 0 && !G.nemici.some(n => n.vivo)) fineOndata();
}

// ---------------------------------------------------------------- esplorazione: regia dei nemici
function aggiornaRegia() {
  const R = G.regia;
  if (G.tempo < R.prossimoControllo) return;
  R.prossimoControllo = G.tempo + 1;
  const minuti = G.tempo / 60;
  const vivi = G.nemici.filter(n => n.vivo);
  // i nemici rimasti troppo indietro si perdono
  for (const n of vivi) if (Math.hypot(n.x - G.x, n.z - G.z) > 90) { n.vivo = false; n.morteT = 99; chiudiSorgente(n.sorgente); }
  const obiettivo = Math.min(12, 3 + Math.floor(minuti * 1.2));
  if (vivi.length < obiettivo && Math.random() < 0.45) {
    const r = Math.random();
    let tipo = 'camminatore';
    if (minuti > 2 && r < 0.15) tipo = 'corridore';
    else if (minuti > 3 && r < 0.27) tipo = 'soldato';
    else if (minuti > 5 && r < 0.31) tipo = 'bruto';
    const nodi = nodiDiPartenza(25, 55);
    if (nodi.length) creaNemicoSuNodo(tipo, scegli(nodi), false); // vaga finché non mi nota
  }
  if (G.tempo >= R.prossimaOrda) {
    R.prossimaOrda = G.tempo + caso(100, 150);
    const [ing] = sceglIngressi(1);
    if (!ing) return;
    const N = G.mappa.nodi[ing.nodo];
    suona('sirena', { gain: 0.25 });
    gridoAssalto(N.x, N.z);
    parla(`Orda in arrivo da ${ing.via}.`, 2);
    const quanti = 4 + Math.floor(minuti / 2);
    for (let i = 0; i < quanti; i++) pianifica(3 + i * caso(1.5, 3), () => creaNemicoSuNodo(Math.random() < 0.2 ? 'corridore' : 'camminatore', ing.nodo, true));
  }
}

// riprendo fiato: se nessuno è vicino e non vengo ferito da un po', la vita risale fino a 60
function aggiornaRespiro(dt) {
  if (inArena()) return;
  if (G.vita >= 60 || G.tempo - (G.ultimaFerita || -99) < 6) return;
  if (G.nemici.some(n => n.vivo && Math.hypot(n.x - G.x, n.z - G.z) < 12)) return;
  G.vita = Math.min(60, G.vita + 1.5 * dt);
}

// ---------------------------------------------------------------- esplorazione: camminare per le strade
// Mi muovo solo lungo le strade reali. Agli incroci mi fermo, sento le vie e scelgo girandomi.
const VEL_PASSO = 1.5, VEL_CORSA = 3.3;

function direzioneArco(da, a) { const M = G.mappa; return rottaVerso(M.nodi[da].x, M.nodi[da].z, M.nodi[a].x, M.nodi[a].z); }

function diramazioni(nodo) {
  const M = G.mappa;
  return M.nodi[nodo].adj.map(({ v, e }) => ({ v, e, arco: M.archi[e], dir: direzioneArco(nodo, v) }));
}

function aggiornaCammino(dt) {
  const M = G.mappa, P = G.pos;
  const su = G.tasti.KeyW || G.tasti.ArrowUp, giu = G.tasti.KeyS || G.tasti.ArrowDown;
  G.inMovimento = false;
  if (!su && !giu) { P.bloccato = false; return; }
  if (P.bloccato || !puoAgire()) return;
  const corsa = G.tasti.ShiftLeft || G.tasti.ShiftRight;
  let resto = (corsa ? VEL_CORSA : VEL_PASSO) * dt;
  const verso = su ? G.rotta : avvolgi(G.rotta + Math.PI);

  if (P.nodo != null) {
    // fermo su un nodo: scelgo la via più vicina alla direzione in cui guardo
    const rami = diramazioni(P.nodo);
    let best = null;
    for (const r of rami) { const diff = Math.abs(avvolgi(r.dir - verso)); if (!best || diff < best.diff) best = { ...r, diff }; }
    if (!best || best.diff > 50 * GRADI) {
      if (!P.avvisato) { suona('tic2', { gain: 0.6 }); parla('Nessuna strada da quella parte.', 1); P.avvisato = true; }
      return;
    }
    P.avvisato = false;
    G.pos = { da: P.nodo, a: best.v, e: best.e, t: 0, nome: best.arco.nome };
    if (best.arco.nome !== P.nome) parla(best.arco.nome, 0);
  } else {
    // a metà strada: vado verso l'estremo più vicino alla direzione scelta
    const dir = direzioneArco(P.da, P.a);
    if (Math.abs(avvolgi(dir - verso)) > Math.PI / 2) {
      G.pos = { da: P.a, a: P.da, e: P.e, t: M.archi[P.e].len - P.t, nome: P.nome };
    }
  }
  G.inMovimento = true;
  if (corsa) allertaNemici(G.x, G.z, 25);
  passiMiei(corsa);
  let Q = G.pos;
  while (resto > 0) {
    const len = M.archi[Q.e].len;
    if (Q.t + resto < len) { Q.t += resto; resto = 0; break; }
    resto -= len - Q.t;
    // arrivo al nodo
    const nodo = Q.a, grado = gradoNodo(M, nodo);
    if (grado === 2) {
      const altro = M.nodi[nodo].adj.find(o => o.v !== Q.da);
      const nuovo = M.archi[altro.e];
      // seguo la curva della strada girandomi con lei
      const giro = avvolgi(direzioneArco(nodo, altro.v) - direzioneArco(Q.da, nodo));
      if (su) G.rotta = avvolgi(G.rotta + giro);
      if (nuovo.nome !== Q.nome) parla(nuovo.nome, 1);
      Q = G.pos = { da: nodo, a: altro.v, e: altro.e, t: 0, nome: nuovo.nome };
      continue;
    }
    G.pos = { nodo, nome: Q.nome, bloccato: true };
    G.x = M.nodi[nodo].x; G.z = M.nodi[nodo].z;
    if (grado === 1) { suona('tic2', { gain: 0.6 }); parla('Fine strada.', 1); }
    else annunciaIncrocio();
    return;
  }
  const a = M.nodi[Q.da], b = M.nodi[Q.a], k = Q.t / M.archi[Q.e].len;
  G.x = a.x + (b.x - a.x) * k; G.z = a.z + (b.z - a.z) * k;
  controllaLuoghiVicini();
}

let prossimoMioPasso = 0, piedeMio = 0;
function passiMiei(corsa) {
  if (G.tempo < prossimoMioPasso) return;
  prossimoMioPasso = G.tempo + (corsa ? 0.33 : 0.55) * (G.modalita === 'battaglia' ? 0.75 : 1);
  const k = mixEssenziale() ? 0.5 : 1; // nel duello i miei passi sono più bassi: contano quelli degli altri
  suona(`io_passo${1 + (piedeMio++ % 4)}`, { gain: (corsa ? 0.3 : 0.2) * k, rate: caso(0.95, 1.05) });
}

function annunciaIncrocio() {
  const P = G.pos; if (!P || P.nodo == null) return;
  suona('tic', { gain: 0.6 });
  const rami = diramazioni(P.nodo).map(r => ({ ...r, rel: avvolgi(r.dir - G.rotta) })).sort((a, b) => Math.abs(a.rel) - Math.abs(b.rel));
  // raggruppo le direzioni per nome della via: "Via Cavour avanti e dietro. Via Roma a destra."
  const perNome = new Map();
  for (const r of rami) { if (!perNome.has(r.arco.nome)) perNome.set(r.arco.nome, []); perNome.get(r.arco.nome).push(direzioneRelativa(r.rel)); }
  const parti = [...perNome].map(([nome, dirs]) => `${nome} ${dirs.length > 1 ? dirs.slice(0, -1).join(', ') + ' e ' + dirs[dirs.length - 1] : dirs[0]}`);
  let f = `Incrocio. ${parti.join('. ')}.`;
  const g = istruzioneRotta();
  if (g) f += ` ${g}`;
  parla(f, 1);
  P.allineato = null;
}

// all'incrocio, quando la mia direzione si allinea con una via sento un tic e il suo nome
function controllaAllineamento() {
  const P = G.pos; if (!P || P.nodo == null) return;
  let best = null;
  for (const r of diramazioni(P.nodo)) { const diff = Math.abs(avvolgi(r.dir - G.rotta)); if (!best || diff < best.diff) best = { ...r, diff }; }
  const allineato = best && best.diff < 20 * GRADI ? best.v : null;
  if (allineato !== P.allineato) {
    P.allineato = allineato;
    if (allineato != null) { suona('tic', { gain: 0.45, rate: 1.3 }); parla(best.arco.nome, 0); }
  }
}

// ---------------------------------------------------------------- luoghi, scorte e navigazione
function preparaScorte() {
  G.scorte = [];
  for (const p of G.mappa.poi) {
    if (!p.scorta || Math.random() < 0.25) continue;
    p.scortaAttiva = true;
  }
}

function contenutoScorta(p) {
  const inv = G.inventario, A = G.arsenale, parti = [];
  switch (p.scorta) {
    case 'kit': { const n = casoInt(1, 2); inv.kit += n; parti.push(plurale(n, 'kit medico', 'kit medici')); break; }
    case 'cibo': { const n = casoInt(1, 2); inv.cibo += n; parti.push(`${n} cibo`); break; }
    case 'materiali': { const n = casoInt(4, 8); inv.materiali += n; parti.push(`${n} materiali`); break; }
    case 'granate': { const n = casoInt(1, 3); inv.granate += n; parti.push(plurale(n, 'granata', 'granate')); break; }
    case 'armi': {
      for (const k of ['pompa', 'mitra', 'precisione']) if (!A.armi[k]) { A.armi[k] = { caricatore: ARMI[k].capacita, camera: 1 }; parti.push(`${ARMI[k].nome}, tasto ${ARMI[k].tasto}`); break; }
    } // continua con le munizioni
    case 'munizioni': {
      A.riserva['9mm'] += 30; parti.push('munizioni');
      if (A.armi.pompa) A.riserva.cal12 += 12;
      if (A.armi.mitra) A.riserva['762'] += 60;
      if (A.armi.precisione) A.riserva['308'] += 10;
      break;
    }
  }
  return parti.join(', ');
}

function raccogli() {
  if (!puoAgire()) return;
  let best = null;
  for (const p of G.mappa.poi) {
    if (!p.scortaAttiva) continue;
    const d = Math.hypot(p.x - G.x, p.z - G.z);
    if (d < 25 && (!best || d < best.d)) best = { p, d };
  }
  if (!best) { parla('Niente da raccogliere qui.', 1); return; }
  G.occupatoFino = G.tempo + 1.8;
  suona('raccogli', { gain: 0.7 });
  pianifica(1.8, () => { best.p.scortaAttiva = false; parla(`${best.p.nome}: ${contenutoScorta(best.p)}.`, 1); });
}

function controllaLuoghiVicini() {
  for (const p of G.mappa.poi) {
    const d = Math.hypot(p.x - G.x, p.z - G.z);
    const chiave = p.nome + p.x;
    if (d < 18 && !G.annunciati.has(chiave)) {
      G.annunciati.add(chiave);
      const rel = avvolgi(rottaVerso(G.x, G.z, p.x, p.z) - G.rotta);
      parla(`${p.nome}, ${direzioneRelativa(rel)}${p.scortaAttiva ? ', rifornimenti, E per prendere' : ''}.`, 1);
    }
    if (d > 60) G.annunciati.delete(chiave);
  }
  if (G.destinazione && Math.hypot(G.destinazione.x - G.x, G.destinazione.z - G.z) < 20) {
    parla(`Arrivato: ${G.destinazione.nome}.`, 2);
    G.destinazione = null;
  }
}

function sfogliaLuoghi(passo) {
  if (G.modalita !== 'esplorazione') { parla('Solo in esplorazione.', 1); return; }
  G.elencoPoi = G.mappa.poi.map(p => ({ p, d: Math.hypot(p.x - G.x, p.z - G.z) })).filter(o => o.d < 1500).sort((a, b) => a.d - b.d).slice(0, 40);
  if (!G.elencoPoi.length) { parla('Nessun luogo vicino.', 1); return; }
  G.selezionePoi = (G.selezionePoi + passo + G.elencoPoi.length) % G.elencoPoi.length;
  const { p, d } = G.elencoPoi[G.selezionePoi];
  const rel = avvolgi(rottaVerso(G.x, G.z, p.x, p.z) - G.rotta);
  parla(`${p.nome}, ${p.etichetta}, ${metri(d)} ${direzioneRelativa(rel)}${p.scortaAttiva ? ', rifornimenti' : ''}. L per andarci.`, 1);
}

function impostaDestinazione() {
  if (G.modalita !== 'esplorazione') { parla('Solo in esplorazione.', 1); return; }
  if (G.destinazione && (G.selezionePoi < 0 || G.elencoPoi[G.selezionePoi]?.p === G.destinazione)) {
    G.destinazione = null; parla('Navigazione spenta.', 1); return;
  }
  const scelta = G.elencoPoi[G.selezionePoi];
  if (!scelta) { parla('Prima scegli un luogo col tasto P.', 1); return; }
  G.destinazione = scelta.p;
  const r = calcolaRotta();
  parla(`Destinazione: ${scelta.p.nome}${r ? `, ${metri(r.lunghezza)} a piedi` : ''}. Segui il segnale.`, 1);
}

// percorso dalla mia posizione al nodo più vicino alla destinazione
function calcolaRotta() {
  const M = G.mappa, D = G.destinazione; if (!D) return null;
  if (!D.nodo) D.nodo = nodoPiuVicino(M, D.x, D.z);
  const P = G.pos;
  if (P.nodo != null) return percorso(M, P.nodo, D.nodo);
  const len = M.archi[P.e].len;
  const r1 = percorso(M, P.a, D.nodo), r2 = percorso(M, P.da, D.nodo);
  const l1 = r1 ? r1.lunghezza + len - P.t : Infinity, l2 = r2 ? r2.lunghezza + P.t : Infinity;
  if (l1 <= l2 && r1) return { nodi: r1.nodi, lunghezza: l1 };
  if (r2) return { nodi: r2.nodi, lunghezza: l2 };
  return null;
}

// il prossimo punto di svolta del percorso: un incrocio, oppure la destinazione
function prossimoPuntoRotta() {
  const M = G.mappa, r = calcolaRotta(); if (!r) return null;
  const via = r.nodi;
  for (let i = G.pos.nodo != null ? 1 : 0; i < via.length - 1; i++) {
    if (gradoNodo(M, via[i]) >= 3) return { x: M.nodi[via[i]].x, z: M.nodi[via[i]].z };
  }
  return { x: G.destinazione.x, z: G.destinazione.z };
}

function istruzioneRotta() {
  if (!G.destinazione || G.pos.nodo == null) return '';
  const r = calcolaRotta(); if (!r || r.nodi.length < 2) return '';
  const prossimo = r.nodi[1];
  const ramo = diramazioni(G.pos.nodo).find(x => x.v === prossimo); if (!ramo) return '';
  return `Per ${G.destinazione.nome}: ${direzioneRelativa(avvolgi(ramo.dir - G.rotta))}, ${ramo.arco.nome}.`;
}

let prossimoPing = 0;
function aggiornaRadiofaro() {
  if (!G.destinazione || G.tempo < prossimoPing) return;
  prossimoPing = G.tempo + 1.6;
  const p = prossimoPuntoRotta(); if (!p) return;
  const minacce = G.nemici.some(n => n.vivo && Math.hypot(n.x - G.x, n.z - G.z) < 12);
  suonaInPunto('ping', p.x, p.z, { gain: minacce ? 0.25 : 0.6, ref: 8, riverbero: 0.1 });
}

// ---------------------------------------------------------------- ambiente sonoro della città
let prossimaCampana = 0, prossimiCani = 0, prossimaCivetta = 0;
function avviaAmbiente() {
  if (!G.loopAmbiente) G.loopAmbiente = suona('ambiente', { dest: Audio3D.ambienteGain, loop: true });
  prossimaCampana = G.tempo + caso(20, 60); prossimiCani = G.tempo + caso(15, 40); prossimaCivetta = G.tempo + caso(30, 70);
}
function aggiornaAmbiente() {
  const M = G.mappa; if (!M) return;
  // nel duello niente fontane, campane, cani e civette: solo un filo di vento
  Audio3D.ambienteGain.gain.setTargetAtTime(!G.ambienteAcceso ? 0 : mixEssenziale() ? 0.025 : 0.10, Audio3D.ctx.currentTime, 0.5);
  if (mixEssenziale()) { for (const s of G.fontaneAttive.values()) fermaLoop(s); G.fontaneAttive.clear(); return; }
  // fontane vicine, attive solo entro 120 metri
  for (const f of M.fontane) {
    const d = Math.hypot(f.x - G.x, f.z - G.z), k = f.x + ',' + f.z;
    if (d < 120 && !G.fontaneAttive.has(k)) G.fontaneAttive.set(k, loopInPunto('fontana', f.x, f.z, 0.5, { ref: 3 }));
    else if (d > 140 && G.fontaneAttive.has(k)) { fermaLoop(G.fontaneAttive.get(k)); G.fontaneAttive.delete(k); }
  }
  if (G.tempo >= prossimaCampana) {
    prossimaCampana = G.tempo + caso(120, 240);
    let c = null;
    for (const ch of M.chiese) { const d = Math.hypot(ch.x - G.x, ch.z - G.z); if (d < 500 && (!c || d < c.d)) c = { ...ch, d }; }
    if (c) suonaInPunto('campane', c.x, c.z, { gain: 0.8, ref: 30, riverbero: 0.6 });
  }
  if (G.tempo >= prossimiCani) {
    prossimiCani = G.tempo + caso(40, 90);
    const [x, z] = avanti(caso(-Math.PI, Math.PI)), d = caso(60, 140);
    suonaInPunto('cani', G.x + x * d, G.z + z * d, { gain: 0.9, ref: 20, riverbero: 0.8 });
  }
  if (G.tempo >= prossimaCivetta) {
    prossimaCivetta = G.tempo + caso(60, 120);
    const [x, z] = avanti(caso(-Math.PI, Math.PI)), d = caso(30, 70);
    suonaInPunto('civetta', G.x + x * d, G.z + z * d, { gain: 0.6, ref: 10, y: 8 });
  }
  // battito del cuore quando la vita è bassa
  if (G.vita < 35 && G.stato === 'gioco') {
    if (!G.battito) G.battito = suona('battito', { loop: true, gain: 0 });
    G.battito.guadagno.gain.setTargetAtTime(0.25 + (35 - G.vita) / 35 * 0.5, Audio3D.ctx.currentTime, 0.3);
  } else if (G.battito) { try { G.battito.stop(); } catch (e) { /* già fermo */ } G.battito = null; }
}

// ---------------------------------------------------------------- informazioni a richiesta
function nomeLuogo() {
  if (G.modalita === 'assedio') return G.citta.piazza;
  const M = G.mappa;
  let vicino = null;
  for (const p of M.poi) { const d = Math.hypot(p.x - G.x, p.z - G.z); if (d < 80 && (!vicino || d < vicino.d)) vicino = { p, d }; }
  return `${G.pos.nome || 'strada'}${vicino ? `, vicino a ${vicino.p.nome}` : ''}`;
}

function descriviArma() {
  const def = armaDef(), st = armaStato();
  return `${def.nome} ${st.caricatore + st.camera}, riserva ${G.arsenale.riserva[def.munizione]}`;
}

function ricognizione() {
  const vivi = G.nemici.filter(n => n.vivo && n.udito).map(n => ({ n, d: Math.hypot(n.x - G.x, n.z - G.z) })).sort((a, b) => a.d - b.d);
  let f = `${nomeLuogo()}. `;
  if (G.modalita === 'assedio') f += G.ondata.inPausa ? `Pausa dopo l'ondata ${G.ondata.numero}. ` : `Ondata ${G.ondata.numero}. `;
  if (!vivi.length) f += 'Nessun nemico. ';
  else {
    f += `${plurale(vivi.length, 'nemico', 'nemici')}. `;
    f += vivi.slice(0, 3).map(({ n, d }) => `${n.def.nome} ${direzioneRelativa(avvolgi(rottaVerso(G.x, G.z, n.x, n.z) - G.rotta))} ${metri(d)}${n.occluso ? ', dietro i palazzi' : ''}`).join(', ') + '. ';
  }
  f += `${descriviArma()}. Vita ${Math.round(G.vita)}. ${G.punti} punti.`;
  if (G.destinazione) f += ` Destinazione ${G.destinazione.nome}.`;
  parla(f, 2);
}

function inventario() {
  const A = G.arsenale, I = G.inventario, parti = [];
  for (const k of ['pistola', 'pompa', 'mitra', 'precisione']) {
    const st = A.armi[k]; if (!st) continue;
    parti.push(`${ARMI[k].nome} ${st.caricatore + st.camera} più ${A.riserva[ARMI[k].munizione]}`);
  }
  parti.push(plurale(I.granate, 'granata', 'granate'), plurale(I.kit, 'kit medico', 'kit medici'), `${I.cibo} cibo`, `${I.materiali} materiali`);
  if (G.inventario.radar) parti.push(plurale(G.inventario.radar, 'radar', 'radar'));
  if (G.scudo > 0) parti.push(`scudo ${Math.round(G.scudo)}`);
  parla(parti.join('. ') + '.', 2);
}

function orientamento() {
  const card = puntoCardinale(G.rotta);
  if (G.modalita === 'assedio') { parla(`${G.citta.piazza}, guardi verso ${card}.`, 1); return; }
  const M = G.mappa, P = G.pos;
  let f = `${P.nome || 'strada'}, guardi verso ${card}.`;
  if (P.nodo == null) {
    // cammino fino al prossimo incrocio nella direzione in cui guardo
    let da = P.da, a = P.a, dist = M.archi[P.e].len - P.t;
    if (Math.abs(avvolgi(direzioneArco(P.da, P.a) - G.rotta)) > Math.PI / 2) { da = P.a; a = P.da; dist = P.t; }
    for (let i = 0; i < 200 && gradoNodo(M, a) === 2; i++) {
      const o = M.nodi[a].adj.find(x => x.v !== da); dist += M.archi[o.e].len; da = a; a = o.v;
    }
    f += gradoNodo(M, a) === 1 ? ` Fine strada tra ${metri(dist)}.` : ` Incrocio tra ${metri(dist)}.`;
  } else f += ' Sei a un incrocio.';
  parla(f, 1);
}

// ---------------------------------------------------------------- input
function agganciaPuntatore() {
  try { const p = tela.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignorato */ }
}

function ruota(da) {
  if (G.stato !== 'gioco' || G.pausa) return;
  G.rotta = avvolgi(G.rotta + da);
}

document.addEventListener('pointerlockchange', () => {
  const agganciato = document.pointerLockElement === tela;
  if (G.stato === 'gioco' && G.modalita === 'duello') {
    G.pausa = false;
    if (!agganciato) parla('Mouse sganciato. Clicca per riprendere. La partita continua.', 2);
  } else if (G.stato === 'gioco') {
    G.pausa = !agganciato;
    if (agganciato) {
      if (G.tempo < 0.1) {
        if (G.modalita === 'esplorazione') { parla('Via.', 1); pianifica(1.5, annunciaIncrocio); pianifica(2.5, primoIncontro); }
        else if (G.ondata) G.ondata.fine = 0.5;
      } else parla('Via.', 1);
    } else parla('Pausa. Clicca per riprendere. M per il menù.', 2);
  }
  aggiornaPannello();
});

async function primoAvvio() {
  G.stato = 'caricamento'; aggiornaPannello();
  parla('Caricamento suoni.', 2);
  let ultimo = 0;
  await inizializzaAudio(p => { if (p - ultimo >= 0.25) { ultimo = p; $('messaggio').textContent = `Caricamento suoni… ${Math.round(p * 100)}%`; } });
  if (Audio3D.ctx.state === 'suspended') await Audio3D.ctx.resume();
  // se Safari sospende o interrompe l'audio, lo annoto, lo dico e lo faccio ripartire al primo tasto
  Audio3D.ctx.onstatechange = () => {
    const st = Audio3D.ctx.state;
    if (st !== 'running' && st !== 'closed') { annota(`audio ${st} durante ${G.modalita}, stato ${G.stato}`); parla('Audio interrotto da Safari. Premi un tasto per riprenderlo.', 2); }
  };
  creaPuntamento();
  creaMusica();
  apriMenu('menu', 'Velletri Zombie. ');
}

document.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  if (G.stato === 'inizio') { primoAvvio(); return; }
  if (Audio3D.ctx && Audio3D.ctx.state !== 'running') Audio3D.ctx.resume().catch(() => {});
  if (G.stato === 'gioco') {
    if (document.pointerLockElement !== tela) { agganciaPuntatore(); return; }
    premiGrilletto();
  }
});
document.addEventListener('mouseup', e => { if (e.button === 0 && G.arsenale) rilasciaGrilletto(); });

document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== tela) return;
  ruota(e.movementX * G.sensibilita * 0.05 * GRADI);
});

document.addEventListener('keydown', e => {
  const k = e.key, c = e.code;
  if (Audio3D.ctx && Audio3D.ctx.state !== 'running') Audio3D.ctx.resume().catch(() => {});
  // Maiuscolo più D: leggo gli ultimi problemi annotati
  if (c === 'KeyD' && e.shiftKey && e.altKey) { leggiRegistro(); return; }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(c)) e.preventDefault();
  if (G.stato === 'inizio') { if (k === 'Enter') primoAvvio(); return; }
  if (G.stato === 'caricamento') return;

  if (G.stato === 'attesa') {
    if (c === 'Space') duelloDiciCodice();
    else if (k === 'Enter') duelloDaiIlVia();
    else if (k === 'Escape') { duelloChiudi(); apriMenu('menu'); }
    return;
  }
  if (G.stato === 'menu' || G.stato === 'armi' || G.stato === 'duello' || G.stato === 'lancio' || G.stato === 'difficolta') {
    if (c === 'ArrowDown' || c === 'KeyS') muoviMenu(1);
    else if (c === 'ArrowUp' || c === 'KeyW') muoviMenu(-1);
    else if (k === 'Enter') confermaMenu();
    else if (k === 'Escape' && G.stato !== 'menu') apriMenu('menu');
    return;
  }
  if (G.stato === 'digitazione') {
    if (k === 'Enter') { if (G.scopoTesto === 'codice') duelloEntra(); else confermaCitta(); }
    else if (k === 'Escape') apriMenu('menu');
    else if (k === 'Backspace') { const tolta = G.testo.slice(-1); G.testo = G.testo.slice(0, -1); parla(tolta === ' ' ? 'spazio' : tolta || 'vuoto', 0); }
    else if (k.length === 1) { G.testo += k; parla(k === ' ' ? 'spazio' : k, 0); }
    aggiornaPannello();
    return;
  }
  if (G.stato === 'morto') {
    if (k === 'Enter') { if (G.modalita === 'duello') duelloRivincita(); else if (G.modalita === 'battaglia') battagliaAvvia(B.lancio); else avviaPartita(); if (document.pointerLockElement !== tela) agganciaPuntatore(); }
    else if (c === 'KeyM') { if (G.modalita === 'duello') duelloChiudi(); pulisciPartita(); apriMenu('menu'); if (document.pointerLockElement) document.exitPointerLock(); }
    return;
  }
  // in gioco
  if (G.pausa) {
    if (c === 'KeyM') { pulisciPartita(); apriMenu('menu'); }
    else if (k === 'Enter') agganciaPuntatore();
    return;
  }
  if (e.repeat && !c.startsWith('Arrow') && !['KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(c)) return;
  if (G.modalita === 'battaglia') {
    G.tasti[c] = true;
    if (c === 'KeyA') return; // passo laterale
    if (c === 'KeyF') { duelloTrappola(); return; }
    if (c === 'KeyT') { costruisciScatola(); return; }
    if (c === 'KeyL') { duelloRadar(); return; }
    if (c === 'KeyB' || c === 'KeyN') { costruisciRapido(c === 'KeyB' ? 'barricata' : 'rampa'); G.prossimaTurbo = G.tempo + 0.3; return; }
    if (c === 'KeyZ') { giratiVerso(e.shiftKey); return; }
    if (c === 'KeyK') { senteCostruzioni(); return; }
    if (c === 'ControlLeft' || c === 'ControlRight') { ascolta(); return; }
    if (c === 'AltLeft' || c === 'AltRight') { e.preventDefault(); return; }
    if (c === 'Space') { G.tasti[c] = true; battagliaRicognizione(); return; }
  }
  if (G.modalita === 'duello') {
    if (c === 'KeyM' && document.pointerLockElement !== tela) { duelloChiudi(); pulisciPartita(); apriMenu('menu'); return; }
    G.tasti[c] = true;
    if (c === 'KeyA') return; // A è il passo laterale
    if (c === 'KeyF') { duelloTrappola(); return; }
    if (c === 'KeyT') { costruisciScatola(); return; }
    if (c === 'KeyL') { duelloRadar(); return; }
    if (c === 'Space') { G.tasti[c] = true; duelloRicognizione(); return; }
    // come nella battaglia reale: costruzione istantanea e a raffica, aiuti per giocare a orecchio
    if (c === 'KeyB' || c === 'KeyN') { costruisciRapido(c === 'KeyB' ? 'barricata' : 'rampa'); G.prossimaTurbo = G.tempo + 0.3; return; }
    if (c === 'KeyZ') { giratiVerso(e.shiftKey); return; }
    if (c === 'KeyK') { senteCostruzioni(); return; }
    if (c === 'ControlLeft' || c === 'ControlRight') { ascolta(); return; }
    if (c === 'AltLeft' || c === 'AltRight') { e.preventDefault(); return; }
    if (e.shiftKey && (c === 'Digit1' || c === 'Digit2' || c === 'Digit3')) { provocazione({ Digit1: 'minaccia', Digit2: 'attacco', Digit3: 'colpito' }[c]); return; }
  }
  G.tasti[c] = true;
  switch (c) {
    case 'KeyR': ricarica(); break;
    case 'Digit1': cambiaArma('pistola'); break;
    case 'Digit2': cambiaArma('pompa'); break;
    case 'Digit3': cambiaArma('mitra'); break;
    case 'Digit4': cambiaArma('precisione'); break;
    case 'KeyN': costruisci('rampa'); break;
    case 'KeyJ': if (G.modalita === 'duello') vocaleMuto(); break;
    case 'KeyP': if (G.modalita === 'battaglia') { bevePozione(); break; } sfogliaLuoghi(e.shiftKey ? -1 : 1); break;
    case 'KeyO': if (G.modalita === 'battaglia') { battagliaZona(); break; } orientamento(); break;
    case 'KeyQ': lanciaGranata(); break;
    case 'KeyZ': spintone(); break;
    case 'KeyX': G.rotta = avvolgi(G.rotta + Math.PI); suona('arma_estrai', { gain: 0.3, rate: 1.3 }); break;
    case 'KeyU': if (mixEssenziale()) { Musica.volutaNelDuello = !Musica.volutaNelDuello; parla(Musica.volutaNelDuello ? 'Musica accesa.' : 'Musica spenta.', 1); break; }
      Musica.attiva = !Musica.attiva; parla(Musica.attiva ? 'Musica accesa.' : 'Musica spenta.', 1); break;
    case 'KeyH': cura(); break;
    case 'KeyB': costruisci('barricata'); break;
    case 'KeyF': if (e.shiftKey) costruisci('filo'); else duelloTrappola(); break;
    case 'KeyT': if (e.shiftKey) costruisci('mina'); else costruisciScatola(); break;
    case 'KeyE': if (!duelloApriCassa() && G.modalita === 'esplorazione') raccogli(); break;
    case 'Space': ricognizione(); break;
    case 'KeyI': case 'Tab': inventario(); break;
    case 'KeyC': parla(descriviArma(), 1); break;
    case 'KeyV': parla(`vita ${Math.round(G.vita)}`, 1); break;
    case 'KeyK': parla(descriviCostruzioni(), 1); break;
    case 'KeyL': if (G.modalita === 'esplorazione' && !e.shiftKey) impostaDestinazione(); else duelloRadar(); break;
    case 'KeyG':
      G.graficaAccesa = !G.graficaAccesa;
      $('buio').style.display = G.graficaAccesa ? 'none' : 'block';
      parla(G.graficaAccesa ? 'Grafica accesa.' : 'Grafica spenta.', 1); break;
    case 'KeyY':
      G.ambienteAcceso = !G.ambienteAcceso;
      Audio3D.ambienteGain.gain.setTargetAtTime(G.ambienteAcceso ? 0.10 : 0, Audio3D.ctx.currentTime, 0.3);
      parla(G.ambienteAcceso ? 'Vento acceso.' : 'Vento spento.', 1); break;
    case 'Enter':
      if (G.modalita === 'assedio' && G.ondata.inPausa && G.ondata.numero > 0) G.ondata.fine = G.tempo; break;
    default:
      if (k === '+' || k === '=' || k === '-' || k === '_') {
        G.sensibilita = lim(G.sensibilita + (k === '+' || k === '=' ? 1 : -1), 1, 9);
        parla(`Sensibilità ${G.sensibilita}.`, 1);
      }
  }
});
document.addEventListener('keyup', e => { delete G.tasti[e.code]; });
window.addEventListener('blur', () => { G.tasti = {}; if (G.arsenale) G.arsenale.grilletto = false; });

// ---------------------------------------------------------------- pannello (per chi vede)
function aggiornaPannello() {
  const p = $('pannello'), m = $('messaggio'), v = $('voci');
  const inGioco = (G.stato === 'gioco' && !G.pausa && (G.modalita !== 'duello' || document.pointerLockElement === tela)) || G.stato === 'morto';
  p.style.display = inGioco ? 'none' : 'flex';
  v.innerHTML = '';
  if (G.stato === 'inizio') m.textContent = 'Clicca o premi Invio per iniziare.';
  else if (G.stato === 'caricamento') m.textContent = 'Caricamento…';
  else if (G.stato === 'attesa') m.textContent = `Stanza ${D.codice}. Giocatori: ${D.giocatori.length}. ${D.ospite ? 'Invio per iniziare, ' : 'Attendi che chi ha creato la stanza dia il via. '}Spazio ripete, Esc annulla.`;
  else if (G.stato === 'menu' || G.stato === 'armi' || G.stato === 'duello' || G.stato === 'lancio' || G.stato === 'difficolta') {
    m.textContent = MENU[G.stato].titolo;
    MENU[G.stato].voci.forEach(([, testo], i) => {
      const li = document.createElement('li'); li.textContent = testo; if (i === sceltaMenu) li.className = 'scelta'; v.appendChild(li);
    });
  } else if (G.stato === 'digitazione') m.textContent = `${G.scopoTesto === 'codice' ? 'Codice' : 'Città'}: ${G.testo}▌`;
  else if (G.stato === 'gioco') m.textContent = 'Pausa. Clicca per agganciare il trackpad. M per il menù.';
}

// ---------------------------------------------------------------- ciclo principale
let ultimoFrame = performance.now();
function ciclo(ora) {
  requestAnimationFrame(ciclo); // prenotato subito: anche se qualcosa va storto qui sotto, il gioco continua
  try { cicloInterno(ora); } catch (e) { erroriCiclo++; if (erroriCiclo < 20) { console.error('errore nel ciclo di gioco', e); annota('errore nel gioco: ' + e.message + ' ' + String(e.stack || '').split('\n')[1]); } }
}
let erroriCiclo = 0;
function cicloInterno(ora) {
  const dt = Math.min(0.1, (ora - ultimoFrame) / 1000); ultimoFrame = ora;
  if (Audio3D.ctx && G.stato === 'gioco' && !G.pausa) {
    G.tempo += dt;
    let giro = 0;
    if (G.tasti.ArrowLeft) giro -= 1;
    if (G.tasti.ArrowRight) giro += 1;
    if (giro) ruota(giro * 120 * GRADI * dt);
    if (G.modalita === 'esplorazione') { aggiornaCammino(dt); controllaAllineamento(); aggiornaRegia(); aggiornaRadiofaro(); }
    else if (G.modalita === 'duello') aggiornaDuello(dt);
    else if (G.modalita === 'battaglia') aggiornaBattaglia(dt);
    else { muoviLibero(dt, G.cx, G.cz, 22, false); aggiornaAssedio(); }
    if (G.modalita !== 'duello') { controllaTrappole(); aggiornaRadar(); }
    if (G.modalita === 'battaglia') { aggiornaTurbo(); aggiornaPianoMio(); aggiornaCasse(false); }
    else if (G.modalita !== 'duello') { aggiornaAltezza(); aggiornaCasseSolitario(); }
    eseguiEventi();
    aggiornaArmi();
    aggiornaNemici(dt);
    aggiornaRespiro(dt);
    aggiornaCostruzioni();
    aggiornaAmbiente();
    aggiornaAscoltatore(G.x, G.z, G.rotta);
    aggiornaPuntamento(bersaglioPuntamento());
    aggiornaMusica(mixEssenziale() && !Musica.volutaNelDuello ? -1 : intensitaPericolo());
  } else if (Audio3D.ctx && Mira.osc) {
    aggiornaPuntamento(null);
    aggiornaMusica(0);
    if (G.stato === 'morto') { for (const n of G.nemici) if (!n.vivo) n.morteT += dt; }
  }
  disegna(ora, dt);
}
requestAnimationFrame(ciclo);
aggiornaPannello();

// un grido d'assalto che arriva dal punto da cui stanno per sbucare
function gridoAssalto(x, z) {
  const voci = Object.keys(Audio3D.voci || {}); if (!voci.length) return;
  const frasi = Audio3D.voci[scegli(voci)].assalto || [];
  if (frasi.length) suonaInPunto(scegli(frasi), x, z, { gain: 2.0, ref: 12, riverbero: 0.8 });
}

// ---------------------------------------------------------------- movimento libero (assedio e duello)
// W avanti, S indietro, A e D di lato, Maiuscolo corre. Resto entro "limite" metri dal centro (cx, cz).
function muoviLibero(dt, cx, cz, limite, bloccato) {
  let f = 0, l = 0;
  if (G.tasti.KeyW || G.tasti.ArrowUp) f += 1;
  if (G.tasti.KeyS || G.tasti.ArrowDown) f -= 1;
  if (G.tasti.KeyD) l += 1;
  if (G.tasti.KeyA) l -= 1;
  G.inMovimento = false;
  if (!(f || l) || bloccato || G.tempo < G.occupatoFino) return 0;
  const corsa = G.tasti.ShiftLeft || G.tasti.ShiftRight, rapido = G.modalita === 'battaglia';
  const v = (corsa ? (rapido ? 5.4 : 3.4) : (rapido ? 3.3 : 1.7)) * (G.velocitaExtra || 1) / Math.hypot(f, l) * dt;
  const [fx, fz] = avanti(G.rotta), [rx, rz] = destraDi(G.rotta);
  G.x += (fx * f + rx * l) * v; G.z += (fz * f + rz * l) * v;
  const r = Math.hypot(G.x - cx, G.z - cz);
  if (r > limite) {
    G.x = cx + (G.x - cx) * limite / r; G.z = cz + (G.z - cz) * limite / r;
    if (G.modalita !== 'duello' && G.tempo - (G.ultimoMuro || -9) > 2) { G.ultimoMuro = G.tempo; suona('tic2', { gain: 0.6 }); parla('fine della piazza', 0); }
  }
  G.inMovimento = true;
  if (corsa && G.modalita !== 'duello') allertaNemici(G.x, G.z, 25);
  passiMiei(corsa);
  return corsa ? 2 : 1;
}

// rampe: salendoci sopra sono in alto. Da lì sparo oltre i muri e chi attacca a mani nude non mi arriva.
function aggiornaAltezza() {
  const rampa = G.costruzioni.find(c => c.tipo === 'rampa' && c.vita > 0 && Math.hypot(c.x - G.x, c.z - G.z) < 1.4);
  if (rampa && !G.alto) { G.alto = true; G.rampaSotto = rampa; suona('legno_colpito', { gain: 0.5, rate: 1.3 }); parla('in alto', 0); }
  else if (!rampa && G.alto) {
    G.alto = false;
    if (G.rampaSotto && G.rampaSotto.vita <= 0) { parla('La rampa crolla!', 1); if (G.modalita === 'duello') D.ultimoColpoSubito = -99; feriscimi(15); }
    else parla('a terra', 0);
    G.rampaSotto = null;
  }
}

// ---------------------------------------------------------------- registro dei problemi
// Ogni errore viene annotato e resta salvato anche se la pagina si ricarica.
// Opzione più Maiuscolo più D lo legge ad alta voce, così si può raccontare cosa è successo.
function annota(testo) {
  try {
    const r = JSON.parse(localStorage.getItem('vz_registro') || '[]');
    r.push(`${new Date().toLocaleTimeString('it-IT')}: ${testo}`.slice(0, 300));
    localStorage.setItem('vz_registro', JSON.stringify(r.slice(-15)));
  } catch (e) { /* memoria del browser non disponibile */ }
}
function leggiRegistro() {
  let r = [];
  try { r = JSON.parse(localStorage.getItem('vz_registro') || '[]'); } catch (e) { /* niente */ }
  parla(r.length ? `Ultimi problemi: ${r.slice(-3).reverse().join('. ')}` : 'Nessun problema registrato.', 2);
}
window.addEventListener('error', e => annota(`errore: ${e.message} in ${String(e.filename || '').split('/').pop()} riga ${e.lineno}`));
window.addEventListener('unhandledrejection', e => annota(`errore: ${e.reason && e.reason.message || e.reason}`));
document.addEventListener('pointerlockerror', () => { annota('Safari non ha permesso di agganciare il mouse'); parla('Il browser non ha agganciato il mouse. Clicca di nuovo.', 1); });
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== tela && G.stato === 'gioco') annota(`mouse sganciato durante ${G.modalita} al secondo ${Math.round(G.tempo)}`); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.stato === 'gioco') annota(`pagina nascosta durante ${G.modalita} al secondo ${Math.round(G.tempo)}`); });
// se la pagina era stata chiusa di colpo durante una partita, lo annoto al riavvio
try { if (sessionStorage.getItem('vz_in_partita')) annota('la pagina si era chiusa o ricaricata durante una partita'); } catch (e) { /* niente */ }
setInterval(() => { try { if (G.stato === 'gioco') sessionStorage.setItem('vz_in_partita', G.modalita); else sessionStorage.removeItem('vz_in_partita'); } catch (e) { /* niente */ } }, 2000);
