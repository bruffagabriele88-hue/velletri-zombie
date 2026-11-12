'use strict';
// Grafica 3D della Battaglia reale e del duello (three.js), fatta per sembrare vera:
// cielo fisico col sole e la luce che si riflette sulle cose, terreno con erba, sassi e sentieri,
// mare con le onde, alberi veri, case italiane con persiane e tetti di coppi, soldati con la mimetica
// che camminano, casse militari, esplosioni col fumo, e alla fine un'immagine con bagliori e colori da film.
// Regola di sempre: un avversario si vede solo quando si sente.

const V3 = { pronto: false, costruzioni: new Map(), bot: new Map(), casse: new Map(), cespugli: new Map(), tetti: new Map(), numeri: [], esplosioni: [], luci: [], fumo: [] };

// ---------------------------------------------------------------- texture disegnate al momento
// rumore "frattale" per macchie naturali: erba, pietra, intonaco
function rumore2D(seme = 1) {
  const p = new Uint8Array(512); let s = seme * 9301 + 49297;
  const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const perm = Array.from({ length: 256 }, (_, i) => i).sort(() => r() - 0.5);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const g = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
  const f = t => t * t * t * (t * (t * 6 - 15) + 10);
  const n = (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y);
    const u = f(x), v = f(y), a = p[X] + Y, b = p[X + 1] + Y;
    const l1 = g(p[a], x, y) + u * (g(p[b], x - 1, y) - g(p[a], x, y));
    const l2 = g(p[a + 1], x, y - 1) + u * (g(p[b + 1], x - 1, y - 1) - g(p[a + 1], x, y - 1));
    return l1 + v * (l2 - l1);
  };
  // somma di più scale, che si ripete senza giunture su un quadrato di lato "periodo"
  return (x, y, ottave = 4) => { let v = 0, a = 0.5, fr = 1; for (let o = 0; o < ottave; o++) { v += a * n(x * fr, y * fr); a *= 0.5; fr *= 2; } return v; };
}
function telaDisegno(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function texturaDa(c, ripeti = 1, colore = true) {
  const T = THREE, t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(ripeti, ripeti);
  if (colore) t.encoding = T.sRGBEncoding;
  t.anisotropy = V3.r ? V3.r.capabilities.getMaxAnisotropy() : 4;
  return t;
}
// dalla mappa delle altezze (in grigio) ricavo la mappa delle normali: dà rilievo con la luce
function normaliDa(c, forza = 2) {
  const w = c.width, h = c.height, src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const [o, x] = telaDisegno(w, h), img = x.createImageData(w, h), d = img.data;
  const a = (i, j) => src[(((j + h) % h) * w + ((i + w) % w)) * 4] / 255;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = (a(i + 1, j) - a(i - 1, j)) * forza, dy = (a(i, j + 1) - a(i, j - 1)) * forza;
    const l = Math.hypot(dx, dy, 1), k = (j * w + i) * 4;
    d[k] = (-dx / l * 0.5 + 0.5) * 255; d[k + 1] = (-dy / l * 0.5 + 0.5) * 255; d[k + 2] = (1 / l * 0.5 + 0.5) * 255; d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return o;
}
// una superficie: colore e rilievo, disegnati da una funzione che dà colore [r,g,b] e altezza (0..1) per ogni punto
function superficieDa(lato, fn, ripeti, forza = 2) {
  const [c, x] = telaDisegno(lato, lato), [ca, xa] = telaDisegno(lato, lato);
  const img = x.createImageData(lato, lato), alt = xa.createImageData(lato, lato);
  for (let j = 0; j < lato; j++) for (let i = 0; i < lato; i++) {
    const [r, g, b, h] = fn(i / lato, j / lato), k = (j * lato + i) * 4;
    img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
    alt.data[k] = alt.data[k + 1] = alt.data[k + 2] = lim(h, 0, 1) * 255; alt.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0); xa.putImageData(alt, 0, 0);
  return { map: texturaDa(c, ripeti), normalMap: texturaDa(normaliDa(ca, forza), ripeti, false) };
}
const mescola = (a, b, t) => a + (b - a) * t;

function preparaTexture() {
  const N = rumore2D(7), M = rumore2D(13), P = 4; // P: periodo del rumore per piastrellare
  const per = (u, v, s, o) => N(u * s, v * s, o);
  V3.tex = {};
  // erba: verdi diversi, ciuffi più chiari, un po' di terra
  V3.tex.erba = superficieDa(512, (u, v) => {
    const g = per(u, v, 8, 5), fine = M(u * 64, v * 64, 2), fili = M(u * 180, v * 30, 1), terra = lim((per(u, v, 3, 3) - 0.18) * 4, 0, 1);
    const secco = lim((per(u, v, 2, 4) + 0.1) * 2.2, 0, 1);                    // chiazze d'erba bruciata dal sole
    let r = 52 + g * 30 + fine * 20 + fili * 14, gg = 74 + g * 34 + fine * 24 + fili * 18, b = 34 + g * 12 + fine * 8;
    r = mescola(r, 118 + fine * 20, secco * 0.45); gg = mescola(gg, 104 + fine * 18, secco * 0.45); b = mescola(b, 58 + fine * 10, secco * 0.45);
    r = mescola(r, 96, terra * 0.65); gg = mescola(gg, 78, terra * 0.65); b = mescola(b, 54, terra * 0.65);
    return [r, gg, b, 0.45 + fine * 0.35 + fili * 0.35 + g * 0.2];
  }, 30, 3);
  // ciottoli della piazza: pietre arrotondate con le fughe scure
  V3.tex.ciottoli = superficieDa(512, (u, v) => {
    const cx = u * 14, cy = v * 14 + ((Math.floor(u * 14) % 2) * 0.5), fx = cx - Math.floor(cx) - 0.5, fy = cy - Math.floor(cy) - 0.5;
    const d = Math.hypot(fx * 1.1, fy) + M(u * 40, v * 40, 2) * 0.12, pietra = lim((0.48 - d) * 9, 0, 1);
    const tinta = N(Math.floor(cx) * 0.37, Math.floor(cy) * 0.53, 1) * 30 + M(u * 90, v * 90, 2) * 12;
    const c = mescola(82, 118 + tinta, pietra);
    return [c, c * 0.96, c * 0.9, pietra * (0.7 + M(u * 50, v * 50, 2) * 0.3)];
  }, 26, 3);
  // sabbia della spiaggia
  V3.tex.sabbia = superficieDa(256, (u, v) => { const g = per(u, v, 6, 4) * 20 + M(u * 80, v * 80, 2) * 14; return [222 + g, 202 + g, 158 + g * 0.7, 0.5 + g / 60]; }, 40, 1.5);
  // terra battuta dei sentieri
  V3.tex.terra = superficieDa(256, (u, v) => { const g = per(u, v, 6, 5) * 30 + M(u * 70, v * 70, 2) * 18; return [118 + g, 92 + g * 0.8, 64 + g * 0.6, 0.5 + g / 50]; }, 6, 2.5);
  // intonaco delle case: un po' sporco in basso, macchie di umidità
  V3.tex.intonaco = superficieDa(512, (u, v) => { const colata = Math.max(0, N(u * 30, v * 1.5, 2)) * 26 * (0.4 + v * 0.6), g = per(u, v, 4, 5) * 18 + M(u * 120, v * 120, 2) * 8 - colata, sporco = Math.max(0, v - 0.72) * 90; return [224 + g - sporco, 214 + g - sporco, 194 + g * 0.8 - sporco, 0.5 + M(u * 120, v * 120, 2) * 0.4]; }, 1, 1.5);
  // pietra (zoccolo delle case, fontana, rocce)
  V3.tex.pietra = superficieDa(256, (u, v) => { const g = per(u, v, 5, 5) * 40 + M(u * 60, v * 60, 3) * 25, crepa = Math.abs(N(u * 9, v * 9, 3)) < 0.03 ? -40 : 0, lich = lim((M(u * 14 + 3, v * 14, 3) - 0.25) * 3, 0, 1); return [mescola(98 + g + crepa, 104, lich * 0.5), mescola(96 + g + crepa, 108, lich * 0.5), mescola(90 + g + crepa, 70, lich * 0.5), 0.5 + (g + crepa) / 70]; }, 2, 4);
  // mattoni del campanile
  V3.tex.mattoni = superficieDa(512, (u, v) => {
    const fila = Math.floor(v * 32), x = u * 12 + (fila % 2) * 0.5, malta = (v * 32 - fila) < 0.12 || (x - Math.floor(x)) < 0.05;
    const t = N(Math.floor(x) * 0.7, fila * 0.3, 1) * 40 + M(u * 100, v * 100, 2) * 15;
    return malta ? [170, 160, 145, 0.1] : [150 + t, 78 + t * 0.6, 50 + t * 0.4, 0.8];
  }, 2, 3);
  // coppi del tetto: file ondulate di terracotta
  V3.tex.coppi = superficieDa(512, (u, v) => {
    const onda = Math.sin(u * 16 * Math.PI * 2) * 0.5 + 0.5, fila = (v * 10) % 1, ombraFila = fila < 0.15 ? 0.6 : 1;
    const t = N(Math.floor(u * 16) * 0.9, Math.floor(v * 10) * 0.7, 1) * 30 + M(u * 80, v * 80, 2) * 12;
    return [(160 + t) * (0.75 + onda * 0.25) * ombraFila, (78 + t * 0.5) * (0.75 + onda * 0.25) * ombraFila, (52 + t * 0.3) * (0.75 + onda * 0.25) * ombraFila, onda * 0.8 + (1 - fila) * 0.2];
  }, 2, 4);
  // corteccia
  V3.tex.corteccia = superficieDa(256, (u, v) => { const g = N(u * 20, v * 3, 4) * 50; return [82 + g, 62 + g * 0.8, 44 + g * 0.6, 0.5 + g / 60]; }, 1, 4);
  // fogliame (chioma) e aghi di pino
  V3.tex.foglie = superficieDa(256, (u, v) => { const g = M(u * 40, v * 40, 3) * 50, ombra = per(u, v, 5, 3) * 26, foglia = M(u * 110, v * 110, 1) * 22; return [40 + g * 0.8 + ombra + foglia * 0.6, 64 + g + ombra + foglia, 30 + g * 0.4 + foglia * 0.3, 0.4 + g / 70 + foglia / 50]; }, 3, 5);
  V3.tex.aghi = superficieDa(256, (u, v) => { const g = N(u * 60, v * 8, 3) * 46, ago = M(u * 160, v * 20, 1) * 20; return [26 + g * 0.4 + ago * 0.4, 50 + g * 0.8 + ago, 34 + g * 0.3 + ago * 0.3, 0.45 + g / 60 + ago / 40]; }, 3, 5);
  // legno (costruzioni dei giocatori, persiane, pavimenti)
  V3.tex.legno = superficieDa(256, (u, v) => {
    const asse = Math.floor(v * 8), venatura = N(u * 3, v * 40 + asse * 7, 3) * 40, fuga = (v * 8 - asse) < 0.06;
    return fuga ? [50, 34, 22, 0] : [140 + venatura, 96 + venatura * 0.8, 58 + venatura * 0.5, 0.6];
  }, 1, 2.5);
  // mimetiche delle squadre: bosco, deserto, città, notte
  V3.tex.mimetiche = [
    [[86, 92, 54], [58, 66, 40], [104, 84, 54], [34, 36, 28]],
    [[150, 128, 92], [118, 96, 68], [92, 76, 54], [166, 146, 110]],
    [[120, 124, 128], [86, 90, 96], [150, 152, 150], [54, 56, 62]],
    [[60, 70, 92], [40, 46, 64], [86, 96, 112], [26, 30, 40]],
  ].map((tinte, k) => {
    const R = rumore2D(31 + k);
    return superficieDa(256, (u, v) => { const n = R(u * 6, v * 6, 3) + R(u * 13 + 5, v * 13, 2) * 0.4; const i = n < -0.15 ? 0 : n < 0.05 ? 1 : n < 0.22 ? 2 : 3; const c = tinte[i], f = M(u * 90, v * 90, 1) * 8; return [c[0] + f, c[1] + f, c[2] + f, 0.5]; }, 2, 1).map;
  });
  // fumo: nuvoletta morbida
  const [cf, xf] = telaDisegno(128, 128);
  const gr = xf.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  xf.fillStyle = gr; xf.fillRect(0, 0, 128, 128);
  V3.tex.fumo = texturaDa(cf, 1);
  // ciuffo d'erba con trasparenza
  const [ce, xe] = telaDisegno(128, 128);
  for (let i = 0; i < 26; i++) {
    const x0 = 20 + Math.random() * 88, curva = (Math.random() - 0.5) * 40, alto = 50 + Math.random() * 70;
    const secco = Math.random() < 0.3; xe.strokeStyle = secco ? `rgb(${120 + Math.random() * 40},${108 + Math.random() * 30},${62 + Math.random() * 20})` : `rgb(${46 + Math.random() * 30},${72 + Math.random() * 40},${28 + Math.random() * 18})`; xe.lineWidth = 1.2 + Math.random() * 1.6;
    xe.beginPath(); xe.moveTo(x0, 128); xe.quadraticCurveTo(x0 + curva * 0.3, 128 - alto * 0.5, x0 + curva, 128 - alto); xe.stroke();
  }
  V3.tex.ciuffo = texturaDa(ce, 1);
  // scritta sulle casse militari
  const [cc, xc] = telaDisegno(256, 128);
  xc.fillStyle = '#4b5a32'; xc.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 400; i++) { xc.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; xc.fillRect(Math.random() * 256, Math.random() * 128, 2, 2); }
  xc.fillStyle = 'rgba(230,220,180,0.85)'; xc.font = 'bold 34px Helvetica, sans-serif'; xc.textAlign = 'center'; xc.fillText('MUNIZIONI', 128, 76);
  xc.strokeStyle = 'rgba(0,0,0,0.5)'; xc.lineWidth = 6; xc.strokeRect(6, 6, 244, 116);
  V3.tex.cassa = texturaDa(cc, 1);
}

