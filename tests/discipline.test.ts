import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SIM_DIR = join(__dirname, '..', 'src', 'sim')

function simFiles(dir = SIM_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? simFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  )
}

const files = simFiles().map((path) => ({ path, source: readFileSync(path, 'utf8') }))
const outsideRegistry = files.filter((f) => !f.path.endsWith('environment.ts'))

describe('source discipline', () => {
  it('never compares against a cell kind outside environment.ts', () => {
    const comparison = /(===|!==|==|!=)\s*CellKind\b|CellKind\.\w+\s*(===|!==|==|!=)|case\s+CellKind\b|\b(WALL|BUILDING)\b/
    const offenders = outsideRegistry.filter((f) => comparison.test(f.source)).map((f) => f.path)
    expect(offenders).toEqual([])
  })

  it('keeps DOM and Pixi out of the sim', () => {
    const forbidden = /from\s+['"]pixi\.js['"]|\bdocument\.|\bwindow\./
    const offenders = files.filter((f) => forbidden.test(f.source)).map((f) => f.path)
    expect(offenders).toEqual([])
  })
})
