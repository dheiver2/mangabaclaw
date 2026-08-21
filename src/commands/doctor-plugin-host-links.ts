import path from "node:path";
import { coerceErrorMessage as formatPackageReadFailure } from "@mangabaclaw/normalization-core/error-coercion";
import { note } from "../../packages/terminal-core/src/note.js";
import { formatCliCommand } from "../cli/command-format.js";
import {
  resolveDefaultPluginExtensionsDir,
  resolveDefaultPluginNpmDir,
} from "../plugins/install-paths.js";
import {
  loadInstalledPluginIndexInstallRecords,
  type InstalledPluginIndexRecordStoreOptions,
} from "../plugins/installed-plugin-index-records.js";
import { listManagedPluginNpmRootsSync } from "../plugins/npm-project-roots.js";
import {
  auditMangabaClawPeerDependenciesInManagedNpmRoot,
  type MangabaClawPeerLinkAuditIssue,
  reconcileRegisteredMangabaClawHostLinks,
  relinkMangabaClawPeerDependenciesInManagedNpmRoot,
} from "../plugins/plugin-peer-link.js";
import { shortenHomePath } from "../utils.js";
import type { DoctorPrompter } from "./doctor-prompter.js";

type PluginHostLinkDoctorParams = InstalledPluginIndexRecordStoreOptions & {
  prompter: Pick<DoctorPrompter, "shouldRepair">;
};

type PluginPackageReadFailure = {
  packageDir: string;
  reason: string;
};

type PluginHostLinkAudit = {
  peerLinkIssues: MangabaClawPeerLinkAuditIssue[];
  packageReadFailures: PluginPackageReadFailure[];
  registeredPeerLinkIssues: MangabaClawPeerLinkAuditIssue[];
  registeredPackageReadFailures: PluginPackageReadFailure[];
};

function resolveRegisteredPluginExtensionsRoot(
  params: InstalledPluginIndexRecordStoreOptions,
): string {
  return params.stateDir
    ? path.join(params.stateDir, "extensions")
    : resolveDefaultPluginExtensionsDir(params.env);
}

/** Resolves all managed npm roots from the doctor state override or environment. */
export function resolveDoctorPluginNpmRoots(
  params: InstalledPluginIndexRecordStoreOptions,
): string[] {
  const npmRoot = params.stateDir
    ? path.join(params.stateDir, "npm")
    : resolveDefaultPluginNpmDir(params.env);
  return listManagedPluginNpmRootsSync(npmRoot);
}

/** Audits managed and registered npm plugin host links without mutating either root. */
export async function listPluginMangabaClawHostLinkIssues(
  params: InstalledPluginIndexRecordStoreOptions,
): Promise<PluginHostLinkAudit> {
  const packageReadFailures: PluginPackageReadFailure[] = [];
  const registeredPackageReadFailures: PluginPackageReadFailure[] = [];
  const audits = await Promise.all(
    resolveDoctorPluginNpmRoots(params).map((npmRoot) =>
      auditMangabaClawPeerDependenciesInManagedNpmRoot({
        npmRoot,
        onPackageReadError: (error, packageDir) => {
          packageReadFailures.push({
            packageDir,
            reason: formatPackageReadFailure(error),
          });
        },
      }),
    ),
  );
  const registeredAudit = await reconcileRegisteredMangabaClawHostLinks({
    installRecords: await loadInstalledPluginIndexInstallRecords(params),
    extensionsDir: resolveRegisteredPluginExtensionsRoot(params),
    env: params.env,
    mode: "audit",
    onPackageReadError: (error, packageDir) => {
      registeredPackageReadFailures.push({
        packageDir,
        reason: formatPackageReadFailure(error),
      });
    },
  });
  return {
    peerLinkIssues: audits.flatMap((audit) => audit.issues),
    packageReadFailures,
    registeredPeerLinkIssues: registeredAudit.issues,
    registeredPackageReadFailures,
  };
}

