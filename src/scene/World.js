import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { buildSite, riverX, SITE, PARK, ENTRANCE_Z } from './site.js';
import { clamp, lerp, smoothstep, easeInOut, mulberry32 } from './utils.js';
import { CinematicShader } from './CinematicShader.js';

const STATUS_COLORS = {
  available: new THREE.Color('#5fd39a'),
  booked: new THREE.Color('#f0b14a'),
  sold: new THREE.Color('#8d8576'),
};
const BASE_PLOT = new THREE.Color('#8f8a6a');
const HOVER = new THREE.Color('#fff2cf');

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const tmpA = new THREE.Vector3();
const tmpFocus = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const MOON_DIR = new THREE.Vector3(0.45, 0.6, -0.65).normalize();

export class World {
  constructor(canvas, { lowPower = false } = {}) {
    this.canvas = canvas;
    this.lowPower = lowPower;
    this.clock = new THREE.Clock();
    this.time = 0;

    // Animated state, driven by the scroll timeline
    this.state = { night: 0, build: 0.2, plan: 0 };
    this.intro = 1; // 1 → 0 opening fly-in
    this.mouse = new THREE.Vector2();
    this.mouseSmooth = new THREE.Vector2();
    this.camPos = new THREE.Vector3(0, 300, 600);
    this.camTgt = new THREE.Vector3(0, 0, 0);
    this.desiredPos = this.camPos.clone();
    this.desiredTgt = this.camTgt.clone();
    this.hovered = -1;
    this.selected = -1;

    this.noise = new SimplexNoise({ random: mulberry32(7) });
    this.site = buildSite();

    this.#initRenderer();
    this.#initSky();
    this.#initLights();
    this.#buildTerrain();
    this.#buildRiver();
    this.#buildRoads();
    this.#buildPlots();
    this.#buildHouses();
    this.#buildTrees();
    this.#buildLamps();
    this.#buildEntrance();
    this.#buildPark();
    this.#buildWall();
    this.#buildDust();
    this.#buildStars();
    this.#buildMarker();
    this.#initPost();

    this.setKeyframes([{ pos: [0, 85, 250], tgt: [0, 8, -110], night: 0, build: 0.2, plan: 0 }]);
    this.#applyTimeOfDay(true);
    this.resize();
  }

  /* ---------------------------------------------------------------- setup */

