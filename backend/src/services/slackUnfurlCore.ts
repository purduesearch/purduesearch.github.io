import type { SlackEntityType } from "@prisma/client";

// Projects can be previewed, but are not persisted as Slack card references.
export interface EntityRef {
  type: SlackEntityType | "PROJECT";
  id: string;
  projectId?: string;
}

/** Parse only supported frontend deep links; loading and access checks belong to the caller. */
export function parseConstellationUrl(url: string, frontendOrigins: string[]): EntityRef | null {
  try {
    const parsed = new URL(url);
    if (!isWebUrl(parsed)) return null;
    const allowedOrigins = new Set(["https://purduesearch.org"]);
    for (const origin of frontendOrigins) {
      try {
        const configured = new URL(origin);
        if (isWebUrl(configured)) allowedOrigins.add(configured.origin);
      } catch {
        // One malformed configuration entry must not disable the other origins.
      }
    }
    if (!allowedOrigins.has(parsed.origin)) return null;

    const projectMatch = /^\/clubpm\/projects\/([^/]+)\/?$/.exec(parsed.pathname);
    if (projectMatch) {
      const projectId = decodeURIComponent(projectMatch[1]);
      if (!validId(projectId)) return null;
      for (const [param, type] of [
        ["task", "TASK"],
        ["vaultCr", "CHANGE_REQUEST"],
        ["vaultItem", "VAULT_ITEM"],
      ] as const) {
        const id = parsed.searchParams.get(param);
        if (id && validId(id)) return { type, id, projectId };
      }
      return { type: "PROJECT", id: projectId, projectId };
    }

    if (/^\/clubpm\/calendar\/?$/.test(parsed.pathname)) {
      const id = parsed.searchParams.get("event");
      if (id && validId(id)) return { type: "EVENT", id };
      // Polls open through local UI state; there is no supported poll URL parameter.
    }
    return null;
  } catch {
    return null;
  }
}

function isWebUrl(url: URL): boolean {
  return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
}

function validId(id: string): boolean {
  return id.trim() === id && !/[\s/\\\u0000-\u001f\u007f]/.test(id) && id.length > 0;
}
