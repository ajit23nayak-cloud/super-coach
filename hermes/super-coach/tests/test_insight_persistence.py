import pathlib
import unittest


SKILL = pathlib.Path(__file__).resolve().parents[1] / "SKILL.md"


class InsightPersistenceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = SKILL.read_text(encoding="utf-8")
        cls.lower = cls.text.lower()

    def _insight_section(self):
        marker = "\n## Insight persistence"
        start = self.text.find(marker)
        self.assertNotEqual(start, -1, "Insight persistence section is missing from SKILL.md")
        start += 1
        end = self.text.find("\n## ", start + 1)
        return self.text[start:] if end == -1 else self.text[start:end]

    def test_section_exists_with_expected_name(self):
        self.assertIn("Insight persistence (web mirror)", self.text)

    def test_every_mode_must_persist(self):
        section = self._insight_section()
        self.assertIn("MUST be persisted to Convex `insights`", section)

    def test_endpoint_and_auth_are_documented(self):
        section = self._insight_section()
        self.assertIn("`https://accomplished-moose-243.convex.site/data/insights`", section)
        self.assertIn("Authorization: Bearer $SUPER_COACH_DATA_SECRET", section)

    def test_mode_enum_documented(self):
        section = self._insight_section()
        for name in ("Body", "Mind", "Career", "Super"):
            self.assertIn(f"`{name}`", section)

    def test_per_mode_payload_defined(self):
        section = self._insight_section().lower()
        self.assertIn("body**: the three metric-grounded recommendations", section)
        self.assertIn("mind**: the diagnosis line plus the two a/b option labels", section)
        self.assertIn("career**: the ranked flags summary and the attention-allocation choice", section)
        self.assertIn("super**: the full", section)

    def test_never_gate_telegram_reply_on_insight_write(self):
        section = self._insight_section().lower()
        self.assertIn("never gate the telegram reply on a successful insight write", section)

    def test_failure_handling_no_fabrication(self):
        section = self._insight_section().lower()
        self.assertIn("do not retry silently and do not fabricate a stored id", section)

    def test_rate_limit_one_per_mode_per_turn(self):
        section = self._insight_section().lower()
        self.assertIn("at most one insight per mode per user-turn", section)

    def test_crisis_text_never_persisted_as_insight(self):
        section = self._insight_section()
        self.assertIn("Never persist crisis text as an insight", section)
        self.assertIn('`outcome="crisis_handoff"`', section)


if __name__ == "__main__":
    unittest.main()
