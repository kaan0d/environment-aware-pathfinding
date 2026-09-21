import { SquadPlanner, type Evaluated } from '../sim/planner/squadPlanner'
import type { Troop } from '../sim/troop'
import type { World } from '../sim/world'
import type { Session } from './session'

interface PlanRecord {
  plan: object
  since: number // simulated time the plan was adopted
  estimate: number
  target: number
}

export interface DebugInfo {
  troop: Troop
  panelName: string
  candidates: Evaluated[] // best first; empty when the troop has nowhere to go
  currentIndex: number // candidate the troop follows now, -1 when none matches
  members: number
  committed: boolean // someone in the group already hits its target, so the group keeps its plans
  estimate: { current: number; since: number } | null
  lastFinished: { estimate: number; actual: number } | null
  lastPlanMs: number | null
}

// Selection and the numbers behind the debug view. It reads the worlds and asks a private planner for
// candidates; it never changes a world.
export class Debug {
  enabled = false
  panel: 0 | 1 = 1
  troopId: number | null = null
  private readonly records = [new Map<number, PlanRecord>(), new Map<number, PlanRecord>()]
  private readonly finished = [new Map<number, { estimate: number; actual: number }>(), new Map<number, { estimate: number; actual: number }>()]
  private readonly seenEvents = [0, 0]
  private readonly probes: [SquadPlanner | null, SquadPlanner | null] = [null, null]
  private probedWorlds: [World | null, World | null] = [null, null]
  private readonly knownWorlds: [World | null, World | null] = [null, null]

  constructor(private readonly session: Session) {}

  select(panel: 0 | 1, troopId: number | null): void {
    this.panel = panel
    this.troopId = troopId
  }

  worldOf(panel: 0 | 1): World {
    return panel === 0 ? this.session.classic : this.session.fresh
  }

  // Keeps track of when each troop adopted its plan and how long its building really took.
  observe(): void {
    for (const panel of [0, 1] as const) {
      const world = this.worldOf(panel)
      if (this.knownWorlds[panel] !== world) {
        this.forget(panel)
        this.knownWorlds[panel] = world
      }
      for (const troop of world.troops) {
        if (troop.plan === null || !troop.isActive() || troop.plan.targetKind !== 'building') continue
        const record = this.records[panel].get(troop.id)
        if (record?.plan !== troop.plan) {
          this.records[panel].set(troop.id, { plan: troop.plan, since: world.time, estimate: troop.plan.estTotalTime, target: troop.plan.targetId })
        }
      }
      for (; this.seenEvents[panel] < world.events.length; this.seenEvents[panel]++) {
        const event = world.events[this.seenEvents[panel]]
        if (event.type !== 'buildingDestroyed') continue
        for (const [id, record] of this.records[panel]) {
          if (record.target === event.buildingId) this.finished[panel].set(id, { estimate: record.estimate, actual: event.t - record.since })
        }
      }
    }
  }

  // Called after a reset: the worlds are new objects.
  forget(panel: 0 | 1): void {
    this.records[panel].clear()
    this.finished[panel].clear()
    this.seenEvents[panel] = 0
  }

  info(): DebugInfo | null {
    if (!this.enabled || this.troopId === null) return null
    const world = this.worldOf(this.panel)
    const troop = world.troops[this.troopId]
    if (troop === undefined || troop.state === 'notSpawned') return null
    const planner = world.planner instanceof SquadPlanner ? world.planner : null
    const members = planner?.squadOf(troop.id) ?? [troop]
    const committed = members.some((m) => m.state === 'attacking') // holds attack positions, so candidates would be misleading
    const candidates = troop.isActive() && !committed ? this.probe(this.panel, world).evaluate(world, members) : []
    const record = this.records[this.panel].get(troop.id)
    return {
      troop,
      panelName: this.panel === 0 ? 'Classic' : 'New',
      candidates,
      currentIndex: this.currentCandidate(troop, candidates),
      members: members.length,
      committed,
      estimate: record ? { current: record.estimate, since: record.since } : null,
      lastFinished: this.finished[this.panel].get(troop.id) ?? null,
      lastPlanMs: planner?.lastPlanMs ?? null,
    }
  }

  // A private planner per world, so asking for candidates never disturbs the planner that runs the panel.
  private probe(panel: 0 | 1, world: World): SquadPlanner {
    if (this.probedWorlds[panel] !== world || this.probes[panel] === null) {
      this.probes[panel] = new SquadPlanner(world.grid, true)
      this.probedWorlds[panel] = world
    }
    return this.probes[panel]!
  }

  private currentCandidate(troop: Troop, candidates: Evaluated[]): number {
    const plan = troop.plan
    if (plan === null) return -1
    const walls = Array.from(plan.route.subarray(Math.max(0, troop.routeIdx - 1))).filter((cell) => plan.breakCells.includes(cell))
    return candidates.findIndex((c) => c.candidate.target === plan.targetId && c.candidate.walls.length === walls.length && c.candidate.walls.every((w) => walls.includes(w)))
  }
}
