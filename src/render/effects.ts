import type { Graphics } from 'pixi.js'
import { mulberry32 } from '../sim/rng'

const MAX_PARTICLES = 360 // a hard cap; when the pool is full new particles are simply dropped

export type ParticleKind = 'spark' | 'dust' | 'chunk'

// Fixed-size particle pool for hit sparks, dust and stone chunks. Positions are in cell units.
// It only decorates the picture: it has its own random generator and never touches the simulation.
export class Effects {
  private readonly x = new Float32Array(MAX_PARTICLES)
  private readonly y = new Float32Array(MAX_PARTICLES)
  private readonly vx = new Float32Array(MAX_PARTICLES)
  private readonly vy = new Float32Array(MAX_PARTICLES)
  private readonly life = new Float32Array(MAX_PARTICLES) // seconds left, 0 = free slot
  private readonly maxLife = new Float32Array(MAX_PARTICLES)
  private readonly size = new Float32Array(MAX_PARTICLES)
  private readonly color = new Uint32Array(MAX_PARTICLES)
  private readonly kind = new Uint8Array(MAX_PARTICLES)
  private readonly random = mulberry32(20240921)
  private cursor = 0

  get active(): number {
    let count = 0
    for (let i = 0; i < MAX_PARTICLES; i++) if (this.life[i] > 0) count++
    return count
  }

  emit(kind: ParticleKind, x: number, y: number, count: number, color: number): void {
    for (let n = 0; n < count; n++) {
      const slot = this.freeSlot()
      if (slot < 0) return
      const angle = this.random() * Math.PI * 2
      const speed = kind === 'dust' ? 0.3 + this.random() * 0.6 : 1.2 + this.random() * 2.2
      this.x[slot] = x + (this.random() - 0.5) * 0.3
      this.y[slot] = y + (this.random() - 0.5) * 0.3
      this.vx[slot] = Math.cos(angle) * speed
      this.vy[slot] = Math.sin(angle) * speed - (kind === 'dust' ? 0.2 : 1.2)
      this.maxLife[slot] = this.life[slot] = kind === 'dust' ? 0.7 + this.random() * 0.4 : kind === 'chunk' ? 0.6 + this.random() * 0.3 : 0.25 + this.random() * 0.2
      this.size[slot] = kind === 'dust' ? 0.12 + this.random() * 0.1 : kind === 'chunk' ? 0.07 + this.random() * 0.06 : 0.04 + this.random() * 0.03
      this.color[slot] = color
      this.kind[slot] = kind === 'spark' ? 0 : kind === 'dust' ? 1 : 2
    }
  }

  update(seconds: number): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue
      this.life[i] -= seconds
      this.x[i] += this.vx[i] * seconds
      this.y[i] += this.vy[i] * seconds
      if (this.kind[i] !== 1) this.vy[i] += 5 * seconds // sparks and chunks fall, dust drifts
      else this.vx[i] *= 1 - 1.5 * seconds
    }
  }

  draw(g: Graphics): void {
    g.clear()
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue
      const fade = this.life[i] / this.maxLife[i]
      if (this.kind[i] === 1) g.circle(this.x[i], this.y[i], this.size[i] * (2 - fade)).fill({ color: this.color[i], alpha: 0.55 * fade })
      else if (this.kind[i] === 2) g.rect(this.x[i] - this.size[i], this.y[i] - this.size[i], this.size[i] * 2, this.size[i] * 2).fill({ color: this.color[i], alpha: fade })
      else g.circle(this.x[i], this.y[i], this.size[i]).fill({ color: this.color[i], alpha: fade })
    }
  }

  private freeSlot(): number {
    for (let n = 0; n < MAX_PARTICLES; n++) {
      const i = (this.cursor + n) % MAX_PARTICLES
      if (this.life[i] <= 0) {
        this.cursor = i + 1
        return i
      }
    }
    return -1
  }
}
