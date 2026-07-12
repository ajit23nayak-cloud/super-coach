# super-coach (Hermes skill bundle)

Portable bundle for the Super Coach four-mode Telegram agent. Drop the
`super-coach/` directory into `$HERMES_HOME/skills/productivity/` (or any
category), restart the session, and `SKILL.md` loads.

## Layout

```
super-coach/
├── SKILL.md                        Frontmatter + routing rules for Body/Mind/Career/Super
├── README.md                       This file
├── scripts/
│   └── send_telegram_menu.py       stdlib-only menu poster (Body/Mind/Career/Super)
└── tests/
    └── test_send_telegram_menu.py  unittest TDD suite (11 tests)
```

## The menu script

Reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_HOME_CHANNEL` from `$HERMES_HOME/.env`
(falls back to `~/.hermes/.env`). Never prints either. Posts a Telegram
`ReplyKeyboardMarkup` with `is_persistent: true`, so a button tap arrives at
the existing Hermes gateway as ordinary user text — no callback data, no
inline keyboard, no gateway-config edits.

```bash
python scripts/send_telegram_menu.py --dry-run   # prints redacted JSON, no network
python scripts/send_telegram_menu.py             # POSTs sendMessage once
```

Exit codes: `0` on success or dry-run; `2` on Telegram API error.

## Tests (TDD)

Run from this directory:

```bash
python -m unittest discover tests -v
```

The suite covers env parsing, payload shape (exact button order, persistent
reply-keyboard, no inline keyboard), and the two dry-run invariants: no
network call, no secret in stdout or stderr.

## Skill routing (summary — full contract in SKILL.md)

- **Body** — real Convex `healthReadings` only; no invented numbers.
- **Mind** — two check-in questions; writes to Convex `decisions`; crisis handoff line is verbatim and non-negotiable.
- **Career** — loads `google-workspace` + `draft-in-ajit-voice`; drafts only; never sends without explicit user confirmation.
- **Super** — exactly one `delegate_task(tasks=[…3…])` batch (parallel); synthesises only evidenced cross-domain insights; says so when evidence is weak.

## Dependencies

- Python 3.9+ (stdlib only for the script).
- Hermes gateway paired to Telegram with `TELEGRAM_BOT_TOKEN` and
  `TELEGRAM_HOME_CHANNEL` in `$HERMES_HOME/.env`.
- Installed Hermes skills referenced by SKILL.md: `google-workspace`,
  `draft-in-ajit-voice`.
- Convex project with tables `healthReadings` and `decisions` reachable
  from the agent's environment.
