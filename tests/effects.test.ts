import { describe, expect, it } from 'vitest'
import { Effects } from '../src/render/effects'

describe('Effects', () => {
  it('never holds more particles than its fixed pool and drops the rest', () => {
    const effects = new Effects()
    for (let i = 0; i < 100; i++) effects.emit('dust', 5, 5, 20, 0xffffff)
    expect(effects.active).toBeLessThanOrEqual(360)
    expect(effects.active).toBeGreaterThan(300)
  })

  it('lets every particle expire and frees the slots for reuse', () => {
    const effects = new Effects()
    effects.emit('chunk', 1, 1, 50, 0xaaaaaa)
    for (let i = 0; i < 40; i++) effects.update(0.05)
    expect(effects.active).toBe(0)
    effects.emit('spark', 1, 1, 10, 0xffffff)
    expect(effects.active).toBe(10)
  })
})
