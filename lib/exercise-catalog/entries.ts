import type {CatalogSource} from './index';
import bandFacePull from './band-face-pull.json';
import bandTricepsExtension from './band-triceps-extension.json';
import bandTricepsPushdown from './band-triceps-pushdown.json';
import barbellBenchPress from './barbell-bench-press.json';
import barbellBentOverRow from './barbell-bent-over-row.json';
import barbellSquat from './barbell-squat.json';
import bulgarianSplitSquat from './bulgarian-split-squat.json';
import burpee from './burpee.json';
import buttKicks from './butt-kicks.json';
import chestSupportedDumbbellRow from './chest-supported-dumbbell-row.json';
import chinUp from './chin-up.json';
import closeGripPushUp from './close-grip-push-up.json';
import dumbbellBenchPress from './dumbbell-bench-press.json';
import dumbbellBulgarianSplitSquat from './dumbbell-bulgarian-split-squat.json';
import dumbbellCalfRaise from './dumbbell-calf-raise.json';
import dumbbellCurl from './dumbbell-curl.json';
import dumbbellFly from './dumbbell-fly.json';
import dumbbellLateralRaise from './dumbbell-lateral-raise.json';
import dumbbellOverheadTricepsExtension from './dumbbell-overhead-triceps-extension.json';
import dumbbellRomanianDeadlift from './dumbbell-romanian-deadlift.json';
import dumbbellShoulderPress from './dumbbell-shoulder-press.json';
import dumbbellWalkingLunge from './dumbbell-walking-lunge.json';
import dumbbellWristCurl from './dumbbell-wrist-curl.json';
import gobletSquat from './goblet-squat.json';
import hammerCurl from './hammer-curl.json';
import hangingKneeRaise from './hanging-knee-raise.json';
import highKnees from './high-knees.json';
import inclineDumbbellCurl from './incline-dumbbell-curl.json';
import inclineDumbbellPress from './incline-dumbbell-press.json';
import jumpSquat from './jump-squat.json';
import jumpingJack from './jumping-jack.json';
import plankJack from './plank-jack.json';
import meditation from './meditation.json';
import mountainClimber from './mountain-climber.json';
import oneArmDumbbellRow from './one-arm-dumbbell-row.json';
import plank from './plank.json';
import pullUp from './pull-up.json';
import pushUp from './push-up.json';
import romanianDeadlift from './romanian-deadlift.json';
import runningMan from './running-man.json';
import shadowBoxing from './shadow-boxing.json';
import slidingLegCurl from './sliding-leg-curl.json';
import standingHamstringCurl from './standing-hamstring-curl.json';
import wallSit from './wall-sit.json';

/**
 * Every built-in exercise. To add one, follow docs/exercise-animations.md:
 * import its <id>.json config from this folder and add it here with the
 * exercise type, aliases people use for it, and the body areas it works.
 *
 *   import bandFacePull from './band-face-pull.json';
import barbellBenchPress from './barbell-bench-press.json';
 *   {
 *     config: barbellBenchPress,
 *     type: 'STRENGTH',
 *     aliases: ['bench', 'bench press', 'flat bench'],
 *     areas: {primary: ['chest'], secondary: ['shoulders', 'triceps']},
 *   },
 *
 * Never rename or reuse an id; mark an exercise `retired: true` instead.
 */
