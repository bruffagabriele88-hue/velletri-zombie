'use strict';
// Comandi a tocco per telefoni e tablet (Android e iPhone). Sul computer questo file non fa niente.
// Disposizione da sparatutto per telefono: levetta a sinistra per camminare, pollice destro per guardare,
// pulsante di sparo grande a destra e le azioni intorno. I comandi richiamano gli stessi tasti del computer,
// così il gioco si comporta allo stesso modo su tutti i dispositivi.

const TOCCO = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints > 1 && !/Mac/.test(navigator.platform || ''));

// vibrazione: su Android funziona dal browser; dove non c'è, non fa niente
function vibra(ms) { if (TOCCO && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* non disponibile */ } } }

(function () {
  if (!TOCCO) return;
  document.documentElement.classList.add('tocco');

  // ---------------------------------------------------------------- aspetto
  const css = document.createElement('style');
  css.textContent = `
  html.tocco, html.tocco body { touch-action: none; -webkit-user-select: none; user-select: none; overscroll-behavior: none; }
  html.tocco .tasti { display: none; }
  #tocco { position: fixed; inset: 0; z-index: 20; display: none; pointer-events: none; font-family: -apple-system, Roboto, "Helvetica Neue", sans-serif; }
  #tocco.attivo { display: block; }
  #tocco .zona { position: absolute; pointer-events: auto; touch-action: none; }
  #tocco .sx { left: 0; top: 18%; width: 42%; bottom: 0; }
  #tocco .dx { right: 0; top: 0; width: 58%; bottom: 0; }
  #tocco .base { position: absolute; width: 130px; height: 130px; margin: -65px 0 0 -65px; border-radius: 50%;
    background: radial-gradient(circle, rgba(255,255,255,.10), rgba(255,255,255,.04)); border: 2px solid rgba(255,255,255,.28); display: none; }
  #tocco .pomello { position: absolute; width: 58px; height: 58px; margin: -29px 0 0 -29px; border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, rgba(255,255,255,.85), rgba(200,210,225,.55)); box-shadow: 0 2px 10px rgba(0,0,0,.4); display: none; }
  #tocco .ombra-base { position: absolute; left: 12%; bottom: 18%; width: 110px; height: 110px; border-radius: 50%; border: 2px dashed rgba(255,255,255,.18); pointer-events: none; }
  #tocco button { position: absolute; pointer-events: auto; touch-action: none; border-radius: 50%; border: 2px solid rgba(255,255,255,.35);
    background: rgba(12,16,24,.48); color: #fff; font-weight: 700; font-size: 11px; letter-spacing: .04em; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 2px; padding: 0; backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); text-shadow: 0 1px 2px rgba(0,0,0,.8); }
  #tocco button svg { width: 46%; height: 46%; fill: none; stroke: #fff; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  #tocco button.premuto { background: rgba(255,255,255,.32); transform: scale(.94); }
  #tocco button.grande { width: 92px; height: 92px; background: rgba(190,40,40,.55); border-color: rgba(255,200,200,.7); }
  #tocco button.medio { width: 62px; height: 62px; }
  #tocco button.piccolo { width: 50px; height: 50px; font-size: 10px; }
  #tocco .armi { position: absolute; left: 50%; transform: translateX(-50%); bottom: 10px; display: flex; gap: 6px; pointer-events: auto; }
  #tocco .armi button { position: static; width: auto; height: 38px; border-radius: 10px; padding: 0 10px; font-size: 11px; }
  #tocco .armi button.attuale { background: rgba(255,200,60,.45); border-color: #ffd34d; }
  #tocco .armi button.manca { opacity: .3; }
  #tocco .lancio { position: absolute; left: 50%; top: 55%; transform: translate(-50%, -50%); width: auto; height: auto; border-radius: 16px; padding: 18px 34px; font-size: 22px; background: rgba(40,120,220,.6); }
  #tocco .ruota { position: absolute; display: none; }
  #pannello-tocco { display: none; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 14px; }
  html.tocco #pannello-tocco { display: flex; }
  #pannello-tocco button { font-size: 18px; padding: 12px 22px; border-radius: 12px; border: 1px solid rgba(255,255,255,.35); background: rgba(179,38,46,.55); color: #fff; }
  #pannello-tocco input { font-size: 28px; width: 6em; text-align: center; padding: 8px; border-radius: 10px; border: 1px solid #888; background: #111; color: #fff; letter-spacing: .3em; }
  html.tocco #voci li { padding: 14px 18px; margin: 6px auto; max-width: 520px; border-radius: 10px; background: rgba(255,255,255,.06); font-size: 17px; }
  html.tocco #pannello > div { max-height: 100vh; overflow-y: auto; }
  #gira-telefono { position: fixed; inset: 0; z-index: 50; display: none; align-items: center; justify-content: center; text-align: center;
    background: #04060d; color: #e8ecf5; font-size: 22px; padding: 30px; }
  @media (orientation: portrait) { html.tocco.ingioco #gira-telefono { display: flex; } }
  `;
  document.head.appendChild(css);

  // icone disegnate (linee semplici)
  const ICONE = {
    spara: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg>',
    mira: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/></svg>',
    ricarica: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    muro: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14"/><path d="M3 12h18M9 5v7M15 12v7"/></svg>',
    rampa: '<svg viewBox="0 0 24 24"><path d="M3 20h18L21 6z"/></svg>',
    scatola: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/><path d="M4 4l16 16"/></svg>',
    cura: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    piastra: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
    granata: '<svg viewBox="0 0 24 24"><circle cx="12" cy="14" r="6"/><path d="M10 8V5h4v3M14 5l3-2"/></svg>',
    azione: '<svg viewBox="0 0 24 24"><path d="M8 13V5a2 2 0 0 1 4 0v6M12 11V4a2 2 0 0 1 4 0v8M16 9a2 2 0 0 1 4 0v5a7 7 0 0 1-12 5l-3-4a2 2 0 0 1 3-2l1 1"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.5"/></svg>',
    zona: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    pausa: '<svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg>',
    aggancia: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3"/><circle cx="12" cy="12" r="1.5"/></svg>',
  };

  // ---------------------------------------------------------------- tasti simulati: gli stessi del computer
  function tasto(code, giu = true, extra = {}) {
    document.dispatchEvent(new KeyboardEvent(giu ? 'keydown' : 'keyup', { code, key: extra.key || code, shiftKey: !!extra.shift, bubbles: true, cancelable: true }));
  }
  function premiTasto(code, extra) { tasto(code, true, extra); setTimeout(() => tasto(code, false, extra), 60); }

  // ---------------------------------------------------------------- costruzione dei comandi
  const radice = document.createElement('div'); radice.id = 'tocco';
  radice.innerHTML = `
    <div class="zona sx"></div><div class="zona dx"></div>
    <div class="ombra-base"></div><div class="base"></div><div class="pomello"></div>
    <div class="armi"></div>`;
  document.body.appendChild(radice);
  const gira = document.createElement('div'); gira.id = 'gira-telefono'; gira.textContent = 'Gira il telefono in orizzontale per giocare.';
  document.body.appendChild(gira);
  const zonaSx = radice.querySelector('.sx'), zonaDx = radice.querySelector('.dx'), base = radice.querySelector('.base'), pomello = radice.querySelector('.pomello');

  // un pulsante: posizione (dal bordo destro o sinistro e dal basso), dimensione, icona, etichetta; giu/su quando lo premi e lo lasci
  const pulsanti = {};
  function pulsante(nome, pos, classe, etichetta, giu, su) {
    const b = document.createElement('button'); b.className = classe;
    b.innerHTML = (ICONE[nome] || '') + (etichetta ? `<span>${etichetta}</span>` : '');
    for (const [k, v] of Object.entries(pos)) b.style[k] = typeof v === 'number' ? v + 'px' : v;
    b.setAttribute('aria-label', etichetta || nome);
    b.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); b.classList.add('premuto'); if (giu) giu(e); }, { passive: false });
    const fine = e => { e.preventDefault(); e.stopPropagation(); b.classList.remove('premuto'); if (su) su(e); };
    b.addEventListener('touchend', fine, { passive: false }); b.addEventListener('touchcancel', fine, { passive: false });
    radice.appendChild(b); pulsanti[nome] = b; return b;
  }
  // sparo: si tiene premuto per la raffica; trascinando il dito sul pulsante si continua a girare la mira
  let spX = null;
  const sparo = pulsante('spara', { right: 34, bottom: 70 }, 'grande', 'SPARA', e => { spX = e.changedTouches[0].clientX; if (G.arsenale && G.stato === 'gioco') premiGrilletto(); }, () => { spX = null; if (G.arsenale) rilasciaGrilletto(); });
  sparo.addEventListener('touchmove', e => { e.preventDefault(); const t = e.changedTouches[0]; if (spX !== null) { ruota((t.clientX - spX) * sensibilitaTocco()); spX = t.clientX; } }, { passive: false });
  pulsante('mira', { right: 140, bottom: 150 }, 'medio', 'MIRA', () => premiTasto('KeyC'));
  pulsante('ricarica', { right: 145, bottom: 64 }, 'medio', 'RICARICA', () => premiTasto('KeyR'));
  pulsante('aggancia', { right: 46, bottom: 180 }, 'medio', 'AGGANCIA', () => tasto('AltLeft', true), () => tasto('AltLeft', false));
  pulsante('muro', { right: 20, top: 70 }, 'piccolo', 'MURO', () => tasto('KeyB', true), () => tasto('KeyB', false));
  pulsante('rampa', { right: 78, top: 70 }, 'piccolo', 'RAMPA', () => tasto('KeyN', true), () => tasto('KeyN', false));
  pulsante('scatola', { right: 136, top: 70 }, 'piccolo', 'SCATOLA', () => premiTasto('KeyT'));
  pulsante('granata', { right: 194, top: 70 }, 'piccolo', 'GRANATA', () => premiTasto('KeyQ'));
  pulsante('azione', { right: 230, bottom: 110 }, 'medio', 'APRI', () => premiTasto('KeyE'));
  pulsante('cura', { left: 20, top: 70 }, 'piccolo', 'CURA', () => premiTasto('KeyH'));
  pulsante('piastra', { left: 78, top: 70 }, 'piccolo', 'PIASTRA', () => premiTasto('KeyP'));
  pulsante('info', { left: 136, top: 70 }, 'piccolo', 'INFO', () => premiTasto('Space'));
  pulsante('zona', { left: 194, top: 70 }, 'piccolo', 'ZONA', () => premiTasto('KeyO'));
  pulsante('pausa', { left: 14, top: 12 }, 'piccolo', '', () => { G.pausa = true; G.tasti = {}; if (G.arsenale) G.arsenale.grilletto = false; aggiornaPannello(); });
  // sul bus: il pulsante per lanciarsi
  const lancio = pulsante('lancio', {}, 'lancio', 'LANCIATI', () => premiTasto('Space'));
  lancio.classList.remove('medio');

  // barra delle armi
  const barra = radice.querySelector('.armi');
  const ARMI_BARRA = [['Digit1', 'pistola'], ['Digit2', 'pompa'], ['Digit3', 'mitra'], ['Digit4', 'precisione'], ['Digit5', 'piccone'], ['Digit6', 'mitraglietta']];
  const bottoniArmi = ARMI_BARRA.map(([code, chiave]) => {
    const b = document.createElement('button'); b.textContent = (ARMI[chiave] && ARMI[chiave].nome) || chiave;
    b.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); premiTasto(code); }, { passive: false });
    barra.appendChild(b); return [b, chiave];
  });

  // ---------------------------------------------------------------- levetta (camminare) e sguardo
  let leva = null, sguardo = null;
  const RAGGIO = 55;
  function sensibilitaTocco() { return 0.0055 * (G.sensibilita || 5) / 5 * (G.mira ? 0.45 : 1); }
  function aggiornaLeva(x, y) {
    let dx = x - leva.x, dy = y - leva.y; const d = Math.hypot(dx, dy);
    if (d > RAGGIO) { dx *= RAGGIO / d; dy *= RAGGIO / d; }
    pomello.style.left = (leva.x + dx) + 'px'; pomello.style.top = (leva.y + dy) + 'px';
    const fx = -dy / RAGGIO, lx = dx / RAGGIO, forza = Math.min(1, d / RAGGIO);
    G.tasti.KeyW = fx > 0.35; G.tasti.KeyS = fx < -0.35; G.tasti.KeyD = lx > 0.35; G.tasti.KeyA = lx < -0.35;
    G.tasti.ShiftLeft = forza > 0.92 && fx > 0.6;   // levetta spinta tutta in avanti: corsa
  }
  function rilasciaLeva() { leva = null; base.style.display = pomello.style.display = 'none'; for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft']) delete G.tasti[k]; }
  zonaSx.addEventListener('touchstart', e => {
    e.preventDefault(); if (leva) return;
    const t = e.changedTouches[0]; leva = { id: t.identifier, x: t.clientX, y: t.clientY };
    base.style.left = pomello.style.left = t.clientX + 'px'; base.style.top = pomello.style.top = t.clientY + 'px';
    base.style.display = pomello.style.display = 'block';
  }, { passive: false });
  zonaSx.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (leva && t.identifier === leva.id) aggiornaLeva(t.clientX, t.clientY); }, { passive: false });
  const fineSx = e => { e.preventDefault(); for (const t of e.changedTouches) if (leva && t.identifier === leva.id) rilasciaLeva(); };
  zonaSx.addEventListener('touchend', fineSx, { passive: false }); zonaSx.addEventListener('touchcancel', fineSx, { passive: false });
  // pollice destro: trascinando giro lo sguardo (orizzontale)
  zonaDx.addEventListener('touchstart', e => { e.preventDefault(); if (sguardo) return; const t = e.changedTouches[0]; sguardo = { id: t.identifier, x: t.clientX }; }, { passive: false });
  zonaDx.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) if (sguardo && t.identifier === sguardo.id) { ruota((t.clientX - sguardo.x) * sensibilitaTocco()); sguardo.x = t.clientX; }
  }, { passive: false });
  const fineDx = e => { e.preventDefault(); for (const t of e.changedTouches) if (sguardo && t.identifier === sguardo.id) sguardo = null; };
  zonaDx.addEventListener('touchend', fineDx, { passive: false }); zonaDx.addEventListener('touchcancel', fineDx, { passive: false });

  // ---------------------------------------------------------------- pannello (menù, codice stanza, fine partita)
  const pannelloT = document.createElement('div'); pannelloT.id = 'pannello-tocco';
  document.querySelector('#pannello > div').appendChild(pannelloT);
  function bottone(testo, fn) { const b = document.createElement('button'); b.textContent = testo; b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); fn(); }); pannelloT.appendChild(b); return b; }
  // le voci del menù si scelgono toccandole
  document.getElementById('voci').addEventListener('click', e => {
    const li = e.target.closest('li'); if (!li || !MENU[G.stato]) return;
    e.stopPropagation();
    sceltaMenu = [...li.parentNode.children].indexOf(li);
    confermaMenu();
  });
  const baseAggiorna = aggiornaPannello;
  aggiornaPannello = function () { // eslint-disable-line no-global-assign
    baseAggiorna();
    pannelloT.innerHTML = '';
    const ingioco = G.stato === 'gioco' && !G.pausa;
    document.documentElement.classList.toggle('ingioco', G.stato === 'gioco' || G.stato === 'morto');
    radice.classList.toggle('attivo', ingioco);
    if (G.stato === 'inizio') $('messaggio').textContent = 'Tocca lo schermo per iniziare. Gioca col telefono in orizzontale.';
    if (G.stato === 'digitazione') {
      $('messaggio').textContent = 'Scrivi il codice della stanza (4 cifre)';
      const i = document.createElement('input'); i.type = 'tel'; i.inputMode = 'numeric'; i.maxLength = 4; i.value = G.testo || '';
      i.addEventListener('input', () => { G.testo = i.value.replace(/\D/g, '').slice(0, 4); });
      i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { G.testo = i.value; duelloEntra(); } });
      pannelloT.appendChild(i);
      bottone('Entra', () => { G.testo = i.value; duelloEntra(); });
      bottone('Indietro', () => apriMenu('menu'));
      setTimeout(() => i.focus(), 50);
    } else if (G.stato === 'attesa') {
      if (D.ospite) bottone('Inizia la partita', () => duelloDaiIlVia());
      bottone('Ripeti il codice', () => duelloDiciCodice());
      bottone('Esci', () => { duelloChiudi(); apriMenu('menu'); });
    } else if (G.stato === 'morto') {
      // a fine partita il pannello resta nascosto: i pulsanti stanno sopra il gioco
    } else if (G.stato === 'gioco' && G.pausa) {
      $('messaggio').textContent = 'Pausa';
      bottone('Riprendi', () => { G.pausa = false; aggiornaPannello(); });
      bottone('Esci al menù', () => { if (D.rete) duelloChiudi(); pulisciPartita(); apriMenu('menu'); });
    } else if (MENU[G.stato] && G.stato !== 'menu') bottone('Indietro', () => apriMenu('menu'));
    aggiornaFine();
  };
  // fine partita: rivincita o menù, sopra il gioco
  const fine = document.createElement('div');
  fine.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:30;display:none;gap:12px';
  for (const [testo, code] of [['Rivincita', 'Enter'], ['Menù', 'KeyM']]) {
    const b = document.createElement('button'); b.textContent = testo;
    b.style.cssText = 'font-size:18px;padding:12px 24px;border-radius:12px;border:1px solid rgba(255,255,255,.4);background:rgba(179,38,46,.7);color:#fff';
    b.addEventListener('click', e => { e.preventDefault(); premiTasto(code, { key: code === 'Enter' ? 'Enter' : 'm' }); });
    fine.appendChild(b);
  }
  document.body.appendChild(fine);
  function aggiornaFine() { fine.style.display = G.stato === 'morto' ? 'flex' : 'none'; }

  // ---------------------------------------------------------------- ogni fotogramma: cosa mostrare
  function aggiornaComandi() {
    requestAnimationFrame(aggiornaComandi);
    const ingioco = G.stato === 'gioco' && !G.pausa;
    radice.classList.toggle('attivo', ingioco);
    if (!ingioco) return;
    const cielo = G.modalita === 'battaglia' && B.cielo;
    for (const [n, b] of Object.entries(pulsanti)) b.style.display = cielo ? (n === 'lancio' && B.cielo === 'bus' || n === 'pausa' || n === 'zona' ? 'flex' : 'none') : (n === 'lancio' ? 'none' : 'flex');
    barra.style.display = cielo ? 'none' : 'flex';
    if (!cielo && G.arsenale) for (const [b, chiave] of bottoniArmi) { b.classList.toggle('attuale', G.arsenale.corrente === chiave); b.classList.toggle('manca', !G.arsenale.armi[chiave]); }
  }
  requestAnimationFrame(aggiornaComandi);

  // ---------------------------------------------------------------- schermo intero e orizzontale al primo tocco
  let primo = true;
  document.addEventListener('touchend', () => {
    if (primo) {
      primo = false;
      const el = document.documentElement;
      const ok = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
      if (ok && ok.then) ok.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
    }
    if (G.stato === 'inizio') primoAvvio();
  }, { passive: true });
  // se il gioco perde il fuoco (notifica, telefonata) mi fermo: niente dita rimaste "premute"
  window.addEventListener('blur', () => { rilasciaLeva(); sguardo = null; });
})();
