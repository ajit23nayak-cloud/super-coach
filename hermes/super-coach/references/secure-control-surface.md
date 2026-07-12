# Secure multi-domain agent control surfaces

Use this reference when a coaching or personal-agent product combines a browser UI, sensitive external data, Convex persistence, scheduled jobs, and delegated sub-agents.

## Trust boundaries

### Do not rely on Next.js API authentication alone

A protected Next route is irrelevant if the browser or an attacker can call public Convex queries and mutations directly.

Preferred pattern:

1. Define sensitive Convex operations as `internalQuery` / `internalMutation`.
2. Expose only narrow Convex HTTP actions.
3. Authenticate those actions with a server-to-server secret.
4. Keep that secret server-side in Next.js and in the Convex environment.
5. Require a separate bearer token for public Next.js API routes in production.
6. Permit localhost bypass only through an explicit development flag; do not infer trust merely from `NODE_ENV`.

Secrets must fail closed when unset. Compare fixed-size digests rather than raw strings when practical. Accept URL query secrets only for a legacy webhook sender that cannot set headers; never permit query secrets on general `/data/*` routes.

### Minimize observability exposure

Agent run logs may contain health, mood, email, calendar, prompts, outputs, and errors. Store detailed records only when needed, but return a projected summary to the UI, such as:

```json
{"_id":"…","agent":"Body","createdAt":0,"latencyMs":25800,"status":"passed"}
```

Never return `input`, `output`, or `error` blobs merely because the UI has authenticated. Apply payload-size caps before persistence. Treat the run trace as optional: its fetch failure must not blank the primary Body, Mind, or Career panels.

## Health webhook realities

Health Connect webhook payloads often repeat cumulative snapshots and may publish a newer partial sleep snapshot after an older complete one.

Normalization rules:

1. Aggregate point metrics such as HR, RHR, and HRV across recent usable rows, then select the latest timestamped value.
2. Ignore rows that contain no health arrays, including authenticated endpoint verification rows.
3. Build sleep sessions only from contiguous segments. A two-hour maximum gap is a reasonable guard against summing multiple nights.
4. Among snapshots for the latest sleep end window, prefer the most complete duration rather than the newest received row.
5. Preserve `null` when HRV or another field is absent. Never carry forward an old value as current.
6. Test explicitly with an older complete sleep snapshot, a newer partial snapshot, and a newer non-health verification row.

## Crisis handoff durability

The UI must render the handoff text returned by the Mind API. Do not discard it after persistence. Prefer returning the handoff even when crisis-event storage fails, with a flag such as `stored:false`; safety guidance must not depend on database availability.

## Gmail reply safety

When drafting a reply:

- Prefer `Reply-To`, then fall back to `From`.
- Reject an empty recipient.
- Strip CR/LF from every MIME header (`To`, `Subject`, `In-Reply-To`, `References`) to prevent header injection.
- Match `Re:` case-insensitively before prefixing.
- Preserve refreshed OAuth refresh tokens when providers rotate them.
- Write token files through a restricted temporary file and atomic rename.

## Evaluation honesty

A deterministic script that scores hand-authored outputs is a **rubric calibration**, not a live model evaluation. Label it that way in filenames and output. A real prompt-version benchmark must execute each prompt against the chosen model on the same evidence, preserve raw outputs, and then apply the rubric.

## Verification sequence

1. Unit tests for normalizers, validation, MIME safety, token refresh, and no-send guarantees.
2. Build and lint.
3. Live API reads for each domain and the run trace.
4. Negative auth probes: unauthenticated webhook and data requests must return `401`.
5. Positive webhook probe with the configured sender secret.
6. Browser check of all modes and console errors.
7. Scheduled-job test run with delivery status read back.
8. Independent staged-diff security review before commit.

## Git integration pitfall

When a remote default branch has an unrelated scaffold commit, especially one that tracks `node_modules`, do not pull the dependency tree or force-push by default. If the verified local tree should win while preserving remote history, use a two-parent merge with the `ours` strategy and then push normally:

```bash
git fetch origin
git merge -s ours origin/main --allow-unrelated-histories -m "chore: reconcile initial remote scaffold"
git push origin main
```

Inspect both histories and file trees first. This technique preserves the remote commit without importing its broken tree and avoids destructive force-pushing.
