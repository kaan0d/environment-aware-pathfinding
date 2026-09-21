// Single source of truth for how a cell kind behaves; other sim code asks these queries, never the kind id.
export const CellKind = { empty: 0, wall: 1, building: 2 } as const

export type Traversal = 'blocked' | 'passable' | 'breakable'

export interface EnvironmentKind {
  traversal: Traversal
  moveCost: number // time multiplier on entering the cell
  targetable: boolean // can be attacked; free neighbors of it are attack positions
}

// Index matches CellKind values.
const REGISTRY: readonly EnvironmentKind[] = [
  { traversal: 'passable', moveCost: 1, targetable: false }, // empty
  { traversal: 'breakable', moveCost: 1, targetable: true }, // wall
  { traversal: 'blocked', moveCost: 1, targetable: true }, // building
]

export function traversalOf(kind: number): Traversal {
  return REGISTRY[kind].traversal
}

export function moveCostOf(kind: number): number {
  return REGISTRY[kind].moveCost
}

export function isTargetable(kind: number): boolean {
  return REGISTRY[kind].targetable
}
