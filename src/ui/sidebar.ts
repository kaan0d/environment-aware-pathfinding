import { BLANK, SCENARIOS } from '../scenarios'
import { BUILDING_TYPES, squadSettings, TROOP_TYPES } from '../sim/config'
import { validateScenario } from '../sim/scenario'
import type { Editor } from './editor'
import type { Session } from './session'

const DEFAULT_TROOPS = JSON.parse(JSON.stringify(TROOP_TYPES)) as typeof TROOP_TYPES
const DEFAULT_SQUAD = { ...squadSettings }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

function section(title: string): HTMLElement {
  const box = el('section', 'box')
  box.append(el('h3', '', title))
  return box
}

interface Slider {
  row: HTMLElement
  set(value: number): void
}

function slider(label: string, min: number, max: number, step: number, onInput: (value: number) => void): Slider {
  const row = el('label', 'slider')
  const name = el('span', '', label)
  const value = el('b')
  const input = el('input')
  input.type = 'range'
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.addEventListener('input', () => {
    value.textContent = input.value
    onInput(Number(input.value))
  })
  row.append(name, value, input)
  return {
    row,
    set(v) {
      input.value = String(v)
      value.textContent = String(v)
    },
  }
}

function select(options: Array<[string, string]>, onChange: (value: string) => void): HTMLSelectElement {
  const element = el('select')
  for (const [value, label] of options) element.add(new Option(label, value))
  element.addEventListener('change', () => onChange(element.value))
  return element
}

