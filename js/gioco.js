'use strict';
// Velletri Zombie — logica di gioco: menù, assedio a ondate, esplorazione della città, orientamento, input.

const CENTRO_VELLETRI = { lat: 41.6889914, lon: 12.7793312, nome: 'Velletri', piazza: 'Piazza Cairoli' };

const G = {
  stato: 'inizio',          // inizio | caricamento | menu | armi | digitazione | gioco | morto
  pausa: true, modalita: 'battaglia', principale: 'pompa',
  tempo: 0, eventi: [],
  x: 0, z: 0, rotta: 0, vita: 100, occupatoFino: 0, inMovimento: false,
  arsenale: null, inventario: null, nemici: [], costruzioni: [], uccisi: 0,
  ondata: null, mappa: null, citta: CENTRO_VELLETRI, pos: null, scorte: [],
  destinazione: null, selezionePoi: -1, elencoPoi: [], annunciati: new Set(),
  effetti: { lampo: 0, fase: '', esplosioni: [], dolore: 0 },
  sensibilita: 5, graficaAccesa: true, ambienteAcceso: true, tasti: {},
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
  menu: { titolo: 'Menù', voci: [['battaglia', 'Battaglia reale contro i bot: da solo o a squadre'], ['brete', 'Battaglia reale in rete con gli amici: i bot prendono i posti vuoti'], ['allenamento', 'Allenamento: ripassa tutti i comandi, uno alla volta'], ['orecchie', "Test delle orecchie: scegli l'audio 3D più preciso per te"]] },
  difficolta: { titolo: 'Difficoltà', voci: [['facile', 'Facile: sette avversari, meno precisi, mira molto assistita'], ['normale', 'Normale: undici avversari'], ['difficile', 'Difficile: avversari più svelti e precisi, poca assistenza']] },
  lancio: { titolo: 'Dove vuoi atterrare? Ti avviso io quando lanciarti.', voci: [['piazza', 'Piazza, al centro: tanti forzieri, tanta gente'], ['campanile', 'Campanile, a nord'], ['fontana', 'Fontana, a est'], ['canile', 'Canile, a sud'], ['bosco', 'Bosco, a ovest']] },
  squadre: { titolo: 'Come giochi?', voci: [['1', 'Da solo, tutti contro tutti'], ['2', 'In coppia: tu e un compagno'], ['4', 'Squadre da quattro: tu e tre compagni']] },
  brete: { titolo: 'Battaglia reale in rete', voci: [['crea', 'Crea una stanza'], ['entra', 'Entra in una stanza con un codice']] },
  squadreRete: { titolo: 'Squadre', voci: [['1', 'Tutti contro tutti'], ['2', 'A coppie: gli amici in squadra insieme, i bot riempiono'], ['4', 'Squadre da quattro: gli amici insieme, i bot riempiono']] },
};
let sceltaMenu = 0;

