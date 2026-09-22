import { RouteSearch } from '../ai/routeSearch'
import { MAX_ATTACK_POSITIONS, HYSTERESIS, SQUAD_UPDATE_HZ, squadSettings } from '../config'
import { traversalOf } from '../environment'
import type { Grid } from '../grid'
import type { Troop } from '../troop'
import type { Building, Plan, Planner } from '../types'
import type { World } from '../world'
import { isPlanValid } from './cost'
import { FlowField } from './flowField'
import { Rollout } from './rollout'
import { clusterSquads } from './squad'
import { TimeCostPlanner } from './timeCostPlanner'

// One way for a squad to reach a building: which goal, which walls may not be broken.
interface Spec {
  onlyBuilding: number // -1 lets any building be the goal
  noBreaks: boolean // every wall is off limits, except the ones in allowedBreaks
  allowedBreaks: number[]
  bannedCells: number[] // walls that may not be broken
}

interface Candidate {
  spec: Spec
  route: Int32Array // the leader's route
  target: number
  walls: number[] // the walls on that route, in order; every member has to break exactly these
}

const FREE: Spec = { onlyBuilding: -1, noBreaks: false, allowedBreaks: [], bannedCells: [] }

// What the squad brings to the fight, computed once per decision.
interface Strength {
  speed: number // mean speed, used to weigh walking against breaking in the field
  dps: number
  wallDps: Float64Array
  buildingDps: Float64Array
}

export interface Evaluated {
  candidate: Candidate
  total: number // rollout estimate, seconds from now until the target falls
  stageTimes: Float64Array
  stageSlots: Int32Array // free attack positions counted at each wall and finally the building
  readonly plans: Map<number, Plan | null> // one plan per member, null when a member cannot reach the goal this way; computed on first read
}

// Plans for groups of nearby troops: candidates come from flow fields, a rollout scores each, the fastest wins.
export class SquadPlanner implements Planner {
  readonly reconsidersOnChange = true
  lastPlanMs = 0 // duration of the latest squad decision, for the debug view
  private readonly solo: TimeCostPlanner
  private readonly field: FlowField
  private readonly rollout: Rollout
  private readonly search: RouteSearch
  private readonly wallDps: Float64Array
  private readonly banned: Uint8Array
  private readonly ring = new Int32Array(MAX_ATTACK_POSITIONS)
  private squadByTroop = new Map<number, Troop[]>()
  private squadKeys = new Set<string>()
  private notifiedKeys = new Set<string>() // the squads the world was last told about
  private clusteredAt = -Infinity
  private clusteredVersion = -1
  private decisions = new Map<number, Map<number, Plan | null>>() // keyed by squad leader id
  private decisionsVersion = -1

  constructor(
    private readonly grid: Grid,
    private readonly group: boolean,
  ) {
    this.solo = new TimeCostPlanner(grid)
    this.field = new FlowField(grid)
    this.rollout = new Rollout(grid)
    this.search = new RouteSearch(grid)
    this.wallDps = new Float64Array(grid.size)
    this.banned = new Uint8Array(grid.size)
  }

  plan(world: World, troopId: number): Plan | null {
    if (!this.group) return this.solo.plan(world, troopId)
    this.recluster(world, false)
    const squad = this.squadByTroop.get(troopId)
    if (squad === undefined) return this.solo.plan(world, troopId)
    if (this.decisionsVersion !== world.version) {
      this.decisions.clear()
      this.decisionsVersion = world.version
    }
    let plans = this.decisions.get(squad[0].id)
    if (plans === undefined) {
      const start = performance.now()
      plans = this.decide(world, squad)
      this.lastPlanMs = performance.now() - start
      this.decisions.set(squad[0].id, plans)
    }
    return plans.get(troopId) ?? this.solo.plan(world, troopId)
  }

  // Re-forms squads at most SQUAD_UPDATE_HZ times a second; troops that join or leave a squad get a fresh decision.
  onStep(world: World): void {
    if (!this.group || world.time - this.clusteredAt < 1 / SQUAD_UPDATE_HZ) return
    this.recluster(world, true)
    const changed = [...this.squadKeys].some((key) => !this.notifiedKeys.has(key))
    const first = this.notifiedKeys.size === 0
    this.notifiedKeys = this.squadKeys
    if (changed && !first) world.notifyMapChanged()
  }

  // The squad a troop belongs to right now, for the debug view.
  squadOf(troopId: number): readonly Troop[] | undefined {
    return this.squadByTroop.get(troopId)
  }

