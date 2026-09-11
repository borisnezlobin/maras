"use client";

import { useEffect, useRef, useState } from "react";

/* --------------------------------------------------------------------- colour */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const COLOR_FALLBACKS = {
  accent: "#d81e63",
  accentEdge: "#eeaec6",
  surfaceRaised: "#ffffff",
  textSubtle: "#b3aeb1",
  edgeStrong: "#f6d3e0",
} as const;

type ColorRole = keyof typeof COLOR_FALLBACKS;

const COLOR_VARIABLES: Record<ColorRole, string> = {
  accent: "--accent",
  accentEdge: "--accent-edge",
  surfaceRaised: "--surface-raised",
  textSubtle: "--text-subtle",
  edgeStrong: "--edge-strong",
};

const WHITE: Rgb = { r: 255, g: 255, b: 255 };

function parseHexColor(value: string): Rgb | null {
  const digits = value.slice(1);
  if (digits.length === 3) {
    return {
      r: parseInt(`${digits[0]}${digits[0]}`, 16),
      g: parseInt(`${digits[1]}${digits[1]}`, 16),
      b: parseInt(`${digits[2]}${digits[2]}`, 16),
    };
  }
  if (digits.length !== 6) return null;
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16),
  };
}

function parseChannelList(value: string): Rgb | null {
  const parts = value.match(/[\d.]+/g);
  if (parts === null || parts.length < 3) return null;
  return { r: Number(parts[0]), g: Number(parts[1]), b: Number(parts[2]) };
}

function parseColor(value: string, fallback: string): Rgb {
  const trimmed = value.trim();
  const parsed = trimmed.startsWith("#") ? parseHexColor(trimmed) : parseChannelList(trimmed);
  return parsed ?? parseHexColor(fallback) ?? WHITE;
}

function mixColor(from: Rgb, to: Rgb, amount: number): Rgb {
  return {
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  };
}

function darkenColor(color: Rgb, factor: number): Rgb {
  return { r: color.r * factor, g: color.g * factor, b: color.b * factor };
}

function cssColor(color: Rgb): string {
  return `rgb(${Math.round(color.r)} ${Math.round(color.g)} ${Math.round(color.b)})`;
}

function cssColorAlpha(color: Rgb, alpha: number): string {
  return `rgb(${Math.round(color.r)} ${Math.round(color.g)} ${Math.round(color.b)} / ${alpha})`;
}

type Palette = Record<ColorRole, Rgb>;

function readPalette(): Palette {
  const styles = getComputedStyle(document.documentElement);
  const read = (role: ColorRole): Rgb =>
    parseColor(styles.getPropertyValue(COLOR_VARIABLES[role]), COLOR_FALLBACKS[role]);
  return {
    accent: read("accent"),
    accentEdge: read("accentEdge"),
    surfaceRaised: read("surfaceRaised"),
    textSubtle: read("textSubtle"),
    edgeStrong: read("edgeStrong"),
  };
}

/**
 * Wet halite is near-white with the light bending through it, so every face colour is a blend
 * between one pale base and one shade, never a saturated fill. The accent stays a glint.
 */
interface Shading {
  light: Rgb;
  midShade: Rgb;
  deepShade: Rgb;
  crevice: Rgb;
  glint: Rgb;
  outline: Rgb;
}

function buildShading(palette: Palette): Shading {
  const light = mixColor(palette.surfaceRaised, palette.accentEdge, 0.06);
  const greyPink = mixColor(palette.accentEdge, palette.textSubtle, 0.5);
  return {
    light,
    midShade: mixColor(palette.surfaceRaised, greyPink, 0.52),
    deepShade: darkenColor(mixColor(greyPink, palette.accent, 0.18), 0.84),
    // Deep corners keep some rose, the way light scatters inside a wet crystal instead of going grey.
    crevice: darkenColor(mixColor(palette.textSubtle, palette.accent, 0.38), 0.66),
    glint: palette.accent,
    outline: darkenColor(mixColor(palette.edgeStrong, palette.textSubtle, 0.5), 0.8),
  };
}

/* -------------------------------------------------------------------- lattice */

interface Cell {
  x: number;
  y: number;
  z: number;
}

