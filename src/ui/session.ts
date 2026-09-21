import { DT } from '../sim/config'
import { cloneScenario } from '../sim/scenario'
import type { Scenario } from '../sim/types'
import { World } from '../sim/world'

const MAX_FRAME_SECONDS = 0.25 // a long pause (background tab) never turns into a burst of steps
const SEED = 1

export interface Summary {
  classic: number
  fresh: number
  difference: number // classic minus new, seconds; positive when the new algorithm is faster
  percent: number
  winner: 'fresh' | 'classic' | 'tie'
}

// Runs the classic and the new algorithm on the same scenario in lockstep with a fixed time step.
// Rendering reads the two worlds and never writes to them; real time only decides how many steps run.
// The scenario (map plus recorded deploy events) is the single source both worlds are built from.
export class Session {
  scenario: Scenario
  classic!: World
  fresh!: World
  speed = 1
  playing = true
  groupBehavior = true // off: the new algorithm plans per troop
  private accumulator = 0
  private stepCount = 0
  private readonly beforeStep: Array<() => void> = []

  constructor(
    scenario: Scenario,
    private readonly seed = SEED,
  ) {
    this.scenario = cloneScenario(scenario)
    this.reset()
  }

  // Rebuilds both worlds from the scenario, deployments included, so a reset replays exactly.
  reset(): void {
    this.classic = new World(this.scenario, this.seed)
    this.fresh = new World(this.scenario, this.seed)
    this.fresh.setPlanner('squad', { group: this.groupBehavior })
    this.accumulator = 0
    this.stepCount = 0
  }

  load(scenario: Scenario): void {
    this.scenario = cloneScenario(scenario)
    this.reset()
  }

  // Called before every simulation step, so a view can remember positions for interpolation.
  onBeforeStep(listener: () => void): void {
    this.beforeStep.push(listener)
  }

  get time(): number {
    return this.stepCount * DT
  }

  // Fraction of the next step already elapsed, for drawing between two steps.
  get alpha(): number {
    return this.accumulator / DT
  }

  get finished(): boolean {
    return this.classic.finished && this.fresh.finished
  }

  // A cell can take a new troop when it is free in both worlds right now.
  canDeploy(x: number, y: number): boolean {
    return [this.classic, this.fresh].every((w) => w.grid.inBounds(x, y) && w.grid.isWalkable(w.grid.cellAt(x, y)))
  }

  // Drops one troop on each cell on the next step, in both worlds, and records it so a reset replays it.
  deployAt(cells: { x: number; y: number }[], troopType: string): void {
    for (const { x, y } of cells) {
      const event = { t: (this.stepCount + 1) * DT, troopType, x, y } // lands on the very next step, exactly as a replay will land it
      this.scenario.deployments.push(event)
      this.classic.addDeployment(event)
      this.fresh.addDeployment(event)
    }
  }

  clearUnits(): void {
    this.scenario.deployments = []
    this.reset()
  }

  advance(realSeconds: number): void {
    if (!this.playing) return
    this.accumulator += Math.min(realSeconds, MAX_FRAME_SECONDS) * this.speed
    while (this.accumulator >= DT && !this.finished) {
      for (const listener of this.beforeStep) listener()
      this.classic.step()
      this.fresh.step()
      this.stepCount++
      this.accumulator -= DT
    }
    if (this.finished) this.accumulator = 0
  }

  summary(): Summary | null {
    if (!this.finished) return null
    const classic = this.classic.finishTime!
    const fresh = this.fresh.finishTime!
    const difference = classic - fresh
    const percent = (Math.abs(difference) / Math.max(classic, fresh)) * 100
    const winner = Math.abs(difference) < DT / 2 ? 'tie' : difference > 0 ? 'fresh' : 'classic'
    return { classic, fresh, difference, percent, winner }
  }
}
