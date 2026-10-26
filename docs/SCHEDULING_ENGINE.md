# SCHEDULING_ENGINE.md

Design of the scheduling core: inputs, the student-clash (audience) rules, hard constraints, the validator, soft-preference scoring, the pre-check, the generator, manual-move support and dated exceptions. Product rules are in `PRODUCT_REQUIREMENTS.md` section 6.

Location: `packages/core` (moved from `apps/web/src/lib/timetable/` in Phase 2). Pure TypeScript: no React, browser, database or Node-only APIs, so the same code runs in the browser, the API and the worker (`ARCHITECTURE.md` A3).

Status: the prototype implements whole-section classes with one teacher, H1–H8 (single-teacher form) and completeness reporting, with 51 passing tests. Everything about audiences, co-teaching, features, parallel groups, rules, avoid/prefer and repair search is design.

---

## 1. Modules

| Module | Responsibility | Prototype file |
| --- | --- | --- |
| `grid` | Days, periods, breaks, valid starts, time formatting | `grid.ts` (kept) |
| `audience` | Audience atoms, strength, the student-overlap predicate | new |
| `clash` | Time overlap; teacher, room and student clash predicates | logic inside `validator.ts` today |
| `validator` | Full hard-constraint check and completeness report | `validator.ts` (extended) |
| `capacity` | Per-teacher feasibility (daily limits, lab blocks) | `capacity.ts` (extended) |
| `precheck` | All feasibility checks before generation | new |
| `score` | Soft-preference penalties | inside `scheduler.ts` today |
| `generator` | Construct, repair, improve | `scheduler.ts` (stage 1) |
| `moves` | Valid targets for an entry, applying operations | `moves.ts` (made incremental) |
| `effective` | Published version + exceptions + holidays for a date | new |
| `explain` | Plain-language reasons for unplaced sessions | inside `scheduler.ts` today |
| `reference` (tests only) | Deliberately simple brute-force checker written separately from `validator` | new |

## 2. Input snapshot

The generator and validator take one normalised, immutable input:

```ts
type SchedulingInput = {
  grid: TimeGrid;                         // days, periods, breaks
  rooms: { id; type; capacity; features: Record<string, number | boolean>; ownerDepartmentId?; sharedWith? }[];
  teachers: { id; departmentId; maxPerDay; maxPerWeek? }[];
  availability: Record<TeacherId, { cannot: SlotKey[]; avoid: SlotKey[]; prefer: SlotKey[] }>;
  requirements: {
    id; offeringId; component; departmentId;
    audience: Audience; strength: number; // strength derived from sections, batches or elective enrolment
    teacherIds: string[]; sessionsPerWeek: number; span: number;
    roomType; roomFeatures: { key; min? }[]; fixedRoomId?; preferredRoomIds?: string[];
    parallelGroupId?; maxPerDay?: number;   // optional hard daily cap
  }[];
  rules: { weights: Record<PreferenceId, 0 | 1 | 2 | 3>; values: { maxConsecutive?: number }; hardRules: HardRule[] };
  locked: Entry[];                        // must appear unchanged in any result
  current?: Entry[];                      // existing placements, for the stability preference
};
```

Snapshots are stored with a hash (`DATABASE_DESIGN.md` 4.8), so a run can be reproduced exactly.

Room eligibility for a requirement: `type` matches, `capacity ≥ strength`, every required feature present (numeric features at least the minimum), the room is owned by the requirement's department or shared with it (or with all), and `fixedRoomId` if set.

## 3. Audiences and the student-clash rule

### 3.1 Atoms

Each audience expands to **atoms**:

| Audience | Atoms |
| --- | --- |
| Whole section `S` | `(sec, S)` |
| Combined class of sections `S1..Sn` | `(sec, S1) … (sec, Sn)` |
| Batch `B` of batch set `T` in section `S` | `(bat, S, T, B)` |
| Batches of several sections (combined batch class) | one `bat` atom per batch |
| Option `O` of elective group `G` with participating sections `S1..Sn` | `(ele, S1, G, O) … (ele, Sn, G, O)` |

### 3.2 Overlap of two atoms

Two atoms can share a student only if they are about the **same section**. For atoms `x`, `y` of section `S`:

| `x` \ `y` | `(sec,S)` | `(bat,S,T',B')` | `(ele,S,G',O')` |
| --- | --- | --- | --- |
| `(sec,S)` | overlap | overlap | overlap |
| `(bat,S,T,B)` | overlap | overlap if `T ≠ T'` or `B = B'`; **disjoint if `T = T'` and `B ≠ B'`** | overlap |
| `(ele,S,G,O)` | overlap | overlap | overlap if `G ≠ G'` or `O = O'`; **disjoint if `G = G'` and `O ≠ O'`** |

Two audiences **overlap** if any atom of one overlaps any atom of the other. Two sessions have a **student clash** (H3) if their audiences overlap and their times overlap.

