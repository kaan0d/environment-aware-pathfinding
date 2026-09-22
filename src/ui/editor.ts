import { BUILDING_TYPES } from '../sim/config'
import { cloneScenario } from '../sim/scenario'
import type { Scenario, WallLevel } from '../sim/types'
import {
  buildingIndexAt,
  copyRegion,
  erase,
  lineCells,
  paintCells,
  pasteRegion,
  placeBuilding,
  rectOutlineCells,
  scatterCells,
  selectAt,
  setHp,
  toggleSpawn,
  type ClipEntry,
  type Selection,
} from './editorActions'
import type { Session } from './session'

export type Tool = 'place' | 'wall' | 'rect' | 'line' | 'copy' | 'erase' | 'spawn' | 'select'

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
  cells: { x: number; y: number }[] | null // Rect/Line/Copy tool: the cells the current drag would touch
}

const FLASH_SECONDS = 0.45
const MAX_HISTORY = 50

// Tools whose single click or drag can change the scenario, so a gesture snapshot is worth taking for undo.
const MUTATING: readonly Tool[] = ['wall', 'rect', 'line', 'copy', 'erase', 'spawn']

// The one place that holds the editor state (active tool, options, selection, undo history, clipboard).
// Pointer events arrive as grid cells; the only things touched are the session scenario and its deploy list.
export class Editor {
  tool: Tool = 'select'
  wallLevel: WallLevel = 1 // Draw wall / Rect / Line tools: paints at this level
  troopType = 'balanced' // last unit type: used for balance editing and "Add at spawn points"
  dropCount = 1
  selection: Selection | null = null
  private hover: { x: number; y: number } | null = null
  private dragging = false
  private dragStart: { x: number; y: number } | null = null
  private lastPainted = ''
  private flashes: { x: number; y: number; age: number }[] = []
  private clipboard: ClipEntry[] = []
  private history: Scenario[] = []
  private future: Scenario[] = []
  // Scenario as it was right before the gesture in progress; committed to history only if something changed.
  private gestureSnapshot: Scenario | null = null
  private gestureChanged = false

  constructor(
    private readonly session: Session,
    private readonly onChange: () => void, // sidebar/toolbar refresh after the scenario or selection changed
  ) {}

