'use strict';
// Grafica 3D della Battaglia reale (three.js). L'isola di giorno, il mare, i cinque luoghi, gli avversari,
// le costruzioni a piani, i forzieri, la tempesta. Regola di sempre: un avversario si vede solo quando si sente.

const V3 = { pronto: false, costruzioni: new Map(), bot: new Map(), casse: new Map(), numeri: [], esplosioni: [] };

function iniziaGrafica3D() {
  if (V3.pronto || !window.THREE) return V3.pronto;
  const T = THREE;
  // i colori scritti qui sono colori "da schermo": senza questa riga three.js li schiarisce tutti
  if (T.ColorManagement) T.ColorManagement.legacyMode = false;
  const tela3d = $('scena3d');
  const r = new T.WebGLRenderer({ canvas: tela3d, antialias: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
  r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
  const scena = new T.Scene();
  scena.fog = new T.Fog(0xcfe3f5, 140, 700);
  const camera = new T.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 1500);
  camera.rotation.order = 'YXZ';
  Object.assign(V3, { T, r, scena, camera, tela3d });

  // cielo: sfera con sfumatura dall'azzurro intenso all'orizzonte chiaro
  const cielo = new T.Mesh(new T.SphereGeometry(1200, 32, 16), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    uniforms: { alto: { value: new T.Color(0x2f78d6) }, basso: { value: new T.Color(0xdcecfb) } },
    vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 alto; uniform vec3 basso; varying vec3 p; void main(){ float k = smoothstep(-0.05, 0.45, p.y); gl_FragColor = vec4(mix(basso, alto, k), 1.0); }',
  }));
  scena.add(cielo);
  // sole e luce del cielo
  scena.add(new T.HemisphereLight(0xcfe4ff, 0x4d6b2e, 0.9));
  const sole = new T.DirectionalLight(0xffe9c4, 2.2);
  sole.position.set(70, 130, 45); sole.castShadow = true;
  sole.shadow.mapSize.set(2048, 2048);
  Object.assign(sole.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 10, far: 400 });
  sole.shadow.bias = -0.0005;
  scena.add(sole);
  const disco = new T.Mesh(new T.SphereGeometry(18, 24, 12), new T.MeshBasicMaterial({ color: 0xfff6d0, fog: false }));
  disco.position.set(420, 700, 280); scena.add(disco);

  // mare, spiaggia, prato
  const mare = new T.Mesh(new T.PlaneGeometry(4000, 4000), new T.MeshStandardMaterial({ color: 0x1b6fa8, roughness: 0.25, metalness: 0.15 }));
  mare.rotation.x = -Math.PI / 2; mare.position.y = -0.7; scena.add(mare); V3.mare = mare;
  const spiaggia = new T.Mesh(new T.CircleGeometry(106, 96), new T.MeshStandardMaterial({ color: 0xe6d3a1, roughness: 1 }));
  spiaggia.rotation.x = -Math.PI / 2; spiaggia.position.y = -0.12; spiaggia.receiveShadow = true; scena.add(spiaggia);
  const pratoG = new T.CircleGeometry(97, 160, 0, PI2);
  const colori = [];
  const base = new T.Color();
  for (let i = 0; i < pratoG.attributes.position.count; i++) {
    base.setHSL(0.27 + Math.random() * 0.04, 0.55 + Math.random() * 0.12, 0.26 + Math.random() * 0.06);
    colori.push(base.r, base.g, base.b);
  }
  pratoG.setAttribute('color', new T.Float32BufferAttribute(colori, 3));
  const prato = new T.Mesh(pratoG, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  prato.rotation.x = -Math.PI / 2; prato.receiveShadow = true; scena.add(prato);

  costruisciLuoghi3D();
  // tempesta: muro viola che si stringe, e il cerchio bianco della prossima zona
  V3.tempesta = new T.Mesh(new T.CylinderGeometry(1, 1, 220, 128, 1, true), new T.MeshBasicMaterial({ color: 0x8a2be2, transparent: true, opacity: 0.32, side: T.DoubleSide, depthWrite: false }));
  V3.tempesta.position.y = 80; scena.add(V3.tempesta);
  V3.prossima = new T.Mesh(new T.RingGeometry(0.985, 1, 128), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false }));
  V3.prossima.rotation.x = -Math.PI / 2; V3.prossima.position.y = 0.08; scena.add(V3.prossima);

  // arma in mano, figlia della telecamera
  V3.arma = new T.Group(); camera.add(V3.arma); scena.add(camera);
  // anteprima di costruzione mentre tieni premuto B o N
  V3.anteprima = new T.Mesh(new T.BoxGeometry(3.4, 2.6, 0.25), new T.MeshBasicMaterial({ color: 0x5ab0ff, transparent: true, opacity: 0.25, depthWrite: false }));
  V3.anteprima.visible = false; scena.add(V3.anteprima);

  V3.legno = new T.MeshStandardMaterial({ map: texturaLegno(), roughness: 0.85 });
  addEventListener('resize', () => { r.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
  r.setSize(innerWidth, innerHeight, false);
  V3.pronto = true;
  return true;
}

function texturaLegno() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    x.fillStyle = `hsl(${28 + Math.random() * 6}, ${45 + Math.random() * 10}%, ${36 + Math.random() * 10}%)`;
    x.fillRect(0, i * 32, 256, 32);
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, i * 32 + 30, 256, 2);
    for (let k = 0; k < 6; k++) { x.strokeStyle = 'rgba(60,30,10,0.15)'; x.beginPath(); x.moveTo(0, i * 32 + Math.random() * 30); x.bezierCurveTo(80, i * 32 + Math.random() * 30, 170, i * 32 + Math.random() * 30, 256, i * 32 + Math.random() * 30); x.stroke(); }
    x.fillStyle = 'rgba(40,40,40,0.6)'; x.fillRect(10, i * 32 + 14, 3, 3); x.fillRect(243, i * 32 + 14, 3, 3);
  }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}

