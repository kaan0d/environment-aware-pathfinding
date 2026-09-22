import type { WallLevel } from '../sim/types'
import type { Editor, Tool } from './editor'

const TOOLS: Array<[Tool, string]> = [
  ['place', 'Place'],
  ['wall', 'Draw wall'],
  ['spawn', 'Spawn point'],
  ['erase', 'Erase'],
  ['select', 'Select'],
]

// The map-editing tool buttons, in their own row in the top bar below play/reset/speed. 'Place' opens the
// context menu (src/ui/placeMenu.ts) on the next map click; 'Draw wall' paints on click and drag at the level
// picked next to it - buildings and units are one-offs from the menu, but a run of wall is common enough to
// want dragging, which a per-click menu can't give.
export function buildToolbar(container: HTMLElement, editor: Editor): void {
  const buttons = new Map<Tool, HTMLButtonElement>()
  const refresh = () => {
    for (const [tool, button] of buttons) button.classList.toggle('on', tool === editor.tool)
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
    if (tool === 'wall') container.append(wallLevelSelect(editor))
  }
  refresh()
}

function wallLevelSelect(editor: Editor): HTMLSelectElement {
  const select = document.createElement('select')
  for (const level of [1, 2, 3, 4, 5]) select.add(new Option(`Level ${level}`, String(level), false, level === editor.wallLevel))
  select.addEventListener('change', () => (editor.wallLevel = Number(select.value) as WallLevel))
  return select
}
