import type { DebugInfo } from './debug'
import type { Debug } from './debug'
import type { World } from '../sim/world'

const money = (seconds: number) => (Number.isFinite(seconds) ? `${seconds.toFixed(1)} s` : 'never')

// The debug section of the sidebar. Hidden until the Debug button is on; shows what the selected unit decided and why.
export function buildDebugPanel(root: HTMLElement): { setEnabled(on: boolean): void; update(debug: Debug, info: DebugInfo | null, world: World, legend: { min: number; max: number }): void } {
  const box = document.createElement('section')
  box.className = 'box debug'
  box.hidden = true
  const title = document.createElement('h3')
  title.textContent = 'Debug'
  const body = document.createElement('div')
  box.append(title, body)
  root.append(box)

  return {
    setEnabled(on) {
      box.hidden = !on
    },
    update(debug, info, world, legend) {
      const legendHtml = `<div class="legend"><div class="bar"></div><div class="labels"><span>${legend.min.toFixed(1)} s</span><span>${legend.max.toFixed(1)} s</span></div><p>Heat map: seconds this unit type needs to finish a building from each cell.</p></div>`
      if (info === null) {
        body.innerHTML = `<p class="description">Click a unit in either panel. Blue route: walking, green: breaking a wall. Colored rings: units that share a plan.</p>${debug.troopId !== null ? legendHtml : ''}`
        return
      }
      const { troop } = info
      const building = (id: number) => `${world.grid.buildings[id].type.name} #${id}`
      const walkAround = info.candidates.filter((c) => c.candidate.walls.length === 0).sort((a, b) => a.total - b.total)[0]
      const breakThrough = info.candidates.filter((c) => c.candidate.walls.length > 0).sort((a, b) => a.total - b.total)[0]
      const perBuilding = new Map<number, number>()
      for (const c of info.candidates) perBuilding.set(c.candidate.target, Math.min(perBuilding.get(c.candidate.target) ?? Infinity, c.total))
      const rows = info.candidates
        .map(
          (c, i) =>
            `<tr class="${i === info.currentIndex ? 'current' : ''}"><td>${i === info.currentIndex ? '▶' : ''}</td><td>${building(c.candidate.target)}</td><td>${money(c.total)}</td><td>${c.candidate.walls.length}</td><td>${Array.from(c.stageSlots).join('/')}</td></tr>`,
        )
        .join('')
      const estimate = info.estimate ? `${money(info.estimate.current)} (adopted at ${info.estimate.since.toFixed(1)} s)` : 'no plan'
      const finished = info.lastFinished
        ? `estimated ${money(info.lastFinished.estimate)}, took ${money(info.lastFinished.actual)} (${(((info.lastFinished.actual - info.lastFinished.estimate) / info.lastFinished.actual) * 100).toFixed(0)}% off)`
        : 'nothing finished yet'
      body.innerHTML = `
        <p class="description"><b>${troop.type.name} #${troop.id}</b> in the ${info.panelName} panel, ${troop.state}${info.members > 1 ? `, group of ${info.members}` : ''}.</p>
        <div class="row"><span>Current estimate</span><b>${estimate}</b></div>
        <div class="row"><span>Last building</span><b>${finished}</b></div>
        ${info.committed ? '<p class="description">The group already started hitting, so it keeps its plan until that target falls. Candidates are shown again afterwards.</p>' : ''}
        <div class="row"><span>Walk around</span><b>${walkAround ? money(walkAround.total) : 'no way'}</b></div>
        <div class="row"><span>Break through</span><b>${breakThrough ? `${money(breakThrough.total)} (${breakThrough.candidate.walls.length} wall${breakThrough.candidate.walls.length === 1 ? '' : 's'})` : 'no wall on the way'}</b></div>
        <div class="row"><span>Per building</span><b>${[...perBuilding].map(([id, t]) => `${building(id)}: ${money(t)}`).join('<br>') || '-'}</b></div>
        ${info.lastPlanMs !== null ? `<div class="row"><span>Planning time</span><b>${info.lastPlanMs.toFixed(2)} ms</b></div>` : ''}
        ${info.committed ? '' : `<table><thead><tr><th></th><th>Goal</th><th>Time</th><th>Walls</th><th>Slots</th></tr></thead><tbody>${rows || '<tr><td colspan="5">no candidate</td></tr>'}</tbody></table>`}
        ${legendHtml}`
    },
  }
}
