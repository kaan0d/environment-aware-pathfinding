import type { WallLevel } from '../sim/types'
import type { Editor, Tool } from './editor'

const TOOLS: Array<[Tool, string]> = [
  ['place', 'Place'],
  ['wall', 'Draw wall'],
  ['rect', 'Rect wall'],
  ['line', 'Line wall'],
  ['copy', 'Copy/Paste'],
  ['spawn', 'Spawn point'],
  ['erase', 'Erase'],
  ['select', 'Select'],
]

// The map-editing tool buttons, in their own row in the top bar below play/reset/speed. 'Place' opens the
// context menu (src/ui/placeMenu.ts) on the next map click; 'Draw wall', 'Rect wall' and 'Line wall' paint at
// the level picked next to them - drag to paint a run, a rectangle outline or a straight line. 'Copy/Paste'
// drags a rectangle to copy its walls and buildings, then a plain click pastes them anchored at the click.
export function buildToolbar(container: HTMLElement, editor: Editor): { refresh(): void } {
  const buttons = new Map<Tool, HTMLButtonElement>()
  const undoButton = document.createElement('button')
  undoButton.textContent = 'Undo'
  undoButton.addEventListener('click', () => editor.undo())
  const redoButton = document.createElement('button')
  redoButton.textContent = 'Redo'
  redoButton.addEventListener('click', () => editor.redo())
  const refresh = () => {
    for (const [tool, button] of buttons) button.classList.toggle('on', tool === editor.tool)
    undoButton.disabled = !editor.canUndo
    redoButton.disabled = !editor.canRedo
  }
  for (const [tool, label] of TOOLS) {
    const button = document.createElement('button')
    button.textContent = label
    button.addEventListener('click', () => {
      editor.tool = tool
      refresh()
    })
    buttons.set(tool, button)
    container.append(button)
    if (tool === 'line') container.append(wallLevelSelect(editor)) // one shared level for wall/rect/line
  }
  container.append(undoButton, redoButton)
  refresh()
  return { refresh }
}

function wallLevelSelect(editor: Editor): HTMLSelectElement {
  const select = document.createElement('select')
  for (const level of [1, 2, 3, 4, 5]) select.add(new Option(`Level ${level}`, String(level), false, level === editor.wallLevel))
  select.addEventListener('change', () => (editor.wallLevel = Number(select.value) as WallLevel))
  return select
}
