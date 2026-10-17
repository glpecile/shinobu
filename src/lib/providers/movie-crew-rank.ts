const JOB_ORDER = [
  /^director$/i,
  /^(screenplay|screenwriter|writer)$/i,
  /^(story|story by|original story)$/i,
  /^(director of photography|cinematographer|dp)$/i,
  /^editor$/i,
  /^(original music composer|composer|music|music by)$/i,
  /^stunts?\b/i,
  /^(costume design|costume designer)$/i,
  /^(make-?up artist|key make-?up artist|make-?up designer|make-?up department head)$/i,
];

/** A multi-job person bills at their highest-priority movie credit. */
export function movieCrewRank(jobs: readonly string[]): number {
  const rank = JOB_ORDER.findIndex((pattern) => jobs.some((job) => pattern.test(job)));
  return rank < 0 ? JOB_ORDER.length : rank;
}
