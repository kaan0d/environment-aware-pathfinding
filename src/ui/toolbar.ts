import type { Editor, Tool } from './editor'

const TOOLS: Array<[Tool, string]> = [
  ['place', 'Place'],
  ['spawn', 'Spawn point'],
  ['erase', 'Erase'],
  ['select', 'Select'],
]

// The map-editing tool buttons, in their own row in the top bar below play/reset/speed. 'Place' opens the
// context menu (src/ui/placeMenu.ts) on the next map click; the others act on click like before.
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
  }
  refresh()
}