function scritta3D(testo, colore, alt = 1, sempreVisibile = true) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.font = 'bold 72px -apple-system, Helvetica, sans-serif'; x.textAlign = 'center';
  x.lineWidth = 10; x.strokeStyle = 'rgba(0,0,0,0.75)'; x.strokeText(testo, 256, 92);
  x.fillStyle = colore; x.fillText(testo, 256, 92);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: !sempreVisibile }));
  s.scale.set(alt * 4, alt, 1); s.renderOrder = 10;
  return s;
}

function ombra(m) { m.castShadow = true; m.receiveShadow = true; return m; }

// i cinque luoghi dell'isola, alberi e rocce
function costruisciLuoghi3D() {
  const T = V3.T, S = V3.scena;
  const mat = (c, r = 0.9) => new T.MeshStandardMaterial({ color: c, roughness: r });
  // Piazza: lastricato, case colorate con i tetti di coppi
  const lastricato = new T.Mesh(new T.CircleGeometry(17, 64), mat(0x857965));
  lastricato.rotation.x = -Math.PI / 2; lastricato.position.y = 0.03; lastricato.receiveShadow = true; S.add(lastricato);
  for (let i = 0; i < 3; i++) { const anello = new T.Mesh(new T.RingGeometry(5 + i * 4, 5.2 + i * 4, 64), mat(0x9a917f)); anello.rotation.x = -Math.PI / 2; anello.position.y = 0.04; S.add(anello); }
  const tinte = [0xe0a96d, 0xd98c5f, 0xf0d29a, 0xc96f4a, 0xe8c07d, 0xb9785b, 0xf2e1b5, 0xd7a35c, 0xcd8a62, 0xe6b98a];
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * PI2 + 0.2, d = caso(23, 30), h = caso(7, 12), w = caso(6, 9);
    const casa = ombra(new T.Mesh(new T.BoxGeometry(w, h, 6), mat(tinte[i])));
    casa.position.set(Math.sin(a) * d, h / 2, -Math.cos(a) * d); casa.rotation.y = -a; S.add(casa);
    const tetto = ombra(new T.Mesh(new T.ConeGeometry(w * 0.75, 3, 4), mat(0xa4472b)));
    tetto.position.set(casa.position.x, h + 1.5, casa.position.z); tetto.rotation.y = -a + Math.PI / 4; tetto.scale.z = 0.75; S.add(tetto);
    for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) {
      const fin = new T.Mesh(new T.PlaneGeometry(0.9, 1.2), mat(0x3b4a5a, 0.3));
      const off = (k - 1) * (w / 3.2);
      fin.position.set(casa.position.x - Math.sin(a) * 3.02 + Math.cos(a) * off, 2.5 + j * 3, casa.position.z + Math.cos(a) * 3.02 + Math.sin(a) * off);
      fin.rotation.y = -a + Math.PI; S.add(fin);
    }
  }
  // Campanile a nord
  const L = LUOGHI;
  const torre = ombra(new T.Mesh(new T.BoxGeometry(5, 24, 5), mat(0xb0623b)));
  torre.position.set(L.campanile.x, 12, L.campanile.z); S.add(torre);
  const cella = ombra(new T.Mesh(new T.BoxGeometry(5.6, 4, 5.6), mat(0xc7774c)));
  cella.position.set(L.campanile.x, 26, L.campanile.z); S.add(cella);
  for (let i = 0; i < 4; i++) { const arco = new T.Mesh(new T.BoxGeometry(2, 2.6, 0.2), mat(0x2b2018)); const a = i * Math.PI / 2; arco.position.set(L.campanile.x + Math.sin(a) * 2.85, 26, L.campanile.z - Math.cos(a) * 2.85); arco.rotation.y = -a; S.add(arco); }
  const guglia = ombra(new T.Mesh(new T.ConeGeometry(4.2, 7, 4), mat(0x7d3a22)));
  guglia.position.set(L.campanile.x, 31.5, L.campanile.z); guglia.rotation.y = Math.PI / 4; S.add(guglia);
  // Fontana a est
  const vasca = ombra(new T.Mesh(new T.CylinderGeometry(4.5, 4.8, 0.9, 40), mat(0xd9d2c3)));
  vasca.position.set(L.fontana.x, 0.45, L.fontana.z); S.add(vasca);
  const acqua = new T.Mesh(new T.CylinderGeometry(4.1, 4.1, 0.1, 40), new T.MeshStandardMaterial({ color: 0x5cc4f2, roughness: 0.1, metalness: 0.2, emissive: 0x0b3550 }));
  acqua.position.set(L.fontana.x, 0.86, L.fontana.z); S.add(acqua); V3.acqua = acqua;
  const colonna = ombra(new T.Mesh(new T.CylinderGeometry(0.5, 0.7, 3, 16), mat(0xe2dccf)));
  colonna.position.set(L.fontana.x, 1.9, L.fontana.z); S.add(colonna);
  V3.getto = new T.Mesh(new T.ConeGeometry(0.9, 2.2, 16, 1, true), new T.MeshStandardMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.55, emissive: 0x335566 }));
  V3.getto.position.set(L.fontana.x, 4.2, L.fontana.z); V3.getto.rotation.x = Math.PI; S.add(V3.getto);
  // Canile a sud: cucce e recinto
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * PI2, x = L.canile.x + Math.sin(a) * 7, z = L.canile.z - Math.cos(a) * 7;
    const cuccia = ombra(new T.Mesh(new T.BoxGeometry(1.8, 1.4, 1.8), mat(0x8f5a32)));
    cuccia.position.set(x, 0.7, z); cuccia.rotation.y = -a; S.add(cuccia);
    const tettino = ombra(new T.Mesh(new T.ConeGeometry(1.5, 0.9, 4), mat(0x5d3a20)));
    tettino.position.set(x, 1.85, z); tettino.rotation.y = -a + Math.PI / 4; S.add(tettino);
  }
  for (let i = 0; i < 40; i++) { const a = i / 40 * PI2; const palo = ombra(new T.Mesh(new T.BoxGeometry(0.15, 1.2, 0.15), mat(0xd8c8a8))); palo.position.set(L.canile.x + Math.sin(a) * 12, 0.6, L.canile.z - Math.cos(a) * 12); S.add(palo); }
  // alberi: fitti nel Bosco a ovest, sparsi nel resto dell'isola
  const posizioni = [];
  for (let i = 0; i < 90; i++) { const [x, z] = attorno(L.bosco.x, L.bosco.z, 20); posizioni.push([x, z, caso(0.8, 1.4)]); }
  for (let i = 0; i < 110; i++) {
    const a = caso(-Math.PI, Math.PI), d = caso(32, 92), x = Math.sin(a) * d, z = -Math.cos(a) * d;
    if (Object.values(L).some(l => Math.hypot(l.x - x, l.z - z) < 16)) continue;
    posizioni.push([x, z, caso(0.7, 1.3)]);
  }
  const tronchi = new T.InstancedMesh(new T.CylinderGeometry(0.25, 0.35, 3, 8), mat(0x6b4426), posizioni.length);
  const chiome = new T.InstancedMesh(new T.ConeGeometry(2.2, 5.5, 10), mat(0x2f6b2c), posizioni.length);
  const chiome2 = new T.InstancedMesh(new T.ConeGeometry(1.7, 4, 10), mat(0x3d8a36), posizioni.length);
  const m = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), p = new T.Vector3();
  posizioni.forEach(([x, z, k], i) => {
    q.setFromAxisAngle(new T.Vector3(0, 1, 0), Math.random() * 6);
    sc.set(k, k, k);
    m.compose(p.set(x, 1.5 * k, z), q, sc); tronchi.setMatrixAt(i, m);
    m.compose(p.set(x, 4.6 * k, z), q, sc); chiome.setMatrixAt(i, m);
    m.compose(p.set(x, 6.6 * k, z), q, sc); chiome2.setMatrixAt(i, m);
  });
  for (const im of [tronchi, chiome, chiome2]) { im.castShadow = true; im.receiveShadow = true; S.add(im); }
  // rocce
  for (let i = 0; i < 40; i++) {
    const a = caso(-Math.PI, Math.PI), d = caso(20, 94);
    const roccia = ombra(new T.Mesh(new T.DodecahedronGeometry(caso(0.4, 1.4)), mat(0x8c8f8a)));
    roccia.position.set(Math.sin(a) * d, 0.2, -Math.cos(a) * d); roccia.rotation.set(Math.random() * 3, Math.random() * 3, 0); S.add(roccia);
  }
}

