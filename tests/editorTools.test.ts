import { describe, expect, it } from 'vitest'
import { L_CORNER } from '../src/scenarios'
import { cloneScenario } from '../src/sim/scenario'
import { Editor } from '../src/ui/editor'
import { copyRegion, lineCells, paintCells, pasteRegion, rectOutlineCells } from '../src/ui/editorActions'
import { Session } from '../src/ui/session'

const fresh = () => cloneScenario(L_CORNER)

describe('line and rectangle wall shapes', () => {
  it('lineCells walks a straight Bresenham line between two points, inclusive', () => {
    expect(lineCells(2, 2, 2, 5)).toEqual([{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 2, y: 4 }, { x: 2, y: 5 }])
    expect(lineCells(0, 0, 3, 3)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }])
    expect(lineCells(4, 4, 4, 4)).toEqual([{ x: 4, y: 4 }])
  })

  it('rectOutlineCells is only the border, corners included once, any corner order', () => {
    const cells = rectOutlineCells(0, 0, 2, 2)
    expect(cells).toHaveLength(8) // 3x3 border, the center excluded
    expect(cells).not.toContainEqual({ x: 1, y: 1 })
    expect(rectOutlineCells(2, 2, 0, 0)).toEqual(expect.arrayContaining(cells))
    expect(rectOutlineCells(5, 5, 5, 5)).toEqual([{ x: 5, y: 5 }]) // a single cell is its own border
  })

  it('paintCells paints every cell and counts only the ones that actually changed', () => {
    const s = fresh()
    const count = paintCells(s, rectOutlineCells(0, 0, 2, 2), 3)
    expect(count).toBe(8)
    expect(s.walls.filter((w) => w.level === 3)).toHaveLength(8)
    expect(paintCells(s, rectOutlineCells(0, 0, 2, 2), 3)).toBe(0) // same level again: nothing changed
  })
})

describe('copy and paste', () => {
  it('copies walls and buildings inside a rectangle as offsets, and pastes them anchored elsewhere', () => {
    const s = fresh()
    paintCells(s, [{ x: 30, y: 20 }, { x: 31, y: 20 }], 2)
    const entries = copyRegion(s, 30, 20, 31, 21)
    expect(entries).toEqual(expect.arrayContaining([{ dx: 0, dy: 0, wall: 2 }, { dx: 1, dy: 0, wall: 2 }]))
    const placed = pasteRegion(s, entries, 33, 20)
    expect(placed).toBe(entries.length)
    expect(s.walls.some((w) => w.x === 33 && w.y === 20 && w.level === 2)).toBe(true)
    expect(s.walls.some((w) => w.x === 34 && w.y === 20 && w.level === 2)).toBe(true)
  })

  it('pasteRegion skips entries that do not fit and only counts the ones it actually placed', () => {
    const s = fresh()
    const entries = [{ dx: 0, dy: 0, wall: 2 as const }]
    expect(pasteRegion(s, entries, 26, 6)).toBe(0) // (26,6) is the depot
  })
})

describe('Editor: rect, line, copy/paste tools and undo/redo', () => {
  const setup = () => {
    const session = new Session(L_CORNER)
    let changes = 0
    return { session, editor: new Editor(session, () => changes++), get changes() { return changes } }
  }

  it('Rect tool drags a rectangle outline in one gesture, one undo step', () => {
    const { session, editor } = setup()
    editor.tool = 'rect'
    editor.wallLevel = 4
    editor.pointer({ x: 0, y: 0 }, 'down')
    editor.pointer({ x: 2, y: 2 }, 'move')
    editor.pointer({ x: 2, y: 2 }, 'up')
    expect(session.scenario.walls.filter((w) => w.level === 4)).toHaveLength(8)
    expect(editor.canUndo).toBe(true)
    editor.undo()
    expect(session.scenario.walls.some((w) => w.level === 4)).toBe(false)
    expect(editor.canRedo).toBe(true)
    editor.redo()
    expect(session.scenario.walls.filter((w) => w.level === 4)).toHaveLength(8)
  })

  it('Line tool paints a straight line on pointer-up, not while dragging', () => {
    const { session, editor } = setup()
    editor.tool = 'line'
    editor.wallLevel = 5
    editor.pointer({ x: 1, y: 20 }, 'down')
    editor.pointer({ x: 1, y: 22 }, 'move')
    expect(session.scenario.walls.some((w) => w.level === 5)).toBe(false) // nothing yet, still dragging
    editor.pointer({ x: 1, y: 22 }, 'up')
    expect(session.scenario.walls.filter((w) => w.level === 5)).toHaveLength(3)
  })

  it('Copy tool: drag copies, a later plain click pastes at the click', () => {
    const { session, editor } = setup()
    editor.tool = 'wall'
    editor.wallLevel = 2
    editor.pointer({ x: 5, y: 5 }, 'down')
    editor.pointer({ x: 5, y: 5 }, 'up')
    editor.tool = 'copy'
    editor.pointer({ x: 5, y: 5 }, 'down')
    editor.pointer({ x: 5, y: 5 }, 'up') // no movement: this is a paste attempt, but the clipboard is still empty
    editor.pointer({ x: 4, y: 4 }, 'down')
    editor.pointer({ x: 6, y: 6 }, 'move')
    editor.pointer({ x: 6, y: 6 }, 'up') // a drag: copies the 3x3 region including the wall at (5,5)
    editor.pointer({ x: 20, y: 20 }, 'down')
    editor.pointer({ x: 20, y: 20 }, 'up') // plain click: pastes, anchored so (5,5)'s offset (1,1) lands at (21,21)
    expect(session.scenario.walls.some((w) => w.x === 21 && w.y === 21 && w.level === 2)).toBe(true)
  })

  it('undo/redo also cover a single click (placeBuildingAt, dropAt) and dropping the redo stack on a new edit', () => {
    const { session, editor } = setup()
    editor.placeBuildingAt(30, 20, 'depot')
    expect(session.scenario.buildings.some((b) => b.x === 30 && b.y === 20)).toBe(true)
    editor.undo()
    expect(session.scenario.buildings.some((b) => b.x === 30 && b.y === 20)).toBe(false)
    expect(editor.canRedo).toBe(true)
    editor.placeBuildingAt(31, 20, 'depot') // a fresh edit drops the redo stack
    expect(editor.canRedo).toBe(false)
  })
})
