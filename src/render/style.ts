import type { Graphics } from 'pixi.js'

// Procedural cartoon art in cell units. No image files: everything is built from Graphics shapes.

export const GRASS_A = 0x93c96f
export const GRASS_B = 0x8abf66
export const TUFT = 0x6da24e
export const OUTLINE = 0x2b2118

interface WallSkin {
  base: number
  dark: number
  light: number
}

// Wood, stone, iron, gold, obsidian.
const WALLS: WallSkin[] = [
  { base: 0xb98c5a, dark: 0x8a6238, light: 0xd9b283 },
  { base: 0xa9acb1, dark: 0x7d8086, light: 0xd3d6da },
  { base: 0x7f93a8, dark: 0x56687b, light: 0xdde7f2 },
  { base: 0xe3b32d, dark: 0xa87a10, light: 0xfff0a8 },
  { base: 0x43305a, dark: 0x1e132b, light: 0x8a68b0 },
]

export const BUILDING_SKIN: Record<string, { body: number; dark: number; light: number }> = {
  depot: { body: 0xd99a3f, dark: 0x8a5a1f, light: 0xf2c877 },
  tower: { body: 0x6f8fb8, dark: 0x3f5b80, light: 0xa6c1e2 },
  hq: { body: 0xc8574f, dark: 0x7c2d29, light: 0xe8928b },
}

export const TROOP_SKIN: Record<string, { body: number; rim: number; radius: number }> = {
  fast: { body: 0xf6d743, rim: 0xa88a10, radius: 0.27 },
  balanced: { body: 0x63bd72, rim: 0x2f7a3f, radius: 0.34 },
  heavy: { body: 0xe0605a, rim: 0x8f2a26, radius: 0.43 },
}

export function wallColor(level: number): number {
  return WALLS[level - 1].base
}

export function drawGrass(g: Graphics, width: number, height: number): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) g.rect(x, y, 1, 1).fill((x + y) % 2 === 0 ? GRASS_A : GRASS_B)
  }
  // A few tufts in fixed places, so the field is not flat.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const hash = (x * 73856093) ^ (y * 19349663)
      if ((hash & 7) !== 0) continue
      const ox = ((hash >> 3) & 7) / 10 + 0.1
      const oy = ((hash >> 6) & 7) / 10 + 0.1
      g.moveTo(x + ox, y + oy + 0.12).lineTo(x + ox - 0.04, y + oy).moveTo(x + ox, y + oy + 0.12).lineTo(x + ox + 0.05, y + oy + 0.02)
      g.stroke({ width: 0.03, color: TUFT, alpha: 0.7 })
    }
  }
}

const TREE_LEAF = 0x4f7a3a
const TREE_TRUNK = 0x6b4a2a
const WATER = 0x5a9bc9
const PATH = 0xc9b183

// Trees, a water patch here and there, a hint of a trodden path - decoration only, drawn on the ground layer
// under everything else. Purely cosmetic: no move cost, no effect on routing (item 11's terrain cost is a
// separate, undone idea). Deterministic per cell, same hash trick as the grass tufts above, so it never
// flickers or differs between two runs of the same map. isFree lets the caller skip wall/building cells.
export function drawGroundDetails(g: Graphics, width: number, height: number, isFree: (x: number, y: number) => boolean): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isFree(x, y)) continue
      const hash = (x * 2654435761 + y * 40503) >>> 0
      const roll = hash % 97
      if (roll < 3) drawTree(g, x, y, hash)
      else if (roll < 5) drawWaterPatch(g, x, y, hash)
      else if (roll === 5) drawPathSpeckle(g, x, y, hash)
    }
  }
}

function drawTree(g: Graphics, x: number, y: number, hash: number): void {
  const cx = x + 0.5 + (((hash >> 4) & 3) / 10 - 0.15)
  const cy = y + 0.5 + (((hash >> 6) & 3) / 10 - 0.15)
  g.rect(cx - 0.03, cy + 0.05, 0.06, 0.16).fill(TREE_TRUNK)
  g.circle(cx, cy - 0.05, 0.22).fill(TREE_LEAF)
}

