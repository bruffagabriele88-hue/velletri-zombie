'use strict';
// Nemici: camminatori, corridori, bruti e soldati infetti che sparano. Ognuno si riconosce dal suono.
// Si muovono lungo le strade vere: sbucano dagli angoli, e dietro i palazzi si sentono ovattati.

const TIPI_NEMICO = {
  camminatore: {
    nome: 'bandito', vita: 100, velocita: [0.7, 1.0], danno: 7, cadenzaAttacco: 1.6, raggio: 0.35,
    passi: ['io_passo1', 'io_passo2', 'io_passo3', 'io_passo4'], passoOgni: [0.6, 0.75], gainPasso: 1.1, tonoVoce: [0.94, 1.06],
  },
  corridore: {
    nome: 'assalitore', vita: 60, velocita: [0.7, 0.9], velocitaCarica: 3.0, danno: 6, cadenzaAttacco: 1.1, raggio: 0.3,
    passi: ['corsa1', 'corsa2', 'corsa3', 'corsa4', 'corsa5', 'corsa6'], passoOgni: [0.55, 0.7], passoCarica: [0.3, 0.36], gainPasso: 1.0, tonoVoce: [1.04, 1.14],
  },
  bruto: {
    nome: 'gigante', vita: 400, velocita: [0.35, 0.45], danno: 22, cadenzaAttacco: 2.4, raggio: 0.6, demolitore: 3,
    passi: ['bruto_passo'], passoOgni: [1.2, 1.4], gainPasso: 1.4, tonoPasso: [0.7, 0.8], tonoVoce: [0.76, 0.84],
  },
  soldato: {
    nome: 'tiratore', vita: 110, velocita: [0.8, 1.0], danno: 8, cadenzaAttacco: 1.5, raggio: 0.35, tiratore: true,
    passi: ['io_passo1', 'io_passo2', 'io_passo3', 'io_passo4'], passoOgni: [0.55, 0.65], gainPasso: 1.1, tonoPasso: [1.05, 1.15], tonoVoce: [0.9, 1.0],
  },
};

let ultimaVoceNemico = 0;

function creaNemico(tipo, x, z, nodo = null, cacciatore = true) {
  const def = TIPI_NEMICO[tipo];
  const n = {
    tipo, def, x, z, nodo, vita: def.vita, vivo: true, udito: false, allertato: cacciatore, carica: false,
    velocita: caso(...def.velocita), tono: caso(...def.tonoVoce), voce: scegli(Object.keys(Audio3D.voci || {})), occluso: false, occlusione: 0,
    sorgente: creaSorgente({ ref: tipo === 'bruto' ? 2.2 : 1.5 }),
    prossimoPasso: G.tempo + caso(0.2, 1.0), prossimoVerso: G.tempo + caso(0.1, 2.5), prossimoAttacco: 0,
    prossimoSparo: G.tempo + caso(5, 8), lato: Math.random() < 0.5 ? -1 : 1,
    stordito: 0, fase: Math.random() * 10, morteT: 0, nelFilo: null, spinta: null,
    ondeggia: Math.random() * 10,
  };
  posiziona(n.sorgente, x, 0, z, true);
  G.nemici.push(n);
  return n;
}

// Crea un nemico su un nodo della rete stradale
function creaNemicoSuNodo(tipo, nodo, cacciatore = true) {
  const N = G.mappa.nodi[nodo];
  return creaNemico(tipo, N.x + caso(-1.5, 1.5), N.z + caso(-1.5, 1.5), nodo, cacciatore);
}

function suonoNemico(n, nome, opz = {}) {
  n.udito = true; // da questo istante il nemico è percepibile, quindi anche visibile
  return suona(nome, { dest: n.sorgente.ingresso, ...opz });
}

// Il nemico dice una frase, dal punto in cui si trova. categoria: minaccia, attacco, colpito, carica, spara, assalto
function fraseNemico(n, categoria, opz = {}) {
  const frasi = (Audio3D.voci[n.voce] || {})[categoria];
  if (!frasi || !frasi.length) return;
  let nome = scegli(frasi);
  if (frasi.length > 1) while (nome === n.ultimaFrase) nome = scegli(frasi);
  n.ultimaFrase = nome;
  suonoNemico(n, nome, { gain: 1.5, rate: n.tono * caso(0.98, 1.02), ...opz });
  ultimaVoceNemico = G.tempo;
}
function versoNemico(n) { fraseNemico(n, 'minaccia'); }

