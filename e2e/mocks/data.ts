// Canned responses and record shapes shared by the mock server and the tests.

export type RecordedRequest = {
  at: number;
  authorization: string | null;
  body: {
    model: string;
    temperature: number;
    response_format: unknown;
    messages: {role: string; content: string}[];
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

export const EXERCISE_ESTIMATE = {
  calories: 321,
  assumptions: 'Moderate intensity, MET 5, 80 kg.',
};

export const HEALTH_ALERTS = {
  avoid: {level: 'avoid', message: 'Very high in saturated fat.'},
  caution: {level: 'caution', message: 'Fairly high in sodium.'},
} as const;
