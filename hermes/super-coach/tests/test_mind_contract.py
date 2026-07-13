import pathlib
import unittest


SKILL = pathlib.Path(__file__).resolve().parents[1] / "SKILL.md"


class MindCheckinContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = SKILL.read_text(encoding="utf-8")
        cls.lower = cls.text.lower()

    def _mind_section(self):
        # Anchor on the actual heading, not the backticked routing-table cell.
        marker = "\n## Mind mode\n"
        start = self.text.find(marker)
        self.assertNotEqual(start, -1, "Mind mode heading is missing")
        start += 1  # drop the leading newline
        end = self.text.find("\n## ", start + 1)
        return self.text[start:] if end == -1 else self.text[start:end]

    def test_six_slots_appear_in_fixed_order(self):
        section = self._mind_section()
        slots = [
            "energy",
            "positiveEmotion",
            "stateWord",
            "activeSelf",
            "shipIntent",
            "hedgedDecision",
        ]
        positions = []
        for name in slots:
            pos = section.find("`" + name + "`")
            self.assertNotEqual(pos, -1, f"slot `{name}` missing from Mind mode")
            positions.append(pos)
        self.assertEqual(
            positions,
            sorted(positions),
            "structured slots must be listed in the fixed order",
        )

    def test_slots_are_declared_independent(self):
        section = self._mind_section().lower()
        self.assertIn("independent", section)
        self.assertIn("do not coalesce", section)

    def test_energy_is_integer_one_through_five(self):
        section = self._mind_section()
        self.assertRegex(section, r"`energy`[^\n]*integer[^\n]*1-5")

    def test_positive_emotion_is_integer_one_through_five(self):
        section = self._mind_section()
        self.assertRegex(section, r"`positiveEmotion`[^\n]*integer[^\n]*1-5")

    def test_state_word_slot_present(self):
        section = self._mind_section()
        self.assertRegex(section, r"`stateWord`[^\n]*word")

    def test_active_self_enumerates_four_selves(self):
        section = self._mind_section()
        for role in ("operator", "athlete", "father", "writer"):
            self.assertIn(role, section)

    def test_ship_intent_slot_present(self):
        section = self._mind_section()
        self.assertIn("`shipIntent`", section)

    def test_hedged_decision_slot_present(self):
        section = self._mind_section()
        self.assertIn("`hedgedDecision`", section)

    def test_one_question_per_turn_unless_multiple_supplied(self):
        section = self._mind_section().lower()
        self.assertIn("one question per turn", section)
        self.assertIn("supplied multiple slots", section)

    def test_only_ask_for_missing_slots(self):
        section = self._mind_section().lower()
        self.assertIn("only ask for missing slots", section)
        self.assertIn("never re-ask", section)

    def test_carry_forward_explicit_same_flow_answers(self):
        section = self._mind_section().lower()
        self.assertIn("carry forward", section)
        self.assertIn("same-flow", section)
        self.assertIn("verbatim", section)

    def test_home_or_another_mode_cancels_in_progress_checkin(self):
        section = self._mind_section()
        lower = section.lower()
        self.assertIn("cancel", lower)
        self.assertIn("in-progress", lower)
        for token in ("Home", "Body", "Career", "Super"):
            self.assertIn(token, section)
        self.assertIn("do not persist a partial check-in", lower)

    def test_diagnosis_is_plain_and_non_clinical(self):
        section = self._mind_section().lower()
        self.assertIn("plain", section)
        self.assertIn("non-clinical", section)
        self.assertIn("diagnosis", section)

    def test_exactly_two_options_with_real_tradeoffs(self):
        section = self._mind_section().lower()
        self.assertIn("exactly two options", section)
        self.assertIn("real tradeoffs", section)

    def test_no_absolute_advice(self):
        section = self._mind_section().lower()
        self.assertIn("no absolute advice", section)

    def test_never_infers_choice(self):
        section = self._mind_section().lower()
        self.assertIn("do not infer", section)
        self.assertIn("explicit reply", section)

    def test_exact_a_or_b_question_present_verbatim(self):
        # The exact prompt the coach and Mind product surface must render.
        self.assertIn("`Which do you choose: A or B?`", self.text)

    def test_persist_structured_only_after_explicit_ab(self):
        section = self._mind_section()
        lower = section.lower()
        self.assertIn("persist the structured check-in only after", lower)
        self.assertIn("explicit", lower)
        self.assertIn("`A` or `B`", section)

    def test_persistence_failure_does_not_fabricate(self):
        section = self._mind_section().lower()
        self.assertIn("if persistence fails", section)
        self.assertIn("do not fabricate", section)

    def test_decision_logging_is_separate_flow(self):
        section = self._mind_section().lower()
        self.assertIn("decision logging is separate", section)
        self.assertIn("never merge", section)

    def test_explicit_reset_clears_only_structured_never_decisions(self):
        section = self._mind_section().lower()
        self.assertIn("explicit reset", section)
        self.assertIn("only structured check-ins", section)
        self.assertIn("never touches the `decisions` table", section)
        self.assertIn("decision logs are preserved", section)

    def test_crisis_text_preserved_verbatim(self):
        expected = (
            "I'm not the right support for this and I don't want to be. "
            "In India: iCall +91-9152987821 (Mon–Sat, 8am–10pm) or "
            "Vandrevala Foundation 1860-2662-345 (24/7). If you're in immediate "
            "danger, call 112. I'll stay here and I'll wait for you."
        )
        self.assertIn(expected, self.text)

    def test_crisis_text_renders_even_if_persistence_fails(self):
        section = self._mind_section().lower()
        self.assertIn("crisis message must render even if persistence fails", section)
        self.assertIn("send the crisis text first", section)
        self.assertIn("never gate the crisis text", section)

    # --- Task 1.4 additions: exact question wording and storage-fail marker ---

    def test_energy_question_includes_anchors(self):
        """Telegram must ask the exact energy question with 1=depleted, 5=energized."""
        section = self._mind_section()
        self.assertIn("Energy right now, 1 to 5?", section)
        self.assertIn("1 is depleted", section)
        self.assertIn("5 is highly energized", section)

    def test_positive_emotion_question_includes_anchors(self):
        """Telegram must ask the exact positive-emotion question with 1=none, 5=strong."""
        section = self._mind_section()
        self.assertIn("Positive emotion right now, 1 to 5?", section)
        self.assertIn("1 is none or very low", section)
        self.assertIn("5 is strong", section)

    def test_energy_question_appears_before_positive_emotion_question(self):
        """Energy slot must be listed before positive emotion slot."""
        section = self._mind_section()
        energy_pos = section.find("Energy right now, 1 to 5?")
        emotion_pos = section.find("Positive emotion right now, 1 to 5?")
        self.assertGreater(energy_pos, 0, "Energy question wording not found")
        self.assertGreater(emotion_pos, 0, "Positive emotion question wording not found")
        self.assertLess(energy_pos, emotion_pos, "Energy must appear before positive emotion")

    def test_crisis_stored_false_on_storage_failure(self):
        """If storage fails the handoff must be marked stored:false — not silently dropped."""
        section = self._mind_section()
        self.assertIn("stored:false", section)
        self.assertIn("If storage fails, still return the handoff", section)

    def test_crisis_never_depends_on_successful_persistence(self):
        """Handoff text must never be gated on a successful Convex write."""
        section = self._mind_section().lower()
        self.assertIn(
            "never make the handoff text depend on successful persistence",
            section,
        )


if __name__ == "__main__":
    unittest.main()
