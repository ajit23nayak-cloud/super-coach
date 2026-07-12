# Mind Check-in and Choice Coaching Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Extend Mind mode with structured 1–5 energy and positive-emotion checks, then diagnose the situation and require Ajit to choose between two non-absolute responses.

**Architecture:** Add a separate `mindCheckIns` record rather than overloading the existing decision log. A pure TypeScript domain function validates the check-in and creates a non-clinical choice frame. The API first returns the diagnosis and two options without writing; only Ajit's explicit A/B selection persists the completed check-in. Telegram follows the same staged flow one question per turn.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest, Convex internal functions plus authenticated HTTP actions, Hermes Telegram skill.

---

## Current context and assumptions

- Existing Mind mode stores decisions in `decisions`; preserve that table and API unchanged.
- Existing crisis detection and exact India handoff remain higher priority than normal coaching.
- Scale anchors:
  - Energy: `1 = depleted`, `5 = highly energized`.
  - Positive emotion: `1 = none/very low`, `5 = strong positive emotion`.
- “Diagnose” means a plain-language pattern assessment, not a clinical or physiological diagnosis.
- Every normal check-in returns exactly two options with tradeoffs and asks Ajit to choose A or B.
- No option is executed automatically. Any Career action still requires separate explicit confirmation.
- The repository currently has unrelated dirty Telegram and paused Cloudflare work. Isolate that work before implementing this plan.

---

### Task 0: Isolate current work before touching Mind

**Objective:** Prevent the Mind feature from being mixed with Telegram-navigation and paused Cloudflare changes.

**Files:**
- Inspect only: current Git worktree

**Step 1: Inspect the worktree**

Run:

```bash
git status --short
git diff --stat
```

Expected: Telegram Home/Super fixes plus paused OpenNext/Cloudflare files are visible.

**Step 2: Finish and commit the Telegram bug separately**

Run its focused tests first:

```bash
python -m unittest hermes/super-coach/tests/test_send_telegram_menu.py -v
```

Expected: `13 tests ... OK` or higher.

Commit only the Telegram navigation/Super-synthesis files after review.

**Step 3: Stash the remaining Cloudflare work**

```bash
git stash push -u -m "wip: paused cloudflare deployment"
```

Expected: clean worktree. Do not drop this stash.

**Step 4: Create the feature branch**

```bash
git switch -c feat/mind-checkin-choice
```

---

### Task 1: Define and test the Mind choice-frame domain model

**Objective:** Validate 1–5 inputs and deterministically produce a diagnosis plus exactly two choices.

**Files:**
- Modify: `src/lib/mind.ts`
- Modify: `src/__tests__/mind/mind.test.ts`

**Step 1: Write failing validation tests**

Add tests covering:

```ts
expect(validateMindCheckIn({
  energy: 2,
  positiveEmotion: 2,
  stateWord: 'tired',
  activeSelf: 'operator',
  shipIntent: 'Close Telegram bugs',
  hedgedDecision: 'Whether to continue Cloudflare',
})).toMatchObject({ energy: 2, positiveEmotion: 2 })

for (const value of [0, 6, 1.5, '3']) {
  expect(() => validateMindCheckIn({
    energy: value,
    positiveEmotion: 3,
    stateWord: 'steady',
    activeSelf: 'operator',
  })).toThrow(/energy/i)
}
```

Also test positive-emotion boundaries and the allowed identities: `operator | athlete | father | writer`.

**Step 2: Run RED**

```bash
npx vitest run src/__tests__/mind/mind.test.ts
```

Expected: FAIL because `validateMindCheckIn` does not exist.

**Step 3: Add minimal types and validation**

Add to `src/lib/mind.ts`:

```ts
export type ActiveSelf = 'operator' | 'athlete' | 'father' | 'writer'
export type SelectedChoice = 'A' | 'B'

export interface MindCheckInInput {
  energy?: unknown
  positiveEmotion?: unknown
  stateWord?: unknown
  activeSelf?: unknown
  shipIntent?: unknown
  hedgedDecision?: unknown
  selectedChoice?: unknown
}

export interface ValidMindCheckIn {
  energy: number
  positiveEmotion: number
  stateWord: string
  activeSelf: ActiveSelf
  shipIntent?: string
  hedgedDecision?: string
  selectedChoice?: SelectedChoice
}

function score(value: unknown, name: string): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 5) {
    throw new Error(`${name} must be an integer from 1 to 5`)
  }
  return value as number
}
```

Validate and trim free text; cap each text field at 500 characters.

**Step 4: Run GREEN**

```bash
npx vitest run src/__tests__/mind/mind.test.ts
```

Expected: validation tests pass; existing crisis and decision tests remain green.

**Step 5: Write failing choice-frame tests**

Require all frames to:

