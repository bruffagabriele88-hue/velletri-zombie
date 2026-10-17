'use strict';
// Costruzioni con un tasto solo, senza menù: B barricata (o riparazione), F filo spinato, T mina.
// Si costruisce davanti a me, nella direzione in cui guardo; il suono del martello viene da lì.

const COSTRUZIONI = {
  barricata: { nome: 'barricata', costo: 4, distanza: 2.2, larghezza: 3.2, vita: 160, durata: 2.4 },
  filo: { nome: 'filo spinato', costo: 2, distanza: 3.5, larghezza: 3.5, vita: 60, durata: 1.6 },
  mina: { nome: 'mina', costo: 3, distanza: 5, larghezza: 0, vita: 1, durata: 1.2 },
  rampa: { nome: 'rampa', costo: 4, distanza: 2.5, larghezza: 2, vita: 120, durata: 2.0 },
};

function costruisci(tipo) {
  if (!puoAgire() || G.arsenale.ricarica) return;
  if (inArena() && tipo !== 'barricata' && tipo !== 'rampa') return;
  // nella battaglia reale si costruisce in mezzo secondo, come si deve
  const veloce = inArena() || tipo === 'barricata' || tipo === 'rampa';
  const def = veloce ? { ...COSTRUZIONI[tipo], durata: 0.5, costo: 3 } : COSTRUZIONI[tipo];
  const [fx, fz] = avanti(G.rotta), [rx, rz] = destraDi(G.rotta);

  // B davanti a una barricata danneggiata: la riparo
  if (tipo === 'barricata') {
    const vicina = G.costruzioni.find(c => c.tipo === 'barricata' && c.vita > 0 && c.vita < c.vitaMax &&
      Math.hypot(c.x - G.x, c.z - G.z) < 4 && Math.abs(avvolgi(rottaVerso(G.x, G.z, c.x, c.z) - G.rotta)) < 35 * GRADI);
    if (vicina) {
      if (G.inventario.materiali < 1) { parla('Niente materiali.', 1); return; }
      G.inventario.materiali--;
      G.occupatoFino = G.tempo + 1.6;
      suonaInPunto('martello', vicina.x, vicina.z, { gain: 0.9, rate: caso(0.95, 1.05) });
      pianifica(1.6, () => { vicina.vita = Math.min(vicina.vitaMax, vicina.vita + 50); parla(`riparata ${Math.round(vicina.vita)}`, 0); });
      return;
    }
  }
  if (G.inventario.materiali < def.costo) { parla(`Servono ${def.costo} materiali, ne hai ${G.inventario.materiali}.`, 1); return; }
  G.inventario.materiali -= def.costo;
  G.occupatoFino = G.tempo + def.durata;   // mentre costruisco sono vulnerabile
  const x = G.x + fx * def.distanza, z = G.z + fz * def.distanza, mezza = def.larghezza / 2;
  const c = {
    id: Math.random().toString(36).slice(2), tipo, nome: def.nome, x, z, vita: def.vita, vitaMax: def.vita, pronta: false,
    ax: x - rx * mezza, az: z - rz * mezza, bx: x + rx * mezza, bz: z + rz * mezza,
  };
  if (tipo === 'barricata' || tipo === 'rampa') {
    if (veloce) suonaInPunto('legno_colpito', x, z, { gain: 1.0, rate: tipo === 'rampa' ? 1.1 : 1.4 });
    else { suonaInPunto('martello', x, z, { gain: 0.9 }); pianifica(1.1, () => suonaInPunto('martello', x + rx, z + rz, { gain: 0.8, rate: 1.05 })); }
  } else if (tipo === 'filo') {
    suonaInPunto('filo_spinato', x, z, { gain: 0.8 });
  } else {
    suonaInPunto('grilletto_vuoto', x, z, { gain: 0.6, rate: 0.6, y: -1.3 });
    pianifica(0.6, () => suonaInPunto('grilletto_vuoto', x, z, { gain: 0.6, rate: 0.9, y: -1.3 }));
  }
  pianifica(def.durata, () => {
    c.pronta = true; G.costruzioni.push(c);
    if (G.modalita === 'duello') duelloInvia({ t: 'costruzione', c2: c });
    if (!inArena()) parla( `${def.nome} pronta`.replace('filo spinato pronta', 'filo pronto'), 0);
  });
}

function danneggiaCostruzione(c, danno) {
  if (c.vita <= 0) return;
  if (c.tipo === 'vetro') { if (typeof rompiVetro === 'function') rompiVetro(c, null); return; }
  c.vita -= danno;
  if (c.vita <= 0) {
    c.vita = 0;
    if (c.tipo === 'barricata' || c.tipo === 'rampa') { suonaInPunto('legno_rotto', c.x, c.z, { gain: 1.2 }); if (G.modalita !== 'duello') parla('barricata distrutta', 1); }
  }
}

function aggiornaCostruzioni() {
  G.costruzioni = G.costruzioni.filter(c => c.vita > 0);
}

function descriviCostruzioni() {
  if (!G.costruzioni.length) return 'Nessuna costruzione.';
  return G.costruzioni.map(c => {
    const d = Math.hypot(c.x - G.x, c.z - G.z), rel = avvolgi(rottaVerso(G.x, G.z, c.x, c.z) - G.rotta);
    const stato = c.tipo === 'mina' ? '' : `, ${Math.round(c.vita / c.vitaMax * 100)} per cento`;
    return `${c.nome} ${direzioneRelativa(rel)}, ${metri(d)}${stato}`;
  }).join('. ') + '.';
}

// Scatola (tasto T nel duello): quattro muri tutto intorno a me in un colpo solo
function costruisciScatola() {
  if (!puoAgire() || G.arsenale.ricarica) return;
  if (G.inventario.materiali < 10) { parla(`Servono 10 materiali, ne hai ${G.inventario.materiali}.`, 1); return; }
  G.inventario.materiali -= 10;
  G.occupatoFino = G.tempo + 0.6;
  for (let i = 0; i < 4; i++) {
    const r = G.rotta + i * Math.PI / 2, [fx, fz] = avanti(r), [rx, rz] = destraDi(r);
    const x = G.x + fx * 1.6, z = G.z + fz * 1.6, mezza = 1.7;
    const c = { id: Math.random().toString(36).slice(2), tipo: 'barricata', nome: 'muro', x, z, vita: 160, vitaMax: 160, pronta: true,
      ax: x - rx * mezza, az: z - rz * mezza, bx: x + rx * mezza, bz: z + rz * mezza };
    pianifica(i * 0.1, () => { G.costruzioni.push(c); suonaInPunto('legno_colpito', x, z, { gain: 1.0, rate: 1.3 + i * 0.05 }); if (G.modalita === 'duello') duelloInvia({ t: 'costruzione', c2: c }); });
  }
}