function allertaNemici(x, z, r) {
  for (const n of G.nemici) if (n.vivo && Math.hypot(n.x - x, n.z - z) < r) n.allertato = true;
}

// ---------------------------------------------------------------- percorsi lungo le strade
// Un solo calcolo dei percorsi dalla mia posizione verso tutta la rete vicina, ripetuto due volte al secondo:
// ogni nemico segue il nodo "precedente" e così si avvicina a me camminando per le vie.
function aggiornaCampo() {
  const M = G.mappa; if (!M || inArena()) return;
  if (G.tempo < (G.prossimoCampo || 0) && G.campo) return;
  G.prossimoCampo = G.tempo + 0.5;
  let sorgenti;
  if (G.modalita === 'assedio') sorgenti = [{ nodo: G.nodoPiazza, d: 0 }];
  else if (G.pos.nodo != null) sorgenti = [{ nodo: G.pos.nodo, d: 0 }];
  else sorgenti = [{ nodo: G.pos.da, d: G.pos.t }, { nodo: G.pos.a, d: M.archi[G.pos.e].len - G.pos.t }];
  G.campo = campoDistanze(M, sorgenti, 220, G.campo);
}

// nodi da cui far partire i nemici: raggiungibili a piedi tra min e max metri da me
function nodiDiPartenza(min, max) {
  aggiornaCampo();
  const C = G.campo, M = G.mappa, lista = [];
  for (let i = 0; i < M.nodi.length; i++) {
    const d = C.dist[i];
    if (d >= min && d <= max && Math.hypot(M.nodi[i].x - G.x, M.nodi[i].z - G.z) > min * 0.6) lista.push(i);
  }
  return lista;
}

// nome della via da cui arriva chi parte da questo nodo (evito il nome del posto in cui mi trovo)
function nomeViaDelNodo(nodo) {
  const qui = G.modalita === 'assedio' ? G.citta.piazza : G.pos && G.pos.nome;
  const archi = G.mappa.nodi[nodo].adj.map(o => G.mappa.archi[o.e]);
  const a = archi.find(x => x.conNome && x.nome !== qui) || archi.find(x => x.conNome) || archi[0];
  return a ? a.nome : 'una strada';
}

// direzione di marcia verso di me lungo le strade; vicino a me vado dritto
function direzioneDiMarcia(n, d) {
  const C = G.campo, M = G.mappa;
  n.occluso = false;
  if (!C || n.nodo == null || d < 8 || !isFinite(C.dist[n.nodo])) return [(G.x - n.x) / d, (G.z - n.z) / d];
  let N = M.nodi[n.nodo];
  if (Math.hypot(N.x - n.x, N.z - n.z) < 0.8) {
    const prossimo = C.prec[n.nodo];
    if (prossimo < 0) { n.nodo = null; return [(G.x - n.x) / d, (G.z - n.z) / d]; }
    n.nodo = prossimo; N = M.nodi[prossimo];
  }
  // se il percorso a piedi è molto più lungo della linea d'aria, tra noi ci sono dei palazzi
  const aPiedi = C.dist[n.nodo] + Math.hypot(N.x - n.x, N.z - n.z);
  n.occluso = aPiedi > d * 1.5 + 8;
  const l = Math.hypot(N.x - n.x, N.z - n.z) || 1;
  return [(N.x - n.x) / l, (N.z - n.z) / l];
}

// in esplorazione, finché non mi nota, il nemico vaga da un incrocio all'altro
function direzioneVagando(n) {
  const M = G.mappa;
  if (n.nodo == null) return [0, 0];
  let N = M.nodi[n.nodo];
  if (Math.hypot(N.x - n.x, N.z - n.z) < 0.8) { n.nodo = scegli(N.adj).v; N = M.nodi[n.nodo]; }
  const l = Math.hypot(N.x - n.x, N.z - n.z) || 1;
  return [(N.x - n.x) / l, (N.z - n.z) / l];
}

