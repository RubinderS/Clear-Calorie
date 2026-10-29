import {z} from 'zod';
import {EXERCISE_TYPES, type ExerciseType} from '@/lib/exercise';
import {cycleMs, type AnimationPhase} from '@/lib/exercise-animation';
import {CATALOG_SOURCES} from './entries';

/**
 * The built-in exercise list. Each entry has an animation made with
 * docs/exercise-animation-prompt.md; the prompt's JSON config lives next to
 * this file and the animation in components/exercise-animations/<id>.tsx.
 */

export const BODY_AREAS = [
  {key: 'chest', label: 'Chest'},
  {key: 'back', label: 'Back'},
  {key: 'shoulders', label: 'Shoulders'},
  {key: 'biceps', label: 'Biceps'},
  {key: 'triceps', label: 'Triceps'},
  {key: 'forearms', label: 'Forearms'},
  {key: 'core', label: 'Core'},
  {key: 'glutes', label: 'Glutes'},
  {key: 'quads', label: 'Quads'},
  {key: 'hamstrings', label: 'Hamstrings'},
  {key: 'calves', label: 'Calves'},
  {key: 'full-body', label: 'Full body'},
  {key: 'cardio', label: 'Cardio'},
  {key: 'mind', label: 'Mind'},
] as const;
export type BodyArea = (typeof BODY_AREAS)[number]['key'];
export const BODY_AREA_KEYS = BODY_AREAS.map(({key}) => key) as [
  BodyArea,
  ...BodyArea[],
];
const bodyAreaSchema = z.enum(BODY_AREA_KEYS);

export function bodyAreaLabel(area: BodyArea): string {
  return BODY_AREAS.find(({key}) => key === area)?.label ?? area;
}

/** The JSON config the animation prompt outputs alongside each animation. */
export const animationConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(100),
  view: z.enum(['side', 'front']),
  equipment: z.array(z.string().min(1)),
  phases: z
    .array(
      z.object({
        name: z.string().min(1),
        durationMs: z.number().int().positive(),
        from: z.number().min(0).max(1),
        to: z.number().min(0).max(1),
        cue: z.string().min(1),
      }),
    )
    .min(1),
  formTips: z.array(z.string().min(1)),
  commonMistakes: z.array(z.string().min(1)),
});
export type AnimationConfig = z.infer<typeof animationConfigSchema>;

/** What a session adds to entries.ts for each exercise. */
export const catalogSourceSchema = z.object({
  config: animationConfigSchema,
  type: z.enum(EXERCISE_TYPES),
  aliases: z.array(z.string().trim().min(1)).default([]),
  areas: z.object({
    primary: z.array(bodyAreaSchema).min(1),
    secondary: z.array(bodyAreaSchema).default([]),
  }),
  // The music a workout plays behind it: gym beats, or a calm track for slow, quiet work.
  music: z.enum(['workout', 'calm']).default('workout'),
  // One side at a time: 'each' does a side's reps then switches; 'alternate'
  // swaps every rep, so a rep is one on each side. Reps are always per side.
  sides: z.enum(['both', 'each', 'alternate']).default('both'),
  // Kept so old links resolve; never offered or matched for new ones.
  retired: z.boolean().default(false),
});
// JSON imports type enums as plain strings, so configs are checked when the
// catalog is built rather than by the compiler.
export type CatalogSource = Omit<z.input<typeof catalogSourceSchema>, 'config'> & {
  config: unknown;
};

export type CatalogEntry = {
  id: string;
  name: string;
  /** Which way the rabbit faces the camera: side-on (facing +x in 3D) or front-on (facing +z). */
  view: 'side' | 'front';
  type: ExerciseType;
  aliases: string[];
  equipment: string[];
  areas: {primary: BodyArea[]; secondary: BodyArea[]};
  formTips: string[];
  commonMistakes: string[];
  /** The rep as the animation plays it at its own tempo. */
  phases: AnimationPhase[];
  // One loop of the animation, the natural time for a rep
  cycleMs: number;
  /** The music a workout plays behind it. */
  music: 'workout' | 'calm';
  /** Whether it's done one side at a time; reps are then per side. */
  sides: 'both' | 'each' | 'alternate';
  retired: boolean;
};

