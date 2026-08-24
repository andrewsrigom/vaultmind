export function extractJsonObjectText(output: string): string | null {
  const trimmed = output.trim();
  const fencedMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(trimmed);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');

  if (start < 0 || end <= start) {
    return null;
  }

  return candidate.slice(start, end + 1);
}

export function parseJsonObjectFromModelOutput(output: string): unknown {
  const jsonObject = extractJsonObjectText(output);

  if (!jsonObject) {
    throw new Error('Model output did not contain a JSON object.');
  }

  return JSON.parse(jsonObject);
}
