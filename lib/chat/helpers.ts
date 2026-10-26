import {addDays, differenceInCalendarDays, format, parseISO, subDays} from 'date-fns';
import type {ChatMessageParam, ToolCall} from '../ai';

/** Longest date range a tool reads in one call. */
export const MAX_RANGE_DAYS = 90;

/** A bad tool input; its message is written for the model to correct the call. */
export class ToolInputError extends Error {}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = parseISO(value);
  return !Number.isNaN(date.getTime()) && format(date, 'yyyy-MM-dd') === value;
}

/**
 * The user-local yyyy-MM-dd dates from `from` to `to` inclusive. `to`
 * defaults to today and is never later than today; `from` defaults to
 * `defaultDays` before `to`. Ranges longer than MAX_RANGE_DAYS keep the most
 * recent days. Throws a message for the model on bad input.
 */
export function resolveDates(
  {from, to}: {from?: string; to?: string},
  today: string,
  defaultDays = 7,
): {dates: string[]; truncated: boolean} {
  if (from && !isValidDate(from)) throw new ToolInputError(`Invalid "from" date: ${from}`);
  if (to && !isValidDate(to)) throw new ToolInputError(`Invalid "to" date: ${to}`);

  const end = to && to < today ? to : today;
  const start =
    from ?? format(subDays(parseISO(end), defaultDays - 1), 'yyyy-MM-dd');
  if (start > end) throw new ToolInputError('"from" must not be after "to" or today');

  const span = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
  const truncated = span > MAX_RANGE_DAYS;
  const first = truncated
    ? format(subDays(parseISO(end), MAX_RANGE_DAYS - 1), 'yyyy-MM-dd')
    : start;

  const dates: string[] = [];
  for (let date = parseISO(first); format(date, 'yyyy-MM-dd') <= end; date = addDays(date, 1)) {
    dates.push(format(date, 'yyyy-MM-dd'));
  }
  return {dates, truncated};
}

/** Largest tool result sent back to the model, in characters. */
export const MAX_TOOL_RESULT_CHARS = 16_000;

export function serializeToolResult(result: unknown): string {
  const json = JSON.stringify(result);
  if (json.length <= MAX_TOOL_RESULT_CHARS) return json;
  return JSON.stringify({
    note: 'Result was too long and has been cut off. Ask for a shorter date range for full detail.',
    partial: json.slice(0, MAX_TOOL_RESULT_CHARS),
  });
}

export type StoredMessage = {
  role: string;
  content: string | null;
  toolCalls: string | null;
  toolCallId: string | null;
};

function parseToolCalls(value: string | null): ToolCall[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Turns stored messages into the model's format. Keeps the last `limit`
 * messages, starting at a user message, and drops tool calls whose results
 * are missing (e.g. after a crash), which the API would reject.
 */
export function toModelHistory(
  stored: readonly StoredMessage[],
  limit = 40,
): ChatMessageParam[] {
  let recent = stored.slice(-limit);
  const firstUser = recent.findIndex((message) => message.role === 'user');
  recent = firstUser === -1 ? [] : recent.slice(firstUser);

  const result: ChatMessageParam[] = [];
  for (let i = 0; i < recent.length; i++) {
    const message = recent[i];
    if (message.role === 'user') {
      result.push({role: 'user', content: message.content ?? ''});
    } else if (message.role === 'assistant') {
      const calls = parseToolCalls(message.toolCalls);
      const results = new Map<string, string>();
      let j = i + 1;
      while (j < recent.length && recent[j].role === 'tool') {
        results.set(recent[j].toolCallId ?? '', recent[j].content ?? '');
        j++;
      }
      if (calls.length && calls.every((call) => results.has(call.id))) {
        result.push({role: 'assistant', content: message.content, tool_calls: calls});
        for (const call of calls) {
          result.push({role: 'tool', tool_call_id: call.id, content: results.get(call.id)!});
        }
      } else if (message.content) {
        result.push({role: 'assistant', content: message.content});
      }
      i = j - 1;
    }
    // Tool messages are handled with their assistant message; strays are dropped.
  }
  return result;
}

export type PageContext = {path: string; weekStart?: string};

const PAGE_DESCRIPTIONS: Record<string, string> = {
  '/dashboard': "the dashboard, showing today's food, exercise, weight and progress",
  '/logs': 'the logs page, with food, exercise and body measurement history',
  '/exercise-plan': 'the exercise plan page, with weekly planned exercises',
  '/profile': 'the profile page, with body stats, maintenance calories, daily calorie and macro goals, health notes and food preferences',
  '/reports': 'the weekly reports page',
};

/** A sentence about the page the user is on; only known pages are described. */
export function describePageContext(context: PageContext | undefined): string | null {
  if (!context) return null;
  const page = PAGE_DESCRIPTIONS[context.path];
  if (!page) return null;
  if (context.path === '/reports' && context.weekStart && isValidDate(context.weekStart)) {
    return `The user is viewing ${page}, on the report for the week starting ${context.weekStart}.`;
  }
  return `The user is viewing ${page}.`;
}

/** A thread title from the first message. */
export function threadTitle(message: string): string {
  const line = message.trim().replace(/\s+/g, ' ');
  return line.length > 60 ? `${line.slice(0, 57)}…` : line || 'New chat';
}
