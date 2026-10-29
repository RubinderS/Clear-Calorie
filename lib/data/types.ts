// Plain shapes of stored records, as the data layer returns them. Ids are
// strings, optional fields are null (never missing), dates are Dates.

export type User = {
  id: string;
  name: string | null;
  email: string;
  emailVerified: Date | null;
  image: string | null;
  password: string | null;
  // Browser-detected IANA timezone, saved so server jobs know the user's local week
  timeZone: string | null;
  // Last dashboard visit, updated at most hourly
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type VerificationToken = {
  id: string;
  identifier: string;
  token: string;
  expires: Date;
};

export type FoodLog = {
  id: string;
  userId: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturatedFat: number;
  // AI health alert shown when the entry was estimated ("caution" | "avoid")
  healthAlertLevel: string | null;
  healthAlertMessage: string | null;
  loggedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type SavedFoodItem = {
  id: string;
  userId: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturatedFat: number;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** One set as done; stored inside its exercise log, ordered by position. */
export type ExerciseSet = {
  // 1-based order within the log
  position: number;
  // A set is done either for reps or for a time
  reps: number | null;
  durationSec: number | null;
  weight: number | null;
  // For sequence logs: which exercise this step was
  name: string | null;
  catalogId: string | null;
};

export type ExerciseLog = {
  id: string;
  userId: string;
  name: string;
  type: string;
  durationMin: number;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  loggedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  // Set when the entry was ticked off from a planned exercise goal
  exerciseGoalId: string | null;
  // User-local yyyy-MM-dd the goal was ticked for; one tick per goal per day
  goalDate: string | null;
  // Built-in exercise (lib/exercise-catalog) this is linked to; set from the name
  catalogId: string | null;
  // Strength sets as done; sets/reps/weight above summarize them (count and top set)
  exerciseSets: ExerciseSet[];
};

/** A set as API responses and pages show it. */
export type ExerciseSetView = Omit<ExerciseSet, 'position'>;

/** An exercise log with its sets and its planned goal's notes. */
export type ExerciseLogWithDetails = Omit<ExerciseLog, 'exerciseSets'> & {
  exerciseGoal: {notes: string | null} | null;
  exerciseSets: ExerciseSetView[];
};

export type SavedExerciseItem = {
  id: string;
  userId: string;
  name: string;
  type: string;
  durationMin: number;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  // JSON array of each planned set (reps or durationSec, weight); columns above summarize it
  setPlan: string | null;
  // Built-in exercise (lib/exercise-catalog) this is linked to; set from the name
  catalogId: string | null;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ExerciseGoal = {
  id: string;
  userId: string;
  name: string;
  type: string;
  durationMin: number | null;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  // JSON array of each planned set (reps or durationSec, weight); columns above summarize it
  setPlan: string | null;
  // Workout rep tempo; null uses the app default
  tempoMs: number | null;
  // Free-form notes shown in the plan and during the workout
  notes: string | null;
  // Built-in exercise (lib/exercise-catalog) this is linked to; set from the name
  catalogId: string | null;
  // A custom exercise done one side at a time: "each" or "alternate" (see
  // Sides in lib/workout); null works both sides together
  sides: string | null;
  // For type "SEQUENCE": JSON array of steps (one set of one exercise each,
  // with the break before it), run back to back and logged as one entry
  steps: string | null;
  // Bit n set = active on JS getDay() n (0 = Sunday)
  daysMask: number;
  createdAt: Date;
  updatedAt: Date;
};

// Frozen count of planned exercises for a past day, written before the plan
// changes so history isn't rewritten. Days without a row derive from current goals.
export type ExercisePlanDay = {
  id: string;
  userId: string;
  // User-local yyyy-MM-dd
  date: string;
  plannedCount: number;
};

export type WeightLog = {
  id: string;
  userId: string;
  weight: number;
  loggedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

// Optional body measurement the user chose to track: a preset (key set) or
// their own label and unit
export type BodyMetric = {
  id: string;
  userId: string;
  // Preset key from lib/body-metrics.ts; null for custom metrics
  key: string | null;
  label: string;
  unit: string;
  // Which way is good: "down", "up" or "neutral"
  direction: string;
  decimals: number;
  sortOrder: number;
  // Archived metrics are hidden but keep their history; null = active
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BodyMetricLog = {
  id: string;
  metricId: string;
  value: number;
  loggedAt: Date;
  createdAt: Date;
};

export type Goal = {
  id: string;
  userId: string;
  calorieGoal: number;
  proteinGoal: number;
  carbsGoal: number;
  fatGoal: number;
  saturatedFatGoal: number;
  healthNotes: string | null;
  // Likes, dislikes and diet, e.g. "vegetarian, no mushrooms"; used by the AI coach
  foodPreferences: string | null;
};

// Details for maintenance calories (lib/tdee.ts). Weight comes from weigh-ins.
export type Profile = {
  id: string;
  userId: string;
  // "male" | "female"
  sex: string;
  // Stored instead of age so it doesn't go stale
  birthYear: number;
  heightCm: number;
  // Optional; switches BMR to Katch-McArdle
  bodyFatPct: number | null;
  // Key of ACTIVITY_LEVELS
  activityLevel: string;
  // Key of FITNESS_GOALS
  goal: string;
  createdAt: Date;
  updatedAt: Date;
};

// AI-written analysis of one Monday-Sunday week, generated by a server job.
// Metrics are computed in code; the AI only writes the text and proposes the
// next week's focus, which the following report checks.
export type WeeklyReport = {
  id: string;
  userId: string;
  // User-local yyyy-MM-dd Monday and Sunday the report covers
  weekStart: string;
  weekEnd: string;
  // IANA timezone the week's day boundaries were computed in
  timeZone: string;
  // Report whose nextWeekFocus this one checked; null on the first report
  previousReportId: string | null;

  // Goals at generation time, since goals can change later
  calorieGoal: number;
  proteinGoal: number;
  carbsGoal: number;
  fatGoal: number;
  saturatedFatGoal: number;
  healthNotes: string | null;

  // Nutrition, averaged over days with food logged
  daysLogged: number;
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  avgSaturatedFat: number;
  calorieDaysOver: number;
  proteinDaysHit: number;
  satFatDaysOver: number;
  healthAlertCount: number;

  // Exercise
  exercisesPlanned: number;
  exercisesDone: number;
  cardioMinutes: number;
  strengthSessions: number;

  // Weight averages; weightAvg is null when there were no weigh-ins, and
  // prevWeightAvg covers the week before (or the latest earlier weigh-in)
  weighInCount: number;
  weightAvg: number | null;
  prevWeightAvg: number | null;
  // JSON: averages of the body metrics tracked at generation time; null on
  // reports from before body metrics existed
  bodyMetrics: string | null;
  // JSON: the user's profile, goal and maintenance calories at generation
  // time; null when they hadn't filled in a profile
  profile: string | null;

  // JSON detail, shown and sent to the AI but never queried
  dailyBreakdown: string;
  topIssues: string;
  strengthProgress: string;
  // How the previous report's nextWeekFocus went this week, computed in code
  lastWeekFocusResults: string | null;
  // Measurable goals for the week ahead
  nextWeekFocus: string;

  // AI output
  headline: string;
  // JSON: [{title, points: string[]}]
  narrative: string;
  // JSON: string[] of changes to the exercise plan or food goal that suit the
  // user's profile goal; null without a profile
  goalSuggestions: string | null;
  model: string;
  promptVersion: number;

  // When the user first opened this report, or an older one was covered by a
  // newer one they opened; null shows a "new report" notice on the dashboard
  seenAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
};

// A conversation with the AI coach.
export type ChatThread = {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

// One message in the model's format, tool calls and results included, so
// later turns can replay the whole context.
export type ChatMessage = {
  id: string;
  threadId: string;
  // "user" | "assistant" | "tool"
  role: string;
  content: string | null;
  // JSON: [{id, name, arguments}] the assistant asked to run
  toolCalls: string | null;
  // The tool call a "tool" message answers
  toolCallId: string | null;
  createdAt: Date;
};

// A log entry the coach proposed; nothing is saved until the user confirms.
export type ChatAction = {
  id: string;
  threadId: string;
  userId: string;
  // "food" | "exercise" | "weight" | "plan"
  kind: string;
  // JSON: the entry as the log API takes it, or the plan change
  payload: string;
  // "pending" | "confirmed" | "dismissed"
  status: string;
  // Id of the log entry created, or the plan goal changed, on confirm
  resultId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
};
