import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMangabaClawTestState,
  type MangabaClawTestState,
} from "../../test-utils/mangabaclaw-test-state.js";
import { createTrackedTempDirs } from "../../test-utils/tracked-temp-dirs.js";
import { autoApplySkillProposal } from "./auto-apply.js";
import { inspectSkillProposal, proposeCreateSkill } from "./service.js";

const tempDirs = createTrackedTempDirs();
let testState: MangabaClawTestState;

beforeEach(async () => {
  testState = await createMangabaClawTestState({
    layout: "state-only",
    prefix: "mangabaclaw-skill-auto-apply-state-",
  });
});

afterEach(async () => {
  await testState.cleanup();
  await tempDirs.cleanup();
});

describe("autoApplySkillProposal", () => {
  it("leaves a proposal pending after one failed apply attempt", async () => {
    const workspaceDir = await tempDirs.make("mangabaclaw-skill-auto-apply-workspace-");
    const proposal = await proposeCreateSkill({
      workspaceDir,
      name: "safe-recovery",
      description: "Recover a failed workflow safely.",
      content: "# Safe Recovery\n\nVerify state before retrying.\n",
    });
    const apply = vi.fn().mockRejectedValue(new Error("write unavailable"));

    await expect(
      autoApplySkillProposal(
        {
          workspaceDir,
          proposalId: proposal.record.id,
          skillName: proposal.record.target.skillName,
        },
        { apply },
      ),
    ).resolves.toBeUndefined();

    expect(apply).toHaveBeenCalledTimes(1);
    await expect(inspectSkillProposal(proposal.record.id, { workspaceDir })).resolves.toMatchObject(
      {
        record: { status: "pending" },
      },
    );
  });
});
