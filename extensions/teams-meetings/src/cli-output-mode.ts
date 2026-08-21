import { MeetingPlatformAdapter } from "mangabaclaw/plugin-sdk/meeting-runtime";

export const TEAMS_MEETINGS_CLI_METADATA = MeetingPlatformAdapter.createCliMetadata({
  commandName: "teamsmeetings",
  description: "Join and manage Microsoft Teams meeting guests",
  id: "teams-meetings",
  name: "Microsoft Teams meetings",
});
