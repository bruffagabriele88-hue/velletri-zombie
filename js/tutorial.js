'use strict';
// Allenamento: obbligatorio la prima volta che si entra nel gioco. Una lezione alla volta:
// la voce spiega un comando, il giocatore lo prova, e solo allora si passa al successivo.
// Si svolge sull'isola della battaglia reale, senza avversari veri, senza tempesta e senza poter essere eliminati.

const TUT = { passo: -1, stadio: 'attesa', avanti: 0, liberoDa: 0, tasti: {}, giro: 0, strada: 0, corsa: 0, colpi: 0, colpiMira: 0, rotta: 0, x: 0, z: 0, ricorda: 0, obbligatorio: false, fattoInMemoria: false };

function tutorialFatto() { try { return localStorage.getItem('vz_tutorial') === '1' || TUT.fattoInMemoria; } catch (e) { return TUT.fattoInMemoria; } }
function tutorialSegnaFatto() { TUT.fattoInMemoria = true; try { localStorage.setItem('vz_tutorial', '1'); } catch (e) { /* non disponibile */ } }

// le spiegazioni con la voce vera del narratore: si scaricano solo quando parte l'allenamento
async function caricaVociAllenamento() {
  if (TUT.vociPronte) return;
  try {
    const nomi = await (await fetch('suoni/voci/allenamento/elenco.json?v=36')).json();
    await caricaInGruppi(nomi.map(n => ['tut_' + n, `suoni/voci/allenamento/tut_${n}.mp3?v=36`]));
    Audio3D.voci.narratore = Audio3D.voci.narratore || {};
    for (const n of nomi) if (Audio3D.buf['tut_' + n]) Audio3D.voci.narratore['tut_' + n] = ['tut_' + n];
    TUT.vociPronte = true;
  } catch (e) { console.error('voci dell\'allenamento non caricate', e); }
}
async function tutorialAvvia() {
  TUT.obbligatorio = !tutorialFatto();
  G.stato = 'caricamento'; aggiornaPannello();
  if (!TUT.vociPronte) parla('Carico l\'allenamento.', 1);
  await caricaVociAllenamento();
  battagliaAvvia('piazza', 'facile', { squadre: 1, tutorial: true });
}

// un punto libero a una certa distanza da me: non dentro una casa, senza muri in mezzo, dentro l'isola
function tutorialPunto(dist, angolo = 0) {
  for (let k = 0; k < 16; k++) {
    const a = G.rotta + angolo + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.4, [fx, fz] = avanti(a);
    const x = G.x + fx * dist, z = G.z + fz * dist;
    if (Math.hypot(x, z) < RAGGIO_ISOLA - 8 && !casaDi(x, z, 1.5) && !muroTra(G.x, G.z, x, z)) return [x, z];
  }
  const [fx, fz] = avanti(G.rotta + angolo); return [G.x + fx * dist, G.z + fz * dist];
}
function tutorialForziere(dist, contenuto, angolo = 1.2) {
  const [x, z] = tutorialPunto(dist, angolo), c = nuovoForziere(x, z, contenuto);
  D.casse.push(c); return c;
}
function tutorialFantoccio(dist, vita, angolo = -1) {
  const b = B.bot[0]; if (!b) return null;
  const [x, z] = tutorialPunto(dist, angolo);
  if (b.vivo) chiudiSorgente(b.sorgente);
  b.sorgente = creaSorgente({ ref: 9, rolloff: 0.8, riverbero: 0.15 });
  Object.assign(b, { x, z, vivo: true, vita, scudo: 0, morteT: 0, inAria: false, livello: 0, stordito: 0, udito: true, ultimoSuono: G.tempo, prossimoPasso: 0, bottino: { cont: 'pozione' } });
  if (!G.nemici.includes(b)) G.nemici.push(b); // i caduti vengono tolti dall'elenco: lo rimetto
  posiziona(b.sorgente, x, 0, z, true);
  return b;
}
function tutorialFantoccioVivo() { const b = B.bot[0]; return !!(b && b.vivo); }
// il fantoccio cammina sul posto: si sente, ma non fa niente
function aggiornaFantoccio(b) {
  b.udito = true;
  if (G.tempo >= b.prossimoPasso) {
    b.prossimoPasso = G.tempo + 0.55;
    suonoBot(b, `passo${casoInt(1, 6)}`, { gain: 1.0, rate: b.tono });
  }
  posiziona(b.sorgente, b.x, 0, b.z);
}
function tutorialArma() {
  const A = G.arsenale;
  if (!A.armi.mitra) A.armi.mitra = { caricatore: ARMI.mitra.capacita, camera: 1, rarita: 1 };
  A.riserva[ARMI.mitra.munizione] = Math.max(A.riserva[ARMI.mitra.munizione] || 0, 120);
  if (A.corrente !== 'mitra') A.corrente = 'mitra';
  D.casse = D.casse.filter(c => !c.lezione);
}

