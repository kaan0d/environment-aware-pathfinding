import { BUILDING_TYPES, TROOP_TYPES } from '../sim/config'
import type { WallLevel } from '../sim/types'

export interface PlaceMenuActions {
  wall(level: WallLevel): void
  building(type: string): void
  unit(type: string): void
}

let openMenu: HTMLElement | null = null

function closeMenu(): void {
  if (openMenu === null) return
  openMenu.remove()
  openMenu = null
  document.removeEventListener('pointerdown', onOutside, true)
  document.removeEventListener('keydown', onKey, true)
}

function onOutside(e: PointerEvent): void {
  if (openMenu && !openMenu.contains(e.target as Node)) closeMenu()
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeMenu()
}

function item(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.textContent = label
  button.addEventListener('click', () => {
    onClick()
    closeMenu()
  })
  return button
}

function group(title: string, items: HTMLButtonElement[]): HTMLElement {
  const box = document.createElement('div')
  box.className = 'place-menu-group'
  const h = document.createElement('h4')
  h.textContent = title
  box.append(h, ...items)
  return box
}

// A right-click-style popup anchored at a screen point, asking what to put on the cell that was clicked.
export function openPlaceMenu(clientX: number, clientY: number, actions: PlaceMenuActions): void {
  closeMenu()
  const menu = document.createElement('div')
  menu.id = 'place-menu'
  menu.append(
    group(
      'Wall',
      ([1, 2, 3, 4, 5] as WallLevel[]).map((level) => item(`Level ${level}`, () => actions.wall(level))),
    ),
    group(
      'Building',
      Object.values(BUILDING_TYPES).map((b) => item(`${b.name} ${b.w}x${b.h}`, () => actions.building(b.id))),
    ),
    group(
      'Unit',
      Object.values(TROOP_TYPES).map((t) => item(t.name, () => actions.unit(t.id))),
    ),
  )
  document.body.append(menu)
  const rect = menu.getBoundingClientRect()
  menu.style.left = `${Math.max(4, Math.min(clientX, window.innerWidth - rect.width - 8))}px`
  menu.style.top = `${Math.max(4, Math.min(clientY, window.innerHeight - rect.height - 8))}px`
  openMenu = menu
  // Deferred so the pointerdown that opened the menu does not immediately close it via the capture listener.
  setTimeout(() => {
    document.addEventListener('pointerdown', onOutside, true)
    document.addEventListener('keydown', onKey, true)
  })
}