  #initRenderer() {
    const r = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    r.setPixelRatio(Math.min(window.devicePixelRatio, this.lowPower ? 1 : 1.6));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.55;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = !this.lowPower;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2('#e3ae84', 0.0011);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 12000);
    this.camera.position.copy(this.camPos);
  }

  #initSky() {
    const sky = new Sky();
    sky.scale.setScalar(9000);
    const u = sky.material.uniforms;
    u.turbidity.value = 7;
    u.rayleigh.value = 2.2;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.86;
    this.sky = sky;
    this.scene.add(sky);
    this.sun = new THREE.Vector3();

    // A separate scene for environment-map generation (reflections on water/glass)
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(9000);
    Object.assign(this.envSky.material.uniforms.turbidity, { value: 7 });
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.lastEnvNight = -1;
  }

  #initLights() {
    this.hemi = new THREE.HemisphereLight('#ffd9b5', '#3c4a2c', 0.9);
    this.scene.add(this.hemi);

    const sunLight = new THREE.DirectionalLight('#ffc387', 3.2);
    sunLight.castShadow = !this.lowPower;
    sunLight.shadow.mapSize.set(2048, 2048);
    const sc = sunLight.shadow.camera;
    sc.left = -140;
    sc.right = 140;
    sc.top = 140;
    sc.bottom = -140;
    sc.near = 10;
    sc.far = 900;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.6;
    this.scene.add(sunLight, sunLight.target);
    this.sunLight = sunLight;

    // Moon disc (blooms at night)
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(60, 24, 16),
      new THREE.MeshBasicMaterial({ color: '#f4f1ff', fog: false, transparent: true, toneMapped: false })
    );
    this.moon.position.set(2600, 1500, -4600);
    this.scene.add(this.moon);
  }

  heightAt(x, z) {
    const n = this.noise;
    const r = Math.max(Math.abs(x), Math.abs(z));
    const edge = smoothstep(122, 300, r);
    let h = (n.noise(x * 0.005, z * 0.005) * 0.5 + 0.5) * 18 * edge;
    h += n.noise(x * 0.02, z * 0.02) * 2.2 * edge;

    // Western Ghats to the north
    const ridge = 1 - Math.abs(n.noise(x * 0.0026, z * 0.0026 + 3.1));
    const ridge2 = 1 - Math.abs(n.noise(x * 0.007 + 9, z * 0.007));
    const north = smoothstep(-340, -900, z);
    h += north * (Math.pow(ridge, 2.4) * 165 + ridge2 * 30 + 18);
    // Lower ranges east / west
    const side = smoothstep(420, 1000, Math.abs(x)) * (1 - north * 0.5);
    h += side * (Math.pow(ridge, 2) * 170 + 20);

    // River valley
    const d = Math.abs(x - riverX(z));
    h = lerp(-3.5, h, smoothstep(12, 44, d));
    return h;
  }

  #buildTerrain() {
    const size = 3600;
    const seg = this.lowPower ? 160 : 260;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const grass = new THREE.Color('#4f6b35');
    const dry = new THREE.Color('#8c7d4c');
    const soil = new THREE.Color('#7d6b4b');
    const rock = new THREE.Color('#5b6068');
    const forest = new THREE.Color('#2f4a2c');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h - 0.05);
      const nn = this.noise.noise(x * 0.012, z * 0.012) * 0.5 + 0.5;
      c.copy(grass).lerp(dry, nn * 0.7);
      if (Math.max(Math.abs(x), Math.abs(z)) < SITE + 2) c.copy(soil).lerp(grass, 0.35 + nn * 0.2);
      c.lerp(forest, smoothstep(30, 120, h) * 0.8);
      c.lerp(rock, smoothstep(110, 240, h) * 0.75);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.terrainGrid = { size, seg, pos };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  // Height of the rendered (coarse) terrain mesh at x/z
  groundAt(x, z) {
    const { size, seg, pos } = this.terrainGrid;
    const cell = size / seg;
    const fx = (x + size / 2) / cell;
    const fz = (z + size / 2) / cell;
    const ix = clamp(Math.floor(fx), 0, seg - 1);
    const iz = clamp(Math.floor(fz), 0, seg - 1);
    const tx = fx - ix;
    const tz = fz - iz;
    const h = (cx, cz) => pos.getY(cz * (seg + 1) + cx);
    return lerp(lerp(h(ix, iz), h(ix + 1, iz), tx), lerp(h(ix, iz + 1), h(ix + 1, iz + 1), tx), tz);
  }

  #buildRiver() {
    const pts = [];
    for (let z = -1700; z <= 1700; z += 20) pts.push(new THREE.Vector3(riverX(z), -1.2, z));
    const positions = [];
    const idx = [];
    pts.forEach((p, i) => {
      const width = 16 + Math.sin(i * 0.3) * 3;
      positions.push(p.x - width, p.y, p.z, p.x + width, p.y, p.z);
      if (i < pts.length - 1) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.waterMat = new THREE.MeshStandardMaterial({
      color: '#1d3a44',
      metalness: 1,
      roughness: 0.06,
      envMapIntensity: 1.4,
    });
    this.scene.add(new THREE.Mesh(geo, this.waterMat));
  }

  #buildRoads() {
    const geos = this.site.roads.map((r) => {
      const g = new THREE.PlaneGeometry(r.w, r.d);
      g.rotateX(-Math.PI / 2);
      g.translate(r.x, 0.04, r.z);
      return g;
    });
    const roads = new THREE.Mesh(
      mergeGeometries(geos),
      new THREE.MeshStandardMaterial({ color: '#2a2a2c', roughness: 0.78, metalness: 0.05 })
    );
    roads.receiveShadow = true;
    this.scene.add(roads);

    // Avenue centre median
    const median = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.25, ENTRANCE_Z + SITE - 6),
      new THREE.MeshStandardMaterial({ color: '#4c6a33', roughness: 1 })
    );
    median.position.set(0, 0.12, (ENTRANCE_Z - SITE) / 2 - 2);
    median.receiveShadow = true;
    this.scene.add(median);

    // Lane markings (glow faintly at night)
    const dashes = [];
    for (const rd of this.site.roads) {
      const alongZ = rd.d > rd.w;
      const len = alongZ ? rd.d : rd.w;
      if (rd.w === 8 || rd.d === 8) continue;
      for (let s = -len / 2 + 2; s < len / 2 - 2; s += 6) {
        const g = new THREE.PlaneGeometry(alongZ ? 0.18 : 2.4, alongZ ? 2.4 : 0.18);
        g.rotateX(-Math.PI / 2);
        const off = rd.w === 10 ? 2.6 : 0;
        if (alongZ) g.translate(rd.x - off, 0.06, rd.z + s);
        else g.translate(rd.x + s, 0.06, rd.z);
        dashes.push(g);
        if (off) {
          const g2 = g.clone();
          g2.translate(off * 2, 0, 0);
          dashes.push(g2);
        }
      }
    }
    this.dashMat = new THREE.MeshBasicMaterial({ color: '#d9cfae', transparent: true, opacity: 0.55 });
    this.scene.add(new THREE.Mesh(mergeGeometries(dashes), this.dashMat));
  }

  #buildPlots() {
    const plots = this.site.plots;
    const geo = new THREE.BoxGeometry(1, 0.32, 1);
    geo.translate(0, 0.16, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 });
    this.planUniform = { value: 0 };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uPlan = this.planUniform;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uPlan;')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * uPlan * 0.55;'
        );
    };
    const mesh = new THREE.InstancedMesh(geo, mat, plots.length);
    mesh.receiveShadow = true;
    plots.forEach((p, i) => {
      tmpM.compose(tmpV.set(p.x, 0, p.z), tmpQ.identity(), tmpS.set(p.w - 0.9, 1, p.d - 0.9));
      mesh.setMatrixAt(i, tmpM);
      mesh.setColorAt(i, BASE_PLOT);
    });
    this.plotMesh = mesh;
    this.scene.add(mesh);

    // Survey outlines — reads as a blueprint when the masterplan is open
    const pts = [];
    plots.forEach((p) => {
      const x0 = p.x - p.w / 2 + 0.45;
      const x1 = p.x + p.w / 2 - 0.45;
      const z0 = p.z - p.d / 2 + 0.45;
      const z1 = p.z + p.d / 2 - 0.45;
      const y = 0.36;
      pts.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0);
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.outlineMat = new THREE.LineBasicMaterial({
      color: new THREE.Color('#ffd79a'),
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      toneMapped: false,
    });
    this.scene.add(new THREE.LineSegments(lg, this.outlineMat));
  }

  #windowTextures() {
    const make = (lit) => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const g = cv.getContext('2d');
      g.fillStyle = lit ? '#000' : '#efe6d6';
      g.fillRect(0, 0, 128, 128);
      const r = mulberry32(lit ? 11 : 12);
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 3; x++) {
          const on = lit ? r() < 0.75 : true;
          g.fillStyle = lit ? (on ? '#ffffff' : '#000') : '#2b3a44';
          g.fillRect(14 + x * 38, 18 + y * 56, 24, 34);
        }
      }
      if (!lit) {
        g.fillStyle = '#c9b89c';
        g.fillRect(0, 118, 128, 10);
      }
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };
    return { day: make(false), lit: make(true) };
  }

  #buildHouses() {
    const tex = this.#windowTextures();
    this.wallMat = new THREE.MeshStandardMaterial({
      map: tex.day,
      emissiveMap: tex.lit,
      emissive: new THREE.Color('#ffb36b'),
      emissiveIntensity: 0,
      roughness: 0.8,
    });
    const roofMat = new THREE.MeshStandardMaterial({ color: '#9b4d36', roughness: 0.75 });
    const slabMat = new THREE.MeshStandardMaterial({ color: '#e8e2d6', roughness: 0.6 });

    // Window texture belongs on the walls only: point top/bottom faces at a blank texel
    const wallBox = (w, h, d) => {
      const g = new THREE.BoxGeometry(w, h, d);
      const uv = g.attributes.uv;
      for (let v = 8; v < 16; v++) uv.setXY(v, 0.04, 0.5);
      return g;
    };
    // Type 0: pitched-roof bungalow
    const body = wallBox(1, 1, 1).translate(0, 0.5, 0);
    const roof = new THREE.ConeGeometry(0.78, 0.55, 4, 1).rotateY(Math.PI / 4).translate(0, 1.27, 0);
    const pitched = mergeGeometries([body, roof], true);
    // Type 1: contemporary two-storey villa
    const lower = wallBox(1, 0.62, 1).translate(0, 0.31, 0);
    const upper = wallBox(0.72, 0.55, 0.8).translate(-0.12, 0.9, -0.05);
    const slab = new THREE.BoxGeometry(1.15, 0.08, 1.12).translate(0, 0.64, 0);
    const slab2 = new THREE.BoxGeometry(0.86, 0.08, 0.96).translate(-0.12, 1.2, -0.05);
    const modernWalls = mergeGeometries([lower, upper]);
    const modernSlabs = mergeGeometries([slab, slab2]);
    const modern = mergeGeometries([modernWalls, modernSlabs], true);

    this.houses = [];
    const built = this.site.plots.filter((p) => p.built);
    const types = [
      { geo: pitched, mats: [this.wallMat, roofMat] },
      { geo: modern, mats: [this.wallMat, slabMat] },
    ];
    types.forEach((t, ti) => {
      const list = built.filter((p) => p.houseType === ti);
      const mesh = new THREE.InstancedMesh(t.geo, t.mats, list.length);
      mesh.castShadow = !this.lowPower;
      mesh.receiveShadow = !this.lowPower;
      this.scene.add(mesh);
      this.houses.push({ mesh, list });
    });
    this.lastBuild = -1;
    this.#updateHouses(0.2);
  }

  #updateHouses(build) {
    if (Math.abs(build - this.lastBuild) < 0.0008) return;
    this.lastBuild = build;
    for (const { mesh, list } of this.houses) {
      list.forEach((p, i) => {
        const start = p.buildAt * 0.75;
        const k = easeInOut(clamp((build - start) / 0.25));
        const s = Math.max(k, 0.0001);
        const w = Math.min(p.w * 0.62, 7.2);
        const d = Math.min(p.d * 0.5, 9);
        const h = (p.houseType ? 6.4 : 4.2) * p.houseH;
        tmpQ.setFromAxisAngle(UP, p.rot);
        tmpM.compose(
          tmpV.set(p.x, 0.3 - (1 - k) * 0.4, p.z + (p.rot ? -1 : 1) * p.d * 0.1),
          tmpQ,
          tmpS.set(w * (0.85 + 0.15 * k), h * s, d * (0.85 + 0.15 * k))
        );
        mesh.setMatrixAt(i, tmpM);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  #buildTrees() {
    const rand = mulberry32(99);
    const list = [...this.site.trees];
    // Scatter forest on the hills
    const extra = this.lowPower ? 900 : 2600;
    for (let i = 0; i < extra; i++) {
      const x = (rand() * 2 - 1) * 1300;
      const z = (rand() * 2 - 1) * 1300 - 200;
      const r = Math.max(Math.abs(x), Math.abs(z));
      if (r < SITE + 34) continue;
      if (Math.abs(x - riverX(z)) < 22) continue;
      const h = this.groundAt(x, z);
      if (h > 260) continue;
      list.push({ x, z, y: h - 0.4, s: 1 + rand() * 1.6, kind: rand() < 0.5 ? 0 : 1 });
    }

    const trunkG = new THREE.CylinderGeometry(0.14, 0.2, 1.4, 5).translate(0, 0.7, 0);
    const pine = mergeGeometries(
      [
        trunkG.clone(),
        mergeGeometries([
          new THREE.ConeGeometry(1.25, 2.6, 7).translate(0, 2.2, 0),
          new THREE.ConeGeometry(0.95, 2.0, 7).translate(0, 3.3, 0),
        ]),
      ],
      true
    );
    const round = mergeGeometries(
      [trunkG.clone().toNonIndexed(), new THREE.IcosahedronGeometry(1.35, 1).scale(1, 0.9, 1).translate(0, 2.4, 0)],
      true
    );
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#5b4330', roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
    const greens = ['#3f6b35', '#557a3a', '#2f5a34', '#6b7d3a', '#486f3f'].map((c) => new THREE.Color(c));

    [pine, round].forEach((geo, kind) => {
      const items = list.filter((t) => t.kind === kind);
      const mesh = new THREE.InstancedMesh(geo, [trunkMat, leafMat], items.length);
      mesh.castShadow = !this.lowPower;
      items.forEach((t, i) => {
        const s = t.s * 1.6;
        tmpQ.setFromAxisAngle(UP, rand() * Math.PI * 2);
        tmpM.compose(tmpV.set(t.x, (t.y ?? 0) + 0.05, t.z), tmpQ, tmpS.set(s, s * (0.9 + rand() * 0.3), s));
        mesh.setMatrixAt(i, tmpM);
        mesh.setColorAt(i, tmpC.copy(greens[Math.floor(rand() * greens.length)]));
      });
      this.scene.add(mesh);
    });
  }

  #glowTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  }

  #buildLamps() {
    const lamps = this.site.lamps;
    const pole = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.07, 0.1, 4.6, 5).translate(0, 2.3, 0),
      new THREE.MeshStandardMaterial({ color: '#2e3134', roughness: 0.5, metalness: 0.6 }),
      lamps.length
    );
    this.lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf8f'), toneMapped: false });
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 8, 6), this.lampMat, lamps.length);
    this.glowTex = this.#glowTexture();
    this.poolMat = new THREE.MeshBasicMaterial({
      map: this.glowTex,
      color: '#ffb46a',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const poolGeo = new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2);
    const pool = new THREE.InstancedMesh(poolGeo, this.poolMat, lamps.length);
    lamps.forEach((l, i) => {
      tmpM.makeTranslation(l.x, 0, l.z);
      pole.setMatrixAt(i, tmpM);
      tmpM.makeTranslation(l.x, 4.65, l.z);
      head.setMatrixAt(i, tmpM);
      tmpM.makeTranslation(l.x, 0.08, l.z);
      pool.setMatrixAt(i, tmpM);
    });
    pool.renderOrder = 2;
    this.scene.add(pole, head, pool);
  }

  #signTexture(text, sub) {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 160;
    const g = cv.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 1024, 160);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.font = '600 78px Georgia, serif';
    g.fillText(text, 512, 92);
    g.font = '500 26px Georgia, serif';
    g.fillText(sub, 512, 140);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  #buildEntrance() {
    const stone = new THREE.MeshStandardMaterial({ color: '#d8c7a6', roughness: 0.7 });
    const bronze = new THREE.MeshStandardMaterial({ color: '#3a2c1f', roughness: 0.35, metalness: 0.8 });
    const g = new THREE.Group();
    const pillarGeo = new THREE.BoxGeometry(2.6, 11, 2.6).translate(0, 5.5, 0);
    [-10, 10].forEach((x) => {
      const p = new THREE.Mesh(pillarGeo, stone);
      p.position.set(x, 0, 0);
      p.castShadow = true;
      g.add(p);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 3.4), stone);
      cap.position.set(x, 11.2, 0);
      g.add(cap);
    });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(23, 2.4, 2), bronze);
    beam.position.set(0, 9.6, 0);
    beam.castShadow = true;
    g.add(beam);
    this.signMat = new THREE.MeshBasicMaterial({
      map: this.#signTexture('AURUM MEADOWS', 'SARAVANAMPATTI · COIMBATORE'),
      color: new THREE.Color('#ffd9a0'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(19, 2.97), this.signMat);
    sign.position.set(0, 9.6, 1.02);
    g.add(sign);
    g.position.set(0, 0, ENTRANCE_Z);
    this.scene.add(g);

    // Guard cabins
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4).translate(0, 1.5, 0), stone);
    cabin.position.set(15, 0, ENTRANCE_Z - 3);
    cabin.castShadow = true;
    this.scene.add(cabin);
  }

  #buildPark() {
    const cx = (PARK.x0 + PARK.x1) / 2;
    const cz = (PARK.z0 + PARK.z1) / 2;
    const w = PARK.x1 - PARK.x0;
    const d = PARK.z1 - PARK.z0;
    const lawn = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.6, 0.2, d - 0.6),
      new THREE.MeshStandardMaterial({ color: '#4f7a36', roughness: 1 })
    );
    lawn.position.set(cx, 0.1, cz);
    lawn.receiveShadow = true;
    this.scene.add(lawn);

    const track = new THREE.Mesh(
      new THREE.RingGeometry(12.5, 14, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#b5654a', roughness: 0.9 })
    );
    track.scale.set(1.25, 1, 1);
    track.position.set(cx - 2, 0.22, cz);
    this.scene.add(track);

    // Clubhouse with glass facade
    this.glassMat = new THREE.MeshStandardMaterial({
      color: '#22343c',
      metalness: 0.9,
      roughness: 0.08,
      emissive: new THREE.Color('#ffc88a'),
      emissiveIntensity: 0,
    });
    const club = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(14, 4.2, 8).translate(0, 2.1, 0), this.glassMat);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(17, 0.5, 10.5).translate(0, 4.45, 0),
      new THREE.MeshStandardMaterial({ color: '#efe7da', roughness: 0.5 })
    );
    const up = new THREE.Mesh(new THREE.BoxGeometry(8, 3.4, 7).translate(-2.5, 6.4, -0.3), this.glassMat);
    const roof2 = new THREE.Mesh(
      new THREE.BoxGeometry(10, 0.45, 8.6).translate(-2.5, 8.3, -0.3),
      new THREE.MeshStandardMaterial({ color: '#efe7da', roughness: 0.5 })
    );
    [base, roof, up, roof2].forEach((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
      club.add(m);
    });
    club.position.set(cx + 6, 0.2, cz - 4);
    this.scene.add(club);

    this.poolWater = new THREE.MeshStandardMaterial({
      color: '#2aa7c4',
      roughness: 0.05,
      metalness: 0.3,
      emissive: new THREE.Color('#1fb6ff'),
      emissiveIntensity: 0.15,
    });
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(16, 0.3, 7),
      new THREE.MeshStandardMaterial({ color: '#d9cdb6', roughness: 0.8 })
    );
    deck.position.set(cx + 6, 0.25, cz + 6);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(13, 4.4).rotateX(-Math.PI / 2), this.poolWater);
    water.position.set(cx + 6, 0.42, cz + 6);
    this.scene.add(deck, water);
  }

  #buildWall() {
    const mat = new THREE.MeshStandardMaterial({ color: '#cdbb98', roughness: 0.9 });
    const h = 1.8;
    const R = SITE + 9;
    const segs = [
      [0, -R, R * 2, 0.5],
      [-R, 0, 0.5, R * 2],
      [R, 0, 0.5, R * 2],
      [-(R + 11) / 2, R, R - 11, 0.5],
      [(R + 11) / 2, R, R - 11, 0.5],
    ];
    const geos = segs.map(([x, z, w, d]) => new THREE.BoxGeometry(w, h, d).translate(x, h / 2, z));
    const wall = new THREE.Mesh(mergeGeometries(geos), mat);
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.scene.add(wall);
  }

  #buildDust() {
    const count = this.lowPower ? 500 : 1400;
    const rand = mulberry32(5);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() * 2 - 1) * 220;
      pos[i * 3 + 1] = rand() * 40 + 1;
      pos[i * 3 + 2] = (rand() * 2 - 1) * 220;
      seed[i] = rand();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.dustMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uNight: { value: 0 },
        uPixel: { value: this.renderer.getPixelRatio() },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uNight; uniform float uPixel;
        attribute float aSeed; varying float vA; varying float vN;
        void main(){
          vec3 p = position;
          float t = uTime * (0.15 + aSeed * 0.25);
          p.x += sin(t + aSeed * 40.0) * 6.0;
          p.y += sin(t * 1.3 + aSeed * 12.0) * 3.0;
          p.z += cos(t * 0.8 + aSeed * 30.0) * 6.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.6 + aSeed * 2.6) * uPixel * (160.0 / -mv.z);
          float flicker = 0.5 + 0.5 * sin(uTime * (2.0 + aSeed * 3.0) + aSeed * 50.0);
          vA = mix(0.35, flicker, uNight);
          vN = uNight;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying float vN;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          vec3 day = vec3(1.0, 0.82, 0.55);
          vec3 night = vec3(1.0, 0.9, 0.45) * 2.2;
          gl_FragColor = vec4(mix(day, night, vN) * a * vA, a * vA);
        }`,
    });
    this.scene.add(new THREE.Points(geo, this.dustMat));
  }

  #buildStars() {
    const count = 2200;
    const rand = mulberry32(3);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const th = rand() * Math.PI * 2;
      const ph = Math.acos(rand() * 0.92);
      const r = 7000;
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({
      color: '#dfe8ff',
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    });
    this.scene.add(new THREE.Points(geo, this.starMat));
  }

  #buildMarker() {
    const beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#ffd28a') }, uAlpha: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv;
        void main(){
          float fade = pow(1.0 - vUv.y, 2.2);
          float scan = 0.6 + 0.4 * sin(vUv.y * 40.0 - uTime * 6.0);
          gl_FragColor = vec4(uColor * 1.6, fade * scan * uAlpha);
        }`,
    });
    this.marker = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0), beamMat);
    this.marker.visible = false;
    this.markerMat = beamMat;
    this.scene.add(this.marker);
  }

  #initPost() {
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.35, 0.45, 0.9);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.cine = new ShaderPass(CinematicShader);
    composer.addPass(this.cine);
    this.composer = composer;
  }

  /* --------------------------------------------------------- timeline api */

  // keyframes: [{ pos:[x,y,z], tgt:[x,y,z], night, build, plan }]
  setKeyframes(frames) {
    this.frames = frames;
    if (frames.length > 1) {
      this.posCurve = new THREE.CatmullRomCurve3(frames.map((f) => new THREE.Vector3(...f.pos)), false, 'centripetal');
      this.tgtCurve = new THREE.CatmullRomCurve3(frames.map((f) => new THREE.Vector3(...f.tgt)), false, 'centripetal');
    }
    this.setProgress(0);
  }

  // progress in keyframe space: 0 … frames.length - 1
  setProgress(p) {
    const n = this.frames.length;
    if (n === 1) {
      this.desiredPos.set(...this.frames[0].pos);
      this.desiredTgt.set(...this.frames[0].tgt);
      Object.assign(this.targetState ?? (this.targetState = {}), this.frames[0]);
      return;
    }
    p = clamp(p, 0, n - 1);
    const i = Math.min(Math.floor(p), n - 2);
    const f = easeInOut(p - i);
    const t = (i + f) / (n - 1);
    this.posCurve.getPoint(t, this.desiredPos);
    this.tgtCurve.getPoint(t, this.desiredTgt);
    const a = this.frames[i];
    const b = this.frames[i + 1];
    this.targetState = {
      night: lerp(a.night, b.night, f),
      build: lerp(a.build, b.build, f),
      plan: lerp(a.plan, b.plan, f),
    };
    this.progress = p;
  }

  setMouse(x, y) {
    this.mouse.set(x, y);
  }

  /* --------------------------------------------------------- interaction */

  pick(ndcX, ndcY) {
    this.raycaster ??= new THREE.Raycaster();
    this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    const hit = this.raycaster.intersectObject(this.plotMesh, false)[0];
    return hit ? hit.instanceId : -1;
  }

  plotColor(i, plan) {
    const p = this.site.plots[i];
    return tmpC.copy(BASE_PLOT).lerp(STATUS_COLORS[p.status], plan);
  }

  setHovered(i) {
    if (i === this.hovered) return;
    const prev = this.hovered;
    this.hovered = i;
    if (prev >= 0) this.plotMesh.setColorAt(prev, this.plotColor(prev, this.state.plan));
    if (i >= 0) this.plotMesh.setColorAt(i, HOVER);
    this.plotMesh.instanceColor.needsUpdate = true;
  }

  select(i) {
    this.selected = i;
    if (i < 0) return;
    const p = this.site.plots[i];
    this.marker.position.set(p.x, 0.4, p.z);
    this.marker.scale.set(Math.min(p.w, p.d) * 0.42, 34, Math.min(p.w, p.d) * 0.42);
    this.marker.visible = true;
    this.markerMat.uniforms.uColor.value.copy(STATUS_COLORS[p.status]).lerp(new THREE.Color('#ffffff'), 0.35);
  }

  projectPlot(i) {
    const p = this.site.plots[i];
    tmpV.set(p.x, 1, p.z).project(this.camera);
    return { x: (tmpV.x * 0.5 + 0.5) * this.width, y: (-tmpV.y * 0.5 + 0.5) * this.height };
  }

  /* ------------------------------------------------------------ per frame */

  #applyTimeOfDay(force = false) {
    const night = this.state.night;
    // Sun sinks from golden hour to below the horizon, then the moon takes over.
    const elevation = lerp(7.5, -9, smoothstep(0, 0.85, night));
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(158);
    this.sun.setFromSphericalCoords(1, phi, theta);
    this.sky.material.uniforms.sunPosition.value.copy(this.sun);
    this.sky.material.uniforms.rayleigh.value = lerp(2.2, 0.6, night);
    this.envSky.material.uniforms.sunPosition.value.copy(this.sun);

    const dayFog = new THREE.Color('#e3ae84');
    const duskFog = new THREE.Color('#5a4a63');
    const nightFog = new THREE.Color('#0a1222');
    const fog = this.scene.fog.color;
    if (night < 0.5) fog.copy(dayFog).lerp(duskFog, night * 2);
    else fog.copy(duskFog).lerp(nightFog, (night - 0.5) * 2);
    this.scene.fog.density = lerp(0.0011, 0.0016, night);

    const sunK = 1 - smoothstep(0.2, 0.75, night);
    this.sunLight.intensity = lerp(0.32, 3.2, sunK);
    this.sunLight.color.set('#9fb6ff').lerp(new THREE.Color('#ffc387'), sunK);
    // Keep the key light above the ground, blending from sun to moon direction
    const lightDir = tmpS.copy(this.sun).setY(Math.max(this.sun.y, 0.12)).normalize();
    lightDir.lerp(MOON_DIR, 1 - sunK).normalize();
    this.sunLight.position.copy(lightDir).multiplyScalar(420);
    this.sunLight.target.position.set(0, 0, 0);

    this.hemi.color.set('#ffd9b5').lerp(new THREE.Color('#33476e'), night);
    this.hemi.groundColor.set('#3c4a2c').lerp(new THREE.Color('#0b0f16'), night);
    this.hemi.intensity = lerp(0.9, 0.35, night);
    this.renderer.toneMappingExposure = lerp(0.62, 0.6, night);
    this.scene.environmentIntensity = lerp(0.35, 0.12, night);

    const lit = smoothstep(0.3, 0.8, night);
    this.lampMat.color.set('#ffcf8f').multiplyScalar(0.25 + lit * 3.2);
    this.poolMat.opacity = lit * 0.55;
    this.wallMat.emissiveIntensity = lit * 0.95;
    this.glassMat.emissiveIntensity = lit * 0.9;
    this.poolWater.emissiveIntensity = 0.15 + lit * 1.8;
    this.signMat.color.set('#ffd9a0').multiplyScalar(0.35 + lit * 2.4);
    this.dashMat.opacity = 0.45 + lit * 0.25;
    this.starMat.opacity = smoothstep(0.55, 1, night);
    this.moon.material.opacity = smoothstep(0.45, 0.95, night);
    this.moon.material.color.set('#f4f1ff').multiplyScalar(1 + lit * 2);
    this.dustMat.uniforms.uNight.value = lit;
    this.bloom.strength = lerp(0.3, 0.72, lit);
    this.bloom.threshold = lerp(0.9, 0.7, lit);

    // Rebuild reflections only when the sky meaningfully changes
    if (force || Math.abs(night - this.lastEnvNight) > 0.04) {
      this.lastEnvNight = night;
      this.envSky.material.uniforms.rayleigh.value = this.sky.material.uniforms.rayleigh.value;
      this.envRT?.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 20000);
      this.scene.environment = this.envRT.texture;
    }
  }

  #applyPlan() {
    const plan = this.state.plan;
    this.planUniform.value = plan;
    this.outlineMat.opacity = 0.16 + plan * 0.75;
    this.outlineMat.color.set('#ffd79a').multiplyScalar(1 + plan * 1.5);
    if (Math.abs(plan - (this.lastPlan ?? -1)) > 0.004) {
      this.lastPlan = plan;
      for (let i = 0; i < this.site.plots.length; i++) {
        if (i === this.hovered) continue;
        this.plotMesh.setColorAt(i, this.plotColor(i, plan));
      }
      this.plotMesh.instanceColor.needsUpdate = true;
    }
  }

  update() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    const k = 1 - Math.exp(-dt * 2.2); // cinematic inertia

    // Ease towards the scroll-driven state
    const ts = this.targetState;
    for (const key of ['night', 'build', 'plan']) {
      this.state[key] = lerp(this.state[key], ts[key], 1 - Math.exp(-dt * 3));
    }

    // Gently pan towards a selected plot while the masterplan is open
    const focus = tmpFocus.set(0, 0, 0);
    const fk = this.selected >= 0 ? this.state.plan * 0.28 : 0;
    if (fk > 0.001) {
      const p = this.site.plots[this.selected];
      focus.set((p.x - this.desiredTgt.x) * fk, 0, (p.z - this.desiredTgt.z) * fk);
    }
    this.camPos.lerp(tmpA.copy(this.desiredPos).add(focus), k);
    this.camTgt.lerp(tmpA.copy(this.desiredTgt).add(focus), k);
    this.mouseSmooth.lerp(this.mouse, 1 - Math.exp(-dt * 3));

    // Opening fly-in
    const introK = easeInOut(this.intro);
    const pos = tmpV.copy(this.camPos);
    pos.y += introK * 260;
    pos.z += introK * 380;
    pos.x += introK * -120;

    // Idle hero drift + handheld breathing + mouse parallax
    const heroK = 1 - smoothstep(0, 0.7, this.progress ?? 0);
    const t = this.time;
    pos.x += Math.sin(t * 0.07) * 22 * heroK + Math.sin(t * 0.6) * 0.25;
    pos.y += Math.sin(t * 0.11) * 5 * heroK + Math.sin(t * 0.8 + 1) * 0.18;
    const parallax = 1 - this.state.plan * 0.85;
    const camDir = tmpS.copy(this.camTgt).sub(pos).normalize();
    const right = tmpRight.crossVectors(camDir, UP).normalize();
    const dist = pos.distanceTo(this.camTgt);
    pos.addScaledVector(right, this.mouseSmooth.x * dist * 0.035 * parallax);
    pos.y += this.mouseSmooth.y * dist * 0.02 * parallax;

    this.camera.position.copy(pos);
    this.camera.lookAt(this.camTgt.x, this.camTgt.y - introK * 40, this.camTgt.z);

    this.#applyTimeOfDay();
    this.#applyPlan();
    this.#updateHouses(this.state.build);

    this.dustMat.uniforms.uTime.value = t;
    this.markerMat.uniforms.uTime.value = t;
    const ma = this.markerMat.uniforms.uAlpha;
    ma.value = lerp(ma.value, this.selected >= 0 && this.state.plan > 0.5 ? 1 : 0, 1 - Math.exp(-dt * 6));
    this.marker.visible = ma.value > 0.01;
    this.cine.uniforms.uTime.value = t;

    this.composer.render(dt);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 52 : 38;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.bloom.setSize(w * pr * 0.5, h * pr * 0.5);
    this.cine.uniforms.uResolution.value.set(w * pr, h * pr);
    this.dustMat.uniforms.uPixel.value = pr;
  }
}