  // Scores every candidate for the given troops (the leader is the first) and returns them best first. Each entry's
  // plans are a full flow field, so they are computed lazily on first read: decide() only ever reads the winner's,
  // the debug view never reads any, only the oracle test wants every candidate's.
  evaluate(world: World, members: readonly Troop[]): Evaluated[] {
    const strength = this.strengthOf(members, world.stackAttackers)
    const scored = this.candidates(members[0], strength).map((candidate) => {
      const { total, stageTimes, stageSlots } = this.rollout.run(world, members, candidate.route, candidate.target)
      let plans: Map<number, Plan | null> | undefined
      const entry = { candidate, total, stageTimes, stageSlots }
      return Object.defineProperty(entry, 'plans', {
        enumerable: true,
        get: () => (plans ??= this.plansFor(entry, members)),
      }) as Evaluated
    })
    scored.sort((a, b) => a.total - b.total)
    void scored[0]?.plans // eager for the winner: caller may read it after the world (and these troops) moved on
    return scored
  }

  private recluster(world: World, force: boolean): void {
    if (!force && this.clusteredVersion === world.version) return
    this.clusteredAt = world.time
    this.clusteredVersion = world.version
    const squads = clusterSquads(world.troops.filter((t) => t.isActive()), squadSettings.radius)
    this.squadByTroop.clear()
    for (const squad of squads) for (const troop of squad) this.squadByTroop.set(troop.id, squad)
    this.squadKeys = new Set(squads.map((squad) => squad.map((t) => t.id).join(',')))
  }

  private decide(world: World, squad: readonly Troop[]): Map<number, Plan | null> {
    const plans = new Map<number, Plan | null>()
    const committed = squad.some((t) => t.state === 'attacking') // whoever started hitting finishes; the rest keep their plans
    const best = committed ? undefined : this.evaluate(world, squad)[0]
    const keep = best === undefined || this.currentIsGoodEnough(world, squad, best.total)
    for (const troop of squad) {
      const current = isPlanValid(this.grid, troop) ? troop.plan : null
      plans.set(troop.id, keep && current !== null ? current : (best?.plans.get(troop.id) ?? null))
    }
    return plans
  }

  // The leader's present plan is kept unless the best candidate is at least HYSTERESIS faster.
  private currentIsGoodEnough(world: World, squad: readonly Troop[], bestTotal: number): boolean {
    const leader = squad[0]
    if (!isPlanValid(this.grid, leader)) return false
    const plan = leader.plan!
    const route = plan.route.subarray(Math.max(0, leader.routeIdx - 1))
    const current = this.rollout.run(world, squad, route, plan.targetId).total
    return !(bestTotal < current * (1 - HYSTERESIS))
  }

  // Damage a squad brings to each wall and building: its strongest troops, as many as there are attack positions.
  private strengthOf(members: readonly Troop[], stacking: boolean): Strength {
    const { grid, wallDps, ring } = this
    const sorted = members.map((t) => t.type.dps).sort((a, b) => b - a)
    const prefix = [0]
    for (const dps of sorted) prefix.push(prefix[prefix.length - 1] + dps)
    const damageWith = (slots: number) => prefix[stacking ? sorted.length : Math.min(sorted.length, Math.max(1, slots))]
    wallDps.fill(0)
    for (let cell = 0; cell < grid.size; cell++) {
      if (traversalOf(grid.kind[cell]) === 'breakable') wallDps[cell] = damageWith(this.sideSlots(cell))
    }
    const buildingDps = new Float64Array(grid.buildings.length)
    for (const building of grid.buildings) {
      buildingDps[building.id] = damageWith(grid.attackPositions('building', building.id, ring))
    }
    const speed = Math.min(...members.map((t) => t.type.speed))
    return { speed, dps: sorted[0], wallDps, buildingDps }
  }

  // Free cells on the best side of the cell (west, east, north or south line of three): how many attackers a squad
  // can bring at once when it comes from one side. Counting all eight neighbors would credit a wall in a row with
  // the cells on its far side too and make it look twice as cheap to break.
  private sideSlots(cell: number): number {
    const { grid } = this
    const x = cell % grid.width
    const y = (cell - x) / grid.width
    const free = (cx: number, cy: number) => (grid.inBounds(cx, cy) && grid.isWalkable(grid.cellAt(cx, cy)) ? 1 : 0)
    let west = 0
    let east = 0
    let north = 0
    let south = 0
    for (let d = -1; d <= 1; d++) {
      west += free(x - 1, y + d)
      east += free(x + 1, y + d)
      north += free(x + d, y - 1)
      south += free(x + d, y + 1)
    }
    return Math.max(west, east, north, south)
  }

