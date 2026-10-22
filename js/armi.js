'use strict';
// Armi: pistola, fucile a pompa, mitragliatore e granate. Ogni fase meccanica ha il suo suono e la sua durata.

const ARMI = {
  pistola: {
    nome: 'pistola', tasto: '1', munizione: '9mm', capacita: 15, auto: false, cadenza: 0.13,
    pallini: 1, dispersione: 0, danno: [30, 45], dannoTesta: [70, 90], portata: 40, raggio: 'medio raggio, 40 metri', rinculo: 0.3,
    spari: ['sparo', 'sparo2', 'sparo3'], gainSparo: 0.95, tipoRicarica: 'caricatore',
    botto: [120, 55, 0.11, 0.45], schiocco: 0.5, eco: 0.5, orecchie: 0.4, meccanica: ['carrello', 0.13, 1.9],
    fasi: { sgancio: 'sgancio', caduta: 'caricatore_cade', inserimento: 'inserimento', carrello: 'carrello' },
    tempi: { caduta: 0.38, inserimento: 1.15, pronta: 1.55, carrello: 1.65, prontaVuota: 2.25 },
  },
  pompa: {
    nome: 'fucile a pompa', tasto: '2', munizione: 'cal12', capacita: 6, auto: false, cadenza: 0.72,
    pallini: 9, dispersione: 4.5 * GRADI, danno: [13, 19], dannoTesta: [28, 40], portata: 15, raggio: 'corto raggio, 15 metri', rinculo: 1.5,
    spari: ['pompa_sparo'], gainSparo: 1.0, tipoRicarica: 'cartucce',
    botto: [85, 32, 0.24, 1.0], schiocco: 0.6, eco: 0.9, orecchie: 1.0,
  },
  mitra: {
    nome: 'mitragliatore', tasto: '3', munizione: '762', capacita: 30, auto: true, cadenza: 0.1,
    pallini: 1, dispersione: 0.6 * GRADI, danno: [28, 38], dannoTesta: [85, 110], portata: 55, raggio: 'medio lungo raggio, 55 metri', rinculo: 0.9,
    spari: ['ak_sparo', 'ak_sparo2', 'ak_sparo3', 'ak_sparo4'], gainSparo: 0.9, tipoRicarica: 'caricatore',
    botto: [100, 42, 0.14, 0.65], schiocco: 0.6, eco: 0.7, orecchie: 0.6, meccanica: ['ak_otturatore', 0.10, 1.7],
    fasi: { sgancio: 'ak_sgancio', caduta: 'caricatore_cade', inserimento: 'ak_inserimento', carrello: 'ak_otturatore' },
    tempi: { caduta: 0.45, inserimento: 1.5, pronta: 1.9, carrello: 2.0, prontaVuota: 2.7 },
  },
  precisione: {
    nome: 'fucile di precisione', tasto: '4', munizione: '308', capacita: 5, auto: false, cadenza: 1.3,
    pallini: 1, dispersione: 0, danno: [85, 95], dannoTesta: [150, 150], portata: 120, raggio: 'lungo raggio, 120 metri', rinculo: 2.5,
    spari: ['ak_sparo', 'ak_sparo3'], gainSparo: 1.0, tonoSparo: 0.82, tipoRicarica: 'caricatore',
    botto: [75, 30, 0.3, 1.1], schiocco: 0.8, eco: 1.0, orecchie: 0.9, otturatoreManuale: true,
    fasi: { sgancio: 'ak_sgancio', caduta: 'caricatore_cade', inserimento: 'ak_inserimento', carrello: 'ak_otturatore' },
    tempi: { caduta: 0.5, inserimento: 1.7, pronta: 2.1, carrello: 2.2, prontaVuota: 2.9 },
  },
};
// il piccone: si parte con questo nella battaglia reale, come in Fortnite. Niente munizioni, colpi corti e veloci.
ARMI.piccone = {
  nome: 'piccone', tasto: '5', munizione: null, capacita: 0, auto: true, cadenza: 0.5, mischia: true,
  pallini: 1, dispersione: 0, danno: [20, 20], dannoTesta: [20, 20], portata: 2.6, raggio: 'corpo a corpo, 2 metri e mezzo', rinculo: 0,
  spari: [], tipoRicarica: 'nessuna',
};
// munizioni dell'arma in mano, a parole o per lo schermo; il piccone non ne ha
function testoColpi(def, st, sep = ', riserva ') { return def.mischia ? '' : `${st.caricatore + st.camera}${sep}${G.arsenale.riserva[def.munizione]}`; }

