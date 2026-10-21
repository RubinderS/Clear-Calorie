import {exerciseCatalog, type BodyArea, type Catalog} from '@/lib/exercise-catalog';

/** Broad groups a day is named after; arms and legs merge their muscles. */
const FOCUS_GROUPS: Record<BodyArea, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulder',
  biceps: 'Arm',
  triceps: 'Arm',
  forearms: 'Arm',
  glutes: 'Leg',
  quads: 'Leg',
  hamstrings: 'Leg',
  calves: 'Leg',
  core: 'Core',
  cardio: 'Cardio',
  'full-body': 'Full body',
};

// Usually finishers on a split day, so they name a day only when it's all they are.
const ACCESSORY_GROUPS = new Set(['Core', 'Cardio', 'Full body']);
const LOWER_AREAS = new Set<BodyArea>(['glutes', 'quads', 'hamstrings', 'calves']);
const PULL_AREAS = new Set<BodyArea>(['back', 'biceps', 'forearms']);

type Pattern = 'push' | 'pull' | 'lower';

/**
 * Whether an exercise pushes, pulls or works the legs. Shoulders count as a
 * push unless the exercise also works a pulling muscle, as a face pull does.
 */
function patternOf(primary: readonly BodyArea[]): Pattern {
  if (primary.some((area) => LOWER_AREAS.has(area))) return 'lower';
  if (primary.some((area) => PULL_AREAS.has(area))) return 'pull';
  return 'push';
}

// Ties go to the group seen first, so the same day always gets the same name.
function topGroup(votes: Map<string, number>): [string, number] {
  return [...votes].reduce((best, vote) => (vote[1] > best[1] ? vote : best));
}

/**
 * What a day's exercises mostly work, e.g. "Chest day" or "Push day", from
 * the built-in exercises among them. Null when fewer than half are built-in,
 * since the rest could work anything.
 */
export function dayFocus(
  catalogIds: readonly (string | null | undefined)[],
  catalog: Catalog = exerciseCatalog,
): string | null {
  const entries = catalogIds.flatMap((id) => catalog.get(id) ?? []);
  if (entries.length === 0 || entries.length < catalogIds.length / 2) return null;

  // Each exercise has one vote, shared across the groups it mainly works,
  // leaving out finishers when it also works something else.
  const votes = new Map<string, number>();
  const accessoryVotes = new Map<string, number>();
  const patterns = new Set<Pattern>();
  for (const entry of entries) {
    const groups = new Set(entry.areas.primary.map((area) => FOCUS_GROUPS[area]));
    const main = [...groups].filter((group) => !ACCESSORY_GROUPS.has(group));
    const [target, voted] = main.length > 0 ? [votes, main] : [accessoryVotes, [...groups]];
    for (const group of voted) {
      target.set(group, (target.get(group) ?? 0) + 1 / voted.length);
    }
    if (main.length > 0) {
      const primary = entry.areas.primary.filter(
        (area) => !ACCESSORY_GROUPS.has(FOCUS_GROUPS[area]),
      );
      patterns.add(patternOf(primary));
    }
  }

  if (votes.size === 0) return `${topGroup(accessoryVotes)[0]} day`;

  const total = [...votes.values()].reduce((sum, count) => sum + count, 0);
  const [group, count] = topGroup(votes);
  if (count > total / 2) return `${group} day`;

  if (patterns.size === 1 && patterns.has('push')) return 'Push day';
  if (patterns.size === 1 && patterns.has('pull')) return 'Pull day';
  if (!patterns.has('lower')) return 'Upper body day';
  return 'Full body day';
}