const TOKEN_EXPANSIONS: Record<string, string> = {
  db: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
};

function singular(token: string): string {
  return token.length > 3 && token.endsWith('s') && !token.endsWith('ss')
    ? token.slice(0, -1)
    : token;
}

/** Lowercase words without punctuation, abbreviations or plurals, for matching. */
export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((token) => singular(TOKEN_EXPANSIONS[token] ?? token))
    .join(' ');
}

export type Catalog = ReturnType<typeof createCatalog>;

/** Validates the sources and builds the lookups. Throws on a bad or ambiguous entry. */
export function createCatalog(sources: readonly CatalogSource[]) {
  const entries: CatalogEntry[] = sources.map((source) => {
    const {config, type, aliases, areas, music, sides, retired} =
      catalogSourceSchema.parse(source);
    return {
      id: config.id,
      name: config.name,
      view: config.view,
      type,
      aliases,
      equipment: config.equipment,
      areas,
      formTips: config.formTips,
      commonMistakes: config.commonMistakes,
      phases: config.phases,
      cycleMs: cycleMs(config.phases),
      music,
      sides,
      retired,
    };
  });

  const byId = new Map<string, CatalogEntry>();
  const byName = new Map<string, CatalogEntry>();
  // Aliases only steer search, but one meaning two entries is a mistake.
  const byNameOrAlias = new Map<string, CatalogEntry>();
  for (const entry of entries) {
    if (byId.has(entry.id)) {
      throw new Error(`Duplicate exercise catalog id "${entry.id}"`);
    }
    byId.set(entry.id, entry);
    byName.set(normalizeExerciseName(entry.name), entry);
    for (const name of [entry.name, ...entry.aliases]) {
      const key = normalizeExerciseName(name);
      const other = byNameOrAlias.get(key);
      if (other && other !== entry) {
        throw new Error(
          `"${name}" matches both "${other.id}" and "${entry.id}" in the exercise catalog`,
        );
      }
      byNameOrAlias.set(key, entry);
    }
  }
  const active = entries.filter((entry) => !entry.retired);

  return {
    entries: active,
    // Retired entries too, for checks over every file
    all: entries,

    get(id: string | null | undefined): CatalogEntry | null {
      return (id && byId.get(id)) || null;
    },

    /**
     * The entry an exercise with this name is linked to. Linking renames an
     * exercise to its entry's name, so the name alone decides the link.
     */
    linkFor(name: string): CatalogEntry | null {
      return byName.get(normalizeExerciseName(name)) ?? null;
    },

    /** Entries ranked by how many query words they match, for suggestions. */
    search(
      query: string,
      {area, limit = 8}: {area?: BodyArea; limit?: number} = {},
    ): CatalogEntry[] {
      const words = normalizeExerciseName(query).split(' ').filter(Boolean);
      return active
        .filter(
          (entry) =>
            !area ||
            entry.areas.primary.includes(area) ||
            entry.areas.secondary.includes(area),
        )
        .map((entry) => {
          const nameWords = normalizeExerciseName(entry.name).split(' ');
          const otherWords = normalizeExerciseName(
            [
              ...entry.aliases,
              ...entry.equipment,
              ...entry.areas.primary.map(bodyAreaLabel),
            ].join(' '),
          ).split(' ');
          const score = words.reduce(
            (sum, word) =>
              sum +
              (nameWords.some((w) => w.startsWith(word))
                ? 2
                : otherWords.some((w) => w.startsWith(word))
                  ? 1
                  : 0),
            0,
          );
          return {entry, score};
        })
        .filter(({score}) => words.length === 0 || score > 0)
        .sort(
          (a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name),
        )
        .slice(0, limit)
        .map(({entry}) => entry);
    },
  };
}

export const exerciseCatalog = createCatalog(CATALOG_SOURCES);

/** The catalog id to store for an exercise with this name, or null. */
export function catalogIdFor(name: string): string | null {
  return exerciseCatalog.linkFor(name)?.id ?? null;
}

/** An entry's areas with labels, as the UI and coach tools show them. */
export function describeAreas(entry: CatalogEntry) {
  return {
    primary: entry.areas.primary.map(bodyAreaLabel),
    secondary: entry.areas.secondary.map(bodyAreaLabel),
  };
}
