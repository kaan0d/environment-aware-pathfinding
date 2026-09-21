import { ClassicPlanner } from './ai/classic'
import { BUILDING_TYPES, DT, TROOP_TYPES } from './config'
import { moveCostOf, traversalOf } from './environment'
import { Grid } from './grid'
import { TimeCostPlanner } from './planner/timeCostPlanner'
import { mulberry32 } from './rng'
import { Troop } from './troop'
import type { DeployEvent, Plan, Planner, Scenario, SimEvent, TargetKind, WorldStats } from './types'

// Deterministic fixed-step simulation: same scenario and seed always yield the same events and stats.
export class World {
  readonly grid: Grid
  readonly troops: Troop[] = []
  readonly events: SimEvent[] = []
  readonly rng: () => number
  planner: Planner
  finishTime: number | null = null // set the step the last building falls
  private readonly slotHolder: Int32Array // troop id attacking from each cell, -1 when free
  private tick = 0
  private nextSpawn = 0
  private aliveBuildings = 0

  constructor(scenario: Scenario, seed = 1) {
    this.grid = new Grid(scenario.width, scenario.height)
    for (const wall of scenario.walls) this.grid.placeWall(wall.x, wall.y, wall.level)
    for (const b of scenario.buildings) this.grid.placeBuilding(lookup(BUILDING_TYPES, b.type, 'building type'), b.x, b.y)
    this.aliveBuildings = this.grid.buildings.length
    this.slotHolder = new Int32Array(this.grid.size).fill(-1)
    this.rng = mulberry32(seed)
    this.planner = new ClassicPlanner(this.grid)
    this.createTroops(scenario.deployments)
  }

  get time(): number {
    return this.tick * DT
  }

  get finished(): boolean {
    return this.finishTime !== null
  }

  step(): void {
    if (this.finished) return
    this.tick++
    this.spawnDue()
    for (let i = 0; i < this.troops.length; i++) this.stepTroop(this.troops[i])
    if (this.aliveBuildings === 0) this.finish()
  }

  // Runs steps until every building is destroyed or maxSeconds of simulated time pass.
  run(maxSeconds: number): void {
    while (!this.finished && this.time < maxSeconds) this.step()
  }

  // Swaps the planner; call before the first step so the whole run uses one algorithm.
  setPlanner(name: 'classic' | 'timecost'): void {
    this.planner = name === 'classic' ? new ClassicPlanner(this.grid) : new TimeCostPlanner(this.grid)
  }

  // Editor hook: call after changing the grid so waiting and walking troops can pick a better plan.
  notifyMapChanged(): void {
    if (!this.planner.reconsidersOnChange) return
    for (const troop of this.troops) if (this.canReconsider(troop)) this.reconsider(troop)
  }

  // Overrides the troop's plan; before spawn the plan is kept and used instead of planning.
  forcePlan(troopId: number, plan: Plan): void {
    const troop = this.troops[troopId]
    if (troop.plan !== null) troop.planChanges++
    this.releaseSlot(troop)
    troop.setPlan(plan)
    if (!troop.isActive()) return
    troop.state = 'moving'
    this.alignRoute(troop)
  }

  // True when no other troop attacks from, or is heading to, this cell.
  slotAvailable(cell: number, troopId: number): boolean {
    const holder = this.slotHolder[cell]
    if (holder !== -1 && holder !== troopId) return false
    for (let i = 0; i < this.troops.length; i++) {
      const other = this.troops[i]
      const headingHere = (other.state === 'moving' || other.state === 'waiting') && other.plan !== null
      if (other.id !== troopId && headingHere && other.plan!.route.at(-1) === cell) return false
    }
    return true
  }

  stats(): WorldStats {
    const troops = this.troops.map((t) => ({
      id: t.id,
      finishTime: t.finishTime,
      distance: t.distance,
      wallsDestroyed: t.wallsDestroyed,
      buildingsDestroyed: t.buildingsDestroyed,
    }))
    return {
      finishTime: this.finishTime,
      distance: sum(troops.map((t) => t.distance)),
      wallsDestroyed: sum(troops.map((t) => t.wallsDestroyed)),
      buildingsDestroyed: sum(troops.map((t) => t.buildingsDestroyed)),
      troops,
    }
  }

  private createTroops(deployments: DeployEvent[]): void {
    const byTime = [...deployments].sort((a, b) => a.t - b.t) // stable, so ids follow scenario order per time
    for (const deploy of byTime) {
      const type = lookup(TROOP_TYPES, deploy.troopType, 'troop type')
      if (!this.grid.inBounds(deploy.x, deploy.y) || !this.grid.isWalkable(this.grid.cellAt(deploy.x, deploy.y))) {
        throw new Error(`deploy point (${deploy.x},${deploy.y}) is not free`)
      }
      for (let n = 0; n < (deploy.count ?? 1); n++) {
        this.troops.push(new Troop(this.troops.length, type, deploy.t, deploy.x, deploy.y))
      }
    }
  }

  private spawnDue(): void {
    while (this.nextSpawn < this.troops.length && this.troops[this.nextSpawn].spawnTime <= this.time) {
      this.spawn(this.troops[this.nextSpawn++])
    }
  }

  private spawn(troop: Troop): void {
    troop.state = 'moving'
    troop.x = troop.spawnX + 0.5
    troop.y = troop.spawnY + 0.5
    this.log({ t: this.time, type: 'deploy', troopId: troop.id, troopType: troop.type.id, x: troop.spawnX, y: troop.spawnY })
    if (troop.plan === null) this.replan(troop)
    else this.alignRoute(troop)
  }

  private stepTroop(troop: Troop): void {
    if (troop.state === 'moving') this.advance(troop)
    else if (troop.state === 'waiting') this.tryStartAttack(troop)
    else if (troop.state === 'attacking') this.strike(troop)
  }

