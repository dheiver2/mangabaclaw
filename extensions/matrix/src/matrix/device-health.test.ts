// Matrix tests cover device health plugin behavior.
import { describe, expect, it } from "vitest";
import { isMangabaClawManagedMatrixDevice, summarizeMatrixDeviceHealth } from "./device-health.js";

describe("matrix device health", () => {
  it("detects MangabaClaw-managed device names", () => {
    expect(isMangabaClawManagedMatrixDevice("MangabaClaw Gateway")).toBe(true);
    expect(isMangabaClawManagedMatrixDevice("MangabaClaw Debug")).toBe(true);
    expect(isMangabaClawManagedMatrixDevice("Element iPhone")).toBe(false);
    expect(isMangabaClawManagedMatrixDevice(null)).toBe(false);
  });

  it("summarizes stale MangabaClaw-managed devices separately from the current device", () => {
    const summary = summarizeMatrixDeviceHealth([
      {
        deviceId: "du314Zpw3A",
        displayName: "MangabaClaw Gateway",
        current: true,
      },
      {
        deviceId: "BritdXC6iL",
        displayName: "MangabaClaw Gateway",
        current: false,
      },
      {
        deviceId: "G6NJU9cTgs",
        displayName: "MangabaClaw Debug",
        current: false,
      },
      {
        deviceId: "phone123",
        displayName: "Element iPhone",
        current: false,
      },
    ]);

    expect(summary).toEqual({
      currentDeviceId: "du314Zpw3A",
      currentMangabaClawDevices: [
        {
          deviceId: "du314Zpw3A",
          displayName: "MangabaClaw Gateway",
          current: true,
        },
      ],
      staleMangabaClawDevices: [
        {
          deviceId: "BritdXC6iL",
          displayName: "MangabaClaw Gateway",
          current: false,
        },
        {
          deviceId: "G6NJU9cTgs",
          displayName: "MangabaClaw Debug",
          current: false,
        },
      ],
    });
  });
});