// La prima costruzione intatta che taglia il tragitto del nemico verso di me
function costruzioneSullaStrada(n, nx, nz) {
  for (const c of G.costruzioni) {
    if (c.tipo !== 'barricata' || c.vita <= 0) continue;
    if (segmentiIncrociati(n.x, n.z, G.x, G.z, c.ax, c.az, c.bx, c.bz)) {
      const s = distSegmento(nx, nz, c.ax, c.az, c.bx, c.bz);
      if (s.d < 0.7) return c;
    }
  }
  return null;
}

function aggiornaNemici(dt) {
  aggiornaCampo();
  for (const n of G.nemici) {
    if (!n.vivo) { n.morteT += dt; continue; }
    if (n.remoto || n.bot) continue; // avversari in rete e combattenti della battaglia reale si muovono altrove
    const def = n.def;
    const d = Math.hypot(G.x - n.x, G.z - n.z);
    n.fase += dt;
    if (n.stordito > 0) n.stordito -= dt;

    // scoperta: in esplorazione i nemici vagano finché non mi vedono o mi sentono
    if (!n.allertato && ((d < 14 && !n.occluso) || d < 6)) {
      n.allertato = true;
      versoNemico(n); n.prossimoVerso = G.tempo + caso(3, 5);
    }
    // corridore: quando mi ha notato ed è abbastanza vicino, urla e carica
    if (def.velocitaCarica && !n.carica && n.allertato && d < 25 && !n.occluso) {
      n.carica = true;
      fraseNemico(n, 'carica');
      n.prossimoVerso = G.tempo + caso(3, 5);
    }
    let v = n.carica ? def.velocitaCarica : n.velocita;
    if (!n.allertato) v *= 0.6;

    // filo spinato: rallenta e ferisce
    let nelFilo = null;
    for (const c of G.costruzioni) {
      if (c.tipo !== 'filo' || c.vita <= 0) continue;
      if (distSegmento(n.x, n.z, c.ax, c.az, c.bx, c.bz).d < 0.7) { nelFilo = c; break; }
    }
    if (nelFilo) {
      v *= 0.3;
      if (n.nelFilo !== nelFilo) suonaInPunto('filo_spinato', n.x, n.z, { gain: 0.9, rate: caso(1.3, 1.6) });
      n.vita -= 8 * dt; nelFilo.vita -= 2 * dt;
      if (n.vita <= 0) { uccidiNemico(n, false); continue; }
    }
    n.nelFilo = nelFilo;

    // mine
    for (const c of G.costruzioni) {
      if (c.tipo === 'mina' && c.vita > 0 && Math.hypot(n.x - c.x, n.z - c.z) < 1.4) {
        c.vita = 0; esplosione(c.x, c.z, 5, 220);
      }
    }
    if (!n.vivo) continue;

    // spinta ricevuta (colpi e spintoni): arretra in pochi decimi di secondo
    if (n.spinta) {
      const k = Math.min(1, dt * 8);
      n.x += n.spinta[0] * k; n.z += n.spinta[1] * k;
      n.spinta[0] *= 1 - k; n.spinta[1] *= 1 - k;
      if (Math.hypot(...n.spinta) < 0.02) n.spinta = null;
    }

    // movimento
    let fermo = n.stordito > 0 || d <= 1.05;
    let [dirx, dirz] = n.allertato ? direzioneDiMarcia(n, d) : direzioneVagando(n);
    if (!n.allertato) n.occluso = Math.hypot(G.x - n.x, G.z - n.z) > 8 && G.campo && n.nodo != null &&
      (G.campo.dist[n.nodo] > d * 1.5 + 8);
    if (def.tiratore && !n.occluso && d < 20 && d > 7) {
      // il soldato si tiene a distanza e si sposta di lato
      dirx = -(G.z - n.z) / d * n.lato * 0.8 + (G.x - n.x) / d * (d > 14 ? 0.4 : -0.2);
      dirz = (G.x - n.x) / d * n.lato * 0.8 + (G.z - n.z) / d * (d > 14 ? 0.4 : -0.2);
      if (Math.random() < dt * 0.15) n.lato *= -1;
      v = n.velocita * 0.6;
    }
    // andatura barcollante: piccolo ondeggiamento laterale
    if (!n.carica) {
      const o = Math.sin(n.fase * 1.3 + n.ondeggia) * 0.25;
      const ox = -dirz * o, oz = dirx * o;
      dirx += ox; dirz += oz;
    }
    let bersaglio = null;
    if (!fermo) {
      const nx = n.x + dirx * v * dt, nz = n.z + dirz * v * dt;
      bersaglio = costruzioneSullaStrada(n, nx, nz);
      if (bersaglio) fermo = true;
      else { n.x = nx; n.z = nz; }
    }
    // separazione tra nemici
    for (const m of G.nemici) {
      if (m === n || !m.vivo) continue;
      const sx = n.x - m.x, sz = n.z - m.z, sd = Math.hypot(sx, sz);
      if (sd > 0 && sd < 0.8) { n.x += sx / sd * (0.8 - sd) * 0.5; n.z += sz / sd * (0.8 - sd) * 0.5; }
    }

    // passi
    if (!fermo && G.tempo >= n.prossimoPasso) {
      suonoNemico(n, scegli(def.passi), { gain: def.gainPasso, rate: def.tonoPasso ? caso(...def.tonoPasso) : caso(0.88, 1.02) });
      n.prossimoPasso = G.tempo + caso(...(n.carica ? def.passoCarica : def.passoOgni)) * (nelFilo ? 2 : 1) * (n.allertato ? 1 : 1.4);
    }
    // versi (limitati, perché troppe voci insieme coprirebbero i passi)
    if (G.tempo >= n.prossimoVerso) {
      if (G.tempo - ultimaVoceNemico > 1.6) { // mai due che parlano insieme: si coprirebbero
        versoNemico(n);
        n.prossimoVerso = G.tempo + (d < 5 ? caso(3, 5) : caso(6, 11));
      } else n.prossimoVerso = G.tempo + caso(0.3, 1.0);
    }

    // attacco alla barricata
    if (bersaglio && G.tempo >= n.prossimoAttacco) {
      suonaInPunto('legno_colpito', bersaglio.x, bersaglio.z, { gain: 1.0, rate: caso(0.85, 1.1) });
      danneggiaCostruzione(bersaglio, (def.demolitore || 1) * caso(5, 8));
      n.prossimoAttacco = G.tempo + def.cadenzaAttacco;
      n.udito = true;
    }
    // attacco a me: prima il verso di avvertimento, poi il morso
    if (d <= 1.1 && n.stordito <= 0 && G.tempo >= n.prossimoAttacco) {
      if (G.alto && G.rampaSotto) {
        // sono in alto: non mi arrivano, se la prendono con la rampa
        suonaInPunto('legno_colpito', G.rampaSotto.x, G.rampaSotto.z, { gain: 1.0, rate: caso(0.85, 1.1) });
        danneggiaCostruzione(G.rampaSotto, (def.demolitore || 1) * caso(8, 12));
        n.udito = true;
      } else {
        if (Math.random() < 0.6) fraseNemico(n, 'attacco'); else n.udito = true;
        suona('lancio', { dest: n.sorgente.ingresso, gain: 0.9, rate: 0.9, quando: 0.15 });
        suona('colpo_corpo', { gain: 0.8, rate: 0.8, quando: 0.35 });
        pianifica(0.4, () => { if (n.vivo && n.stordito <= 0 && !G.alto && Math.hypot(G.x - n.x, G.z - n.z) < 1.4) feriscimi(def.danno); });
      }
      n.prossimoAttacco = G.tempo + def.cadenzaAttacco;
    }
    // il soldato infetto spara raffiche solo se mi vede
    if (def.tiratore && !n.occluso && n.allertato && d < 32 && G.tempo >= n.prossimoSparo && n.stordito <= 0) {
      rafficaNemico(n, d);
      n.prossimoSparo = G.tempo + caso(5, 8);
    }
    posiziona(n.sorgente, n.x, 0, n.z);
    // dietro i palazzi il suono arriva ovattato
    n.occlusione += ((n.occluso ? 1 : 0) - n.occlusione) * Math.min(1, dt * 3);
    if (n.occlusione > 0.05) n.sorgente.aria.frequency.setTargetAtTime(20000 * Math.exp(-d / 30) * (1 - 0.88 * n.occlusione), Audio3D.ctx.currentTime, 0.1);
  }
  // rimuovo i corpi dopo un po'
  G.nemici = G.nemici.filter(n => n.vivo || n.remoto || n.morteT < 4);
}

