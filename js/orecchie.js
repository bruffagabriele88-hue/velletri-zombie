'use strict';
// Test delle orecchie: lo stesso suono arriva da davanti, dietro, sinistra o destra, con orecchie diverse
// (sei misurate su persone vere e il modello del browser). Si risponde con le frecce.
// Vince l'orecchio con cui si indovina di più, soprattutto davanti e dietro, che è la cosa più difficile in cuffia.

const TestOrecchie = { candidati: [], prove: [], i: 0, punti: {}, fb: {}, attende: false, finito: false };
const DIREZIONI = { davanti: [0, 1], dietro: [0, -1], sinistra: [-1, 0], destra: [1, 0] };
const FRECCE = { ArrowUp: 'davanti', ArrowDown: 'dietro', ArrowLeft: 'sinistra', ArrowRight: 'destra' };

// il suono di prova: tre colpi di rumore, ricchi di tutte le frequenze (sono i più facili da localizzare)
function suonoProva() {
  if (Audio3D.buf.__prova) return 'prova';
  const ctx = Audio3D.ctx, sr = ctx.sampleRate, b = ctx.createBuffer(1, Math.round(sr * 0.75), sr), d = b.getChannelData(0);
  let rosa = 0;
  for (let k = 0; k < 3; k++) {
    const inizio = Math.round(sr * k * 0.25), lung = Math.round(sr * 0.14);
    for (let i = 0; i < lung; i++) { rosa = rosa * 0.6 + (Math.random() * 2 - 1) * 0.4; d[inizio + i] = rosa * Math.sin(Math.PI * i / lung) * 0.9; }
  }
  Audio3D.buf.prova = b; Audio3D.buf.__prova = true;
  return 'prova';
}
function mescolato(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

async function testOrecchieAvvia() {
  G.stato = 'caricamento'; aggiornaPannello();
  parla('Preparo il test delle orecchie.', 2);
  try {
    if (!Orecchie.meta) Orecchie.meta = await (await fetch('suoni/orecchie/elenco.json?v=42')).json();
    for (const n of Orecchie.meta.soggetti) await caricaOrecchie(n);
  } catch (e) { console.error(e); parla('Non riesco a caricare le orecchie. Riprova più tardi.', 2); apriMenu('menu'); return; }
  const T = TestOrecchie;
  T.candidati = mescolato(['browser', ...Orecchie.meta.soggetti]);
  T.prove = []; T.punti = {}; T.fb = {}; T.i = 0; T.finito = false;
  for (const c of T.candidati) { T.punti[c] = 0; T.fb[c] = 0; for (const dir of mescolato(['davanti', 'dietro', 'davanti', 'dietro', 'sinistra', 'destra'])) T.prove.push({ c, dir }); }
  G.stato = 'testOrecchie'; aggiornaPannello();
  aggiornaAscoltatore(0, 0, 0);
  parla(`Test delle orecchie. Metti le cuffie. Ti faccio sentire tre colpi da una direzione: tu rispondi con le frecce. Su se vengono da davanti, giù da dietro, sinistra o destra. Spazio li ripete, Esc esce. Proverò ${T.candidati.length} orecchie diverse, sei prove ciascuna. Rispondi d'istinto. Cominciamo con le orecchie numero 1.`, 2);
  setTimeout(() => { if (G.stato === 'testOrecchie') suonaProvaOrecchie(); }, 14500);
}
function suonaProvaOrecchie() {
  const T = TestOrecchie, p = T.prove[T.i]; if (!p) return;
  aggiornaAscoltatore(0, 0, 0);
  const [r, f] = DIREZIONI[p.dir], [fx, fz] = avanti(0), [rx, rz] = destraDi(0), dist = 3;
  const s = creaSorgente({ orecchie: p.c, ref: 2, riverbero: 0.04, diretto: true });
  posiziona(s, (fx * f + rx * r) * dist, 0, (fz * f + rz * r) * dist, true);
  const src = suona(suonoProva(), { dest: s.ingresso, gain: 1.4 });
  if (src) src.onended = () => chiudiSorgente(s, 0.3);
  T.attende = true;
}
function testOrecchieTasto(e) {
  const T = TestOrecchie, c = e.code;
  if (c === 'Escape') { T.attende = false; apriMenu('menu', 'Test interrotto. '); return; }
  if (T.finito) return;
  if (c === 'Space') { if (T.attende) suonaProvaOrecchie(); return; }
  const risposta = FRECCE[c]; if (!risposta || !T.attende) return;
  e.preventDefault();
  T.attende = false;
  const p = T.prove[T.i], giusto = risposta === p.dir;
  if (giusto) { T.punti[p.c]++; if (p.dir === 'davanti' || p.dir === 'dietro') T.fb[p.c]++; suona('tic2', { gain: 0.5, rate: 1.3 }); }
  else suona('tic', { gain: 0.5, rate: 0.6 });
  T.i++;
  if (T.i >= T.prove.length) { testOrecchieFine(); return; }
  const cambia = T.prove[T.i].c !== p.c, numero = T.candidati.indexOf(T.prove[T.i].c) + 1;
  if (cambia) { parla(`Orecchie numero ${numero}.`, 1); setTimeout(() => { if (G.stato === 'testOrecchie') suonaProvaOrecchie(); }, 1700); }
  else setTimeout(() => { if (G.stato === 'testOrecchie') suonaProvaOrecchie(); }, 600);
}
function testOrecchieFine() {
  const T = TestOrecchie; T.finito = true;
  // la migliore: più risposte giuste; a parità, più giuste tra davanti e dietro; a parità ancora, meglio le orecchie vere
  const ordine = T.candidati.slice().sort((a, b) => (T.punti[b] - T.punti[a]) || (T.fb[b] - T.fb[a]) || ((a === 'browser') - (b === 'browser')));
  const best = ordine[0], numero = T.candidati.indexOf(best) + 1, tot = T.prove.length / T.candidati.length;
  const browser = T.punti.browser;
  Orecchie.scelta = best;
  try { localStorage.setItem('vz_orecchie', best); } catch (e) { /* non disponibile */ }
  const descr = best === 'browser' ? "quelle del browser, cioè l'audio di prima" : `le orecchie numero ${numero}, misurate su una persona vera`;
  parla(`Fine del test. Hai indovinato di più con ${descr}: ${T.punti[best]} su ${tot}, ${T.fb[best]} su 4 tra davanti e dietro. Con l'audio di prima ne avevi indovinati ${browser}. Da ora il gioco usa queste. Puoi rifare il test quando vuoi dal menù.`, 2);
  setTimeout(() => { if (G.stato === 'testOrecchie') apriMenu('menu'); }, 15000);
}