```ts
const frame = diagnoseMindCheckIn(validInput)
expect(frame.choices).toHaveLength(2)
expect(frame.choices.map(choice => choice.id)).toEqual(['A', 'B'])
expect(frame.question).toMatch(/\?$/)
expect(frame.diagnosis).not.toMatch(/\bmust\b|\byou should\b|\bstop for today\b/i)
```

Cover four score patterns:

1. Low energy + low positive emotion.
2. Low energy + moderate/high positive emotion.
3. Moderate/high energy + low positive emotion.
4. Moderate/high energy + moderate/high positive emotion.

**Step 6: Run RED, implement, then run GREEN**

Use this decision structure:

```ts
export interface MindChoiceFrame {
  diagnosis: string
  choices: [
    { id: 'A'; label: string; tradeoff: string },
    { id: 'B'; label: string; tradeoff: string },
  ]
  question: string
}
```

Recommended framing:

- Low/low: choose between reducing scope now or taking a short reset and reassessing.
- Low energy/high positive emotion: choose between one smallest shippable block or recovery first.
- High energy/low positive emotion: choose between examining the stressful thought or converting activation into one decision.
- High/high: choose between shipping the artifact or closing the hedged decision.

Every frame ends with `Which do you choose: A or B?`

Run:

```bash
npx vitest run src/__tests__/mind/mind.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add src/lib/mind.ts src/__tests__/mind/mind.test.ts
git commit -m "feat: add structured Mind choice frames"
```

---

### Task 2: Add non-destructive Convex persistence for completed check-ins

**Objective:** Persist a check-in only after Ajit explicitly selects A or B.

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/mindCheckIns.ts`
- Modify: `convex/http.ts`
- Regenerate: `convex/_generated/api.d.ts`
- Test: `src/__tests__/mind/mind.test.ts` or a focused `src/__tests__/mind/check-in-input.test.ts`

**Step 1: Add the schema**

```ts
mindCheckIns: defineTable({
  createdAt: v.number(),
  energy: v.number(),
  positiveEmotion: v.number(),
  stateWord: v.string(),
  activeSelf: v.union(
    v.literal('operator'),
    v.literal('athlete'),
    v.literal('father'),
    v.literal('writer'),
  ),
  shipIntent: v.optional(v.string()),
  hedgedDecision: v.optional(v.string()),
  diagnosis: v.string(),
  choiceA: v.string(),
  choiceB: v.string(),
  selectedChoice: v.union(v.literal('A'), v.literal('B')),
})
  .index('by_createdAt', ['createdAt'])
  .index('by_activeSelf', ['activeSelf']),
```

This is additive; do not alter or migrate existing `decisions` rows.

**Step 2: Write a failing parser test**

Create a pure parser for the authenticated Convex HTTP action. Test valid inputs, scores outside 1–5, missing choice, invalid identity, and oversized text.

Run:

```bash
npx vitest run src/__tests__/mind/check-in-input.test.ts
```

Expected: FAIL before parser implementation.

**Step 3: Implement internal create/list functions**

`convex/mindCheckIns.ts` must expose only `internalMutation` and `internalQuery`.

- `create`: validate scores and text again at the persistence boundary.
- `list`: return the newest 20 by default, bounded to 100.
- Do not expose a public Convex query or mutation.

**Step 4: Add authenticated HTTP routes**

In `convex/http.ts`:

- `GET /data/mind-check-ins?limit=20`
- `POST /data/mind-check-ins`

Both must use `SUPER_COACH_DATA_SECRET`, reject query-string secrets, return `401` when unset/invalid, and cap request size before parsing.

**Step 5: Regenerate and verify Convex code**

```bash
npx convex dev --once
```

Expected: functions ready with no TypeScript errors.

**Step 6: Commit**

```bash
git add convex/schema.ts convex/mindCheckIns.ts convex/http.ts convex/_generated/api.d.ts src/__tests__/mind/check-in-input.test.ts
git commit -m "feat: persist completed Mind check-ins"
```

---

### Task 3: Add the staged check-in API

**Objective:** Return a diagnosis first, then persist only after an explicit A/B choice.

**Files:**
- Modify: `src/lib/convex-data.ts`
- Create: `src/app/api/mind/check-in/route.ts`
- Test: `src/__tests__/mind/check-in-route.test.ts`

**Step 1: Write failing route tests**

Cover:

1. Unauthenticated production request returns `401`.
2. Valid scores without `selectedChoice` return `{ frame, stored: false }` and do not call persistence.
3. Valid scores with `selectedChoice: 'A'` return `{ frame, stored: true, id }`.
4. Invalid scores return `400`.
5. Crisis text returns the exact handoff before normal diagnosis and never returns a choice frame.

**Step 2: Run RED**

```bash
npx vitest run src/__tests__/mind/check-in-route.test.ts
```

Expected: FAIL because the route does not exist.

**Step 3: Implement server data helpers**

Add:

```ts
export async function getMindCheckIns(limit = 20): Promise<unknown[]>
export async function createMindCheckIn(input: PersistedMindCheckIn): Promise<string>
```

Reuse the existing authenticated `dataFetch`; never expose the server data secret to the browser.

**Step 4: Implement POST behavior**

Pseudocode:

```ts
const input = validateMindCheckIn(await request.json())
const crisisText = [input.stateWord, input.shipIntent, input.hedgedDecision].filter(Boolean).join(' ')
const handoff = detectCrisis(crisisText)
if (handoff) return Response.json({ handoff, stored: false })

