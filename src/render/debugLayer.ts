import { Text, type Graphics } from 'pixi.js'
import { squadSettings } from '../sim/config'
import type { Troop } from '../sim/troop'
import { FlowField } from '../sim/planner/flowField'
import { SquadPlanner } from '../sim/planner/squadPlanner'
import { traversalOf } from '../sim/environment'
import type { World } from '../sim/world'
import type { Debug } from '../ui/debug'
import type { PanelView } from './panelView'

const HALO_COLORS = [0xff6b6b, 0x4dabf7, 0xffd43b, 0x69db7c, 0xda77f2, 0xff922b, 0x38d9a9, 0xf783ac]
const WALK = 0x3b82f6
const BREAK = 0x22c55e
const HEAT_REFRESH = 0.5 // seconds between recomputing the heat map
const MAX_LABELS = 40 // wall numbers drawn at once

// Draws the technical layers onto a panel: heat map of the flow field, squad halos and the planned route.
export class DebugLayer {
  readonly legend = { min: 0, max: 0 }
  private field: FlowField | null = null
  private fieldWorld: World | null = null
  private fieldFor = ''
  private computedAt = -1
  private readonly texts: Text[] = []

  constructor(private readonly view: PanelView) {}

  update(world: World, debug: Debug, seconds: number): void {
    const { heat, halos, routes, wallInfo, labels } = this.view
    if (!debug.enabled) {
      labels.visible = false
      return void this.clear([heat, halos, routes, wallInfo])
    }
    labels.visible = true
    this.drawHalos(world, halos)
    // Same troop id in both worlds (same deployments) - followed unit's route shows on both panels, not just
    // the one debug.panel points at.
    const followed = debug.troopId === null ? undefined : world.troops[debug.troopId]
    this.drawWallInfo(world, followed?.isActive() ? followed : undefined)
    // Heat map: both worlds are built from the same deployments, so debug.troopId is the same unit in either one.
    // Shown on both panels (against each panel's own grid), not only the one the selection happens to be on.
    const heatTroop = debug.troopId === null ? undefined : world.troops[debug.troopId]
    if (heatTroop?.isActive()) this.drawHeat(world, heatTroop.type.speed, heatTroop.type.dps, heatTroop.type.id, seconds, heat)
    else this.clear([heat])
    if (followed === undefined || !followed.isActive()) return void this.clear([routes])
    this.drawRadius(world, followed, halos)
    this.drawRoute(world, followed.id, routes)
  }

  // A ring of the squad radius around the followed unit, on the panel that has squads.
  private drawRadius(world: World, troop: Troop, g: Graphics): void {
    if (!(world.planner instanceof SquadPlanner)) return
    g.circle(troop.x, troop.y, squadSettings.radius).stroke({ width: 0.08, color: 0xffffff, alpha: 0.6 })
  }

  // A bar under every wall, and the number for the walls that matter right now: on the followed route, being hit, or damaged.
  private drawWallInfo(world: World, followed: Troop | undefined): void {
    const { grid } = world
    const g = this.view.wallInfo
    g.clear()
    const shown = new Set<number>()
    if (followed?.plan) for (const cell of followed.plan.route.subarray(Math.max(0, followed.routeIdx - 1))) if (traversalOf(grid.kind[cell]) === 'breakable') shown.add(cell)
    for (const t of world.troops) if (t.attackKind === 'wall' && t.isActive()) shown.add(t.attackId)
    for (let cell = 0; cell < grid.size; cell++) {
      if (traversalOf(grid.kind[cell]) !== 'breakable') continue
      const x = cell % grid.width
      const y = Math.floor(cell / grid.width)
      const health = Math.max(0, grid.hp[cell] / grid.maxHp[cell])
      g.rect(x + 0.1, y + 0.84, 0.8, 0.11).fill({ color: 0x000000, alpha: 0.6 })
      g.rect(x + 0.12, y + 0.86, 0.76 * health, 0.07).fill(health > 0.5 ? 0x6fd46f : health > 0.25 ? 0xf2c14e : 0xe0533d)
      if (grid.hp[cell] < grid.maxHp[cell] && shown.size < MAX_LABELS) shown.add(cell)
    }
    this.placeLabels(world, [...shown].slice(0, MAX_LABELS))
  }

