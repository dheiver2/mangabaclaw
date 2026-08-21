// Powershell script supports MangabaClaw repository automation.
import { modelProviderConfigBatchJson, providerIdFromModelId } from "./provider-auth.ts";

export function psSingleQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function encodePowerShell(script: string): string {
  return Buffer.from(`$ProgressPreference = 'SilentlyContinue'\n${script}`, "utf16le").toString(
    "base64",
  );
}

export const windowsScopedEnvFunction = String.raw`function Invoke-WithScopedEnv {
  param(
    [Parameter(Mandatory = $true)][hashtable] $Values,
    [Parameter(Mandatory = $true)][scriptblock] $Script
  )
  $previous = @{}
  foreach ($key in $Values.Keys) {
    $previous[$key] = [Environment]::GetEnvironmentVariable([string]$key, 'Process')
    Set-Item -Path ('Env:' + $key) -Value ([string]$Values[$key])
  }
  try {
    & $Script
  } finally {
    foreach ($key in $Values.Keys) {
      if ($null -eq $previous[$key]) {
        Remove-Item -Path ('Env:' + $key) -ErrorAction SilentlyContinue
      } else {
        Set-Item -Path ('Env:' + $key) -Value $previous[$key]
      }
    }
  }
}`;

export function windowsAgentTurnConfigPatchScript(modelId: string): string {
  const batchJson = modelProviderConfigBatchJson(modelId, "windows");
  const pluginId = providerIdFromModelId(modelId) || modelId.split("/", 1)[0] || "openai";
  const payloadJson = JSON.stringify({
    modelId,
    operations: batchJson ? (JSON.parse(batchJson) as unknown) : [],
    pluginId,
  });
  return `$agentTurnConfigPatchPath = $env:MANGABACLAW_CONFIG_PATH
if (-not $agentTurnConfigPatchPath) { $agentTurnConfigPatchPath = Join-Path $env:USERPROFILE '.mangabaclaw\\mangabaclaw.json' }
$agentTurnVersionText = Invoke-MangabaClaw --version 2>$null | Out-String
$agentTurnRuntimePolicySupported = $false
if ($agentTurnVersionText -match 'MangabaClaw\\s+(\\d{4})\\.(\\d{1,2})\\.(\\d{1,2})') {
  $agentTurnYear = [int]$Matches[1]
  $agentTurnMonth = [int]$Matches[2]
  $agentTurnDay = [int]$Matches[3]
  $agentTurnRuntimePolicySupported = ($agentTurnYear -gt 2026) -or ($agentTurnYear -eq 2026 -and (($agentTurnMonth -gt 5) -or ($agentTurnMonth -eq 5 -and $agentTurnDay -ge 9)))
}
$env:MANGABACLAW_PARALLELS_AGENT_CONFIG_PATCH = @'
${payloadJson}
'@
$env:MANGABACLAW_PARALLELS_AGENT_CONFIG_PATH = $agentTurnConfigPatchPath
$env:MANGABACLAW_PARALLELS_AGENT_RUNTIME_POLICY_SUPPORTED = if ($agentTurnRuntimePolicySupported) { '1' } else { '0' }
$agentTurnConfigPatchScriptPath = Join-Path ([System.IO.Path]::GetTempPath()) 'mangabaclaw-agent-turn-config-patch.cjs'
@'
const fs = require("node:fs");
const path = require("node:path");
const configPath = process.env.MANGABACLAW_PARALLELS_AGENT_CONFIG_PATH;
const payload = JSON.parse(process.env.MANGABACLAW_PARALLELS_AGENT_CONFIG_PATCH || "{}");
const canWriteAgentRuntime = process.env.MANGABACLAW_PARALLELS_AGENT_RUNTIME_POLICY_SUPPORTED === "1";
function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\\uFEFF/u, ""));
}
const cfg = fs.existsSync(configPath) ? readJsonFile(configPath) : {};
cfg.agents = cfg.agents && typeof cfg.agents === "object" ? cfg.agents : {};
cfg.agents.defaults = cfg.agents.defaults && typeof cfg.agents.defaults === "object" ? cfg.agents.defaults : {};
cfg.agents.defaults.skipBootstrap = true;
const existingModel = cfg.agents.defaults.model && typeof cfg.agents.defaults.model === "object" ? cfg.agents.defaults.model : {};
cfg.agents.defaults.model = { ...existingModel, primary: payload.modelId };
cfg.agents.defaults.models = cfg.agents.defaults.models && typeof cfg.agents.defaults.models === "object" ? cfg.agents.defaults.models : {};
cfg.tools = cfg.tools && typeof cfg.tools === "object" ? cfg.tools : {};
cfg.tools.profile = "minimal";
cfg.plugins = cfg.plugins && typeof cfg.plugins === "object" && !Array.isArray(cfg.plugins) ? cfg.plugins : {};
cfg.plugins.entries = { [payload.pluginId]: { enabled: true } };
cfg.plugins.allow = [payload.pluginId];
const stateDir = path.dirname(configPath);
fs.rmSync(path.join(stateDir, "npm", "node_modules", "@mangabaclaw", "codex"), { recursive: true, force: true });
for (const op of payload.operations || []) {
  const segments = String(op.path || "").match(/(?:[^.[\\]]+)|(?:\\["((?:\\\\.|[^"\\\\])*)"\\])/g) || [];
  let cursor = cfg;
  for (let i = 0; i < segments.length; i++) {
    const raw = segments[i];
    const key = raw.startsWith("[") ? JSON.parse(raw.slice(1, -1)) : raw;
    if (i === segments.length - 1) {
      const existing = cursor[key] && typeof cursor[key] === "object" && !Array.isArray(cursor[key]) ? cursor[key] : {};
      cursor[key] = op.value && typeof op.value === "object" && !Array.isArray(op.value) ? { ...existing, ...op.value } : op.value;
    } else {
      cursor[key] = cursor[key] && typeof cursor[key] === "object" && !Array.isArray(cursor[key]) ? cursor[key] : {};
      cursor = cursor[key];
    }
  }
}
const selectedModelEntry = cfg.agents.defaults.models[payload.modelId];
if (selectedModelEntry && typeof selectedModelEntry === "object" && !Array.isArray(selectedModelEntry)) {
  if (canWriteAgentRuntime) {
    selectedModelEntry.agentRuntime = { id: "mangabaclaw" };
  } else {
    delete selectedModelEntry.agentRuntime;
  }
}
const providerId = String(payload.modelId || "").split("/", 1)[0];
const providerModelId = String(payload.modelId || "").slice(providerId.length + 1);
const providerEntry = cfg.models && typeof cfg.models === "object" && cfg.models.providers && typeof cfg.models.providers === "object" ? cfg.models.providers[providerId] : undefined;
if (providerEntry && typeof providerEntry === "object" && !Array.isArray(providerEntry)) {
  delete providerEntry.agentRuntime;
  if (Array.isArray(providerEntry.models)) {
    for (const model of providerEntry.models) {
      if (model && typeof model === "object" && (model.id === providerModelId || model.id === payload.modelId || model.name === providerModelId || model.name === payload.modelId)) {
        delete model.agentRuntime;
      }
    }
  }
}
fs.mkdirSync(path.dirname(configPath), { recursive: true });
fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\\n", { mode: 0o600 });
'@ | Set-Content -Path $agentTurnConfigPatchScriptPath -Encoding UTF8
node.exe $agentTurnConfigPatchScriptPath
$agentTurnConfigPatchExit = $LASTEXITCODE
Remove-Item $agentTurnConfigPatchScriptPath -Force -ErrorAction SilentlyContinue
Remove-Item Env:MANGABACLAW_PARALLELS_AGENT_CONFIG_PATCH -Force -ErrorAction SilentlyContinue
Remove-Item Env:MANGABACLAW_PARALLELS_AGENT_CONFIG_PATH -Force -ErrorAction SilentlyContinue
Remove-Item Env:MANGABACLAW_PARALLELS_AGENT_RUNTIME_POLICY_SUPPORTED -Force -ErrorAction SilentlyContinue
if ($agentTurnConfigPatchExit -ne 0) { throw "agent turn config patch failed" }`;
}

