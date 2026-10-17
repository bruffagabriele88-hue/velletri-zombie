'use strict';
// Utilità comuni. Angoli in radianti: 0 = nord, crescono in senso orario (verso destra).
// Mondo in metri: x = est, z = sud (il nord è -z), come nello spazio di Web Audio.

const PI2 = Math.PI * 2;
const GRADI = Math.PI / 180;
const avvolgi = a => { a = (a + Math.PI) % PI2; if (a < 0) a += PI2; return a - Math.PI; };
const lim = (v, a, b) => Math.max(a, Math.min(b, v));
const caso = (a, b) => a + Math.random() * (b - a);
const casoInt = (a, b) => Math.floor(caso(a, b + 1));
const scegli = arr => arr[Math.floor(Math.random() * arr.length)];
const $ = id => document.getElementById(id);

// direzione (rotta) dal punto a al punto b
const rottaVerso = (ax, az, bx, bz) => Math.atan2(bx - ax, -(bz - az));
const avanti = r => [Math.sin(r), -Math.cos(r)];
const destraDi = r => [Math.cos(r), Math.sin(r)];

// Descrizione a voce di una direzione relativa, in otto settori
function direzioneRelativa(rel) {
  const s = Math.round(avvolgi(rel) / (Math.PI / 4));
  return { 0: 'avanti', 1: 'avanti a destra', 2: 'a destra', 3: 'dietro a destra', 4: 'dietro', '-4': 'dietro',
    '-3': 'dietro a sinistra', '-2': 'a sinistra', '-1': 'avanti a sinistra' }[s];
}
function puntoCardinale(r) {
  const n = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ovest', 'ovest', 'nord-ovest'];
  let i = Math.round(r / (Math.PI / 4)) % 8; if (i < 0) i += 8;
  return n[i];
}
function metri(d) {
  if (d < 10) return `${Math.max(1, Math.round(d))} metri`;
  if (d < 100) return `${Math.round(d / 5) * 5} metri`;
  if (d < 1000) return `${Math.round(d / 10) * 10} metri`;
  return `${(d / 1000).toFixed(1).replace('.', ',')} chilometri`;
}
function plurale(n, uno, molti) { return n === 1 ? `1 ${uno}` : `${n} ${molti}`; }

// distanza di un punto p da un segmento ab, e parametro t del punto più vicino
function distSegmento(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
  const t = lim(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  const qx = ax + t * dx, qz = az + t * dz;
  return { d: Math.hypot(px - qx, pz - qz), t, x: qx, z: qz };
}
// intersezione tra i segmenti p1p2 e p3p4
function segmentiIncrociati(x1, z1, x2, z2, x3, z3, x4, z4) {
  const d = (x2 - x1) * (z4 - z3) - (z2 - z1) * (x4 - x3);
  if (Math.abs(d) < 1e-9) return false;
  const u = ((x3 - x1) * (z4 - z3) - (z3 - z1) * (x4 - x3)) / d;
  const v = ((x3 - x1) * (z2 - z1) - (z3 - z1) * (x2 - x1)) / d;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}
