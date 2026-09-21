import { RouteSearch } from '../ai/routeSearch'
import { MAX_ATTACK_POSITIONS } from '../config'
import { CellKind, moveCostOf, traversalOf } from '../environment'
import type { Grid } from '../grid'
import { SlotFinder } from '../slots'
import type { Troop } from '../troop'
import type { TargetKind } from '../types'
import type { World } from '../world'
import { breakTime } from './breakTime'

export interface RolloutResult {
  total: number // seconds from now until the target building falls, Infinity if it never does
  stageTimes: Float64Array // seconds until each wall on the route falls, then the building
  stageSlots: Int32Array // free attack positions the squad counted at each of those targets
}

interface Stage {
  kind: TargetKind
  id: number
  hp: number
  approachIdx: number // route index of the cell the squad stands on while hitting
}

// Event-based forward estimate of a squad following one route: no steps, only arrival times and break times.
export class Rollout {
  private readonly search: RouteSearch
  private readonly slots: SlotFinder
  private readonly seeds = new Int32Array(MAX_ATTACK_POSITIONS)
  private lastSlots = 0 // attack positions counted by the latest stageTime call

  constructor(private readonly grid: Grid) {
    this.search = new RouteSearch(grid)
    this.slots = new SlotFinder(grid)
  }

  // route starts at the leader's cell and ends next to the building; walls on it are broken in order.
  run(world: World, members: readonly Troop[], route: Int32Array, buildingId: number): RolloutResult {
    const stages = this.stagesOf(route, buildingId)
    const times = new Float64Array(stages.length)
    const slotCounts = new Int32Array(stages.length)
    let arrivals = this.firstArrivals(members, route, stages[0])
    const opened: { cell: number; kind: number }[] = []
    try {
      for (let s = 0; s < stages.length; s++) {
        const stage = stages[s]
        if (s > 0) {
          const length = this.walkLength(route, stages[s - 1].approachIdx, stage.approachIdx)
          arrivals = arrivals.map((arrival, i) => Math.max(times[s - 1], arrival) + length / members[i].type.speed)
          this.openWall(stages[s - 1], opened) // slots of later stages are counted with the earlier walls gone
        }
        times[s] = this.stageTime(world, members, arrivals, route, stage)
        slotCounts[s] = this.lastSlots
      }
    } finally {
      for (const { cell, kind } of opened) this.grid.kind[cell] = kind
    }
    return { total: times[times.length - 1], stageTimes: times, stageSlots: slotCounts }
  }

  private openWall(stage: Stage, opened: { cell: number; kind: number }[]): void {
    if (stage.kind !== 'wall') return
    opened.push({ cell: stage.id, kind: this.grid.kind[stage.id] })
    this.grid.kind[stage.id] = CellKind.empty
  }

  private stagesOf(route: Int32Array, buildingId: number): Stage[] {
    const { grid } = this
    const stages: Stage[] = []
    for (let i = 1; i < route.length; i++) {
      if (traversalOf(grid.kind[route[i]]) === 'breakable') {
        stages.push({ kind: 'wall', id: route[i], hp: grid.hp[route[i]], approachIdx: i - 1 })
      }
    }
    stages.push({ kind: 'building', id: buildingId, hp: grid.buildings[buildingId].hp, approachIdx: route.length - 1 })
    return stages
  }

  // Time each member needs to reach a free attack position of the first stage's target.
  private firstArrivals(members: readonly Troop[], route: Int32Array, stage: Stage): number[] {
    this.search.run(route[stage.approachIdx], members.map((m) => this.grid.cellOfPoint(m.x, m.y)))
    return members.map((m) => this.search.dist[this.grid.cellOfPoint(m.x, m.y)] / m.type.speed)
  }

  // Copies the free attack positions reachable from the approach cell into the seed buffer; returns how many.
  private freeSlots(world: World, stage: Stage, approach: number): number {
    const count = this.slots.search(stage.kind, stage.id, approach, (cell) => world.isSlotHeld(cell))
    this.seeds.set(this.slots.found.subarray(0, count))
    return count
  }

  private stageTime(world: World, members: readonly Troop[], arrivals: number[], route: Int32Array, stage: Stage): number {
    const approach = route[stage.approachIdx]
    const slots = this.freeSlots(world, stage, approach) // an approach cell that is a wall counts as free: it will be gone
    this.lastSlots = slots
    const byArrival = (a: number, b: number) => arrivals[a] - arrivals[b] || members[a].id - members[b].id
    const order = members.map((_, i) => i).sort(byArrival)
    // The r-th troop to arrive takes the r-th nearest free position, which costs it a few more steps.
    const hitters = order
      .slice(0, slots)
      .map((i, rank) => ({ arrival: arrivals[i] + this.slots.foundDepth[rank] / members[i].type.speed, dps: members[i].type.dps }))
      .sort((a, b) => a.arrival - b.arrival)
    return breakTime(
      stage.hp,
      hitters.map((h) => h.arrival),
      hitters.map((h) => h.dps),
      hitters.length,
    )
  }

  // Cost-weighted length of the route between two indices, in cells.
  private walkLength(route: Int32Array, fromIdx: number, toIdx: number): number {
    const { grid } = this
    let length = 0
    for (let i = fromIdx + 1; i <= toIdx; i++) {
      const dx = (route[i] % grid.width) - (route[i - 1] % grid.width)
      const dy = Math.floor(route[i] / grid.width) - Math.floor(route[i - 1] / grid.width)
      length += Math.sqrt(dx * dx + dy * dy) * moveCostOf(grid.kind[route[i]])
    }
    return length
  }
}
