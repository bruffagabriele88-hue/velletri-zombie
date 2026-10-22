'use strict';
// Battaglia reale in rete: da 1 a 4 persone sulla stessa isola, e i bot prendono i posti vuoti (in tutto 12).
// Si usa la stessa stanza col codice del duello. Tutti costruiscono la stessa isola dallo stesso seme;
// chi ha creato la stanza fa muovere i bot, la tempesta e le casse col paracadute, e lo racconta agli altri.
// Ognuno decide da sé dei propri colpi: chi colpisce un bot lo dice a chi comanda, chi colpisce una persona lo dice a lei.

const ARMI_IDX = ['piccone', 'pistola', 'pompa', 'mitra', 'precisione'];

// chi ha creato la stanza dà il via (anche per le partite successive): nuovo seme, stesse squadre
function reteBRRivincita() {
  if (!D.ospite) return;
  const seme = casoInt(1, 2000000000);
  D.avvio = true;
  duelloInvia({ t: 'via', lista: D.giocatori, tipo: 'battaglia', seme, sq: D.squadre });
  battagliaAvviaRete(seme);
}

async function battagliaAvviaRete(seme) {
  D.attivo = true; D.fuori = false; D.coda = [];
  await battagliaAvvia('piazza', 'normale', { rete: true, seme, squadre: D.squadre });
  vocaleAvvia();
}

function nomeGiocatore(cid) { return cid === D.cid ? 'tu' : `giocatore ${D.giocatori.indexOf(cid) + 1}`; }

// gli altri giocatori, con la loro squadra; quelli delle altre squadre li posso colpire
function preparaUmaniRemoti() {
  for (const a of D.altri.values()) { chiudiSorgente(a.sorgente); chiudiSorgente(a.sorgenteVoce); }
  D.altri.clear();
  for (const cid of D.giocatori) {
    if (cid === D.cid) continue;
    const a = nuovoRemoto(cid, nomeGiocatore(cid));
    a.team = B.squadraUmani[cid]; a.vivo = true; a.inAria = true; a.udito = false;
    const P = B.bus; a.x = a.tx = P.ax; a.z = a.tz = P.az;
    D.altri.set(cid, a);
    if (a.team !== B.mioTeam) G.nemici.push(a);
  }
}

// ---------------------------------------------------------------- ogni fotogramma
function reteBRTurno(dt) {
  aggiornaAltri(dt);
  // circa sette volte al secondo parte un pacco: il mio stato, e per chi comanda i bot e la tempesta, più tutto quello che è successo
  const ora = performance.now();
  if (ora < (B.prossimoPacco || 0)) return;
  B.prossimoPacco = ora + 150;
  duelloInvia({ t: 's', x: +G.x.toFixed(2), z: +G.z.toFixed(2), m: B.cielo || B.morto ? 0 : B.mioMov || 0, v: Math.round(G.vita), h: G.livello || 0,
    f: B.morto ? 1 : 0, q: B.cielo ? 1 : 0, a: B.aTerra ? 1 : 0, n: nascosto() ? 1 : 0, rn: 0 });
  if (D.ospite) {
    duelloInvia({ t: 'bs', b: B.bot.map(b => [Math.round(b.x * 10), Math.round(b.z * 10), b.livello || 0, (b.vivo ? 1 : 0) | (b.inAria ? 2 : 0) | ((b.mov || 0) << 2), Math.max(0, ARMI_IDX.indexOf(b.arma))]) });
    if (ora >= (B.prossimoInvioZona || 0)) {
      B.prossimoInvioZona = ora + 1000;
      const z = Z => Z ? [+Z.cx.toFixed(1), +Z.cz.toFixed(1), +Z.r.toFixed(1)] : null;
      duelloInvia({ t: 'bz', z: z(B.zona), p: z(B.prossima), f: B.fase, s: B.stadio === 'chiusura' ? 1 : 0, r: +(B.fine - G.tempo).toFixed(1) });
    }
  }
  reteSvuota();
}

