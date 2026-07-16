import pathlib
import unittest


SKILL = pathlib.Path(__file__).resolve().parents[1] / "SKILL.md"


class SuperSynthesisContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = SKILL.read_text(encoding="utf-8")

    def test_requires_evidence_atoms_from_all_three_domains(self):
        self.assertIn("Body evidence atom", self.text)
        self.assertIn("Mind evidence atom", self.text)
        self.assertIn("Career evidence atom", self.text)
        self.assertIn("all three domains", self.text.lower())

    def test_requires_cumulative_reasoning_not_joined_summaries(self):
        # These remain PRIVATE reasoning steps, not printed output.
        self.assertIn("THREE-DOMAIN CHAIN", self.text)
        self.assertIn("DOMINANT CONSTRAINT", self.text)
        self.assertIn("LEVERAGE POINT", self.text)
        self.assertIn("DECISION", self.text)
        self.assertIn("not three summaries joined together", self.text.lower())

    def test_requires_confidence_and_recency_controls(self):
        self.assertIn("recency", self.text.lower())
        self.assertIn("confidence", self.text.lower())
        self.assertIn("FACT", self.text)
        self.assertIn("INFERENCE", self.text)

    def test_output_is_a_compressed_maxim_under_100_words(self):
        # The Telegram output is a compressed maxim, not a labeled report.
        self.assertIn("UNDER 100 WORDS", self.text)
        self.assertIn("maxim", self.text.lower())
        # Plain prose only — no tables / code fences / labeled sections in the output.
        self.assertIn("NO tables", self.text)
        # Synthesis still grounds in real metrics and keywords.
        self.assertIn("metrics", self.text.lower())
        self.assertIn("keywords", self.text.lower())

    def test_allows_exactly_one_natural_pace_voice_note(self):
        self.assertIn("at most one ElevenLabs voice note", self.text)
        self.assertIn("never for activation", self.text)
        # Speak the same short insight, at natural pace, never sped up.
        self.assertIn("under-100-word", self.text)
        self.assertIn("1.0x", self.text)
        self.assertIn("never set a playback rate above 1.0", self.text)

    def test_offers_optional_per_domain_read_on_request(self):
        self.assertIn("Want the per-domain read?", self.text)
        self.assertIn("only on request", self.text.lower())

    def test_resurfaces_aged_open_decision(self):
        self.assertIn("oldest_open_decision", self.text)
        self.assertIn("compounding-memory", self.text.lower())


if __name__ == "__main__":
    unittest.main()