// le frasi d'apertura che hanno una registrazione del narratore
const INTRO_MENU = { 'Velletri Zombie. ': 'menu_benvenuto', 'Mappa pronta. ': 'menu_mappa' };
function apriMenu(nome, intro = '') {
  G.stato = nome; sceltaMenu = 0;
  const m = MENU[nome], testo = `${intro}${m.titolo}. ${m.voci[0][1]}. Frecce su e giù, Invio per scegliere.`;
  const nomi = [`menu_${nome}_titolo`, `menu_${nome}_${m.voci[0][0]}`, 'menu_aiuto'];
  if (intro) nomi.unshift(INTRO_MENU[intro] || 'manca');
  annunciaCatena(nomi, testo, 2);
  aggiornaPannello();
}
function muoviMenu(d) {
  const m = MENU[G.stato];
  sceltaMenu = (sceltaMenu + d + m.voci.length) % m.voci.length;
  suona('tic', { gain: 0.5 });
  annunciaCatena([`menu_${G.stato}_${m.voci[sceltaMenu][0]}`], m.voci[sceltaMenu][1], 1);
  aggiornaPannello();
}
function confermaMenu() {
  const id = MENU[G.stato].voci[sceltaMenu][0];
  suona('tic2', { gain: 0.5 });
  if (G.stato === 'menu') {
    if (id === 'battaglia') apriMenu('squadre');
    else if (id === 'brete') apriMenu('brete');
    else if (id === 'allenamento') tutorialAvvia();
    else if (id === 'orecchie') testOrecchieAvvia();
  } else if (G.stato === 'squadre') {
    B.squadre = +id; apriMenu('lancio');
  } else if (G.stato === 'lancio') {
    B.lancio = id; apriMenu('difficolta');
  } else if (G.stato === 'difficolta') {
    battagliaAvvia(B.lancio, id, { squadre: B.squadre });
  } else if (G.stato === 'brete') {
    if (id === 'crea') apriMenu('squadreRete');
    else { G.stato = 'digitazione'; G.scopoTesto = 'codice'; G.testo = ''; parla('Scrivi il codice di 4 cifre, poi Invio. Esc per tornare.', 2); aggiornaPannello(); }
  } else if (G.stato === 'squadreRete') {
    duelloCrea('battaglia', +id);
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

function feriscimi(danno, proiettile = false) {
  if (G.stato !== 'gioco') return;
  if (!Number.isFinite(danno) || danno <= 0) return;
  stressa(0.5);
  danno = Math.min(danno, 300);
  if (G.modalita === 'battaglia' && B.tutorial) danno = Math.min(danno, 15);
  // lo scudo assorbe i colpi prima della vita
  if (G.scudo > 0) {
    const assorbito = Math.min(G.scudo, danno);
    G.scudo -= assorbito; danno -= assorbito;
    suona('scudo_colpo', { gain: 0.7 });
    if (G.scudo <= 0) { if (G.modalita === 'battaglia') annuncio('giubbotto', 'Giubbotto distrutto.', 1); else parla('giubbotto rotto', 1); }
    if (danno <= 0) return;
  }
  const prima = G.vita;
  G.vita -= danno;
  G.ultimaFerita = G.tempo;
  G.effetti.dolore = 1;
  suona(scegli(['dolore1', 'dolore2', 'dolore3']), { gain: 0.7, rate: caso(0.95, 1.05) });
  if (proiettile) suona('colpo_corpo', { gain: 0.7, rate: 1.2 });
  if (typeof vibra === 'function') vibra(proiettile ? 70 : 40);
  if (G.vita <= 0) { G.vita = 0; morte(); return; }
  for (const soglia of [75, 50, 25]) if (prima > soglia && G.vita <= soglia) { if (soglia === 25 && G.modalita === 'battaglia') annuncio('vita_bassa', 'Vita bassa. Trova un riparo e curati.', 1); else parla(`vita ${Math.round(G.vita)}`, 1); break; }
}

function cura() {
  if (!puoAgire()) return;
  if (G.vita >= 100) { parla('Vita piena.', 1); return; }
  const inv = G.inventario;
  const usa = inv.kit > 0 ? 'kit' : inv.cibo > 0 ? 'cibo' : null;
  if (!usa) { parla('Niente per curarti.', 1); return; }
  inv[usa]--;
  const tempo = usa === 'kit' ? 2.5 : 1.5;
  parla(usa === 'kit' ? 'Kit medico.' : 'Benda.', 1);
  G.occupatoFino = G.tempo + tempo;   // mentre mi curo sono vulnerabile
  suona('raccogli', { gain: 0.6 });
  pianifica(tempo, () => { G.vita = Math.min(100, G.vita + (usa === 'kit' ? 50 : 20)); parla(`vita ${Math.round(G.vita)}`, 1); });
}

// ---------------------------------------------------------------- assedio a ondate

// sceglie da quali vie arrivano: nodi a 35-55 metri a piedi, in direzioni diverse tra loro




// ---------------------------------------------------------------- esplorazione: regia dei nemici

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




let prossimoMioPasso = 0, piedeMio = 0;
function passiMiei(corsa) {
  if (G.tempo < prossimoMioPasso) return;
  prossimoMioPasso = G.tempo + (corsa ? 0.33 : 0.55) * (G.modalita === 'battaglia' ? 0.75 : 1);
  // nelle arene i miei passi si sentono chiari, come in Fortnite
  const k = mixEssenziale() ? 2.2 : 1;
  const P = passoSulTerreno(`io_passo${1 + (piedeMio++ % 4)}`, G.x, G.z, G.livello, { gain: (corsa ? 0.3 : 0.2) * k, rate: caso(0.95, 1.05) });
  suona(P.nome, P.opz);
  if (P.legno) suona('legno_colpito', { gain: 0.15, rate: caso(1.5, 1.8) }); // sui muri e sulle rampe i passi suonano di legno
}


// all'incrocio, quando la mia direzione si allinea con una via sento un tic e il suo nome

// ---------------------------------------------------------------- luoghi, scorte e navigazione






// percorso dalla mia posizione al nodo più vicino alla destinazione

// il prossimo punto di svolta del percorso: un incrocio, oppure la destinazione


let prossimoPing = 0;

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

function descriviArma() {
  const def = armaDef(), st = armaStato();
  return def.mischia ? def.nome : `${def.nome}, ${def.categoria}${st.silenziatore ? ', col silenziatore' : ''}, ${testoColpi(def, st)}`;
}


function inventario() {
  const A = G.arsenale, I = G.inventario, parti = [];
  for (const k of ['pistola', 'pompa', 'mitra', 'precisione', 'mitraglietta', 'lanciarazzi']) {
    const st = A.armi[k]; if (!st) continue;
    parti.push(`${ARMI[k].nome} ${st.caricatore + st.camera} più ${A.riserva[ARMI[k].munizione]}`);
  }
  parti.push(plurale(I.granate, 'granata', 'granate'), plurale(I.kit, 'kit medico', 'kit medici'), `${I.cibo} cibo`, `${I.materiali} materiali`);
  if (G.inventario.radar) parti.push(plurale(G.inventario.radar, 'radar', 'radar'));
  if (G.scudo > 0) parti.push(`scudo ${Math.round(G.scudo)}`);
  parla(parti.join('. ') + '.', 2);
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
    if (agganciato) { if (G.tempo >= 0.1) parla('Via.', 1); } else parla('Pausa. Clicca per riprendere. M per il menù.', 2);
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
  // la grafica 3D si prepara adesso, durante il caricamento, così la partita parte subito
  $('messaggio').textContent = 'Preparo la grafica…';
  await new Promise(r => setTimeout(r, 30));
  try { if (typeof iniziaGrafica3D === 'function') { iniziaGrafica3D(); nascondi3D(); } } catch (e) { console.error('grafica 3D', e); }
  // la prima volta l'allenamento è obbligatorio: si entra nel menù solo dopo averlo finito
  // (sul telefono l'allenamento, fatto per la tastiera, non è obbligatorio)
  if (!tutorialFatto() && !(typeof TOCCO !== 'undefined' && TOCCO)) { tutorialAvvia(); return; }
  apriMenu('menu', 'Velletri Zombie. ');
}

document.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  if (typeof TOCCO !== 'undefined' && TOCCO) return; // sul telefono i tocchi li gestisce tocco.js
  if (G.stato === 'inizio') { primoAvvio(); return; }
  if (Audio3D.ctx && Audio3D.ctx.state !== 'running') Audio3D.ctx.resume().catch(() => {});
  if (G.stato === 'gioco') {
    // Safari a volte rifiuta di riagganciare il puntatore (subito dopo Esc, o con VoiceOver attivo):
    // allora il clic non deve restare muto. Riprendo la partita, provo ad agganciare, e sparo comunque.
    if (document.pointerLockElement !== tela) {
      agganciaPuntatore();
      if (G.pausa) { G.pausa = false; aggiornaPannello(); parla('Via.', 1); return; }
    }
    premiGrilletto();
  }
});
document.addEventListener('mouseup', e => { if (e.button === 0 && G.arsenale) rilasciaGrilletto(); });
// clic con due dita sul trackpad (tasto destro): mirare nel mirino
document.addEventListener('contextmenu', e => { if (G.stato === 'gioco') { e.preventDefault(); if (inArena()) mira(); } });