function drawWaterPatch(g: Graphics, x: number, y: number, hash: number): void {
  const r = 0.28 + ((hash >> 8) & 3) / 40
  g.circle(x + 0.5, y + 0.5, r).fill({ color: WATER, alpha: 0.55 })
}

function drawPathSpeckle(g: Graphics, x: number, y: number, hash: number): void {
  const ox = ((hash >> 5) & 7) / 10 + 0.1
  const oy = ((hash >> 9) & 7) / 10 + 0.1
  g.circle(x + ox, y + oy, 0.08).fill({ color: PATH, alpha: 0.5 })
}

// A wall post; joins to the east and south neighbors so a line of walls reads as one piece.
export function drawWall(g: Graphics, x: number, y: number, level: number, east: boolean, south: boolean): void {
  const skin = WALLS[level - 1]
  const joint = (jx: number, jy: number, w: number, h: number) => g.rect(jx, jy, w, h).fill(skin.base)
  if (east) joint(x + 0.85, y + 0.3, 0.3, 0.4)
  if (south) joint(x + 0.3, y + 0.85, 0.4, 0.3)
  if (east) g.rect(x + 0.85, y + 0.3, 0.3, 0.05).fill(skin.light).rect(x + 0.85, y + 0.65, 0.3, 0.05).fill(skin.dark)
  if (south) g.rect(x + 0.3, y + 0.85, 0.05, 0.3).fill(skin.light).rect(x + 0.65, y + 0.85, 0.05, 0.3).fill(skin.dark)
  g.roundRect(x + 0.1, y + 0.1, 0.8, 0.8, 0.14).fill(skin.base)
  g.roundRect(x + 0.1, y + 0.1, 0.8, 0.8, 0.14).stroke({ width: 0.05, color: OUTLINE, alpha: 0.75 })
  g.roundRect(x + 0.16, y + 0.14, 0.68, 0.16, 0.06).fill({ color: skin.light, alpha: 0.7 })
  if (level === 1) {
    for (const py of [0.38, 0.55, 0.72]) g.moveTo(x + 0.16, y + py).lineTo(x + 0.84, y + py).stroke({ width: 0.035, color: skin.dark })
  } else if (level === 2) {
    g.moveTo(x + 0.1, y + 0.5).lineTo(x + 0.9, y + 0.5).moveTo(x + 0.5, y + 0.1).lineTo(x + 0.5, y + 0.5).moveTo(x + 0.3, y + 0.5).lineTo(x + 0.3, y + 0.9)
    g.stroke({ width: 0.035, color: skin.dark })
  } else if (level === 3) {
    for (const [cx, cy] of [[0.24, 0.5], [0.76, 0.5], [0.5, 0.3], [0.5, 0.72]]) g.circle(x + cx, y + cy, 0.04).fill(skin.light)
    g.rect(x + 0.1, y + 0.44, 0.8, 0.12).fill({ color: skin.dark, alpha: 0.5 })
  } else if (level === 4) {
    g.poly([x + 0.2, y + 0.75, x + 0.5, y + 0.3, x + 0.8, y + 0.75]).fill({ color: skin.light, alpha: 0.55 })
    g.circle(x + 0.5, y + 0.55, 0.09).fill(skin.dark)
  } else {
    g.poly([x + 0.5, y + 0.2, x + 0.8, y + 0.5, x + 0.5, y + 0.8, x + 0.2, y + 0.5]).fill({ color: skin.light, alpha: 0.5 })
    g.poly([x + 0.5, y + 0.32, x + 0.68, y + 0.5, x + 0.5, y + 0.68, x + 0.32, y + 0.5]).fill({ color: skin.dark, alpha: 0.9 })
  }
}

