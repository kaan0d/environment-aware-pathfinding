import { compareAll, PLANNER_LABEL, PLANNER_NAMES, summarize, type CompareRow } from '../sim/batchCompare'

let openOverlay: HTMLElement | null = null

function close(): void {
  if (openOverlay === null) return
  openOverlay.remove()
  openOverlay = null
  document.removeEventListener('keydown', onKey, true)
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') close()
}

function fmt(t: number | null): string {
  return t === null ? '—' : `${t.toFixed(1)} s`
}

// Runs every named scenario plus `randomCount` random maps through classic, the stronger classic and squad,
// and shows mean/worst finish time per planner, then every map's own row so the claim can be checked by hand.
export function openComparePanel(randomCount = 50): void {
  close()
  const overlay = document.createElement('div')
  overlay.id = 'compare-overlay'
  const box = document.createElement('div')
  box.id = 'compare-box'
  box.innerHTML = `<h2>Comparing planners…</h2><p>${9 + randomCount} maps × ${PLANNER_NAMES.length} planners. A moment.</p>`
  overlay.append(box)
  document.body.append(overlay)
  openOverlay = overlay
  document.addEventListener('keydown', onKey, true)
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) close()
  })
  // Deferred so the "Comparing…" message actually paints before the run blocks the main thread.
  setTimeout(() => {
    const started = performance.now()
    const rows = compareAll(randomCount)
    const ms = performance.now() - started
    if (openOverlay !== overlay) return // closed while running
    box.innerHTML = ''
    box.append(closeButton(), summaryTable(rows, ms), mapTable(rows))
  })
}

function closeButton(): HTMLButtonElement {
  const button = document.createElement('button')
  button.id = 'compare-close'
  button.textContent = '✕'
  button.addEventListener('click', close)
  return button
}

function summaryTable(rows: CompareRow[], ms: number): HTMLElement {
  const wrap = document.createElement('div')
  const h = document.createElement('h2')
  h.textContent = `Planner comparison — ${rows.length} maps, ${ms.toFixed(0)} ms`
  const table = document.createElement('table')
  table.innerHTML = '<thead><tr><th>Planner</th><th>Mean</th><th>Worst</th><th>Finished</th></tr></thead>'
  const body = document.createElement('tbody')
  for (const s of summarize(rows)) {
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${PLANNER_LABEL[s.planner]}</td><td>${fmt(s.mean)}</td><td>${fmt(s.worst)}</td><td>${s.finished} / ${s.total}</td>`
    body.append(tr)
  }
  table.append(body)
  wrap.append(h, table)
  return wrap
}

function mapTable(rows: CompareRow[]): HTMLElement {
  const wrap = document.createElement('div')
  const h = document.createElement('h3')
  h.textContent = 'Every map'
  const table = document.createElement('table')
  table.innerHTML = `<thead><tr><th>Map</th>${PLANNER_NAMES.map((p) => `<th>${PLANNER_LABEL[p]}</th>`).join('')}</tr></thead>`
  const body = document.createElement('tbody')
  for (const row of rows) {
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${row.map}</td>${PLANNER_NAMES.map((p) => `<td>${fmt(row.finishTimes[p])}</td>`).join('')}`
    body.append(tr)
  }
  table.append(body)
  wrap.append(h, table)
  return wrap
}