// ---------------------------------------------------------------- oggetti che cambiano
const COLORI_BOT = [0xe63946, 0x2a9d8f, 0xf4a261, 0x6a4c93, 0x1982c4, 0x8ac926, 0xff595e, 0xffca3a, 0x3d405b, 0xef476f, 0x06d6a0];
function meshBot(b, i) {
  const T = V3.T, gruppo = new T.Group();
  const tuta = new T.MeshStandardMaterial({ color: COLORI_BOT[i % COLORI_BOT.length], roughness: 0.6 });
  const corpo = ombra(new T.Mesh(new T.CapsuleGeometry(0.33, 0.9, 6, 12), tuta)); corpo.position.y = 0.95; gruppo.add(corpo);
  const testa = ombra(new T.Mesh(new T.SphereGeometry(0.24, 16, 12), new T.MeshStandardMaterial({ color: 0xe0b391, roughness: 0.7 }))); testa.position.y = 1.72; gruppo.add(testa);
  const casco = ombra(new T.Mesh(new T.SphereGeometry(0.26, 16, 8, 0, PI2, 0, Math.PI / 2), tuta)); casco.position.y = 1.76; gruppo.add(casco);
  const arma = ombra(new T.Mesh(new T.BoxGeometry(0.1, 0.12, 0.8), new T.MeshStandardMaterial({ color: 0x222428, metalness: 0.6, roughness: 0.4 })));
  arma.position.set(0.28, 1.15, -0.4); gruppo.add(arma);
  const lampo = new T.Mesh(new T.SphereGeometry(0.18, 8, 6), new T.MeshBasicMaterial({ color: 0xffd36b }));
  lampo.position.set(0.28, 1.15, -0.85); lampo.visible = false; gruppo.add(lampo);
  const nome = scritta3D(b.nome || b.def.nome, '#ffffff', 0.45, false); // il nome non si vede attraverso i muri nome.position.y = 2.35; gruppo.add(nome);
  gruppo.userData = { corpo, lampo, px: b.x, pz: b.z, dir: 0 };
  V3.scena.add(gruppo);
  return gruppo;
}

