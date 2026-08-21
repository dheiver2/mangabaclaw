import { describe, expect, it } from "vitest";
import {
  createMangabaClawTestState as createMangabaClawTestStateDirect,
  withMangabaClawTestState as withMangabaClawTestStateDirect,
} from "../test-utils/mangabaclaw-test-state.js";
import { createMangabaClawTestState, withMangabaClawTestState } from "./test-state.js";

describe("test-state SDK seam", () => {
  it("re-exports the canonical isolated state lifecycle", () => {
    expect(createMangabaClawTestState).toBe(createMangabaClawTestStateDirect);
    expect(withMangabaClawTestState).toBe(withMangabaClawTestStateDirect);
  });
});
