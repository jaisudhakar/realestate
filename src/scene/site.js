import { mulberry32 } from './utils.js';

// Procedural master plan for the flagship layout.
// World units: 1 unit ≈ 3 ft. North is -Z (towards the hills).
export const FT_PER_UNIT = 3;
export const SITE = 96;

const AVENUE = 5; // half-width of the 40 ft main avenue along Z
const SIDE_X = [-50, 50]; // 30 ft side roads along Z
const CROSS_Z = [-60, -20, 20, 60]; // 30 ft cross roads along X
const ROAD_HALF = 3;

export const ENTRANCE_Z = 104;

const COLS = [
  [-SITE, SIDE_X[0] - ROAD_HALF],
  [SIDE_X[0] + ROAD_HALF, -AVENUE],
  [AVENUE, SIDE_X[1] - ROAD_HALF],
  [SIDE_X[1] + ROAD_HALF, SITE],
];
const ROWS = [
  [-SITE, CROSS_Z[0] - ROAD_HALF],
  [CROSS_Z[0] + ROAD_HALF, CROSS_Z[1] - ROAD_HALF],
  [CROSS_Z[1] + ROAD_HALF, CROSS_Z[2] - ROAD_HALF],
  [CROSS_Z[2] + ROAD_HALF, CROSS_Z[3] - ROAD_HALF],
  [CROSS_Z[3] + ROAD_HALF, SITE],
];

export const PARK = { x0: COLS[1][0], x1: COLS[1][1], z0: ROWS[2][0], z1: ROWS[2][1] };

export function buildSite() {
  const rand = mulberry32(20240611);
  const plots = [];
  const roads = [];
  const lamps = [];
  const trees = [];

  // Roads (as rects: x, z, w, d)
  roads.push({ x: 0, z: (ENTRANCE_Z + 8 - SITE - 4) / 2, w: AVENUE * 2, d: ENTRANCE_Z + 8 + SITE + 4 });
  SIDE_X.forEach((x) => roads.push({ x, z: 0, w: ROAD_HALF * 2, d: SITE * 2 + 8 }));
  CROSS_Z.forEach((z) => roads.push({ x: 0, z, w: SITE * 2 + 8, d: ROAD_HALF * 2 }));
  // Perimeter ring road
  roads.push({ x: 0, z: -SITE - 4, w: SITE * 2 + 16, d: 8 });
  roads.push({ x: 0, z: SITE + 4, w: SITE * 2 + 16, d: 8 });
  roads.push({ x: -SITE - 4, z: 0, w: 8, d: SITE * 2 + 16 });
  roads.push({ x: SITE + 4, z: 0, w: 8, d: SITE * 2 + 16 });

  const blockLetters = 'ABCDEFGHJKLMNPQRSTUV';
  let blockIndex = 0;

  ROWS.forEach(([z0, z1], ri) => {
    COLS.forEach(([x0, x1], ci) => {
      const isPark = x0 === PARK.x0 && z0 === PARK.z0;
      const letter = blockLetters[blockIndex++];
      if (isPark) return;

      const width = x1 - x0;
      const cols = Math.max(3, Math.round(width / 9));
      const pw = width / cols;
      const mid = (z0 + z1) / 2;
      const halves = [
        [z0, mid, 'North'],
        [mid, z1, 'South'],
      ];
      let n = 1;
      halves.forEach(([a, b, facing]) => {
        for (let c = 0; c < cols; c++) {
          const x = x0 + pw * (c + 0.5);
          const z = (a + b) / 2;
          const w = pw;
          const d = b - a;
          const r = rand();
          const status = r < 0.52 ? 'sold' : r < 0.68 ? 'booked' : 'available';
          const corner = c === 0 || c === cols - 1;
          const sqft = Math.round((w * FT_PER_UNIT * d * FT_PER_UNIT) / 10) * 10;
          plots.push({
            id: `${letter}-${String(n++).padStart(3, '0')}`,
            block: letter,
            x,
            z,
            w,
            d,
            facing,
            corner,
            sqft,
            dims: `${Math.round(w * FT_PER_UNIT)} × ${Math.round(d * FT_PER_UNIT)} ft`,
            status,
            built: status === 'sold' && rand() < 0.78,
            buildAt: rand(),
            houseH: 0.75 + rand() * 0.6,
            houseType: rand() < 0.55 ? 0 : 1,
            rot: facing === 'North' ? Math.PI : 0,
          });
        }
      });
    });
  });

  // Streetlights along every road
  const lampLine = (xa, za, xb, zb, step, offset) => {
    const len = Math.hypot(xb - xa, zb - za);
    const nx = -(zb - za) / len;
    const nz = (xb - xa) / len;
    for (let s = step / 2; s < len; s += step) {
      const t = s / len;
      const x = xa + (xb - xa) * t;
      const z = za + (zb - za) * t;
      lamps.push({ x: x + nx * offset, z: z + nz * offset });
      lamps.push({ x: x - nx * offset, z: z - nz * offset });
    }
  };
  lampLine(0, ENTRANCE_Z, 0, -SITE, 14, AVENUE + 0.6);
  SIDE_X.forEach((x) => lampLine(x, SITE, x, -SITE, 18, ROAD_HALF + 0.5));
  CROSS_Z.forEach((z) => lampLine(-SITE, z, SITE, z, 18, ROAD_HALF + 0.5));

  // Avenue trees (median and verge)
  for (let z = ENTRANCE_Z - 4; z > -SITE; z -= 7) {
    trees.push({ x: 0, z, s: 0.9 + rand() * 0.3, kind: 1 });
  }
  CROSS_Z.forEach((z) => {
    for (let x = -SITE + 4; x < SITE; x += 9) {
      if (Math.abs(x) < AVENUE + 2) continue;
      trees.push({ x, z: z + ROAD_HALF + 1.2, s: 0.6 + rand() * 0.3, kind: rand() < 0.5 ? 0 : 1 });
    }
  });

  // Park trees
  for (let i = 0; i < 46; i++) {
    const x = PARK.x0 + 2 + rand() * (PARK.x1 - PARK.x0 - 4);
    const z = PARK.z0 + 2 + rand() * (PARK.z1 - PARK.z0 - 4);
    const cx = (PARK.x0 + PARK.x1) / 2;
    const cz = (PARK.z0 + PARK.z1) / 2;
    if (Math.abs(x - cx - 6) < 13 && Math.abs(z - cz) < 9) continue; // keep clubhouse & pool clear
    trees.push({ x, z, s: 0.7 + rand() * 0.6, kind: rand() < 0.4 ? 0 : 1 });
  }

  // Green belt around the compound
  for (let i = 0; i < 520; i++) {
    const side = Math.floor(rand() * 4);
    const along = (rand() * 2 - 1) * (SITE + 26);
    const depth = SITE + 10 + rand() * 18;
    let x = side < 2 ? along : side === 2 ? depth : -depth;
    let z = side < 2 ? (side === 0 ? depth : -depth) : along;
    if (z > SITE && Math.abs(x) < 16) continue; // entrance clear
    trees.push({ x, z, s: 0.7 + rand() * 0.8, kind: rand() < 0.5 ? 0 : 1 });
  }

  return { plots, roads, lamps, trees };
}

export const riverX = (z) => 168 + Math.sin(z / 95) * 34 + Math.sin(z / 37) * 6;
