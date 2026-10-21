import type {CatalogSource} from './index';
import bandFacePull from './band-face-pull.json';
import bandTricepsExtension from './band-triceps-extension.json';
import bandTricepsPushdown from './band-triceps-pushdown.json';
import barbellBenchPress from './barbell-bench-press.json';
import barbellBentOverRow from './barbell-bent-over-row.json';
import barbellSquat from './barbell-squat.json';
import bulgarianSplitSquat from './bulgarian-split-squat.json';
import chinUp from './chin-up.json';
import closeGripPushUp from './close-grip-push-up.json';
import dumbbellCalfRaise from './dumbbell-calf-raise.json';
import dumbbellCurl from './dumbbell-curl.json';
import dumbbellFly from './dumbbell-fly.json';
import dumbbellLateralRaise from './dumbbell-lateral-raise.json';
import dumbbellRomanianDeadlift from './dumbbell-romanian-deadlift.json';
import dumbbellShoulderPress from './dumbbell-shoulder-press.json';
import dumbbellWalkingLunge from './dumbbell-walking-lunge.json';
import dumbbellWristCurl from './dumbbell-wrist-curl.json';
import gobletSquat from './goblet-squat.json';
import hammerCurl from './hammer-curl.json';
import hangingKneeRaise from './hanging-knee-raise.json';
import inclineDumbbellCurl from './incline-dumbbell-curl.json';
import inclineDumbbellPress from './incline-dumbbell-press.json';
import jumpingJack from './jumping-jack.json';
import oneArmDumbbellRow from './one-arm-dumbbell-row.json';
import plank from './plank.json';
import pullUp from './pull-up.json';
import pushUp from './push-up.json';
import romanianDeadlift from './romanian-deadlift.json';
import slidingLegCurl from './sliding-leg-curl.json';

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
    aliases: ['rear-foot elevated split squat', 'bulgarian squat', 'dumbbell bulgarian split squat'],
    areas: {primary: ['quads', 'glutes'], secondary: ['hamstrings', 'core']},
  },
  {
    config: dumbbellWalkingLunge,
    type: 'STRENGTH',
    aliases: ['walking lunge', 'dumbbell lunge', 'lunge'],
    areas: {primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves', 'core']},
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
];
