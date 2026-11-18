import { StudyStats } from '../../core/study/study-api';

/** What a badge counts: only figures that never go down, so a badge once earned stays. */
type BadgeMetric = 'totalReviews' | 'bestStreak' | 'studyDays';

interface BadgeRule {
  id: string;
  metric: BadgeMetric;
  goal: number;
}

export interface Badge {
  id: string;
  earned: boolean;
  /** Where the learner stands, capped at the goal. */
  current: number;
  goal: number;
}

const RULES: readonly BadgeRule[] = [
  { id: 'firstAnswer', metric: 'totalReviews', goal: 1 },
  { id: 'streak3', metric: 'bestStreak', goal: 3 },
  { id: 'streak7', metric: 'bestStreak', goal: 7 },
  { id: 'streak30', metric: 'bestStreak', goal: 30 },
  { id: 'answers100', metric: 'totalReviews', goal: 100 },
  { id: 'answers1000', metric: 'totalReviews', goal: 1000 },
  { id: 'days10', metric: 'studyDays', goal: 10 },
  { id: 'days50', metric: 'studyDays', goal: 50 },
];

/** Every badge, earned or not, in the order they are usually earned. */
export function badgesOf(stats: StudyStats): Badge[] {
  return RULES.map(({ id, metric, goal }) => {
    const value = stats[metric];
    return { id, earned: value >= goal, current: Math.min(value, goal), goal };
  });
}