// Darkening and cracks that appear as hit points drop (below 75%, 50% and 25%).
export function drawWallDamage(g: Graphics, x: number, y: number, health: number): void {
  g.roundRect(x + 0.1, y + 0.1, 0.8, 0.8, 0.14).fill({ color: 0x000000, alpha: (1 - health) * 0.3 })
  const crack = (points: number[]) => g.poly(points, false).stroke({ width: 0.04, color: OUTLINE, alpha: 0.85 })
  if (health < 0.75) crack([x + 0.3, y + 0.12, x + 0.42, y + 0.36, x + 0.34, y + 0.5])
  if (health < 0.5) crack([x + 0.74, y + 0.16, x + 0.6, y + 0.4, x + 0.7, y + 0.62, x + 0.58, y + 0.86])
  if (health < 0.25) crack([x + 0.14, y + 0.7, x + 0.4, y + 0.6, x + 0.55, y + 0.78, x + 0.86, y + 0.66])
}

export function drawBuilding(g: Graphics, type: string, x: number, y: number, w: number, h: number, time: number): void {
  const skin = BUILDING_SKIN[type] ?? BUILDING_SKIN.depot
  g.ellipse(x + w / 2, y + h - 0.05, w * 0.52, 0.16).fill({ color: 0x000000, alpha: 0.28 })
  if (type === 'depot') {
    g.roundRect(x + 0.12, y + 0.2, 0.76, 0.7, 0.1).fill(skin.body).stroke({ width: 0.05, color: OUTLINE })
    g.rect(x + 0.12, y + 0.2, 0.76, 0.16).fill(skin.light)
    g.moveTo(x + 0.2, y + 0.4).lineTo(x + 0.8, y + 0.84).moveTo(x + 0.8, y + 0.4).lineTo(x + 0.2, y + 0.84).stroke({ width: 0.06, color: skin.dark })
    g.rect(x + 0.44, y + 0.12, 0.12, 0.1).fill(skin.dark)
  } else if (type === 'tower') {
    g.roundRect(x + 0.2, y + 0.55, w - 0.4, h - 0.65, 0.12).fill(skin.body).stroke({ width: 0.06, color: OUTLINE })
    g.rect(x + 0.2, y + 0.55, 0.3, h - 0.65).fill({ color: skin.light, alpha: 0.6 })
    for (let i = 0; i < 4; i++) g.rect(x + 0.2 + i * ((w - 0.4) / 4) + 0.04, y + 0.3, (w - 0.4) / 4 - 0.1, 0.3).fill(skin.body).stroke({ width: 0.04, color: OUTLINE })
    g.roundRect(x + w / 2 - 0.13, y + h - 0.85, 0.26, 0.42, 0.12).fill(skin.dark)
    g.rect(x + w / 2 - 0.02, y + 0.02, 0.04, 0.3).fill(OUTLINE)
    g.poly([x + w / 2 + 0.02, y + 0.03, x + w / 2 + 0.38, y + 0.12 + Math.sin(time * 5) * 0.03, x + w / 2 + 0.02, y + 0.22]).fill(0xe0533d)
  } else {
    g.roundRect(x + 0.25, y + 0.55, w - 0.5, h - 0.68, 0.1).fill(skin.body).stroke({ width: 0.06, color: OUTLINE })
    g.rect(x + 0.25, y + 0.55, w - 0.5, 0.2).fill(skin.light)
    for (const tx of [x + 0.08, x + w - 0.58]) g.roundRect(tx, y + 0.3, 0.5, h - 0.4, 0.1).fill(skin.body).stroke({ width: 0.06, color: OUTLINE })
    for (const tx of [x + 0.08, x + w - 0.58]) g.poly([tx - 0.05, y + 0.32, tx + 0.25, y - 0.05, tx + 0.55, y + 0.32]).fill(skin.dark).stroke({ width: 0.04, color: OUTLINE })
    g.roundRect(x + w / 2 - 0.22, y + h - 0.75, 0.44, 0.62, 0.2).fill(0x3a1f1a)
    g.rect(x + w / 2 - 0.02, y - 0.1, 0.05, 0.5).fill(OUTLINE)
    g.poly([x + w / 2 + 0.03, y - 0.08, x + w / 2 + 0.5, y + 0.05 + Math.sin(time * 5) * 0.04, x + w / 2 + 0.03, y + 0.2]).fill(0xf2d13d).stroke({ width: 0.03, color: OUTLINE })
  }
}