const NOMI_MUNIZIONI = { '9mm': 'nove millimetri', cal12: 'cartucce calibro 12', '762': 'sette e sessantadue' };

function nuovoArsenale(principale) {
  const armi = { pistola: { caricatore: 15, camera: 1 } };
  const riserva = { '9mm': 45, cal12: 0, '762': 0, '308': 0 };
  if (principale === 'pompa') { armi.pompa = { caricatore: 6, camera: 1 }; riserva.cal12 = 24; }
  if (principale === 'mitra') { armi.mitra = { caricatore: 30, camera: 1 }; riserva['762'] = 90; }
  if (principale === 'precisione') { armi.precisione = { caricatore: 5, camera: 1 }; riserva['308'] = 20; }
  return { armi, riserva, corrente: principale || 'pistola', grilletto: false, prossimoColpo: 0, ricarica: false, pompaDaFare: false };
}

const armaDef = () => ARMI[G.arsenale.corrente];
const armaStato = () => G.arsenale.armi[G.arsenale.corrente];
const puoAgire = () => G.stato === 'gioco' && G.tempo >= G.occupatoFino;

// ---------------------------------------------------------------- sparo
function premiGrilletto() {
  const A = G.arsenale;
  A.grilletto = true;
  if (A.ricarica && armaDef().tipoRicarica === 'cartucce') {
    // col fucile a pompa si può interrompere il caricamento per sparare
    annullaEventi('ricarica'); A.ricarica = false;
    if (A.pompaDaFare) pompa();
    return;
  }
  tentaSparo();
}
function rilasciaGrilletto() { G.arsenale.grilletto = false; }

function aggiornaArmi() {
  const A = G.arsenale;
  if (A.grilletto && armaDef().auto) tentaSparo();
}

function tentaSparo() {
  const A = G.arsenale, def = armaDef(), st = armaStato();
  if (!puoAgire() || A.ricarica || G.tempo < A.prossimoColpo) return;
  if (def.mischia) { A.prossimoColpo = G.tempo + def.cadenza; colpoDiPiccone(def); return; }
  if (!st.camera) {
    suona('grilletto_vuoto', { gain: 0.8 });
    A.prossimoColpo = G.tempo + 0.25; A.grilletto = false;
    return;
  }
  st.camera = 0;
  A.prossimoColpo = G.tempo + def.cadenza;
  if (def.tipoRicarica === 'caricatore' && st.caricatore > 0) { st.caricatore--; st.camera = 1; }
  suonoSparo(def, st);
  G.effetti.lampo = 1;
  // bossolo espulso a destra
  if (def.tipoRicarica === 'caricatore') suonaVicino('bossolo', 0.9, 0.2, -1.3, { quando: caso(0.35, 0.5), gain: 0.4, rate: caso(0.9, 1.1) });
  // rinculo orizzontale: la mira si sposta di poco, e il suono di puntamento lo segnala
  ruota((Math.random() - 0.5) * 2 * def.rinculo * GRADI * (def.auto ? 1 : 0.3));
  allertaNemici(G.x, G.z, 70);

  const colpi = [];
  for (let p = 0; p < def.pallini; p++) {
    const dir = G.rotta + (Math.random() - 0.5) * 2 * def.dispersione;
    G.colpoSuMuro = false;
    const c = tracciaColpo(G.x, G.z, dir, inArena() ? Math.max(def.portata, PORTATA_ARENA) : def.portata);
    if (c) colpi.push(c);
    // nessun avversario sulla traiettoria: forse ho colpito una costruzione
    else if (!G.colpoSuMuro && inArena() && colpoSuCostruzione(dir, def)) { /* sentito il legno */ }
    else if (Math.random() < 0.25 / def.pallini) {
      const [fx, fz] = avanti(dir), d = caso(12, 30);
      suonaInPunto('rimbalzo', G.x + fx * d, G.z + fz * d, { gain: 0.6, quando: d / 340 + 0.05, rate: caso(0.85, 1.2) });
    }
  }
  for (const c of colpi) {
    let cadutaDanno = def.pallini > 1 ? lim(1.4 - c.distanza / 22, 0.3, 1) : 1;
    // oltre la portata dell'arma il proiettile arriva, ma più debole
    if (c.distanza > def.portata) cadutaDanno *= lim(1 - (c.distanza - def.portata) / (def.portata * 2), 0.35, 1);
    const base = c.testa ? caso(...def.dannoTesta) : caso(...def.danno);
    registraDanno(c.nemico, Math.round(base * cadutaDanno * (st.rarita || 1)), c.testa, c.distanza); // le armi rare fanno più danno
  }
  if (def.pompa || def.tipoRicarica === 'cartucce') {
    A.pompaDaFare = true;
    pianifica(0.3, () => pompa(), 'pompa');
  }
}

