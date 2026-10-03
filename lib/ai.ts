import {z} from 'zod';

// Any OpenAI-compatible /chat/completions endpoint (OpenAI, OpenRouter, Groq,
// Gemini's compat layer, local Ollama/LM Studio). Read per call so a Docker
// container picks the config up at runtime without a rebuild.
function getConfig() {
  const baseUrl = process.env.AI_BASE_URL?.trim();
  const model = process.env.AI_MODEL?.trim();
  if (!baseUrl || !model) return null;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    model,
    apiKey: process.env.AI_API_KEY?.trim() || null,
  };
}

export function isAiEnabled() {
  return getConfig() !== null;
}

const SYSTEM_PROMPT = `You are a nutrition estimator for a calorie tracking app used mainly in Australia.
The user describes food they ate. Estimate the total nutrition for everything described.
- Use Australian context: Australian brands, supermarket products (Woolworths, Coles, Aldi), cafe and takeaway serving sizes, and metric units.
- If no amount is given, assume one typical single serving.
- Calories are kilocalories (kcal). If the user gives kilojoules (kJ), convert to kcal (1 kcal = 4.184 kJ).
- Saturated fat must not exceed total fat.
Respond with only a JSON object with these keys:
{"name": short food name (max 60 chars), "calories": number, "protein": grams, "carbs": grams, "fat": grams, "saturatedFat": grams, "assumptions": one short sentence describing assumed portions}`;

const nutrient = z.coerce.number().finite().min(0);

const estimateSchema = z.object({
  name: z.string().trim().min(1),
  calories: nutrient,
  protein: nutrient.default(0),
  carbs: nutrient.default(0),
  fat: nutrient.default(0),
  saturatedFat: nutrient.default(0),
  assumptions: z.string().trim().optional().default(''),
});

export type FoodEstimate = z.infer<typeof estimateSchema>;

const round1 = (value: number) => Math.round(value * 10) / 10;

export class AiError extends Error {}

export async function estimateFood(description: string): Promise<FoodEstimate> {
  const config = getConfig();
  if (!config) {
    throw new AiError('AI is not configured');
  }

  const headers: Record<string, string> = {'Content-Type': 'application/json'};
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        response_format: {type: 'json_object'},
        messages: [
          {role: 'system', content: SYSTEM_PROMPT},
          {role: 'user', content: description},
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new AiError(
      error instanceof Error && error.name === 'TimeoutError'
        ? 'AI request timed out'
        : 'Could not reach AI service',
    );
  }

  if (!response.ok) {
    throw new AiError(`AI service returned ${response.status}`);
  }

  const payload = await response.json().catch(() => null);
  const content: unknown = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new AiError('AI returned an empty response');
  }

  // Some models wrap JSON in a markdown fence despite response_format.
  const json = content.match(/\{[\s\S]*\}/)?.[0];
  let raw: unknown;
  try {
    raw = JSON.parse(json ?? '');
  } catch {
    throw new AiError('AI returned an invalid response');
  }

  const parsed = estimateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AiError('AI returned an invalid response');
  }

  const estimate = parsed.data;
  const fat = round1(estimate.fat);
  return {
    name: estimate.name.slice(0, 60),
    calories: Math.round(estimate.calories),
    protein: round1(estimate.protein),
    carbs: round1(estimate.carbs),
    fat,
    saturatedFat: Math.min(round1(estimate.saturatedFat), fat),
    assumptions: estimate.assumptions.slice(0, 300),
  };
}
