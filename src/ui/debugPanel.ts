import type { World } from '../sim/world'
import type { Debug, DebugInfo, DebugOverview } from './debug'

const money = (seconds: number) => (Number.isFinite(seconds) ? `${seconds.toFixed(1)} s` : 'never')
const hp = (value: number) => Math.ceil(value).toLocaleString('en-US')

// The debug section of the sidebar. Hidden until the Debug button is on. Everything is filled in by itself:
// the map's walls and squad settings, and the decision of an automatically chosen unit (click another to follow it).
export function buildDebugPanel(root: HTMLElement): {
  setEnabled(on: boolean): void
  update(debug: Debug, info: DebugInfo | null, overview: DebugOverview | null, world: World, legend: { min: number; max: number }): void
} {
  const box = document.createElement('section')
  box.className = 'box debug'
  box.hidden = true
  const title = document.createElement('h3')
  title.textContent = 'Debug'
  const body = document.createElement('div')
  box.append(title, body)
  root.append(box)

  const overviewHtml = (o: DebugOverview) => {
    const squads =
      o.squadSizes === null
        ? 'this panel has no squads: every unit plans alone'
        : o.squadSizes.length === 0
          ? 'no units on the map yet'
          : `${o.squadSizes.length} now, of ${o.squadSizes.join(', ')} unit${o.squadSizes.length === 1 && o.squadSizes[0] === 1 ? '' : 's'}`
    const levels = o.levels
      .map((l) => `<tr><td>${l.level}</td><td>${l.count}</td><td>${l.hp[0] === l.hp[1] ? hp(l.hp[0]) : `${hp(l.hp[0])}-${hp(l.hp[1])}`}</td><td>${l.hurt}</td></tr>`)
      .join('')
    const hurt = o.hurt.map((w) => `<tr><td>(${w.x},${w.y})</td><td>${hp(w.hp)} / ${hp(w.maxHp)}</td><td>${Math.round((w.hp / w.maxHp) * 100)}%</td></tr>`).join('')
    return `
      <h4>Squads</h4>
      <div class="row"><span>Squad radius</span><b>${o.squadRadius} cells</b></div>
      <div class="row"><span>Squads (${o.panelName} panel)</span><b>${squads}</b></div>
      <p class="description">Units closer than the radius, directly or through a chain, share one plan. The white ring is the radius around the followed unit.</p>
      <h4>Wall hit points</h4>
      ${
        o.levels.length === 0
          ? '<p class="description">There are no walls on this map.</p>'
          : `<table><thead><tr><th>Level</th><th>Walls</th><th>Hit points</th><th>Hurt</th></tr></thead><tbody>${levels}</tbody></table>
      ${o.hitsTaken > 0 ? `<table><thead><tr><th>Most damaged</th><th>Now</th><th></th></tr></thead><tbody>${hurt}</tbody></table>` : '<p class="description">No wall is damaged yet. Every wall shows a bar under it; walls on the followed route and walls being hit also show their number.</p>'}`
      }`
  }

  return {
    setEnabled(on) {
      box.hidden = !on
    },
    update(debug, info, overview, world, legend) {
      const legendHtml = `<div class="legend"><div class="bar"></div><div class="labels"><span>${legend.min.toFixed(1)} s</span><span>${legend.max.toFixed(1)} s</span></div><p>Heat map: seconds this unit type needs to finish a building from each cell.</p></div>`
      const overviewPart = overview ? overviewHtml(overview) : ''
      if (info === null) {
        body.innerHTML = `<p class="description">Waiting for units. Drop some, or press Reset: the debug view follows the first unit by itself and you can click any unit to follow it instead.</p>${overviewPart}${debug.troopId !== null ? legendHtml : ''}`
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
      const frozenNote = info.committed
        ? `<p class="description">${info.frozen ? 'The group already started hitting, so it keeps its plan. These are the candidates it scored just before, they refresh when the target falls.' : 'The group already started hitting, so it keeps its plan until that target falls.'}</p>`
        : ''
      body.innerHTML = `
        <p class="description">Following <b>${troop.type.name} #${troop.id}</b> in the ${info.panelName} panel, ${troop.state}${info.members > 1 ? `, group of ${info.members}` : ''}. Click another unit to follow it.</p>
        ${overviewPart}
        <h4>Candidate plans</h4>
        <div class="row"><span>Current estimate</span><b>${estimate}</b></div>
        <div class="row"><span>Last building</span><b>${finished}</b></div>
        <div class="row"><span>Walk around</span><b>${walkAround ? money(walkAround.total) : 'no way'}</b></div>
        <div class="row"><span>Break through</span><b>${breakThrough ? `${money(breakThrough.total)} (${breakThrough.candidate.walls.length} wall${breakThrough.candidate.walls.length === 1 ? '' : 's'})` : 'no wall on the way'}</b></div>
        <div class="row"><span>Per building</span><b>${[...perBuilding].map(([id, t]) => `${building(id)}: ${money(t)}`).join('<br>') || '-'}</b></div>
        ${info.lastPlanMs !== null ? `<div class="row"><span>Planning time</span><b>${info.lastPlanMs.toFixed(2)} ms</b></div>` : ''}
        ${frozenNote}
        <table><thead><tr><th></th><th>Goal</th><th>Time</th><th>Walls</th><th>Slots</th></tr></thead><tbody>${rows || '<tr><td colspan="5">no candidate yet</td></tr>'}</tbody></table>
        ${legendHtml}`
    },
  }
}
