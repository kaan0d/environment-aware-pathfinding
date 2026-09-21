import { Container, Graphics } from 'pixi.js'
import { traversalOf } from '../sim/environment'
import type { Troop } from '../sim/troop'
import type { World } from '../sim/world'
import type { EditorOverlay } from '../ui/editor'
import { Effects } from './effects'
import { BUILDING_SKIN, drawBuilding, drawGrass, drawHealthBar, drawTroop, drawWall, drawWallDamage, wallColor } from './style'

const GHOST_SECONDS = 0.3
const SHAKE_SECONDS = 0.4
const HIT_INTERVAL = 0.16 // seconds between sparks while a troop is hitting

interface Ghost {
  x: number
  y: number
  w: number
  h: number
  color: number
  age: number
}

// Draws one World in cell units; the caller scales and places `root`. It only reads the world.
// Layers, bottom to top: ground, heat map (debug), walls, wall damage, buildings, halos (debug), dust, troops, routes (debug), overlay.
export class PanelView {
  readonly root = new Container()
  readonly heat = new Graphics()
  readonly halos = new Graphics()
  readonly routes = new Graphics()
  readonly effects = new Effects()
  private readonly scene = new Container() // shaken as a whole when a building falls
  private readonly ground = new Graphics()
  private readonly wallBase = new Graphics()
  private readonly wallDamage = new Graphics()
  private readonly buildings = new Graphics()
  private readonly ghosts = new Graphics()
  private readonly particles = new Graphics()
  private readonly troops = new Graphics()
  private readonly overlay = new Graphics()
  private world: World | null = null
  private previous: Array<{ x: number; y: number }> = []
  private angles: number[] = []
  private hitTimers: number[] = []
  private ghostList: Ghost[] = []
  private levelSnapshot = new Uint8Array(0)
  private seenEvents = 0
  private wallsDrawnAt = -1
  private fallenWalls = 0
  private lastTime = -1
  private shake = 0

  constructor() {
    this.scene.addChild(this.ground, this.heat, this.wallBase, this.wallDamage, this.buildings, this.ghosts, this.halos, this.particles, this.troops, this.routes, this.overlay)
    this.root.addChild(this.scene)
  }

  // Remembers where every troop stands before a step, so drawing can blend between two steps.
  snapshot(): void {
    if (this.world === null) return
    const troops = this.world.troops
    for (let i = 0; i < troops.length; i++) this.previous[i] = { x: troops[i].x, y: troops[i].y }
  }

  // alpha is how far real time is into the next step, seconds is the wall-clock time for animations.
  update(world: World, alpha: number, seconds: number): void {
    if (world !== this.world) this.attach(world)
    const delta = this.lastTime < 0 ? 0 : Math.min(seconds - this.lastTime, 0.1)
    this.lastTime = seconds
    this.collectEvents(world)
    this.drawWalls(world)
    this.drawBuildings(world, seconds)
    this.drawGhosts(delta)
    this.emitHits(world, delta)
    this.effects.update(delta)
    this.effects.draw(this.particles)
    this.drawTroops(world, alpha, seconds)
    this.applyShake(delta)
  }

  // Spawn markers, the placement preview, the selection and the red flash of a refused click.
  drawOverlay(o: EditorOverlay): void {
    const g = this.overlay
    g.clear()
    for (const s of o.spawns) {
      g.poly([s.x + 0.5, s.y + 0.1, s.x + 0.9, s.y + 0.5, s.x + 0.5, s.y + 0.9, s.x + 0.1, s.y + 0.5]).fill({ color: 0x2ec4b6, alpha: 0.25 }).stroke({ width: 0.07, color: 0x1a8f84 })
    }
    if (o.selection) g.rect(o.selection.x, o.selection.y, o.selection.w, o.selection.h).stroke({ width: 0.1, color: 0xffe066 })
    if (o.preview) {
      const color = o.preview.valid ? 0x7bd88f : 0xe0533d
      g.rect(o.preview.x, o.preview.y, o.preview.w, o.preview.h).fill({ color, alpha: 0.35 }).stroke({ width: 0.06, color })
    }
    for (const f of o.flashes) g.rect(f.x, f.y, 1, 1).fill({ color: 0xe0533d, alpha: 0.7 * (1 - f.age / 0.45) })
  }

