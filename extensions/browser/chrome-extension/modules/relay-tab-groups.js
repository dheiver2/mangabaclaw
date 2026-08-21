import { MANGABACLAW_TAB_GROUP_TITLE } from "./relay-core.js";

export async function findMangabaClawGroups() {
  try {
    return await chrome.tabGroups.query({ title: MANGABACLAW_TAB_GROUP_TITLE });
  } catch {
    return [];
  }
}

async function isMangabaClawGroupId(groupId) {
  if (!Number.isInteger(groupId) || groupId < 0) {
    return false;
  }
  try {
    const group = await chrome.tabGroups.get(groupId);
    return group.title === MANGABACLAW_TAB_GROUP_TITLE;
  } catch {
    return false;
  }
}

export async function isTabSelected(tab) {
  return await isMangabaClawGroupId(tab?.groupId);
}
