// Explainable opportunity matching. A match is a suggestion, never proof of a skill.
export function matchOpportunity(text: string, skills: { id: string; name: string; aliases: string[] }[]) {
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9+#]+/g, " ")} `;
  return skills.filter(s => [s.name, ...s.aliases].some(name => {
    const needle = name.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim();
    return needle.length >= 3 && hay.includes(` ${needle} `);
  })).map(s => ({ skillId: s.id, name: s.name, reason: `The task explicitly mentions ${s.name} or an alias of it.` }));
}

export function validateGoals(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 3 || value.some(id => typeof id !== "string" || id.length < 1 || id.length > 100)) throw new Error("Choose up to three valid focus skills");
  return [...new Set(value as string[])];
}