  // Walks the route; stops to attack when the next cell is a wall or the route ends.
  private advance(troop: Troop): void {
    const plan = troop.plan
    if (plan === null) return this.replan(troop)
    let budget = troop.type.speed * DT
    for (;;) {
      if (troop.routeIdx >= plan.route.length) return this.beginAttack(troop, plan.targetKind, plan.targetId)
      const next = plan.route[troop.routeIdx]
      const traversal = traversalOf(this.grid.kind[next])
      if (traversal === 'blocked') return this.replan(troop)
      if (traversal === 'breakable') return this.beginAttack(troop, 'wall', next)
      if (budget <= 0) return
      const dx = (next % this.grid.width) + 0.5 - troop.x
      const dy = Math.floor(next / this.grid.width) + 0.5 - troop.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      const moveCost = moveCostOf(this.grid.kind[next])
      const stepCost = distance * moveCost // budget is spent in cost-weighted distance, so slow ground uses more of it
      if (stepCost > budget) {
        troop.x += (dx / stepCost) * budget
        troop.y += (dy / stepCost) * budget
        troop.distance += budget / moveCost
        return
      }
      troop.x += dx
      troop.y += dy
      troop.distance += distance
      budget -= stepCost
      troop.routeIdx++
    }
  }

  // Skips a route start that is the troop's own cell, so it never backtracks to that cell's center.
  private alignRoute(troop: Troop): void {
    const route = troop.plan!.route
    if (route.length > 0 && route[0] === this.grid.cellOfPoint(troop.x, troop.y)) troop.routeIdx = 1
  }

  private beginAttack(troop: Troop, kind: TargetKind, id: number): void {
    troop.attackKind = kind
    troop.attackId = id
    troop.state = 'waiting'
    this.tryStartAttack(troop)
  }

  // One attacker per cell: the troop waits until the cell it stands on is free.
  private tryStartAttack(troop: Troop): void {
    const cell = this.grid.cellOfPoint(troop.x, troop.y)
    const holder = this.slotHolder[cell]
    if (holder !== -1 && holder !== troop.id) return
    this.slotHolder[cell] = troop.id
    troop.attackCell = cell
    troop.state = 'attacking'
  }

  private strike(troop: Troop): void {
    const damage = troop.type.dps * DT
    if (troop.attackKind === 'wall') this.hitWall(troop, damage)
    else this.hitBuilding(troop, damage)
  }

  private hitWall(troop: Troop, damage: number): void {
    const cell = troop.attackId
    this.grid.hp[cell] -= damage
    if (this.grid.hp[cell] > 0) return
    this.grid.destroyWall(cell)
    troop.wallsDestroyed++
    this.log({ t: this.time, type: 'wallDestroyed', cell, troopId: troop.id })
    this.onTargetDestroyed('wall', cell)
  }

  private hitBuilding(troop: Troop, damage: number): void {
    const building = this.grid.buildings[troop.attackId]
    building.hp -= damage
    if (building.hp > 0) return
    this.grid.destroyBuilding(building.id)
    this.aliveBuildings--
    troop.buildingsDestroyed++
    this.log({ t: this.time, type: 'buildingDestroyed', buildingId: building.id, troopId: troop.id })
    this.onTargetDestroyed('building', building.id)
  }

  // Frees every attacker of the dead target first, so replanning sees the freed slots.
  private onTargetDestroyed(kind: TargetKind, id: number): void {
    for (const troop of this.troops) {
      const attackingIt =
        (troop.state === 'attacking' || troop.state === 'waiting') && troop.attackKind === kind && troop.attackId === id
      if (!attackingIt) continue
      this.releaseSlot(troop)
      troop.state = 'moving'
      troop.attackKind = null
      troop.attackId = -1
    }
    for (const troop of this.troops) {
      const lostTarget = troop.plan !== null && troop.plan.targetKind === kind && troop.plan.targetId === id
      if (lostTarget && troop.state === 'notSpawned') troop.setPlan(null)
      else if (lostTarget && troop.isActive()) this.replan(troop)
      else if (this.planner.reconsidersOnChange && this.canReconsider(troop)) this.reconsider(troop)
    }
  }

  private replan(troop: Troop): void {
    const plan = this.planner.plan(this, troop.id)
    if (plan === null) this.finishTroop(troop)
    else this.forcePlan(troop.id, plan)
  }

  // Only troops that have not started hitting anything may change their mind.
  private canReconsider(troop: Troop): boolean {
    return troop.plan !== null && (troop.state === 'moving' || troop.state === 'waiting')
  }

  // Unlike replan, a missing or unchanged answer keeps the current plan.
  private reconsider(troop: Troop): void {
    const plan = this.planner.plan(this, troop.id)
    if (plan !== null && plan !== troop.plan) this.forcePlan(troop.id, plan)
  }

  private releaseSlot(troop: Troop): void {
    if (troop.attackCell < 0) return
    this.slotHolder[troop.attackCell] = -1
    troop.attackCell = -1
  }

  private finishTroop(troop: Troop): void {
    if (troop.state === 'done') return
    this.releaseSlot(troop)
    troop.state = 'done'
    troop.finishTime = this.time
    this.log({ t: this.time, type: 'troopFinished', troopId: troop.id })
  }

  private finish(): void {
    for (const troop of this.troops) if (troop.isActive()) this.finishTroop(troop)
    this.finishTime = this.time
  }

  private log(event: SimEvent): void {
    this.events.push(event)
  }
}

function lookup<T>(table: Record<string, T>, id: string, what: string): T {
  if (!Object.hasOwn(table, id)) throw new Error(`unknown ${what}: ${id}`)
  return table[id]
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}