export const windowsMangabaClawResolver = String.raw`$portableNode = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Programs\nodejs' } else { $null }
if ($portableNode -and (Test-Path (Join-Path $portableNode 'node.exe'))) {
  $env:PATH = "$portableNode;$env:PATH"
}
function Resolve-MangabaClawCommand {
  if ($script:MangabaClawResolvedCommand) { return $script:MangabaClawResolvedCommand }
  $shimCandidates = @()
  if ($env:APPDATA) {
    $shimCandidates += Join-Path $env:APPDATA 'npm\mangabaclaw.cmd'
    $shimCandidates += Join-Path $env:APPDATA 'npm\mangabaclaw.ps1'
  }
  foreach ($name in @('mangabaclaw.cmd', 'mangabaclaw.ps1', 'mangabaclaw')) {
    $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command -and $command.Source) { $shimCandidates += $command.Source }
  }
  $npmPrefix = $null
  try {
    $npmPrefix = (& npm.cmd prefix -g 2>$null | Select-Object -First 1)
  } catch {}
  if ($npmPrefix) {
    $shimCandidates += Join-Path $npmPrefix 'mangabaclaw.cmd'
    $shimCandidates += Join-Path $npmPrefix 'mangabaclaw.ps1'
  }
  foreach ($candidate in $shimCandidates) {
    if ($candidate -and (Test-Path $candidate)) {
      $script:MangabaClawResolvedCommand = @{ Kind = 'shim'; Path = $candidate }
      return $script:MangabaClawResolvedCommand
    }
  }
  $entryCandidates = @()
  if ($env:APPDATA) {
    $entryCandidates += Join-Path $env:APPDATA 'npm\node_modules\mangabaclaw\mangabaclaw.mjs'
  }
  if ($npmPrefix) {
    $entryCandidates += Join-Path $npmPrefix 'node_modules\mangabaclaw\mangabaclaw.mjs'
  }
  foreach ($candidate in $entryCandidates) {
    if ($candidate -and (Test-Path $candidate)) {
      $script:MangabaClawResolvedCommand = @{ Kind = 'node'; Path = $candidate }
      return $script:MangabaClawResolvedCommand
    }
  }
  throw 'mangabaclaw command not found in PATH, APPDATA npm, or npm global prefix'
}
function Invoke-MangabaClaw {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]] $MangabaClawArgs)
  $command = Resolve-MangabaClawCommand
  $previousErrorActionPreference = $ErrorActionPreference
  $previousNativeErrorActionPreference = $PSNativeCommandUseErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $PSNativeCommandUseErrorActionPreference = $false
  try {
    if ($command.Kind -eq 'node') {
      & node.exe $command.Path @MangabaClawArgs
    } else {
      & $command.Path @MangabaClawArgs
    }
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
    $PSNativeCommandUseErrorActionPreference = $previousNativeErrorActionPreference
  }
}`;
