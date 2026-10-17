import "@foss-earth/ui/theme.css";
import "@foss-earth/ui/theme-page.js";
import "./selector.css";
import { isBrowserRecoveryPage, markBrowserAppReady } from "@foss-earth/ui/browser";

if (!isBrowserRecoveryPage(document)) markBrowserAppReady(document);
// Safari on iOS shows :active, a card's pressed look, only on a page that listens for touches.
document.addEventListener("touchstart", () => {}, { passive: true });
