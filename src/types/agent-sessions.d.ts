// Declares extension points for agent session type augmentation.
export type MangabaClawAgentSessionSkillSourceAugmentation = never;

declare module "mangabaclaw/plugin-sdk/agent-sessions" {
  interface Skill {
    // MangabaClaw relies on the source identifier returned by skill loaders.
    source: string;
  }
}
