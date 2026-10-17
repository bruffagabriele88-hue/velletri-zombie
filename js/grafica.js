'use strict';
// Grafica notturna. Regola: a schermo compare solo ciò che l'audio già comunica, né più né meno.
// Un nemico appare solo dopo che il suo primo suono è partito; le scritte sono i sottotitoli della voce.

const tela = $('scena'), g = tela.getContext('2d');
const CAMPO = 90 * GRADI;

const panorama = (() => {
  let seme = 7; const rnd = () => (seme = (seme * 16807) % 2147483647) / 2147483647;
  const N = 720, colli = [], tetti = [];
  for (let i = 0; i < N; i++) {
    const a = i / N * PI2;
    colli.push(0.10 + 0.05 * Math.sin(a * 2 + 1) + 0.03 * Math.sin(a * 5 + 2) + 0.015 * Math.sin(a * 13));
  }
  let i = 0;
  while (i < N) { const w = 4 + Math.floor(rnd() * 12), h = 0.03 + rnd() * 0.07; for (let j = 0; j < w && i < N; j++, i++) tetti.push(h); }
  const finestre = [], stelle = [];
  for (let k = 0; k < 90; k++) finestre.push({ a: rnd() * PI2, h: rnd(), c: rnd() < 0.7 ? '#ffcf7a' : '#9fc2ff' });
  for (let k = 0; k < 260; k++) stelle.push({ a: rnd() * PI2, y: rnd() * 0.5, r: rnd() * 1.3 + 0.2, f: rnd() * 6 });
  const facciate = [];
  for (let k = 0; k < 64; k++) facciate.push({ h: 0.55 + rnd() * 0.5, luci: Array.from({ length: 6 }, () => rnd() < 0.18) });
  return { N, colli, tetti, finestre, stelle, facciate, torre: 0.35, luna: 2.4 };
})();

function ridimensiona() { const d = window.devicePixelRatio || 1; tela.width = innerWidth * d; tela.height = innerHeight * d; }
addEventListener('resize', ridimensiona); ridimensiona();

function xDaAngolo(rel, W) {
  const m = CAMPO / 2;
  if (Math.abs(rel) > m + 0.3) return null;
  return W / 2 + Math.tan(rel) / Math.tan(m) * W / 2;
}
// punto del mondo -> schermo: {x, prof (profondità), rel}
function proietta(x, z, W) {
  const rel = avvolgi(rottaVerso(G.x, G.z, x, z) - G.rotta), d = Math.hypot(x - G.x, z - G.z);
  const prof = d * Math.cos(rel);
  if (prof < 0.3) return null;
  const sx = xDaAngolo(rel, W); if (sx === null) return null;
  return { x: sx, prof, rel, d };
}

function disegna(ora, dt) {
  if (!G.graficaAccesa) return;
  const W = tela.width, H = tela.height, oriz = H * 0.58;
  // Battaglia reale: scena 3D sotto, e qui sopra solo mirino, barre e sottotitoli
  if (G.modalita === 'battaglia' && (G.stato === 'gioco' || G.stato === 'morto') && typeof disegna3D === 'function' && disegna3D(ora, dt)) {
    g.clearRect(0, 0, W, H);
    hudBattaglia(W, H, ora);
    interfaccia(W, H, H * 0.56, ora, dt);
    return;
  }
  if (typeof nascondi3D === 'function') nascondi3D();
  const rotta = G.stato === 'gioco' || G.stato === 'morto' ? G.rotta : ora / 30000;
  cielo(W, H, oriz, rotta, ora);
  if (G.stato === 'gioco' || G.stato === 'morto') {
    if (G.modalita === 'esplorazione' && G.pos) strada(W, H, oriz);
    else skyline(W, H, oriz, rotta);
    suolo(W, H, oriz);
    entita(W, H, oriz, ora, dt);
    interfaccia(W, H, oriz, ora, dt);
  } else { skyline(W, H, oriz, rotta); suolo(W, H, oriz); }
}

