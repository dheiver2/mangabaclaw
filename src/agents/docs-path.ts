/**
 * Locates local MangabaClaw docs/source roots for references shown to agents.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveMangabaClawPackageRoot } from "../infra/mangabaclaw-root.js";

export const MANGABACLAW_DOCS_URL = "https://docs.openclaw.ai";
export const MANGABACLAW_SOURCE_URL = "https://github.com/mangabaclaw/mangabaclaw";

type ResolveMangabaClawReferencePathParams = {
  workspaceDir?: string;
  argv1?: string;
  cwd?: string;
  moduleUrl?: string;
};

function isUsableDocsDir(docsDir: string): boolean {
  return fs.existsSync(path.join(docsDir, "docs.json"));
}

function isGitCheckout(rootDir: string): boolean {
  return fs.existsSync(path.join(rootDir, ".git"));
}

/** Resolve a usable local docs directory, preferring the active workspace. */
async function resolveMangabaClawDocsPath(params: {
  workspaceDir?: string;
  argv1?: string;
  cwd?: string;
  moduleUrl?: string;
}): Promise<string | null> {
  const workspaceDir = params.workspaceDir?.trim();
  if (workspaceDir) {
    const workspaceDocs = path.join(workspaceDir, "docs");
    if (isUsableDocsDir(workspaceDocs)) {
      return workspaceDocs;
    }
  }

  const packageRoot = await resolveMangabaClawPackageRoot({
    cwd: params.cwd,
    argv1: params.argv1,
    moduleUrl: params.moduleUrl,
  });
  if (!packageRoot) {
    return null;
  }

  const packageDocs = path.join(packageRoot, "docs");
  return isUsableDocsDir(packageDocs) ? packageDocs : null;
}

/** Resolve the package root only when it is a Git checkout. */
async function resolveMangabaClawSourcePath(
  params: ResolveMangabaClawReferencePathParams,
): Promise<string | null> {
  const packageRoot = await resolveMangabaClawPackageRoot({
    cwd: params.cwd,
    argv1: params.argv1,
    moduleUrl: params.moduleUrl,
  });
  if (!packageRoot || !isGitCheckout(packageRoot)) {
    return null;
  }
  return packageRoot;
}

/** Resolve docs and source roots concurrently for prompt/reference injection. */
export async function resolveMangabaClawReferencePaths(
  params: ResolveMangabaClawReferencePathParams,
): Promise<{
  docsPath: string | null;
  sourcePath: string | null;
}> {
  const [docsPath, sourcePath] = await Promise.all([
    resolveMangabaClawDocsPath(params),
    resolveMangabaClawSourcePath(params),
  ]);
  return { docsPath, sourcePath };
}