document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== tela) return;
  // trackpad: più veloce di prima, e un gesto rapido gira di più di uno lento (accelerazione)
  const m = e.movementX, acc = 1 + Math.min(1.5, Math.abs(m) / 25);
  ruota(m * G.sensibilita * 0.09 * acc * GRADI * (G.mira ? (G.arsenale && armaDef().mirino ? 0.35 : 0.6) : 1));
});

document.addEventListener('keydown', e => {
  const k = e.key, c = e.code;
  if (Audio3D.ctx && Audio3D.ctx.state !== 'running') Audio3D.ctx.resume().catch(() => {});
  // Maiuscolo più D: leggo gli ultimi problemi annotati
  if (c === 'KeyD' && e.shiftKey && e.altKey) { leggiRegistro(); return; }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace'].includes(c)) e.preventDefault();
  // su Windows Ctrl e Alt insieme a un altro tasto sono comandi del browser (salva, segnalibro, pagina indietro): in partita li fermo
  if (G.stato === 'gioco' && (e.ctrlKey || e.altKey) && !e.metaKey) e.preventDefault();
  if (G.stato === 'inizio') { if (k === 'Enter') primoAvvio(); return; }
  if (G.stato === 'caricamento') return;
  if (G.stato === 'testOrecchie') { testOrecchieTasto(e); return; }

  if (G.stato === 'attesa') {
    if (c === 'Space') duelloDiciCodice();
    else if (k === 'Enter') duelloDaiIlVia();
    else if (k === 'Escape') { duelloChiudi(); apriMenu('menu'); }
    return;
  }
  if (MENU[G.stato]) {
    if (c === 'ArrowDown' || c === 'KeyS') muoviMenu(1);
    else if (c === 'ArrowUp' || c === 'KeyW') muoviMenu(-1);
    else if (k === 'Enter') confermaMenu();
    else if (k === 'Escape' && G.stato !== 'menu') apriMenu('menu');
    return;
  }
  if (G.stato === 'digitazione') {
    if (k === 'Enter') duelloEntra();
    else if (k === 'Escape') apriMenu('menu');
    else if (k === 'Backspace') { const tolta = G.testo.slice(-1); G.testo = G.testo.slice(0, -1); parla(tolta === ' ' ? 'spazio' : tolta || 'vuoto', 0); }
    else if (k.length === 1) { G.testo += k; parla(k === ' ' ? 'spazio' : k, 0); }
    aggiornaPannello();
    return;
  }
  if (G.stato === 'morto') {
    if (k === 'Enter') {
      if (B.rete) { if (D.ospite) reteBRRivincita(); else parla('La prossima partita la avvia chi ha creato la stanza.', 1); }
      else battagliaAvvia(B.lancio, null, { squadre: B.squadre });
      if (document.pointerLockElement !== tela) agganciaPuntatore();
    }
    else if (c === 'KeyM') { if (D.rete) duelloChiudi(); pulisciPartita(); apriMenu('menu'); if (document.pointerLockElement) document.exitPointerLock(); }
    return;
  }
  // in gioco
  if (G.pausa) {
    if (c === 'KeyM' && G.modalita === 'battaglia' && B.tutorial && TUT.obbligatorio) { annuncio('tut_obbligo', 'La prima volta l\'allenamento va finito. Clicca per riprendere.', 2); return; }
    if (c === 'KeyM') { if (D.rete) duelloChiudi(); pulisciPartita(); apriMenu('menu'); }
    else if (k === 'Enter') { agganciaPuntatore(); G.pausa = false; aggiornaPannello(); parla('Via.', 1); }
    return;
  }
  if (e.repeat && !c.startsWith('Arrow') && !['KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(c)) return;
  if (G.modalita === 'battaglia') {
    if (B.tutorial && tutorialTasto(c, e)) return;
    G.tasti[c] = true;
    if (B.morto && c === 'KeyM') { if (D.rete) duelloChiudi(); pulisciPartita(); apriMenu('menu'); if (document.pointerLockElement) document.exitPointerLock(); return; }
    if (B.cielo) {
      // sul bus e in caduta: Spazio salta, O dice dove sono, da 1 a 5 scelgo il luogo; il resto aspetta che tocchi terra
      if (/^Digit[1-5]$/.test(c)) { scegliLuogoInVolo(+c.slice(5)); return; }
      if (c === 'Space') { if (B.cielo === 'bus') saltaDalBus(); else cieloInfo(); }
      else if (c === 'KeyO') cieloInfo();
      else if (c === 'KeyX') G.rotta = avvolgi(G.rotta + Math.PI);
      return;
    }
    if (c === 'KeyA') return; // passo laterale
    if (c === 'KeyF') { duelloTrappola(); return; }
    if (c === 'KeyT') { costruisciScatola(); return; }
    if (c === 'KeyL') { duelloRadar(); return; }
    if (c === 'KeyB' || c === 'KeyN') { costruisciRapido(c === 'KeyB' ? 'barricata' : 'rampa'); G.prossimaTurbo = G.tempo + 0.3; return; }
    if (c === 'KeyZ') { giratiVerso(e.shiftKey); return; }
    if (c === 'KeyK') { senteCostruzioni(); return; }
    if (c === 'ControlLeft' || c === 'ControlRight' || c === 'Digit0') { ascolta(); return; }
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
    if (c === 'ControlLeft' || c === 'ControlRight' || c === 'Digit0') { ascolta(); return; }
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
    case 'Digit5': cambiaArma('piccone'); break;
    case 'Digit6': cambiaArma('mitraglietta'); break;
    case 'KeyN': costruisci('rampa'); break;
    case 'KeyJ': if (G.modalita === 'duello') vocaleMuto(); break;
    case 'KeyP': bevePozione(); break;
    case 'KeyO': battagliaZona(); break;
    case 'KeyQ': lanciaGranata(); break;
    case 'KeyZ': spintone(); break;
    case 'KeyX': G.rotta = avvolgi(G.rotta + Math.PI); suona('arma_estrai', { gain: 0.3, rate: 1.3 }); break;
    case 'KeyU': if (mixEssenziale()) { Musica.volutaNelDuello = !Musica.volutaNelDuello; parla(Musica.volutaNelDuello ? 'Musica accesa.' : 'Musica spenta.', 1); break; }
      Musica.attiva = !Musica.attiva; parla(Musica.attiva ? 'Musica accesa.' : 'Musica spenta.', 1); break;
    case 'KeyH': cura(); break;
    case 'KeyB': costruisci('barricata'); break;
    case 'KeyF': if (e.shiftKey) costruisci('filo'); else duelloTrappola(); break;
    case 'KeyT': if (e.shiftKey) costruisci('mina'); else costruisciScatola(); break;
    case 'KeyE': if (provaRianimare()) break; duelloApriCassa(); break;
    case 'KeyI': case 'Tab': inventario(); break;
    case 'KeyC': if (e.shiftKey || !inArena()) parla(descriviArma(), 1); else mira(); break;
    case 'KeyV': parla(`vita ${Math.round(G.vita)}`, 1); break;
    case 'KeyK': parla(descriviCostruzioni(), 1); break;
    case 'KeyL': duelloRadar(); break;
    case 'KeyG':
      G.graficaAccesa = !G.graficaAccesa;
      $('buio').style.display = G.graficaAccesa ? 'none' : 'block';
      parla(G.graficaAccesa ? 'Grafica accesa.' : 'Grafica spenta.', 1); break;
    case 'KeyY':
      G.ambienteAcceso = !G.ambienteAcceso;
      Audio3D.ambienteGain.gain.setTargetAtTime(G.ambienteAcceso ? 0.10 : 0, Audio3D.ctx.currentTime, 0.3);
      parla(G.ambienteAcceso ? 'Vento acceso.' : 'Vento spento.', 1); break;
    case 'Enter': case 'NumpadEnter':
      // sparare da tastiera: utile quando il trackpad, con VoiceOver, non manda i clic al gioco
      if (G.arsenale && !G.arsenale.grilletto) premiGrilletto(); break;
    default:
      if (k === '+' || k === '=' || k === '-' || k === '_') {
        G.sensibilita = lim(G.sensibilita + (k === '+' || k === '=' ? 1 : -1), 1, 12);
        parla(`Sensibilità ${G.sensibilita}.`, 1);
      }
  }
});
document.addEventListener('keyup', e => {
  delete G.tasti[e.code];
  if ((e.code === 'Enter' || e.code === 'NumpadEnter') && G.stato === 'gioco' && G.arsenale) rilasciaGrilletto();
  // su Windows, Alt rilasciato da solo sposterebbe il fuoco sul menù del browser
  if (G.stato === 'gioco' && (e.code === 'AltLeft' || e.code === 'AltRight')) e.preventDefault();
});
// Ctrl+W su Windows chiude la scheda e non si può fermare: almeno il browser chiede conferma prima di buttare via la partita
const SU_MAC = /Mac|iPhone|iPad/.test(navigator.platform || '');
window.addEventListener('beforeunload', e => { if (!SU_MAC && G.stato === 'gioco' && !G.pausa) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('blur', () => { G.tasti = {}; if (G.arsenale) G.arsenale.grilletto = false; });

// ---------------------------------------------------------------- pannello (per chi vede)
function aggiornaPannello() {
  const p = $('pannello'), m = $('messaggio'), v = $('voci');
  const inGioco = (G.stato === 'gioco' && !G.pausa && (G.modalita !== 'duello' || document.pointerLockElement === tela)) || G.stato === 'morto';
  p.style.display = inGioco ? 'none' : 'flex';
  v.innerHTML = '';
  if (G.stato === 'inizio') m.textContent = 'Clicca o premi Invio per iniziare.';
  else if (G.stato === 'caricamento') m.textContent = 'Caricamento…';
  else if (G.stato === 'testOrecchie') m.textContent = 'Test delle orecchie: frecce per rispondere (su davanti, giù dietro, sinistra, destra). Spazio ripete, Esc esce.';
  else if (G.stato === 'attesa') m.textContent = `Stanza ${D.codice}. Giocatori: ${D.giocatori.length}. ${D.ospite ? 'Invio per iniziare, ' : 'Attendi che chi ha creato la stanza dia il via. '}Spazio ripete, Esc annulla.`;
  else if (MENU[G.stato]) {
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
  const dt = Math.max(0, Math.min(0.1, (ora - ultimoFrame) / 1000)); ultimoFrame = ora; // mai un passo indietro nel tempo
  if (Audio3D.ctx && G.stato === 'gioco' && !G.pausa) {
    G.tempo += dt;
    let giro = 0;
    if (G.tasti.ArrowLeft) giro -= 1;
    if (G.tasti.ArrowRight) giro += 1;
    if (giro) ruota(giro * 120 * GRADI * dt);
    aggiornaBattaglia(dt);
    controllaTrappole(); aggiornaRadar();
    if (!B.cielo && !B.morto) { aggiornaTurbo(); aggiornaPianoMio(); aggiornaCasse(false); }
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
  aggiornaRealismo(dt, G.stato === 'gioco' && !G.pausa);
  disegna(ora, dt);
}
requestAnimationFrame(ciclo);
aggiornaPannello();

// un grido d'assalto che arriva dal punto da cui stanno per sbucare
function gridoAssalto(x, z) {
  const voci = vociSoldati(); if (!voci.length) return;
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
  const strisciando = G.modalita === 'battaglia' && B.aTerra;
  if (!(f || l) || bloccato || (G.tempo < G.occupatoFino && !strisciando)) return 0;
  let corsa = G.tasti.ShiftLeft || G.tasti.ShiftRight; const rapido = G.modalita === 'battaglia';
  if (corsa && G.mira) mira(false);
  const v = (corsa ? (rapido ? 5.4 : 3.4) : (rapido ? 3.3 : 1.7)) * (G.velocitaExtra || 1) * (G.mira ? 0.5 : 1) / Math.hypot(f, l) * dt;
  const [fx, fz] = avanti(G.rotta), [rx, rz] = destraDi(G.rotta), px = G.x, pz = G.z;
  G.x += (fx * f + rx * l) * v; G.z += (fz * f + rz * l) * v;
  if (typeof bloccoCase === 'function') bloccoCase(px, pz);
  const r = Math.hypot(G.x - cx, G.z - cz);
  if (r > limite) {
    G.x = cx + (G.x - cx) * limite / r; G.z = cz + (G.z - cz) * limite / r;
    if (G.modalita !== 'duello' && G.tempo - (G.ultimoMuro || -9) > 2) { G.ultimoMuro = G.tempo; suona('tic2', { gain: 0.6 }); parla('fine della piazza', 0); }
  }
  G.inMovimento = true;
  if (corsa) G.ultimaCorsa = G.tempo;
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