// un bot visto da chi non comanda: va dove dice chi comanda, e i passi li faccio io dal suo movimento
function aggiornaBotSpecchio(b, dt) {
  if (!b.vivo) { b.morteT += dt; return; }
  if (b.tx === undefined) { b.tx = b.x; b.tz = b.z; }
  const k = Math.min(1, dt * 10);
  b.x += (b.tx - b.x) * k; b.z += (b.tz - b.z) * k;
  if (b.inAria) { b.udito = false; return; }
  if (b.eraInAria) { b.eraInAria = false; if (!B.cielo && Math.hypot(b.x - G.x, b.z - G.z) < 45) suonoBot(b, 'corpo_cade', { gain: 0.9, rate: 1.2 }); }
  b.udito = G.tempo - b.ultimoSuono < 6;
  const dIo = Math.hypot(b.x - G.x, b.z - G.z);
  if (b.mov && dIo < 50 && G.tempo >= b.prossimoPasso) {
    b.prossimoPasso = G.tempo + (b.mov === 2 ? 0.3 : 0.4) * caso(0.9, 1.12);
    const P = passoSulTerreno(b.mov === 2 ? `corsa${casoInt(1, 6)}` : `io_passo${casoInt(1, 4)}`, b.x, b.z, b.livello, { gain: 2.4, rate: caso(0.93, 1.07) });
    suonoBot(b, P.nome, P.opz);
    if (P.legno) suonoBot(b, 'legno_colpito', { gain: 0.55, rate: caso(1.5, 1.8) });
  }
  occludi(b.sorgente, !!muroTra(G.x, G.z, b.x, b.z, G.livello || 0, b.livello || 0), dt);
  posiziona(b.sorgente, b.x, ((b.livello || 0) - (G.livello || 0)) * 2.5, b.z);
}