const INVIO = ' Premi Invio per continuare.';
const LEZIONI = [
  { id: 'gira',
    testo: 'Benvenuto all\'allenamento. La prima volta è obbligatorio: ti spiego un comando alla volta e tu lo provi. Qui nessuno ti può eliminare. Tre tasti da ricordare. Cancella ripete la spiegazione. Invio va avanti quando te lo chiedo. Maiuscolo più Invio salta un esercizio che non ti riesce. Cominciamo. Per girare lo sguardo scorri un dito sul trackpad, a destra o a sinistra, oppure usa le frecce destra e sinistra. Prova: girati un po\'.',
    fatto: () => TUT.giro > 1.6 },
  { id: 'cammina',
    testo: 'Ora cammina. W va avanti, S indietro, A e D fanno il passo di lato. Senti i tuoi passi: cambiano suono sull\'erba, sui sassi e sul legno. Fai qualche passo.',
    fatto: () => TUT.strada > 6 },
  { id: 'corri',
    testo: 'Per correre tieni premuto Maiuscolo mentre cammini. Sei più veloce, ma fai più rumore e gli avversari ti sentono da più lontano. Fai una corsa.',
    fatto: () => TUT.corsa > 7 },
  { id: 'dietro',
    testo: 'Il tasto X ti gira di scatto all\'indietro: serve quando senti qualcuno alle spalle. Premi X.',
    fatto: () => TUT.tasti.KeyX },
  { id: 'situazione', pausa: 3,
    testo: 'Spazio ti dice la situazione: quanti restano, chi senti vicino, dov\'è il forziere più vicino, che arma hai, vita e giubbotto. Premi Spazio e ascolta.',
    fatto: () => TUT.tasti.Space },
  { id: 'zona', pausa: 3,
    testo: 'Il tasto O ti dice dove andare per stare nella zona sicura, qual è il luogo più vicino e verso dove guardi. Premi O.',
    fatto: () => TUT.tasti.KeyO },
  { id: 'inventario', pausa: 3,
    testo: 'V ti dice la vita. I, oppure Tab, ti legge l\'inventario. Premi I.',
    fatto: () => TUT.tasti.KeyI || TUT.tasti.Tab },
  { id: 'forziere',
    prepara: () => { if (!G.arsenale.armi.mitra) tutorialForziere(12, { cont: 'mitra', rar: 1, materiali: 15, lezione: true }); },
    testo: 'Adesso le armi. In partita parti solo col piccone: le armi stanno nei forzieri. Il forziere più vicino manda un richiamo che si ripete, e da vicino diventa un luccichio. Ne ho messo uno a dodici metri. Premi Maiuscolo più Z per girarti verso il forziere, cammina fin lì, e quando senti «cassa, E» premi E per aprirlo.',
    fatto: () => !!G.arsenale.armi.mitra, salta: tutorialArma },
  { id: 'armi', prepara: tutorialArma,
    testo: 'Hai un ARX 160, un fucile d\'assalto. Le armi si scelgono coi numeri: 1 pistola, 2 fucile a pompa, 3 fucile d\'assalto, 4 fucile di precisione, 5 piccone, 6 mitraglietta, 7 lanciarazzi. Il piccone colpisce da vicino e rompe i muri. Premi 5 per prendere il piccone, poi 3 per riprendere il fucile.',
    fatto: () => TUT.tasti.Digit5 && TUT.tasti.Digit3 && G.arsenale.corrente === 'mitra', salta: tutorialArma },
  { id: 'colpi', pausa: 3,
    testo: 'Maiuscolo più C ti dice che arma hai in mano e quanti colpi restano. Provalo.',
    fatto: () => TUT.tasti['Maiusc+KeyC'] },
  { id: 'spara',
    prepara: () => { tutorialArma(); tutorialFantoccio(15, 100000); },
    testo: 'Ora si spara. Ho messo un fantoccio: cammina sul posto, lo senti, ma non ti fa niente. Premi Z per girarti verso il nemico che senti. C\'è anche un suono di puntamento: più sei girato verso il nemico più è acuto, e quando ce l\'hai proprio davanti diventa un tono pieno e fisso. A quel punto spara: clic sul trackpad, e col fucile d\'assalto tieni premuto. Un tic vuol dire colpito, un campanello vuol dire colpo alla testa. Colpisci il fantoccio.',
    fatto: () => TUT.colpi > 0 },
  { id: 'mirino',
    prepara: () => { tutorialArma(); if (!tutorialFantoccioVivo()) tutorialFantoccio(15, 100000); },
    testo: 'Colpito. Adesso il mirino: premi C, oppure fai clic con due dita. Nel mirino sei molto più preciso, ma cammini piano. Con C esci dal mirino. Ricorda: se tieni premuto il grilletto a lungo il rinculo cresce e i colpi si allargano, quindi meglio raffiche corte. Entra nel mirino e colpiscilo ancora.',
    fatto: () => TUT.colpiMira > 0 },
  { id: 'aggancio', windows: true,
    prepara: () => { tutorialArma(); if (!tutorialFantoccioVivo()) tutorialFantoccio(15, 60); else B.bot[0].vita = 60; },
    testo: 'Un altro aiuto: tenendo premuto il tasto Opzione, che su Windows si chiama Alt, lo sguardo si aggancia al nemico più vicino che senti e lo segue. Tienilo premuto, spara, ed elimina il fantoccio.',
    fatto: () => !tutorialFantoccioVivo(), salta: () => { const b = B.bot[0]; if (b && b.vivo) elimina(b, 'io'); } },
  { id: 'ricarica',
    testo: 'Il tasto R ricarica. Fallo quando sei al riparo, perché mentre ricarichi non puoi sparare. Premi R.',
    fatto: () => TUT.tasti.KeyR },
  { id: 'bottino',
    prepara: () => { if (!D.casse.length && !G.inventario.pozioni) tutorialForziere(8, { cont: 'pozione', materiali: 15 }); },
    testo: 'Chi viene eliminato lascia a terra il suo bottino, che si apre come un forziere. Vai a prenderlo: Maiuscolo più Z per girarti, cammina fin lì, e premi E.',
    fatto: () => G.inventario.pozioni > 0 || G.scudo > 0, salta: () => { D.casse = []; G.inventario.pozioni = 1; } },
  { id: 'piastra', pausa: 3,
    prepara: () => { if (!G.inventario.pozioni && G.scudo <= 0) G.inventario.pozioni = 1; },
    testo: 'Hai trovato una piastra balistica. Il giubbotto antiproiettile assorbe i colpi prima della vita, fino a cento punti. Premi P per montare la piastra: ci vogliono due secondi, e intanto sei scoperto.',
    fatto: () => G.scudo > 0 },
  { id: 'cura', pausa: 3,
    prepara: () => { G.vita = 45; G.inventario.cibo = Math.max(G.inventario.cibo, 3); suona('dolore1', { gain: 0.6 }); },
    testo: 'Ora ti ho tolto un po\' di vita, per prova. Con H ti curi: usa prima il kit medico, che ridà cinquanta punti, altrimenti una benda, che ne ridà venti. Premi H.',
    fatto: () => G.vita > 46, salta: () => { G.vita = 100; } },
  { id: 'granata', pausa: 5,
    prepara: () => { G.vita = 100; G.inventario.granate = 2; TUT.granate = 2; tutorialFantoccio(14, 100, 0); },
    testo: 'Le granate. Con Q ne lanci una quattordici metri davanti a te, e scoppia dopo tre secondi. Ho messo un altro fantoccio proprio a quella distanza. Premi Z per girarti verso di lui, poi Q. Quando la granata te la tirano gli altri senti dei bip sempre più veloci: scappa di corsa dalla parte opposta, oppure metti un muro in mezzo.',
    fatto: () => G.inventario.granate < TUT.granate },
  { id: 'costruisci',
    prepara: () => { G.inventario.materiali = Math.max(G.inventario.materiali, 60); },
    testo: 'Costruire. Ogni pezzo costa due materiali, che trovi nei forzieri. B alza un muro davanti a te, che ferma i proiettili. N mette una rampa: salendoci vai al piano di sopra e spari oltre i muri. Tenendoli premuti costruisci a raffica. Premi B, poi N.',
    fatto: () => TUT.tasti.KeyB && TUT.tasti.KeyN },
  { id: 'scatola',
    prepara: () => { G.inventario.materiali = Math.max(G.inventario.materiali, 40); },
    testo: 'T costruisce una scatola: quattro muri tutto intorno a te. È il riparo più veloce quando ti sparano, per curarti o ricaricare. Costa dieci materiali. K ti dice le costruzioni vicine. Premi T.',
    fatto: () => TUT.tasti.KeyT },
  { id: 'ascolto', pausa: 5, windows: true,
    prepara: () => { if (!tutorialFantoccioVivo()) tutorialFantoccio(20, 100); },
    testo: 'Il tasto Controllo è l\'ascolto: senti un sonar da ogni avversario entro sessanta metri, dal più vicino. È più acuto se sta sopra di te, più grave se sta sotto. Si può usare ogni sei secondi. Su Windows usa il tasto zero, che fa la stessa cosa, perché lì Controllo insieme a W chiuderebbe la pagina. Premi Controllo, oppure zero.',
    fatto: () => TUT.tasti.ControlLeft || TUT.tasti.ControlRight || TUT.tasti.Digit0 },
  { id: 'radar', pausa: 5,
    prepara: () => { G.inventario.radar = Math.max(G.inventario.radar || 0, 1); if (!tutorialFantoccioVivo()) tutorialFantoccio(20, 100); },
    testo: 'L usa il radar, se ne hai trovato uno: per cinque secondi ti segnala dove stanno gli avversari. F invece piazza una trappola a terra, che costa cinque materiali. Premi L.',
    fatto: () => TUT.tasti.KeyL },
  { id: 'case', invio: true,
    prepara: () => { const b = B.bot[0]; if (b && b.vivo) { b.vivo = false; b.morteT = 99; chiudiSorgente(b.sorgente); } D.casse = []; },
    testo: 'I comandi sono finiti. Adesso ascolta soltanto. Sull\'isola ci sono case e una chiesa. Si entra dalla porta, dentro c\'è sempre un forziere, i muri fermano i colpi e i suoni da fuori arrivano attutiti. Se sbatti contro un muro, la voce ti dice dov\'è la porta. Nei cespugli, se non corri e non spari, sei nascosto e nessuno ti vede.' + INVIO },
  { id: 'elicottero', invio: true,
    testo: 'In partita si parte sull\'elicottero, che attraversa l\'isola. Prima scegli dal menù dove atterrare; in volo puoi cambiare luogo coi tasti da 1 a 5. Ti dico io quando lanciarti: premi Spazio. In caduta, W ti porta avanti e giri come sempre, e un richiamo sonoro arriva dal luogo scelto.' + INVIO },
  { id: 'tempesta', invio: true,
    testo: 'Due minuti dopo l\'atterraggio arriva la tempesta: l\'isola si restringe a tappe, e chi resta fuori dalla zona sicura perde vita. Ti avviso prima, e con O sai sempre dove andare. Ogni tanto cade una cassa col paracadute, con roba migliore. Vince l\'ultimo in piedi.' + INVIO },
  { id: 'squadre', invio: true,
    testo: 'A squadre, i compagni ti parlano alla radio. Se finisci a terra puoi strisciare e un compagno viene a rianimarti; se a terra c\'è lui, vai vicino e premi E. In rete, uno crea la stanza e dà il codice di quattro cifre agli amici, e i posti vuoti li prendono i bot.' + INVIO },
  { id: 'ultimi', invio: true,
    testo: 'Gli ultimi tasti. Più e meno cambiano la sensibilità del trackpad. G accende o spegne la grafica, Y il vento, U la musica. Esc mette in pausa, e in pausa M torna al menù. Il silenziatore, se lo trovi, si monta da solo sull\'arma adatta. Premi Invio per finire.' },
];

