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

    def test_requires_output_to_use_metrics_and_keywords(self):
        self.assertIn("metrics", self.text.lower())
        self.assertIn("keywords", self.text.lower())
        self.assertIn("CUMULATIVE INSIGHT", self.text)


if __name__ == "__main__":
    unittest.main()
