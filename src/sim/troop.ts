import type { Plan, TargetKind, TroopState, TroopType } from './types'

export class Troop {
  state: TroopState = 'notSpawned'
  x = 0 // position in cell units, cell centers sit at +0.5
  y = 0
  plan: Plan | null = null
  routeIdx = 0 // next route cell to walk to
  attackKind: TargetKind | null = null // what the troop hits or waits to hit
  attackId = -1
  attackCell = -1 // slot cell held while attacking, -1 otherwise
  distance = 0
  planChanges = 0 // plans assigned after the first one
  wallsDestroyed = 0
  buildingsDestroyed = 0
  finishTime: number | null = null

  constructor(
    readonly id: number,
    readonly type: TroopType,
    readonly spawnTime: number,
    readonly spawnX: number,
    readonly spawnY: number,
  ) {}

  setPlan(plan: Plan | null): void {
    this.plan = plan
    this.routeIdx = 0
    this.attackKind = null
    this.attackId = -1
  }

  isActive(): boolean {
    return this.state === 'moving' || this.state === 'waiting' || this.state === 'attacking'
  }
}
