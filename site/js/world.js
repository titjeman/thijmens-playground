// Thijmens Playground — "golden hour" floating-island world
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/* ============ utilities ============ */
let seed = 4242;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = (a, b) => a + rnd() * (b - a);
const pick = a => a[Math.floor(rnd() * a.length)];
const TAU = Math.PI * 2;
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => vnoise(x, y) * 0.5 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.2;

const GLSL_NOISE = `
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
`;

const tex = (w, h, draw, opts = {}) => {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...opts.repeat); }
  t.anisotropy = 4; return t;
};
const glowTex = () => tex(128, 128, (g) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.25, "rgba(255,255,255,.55)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
});
const cloudTex = () => tex(256, 256, (g) => {
  for (let i = 0; i < 26; i++) {
    const x = 128 + (rnd() - 0.5) * 120, y = 140 + (rnd() - 0.5) * 60, rad = rr(30, 70);
    const r = g.createRadialGradient(x, y, 0, x, y, rad);
    r.addColorStop(0, "rgba(255,255,255,.55)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
  }
});
/** warm arched windows on a transparent background */
const windowsTex = (cols, rows, opts = {}) => tex(512, 256, (g, w, h) => {
  const cw = w / cols, ch = h / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (opts.skip && rnd() < opts.skip) continue;
    const x = c * cw + cw * 0.28, y = r * ch + ch * 0.22, ww = cw * 0.44, wh = ch * 0.58;
    const lit = rnd() < (opts.lit ?? 0.8);
    g.fillStyle = "rgba(74,58,52,.9)"; // frame
    g.beginPath(); g.moveTo(x - 4, y + wh + 4); g.lineTo(x - 4, y + ww / 2); g.arc(x + ww / 2, y + ww / 2, ww / 2 + 4, Math.PI, 0); g.lineTo(x + ww + 4, y + wh + 4); g.fill();
    const grd = g.createLinearGradient(0, y, 0, y + wh);
    grd.addColorStop(0, lit ? "#fff1c9" : "#7d8bb0"); grd.addColorStop(1, lit ? "#ffb966" : "#56607f");
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(x, y + wh); g.lineTo(x, y + ww / 2); g.arc(x + ww / 2, y + ww / 2, ww / 2, Math.PI, 0); g.lineTo(x + ww, y + wh); g.fill();
    g.fillStyle = "rgba(74,58,52,.8)"; g.fillRect(x + ww / 2 - 1.5, y + 4, 3, wh - 4); g.fillRect(x, y + wh * 0.55, ww, 3);
  }
});
const stoneTex = () => tex(256, 256, (g, w, h) => {
  g.fillStyle = "#efe6d8"; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? -32 : 0; x < w; x += 64) {
    const v = 226 + Math.floor(rnd() * 22); g.fillStyle = `rgb(${v},${v - 8},${v - 20})`; g.fillRect(x + 2, y + 2, 60, 28);
  }
}, { repeat: [3, 2] });

