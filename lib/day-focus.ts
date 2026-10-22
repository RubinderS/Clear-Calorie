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
  return [...votes].reduce((best, vote) => (vote[1] > best[1] + EPSILON ? vote : best));
}

// Votes split into fractions, so near-equal counts are a tie.
const EPSILON = 1e-9;

type CatalogId = string | null | undefined;

/**
 * What a day's exercises mostly work, e.g. "Chest day" or "Push day", from
 * the built-in exercises among them. Each item is one exercise, or a
 * sequence's steps, which share a single vote so a warm-up circuit counts no
 * more than one exercise. Null when fewer than half are built-in, since the
 * rest could work anything.
 */
export function dayFocus(
  items: readonly (CatalogId | readonly CatalogId[])[],
  catalog: Catalog = exerciseCatalog,
): string | null {
  const entries = items.flatMap((item) => {
    const ids = Array.isArray(item) ? item : [item];
    const weight = 1 / ids.length;
    return ids.flatMap((id) => {
      const entry = catalog.get(id);
      return entry ? [{entry, weight}] : [];
    });
  });
  const builtIn = entries.reduce((sum, {weight}) => sum + weight, 0);
  if (entries.length === 0 || builtIn < items.length / 2 - EPSILON) return null;

  // A circuit of mostly cardio moves is a cardio day, even when some of them
  // also mainly work the legs, as a jump squat does.
  const cardio = entries
    .filter(({entry}) => entry.areas.primary.includes('cardio'))
    .reduce((sum, {weight}) => sum + weight, 0);
  if (cardio > builtIn / 2 + EPSILON) return 'Cardio day';

  // Each exercise has one vote, shared across the groups it mainly works,
  // leaving out finishers when it also works something else.
  const votes = new Map<string, number>();
  const accessoryVotes = new Map<string, number>();
  const patterns = new Map<Pattern, number>();
  for (const {entry, weight} of entries) {
    const groups = new Set(entry.areas.primary.map((area) => FOCUS_GROUPS[area]));
    const main = [...groups].filter((group) => !ACCESSORY_GROUPS.has(group));
    const [target, voted] = main.length > 0 ? [votes, main] : [accessoryVotes, [...groups]];
    for (const group of voted) {
      target.set(group, (target.get(group) ?? 0) + weight / voted.length);
    }
    if (main.length > 0) {
      const primary = entry.areas.primary.filter(
        (area) => !ACCESSORY_GROUPS.has(FOCUS_GROUPS[area]),
      );
      const pattern = patternOf(primary);
      patterns.set(pattern, (patterns.get(pattern) ?? 0) + weight);
    }
  }

  if (votes.size === 0) return `${topGroup(accessoryVotes)[0]} day`;

  const total = [...votes.values()].reduce((sum, count) => sum + count, 0);
  const [group, count] = topGroup(votes);
  if (count > total / 2 + EPSILON) return `${group} day`;

  // A stray move from another pattern, like a lateral raise on a back day,
  // doesn't make it an upper body day. Within a mostly push or pull day, a
  // group that clearly leads, as back does over the biceps, names it.
  const [pattern, patternCount] = topGroup(patterns);
  if (pattern !== 'lower' && patternCount > total / 2 + EPSILON) {
    const leaders = [...votes.values()].filter(
      (votesFor) => Math.abs(votesFor - count) < EPSILON,
    );
    if (leaders.length === 1) return `${group} day`;
    return pattern === 'push' ? 'Push day' : 'Pull day';
  }
  if (!patterns.has('lower')) return 'Upper body day';
  return 'Full body day';
}
