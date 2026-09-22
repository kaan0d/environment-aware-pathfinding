import type { SimEvent } from '../sim/types'
import type { World } from '../sim/world'

const MAX_ENTRIES = 200

// The two events worth reading as a line, e.g. "12.3 s [New]: unit 4 destroyed wall (14,7)". Deploys and a
// troop finishing walking are not battle events, so they are left out.
function describe(world: World, event: SimEvent): string | null {
  if (event.type === 'wallDestroyed') {
    const x = event.cell % world.grid.width
    const y = Math.floor(event.cell / world.grid.width)
    return `unit ${event.troopId} destroyed wall (${x},${y})`
  }
  if (event.type === 'buildingDestroyed') {
    return `unit ${event.troopId} destroyed ${world.grid.buildings[event.buildingId].type.name.toLowerCase()}`
  }
  return null
}

// A scrolling "12.3 s: unit 4 destroyed wall (14,7)" list built from both panels' event logs, newest on top.
// update() is cheap to call every frame: it only does anything once new events have actually landed.
export function buildBattleLog(container: HTMLElement): { update(classic: World, fresh: World): void } {
  const list = document.createElement('ul')
  list.className = 'battle-log'
  container.append(list)
  let seenClassic = 0
  let seenFresh = 0
  let lastClassic: World | null = null
  let lastFresh: World | null = null
  let lines: string[] = []

  function collect(world: World, seen: number, label: string): number {
    for (; seen < world.events.length; seen++) {
      const text = describe(world, world.events[seen])
      if (text !== null) lines.push(`${world.events[seen].t.toFixed(1)} s [${label}]: ${text}`)
    }
    return seen
  }

  return {
    update(classic, fresh) {
      if (classic !== lastClassic || fresh !== lastFresh) {
        // A reset or a timeline scrub rebuilds both worlds from scratch - start the log over with them.
        lastClassic = classic
        lastFresh = fresh
        seenClassic = 0
        seenFresh = 0
        lines = []
      }
      const before = lines.length
      seenClassic = collect(classic, seenClassic, 'Classic')
      seenFresh = collect(fresh, seenFresh, 'New')
      if (lines.length === before) return
      if (lines.length > MAX_ENTRIES) lines.splice(0, lines.length - MAX_ENTRIES)
      list.replaceChildren(
        ...lines
          .slice()
          .reverse()
          .map((line) => {
            const li = document.createElement('li')
            li.textContent = line
            return li
          }),
      )
    },
  }
}