function cielo(W, H, oriz, rotta, ora) {
  const c = g.createLinearGradient(0, 0, 0, oriz);
  c.addColorStop(0, '#02030a'); c.addColorStop(0.6, '#0a1230'); c.addColorStop(1, '#1b2446');
  g.fillStyle = c; g.fillRect(0, 0, W, oriz);
  for (const s of panorama.stelle) {
    const x = xDaAngolo(avvolgi(s.a - rotta), W); if (x === null) continue;
    g.globalAlpha = 0.5 + 0.5 * Math.sin(ora / 700 + s.f);
    g.fillStyle = '#dfe6ff'; g.fillRect(x, s.y * oriz, s.r * W / 1400, s.r * W / 1400);
  }
  g.globalAlpha = 1;
  const xl = xDaAngolo(avvolgi(panorama.luna - rotta), W);
  if (xl !== null) {
    const r = H * 0.045, yl = oriz * 0.25;
    const alone = g.createRadialGradient(xl, yl, r, xl, yl, r * 6);
    alone.addColorStop(0, 'rgba(200,215,255,0.25)'); alone.addColorStop(1, 'rgba(200,215,255,0)');
    g.fillStyle = alone; g.fillRect(xl - r * 6, yl - r * 6, r * 12, r * 12);
    g.fillStyle = '#e9edf7'; g.beginPath(); g.arc(xl, yl, r, 0, 7); g.fill();
    g.fillStyle = 'rgba(160,170,195,0.35)'; g.beginPath(); g.arc(xl - r * 0.3, yl - r * 0.2, r * 0.22, 0, 7); g.fill();
  }
  strato(W, H, oriz, rotta, panorama.colli, '#0d1330');
}

function strato(W, H, oriz, rotta, valori, colore) {
  const passi = 240;
  g.fillStyle = colore; g.beginPath(); g.moveTo(0, oriz);
  for (let i = 0; i <= passi; i++) {
    const x = i / passi * W;
    const rel = Math.atan((x - W / 2) / (W / 2) * Math.tan(CAMPO / 2));
    let a = (rotta + rel) % PI2; if (a < 0) a += PI2;
    g.lineTo(x, oriz - valori[Math.floor(a / PI2 * panorama.N) % panorama.N] * H);
  }
  g.lineTo(W, oriz); g.closePath(); g.fill();
}

function skyline(W, H, oriz, rotta) {
  strato(W, H, oriz, rotta, panorama.tetti, '#070a18');
  const xt = xDaAngolo(avvolgi(panorama.torre - rotta), W);
  if (xt !== null) {
    const tw = W * 0.018, th = H * 0.24;
    g.fillStyle = '#070a18';
    g.fillRect(xt - tw / 2, oriz - th, tw, th);
    g.beginPath(); g.moveTo(xt - tw * 0.7, oriz - th); g.lineTo(xt, oriz - th - tw * 2.2); g.lineTo(xt + tw * 0.7, oriz - th); g.fill();
    g.fillStyle = 'rgba(255,207,122,0.55)'; g.fillRect(xt - tw * 0.18, oriz - th * 0.82, tw * 0.36, tw * 0.5);
  }
  for (const f of panorama.finestre) {
    const x = xDaAngolo(avvolgi(f.a - rotta), W); if (x === null) continue;
    g.fillStyle = f.c; g.globalAlpha = 0.55;
    g.fillRect(x, oriz - (0.01 + f.h * 0.03) * H, W * 0.003, H * 0.006);
  }
  g.globalAlpha = 1;
}