const NEIGHBOUR_OFFSETS: readonly Cell[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

/** Lattice coordinates are small and signed, so one integer packs a cell for map keys. */
const KEY_BIAS = 64;

function cellKey(x: number, y: number, z: number): number {
  return (x + KEY_BIAS) | ((y + KEY_BIAS) << 8) | ((z + KEY_BIAS) << 16);
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function occupiedNeighbours(occupied: Set<number>, cell: Cell): number {
  let count = 0;
  for (const offset of NEIGHBOUR_OFFSETS) {
    if (occupied.has(cellKey(cell.x + offset.x, cell.y + offset.y, cell.z + offset.z))) count += 1;
  }
  return count;
}

const SUPPORT_WEIGHT = 0.62;
const STACK_BONUS = 0.5;
const RADIAL_COST = 0.022;
const HEIGHT_COST = 1.45;

/**
 * Aggregation with a compactness bias: weight grows exponentially with the faces a site already
 * shares with the cluster, so blocks fill out rather than straggling.
 */
function siteWeight(occupied: Set<number>, cell: Cell): number {
  const support = occupiedNeighbours(occupied, cell);
  const stacked = occupied.has(cellKey(cell.x, cell.y - 1, cell.z)) ? STACK_BONUS : 0;
  const spread = cell.x * cell.x + cell.z * cell.z + cell.y * cell.y * HEIGHT_COST * HEIGHT_COST;
  return Math.exp(support * SUPPORT_WEIGHT + stacked - spread * RADIAL_COST);
}

function addGrowthSites(sites: Map<number, Cell>, occupied: Set<number>, cell: Cell): void {
  for (const offset of NEIGHBOUR_OFFSETS) {
    const next = { x: cell.x + offset.x, y: cell.y + offset.y, z: cell.z + offset.z };
    if (next.y < 0) continue;
    const key = cellKey(next.x, next.y, next.z);
    if (occupied.has(key)) continue;
    sites.set(key, next);
  }
}

/**
 * A weighted draw, not a maximum. Always taking the best-supported site fills every concavity in
 * turn and planes the cluster into a plain box; sampling keeps the steps and re-entrant corners.
 */
function pickGrowthSite(
  sites: Map<number, Cell>,
  occupied: Set<number>,
  random: () => number,
): Cell | null {
  let total = 0;
  for (const cell of sites.values()) total += siteWeight(occupied, cell);
  if (total <= 0) return null;

  let ticket = random() * total;
  for (const cell of sites.values()) {
    ticket -= siteWeight(occupied, cell);
    if (ticket <= 0) return cell;
  }
  return null;
}

interface Block {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

const TERRACE_LEVELS = 4;
const BASE_SPAN = 5;
const STRADDLE_COUNT = 2;

function addBlock(occupied: Set<number>, cells: Cell[], block: Block): void {
  const volume = block.sx * block.sy * block.sz;
  for (let index = 0; index < volume; index += 1) {
    const x = block.x + (index % block.sx);
    const y = block.y + (Math.floor(index / block.sx) % block.sy);
    const z = block.z + Math.floor(index / (block.sx * block.sy));
    const key = cellKey(x, y, z);
    if (y < 0 || occupied.has(key)) continue;
    occupied.add(key);
    cells.push({ x, y, z });
  }
}

/** Each level is narrower than the one below it and drifts off centre, so the mass steps. */
function terraceBlock(random: () => number, level: number): Block {
  const span = BASE_SPAN - level;
  const driftX = level === 0 ? 0 : Math.floor(random() * 2);
  const driftZ = level === 0 ? 0 : Math.floor(random() * 2);
  return {
    x: -Math.floor(span / 2) + driftX,
    y: level,
    z: -Math.floor(span / 2) + driftZ,
    sx: span,
    sy: 1,
    sz: span,
  };
}

/**
 * A block hung over one edge of the terraces, overlapping by a cube so it stays connected while
 * the rest juts out. This is what makes the cluster read as interlocking cubes.
 */
function straddleBlock(random: () => number): Block {
  const size = 2 + Math.floor(random() * 2);
  const reach = Math.floor(BASE_SPAN / 2);
  const along = -reach + Math.floor(random() * BASE_SPAN);
  const out = random() < 0.5 ? reach - 1 : -size;
  const onX = random() < 0.5;
  return {
    x: onX ? out : along,
    y: Math.floor(random() * 2),
    z: onX ? along : out,
    sx: size,
    sy: size,
    sz: size,
  };
}

function nucleusDistance(cell: Cell): number {
  return cell.x * cell.x + (cell.y - 1) * (cell.y - 1) + cell.z * cell.z;
}

function seedCells(random: () => number, limit: number): Cell[] {
  const occupied = new Set<number>();
  const cells: Cell[] = [];
  for (let level = 0; level < TERRACE_LEVELS; level += 1) {
    addBlock(occupied, cells, terraceBlock(random, level));
  }
  for (let index = 0; index < STRADDLE_COUNT; index += 1) {
    addBlock(occupied, cells, straddleBlock(random));
  }
  cells.sort((left, right) => nucleusDistance(left) - nucleusDistance(right));
  return cells.slice(0, limit);
}

/**
 * Halite grows as interlocking cubes, so the mass starts as a few straddling cuboids rather than
 * one blob; accretion then roughens the edges into stepped hopper terraces.
 */
function growCluster(cubeCount: number, random: () => number): Cell[] {
  const order = seedCells(random, cubeCount);
  const occupied = new Set<number>(order.map((cell) => cellKey(cell.x, cell.y, cell.z)));
  const sites = new Map<number, Cell>();
  for (const cell of order) addGrowthSites(sites, occupied, cell);

  while (order.length < cubeCount) {
    const chosen = pickGrowthSite(sites, occupied, random);
    if (chosen === null) break;
    const key = cellKey(chosen.x, chosen.y, chosen.z);
    sites.delete(key);
    occupied.add(key);
    order.push(chosen);
    addGrowthSites(sites, occupied, chosen);
  }
  return order;
}

/* ----------------------------------------------------------------- projection */

const ISO_COS = Math.cos(Math.PI / 6);
const ISO_SIN = Math.sin(Math.PI / 6);
const CORNER_COUNT = 8;

/** Projected images of the three unit lattice vectors; projection is linear, so these span it. */
interface AxisStore {
  axX: number;
  axY: number;
  ayX: number;
  ayY: number;
  azX: number;
  azY: number;
}

function writeAxes(store: AxisStore, theta: number, unit: number): void {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  store.axX = (cos - sin) * ISO_COS * unit;
  store.axY = (cos + sin) * ISO_SIN * unit;
  store.ayX = 0;
  store.ayY = -unit;
  store.azX = -(sin + cos) * ISO_COS * unit;
  store.azY = (cos - sin) * ISO_SIN * unit;
}

function cornerBit(axis: number, corner: number): number {
  return (corner >> axis) & 1;
}

function writeCornerOffsets(store: AxisStore, xs: Float64Array, ys: Float64Array): void {
  for (let corner = 0; corner < CORNER_COUNT; corner += 1) {
    const i = cornerBit(0, corner);
    const j = cornerBit(1, corner);
    const k = cornerBit(2, corner);
    xs[corner] = i * store.axX + j * store.ayX + k * store.azX;
    ys[corner] = i * store.axY + j * store.ayY + k * store.azY;
  }
}

function corner(i: number, j: number, k: number): number {
  return i | (j << 1) | (k << 2);
}

const TOP_FACE: readonly number[] = [corner(0, 1, 0), corner(1, 1, 0), corner(1, 1, 1), corner(0, 1, 1)];
const RIGHT_FACE: readonly number[] = [corner(1, 0, 0), corner(1, 1, 0), corner(1, 1, 1), corner(1, 0, 1)];
const LEFT_FACE: readonly number[] = [corner(0, 0, 1), corner(1, 0, 1), corner(1, 1, 1), corner(0, 1, 1)];

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function clusterBounds(cells: readonly Cell[]): Bounds {
  const axes: AxisStore = { axX: 0, axY: 0, ayX: 0, ayY: 0, azX: 0, azY: 0 };
  writeAxes(axes, 0, 1);
  const xs = new Float64Array(CORNER_COUNT);
  const ys = new Float64Array(CORNER_COUNT);
  writeCornerOffsets(axes, xs, ys);

  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const cell of cells) {
    const originX = cell.x * axes.axX + cell.y * axes.ayX + cell.z * axes.azX;
    const originY = cell.x * axes.axY + cell.y * axes.ayY + cell.z * axes.azY;
    for (let index = 0; index < CORNER_COUNT; index += 1) {
      bounds.minX = Math.min(bounds.minX, originX + xs[index]);
      bounds.maxX = Math.max(bounds.maxX, originX + xs[index]);
      bounds.minY = Math.min(bounds.minY, originY + ys[index]);
      bounds.maxY = Math.max(bounds.maxY, originY + ys[index]);
    }
  }
  return bounds;
}

/* ----------------------------------------------------------------- cube model */

interface FacePaint {
  fill: string;
  stroke: string;
}

type CubeState = "solid" | "falling" | "absent" | "regrowing";

interface Cube {
  x: number;
  y: number;
  z: number;
  top: FacePaint;
  left: FacePaint;
  right: FacePaint;
  neighbourTop: number;
  neighbourLeft: number;
  neighbourRight: number;
  state: CubeState;
  reveal: number;
  alpha: number;
  offsetX: number;
  offsetY: number;
  spin: number;
  velocityX: number;
  velocityY: number;
  spinRate: number;
  timer: number;
  screenX: number;
  screenY: number;
}

/** Cells ringing a face; the more of them are filled, the deeper that face sits in a crevice. */
const TOP_RING: readonly Cell[] = [
  { x: 1, y: 1, z: 0 },
  { x: -1, y: 1, z: 0 },
  { x: 0, y: 1, z: 1 },
  { x: 0, y: 1, z: -1 },
];
const RIGHT_RING: readonly Cell[] = [
  { x: 1, y: 1, z: 0 },
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: 1 },
  { x: 1, y: 0, z: -1 },
];
const LEFT_RING: readonly Cell[] = [
  { x: 0, y: 1, z: 1 },
  { x: 0, y: -1, z: 1 },
  { x: 1, y: 0, z: 1 },
  { x: -1, y: 0, z: 1 },
];

function ringOcclusion(index: Map<number, number>, cell: Cell, ring: readonly Cell[]): number {
  let hits = 0;
  for (const offset of ring) {
    if (index.has(cellKey(cell.x + offset.x, cell.y + offset.y, cell.z + offset.z))) hits += 1;
  }
  return hits / ring.length;
}

function neighbourIndex(index: Map<number, number>, cell: Cell, offset: Cell): number {
  const found = index.get(cellKey(cell.x + offset.x, cell.y + offset.y, cell.z + offset.z));
  return found === undefined ? -1 : found;
}

interface FaceRecipe {
  base: Rgb;
  occlusion: number;
  descent: number;
  jitter: number;
  glint: number;
  fade: number;
  outlineColor: Rgb;
  outlineAmount: number;
}

const STROKE_ALPHA = 0.7;

function paintFace(shading: Shading, recipe: FaceRecipe): FacePaint {
  const shaded = mixColor(
    recipe.base,
    shading.crevice,
    recipe.occlusion * 0.38 + recipe.descent * 0.12 + recipe.jitter,
  );
  const aerial = mixColor(shaded, shading.light, recipe.fade);
  const fill = mixColor(aerial, shading.glint, recipe.glint);
  return {
    fill: cssColor(fill),
    stroke: cssColorAlpha(mixColor(fill, recipe.outlineColor, recipe.outlineAmount), STROKE_ALPHA),
  };
}

/**
 * The glint follows one light direction across the top course rather than a per-cube coin flip,
 * which is the difference between light catching an edge and a tiled floor.
 */
function glintStrength(roll: number, nearTop: boolean, lightFacing: number): number {
  if (!nearTop) return 0;
  if (lightFacing + roll * 0.3 < 0.8) return 0;
  return 0.12 + lightFacing * 0.12;
}

interface ClusterStats {
  highest: number;
  minDepth: number;
  depthSpan: number;
  minLight: number;
  lightSpan: number;
}

/** Depth runs along x+z, toward the viewer; the light axis runs along x-z, across the cluster. */
function clusterStats(cells: readonly Cell[]): ClusterStats {
  let highest = 0;
  let minDepth = Infinity;
  let maxDepth = -Infinity;
  let minLight = Infinity;
  let maxLight = -Infinity;
  for (const cell of cells) {
    highest = Math.max(highest, cell.y);
    minDepth = Math.min(minDepth, cell.x + cell.z);
    maxDepth = Math.max(maxDepth, cell.x + cell.z);
    minLight = Math.min(minLight, cell.x - cell.z);
    maxLight = Math.max(maxLight, cell.x - cell.z);
  }
  return {
    highest,
    minDepth,
    depthSpan: Math.max(1, maxDepth - minDepth),
    minLight,
    lightSpan: Math.max(1, maxLight - minLight),
  };
}

const AERIAL_FADE = 0.26;

function createCube(
  cell: Cell,
  index: Map<number, number>,
  stats: ClusterStats,
  shading: Shading,
  random: () => number,
): Cube {
  const descent = stats.highest === 0 ? 0 : 1 - cell.y / stats.highest;
  const jitter = random() * 0.035;
  const lightFacing = (cell.x - cell.z - stats.minLight) / stats.lightSpan;
  const glint = glintStrength(random(), stats.highest - cell.y <= 1, lightFacing);
  // Cubes further from the viewer wash out toward the ground, which gives the broad flat faces a
  // gradient instead of one uniform plane.
  const nearness = (cell.x + cell.z - stats.minDepth) / stats.depthSpan;
  const fade = (1 - nearness) * AERIAL_FADE;
  const shared = { descent, jitter, glint, fade };
  return {
    x: cell.x,
    y: cell.y,
    z: cell.z,
    top: paintFace(shading, {
      ...shared,
      base: shading.light,
      occlusion: ringOcclusion(index, cell, TOP_RING),
      // The rose lives on the top rim, where a wet edge would actually catch the light.
      outlineColor: mixColor(shading.outline, shading.glint, 0.5),
      outlineAmount: 0.32,
    }),
    left: paintFace(shading, {
      ...shared,
      base: shading.midShade,
      glint: glint * 0.5,
      occlusion: ringOcclusion(index, cell, LEFT_RING),
      outlineColor: shading.outline,
      outlineAmount: 0.28,
    }),
    right: paintFace(shading, {
      ...shared,
      base: shading.deepShade,
      glint: glint * 0.35,
      occlusion: ringOcclusion(index, cell, RIGHT_RING),
      outlineColor: shading.outline,
      outlineAmount: 0.24,
    }),
    neighbourTop: neighbourIndex(index, cell, { x: 0, y: 1, z: 0 }),
    neighbourRight: neighbourIndex(index, cell, { x: 1, y: 0, z: 0 }),
    neighbourLeft: neighbourIndex(index, cell, { x: 0, y: 0, z: 1 }),
    state: "solid",
    reveal: 0,
    alpha: 1,
    offsetX: 0,
    offsetY: 0,
    spin: 0,
    velocityX: 0,
    velocityY: 0,
    spinRate: 0,
    timer: 0,
    screenX: 0,
    screenY: 0,
  };
}

function buildCubes(cells: readonly Cell[], shading: Shading, random: () => number): Cube[] {
  const index = new Map<number, number>();
  cells.forEach((cell, position) => index.set(cellKey(cell.x, cell.y, cell.z), position));
  const stats = clusterStats(cells);
  return cells.map((cell) => createCube(cell, index, stats, shading, random));
}

/* -------------------------------------------------------------------- motion */

const CUBE_COUNT = 150;
const GROWTH_SECONDS = 2.5;
const POP_SPAN = 5;
const POP_SECONDS = 0.28;
const IDLE_AMPLITUDE = 0.13;
const IDLE_PERIOD = 17;
const GRAVITY = 1150;
const FALL_SECONDS = 1.05;
const REGROW_SECONDS = 2.4;
const DISLODGE_INTERVAL = 0.16;
const DISLODGE_RADIUS_UNITS = 1.35;
const MAX_DISLODGED = 8;
const PUSH_SPEED = 210;
const LIFT_SPEED = 130;
const FILL_FRACTION = 0.82;

function easeOutCubic(t: number): number {
  const inverse = 1 - t;
  return 1 - inverse * inverse * inverse;
}

function easeOutBack(t: number): number {
  const overshoot = 1.6;
  const u = t - 1;
  return 1 + (overshoot + 1) * u * u * u + overshoot * u * u;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function growthReveal(elapsed: number, total: number, position: number): number {
  const front = (total + POP_SPAN) * easeOutCubic(clamp01(elapsed / GROWTH_SECONDS));
  return clamp01((front - position) / POP_SPAN);
}

function advanceFalling(cube: Cube, delta: number): void {
  cube.timer += delta;
  cube.velocityY += GRAVITY * delta;
  cube.offsetX += cube.velocityX * delta;
  cube.offsetY += cube.velocityY * delta;
  cube.spin += cube.spinRate * delta;
  // A chip holds its colour while it separates and only fades at the end of the fall, so it reads
  // as a piece of salt rather than a translucent smear over the crystal it came from.
  cube.alpha = clamp01((FALL_SECONDS - cube.timer) / (FALL_SECONDS * 0.45));
  if (cube.timer < FALL_SECONDS) return;
  cube.state = "absent";
  cube.timer = 0;
  cube.reveal = 0;
}

function advanceAbsent(cube: Cube, delta: number): void {
  cube.timer += delta;
  if (cube.timer < REGROW_SECONDS) return;
  cube.state = "regrowing";
  cube.timer = 0;
  cube.offsetX = 0;
  cube.offsetY = 0;
  cube.spin = 0;
  cube.alpha = 1;
}

function advanceRegrowing(cube: Cube, delta: number): void {
  cube.reveal = clamp01(cube.reveal + delta / POP_SECONDS);
  cube.alpha = clamp01(cube.reveal * 2.2);
  if (cube.reveal >= 1) cube.state = "solid";
}

function advanceCube(cube: Cube, position: number, delta: number, elapsed: number): void {
  if (cube.state === "falling") return advanceFalling(cube, delta);
  if (cube.state === "absent") return advanceAbsent(cube, delta);
  if (cube.state === "regrowing") return advanceRegrowing(cube, delta);
  cube.reveal = growthReveal(elapsed, CUBE_COUNT, position);
  cube.alpha = clamp01(cube.reveal * 2.2);
}

function dislodge(cube: Cube, pointerX: number, pointerY: number, random: () => number): void {
  const dx = cube.screenX - pointerX;
  const dy = cube.screenY - pointerY;
  const distance = Math.hypot(dx, dy) || 1;
  cube.state = "falling";
  cube.timer = 0;
  cube.velocityX = (dx / distance) * PUSH_SPEED * (0.7 + random() * 0.6);
  cube.velocityY = (dy / distance) * PUSH_SPEED * 0.3 - LIFT_SPEED * (0.5 + random() * 0.5);
  cube.spinRate = (random() - 0.5) * 3.4;
}

/* -------------------------------------------------------------------- drawing */

function faceIsHidden(cubes: readonly Cube[], neighbour: number): boolean {
  if (neighbour < 0) return false;
  const other = cubes[neighbour];
  return other.state === "solid" && other.reveal >= 1;
}

function strokeFace(
  context: CanvasRenderingContext2D,
  face: readonly number[],
  originX: number,
  originY: number,
  xs: Float64Array,
  ys: Float64Array,
  paint: FacePaint,
): void {
  context.beginPath();
  context.moveTo(originX + xs[face[0]], originY + ys[face[0]]);
  for (let index = 1; index < face.length; index += 1) {
    context.lineTo(originX + xs[face[index]], originY + ys[face[index]]);
  }
  context.closePath();
  context.fillStyle = paint.fill;
  context.fill();
  context.strokeStyle = paint.stroke;
  context.stroke();
}

interface FrameGeometry {
  axes: AxisStore;
  cornerX: Float64Array;
  cornerY: Float64Array;
  originX: number;
  originY: number;
}

function drawCubeFaces(
  context: CanvasRenderingContext2D,
  cubes: readonly Cube[],
  cube: Cube,
  geometry: FrameGeometry,
  originX: number,
  originY: number,
): void {
  const { cornerX, cornerY } = geometry;
  const detached = cube.state !== "solid";
  if (detached || !faceIsHidden(cubes, cube.neighbourLeft)) {
    strokeFace(context, LEFT_FACE, originX, originY, cornerX, cornerY, cube.left);
  }
  if (detached || !faceIsHidden(cubes, cube.neighbourRight)) {
    strokeFace(context, RIGHT_FACE, originX, originY, cornerX, cornerY, cube.right);
  }
  if (detached || !faceIsHidden(cubes, cube.neighbourTop)) {
    strokeFace(context, TOP_FACE, originX, originY, cornerX, cornerY, cube.top);
  }
}

function cubeOrigin(cube: Cube, geometry: FrameGeometry, axis: "X" | "Y"): number {
  const { axes } = geometry;
  if (axis === "X") {
    return geometry.originX + cube.x * axes.axX + cube.y * axes.ayX + cube.z * axes.azX + cube.offsetX;
  }
  return geometry.originY + cube.x * axes.axY + cube.y * axes.ayY + cube.z * axes.azY + cube.offsetY;
}

function drawCube(
  context: CanvasRenderingContext2D,
  cubes: readonly Cube[],
  cube: Cube,
  geometry: FrameGeometry,
): void {
  if (cube.state === "absent") return;
  const originX = cubeOrigin(cube, geometry, "X");
  const originY = cubeOrigin(cube, geometry, "Y");
  const centreX = originX + (geometry.axes.axX + geometry.axes.ayX + geometry.axes.azX) * 0.5;
  const centreY = originY + (geometry.axes.axY + geometry.axes.ayY + geometry.axes.azY) * 0.5;
  cube.screenX = centreX;
  cube.screenY = centreY;

  const settled = cube.reveal >= 1 && cube.state === "solid";
  if (settled) {
    drawCubeFaces(context, cubes, cube, geometry, originX, originY);
    return;
  }

  const scale = 0.45 + 0.55 * easeOutBack(cube.reveal);
  context.save();
  context.globalAlpha = cube.alpha;
  context.translate(centreX, centreY);
  context.rotate(cube.spin);
  context.scale(scale, scale);
  context.translate(-centreX, -centreY);
  drawCubeFaces(context, cubes, cube, geometry, originX, originY);
  context.restore();
}

/**
 * Painter's order. The camera looks along (1,1,1) in world space, so a cell's depth is the sum of
 * its rotated world coordinates; rotating the lattice about the vertical axis by theta reweights
 * only the two horizontal terms. Falling cubes are pushed to the front so they never clip inside
 * the mass they left.
 */
function writeDepthKeys(cubes: readonly Cube[], theta: number, keys: Float64Array): void {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const weightX = cos + sin;
  const weightZ = cos - sin;
  for (let index = 0; index < cubes.length; index += 1) {
    const cube = cubes[index];
    const detached = cube.state === "falling" ? 1000 : 0;
    keys[index] = cube.x * weightX + cube.y + cube.z * weightZ + detached;
  }
}

/* ------------------------------------------------------------------ the view */

interface View {
  width: number;
  height: number;
  unit: number;
  originX: number;
  originY: number;
  glow: CanvasGradient;
  shadow: CanvasGradient;
  shadowX: number;
  shadowY: number;
  shadowRadius: number;
}

const GLOW_RADIUS_SCALE = 0.62;

function createGlow(context: CanvasRenderingContext2D, shading: Shading, radius: number): CanvasGradient {
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
  gradient.addColorStop(0, cssColorAlpha(shading.glint, 0.15));
  gradient.addColorStop(0.45, cssColorAlpha(shading.glint, 0.06));
  gradient.addColorStop(1, cssColorAlpha(shading.glint, 0));
  return gradient;
}

function createShadow(context: CanvasRenderingContext2D, shading: Shading, radius: number): CanvasGradient {
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
  gradient.addColorStop(0, cssColorAlpha(shading.crevice, 0.44));
  gradient.addColorStop(0.55, cssColorAlpha(shading.crevice, 0.16));
  gradient.addColorStop(1, cssColorAlpha(shading.crevice, 0));
  return gradient;
}

function buildView(
  context: CanvasRenderingContext2D,
  shading: Shading,
  bounds: Bounds,
  width: number,
  height: number,
): View {
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const unit = Math.min((width * FILL_FRACTION) / spanX, (height * FILL_FRACTION) / spanY);
  const originX = width / 2 - (bounds.minX + spanX / 2) * unit;
  const originY = height / 2 - (bounds.minY + spanY / 2) * unit;
  const radius = Math.max(spanX, spanY) * unit * 0.5;
  return {
    width,
    height,
    unit,
    originX,
    originY,
    glow: createGlow(context, shading, radius * 1.5),
    shadow: createShadow(context, shading, radius * GLOW_RADIUS_SCALE),
    shadowX: width / 2,
    shadowY: originY + bounds.maxY * unit,
    shadowRadius: radius * GLOW_RADIUS_SCALE,
  };
}

function paintBackdrop(context: CanvasRenderingContext2D, view: View, strength: number): void {
  context.save();
  context.globalAlpha = strength;
  context.translate(view.shadowX, view.shadowY);
  context.scale(1, 0.18);
  context.beginPath();
  context.arc(0, 0, view.shadowRadius, 0, Math.PI * 2);
  context.fillStyle = view.shadow;
  context.fill();
  context.restore();

  context.save();
  context.globalAlpha = strength;
  context.translate(view.width / 2, view.height / 2);
  context.beginPath();
  context.arc(0, 0, view.shadowRadius * 1.5, 0, Math.PI * 2);
  context.fillStyle = view.glow;
  context.fill();
  context.restore();
}

/* ---------------------------------------------------------------- the scene */

interface Pointer {
  x: number;
  y: number;
  active: boolean;
  moved: boolean;
}

interface Scene {
  cubes: Cube[];
  order: number[];
  keys: Float64Array;
  geometry: FrameGeometry;
  bounds: Bounds;
  shading: Shading;
  random: () => number;
}

function createScene(seed: number): Scene {
  const shading = buildShading(readPalette());
  const random = createRandom(seed);
  const cells = growCluster(CUBE_COUNT, random);
  const cubes = buildCubes(cells, shading, random);
  return {
    cubes,
    order: cubes.map((_, index) => index),
    keys: new Float64Array(cubes.length),
    geometry: {
      axes: { axX: 0, axY: 0, ayX: 0, ayY: 0, azX: 0, azY: 0 },
      cornerX: new Float64Array(CORNER_COUNT),
      cornerY: new Float64Array(CORNER_COUNT),
      originX: 0,
      originY: 0,
    },
    bounds: clusterBounds(cells),
    shading,
    random,
  };
}

function countDislodged(cubes: readonly Cube[]): number {
  let count = 0;
  for (const cube of cubes) {
    if (cube.state !== "solid") count += 1;
  }
  return count;
}

function isExposed(cubes: readonly Cube[], cube: Cube): boolean {
  return (
    !faceIsHidden(cubes, cube.neighbourTop) ||
    !faceIsHidden(cubes, cube.neighbourLeft) ||
    !faceIsHidden(cubes, cube.neighbourRight)
  );
}

/** Walks the painter's order backwards, so the cube nearest the viewer peels off first. */
function findDislodgeTarget(scene: Scene, pointer: Pointer, radius: number): Cube | null {
  for (let index = scene.order.length - 1; index >= 0; index -= 1) {
    const cube = scene.cubes[scene.order[index]];
    if (cube.state !== "solid" || cube.reveal < 1) continue;
    if (Math.hypot(cube.screenX - pointer.x, cube.screenY - pointer.y) > radius) continue;
    if (!isExposed(scene.cubes, cube)) continue;
    return cube;
  }
  return null;
}

function tryDislodge(scene: Scene, pointer: Pointer, view: View): void {
  if (countDislodged(scene.cubes) >= MAX_DISLODGED) return;
  const target = findDislodgeTarget(scene, pointer, view.unit * DISLODGE_RADIUS_UNITS);
  if (target === null) return;
  dislodge(target, pointer.x, pointer.y, scene.random);
}

function drawScene(
  context: CanvasRenderingContext2D,
  scene: Scene,
  view: View,
  theta: number,
  strength: number,
): void {
  context.clearRect(0, 0, view.width, view.height);
  paintBackdrop(context, view, strength);

  const { geometry } = scene;
  writeAxes(geometry.axes, theta, view.unit);
  writeCornerOffsets(geometry.axes, geometry.cornerX, geometry.cornerY);
  geometry.originX = view.originX;
  geometry.originY = view.originY;

  context.lineJoin = "round";
  context.lineWidth = Math.max(0.5, view.unit * 0.04);
  for (const index of scene.order) {
    drawCube(context, scene.cubes, scene.cubes[index], geometry);
  }
}

function settleScene(scene: Scene): void {
  for (const cube of scene.cubes) {
    cube.state = "solid";
    cube.reveal = 1;
    cube.alpha = 1;
    cube.offsetX = 0;
    cube.offsetY = 0;
    cube.spin = 0;
  }
}

function resizeCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): void {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function hasFinePointer(): boolean {
  return window.matchMedia("(pointer: fine)").matches;
}

/**
 * Records where the pointer is and that it moved; the animation loop decides what that touches,
 * so a move costs nothing and proximity stays correct while the cluster turns underneath it.
 */
function attachPointer(canvas: HTMLCanvasElement, pointer: Pointer): () => void {
  const onMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.active = true;
    pointer.moved = true;
  };
  const onLeave = () => {
    pointer.active = false;
  };

  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("pointercancel", onLeave);

  return () => {
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("pointercancel", onLeave);
  };
}

/* -------------------------------------------------------------- the component */

export function SaltCrystal({ className, seed }: { className?: string; seed?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [motionEpoch, setMotionEpoch] = useState(0);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setMotionEpoch((epoch) => epoch + 1);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const context = canvas.getContext("2d");
    if (context === null) return;

    const scene = createScene(seed ?? Math.floor(Math.random() * 0xffffffff));
    const still = prefersReducedMotion();
    const interactive = !still && hasFinePointer();
    const pointer: Pointer = { x: 0, y: 0, active: false, moved: false };

    let view: View | null = null;
    let frame = 0;
    let previous = 0;
    let start = 0;
    let elapsed = 0;
    let sinceDislodge = 0;

    if (still) settleScene(scene);

    const relayout = () => {
      resizeCanvas(canvas, context);
      view = buildView(context, scene.shading, scene.bounds, canvas.clientWidth, canvas.clientHeight);
    };

    const render = (theta: number, strength: number) => {
      if (view === null) return;
      writeDepthKeys(scene.cubes, theta, scene.keys);
      scene.order.sort((left, right) => scene.keys[left] - scene.keys[right]);
      drawScene(context, scene, view, theta, strength);
    };

    const step = (timestamp: number) => {
      if (start === 0) start = timestamp;
      // Growth and idle drift read the wall clock so a throttled or backgrounded tab shows the
      // finished crystal on return. Physics keeps the clamped delta, which must never integrate
      // one enormous step after a stall.
      const delta = previous === 0 ? 0 : Math.min((timestamp - previous) / 1000, 0.05);
      previous = timestamp;
      elapsed = (timestamp - start) / 1000;

      scene.cubes.forEach((cube, position) => advanceCube(cube, position, delta, elapsed));

      // Each chip costs a fresh pointer movement, so a cursor resting on the hero does not keep
      // sandblasting it.
      sinceDislodge += delta;
      const ready = pointer.active && pointer.moved && sinceDislodge >= DISLODGE_INTERVAL;
      if (ready && view !== null) {
        sinceDislodge = 0;
        pointer.moved = false;
        tryDislodge(scene, pointer, view);
      }

      const theta = IDLE_AMPLITUDE * Math.sin((elapsed / IDLE_PERIOD) * Math.PI * 2);
      render(theta, clamp01(elapsed / GROWTH_SECONDS));
      frame = window.requestAnimationFrame(step);
    };

    const detachPointer = interactive ? attachPointer(canvas, pointer) : null;

    const observer = new ResizeObserver(() => {
      relayout();
      if (still) render(0, 1);
    });

    relayout();
    observer.observe(canvas);

    if (still) {
      render(0, 1);
    } else {
      frame = window.requestAnimationFrame(step);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      detachPointer?.();
    };
  }, [seed, motionEpoch]);

  return (
    <div className={className}>
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />
    </div>
  );
}
