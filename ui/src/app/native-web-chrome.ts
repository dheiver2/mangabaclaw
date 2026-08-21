export const NATIVE_HISTORY_STATE_EVENT = "mangabaclaw:native-history-state";

export type NativeHistoryState = {
  canGoBack: boolean;
  canGoForward: boolean;
};

type NativeWebChromeWindow = Window & {
  __MANGABACLAW_NATIVE_WEB_CHROME__?: boolean;
  __MANGABACLAW_NATIVE_HISTORY__?: NativeHistoryState;
};

export function isNativeWebChromeHost(): boolean {
  return (window as NativeWebChromeWindow)["__MANGABACLAW_NATIVE_WEB_CHROME__"] === true;
}

export function readNativeHistoryState(): NativeHistoryState {
  const state = (window as NativeWebChromeWindow)["__MANGABACLAW_NATIVE_HISTORY__"];
  return state && typeof state.canGoBack === "boolean" && typeof state.canGoForward === "boolean"
    ? state
    : { canGoBack: false, canGoForward: false };
}