function meshPezzo(c) {
  const T = V3.T;
  let m;
  if (c.tipo === 'vetro') {
    // lastra di vetro azzurrino con la cornice di metallo
    const g = new T.Group();
    const lastra = new T.Mesh(new T.BoxGeometry(3, 2.6, 0.06), new T.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.28, metalness: 0.2, roughness: 0.05, depthWrite: false }));
    g.add(lastra);
    const metallo = new T.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.8, roughness: 0.3 });
    for (const [w, h, x, y] of [[3.1, 0.1, 0, 1.3], [3.1, 0.1, 0, -1.3], [0.1, 2.6, -1.5, 0], [0.1, 2.6, 1.5, 0]]) { const f = ombra(new T.Mesh(new T.BoxGeometry(w, h, 0.12), metallo)); f.position.set(x, y, 0); g.add(f); }
    g.rotation.y = -Math.atan2(c.bz - c.az, c.bx - c.ax);
    g.position.set(c.x, 1.3, c.z);
    g.material = lastra.material;
    V3.scena.add(g);
    return g;
  }
  if (c.tipo === 'rampa') {
    m = ombra(new T.Mesh(new T.BoxGeometry(2.4, 0.22, 3.6), V3.legno));
    const dx = c.dirx ?? 0, dz = c.dirz ?? -1;
    m.rotation.order = 'YXZ'; m.rotation.y = Math.atan2(-dx, -dz); m.rotation.x = Math.atan2(2.5, 3.2);
    m.position.set(c.x, (c.livello || 0) * 2.5 + 1.25, c.z);
  } else {
    m = ombra(new T.Mesh(new T.BoxGeometry(3.4, 2.6, 0.25), V3.legno));
    m.rotation.y = -Math.atan2(c.bz - c.az, c.bx - c.ax);
    m.position.set(c.x, (c.livello || 0) * 2.5 + 1.3, c.z);
  }
  m.material = V3.legno.clone(); m.material.transparent = true;
  m.scale.set(0.01, 0.01, 0.01); // cresce in un attimo, come costruita
  V3.scena.add(m);
  return m;
}