  // Up to MAX_CANDIDATES distinct routes from the leader: the best free route, the full detour, other buildings, banned walls.
  private candidates(leader: Troop, strength: Strength): Candidate[] {
    const { grid } = this
    const start = grid.cellOfPoint(leader.x, leader.y)
    const found: Candidate[] = []
    const seen = new Set<string>()
    const add = (spec: Spec) => {
      if (found.length >= squadSettings.maxCandidates) return
      this.runField(spec, strength, [start])
      if (this.field.value[start] === Infinity) return
      const route = this.field.routeFrom(start)
      const target = this.field.target[route[route.length - 1]]
      const walls = Array.from(route).filter((c) => traversalOf(grid.kind[c]) === 'breakable')
      const key = `${target}:${walls.join(',')}`
      if (seen.has(key)) return
      seen.add(key)
      found.push({ spec, route, target, walls })
    }
    add({ ...FREE, noBreaks: false })
    add({ ...FREE, noBreaks: true })
    const others = grid.buildings
      .filter((b) => b.alive && b.id !== found[0]?.target)
      .sort((a, b) => this.distanceSq(leader, a) - this.distanceSq(leader, b) || a.id - b.id)
    for (const building of others.slice(0, squadSettings.maxBuildingCandidates - 1)) {
      add({ ...FREE, onlyBuilding: building.id })
    }
    for (const cell of found[0]?.walls ?? []) add({ ...FREE, bannedCells: [cell] })
    return found
  }

  private distanceSq(troop: Troop, building: Building): number {
    const dx = building.x + building.w / 2 - troop.x
    const dy = building.y + building.h / 2 - troop.y
    return dx * dx + dy * dy
  }

  // finalCell, when given, is the only attack position the field may end at.
  private runField(spec: Spec, strength: Strength, settle: readonly number[], finalCell = -1): void {
    const { grid, banned } = this
    banned.fill(0)
    if (spec.noBreaks) {
      for (let cell = 0; cell < grid.size; cell++) if (traversalOf(grid.kind[cell]) === 'breakable') banned[cell] = 1
    }
    for (const cell of spec.allowedBreaks) banned[cell] = 0
    for (const cell of spec.bannedCells) banned[cell] = 1
    this.field.compute(strength.speed, strength.dps, finalCell < 0 ? null : (cell) => cell === finalCell, {
      wallDps: strength.wallDps,
      buildingDps: strength.buildingDps,
      banned,
      onlyBuilding: spec.onlyBuilding,
      settle,
    })
  }

  // Every member walks (today's walls only, none of them broken yet) to the nearest cell of the leader's own
  // route, then follows that route exactly from there - same walls, same building approach for everyone, so the
  // squad acts as one instead of a member finding its own cheaper way that the rollout never priced.
  private plansFor(entry: Omit<Evaluated, 'plans'>, members: readonly Troop[]): Map<number, Plan | null> {
    const { grid, search } = this
    const { target, route } = entry.candidate
    const routeCells = Array.from(route) // settle wants a plain array; same list for every member below
    const plans = new Map<number, Plan | null>()
    // Members that share a start cell (common: a group dropped on one spawn point) share one search and one
    // Plan object - nothing downstream mutates a troop's plan in place, each troop keeps its own routeIdx.
    const byStart = new Map<number, Plan | null>()
    for (const member of members) {
      const start = grid.cellOfPoint(member.x, member.y)
      const cached = byStart.get(start)
      if (cached !== undefined) {
        plans.set(member.id, cached)
        continue
      }
      search.run(start, routeCells) // early-exits once every route cell is settled, instead of scanning the whole grid
      let joinIdx = 0
      let joinDist = search.dist[route[0]]
      for (let i = 1; i < route.length; i++) {
        const d = search.dist[route[i]]
        if (d < joinDist) {
          joinDist = d
          joinIdx = i
        }
      }
      if (joinDist === Infinity) {
        byStart.set(start, null)
        plans.set(member.id, null)
        continue
      }
      const walkIn = search.routeTo(route[joinIdx])
      const full = new Int32Array(walkIn.length + (route.length - joinIdx - 1))
      full.set(walkIn)
      full.set(route.subarray(joinIdx + 1), walkIn.length)
      const plan: Plan = {
        targetKind: 'building',
        targetId: target,
        route: full,
        breakCells: full.filter((cell) => traversalOf(grid.kind[cell]) === 'breakable'),
        estTotalTime: entry.total,
        stageTimes: entry.stageTimes,
      }
      byStart.set(start, plan)
      plans.set(member.id, plan)
    }
    return plans
  }
}