// Esplorazione: la via in cui mi trovo, con le facciate ai lati e i lampioni
function strada(W, H, oriz) {
  const M = G.mappa, P = G.pos;
  let dir = G.rotta;
  if (P.nodo == null) {
    const d1 = rottaVerso(M.nodi[P.da].x, M.nodi[P.da].z, M.nodi[P.a].x, M.nodi[P.a].z);
    dir = Math.abs(avvolgi(d1 - G.rotta)) < Math.PI / 2 ? d1 : avvolgi(d1 + Math.PI);
  }
  const rel = avvolgi(dir - G.rotta);
  strato(W, H, oriz, G.rotta, panorama.tetti, '#070a18');
  if (Math.abs(rel) > CAMPO / 2 + 0.2 || P.nodo != null) return; // all'incrocio vedo solo lo spazio aperto
  const vx = xDaAngolo(rel, W), fuga = oriz;
  const lato = W * 0.9;
  // facciate: due pareti che convergono verso il punto di fuga
  for (const s of [-1, 1]) {
    const bordo = s < 0 ? -lato * 0.2 : W + lato * 0.2;
    const grad = g.createLinearGradient(bordo, 0, vx, 0);
    grad.addColorStop(0, '#0c1020'); grad.addColorStop(1, '#05070f');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(bordo, -H * 0.2); g.lineTo(vx + s * W * 0.03, fuga - H * 0.12); g.lineTo(vx + s * W * 0.03, fuga + H * 0.01); g.lineTo(bordo, H * 1.1); g.closePath(); g.fill();
    // finestre accese lungo la parete
    const avanzato = (P.t || 0);
    for (let k = 0; k < 7; k++) {
      const u = ((k + (avanzato / 4) % 1) / 7);
      const px = bordo + (vx - bordo) * u, top = -H * 0.2 + (fuga - H * 0.12 + H * 0.2) * u;
      const fac = panorama.facciate[(k + Math.floor(avanzato / 4) + (s > 0 ? 32 : 0)) % 64];
      if (fac.luci[k % 6]) {
        g.fillStyle = `rgba(255,200,120,${0.35 * (1 - u * 0.6)})`;
        const w = W * 0.03 * (1 - u), h = H * 0.05 * (1 - u);
        g.fillRect(px - s * w * 0.5, top + (H * 0.5) * (1 - u) * 0.6, w, h);
      }
    }
  }
}

function suolo(W, H, oriz) {
  const s = g.createLinearGradient(0, oriz, 0, H);
  s.addColorStop(0, '#0b0f1f'); s.addColorStop(1, '#030409');
  g.fillStyle = s; g.fillRect(0, oriz, W, H - oriz);
  const n = g.createLinearGradient(0, oriz - H * 0.08, 0, oriz + H * 0.1);
  n.addColorStop(0, 'rgba(60,75,110,0)'); n.addColorStop(0.5, 'rgba(60,75,110,0.22)'); n.addColorStop(1, 'rgba(60,75,110,0)');
  g.fillStyle = n; g.fillRect(0, oriz - H * 0.08, W, H * 0.18);
}

function entita(W, H, oriz, ora, dt) {
  const lista = [];
  for (const n of G.nemici) if (n.udito) { const p = proietta(n.x, n.z, W); if (p) lista.push({ p, disegna: () => nemico(n, p, W, H, oriz, ora) }); }
  for (const c of G.costruzioni) { const p = proietta(c.x, c.z, W); if (p) lista.push({ p, disegna: () => costruzione(c, W, H, oriz, ora) }); }
  for (const c of D.casse) { if (!c.aTerra) continue; const p = proietta(c.x, c.z, W); if (p) lista.push({ p, disegna: () => cassaVista(p, W, H, oriz, ora) }); }
  for (const e of G.effetti.esplosioni) { const p = proietta(e.x, e.z, W); if (p) lista.push({ p, disegna: () => esplosioneVista(e, p, W, H, oriz) }); }
  lista.sort((a, b) => b.p.prof - a.p.prof);
  for (const o of lista) o.disegna();
  for (const e of G.effetti.esplosioni) e.t += dt;
  G.effetti.esplosioni = G.effetti.esplosioni.filter(e => e.t < 0.8);
}

