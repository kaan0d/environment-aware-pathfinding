# environment-aware pathfinding

Pathfinding that treats the environment as a decision input, not a fixed obstacle map: breaking, crossing or walking around a wall is compared by real time cost. Demo case: units in Clash-of-Clans-like games walk around a cheap wall instead of breaking it.

Stack: TypeScript (strict), Vite, Vitest. Render layer (PixiJS) arrives in Stage 4.

## Status

| Stage | What | State |
|---|---|---|
| 1 | Deterministic sim core and classic AI | done |
| 2 | Time-cost single-unit planner | - |
| 3 | Squad planner | - |
| 4 | Two-panel render | - |
| 5 | Editor and scenarios | - |
| 6 | Polish, debug, deploy | - |

## Usage

```
npm install
npm test        # vitest
npm run build   # tsc --noEmit + vite build
```

```ts
import { World } from './src/sim/world'

const world = new World(scenario)   // Scenario: walls, buildings, deployments
while (!world.finished) world.step() // fixed step, dt = 1/30 s
world.events                         // deploy, wallDestroyed, buildingDestroyed, troopFinished
world.stats()                        // finish time, distance, walls and buildings destroyed
world.forcePlan(troopId, plan)       // override a troop's plan (used by tests and later planners)
```

## Stage 1 result

`src/sim` is pure (no DOM, no Pixi). Cell behavior lives only in `src/sim/environment.ts`; a test scans the sim for kind comparisons elsewhere.

L-corner map, one balanced troop, level 1 wall (100 hp), depot behind the wall:

| Plan | Time to destroy the depot |
|---|---|
| Classic (walks around) | 19.57 s |
| Forced direct wall hit | 9.70 s |

15 tests: determinism, no corner cutting, one attacker per slot, no-path fallback, multi-cell building slots, source discipline.

## Limits

- Classic AI only. It replans only when its own target is destroyed.
- Troops ignore `moveCost` while walking (all kinds cost 1 so far).
- Attack positions are the 8 neighbors of a target's footprint.
