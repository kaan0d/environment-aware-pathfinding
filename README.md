# environment-aware pathfinding

Pathfinding that treats the environment as a decision input, not a fixed obstacle map: breaking, crossing or walking around a wall is compared by real time cost. Demo case: units in Clash-of-Clans-like games walk around a cheap wall instead of breaking it.

Stack: TypeScript (strict), Vite, Vitest. Render layer (PixiJS) arrives in Stage 4.

## Why a fixed rule is not enough

Many games already have a rule for this: when the way around gets very long, the unit gives up on it and attacks the wall. The rule is usually a fixed limit (a path longer than N cells, or no path at all), not a comparison of what breaking the wall costs against what walking costs. So it fires at the wrong moment: a long walk around a wall a few hits would remove, or hits on a thick wall beside a short way around. Time is lost either way, and finding a long path only to drop it costs computing time too. This is an observation from playing such games, not a measurement, and no real game's code was read.

The classic AI here is the simplest form of that behavior (breaks only when no path exists). A version with a path-length limit is not built; it would be a third planner if it turns out to be the fairer opponent.

## Status

| Stage | What | State |
|---|---|---|
| 1 | Deterministic sim core and classic AI | done |
| 2 | Time-cost single-unit planner | done |
| 3 | Squad planner | done |
| 4 | Two-panel render | - |
| 5 | Editor and scenarios | - |
| 6 | Polish, debug, deploy | - |

## Usage

```
npm install
npm test        # vitest, 52 tests
npm run build   # tsc --noEmit + vite build
npm run bench   # flow field and squad planning timing
```

```ts
import { World } from './src/sim/world'
import { runComparison } from './src/sim/compare'

const world = new World(scenario)     // Scenario: walls, buildings, deployments
world.setPlanner('squad')             // 'classic' is the default; 'timecost' plans per troop
                                      // setPlanner('squad', { group: false }) = every troop alone
world.run(600)                        // or: while (!world.finished) world.step(), dt = 1/30 s
world.events                          // deploy, wallDestroyed, buildingDestroyed, troopFinished
world.stats()                         // finish time, distance, walls and buildings destroyed
world.forcePlan(troopId, plan)        // override a troop's plan
world.notifyMapChanged()              // call after editing the grid, lets troops re-plan

const { classic, timecost } = runComparison(scenario) // two finished Worlds, same deploy events
```

## How the time-cost planner works

- Cost unit is seconds. Entering an empty cell costs `length * moveCost / speed`; a wall cell adds `wallHp / dps`. Buildings are never entered, they are approached.
- One multi-source reverse Dijkstra (`planner/flowField.ts`) starts from the free cells around every living building, valued at `buildingHp / dps`, and floods the map. Each cell ends up holding "seconds until this troop has destroyed its cheapest building", plus the next cell and the target building. The best target and route fall out of the same table. A route may cross wall cells; the troop breaks them in order.
- The field is computed per troop, because speed and dps are part of the cost. Cells another troop attacks from or heads to are not used as seeds, so troops spread over free attack positions; if none is left they share one.
- Re-planning: when a wall or building is destroyed (or `notifyMapChanged()` is called) every walking or waiting troop asks again. A troop that already started hitting something finishes it. A new plan is adopted only when it is at least 10% faster than what remains of the current one (`HYSTERESIS` in `config.ts`).
- Cell behavior still comes only from `environment.ts`; a test registers a slow "mud" kind and the planner and movement pick it up without any change.

## How the squad planner works

- Troops within 5 cells of each other, directly or through a chain, form a squad (`planner/squad.ts`, re-formed at most 5 times a second). A squad shares one decision: same goal, same walls to break.
- Attack slots: a target has as many attack positions as free cells around it that the squad can walk to (`slots.ts`). The simulation now enforces it: a troop that finds its position taken walks to the nearest free one, or waits when none is left. Only the first arrivals hit, so a crowd of 50 breaks a one-position wall no faster than one troop.
- Break time (`planner/breakTime.ts`): hits start as troops arrive, at most one per position; damage is integrated piece by piece until the hit points are gone.
- Candidates: up to 6 different routes for the squad, each from a flow field that prices walls at the squad's damage (its strongest troops, as many as the wall has positions): the best free route, the full detour, other buildings, and the best route with each wall of the first one banned in turn.
- Rollout (`planner/rollout.ts`): each candidate is scored by an event-based forward estimate (arrival times, slots, break times of every wall on the route, then the building); no simulation steps. Walls in a row are counted with the earlier ones already gone.
- The lowest estimate wins, and the squad keeps its present plan unless the winner is at least 10% faster. A squad in which someone already started hitting keeps its plans until the target falls.
- `planner.lastPlanMs` holds the time of the latest squad decision.