function meshCassa() {
  const T = V3.T, g = new T.Group();
  const oro = new T.MeshStandardMaterial({ color: 0xd9a21b, metalness: 0.7, roughness: 0.3, emissive: 0x5a3a00 });
  const scatola = ombra(new T.Mesh(new T.BoxGeometry(1, 0.6, 0.65), oro)); scatola.position.y = 0.3; g.add(scatola);
  const coperchio = ombra(new T.Mesh(new T.CylinderGeometry(0.33, 0.33, 1, 16, 1, false, 0, Math.PI), oro)); coperchio.rotation.z = Math.PI / 2; coperchio.position.y = 0.6; g.add(coperchio);
  const raggio = new T.Mesh(new T.CylinderGeometry(0.25, 0.6, 14, 16, 1, true), new T.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.18, depthWrite: false, side: T.DoubleSide }));
  raggio.position.y = 7; g.add(raggio);
  V3.scena.add(g);
  return g;
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

function armaInMano() {
  const T = V3.T, A = V3.arma, tipo = G.arsenale ? G.arsenale.corrente : 'pistola';
  if (A.userData.tipo === tipo) return;
  A.userData.tipo = tipo;
  while (A.children.length) A.remove(A.children[0]);
  const nero = new T.MeshStandardMaterial({ color: 0x1d1f23, metalness: 0.7, roughness: 0.35 });
  const legno = new T.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.7 });
  const pezzo = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); A.add(m); return m; };
  if (tipo === 'pistola') { pezzo(new T.BoxGeometry(0.07, 0.09, 0.32), nero, 0, 0, -0.1); pezzo(new T.BoxGeometry(0.06, 0.16, 0.08), nero, 0, -0.1, 0.02); }
  if (tipo === 'pompa') { pezzo(new T.BoxGeometry(0.08, 0.09, 0.9), nero, 0, 0, -0.35); pezzo(new T.BoxGeometry(0.1, 0.1, 0.25), legno, 0, -0.06, -0.4); pezzo(new T.BoxGeometry(0.08, 0.14, 0.3), legno, 0, -0.06, 0.15); }
  if (tipo === 'mitra') { pezzo(new T.BoxGeometry(0.08, 0.1, 0.8), nero, 0, 0, -0.3); pezzo(new T.BoxGeometry(0.06, 0.2, 0.08), nero, 0, -0.13, -0.25); pezzo(new T.BoxGeometry(0.07, 0.12, 0.25), legno, 0, -0.03, 0.15); }
  if (tipo === 'precisione') { pezzo(new T.BoxGeometry(0.07, 0.08, 1.1), nero, 0, 0, -0.45); pezzo(new T.CylinderGeometry(0.035, 0.035, 0.35, 12), nero, 0, 0.08, -0.25).rotation.x = Math.PI / 2; pezzo(new T.BoxGeometry(0.08, 0.13, 0.3), legno, 0, -0.04, 0.15); }
  A.position.set(0.32, -0.3, -0.7); A.scale.set(0.6, 0.6, 0.6);
}

