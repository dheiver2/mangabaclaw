// Channel catalog contract tests cover bundled and registry-backed channel catalog invariants.
import fs from "node:fs";
import path from "node:path";
import { isPrereleaseSemverVersion } from "../../../infra/npm-registry-spec.js";
import {
  describeBundledMetadataOnlyChannelCatalogContract,
  describeChannelCatalogEntryContract,
  describeOfficialFallbackChannelCatalogContract,
} from "./test-helpers/channel-catalog-contract.js";

describeChannelCatalogEntryContract({
  channelId: "msteams",
  npmSpec: "@mangabaclaw/msteams",
  alias: "teams",
});

const whatsappMeta = {
  id: "whatsapp",
  label: "WhatsApp",
  selectionLabel: "WhatsApp (QR link)",
  detailLabel: "WhatsApp Web",
  docsPath: "/channels/whatsapp",
  blurb: "works with your own number; recommend a separate phone + eSIM.",
};

const whatsappPackageJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "extensions", "whatsapp", "package.json"), "utf8"),
) as {
  name?: string;
  version?: string;
  mangabaclaw?: { install?: { npmSpec?: string } };
};
const whatsappNpmSpec = whatsappPackageJson.mangabaclaw?.install?.npmSpec ?? whatsappPackageJson.name;
const whatsappVersion = whatsappPackageJson.version;
if (!whatsappNpmSpec || !whatsappVersion) {
  throw new Error("missing package metadata for whatsapp");
}
const whatsappOfficialFallbackNpmSpec = isPrereleaseSemverVersion(whatsappVersion)
  ? `${whatsappNpmSpec}@${whatsappVersion}`
  : whatsappNpmSpec;

describeBundledMetadataOnlyChannelCatalogContract({
  pluginId: "whatsapp",
  packageName: "@mangabaclaw/whatsapp",
  npmSpec: "@mangabaclaw/whatsapp",
  meta: whatsappMeta,
  defaultChoice: "npm",
});

describeOfficialFallbackChannelCatalogContract({
  channelId: "whatsapp",
  npmSpec: whatsappOfficialFallbackNpmSpec,
  meta: whatsappMeta,
  packageName: "@mangabaclaw/whatsapp",
  pluginId: "whatsapp",
  externalNpmSpec: "@vendor/whatsapp-fork",
  externalLabel: "WhatsApp Fork",
});

describeChannelCatalogEntryContract({
  channelId: "wecom",
  npmSpec: "@wecom/wecom-mangabaclaw-plugin@2026.5.7",
  alias: "wework",
});

describeChannelCatalogEntryContract({
  channelId: "yuanbao",
  npmSpec: "mangabaclaw-plugin-yuanbao@2.15.0",
  alias: "yb",
});

describeChannelCatalogEntryContract({
  channelId: "mangabaclaw-zaloclawbot",
  npmSpec: "@zalo-platforms/mangabaclaw-zaloclawbot@0.1.4",
  alias: "zaloclawbot",
});
