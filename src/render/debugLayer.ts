import type { Graphics } from 'pixi.js'
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

// Draws the technical layers onto a panel: heat map of the flow field, squad halos and the planned route.
export class DebugLayer {
  readonly legend = { min: 0, max: 0 }
  private field: FlowField | null = null
  private fieldWorld: World | null = null
  private fieldFor = ''
  private computedAt = -1

  constructor(
    private readonly view: PanelView,
    private readonly panel: 0 | 1,
  ) {}

  update(world: World, debug: Debug, seconds: number): void {
    const { heat, halos, routes } = this.view
    if (!debug.enabled) return void this.clear([heat, halos, routes])
    this.drawHalos(world, halos)
    const troop = debug.panel === this.panel && debug.troopId !== null ? world.troops[debug.troopId] : undefined
    if (troop === undefined || !troop.isActive()) return void this.clear([heat, routes])
    this.drawHeat(world, troop.type.speed, troop.type.dps, troop.type.id, seconds, heat)
    this.drawRoute(world, troop.id, routes)
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

// 0 = fast (green), 1 = slow (red), through yellow.
function heatColor(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  const r = Math.round(255 * Math.min(1, c * 2))
  const g = Math.round(255 * Math.min(1, (1 - c) * 2))
  return (r << 16) | (g << 8) | 40
}
