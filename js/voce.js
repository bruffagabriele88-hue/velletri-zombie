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
function taci() { if ('speechSynthesis' in window) speechSynthesis.cancel(); Voce.fineStimata = 0; }
