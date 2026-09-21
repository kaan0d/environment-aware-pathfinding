import type { World } from './world'

export type WallLevel = 1 | 2 | 3 | 4 | 5
export type TargetKind = 'building' | 'wall'
export type TroopState = 'notSpawned' | 'moving' | 'waiting' | 'attacking' | 'done'

export interface TroopType {
  id: string
  name: string
  speed: number // cells per second
  dps: number
  hp: number
}

export interface BuildingType {
  id: string
  name: string
  w: number
  h: number
  hp: number
}

export interface DeployEvent {
  t: number
  troopType: string
  x: number
  y: number
  count?: number
}

export interface Scenario {
  name: string
  width: number
  height: number
  wallHpScale?: number // multiplies the hit points of every wall that has no explicit hp
  stackAttackers?: boolean // true (default): any number of troops may attack from the same cell; false: one attacker per attack position
  walls: { x: number; y: number; level: WallLevel; hp?: number }[]
  buildings: { type: string; x: number; y: number; hp?: number }[]
  spawns: { x: number; y: number }[] // allowed deploy points for the editor; the sim does not read them
  deployments: DeployEvent[]
}

export interface Building {
  id: number
  type: BuildingType
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
}

// route runs from the troop's cell to an attack position of the target; wall cells on it are broken in order.
export interface Plan {
  targetKind: TargetKind // wall targetId is a cell index, building targetId is a building id
  targetId: number
  route: Int32Array // cell indices
  breakCells: Int32Array // wall cells on the route, informational for render and UI
  estTotalTime: number
  stageTimes?: Float64Array // squad plans: seconds from now until each wall on the route and finally the building fall
}

export interface Planner {
  // Best plan now; a planner may return the troop's current plan object to keep it.
  plan(world: World, troopId: number): Plan | null
  // Set when a destroyed wall or building can improve other troops' plans, so the world offers them a re-plan.
  readonly reconsidersOnChange?: boolean
  // Called once per world step after deploys, for planners that keep their own state such as squads.
  onStep?(world: World): void
}

export type SimEvent =
  | { t: number; type: 'deploy'; troopId: number; troopType: string; x: number; y: number }
  | { t: number; type: 'wallDestroyed'; cell: number; troopId: number }
  | { t: number; type: 'buildingDestroyed'; buildingId: number; troopId: number }
  | { t: number; type: 'troopFinished'; troopId: number }

export interface TroopStats {
  id: number
  finishTime: number | null
  distance: number
  wallsDestroyed: number
  buildingsDestroyed: number
}

export interface WorldStats {
  finishTime: number | null // set once every building is destroyed
  distance: number
  wallsDestroyed: number
  buildingsDestroyed: number
  troops: TroopStats[]
}