function rafficaNemico(n, d) {
  const colpi = casoInt(2, 3);
  if (Math.random() < 0.4) fraseNemico(n, 'spara');
  // un mio muro tra me e lui ferma i proiettili (non se sono in alto su una rampa)
  const muro = G.alto ? null : G.costruzioni.find(c => c.tipo === 'barricata' && c.vita > 0 && segmentiIncrociati(n.x, n.z, G.x, G.z, c.ax, c.az, c.bx, c.bz));
  for (let i = 0; i < colpi; i++) {
    pianifica(i * 0.14, () => {
      if (!n.vivo) return;
      n.udito = true; sparoLontano('nemico_sparo', n.x, n.z, n.sorgente, 0.95);
      n.lampo = 1;
      const ritardo = Math.hypot(n.x - G.x, n.z - G.z) / 700;
      const probabilita = lim(0.3 - d / 90, 0.05, 0.25) * (G.inMovimento ? 0.5 : 1);
      if (muro && muro.vita > 0) { suonaInPunto('legno_colpito', muro.x, muro.z, { gain: 1.0, rate: caso(1.0, 1.3), quando: ritardo }); danneggiaCostruzione(muro, 6); return; }
      if (Math.random() < probabilita) pianifica(ritardo, () => feriscimi(5, true));
      else {
        // il proiettile mi sfiora: sibilo accanto alla testa, poi un rimbalzo alle spalle
        const lato = Math.random() < 0.5 ? -1 : 1;
        suonaVicino('sibilo', lato * caso(0.6, 1.6), caso(-0.5, 0.5), 0.2, { gain: 1.0, quando: ritardo, rate: caso(0.9, 1.15) });
        if (Math.random() < 0.4) suonaVicino('rimbalzo', lato * caso(1, 4), -caso(3, 8), -1, { gain: 0.6, quando: ritardo + 0.05 });
      }
    });
  }
}