  private placeLabels(world: World, cells: number[]): void {
    const { grid } = world
    const labels = this.view.labels
    while (this.texts.length < cells.length) {
      const text = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 14, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x000000, width: 3 } } })
      text.anchor.set(0.5)
      labels.addChild(text)
      this.texts.push(text)
    }
    const scale = 10 / (14 * Math.max(1, this.view.root.scale.x)) // about 10 screen pixels tall whatever the zoom
    this.texts.forEach((text, i) => {
      text.visible = i < cells.length
      if (i >= cells.length) return
      const cell = cells[i]
      const value = String(Math.ceil(grid.hp[cell]))
      if (text.text !== value) text.text = value
      text.scale.set(scale)
      text.position.set((cell % grid.width) + 0.5, Math.floor(cell / grid.width) + 0.45)
    })
  }

  private clear(layers: Graphics[]): void {
    for (const layer of layers) layer.clear()
  }

  private drawHalos(world: World, g: Graphics): void {
    g.clear()
    const planner = world.planner instanceof SquadPlanner ? world.planner : null
    if (planner === null) return
    for (const troop of world.troops) {
      const squad = troop.isActive() ? planner.squadOf(troop.id) : undefined
      if (squad === undefined || squad.length < 2) continue
      const color = HALO_COLORS[squad[0].id % HALO_COLORS.length]
      g.circle(troop.x, troop.y, 0.62).fill({ color, alpha: 0.22 }).stroke({ width: 0.05, color, alpha: 0.7 })
    }
  }

  // Seconds to finish a building from each cell, for the selected unit type; greener is faster.
  private drawHeat(world: World, speed: number, dps: number, typeId: string, seconds: number, g: Graphics): void {
    if (this.fieldWorld !== world || this.field === null) {
      this.field = new FlowField(world.grid)
      this.fieldWorld = world
      this.computedAt = -1
    }
    const key = `${typeId}:${world.version}:${world.grid.buildings.filter((b) => b.alive).length}`
    if (key !== this.fieldFor || seconds - this.computedAt > HEAT_REFRESH) {
      this.field.compute(speed, dps, null)
      this.fieldFor = key
      this.computedAt = seconds
      let max = 0
      let min = Infinity
      for (const v of this.field.value) if (Number.isFinite(v)) (max = Math.max(max, v)), (min = Math.min(min, v))
      this.legend.min = Number.isFinite(min) ? min : 0
      this.legend.max = max
      this.paintHeat(world, g) // the cells only change when the field does, not every frame
    }
  }

  private paintHeat(world: World, g: Graphics): void {
    g.clear()
    const { grid } = world
    const field = this.field!
    const span = Math.max(1e-6, this.legend.max - this.legend.min)
    for (let cell = 0; cell < grid.size; cell++) {
      const value = field.value[cell]
      if (!Number.isFinite(value) || traversalOf(grid.kind[cell]) === 'blocked') continue
      g.rect(cell % grid.width, Math.floor(cell / grid.width), 1, 1).fill({ color: heatColor((value - this.legend.min) / span), alpha: 0.5 })
    }
  }

  // Blue where the unit walks, green where it has to break a wall, an X on the wall itself.
  private drawRoute(world: World, troopId: number, g: Graphics): void {
    g.clear()
    const troop = world.troops[troopId]
    const plan = troop.plan
    if (plan === null) return
    const { grid } = world
    const breaks = new Set<number>(plan.breakCells)
    let px = troop.x
    let py = troop.y
    for (let i = Math.max(0, troop.routeIdx); i < plan.route.length; i++) {
      const cell = plan.route[i]
      const x = (cell % grid.width) + 0.5
      const y = Math.floor(cell / grid.width) + 0.5
      const isBreak = breaks.has(cell) || traversalOf(grid.kind[cell]) === 'breakable'
      g.moveTo(px, py).lineTo(x, y).stroke({ width: 0.14, color: isBreak ? BREAK : WALK, alpha: 0.9 })
      if (isBreak) g.moveTo(x - 0.28, y - 0.28).lineTo(x + 0.28, y + 0.28).moveTo(x + 0.28, y - 0.28).lineTo(x - 0.28, y + 0.28).stroke({ width: 0.09, color: 0xffffff })
      px = x
      py = y
    }
  }
}

// 0 = fast (blue), 1 = slow (orange) - blue/orange instead of green/red so it still reads for red-green color
// blindness, the most common kind.
function heatColor(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  const from = [0x2b, 0x6c, 0xb0] // blue
  const to = [0xf2, 0x8f, 0x1c] // orange
  const [r, g, b] = from.map((f, i) => Math.round(f + (to[i] - f) * c))
  return (r << 16) | (g << 8) | b
}
