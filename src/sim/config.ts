import type { BuildingType, TroopType } from './types'

export const DT = 1 / 30 // seconds per simulation step
export const GRID_WIDTH = 40 // default map size for the editor
export const GRID_HEIGHT = 28

export const WALL_HP = [100, 250, 500, 1000, 2000] // index is wall level - 1

export const TROOP_TYPES: Record<string, TroopType> = {
  fast: { id: 'fast', name: 'Hızlı-Zayıf', speed: 4, dps: 20, hp: 60 },
  balanced: { id: 'balanced', name: 'Dengeli', speed: 2.5, dps: 50, hp: 200 },
  heavy: { id: 'heavy', name: 'Ağır-Güçlü', speed: 1.5, dps: 150, hp: 600 },
}

export const BUILDING_TYPES: Record<string, BuildingType> = {
  depot: { id: 'depot', name: 'Depo', w: 1, h: 1, hp: 300 },
  tower: { id: 'tower', name: 'Kule', w: 2, h: 2, hp: 800 },
  hq: { id: 'hq', name: 'Ana bina', w: 3, h: 3, hp: 2000 },
}

// Ring around the largest footprint; sizes scratch buffers for attack positions.
export const MAX_ATTACK_POSITIONS = Math.max(
  ...Object.values(BUILDING_TYPES).map((b) => 2 * (b.w + b.h) + 4),
)