/** Relinks npm-owned plugin packages to the current MangabaClaw host package. */
export async function maybeRepairPluginMangabaClawHostLinks(
  params: PluginHostLinkDoctorParams,
): Promise<boolean> {
  const npmRoots = resolveDoctorPluginNpmRoots(params);
  if (!params.prompter.shouldRepair) {
    const audit = await listPluginMangabaClawHostLinkIssues(params);
    if (audit.peerLinkIssues.length > 0) {
      note(
        [
          "Managed npm MangabaClaw host peer links need repair:",
          ...audit.peerLinkIssues.map((issue) => `- ${issue.packageName}: ${issue.reason}`),
          `Repair with ${formatCliCommand("mangabaclaw doctor --fix")} to relink managed npm plugin packages.`,
        ].join("\n"),
        "Plugin registry",
      );
    }
    if (audit.packageReadFailures.length > 0) {
      note(
        [
          "Managed npm plugin packages could not be inspected:",
          ...audit.packageReadFailures.map(
            (failure) => `- ${shortenHomePath(failure.packageDir)}: ${failure.reason}`,
          ),
        ].join("\n"),
        "Plugin registry",
      );
    }
    if (audit.registeredPackageReadFailures.length > 0) {
      note(
        [
          "Registered npm plugin packages could not be inspected:",
          ...audit.registeredPackageReadFailures.map(
            (failure) => `- ${shortenHomePath(failure.packageDir)}: ${failure.reason}`,
          ),
        ].join("\n"),
        "Plugin registry",
      );
    }
    if (audit.registeredPeerLinkIssues.length > 0) {
      note(
        [
          "Registered npm plugin MangabaClaw host links need repair:",
          ...audit.registeredPeerLinkIssues.map(
            (issue) => `- ${issue.packageName}: ${issue.reason}`,
          ),
          `Repair with ${formatCliCommand("mangabaclaw doctor --fix")} to relink registered npm plugin packages.`,
        ].join("\n"),
        "Plugin registry",
      );
    }
    return false;
  }

  const messages: { level: "info" | "warn"; message: string }[] = [];
  const logger = {
    info: (message: string) => messages.push({ level: "info" as const, message }),
    warn: (message: string) => messages.push({ level: "warn" as const, message }),
  };
  const results = await Promise.all(
    npmRoots.map((npmRoot) =>
      relinkMangabaClawPeerDependenciesInManagedNpmRoot({
        npmRoot,
        logger,
        onPackageReadError: (error, packageDir) => {
          logger.warn(
            `Could not inspect managed npm package ${shortenHomePath(packageDir)}: ${formatPackageReadFailure(error)}`,
          );
        },
      }),
    ),
  );
  const repaired = results.reduce((total, result) => total + result.repaired, 0);
  const registeredRepair = await reconcileRegisteredMangabaClawHostLinks({
    installRecords: await loadInstalledPluginIndexInstallRecords(params),
    extensionsDir: resolveRegisteredPluginExtensionsRoot(params),
    env: params.env,
    mode: "repair",
    logger,
    onPackageReadError: (error, packageDir) => {
      logger.warn(
        `Could not inspect registered npm package ${shortenHomePath(packageDir)}: ${formatPackageReadFailure(error)}`,
      );
    },
  });

  if (repaired > 0) {
    note(
      `Repaired MangabaClaw host peer link(s) for ${repaired} managed npm plugin package(s).`,
      "Plugin registry",
    );
  }
  if (registeredRepair.repaired > 0) {
    note(
      `Repaired MangabaClaw host peer link(s) for ${registeredRepair.repaired} registered npm plugin package(s).`,
      "Plugin registry",
    );
  }
  const warnings = messages
    .filter((message) => message.level === "warn")
    .map((message) => `- ${message.message}`);
  if (warnings.length > 0) {
    note(
      ["Could not repair all managed npm MangabaClaw host peer links:", ...warnings].join("\n"),
      "Plugin registry",
    );
  }

  return repaired > 0 || registeredRepair.repaired > 0;
}