export function drawHealthBar(g: Graphics, x: number, y: number, w: number, health: number): void {
  g.roundRect(x, y, w, 0.14, 0.05).fill({ color: 0x1b1b1b, alpha: 0.85 })
  g.roundRect(x + 0.02, y + 0.02, Math.max(0, (w - 0.04) * health), 0.1, 0.04).fill(health > 0.5 ? 0x6fd46f : health > 0.25 ? 0xf2c14e : 0xe0533d)
}

export interface TroopPose {
  x: number
  y: number
  angle: number // where it looks, radians
  phase: number // walking cycle, radians
  moving: boolean
  lunge: number // 0..1 hit animation while attacking
  fade: number
}

// A round cartoon fighter: shadow, body with squash and stretch, eyes that look ahead, a hat that tells the type.
export function drawTroop(g: Graphics, type: string, pose: TroopPose): void {
  const skin = TROOP_SKIN[type] ?? TROOP_SKIN.balanced
  const r = skin.radius
  const stretch = pose.moving ? 1 + Math.sin(pose.phase * 2) * 0.1 : 1
  const hop = pose.moving ? Math.abs(Math.sin(pose.phase)) * 0.12 : 0
  const lx = Math.cos(pose.angle) * pose.lunge * 0.14
  const ly = Math.sin(pose.angle) * pose.lunge * 0.14
  const x = pose.x + lx
  const y = pose.y - hop + ly
  const a = pose.fade
  g.ellipse(pose.x, pose.y + r * 0.8, r * 0.95, r * 0.32).fill({ color: 0x000000, alpha: 0.28 * a })
  g.ellipse(x, y, (r / stretch) * 1.0, r * stretch).fill({ color: skin.body, alpha: a })
  g.ellipse(x, y, (r / stretch) * 1.0, r * stretch).stroke({ width: 0.05, color: skin.rim, alpha: a })
  g.ellipse(x - r * 0.25, y - r * 0.4, r * 0.3, r * 0.16).fill({ color: 0xffffff, alpha: 0.35 * a })
  const ex = Math.cos(pose.angle) * r * 0.25
  const ey = Math.sin(pose.angle) * r * 0.25
  for (const side of [-1, 1]) {
    const px = x + ex - Math.sin(pose.angle) * side * r * 0.32
    const py = y + ey - r * 0.05 + Math.cos(pose.angle) * side * r * 0.12
    g.circle(px, py, r * 0.2).fill({ color: 0xffffff, alpha: a }).circle(px + Math.cos(pose.angle) * r * 0.07, py + Math.sin(pose.angle) * r * 0.07, r * 0.1).fill({ color: 0x1b1b1b, alpha: a })
  }
  if (type === 'fast') {
    g.rect(x - r, y - r * 0.5, r * 2, r * 0.22).fill({ color: 0xe0533d, alpha: a })
    if (pose.moving) g.moveTo(x - r * 1.5, y).lineTo(x - r * 2.2, y).moveTo(x - r * 1.4, y + r * 0.4).lineTo(x - r * 2, y + r * 0.4).stroke({ width: 0.04, color: 0xffffff, alpha: 0.6 * a })
  } else if (type === 'balanced') {
    g.circle(x - Math.cos(pose.angle) * r * 0.9, y + r * 0.3, r * 0.42).fill({ color: 0xb8bcc2, alpha: a }).stroke({ width: 0.04, color: 0x555a60, alpha: a })
  } else {
    g.poly([x - r * 0.95, y - r * 0.25, x - r * 0.55, y - r * 1.1, x - r * 0.3, y - r * 0.5]).fill({ color: 0xf2efe6, alpha: a }).stroke({ width: 0.03, color: OUTLINE, alpha: a })
    g.poly([x + r * 0.95, y - r * 0.25, x + r * 0.55, y - r * 1.1, x + r * 0.3, y - r * 0.5]).fill({ color: 0xf2efe6, alpha: a }).stroke({ width: 0.03, color: OUTLINE, alpha: a })
    g.rect(x - r * 0.85, y - r * 0.55, r * 1.7, r * 0.26).fill({ color: 0x555a60, alpha: a })
  }
}
