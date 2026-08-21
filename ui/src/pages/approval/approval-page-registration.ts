import { ApprovalPage } from "./approval-page.ts";

if (!customElements.get("mangabaclaw-approval-page")) {
  customElements.define("mangabaclaw-approval-page", ApprovalPage);
}
