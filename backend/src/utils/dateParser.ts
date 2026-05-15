import * as chrono from "chrono-node";

/**
 * Parse a natural language date string into a Date object.
 * Supports inputs like "friday", "next week", "jan 30", "tomorrow",
 * and the due:prefix format from slash commands (e.g. "due:friday").
 *
 * @param input - The date string to parse
 * @param referenceDate - Optional reference date for relative parsing (defaults to now)
 * @returns Parsed Date or null if unparseable
 */
export function parseDueDate(
  input: string,
  referenceDate?: Date
): Date | null {
  // Strip the "due:" prefix if present
  const cleaned = input.replace(/^due:/i, "").replace(/-/g, " ").trim();

  if (!cleaned) return null;

  const results = chrono.parse(cleaned, referenceDate ?? new Date(), {
    forwardDate: true, // Prefer future dates
  });

  if (results.length === 0) return null;

  const parsed = results[0];
  if (!parsed) return null;

  return parsed.start.date();
}

/**
 * Extract a due date from a command string.
 * Looks for a "due:..." token anywhere in the input.
 *
 * @param commandText - The full command text
 * @returns The parsed Date or null
 */
export function extractDueDate(commandText: string): Date | null {
  const match = commandText.match(/due:(\S+)/i);
  if (!match?.[1]) return null;
  return parseDueDate(match[1]);
}

/**
 * Format a date for display in Slack messages.
 */
export function formatSlackDate(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  if (diffDays > 0 && diffDays <= 7) {
    return date.toLocaleDateString("en-US", { weekday: "long" });
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}
