"""Post the Super Coach persistent Telegram menu (Body/Mind/Career/Super).

Reads TELEGRAM_BOT_TOKEN and TELEGRAM_HOME_CHANNEL from $HERMES_HOME/.env.
Uses only the Python standard library. Secrets are never printed: --dry-run
emits a redacted JSON payload and never performs a network call.

Usage:
    python scripts/send_telegram_menu.py --dry-run
    python scripts/send_telegram_menu.py

Design intent: the four buttons are rendered as a `ReplyKeyboardMarkup` with
`is_persistent: true`, so tapping a button sends the button label as ordinary
user text into the existing Hermes Telegram gateway session (no callback data,
no inline keyboard, no bespoke webhook). The Hermes agent then routes
Body/Mind/Career/Super per the SKILL.md next to this script.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
from urllib.parse import urlencode
from urllib.request import Request, urlopen

REQUIRED_VARS = ("TELEGRAM_BOT_TOKEN", "TELEGRAM_HOME_CHANNEL")

GREETING = "Hi, I'm your Super Coach. What do you need coaching with?"
BUTTONS = ("Body", "Mind", "Career", "Super")
HOME_BUTTON = "🏠 Home"
TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"


class MissingEnvError(RuntimeError):
    """Raised when the .env file lacks a required Telegram variable."""


def load_env(hermes_home: pathlib.Path) -> dict:
    """Parse $HERMES_HOME/.env for the required Telegram vars.

    Ignores blank lines and lines whose first non-whitespace char is '#'.
    Strips optional surrounding single/double quotes from values.
    Raises FileNotFoundError if .env is absent, MissingEnvError if a var is missing.
    """
    env_path = hermes_home / ".env"
    if not env_path.is_file():
        raise FileNotFoundError(f".env not found at {env_path}")
    values: dict[str, str] = {}
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
            val = val[1:-1]
        if key in REQUIRED_VARS and key not in values:
            values[key] = val
    missing = [k for k in REQUIRED_VARS if k not in values or not values[k]]
    if missing:
        raise MissingEnvError(f"missing required env vars in {env_path}: {', '.join(missing)}")
    return values


def build_payload(chat_id: str, view: str = "home", floor: str | None = None) -> dict:
    """Build a persistent Home keyboard or a floor keyboard with one Home action."""
    if view == "home":
        keyboard = [
            [{"text": BUTTONS[0]}, {"text": BUTTONS[1]}],
            [{"text": BUTTONS[2]}, {"text": BUTTONS[3]}],
        ]
        text = GREETING
    elif view == "floor" and floor in BUTTONS:
        keyboard = [[{"text": HOME_BUTTON}]]
        text = f"{floor} floor. Ask naturally, or tap {HOME_BUTTON} to return to the four coaching modes."
    else:
        raise ValueError("view must be 'home', or 'floor' with a valid floor name")

    return {
        "chat_id": chat_id,
        "text": text,
        "reply_markup": {
            "keyboard": keyboard,
            "is_persistent": True,
            "resize_keyboard": True,
            "one_time_keyboard": False,
            "selective": False,
        },
    }


def redact(payload: dict) -> dict:
    """Return a copy of payload with the chat_id replaced by <REDACTED>."""
    safe = json.loads(json.dumps(payload))
    safe["chat_id"] = "<REDACTED>"
    return safe


def _resolve_home() -> pathlib.Path:
    home = os.environ.get("HERMES_HOME")
    if home:
        return pathlib.Path(home)
    return pathlib.Path.home() / ".hermes"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true",
                        help="Print redacted JSON payload and exit without any network call.")
    parser.add_argument("--view", choices=("home", "floor"), default="home",
                        help="Show the four-mode Home keyboard or a floor keyboard.")
    parser.add_argument("--floor", choices=BUTTONS,
                        help="Floor name required when --view floor is used.")
    args = parser.parse_args(argv)
    if args.view == "floor" and not args.floor:
        parser.error("--floor is required when --view floor is used")

    hermes_home = _resolve_home()
    env = load_env(hermes_home)
    payload = build_payload(env["TELEGRAM_HOME_CHANNEL"], view=args.view, floor=args.floor)

    if args.dry_run:
        preview = {
            "endpoint": "https://api.telegram.org/bot<REDACTED>/sendMessage",
            "payload": redact(payload),
        }
        print(json.dumps(preview, indent=2))
        return 0

    url = TELEGRAM_API.format(token=env["TELEGRAM_BOT_TOKEN"])
    body = urlencode({
        "chat_id": payload["chat_id"],
        "text": payload["text"],
        "reply_markup": json.dumps(payload["reply_markup"]),
    }).encode("utf-8")
    req = Request(url, data=body, method="POST")
    with urlopen(req, timeout=15) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        print("telegram: non-JSON response", file=sys.stderr)
        return 2
    if not result.get("ok"):
        # Print the API error code/description only — no token, no chat id.
        print(json.dumps({"ok": False,
                          "error_code": result.get("error_code"),
                          "description": result.get("description")}),
              file=sys.stderr)
        return 2
    print(json.dumps({"ok": True, "message_id": result["result"].get("message_id")}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
