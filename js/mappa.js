'use strict';
// Mappe reali da OpenStreetMap: grafo delle strade in metri, luoghi di interesse, percorsi.

const TIPI_STRADA = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street',
  'pedestrian', 'trunk', 'primary_link', 'secondary_link', 'tertiary_link']);
const TIPI_SOLO_CON_NOME = new Set(['footway', 'steps', 'path', 'service', 'track']);
const NOME_GENERICO = { steps: 'scalinata', footway: 'passaggio pedonale', pedestrian: 'area pedonale', service: 'strada di servizio',
  path: 'sentiero', track: 'strada sterrata', living_street: 'vicolo' };

// categoria OSM -> [etichetta parlata, tipo di scorta]
const CATEGORIE = {
  pharmacy: ['farmacia', 'kit'], hospital: ['ospedale', 'kit'], clinic: ['ambulatorio', 'kit'], doctors: ['medico', 'kit'],
  veterinary: ['veterinario', 'kit'], police: ['polizia', 'armi'], fuel: ['distributore', 'granate'],
  place_of_worship: ['chiesa', null], cafe: ['bar', 'cibo'], bar: ['bar', 'cibo'], pub: ['pub', 'cibo'],
  restaurant: ['ristorante', 'cibo'], fast_food: ['tavola calda', 'cibo'], ice_cream: ['gelateria', 'cibo'],
  bank: ['banca', null], post_office: ['ufficio postale', null], school: ['scuola', null], kindergarten: ['asilo', null],
  theatre: ['teatro', null], cinema: ['cinema', null], bus_station: ['capolinea autobus', null], fountain: ['fontana', null],
  townhall: ['municipio', 'munizioni'], library: ['biblioteca', null], marketplace: ['mercato', 'cibo'],
  supermarket: ['supermercato', 'cibo'], convenience: ['alimentari', 'cibo'], bakery: ['forno', 'cibo'], butcher: ['macelleria', 'cibo'],
  doityourself: ['ferramenta', 'materiali'], hardware: ['ferramenta', 'materiali'], garden_centre: ['vivaio', 'materiali'],
  car_repair: ['officina', 'materiali'], car: ['concessionaria', null],
  monument: ['monumento', null], memorial: ['monumento', null], ruins: ['rovine', null], archaeological_site: ['area archeologica', null],
  museum: ['museo', null], hotel: ['albergo', 'munizioni'], park: ['parco', null], square: ['piazza', null],
};

function categoriaDi(t) {
  for (const k of ['amenity', 'shop', 'historic', 'tourism', 'leisure', 'place']) {
    const v = t[k]; if (!v) continue;
    if (CATEGORIE[v]) return { chiave: v, etichetta: CATEGORIE[v][0], scorta: CATEGORIE[v][1] };
    if (k === 'shop') return { chiave: 'shop', etichetta: 'negozio', scorta: null };
  }
  return null;
}

function costruisciMappa(osm, lat0, lon0, nomeCitta) {
  const kx = Math.cos(lat0 * GRADI) * 111320, kz = 110540;
  const proietta = (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * kz];
  const nodiOsm = new Map();
  for (const e of osm.elements) if (e.type === 'node') nodiOsm.set(e.id, e);

  // grafo
  const indice = new Map(), nodi = [], archi = [], visti = new Set();
  const vertice = id => {
    if (indice.has(id)) return indice.get(id);
    const n = nodiOsm.get(id); if (!n) return -1;
    const [x, z] = proietta(n.lat, n.lon);
    nodi.push({ x, z, adj: [] }); indice.set(id, nodi.length - 1);
    return nodi.length - 1;
  };
  for (const w of osm.elements) {
    if (w.type !== 'way' || !w.tags || !w.tags.highway || !w.nodes) continue;
    const h = w.tags.highway, nome = w.tags.name;
    if (!TIPI_STRADA.has(h) && !(TIPI_SOLO_CON_NOME.has(h) && nome)) continue;
    const etichetta = nome || NOME_GENERICO[h] || 'strada senza nome';
    for (let i = 0; i + 1 < w.nodes.length; i++) {
      const a = vertice(w.nodes[i]), b = vertice(w.nodes[i + 1]);
      if (a < 0 || b < 0 || a === b) continue;
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (visti.has(k)) continue; visti.add(k);
      const len = Math.hypot(nodi[a].x - nodi[b].x, nodi[a].z - nodi[b].z);
      archi.push({ a, b, nome: etichetta, conNome: !!nome, tipo: h, len });
      nodi[a].adj.push({ v: b, e: archi.length - 1 });
      nodi[b].adj.push({ v: a, e: archi.length - 1 });
    }
  }
  // tengo solo la rete connessa più grande
  const comp = new Int32Array(nodi.length).fill(-1);
  let migliore = -1, dimMigliore = 0;
  for (let s = 0, c = 0; s < nodi.length; s++) {
    if (comp[s] >= 0) continue;
    const coda = [s]; comp[s] = c; let dim = 0;
    while (coda.length) { const u = coda.pop(); dim++; for (const { v } of nodi[u].adj) if (comp[v] < 0) { comp[v] = c; coda.push(v); } }
    if (dim > dimMigliore) { dimMigliore = dim; migliore = c; }
    c++;
  }
  for (let i = 0; i < nodi.length; i++) nodi[i].attivo = comp[i] === migliore;

  // luoghi di interesse
  const poi = [], fontane = [], chiese = [];
  for (const e of osm.elements) {
    const t = e.tags; if (!t) continue;
    if (t.highway) continue;
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (lat == null) continue;
    const [x, z] = proietta(lat, lon);
    if (t.amenity === 'fountain') fontane.push({ x, z });
    const cat = categoriaDi(t);
    if (!cat || !t.name) continue;
    if (cat.chiave === 'place_of_worship') chiese.push({ x, z, nome: t.name });
    poi.push({ nome: t.name, etichetta: cat.etichetta, scorta: cat.scorta, x, z });
  }
  return { nomeCitta, nodi, archi, poi, fontane, chiese, proietta };
}