const frame = diagnoseMindCheckIn(input)
if (!input.selectedChoice) return Response.json({ frame, stored: false })

const id = await createMindCheckIn({ ...input, ...frameToPersistence(frame) })
return Response.json({ id, frame, selectedChoice: input.selectedChoice, stored: true })
```

Do not persist incomplete check-ins.

**Step 5: Run GREEN and full Mind tests**

```bash
npx vitest run src/__tests__/mind/check-in-route.test.ts src/__tests__/mind/mind.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/lib/convex-data.ts src/app/api/mind/check-in/route.ts src/__tests__/mind/check-in-route.test.ts
git commit -m "feat: add staged Mind check-in API"
```

---

### Task 4: Replace the static web questions with an interactive choice flow

**Objective:** Collect the four check-in inputs, show the diagnosis, and require an A/B selection.

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Modify or create: `src/__tests__/mind/check-in-view-model.test.ts`

**Step 1: Extract and test a small view-model helper**

Avoid adding a UI test dependency. Add a pure helper that builds the POST body and determines whether the form can advance.

Test:

```ts
expect(canDiagnose({ energy: 2, positiveEmotion: 2, stateWord: 'tired', activeSelf: 'operator' })).toBe(true)
expect(canPersist(frame, null)).toBe(false)
expect(canPersist(frame, 'A')).toBe(true)
```

Run RED, then implement minimally.

**Step 2: Add controlled form fields**

Mind mode should show, in this order:

1. `Energy right now` radio group or segmented control: 1–5.
2. `Positive emotion right now` radio group or segmented control: 1–5.
3. `State word` input and active-self selector.
4. Existing ship and hedged-decision prompts.

Use explicit anchors under both scales. Do not use a single unlabeled mood slider.

**Step 3: Add staged submission**

- Button 1: `Diagnose the pattern`.
- Render `Diagnosis`, Option A, Option B, and the tradeoff for each.
- Do not show an imperative coach line.
- Require Ajit to select A or B.
- Button 2: `Choose A` or `Choose B`; this persists the check-in.
- After persistence, show the chosen option and row ID.

**Step 4: Preserve crisis and auth behavior**

- Existing judge bearer token must be sent to `/api/mind/check-in`.
- A `401` returns to the token form.
- A crisis handoff replaces the choice frame and remains visible even if storage fails.

**Step 5: Style accessibly**

Add classes such as:

- `.checkin-grid`
- `.score-group`
- `.score-option`
- `.choice-frame`
- `.choice-card`
- `.choice-card.selected`

Keyboard focus, labels, and mobile stacking are mandatory.

**Step 6: Verify**

```bash
npm test
npm run lint
npm run build
```

Expected: all tests pass, zero lint errors, production build succeeds.

**Step 7: Commit**

```bash
git add src/app/page.tsx src/app/globals.css src/__tests__/mind/check-in-view-model.test.ts
git commit -m "feat: add interactive Mind choice check-in"
```

---

### Task 5: Update Telegram Mind mode to ask, diagnose, and force a choice

**Objective:** Make Telegram use the same four-question flow and A/B decision contract.

**Files:**
- Modify: `hermes/super-coach/SKILL.md`
- Modify runtime skill through `skill_manage`: `productivity/super-coach/SKILL.md`
- Modify: scheduled-job prompts for Morning Intent and Evening Close-out

**Step 1: Replace the Mind check-in sequence**

The runtime sequence must be one question per turn:

1. `Energy right now, 1 to 5? 1 is depleted; 5 is highly energized.`
2. `Positive emotion right now, 1 to 5? 1 is none or very low; 5 is strong.`
3. `In one word, what state are you in, and which version of you is running: operator, athlete, father, or writer?`
4. `What will you ship, and which decision are you hedging?`

Reject values outside 1–5 without advancing.

**Step 2: Enforce non-absolute coaching**

Add an explicit rule:

```text
Mind never ends with an absolute directive such as “stop,” “push through,” or “do X.”
It diagnoses the pattern, presents exactly two options with tradeoffs, and asks “Which do you choose: A or B?”
```

If Ajit chooses A or B, persist the completed check-in and confirm the selected path. If he does not choose, do not infer a choice.

**Step 3: Preserve crisis behavior**

At any free-text turn, crisis detection overrides the normal sequence immediately. Do not ask A/B before giving the exact handoff.

**Step 4: Update Super’s Mind sub-agent**

Super should read both:

```bash
npx convex data decisions --deployment accomplished-moose-243 --limit 20 --format json
npx convex data mindCheckIns --deployment accomplished-moose-243 --limit 20 --format json
```

Its output must distinguish stored check-in scores from current self-report.

**Step 5: Update scheduled prompts**

Morning and evening jobs should read the structured check-in table. They may offer two options, but must not choose for Ajit or auto-execute a Career action.

**Step 6: Review and install**

Run a focused Claude read-only review of the skill diff. Then update the installed skill with `skill_manage` and test one Telegram Mind interaction through the Home/floor keyboard.

**Step 7: Commit**

```bash
git add hermes/super-coach/SKILL.md
git commit -m "feat: make Mind coaching choice-based"
```

---

### Task 6: End-to-end verification

**Objective:** Prove the complete Mind flow works without absolute advice or unsafe writes.

**Files:**
- No new production files expected.

**Step 1: Automated gates**

```bash
python -m unittest hermes/super-coach/tests/test_send_telegram_menu.py -v
npm test
npm run lint
npm run build
```

Expected: all tests pass, zero lint errors, build succeeds.

**Step 2: Live API verification**

Use a non-crisis check-in fixture:

```json
{
  "energy": 2,
  "positiveEmotion": 2,
  "stateWord": "tired",
  "activeSelf": "operator",
  "shipIntent": "Close Telegram bugs",
  "hedgedDecision": "Whether to continue Cloudflare"
}
```

Verify first response:

- `stored: false`
- diagnosis present
- exactly two choices
- question asks A or B

Submit again with `selectedChoice: "A"`; verify `stored: true` and a real Convex ID.

**Step 3: Negative verification**

- Scores 0 and 6 return `400`.
- No selection produces no database row.
- Unauthenticated production request returns `401`.
- Crisis text returns the exact handoff and no normal choice frame.
- No response contains `you must`, `you should`, `stop for today`, or another absolute command.

**Step 4: Browser verification**

Check Mind mode on desktop and narrow mobile width:

- Both scales are labeled.
- A/B choices are keyboard accessible.
- Only the chosen path is persisted.
- Browser console has no errors.

**Step 5: Telegram verification**

From Home:

1. Tap `Mind`.
2. Confirm `🏠 Home` remains available.
3. Complete all four questions.
4. Confirm Mind gives diagnosis + A/B tradeoffs.
5. Do not choose immediately; verify no choice is inferred.
6. Choose A or B; verify the check-in row is persisted.
7. Tap `🏠 Home`; verify exact four-mode Home keyboard returns.

**Step 6: Independent review**

Review the staged diff for:

- clinical overreach,
- crisis regression,
- score validation,
- implicit choice,
- public Convex bypass,
- PII exposure,
- send-without-confirmation regression.

**Step 7: Commit and push**

```bash
git add -A
git commit -m "[verified] feat: add choice-based Mind check-ins"
git push -u origin feat/mind-checkin-choice
```

Open a PR or merge only after review passes.

---

## Acceptance criteria

- Mind asks energy and positive emotion separately on 1–5 scales.
- Mind retains the state/identity and ship/decision questions.
- Scores are validated and stored only after explicit A/B selection.
- Every normal recommendation contains a diagnosis, exactly two options, tradeoffs, and a direct choice question.
- Mind never chooses for Ajit and never treats silence as selection.
- Crisis handling remains exact and immediate.
- Super and scheduled digests can read structured Mind scores without confusing them with current self-report.
- Existing `decisions` data and decision workflow remain intact.

## Risks and tradeoffs

1. **Over-structuring the conversation:** Four questions can feel heavy. Ask one per turn in Telegram; use one compact form on the web.
2. **Clinical interpretation risk:** Scores describe state, not diagnosis. Avoid terms such as depression, anxiety disorder, burnout, or recovery readiness.
3. **Choice theater:** Options must carry real tradeoffs, not two phrasings of the same recommendation.
4. **Persistence sensitivity:** Mind check-ins are personal data. Keep Convex functions internal and browser responses minimal.
5. **Dirty worktree risk:** Do not implement until the paused Cloudflare work is isolated.

## Open question for implementation

The plan assumes positive-emotion anchors `1 = none/very low` and `5 = strong positive emotion`. Confirm those labels before implementation if Ajit prefers different wording.
