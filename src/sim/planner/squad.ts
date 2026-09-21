import type { Troop } from '../troop'

// Groups the given troops: two troops share a squad when they are within `radius` cells of each other,
// directly or through a chain of others. Returns member lists in troop id order, squads ordered by lowest id.
// ponytail: O(n^2) pair scan is fine for a few hundred troops; use a spatial hash beyond that.
export function clusterSquads(troops: readonly Troop[], radius: number): Troop[][] {
  const root = troops.map((_, i) => i)
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])))
  const radiusSq = radius * radius
  for (let i = 0; i < troops.length; i++) {
    for (let j = i + 1; j < troops.length; j++) {
      const dx = troops[i].x - troops[j].x
      const dy = troops[i].y - troops[j].y
      if (dx * dx + dy * dy <= radiusSq) root[find(j)] = find(i)
    }
  }
  const squads = new Map<number, Troop[]>()
  troops.forEach((troop, i) => {
    const key = find(i)
    const members = squads.get(key)
    if (members) members.push(troop)
    else squads.set(key, [troop])
  })
  return [...squads.values()]
}
