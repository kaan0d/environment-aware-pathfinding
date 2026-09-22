import { BUILDING_TYPES } from '../sim/config'
import type { WallLevel } from '../sim/types'
import { buildingIndexAt, erase, paintWall, placeBuilding, scatterCells, selectAt, setHp, toggleSpawn, type Selection } from './editorActions'
import type { Session } from './session'

export type Tool = 'place' | 'wall' | 'erase' | 'spawn' | 'select'

export interface Preview {
  x: number
  y: number
  w: number
  h: number
  valid: boolean
}

// Everything the panels draw on top of the world for the editor.
export interface EditorOverlay {
  spawns: { x: number; y: number }[]
  preview: Preview | null
  selection: { x: number; y: number; w: number; h: number } | null
  flashes: { x: number; y: number; age: number }[]
}

const FLASH_SECONDS = 0.45

// The one place that holds the editor state (active tool, options, selection).
// Pointer events arrive as grid cells; the only things touched are the session scenario and its deploy list.
export class Editor {
  tool: Tool = 'select'
  wallLevel: WallLevel = 1 // Draw wall tool: dragging paints a run at this level
  troopType = 'balanced' // last unit type: used for balance editing and "Add at spawn points"
  dropCount = 1
  selection: Selection | null = null
  private hover: { x: number; y: number } | null = null
  private dragging = false
  private lastPainted = ''
  private flashes: { x: number; y: number; age: number }[] = []

  constructor(
    private readonly session: Session,
    private readonly onChange: () => void, // sidebar refresh after the scenario changed
  ) {}

  pointer(cell: { x: number; y: number } | null, phase: 'down' | 'move' | 'up'): void {
    this.hover = cell
    if (phase === 'up') return void (this.dragging = false)
    if (cell === null) return
    const key = `${cell.x},${cell.y}`
    if (phase === 'move' && !(this.dragging && (this.tool === 'wall' || this.tool === 'erase'))) return
    if (key === this.lastPainted && phase === 'move') return
    if (phase === 'down') this.dragging = true
    this.lastPainted = key
    this.apply(cell.x, cell.y)
  }

  deployAtSpawns(): void {
    for (const spawn of this.session.scenario.spawns) this.dropAt(spawn.x, spawn.y, this.dropCount)
  }

  // Called by the placement context menu (tool 'place' opens it instead of painting directly on click).
  placeBuildingAt(x: number, y: number, type: string): void {
    if (placeBuilding(this.session.scenario, type, x, y)) this.edited()
    else this.flash(x, y)
  }

  placeUnitAt(x: number, y: number, troopType: string): void {
    this.troopType = troopType
    this.dropAt(x, y, this.dropCount)
  }

  setSelectedHp(hp: number): boolean {
    if (this.selection === null || !setHp(this.session.scenario, this.selection, hp)) return false
    this.edited()
    return true
  }

  // Ages the red flashes shown for refused clicks.
  tick(seconds: number): void {
    this.flashes = this.flashes.filter((f) => (f.age += seconds) < FLASH_SECONDS)
  }

  overlay(): EditorOverlay {
    const s = this.session.scenario
    return { spawns: s.spawns, preview: this.preview(), selection: this.selectionRect(), flashes: this.flashes }
  }

  private apply(x: number, y: number): void {
    if (this.tool === 'place') return // the context menu in main.ts handles this tool, not a plain click
    const s = this.session.scenario
    let done = false
    if (this.tool === 'wall') done = paintWall(s, x, y, this.wallLevel)
    else if (this.tool === 'erase') done = erase(s, x, y)
    else if (this.tool === 'spawn') done = toggleSpawn(s, x, y)
    else return void this.select(x, y) // tool === 'select'
    if (done) this.edited()
    else if (this.tool !== 'wall') this.flash(x, y) // painting over the same level while dragging is not an error
  }

  private dropAt(x: number, y: number, count: number): void {
    if (!this.session.canDeploy(x, y)) return this.flash(x, y)
    const cells = scatterCells(this.session.scenario, x, y, count, (cx, cy) => this.session.canDeploy(cx, cy))
    this.session.deployAt(cells, this.troopType)
    this.onChange()
  }

  private select(x: number, y: number): void {
    this.selection = selectAt(this.session.scenario, x, y)
    this.onChange()
  }

  private edited(): void {
    this.selection = null
    this.session.reset()
    this.onChange()
  }

  private flash(x: number, y: number): void {
    this.flashes.push({ x, y, age: 0 })
  }

  private preview(): Preview | null {
    if (this.hover === null) return null
    const { x, y } = this.hover
    const s = this.session.scenario
    if (this.tool === 'erase') return { x, y, w: 1, h: 1, valid: s.walls.some((w) => w.x === x && w.y === y) || buildingIndexAt(s, x, y) >= 0 }
    return { x, y, w: 1, h: 1, valid: true }
  }

  private selectionRect(): EditorOverlay['selection'] {
    const s = this.session.scenario
    if (this.selection === null) return null
    if (this.selection.kind === 'wall') {
      const wall = s.walls[this.selection.index]
      return wall ? { x: wall.x, y: wall.y, w: 1, h: 1 } : null
    }
    const building = s.buildings[this.selection.index]
    const size = building && BUILDING_TYPES[building.type]
    return building && size ? { x: building.x, y: building.y, w: size.w, h: size.h } : null
  }
}
