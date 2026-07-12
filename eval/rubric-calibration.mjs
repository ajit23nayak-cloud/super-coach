import fs from 'node:fs'

const data = JSON.parse(fs.readFileSync(new URL('./fixture.json', import.meta.url), 'utf8'))

function score(text) {
  const checks = {
    actualNumber: /\b(?:77|53|349)\b/.test(text),
    mindEvidence: /Ship Super Coach|open shipping decision/i.test(text),
    careerEvidence: /no stalled|overdue promise|calendar|goals review/i.test(text),
    crossDomain: /sleep|HRV|health/i.test(text) && /decision|Gmail|calendar|promise|ship/i.test(text),
    causalOrContrast: /constraint|because|cost|not external|but /i.test(text),
    executableAction: /ACTION:/i.test(text),
    missingEvidenceHonesty: /HRV (?:is )?unavailable|no HRV claim/i.test(text),
    noPlatitude: !/balance work and rest/i.test(text),
  }
  return { score: Object.values(checks).filter(Boolean).length, checks }
}

const fixtureScores = Object.fromEntries(
  Object.entries(data.outputs).map(([version, output]) => [version, score(output)]),
)
const strictlyOrdered = fixtureScores.v1.score < fixtureScores.v2.score
  && fixtureScores.v2.score < fixtureScores.v3.score

console.log(JSON.stringify({
  kind: 'rubric-calibration',
  note: 'Scores hand-authored fixtures to validate the rubric; this does not call a model.',
  scenario: data.scenario,
  fixtureScores,
  strictlyOrdered,
}, null, 2))
if (!strictlyOrdered) process.exit(1)