// ---------------------------------------------------------------- ogni fotogramma
function disegna3D(ora, dt) {
  if (!iniziaGrafica3D()) return false;
  V3.tela3d.style.display = 'block';
  const T = V3.T, cam = V3.camera;
  // telecamera: in caduta dal cielo nei primi tre secondi, poi all'altezza degli occhi (più i piani)
  const occhi = 1.65 + (G.livello || 0) * 2.5 + (G.inMovimento ? Math.sin(ora / 95) * 0.03 : 0);
  const k = lim(G.tempo / 3, 0, 1);
  cam.position.set(G.x, occhi + (1 - k * k) * 70, G.z);
  cam.rotation.set(-0.04 - (1 - k) * 0.9, -G.rotta, 0);
  // arma in mano, con il rinculo
  armaInMano();
  const rinculo = G.effetti.lampo || 0;
  V3.arma.position.z = -0.7 + rinculo * 0.07; V3.arma.rotation.x = rinculo * 0.25;
  V3.arma.visible = G.stato === 'gioco' && k >= 1;
  // acqua che si muove
  if (V3.getto) V3.getto.scale.y = 1 + Math.sin(ora / 180) * 0.08;
  V3.mare.position.y = -0.7 + Math.sin(ora / 1400) * 0.06;
  // tempesta
  const Z = zonaArena();
  V3.tempesta.scale.set(Math.max(0.1, Z.r), 1, Math.max(0.1, Z.r)); V3.tempesta.position.x = Z.cx; V3.tempesta.position.z = Z.cz;
  V3.tempesta.material.opacity = 0.26 + Math.sin(ora / 300) * 0.05;
  const P = prossimaArena();
  V3.prossima.visible = !!P && P.r > 0.5;
  if (P) { V3.prossima.scale.set(P.r, P.r, 1); V3.prossima.position.x = P.cx; V3.prossima.position.z = P.cz; }
  // avversari: visibili solo se si sentono (o appena abbattuti)
  const avversari = avversariArena();
  sincronizza(V3.bot, avversari, b => b.nome || b.def.nome, b => meshBot(b, avversari.indexOf(b)), (b, m) => {
    const u = m.userData;
    const vx = b.x - u.px, vz = b.z - u.pz, mosso = Math.hypot(vx, vz);
    if (mosso > 0.002) u.dir = Math.atan2(-vx, -vz);
    if (b.bersaglio) { const [tx, tz] = posDi(b.bersaglio); u.dir = Math.atan2(-(tx - b.x), -(tz - b.z)); }
    u.px = b.x; u.pz = b.z;
    m.visible = b.vivo ? b.udito !== false : (b.morteT || 0) < 2.5;
    m.position.set(b.x, (b.livello || 0) * 2.5 + (mosso > 0.002 ? Math.abs(Math.sin(ora / 110)) * 0.06 : 0), b.z);
    m.rotation.y = u.dir;
    m.rotation.x = b.vivo ? 0 : -Math.min(1, b.morteT / 0.5) * Math.PI / 2;
    u.lampo.visible = (b.lampo || 0) > 0.3;
    if (b.lampo) b.lampo = Math.max(0, b.lampo - dt * 6);
  });
  // costruzioni
  sincronizza(V3.costruzioni, G.costruzioni.filter(c => c.vita > 0 && (c.tipo === 'barricata' || c.tipo === 'rampa' || c.tipo === 'vetro')), c => c.id, meshPezzo, (c, m) => {
    const s = Math.min(1, (G.tempo - (c.nato ?? -9)) / 0.12) || 1;
    m.scale.set(s, s, s);
    if (c.tipo === 'vetro') return;
    m.material.opacity = 0.45 + 0.55 * c.vita / c.vitaMax;
    m.material.color.setHSL(0.08, 0.35, 0.35 + 0.4 * c.vita / c.vitaMax);
  });
  // forzieri
  sincronizza(V3.casse, D.casse, c => c.id, () => meshCassa(), (c, m) => {
    m.visible = c.aTerra !== false;
    m.position.set(c.x, Math.sin(ora / 400 + c.x) * 0.05, c.z);
    m.rotation.y = ora / 1500;
  });
  // anteprima della costruzione mentre tengo premuto B o N
  const tasto = G.tasti.KeyB ? 'muro' : G.tasti.KeyN ? 'rampa' : null;
  V3.anteprima.visible = !!tasto && G.stato === 'gioco';
  if (tasto) {
    const [fx, fz] = avanti(G.rotta);
    V3.anteprima.position.set(G.x + fx * 2.1, (G.livello || 0) * 2.5 + 1.3, G.z + fz * 2.1);
    V3.anteprima.rotation.set(tasto === 'rampa' ? -0.6 : 0, -G.rotta, 0, 'YXZ');
  }
  // esplosioni
  for (const e of G.effetti.esplosioni) {
    if (!e.mesh) { e.mesh = new T.Mesh(new T.SphereGeometry(1, 20, 14), new T.MeshBasicMaterial({ color: 0xffa040, transparent: true })); e.mesh.position.set(e.x, 1, e.z); V3.scena.add(e.mesh); V3.esplosioni.push(e); }
    const s = 1 + e.t * 9; e.mesh.scale.set(s, s, s); e.mesh.material.opacity = Math.max(0, 1 - e.t / 0.8);
  }
  V3.esplosioni = V3.esplosioni.filter(e => { if (e.t >= 0.8) { V3.scena.remove(e.mesh); return false; } return true; });
  // numeri dei danni che salgono e svaniscono
  V3.numeri = V3.numeri.filter(n => {
    n.t += dt; n.sprite.position.y = n.y + n.t * 1.4; n.sprite.material.opacity = Math.max(0, 1 - n.t / 1.2);
    if (n.t > 1.2) { V3.scena.remove(n.sprite); return false; }
    return true;
  });
  aggiornaParticelle(dt);
  V3.r.render(V3.scena, cam);
  return true;
}