// ---------------------------------------------------------------- colpire i nemici
const PORTATA_ARENA = 160; // oltre la portata dell'arma il colpo arriva lo stesso, ma fa meno danno
function conoColpo(n, d) {
  // nella battaglia reale la mira assistita allarga il bersaglio, a seconda della difficoltà
  const aiuto = G.modalita === 'battaglia' && typeof B !== 'undefined' && B.diff ? B.diff.cono : 1;
  // da lontano il bersaglio è un po' più largo: col solo orecchio si riesce a colpire anche a 50 metri
  const minimo = (2.5 + (inArena() ? Math.min(2, d / 30) : 0)) * GRADI;
  return Math.max(minimo, Math.atan(n.def.raggio / Math.max(d, 0.5))) * aiuto;
}

function tracciaColpo(x, z, dir, portata) {
  let migliore = null;
  for (const n of G.nemici) {
    if (!n.vivo || n.occluso) continue; // non si spara attraverso i palazzi
    const d = Math.hypot(n.x - x, n.z - z);
    if (d > portata) continue;
    const errore = Math.abs(avvolgi(rottaVerso(x, z, n.x, n.z) - dir)), cono = conoColpo(n, d);
    if (errore > cono) continue;
    // chi spara dall'alto verso chi è a terra colpisce la testa più facilmente
    const quotaTesta = (G.livello || (G.alto ? 1 : 0)) > (n.livello || (n.alto ? 1 : 0)) ? 0.55 : 0.35;
    if (!migliore || d < migliore.distanza) migliore = { nemico: n, distanza: d, testa: errore <= cono * quotaTesta };
  }
  // nel duello le barricate fermano i proiettili: fanno da riparo, come si costruisce un muro per coprirsi
  if (migliore && G.modalita === 'battaglia') {
    // il vetro sulla traiettoria va in pezzi, e il colpo prosegue
    for (const c of G.costruzioni) if (c.tipo === 'vetro' && c.vita > 0 && segmentiIncrociati(x, z, migliore.nemico.x, migliore.nemico.z, c.ax, c.az, c.bx, c.bz)) rompiVetro(c, 'io');
  }
  if (migliore && inArena()) {
    const n = migliore.nemico;
    // un muro ferma il colpo solo se né io né il bersaglio stiamo più in alto del muro
    const mioPiano = G.livello || (G.alto ? 1 : 0), suoPiano = n.livello || (n.alto ? 1 : 0);
    for (const c of G.costruzioni) {
      if (c.tipo !== 'barricata' || c.vita <= 0) continue;
      if ((c.livello || 0) < Math.max(mioPiano, suoPiano)) continue;
      if (segmentiIncrociati(x, z, n.x, n.z, c.ax, c.az, c.bx, c.bz)) {
        suonaInPunto('legno_colpito', c.x, c.z, { gain: 1.0, rate: caso(0.9, 1.2), quando: Math.hypot(c.x - x, c.z - z) / 360 });
        danneggiaCostruzione(c, 14);
        duelloInvia({ t: 'dannoC', id: c.id, d: 14 });
        G.colpoSuMuro = true;
        return null;
      }
    }
  }
  return migliore;
}

