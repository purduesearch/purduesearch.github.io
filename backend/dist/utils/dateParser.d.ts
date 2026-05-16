/**
 * Parse a natural language date string into a Date object.
 * Supports inputs like "friday", "next week", "jan 30", "tomorrow",
 * and the due:prefix format from slash commands (e.g. "due:friday").
 *
 * @param input - The date string to parse
 * @param referenceDate - Optional reference date for relative parsing (defaults to now)
 * @returns Parsed Date or null if unparseable
 */
export declare function parseDueDate(input: string, referenceDate?: Date): Date | null;
/**
 * Extract a due date from a command string.
 * Looks for a "due:..." token anywhere in the input.
 *
 * @param commandText - The full command text
 * @returns The parsed Date or null
 */
export declare function extractDueDate(commandText: string): Date | null;
/**
 * Format a date for display in Slack messages.
 */
export declare function formatSlackDate(date: Date): string;
//# sourceMappingURL=dateParser.d.ts.map