This is exactly the table in `PRODUCT_REQUIREMENTS.md` 6.3. Properties checked by tests: the relation is symmetric; an audience always overlaps itself; batches of one set are pairwise disjoint; adding atoms never removes an overlap.

### 3.3 Strength

- Section: section strength. Combined class: sum of section strengths.
- Batch: batch strength (sum across sections for combined batch classes).
- Elective option: sum of the option's enrolment counts over participating sections.

Capacity (H5) compares the room capacity with this strength.

## 4. Hard constraints

Issue kinds extend the prototype's (`teacher`, `room`, `section` → `student`, `availability`, `capacity`, `roomType`, `grid`, `dailyLimit`, `requirement`, `duplicate`, `reference`) with `weeklyLimit`, `feature`, `roomAccess`, `parallel`, `rule`, `lock`.

| Id | Check | Issue kind |
| --- | --- | --- |
| H1 | For each pair of entries overlapping in time: a shared teacher id → clash | `teacher` |
| H2 | Same room and overlapping time → clash | `room` |
| H3 | Overlapping audiences (section 3) and overlapping time → clash | `student` |
| H4 | No covered period of an entry is in any of its teachers' `cannot` set | `availability` |
| H5 | Room type matches; capacity ≥ strength; features present; room owned by or shared with the department | `roomType`, `capacity`, `feature`, `roomAccess` |
| H6 | Whole-number periods; `1 ≤ start`, `start + span − 1 ≤ periodCount(day)`; no break inside the block; `span` equals the requirement's span | `grid`, `requirement` |
| H7 | Per teacher: periods per day ≤ `maxPerDay`; per week ≤ `maxPerWeek` | `dailyLimit`, `weeklyLimit` |
| H8 | Entries per requirement ≤ `sessionsPerWeek`; at most `maxPerDay` per day when the requirement sets one; entry teachers, audience, offering and component equal the requirement's; requirement exists; ids unique | `requirement`, `reference`, `duplicate` |
| H9 | Every locked entry is present and unchanged | `lock` |
| H10 | Never/only hard rules respected | `rule` |
| H11 | All entries of a parallel group start at the same day and period (one per requirement per occurrence) | `parallel` |
| H12 | On dates: no class on a holiday; effective timetable satisfies H1–H11 for that date | (date-level issues) |

**Completeness** is separate: `missing[]` lists requirements with fewer placed sessions than `sessionsPerWeek`. The report has `valid` (no hard issues) and `complete` (no missing) as in the prototype since Phase 0.

### 4.1 Validator independence

- The validator **does not share placement logic** with the generator (CLAUDE.md rule 1, kept). Both use the same small predicate functions (`timeOverlap`, `audiencesOverlap`, room eligibility), because the definition of a clash must be single.
- Those predicates are tested against `reference`, a separately written brute-force checker (period-by-period occupancy with explicit atom expansion), on random timetables (property tests, AC-S2). A bug in the shared predicate would therefore be caught by disagreement with the reference.

### 4.2 Efficiency

The prototype validator is pairwise O(n²) (about 90 ms at 1,480 sessions). The extended validator buckets entries by day and by resource (teacher, room, section atom) and compares only within buckets, making typical cost close to linear. The API runs it inside edit transactions (`DATABASE_DESIGN.md` 6.3), so it must stay well under one second for the largest supported college (target to confirm in Phase 7).

## 5. Soft preferences and score

Each preference produces a non-negative penalty; the total score is `Σ weightFactor(w) × penalty`, with weight factors Off = 0, Low = 1, Medium = 3, High = 9. Lower is better. The report shows the total and each preference's share, in plain language ("CSE 3A has 6 gaps a week").

| Id | Penalty |
| --- | --- |
| SP1 | For each audience, each extra session of the same offering on one day |
| SP2 | For each audience and day, number of empty periods between its first and last class |
| SP3 | For each teacher, variance of daily periods across working days |
| SP4 | For each teacher, periods beyond the college's maximum consecutive run |
| SP5 | Sessions in the first or last period of a day |
| SP6 | Multi-period sessions starting before the break |
| SP7 | Periods placed in a teacher's `avoid` cells; minus a bonus for `prefer` cells (floored at zero) |
| SP8 | Number of distinct rooms used by each section's lectures beyond one |
| SP9 | Building changes between consecutive periods for teachers and audiences |
| SP10 | Entries that differ from `current` (stability during repair or regeneration) |

Presets set the weights (`PRODUCT_REQUIREMENTS.md` 6.2). Preferences never override hard constraints.

## 6. Pre-check

Runs synchronously before generation and on the setup checklist. Each item has a severity, a plain-language message, and a link target.

| Check | Severity |
| --- | --- |
| Requirement with no eligible room (type, capacity, features, access) | Blocking |
| Teacher load cannot fit availability, daily limits or multi-period blocks (`capacity`, as built in Phase 0) | Blocking |
| Audience needs more periods per week than the grid offers (counting atoms per section) | Blocking |
| Parallel group with mismatched spans or overlapping teachers or rooms | Blocking |
| Elective group whose enrolment counts do not cover each participating section | Blocking |
| Contradictory hard rules, or locks that clash | Blocking |
| Offering hours not covered by assignments | Warning |
| Teacher with no availability recorded (all treated as available) | Warning |
| Room type demand above 85% of that type's capacity in periods | Warning |

