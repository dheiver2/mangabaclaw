import { normalizeRouteBasePath } from "@mangabaclaw/uirouter";

export function buildAssistantMediaUrl(
  source: string,
  resourceBasePath = "",
  mediaTicket?: string | null,
): string {
  const params = new URLSearchParams({ source });
  const normalizedMediaTicket = mediaTicket?.trim();
  if (normalizedMediaTicket) {
    params.set("mediaTicket", normalizedMediaTicket);
  }
  return `${normalizeRouteBasePath(resourceBasePath)}/__mangabaclaw__/assistant-media?${params.toString()}`;
}
