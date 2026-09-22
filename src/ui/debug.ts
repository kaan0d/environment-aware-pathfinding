import { squadSettings } from '../sim/config'
import { traversalOf } from '../sim/environment'
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
  frozen: boolean // the candidates are the last ones scored before the group started hitting
  estimate: { current: number; since: number } | null
  lastFinished: { estimate: number; actual: number } | null
  lastPlanMs: number | null
}

export interface WallLevelInfo {
  level: number
  count: number
  hp: [number, number] // smallest and largest starting hit points among these walls
  hurt: number // how many are damaged right now
}

// What is shown without selecting anything: the squad settings and the walls of the map.
export interface DebugOverview {
  panelName: string
  squadRadius: number
  squadSizes: number[] | null // null when this panel's algorithm has no squads
  levels: WallLevelInfo[]
  hurt: { x: number; y: number; hp: number; maxHp: number }[] // most damaged first, at most 6
  hitsTaken: number
}

// Selection and the numbers behind the debug view. It reads the worlds and asks a private planner for
// candidates; it never changes a world.
export class Debug {
  enabled = false
  panel: 0 | 1 = 1
  troopId: number | null = null
  private readonly records = [new Map<number, PlanRecord>(), new Map<number, PlanRecord>()]
  private readonly finished = [new Map<number, { estimate: number; actual: number }>(), new Map<number, { estimate: number; actual: number }>()]
  private readonly frozen = new Map<string, { candidates: Evaluated[]; currentIndex: number }>()
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

  // With debug on something is always selected: the first active unit of the new panel, else of the classic one.
  // A click on another unit changes it; when the unit is done or the run restarts the next one is taken.
  ensureSelection(): void {
    if (!this.enabled) return
    const current = this.troopId === null ? undefined : this.worldOf(this.panel).troops[this.troopId]
    if (current?.isActive()) return
    for (const panel of [1, 0] as const) {
      const troop = this.worldOf(panel).troops.find((t) => t.isActive())
      if (troop !== undefined) return this.select(panel, troop.id)
    }
    this.troopId = null
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
    for (const key of [...this.frozen.keys()]) if (key.startsWith(`${panel}:`)) this.frozen.delete(key)
  }

  info(): DebugInfo | null {
    if (!this.enabled || this.troopId === null) return null
    const world = this.worldOf(this.panel)
    const troop = world.troops[this.troopId]
    if (troop === undefined || troop.state === 'notSpawned') return null
    const planner = world.planner instanceof SquadPlanner ? world.planner : null
    const members = planner?.squadOf(troop.id) ?? [troop]
    const committed = members.some((m) => m.state === 'attacking') // holds positions or is mid-hit, so new candidates would be misleading
    const key = `${this.panel}:${troop.id}`
    if (troop.isActive() && !committed) {
      const candidates = this.probe(this.panel, world).evaluate(world, members)
      this.frozen.set(key, { candidates, currentIndex: this.currentCandidate(troop, candidates) })
    }
    const shown = this.frozen.get(key) ?? { candidates: [], currentIndex: -1 }
    const record = this.records[this.panel].get(troop.id)
    return {
      troop,
      panelName: this.panel === 0 ? 'Classic' : 'New',
      candidates: shown.candidates,
      currentIndex: shown.currentIndex,
      members: members.length,
      committed,
      frozen: committed && shown.candidates.length > 0,
      estimate: record ? { current: record.estimate, since: record.since } : null,
      lastFinished: this.finished[this.panel].get(troop.id) ?? null,
      lastPlanMs: planner?.lastPlanMs ?? null,
    }
  }

  overview(): DebugOverview | null {
    if (!this.enabled) return null
    const world = this.worldOf(this.panel)
    const { grid } = world
    const byLevel = new Map<number, WallLevelInfo>()
    const hurt: DebugOverview['hurt'] = []
    for (let cell = 0; cell < grid.size; cell++) {
      if (traversalOf(grid.kind[cell]) !== 'breakable') continue
      const level = grid.wallLevel[cell]
      const info = byLevel.get(level) ?? { level, count: 0, hp: [Infinity, 0], hurt: 0 }
      info.count++
      info.hp = [Math.min(info.hp[0], grid.maxHp[cell]), Math.max(info.hp[1], grid.maxHp[cell])]
      if (grid.hp[cell] < grid.maxHp[cell]) {
        info.hurt++
        hurt.push({ x: cell % grid.width, y: Math.floor(cell / grid.width), hp: grid.hp[cell], maxHp: grid.maxHp[cell] })
      }
      byLevel.set(level, info)
    }
    hurt.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
    const planner = world.planner instanceof SquadPlanner ? world.planner : null
    return {
      panelName: this.panel === 0 ? 'Classic' : 'New',
      squadRadius: squadSettings.radius,
      squadSizes: planner === null ? null : this.squadSizes(world, planner),
      levels: [...byLevel.values()].sort((a, b) => a.level - b.level),
      hurt: hurt.slice(0, 6),
      hitsTaken: hurt.length,
    }
  }

  private squadSizes(world: World, planner: SquadPlanner): number[] {
    const seen = new Set<readonly Troop[]>()
    for (const troop of world.troops) {
      const squad = troop.isActive() ? planner.squadOf(troop.id) : undefined
      if (squad !== undefined) seen.add(squad)
    }
    return [...seen].map((s) => s.length).sort((a, b) => b - a)
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