function nodoPiuVicino(M, x, z) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < M.nodi.length; i++) {
    const n = M.nodi[i]; if (!n.attivo) continue;
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function gradoNodo(M, i) { return M.nodi[i].adj.length; }

// Dijkstra con coda a priorità binaria: restituisce la lista di nodi da a a b
function percorso(M, a, b) {
  const n = M.nodi.length, dist = new Float64Array(n).fill(Infinity), prec = new Int32Array(n).fill(-1);
  const heap = [[0, a]]; dist[a] = 0;
  const su = i => { while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const giu = i => { for (;;) { let m = i; const l = 2 * i + 1, r = l + 1;
    if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
    if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } };
  while (heap.length) {
    const [d, u] = heap[0]; const ult = heap.pop(); if (heap.length) { heap[0] = ult; giu(0); }
    if (d > dist[u]) continue;
    if (u === b) break;
    for (const { v, e } of M.nodi[u].adj) {
      const nd = d + M.archi[e].len;
      if (nd < dist[v]) { dist[v] = nd; prec[v] = u; heap.push([nd, v]); su(heap.length - 1); }
    }
  }
  if (a !== b && prec[b] < 0) return null;
  const via = [b]; while (via[via.length - 1] !== a) via.push(prec[via[via.length - 1]]);
  return { nodi: via.reverse(), lunghezza: dist[b] };
}

function arcoTra(M, a, b) { const x = M.nodi[a].adj.find(o => o.v === b); return x ? M.archi[x.e] : null; }

// ---------------------------------------------------------------- scaricare un'altra città
function interrogazioneOverpass(lat, lon, r) {
  return `[out:json][timeout:90];
(way(around:${r},${lat},${lon})[highway~"^(primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|service|footway|steps|path|track|trunk|primary_link|secondary_link|tertiary_link)$"];)->.w;
.w out body; .w >; out skel qt;
(node(around:${r},${lat},${lon})[~"^(amenity|shop|tourism|historic|leisure|place)$"~"."][name];
 way(around:${r},${lat},${lon})[~"^(amenity|historic|leisure|tourism)$"~"."][name];
 node(around:${r},${lat},${lon})[amenity=fountain];);
out center tags;`;
}

async function cercaCitta(nome) {
  const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=it&q=${encodeURIComponent(nome)}`;
  const r = await fetch(u, { headers: { 'Accept-Language': 'it' } });
  const j = await r.json();
  if (!j.length) return null;
  return { lat: +j[0].lat, lon: +j[0].lon, nome: j[0].display_name.split(',').slice(0, 2).join(',') };
}

async function scaricaMappa(lat, lon, raggio = 1200) {
  const server = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  let ultimoErrore;
  for (const s of server) {
    try {
      const r = await fetch(s, { method: 'POST', body: new URLSearchParams({ data: interrogazioneOverpass(lat, lon, raggio) }) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { ultimoErrore = e; }
  }
  throw ultimoErrore;
}

// Distanze a piedi da una o più sorgenti ({nodo, d}) fino a maxDist metri.
// prec[v] è il nodo successivo sulla strada più breve verso la sorgente.
function campoDistanze(M, sorgenti, maxDist, riuso) {
  const n = M.nodi.length;
  const dist = riuso && riuso.dist.length === n ? riuso.dist : new Float64Array(n);
  const prec = riuso && riuso.prec.length === n ? riuso.prec : new Int32Array(n);
  dist.fill(Infinity); prec.fill(-1);
  const heap = [];
  const su = i => { while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const giu = i => { for (;;) { let m = i; const l = 2 * i + 1, r = l + 1;
    if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
    if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } };
  for (const s of sorgenti) { if (s.nodo == null || s.nodo < 0) continue; if (s.d < dist[s.nodo]) { dist[s.nodo] = s.d; heap.push([s.d, s.nodo]); su(heap.length - 1); } }
  while (heap.length) {
    const [d, u] = heap[0]; const ult = heap.pop(); if (heap.length) { heap[0] = ult; giu(0); }
    if (d > dist[u]) continue;
    if (d > maxDist) break;
    for (const { v, e } of M.nodi[u].adj) {
      const nd = d + M.archi[e].len;
      if (nd < dist[v]) { dist[v] = nd; prec[v] = u; heap.push([nd, v]); su(heap.length - 1); }
    }
  }
  return { dist, prec };
}
