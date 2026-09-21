import type { World } from '../sim/world'
import { S } from './strings'
import type { Summary } from './session'

// Small DOM overlay for one panel: name, elapsed time and the running totals of its world.
export class PanelHud {
  readonly element = document.createElement('div')
  private readonly values = new Map<string, HTMLElement>()

  constructor(title: string, subtitle: string) {
    this.element.className = 'hud'
    this.element.innerHTML = `<h2>${title}</h2><div class="sub">${subtitle}</div>`
    for (const [key, label] of [['time', S.time], ['walls', S.walls], ['buildings', S.buildings], ['distance', S.distance]]) {
      const row = document.createElement('div')
      row.className = 'row'
      row.innerHTML = `<span>${label}</span><b></b>`
      this.element.appendChild(row)
      this.values.set(key, row.querySelector('b')!)
    }
  }

  update(world: World): void {
    const stats = world.stats()
    const alive = world.grid.buildings.filter((b) => b.alive).length
    this.set('time', `${(world.finishTime ?? world.time).toFixed(1)} s${world.finished ? ' ✓' : ''}`)
    this.set('walls', String(stats.wallsDestroyed))
    this.set('buildings', `${stats.buildingsDestroyed} / ${stats.buildingsDestroyed + alive}`)
    this.set('distance', `${stats.distance.toFixed(0)} cells`)
  }

  private set(key: string, text: string): void {
    const element = this.values.get(key)!
    if (element.textContent !== text) element.textContent = text
  }
}

export class Banner {
  readonly element = document.createElement('div')

  constructor() {
    this.element.id = 'banner'
    this.element.hidden = true
  }

  show(summary: Summary | null): void {
    this.element.hidden = summary === null
    if (summary === null) return
    const seconds = Math.abs(summary.difference).toFixed(2)
    const percent = summary.percent.toFixed(0)
    const headline =
      summary.winner === 'tie' ? S.tieBanner : summary.winner === 'fresh' ? S.fasterBanner(seconds, percent) : S.slowerBanner(seconds, percent)
    this.element.innerHTML = `${headline}<small>Classic ${summary.classic.toFixed(2)} s · New ${summary.fresh.toFixed(2)} s</small>`
  }
}
