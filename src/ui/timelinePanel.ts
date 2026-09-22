import { DT } from '../sim/config'
import { World } from '../sim/world'
import type { Session } from './session'

// Scrubs the deterministic run to any moment (Session.scrubTo re-simulates from t=0 to there), jumps to the
// previous/next wall or building falling, or steps exactly one tick while paused. No recording is kept - the
// sim is cheap enough to just re-run, and that stays correct after any edit instead of going stale.
export function buildTimeline(container: HTMLElement, session: Session, onScrub: () => void): { refresh(): void; refreshMax(): void } {
  const stepButton = document.createElement('button')
  stepButton.textContent = 'Step'
  const prevButton = document.createElement('button')
  prevButton.textContent = '⏮'
  prevButton.title = 'Previous wall or building falling'
  const nextButton = document.createElement('button')
  nextButton.textContent = '⏭'
  nextButton.title = 'Next wall or building falling'
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = '0'
  slider.step = String(DT)
  slider.value = '0'
  slider.className = 'timeline-slider'
  const time = document.createElement('span')
  time.className = 'timeline-time'

  const scrubTo = (t: number) => {
    session.scrubTo(t)
    onScrub()
    refresh()
  }
  slider.addEventListener('input', () => scrubTo(Number(slider.value)))
  stepButton.addEventListener('click', () => {
    session.playing = false
    session.stepOnce()
    onScrub()
    refresh()
  })
  prevButton.addEventListener('click', () => jump(-1))
  nextButton.addEventListener('click', () => jump(1))

  // Every wall/building destruction, from both panels' event logs, deduplicated to the nearest tick.
  function eventTimes(): number[] {
    const times = new Set<number>()
    for (const events of [session.classic.events, session.fresh.events]) {
      for (const e of events) if (e.type === 'wallDestroyed' || e.type === 'buildingDestroyed') times.add(Math.round(e.t / DT) * DT)
    }
    return [...times].sort((a, b) => a - b)
  }

  function jump(direction: 1 | -1): void {
    const times = eventTimes()
    const now = session.time
    const found = direction > 0 ? times.find((t) => t > now + DT / 2) : [...times].reverse().find((t) => t < now - DT / 2)
    if (found !== undefined) scrubTo(found)
  }

  // Cheap, per-frame: just the slider position and label.
  function refresh(): void {
    slider.value = String(session.time)
    time.textContent = `${session.time.toFixed(1)} s`
    stepButton.disabled = session.finished
  }

  // Not cheap: runs two throwaway worlds to completion to size the slider. Called once at start and again
  // whenever the scenario changes, not every frame.
  function refreshMax(): void {
    const classicWorld = new World(session.scenario)
    classicWorld.run(600)
    const freshWorld = new World(session.scenario)
    freshWorld.setPlanner('squad', { group: session.groupBehavior })
    freshWorld.run(600)
    slider.max = String(Math.max(classicWorld.finishTime ?? 30, freshWorld.finishTime ?? 30, 5))
    refresh()
  }

  container.append(stepButton, prevButton, slider, nextButton, time)
  refreshMax()
  return { refresh, refreshMax }
}