  get canUndo(): boolean {
    return this.history.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  pointer(cell: { x: number; y: number } | null, phase: 'down' | 'move' | 'up'): void {
    this.hover = cell
    if (phase === 'down') {
      this.dragging = true
      this.dragStart = cell
      this.gestureSnapshot = MUTATING.includes(this.tool) ? cloneScenario(this.session.scenario) : null
      this.gestureChanged = false
    }
    if (phase === 'up') return void this.finishGesture(cell)
    if (cell === null) return
    if (this.tool === 'rect' || this.tool === 'line' || this.tool === 'copy') return // committed on 'up', see finishGesture
    const key = `${cell.x},${cell.y}`
    if (phase === 'move' && !(this.dragging && (this.tool === 'wall' || this.tool === 'erase'))) return
    if (key === this.lastPainted && phase === 'move') return
    this.lastPainted = key
    this.apply(cell.x, cell.y)
  }

  undo(): void {
    const prev = this.history.pop()
    if (prev === undefined) return
    this.future.push(cloneScenario(this.session.scenario))
    this.selection = null
    this.session.load(prev)
    this.onChange()
  }

  redo(): void {
    const next = this.future.pop()
    if (next === undefined) return
    this.history.push(cloneScenario(this.session.scenario))
    this.selection = null
    this.session.load(next)
    this.onChange()
  }

  deployAtSpawns(): void {
    for (const spawn of this.session.scenario.spawns) this.dropAt(spawn.x, spawn.y, this.dropCount)
  }

  // Called by the placement context menu (tool 'place' opens it instead of painting directly on click).
  placeBuildingAt(x: number, y: number, type: string): void {
    const snapshot = cloneScenario(this.session.scenario)
    if (!placeBuilding(this.session.scenario, type, x, y)) return void this.flash(x, y)
    this.pushHistory(snapshot)
    this.edited()
  }

  placeUnitAt(x: number, y: number, troopType: string): void {
    this.troopType = troopType
    this.dropAt(x, y, this.dropCount)
  }

  setSelectedHp(hp: number): boolean {
    if (this.selection === null) return false
    const snapshot = cloneScenario(this.session.scenario)
    if (!setHp(this.session.scenario, this.selection, hp)) return false
    this.pushHistory(snapshot)
    this.edited()
    return true
  }

  // Ages the red flashes shown for refused clicks.
  tick(seconds: number): void {
    this.flashes = this.flashes.filter((f) => (f.age += seconds) < FLASH_SECONDS)
  }

  overlay(): EditorOverlay {
    const s = this.session.scenario
    return { spawns: s.spawns, preview: this.preview(), selection: this.selectionRect(), flashes: this.flashes, cells: this.previewCells() }
  }

  // Rect, Line and Copy commit once on pointer-up instead of per cell; wall/erase/spawn already committed their
  // own cells through apply() during the gesture, so this only closes out the undo entry for the whole gesture.
  private finishGesture(end: { x: number; y: number } | null): void {
    const start = this.dragStart
    this.dragging = false
    this.dragStart = null
    if (this.tool === 'rect' && start && end) this.commitCells(rectOutlineCells(start.x, start.y, end.x, end.y))
    else if (this.tool === 'line' && start && end) this.commitCells(lineCells(start.x, start.y, end.x, end.y))
    else if (this.tool === 'copy' && start && end) this.finishCopyOrPaste(start, end)
    if (this.gestureChanged && this.gestureSnapshot) this.pushHistory(this.gestureSnapshot)
    this.gestureSnapshot = null
  }

  private commitCells(cells: { x: number; y: number }[]): void {
    if (paintCells(this.session.scenario, cells, this.wallLevel) === 0) return void this.flash(cells[0].x, cells[0].y)
    this.gestureChanged = true
    this.edited()
  }

  // A plain click (no movement) pastes the clipboard anchored there; a drag copies the spanned rectangle.
  private finishCopyOrPaste(start: { x: number; y: number }, end: { x: number; y: number }): void {
    if (start.x === end.x && start.y === end.y) {
      if (this.clipboard.length === 0) return
      if (pasteRegion(this.session.scenario, this.clipboard, end.x, end.y) === 0) return void this.flash(end.x, end.y)
      this.gestureChanged = true
      this.edited()
    } else {
      this.clipboard = copyRegion(this.session.scenario, start.x, start.y, end.x, end.y)
      this.onChange() // copying does not change the scenario, so no history entry
    }
  }

  private pushHistory(snapshot: Scenario): void {
    this.history.push(snapshot)
    this.future = []
    if (this.history.length > MAX_HISTORY) this.history.shift()
  }

  private apply(x: number, y: number): void {
    if (this.tool === 'place') return // the context menu in main.ts handles this tool, not a plain click
    const s = this.session.scenario
    let done = false
    if (this.tool === 'wall') done = paintCells(s, [{ x, y }], this.wallLevel) > 0
    else if (this.tool === 'erase') done = erase(s, x, y)
    else if (this.tool === 'spawn') done = toggleSpawn(s, x, y)
    else return void this.select(x, y) // tool === 'select'
    if (done) {
      this.gestureChanged = true
      this.edited()
    } else if (this.tool !== 'wall') this.flash(x, y) // painting over the same level while dragging is not an error
  }

  private dropAt(x: number, y: number, count: number): void {
    if (!this.session.canDeploy(x, y)) return this.flash(x, y)
    const snapshot = cloneScenario(this.session.scenario)
    const cells = scatterCells(this.session.scenario, x, y, count, (cx, cy) => this.session.canDeploy(cx, cy))
    this.session.deployAt(cells, this.troopType)
    this.pushHistory(snapshot)
    this.onChange()
  }

  private select(x: number, y: number): void {
    this.selection = selectAt(this.session.scenario, x, y)
    this.onChange()
  }

  // Shared tail for every mutation: drops the stale selection, rebuilds both worlds, tells the UI to refresh.
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

  // Rect/Line/Copy: the cells the current drag spans, shown as a tinted outline while the pointer is down.
  private previewCells(): { x: number; y: number }[] | null {
    if (!this.dragging || this.dragStart === null || this.hover === null) return null
    if (this.tool === 'rect' || this.tool === 'copy') return rectOutlineCells(this.dragStart.x, this.dragStart.y, this.hover.x, this.hover.y)
    if (this.tool === 'line') return lineCells(this.dragStart.x, this.dragStart.y, this.hover.x, this.hover.y)
    return null
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