// Bersaglio del suono di puntamento: quello sotto il mirino, altrimenti il più vicino alla mira,
// altrimenti il più vicino in assoluto (la minaccia maggiore). Chi è dietro un palazzo non conta.
function bersaglioPuntamento() {
  let centrato = null, angolare = null, vicino = null;
  for (const n of G.nemici) {
    if (!n.vivo || !n.udito || n.occluso) continue;
    const d = Math.hypot(n.x - G.x, n.z - G.z);
    // nelle arene il suono di puntamento segue chiunque si senta, anche lontanissimo
    if (d > (inArena() ? PORTATA_ARENA : 45)) continue;
    const errore = Math.abs(avvolgi(rottaVerso(G.x, G.z, n.x, n.z) - G.rotta));
    const b = { errore, distanza: d, centrato: errore <= conoColpo(n, d), dislivello: (n.livello || 0) - (G.livello || 0) };
    if (b.centrato && (!centrato || d < centrato.distanza)) centrato = b;
    if (errore < 45 * GRADI && (!angolare || errore < angolare.errore)) angolare = b;
    if (!vicino || d < vicino.distanza) vicino = b;
  }
  return centrato || angolare || vicino;
}

const Resoconto = { danno: 0, testa: false, colpi: 0, uccisi: 0, esplosivo: false, serie: 0 };

function registraDanno(n, danno, testa, dist, esplosivo = false) {
  if (!n.vivo) return;
  n.allertato = true;
  const ritardo = esplosivo ? 0 : dist / 360; // tempo di volo del proiettile
  if (!esplosivo) suona(testa ? 'colpo_testa' : 'colpo_corpo', { dest: n.sorgente.ingresso, gain: 1.1, quando: ritardo });
  if (n.bot) { battagliaColpito(n, danno, testa, ritardo, esplosivo); return; }
  if (n.remoto) {
    // avversario vero: comunico il colpo, la sua vita la gestisce il suo computer
    duelloColpito(n, danno, testa);
    // conferma del colpo e sangue, come nella battaglia reale
    suona(testa ? 'testa_marker' : 'colpito_marker', { gain: 0.7 });
    if (typeof mostraNumero3D === 'function') { mostraNumero3D(n.x, n.z, n.livello || 0, String(danno), testa); sangue3D(n.x, n.z, n.livello || 0, testa, danno); }
    Resoconto.danno += danno; Resoconto.colpi++; Resoconto.testa ||= testa; Resoconto.esplosivo ||= esplosivo;
    annullaEventi('resoconto');
    pianifica(ARMI[G.arsenale.corrente].auto && !esplosivo ? 0.35 : 0.05, annunciaResoconto, 'resoconto');
    return;
  }
  // colpo alla testa: uno zombie comune cade subito, il bruto no
  if (testa && !esplosivo && n.tipo !== 'bruto' && dist < 40) danno = Math.max(danno, Math.ceil(n.vita));
  n.vita -= danno;
  Resoconto.danno += danno; Resoconto.colpi++; Resoconto.testa ||= testa; Resoconto.esplosivo ||= esplosivo;
  if (n.vita <= 0) { uccidiNemico(n, true, ritardo, testa); Resoconto.uccisi++; }
  else {
    // il colpo lo fa arretrare e barcollare
    const forza = n.tipo === 'bruto' ? 0.1 : Math.min(1.2, danno / 40);
    const dx = n.x - G.x, dz = n.z - G.z, l = Math.hypot(dx, dz) || 1;
    n.spinta = [(n.spinta?.[0] || 0) + dx / l * forza, (n.spinta?.[1] || 0) + dz / l * forza];
    n.stordito = Math.max(n.stordito, n.tipo === 'bruto' ? 0.15 : 0.5);
    if (n.carica && Math.random() < 0.5) n.stordito = 1.0;
    // gemito di dolore, e a volte un'imprecazione
    suonoNemico(n, scegli(['dolore1', 'dolore2', 'dolore3']), { gain: 1.0, rate: n.tono, quando: ritardo + 0.05 });
    if (Math.random() < 0.35) fraseNemico(n, 'colpito', { quando: ritardo + 0.5 });
  }
  annullaEventi('resoconto');
  pianifica(ARMI[G.arsenale.corrente].auto && !esplosivo ? 0.35 : 0.05, annunciaResoconto, 'resoconto');
}

