import type { Mastery } from "./types";
export function updateMastery(
  previous: Mastery | undefined,
  correct: boolean,
  difficulty: number,
  now = new Date(),
): Mastery {
  const old = previous || {
    score: 0,
    streak: 0,
    interval: 0,
    due: now.toISOString(),
    attempts: 0,
  };
  const streak = correct ? old.streak + 1 : 0;
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        old.score +
          (correct
            ? Math.max(
                1,
                Math.round((100 - old.score) * (0.12 + 0.05 * difficulty)),
              )
            : -(12 + 3 * difficulty)),
      ),
    ),
  );
  const interval = correct
    ? Math.min(60, old.interval ? old.interval * (streak > 2 ? 2.5 : 1.7) : 1)
    : 0;
  return {
    score,
    streak,
    interval,
    due: new Date(
      now.getTime() + (correct ? interval * 86400000 : 10 * 60000),
    ).toISOString(),
    attempts: old.attempts + 1,
  };
}
export function adaptiveDifficulty(m?: Mastery, thresholds = [40, 70, 90]) {
  return !m || m.score < thresholds[0] ? 1 : m.score < thresholds[1] ? 2 : 3;
}
export function xpFor(correct: boolean, difficulty: number) {
  return correct ? (difficulty >= 3 ? 20 : 10) : 0;
}