export const CATALOG_SOURCES: CatalogSource[] = [
  {
    config: pushUp,
    type: 'STRENGTH',
    aliases: ['pushup', 'press-up', 'press up', 'floor push-up', 'chest push-up'],
    areas: {primary: ['chest'], secondary: ['triceps', 'shoulders', 'core']},
  },
  {
    config: jumpingJack,
    // Cardio: usually done for time, and the animation keeps its own pace.
    type: 'TIME',
    aliases: ['jumping jacks', 'star jump', 'star jumps', 'jumpingjack'],
    areas: {primary: ['cardio', 'full-body'], secondary: ['calves', 'shoulders']},
  },
  {
    config: barbellBentOverRow,
    type: 'STRENGTH',
    aliases: ['barbell row', 'bent over row', 'bent-over barbell row', 'bb row'],
    areas: {primary: ['back'], secondary: ['biceps', 'shoulders', 'forearms']},
  },
  {
    config: barbellBenchPress,
    type: 'STRENGTH',
    aliases: ['bench press', 'bench', 'flat bench press', 'flat barbell bench press'],
    areas: {primary: ['chest'], secondary: ['triceps', 'shoulders']},
  },
  {
    config: inclineDumbbellPress,
    type: 'STRENGTH',
    aliases: ['incline dumbbell bench press', 'incline press', 'incline chest press'],
    areas: {primary: ['chest', 'shoulders'], secondary: ['triceps']},
  },
  {
    config: dumbbellBenchPress,
    type: 'STRENGTH',
    aliases: ['dumbbell press', 'db bench press', 'flat dumbbell press', 'flat dumbbell bench press', 'dumbbell chest press'],
    areas: {primary: ['chest'], secondary: ['triceps', 'shoulders']},
  },
  {
    config: dumbbellFly,
    type: 'STRENGTH',
    aliases: ['dumbbell flye', 'flat dumbbell fly', 'chest fly', 'pec fly'],
    areas: {primary: ['chest'], secondary: ['shoulders']},
  },
  {
    config: closeGripPushUp,
    type: 'STRENGTH',
    aliases: ['close-grip pushup', 'narrow push-up', 'tricep push-up', 'triceps push-up'],
    areas: {primary: ['triceps', 'chest'], secondary: ['shoulders', 'core']},
  },
  {
    config: dumbbellShoulderPress,
    type: 'STRENGTH',
    aliases: ['dumbbell overhead press', 'standing dumbbell press', 'seated dumbbell shoulder press', 'dumbbell military press'],
    areas: {primary: ['shoulders'], secondary: ['triceps', 'core']},
  },
  {
    config: dumbbellLateralRaise,
    type: 'STRENGTH',
    aliases: ['lateral raise', 'side raise', 'side lateral raise', 'lat raise'],
    areas: {primary: ['shoulders'], secondary: []},
  },
  {
    config: inclineDumbbellCurl,
    type: 'STRENGTH',
    aliases: ['incline curl', 'incline bicep curl', 'incline biceps curl'],
    areas: {primary: ['biceps'], secondary: ['forearms']},
  },
  {
    config: dumbbellCurl,
    type: 'STRENGTH',
    aliases: ['bicep curl', 'biceps curl', 'dumbbell bicep curl', 'dumbbell biceps curl'],
    areas: {primary: ['biceps'], secondary: ['forearms']},
  },
  {
    config: hammerCurl,
    type: 'STRENGTH',
    aliases: ['dumbbell hammer curl', 'neutral grip curl'],
    areas: {primary: ['biceps', 'forearms'], secondary: []},
  },
  {
    config: pullUp,
    type: 'STRENGTH',
    aliases: ['pullup', 'assisted pull-up', 'wide-grip pull-up', 'band-assisted pull-up'],
    areas: {primary: ['back'], secondary: ['biceps', 'shoulders', 'forearms']},
  },
  {
    config: chinUp,
    type: 'STRENGTH',
    aliases: ['chinup', 'assisted chin-up', 'underhand pull-up', 'chin-up grip pull-up'],
    areas: {primary: ['back', 'biceps'], secondary: ['forearms', 'shoulders']},
  },
  {
    config: oneArmDumbbellRow,
    type: 'STRENGTH',
    aliases: ['single-arm dumbbell row', 'dumbbell row', 'one-arm row', 'single-arm row'],
    areas: {primary: ['back'], secondary: ['biceps', 'shoulders', 'forearms']},
  },
  {
    config: chestSupportedDumbbellRow,
    type: 'STRENGTH',
    aliases: ['chest-supported row', 'incline dumbbell row', 'incline bench dumbbell row', 'prone incline dumbbell row'],
    areas: {primary: ['back'], secondary: ['biceps', 'shoulders', 'forearms']},
  },
  {
    config: bandFacePull,
    type: 'STRENGTH',
    aliases: ['face pull', 'resistance band face pull', 'banded face pull'],
    areas: {primary: ['shoulders', 'back'], secondary: []},
  },
  {
    config: bandTricepsPushdown,
    type: 'STRENGTH',
    aliases: ['band tricep pushdown', 'triceps pushdown', 'tricep pushdown', 'band pushdown'],
    areas: {primary: ['triceps'], secondary: []},
  },
  {
    config: bandTricepsExtension,
    type: 'STRENGTH',
    aliases: ['band overhead triceps extension', 'band tricep extension', 'overhead band triceps extension', 'single-arm band triceps extension'],
    areas: {primary: ['triceps'], secondary: []},
  },
  {
    config: dumbbellOverheadTricepsExtension,
    type: 'STRENGTH',
    aliases: [
      'overhead dumbbell triceps extension',
      'overhead dumbbell tricep extension',
      'dumbbell overhead tricep extension',
      'overhead triceps extension',
      'overhead tricep extension',
      'seated overhead triceps extension',
      'two-hand dumbbell triceps extension',
      'dumbbell french press',
    ],
    areas: {primary: ['triceps'], secondary: ['core']},
  },
  {
    config: barbellSquat,
    type: 'STRENGTH',
    aliases: ['back squat', 'barbell back squat', 'squat'],
    areas: {primary: ['quads', 'glutes'], secondary: ['hamstrings', 'core']},
  },
  {
    config: romanianDeadlift,
    type: 'STRENGTH',
    aliases: ['rdl', 'barbell romanian deadlift', 'barbell rdl'],
    areas: {primary: ['hamstrings', 'glutes'], secondary: ['back', 'forearms']},
  },
  {
    config: bulgarianSplitSquat,
    type: 'STRENGTH',
    aliases: ['rear-foot elevated split squat', 'bulgarian squat'],
    areas: {primary: ['quads', 'glutes'], secondary: ['hamstrings', 'core']},
  },
  {
    config: dumbbellBulgarianSplitSquat,
    type: 'STRENGTH',
    aliases: ['dumbbell rear-foot elevated split squat', 'dumbbell split squat', 'weighted bulgarian split squat'],
    areas: {primary: ['quads', 'glutes'], secondary: ['hamstrings', 'core', 'forearms']},
  },
  {
    config: dumbbellWalkingLunge,
    type: 'STRENGTH',
    aliases: ['walking lunge', 'dumbbell lunge', 'lunge'],
    areas: {primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves', 'core']},
  },
  {
    config: meditation,
    // Done for time; the animation follows one slow breath.
    type: 'TIME',
    aliases: ['meditate', 'mindfulness', 'mindfulness meditation', 'breathing meditation', 'breathwork', 'seated meditation', 'sukhasana', 'easy pose'],
    areas: {primary: ['mind'], secondary: []},
    music: 'calm',
  },
  {
    config: gobletSquat,
    type: 'STRENGTH',
    aliases: ['dumbbell goblet squat', 'kettlebell goblet squat'],
    areas: {primary: ['quads', 'glutes'], secondary: ['core']},
  },
  {
    config: dumbbellRomanianDeadlift,
    type: 'STRENGTH',
    aliases: ['dumbbell rdl', 'dumbbell stiff-leg deadlift'],
    areas: {primary: ['hamstrings', 'glutes'], secondary: ['back', 'forearms']},
  },
  {
    config: slidingLegCurl,
    type: 'STRENGTH',
    aliases: ['slider leg curl', 'sliding hamstring curl', 'towel leg curl'],
    areas: {primary: ['hamstrings'], secondary: ['glutes', 'core']},
  },
  {
    config: dumbbellCalfRaise,
    type: 'STRENGTH',
    aliases: ['calf raise', 'standing calf raise', 'standing dumbbell calf raise'],
    areas: {primary: ['calves'], secondary: []},
  },
  {
    config: hangingKneeRaise,
    type: 'STRENGTH',
    aliases: ['knee raise', 'hanging knee tuck', "captain's chair knee raise"],
    areas: {primary: ['core'], secondary: ['forearms']},
  },
  {
    config: plank,
    // A hold, done for time; the animation marks each step of the hold.
    type: 'TIME',
    aliases: ['forearm plank', 'front plank', 'elbow plank'],
    areas: {primary: ['core'], secondary: ['shoulders', 'glutes']},
  },
  {
    config: dumbbellWristCurl,
    type: 'STRENGTH',
    aliases: ['wrist curl', 'seated wrist curl', 'seated dumbbell wrist curl'],
    areas: {primary: ['forearms'], secondary: []},
  },
  {
    config: highKnees,
    // Cardio from here on: done for time unless counted in reps.
    type: 'TIME',
    aliases: ['high knee', 'high knee run', 'high knee running', 'running in place', 'jogging in place'],
    areas: {primary: ['cardio', 'full-body'], secondary: ['quads', 'core', 'calves']},
  },
  {
    config: buttKicks,
    type: 'TIME',
    aliases: ['butt kick', 'butt kickers', 'heel flicks', 'heel kicks', 'glute kicks'],
    areas: {primary: ['cardio'], secondary: ['hamstrings', 'calves']},
  },
  {
    config: runningMan,
    type: 'TIME',
    aliases: ['running man march', 'standing running man', 'knee drive step back'],
    areas: {primary: ['cardio'], secondary: ['quads', 'glutes', 'core']},
  },
  {
    config: standingHamstringCurl,
    type: 'TIME',
    aliases: ['cardio hamstring curl', 'standing leg curl', 'hamstring curl with row'],
    areas: {primary: ['cardio', 'hamstrings'], secondary: ['glutes', 'back']},
  },
  {
    config: plankJack,
    type: 'TIME',
    aliases: ['plank jacks', 'plank jumping jack', 'jumping jack plank', 'plank jumping jacks'],
    areas: {primary: ['cardio', 'core'], secondary: ['shoulders', 'glutes']},
  },
  {
    config: mountainClimber,
    type: 'TIME',
    aliases: ['climbers', 'mountain climbers', 'running plank'],
    areas: {primary: ['cardio', 'core'], secondary: ['shoulders', 'quads']},
  },
  {
    config: burpee,
    type: 'STRENGTH',
    aliases: ['burpees', 'squat thrust jump', 'full burpee'],
    areas: {primary: ['full-body', 'cardio'], secondary: ['chest', 'quads', 'shoulders', 'core']},
  },
  {
    config: jumpSquat,
    type: 'STRENGTH',
    aliases: ['squat jump', 'jumping squat', 'plyo squat', 'bodyweight jump squat'],
    areas: {primary: ['quads', 'glutes', 'cardio'], secondary: ['hamstrings', 'calves', 'core']},
  },
  {
    config: shadowBoxing,
    type: 'TIME',
    aliases: ['shadowboxing', 'shadow box', 'boxing', 'jab cross', 'air boxing'],
    areas: {primary: ['cardio', 'shoulders'], secondary: ['core', 'triceps']},
  },
  {
    config: wallSit,
    // A hold, done for time; the animation marks each step of the hold.
    type: 'TIME',
    aliases: ['wall sits', 'wall squat', 'wall squat hold', 'wall chair', 'chair pose against wall', 'wall sitting'],
    areas: {primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves', 'core']},
  },
];
