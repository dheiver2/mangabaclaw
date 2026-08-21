type MangabaClawCodingToolsFactory =
  (typeof import("mangabaclaw/plugin-sdk/agent-harness"))["createMangabaClawCodingTools"];

/** Mutable dependency seam shared by dynamic-tool construction and its behavioral tests. */
export const dynamicToolBuildState: {
  mangabaClawCodingToolsFactory?: MangabaClawCodingToolsFactory;
} = {};
