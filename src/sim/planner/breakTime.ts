// Seconds until a target with `hp` falls when troops start hitting as they arrive and only the first `slots`
// arrivals get an attack position. arrivals is sorted ascending, dps is aligned with it, times share one clock.
// Returns Infinity when nobody can ever hit. Cost O(k) after the sort.
export function breakTime(hp: number, arrivals: ArrayLike<number>, dps: ArrayLike<number>, slots: number): number {
  const hitters = Math.min(slots, arrivals.length)
  let remaining = hp
  let rate = 0
  for (let i = 0; i < hitters; i++) {
    if (arrivals[i] === Infinity) break
    rate += dps[i]
    const nextArrival = i + 1 < hitters ? arrivals[i + 1] : Infinity
    const damageUntilNext = rate * (nextArrival - arrivals[i])
    if (damageUntilNext >= remaining) return arrivals[i] + remaining / rate
    remaining -= damageUntilNext
  }
  return Infinity
}