// The right-hand panel: scenario choice, editor tools, unit and algorithm settings. Returns a refresh function
// the editor calls after the scenario changed.
export function buildSidebar(root: HTMLElement, session: Session, editor: Editor): () => void {
  const entries = [...SCENARIOS, BLANK]

  // Scenario
  const scenarioBox = section('Scenario')
  const scenarioSelect = select(entries.map((e) => [e.id, e.name]), (id) => {
    session.load(entries.find((e) => e.id === id)!.scenario)
    editor.selection = null
    refresh()
  })
  const description = el('p', 'description')
  const problems = el('ul', 'problems')
  scenarioBox.append(scenarioSelect, description, problems)

  // Editor: unit type for "Add unit", the place-menu's default troop, and units-per-drop.
  // Wall/building/unit placement itself is the Place tool's click menu (src/ui/placeMenu.ts), not a preset here.
  const toolBox = section('Editor')
  const troopLabel = el('label', 'field')
  troopLabel.append(el('span', '', 'Unit type to add'))
  const troopSelect = select(Object.values(TROOP_TYPES).map((t) => [t.id, t.name]), (v) => {
    editor.troopType = v
    refresh()
  })
  troopLabel.append(troopSelect)
  const drop = slider('Units per drop', 1, 30, 1, (v) => (editor.dropCount = v))
  const dropButtons = el('div', 'tools')
  const atSpawns = el('button', '', 'Add unit')
  atSpawns.addEventListener('click', () => editor.deployAtSpawns())
  const clear = el('button', '', 'Clear units')
  clear.addEventListener('click', () => {
    session.clearUnits()
    refresh()
  })
  dropButtons.append(atSpawns, clear)
  const spawnListLabel = el('p', 'description', 'Will spawn:')
  const spawnList = el('ul', 'spawn-list')
  toolBox.append(troopLabel, drop.row, dropButtons, spawnListLabel, spawnList)

  // Selected object
  const selectedBox = section('Selected')
  const selectedText = el('p', 'description')
  const hpInput = el('input')
  hpInput.type = 'number'
  hpInput.min = '1'
  const hpApply = el('button', '', 'Set hit points')
  hpApply.addEventListener('click', () => editor.setSelectedHp(Number(hpInput.value)))
  selectedBox.append(selectedText, hpInput, hpApply)

  // Unit types
  const unitBox = section('Unit type')
  const speed = slider('Speed (cells/s)', 0.5, 8, 0.5, (v) => setTroop('speed', v))
  const dps = slider('Damage per second', 5, 300, 5, (v) => setTroop('dps', v))
  const hp = slider('Hit points (shown only)', 10, 1000, 10, (v) => setTroop('hp', v))
  const defaults = el('button', '', 'Restore defaults')
  defaults.addEventListener('click', () => {
    for (const id of Object.keys(DEFAULT_TROOPS)) Object.assign(TROOP_TYPES[id], DEFAULT_TROOPS[id])
    session.reset()
    refresh()
  })
  unitBox.append(speed.row, dps.row, hp.row, defaults)
  const setTroop = (key: 'speed' | 'dps' | 'hp', value: number) => {
    TROOP_TYPES[editor.troopType][key] = value
    session.reset()
  }

  // Algorithm and walls
  const algoBox = section('Algorithm')
  const group = el('label', 'check')
  const groupInput = el('input')
  groupInput.type = 'checkbox'
  groupInput.addEventListener('change', () => {
    session.groupBehavior = groupInput.checked
    session.reset()
  })
  group.append(groupInput, ' Groups share a plan')
  const stack = el('label', 'check')
  const stackInput = el('input')
  stackInput.type = 'checkbox'
  stackInput.addEventListener('change', () => {
    session.scenario.stackAttackers = stackInput.checked
    session.reset()
  })
  stack.append(stackInput, ' Attackers can share a cell')
  const stackHint = el('p', 'description', 'On: any number of units hit a wall or building from the same cell. Off: one attacker per free cell around the target, the rest wait.')
  const radius = slider('Squad radius (cells)', 0, 12, 1, (v) => {
    squadSettings.radius = v
    session.reset()
  })
  const candidates = slider('Candidate plans (K)', 1, 8, 1, (v) => {
    squadSettings.maxCandidates = v
    session.reset()
  })
  const wallScale = slider('Wall hit points x', 0.25, 4, 0.25, (v) => {
    session.scenario.wallHpScale = v
    session.reset()
  })
  const restoreAlgo = el('button', '', 'Restore defaults')
  restoreAlgo.addEventListener('click', () => {
    Object.assign(squadSettings, DEFAULT_SQUAD)
    session.groupBehavior = true
    session.scenario.stackAttackers = true
    session.scenario.wallHpScale = 1
    session.reset()
    refresh()
  })
  algoBox.append(stack, stackHint, group, radius.row, candidates.row, wallScale.row, restoreAlgo)

  root.append(scenarioBox, toolBox, selectedBox, unitBox, algoBox)

  function refresh(): void {
    const entry = entries.find((e) => e.id === scenarioSelect.value) ?? entries[0]
    description.textContent = entry.description
    const { errors, warnings } = validateScenario(session.scenario)
    problems.replaceChildren(...[...errors.map((t) => ['error', t]), ...warnings.map((t) => ['warning', t])].map(([kind, text]) => el('li', kind, text)))
    troopSelect.value = editor.troopType
    drop.set(editor.dropCount)
    const counts = new Map<string, number>()
    for (const d of session.scenario.deployments) counts.set(d.troopType, (counts.get(d.troopType) ?? 0) + 1)
    spawnList.replaceChildren(
      ...(counts.size === 0
        ? [el('li', '', 'Nothing queued yet.')]
        : [...counts].map(([type, count]) => el('li', '', `${count}× ${TROOP_TYPES[type]?.name ?? type}`))),
    )
    const troop = TROOP_TYPES[editor.troopType]
    speed.set(troop.speed)
    dps.set(troop.dps)
    hp.set(troop.hp)
    groupInput.checked = session.groupBehavior
    stackInput.checked = session.scenario.stackAttackers ?? true
    radius.set(squadSettings.radius)
    candidates.set(squadSettings.maxCandidates)
    wallScale.set(session.scenario.wallHpScale ?? 1)
    const selection = editor.selection
    selectedBox.hidden = selection === null
    if (selection !== null) {
      const target = selection.kind === 'wall' ? session.scenario.walls[selection.index] : session.scenario.buildings[selection.index]
      selectedText.textContent = selection.kind === 'wall' ? `Wall, level ${(target as { level: number }).level}` : `Building: ${BUILDING_TYPES[(target as { type: string }).type].name}`
      hpInput.value = String(target.hp ?? (selection.kind === 'wall' ? '' : BUILDING_TYPES[(target as { type: string }).type].hp))
      hpInput.placeholder = 'level default'
    }
  }
  refresh()
  return refresh
}