  // Where a troop is drawn right now, for picking it with the pointer.
  troopPosition(troop: Troop, alpha: number): { x: number; y: number } {
    const before = this.previous[troop.id] ?? { x: troop.x, y: troop.y }
    return { x: before.x + (troop.x - before.x) * alpha, y: before.y + (troop.y - before.y) * alpha }
  }

  private attach(world: World): void {
    this.world = world
    this.previous = world.troops.map((t) => ({ x: t.x, y: t.y }))
    this.angles = world.troops.map(() => 0)
    this.hitTimers = world.troops.map(() => 0)
    this.ghostList = []
    this.levelSnapshot = new Uint8Array(world.grid.size)
    this.seenEvents = 0
    this.wallsDrawnAt = -1
    this.fallenWalls = 0
    this.ground.clear()
    drawGrass(this.ground, world.grid.width, world.grid.height)
  }

  // The wall posts are redrawn only when a wall fell; the damage layer covers just the hurt ones.
  private drawWalls(world: World): void {
    const { grid } = world
    if (this.fallenWalls !== this.wallsDrawnAt) {
      this.wallsDrawnAt = this.fallenWalls
      const g = this.wallBase
      g.clear()
      this.levelSnapshot.fill(0)
      const isWall = (x: number, y: number) => grid.inBounds(x, y) && traversalOf(grid.kind[grid.cellAt(x, y)]) === 'breakable'
      for (let cell = 0; cell < grid.size; cell++) {
        if (!isWall(cell % grid.width, Math.floor(cell / grid.width))) continue
        const x = cell % grid.width
        const y = Math.floor(cell / grid.width)
        this.levelSnapshot[cell] = grid.wallLevel[cell]
        drawWall(g, x, y, grid.wallLevel[cell], isWall(x + 1, y), isWall(x, y + 1))
      }
    }
    const d = this.wallDamage
    d.clear()
    for (let cell = 0; cell < grid.size; cell++) {
      if (this.levelSnapshot[cell] === 0 || grid.hp[cell] >= grid.maxHp[cell]) continue
      drawWallDamage(d, cell % grid.width, Math.floor(cell / grid.width), Math.max(0, grid.hp[cell] / grid.maxHp[cell]))
    }
  }

  private drawBuildings(world: World, seconds: number): void {
    const g = this.buildings
    g.clear()
    for (const b of world.grid.buildings) {
      if (!b.alive) continue
      drawBuilding(g, b.type.id, b.x, b.y, b.w, b.h, seconds)
      const health = b.hp / b.maxHp
      if (health < 1) drawHealthBar(g, b.x + 0.1, b.y - 0.28, b.w - 0.2, health)
    }
  }

  // New destroyed walls and buildings leave dust, chunks and a fading shadow; a building also shakes the panel.
  private collectEvents(world: World): void {
    for (; this.seenEvents < world.events.length; this.seenEvents++) {
      const event = world.events[this.seenEvents]
      if (event.type === 'wallDestroyed') {
        this.fallenWalls++
        const x = event.cell % world.grid.width
        const y = Math.floor(event.cell / world.grid.width)
        const color = wallColor(this.levelSnapshot[event.cell] || 1)
        this.effects.emit('dust', x + 0.5, y + 0.5, 6, 0xd9d2c3)
        this.effects.emit('chunk', x + 0.5, y + 0.5, 6, color)
        this.ghostList.push({ x, y, w: 1, h: 1, color: 0xf0e6d2, age: 0 })
      } else if (event.type === 'buildingDestroyed') {
        const b = world.grid.buildings[event.buildingId]
        const color = (BUILDING_SKIN[b.type.id] ?? BUILDING_SKIN.depot).body
        this.effects.emit('dust', b.x + b.w / 2, b.y + b.h / 2, 14, 0xd9d2c3)
        this.effects.emit('chunk', b.x + b.w / 2, b.y + b.h / 2, 12, color)
        this.ghostList.push({ x: b.x, y: b.y, w: b.w, h: b.h, color, age: 0 })
        this.shake = SHAKE_SECONDS
      }
    }
  }

