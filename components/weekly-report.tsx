import type {ReactNode} from 'react';
import {format, parseISO} from 'date-fns';
import {
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  TrendingUp,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {cn} from '@/lib/utils';
import type {FocusProgress, WeeklyReportView} from '@/lib/weekly-report';
import {
  planAdherence,
  type FocusMetric,
  type FocusStatus,
} from '@/lib/weekly-report-metrics';

// parseISO keeps date-only keys at local midnight; new Date() would read them as UTC.
export function formatWeekRange(weekStart: string, weekEnd: string) {
  return `${format(parseISO(weekStart), 'MMM d')} – ${format(parseISO(weekEnd), 'MMM d')}`;
}

const FOCUS_UNITS: Record<FocusMetric, string> = {
  avgCalories: 'kcal/day',
  avgProtein: 'g/day',
  avgCarbs: 'g/day',
  avgFat: 'g/day',
  avgSaturatedFat: 'g/day',
  calorieDaysOver: 'days',
  proteinDaysHit: 'days',
  satFatDaysOver: 'days',
  daysLogged: 'days',
  planAdherence: '%',
  cardioMinutes: 'min',
  strengthSessions: 'days',
  weighInCount: 'weigh-ins',
  foodMeals: 'meals',
};

/** "Mon" or "Mon–Wed" for consecutive yyyy-MM-dd dates. */
function formatDays(days: string[]) {
  const first = format(parseISO(days[0]), 'EEE');
  return days.length === 1
    ? first
    : `${first}–${format(parseISO(days[days.length - 1]), 'EEE')}`;
}

function plural(count: number, word: string) {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

function formatFocusValue(metric: FocusMetric, value: number | null) {
  if (value === null) return '—';
  const unit = FOCUS_UNITS[metric];
  if (unit === '%') return `${value}%`;
  // Count units are listed plural; drop the s for exactly one.
  return value === 1 && unit.endsWith('s')
    ? `1 ${unit.slice(0, -1)}`
    : `${value} ${unit}`;
}

const STATUS: Record<
  FocusStatus,
  {label: string; icon: LucideIcon; className: string}
> = {
  met: {label: 'Met', icon: CheckCircle2, className: 'text-primary'},
  improved: {
    label: 'Improved',
    icon: TrendingUp,
    className: 'text-amber-600 dark:text-amber-400',
  },
  missed: {
    label: 'Missed',
    icon: XCircle,
    className: 'text-red-600 dark:text-red-400',
  },
  'no-data': {
    label: 'No data',
    icon: CircleDashed,
    className: 'text-muted-foreground',
  },
};

function StatusIcon({status}: {status: FocusStatus}) {
  const {label, icon: Icon, className} = STATUS[status];
  return (
    <span className={cn('mt-0.5 shrink-0', className)} title={label}>
      <Icon className="h-4 w-4" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

type Tone = 'good' | 'warn' | 'neutral';

function Stat({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border border-border/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'text-xl font-semibold tabular-nums',
          tone === 'good' && 'text-primary',
          tone === 'warn' && 'text-red-600 dark:text-red-400',
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Scorecard({report}: {report: WeeklyReportView['report']}) {
  const adherence = planAdherence(report);
  const weightChange =
    report.weightAvg !== null && report.prevWeightAvg !== null
      ? Math.round((report.weightAvg - report.prevWeightAvg) * 10) / 10
      : null;
  // Secondary numbers share one muted line so the four tiles carry the story.
  const extras = [
    {
      text: `Saturated fat ${report.avgSaturatedFat} g/day`,
      warn: report.avgSaturatedFat > report.saturatedFatGoal,
    },
    {text: `Carbs ${Math.round(report.avgCarbs)} g/day`},
    {text: `Fat ${Math.round(report.avgFat)} g/day`},
    {text: `Cardio ${report.cardioMinutes} min`},
    {text: plural(report.strengthSessions, 'strength day')},
    {text: `Logged ${report.daysLogged}/7 days`, warn: report.daysLogged < 5},
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Calories / day"
          value={`${Math.round(report.avgCalories)}`}
          detail={`goal ${report.calorieGoal}`}
          tone={
            report.avgCalories > report.calorieGoal * 1.05 ? 'warn' : 'good'
          }
        />
        <Stat
          label="Protein / day"
          value={`${report.avgProtein} g`}
          detail={`goal ${report.proteinGoal} g`}
          tone={report.avgProtein >= report.proteinGoal ? 'good' : 'warn'}
        />
        <Stat
          label="Exercise plan"
          value={adherence === null ? '—' : `${adherence}%`}
          detail={`${report.exercisesDone} of ${report.exercisesPlanned} done`}
          tone={adherence !== null && adherence >= 80 ? 'good' : 'neutral'}
        />
        <Stat
          label="Weight (avg)"
          value={report.weightAvg === null ? '—' : `${report.weightAvg} kg`}
          detail={
            report.weightAvg === null
              ? 'no weigh-ins'
              : weightChange === null
                ? 'no earlier weigh-ins'
                : weightChange === 0
                  ? 'same as last week'
                  : `${weightChange > 0 ? '+' : ''}${weightChange} kg vs last week`
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {extras.map(({text, warn}, i) => (
          <span key={text}>
            {i > 0 && ' · '}
            <span className={cn(warn && 'text-red-600 dark:text-red-400')}>
              {text}
            </span>
          </span>
        ))}
      </p>
    </div>
  );
}

// Focus text already states the target ("Average 140 g protein"), so a row
// only adds the outcome.
function FocusRow({
  text,
  status,
  value,
}: {
  text: string;
  status?: FocusStatus;
  value?: string;
}) {
  return (
    <li className="flex items-start gap-2 py-2 text-sm first:pt-0 last:pb-0">
      {status && <StatusIcon status={status} />}
      <span className="min-w-0 flex-1">{text}</span>
      {value && (
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {value}
        </span>
      )}
    </li>
  );
}

function FocusList({
  title,
  valuesTitle,
  children,
}: {
  title: string;
  /** Heading over the right-hand values column. */
  valuesTitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4 text-sm text-muted-foreground">
        <h3 className="font-medium">{title}</h3>
        {valuesTitle && <span className="text-right text-xs">{valuesTitle}</span>}
      </div>
      <ul className="divide-y divide-border/50">{children}</ul>
    </div>
  );
}

export function WeeklyReport({
  view,
  focusProgress,
}: {
  view: WeeklyReportView;
  /** Progress this week on the report's focus; null for older reports and on Mondays. */
  focusProgress: FocusProgress | null;
}) {
  const {report, sections, lastWeekFocusResults, nextWeekFocus} = view;
  const results = lastWeekFocusResults ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardDescription>
            Week of {formatWeekRange(report.weekStart, report.weekEnd)}
          </CardDescription>
          <CardTitle className="text-xl leading-snug">
            {report.headline}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Scorecard report={report} />
        </CardContent>
      </Card>

      {(results.length > 0 || nextWeekFocus.length > 0) && (
        <Card>
          <CardContent className="grid gap-6 pt-6 md:grid-cols-2">
            {results.length > 0 && (
              <FocusList title="Last week's focus">
                {results.map((result) => (
                  <FocusRow
                    key={result.id}
                    text={result.text}
                    status={result.status}
                    value={formatFocusValue(result.metric, result.actual)}
                  />
                ))}
              </FocusList>
            )}
            {nextWeekFocus.length > 0 && (
              <FocusList
                title="This week's focus"
                valuesTitle={
                  focusProgress
                    ? `So far this week (${formatDays(focusProgress.days)})`
                    : undefined
                }
              >
                {nextWeekFocus.map((item) => {
                  const soFar = focusProgress?.results.find(
                    (r) => r.id === item.id && r.status !== 'no-data',
                  );
                  return (
                    <FocusRow
                      key={item.id}
                      text={item.text}
                      value={
                        soFar && formatFocusValue(item.metric, soFar.actual)
                      }
                    />
                  );
                })}
              </FocusList>
            )}
          </CardContent>
        </Card>
      )}

      {sections.length > 0 && (
        <Card>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between p-6 font-medium [&::-webkit-details-marker]:hidden">
              Full breakdown
              <ChevronDown
                className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <CardContent className="space-y-4">
              {sections.map((section) => (
                <div key={section.title}>
                  <h3 className="text-sm font-medium">{section.title}</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                    {section.points.map((point, i) => (
                      <li key={i}>{point}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </details>
        </Card>
      )}
    </div>
  );
}