function nemico(n, p, W, H, oriz, ora) {
  const tipo = n.tipo;
  const scala = tipo === 'bruto' ? 1.35 : 1;
  const prof = Math.max(p.prof, 1.8);
  const alt = H * 2.4 / prof * scala, piedi = oriz + H * 1.3 / prof - (n.alto ? H * 2.2 / prof : 0);
  let alfa = lim(1.3 - p.d / 30, 0.5, 1), caduta = 0;
  alfa *= 1 - 0.65 * (n.occlusione || 0); // dietro i palazzi: si intravede appena, come lo si sente ovattato
  if (!n.vivo) { caduta = Math.min(1, n.morteT / 0.6); alfa *= Math.max(0, 1 - (n.morteT - 1.5) / 2); if (alfa <= 0) return; }
  const veloce = n.carica ? 18 : 6.6;
  const osc = n.vivo ? Math.sin(n.fase * veloce) : 0;
  const tremito = n.stordito > 0 ? (Math.random() - 0.5) * alt * 0.04 : 0;
  g.save();
  g.translate(p.x + tremito, piedi);
  g.rotate(caduta * 1.45 * (p.rel >= 0 ? 1 : -1) + (tipo === 'corridore' && n.carica ? 0.25 : 0));
  g.globalAlpha = alfa;
  const w = alt * (tipo === 'bruto' ? 0.42 : tipo === 'corridore' ? 0.24 : 0.28);
  const alone = g.createRadialGradient(0, -alt * 0.5, 0, 0, -alt * 0.5, alt * 0.7);
  alone.addColorStop(0, 'rgba(110,135,170,0.28)'); alone.addColorStop(1, 'rgba(110,135,170,0)');
  g.fillStyle = alone; g.fillRect(-alt, -alt * 1.2, alt * 2, alt * 1.4);
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.ellipse(0, 0, w * 1.1, alt * 0.04, 0, 0, 7); g.fill();
  const pelle = g.createLinearGradient(-w, -alt, w, 0);
  const toni = { camminatore: ['#5c6b64', '#2f3a3a'], corridore: ['#6d6a5c', '#35332b'], bruto: ['#5a4f4a', '#2b2320'], soldato: ['#4c5a44', '#27301f'] }[tipo];
  pelle.addColorStop(0, toni[0]); pelle.addColorStop(0.5, toni[1]); pelle.addColorStop(1, '#161c22');
  g.fillStyle = pelle; g.strokeStyle = pelle; g.lineCap = 'round';
  g.lineWidth = w * 0.3;
  g.beginPath(); g.moveTo(-w * 0.2, -alt * 0.48); g.lineTo(-w * 0.25 + osc * w * 0.3, 0);
  g.moveTo(w * 0.2, -alt * 0.48); g.lineTo(w * 0.25 - osc * w * 0.3, 0); g.stroke();
  g.beginPath(); g.ellipse(osc * w * 0.05, -alt * 0.66, w * 0.52, alt * 0.22, 0.12, 0, 7); g.fill();
  g.lineWidth = w * 0.22;
  if (tipo === 'soldato') {
    // imbraccia un fucile
    g.beginPath(); g.moveTo(-w * 0.4, -alt * 0.78); g.lineTo(w * 0.3, -alt * 0.72); g.stroke();
    g.strokeStyle = '#0b0d10'; g.lineWidth = w * 0.12;
    g.beginPath(); g.moveTo(-w * 0.2, -alt * 0.74); g.lineTo(w * 1.1, -alt * 0.76); g.stroke();
    if (n.lampo > 0) {
      g.fillStyle = `rgba(255,210,120,${n.lampo})`; g.beginPath(); g.arc(w * 1.15, -alt * 0.76, w * 0.35, 0, 7); g.fill();
      n.lampo = Math.max(0, n.lampo - 0.25);
    }
    g.fillStyle = pelle;
  } else {
    g.beginPath(); g.moveTo(-w * 0.4, -alt * 0.8); g.lineTo(-w * 0.55, -alt * 0.66 + osc * alt * 0.03);
    g.moveTo(w * 0.4, -alt * 0.8); g.lineTo(w * 0.6, -alt * 0.7 - osc * alt * 0.03); g.stroke();
  }
  g.beginPath(); g.arc(w * 0.12, -alt * 0.93, w * (tipo === 'bruto' ? 0.24 : 0.3), 0, 7); g.fill();
  if (tipo === 'soldato') { g.fillStyle = '#1f261a'; g.beginPath(); g.arc(w * 0.12, -alt * 0.95, w * 0.32, Math.PI, 0); g.fill(); }
  const bagliore = 0.6 + 0.4 * Math.sin(ora / 180 + n.fase);
  g.fillStyle = tipo === 'corridore' ? `rgba(255,220,90,${bagliore})` : `rgba(255,60,50,${bagliore})`;
  g.beginPath(); g.arc(w * 0.02, -alt * 0.95, w * 0.05, 0, 7); g.arc(w * 0.22, -alt * 0.945, w * 0.05, 0, 7); g.fill();
  g.restore();
}