  private drawGhosts(delta: number): void {
    const g = this.ghosts
    g.clear()
    this.ghostList = this.ghostList.filter((ghost) => (ghost.age += delta) < GHOST_SECONDS)
    for (const ghost of this.ghostList) g.rect(ghost.x, ghost.y, ghost.w, ghost.h).fill({ color: ghost.color, alpha: 0.6 * (1 - ghost.age / GHOST_SECONDS) })
  }

  // Sparks fly from the target while a troop is hitting it.
  private emitHits(world: World, delta: number): void {
    for (const troop of world.troops) {
      if (troop.state !== 'attacking' || troop.attackKind === null) continue
      this.hitTimers[troop.id] = (this.hitTimers[troop.id] ?? 0) - delta
      if (this.hitTimers[troop.id] > 0) continue
      this.hitTimers[troop.id] = HIT_INTERVAL
      const { x, y } = this.targetCenter(world, troop)
      this.effects.emit('spark', (x + troop.x) / 2, (y + troop.y) / 2, 2, 0xfff2b0)
    }
  }

  private drawTroops(world: World, alpha: number, seconds: number): void {
    const g = this.troops
    g.clear()
    for (const troop of world.troops) {
      if (troop.state === 'notSpawned') continue
      const before = this.previous[troop.id] ?? { x: troop.x, y: troop.y }
      drawTroop(g, troop.type.id, {
        x: before.x + (troop.x - before.x) * alpha,
        y: before.y + (troop.y - before.y) * alpha,
        angle: this.facing(world, troop, troop.x - before.x, troop.y - before.y),
        phase: seconds * 12 + troop.id,
        moving: troop.state === 'moving',
        lunge: troop.state === 'attacking' ? Math.max(0, Math.sin(seconds * 14 + troop.id)) : 0,
        fade: troop.state === 'done' ? 0.45 : 1,
      })
    }
  }

  private applyShake(delta: number): void {
    this.shake = Math.max(0, this.shake - delta)
    const strength = (this.shake / SHAKE_SECONDS) * 0.25
    this.scene.position.set(Math.sin(this.lastTime * 90) * strength, Math.cos(this.lastTime * 70) * strength)
  }

  private targetCenter(world: World, troop: Troop): { x: number; y: number } {
    const { grid } = world
    if (troop.attackKind === 'wall') return { x: (troop.attackId % grid.width) + 0.5, y: Math.floor(troop.attackId / grid.width) + 0.5 }
    const b = grid.buildings[troop.attackId]
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  }

  // Turns smoothly towards the walking direction, or towards the target while attacking; the sim never sees this.
  private facing(world: World, troop: Troop, dx: number, dy: number): number {
    let wanted = this.angles[troop.id] ?? 0
    if (troop.state === 'attacking' && troop.attackKind !== null) {
      const target = this.targetCenter(world, troop)
      wanted = Math.atan2(target.y - troop.y, target.x - troop.x)
    } else if (dx * dx + dy * dy > 1e-8) wanted = Math.atan2(dy, dx)
    const current = this.angles[troop.id] ?? wanted
    const turn = Math.atan2(Math.sin(wanted - current), Math.cos(wanted - current))
    this.angles[troop.id] = current + turn * 0.3
    return this.angles[troop.id]
  }
}
