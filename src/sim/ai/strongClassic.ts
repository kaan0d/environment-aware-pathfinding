import { traversalOf } from '../environment'
import { FlowField } from '../planner/flowField'
import type { Grid } from '../grid'
import type { Troop } from '../troop'
import type { Building, Plan, Planner } from '../types'
import type { World } from '../world'

// A fairer opponent than Classic: still targets the nearest building by straight line, but a wall on the way
// is priced by its hit points against the whole squad's combined dps (not this one troop's), same as every other
// wall on the map - no per-troop tuning, no candidates, no rollout. If breaking it is faster than the way
// around, the route crosses it; otherwise it walks around exactly like Classic would.
export class StrongClassicPlanner implements Planner {
  readonly reconsidersOnChange = true
  private readonly field: FlowField

  constructor(private readonly grid: Grid) {
    this.field = new FlowField(grid)
  }

  plan(world: World, troopId: number): Plan | null {
    const troop = world.troops[troopId]
    const building = this.nearestReachable(world, troop)
    if (building === null) return null
    const route = this.field.routeFrom(this.grid.cellOfPoint(troop.x, troop.y))
    return {
      targetKind: 'building',
      targetId: building.id,
      route,
      breakCells: route.filter((cell) => traversalOf(this.grid.kind[cell]) === 'breakable'),
      estTotalTime: this.field.value[route[0]], // solo estimate, ignores other troops' own travel time
    }
  }

  // Nearest building by straight line; if walls seal it off entirely (never happens once breaking is allowed
  // unless the building is boxed in by other buildings), falls back to the next nearest.
  private nearestReachable(world: World, troop: Troop): Building | null {
    const dps = this.totalDps(world)
    const start = this.grid.cellOfPoint(troop.x, troop.y)
    const byDistance = this.grid.buildings
      .filter((b) => b.alive)
      .sort((a, b) => this.distanceSq(troop, a) - this.distanceSq(troop, b))
    for (const building of byDistance) {
      this.field.compute(troop.type.speed, dps, null, { onlyBuilding: building.id })
      if (this.field.value[start] !== Infinity) return building
    }
    return null
  }

  // Every currently active troop's dps, summed: prices a wall as if the whole squad broke it together.
  private totalDps(world: World): number {
    let dps = 0
    for (const troop of world.troops) if (troop.isActive()) dps += troop.type.dps
    return dps
  }

  private distanceSq(troop: Troop, building: Building): number {
    const dx = building.x + building.w / 2 - troop.x
    const dy = building.y + building.h / 2 - troop.y
    return dx * dx + dy * dy
  }
}