// piccone: un fendente davanti a me. Prende l'avversario più vicino entro due metri e mezzo,
// anche un po' di lato; altrimenti picchia sul muro o sulla rampa che ho davanti.
function colpoDiPiccone(def) {
  suona('lancio', { gain: 0.7, rate: caso(1.25, 1.45) });
  G.effetti.lampo = 0.3;
  let preso = null;
  for (const n of G.nemici) {
    if (!n.vivo || n.inAria) continue;
    const d = Math.hypot(n.x - G.x, n.z - G.z);
    if (d > def.portata || Math.abs((n.livello || 0) - (G.livello || 0)) > 1) continue;
    const errore = Math.abs(avvolgi(rottaVerso(G.x, G.z, n.x, n.z) - G.rotta));
    if (errore < 40 * GRADI && (!preso || d < preso.d)) preso = { n, d };
  }
  if (preso) {
    pianifica(0.12, () => { if (preso.n.vivo) registraDanno(preso.n, caso(...def.danno), false, 0); });
    return;
  }
  if (inArena() && colpoSuCostruzione(G.rotta, def)) {
    // dal legno spaccato col piccone si recupera un po' di materiale
    G.inventario.materiali += 3;
    return;
  }
  allertaNemici(G.x, G.z, 8);
}

// pompa: otturatore indietro (bossolo fuori) e avanti (nuova cartuccia in camera)
function pompa() {
  const A = G.arsenale, st = G.arsenale.armi.pompa;
  if (!A.pompaDaFare || !st) return;
  A.pompaDaFare = false;
  A.prossimoColpo = Math.max(A.prossimoColpo, G.tempo + 0.42);
  suona('pompa_indietro', { gain: 0.9 });
  suonaVicino('bossolo', 0.9, 0.1, -1.3, { quando: 0.35, gain: 0.35, rate: 0.7 });
  pianifica(0.2, () => {
    suona('pompa_avanti', { gain: 0.9 });
    if (st.caricatore > 0) { st.caricatore--; st.camera = 1; }
  }, 'pompa');
}

// ---------------------------------------------------------------- ricarica
function ricarica() {
  const A = G.arsenale, def = armaDef(), st = armaStato();
  if (!puoAgire() || A.ricarica || def.mischia) return;
  const disponibili = G.arsenale.riserva[def.munizione];
  if (def.tipoRicarica === 'caricatore' && st.caricatore >= def.capacita) return;
  if (def.tipoRicarica === 'cartucce' && st.caricatore >= def.capacita && st.camera) return;
  if (disponibili <= 0) { parla('Niente munizioni.', 1); return; }
  A.ricarica = true;
  if (def.tipoRicarica === 'cartucce') return caricaCartuccia(0.25);

  const vuota = st.camera === 0, T = def.tempi, F = def.fasi;
  // i colpi rimasti nel caricatore sganciato tornano in riserva (lo raccolgo dopo)
  G.arsenale.riserva[def.munizione] += st.caricatore; st.caricatore = 0;
  suona(F.sgancio, { gain: 0.9 }); G.effetti.fase = 'SGANCIO';
  pianifica(T.caduta, () => suonaVicino(F.caduta, 0.25, 0.35, -1.3, { gain: 0.7 }), 'ricarica');
  pianifica(T.inserimento, () => {
    suona(F.inserimento, { gain: 0.9 }); G.effetti.fase = 'INSERIMENTO';
    const presi = Math.min(def.capacita, G.arsenale.riserva[def.munizione]);
    G.arsenale.riserva[def.munizione] -= presi;
    st.caricatore = presi;
  }, 'ricarica');
  if (vuota) {
    pianifica(T.carrello, () => { suona(F.carrello, { gain: 0.9 }); G.effetti.fase = 'CARRELLO'; }, 'ricarica');
    pianifica(T.prontaVuota, () => { if (st.caricatore > 0) { st.caricatore--; st.camera = 1; } A.ricarica = false; G.effetti.fase = ''; }, 'ricarica');
  } else {
    pianifica(T.pronta, () => { A.ricarica = false; G.effetti.fase = ''; }, 'ricarica');
  }
}