function mostraNumero3D(x, z, livello, testo, testa) {
  if (!V3.pronto) return;
  const s = scritta3D(testo, testa ? '#ffd23f' : '#ffffff', testa ? 0.8 : 0.6);
  const y = (livello || 0) * 2.5 + 2.4;
  s.position.set(x + caso(-0.3, 0.3), y, z);
  V3.scena.add(s); V3.numeri.push({ sprite: s, t: 0, y });
}

function nascondi3D() { if (V3.pronto) V3.tela3d.style.display = 'none'; }

// barre e informazioni sopra la scena 3D
function hudBattaglia(W, H, ora) {
  const u = H / 900, pad = 28 * u;
  const barra = (x, y, w, h, frazione, colore, testo) => {
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x, y, w, h);
    g.fillStyle = colore; g.fillRect(x + 2 * u, y + 2 * u, (w - 4 * u) * lim(frazione, 0, 1), h - 4 * u);
    g.font = `700 ${Math.round(h * 0.62)}px -apple-system, Helvetica, sans-serif`; g.textAlign = 'left'; g.fillStyle = '#fff';
    g.fillText(testo, x + 8 * u, y + h * 0.72);
  };
  barra(pad, H - pad - 64 * u, 320 * u, 26 * u, G.scudo / 100, '#3fa7ff', `${Math.round(G.scudo)}`);
  barra(pad, H - pad - 32 * u, 320 * u, 30 * u, G.vita / 100, G.vita > 30 ? '#5cd65c' : '#ff5a5a', `${Math.round(G.vita)}`);
  // materiali e piano
  g.font = `700 ${Math.round(22 * u)}px -apple-system, Helvetica, sans-serif`; g.textAlign = 'left';
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(pad, H - pad - 104 * u, 210 * u, 32 * u);
  g.fillStyle = '#e8b878'; g.fillText(`▦ ${G.inventario.materiali}   ${G.livello ? '▲ piano ' + G.livello : ''}`, pad + 10 * u, H - pad - 80 * u);
  // arma e colpi
  if (G.arsenale) {
    const def = armaDef(), st = armaStato(), rar = st.rarita || 1;
    const coloreRar = { 1: '#cfd4da', 1.15: '#5ad25a', 1.3: '#b46cff', 1.5: '#ffb43a' }[rar] || '#cfd4da';
    g.textAlign = 'right';
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(W - pad - 300 * u, H - pad - 70 * u, 300 * u, 70 * u);
    g.fillStyle = coloreRar; g.font = `700 ${Math.round(20 * u)}px -apple-system, Helvetica, sans-serif`;
    g.fillText(def.nome.toUpperCase(), W - pad - 12 * u, H - pad - 44 * u);
    g.fillStyle = '#fff'; g.font = `800 ${Math.round(28 * u)}px -apple-system, Helvetica, sans-serif`;
    g.fillText(def.mischia ? '—' : testoColpi(def, st, ' / '), W - pad - 12 * u, H - pad - 12 * u);
  }
  // in alto a destra: quanti restano, eliminazioni, tempesta
  g.textAlign = 'right'; g.font = `800 ${Math.round(24 * u)}px -apple-system, Helvetica, sans-serif`;
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(W - pad - 260 * u, pad, 260 * u, 76 * u);
  if (G.modalita === 'duello') {
    g.fillStyle = '#fff'; g.fillText(`Round ${D.round}   ${descriviPunteggio().replace(/\.$/, '')}`, W - pad - 14 * u, pad + 30 * u);
    g.font = `600 ${Math.round(18 * u)}px -apple-system, Helvetica, sans-serif`; g.fillStyle = '#d6b4ff';
    g.fillText(raggioZona() < RAGGIO_ARENA ? `Zona ${Math.round(raggioZona())} m` : 'Zona aperta', W - pad - 14 * u, pad + 60 * u);
  } else {
  g.fillStyle = '#fff'; g.fillText(`👤 ${rimasti()}    ✖ ${B.eliminazioni}`, W - pad - 14 * u, pad + 30 * u);
  const f = FASI_TEMPESTA[B.fase];
  g.font = `600 ${Math.round(18 * u)}px -apple-system, Helvetica, sans-serif`; g.fillStyle = '#d6b4ff';
  g.fillText(!f ? 'Tempesta finale' : B.stadio === 'attesa' ? `Tempesta tra ${Math.max(0, Math.round(B.fine - G.tempo))}s` : 'La tempesta avanza', W - pad - 14 * u, pad + 60 * u);
  }
  // bussola in alto al centro
  const cx = W / 2;
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(cx - 220 * u, pad, 440 * u, 30 * u);
  g.font = `700 ${Math.round(18 * u)}px -apple-system, Helvetica, sans-serif`; g.textAlign = 'center';
  for (const [nome, a] of [['N', 0], ['NE', 0.785], ['E', 1.571], ['SE', 2.356], ['S', 3.1416], ['SO', -2.356], ['O', -1.571], ['NO', -0.785]]) {
    const rel = avvolgi(a - G.rotta);
    if (Math.abs(rel) > 1.2) continue;
    g.fillStyle = nome.length === 1 ? '#ffffff' : '#9aa6b8';
    g.fillText(nome, cx + rel / 1.2 * 210 * u, pad + 22 * u);
  }
  schizziSchermo(W, H);
  // fuori zona: bordo viola
  const Z = zonaArena();
  if (Math.hypot(G.x - Z.cx, G.z - Z.cz) > Z.r) {
    const v = g.createRadialGradient(cx, H / 2, H * 0.3, cx, H / 2, H * 0.9);
    v.addColorStop(0, 'rgba(120,40,200,0)'); v.addColorStop(1, `rgba(120,40,200,${0.45 + Math.sin(ora / 200) * 0.1})`);
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }
}