## Results

Same L-corner map as Stage 1, one troop, time to destroy the depot behind the wall. Classic / time-cost, in seconds; `break` marks the runs where the time-cost planner hit the wall:

| wall level (hp) | fast (4 c/s, 20 dps) | balanced (2.5 c/s, 50 dps) | heavy (1.5 c/s, 150 dps) |
|---|---|---|---|
| 1 (100) | 23.50 / 21.10 break | 19.57 / 9.70 break | 24.57 / 5.37 break |
| 2 (250) | 23.50 / 23.50 | 19.57 / 12.67 break | 24.57 / 6.37 break |
| 3 (500) | 23.50 / 23.50 | 19.57 / 17.70 break | 24.57 / 8.03 break |
| 4 (1000) | 23.50 / 23.50 | 19.57 / 19.57 | 24.57 / 11.37 break |
| 5 (2000) | 23.50 / 23.50 | 19.57 / 19.57 | 24.57 / 18.03 break |

Other measurements:

- Prediction: `estTotalTime` against the real finish time, single unit, 9 runs (3 unit types x 3 wall levels): worst error 1.0%.
- Nearer depot behind level 5 walls vs a farther open depot: the time-cost planner destroys the open one first (12.87 s, classic reaches its first depot at 49.63 s). Total time for both depots is 68.20 s against classic's 65.83 s, because it picks greedily per target, not the best order.
- A wall broken by another troop: a fast troop that first chose the detour switches to the new hole, 8.83 s against classic's 24.50 s.
- Hysteresis: a route 4.6% faster is ignored, a route 23% faster is taken.
- Flow field, one compute over a map with 30% walls and 10 buildings: 0.58 ms mean on 40x28, 6.1 ms mean on 100x100 (Node 22, one machine).

### Stage 3: groups

Level 4 wall (1,000 hp) on the L-corner map, balanced troops deployed together. Time to destroy the depot, in seconds:

| troops | classic | squad planner | squad decision |
|---|---|---|---|
| 1 | 19.57 | 19.57 | walks around |
| 2 | 16.63 | 15.13 | breaks |
| 3 | 15.73 | 10.97 | breaks |
| 4 | 15.27 | 10.57 | breaks |
| 8 | 14.90 | 10.17 | breaks |

The switch from walking around to breaking happens at 2 troops for this wall. More troops help less and less because only 3 positions touch the wall.

- Attack slots: a wall with 1 free position falls after 22.03 s for 3, 8 and 50 troops alike. A wall with 3 positions falls after 9.00 s for 3, 8 and 50 troops. The rollout predicted 22.03 s and 8.97 s.
- Troops still walking: one troop next to the wall plus ten arriving 4 cells later. Alone it would walk around; with the others counted the squad breaks the wall. Estimated 10.65 s, real 10.63 s.
- Two layers (level 1 outside, level 3 inside, then the depot): predicted 3.77 / 14.17 / 20.57 s, real 3.80 / 14.20 / 20.63 s. A far open depot beats a near one behind both layers.
- Oracle: 200 random 15x15 maps, groups of 1 to 9 troops. Every candidate plan is run in the real simulation with the plan forced. The planner's pick is within 5% of the best candidate's real time in 200 of 200 maps (worst 1.021), and the estimate is off by 1.2% on average. On two fresh sets of 200 maps (not used while tuning) it is 199 and 198 within 5%, worst 1.146 and 1.107, mean error 1.2%.
- With group behavior off, results are identical to the time-cost planner on five maps.
- Planning cost, 40x28 map with 20% walls, 10 groups of 5 troops: 25 ms for one full round, about 2.4 ms per group. The target was 3 ms for the whole round, so it is missed by about 8x. Before stopping the searches early it was 57 ms. Flow field alone: 0.57 ms (40x28), 6.0 ms (100x100).

## Limits

- Candidates are scored by when their own target falls, so the order of buildings is still greedy (the walled-depot map finishes in 68.20 s, the same as the single-unit planner).
- Planning speed misses the 3 ms target for a full round; each group costs about 2.4 ms and every wall or building destroyed asks all groups again. Caching fields, or asking only the affected groups, would be the next step.
- The oracle compares the planner's candidates with each other, not with every possible plan. The maps have one deploy point, so every group starts on one cell.
- Slot counting for later walls in a row is approximate (earlier walls are treated as gone, other groups' positions are not predicted).
- Squads are re-formed only 5 times a second; a group that splits or merges in between keeps its old plans until then.
- Attack positions are the 8 neighbors of a target's footprint.
