/**
 * Help examples shown by the Browser CLI root command.
 */
/** Core Browser CLI examples for lifecycle and inspection commands. */
export const browserCoreExamples = [
  "mangabaclaw browser status",
  "mangabaclaw browser start",
  "mangabaclaw browser start --headless",
  "mangabaclaw browser stop",
  "mangabaclaw browser tabs",
  "mangabaclaw browser open https://example.com",
  "mangabaclaw browser focus abcd1234",
  "mangabaclaw browser close abcd1234",
  "mangabaclaw browser screenshot",
  "mangabaclaw browser screenshot --full-page",
  "mangabaclaw browser screenshot --ref 12",
  "mangabaclaw browser snapshot",
  "mangabaclaw browser snapshot --format aria --limit 200",
  "mangabaclaw browser snapshot --efficient",
  "mangabaclaw browser snapshot --labels",
];

/** Browser CLI examples for interaction/action commands. */
export const browserActionExamples = [
  "mangabaclaw browser navigate https://example.com",
  "mangabaclaw browser resize 1280 720",
  "mangabaclaw browser click 12 --double",
  "mangabaclaw browser click-coords 120 340",
  'mangabaclaw browser type 23 "hello" --submit',
  "mangabaclaw browser press Enter",
  "mangabaclaw browser hover 44",
  "mangabaclaw browser drag 10 11",
  "mangabaclaw browser select 9 OptionA OptionB",
  "mangabaclaw browser upload /tmp/mangabaclaw/uploads/file.pdf",
  "mangabaclaw browser upload media://inbound/file.pdf",
  'mangabaclaw browser fill --fields \'[{"ref":"1","value":"Ada"}]\'',
  "mangabaclaw browser dialog --accept",
  'mangabaclaw browser wait --text "Done"',
  "mangabaclaw browser evaluate --fn '(el) => el.textContent' --ref 7",
  "mangabaclaw browser evaluate --fn 'const title = document.title; return title;'",
  "mangabaclaw browser console --level error",
  "mangabaclaw browser pdf",
  "mangabaclaw browser batch --actions-file plan.json",
  'mangabaclaw browser batch --actions \'[{"kind":"wait","timeMs":500},{"kind":"click","ref":"12"},{"kind":"type","ref":"23","text":"hello"}]\'',
  "mangabaclaw browser batch --actions-file plan.json --continue",
];
