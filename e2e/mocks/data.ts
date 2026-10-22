// Canned responses and record shapes shared by the mock server and the tests.

export type RecordedRequest = {
  at: number;
  authorization: string | null;
  body: {
    model: string;
    temperature: number;
    response_format: unknown;
    // Chat messages can have null content (tool calls); estimates never do.
    messages: {role: string; content: string}[];
    /** Set by the coach chat, which streams and offers tools. */
    stream?: boolean;
    tools?: {function: {name: string}}[];
  };
};

export type RecordedEmail = {
  at: number;
  from: string;
  to: string[];
  subject: string;
  html: string;
};

export const FOOD_ESTIMATE = {
  name: 'Mock food',
  calories: 420,
  protein: 25,
  carbs: 40,
  fat: 15,
  saturatedFat: 5,
  assumptions: 'Assumed one regular serving.',
};

export const HEALTH_ALERTS = {
  avoid: {level: 'avoid', message: 'Very high in saturated fat.'},
  caution: {level: 'caution', message: 'Fairly high in sodium.'},
} as const;
