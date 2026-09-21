import { HYSTERESIS } from '../config'
import { traversalOf } from '../environment'
import type { Grid } from '../grid'
import type { Troop } from '../troop'
import type { Plan, Planner } from '../types'
import type { World } from '../world'
import { routeTime } from './cost'
import { FlowField } from './flowField'

// Picks target and route by total seconds: walking, breaking walls on the way, then destroying the building.
export class TimeCostPlanner implements Planner {
  readonly reconsidersOnChange = true
  private readonly field: FlowField

  constructor(private readonly grid: Grid) {
    this.field = new FlowField(grid)
  }

  plan(world: World, troopId: number): Plan | null {
    const troop = world.troops[troopId]
    const { speed, dps } = troop.type
    const start = this.grid.cellOfPoint(troop.x, troop.y)
    // Taken attack positions are skipped so troops spread out; when nothing is left, share one.
    this.field.compute(speed, dps, (cell) => world.slotAvailable(cell, troopId))
    if (this.field.value[start] === Infinity) this.field.compute(speed, dps, null)
    const current = this.stillValid(troop) ? troop.plan : null
    if (this.field.value[start] === Infinity) return current
    const best = this.planFromField(troop, start)
    if (current === null) return best
    return best.estTotalTime < this.remainingTime(troop, current) * (1 - HYSTERESIS) ? best : current
  }

  private planFromField(troop: Troop, start: number): Plan {
    const { field, grid } = this
    const route = field.routeFrom(start)
    const targetId = field.target[route[route.length - 1]]
    const alignedStart = route[0] === grid.cellOfPoint(troop.x, troop.y) ? 1 : 0
    const breakCells = route.filter((cell) => traversalOf(grid.kind[cell]) === 'breakable')
    const walk = routeTime(grid, troop.x, troop.y, route, alignedStart, troop.type.speed, troop.type.dps)
    return {
      targetKind: 'building',
      targetId,
      route,
      breakCells,
      estTotalTime: walk + grid.buildings[targetId].hp / troop.type.dps, // solo estimate, ignores other troops
    }
  }

  private remainingTime(troop: Troop, plan: Plan): number {
    const walk = routeTime(this.grid, troop.x, troop.y, plan.route, troop.routeIdx, troop.type.speed, troop.type.dps)
    return walk + this.grid.buildings[plan.targetId].hp / troop.type.dps
  }

  // A plan is kept only while its building lives and no remaining route cell became impassable.
  private stillValid(troop: Troop): boolean {
    const plan = troop.plan
    if (plan === null || plan.targetKind !== 'building' || !this.grid.buildings[plan.targetId].alive) return false
    for (let i = troop.routeIdx; i < plan.route.length; i++) {
      if (traversalOf(this.grid.kind[plan.route[i]]) === 'blocked') return false
    }
    return true
  }
}