// fucile a pompa: una cartuccia alla volta nel serbatoio tubolare, interrompibile sparando
function caricaCartuccia(dopo) {
  pianifica(dopo, () => {
    const A = G.arsenale, st = A.armi.pompa, def = ARMI.pompa;
    if (!A.ricarica) return;
    if (A.riserva.cal12 <= 0 || st.caricatore >= def.capacita) {
      A.ricarica = false; G.effetti.fase = '';
      if (!st.camera) { A.pompaDaFare = true; pompa(); }
      return;
    }
    suona('cartuccia', { gain: 1.0, rate: caso(0.95, 1.05) }); G.effetti.fase = 'CARTUCCIA';
    A.riserva.cal12--; st.caricatore++;
    caricaCartuccia(0.5);
  }, 'ricarica');
}

// ---------------------------------------------------------------- cambio arma
function cambiaArma(chiave) {
  const A = G.arsenale;
  if (!puoAgire() || A.corrente === chiave) return;
  if (!A.armi[chiave]) { parla(`Non hai: ${ARMI[chiave].nome}.`, 1); return; }
  annullaEventi('ricarica'); annullaEventi('pompa');
  A.ricarica = false; A.grilletto = false; G.effetti.fase = '';
  if (A.pompaDaFare && A.corrente === 'pompa') { A.pompaDaFare = false; } // la pompa si farà dopo
  suona('arma_riponi', { gain: 0.8 });
  G.occupatoFino = G.tempo + 0.8;
  pianifica(0.4, () => {
    A.corrente = chiave;
    suona('arma_estrai', { gain: 0.8 });
    if (chiave === 'pompa' && !A.armi.pompa.camera && A.armi.pompa.caricatore > 0) { A.pompaDaFare = true; pianifica(0.35, pompa, 'pompa'); }
  });
  parla(inArena() ? `${ARMI[chiave].nome}, ${ARMI[chiave].raggio}` : ARMI[chiave].nome, 0);
}

// ---------------------------------------------------------------- granate
function lanciaGranata() {
  if (!puoAgire()) return;
  if (G.inventario.granate <= 0) { parla('Niente granate.', 1); return; }
  G.inventario.granate--;
  G.occupatoFino = G.tempo + 0.9;
  const [fx, fz] = avanti(G.rotta), d = 14;
  const gx = G.x + fx * d, gz = G.z + fz * d;
  suona('grilletto_vuoto', { gain: 0.5, rate: 0.7 }); // spoletta
  if (D.attivo) duelloInvia({ t: 'boom', x: gx, z: gz });
  pianifica(0.35, () => suona('lancio', { gain: 0.8 }));
  pianifica(1.1, () => suonaInPunto('granata_rimbalzo', gx, gz, { gain: 0.9, rate: 0.75 }));
  pianifica(1.5, () => suonaInPunto('granata_rimbalzo', gx + 0.6, gz, { gain: 0.5, rate: 0.85 }));
  for (let t = 1.6; t < 2.95; t += 0.3 - (t - 1.6) * 0.12) pianifica(t, () => suonaInPunto('bip_granata', gx, gz, { gain: 1.0, ref: 3 }));
  if (G.modalita === 'battaglia') B.granateVive.push({ x: gx, z: gz, boom: G.tempo + 3 });
  pianifica(3.0, () => esplosione(gx, gz, 7, 260));
}

function esplosione(x, z, raggio, danno) {
  suonaInPunto('esplosione', x, z, { gain: 1.6, riverbero: 1.2, ref: 4 });
  G.effetti.esplosioni.push({ x, z, t: 0 });
  allertaNemici(x, z, 90);
  for (const n of G.nemici) {
    if (!n.vivo) continue;
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < raggio) registraDanno(n, Math.round(danno * (1 - d / raggio)), false, d, true);
  }
  const dg = Math.hypot(G.x - x, G.z - z);
  if (dg < raggio) feriscimi(Math.round(90 * (1 - dg / raggio)));
  for (const c of G.costruzioni) if (Math.hypot(c.x - x, c.z - z) < raggio * 0.7) { danneggiaCostruzione(c, 80); if (D.attivo) duelloInvia({ t: 'dannoC', id: c.id, d: 80 }); }
}