function annunciaResoconto() {
  const R = Resoconto;
  if (!R.colpi) return;
  let f;
  if (R.esplosivo) f = `esplosione ${R.danno}`;
  else if (R.colpi > 1 && ARMI[G.arsenale.corrente].auto) f = `${R.testa ? 'testa, ' : ''}raffica ${R.danno}`;
  else f = `${R.testa ? 'testa' : 'corpo'} ${R.danno}`;
  if (R.uccisi === 1) f += ', abbattuto';
  else if (R.uccisi > 1) f += `, abbattuti ${R.uccisi}`;
  if (R.serie === 2) f += ', doppia!';
  else if (R.serie === 3) f += ', tripla!';
  else if (R.serie >= 4) f += `, serie ${R.serie}!`;
  parla(f, 0);
  Object.assign(R, { danno: 0, testa: false, colpi: 0, uccisi: 0, esplosivo: false, serie: 0 });
}

function uccidiNemico(n, dalGiocatore, ritardo = 0, testa = false) {
  n.vivo = false; n.morteT = 0;
  const serie = premiaUccisione(n, testa);
  if (dalGiocatore) Resoconto.serie = Math.max(Resoconto.serie, serie);
  if (!n.remoto) suona(scegli(['dolore1', 'dolore2', 'dolore3']), { dest: n.sorgente.ingresso, gain: 1.2, rate: n.tono * 0.85, quando: ritardo + 0.05 });
  suona('corpo_cade', { dest: n.sorgente.ingresso, gain: n.tipo === 'bruto' ? 1.4 : 1, rate: n.tipo === 'bruto' ? 0.7 : 1, quando: ritardo + 0.45 });
  chiudiSorgente(n.sorgente, 4);
  if (!dalGiocatore) parla('abbattuto', 0);
  G.uccisi++;
  if (G.modalita === 'assedio') G.ondata.rimasti--;
}

// ---------------------------------------------------------------- spintone (tasto Z)
// Allontana lo zombie più vicino entro un metro e mezzo e lo fa barcollare
function spintone() {
  if (!puoAgire()) return;
  if (G.tempo < (G.prossimaSpinta || 0)) return;
  G.prossimaSpinta = G.tempo + 1.2;
  let vicino = null;
  for (const n of G.nemici) {
    if (!n.vivo) continue;
    const d = Math.hypot(n.x - G.x, n.z - G.z);
    if (d < 1.7 && (!vicino || d < vicino.d)) vicino = { n, d };
  }
  suona('lancio', { gain: 0.5, rate: 0.8 });
  if (!vicino) return;
  const n = vicino.n, dx = n.x - G.x, dz = n.z - G.z, l = Math.hypot(dx, dz) || 1;
  const forza = n.tipo === 'bruto' ? 0.3 : 2.0;
  n.spinta = [dx / l * forza, dz / l * forza];
  n.stordito = Math.max(n.stordito, n.tipo === 'bruto' ? 0.4 : 1.6);
  n.prossimoAttacco = G.tempo + 1.5;
  suona('colpo_corpo', { dest: n.sorgente.ingresso, gain: 1, rate: 0.7, quando: 0.08 });
  suona('dolore3', { gain: 0.35, rate: 1.1 }); // il mio sforzo
}