## 7. Generator

### 7.1 Stages

1. **Construct (greedy).** The prototype's algorithm, extended: sessions ordered by difficulty (fewest feasible slot × room options, longer spans first, parallel groups as one bundle); each placed in its lowest-penalty feasible slot, keeping an incremental occupancy index (teachers, rooms, audience atoms, teacher day loads). Retries with failed sessions first; keeps the best attempt.
2. **Repair.** For each unplaced session, search for a placement by moving blocking sessions (ejection chains up to a small depth), never moving locked entries, accepting only states with no hard violation.
3. **Improve.** Local search on the soft score using moves and swaps, accepting worse moves with a decreasing probability (simulated annealing driven by the seeded random generator), never accepting a hard violation.

The result is the best state found: fewest unplaced sessions, then lowest score.

### 7.2 Determinism and time limits

- All randomness comes from a seeded generator (mulberry32 in the prototype).
- The run's work is bounded by a **step budget** derived from the chosen setting; the step budget, not the clock, defines the result. A wall-clock limit (2, 5 or 10 minutes) is a safety stop.
- Same snapshot + seed + step budget ⇒ identical result (AC-S6). If a run is stopped by the clock, it records the steps completed; repeating it with that step count reproduces it.

### 7.3 Running

- In the worker, the generator runs in a `worker_threads` thread with memory and time limits (D11). Progress (`placed`, `total`, `bestScore`, `steps`) is posted every few hundred steps and stored on the run.
- Cancellation is checked between steps; a cancelled run stores nothing as a result.
- The result is checked by the validator in the worker before it is stored, and again inside the transaction that applies it to the draft.

### 7.4 Scope

- MVP: whole college (GEN-2). Locked entries are fixed inputs.
- P2: partial regeneration treats every entry outside the chosen departments, sections or days as locked.

## 8. Unplaced-session explanations

For each unplaced session, reasons in this order, each in plain language with numbers:

1. No eligible room (which property fails: type, capacity, features, access), and the closest room.
2. Teacher capacity problems (`capacity` messages, e.g. "with a daily limit of 5 periods the available days allow only 10").
3. Audience over-subscribed for the week.
4. Never/only rules or parallel group requirements that leave no slot.
5. Contention: of the slots that were otherwise possible, how many were blocked by each teacher, the audience, rooms, or daily limits (the prototype's counting, extended to audiences).

## 9. Manual moves and suggestions

- `moveOptions(input, entries, entryId)` returns every valid (day, start, room) and, for invalid slots, the first blocking reason. It uses the incremental occupancy index (constant-time checks per candidate) instead of revalidating the whole timetable per candidate (fixes `PRODUCT_AUDIT.md` section 4.2, finding S1: 5 s at 740 sessions).
- `applyOperations(input, entries, ops)` returns the new entries and the validation delta used by the edit transaction's "no new violation" rule.
- The browser uses the same functions for instant feedback; the API repeats the check authoritatively inside the transaction.

## 10. Dated exceptions

- `effectiveTimetable(version, exceptions, holidays, date)` returns the classes that actually run on a date: base entries for the weekday, minus cancelled, with room changes, substitutes and moves applied, and nothing on holidays.
- New exceptions are validated against the effective timetable of that date with the H1–H11 predicates (H12).
- `substituteOptions(date, entry)` ranks teachers who are free and available at that time, below their daily limit on that date, preferring the same department and lighter load that day.

## 11. Performance targets (to verify)

| Fixture | Measured (prototype, Phase 0 audit) | Target |
| --- | --- | --- |
| Sample college, 74 sessions | Generate about 30 ms; validate about 1 ms | Same |
| 5× sample, 370 sessions | Generate about 150 ms | Same |
| 20× sample, 1,480 sessions | Generate about 1 s; validate about 90 ms | Validate under 200 ms with bucketing |
| Realistic college: 20 sections with batches, 40 teachers, 30 rooms (fixture to build) | – | Complete and valid within the 2-minute setting (proposal, D11) |
| Move options for one entry, 740 sessions | About 5 s | Under 100 ms |

Benchmarks run in CI on fixed fixtures and fail the build on large regressions.

## 12. Tests

- **Unit:** every module, including each row of the audience-overlap table and each hard constraint (pass and fail cases).
- **Property:** validator verdict equals the `reference` checker on random timetables; generator output always passes the validator; audience overlap is symmetric; moves suggested by `moveOptions` always validate.
- **Fixtures:** feasible (sample college, batch-heavy engineering college, elective-heavy arts college) and infeasible (no room, over-committed teacher, impossible parallel group); each infeasible fixture asserts the expected reasons.
- **Determinism:** same snapshot, seed and step budget give identical results.
- **Regression corpus:** every scheduling bug found gets a fixture.