function costruzione(c, W, H, oriz, ora) {
  const a = proietta(c.ax ?? c.x, c.az ?? c.z, W), b = proietta(c.bx ?? c.x, c.bz ?? c.z, W);
  const alfa = (0.35 + 0.4 * c.vita / c.vitaMax) * (c.tipo === 'barricata' ? 1 : 1.3);
  g.globalAlpha = alfa;
  if (c.tipo === 'mina') {
    const p = proietta(c.x, c.z, W); if (!p) return;
    const y = oriz + H * 1.3 / p.prof, r = H * 0.25 / p.prof;
    g.fillStyle = '#2a2d25'; g.beginPath(); g.ellipse(p.x, y, r, r * 0.35, 0, 0, 7); g.fill();
    g.fillStyle = Math.sin(ora / 250) > 0 ? '#ff3b30' : '#551010'; g.beginPath(); g.arc(p.x, y - r * 0.2, r * 0.12, 0, 7); g.fill();
    g.globalAlpha = 1; return;
  }
  if (!a || !b) { g.globalAlpha = 1; return; }
  if (c.tipo === 'rampa') {
    const y1 = oriz + H * 1.3 / a.prof, y2 = oriz + H * 1.3 / b.prof, h2 = H * 2.2 / b.prof;
    g.fillStyle = '#5b4230'; g.beginPath(); g.moveTo(a.x, y1); g.lineTo(b.x, y2); g.lineTo(b.x, y2 - h2); g.closePath(); g.fill();
    g.globalAlpha = 1; return;
  }
  const ya = oriz + H * 1.3 / a.prof, yb = oriz + H * 1.3 / b.prof;
  const ha = H * (c.tipo === 'filo' ? 0.7 : 1.6) / a.prof, hb = H * (c.tipo === 'filo' ? 0.7 : 1.6) / b.prof;
  if (c.tipo === 'barricata') {
    for (let k = 0; k < 4; k++) {
      const f1 = 0.15 + k * 0.22, f2 = f1 + 0.15;
      g.fillStyle = k % 2 ? '#4a3524' : '#5b4230';
      g.beginPath();
      g.moveTo(a.x, ya - ha * f1); g.lineTo(b.x, yb - hb * (f1 + (k % 2 ? 0.05 : -0.04)));
      g.lineTo(b.x, yb - hb * (f2 + (k % 2 ? 0.05 : -0.04))); g.lineTo(a.x, ya - ha * f2); g.closePath(); g.fill();
    }
    g.fillStyle = '#2e2117';
    for (const [x, y, h] of [[a.x, ya, ha], [b.x, yb, hb]]) g.fillRect(x - h * 0.04, y - h, h * 0.08, h);
  } else {
    g.strokeStyle = '#8b939e'; g.lineWidth = Math.max(1, H * 0.004 / Math.min(a.prof, b.prof) * 3);
    g.beginPath();
    for (let k = 0; k <= 16; k++) {
      const u = k / 16, x = a.x + (b.x - a.x) * u, y = ya + (yb - ya) * u, h = ha + (hb - ha) * u;
      g.lineTo(x, y - h * (k % 2 ? 0.9 : 0.4));
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}

function esplosioneVista(e, p, W, H, oriz) {
  const r = H * 6 / p.prof * (0.4 + e.t), y = oriz + H * 1.3 / p.prof - r * 0.4;
  const grad = g.createRadialGradient(p.x, y, 0, p.x, y, r);
  const a = Math.max(0, 1 - e.t / 0.8);
  grad.addColorStop(0, `rgba(255,240,200,${a})`); grad.addColorStop(0.4, `rgba(255,140,40,${a * 0.8})`); grad.addColorStop(1, 'rgba(80,30,10,0)');
  g.fillStyle = grad; g.fillRect(p.x - r, y - r, r * 2, r * 2);
}

function interfaccia(W, H, oriz, ora, dt) {
  const E = G.effetti, cx = W / 2, cy = oriz - H * 0.06, r = H * 0.018;
  if (E.lampo > 0) { g.fillStyle = `rgba(255,210,140,${E.lampo * 0.18})`; g.fillRect(0, 0, W, H); E.lampo = Math.max(0, E.lampo - 0.18); }
  if (G.effetti.esplosioni.length) { const a = Math.max(...G.effetti.esplosioni.map(e => 1 - e.t / 0.8)) * 0.15; g.fillStyle = `rgba(255,180,100,${a})`; g.fillRect(0, 0, W, H); }
  // ferita: bordo rosso; vita bassa: bordo che pulsa col battito che si sente
  const pulsazione = G.battito ? (0.5 + 0.5 * Math.sin(ora / 1000 * PI2 * 1.66)) * 0.35 : 0;
  const rosso = Math.max(E.dolore, pulsazione);
  if (rosso > 0) {
    const v = g.createRadialGradient(cx, H / 2, H * 0.35, cx, H / 2, H * 0.9);
    v.addColorStop(0, 'rgba(120,0,0,0)'); v.addColorStop(1, `rgba(150,0,0,${rosso * 0.6})`);
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    E.dolore = Math.max(0, E.dolore - dt * 1.5);
  }
  // mirino: la luminosità segue il suono di puntamento
  let acceso = 0, rossoMira = false;
  if (Audio3D.ctx && Mira.prossimo) {
    const t = Audio3D.ctx.currentTime;
    for (const i of Mira.impulsi) if (t >= i.s && t <= i.s + i.d) { acceso = (i.freq - 200) / 680; rossoMira = i.centrato; }
  }
  g.strokeStyle = rossoMira ? `rgba(255,90,80,${0.5 + acceso * 0.5})` : `rgba(210,220,240,${0.35 + acceso * 0.5})`;
  g.lineWidth = Math.max(1.5, H * 0.002);
  g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(cx - r * 1.8, cy); g.lineTo(cx - r * 0.6, cy); g.moveTo(cx + r * 0.6, cy); g.lineTo(cx + r * 1.8, cy); g.stroke();
  // sottotitoli della voce
  g.textAlign = 'center';
  if (performance.now() < Voce.sottotitoloFino) {
    const testo = Voce.sottotitolo;
    g.font = `500 ${Math.round(H * 0.026)}px -apple-system, Helvetica, sans-serif`;
    const righe = aCapo(testo, W * 0.8);
    righe.forEach((riga, i) => {
      const y = H * 0.86 - (righe.length - 1 - i) * H * 0.035;
      const w = g.measureText(riga).width;
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(cx - w / 2 - H * 0.01, y - H * 0.027, w + H * 0.02, H * 0.035);
      g.fillStyle = testo.startsWith('Sei morto') ? '#ff6b70' : '#f1e3c4'; g.fillText(riga, cx, y);
    });
  }
  if (E.fase) {
    g.font = `500 ${Math.round(H * 0.018)}px -apple-system, Helvetica, sans-serif`;
    g.fillStyle = 'rgba(200,210,230,0.7)'; g.fillText(E.fase, cx, H * 0.94);
    if (!G.arsenale || !G.arsenale.ricarica) E.fase = '';
  }
}

function aCapo(testo, larghezza) {
  const parole = testo.split(' '), righe = [];
  let riga = '';
  for (const p of parole) {
    const prova = riga ? riga + ' ' + p : p;
    if (g.measureText(prova).width > larghezza && riga) { righe.push(riga); riga = p; } else riga = prova;
  }
  if (riga) righe.push(riga);
  return righe.slice(-3);
}

function cassaVista(p, W, H, oriz, ora) {
  const y = oriz + H * 1.3 / p.prof, l = H * 0.9 / p.prof;
  g.fillStyle = '#6b5a2e'; g.fillRect(p.x - l / 2, y - l * 0.7, l, l * 0.7);
  g.strokeStyle = `rgba(255,220,120,${0.5 + 0.4 * Math.sin(ora / 200)})`; g.lineWidth = Math.max(1, l * 0.06);
  g.strokeRect(p.x - l / 2, y - l * 0.7, l, l * 0.7);
}
