// Matrix plugin module implements device health behavior.
export type MatrixManagedDeviceInfo = {
  deviceId: string;
  displayName: string | null;
  current: boolean;
};

type MatrixDeviceHealthSummary = {
  currentDeviceId: string | null;
  staleMangabaClawDevices: MatrixManagedDeviceInfo[];
  currentMangabaClawDevices: MatrixManagedDeviceInfo[];
};

const MANGABACLAW_DEVICE_NAME_PREFIX = "MangabaClaw ";

export function isMangabaClawManagedMatrixDevice(displayName: string | null | undefined): boolean {
  return displayName?.startsWith(MANGABACLAW_DEVICE_NAME_PREFIX) === true;
}

export function summarizeMatrixDeviceHealth(
  devices: MatrixManagedDeviceInfo[],
): MatrixDeviceHealthSummary {
  const currentDeviceId = devices.find((device) => device.current)?.deviceId ?? null;
  const mangabaClawDevices = devices.filter((device) =>
    isMangabaClawManagedMatrixDevice(device.displayName),
  );
  return {
    currentDeviceId,
    staleMangabaClawDevices: mangabaClawDevices.filter((device) => !device.current),
    currentMangabaClawDevices: mangabaClawDevices.filter((device) => device.current),
  };
}