function tutorialInizia() {
  Object.assign(TUT, { passo: -1, stadio: 'attesa', avanti: 0.4, tasti: {}, finito: false });
  B.cielo = null; B.quota = 0; B.velaAperta = false; B.atterratoA = 0; B.fine = 1e9; B.prossimaCassa = 1e9;
  G.x = 0; G.z = 6; G.rotta = 0; G.occupatoFino = 0;
  D.casse = [];
  const b = B.bot[0];
  if (b) { b.fantoccio = true; b.nome = 'Fantoccio'; b.def.nome = 'Fantoccio'; b.vivo = false; b.morteT = 99; b.inAria = false; chiudiSorgente(b.sorgente); }
  if (G.pausa) {
    const clicca = () => { if (B.tutorial && G.pausa && TUT.passo < 0) annuncio('tut_clicca', 'Allenamento. Clicca sul trackpad per cominciare.', 2); };
    if (TUT.obbligatorio) { annuncio('tut_prima', 'Velletri Zombie. È la prima volta: si comincia con l\'allenamento.', 2); setTimeout(clicca, 4800); } else clicca();
  }
}

function tutorialDici() {
  const L = LEZIONI[TUT.passo]; if (!L) return;
  // due spiegazioni hanno una nota in più per Windows che nella registrazione non c'è: lì le legge la voce del computer
  const letta = L.windows && !SU_MAC;
  if (letta) parla(L.testo, 2); else annuncio('tut_' + L.id, L.testo, 2);
  const clip = letta ? null : Audio3D.buf['tut_' + L.id];
  TUT.ricorda = G.tempo + 25 + (clip ? clip.duration : L.testo.length * 0.07);
}
function tutorialEntra(i) {
  TUT.passo = i; TUT.stadio = 'lezione'; TUT.tasti = {}; TUT.giro = 0; TUT.strada = 0; TUT.corsa = 0; TUT.colpi = 0; TUT.colpiMira = 0;
  const L = LEZIONI[i];
  if (!L) { tutorialFine(); return; }
  try { if (L.prepara) L.prepara(); } catch (e) { console.error('allenamento', e); }
  TUT.liberoDa = G.tempo + Math.min(10, L.testo.length * 0.03);
  TUT.rotta = G.rotta; TUT.x = G.x; TUT.z = G.z;
  tutorialDici();
  aggiornaPannello();
}
function tutorialSuperato() {
  const L = LEZIONI[TUT.passo];
  TUT.stadio = 'attesa'; TUT.avanti = G.tempo + (L.pausa || 1.6); TUT.attesaDa = performance.now();
  suona('tic2', { gain: 0.5, rate: 1.2 }); suona('tic2', { gain: 0.5, rate: 1.6, quando: 0.12 });
}
function aggiornaTutorial() {
  if (TUT.finito) return;
  // non si può morire, e la vita non scende mai troppo
  if (G.vita < 25) G.vita = 25;
  if (TUT.stadio === 'attesa') {
    // aspetto che la voce abbia finito di dire quello che il comando ha fatto dire (al massimo dodici secondi)
    const parlando = performance.now() < Voce.fineStimata && performance.now() - (TUT.attesaDa || 0) < 12000;
    if (G.tempo >= TUT.avanti && !parlando) tutorialEntra(TUT.passo + 1);
    return;
  }
  const L = LEZIONI[TUT.passo];
  // giri e passi contano solo dopo l'inizio della spiegazione, non quelli fatti per caso mentre parlo
  const dr = Math.abs(avvolgi(G.rotta - TUT.rotta)), dp = Math.hypot(G.x - TUT.x, G.z - TUT.z);
  if (G.tempo >= TUT.liberoDa) {
    if (dr < 1) TUT.giro += dr;
    if (dp < 2) { TUT.strada += dp; if (G.tasti.ShiftLeft || G.tasti.ShiftRight) TUT.corsa += dp; }
  }
  TUT.rotta = G.rotta; TUT.x = G.x; TUT.z = G.z;
  if (!L.invio && L.fatto && L.fatto()) { tutorialSuperato(); return; }
  if (G.tempo >= TUT.ricorda && performance.now() > Voce.fineStimata) tutorialDici();
}
// i tasti dell'allenamento. Restituisce true se il tasto è stato usato qui e non deve fare altro.
function tutorialTasto(c, e) {
  if (TUT.finito) return true;
  if (c === 'Backspace') { if (TUT.stadio === 'lezione') { taci(); tutorialDici(); } return true; }
  if (c === 'Enter' || c === 'NumpadEnter') {
    if (TUT.stadio !== 'lezione') return true;
    const L = LEZIONI[TUT.passo];
    if (L.invio) { tutorialSuperato(); TUT.avanti = G.tempo + 0.3; taci(); }
    else if (e.shiftKey) { try { if (L.salta) L.salta(); } catch (err) { console.error('allenamento', err); } annuncio('tut_saltato', 'Saltato.', 2); tutorialSuperato(); }
    else annuncio('tut_prova', 'Qui devi provare il comando. Cancella ripete la spiegazione, Maiuscolo più Invio salta.', 2);
    return true;
  }
  if (TUT.stadio === 'lezione') TUT.tasti[(e.shiftKey && !c.startsWith('Shift') ? 'Maiusc+' : '') + c] = true;
  return false;
}
function tutorialColpito() { TUT.colpi++; if (G.mira) TUT.colpiMira++; }
function tutorialFine() {
  TUT.finito = true; TUT.obbligatorio = false;
  tutorialSegnaFatto();
  suona('vittoria', { gain: 0.7 });
  annuncio('tut_fine', 'Allenamento completato. Sei pronto per la battaglia. Lo puoi rifare quando vuoi dal menù, alla voce Allenamento.', 2);
  setTimeout(() => {
    if (!B.tutorial || G.stato !== 'gioco') return;
    pulisciPartita(); B.tutorial = false;
    if (document.pointerLockElement) document.exitPointerLock();
    apriMenu('menu');
  }, 9000);
}