/* ============ main ============ */
export function createWorld({ canvas, islands, onSelect, onFrame, reduceMotion }) {
  const low = innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4;
  const Q = low ? 0.55 : 1;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1.25 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = !low; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const HAZE = new THREE.Color("#e9b8aa");
  scene.fog = new THREE.FogExp2(HAZE, 0.0024);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 3000);
  camera.position.set(60, 90, 200);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.06, minDistance: 14, maxDistance: 150, maxPolarAngle: Math.PI * 0.58, enablePan: false, autoRotateSpeed: 0.25 });
  controls.target.set(0, 4, 0);

  const tick = [], timed = [];
  const T = m => { timed.push(m); return m; };
  const GLOW = glowTex(), CLOUD = cloudTex();
  const sprite = (color, s, opacity = 1, map = GLOW, additive = true) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: !additive }));
    sp.scale.set(s, s, 1); return sp;
  };
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
  const M = {
    cream: std("#f3ebdf", { map: stoneTex() }),
    creamPlain: std("#f1e8dc"),
    stone: std("#e2d6c4"),
    gold: std("#d6b06b", { metalness: 0.75, roughness: 0.35 }),
    brass: std("#c49a55", { metalness: 0.8, roughness: 0.3 }),
    wood: std("#9b6f4e"),
    darkWood: std("#6e4c37"),
    glass: new THREE.MeshPhysicalMaterial({ color: "#cfe8f2", roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35 }),
    water: new THREE.MeshStandardMaterial({ color: "#7fc3d0", roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88 }),
    leaf: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9, flatShading: true }),
    rock: std("#c9b39a", { flatShading: true }),
    dark: std("#4a4058"),
  };
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = !low; m.receiveShadow = !low;
    if (parent) parent.add(m); return m;
  };

  /* ---------- lights ---------- */
  const SUN = new THREE.Vector3(0.72, 0.28, -0.64).normalize();
  scene.add(new THREE.HemisphereLight("#c3cff7", "#d9a08c", 0.85));
  const sun = new THREE.DirectionalLight("#ffd2a1", 3.0); sun.position.copy(SUN).multiplyScalar(150);
  sun.castShadow = !low; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 20, far: 340 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const fill = new THREE.DirectionalLight("#9fb2ff", 0.55); fill.position.set(-80, 40, 90); scene.add(fill);

  /* ---------- sky ---------- */
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(2000, 48, 24), T(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uTime: { value: 0 }, uSun: { value: SUN } },
    vertexShader: `varying vec3 vD; void main(){ vD=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position=p.xyww; }`,
    fragmentShader: GLSL_NOISE + `uniform float uTime; uniform vec3 uSun; varying vec3 vD;
      void main(){ vec3 d=normalize(vD); float h=d.y;
        vec3 horizon=vec3(1.0,0.80,0.62), rose=vec3(0.95,0.62,0.62), lav=vec3(0.56,0.55,0.82), top=vec3(0.18,0.22,0.46);
        vec3 c=mix(horizon,rose,smoothstep(-0.02,0.10,h)); c=mix(c,lav,smoothstep(0.08,0.32,h)); c=mix(c,top,smoothstep(0.30,0.85,h));
        c=mix(c,vec3(0.98,0.78,0.70),smoothstep(0.0,-0.25,h));
        float s=max(dot(d,uSun),0.0);
        c+=vec3(1.0,0.72,0.45)*pow(s,8.0)*0.55 + vec3(1.0,0.9,0.7)*pow(s,250.0)*2.5;
        vec2 uv=d.xz/(d.y+0.35); float ci=fbm(uv*1.6+vec2(uTime*0.004,0.0)); float cir=smoothstep(0.55,0.85,ci)*smoothstep(0.05,0.3,h)*(1.0-smoothstep(0.5,0.9,h));
        c=mix(c,vec3(1.0,0.86,0.82)+vec3(0.2,0.1,0.0)*pow(s,3.0),cir*0.45);
        float st=pow(h21(floor(d.xz*700.0/(d.y+0.4))),80.0)*smoothstep(0.45,0.85,h)*1.4; c+=vec3(st);
        gl_FragColor=vec4(c*0.86,1.0); }`,
  }))));

  /* ---------- cloud sea ---------- */
  const islandXZ = islands.map(i => new THREE.Vector3(i.pos[0], 0, i.pos[2]));
  const cloudSea = T(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uSun: { value: SUN }, uIP: { value: islandXZ }, uHaze: { value: HAZE } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: GLSL_NOISE + `uniform float uTime; uniform vec3 uSun; uniform vec3 uIP[${islands.length}]; uniform vec3 uHaze; varying vec3 vW;
      void main(){ vec2 p=vW.xz*0.010; float n=fbm(p+vec2(uTime*0.006,uTime*0.003)); float n2=fbm(p*2.7+n*1.3-vec2(uTime*0.01,0.0));
        float d=n*0.6+n2*0.5; float c=smoothstep(0.35,0.75,d);
        float lit=smoothstep(0.4,0.9,fbm(p*2.7+n*1.3+uSun.xz*0.08));
        vec3 shade=vec3(0.78,0.66,0.82), light=vec3(1.0,0.90,0.84), warm=vec3(1.0,0.78,0.60);
        vec3 col=mix(shade,light,lit); col=mix(col,warm,pow(lit,3.0)*0.5);
        float sh=0.0; for(int i=0;i<${islands.length};i++){ float dd=length(vW.xz-uIP[i].xz-uSun.xz*12.0); sh+=exp(-dd*dd/90.0); }
        col*=1.0-0.22*clamp(sh,0.0,1.0);
        float dist=length(vW.xz); col=mix(col,uHaze,smoothstep(80.0,700.0,dist)*0.85);
        gl_FragColor=vec4(col,(0.55+0.45*c)*(1.0-smoothstep(500.0,1100.0,dist))); }`,
  }));
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), cloudSea); sea.rotation.x = -Math.PI / 2; sea.position.y = -42; scene.add(sea);

  /* ---------- cloud puffs ---------- */
  {
    const n = Math.round(70 * Q);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, r = rr(55, 280), y = rr(-40, -16) + (r > 160 ? rr(0, 30) : 0);
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      if (cz > 30 && Math.abs(cx) < 70 && y > -30) continue; // keep the view from the camera clear
      const s = sprite(rnd() < 0.5 ? "#fff1ea" : "#ffe1d4", rr(22, 50), rr(0.35, 0.65), CLOUD, false);
      s.position.set(Math.cos(a) * r, y, Math.sin(a) * r); scene.add(s);
      const sp = rr(0.2, 0.6), ph = rnd() * TAU, base = s.position.clone();
      tick.push(t => { s.position.x = base.x + Math.sin(t * 0.02 * sp + ph) * 6; s.position.z = base.z + Math.cos(t * 0.017 * sp + ph) * 4; });
    }
  }

  /* ---------- distant floating rocks on the horizon ---------- */
  {
    const n = Math.round(26 * Q);
    const g = new THREE.DodecahedronGeometry(1, 0);
    const im = new THREE.InstancedMesh(g, std("#c7a9a0", { flatShading: true }), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, r = rr(260, 520);
      q.setFromEuler(new THREE.Euler(rnd(), rnd(), rnd())); const k = rr(3, 9); s.set(k, k * rr(0.5, 1.3), k);
      m4.compose(new THREE.Vector3(Math.cos(a) * r, rr(-38, 0), Math.sin(a) * r), q, s); im.setMatrixAt(i, m4);
    }
    scene.add(im);
  }

  /* ---------- islands ---------- */
  const islandObjs = {};
  const LEAVES = ["#86b36f", "#6fa363", "#9cc47c", "#5e9460", "#a9c983"];
  const BLOSSOM = ["#f2b8c6", "#f6cbd3", "#f0a9b8"];

  function buildIsland(def) {
    const accent = new THREE.Color(def.color);
    const root = new THREE.Group(); root.position.set(...def.pos); scene.add(root);
    const body = new THREE.Group(); root.add(body);
    const R = def.kind === "tower" ? 10 : 8.5;
    const sd = def.pos[0] * 0.37 + def.pos[2] * 0.11;
    const rad = th => R * (1 + 0.09 * Math.sin(3 * th + sd) + 0.05 * Math.sin(5 * th + 2 * sd) + 0.06 * (vnoise(Math.cos(th) * 2 + sd, Math.sin(th) * 2) - 0.5));
    const bump = (x, z) => { const d = Math.hypot(x, z) / R; return (fbm(x * 0.18 + sd, z * 0.18) - 0.45) * 0.9 * (1 - Math.min(1, d) ** 3) + 0.25 * (1 - d * d); };
    const S = 112, K = 12;
    // grass top
    {
      const pos = [], col = [], idx = [], c = new THREE.Color();
      const grassA = new THREE.Color("#93bd72"), grassB = new THREE.Color("#79a862"), edge = new THREE.Color("#a7b26f");
      pos.push(0, bump(0, 0), 0); c.copy(grassA); col.push(c.r, c.g, c.b);
      for (let k = 1; k <= K; k++) for (let s = 0; s < S; s++) {
        const th = s / S * TAU, rr0 = rad(th) * k / K, x = Math.cos(th) * rr0, z = Math.sin(th) * rr0;
        pos.push(x, k === K ? 0 : bump(x, z), z);
        c.copy(grassA).lerp(grassB, fbm(x * 0.3 + 9, z * 0.3)); if (k >= K - 1) c.lerp(edge, 0.5);
        col.push(c.r, c.g, c.b);
      }
      for (let s = 0; s < S; s++) idx.push(0, 1 + ((s + 1) % S), 1 + s);
      for (let k = 1; k < K; k++) for (let s = 0; s < S; s++) {
        const a = 1 + (k - 1) * S + s, b = 1 + (k - 1) * S + (s + 1) % S, c2 = 1 + k * S + s, d = 1 + k * S + (s + 1) % S;
        idx.push(a, b, c2, b, d, c2);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
      const top = mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), 0, 0, 0, body); top.castShadow = false;
    }
    // soil lip + layered rock underside (strata)
    {
      const L = 16, depth = def.kind === "tower" ? 17 : 14;
      const pos = [], col = [], idx = [], c = new THREE.Color();
      const strata = ["#c9a27e", "#d8b796", "#b48a6a", "#c69d82", "#9e7a66", "#8e6f63"].map(h => new THREE.Color(h));
      const ring = [];
      for (let j = 0; j <= L; j++) {
        const t = j / L; const row = [];
        for (let s = 0; s < S; s++) {
          const th = s / S * TAU, n = vnoise(th * 3 + sd, t * 6);
          let r, y;
          if (j === 0) { r = rad(th); y = 0; }
          else if (j === 1) { r = rad(th) * 1.015; y = -0.7; }
          else { const u = (j - 1) / (L - 1); r = rad(th) * Math.pow(1 - u, 0.85) * (0.82 + 0.3 * n) + 0.05; y = -0.7 - Math.pow(u, 0.9) * depth * (0.85 + 0.3 * vnoise(th * 2 + sd, 3)); }
          row.push(pos.length / 3); pos.push(Math.cos(th) * r, y, Math.sin(th) * r);
          if (j <= 1) c.set("#6f5442"); else { const band = Math.floor((-y) * 0.9 + n * 1.5) % strata.length; c.copy(strata[(band + strata.length) % strata.length]).lerp(new THREE.Color("#7f6a72"), Math.min(1, -y / depth) * 0.45); }
          col.push(c.r, c.g, c.b);
        }
        ring.push(row);
      }
      const tip = pos.length / 3; pos.push(0, -0.7 - depth * 1.12, 0); c.set("#7d6a72"); col.push(c.r, c.g, c.b);
      for (let j = 0; j < L; j++) for (let s = 0; s < S; s++) { const a = ring[j][s], b = ring[j][(s + 1) % S], c2 = ring[j + 1][s], d = ring[j + 1][(s + 1) % S]; idx.push(a, c2, b, b, c2, d); }
      for (let s = 0; s < S; s++) idx.push(ring[L][s], tip, ring[L][(s + 1) % S]);
      let g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
      g = g.toNonIndexed(); g.computeVertexNormals();
      mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }), 0, 0, 0, body);
      // hanging roots / vines
      for (let k = 0; k < 9; k++) {
        const th = rnd() * TAU, r0 = rad(th) * 0.96, p0 = new THREE.Vector3(Math.cos(th) * r0, -0.6, Math.sin(th) * r0);
        const len = rr(2, 5.5), p1 = p0.clone().add(new THREE.Vector3(rr(-0.4, 0.4), -len * 0.5, rr(-0.4, 0.4))), p2 = p0.clone().add(new THREE.Vector3(rr(-0.6, 0.6), -len, rr(-0.6, 0.6)));
        mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p0, p1, p2), 10, 0.06, 4), std(rnd() < 0.5 ? "#6f8f5a" : "#7c6450"), 0, 0, 0, body);
      }
    }
    // trees
    const footprint = def.kind === "tower" ? 5.4 : 5.6;
    const spots = [];
    const tierAt = [0, Math.PI, -Math.PI / 2, -Math.PI / 2 + 0.9].map(a => { const r = footprint + 1.6; const x = Math.cos(a) * r, z = Math.sin(a) * r; spots.push([x, z]); return [x, z]; });
    { const thP = Math.PI / 2 + (def.pos[0] > 0 ? -0.35 : 0.35); for (let r = footprint; r < R * 1.05; r += 0.8) spots.push([Math.cos(thP) * r, Math.sin(thP) * r]); } // keep the path (and the agents on it) clear
    const free = (x, z, m) => Math.hypot(x, z) > footprint && spots.every(([a, b]) => Math.hypot(a - x, b - z) > m);
    {
      const nT = Math.round((def.locked ? 6 : 15) * Q);
      const blobs = [], trunks = [];
      for (let i = 0, tries = 0; i < nT && tries < 400; tries++) {
        const th = rnd() * TAU, r = rr(0.35, 0.86) * rad(th), x = Math.cos(th) * r, z = Math.sin(th) * r;
        if (!free(x, z, 1.6)) continue; spots.push([x, z]); i++;
        const blossom = rnd() < 0.14 && !def.locked, y = bump(x, z), h = rr(1.2, 2.4), s = rr(0.8, 1.3) * (blossom ? 0.75 : 1);
        trunks.push([x, y, z, h]);
        const colr = blossom ? pick(BLOSSOM) : pick(LEAVES);
        const kind = rnd();
        if (kind < 0.3) { // conifer-ish stack
          for (let k = 0; k < 3; k++) blobs.push([x, y + h + k * 0.7 * s, z, (1.1 - k * 0.3) * s, 0.9 * s, colr]);
        } else for (let k = 0; k < 3; k++) blobs.push([x + rr(-0.5, 0.5) * s, y + h + rr(0, 0.9) * s, z + rr(-0.5, 0.5) * s, rr(0.8, 1.15) * s, rr(0.8, 1.0) * s, colr]);
      }
      const tg = new THREE.CylinderGeometry(0.1, 0.16, 1, 6); tg.translate(0, 0.5, 0);
      const ti = new THREE.InstancedMesh(tg, M.darkWood, trunks.length);
      const bi = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), M.leaf, blobs.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
      trunks.forEach(([x, y, z, h], i) => { m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, h + 0.4, 1)); ti.setMatrixAt(i, m4); });
      blobs.forEach(([x, y, z, sx, sy, col], i) => { q.setFromEuler(new THREE.Euler(rnd(), rnd(), rnd())); m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sx)); bi.setMatrixAt(i, m4); bi.setColorAt(i, c.set(col)); });
      ti.castShadow = bi.castShadow = !low; bi.receiveShadow = !low; body.add(ti, bi);
    }
    // bushes, flowers, rocks
    {
      const n = Math.round((def.locked ? 10 : 30) * Q);
      const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), M.leaf, n);
      const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshStandardMaterial({ color: "#fff", roughness: 0.6 }), n * 4);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(); let f = 0;
      for (let i = 0; i < n; i++) {
        const th = rnd() * TAU, r = rr(0.3, 0.95) * rad(th), x = Math.cos(th) * r, z = Math.sin(th) * r;
        if (Math.hypot(x, z) < footprint - 0.4) { bush.setMatrixAt(i, m4.makeScale(0, 0, 0)); continue; }
        const s = rr(0.3, 0.6), y = bump(x, z);
        m4.compose(new THREE.Vector3(x, y + s * 0.5, z), q, new THREE.Vector3(s * 1.3, s, s * 1.3)); bush.setMatrixAt(i, m4); bush.setColorAt(i, c.set(pick(LEAVES)).multiplyScalar(0.92));
        for (let k = 0; k < 4 && !def.locked; k++) { m4.makeTranslation(x + rr(-0.6, 0.6), y + 0.08, z + rr(-0.6, 0.6)); fl.setMatrixAt(f, m4); fl.setColorAt(f++, c.set(pick(["#fff4e6", "#f6c1cf", "#ffd88a", "#c9b6ef"]))); }
      }
      fl.count = f; body.add(bush, fl);
      const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), M.rock, 8);
      for (let i = 0; i < 8; i++) { const th = rnd() * TAU, r = rad(th) * rr(0.85, 0.97), x = Math.cos(th) * r, z = Math.sin(th) * r, s = rr(0.25, 0.6); q.setFromEuler(new THREE.Euler(rnd(), rnd(), rnd())); m4.compose(new THREE.Vector3(x, bump(x, z), z), q, new THREE.Vector3(s, s * 0.7, s)); rocks.setMatrixAt(i, m4); }
      rocks.castShadow = !low; body.add(rocks);
    }
    // stone path from the building to the edge (towards the camera)
    {
      const th = Math.PI / 2 + (def.pos[0] > 0 ? -0.35 : 0.35), n = 9;
      const tiles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.45, 0.12, 7), M.stone, n);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      for (let i = 0; i < n; i++) {
        const r = footprint - 0.6 + i * ((rad(th) - footprint) / n), x = Math.cos(th) * r + rr(-0.15, 0.15), z = Math.sin(th) * r + rr(-0.15, 0.15);
        q.setFromEuler(new THREE.Euler(0, rnd() * 3, 0)); m4.compose(new THREE.Vector3(x, bump(x, z) + 0.03, z), q, new THREE.Vector3(1, 1, 1)); tiles.setMatrixAt(i, m4);
      }
      tiles.receiveShadow = !low; body.add(tiles);
      // lanterns along the path
      for (const side of [-1, 1]) for (const k of [0.35, 0.75]) {
        const r = footprint + (rad(th) - footprint) * k, ox = Math.cos(th + Math.PI / 2) * 0.9 * side, oz = Math.sin(th + Math.PI / 2) * 0.9 * side;
        const x = Math.cos(th) * r + ox, z = Math.sin(th) * r + oz, y = bump(x, z);
        mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.1, 6), M.darkWood, x, y + 0.55, z, body);
        const lamp = mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), new THREE.MeshStandardMaterial({ color: "#fff1cc", emissive: "#ffc477", emissiveIntensity: 2.2 }), x, y + 1.18, z, body); lamp.castShadow = false;
        const gs = sprite("#ffc477", 1.6, 0.7); gs.position.set(x, y + 1.18, z); body.add(gs);
      }
    }
    // pond + waterfall (active islands)
    if (!def.locked) {
      const th = def.pos[0] >= 0 ? -0.2 : Math.PI + 0.2;
      const edgeR = rad(th), pr = edgeR * 0.72, px = Math.cos(th) * pr, pz = Math.sin(th) * pr;
      const pond = mesh(new THREE.CircleGeometry(1.5, 32), M.water, px, bump(px, pz) + 0.06, pz, body); pond.rotation.x = -Math.PI / 2; pond.castShadow = false;
      const stream = mesh(new THREE.PlaneGeometry(edgeR - pr, 0.9), M.water, Math.cos(th) * (pr + edgeR) / 2, 0.08, Math.sin(th) * (pr + edgeR) / 2, body);
      stream.rotation.x = -Math.PI / 2; stream.rotation.z = -th; stream.castShadow = false;
      const fallH = 15, wg = new THREE.PlaneGeometry(1.1, fallH, 1, 30);
      const p = wg.attributes.position;
      for (let i = 0; i < p.count; i++) { const t = (fallH / 2 - p.getY(i)) / fallH; p.setZ(i, 0.9 * Math.sqrt(t) + 1.2 * t); p.setX(i, p.getX(i) * (1 + t * 0.8)); }
      wg.translate(0, -fallH / 2, 0);
      const wm = T(new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: GLSL_NOISE + `uniform float uTime; varying vec2 vUv;
          void main(){ float s=fbm(vec2(vUv.x*6.0, vUv.y*3.0+uTime*1.6)); float streak=smoothstep(0.35,0.8,s);
            vec3 c=mix(vec3(0.62,0.84,0.90),vec3(1.0),streak); float edge=smoothstep(0.0,0.2,vUv.x)*smoothstep(1.0,0.8,vUv.x);
            float a=(0.55+0.45*streak)*edge*smoothstep(0.0,0.35,vUv.y); gl_FragColor=vec4(c,a); }`,
      }));
      const fall = new THREE.Mesh(wg, wm); fall.position.set(Math.cos(th) * edgeR * 1.0, 0.05, Math.sin(th) * edgeR * 1.0); fall.rotation.y = -th + Math.PI / 2; body.add(fall);
      for (let k = 0; k < 4; k++) { const m = sprite("#ffffff", rr(3, 6), 0.5, CLOUD, false); const d = edgeR + 1.6 + k * 0.4; m.position.set(Math.cos(th) * d, -fallH * (0.55 + k * 0.12), Math.sin(th) * d); body.add(m); tick.push(t => { m.material.opacity = 0.35 + 0.15 * Math.sin(t * 1.3 + k); }); }
    }
    // buildings
    const B = new THREE.Group(); body.add(B);
    const ctx = { B, accent, def, R, bump };
    if (def.kind === "tower") buildLighthouse(ctx);
    else if (def.kind === "research") buildObservatory(ctx);
    else if (def.kind === "video") buildTheater(ctx);
    else if (def.kind === "workshop") buildWorkshop(ctx);
    else if (def.kind === "lab") buildLab(ctx);
    else if (def.kind === "clips") buildBroadcast(ctx);
    else if (def.kind === "studio") buildFilmStudio(ctx);
    else if (def.kind === "school") buildSchool(ctx);
    else if (def.kind === "marketing") buildAgency(ctx);
    else buildConstruction(ctx);
    const tiers = []; void tierAt;
    // tiny satellite islets
    for (let k = 0; k < 2; k++) {
      const g = new THREE.Group(); root.add(g);
      const r0 = rr(1, 1.8);
      mesh(new THREE.ConeGeometry(r0, r0 * 2.6, 7), M.rock, 0, -r0 * 1.3, 0, g).rotation.x = Math.PI;
      const cap = mesh(new THREE.CylinderGeometry(r0, r0 * 1.02, 0.25, 9), std("#8db86d"), 0, 0, 0, g);
      const tr = mesh(new THREE.IcosahedronGeometry(r0 * 0.55, 1), new THREE.MeshStandardMaterial({ color: pick(LEAVES), flatShading: true }), 0, r0 * 0.75, 0, g);
      const a = rnd() * TAU, d = R + rr(4, 7), h = rr(-4, 3), sp = rr(0.03, 0.06) * (rnd() < 0.5 ? 1 : -1);
      g.position.set(Math.cos(a) * d, h, Math.sin(a) * d); void sp;
    }
    // fireflies
    if (!def.locked) {
      const n = Math.round(40 * Q), g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), o = new Float32Array(n);
      for (let i = 0; i < n; i++) { const th = rnd() * TAU, r = rr(1, R); p.set([Math.cos(th) * r, rr(0.5, 4), Math.sin(th) * r], i * 3); o[i] = rnd(); }
      g.setAttribute("position", new THREE.BufferAttribute(p, 3)); g.setAttribute("aO", new THREE.BufferAttribute(o, 1));
      body.add(new THREE.Points(g, T(new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() } },
        vertexShader: `uniform float uTime; uniform float uPR; attribute float aO; varying float vA;
          void main(){ vec3 q=position; q.x+=sin(uTime*0.5+aO*30.0)*0.6; q.y+=sin(uTime*0.7+aO*20.0)*0.4; q.z+=cos(uTime*0.4+aO*10.0)*0.6;
          vA=0.3+0.7*pow(0.5+0.5*sin(uTime*2.0+aO*40.0),3.0); vec4 mv=modelViewMatrix*vec4(q,1.0); gl_PointSize=uPR*2.4*(40.0/-mv.z); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `varying float vA; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d)*vA; gl_FragColor=vec4(vec3(1.0,0.82,0.5)*a*1.8,a); }`,
      }))));
    }
    // selection halo (soft ring of light around the island edge)
    const sel = mesh(new THREE.RingGeometry(R * 1.12, R * 1.17, 96), new THREE.MeshBasicMaterial({ color: "#fff3dc", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), 0, 0.3, 0, body);
    sel.rotation.x = -Math.PI / 2; sel.castShadow = sel.receiveShadow = false;
    const glow = sprite(accent, R * 2.6, 0); glow.position.y = 2; body.add(glow);
    root.traverse(o => { o.userData.id = def.id; });
    return { root, body, def, sel, glow, tiers, labelY: ctx.labelY ?? 10, bump, R };
  }

  /* ---------- building kit ---------- */
  const windowBand = (r, h, cols, rows, parent, y, opts = {}) => {
    const t = windowsTex(cols, rows, opts); t.wrapS = THREE.RepeatWrapping;
    const m = mesh(new THREE.CylinderGeometry(r, r, h, 48, 1, true), new THREE.MeshStandardMaterial({ map: t, transparent: true, emissive: "#ffb766", emissiveMap: t, emissiveIntensity: 0.9, roughness: 0.6, alphaTest: 0.05 }), 0, y, 0, parent);
    m.castShadow = false; return m;
  };
  const facade = (w, h, cols, rows, parent, x, y, z, ry = 0, opts = {}) => {
    const t = windowsTex(cols, rows, opts);
    const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, emissive: "#ffb766", emissiveMap: t, emissiveIntensity: 0.9, alphaTest: 0.05 }), x, y, z, parent);
    m.rotation.y = ry; m.castShadow = false; return m;
  };
  const railing = (r, y, parent, n = 36) => {
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4), M.gold, n), m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { const a = i / n * TAU; posts.setMatrixAt(i, m4.makeTranslation(Math.cos(a) * r, y + 0.25, Math.sin(a) * r)); }
    parent.add(posts); mesh(new THREE.TorusGeometry(r, 0.035, 6, 64), M.gold, 0, y + 0.5, 0, parent).rotation.x = Math.PI / 2;
  };
  const prismRoof = (w, d, h, mat) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0); const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2); return new THREE.Mesh(g, mat); };
  const flag = (parent, x, y, z, color) => {
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), M.gold, x, y + 0.8, z, parent);
    const fg = new THREE.PlaneGeometry(0.8, 0.45, 8, 1); fg.translate(0.4, 0, 0);
    const f = mesh(fg, std(color, { side: THREE.DoubleSide }), x, y + 1.35, z, parent); const p = fg.attributes.position, base = p.array.slice();
    tick.push(t => { for (let i = 0; i < p.count; i++) p.setZ(i, base[i * 3 + 2] + Math.sin(t * 4 + base[i * 3] * 5) * 0.06 * base[i * 3]); p.needsUpdate = true; });
  };

  function buildLighthouse({ B, accent }) {
    // plaza with colonnade
    mesh(new THREE.CylinderGeometry(4.6, 4.9, 0.35, 48), M.stone, 0, 0.35, 0, B);
    mesh(new THREE.CylinderGeometry(3.9, 3.9, 0.12, 48), std("#e9dcc6"), 0, 0.58, 0, B);
    const cols = 12;
    for (let i = 0; i < cols; i++) { const a = i / cols * TAU; const c = mesh(new THREE.CylinderGeometry(0.16, 0.19, 2.4, 10), M.creamPlain, Math.cos(a) * 4.2, 1.75, Math.sin(a) * 4.2, B); mesh(new THREE.BoxGeometry(0.42, 0.14, 0.42), M.creamPlain, c.position.x, 2.98, c.position.z, B); }
    mesh(new THREE.TorusGeometry(4.2, 0.16, 8, 64), M.creamPlain, 0, 3.1, 0, B).rotation.x = Math.PI / 2;
    mesh(new THREE.TorusGeometry(4.2, 0.05, 6, 64), M.gold, 0, 3.27, 0, B).rotation.x = Math.PI / 2;
    // shaft
    const segs = [[2.3, 2.0, 6, 0.55], [1.95, 1.7, 5, 6.55], [1.6, 1.45, 4, 11.55]];
    segs.forEach(([r0, r1, h, y], i) => {
      mesh(new THREE.CylinderGeometry(r1, r0, h, 40), M.cream, 0, y + h / 2, 0, B);
      windowBand((r0 + r1) / 2 + 0.02, h * 0.6, 8, 2, B, y + h / 2, { lit: 0.85 });
      mesh(new THREE.CylinderGeometry(r1 + 0.12, r1 + 0.12, 0.18, 40), M.gold, 0, y + h, 0, B);
      if (i < 2) { mesh(new THREE.CylinderGeometry(r1 + 0.55, r1 + 0.45, 0.16, 40), M.creamPlain, 0, y + h + 0.1, 0, B); railing(r1 + 0.5, y + h + 0.18, B); }
    });
    // lantern room
    const top = 15.55;
    mesh(new THREE.CylinderGeometry(1.7, 1.55, 0.22, 40), M.creamPlain, 0, top + 0.1, 0, B); railing(1.6, top + 0.2, B, 28);
    mesh(new THREE.CylinderGeometry(1.05, 1.05, 1.7, 24, 1, true), M.glass, 0, top + 1.05, 0, B);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; mesh(new THREE.BoxGeometry(0.06, 1.7, 0.06), M.gold, Math.cos(a) * 1.06, top + 1.05, Math.sin(a) * 1.06, B); }
    const lamp = mesh(new THREE.SphereGeometry(0.45, 20, 14), new THREE.MeshStandardMaterial({ color: "#fff6e0", emissive: "#ffd28a", emissiveIntensity: 4 }), 0, top + 1.05, 0, B); lamp.castShadow = false;
    const lg = sprite("#ffd9a0", 7, 0.85); lg.position.y = top + 1.05; B.add(lg);
    mesh(new THREE.SphereGeometry(1.2, 32, 14, 0, TAU, 0, Math.PI / 2), M.gold, 0, top + 1.9, 0, B);
    mesh(new THREE.ConeGeometry(0.12, 1.4, 10), M.gold, 0, top + 3.6, 0, B);
    mesh(new THREE.SphereGeometry(0.16, 12, 8), M.gold, 0, top + 4.3, 0, B);
    flag(B, 0.15, top + 3.0, 0, accent);
    // rotating light beams (soft)
    const beams = new THREE.Group(); beams.position.y = top + 1.05; B.add(beams);
    const bm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; void main(){ float a=pow(vUv.y,2.2)*0.16; gl_FragColor=vec4(vec3(1.0,0.86,0.6)*a,a); }` });
    for (const s of [0, Math.PI]) { const c = new THREE.Mesh(new THREE.ConeGeometry(2.4, 30, 24, 1, true), bm); c.rotation.z = Math.PI / 2; c.position.x = 15; const g = new THREE.Group(); g.rotation.y = s; g.add(c); beams.add(g); }
    tick.push(t => { beams.rotation.y = t * 0.35; });
    // small garden benches around plaza
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + Math.PI / 4; const bx = Math.cos(a) * 3.2, bz = Math.sin(a) * 3.2; const b = mesh(new THREE.BoxGeometry(0.9, 0.08, 0.32), M.wood, bx, 0.98, bz, B); b.rotation.y = -a; }
    return Object.assign(arguments[0], { labelY: 22 });
  }

  function buildObservatory(ctx) {
    const { B, accent } = ctx;
    const patina = std("#83b5a5", { metalness: 0.35, roughness: 0.45 });
    // observatory drum + dome
    const ob = new THREE.Group(); ob.position.set(-1.6, 0, -1.2); B.add(ob);
    mesh(new THREE.CylinderGeometry(2.3, 2.45, 0.4, 40), M.stone, 0, 0.45, 0, ob);
    mesh(new THREE.CylinderGeometry(2.0, 2.1, 3.0, 40), M.cream, 0, 2.15, 0, ob);
    windowBand(2.07, 1.6, 7, 1, ob, 2.0);
    mesh(new THREE.CylinderGeometry(2.18, 2.18, 0.2, 40), M.gold, 0, 3.72, 0, ob);
    const dome = new THREE.Group(); dome.position.y = 3.8; ob.add(dome);
    mesh(new THREE.SphereGeometry(2.05, 40, 20, 0, TAU, 0, Math.PI / 2), patina, 0, 0, 0, dome);
    for (let i = 0; i < 10; i++) { const r = mesh(new THREE.TorusGeometry(2.06, 0.025, 4, 40, Math.PI), M.gold, 0, 0, 0, dome); r.rotation.y = i / 10 * Math.PI; }
    mesh(new THREE.BoxGeometry(0.7, 2.2, 1.6), std("#2f3346"), 0, 1.0, 1.2, dome).rotation.x = -0.6;
    const tele = mesh(new THREE.CylinderGeometry(0.22, 0.32, 2.6, 16), M.brass, 0, 1.5, 1.5, dome); tele.rotation.x = -0.9;
    mesh(new THREE.SphereGeometry(0.18, 12, 8), M.gold, 0, 2.08, 0, dome);
    tick.push(t => { dome.rotation.y = Math.sin(t * 0.12) * 1.4 + 0.6; });
    // library hall with arched windows and slate roof
    const lib = new THREE.Group(); lib.position.set(2.5, 0, 0.6); lib.rotation.y = -0.5; B.add(lib);
    mesh(new THREE.BoxGeometry(4.6, 0.3, 3.0), M.stone, 0, 0.4, 0, lib);
    mesh(new THREE.BoxGeometry(4.2, 2.6, 2.6), M.cream, 0, 1.85, 0, lib);
    facade(3.9, 2.1, 5, 1, lib, 0, 1.9, 1.31); facade(3.9, 2.1, 5, 1, lib, 0, 1.9, -1.31, Math.PI);
    const roof = prismRoof(3.1, 4.6, 1.4, std("#6d8792", { roughness: 0.6 })); roof.position.set(0, 3.15, 0); roof.rotation.y = Math.PI / 2; roof.castShadow = true; lib.add(roof);
    mesh(new THREE.BoxGeometry(4.45, 0.14, 2.85), M.gold, 0, 3.15, 0, lib);
    mesh(new THREE.BoxGeometry(0.42, 1.2, 0.42), std("#b9907a"), 1.2, 3.9, 0.4, lib);
    // door
    mesh(new THREE.BoxGeometry(0.8, 1.3, 0.1), M.darkWood, 0, 1.2, 1.32, lib);
    // chimney smoke
    for (let k = 0; k < 5; k++) { const s = sprite("#f5ece8", 1, 0.5, CLOUD, false); lib.add(s); tick.push(t => { const u = (t * 0.15 + k / 5) % 1; s.position.set(1.2 + u * 0.8, 4.5 + u * 3, 0.4 + Math.sin(u * 6) * 0.2); s.scale.setScalar(0.6 + u * 2.2); s.material.opacity = 0.45 * (1 - u); }); }
    // armillary sphere on a pedestal
    const ar = new THREE.Group(); ar.position.set(0.6, 0, 3.6); B.add(ar);
    mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.0, 12), M.stone, 0, 0.6, 0, ar);
    const rings = new THREE.Group(); rings.position.y = 1.9; ar.add(rings);
    for (let i = 0; i < 3; i++) { const r = mesh(new THREE.TorusGeometry(0.75 - i * 0.12, 0.035, 8, 48), M.brass, 0, 0, 0, rings); r.rotation.set(i * 0.9, i * 0.6, 0); tick.push(t => { r.rotation.y = t * (0.3 + i * 0.2); }); }
    mesh(new THREE.SphereGeometry(0.2, 16, 12), std(accent.getStyle(), { metalness: 0.4, roughness: 0.3 }), 0, 0, 0, rings);
    flag(B, -1.6, 6.0, -1.2, accent);
    ctx.labelY = 10.5; return ctx;
  }

  function buildTheater(ctx) {
    const { B, accent } = ctx;
    const blush = std("#f2ddd2", { map: stoneTex() });
    const th = new THREE.Group(); th.position.set(0, 0, -2.2); B.add(th);
    mesh(new THREE.BoxGeometry(6.2, 0.3, 3.8), M.stone, 0, 0.4, 0, th);
    mesh(new THREE.BoxGeometry(5.6, 3.6, 3.2), blush, 0, 2.3, 0, th);
    mesh(new THREE.BoxGeometry(4.2, 0.9, 2.6), blush, 0, 4.55, 0, th);
    mesh(new THREE.BoxGeometry(2.6, 0.7, 2.0), blush, 0, 5.35, 0, th);
    for (const [w, y] of [[5.75, 4.12], [4.35, 5.0], [2.75, 5.72]]) mesh(new THREE.BoxGeometry(w, 0.12, 0.12), M.gold, 0, y, 1.62 - (5.75 - w) * 0.14, th);
    facade(5.0, 1.2, 6, 1, th, 0, 3.4, 1.61);
    // marquee canopy with chasing bulbs
    mesh(new THREE.BoxGeometry(4.4, 0.35, 1.3), std("#a6434d"), 0, 2.15, 2.15, th);
    mesh(new THREE.BoxGeometry(4.5, 0.08, 1.4), M.gold, 0, 2.36, 2.15, th);
    const nb = 34, bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: "#fff", emissive: "#fff", emissiveIntensity: 2.5 }), nb);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    for (let i = 0; i < nb; i++) { const u = i / (nb - 1); bulbs.setMatrixAt(i, m4.makeTranslation(-2.15 + u * 4.3, 1.96, 2.82)); }
    th.add(bulbs);
    tick.push(t => { for (let i = 0; i < nb; i++) bulbs.setColorAt(i, c.set(((i + Math.floor(t * 6)) % 4) === 0 ? "#ffe9b8" : "#c58c4a")); bulbs.instanceColor.needsUpdate = true; });
    // doors
    for (const x of [-0.6, 0.6]) mesh(new THREE.BoxGeometry(0.9, 1.5, 0.08), M.darkWood, x, 1.3, 1.62, th);
    // vertical sign fin
    mesh(new THREE.BoxGeometry(0.25, 2.6, 0.9), std("#a6434d"), 2.9, 4.2, 1.2, th);
    const fb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4), bulbs.material, 18);
    for (let i = 0; i < 18; i++) fb.setMatrixAt(i, m4.makeTranslation(3.04, 3.0 + (i % 9) * 0.28, i < 9 ? 0.85 : 1.55)); th.add(fb);
    // open-air screen with storyboard
    const sc = document.createElement("canvas"); sc.width = 768; sc.height = 432; const sx = sc.getContext("2d"); const stex = new THREE.CanvasTexture(sc); stex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Group(); scr.position.set(-4.2, 0, 2.4); scr.rotation.y = 0.75; B.add(scr);
    for (const x of [-1.5, 1.5]) mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 8), M.darkWood, x, 1.8, 0, scr);
    mesh(new THREE.BoxGeometry(3.3, 1.95, 0.12), std("#3b3340"), 0, 2.7, -0.05, scr);
    const screen = mesh(new THREE.PlaneGeometry(3.1, 1.75), new THREE.MeshBasicMaterial({ map: stex, toneMapped: false }), 0, 2.7, 0.02, scr); screen.castShadow = false;
    const scenes = [["#f6c7a1", "#b46a5b"], ["#a9d1c4", "#4f7f7a"], ["#f3d58b", "#b27c3c"], ["#c9b8e8", "#6f5a99"], ["#f4b6c2", "#a85a6f"]];
    let last = -1;
    tick.push(t => {
      const f = Math.floor(t * 12); if (f === last) return; last = f;
      const k = Math.floor(t / 2.4) % scenes.length, u = (t % 2.4) / 2.4, [a, b] = scenes[k];
      const g = sx.createLinearGradient(0, 0, 0, 432); g.addColorStop(0, a); g.addColorStop(1, b); sx.fillStyle = g; sx.fillRect(0, 0, 768, 432);
      sx.fillStyle = "rgba(255,255,255,.35)"; sx.beginPath(); sx.arc(560 - u * 60, 120, 60, 0, TAU); sx.fill();
      sx.fillStyle = "rgba(40,30,50,.55)"; sx.fillRect(0, 330, 768, 102);
      for (let i = 0; i < 3; i++) { const x = 180 + i * 170 + Math.sin(t * 2 + i) * 10; sx.fillStyle = "#fbefe2"; sx.beginPath(); sx.ellipse(x, 230, 34, 38, 0, 0, TAU); sx.fill(); sx.strokeStyle = "#2b2230"; sx.lineWidth = 6; sx.stroke(); sx.fillStyle = "#2b2230"; sx.fillRect(x - 14, 222, 6, 10); sx.fillRect(x + 8, 222, 6, 10); sx.fillStyle = ["#7c9cc4", "#c47c7c", "#8cbf8c"][i]; sx.fillRect(x - 30, 266, 60, 70); sx.strokeRect(x - 30, 266, 60, 70); }
      sx.fillStyle = "rgba(0,0,0,.25)"; sx.fillRect(0, 0, 768, 18); sx.fillRect(0, 414, 768, 18);
      stex.needsUpdate = true;
    });
    // little audience chairs
    const chairs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.5, 0.34), std("#a6434d"), 12);
    for (let i = 0; i < 12; i++) { const row = Math.floor(i / 4), col = i % 4; const lx = -1.2 + col * 0.8, lz = 2.4 + row * 0.8; const v = new THREE.Vector3(lx, 0.3 + 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.75).add(scr.position); chairs.setMatrixAt(i, m4.makeRotationY(0.75).setPosition(v.x, ctx.bump(v.x, v.z) + 0.25, v.z)); }
    chairs.castShadow = !low; B.add(chairs);
    // premiere searchlights
    for (const [x, z, ph] of [[3.6, 1.8, 0], [-1.2, 3.8, 2]]) {
      mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.5, 12), M.dark, x, ctx.bump(x, z) + 0.25, z, B);
      const head = new THREE.Group(); head.position.set(x, ctx.bump(x, z) + 0.7, z); B.add(head);
      const bm = new THREE.Mesh(new THREE.ConeGeometry(1.6, 40, 20, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `varying vec2 vUv; void main(){ float a=pow(vUv.y,3.0)*0.13; gl_FragColor=vec4(vec3(1.0,0.9,0.75)*a,a); }` }));
      bm.position.y = 20; bm.rotation.x = Math.PI; head.add(bm);
      tick.push(t => { head.rotation.z = Math.sin(t * 0.3 + ph) * 0.35; head.rotation.x = Math.cos(t * 0.23 + ph) * 0.2; });
    }
    // brass film-reel sculpture
    const reel = new THREE.Group(); reel.position.set(4.0, 0, -0.2); B.add(reel);
    mesh(new THREE.BoxGeometry(0.6, 0.8, 0.6), M.stone, 0, 0.5, 0, reel);
    const rr2 = new THREE.Group(); rr2.position.y = 1.85; reel.add(rr2);
    mesh(new THREE.TorusGeometry(0.75, 0.08, 10, 40), M.brass, 0, 0, 0, rr2);
    for (let i = 0; i < 6; i++) { const s = mesh(new THREE.BoxGeometry(0.06, 1.4, 0.06), M.brass, 0, 0, 0, rr2); s.rotation.z = i / 6 * Math.PI; }
    tick.push(t => { rr2.rotation.z = t * 0.5; });
    flag(B, 0, 5.7, -2.2, accent);
    ctx.labelY = 10; return ctx;
  }


  /* ---------- upgrade decorations per island level (2..5) ---------- */
  function buildTiers(body, at, bump, accent) {
    const tiers = [null, null];
    // level 2: bunting between posts around the plaza
    { const g = new THREE.Group(); const ring = []; const n = 8, r = 4.6;
      for (let i = 0; i < n; i++) { const a = i / n * TAU + 0.2; const x = Math.cos(a) * r, z = Math.sin(a) * r, y = bump(x, z); mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.2, 5), M.wood, x, y + 1.1, z, g); ring.push(new THREE.Vector3(x, y + 2.15, z)); }
      const cols = ["#f2b8c6", "#f3d58b", "#a9d1c4", "#c9b8e8", "#fff3e6"];
      const flags = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.3, 3), new THREE.MeshStandardMaterial({ color: "#fff", roughness: 0.8 }), n * 6); const m4 = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion(); let k = 0;
      for (let i = 0; i < n; i++) { const A = ring[i], Bq = ring[(i + 1) % n]; const mid = A.clone().lerp(Bq, 0.5); mid.y -= 0.45; const cv = new THREE.QuadraticBezierCurve3(A, mid, Bq);
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(cv.getPoints(12)), new THREE.LineBasicMaterial({ color: "#7a6a5c" })));
        for (let j = 1; j <= 6; j++) { const p = cv.getPoint(j / 7); q.setFromEuler(new THREE.Euler(Math.PI, 0, 0)); m4.compose(p.setY(p.y - 0.16), q, new THREE.Vector3(1, 1, 1)); flags.setMatrixAt(k, m4); flags.setColorAt(k++, c.set(cols[(i + j) % cols.length])); } }
      g.add(flags); g.visible = false; body.add(g); tiers.push(g); }
    // level 3: little gazebo
    { const g = new THREE.Group(); const [x, z] = at[0], y = bump(x, z); g.position.set(x, y, z);
      mesh(new THREE.CylinderGeometry(1.0, 1.05, 0.2, 12), M.stone, 0, 0.1, 0, g);
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), M.creamPlain, Math.cos(a) * 0.85, 0.9, Math.sin(a) * 0.85, g); }
      mesh(new THREE.ConeGeometry(1.25, 0.8, 6), std(accent.clone().lerp(new THREE.Color("#ffffff"), 0.25).getStyle()), 0, 1.95, 0, g);
      mesh(new THREE.SphereGeometry(0.08, 8, 6), M.gold, 0, 2.4, 0, g);
      g.visible = false; body.add(g); tiers.push(g); }
    // level 4: fountain
    { const g = new THREE.Group(); const [x, z] = at[1], y = bump(x, z); g.position.set(x, y, z);
      mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.35, 20), M.stone, 0, 0.18, 0, g);
      const w = mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.05, 20), M.water, 0, 0.33, 0, g); w.castShadow = false;
      mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.9, 10), M.stone, 0, 0.75, 0, g);
      mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.12, 14), M.stone, 0, 1.2, 0, g);
      for (let k = 0; k < 3; k++) { const d = sprite("#e9f6ff", 0.5, 0.7, CLOUD, false); g.add(d); tick.push(t => { const u = (t * 0.8 + k / 3) % 1; d.position.set(Math.cos(k * 2.1) * u * 0.5, 1.3 + Math.sin(u * Math.PI) * 0.5, Math.sin(k * 2.1) * u * 0.5); d.material.opacity = 0.6 * (1 - u); }); }
      g.visible = false; body.add(g); tiers.push(g); }
    // level 5: golden obelisk with a soft halo
    { const g = new THREE.Group(); const [x, z] = at[2], y = bump(x, z); g.position.set(x, y, z);
      mesh(new THREE.BoxGeometry(0.9, 0.3, 0.9), M.stone, 0, 0.15, 0, g);
      mesh(new THREE.CylinderGeometry(0.12, 0.3, 2.6, 4), M.gold, 0, 1.6, 0, g).rotation.y = Math.PI / 4;
      mesh(new THREE.OctahedronGeometry(0.22, 0), M.gold, 0, 3.05, 0, g);
      const h = sprite("#ffe3a8", 3.2, 0.5); h.position.y = 3.0; g.add(h);
      g.visible = false; body.add(g); tiers.push(g); }
    return tiers;
  }

  function buildWorkshop(ctx) {
    const { B, accent } = ctx;
    // timber workshop with a red-brown roof
    const ws = new THREE.Group(); ws.position.set(-1.2, 0, -0.6); ws.rotation.y = 0.35; B.add(ws);
    mesh(new THREE.BoxGeometry(5.0, 0.3, 3.4), M.stone, 0, 0.4, 0, ws);
    mesh(new THREE.BoxGeometry(4.6, 2.4, 3.0), std("#e9dcc8", { map: stoneTex() }), 0, 1.75, 0, ws);
    for (const x of [-2.25, -0.75, 0.75, 2.25]) mesh(new THREE.BoxGeometry(0.16, 2.4, 3.05), M.darkWood, x, 1.75, 0, ws);
    mesh(new THREE.BoxGeometry(4.7, 0.16, 3.1), M.darkWood, 0, 2.95, 0, ws);
    const roof = prismRoof(3.5, 5.0, 1.5, std("#b0654f")); roof.position.set(0, 3.0, 0); roof.rotation.y = Math.PI / 2; roof.castShadow = true; ws.add(roof);
    facade(4.0, 1.2, 4, 1, ws, 0, 1.95, 1.51);
    mesh(new THREE.BoxGeometry(1.5, 1.6, 0.08), M.darkWood, 0, 1.35, 1.52, ws);
    mesh(new THREE.BoxGeometry(0.4, 1.0, 0.4), std("#a9887a"), -1.4, 3.8, -0.4, ws);
    for (let k = 0; k < 4; k++) { const sm = sprite("#f2ebe6", 1, 0.45, CLOUD, false); ws.add(sm); tick.push(t => { const u = (t * 0.13 + k / 4) % 1; sm.position.set(-1.4 + u * 0.6, 4.4 + u * 2.6, -0.4); sm.scale.setScalar(0.5 + u * 2); sm.material.opacity = 0.4 * (1 - u); }); }
    // windmill
    const wm = new THREE.Group(); wm.position.set(3.4, 0, -2.0); B.add(wm);
    mesh(new THREE.CylinderGeometry(0.9, 1.4, 5.2, 12), std("#efe5d6", { map: stoneTex() }), 0, 2.6, 0, wm);
    windowBand(1.15, 0.8, 4, 1, wm, 2.4, { lit: 0.9 });
    mesh(new THREE.ConeGeometry(1.15, 1.4, 12), std("#b0654f"), 0, 5.9, 0, wm);
    const hub = new THREE.Group(); hub.position.set(0, 5.2, 1.05); wm.add(hub);
    mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 10), M.darkWood, 0, 0, 0, hub).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) { const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; hub.add(arm); mesh(new THREE.BoxGeometry(0.1, 2.6, 0.05), M.darkWood, 0, 1.4, 0.1, arm); mesh(new THREE.BoxGeometry(0.55, 2.0, 0.03), std("#f4ece0"), 0.3, 1.65, 0.12, arm); }
    tick.push(t => { hub.rotation.z = -t * 0.35; });
    // brass gears sculpture
    const gs = new THREE.Group(); gs.position.set(1.4, 0, 3.4); B.add(gs);
    mesh(new THREE.BoxGeometry(1.4, 0.5, 0.5), M.stone, 0, 0.35, 0, gs);
    const gear = (r, teeth, x, y, sp) => { const g = new THREE.Group(); g.position.set(x, y, 0); gs.add(g); mesh(new THREE.TorusGeometry(r, 0.07, 6, 24), M.brass, 0, 0, 0, g); for (let i = 0; i < teeth; i++) { const a = i / teeth * TAU; const tth = mesh(new THREE.BoxGeometry(0.12, 0.16, 0.1), M.brass, Math.cos(a) * (r + 0.08), Math.sin(a) * (r + 0.08), 0, g); tth.rotation.z = a; } mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 8), M.gold, 0, 0, 0, g).rotation.x = Math.PI / 2; tick.push(t => { g.rotation.z = t * sp; }); };
    gear(0.45, 10, -0.3, 1.3, 0.4); gear(0.3, 7, 0.42, 1.62, -0.6);
    // crates and a little handcart
    for (let k = 0; k < 4; k++) mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), M.wood, -3.8 + (k % 2) * 0.6, 0.6 + Math.floor(k / 2) * 0.57, 1.6, B);
    flag(B, 3.4, 6.5, -2.0, accent);
    ctx.labelY = 10.5; return ctx;
  }

  function buildLab(ctx) {
    const { B, accent } = ctx;
    // glass conservatory dome with gold ribs and plants inside
    const cv = new THREE.Group(); cv.position.set(-1.6, 0, -0.8); B.add(cv);
    mesh(new THREE.CylinderGeometry(2.6, 2.75, 0.4, 32), M.stone, 0, 0.45, 0, cv);
    mesh(new THREE.CylinderGeometry(2.4, 2.4, 1.6, 32, 1, true), M.glass, 0, 1.45, 0, cv);
    mesh(new THREE.SphereGeometry(2.4, 32, 16, 0, TAU, 0, Math.PI / 2), M.glass, 0, 2.25, 0, cv);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; mesh(new THREE.BoxGeometry(0.06, 1.6, 0.06), M.gold, Math.cos(a) * 2.42, 1.45, Math.sin(a) * 2.42, cv); const rib = mesh(new THREE.TorusGeometry(2.42, 0.03, 4, 32, Math.PI), M.gold, 0, 2.25, 0, cv); rib.rotation.y = i / 12 * Math.PI; }
    mesh(new THREE.SphereGeometry(0.16, 10, 8), M.gold, 0, 4.7, 0, cv);
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU, r = rr(0.5, 1.6); const pl = mesh(new THREE.IcosahedronGeometry(rr(0.35, 0.65), 1), new THREE.MeshStandardMaterial({ color: pick(["#86b36f", "#6fa363", "#f2b8c6", "#9cc47c"]), flatShading: true }), Math.cos(a) * r, 1.1 + rr(0, 0.8), Math.sin(a) * r, cv); pl.castShadow = false; }
    const warm = new THREE.PointLight("#ffd9a0", 6, 7); warm.position.set(0, 2.2, 0); cv.add(warm);
    // inventor's tower with a brass coil and a softly pulsing orb
    const it = new THREE.Group(); it.position.set(2.8, 0, 0.6); B.add(it);
    mesh(new THREE.CylinderGeometry(1.0, 1.2, 0.3, 16), M.stone, 0, 0.4, 0, it);
    mesh(new THREE.CylinderGeometry(0.75, 0.9, 4.2, 16), std("#efe2cf", { map: stoneTex() }), 0, 2.6, 0, it);
    windowBand(0.83, 2.2, 5, 2, it, 2.6, { lit: 0.85 });
    mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.16, 16), M.gold, 0, 4.75, 0, it); railing(0.95, 4.83, it, 18);
    for (let k = 0; k < 7; k++) mesh(new THREE.TorusGeometry(0.32 - k * 0.025, 0.04, 6, 24), M.brass, 0, 5.1 + k * 0.17, 0, it).rotation.x = Math.PI / 2;
    const orb = mesh(new THREE.SphereGeometry(0.28, 20, 14), new THREE.MeshStandardMaterial({ color: "#fff6e6", emissive: accent, emissiveIntensity: 2.2 }), 0, 6.55, 0, it); orb.castShadow = false;
    const og = sprite(accent, 2.6, 0.6); og.position.y = 6.55; it.add(og);
    tick.push(t => { const k = 0.5 + 0.5 * Math.sin(t * 1.6); og.material.opacity = 0.35 + 0.35 * k; orb.material.emissiveIntensity = 1.6 + k; });
    // blackboard of ideas on an easel
    const ez = new THREE.Group(); ez.position.set(0.8, 0, 3.4); ez.rotation.y = -0.3; B.add(ez);
    for (const x of [-0.5, 0.5]) { const l = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 5), M.darkWood, x, 0.95, 0, ez); l.rotation.x = -0.15; }
    const bc = document.createElement("canvas"); bc.width = 256; bc.height = 160; const bg = bc.getContext("2d");
    bg.fillStyle = "#2f3b36"; bg.fillRect(0, 0, 256, 160); bg.strokeStyle = "#f4efe6"; bg.lineWidth = 3; bg.font = "22px Georgia"; bg.fillStyle = "#f4efe6";
    bg.fillText("idea →  $", 24, 44); bg.beginPath(); bg.arc(70, 100, 26, 0, TAU); bg.stroke(); bg.beginPath(); bg.moveTo(110, 100); bg.lineTo(200, 70); bg.lineTo(200, 130); bg.closePath(); bg.stroke();
    const bt = new THREE.CanvasTexture(bc); bt.colorSpace = THREE.SRGBColorSpace;
    mesh(new THREE.BoxGeometry(1.3, 0.85, 0.05), std("#6e4c37"), 0, 1.45, 0.08, ez);
    mesh(new THREE.PlaneGeometry(1.2, 0.75), new THREE.MeshStandardMaterial({ map: bt }), 0, 1.45, 0.112, ez);
    flag(B, -1.6, 4.9, -0.8, accent);
    ctx.labelY = 10.5; return ctx;
  }


  /* ---------- canvas helpers for signs ---------- */
  const signTex = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const glowPanel = (w, h, t, intensity = 1.4) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, emissive: "#ffffff", emissiveMap: t, emissiveIntensity: intensity, side: THREE.DoubleSide }));

  function buildBroadcast(ctx) {
    const { B, accent } = ctx;
    // round editing studio with a striped awning
    const st = new THREE.Group(); st.position.set(-1.3, 0, -0.6); B.add(st);
    mesh(new THREE.CylinderGeometry(2.5, 2.65, 0.35, 28), M.stone, 0, 0.42, 0, st);
    mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.6, 28), std("#f2e6d8", { map: stoneTex() }), 0, 1.9, 0, st);
    windowBand(2.22, 1.0, 8, 1, st, 1.9, { lit: 0.95 });
    mesh(new THREE.CylinderGeometry(2.45, 2.45, 0.16, 28), M.gold, 0, 3.25, 0, st);
    const roof = mesh(new THREE.ConeGeometry(2.6, 1.6, 28), std("#d98a95"), 0, 4.1, 0, st); roof.castShadow = true;
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; const strip = mesh(new THREE.BoxGeometry(0.5, 0.06, 0.9), std(i % 2 ? "#f6efe6" : accent), Math.cos(a) * 2.55, 3.05, Math.sin(a) * 2.55, st); strip.rotation.y = -a + Math.PI / 2; strip.rotation.x = 0.35; }
    // lattice antenna with a blinking beacon
    const an = new THREE.Group(); an.position.set(2.9, 0, -1.6); B.add(an);
    mesh(new THREE.BoxGeometry(1.0, 0.3, 1.0), M.stone, 0, 0.4, 0, an);
    for (let k = 0; k < 9; k++) { const w = 0.7 - k * 0.065, y = 0.9 + k * 0.85; for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 4), M.brass, x * w / 2, y, z * w / 2, an); mesh(new THREE.BoxGeometry(w, 0.04, w), M.brass, 0, y + 0.42, 0, an); }
    const bea = mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: "#ffd6d6", emissive: "#ff5a5a", emissiveIntensity: 2 }), 0, 8.7, 0, an); bea.castShadow = false;
    const bg = sprite("#ff7a7a", 1.8, 0.6); bg.position.y = 8.7; an.add(bg);
    tick.push(t => { const on = (t % 1.6) < 0.5 ? 1 : 0.15; bg.material.opacity = 0.6 * on; bea.material.emissiveIntensity = 0.6 + 2 * on; });
    // satellite dish
    const dish = new THREE.Group(); dish.position.set(-1.3, 4.9, -0.6); B.add(dish);
    const d = mesh(new THREE.SphereGeometry(0.75, 20, 10, 0, TAU, 0, 0.9), std("#f4efe8", { side: THREE.DoubleSide }), 0, 0, 0, dish); d.rotation.x = -1.1;
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 5), M.gold, 0, -0.2, 0.2, dish).rotation.x = 0.6;
    // floating clip screens (play buttons)
    const playT = signTex(256, 448, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#f7c1cb"); gr.addColorStop(1, "#c9a0dc"); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(255,255,255,.92)"; g.beginPath(); g.moveTo(100, 170); g.lineTo(100, 280); g.lineTo(185, 225); g.closePath(); g.fill(); g.fillStyle = "rgba(255,255,255,.7)"; g.fillRect(30, 380, 196, 10); g.fillStyle = "#fff"; g.fillRect(30, 380, 120, 10); });
    for (let k = 0; k < 3; k++) {
      const sc = glowPanel(0.9, 1.6, playT, 0.9); sc.castShadow = false; const a = -0.9 + k * 0.9, r = 4.3;
      const fr = new THREE.Group(); fr.position.set(Math.cos(a) * r - 1.3, 4.8 + k * 0.5, Math.sin(a) * r + 1.2); fr.add(sc); mesh(new THREE.BoxGeometry(1.0, 1.7, 0.05), M.gold, 0, 0, -0.03, fr); fr.rotation.y = -a * 0.4; B.add(fr);
      const y0 = fr.position.y; tick.push(t => { fr.position.y = y0 + Math.sin(t * 0.9 + k * 2) * 0.12; });
    }
    flag(B, 2.9, 0.5, 1.4, accent);
    ctx.labelY = 11; return ctx;
  }

  function buildFilmStudio(ctx) {
    const { B, accent } = ctx;
    // soundstage hangar with a curved roof
    const hg = new THREE.Group(); hg.position.set(-0.9, 0, -0.9); hg.rotation.y = -0.25; B.add(hg);
    mesh(new THREE.BoxGeometry(5.6, 0.3, 3.8), M.stone, 0, 0.4, 0, hg);
    mesh(new THREE.BoxGeometry(5.2, 2.2, 3.4), std("#f0e3d2", { map: stoneTex() }), 0, 1.65, 0, hg);
    const vault = mesh(new THREE.CylinderGeometry(1.75, 1.75, 5.3, 24, 1, false, 0, Math.PI), std("#7f9fb8"), 0, 2.75, 0, hg); vault.rotation.z = Math.PI / 2; vault.rotation.y = Math.PI / 2;
    for (const x of [-2.4, -0.8, 0.8, 2.4]) { const rib = mesh(new THREE.TorusGeometry(1.77, 0.05, 5, 24, Math.PI), M.gold, x, 2.75, 0, hg); rib.rotation.y = Math.PI / 2; }
    mesh(new THREE.BoxGeometry(2.0, 1.8, 0.08), std("#c98f5e"), 0, 1.4, 1.72, hg);
    for (const x of [-0.5, 0.5]) mesh(new THREE.BoxGeometry(0.04, 1.8, 0.1), M.darkWood, x, 1.4, 1.75, hg);
    facade(1.4, 0.6, 3, 1, hg, -1.9, 1.9, 1.71); facade(1.4, 0.6, 3, 1, hg, 1.9, 1.9, 1.71);
    // marquee sign
    const mt = signTex(512, 128, (g, w, h) => { g.fillStyle = "#3d2f3a"; g.fillRect(0, 0, w, h); g.fillStyle = "#ffe2b0"; g.font = "bold 64px Georgia"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("STUDIO", w / 2, h / 2 + 4); for (let i = 0; i < 16; i++) { g.beginPath(); g.arc(16 + i * 32, 10, 5, 0, TAU); g.arc(16 + i * 32, h - 10, 5, 0, TAU); g.fill(); } });
    const mq = glowPanel(2.6, 0.65, mt, 1.0); mq.position.set(0, 2.85, 1.78); mq.castShadow = false; hg.add(mq);
    // giant clapperboard
    const cb = new THREE.Group(); cb.position.set(2.9, 0, 2.2); cb.rotation.y = -0.6; B.add(cb);
    mesh(new THREE.BoxGeometry(1.6, 1.2, 0.12), std("#2e2a33"), 0, 1.1, 0, cb);
    const stripes = signTex(256, 48, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#2e2a33" : "#f6efe6"; g.beginPath(); g.moveTo(i * 36, 0); g.lineTo(i * 36 + 36, 0); g.lineTo(i * 36 + 18, h); g.lineTo(i * 36 - 18, h); g.fill(); } });
    const arm = new THREE.Group(); arm.position.set(-0.8, 1.75, 0); cb.add(arm);
    const a1 = mesh(new THREE.BoxGeometry(1.62, 0.22, 0.13), new THREE.MeshStandardMaterial({ map: stripes }), 0.81, 0.12, 0, arm); a1.castShadow = true;
    mesh(new THREE.BoxGeometry(1.62, 0.22, 0.13), new THREE.MeshStandardMaterial({ map: stripes }), 0, 1.82, 0, cb);
    tick.push(t => { const u = (t * 0.5) % 4; arm.rotation.z = u < 0.15 ? 0.5 * (1 - u / 0.15) : u < 3.4 ? 0 : (u - 3.4) / 0.6 * 0.5; });
    mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), M.darkWood, -0.5, 0.25, 0, cb); mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), M.darkWood, 0.5, 0.25, 0, cb);
    // spotlight on a tripod with a soft beam
    const sp = new THREE.Group(); sp.position.set(-3.6, 0, 1.6); B.add(sp);
    for (let i = 0; i < 3; i++) { const l = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 5), M.dark, Math.cos(i * 2.1) * 0.35, 0.85, Math.sin(i * 2.1) * 0.35, sp); l.rotation.z = Math.cos(i * 2.1) * 0.2; l.rotation.x = -Math.sin(i * 2.1) * 0.2; }
    const head = new THREE.Group(); head.position.y = 1.8; head.rotation.x = 0.5; head.rotation.y = 0.8; sp.add(head);
    mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.55, 14), M.dark, 0, 0, 0, head).rotation.x = Math.PI / 2;
    const lens = mesh(new THREE.CircleGeometry(0.26, 16), new THREE.MeshStandardMaterial({ color: "#fff8e8", emissive: "#ffdca0", emissiveIntensity: 2.5 }), 0, 0, 0.28, head); lens.castShadow = false;
    const beam = mesh(new THREE.ConeGeometry(1.2, 4, 20, 1, true), new THREE.MeshBasicMaterial({ color: "#ffe6b8", transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }), 0, 0, 2.3, head); beam.rotation.x = -Math.PI / 2; beam.castShadow = false;
    flag(B, -0.9, 4.4, -0.9, accent);
    ctx.labelY = 10; return ctx;
  }

  function buildSchool(ctx) {
    const { B, accent } = ctx;
    const sc = new THREE.Group(); sc.position.set(-0.6, 0, -0.8); sc.rotation.y = 0.2; B.add(sc);
    mesh(new THREE.BoxGeometry(6.0, 0.3, 3.4), M.stone, 0, 0.4, 0, sc);
    mesh(new THREE.BoxGeometry(5.6, 2.3, 3.0), std("#c98a6e", { map: stoneTex() }), 0, 1.7, 0, sc);
    mesh(new THREE.BoxGeometry(5.7, 0.14, 3.1), std("#f3ebdf"), 0, 0.62, 0, sc);
    mesh(new THREE.BoxGeometry(5.7, 0.14, 3.1), std("#f3ebdf"), 0, 2.85, 0, sc);
    facade(4.8, 1.2, 6, 1, sc, 0, 1.75, 1.51, 0, { lit: 0.9 });
    const roof = prismRoof(3.6, 6.0, 1.4, std("#5f7f8f")); roof.position.set(0, 2.9, 0); roof.rotation.y = Math.PI / 2; roof.castShadow = true; sc.add(roof);
    // front porch with steps and a door
    mesh(new THREE.BoxGeometry(1.6, 0.2, 0.9), M.stone, 0, 0.6, 1.9, sc); mesh(new THREE.BoxGeometry(1.0, 1.5, 0.08), std("#2f5d6b"), 0, 1.3, 1.53, sc);
    const pr = prismRoof(1.8, 1.0, 0.6, std("#f3ebdf")); pr.position.set(0, 2.15, 1.85); sc.add(pr);
    // bell tower with clock
    const bt = new THREE.Group(); bt.position.set(0, 3.9, 0); sc.add(bt);
    mesh(new THREE.BoxGeometry(1.1, 1.3, 1.1), std("#f3ebdf"), 0, 0.6, 0, bt);
    const ct = signTex(128, 128, (g, w, h) => { g.fillStyle = "#fff9ee"; g.beginPath(); g.arc(64, 64, 60, 0, TAU); g.fill(); g.strokeStyle = "#3a3030"; g.lineWidth = 6; g.stroke(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.fillStyle = "#3a3030"; g.fillRect(64 + Math.cos(a) * 46 - 3, 64 + Math.sin(a) * 46 - 3, 6, 6); } });
    const clock = mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshStandardMaterial({ map: ct }), 0, 0.7, 0.56, bt); clock.castShadow = false;
    const hand = mesh(new THREE.BoxGeometry(0.04, 0.3, 0.02), M.dark, 0, 0.7, 0.575, bt); hand.geometry.translate(0, 0.13, 0);
    tick.push(t => { hand.rotation.z = -t * 0.2; });
    const bell = mesh(new THREE.CylinderGeometry(0.12, 0.3, 0.4, 12, 1, true), M.brass, 0, 1.6, 0, bt);
    for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]]) mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), std("#f3ebdf"), x, 1.65, z, bt);
    const cap = mesh(new THREE.ConeGeometry(0.85, 0.9, 4), std("#5f7f8f"), 0, 2.5, 0, bt); cap.rotation.y = Math.PI / 4;
    tick.push(t => { bell.rotation.z = Math.sin(t * 1.2) * 0.12; });
    // chalkboard and a stack of books
    const ez = new THREE.Group(); ez.position.set(3.4, 0, 2.2); ez.rotation.y = -0.5; B.add(ez);
    const ch = signTex(256, 160, (g, w, h) => { g.fillStyle = "#2f4a3e"; g.fillRect(0, 0, w, h); g.fillStyle = "#f4efe6"; g.font = "28px Georgia"; g.fillText("1914 → ?", 30, 60); g.font = "22px Georgia"; g.fillText("Why did it happen?", 30, 110); });
    mesh(new THREE.BoxGeometry(1.4, 0.95, 0.06), std("#6e4c37"), 0, 1.45, 0, ez);
    mesh(new THREE.PlaneGeometry(1.3, 0.85), new THREE.MeshStandardMaterial({ map: ch }), 0, 1.45, 0.035, ez);
    for (const x of [-0.55, 0.55]) mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 5), M.darkWood, x, 0.95, -0.05, ez);
    const cols = ["#c96f5a", "#5f7f8f", "#d8b162", "#86b36f", "#9a7fb8"];
    for (let k = 0; k < 5; k++) { const b = mesh(new THREE.BoxGeometry(0.9 - k * 0.06, 0.18, 0.6), std(cols[k]), -3.4, 0.62 + k * 0.18, 2.1, B); b.rotation.y = rr(-0.3, 0.3); }
    flag(B, 2.6, 0.5, -1.8, accent);
    ctx.labelY = 10; return ctx;
  }

  function buildAgency(ctx) {
    const { B, accent } = ctx;
    // two-storey townhouse
    const th = new THREE.Group(); th.position.set(-1.0, 0, -0.9); B.add(th);
    mesh(new THREE.BoxGeometry(4.2, 0.3, 3.2), M.stone, 0, 0.4, 0, th);
    mesh(new THREE.BoxGeometry(3.8, 3.8, 2.8), std("#e9d7e6", { map: stoneTex() }), 0, 2.45, 0, th);
    facade(3.2, 2.8, 4, 2, th, 0, 2.6, 1.41, 0, { lit: 0.9 });
    mesh(new THREE.BoxGeometry(4.0, 0.2, 3.0), M.gold, 0, 4.42, 0, th);
    // striped awning over the entrance
    for (let i = 0; i < 8; i++) { const st = mesh(new THREE.BoxGeometry(0.45, 0.05, 0.9), std(i % 2 ? "#f6efe6" : accent), -1.6 + i * 0.46, 1.55, 1.75, th); st.rotation.x = 0.4; }
    // rooftop billboard
    const bb = new THREE.Group(); bb.position.set(0, 4.5, -0.2); th.add(bb);
    for (const x of [-1.3, 1.3]) mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), M.darkWood, x, 0.5, 0, bb);
    const adT = signTex(512, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#f7c9a9"); gr.addColorStop(1, "#f2b6c6"); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = "#3d2f3a"; g.font = "bold 74px Georgia"; g.textAlign = "center"; g.fillText("Look here!", w / 2, 120); g.font = "40px Georgia"; g.fillText("★ ★ ★ ★ ★", w / 2, 200); });
    const ad = glowPanel(3.2, 1.6, adT, 0.55); ad.position.set(0, 1.8, 0.05); ad.castShadow = false; bb.add(ad);
    mesh(new THREE.BoxGeometry(3.35, 1.75, 0.08), M.gold, 0, 1.8, -0.02, bb);
    // brass megaphone sculpture
    const mg = new THREE.Group(); mg.position.set(2.8, 0, 1.9); B.add(mg);
    mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.6, 12), M.stone, 0, 0.6, 0, mg);
    const horn = mesh(new THREE.CylinderGeometry(0.75, 0.15, 1.5, 20, 1, true), std("#c49a55", { metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide }), 0, 1.7, 0, mg); horn.rotation.z = -1.0;
    for (let k = 0; k < 3; k++) { const ring = mesh(new THREE.TorusGeometry(0.5 + k * 0.4, 0.035, 6, 32, 1.4), new THREE.MeshBasicMaterial({ color: "#ffe2b0", transparent: true, opacity: 0.5 }), 0.9, 2.15, 0, mg); ring.rotation.y = Math.PI / 2; ring.rotation.x = -0.7; ring.castShadow = false; tick.push(t => { const u = (t * 0.5 + k / 3) % 1; ring.scale.setScalar(0.6 + u * 1.4); ring.material.opacity = 0.55 * (1 - u); }); }
    // pinboard with sticky notes
    const pb = new THREE.Group(); pb.position.set(-3.5, 0, 1.8); pb.rotation.y = 0.5; B.add(pb);
    mesh(new THREE.BoxGeometry(1.5, 1.0, 0.08), std("#c79f74"), 0, 1.4, 0, pb);
    for (let k = 0; k < 7; k++) { const n = mesh(new THREE.PlaneGeometry(0.28, 0.28), std(pick(["#ffe58a", "#f6b3c4", "#a9d6e5", "#b9e3a5"])), -0.55 + (k % 4) * 0.36, 1.6 - Math.floor(k / 4) * 0.4, 0.05, pb); n.rotation.z = rr(-0.2, 0.2); n.castShadow = false; }
    for (const x of [-0.6, 0.6]) mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5), M.darkWood, x, 0.5, 0, pb);
    flag(B, 1.1, 4.6, -1.6, accent);
    ctx.labelY = 11; return ctx;
  }

  function buildConstruction(ctx) {
    const { B } = ctx;
    // ghost outline of the future building
    const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(4, 3.2, 3)), new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35 }));
    ghost.position.set(0, 1.9, -0.6); B.add(ghost);
    const gr = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.ConeGeometry(2.9, 1.6, 4)), ghost.material); gr.position.set(0, 4.3, -0.6); gr.rotation.y = Math.PI / 4; B.add(gr);
    mesh(new THREE.BoxGeometry(4.4, 0.3, 3.4), M.stone, 0, 0.4, -0.6, B);
    // scaffolding
    const pole = new THREE.CylinderGeometry(0.05, 0.05, 1, 5);
    const pts = []; for (const x of [-2.2, -0.7, 0.8, 2.2]) for (const z of [-2.3, 1.1]) pts.push([x, z]);
    const vi = new THREE.InstancedMesh(pole, M.wood, pts.length + 12), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(); let i = 0;
    pts.forEach(([x, z]) => vi.setMatrixAt(i++, m4.compose(new THREE.Vector3(x, 2.3, z), q, new THREE.Vector3(1, 4, 1))));
    for (const y of [1.5, 3.0]) for (const z of [-2.3, 1.1]) { q.setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)); vi.setMatrixAt(i++, m4.compose(new THREE.Vector3(0, y, z), q, new THREE.Vector3(1, 4.5, 1))); }
    for (const y of [1.5, 3.0]) for (const x of [-2.2, 2.2]) { q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)); vi.setMatrixAt(i++, m4.compose(new THREE.Vector3(x, y, -0.6), q, new THREE.Vector3(1, 3.4, 1))); }
    vi.count = i; vi.castShadow = !low; B.add(vi);
    for (const y of [1.55, 3.05]) mesh(new THREE.BoxGeometry(4.5, 0.06, 0.5), M.wood, 0, y, 1.1, B);
    // crates and a tarp tent
    for (let k = 0; k < 5; k++) mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), M.wood, 3.2 + (k % 2) * 0.65, 0.6 + Math.floor(k / 2) * 0.62 - (k > 3 ? 0.62 : 0), 2.2 - (k % 3) * 0.3, B);
    const tent = mesh(new THREE.ConeGeometry(1.1, 1.4, 4), std("#d9c7a8"), -3.3, 0.95, 2.0, B); tent.rotation.y = Math.PI / 4;
    // little crane
    const cr = new THREE.Group(); cr.position.set(-2.8, 0, -2.6); B.add(cr);
    const ylw = std("#d8b162");
    mesh(new THREE.BoxGeometry(0.35, 7, 0.35), ylw, 0, 3.8, 0, cr);
    const jib = new THREE.Group(); jib.position.y = 7.3; cr.add(jib);
    mesh(new THREE.BoxGeometry(6, 0.25, 0.3), ylw, 1.8, 0, 0, jib);
    mesh(new THREE.BoxGeometry(0.8, 0.6, 0.6), std("#8a7466"), -1.1, -0.1, 0, jib);
    mesh(new THREE.CylinderGeometry(0.015, 0.015, 3, 4), M.dark, 4.4, -1.5, 0, jib);
    mesh(new THREE.BoxGeometry(0.6, 0.4, 0.6), M.wood, 4.4, -3.1, 0, jib);
    tick.push(t => { jib.rotation.y = Math.sin(t * 0.1 + ctx.def.pos[0]) * 0.9; });
    ctx.labelY = 10; return ctx;
  }

  for (const def of islands) islandObjs[def.id] = buildIsland(def);

  /* ---------- golden light trails between active islands ---------- */
  const flows = [];
  function trail(a, b) {
    const A = islandObjs[a].root.position.clone(), Bp = islandObjs[b].root.position.clone(); A.y += 3; Bp.y += 3;
    const mid = A.clone().lerp(Bp, 0.5); mid.y += 7;
    const curve = new THREE.QuadraticBezierCurve3(A, mid, Bp);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.035, 5), new THREE.MeshBasicMaterial({ color: "#ffe2b0", transparent: true, opacity: 0.35, depthWrite: false })));
    const orbs = []; for (let k = 0; k < 5; k++) { const s = sprite("#ffd9a0", 1.4, 0.9); scene.add(s); orbs.push(s); }
    flows.push({ curve, orbs, sp: rr(0.04, 0.06) });
  }
  trail("research", "video"); trail("video", "tower"); trail("research", "tower");
  if (islandObjs.workshop) trail("workshop", "tower");
  if (islandObjs.lab) trail("lab", "tower");
  for (const [a, b] of [["clips", "tower"], ["video", "studio"], ["research", "school"], ["marketing", "studio"], ["marketing", "school"], ["marketing", "clips"]]) if (islandObjs[a] && islandObjs[b] && !islandObjs[a].def.locked && !islandObjs[b].def.locked) trail(a, b);

  /* ---------- hot-air balloons ---------- */
  {
    const stripes = (a, b) => tex(256, 64, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 32, 0, 32, 64); } });
    const prof = []; for (let i = 0; i <= 16; i++) { const t = i / 16; prof.push(new THREE.Vector2(Math.sin(t * Math.PI) * (1 - 0.55 * t * t) * 1.6 + 0.12 * t, t * 3.6)); }
    const looks = [["#f2b8c6", "#fff3e6"], ["#f3d58b", "#e9946f"], ["#a9d1c4", "#f6efe3"]];
    looks.slice(0, low ? 2 : 3).forEach(([a, b], i) => {
      const g = new THREE.Group(); scene.add(g);
      const env = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), new THREE.MeshStandardMaterial({ map: stripes(a, b), roughness: 0.7 }));
      env.position.y = 1.0; env.rotation.x = Math.PI; env.position.y = 4.6; g.add(env);
      mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), M.wood, 0, 0, 0, g);
      for (const [x, z] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.0, 3), M.dark, x, 0.65, z, g);
      const fl = sprite("#ffb35c", 0.9, 0.8); fl.position.y = 0.9; g.add(fl);
      const R0 = rr(40, 70), h = rr(8, 22), sp = 0.012 + i * 0.004, ph = i * 2.1;
      tick.push(t => { g.position.set(Math.cos(t * sp + ph) * R0, h + Math.sin(t * 0.3 + ph) * 1.2, Math.sin(t * sp + ph) * R0 * 0.8); g.rotation.y = t * 0.05; fl.material.opacity = 0.5 + 0.4 * Math.abs(Math.sin(t * 3 + ph)); });
    });
  }
  /* ---------- birds ---------- */
  {
    const n = low ? 8 : 16, geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.15, -0.6, 0.12, -0.1, 0, 0, -0.15, 0, 0, 0.15, 0.6, 0.12, -0.1, 0, 0, -0.15], 3));
    geo.computeVertexNormals();
    const birds = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: "#4b3f5c", side: THREE.DoubleSide }), n);
    scene.add(birds); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), off = [];
    for (let i = 0; i < n; i++) off.push([rr(-4, 4), rr(-1.5, 1.5), rr(-4, 4), rnd() * 6]);
    tick.push(t => {
      const a = t * 0.05, cx = Math.cos(a) * 60, cz = Math.sin(a) * 45, dir = Math.atan2(Math.cos(a) * 45, -Math.sin(a) * 60);
      off.forEach(([x, y, z, ph], i) => { const flap = 0.4 + 0.6 * Math.abs(Math.sin(t * 7 + ph)); e.set(0, dir, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(cx + x, 26 + y + Math.sin(t + ph) * 0.5, cz + z), q, new THREE.Vector3(1, flap * 2.2 - 1.2, 1)); birds.setMatrixAt(i, m4); });
      birds.instanceMatrix.needsUpdate = true;
    });
  }

  /* ---------- post ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.28, 0.4, 1.05));
  composer.addPass(new OutputPass());
  const finish = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
      float rand(vec2 c){ return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453); }
      void main(){ vec3 c=texture2D(tDiffuse,vUv).rgb; vec2 d=vUv-0.5; float v=1.0-dot(d,d)*0.75;
        c=mix(c,c*vec3(1.04,0.99,0.95),0.6); c*=v; c+=(rand(vUv*900.0+uTime)-0.5)*0.012; gl_FragColor=vec4(c,1.0); }`,
  });
  composer.addPass(finish);


  /* ---------- agents: little characters standing on their island ---------- */
  const agentFigs = []; let agentGroups = [];
  const SKIN = ["#f1d0b5", "#e7b896", "#c98f6b", "#f5dcc6", "#a8735a"];
  const nameSprite = (text, color) => {
    const c = document.createElement("canvas"); c.width = 256; c.height = 72; const g = c.getContext("2d");
    g.font = "600 34px Manrope, system-ui, sans-serif"; const w = Math.min(244, g.measureText(text).width + 36);
    g.fillStyle = "rgba(40,30,38,.72)"; g.beginPath(); g.roundRect((256 - w) / 2, 10, w, 50, 25); g.fill();
    g.fillStyle = color; g.beginPath(); g.arc((256 - w) / 2 + 20, 35, 7, 0, TAU); g.fill();
    g.fillStyle = "#fff6ea"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 128 + 8, 36);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
    sp.scale.set(2.6, 0.73, 1); sp.renderOrder = 10; return sp;
  };
  function buildFigure(a, i) {
    const g = new THREE.Group(), col = a.color || "#d9a07a", skin = SKIN[(a.name || "x").charCodeAt(0) % SKIN.length];
    const body = mesh(new THREE.CapsuleGeometry(0.26, 0.42, 4, 10), std(col), 0, 0.55, 0, g);
    mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.1, 12), std("#3d3340"), 0, 0.12, 0, g);
    const head = new THREE.Group(); head.position.y = 1.2; g.add(head);
    mesh(new THREE.SphereGeometry(0.27, 16, 12), std(skin), 0, 0, 0, head);
    for (const x of [-0.09, 0.09]) mesh(new THREE.SphereGeometry(0.035, 6, 6), M.dark, x, 0.03, 0.245, head).castShadow = false;
    const smile = mesh(new THREE.TorusGeometry(0.07, 0.014, 4, 10, Math.PI), M.dark, 0, -0.06, 0.25, head); smile.rotation.z = Math.PI; smile.castShadow = false;
    const hair = std(pick(["#4a3426", "#2f2522", "#7a4b2a", "#c8a06a", "#6b3b2f"]));
    const hat = a.hat || "none";
    if (hat === "bun") { mesh(new THREE.SphereGeometry(0.285, 14, 10, 0, TAU, 0, Math.PI / 2.1), hair, 0, 0.02, -0.02, head); mesh(new THREE.SphereGeometry(0.13, 10, 8), hair, 0, 0.26, -0.16, head); }
    else if (hat === "beret") { const b = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 16), std(col === "#f2b6c6" ? "#c96f8a" : "#3d3340"), 0.04, 0.22, 0, head); b.rotation.z = -0.25; mesh(new THREE.SphereGeometry(0.04, 6, 6), b.material, 0.1, 0.28, 0, head); }
    else if (hat === "cap") { mesh(new THREE.SphereGeometry(0.29, 14, 10, 0, TAU, 0, Math.PI / 2.2), std(col), 0, 0.03, 0, head); const br = mesh(new THREE.BoxGeometry(0.34, 0.03, 0.22), std(col), 0, 0.08, 0.27, head); br.rotation.x = 0.15; }
    else if (hat === "tophat") { mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 16), M.dark, 0, 0.2, 0, head); mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.42, 16), M.dark, 0, 0.42, 0, head); mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.07, 16), std(col), 0, 0.26, 0, head); }
    else if (hat === "hardhat") { mesh(new THREE.SphereGeometry(0.3, 14, 10, 0, TAU, 0, Math.PI / 2), std("#e6b84a"), 0, 0.05, 0, head); mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 16), std("#e6b84a"), 0, 0.06, 0, head); }
    else if (hat === "headset") { mesh(new THREE.SphereGeometry(0.285, 14, 10, 0, TAU, 0, Math.PI / 2.1), hair, 0, 0.02, -0.02, head); const band = mesh(new THREE.TorusGeometry(0.29, 0.03, 6, 20, Math.PI), M.dark, 0, 0.02, 0, head); band.rotation.y = Math.PI / 2; for (const x of [-0.29, 0.29]) mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 12), std(col), x, 0, 0, head).rotation.z = Math.PI / 2; }
    // arms
    for (const x of [-1, 1]) { const arm = mesh(new THREE.CapsuleGeometry(0.07, 0.36, 3, 6), std(col), x * 0.33, 0.62, 0.02, g); arm.rotation.z = x * 0.25; }
    g.scale.setScalar(1.15);
    const tag = nameSprite(a.name || "?", col); tag.position.y = 2.2; g.add(tag);
    return { g, head, tag, phase: i * 1.7 };
  }
  function setAgents(list) {
    for (const grp of agentGroups) grp.parent?.remove(grp);
    agentGroups = []; agentFigs.length = 0;
    const byIsland = {};
    for (const a of list) if (islandObjs[a.island] && !islandObjs[a.island].def.locked) (byIsland[a.island] ||= []).push(a);
    for (const [id, arr] of Object.entries(byIsland)) {
      const o = islandObjs[id], grp = new THREE.Group(); o.body.add(grp); agentGroups.push(grp);
      // stand on the stone path (kept clear of trees), in a little row towards the camera
      const th = Math.PI / 2 + (o.def.pos[0] > 0 ? -0.35 : 0.35), r0 = (o.def.kind === "tower" ? 5.4 : 5.6) + 0.5;
      arr.forEach((a, k) => {
        const f = buildFigure(a, k + agentFigs.length), r = r0 + k * 0.95, side = (k % 2 ? 1 : -1) * 0.38;
        const x = Math.cos(th) * r + Math.cos(th + Math.PI / 2) * side, z = Math.sin(th) * r + Math.sin(th + Math.PI / 2) * side;
        f.g.position.set(x, o.bump(x, z) + 0.12, z);
        f.g.rotation.y = Math.atan2(x, z) * 0.6; f.y0 = f.g.position.y; f.island = id;
        f.g.traverse(m => { m.userData.id = id; }); grp.add(f.g); agentFigs.push(f);
      });
    }
  }
  tick.push(t => {
    for (const f of agentFigs) {
      f.g.position.y = f.y0 + Math.abs(Math.sin(t * 1.4 + f.phase)) * 0.05;
      f.head.rotation.y = Math.sin(t * 0.5 + f.phase) * 0.35;
      const want = (selected === f.island || hoverId === f.island) ? 1 : 0;
      f.tag.material.opacity += (want - f.tag.material.opacity) * 0.08;
    }
  });

  /* ---------- picking ---------- */
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let down = null, hoverId = null;
  const pickables = Object.values(islandObjs).map(o => o.body);
  function addIsland(def) { if (islandObjs[def.id]) return; islandObjs[def.id] = buildIsland(def); pickables.push(islandObjs[def.id].body); }
  function setLevels(levels) { for (const o of Object.values(islandObjs)) { const lv = levels[o.def.id] || 1; (o.tiers || []).forEach((g, i) => { if (g) g.visible = lv >= i; }); } }
  const pickAt = e => { const r = canvas.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(mouse, camera); const h = ray.intersectObjects(pickables, true).find(x => !x.object.isSprite && !x.object.isPoints); return h ? h.object.userData.id : null; };
  canvas.addEventListener("pointerdown", e => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener("pointerup", e => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) onSelect(pickAt(e)); });
  canvas.addEventListener("pointermove", e => { if (e.buttons) return; hoverId = pickAt(e); canvas.style.cursor = hoverId ? "pointer" : ""; });

  /* ---------- camera ---------- */
  let selected = null; const goal = { pos: null, target: null, k: 0.02 };
  const overview = { pos: new THREE.Vector3(6, 27, 112), target: new THREE.Vector3(0, 5, 0) };
  goal.pos = overview.pos.clone(); goal.target = overview.target.clone(); goal.k = 0.016;
  controls.addEventListener("start", () => { goal.pos = null; });
  function select(id) {
    selected = id;
    if (id) {
      const o = islandObjs[id], p = o.root.position.clone();
      const out = p.clone().setY(0); if (out.lengthSq() < 1) out.set(0, 0, 1); out.normalize();
      const dist = o.def.kind === "tower" ? 40 : 30;
      goal.target = p.clone().add(new THREE.Vector3(0, o.def.kind === "tower" ? 8 : 3.5, 0));
      goal.pos = p.clone().add(new THREE.Vector3(out.x * dist * 0.45, dist * 0.32, out.z * dist * 0.45 + dist * 0.65));
      controls.autoRotate = false;
    } else { goal.pos = overview.pos.clone(); goal.target = overview.target.clone(); }
    goal.k = 0.04; resize();
  }
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h;
    const shift = selected && w > 760 ? Math.min(220, w * 0.15) : 0;
    if (shift) camera.setViewOffset(w, h, shift, 0, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize); resize();

  const clock = new THREE.Clock(), tmp = new THREE.Vector3(); let pendingMap = {};
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime * (reduceMotion ? 0.25 : 1);
    for (const m of timed) m.uniforms.uTime.value = t;
    finish.uniforms.uTime.value = t;
    for (const f of tick) f(t, dt);
    for (const { curve, orbs, sp } of flows) orbs.forEach((s, k) => s.position.copy(curve.getPoint((t * sp + k / orbs.length) % 1)));
    for (const o of Object.values(islandObjs)) {
      const on = selected === o.def.id || hoverId === o.def.id;
      o.sel.material.opacity += ((on ? 0.3 : 0) - o.sel.material.opacity) * 0.1;
      const pend = pendingMap[o.def.id] ? 0.06 + 0.04 * Math.sin(t * 3) : 0;
      o.glow.material.opacity += ((pend + (selected === o.def.id ? 0.04 : 0)) - o.glow.material.opacity) * 0.1;
    }
    if (goal.pos) {
      const kk = 1 - Math.pow(1 - goal.k, dt * 60);
      camera.position.lerp(goal.pos, kk); controls.target.lerp(goal.target, Math.min(1, kk * 1.4));
      if (camera.position.distanceTo(goal.pos) < 0.15) { goal.pos = null; if (!selected) controls.autoRotate = !reduceMotion; }
    }
    controls.update(); composer.render();
    const pos = {};
    for (const o of Object.values(islandObjs)) { tmp.set(0, o.labelY, 0); o.body.localToWorld(tmp); tmp.project(camera); pos[o.def.id] = tmp.z > 1 ? null : { x: (tmp.x + 1) / 2 * innerWidth, y: (1 - tmp.y) / 2 * innerHeight }; }
    onFrame?.(pos);
  });
  return { select, setPending(map) { pendingMap = map; }, resize, addIsland, setLevels, setAgents };
}
