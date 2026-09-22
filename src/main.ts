import { Application } from 'pixi.js'
import './style.css'
import { DebugLayer } from './render/debugLayer'
import { PanelView } from './render/panelView'
import { L_CORNER } from './scenarios'
import { Debug } from './ui/debug'
import { buildDebugPanel } from './ui/debugPanel'
import { Editor } from './ui/editor'
import { openPlaceMenu } from './ui/placeMenu'
import { buildSidebar } from './ui/sidebar'
import { buildToolbar } from './ui/toolbar'
import { Banner, PanelHud } from './ui/hud'
import { buildControls } from './ui/controls'
import { Session } from './ui/session'
import { S } from './ui/strings'

const HUD_STRIP = 100 // room above each map for its readout

async function main(): Promise<void> {
  const bar = document.getElementById('bar')!
  const barTop = document.createElement('div')
  barTop.className = 'bar-row'
  const barTools = document.createElement('div')
  barTools.className = 'bar-row'
  bar.append(barTop, barTools)
  const stage = document.getElementById('stage')!
  const app = new Application()
  await app.init({ resizeTo: stage, background: 0x1b2a1f, antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1 })
  stage.appendChild(app.canvas)

  const session = new Session(L_CORNER)
  const left = new PanelView()
  const right = new PanelView()
  app.stage.addChild(left.root, right.root)
  session.onBeforeStep(() => {
    left.snapshot()
    right.snapshot()
  })

  const leftHud = new PanelHud(S.classic, S.classicSub)
  const rightHud = new PanelHud(S.fresh, S.freshSub)
  const banner = new Banner()
  const divider = document.createElement('div')
  divider.id = 'divider'
  stage.append(leftHud.element, rightHud.element, divider, banner.element)

  // Both panels show the same map, fitted into their half of the window.
  const layout = () => {
    const { width, height } = app.screen
    const half = width / 2
    const { width: cols, height: rows } = session.classic.grid
    const room = height - HUD_STRIP - 12
    const scale = Math.max(4, Math.min((half - 16) / cols, room / rows))
    for (const [i, view] of [left, right].entries()) {
      view.root.scale.set(scale)
      view.root.position.set(i * half + (half - cols * scale) / 2, HUD_STRIP + (room - rows * scale) / 2)
    }
    rightHud.element.style.left = `${half + 8}px`
    leftHud.element.style.left = '8px'
    divider.style.left = `${half - 1}px`
  }
  layout()
  app.renderer.on('resize', layout)

  buildControls(barTop, session, () => session.reset())

  // Debug view: a toggle in the bar, selection by clicking a unit, layers per panel and a section in the sidebar.
  const debug = new Debug(session)
  const debugPanel = buildDebugPanel(document.getElementById('side')!)
  const layers = [new DebugLayer(left, 0), new DebugLayer(right, 1)]
  const debugButton = document.createElement('button')
  debugButton.textContent = S.debug
  debugButton.addEventListener('click', () => {
    debug.enabled = !debug.enabled
    debugButton.classList.toggle('on', debug.enabled)
    debugPanel.setEnabled(debug.enabled)
  })
  barTop.append(debugButton)

  // Pointer input on either panel maps to the same grid cell; the editor decides what it means.
  let refreshSidebar = () => {}
  const editor = new Editor(session, () => refreshSidebar())
  buildToolbar(barTools, editor)
  refreshSidebar = buildSidebar(document.getElementById('side')!, session, editor)
  const cellUnder = (event: PointerEvent) => {
    const rect = app.canvas.getBoundingClientRect()
    const px = event.clientX - rect.left
    const py = event.clientY - rect.top
    const view = px < app.screen.width / 2 ? left : right
    const x = Math.floor((px - view.root.x) / view.root.scale.x)
    const y = Math.floor((py - view.root.y) / view.root.scale.y)
    const { width, height } = session.classic.grid
    return x >= 0 && y >= 0 && x < width && y < height ? { x, y } : null
  }
  const troopUnder = (event: PointerEvent): { panel: 0 | 1; id: number } | null => {
    const rect = app.canvas.getBoundingClientRect()
    const panel = event.clientX - rect.left < app.screen.width / 2 ? 0 : 1
    const view = panel === 0 ? left : right
    const world = panel === 0 ? session.classic : session.fresh
    const x = (event.clientX - rect.left - view.root.x) / view.root.scale.x
    const y = (event.clientY - rect.top - view.root.y) / view.root.scale.y
    let best: { panel: 0 | 1; id: number } | null = null
    let bestDistance = 0.8 * 0.8
    for (const troop of world.troops) {
      if (!troop.isActive()) continue
      const at = view.troopPosition(troop, session.alpha)
      const distance = (at.x - x) ** 2 + (at.y - y) ** 2
      if (distance < bestDistance) [best, bestDistance] = [{ panel, id: troop.id }, distance]
    }
    return best
  }
  app.canvas.addEventListener('pointerdown', (e) => {
    const picked = debug.enabled ? troopUnder(e) : null
    if (picked !== null) return debug.select(picked.panel, picked.id)
    const cell = cellUnder(e)
    if (editor.tool === 'place' && cell !== null) {
      return openPlaceMenu(e.clientX, e.clientY, {
        wall: (level) => editor.placeWallAt(cell.x, cell.y, level),
        building: (type) => editor.placeBuildingAt(cell.x, cell.y, type),
        unit: (type) => editor.placeUnitAt(cell.x, cell.y, type),
      })
    }
    editor.pointer(cell, 'down')
  })
  app.canvas.addEventListener('pointermove', (e) => editor.pointer(cellUnder(e), 'move'))
  window.addEventListener('pointerup', () => editor.pointer(null, 'up'))
  app.canvas.addEventListener('pointerleave', () => editor.pointer(null, 'move'))

  const frameTimes: number[] = []
  const cpuTimes: number[] = [] // JavaScript time per frame: simulation steps, drawing calls, HUD
  let sinceDebugText = 0
  app.ticker.add((ticker) => {
    const started = performance.now()
    session.advance(ticker.deltaMS / 1000)
    const seconds = performance.now() / 1000
    editor.tick(ticker.deltaMS / 1000)
    left.update(session.classic, session.alpha, seconds)
    right.update(session.fresh, session.alpha, seconds)
    left.drawOverlay(editor.overlay())
    right.drawOverlay(editor.overlay())
    debug.observe()
    debug.ensureSelection()
    layers[0].update(session.classic, debug, seconds)
    layers[1].update(session.fresh, debug, seconds)
    sinceDebugText += ticker.deltaMS / 1000
    if (debug.enabled && sinceDebugText > 0.25) {
      sinceDebugText = 0
      const world = debug.worldOf(debug.panel)
      debugPanel.update(debug, debug.info(), debug.overview(), world, layers[debug.panel].legend)
    }
    leftHud.update(session.classic)
    rightHud.update(session.fresh)
    banner.show(session.summary())
    frameTimes.push(ticker.deltaMS)
    cpuTimes.push(performance.now() - started)
    if (frameTimes.length > 240) frameTimes.shift()
    if (cpuTimes.length > 240) cpuTimes.shift()
  })

  // Read-only handle for measurements from a test browser.
  const cellCenter = (panel: 0 | 1, x: number, y: number) => {
    const view = panel === 0 ? left : right
    const rect = app.canvas.getBoundingClientRect()
    return [rect.left + view.root.x + (x + 0.5) * view.root.scale.x, rect.top + view.root.y + (y + 0.5) * view.root.scale.y]
  }
  Object.assign(window, { demo: { session, frameTimes, cpuTimes, editor, cellCenter, debug } })
}

void main()
