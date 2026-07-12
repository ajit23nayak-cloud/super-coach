# Super Coach

A four-mode Hermes coach for Telegram and the web:

- **Body** reads real Gabit ring data from Convex.
- **Mind** runs a check-in and persists decisions.
- **Career** reads Gmail and Calendar, then creates Gmail drafts only.
- **Super** uses one Hermes `delegate_task` batch to run all three specialists in parallel and synthesizes only evidence-backed cross-domain insights.

## Verified live surfaces

- Next.js monitor: Body, Mind, Career, and Super readiness.
- Convex deployment: `accomplished-moose-243`.
- Hermes Telegram menu: persistent Body, Mind, Career, Super keyboard.
- Gmail: thread-aware draft creation; there is intentionally no send endpoint.

## Local setup

```bash
npm install
npx convex dev --once
npm run dev
```

Open `http://localhost:3000`. Development API access is limited to loopback requests.

Google Workspace OAuth is read server-side from the active Hermes profile's `google_token.json`; tokens are never exposed to the browser or committed.

## Security before deployment

Copy `.env.example` to `.env.local` and configure:

- `SUPER_COACH_API_TOKEN`: required as `Authorization: Bearer ...` by every `/api/*` route outside local development.
- `NEXT_PUBLIC_CONVEX_URL`: created by `npx convex dev`.

Set this separately in the Convex environment:

- `HEALTH_WEBHOOK_SECRET`: required by `POST /health` through `X-Webhook-Secret` or the `?secret=` compatibility parameter.

Do not deploy the authenticated webhook change until the Health Connect webhook sender has the same secret configured.

## Telegram control bundle

Source lives in `hermes/super-coach/`. Verify and post the menu:

```bash
python -m unittest discover hermes/super-coach/tests -v
python hermes/super-coach/scripts/send_telegram_menu.py --dry-run
python hermes/super-coach/scripts/send_telegram_menu.py
```

Install `hermes/super-coach/` as the local `super-coach` skill, then restart the Hermes gateway. The persistent Telegram reply keyboard sends mode names as ordinary user text, preserving the normal Hermes session and agent path.

## Quality gates

```bash
npm test
npm run lint
npm run build
python -m unittest discover hermes/super-coach/tests -v
```

## Safety invariants

- No email-send function or endpoint exists.
- Career creates drafts only; sending requires a separate explicit user confirmation through an authorized Hermes action.
- Missing health data is reported as unavailable, never inferred.
- Mind displays the non-clinical crisis handoff verbatim when an explicit safety signal is detected.
- Production APIs fail closed without an access token.