// ---------------------------------------------------------------- messaggi
function reteBRRicevi(m, a) {
  const bot = Number.isInteger(m.i) ? B.bot[m.i] : null;
  const daCapo = m.c === D.cidOspite;
  switch (m.t) {
    case 's':
      if (!a) break;
      a.tx = m.x; a.tz = m.z; a.mov = m.m; a.vita = m.v; a.livello = m.h; a.alto = m.h > 0;
      a.inAria = !!m.q; a.aTerra = !!m.a; a.nascosto = !!m.n;
      if (m.f && a.vivo) { a.vivo = false; a.morteT = 0; if (D.ospite) controllaFine(); } // un "morto" andato perso
      break;
    case 'sparo': {
      if (!a) break;
      a.ultimoSparoT = G.tempo; a.ultimoSuono = G.tempo; a.lampo = 1;
      const nome = Audio3D.buf[m.n] ? m.n : 'sparo';
      sparoLontano(nome, a.x, a.z, a.sorgente, a.team === B.mioTeam ? 0.6 : 1);
      const d = Math.hypot(G.x - a.x, G.z - a.z), errore = avvolgi(rottaVerso(a.x, a.z, G.x, G.z) - m.r);
      if (a.team !== B.mioTeam && Math.abs(errore) < 12 * GRADI && d > 3 && !B.morto) proiettilePassa(a.x, a.z);
      if (D.ospite) allertaNemici(a.x, a.z, 70);
      break;
    }
    case 'colpo':
      if (m.a === D.cid && !B.morto && a && a.team !== B.mioTeam) { B.ultimoAggressore = a; feriscimi(m.d, true); }
      break;
    case 'suono': if (a && Audio3D.buf[m.n] && SUONI_IN_RETE.has(m.n)) { a.ultimoSuono = G.tempo; suonaBase(m.n, { dest: a.sorgente.ingresso, gain: 0.9 }); } break;
    case 'boom':
      if (D.ospite) B.granateVive.push({ x: m.x, z: m.z, boom: G.tempo + 2.9 });
      duelloRicevi(m, a);
      break;
    case 'morto':
      if (a && a.vivo) {
        a.vivo = false; a.morteT = 0; a.aTerra = false;
        suonaBase('corpo_cade', { dest: a.sorgente.ingresso, gain: 1, quando: 0.3 });
        annunciaEliminazione(a, daId(m.da));
      }
      if (D.ospite) controllaFine();
      break;
    case 'rianima': if (m.a === D.cid) rianimami(); break;
    case 'fineBR': if (daCapo) fineBR(m.sq); break;
    // --- quello che manda chi comanda
    case 'bs':
      if (!daCapo) break;
      m.b.forEach((r, i) => {
        const b = B.bot[i]; if (!b) return;
        b.tx = r[0] / 10; b.tz = r[1] / 10; b.livello = lim(Math.round(r[2]), 0, 6); b.alto = b.livello > 0;
        const f = r[3] | 0, inAria = !!(f & 2);
        if (b.inAria && !inAria) { b.x = b.tx; b.z = b.tz; b.eraInAria = true; }
        b.inAria = inAria; b.mov = (f >> 2) & 3;
        if (!(f & 1) && b.vivo) { b.vivo = false; b.morteT = 0; }
        b.arma = ARMI_IDX[r[4]] || b.arma;
      });
      break;
    case 'bz': {
      if (!daCapo) break;
      const prima = B.stadio, fasePrima = B.fase;
      B.zona = { cx: m.z[0], cz: m.z[1], r: m.z[2] };
      B.prossima = m.p ? { cx: m.p[0], cz: m.p[1], r: m.p[2] } : null;
      B.fase = m.f; B.stadio = m.s ? 'chiusura' : 'attesa'; B.fine = G.tempo + m.r;
      if (B.cielo || B.morto) break;
      if (B.stadio === 'chiusura' && prima !== 'chiusura') parla(`La tempesta avanza. ${dovePerLaZona()}`, 1);
      else if (B.stadio === 'attesa' && m.r < 21 && m.r > 0 && B.faseAnnunciata !== B.fase && (B.fase > 0 || G.tempo > B.atterratoA + 5)) {
        B.faseAnnunciata = B.fase; parla(`Tempesta tra ${Math.round(m.r)} secondi. ${dovePerLaZona()}`, 1);
      }
      if (fasePrima !== B.fase) B.faseAnnunciata = B.faseAnnunciata === fasePrima ? null : B.faseAnnunciata;
      break;
    }
    case 'bsp': {
      if (!daCapo || !bot || !bot.vivo) break;
      bot.ultimoSuono = G.tempo; bot.udito = true; bot.lampo = 1;
      const dIo = Math.hypot(bot.x - G.x, bot.z - G.z);
      if (m.a === D.cid && !B.morto) {
        sparoLontano(m.n, bot.x, bot.z, bot.sorgente, 1, G.tempo - (bot.ultimoEco || -9) > 1.5);
        bot.ultimoEco = G.tempo; stressa(0.2);
        if (G.tempo - (bot.ultimoAvviso || -99) > 10 && G.tempo - (B.ultimoAvvisoTiro || -9) > 3) {
          bot.ultimoAvviso = G.tempo; B.ultimoAvvisoTiro = G.tempo;
          parla(`${bot.nome} ti spara, ${direzioneRelativa(avvolgi(rottaVerso(G.x, G.z, bot.x, bot.z) - G.rotta))}`, 1);
        }
      } else if (dIo < 45 && G.tempo >= (B.prossimoSparoAltrui || 0)) {
        B.prossimoSparoAltrui = G.tempo + 1.5;
        sparoLontano(m.n, bot.x, bot.z, bot.sorgente, 0.3, false);
      }
      break;
    }
    case 'bc':
      // un bot ha tirato a me: colpito o mancato
      if (!daCapo || !bot || m.a !== D.cid || B.morto) break;
      if (m.w) break; // il colpo si è fermato su un muro
      if (m.d > 0) {
        if (!m.m) schioccoProiettile(bot.x, bot.z);
        pianifica(m.m ? 0.12 : Math.hypot(bot.x - G.x, bot.z - G.z) / 850, () => { if (!B.morto) { B.ultimoAggressore = bot; feriscimi(m.d, true); } });
      } else if (!m.m && Math.random() < 0.6) proiettilePassa(bot.x, bot.z);
      break;
    case 'bsu': if (daCapo && bot && (bot.vivo || m.n === 'corpo_cade')) suonoBot(bot, m.n, { gain: m.g, rate: m.r }); break;
    case 'bvo': if (daCapo && bot && bot.vivo) fraseBot(bot, m.k); break;
    case 'bg': if (daCapo && bot) sequenzaGranataBot(bot, m.x, m.z); break;
    case 'bm':
      if (!daCapo || !bot) break;
      if (bot.vivo) {
        bot.vivo = false; bot.morteT = 0; bot.vita = 0;
        if (Math.hypot(bot.x - G.x, bot.z - G.z) < 60) {
          suona(scegli(['dolore1', 'dolore2', 'dolore3']), { dest: bot.sorgente.ingresso, gain: 1.2, rate: bot.tono * 0.85 });
          suona('corpo_cade', { dest: bot.sorgente.ingresso, gain: 1, quando: 0.4 });
        }
        annunciaEliminazione(bot, daId(m.da));
      }
      if (m.k && !D.casse.some(c => c.id === m.k.id)) D.casse.push(nuovoForziere(m.k.x, m.k.z, { ...m.k }));
      break;
    // --- quello che riceve chi comanda
    case 'cb':
      if (D.ospite && bot && a && a.team !== bot.team) feritoBot(bot, m.d, a);
      break;
    case 'cassa': if (daCapo) duelloArrivaCassa(m.cassa); break;
    case 'costruzione': case 'dannoC': case 'presa': case 'rtc': case 'prov': case 'trappola':
      duelloRicevi(m, a);
      break;
  }
}
