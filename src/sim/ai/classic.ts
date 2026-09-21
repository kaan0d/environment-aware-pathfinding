import { MAX_ATTACK_POSITIONS } from '../config'
import { isTargetable, traversalOf } from '../environment'
import type { Grid } from '../grid'
import type { Troop } from '../troop'
import type { Building, Plan, Planner, TargetKind } from '../types'
import type { World } from '../world'
import { RouteSearch } from './routeSearch'

const NO_CELLS = new Int32Array(0)

// Baseline AI: nearest building by straight line, walls are never crossed, walls are hit only when no path exists.
export class ClassicPlanner implements Planner {
  private readonly search: RouteSearch
  private readonly slots = new Int32Array(MAX_ATTACK_POSITIONS)

  constructor(private readonly grid: Grid) {
    this.search = new RouteSearch(grid)
  }

  plan(world: World, troopId: number): Plan | null {
    const troop = world.troops[troopId]
    this.search.run(this.grid.cellOfPoint(troop.x, troop.y))
    const nearest = this.nearestBuilding(world, troop, false)
    if (nearest === null) return null
    return (
      this.planTarget(world, troop, 'building', nearest.id) ??
      this.planBreakthrough(world, troop, nearest) ??
      this.planNearestReachable(world, troop)
    )
  }

  // No path to the chosen building: hit the wall next to the reachable region that is closest to it.
  private planBreakthrough(world: World, troop: Troop, building: Building): Plan | null {
    const { grid } = this
    const goalX = building.x + building.w / 2
    const goalY = building.y + building.h / 2
    let bestWall = -1
    let bestDistSq = Infinity
    for (let cell = 0; cell < grid.size; cell++) {
      const kind = grid.kind[cell]
      if (traversalOf(kind) !== 'breakable' || !isTargetable(kind)) continue
      const dx = (cell % grid.width) + 0.5 - goalX
      const dy = Math.floor(cell / grid.width) + 0.5 - goalY
      const distSq = dx * dx + dy * dy
      if (distSq >= bestDistSq || this.bestSlot(world, troop.id, 'wall', cell) < 0) continue
      bestWall = cell
      bestDistSq = distSq
    }
    return bestWall < 0 ? null : this.planTarget(world, troop, 'wall', bestWall)
  }

  // Only buildings are reachable, for example when the target hides behind other buildings.
  private planNearestReachable(world: World, troop: Troop): Plan | null {
    const building = this.nearestBuilding(world, troop, true)
    return building === null ? null : this.planTarget(world, troop, 'building', building.id)
  }

  private planTarget(world: World, troop: Troop, targetKind: TargetKind, targetId: number): Plan | null {
    const slot = this.bestSlot(world, troop.id, targetKind, targetId)
    if (slot < 0) return null
    const hp = targetKind === 'wall' ? this.grid.hp[targetId] : this.grid.buildings[targetId].hp
    return {
      targetKind,
      targetId,
      route: this.search.routeTo(slot),
      breakCells: NO_CELLS,
      estTotalTime: this.search.dist[slot] / troop.type.speed + hp / troop.type.dps, // solo estimate, ignores other troops
    }
  }

  private nearestBuilding(world: World, troop: Troop, reachableOnly: boolean): Building | null {
    let best: Building | null = null
    let bestDistSq = Infinity
    for (const building of this.grid.buildings) {
      if (!building.alive) continue
      const dx = building.x + building.w / 2 - troop.x
      const dy = building.y + building.h / 2 - troop.y
      const distSq = dx * dx + dy * dy
      if (distSq >= bestDistSq) continue
      if (reachableOnly && this.bestSlot(world, troop.id, 'building', building.id) < 0) continue
      best = building
      bestDistSq = distSq
    }
    return best
  }

  // Closest reachable attack position, preferring ones no other troop uses; -1 when none is reachable.
  private bestSlot(world: World, troopId: number, targetKind: TargetKind, targetId: number): number {
    const { dist } = this.search
    const count = this.grid.attackPositions(targetKind, targetId, this.slots)
    let bestFree = -1
    let bestAny = -1
    for (let i = 0; i < count; i++) {
      const cell = this.slots[i]
      if (dist[cell] === Infinity) continue
      if (bestAny < 0 || dist[cell] < dist[bestAny]) bestAny = cell
      if (world.slotAvailable(cell, troopId) && (bestFree < 0 || dist[cell] < dist[bestFree])) bestFree = cell
    }
    return bestFree >= 0 ? bestFree : bestAny
  }
}