// ---------------------------------------------------------------- avvio
function iniziaGrafica3D() {
  if (V3.pronto || !window.THREE) return V3.pronto;
  const T = THREE;
  if (T.ColorManagement) T.ColorManagement.legacyMode = false;
  const tela3d = $('scena3d');
  const r = new T.WebGLRenderer({ canvas: tela3d, antialias: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
  r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 0.85;
  const scena = new T.Scene();
  const camera = new T.PerspectiveCamera(72, innerWidth / innerHeight, 0.06, 6000);
  camera.rotation.order = 'YXZ';
  Object.assign(V3, { T, r, scena, camera, tela3d });
  preparaTexture();

  // il sole: alto nel pomeriggio, un po' di traverso, così le ombre sono lunghe e danno profondità
  const elevazione = 30 * Math.PI / 180, azimut = 140 * Math.PI / 180;
  V3.dirSole = new T.Vector3(Math.cos(elevazione) * Math.sin(azimut), Math.sin(elevazione), Math.cos(elevazione) * Math.cos(azimut));
  // cielo fisico (diffusione della luce nell'atmosfera)
  if (T.Sky) {
    const cielo = new T.Sky(); cielo.scale.setScalar(5000);
    const u = cielo.material.uniforms;
    u.turbidity.value = 4.5; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.9;
    u.sunPosition.value.copy(V3.dirSole);
    scena.add(cielo); V3.cielo = cielo;
    // la luce del cielo si riflette su tutti i materiali (ambiente)
    try {
      const pm = new T.PMREMGenerator(r), sc = new T.Scene(), copia = new T.Sky(); copia.scale.setScalar(5000);
      copia.material.uniforms.turbidity.value = 3.2; copia.material.uniforms.rayleigh.value = 2.2; copia.material.uniforms.sunPosition.value.copy(V3.dirSole);
      sc.add(copia);
      scena.environment = pm.fromScene(sc, 0, 0.1, 6000).texture;
      pm.dispose();
    } catch (e) { /* senza riflessi dell'ambiente si vede lo stesso */ }
  } else scena.background = new T.Color(0x9cc4ea);
  scena.fog = new T.FogExp2(0xa8bccd, 0.0017);

  scena.add(new T.HemisphereLight(0xc8dcf5, 0x4a4630, 0.3));
  const sole = new T.DirectionalLight(0xffe6c4, 3.3);
  sole.castShadow = true; sole.shadow.mapSize.set(4096, 4096);
  Object.assign(sole.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 });
  sole.shadow.bias = -0.0004; sole.shadow.normalBias = 0.04;
  scena.add(sole); scena.add(sole.target); V3.sole = sole;
  // luci per lampi ed esplosioni: poche e sempre le stesse (aggiungerne di nuove rallenta tutto)
  for (let i = 0; i < 4; i++) { const l = new T.PointLight(0xffa860, 0, 18, 2); scena.add(l); V3.luci.push({ l, t: 9, dur: 0.1, forza: 0 }); }

  costruisciIsola3D();
  costruisciLuoghi3D();

  // tempesta: un muro di nuvole elettriche che si muovono
  V3.tempesta = new T.Mesh(new T.CylinderGeometry(1, 1, 260, 128, 1, true), new T.ShaderMaterial({
    transparent: true, side: T.DoubleSide, depthWrite: false,
    uniforms: { tempo: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float tempo; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * n(p); p *= 2.0; a *= 0.5; } return v; }
      void main(){
        vec2 p = vec2(vUv.x * 60.0, vUv.y * 8.0);
        float nuv = fbm(p + vec2(tempo * 0.3, -tempo * 0.15)) * 0.7 + fbm(p * 2.3 - vec2(tempo * 0.5, 0.0)) * 0.3;
        float lampo = step(0.985, fract(sin(floor(tempo * 3.0) * 12.9898) * 43758.5)) * smoothstep(0.55, 0.9, nuv);
        vec3 c = mix(vec3(0.16, 0.12, 0.32), vec3(0.45, 0.32, 0.75), nuv) + lampo * vec3(0.9, 0.85, 1.0);
        gl_FragColor = vec4(c, (0.28 + nuv * 0.38) * smoothstep(1.0, 0.85, vUv.y));
      }`,
  }));
  V3.tempesta.position.y = 120; scena.add(V3.tempesta);
  V3.prossima = new T.Mesh(new T.RingGeometry(0.99, 1, 160), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: T.DoubleSide, depthWrite: false }));
  V3.prossima.rotation.x = -Math.PI / 2; V3.prossima.position.y = 0.1; scena.add(V3.prossima);

  // arma in mano, figlia della telecamera, con una luce sua per non essere nera nell'ombra
  V3.arma = new T.Group(); camera.add(V3.arma); scena.add(camera);
  const luceArma = new T.PointLight(0xffffff, 0.35, 2); luceArma.position.set(0.3, 0.2, 0); camera.add(luceArma);
  // anteprima di costruzione mentre tieni premuto B o N
  V3.anteprima = new T.Mesh(new T.BoxGeometry(3.4, 2.6, 0.25), new T.MeshBasicMaterial({ color: 0x8fc8ff, transparent: true, opacity: 0.22, depthWrite: false }));
  V3.anteprima.visible = false; scena.add(V3.anteprima);
  V3.legno = new T.MeshStandardMaterial({ map: V3.tex.legno.map, normalMap: V3.tex.legno.normalMap, roughness: 0.82 });

  preparaRitocco();
  addEventListener('resize', () => {
    r.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    if (V3.composer) { V3.composer.setSize(innerWidth, innerHeight); V3.bloom && V3.bloom.setSize(innerWidth, innerHeight); }
  });
  r.setSize(innerWidth, innerHeight, false);
  V3.pronto = true;
  return true;
}

// L'immagine finale: si disegna la scena in alta gamma, si aggiungono i bagliori (sole, lampi, esplosioni),
// poi i colori da film (ACES), una leggera vignettatura e una grana finissima. Se qualcosa manca, si disegna normale.
function preparaRitocco() {
  const T = V3.T, r = V3.r;
  try {
    if (!T.EffectComposer || !T.UnrealBloomPass || !r.capabilities.isWebGL2) return;
    const dpr = r.getPixelRatio();
    const rt = new T.WebGLRenderTarget(innerWidth * dpr, innerHeight * dpr, { type: T.HalfFloatType, samples: 4 });
    const comp = new T.EffectComposer(r, rt);
    comp.addPass(new T.RenderPass(V3.scena, V3.camera));
    const bloom = new T.UnrealBloomPass(new T.Vector2(innerWidth, innerHeight), 0.32, 0.5, 0.92);
    comp.addPass(bloom);
    const finale = new T.ShaderPass({
      uniforms: { tDiffuse: { value: null }, esposizione: { value: 0.72 }, tempo: { value: 0 }, dolore: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float esposizione; uniform float tempo; uniform float dolore; varying vec2 vUv;
        vec3 aces(vec3 c){ c *= esposizione / 0.6; mat3 i = mat3(0.59719,0.07600,0.02840, 0.35458,0.90834,0.13383, 0.04823,0.01566,0.83777);
          mat3 o = mat3(1.60475,-0.10208,-0.00327, -0.53108,1.10813,-0.07276, -0.07367,-0.00605,1.07602);
          c = i * c; vec3 a = c * (c + 0.0245786) - 0.000090537; vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081; return clamp(o * (a / b), 0.0, 1.0); }
        float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + tempo) * 43758.5453); }
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          c = aces(c);
          c = mix(c, c * vec3(1.02, 1.0, 0.97), 0.5);                    // appena caldo, come il pomeriggio
          c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 0.84);    // colori meno accesi, più veri
          c = (c - 0.5) * 1.12 + 0.5;
          c = mix(c, c * vec3(0.96, 1.0, 1.05), smoothstep(0.5, 0.0, dot(c, vec3(0.333))));  // ombre appena fredde                                     // un filo di contrasto in più
          float v = smoothstep(0.95, 0.35, length(vUv - 0.5));            // vignettatura
          c *= mix(0.72, 1.0, v);
          c = mix(c, c * vec3(1.25, 0.55, 0.5), dolore * (1.0 - v) * 0.8); // ferito: i bordi diventano rossi
          c = pow(c, vec3(1.0 / 2.2));                                    // colori dello schermo
          c += (rnd(vUv * 1000.0) - 0.5) * 0.018;                         // grana
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    comp.addPass(finale);
    r.toneMapping = T.NoToneMapping; r.outputEncoding = T.LinearEncoding;
    Object.assign(V3, { composer: comp, bloom, finale });
  } catch (e) { console.error('ritocco non disponibile', e); V3.composer = null; r.toneMapping = T.ACESFilmicToneMapping; r.outputEncoding = T.sRGBEncoding; }
}

function ombra(m) { m.castShadow = true; m.receiveShadow = true; return m; }
function materiale(nome, extra = {}) { const t = V3.tex[nome]; return new V3.T.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.92, ...extra }); }

// ---------------------------------------------------------------- l'isola
function costruisciIsola3D() {
  const T = V3.T, S = V3.scena;
  // il mare: onde che si muovono, il riflesso del cielo e il luccichio del sole
  const mare = new T.Mesh(new T.PlaneGeometry(6000, 6000, 1, 1), new T.ShaderMaterial({
    uniforms: { tempo: { value: 0 }, sole: { value: V3.dirSole }, profondo: { value: new T.Color(0x0b3a55) }, chiaro: { value: new T.Color(0x2d7f9e) }, cielo: { value: new T.Color(0xa9c8e6) } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float tempo; uniform vec3 sole; uniform vec3 profondo; uniform vec3 chiaro; uniform vec3 cielo; varying vec3 vW;
      vec3 onda(vec2 p, vec2 d, float f, float v, float a){ float k = dot(p, d) * f + tempo * v; return vec3(d * cos(k) * a * f, 0.0); }
      void main(){
        vec2 p = vW.xz;
        vec3 g = onda(p, normalize(vec2(1.0,0.3)), 0.35, 1.3, 0.25) + onda(p, normalize(vec2(-0.4,1.0)), 0.6, 1.9, 0.12) + onda(p, normalize(vec2(0.7,-0.8)), 1.7, 2.6, 0.04) + onda(p, normalize(vec2(-0.9,-0.2)), 3.1, 3.4, 0.02);
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 c = mix(mix(profondo, chiaro, 0.35), cielo, 0.15 + fres * 0.75);
        vec3 h = normalize(sole + v); c += vec3(1.0, 0.92, 0.8) * pow(max(dot(n, h), 0.0), 320.0) * 6.0;
        float riva = smoothstep(115.0, 100.0, length(p)); c = mix(c, vec3(0.75, 0.85, 0.85), riva * 0.35);
        float d = length(cameraPosition - vW); c = mix(c, cielo, 1.0 - exp(-d * 0.0016));
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  mare.rotation.x = -Math.PI / 2; mare.position.y = -0.6; S.add(mare); V3.mare = mare;
  // spiaggia che scende in mare, e l'isola d'erba con piccole ondulazioni ai bordi
  const spiaggia = new T.Mesh(new T.RingGeometry(92, 112, 160, 4), materiale('sabbia', { roughness: 1 }));
  { const p = spiaggia.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const rr = Math.hypot(p.getX(i), p.getY(i)); p.setZ(i, -lim((rr - 97) / 15, 0, 1) * 1.2); } spiaggia.geometry.computeVertexNormals(); }
  spiaggia.rotation.x = -Math.PI / 2; spiaggia.position.y = -0.02; spiaggia.receiveShadow = true; S.add(spiaggia);
  const pratoG = new T.CircleGeometry(97.5, 180, 0, PI2);
  const N = rumore2D(5), colori = [], c = new T.Color();
  for (let i = 0; i < pratoG.attributes.position.count; i++) {
    const x = pratoG.attributes.position.getX(i), y = pratoG.attributes.position.getY(i), n = N(x / 30, y / 30, 3);
    const n2 = N(x / 9 + 40, y / 9, 2); c.setRGB(0.9 + n * 0.22 + n2 * 0.08, 0.92 + n * 0.12 + n2 * 0.06, 0.86 + n * 0.08);
    colori.push(c.r, c.g, c.b);
  }
  pratoG.setAttribute('color', new T.Float32BufferAttribute(colori, 3));
  const prato = new T.Mesh(pratoG, materiale('erba', { vertexColors: true, roughness: 0.97 }));
  prato.rotation.x = -Math.PI / 2; prato.receiveShadow = true; S.add(prato);
  // sentieri di terra dalla piazza ai luoghi
  const terra = materiale('terra', { roughness: 1, transparent: true, opacity: 0.95, polygonOffset: true, polygonOffsetFactor: -1 });
  for (const L of Object.values(LUOGHI)) {
    if (L.x === 0 && L.z === 0) continue;
    const d = Math.hypot(L.x, L.z), strada = new T.Mesh(new T.PlaneGeometry(3.2, d - 24), terra);
    strada.rotation.x = -Math.PI / 2; strada.rotation.z = -Math.atan2(L.x, -L.z);
    strada.position.set(L.x / d * (d / 2 + 6), 0.015, L.z / d * (d / 2 + 6)); strada.receiveShadow = true; S.add(strada);
  }
  // erba alta: tanti ciuffi sparsi, non sopra la piazza e le case
  const ciuffoMat = new T.MeshStandardMaterial({ map: V3.tex.ciuffo, alphaTest: 0.5, side: T.DoubleSide, roughness: 1 });
  const ciuffoG = new T.PlaneGeometry(0.9, 0.7); ciuffoG.translate(0, 0.35, 0);
  const posti = [];
  for (let i = 0; i < 9000 && posti.length < 6000; i++) {
    const a = Math.random() * PI2, d = Math.sqrt(Math.random()) * 95, x = Math.sin(a) * d, z = -Math.cos(a) * d;
    if (Math.hypot(x, z) < 20) continue;
    posti.push([x, z]);
  }
  for (const giro of [0, Math.PI / 2]) {
    const im = new T.InstancedMesh(ciuffoG, ciuffoMat, posti.length), m = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3();
    posti.forEach(([x, z], i) => { q.setFromAxisAngle(new T.Vector3(0, 1, 0), giro + (i * 2.39) % PI2); const k = 0.6 + (i % 7) / 10; s.set(k, k, k); m.compose(new T.Vector3(x, 0, z), q, s); im.setMatrixAt(i, m); });
    im.receiveShadow = true; S.add(im);
  }
  V3.ciuffi = posti;
}

// i cinque luoghi, palazzi, alberi e rocce
function costruisciLuoghi3D() {
  const T = V3.T, S = V3.scena, L = LUOGHI;
  const tinta = c => new T.MeshStandardMaterial({ color: c, roughness: 0.85 });
  // Piazza: ciottoli
  const lastricato = new T.Mesh(new T.CircleGeometry(20, 96), materiale('ciottoli', { roughness: 0.9 }));
  lastricato.rotation.x = -Math.PI / 2; lastricato.position.y = 0.025; lastricato.receiveShadow = true; S.add(lastricato);
  // palazzi intorno alla piazza: intonaci colorati, finestre con le persiane verdi, tetti di coppi
  const intonaco = materiale('intonaco'), coppi = materiale('coppi', { roughness: 0.8 });
  const tinte = [0xd8b480, 0xd09670, 0xd6c4a0, 0xc07c5e, 0xd8b88c, 0xc08e70, 0xd2c6ae, 0xd0a466, 0xc48c6c, 0xd6b08c, 0xc89e80, 0xd4bf98];
  const vetro = new T.MeshStandardMaterial({ color: 0x1c2630, roughness: 0.08, metalness: 0.4 }), persiana = new T.MeshStandardMaterial({ color: 0x3d5e3a, roughness: 0.7 });
  const finestre = [], persiane = [];
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * PI2 + 0.26, d = caso(38, 44), piani = casoInt(2, 4), h = piani * 3.2 + 0.6, w = caso(9, 12);
    const m = intonaco.clone(); m.color = new T.Color(tinte[i]);
    const casa = ombra(new T.Mesh(new T.BoxGeometry(w, h, 8), m));
    casa.position.set(Math.sin(a) * d, h / 2, -Math.cos(a) * d); casa.rotation.y = -a; S.add(casa);
    const zoccolo = ombra(new T.Mesh(new T.BoxGeometry(w + 0.12, 0.9, 8.12), materiale('pietra'))); zoccolo.position.set(casa.position.x, 0.45, casa.position.z); zoccolo.rotation.y = -a; S.add(zoccolo);
    const cornice = ombra(new T.Mesh(new T.BoxGeometry(w + 0.5, 0.28, 8.5), intonaco)); cornice.position.set(casa.position.x, h - 0.1, casa.position.z); cornice.rotation.y = -a; S.add(cornice);
    const tetto = ombra(new T.Mesh(new T.CylinderGeometry(0.01, w * 0.62, 2.6, 4, 1), coppi));
    tetto.position.set(casa.position.x, h + 1.3, casa.position.z); tetto.rotation.y = -a + Math.PI / 4; tetto.scale.set(1, 1, 0.66); S.add(tetto);
    for (let p = 0; p < piani; p++) for (let k = 0; k < 3; k++) {
      const off = (k - 1) * (w / 3.4), y = 2 + p * 3.2;
      const fx = casa.position.x - Math.sin(a) * 4.02 + Math.cos(a) * off, fz = casa.position.z + Math.cos(a) * 4.02 + Math.sin(a) * off;
      finestre.push([fx, y, fz, -a + Math.PI]);
      for (const lato of [-1, 1]) persiane.push([fx + Math.cos(a) * lato * 0.78, y, fz + Math.sin(a) * lato * 0.78, -a + Math.PI]);
    }
  }
  const metti = (geo, mat, elenco, ombre = false) => {
    const im = new T.InstancedMesh(geo, mat, elenco.length), m = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(1, 1, 1);
    elenco.forEach(([x, y, z, r], i) => { q.setFromAxisAngle(new T.Vector3(0, 1, 0), r); m.compose(new T.Vector3(x, y, z), q, s); im.setMatrixAt(i, m); });
    im.castShadow = ombre; im.receiveShadow = true; S.add(im); return im;
  };
  metti(new T.BoxGeometry(1.0, 1.5, 0.08), vetro, finestre);
  metti(new T.BoxGeometry(0.55, 1.6, 0.06), persiana, persiane);
  // Campanile: mattoni, cella campanaria con gli archi, guglia
  const mattoni = materiale('mattoni');
  const torre = ombra(new T.Mesh(new T.BoxGeometry(5, 24, 5), mattoni)); torre.position.set(L.campanile.x, 12, L.campanile.z); S.add(torre);
  const cella = ombra(new T.Mesh(new T.BoxGeometry(5.6, 4, 5.6), mattoni)); cella.position.set(L.campanile.x, 26, L.campanile.z); S.add(cella);
  for (let i = 0; i < 4; i++) { const arco = new T.Mesh(new T.BoxGeometry(2, 2.6, 0.2), tinta(0x1a140f)); const a = i * Math.PI / 2; arco.position.set(L.campanile.x + Math.sin(a) * 2.85, 26, L.campanile.z - Math.cos(a) * 2.85); arco.rotation.y = -a; S.add(arco); }
  const guglia = ombra(new T.Mesh(new T.ConeGeometry(4.2, 7, 4), coppi)); guglia.position.set(L.campanile.x, 31.5, L.campanile.z); guglia.rotation.y = Math.PI / 4; S.add(guglia);
  // Fontana: vasca di pietra, acqua, colonna
  const pietra = materiale('pietra');
  const vasca = ombra(new T.Mesh(new T.CylinderGeometry(4.5, 4.8, 0.9, 48), pietra)); vasca.position.set(L.fontana.x, 0.45, L.fontana.z); S.add(vasca);
  const acqua = new T.Mesh(new T.CylinderGeometry(4.1, 4.1, 0.1, 48), new T.MeshStandardMaterial({ color: 0x2a6a86, roughness: 0.05, metalness: 0.1 }));
  acqua.position.set(L.fontana.x, 0.86, L.fontana.z); S.add(acqua); V3.acqua = acqua;
  const colonna = ombra(new T.Mesh(new T.CylinderGeometry(0.5, 0.7, 3, 20), pietra)); colonna.position.set(L.fontana.x, 1.9, L.fontana.z); S.add(colonna);
  V3.getto = new T.Mesh(new T.ConeGeometry(0.9, 2.2, 24, 1, true), new T.MeshStandardMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.35, roughness: 0.1 }));
  V3.getto.position.set(L.fontana.x, 4.2, L.fontana.z); V3.getto.rotation.x = Math.PI; S.add(V3.getto);
  // Canile: cucce di legno e recinto
  const legno = materiale('legno');
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * PI2, x = L.canile.x + Math.sin(a) * 7, z = L.canile.z - Math.cos(a) * 7;
    const cuccia = ombra(new T.Mesh(new T.BoxGeometry(1.8, 1.4, 1.8), legno)); cuccia.position.set(x, 0.7, z); cuccia.rotation.y = -a; S.add(cuccia);
    const tettino = ombra(new T.Mesh(new T.ConeGeometry(1.5, 0.9, 4), coppi)); tettino.position.set(x, 1.85, z); tettino.rotation.y = -a + Math.PI / 4; S.add(tettino);
  }
  const pali = []; for (let i = 0; i < 48; i++) { const a = i / 48 * PI2; pali.push([L.canile.x + Math.sin(a) * 13, 0.6, L.canile.z - Math.cos(a) * 13, -a]); }
  metti(new T.BoxGeometry(0.12, 1.2, 0.12), legno, pali, true);
  // alberi: pini fitti nel Bosco, latifoglie sparse
  const pini = [], latifoglie = [];
  for (let i = 0; i < 110; i++) { const [x, z] = attorno(L.bosco.x, L.bosco.z, 24); pini.push([x, z, caso(0.8, 1.5)]); }
  for (let i = 0; i < 140; i++) {
    const a = caso(-Math.PI, Math.PI), d = caso(30, 92), x = Math.sin(a) * d, z = -Math.cos(a) * d;
    if (Object.values(L).some(l => Math.hypot(l.x - x, l.z - z) < 18) || Math.hypot(x, z) < 48) continue;
    latifoglie.push([x, z, caso(0.8, 1.35)]);
  }
  const corteccia = materiale('corteccia'), aghi = materiale('aghi', { roughness: 0.9, side: T.DoubleSide }), foglie = materiale('foglie', { roughness: 0.9 });
  const albero = (elenco, parti) => {
    for (const [geo, mat, y, sx] of parti) {
      const im = new T.InstancedMesh(geo, mat, elenco.length), m = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3();
      elenco.forEach(([x, z, k], i) => { q.setFromAxisAngle(new T.Vector3(0, 1, 0), (i * 1.7) % PI2); s.set(k * (sx || 1), k, k * (sx || 1)); m.compose(new T.Vector3(x + (sx ? Math.sin(i) * 0.3 : 0), y * k, z), q, s); im.setMatrixAt(i, m); });
      im.castShadow = true; im.receiveShadow = true; S.add(im);
    }
  };
  const chioma = (r, det = 2) => { const g = new T.IcosahedronGeometry(r, det), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const f = 1 + (Math.sin(p.getX(i) * 4.3) * Math.cos(p.getZ(i) * 3.7) + Math.cos(p.getY(i) * 5.1 + p.getX(i) * 2.3)) * 0.16; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.85, p.getZ(i) * f); } g.computeVertexNormals(); return g; };
  // un palco di rami del pino: il bordo è frastagliato (i rami) e cade verso il basso (il peso degli aghi)
  const palco = (r, h, seme) => {
    const geo = new T.ConeGeometry(r, h, 28, 4, true), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), basso = (h / 2 - y) / h; // 0 in cima, 1 al bordo
      const rami = 1 + (Math.sin(a * 9 + seme) * 0.5 + Math.sin(a * 23 + seme * 2) * 0.3 + Math.sin(a * 5 - seme) * 0.2) * 0.22 * basso;
      p.setXYZ(i, x * rami, y - basso * basso * h * 0.18 * (1 + Math.sin(a * 9 + seme) * 0.5), z * rami);
    }
    geo.computeVertexNormals(); return geo;
  };
  albero(pini, [[new T.CylinderGeometry(0.16, 0.34, 9.5, 9), corteccia, 4.7], [palco(2.6, 3.4, 1), aghi, 4.6], [palco(2.3, 3.2, 2), aghi, 6.0], [palco(1.9, 3.0, 3), aghi, 7.4],
    [palco(1.45, 2.7, 4), aghi, 8.7], [palco(1.0, 2.3, 5), aghi, 9.9], [palco(0.55, 1.8, 6), aghi, 11.0]]);
  // tronco con due rami, e la chioma fatta di sei ciuffi sfalsati: da lontano non sembra più un lecca-lecca
  const ramo = (ang, alto, lung) => { const g = new T.CylinderGeometry(0.08, 0.16, lung, 6); g.translate(0, lung / 2, 0); g.rotateZ(ang); g.translate(0, alto, 0); return g; };
  albero(latifoglie, [[new T.CylinderGeometry(0.2, 0.42, 4.6, 9), corteccia, 2.3], [ramo(0.7, 3.4, 2.2), corteccia, 0], [ramo(-0.6, 3.0, 2.0), corteccia, 0],
    [chioma(1.9), foglie, 5.2], [chioma(1.5).translate(1.3, 0.4, 0.4), foglie, 5.0], [chioma(1.4).translate(-1.2, 0.6, -0.5), foglie, 5.2],
    [chioma(1.3).translate(0.3, 1.3, -1.1), foglie, 5.4], [chioma(1.2).translate(-0.4, 1.6, 1.0), foglie, 5.3], [chioma(1.0).translate(0.2, 2.3, 0.1), foglie, 5.6]]);
  // rocce dalla forma irregolare
  const roccia = new T.IcosahedronGeometry(1, 3); { const p = roccia.attributes.position, R = rumore2D(77); for (let i = 0; i < p.count; i++) { const f = 0.8 + Math.abs(Math.sin(p.getX(i) * 5 + p.getZ(i) * 3)) * 0.18 + R(p.getX(i) * 2.2 + p.getY(i), p.getZ(i) * 2.2, 3) * 0.22; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.6, p.getZ(i) * f); } roccia.computeVertexNormals(); }
  const sassi = []; for (let i = 0; i < 45; i++) { const a = caso(-Math.PI, Math.PI), d = caso(22, 94); sassi.push([Math.sin(a) * d, -0.15, -Math.cos(a) * d, caso(0, 6), caso(0.4, 1.5)]); }
  const imR = new T.InstancedMesh(roccia, pietra, sassi.length), mm = new T.Matrix4(), qq = new T.Quaternion(), ss = new T.Vector3();
  sassi.forEach(([x, y, z, r, k], i) => { qq.setFromEuler(new T.Euler(r * 0.3, r, r * 0.2)); ss.set(k, k, k); mm.compose(new T.Vector3(x, y, z), qq, ss); imR.setMatrixAt(i, mm); });
  imR.castShadow = true; imR.receiveShadow = true; S.add(imR);
  // ombre di contatto: dove un oggetto tocca terra la luce del cielo non arriva, e la base si scurisce
  const [co, xo] = telaDisegno(128, 128), go = xo.createRadialGradient(64, 64, 0, 64, 64, 64);
  go.addColorStop(0, 'rgba(0,0,0,0.55)'); go.addColorStop(0.55, 'rgba(0,0,0,0.25)'); go.addColorStop(1, 'rgba(0,0,0,0)');
  xo.fillStyle = go; xo.fillRect(0, 0, 128, 128);
  const macchia = new T.MeshBasicMaterial({ map: texturaDa(co, 1, false), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const basi = [...latifoglie.map(([x, z, k]) => [x, z, 3.2 * k]), ...pini.map(([x, z, k]) => [x, z, 2.6 * k]), ...sassi.map(([x, , z, , k]) => [x, z, 2.4 * k])];
  const pianoO = new T.PlaneGeometry(1, 1); pianoO.rotateX(-Math.PI / 2);
  const imO = new T.InstancedMesh(pianoO, macchia, basi.length), mo = new T.Matrix4();
  basi.forEach(([x, z, r], i) => { mo.makeScale(r, 1, r); mo.setPosition(x, 0.03, z); imO.setMatrixAt(i, mo); });
  imO.renderOrder = 1; S.add(imO); V3.macchiaBase = macchia;
}

// ---------------------------------------------------------------- soldati
// Un soldato fatto di pezzi: gambe e braccia che si muovono camminando, giubbotto con le tasche, elmetto, zaino, fucile.
function meshBot(b, i) {
  const T = V3.T, gruppo = new T.Group();
  const squadra = G.modalita === 'battaglia' && b.team !== undefined ? b.team : i;
  const mimetica = new T.MeshStandardMaterial({ map: V3.tex.mimetiche[squadra % 4], roughness: 0.9 });
  const scuro = new T.MeshStandardMaterial({ color: 0x2a2c26, roughness: 0.75 }), pelle = new T.MeshStandardMaterial({ color: 0xc89a78, roughness: 0.65 });
  const giubbotto = new T.MeshStandardMaterial({ color: [0x4b5232, 0x8c7a56, 0x4a4e52, 0x2f3646][squadra % 4], roughness: 0.8 });
  const metallo = new T.MeshStandardMaterial({ color: 0x1a1b1d, metalness: 0.7, roughness: 0.35 });
  const pezzo = (geo, mat, x, y, z, padre = gruppo) => { const m = ombra(new T.Mesh(geo, mat)); m.position.set(x, y, z); padre.add(m); return m; };
  // gambe, con il perno all'anca
  const gambe = [-0.12, 0.12].map(x => { const anca = new T.Group(); anca.position.set(x, 0.95, 0); gruppo.add(anca); pezzo(new T.CapsuleGeometry(0.085, 0.72, 4, 8), mimetica, 0, -0.45, 0, anca); pezzo(new T.BoxGeometry(0.13, 0.11, 0.26), scuro, 0, -0.9, -0.04, anca); return anca; });
  // busto, giubbotto e tasche
  const busto = pezzo(new T.CapsuleGeometry(0.2, 0.42, 4, 10), mimetica, 0, 1.3, 0); busto.scale.set(1.1, 1, 0.75);
  pezzo(new T.BoxGeometry(0.44, 0.42, 0.3), giubbotto, 0, 1.33, 0);
  for (const x of [-0.13, 0, 0.13]) pezzo(new T.BoxGeometry(0.1, 0.13, 0.06), giubbotto, x, 1.22, -0.17);
  pezzo(new T.BoxGeometry(0.34, 0.42, 0.18), giubbotto, 0, 1.35, 0.24); // zaino
  // braccia in posizione di tiro
  const braccia = [[-0.27, 0.25], [0.27, -0.15]].map(([x, rot]) => { const spalla = new T.Group(); spalla.position.set(x, 1.52, 0); spalla.rotation.x = -1.2; spalla.rotation.z = rot; gruppo.add(spalla); pezzo(new T.CapsuleGeometry(0.07, 0.5, 4, 8), mimetica, 0, -0.3, 0, spalla); pezzo(new T.SphereGeometry(0.06, 8, 6), scuro, 0, -0.62, 0, spalla); return spalla; });
  // testa, elmetto con la copertura, occhiali
  pezzo(new T.CylinderGeometry(0.07, 0.08, 0.1, 10), pelle, 0, 1.66, 0);
  pezzo(new T.SphereGeometry(0.13, 16, 12), pelle, 0, 1.8, 0);
  const elmo = pezzo(new T.SphereGeometry(0.155, 16, 10, 0, PI2, 0, Math.PI / 1.9), mimetica, 0, 1.83, 0.01); elmo.scale.set(1, 0.95, 1.08);
  pezzo(new T.BoxGeometry(0.2, 0.045, 0.06), metallo, 0, 1.82, -0.13);
  // fucile
  const fucile = new T.Group(); fucile.position.set(0.12, 1.36, -0.32); gruppo.add(fucile);
  pezzo(new T.BoxGeometry(0.06, 0.09, 0.62), metallo, 0, 0, -0.1, fucile); pezzo(new T.CylinderGeometry(0.018, 0.018, 0.3, 8), metallo, 0, 0.01, -0.55, fucile).rotation.x = Math.PI / 2;
  pezzo(new T.BoxGeometry(0.05, 0.16, 0.06), metallo, 0, -0.1, -0.05, fucile); pezzo(new T.BoxGeometry(0.05, 0.08, 0.22), metallo, 0, -0.02, 0.25, fucile);
  // lampo di bocca: luminoso (il bagliore lo fa splendere)
  const lampo = new T.Mesh(new T.SphereGeometry(0.12, 8, 6), new T.MeshBasicMaterial({ color: new T.Color(6, 4, 1.8) }));
  lampo.position.set(0, 0.01, -0.75); lampo.visible = false; fucile.add(lampo);
  // il nome sopra la testa, più piccolo; i compagni in azzurro
  const compagno = G.modalita === 'battaglia' && b.team === B.mioTeam;
  const nome = scritta3D(b.nome || b.def.nome, compagno ? '#7fd4ff' : '#ffffff', 0.32, false); nome.position.y = 2.25; gruppo.add(nome);
  gruppo.userData = { gambe, braccia, lampo, px: b.x, pz: b.z, dir: 0, passo: Math.random() * 6 };
  V3.scena.add(gruppo);
  return gruppo;
}

// muri, rampe e i muri delle case
function meshPezzo(c) {
  const T = V3.T;
  let m;
  if (c.tipo === 'vetro') {
    m = new T.Mesh(new T.BoxGeometry(3, 2.6, 0.06), new T.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.3 }));
    m.rotation.y = -Math.atan2(c.bz - c.az, c.bx - c.ax); m.position.set(c.x, 1.3, c.z); V3.scena.add(m); return m;
  }
  if (c.casa) {
    // muro di casa: intonaco, zoccolo di pietra, e una finestra con le persiane su alcuni muri
    const g = new T.Group(), giro = -Math.atan2(c.bz - c.az, c.bx - c.ax);
    V3.matCasa = V3.matCasa || { intonaco: materiale('intonaco'), pietra: materiale('pietra'), vetro: new T.MeshStandardMaterial({ color: 0x1c2630, roughness: 0.08, metalness: 0.4 }), persiana: new T.MeshStandardMaterial({ color: 0x3d5e3a, roughness: 0.7 }), cornice: new T.MeshStandardMaterial({ color: 0xe9e2d2, roughness: 0.8 }) };
    const M = V3.matCasa;
    const muro = ombra(new T.Mesh(new T.BoxGeometry(3.45, 3.0, 0.35), M.intonaco)); muro.position.y = 1.5; g.add(muro);
    const zoccolo = ombra(new T.Mesh(new T.BoxGeometry(3.47, 0.55, 0.39), M.pietra)); zoccolo.position.y = 0.27; g.add(zoccolo);
    const conFinestra = /a$/.test(c.id) || c.id.charCodeAt(c.id.length - 2) % 2 === 0;
    if (conFinestra) {
      for (const lato of [-1, 1]) {
        const v = new T.Mesh(new T.BoxGeometry(0.85, 1.1, 0.06), M.vetro); v.position.set(0, 1.7, lato * 0.18); g.add(v);
        const cor = new T.Mesh(new T.BoxGeometry(1.05, 1.3, 0.04), M.cornice); cor.position.set(0, 1.7, lato * 0.17); g.add(cor);
        for (const s of [-1, 1]) { const p = new T.Mesh(new T.BoxGeometry(0.48, 1.2, 0.04), M.persiana); p.position.set(s * 0.72, 1.7, lato * 0.2); g.add(p); }
      }
    }
    g.rotation.y = giro; g.position.set(c.x, 0, c.z);
    V3.scena.add(g);
    return g;
  }
  if (c.tipo === 'rampa') {
    m = ombra(new T.Mesh(new T.BoxGeometry(2.4, 0.22, 3.6), V3.legno.clone()));
    const dx = c.dirx ?? 0, dz = c.dirz ?? -1;
    m.rotation.order = 'YXZ'; m.rotation.y = Math.atan2(-dx, -dz); m.rotation.x = Math.atan2(2.5, 3.2);
    m.position.set(c.x, (c.livello || 0) * 2.5 + 1.25, c.z);
  } else {
    m = ombra(new T.Mesh(new T.BoxGeometry(3.4, 2.6, 0.25), V3.legno.clone()));
    m.rotation.y = -Math.atan2(c.bz - c.az, c.bx - c.ax);
    m.position.set(c.x, (c.livello || 0) * 2.5 + 1.3, c.z);
  }
  m.material.transparent = true;
  m.scale.set(0.01, 0.01, 0.01); // cresce in un attimo, come costruita
  V3.scena.add(m);
  return m;
}

// tetto e pavimento di una casa: compaiono con la casa, e il tetto sparisce se la casa è distrutta
function meshTetto(casa) {
  const T = V3.T, g = new T.Group();
  V3.matTetto = V3.matTetto || { coppi: materiale('coppi', { roughness: 0.8 }), legno: materiale('legno'), trave: new T.MeshStandardMaterial({ color: 0x5a3c26, roughness: 0.8 }) };
  const M = V3.matTetto, larga = casa.nome === 'chiesa' ? 8.4 : 7.8, alto = casa.nome === 'chiesa' ? 2.6 : 1.9;
  const falda = Math.hypot(larga / 2, alto), ang = Math.atan2(alto, larga / 2);
  for (const s of [-1, 1]) {
    const f = ombra(new T.Mesh(new T.BoxGeometry(falda + 0.3, 0.14, larga), M.coppi));
    f.position.set(s * larga / 4, 3.0 + alto / 2, 0); f.rotation.z = -s * ang; g.add(f);
  }
  const colmo = ombra(new T.Mesh(new T.CylinderGeometry(0.14, 0.14, larga, 8), M.coppi)); colmo.rotation.x = Math.PI / 2; colmo.position.y = 3.0 + alto + 0.02; g.add(colmo);
  for (const z of [-1, 1]) { // i timpani
    const t = new T.Shape(); t.moveTo(-larga / 2, 0); t.lineTo(larga / 2, 0); t.lineTo(0, alto); t.lineTo(-larga / 2, 0);
    const m = ombra(new T.Mesh(new T.ShapeGeometry(t), materiale('intonaco', { side: T.DoubleSide }))); m.position.set(0, 3.0, z * 3.55); g.add(m);
  }
  const pav = new T.Mesh(new T.PlaneGeometry(6.6, 6.6), M.legno); pav.rotation.x = -Math.PI / 2; pav.position.y = 0.03; pav.receiveShadow = true; g.add(pav);
  if (casa.nome === 'chiesa') { const croce = ombra(new T.Mesh(new T.BoxGeometry(0.12, 1.2, 0.12), M.trave)); croce.position.set(0, 3.0 + alto + 0.7, -3.4); g.add(croce); const br = ombra(new T.Mesh(new T.BoxGeometry(0.7, 0.12, 0.12), M.trave)); br.position.set(0, 3.0 + alto + 0.9, -3.4); g.add(br); }
  g.position.set(casa.x, 0, casa.z);
  g.rotation.y = (casa.porta % 2) * Math.PI / 2;
  V3.scena.add(g);
  return g;
}

// cassa militare: verde oliva, chiusure di metallo, scritta, una lucina rossa che lampeggia
function meshCassa() {
  const T = V3.T, g = new T.Group();
  V3.matCassa = V3.matCassa || { lato: new T.MeshStandardMaterial({ map: V3.tex.cassa, roughness: 0.7 }), verde: new T.MeshStandardMaterial({ color: 0x46552f, roughness: 0.75 }), metallo: new T.MeshStandardMaterial({ color: 0x9a9a92, metalness: 0.8, roughness: 0.35 }) };
  const M = V3.matCassa;
  const corpo = ombra(new T.Mesh(new T.BoxGeometry(1.1, 0.55, 0.62), [M.verde, M.verde, M.verde, M.verde, M.lato, M.lato])); corpo.position.y = 0.28; g.add(corpo);
  const coperchio = ombra(new T.Mesh(new T.BoxGeometry(1.14, 0.1, 0.66), M.verde)); coperchio.position.y = 0.6; g.add(coperchio);
  for (const x of [-0.36, 0.36]) { const ch = new T.Mesh(new T.BoxGeometry(0.1, 0.16, 0.03), M.metallo); ch.position.set(x, 0.5, -0.33); g.add(ch); }
  for (const x of [-0.6, 0.6]) { const man = new T.Mesh(new T.BoxGeometry(0.04, 0.06, 0.24), M.metallo); man.position.set(x, 0.38, 0); g.add(man); }
  const led = new T.Mesh(new T.SphereGeometry(0.025, 8, 6), new T.MeshBasicMaterial({ color: new T.Color(8, 0.6, 0.4) })); led.position.set(0.45, 0.67, -0.25); g.add(led);
  g.userData.led = led;
  V3.scena.add(g);
  return g;
}

function scritta3D(testo, colore, alt = 1, sempreVisibile = true) {
  const [c, x] = telaDisegno(512, 128);
  x.font = 'bold 64px -apple-system, Helvetica, sans-serif'; x.textAlign = 'center';
  x.lineWidth = 8; x.strokeStyle = 'rgba(0,0,0,0.7)'; x.strokeText(testo, 256, 88);
  x.fillStyle = colore; x.fillText(testo, 256, 88);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: !sempreVisibile, toneMapped: false }));
  s.scale.set(alt * 4, alt, 1); s.renderOrder = 10;
  return s;
}

function sincronizza(mappa, elenco, chiave, crea, aggiorna) {
  const visti = new Set();
  for (const o of elenco) {
    const k = chiave(o); visti.add(k);
    let m = mappa.get(k);
    if (!m) { m = crea(o); mappa.set(k, m); }
    aggiorna(o, m);
  }
  for (const [k, m] of mappa) if (!visti.has(k)) { V3.scena.remove(m); mappa.delete(k); }
}

// ---------------------------------------------------------------- arma in mano
function armaInMano() {
  const T = V3.T, A = V3.arma, tipo = G.arsenale ? G.arsenale.corrente : 'pistola';
  const sil = !!(G.arsenale && armaStato() && armaStato().silenziatore), chiave = tipo + (sil ? '+s' : '');
  if (A.userData.tipo === chiave) return;
  A.userData.tipo = chiave;
  while (A.children.length) A.remove(A.children[0]);
  const nero = new T.MeshStandardMaterial({ color: 0x26272a, metalness: 0.8, roughness: 0.42 });
  const polimero = new T.MeshStandardMaterial({ color: 0x3a3a34, metalness: 0.05, roughness: 0.78 });
  const legno = new T.MeshStandardMaterial({ map: V3.tex.legno.map, roughness: 0.6, color: 0xa07050 });
  const verde = new T.MeshStandardMaterial({ color: 0x4b5a32, roughness: 0.7 });
  const guanto = new T.MeshStandardMaterial({ color: 0x3a3a30, roughness: 0.85 });
  const p = (geo, mat, x, y, z, rx = 0) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; A.add(m); return m; };
  const cil = (r, l, n = 16) => new T.CylinderGeometry(r, r, l, n);
  // un parallelepipedo con gli spigoli smussati: niente oggetto vero ha gli spigoli vivi, ed è questo che fa "cartone"
  const box = (w, h, d) => {
    const chiave = `${w}|${h}|${d}`; V3.scatoleTonde = V3.scatoleTonde || new Map();
    if (V3.scatoleTonde.has(chiave)) return V3.scatoleTonde.get(chiave);
    const r = Math.min(w, h) * 0.18, s = new T.Shape(), x = -w / 2 + r, y = -h / 2 + r, ww = w - 2 * r, hh = h - 2 * r;
    s.moveTo(x, y - r); s.lineTo(x + ww, y - r); s.quadraticCurveTo(x + ww + r, y - r, x + ww + r, y); s.lineTo(x + ww + r, y + hh); s.quadraticCurveTo(x + ww + r, y + hh + r, x + ww, y + hh + r);
    s.lineTo(x, y + hh + r); s.quadraticCurveTo(x - r, y + hh + r, x - r, y + hh); s.lineTo(x - r, y); s.quadraticCurveTo(x - r, y - r, x, y - r);
    const b = Math.min(r, d * 0.2), geo = new T.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b * 0.6, bevelSegments: 2, curveSegments: 3 });
    geo.translate(0, 0, -(d - 2 * b) / 2); geo.computeVertexNormals();
    V3.scatoleTonde.set(chiave, geo); return geo;
  };
  // le mani coi guanti
  p(box(0.09, 0.08, 0.13), guanto, 0, -0.1, 0.04);
  if (tipo === 'pistola') { p(box(0.06, 0.07, 0.3), nero, 0, 0.02, -0.12); p(box(0.055, 0.15, 0.08), polimero, 0, -0.08, 0.0); p(cil(0.012, 0.04), nero, 0, 0.02, -0.28, Math.PI / 2); }
  if (tipo === 'pompa') { p(cil(0.024, 0.85), nero, 0, 0.02, -0.4, Math.PI / 2); p(cil(0.02, 0.6), nero, 0, -0.03, -0.32, Math.PI / 2); p(box(0.08, 0.07, 0.24), legno, 0, -0.035, -0.45); p(box(0.07, 0.12, 0.34), legno, 0, -0.05, 0.16); p(box(0.09, 0.08, 0.13), guanto, 0, -0.08, -0.42); }
  if (tipo === 'mitra') {
    p(box(0.07, 0.09, 0.42), nero, 0, 0, -0.18);                       // castello
    p(box(0.03, 0.02, 0.4), nero, 0, 0.056, -0.2);                      // slitta in alto
    for (let k = 0; k < 8; k++) p(box(0.036, 0.008, 0.012), nero, 0, 0.068, -0.03 - k * 0.045);
    p(box(0.02, 0.05, 0.03), nero, 0, 0.09, -0.36); p(box(0.022, 0.04, 0.02), nero, 0, 0.085, 0.0); // mirini
    p(box(0.078, 0.08, 0.26), polimero, 0, -0.01, -0.5);               // guardamano
    for (let k = 0; k < 4; k++) p(box(0.08, 0.012, 0.03), nero, 0, 0.0, -0.42 - k * 0.055);
    p(cil(0.015, 0.22), nero, 0, 0.01, -0.73, Math.PI / 2); p(cil(0.022, 0.06), nero, 0, 0.01, -0.86, Math.PI / 2); // canna e spegnifiamma
    const car = p(box(0.05, 0.2, 0.075), polimero, 0, -0.14, -0.22); car.rotation.x = 0.28;
    const car2 = p(box(0.05, 0.08, 0.07), polimero, 0, -0.25, -0.18); car2.rotation.x = 0.5;
    const imp = p(box(0.05, 0.14, 0.06), polimero, 0, -0.1, 0.0); imp.rotation.x = -0.3; // impugnatura
    p(box(0.06, 0.1, 0.22), polimero, 0, -0.02, 0.15); p(box(0.065, 0.13, 0.04), polimero, 0, -0.03, 0.27); // calcio
    p(box(0.09, 0.08, 0.13), guanto, 0, -0.07, -0.5);
  }
  if (tipo === 'precisione') { p(box(0.06, 0.08, 0.7), nero, 0, 0, -0.25); p(cil(0.014, 0.5), nero, 0, 0.01, -0.82, Math.PI / 2); p(cil(0.035, 0.36, 16), nero, 0, 0.09, -0.2, Math.PI / 2); p(cil(0.045, 0.04, 16), nero, 0, 0.09, -0.4, Math.PI / 2); p(box(0.07, 0.13, 0.32), polimero, 0, -0.04, 0.17); p(box(0.09, 0.08, 0.13), guanto, 0, -0.06, -0.4); }
  if (tipo === 'mitraglietta') { p(box(0.065, 0.09, 0.4), nero, 0, 0, -0.14); p(cil(0.015, 0.14), nero, 0, 0.01, -0.4, Math.PI / 2); p(box(0.05, 0.22, 0.06), nero, 0, -0.15, -0.14); p(box(0.04, 0.04, 0.24), nero, 0, -0.01, 0.15); p(box(0.09, 0.08, 0.13), guanto, 0, -0.07, -0.26); }
  if (tipo === 'lanciarazzi') { p(cil(0.065, 1.05, 16), verde, 0.02, 0.06, -0.3, Math.PI / 2); p(new T.ConeGeometry(0.06, 0.18, 16), new T.MeshStandardMaterial({ color: 0x5b5f55, roughness: 0.5 }), 0.02, 0.06, -0.9, -Math.PI / 2); p(box(0.04, 0.12, 0.06), polimero, 0.02, -0.05, -0.1); p(box(0.06, 0.06, 0.12), nero, 0.07, 0.13, -0.15); }
  if (tipo === 'piccone') {
    // manico inclinato in avanti, testa di ferro di traverso
    const manico = p(cil(0.018, 0.55, 8), legno, 0.02, 0.06, -0.12, -0.9); manico.rotation.z = -0.25;
    const testa = p(box(0.32, 0.045, 0.045), nero, 0.08, 0.22, -0.35); testa.rotation.z = -0.25;
  }
  // il silenziatore: un cilindro opaco in fondo alla canna
  if (sil) { const lung = { pistola: -0.42, mitra: -0.8, precisione: -1.12, mitraglietta: -0.52 }[tipo] ?? -0.6; p(cil(0.03, 0.22, 14), polimero, 0, tipo === 'precisione' ? 0.01 : 0.015, lung, Math.PI / 2); }
  A.position.set(0.26, -0.25, -0.52); A.scale.set(0.72, 0.72, 0.72);
}

// ---------------------------------------------------------------- luci, fumo, esplosioni
function lampoLuce(x, y, z, forza, durata, colore = 0xffb060) {
  if (!V3.luci.length) return;
  const L = V3.luci.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b)); // la luce più "vecchia"
  L.l.position.set(x, y, z); L.l.color.setHex(colore); L.forza = forza; L.dur = durata; L.t = 0;
}
function sbuffoFumo(x, y, z, quanti, scuro = false, grande = 1) {
  if (!V3.pronto) return;
  const T = V3.T;
  for (let i = 0; i < quanti; i++) {
    const m = new T.Sprite(new T.SpriteMaterial({ map: V3.tex.fumo, color: scuro ? 0x3a3632 : 0xbab4aa, transparent: true, opacity: 0.6, depthWrite: false }));
    m.position.set(x + caso(-0.6, 0.6) * grande, y + caso(0, 0.8), z + caso(-0.6, 0.6) * grande);
    const s = caso(1, 2) * grande; m.scale.set(s, s, 1); V3.scena.add(m);
    V3.fumo.push({ m, t: 0, vita: caso(2.5, 4.5), vy: caso(0.6, 1.4), vx: caso(-0.3, 0.3) + 0.4, vz: caso(-0.3, 0.3), cresce: caso(0.8, 1.6) * grande });
  }
}

// ---------------------------------------------------------------- ogni fotogramma
function disegna3D(ora, dt) {
  if (!iniziaGrafica3D()) return false;
  V3.tela3d.style.display = 'block';
  const T = V3.T, cam = V3.camera;
  // telecamera: in elicottero e in caduta dall'alto, poi all'altezza degli occhi; a terra (ferito) bassa
  const inCielo = G.modalita === 'battaglia' && B.cielo;
  const camminando = G.inMovimento && !inCielo;
  V3.passo = (V3.passo || 0) + (camminando ? dt * (G.tasti.ShiftLeft || G.tasti.ShiftRight ? 11 : 7.5) : 0);
  const oscilla = camminando ? Math.sin(V3.passo) * 0.035 : 0, ondeggia = camminando ? Math.cos(V3.passo * 0.5) * 0.02 : 0;
  const quota = inCielo ? (B.cielo === 'bus' ? BUS.quota : Math.max(0, B.quota)) : 0;
  const occhi = (G.modalita === 'battaglia' && B.aTerra ? 0.45 : 1.65) + (G.livello || 0) * 2.5 + oscilla + quota;
  cam.position.set(G.x, occhi, G.z);
  cam.rotation.set(inCielo ? -0.5 : -0.03 + Math.abs(oscilla) * 0.2, -G.rotta, ondeggia * 0.5);
  // il sole segue me, così le ombre vicine sono nitide
  V3.sole.position.set(G.x + V3.dirSole.x * 150, V3.dirSole.y * 150, G.z + V3.dirSole.z * 150);
  V3.sole.target.position.set(G.x, 0, G.z);
  // arma in mano, con il rinculo e l'ondeggiare del passo
  armaInMano();
  const rinculo = G.effetti.lampo || 0;
  // mirando, l'arma va al centro davanti all'occhio e la visuale si stringe (col cannocchiale molto di più)
  const mirando = !!G.mira, cannocchiale = mirando && G.arsenale && armaDef().mirino;
  V3.miraT = lim((V3.miraT || 0) + (mirando ? dt : -dt) * 6, 0, 1);
  const fov = 72 - V3.miraT * (cannocchiale ? 50 : 20);
  if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
  V3.arma.position.set(mescola(0.26, 0, V3.miraT) + ondeggia * 0.6 * (1 - V3.miraT), mescola(-0.25, -0.17, V3.miraT) + oscilla * 0.4 * (1 - V3.miraT * 0.7), -0.52 + rinculo * 0.06);
  V3.arma.rotation.set(rinculo * 0.22, 0, 0);
  V3.arma.visible = G.stato === 'gioco' && !inCielo && !(G.modalita === 'battaglia' && (B.aTerra || B.morto)) && !(cannocchiale && V3.miraT > 0.8);
  if (rinculo > 0.9 && !(G.arsenale && armaDef().mischia)) { const [fx, fz] = avanti(G.rotta); lampoLuce(G.x + fx * 0.8, occhi - 0.15, G.z + fz * 0.8, 3, 0.07); }
  // acqua e tempesta che si muovono
  if (V3.getto) V3.getto.scale.y = 1 + Math.sin(ora / 180) * 0.08;
  V3.mare.material.uniforms.tempo.value = ora / 1000;
  V3.tempesta.material.uniforms.tempo.value = ora / 1000;
  const Z = zonaArena();
  V3.tempesta.scale.set(Math.max(0.1, Z.r), 1, Math.max(0.1, Z.r)); V3.tempesta.position.x = Z.cx; V3.tempesta.position.z = Z.cz;
  const P = prossimaArena();
  V3.prossima.visible = !!P && P.r > 0.5;
  if (P) { V3.prossima.scale.set(P.r, P.r, 1); V3.prossima.position.x = P.cx; V3.prossima.position.z = P.cz; }
  // soldati: visibili solo se si sentono (o appena abbattuti); i compagni si vedono sempre
  const avversari = G.modalita === 'battaglia' ? [...B.bot, ...umaniRemoti()] : avversariArena();
  sincronizza(V3.bot, avversari, b => b.nome || b.def.nome, b => meshBot(b, avversari.indexOf(b)), (b, m) => {
    const u = m.userData;
    const vx = b.x - u.px, vz = b.z - u.pz, mosso = Math.hypot(vx, vz) / Math.max(dt, 0.001);
    if (mosso > 0.3) u.dir = Math.atan2(-vx, -vz);
    if (b.bersaglio) { const [tx, tz] = posDi(b.bersaglio); u.dir = Math.atan2(-(tx - b.x), -(tz - b.z)); }
    u.px = b.x; u.pz = b.z;
    m.visible = b.vivo ? !b.inAria && (b.udito !== false || (G.modalita === 'battaglia' && b.team === B.mioTeam)) : (b.morteT || 0) < 4;
    if (!m.visible) return;
    // camminata: le gambe vanno avanti e indietro, il corpo sobbalza appena
    const vel = Math.min(1, mosso / 3);
    u.passo += dt * (4 + mosso * 2.2) * (vel > 0.1 ? 1 : 0);
    const s = Math.sin(u.passo) * 0.65 * vel;
    u.gambe[0].rotation.x = s; u.gambe[1].rotation.x = -s;
    u.braccia[0].rotation.x = -1.2 + Math.sin(u.passo) * 0.08 * vel;
    m.position.set(b.x, (b.livello || 0) * 2.5 + Math.abs(Math.cos(u.passo)) * 0.04 * vel, b.z);
    m.rotation.y = u.dir;
    // abbattuto: cade di lato
    m.rotation.z = b.vivo ? 0 : Math.min(1, (b.morteT || 0) / 0.6) * Math.PI / 2 * 0.95;
    if (!b.vivo) m.position.y = (b.livello || 0) * 2.5 + 0.12 * Math.min(1, (b.morteT || 0) / 0.6);
    const sparando = (b.lampo || 0) > 0.3;
    u.lampo.visible = sparando;
    if (sparando && !u.lampoFatto) { u.lampoFatto = true; lampoLuce(b.x, (b.livello || 0) * 2.5 + 1.4, b.z, 2.5, 0.07); }
    if (!sparando) u.lampoFatto = false;
    if (b.lampo) b.lampo = Math.max(0, b.lampo - dt * 6);
  });
  // costruzioni
  sincronizza(V3.costruzioni, G.costruzioni.filter(c => c.vita > 0 && (c.tipo === 'barricata' || c.tipo === 'rampa' || c.tipo === 'vetro')), c => c.id, meshPezzo, (c, m) => {
    if (c.tipo === 'vetro' || c.casa) return;
    const s = Math.min(1, (G.tempo - (c.nato ?? -9)) / 0.12) || 1;
    m.scale.set(s, s, s);
    m.material.opacity = 0.55 + 0.45 * c.vita / c.vitaMax;
    m.material.color.setScalar(0.55 + 0.45 * c.vita / c.vitaMax);
  });
  // tetti e pavimenti delle case (il tetto resta finché la casa ha almeno cinque muri interi)
  if (G.modalita === 'battaglia') {
    sincronizza(V3.tetti, B.case || [], c => c.id, meshTetto, (c, m) => {
      const interi = G.costruzioni.reduce((n, k) => n + (k.casa === c.id && k.vita > 0 ? 1 : 0), 0);
      for (let i = 0; i < m.children.length; i++) if (m.children[i].geometry.type !== 'PlaneGeometry') m.children[i].visible = interi >= 5;
    });
    // cespugli: foglie fitte e irregolari
    sincronizza(V3.cespugli, B.cespugli || [], c => c.id, c => {
      const g = new T.Group(); V3.matFoglie = V3.matFoglie || materiale('foglie', { roughness: 0.95 });
      for (const [x, y, z, r] of [[0, 0.55, 0, 0.8], [0.5, 0.45, 0.2, 0.55], [-0.45, 0.45, -0.15, 0.6], [0.1, 0.95, -0.1, 0.5], [-0.2, 0.4, 0.45, 0.5]]) { const s = ombra(new T.Mesh(new T.IcosahedronGeometry(r, 1), V3.matFoglie)); s.position.set(x, y, z); s.rotation.set(x * 3, z * 5, y); g.add(s); }
      g.position.set(c.x, 0, c.z); V3.scena.add(g); return g;
    }, () => {});
  }
  // forzieri
  sincronizza(V3.casse, D.casse, c => c.id, () => meshCassa(), (c, m) => {
    m.visible = c.aTerra !== false;
    m.position.set(c.x, 0, c.z);
    m.rotation.y = (c.x * 7.3) % PI2;
    m.userData.led.visible = Math.floor(ora / 600 + c.x) % 2 === 0;
  });
  // anteprima della costruzione mentre tengo premuto B o N
  const tasto = G.tasti.KeyB ? 'muro' : G.tasti.KeyN ? 'rampa' : null;
  V3.anteprima.visible = !!tasto && G.stato === 'gioco';
  if (tasto) {
    const [fx, fz] = avanti(G.rotta);
    V3.anteprima.position.set(G.x + fx * 2.1, (G.livello || 0) * 2.5 + 1.3, G.z + fz * 2.1);
    V3.anteprima.rotation.set(tasto === 'rampa' ? -0.6 : 0, -G.rotta, 0, 'YXZ');
  }
  // esplosioni: palla di fuoco luminosa, lampo di luce, fumo nero che sale, segno bruciato a terra
  for (const e of G.effetti.esplosioni) {
    if (!e.mesh) {
      // palla di fuoco: tante fiammate morbide che si sommano (luminose: il bagliore le fa splendere)
      e.mesh = new T.Group();
      for (let i = 0; i < 9; i++) {
        const f = new T.Sprite(new T.SpriteMaterial({ map: V3.tex.fumo, color: new T.Color(5, 1.9 + Math.random(), 0.45), transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
        f.position.set(caso(-0.9, 0.9), caso(0.2, 1.6), caso(-0.9, 0.9)); const k = caso(1.5, 2.8); f.scale.set(k, k, 1); e.mesh.add(f);
      }
      e.mesh.position.set(e.x, 0.6, e.z); V3.scena.add(e.mesh); V3.esplosioni.push(e);
      lampoLuce(e.x, 2, e.z, 30, 0.35, 0xffa050);
      sbuffoFumo(e.x, 0.8, e.z, 14, true, 1.6);
      const segno = new T.Mesh(new T.CircleGeometry(2.6, 24), new T.MeshBasicMaterial({ color: 0x15110d, transparent: true, opacity: 0.7, depthWrite: false }));
      segno.rotation.x = -Math.PI / 2; segno.position.set(e.x, 0.04, e.z); V3.scena.add(segno);
      Particelle.push({ m: segno, macchia: true, t: 0, vita: 40, opacita: 0.7 });
    }
    const s = 1 + e.t * 5; e.mesh.scale.set(s, s, s);
    for (const f of e.mesh.children) f.material.opacity = Math.max(0, 1 - e.t / 0.5);
  }
  V3.esplosioni = V3.esplosioni.filter(e => { if (e.t >= 0.5) { V3.scena.remove(e.mesh); return false; } return true; });
  // luci dei lampi che si spengono
  for (const L of V3.luci) { L.t += dt; L.l.intensity = L.t < L.dur ? L.forza * (1 - L.t / L.dur) : 0; }
  // fumo che sale, si allarga e svanisce
  V3.fumo = V3.fumo.filter(f => {
    f.t += dt; f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; f.m.position.z += f.vz * dt;
    const s = f.m.scale.x + f.cresce * dt; f.m.scale.set(s, s, 1);
    f.m.material.opacity = 0.6 * Math.max(0, 1 - f.t / f.vita);
    if (f.t > f.vita) { V3.scena.remove(f.m); f.m.material.dispose(); return false; }
    return true;
  });
  // numeri dei danni che salgono e svaniscono
  V3.numeri = V3.numeri.filter(n => {
    n.t += dt; n.sprite.position.y = n.y + n.t * 1.2; n.sprite.material.opacity = Math.max(0, 1 - n.t / 1.0);
    if (n.t > 1.0) { V3.scena.remove(n.sprite); return false; }
    return true;
  });
  aggiornaParticelle(dt);
  if (V3.composer) {
    V3.finale.uniforms.tempo.value = (ora / 1000) % 100;
    V3.finale.uniforms.dolore.value = lim(G.effetti.dolore || 0, 0, 1);
    V3.composer.render(dt);
  } else V3.r.render(V3.scena, cam);
  return true;
}

function mostraNumero3D(x, z, livello, testo, testa) {
  if (!V3.pronto) return;
  const s = scritta3D(testo, testa ? '#ffd23f' : '#ffffff', testa ? 0.5 : 0.38);
  const y = (livello || 0) * 2.5 + 2.2;
  s.position.set(x + caso(-0.3, 0.3), y, z);
  V3.scena.add(s); V3.numeri.push({ sprite: s, t: 0, y });
}

function nascondi3D() { if (V3.pronto) V3.tela3d.style.display = 'none'; }

// ---------------------------------------------------------------- informazioni a schermo
function hudBattaglia(W, H, ora) {
  const u = H / 900, pad = 28 * u, carattere = (peso, px) => `${peso} ${Math.round(px * u)}px -apple-system, "SF Pro Display", Helvetica, sans-serif`;
  const barra = (x, y, w, h, frazione, colore, testo) => {
    g.fillStyle = 'rgba(10,12,14,0.55)'; g.fillRect(x, y, w, h);
    g.fillStyle = colore; g.fillRect(x + 2 * u, y + 2 * u, (w - 4 * u) * lim(frazione, 0, 1), h - 4 * u);
    g.font = carattere(700, h / u * 0.6); g.textAlign = 'left'; g.fillStyle = '#f2f2ee';
    g.fillText(testo, x + 8 * u, y + h * 0.72);
  };
  barra(pad, H - pad - 62 * u, 300 * u, 22 * u, G.scudo / 100, '#7d9cb4', `GIUBBOTTO ${Math.round(G.scudo)}`);
  barra(pad, H - pad - 34 * u, 300 * u, 28 * u, G.vita / 100, G.vita > 30 ? '#c9d2c0' : '#c0392b', `VITA ${Math.round(G.vita)}`);
  g.font = carattere(600, 18); g.textAlign = 'left';
  g.fillStyle = 'rgba(10,12,14,0.55)'; g.fillRect(pad, H - pad - 96 * u, 230 * u, 28 * u);
  g.fillStyle = '#d8c8a0'; g.fillText(`MATERIALI ${G.inventario.materiali}${G.livello ? '   PIANO ' + G.livello : ''}`, pad + 10 * u, H - pad - 76 * u);
  if (G.arsenale) {
    const def = armaDef(), st = armaStato(), rar = st.rarita || 1;
    const coloreRar = { 1: '#d8dcd6', 1.15: '#9cc87c', 1.3: '#7fb0d8', 1.5: '#e0b860' }[rar] || '#d8dcd6';
    g.textAlign = 'right';
    g.fillStyle = 'rgba(10,12,14,0.55)'; g.fillRect(W - pad - 300 * u, H - pad - 70 * u, 300 * u, 70 * u);
    g.fillStyle = coloreRar; g.font = carattere(700, 18);
    g.fillText(def.nome.toUpperCase() + (rar > 1 ? ' · ' + nomeRarita(rar).toUpperCase() : ''), W - pad - 12 * u, H - pad - 44 * u);
    g.fillStyle = '#f2f2ee'; g.font = carattere(800, 28);
    g.fillText(def.mischia ? '—' : testoColpi(def, st, ' / '), W - pad - 12 * u, H - pad - 12 * u);
  }
  g.textAlign = 'right'; g.font = carattere(700, 20);
  g.fillStyle = 'rgba(10,12,14,0.55)'; g.fillRect(W - pad - 280 * u, pad, 280 * u, 70 * u);
  if (G.modalita === 'duello') {
    g.fillStyle = '#f2f2ee'; g.fillText(`ROUND ${D.round}   ${descriviPunteggio().replace(/\.$/, '')}`, W - pad - 14 * u, pad + 28 * u);
    g.font = carattere(600, 16); g.fillStyle = '#b8a8d8';
    g.fillText(raggioZona() < RAGGIO_ARENA ? `ZONA ${Math.round(raggioZona())} M` : 'ZONA APERTA', W - pad - 14 * u, pad + 56 * u);
  } else {
    g.fillStyle = '#f2f2ee'; g.fillText(`IN GARA ${rimasti()}    ELIMINAZIONI ${B.eliminazioni}`, W - pad - 14 * u, pad + 28 * u);
    const f = FASI_TEMPESTA[B.fase];
    g.font = carattere(600, 16); g.fillStyle = '#b8a8d8';
    g.fillText(B.cielo ? 'IN ELICOTTERO' : !f ? 'TEMPESTA FINALE' : B.stadio === 'attesa' ? `TEMPESTA TRA ${Math.max(0, Math.round(B.fine - G.tempo))} S` : 'LA TEMPESTA AVANZA', W - pad - 14 * u, pad + 56 * u);
  }
  // bussola
  const cx = W / 2;
  g.fillStyle = 'rgba(10,12,14,0.45)'; g.fillRect(cx - 220 * u, pad, 440 * u, 28 * u);
  g.font = carattere(700, 16); g.textAlign = 'center';
  for (const [nome, a] of [['N', 0], ['NE', 0.785], ['E', 1.571], ['SE', 2.356], ['S', 3.1416], ['SO', -2.356], ['O', -1.571], ['NO', -0.785]]) {
    const rel = avvolgi(a - G.rotta);
    if (Math.abs(rel) > 1.2) continue;
    g.fillStyle = nome.length === 1 ? '#f2f2ee' : '#8a949c';
    g.fillText(nome, cx + rel / 1.2 * 210 * u, pad + 20 * u);
  }
  // cannocchiale del fucile di precisione: cerchio nero col reticolo
  if (G.mira && G.arsenale && armaDef().mirino && (V3.miraT || 0) > 0.8) {
    const r = H * 0.42;
    g.fillStyle = '#000'; g.beginPath(); g.rect(0, 0, W, H); g.arc(cx, H / 2, r, 0, PI2, true); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = Math.max(1, 1.2 * u);
    g.beginPath(); g.moveTo(cx - r, H / 2); g.lineTo(cx + r, H / 2); g.moveTo(cx, H / 2 - r); g.lineTo(cx, H / 2 + r); g.stroke();
  }
  // mirino sottile
  g.strokeStyle = 'rgba(240,240,230,0.75)'; g.lineWidth = Math.max(1, 1.5 * u);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.beginPath(); g.moveTo(cx + dx * 6 * u, H / 2 + dy * 6 * u); g.lineTo(cx + dx * 14 * u, H / 2 + dy * 14 * u); g.stroke(); }
  if (!V3.composer) schizziSchermo(W, H);
  const Z = zonaArena();
  if (Math.hypot(G.x - Z.cx, G.z - Z.cz) > Z.r) {
    const v = g.createRadialGradient(cx, H / 2, H * 0.3, cx, H / 2, H * 0.9);
    v.addColorStop(0, 'rgba(90,40,160,0)'); v.addColorStop(1, `rgba(90,40,160,${0.4 + Math.sin(ora / 200) * 0.1})`);
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }
}

// ---------------------------------------------------------------- sangue e schegge
const Particelle = [];
function sangue3D(x, z, livello, testa, danno) {
  if (!V3.pronto) return;
  const T = V3.T, y = livello * 2.5 + (testa ? 1.75 : 1.2), n = Math.min(22, 6 + Math.round(danno / 7));
  V3.matSangue = V3.matSangue || new T.MeshStandardMaterial({ color: 0x5a0606, roughness: 0.4 });
  for (let i = 0; i < n; i++) {
    const p = new T.Mesh(new T.SphereGeometry(caso(0.015, 0.045), 5, 4), V3.matSangue);
    p.position.set(x, y, z); V3.scena.add(p);
    Particelle.push({ m: p, vx: caso(-1.8, 1.8), vy: caso(0.3, 2.4), vz: caso(-1.8, 1.8), t: 0, vita: caso(0.4, 0.8), terra: livello * 2.5 });
  }
  const macchia = new T.Mesh(new T.CircleGeometry(caso(0.25, 0.5) * (testa ? 1.3 : 1), 16), new T.MeshStandardMaterial({ color: 0x3a0404, roughness: 0.3, transparent: true, opacity: 0.85, depthWrite: false }));
  macchia.rotation.x = -Math.PI / 2; macchia.position.set(x + caso(-0.3, 0.3), livello * 2.5 + 0.05, z + caso(-0.3, 0.3)); V3.scena.add(macchia);
  Particelle.push({ m: macchia, macchia: true, t: 0, vita: 25, opacita: 0.85 });
}
function scheggeVetro3D(c) {
  if (!V3.pronto) return;
  const T = V3.T, mat = new T.MeshStandardMaterial({ color: 0xd8f1ff, transparent: true, opacity: 0.7, roughness: 0.05 });
  for (let i = 0; i < 30; i++) {
    const p = new T.Mesh(new T.PlaneGeometry(caso(0.05, 0.18), caso(0.05, 0.18)), mat);
    p.position.set(c.x + caso(-1.2, 1.2), caso(0.3, 2.4), c.z + caso(-1.2, 1.2)); V3.scena.add(p);
    Particelle.push({ m: p, vx: caso(-3, 3), vy: caso(-0.5, 2.5), vz: caso(-3, 3), t: 0, vita: caso(0.8, 1.4), terra: 0, ruota: true });
  }
}
function aggiornaParticelle(dt) {
  for (let i = Particelle.length - 1; i >= 0; i--) {
    const p = Particelle[i];
    p.t += dt;
    if (p.macchia) { p.m.material.opacity = (p.opacita || 0.85) * Math.max(0, 1 - p.t / p.vita); }
    else {
      p.vy -= 9.8 * dt;
      p.m.position.x += p.vx * dt; p.m.position.y = Math.max(p.terra + 0.02, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
      if (p.ruota) { p.m.rotation.x += dt * 9; p.m.rotation.y += dt * 7; }
    }
    if (p.t > p.vita) { V3.scena.remove(p.m); Particelle.splice(i, 1); }
  }
}
// schizzi di sangue ai bordi dello schermo quando vengo colpito (solo se manca il ritocco finale, che lo fa già)
const Schizzi = Array.from({ length: 14 }, () => ({ x: Math.random(), y: Math.random(), r: 0.04 + Math.random() * 0.09, lato: Math.floor(Math.random() * 4) }));
function schizziSchermo(W, H) {
  const a = G.effetti.dolore || 0;
  if (a <= 0.02) return;
  for (const s of Schizzi) {
    const x = s.lato === 0 ? s.x * W * 0.18 : s.lato === 1 ? W - s.x * W * 0.18 : s.x * W;
    const y = s.lato === 2 ? s.y * H * 0.18 : s.lato === 3 ? H - s.y * H * 0.18 : s.y * H;
    const r = s.r * H;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(120,0,0,${0.75 * a})`); gr.addColorStop(0.7, `rgba(90,0,0,${0.5 * a})`); gr.addColorStop(1, 'rgba(60,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
}

// zona e avversari della modalità in corso (battaglia reale o duello)
function zonaArena() { return G.modalita === 'duello' ? { cx: 0, cz: 0, r: typeof raggioZona === 'function' && D.attivo ? raggioZona() : 24 } : B.zona; }
function prossimaArena() { return G.modalita === 'duello' ? null : B.prossima; }
