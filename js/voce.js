'use strict';
// Sintesi vocale propria del gioco, breve e telegrafica. Ogni frase compare anche come sottotitolo.

const Voce = { it: null, velocita: 1.35, prioritaCorrente: 0, fineStimata: 0, sottotitolo: '', sottotitoloFino: 0 };

function trovaVoce() {
  if (!('speechSynthesis' in window)) return;
  const voci = speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith('it'));
  const pref = ['premium', 'enhanced', 'avanzata', 'siri', 'federica', 'alice', 'luca', 'paola'];
  voci.sort((a, b) => {
    const pa = pref.findIndex(p => a.name.toLowerCase().includes(p));
    const pb = pref.findIndex(p => b.name.toLowerCase().includes(p));
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
  });
  Voce.it = voci[0] || null;
}
if ('speechSynthesis' in window) { trovaVoce(); speechSynthesis.onvoiceschanged = trovaVoce; }

// priorita: 0 = danni e conferme, 1 = informazioni, 2 = eventi importanti (ondate, morte)
// Una frase meno importante non interrompe una più importante ancora in corso.
function parla(testo, priorita = 1) {
  const ora = performance.now();
  if (ora < Voce.fineStimata && priorita < Voce.prioritaCorrente) return;
  Voce.prioritaCorrente = priorita;
  Voce.fineStimata = ora + 400 + testo.length * 55 / Voce.velocita;
  Voce.sottotitolo = testo;
  Voce.sottotitoloFino = ora + Math.max(2200, testo.length * 70);
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(testo);
  u.lang = 'it-IT';
  if (Voce.it) u.voice = Voce.it;
  u.rate = Voce.velocita;
  u.onend = () => { Voce.fineStimata = 0; };
  // Safari a volte scarta una frase pronunciata subito dopo cancel()
  setTimeout(() => speechSynthesis.speak(u), 30);
}
// Annuncio con la voce vera del narratore (registrata), col sottotitolo. Se manca la registrazione, parla il computer.
function annuncio(nome, testo, priorita = 1) {
  const clip = ((typeof Audio3D !== 'undefined' && Audio3D.voci && Audio3D.voci.narratore) || {})[nome];
  if (!clip || !Audio3D.buf[clip[0]]) { parla(testo, priorita); return; }
  const ora = performance.now();
  if (ora < Voce.fineStimata && priorita < Voce.prioritaCorrente) return;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  const durata = Audio3D.buf[clip[0]].duration * 1000;
  Voce.prioritaCorrente = priorita; Voce.fineStimata = ora + durata;
  Voce.sottotitolo = testo; Voce.sottotitoloFino = ora + Math.max(2200, durata + 800);
  suona(clip[0], { gain: 1.1 });
}
// Il compagno parla alla radio: il clic e il fruscio prima e dopo, la voce stretta della radio, nell'orecchio.
let prossimaRadio = 0;
function radio(categoria, testo, voce = 'radio') {
  const V = (typeof Audio3D !== 'undefined' && Audio3D.voci) || {};
  const frasi = (V[voce] || {})[categoria] || (V.radio || {})[categoria];
  if (!frasi || !frasi.length || performance.now() < prossimaRadio) return false;
  const nome = scegli(frasi), b = Audio3D.buf[nome]; if (!b) return false;
  prossimaRadio = performance.now() + b.duration * 1000 + 2500;
  fruscioRadio(0); suona(nome, { gain: 0.95, quando: 0.12 }); fruscioRadio(0.15 + b.duration);
  if (testo) { Voce.sottotitolo = testo; Voce.sottotitoloFino = performance.now() + 2500; }
  return true;
}
function fruscioRadio(quando) {
  const ctx = Audio3D.ctx, t = ctx.currentTime + quando, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = Audio3D.rumoreBreve; s.loop = true; f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.8;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  s.connect(f).connect(g).connect(Audio3D.master); s.start(t); s.stop(t + 0.14);
  suona('tic2', { gain: 0.25, rate: 1.6, quando });
}
function taci() { if ('speechSynthesis' in window) speechSynthesis.cancel(); Voce.fineStimata = 0; }