// ---------------------------------------------------------------- sangue e schegge
const Particelle = [];
function sangue3D(x, z, livello, testa, danno) {
  if (!V3.pronto) return;
  const T = V3.T, y = livello * 2.5 + (testa ? 1.7 : 1.1), n = Math.min(26, 8 + Math.round(danno / 6));
  const mat = new T.MeshBasicMaterial({ color: 0x8a0303 });
  for (let i = 0; i < n; i++) {
    const p = new T.Mesh(new T.SphereGeometry(caso(0.03, 0.07), 6, 4), mat);
    p.position.set(x, y, z); V3.scena.add(p);
    Particelle.push({ m: p, vx: caso(-2.2, 2.2), vy: caso(0.5, 3.2), vz: caso(-2.2, 2.2), t: 0, vita: caso(0.5, 0.9), terra: livello * 2.5 });
  }
  // macchia a terra che svanisce
  const macchia = new T.Mesh(new T.CircleGeometry(caso(0.35, 0.7) * (testa ? 1.4 : 1), 18), new T.MeshBasicMaterial({ color: 0x5a0000, transparent: true, opacity: 0.85, depthWrite: false }));
  macchia.rotation.x = -Math.PI / 2; macchia.position.set(x + caso(-0.3, 0.3), livello * 2.5 + 0.05, z + caso(-0.3, 0.3)); V3.scena.add(macchia);
  Particelle.push({ m: macchia, macchia: true, t: 0, vita: 18 });
}
function scheggeVetro3D(c) {
  if (!V3.pronto) return;
  const T = V3.T, mat = new T.MeshBasicMaterial({ color: 0xd8f1ff, transparent: true, opacity: 0.8 });
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
    if (p.macchia) { p.m.material.opacity = 0.85 * Math.max(0, 1 - p.t / p.vita); }
    else {
      p.vy -= 9.8 * dt;
      p.m.position.x += p.vx * dt; p.m.position.y = Math.max(p.terra + 0.02, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
      if (p.ruota) { p.m.rotation.x += dt * 9; p.m.rotation.y += dt * 7; }
    }
    if (p.t > p.vita) { V3.scena.remove(p.m); Particelle.splice(i, 1); }
  }
}
// schizzi di sangue ai bordi dello schermo quando vengo colpito
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
