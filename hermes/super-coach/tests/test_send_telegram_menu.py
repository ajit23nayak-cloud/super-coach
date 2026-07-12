"""TDD tests for scripts/send_telegram_menu.py — stdlib only, run with `python -m unittest`."""

import io
import json
import os
import pathlib
import sys
import unittest
from contextlib import redirect_stdout, redirect_stderr
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
BUNDLE = HERE.parent
sys.path.insert(0, str(BUNDLE / "scripts"))

import send_telegram_menu as menu  # noqa: E402


SECRET_TOKEN = "definitely-not-a-real-token"
SECRET_CHAT = "test-chat-id"


def _write_env(tmp_home: pathlib.Path, extra: str = "") -> None:
    (tmp_home / ".env").write_text(
        "# TELEGRAM_BOT_TOKEN=commented-out-should-be-ignored\n"
        f"TELEGRAM_BOT_TOKEN={SECRET_TOKEN}\n"
        f'TELEGRAM_HOME_CHANNEL="{SECRET_CHAT}"\n'
        "UNRELATED=other\n"
        + extra,
        encoding="utf-8",
    )


class LoadEnvTests(unittest.TestCase):
    def test_reads_expected_vars_and_ignores_commented_lines(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            import tempfile
            with tempfile.TemporaryDirectory() as td:
                home = pathlib.Path(td)
                _write_env(home)
                env = menu.load_env(home)
        self.assertEqual(env["TELEGRAM_BOT_TOKEN"], SECRET_TOKEN)
        self.assertEqual(env["TELEGRAM_HOME_CHANNEL"], SECRET_CHAT)

    def test_missing_var_raises(self):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            home = pathlib.Path(td)
            (home / ".env").write_text("TELEGRAM_BOT_TOKEN=only-token\n", encoding="utf-8")
            with self.assertRaises(menu.MissingEnvError):
                menu.load_env(home)

    def test_missing_env_file_raises(self):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(FileNotFoundError):
                menu.load_env(pathlib.Path(td))


class BuildPayloadTests(unittest.TestCase):
    def test_has_exactly_four_buttons_in_order(self):
        payload = menu.build_payload(chat_id=SECRET_CHAT)
        buttons = [b["text"] for row in payload["reply_markup"]["keyboard"] for b in row]
        self.assertEqual(buttons, ["Body", "Mind", "Career", "Super"])

    def test_uses_reply_keyboard_not_inline(self):
        payload = menu.build_payload(chat_id=SECRET_CHAT)
        rm = payload["reply_markup"]
        self.assertIn("keyboard", rm)
        self.assertNotIn("inline_keyboard", rm)

    def test_keyboard_is_persistent_and_resizes(self):
        payload = menu.build_payload(chat_id=SECRET_CHAT)
        rm = payload["reply_markup"]
        self.assertTrue(rm.get("is_persistent"))
        self.assertTrue(rm.get("resize_keyboard"))
        self.assertFalse(rm.get("one_time_keyboard", False))

    def test_greeting_matches_spec(self):
        payload = menu.build_payload(chat_id=SECRET_CHAT)
        self.assertIn("Super Coach", payload["text"])
        self.assertIn("coaching", payload["text"].lower())

    def test_chat_id_included(self):
        payload = menu.build_payload(chat_id=SECRET_CHAT)
        self.assertEqual(payload["chat_id"], SECRET_CHAT)


class DryRunTests(unittest.TestCase):
    def _run_main(self, home: pathlib.Path):
        import tempfile
        buf_out, buf_err = io.StringIO(), io.StringIO()
        with mock.patch.dict(os.environ, {"HERMES_HOME": str(home)}, clear=False):
            with mock.patch.object(menu, "urlopen") as urlopen:
                with redirect_stdout(buf_out), redirect_stderr(buf_err):
                    rc = menu.main(["--dry-run"])
                self.assertEqual(urlopen.call_count, 0, "dry-run must never call the network")
        return rc, buf_out.getvalue(), buf_err.getvalue()

    def test_dry_run_prints_valid_json_and_makes_no_network_call(self):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            home = pathlib.Path(td)
            _write_env(home)
            rc, out, err = self._run_main(home)
        self.assertEqual(rc, 0)
        parsed = json.loads(out)
        self.assertIn("payload", parsed)
        buttons = [b["text"] for row in parsed["payload"]["reply_markup"]["keyboard"] for b in row]
        self.assertEqual(buttons, ["Body", "Mind", "Career", "Super"])

    def test_dry_run_redacts_secrets(self):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            home = pathlib.Path(td)
            _write_env(home)
            rc, out, err = self._run_main(home)
        combined = out + err
        self.assertNotIn(SECRET_TOKEN, combined)
        self.assertNotIn(SECRET_CHAT, combined)
        self.assertIn("REDACTED", combined)

    def test_dry_run_endpoint_does_not_leak_token(self):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            home = pathlib.Path(td)
            _write_env(home)
            rc, out, err = self._run_main(home)
        parsed = json.loads(out)
        self.assertIn("endpoint", parsed)
        self.assertNotIn(SECRET_TOKEN, parsed["endpoint"])
        self.assertIn("REDACTED", parsed["endpoint"])


if __name__ == "__main__":
    unittest.main()