// ---------------------------------------------------------------- il suono dello sparo, a strati
let ultimoSparoNome = '';
function suonoSparo(def, st) {
  // registrazione vera, mai la stessa due volte di fila
  let nome = scegli(def.spari);
  if (def.spari.length > 1) while (nome === ultimoSparoNome) nome = scegli(def.spari);
  ultimoSparoNome = nome;
  suona(nome, { gain: def.gainSparo, rate: caso(0.98, 1.02) * (def.tonoSparo || 1), riverbero: 0.8 });
  // fucile di precisione: dopo ogni colpo si manovra l'otturatore a mano
  if (def.otturatoreManuale) suona('ak_otturatore', { gain: 0.8, rate: 0.9, quando: 0.45 });
  schiocco(def.schiocco);
  bottoBasso(...def.botto);
  // la meccanica dell'arma che cicla, subito dopo il colpo
  if (def.meccanica) suona(def.meccanica[0], { gain: def.meccanica[1], rate: def.meccanica[2], quando: 0.035 });
  // gli ultimi tre colpi del caricatore hanno un "clic" metallico sempre più evidente: senti che sta finendo
  if (def.tipoRicarica === 'caricatore' && st.caricatore < 3) suona('grilletto_vuoto', { gain: 0.25 + 0.15 * (3 - st.caricatore), rate: 1.5, quando: 0.02 });
  echiStrada(nome, G.x, G.z, def.eco);
  orecchie(def.orecchie);
  if (G.modalita === 'battaglia') B.ultimoMioSparo = G.tempo;
  if (typeof duelloInvia === 'function' && D.attivo) duelloInvia({ t: 'sparo', a: G.arsenale.corrente, n: nome, r: G.rotta });
}

// Il colpo prende il primo muro o la prima rampa sulla sua traiettoria, entro la portata dell'arma.
// Si sente il legno colpito dal punto esatto, e lo schianto se il pezzo si rompe.
function colpoSuCostruzione(dir, def) {
  const [fx, fz] = avanti(dir), ex = G.x + fx * def.portata, ez = G.z + fz * def.portata;
  const mioPiano = G.livello || 0;
  let migliore = null;
  for (const c of G.costruzioni) {
    if (c.vita <= 0 || (c.tipo !== 'barricata' && c.tipo !== 'rampa' && c.tipo !== 'vetro')) continue;
    const l = c.livello || 0;
    if (c.tipo === 'barricata' ? l < mioPiano : Math.abs(l - mioPiano) > 1) continue; // da più in alto passo sopra al muro
    const u = puntoIncrocio(G.x, G.z, ex, ez, c.ax, c.az, c.bx, c.bz);
    if (u !== null && (!migliore || u < migliore.u)) migliore = { c, u };
  }
  if (!migliore) return false;
  const d = migliore.u * def.portata, x = G.x + fx * d, z = G.z + fz * d;
  const danno = def.mischia ? 50 : caso(...def.danno) * (def.pallini > 1 ? 0.6 : 1) * (armaStato().rarita || 1);
  suonaInPunto(def.mischia ? 'martello' : 'legno_colpito', x, z, { gain: 1.1, rate: caso(1.0, 1.35), quando: d / 360 });
  if (migliore.c.tipo === 'vetro') { rompiVetro(migliore.c, 'io'); return true; }
  const eraIntera = migliore.c.vita > 0;
  danneggiaCostruzione(migliore.c, danno);
  if (D.attivo) duelloInvia({ t: 'dannoC', id: migliore.c.id, d: danno });
  if (eraIntera && migliore.c.vita <= 0 && G.modalita === 'battaglia') parla(migliore.c.tipo === 'rampa' ? 'rampa distrutta' : 'muro distrutto', 0);
  return true;
}
// dove la linea p1-p2 incrocia il segmento p3-p4: frazione da 0 a 1 lungo p1-p2, oppure null
function puntoIncrocio(x1, z1, x2, z2, x3, z3, x4, z4) {
  const d = (x2 - x1) * (z4 - z3) - (z2 - z1) * (x4 - x3);
  if (Math.abs(d) < 1e-9) return null;
  const u = ((x3 - x1) * (z4 - z3) - (z3 - z1) * (x4 - x3)) / d;
  const v = ((x3 - x1) * (z2 - z1) - (z3 - z1) * (x2 - x1)) / d;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? u : null;
}
