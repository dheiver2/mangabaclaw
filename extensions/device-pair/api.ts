// Device Pair API module exposes the plugin public contract.
export {
  approveDevicePairing,
  clearDeviceBootstrapTokens,
  issueDeviceBootstrapToken,
  PAIRING_SETUP_BOOTSTRAP_PROFILE,
  listDevicePairing,
  revokeDeviceBootstrapToken,
  type DeviceBootstrapProfile,
} from "mangabaclaw/plugin-sdk/device-bootstrap";
export { definePluginEntry, type MangabaClawPluginApi } from "mangabaclaw/plugin-sdk/plugin-entry";
export {
  resolveGatewayBindUrl,
  resolveGatewayPort,
  resolveTailnetHostWithRunner,
  resolveTailscaleServeGatewayUrlsWithRunner,
} from "mangabaclaw/plugin-sdk/core";
export { resolveAdvertisedLanHost } from "mangabaclaw/plugin-sdk/gateway-runtime";
export {
  resolvePreferredMangabaClawTmpDir,
  runPluginCommandWithTimeout,
} from "mangabaclaw/plugin-sdk/sandbox";
export { renderQrPngBase64, renderQrPngDataUrl, writeQrPngTempFile } from "./qr-image.js";
