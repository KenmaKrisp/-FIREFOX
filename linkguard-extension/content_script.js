const MODE_KEY = "linkguardSensitivity";
const UI_KEY = "linkguardUiPreset";
const DEFAULT_MODE = "links";
const DEFAULT_UI = "full";

const tooltip = createTooltip();
let currentAnchor = null;
let lastDomain = null;
let hideTimeout = null;
let sensitivity = DEFAULT_MODE;
let uiPreset = DEFAULT_UI;

document.addEventListener("mouseover", handleMouseOver);
document.addEventListener("mouseout", handleMouseOut);
initializeSettings();

function handleMouseOver(event) {
  const anchor = event.target.closest("a[href]");
  if (!anchor || anchor === currentAnchor) return;
  if (!shouldInspect(anchor)) return;

  currentAnchor = anchor;
  lastDomain = extractDomain(anchor.href);
  hideTooltip();

  browser.runtime.sendMessage({
    type: "LINKGUARD_ANALYZE",
    domain: lastDomain
  })
  .then(response => {
    if (!response || !currentAnchor) return;
    showTooltip(anchor, response);
  })
  .catch(() => {});
}

function handleMouseOut(event) {
  if (event.target.closest("a[href]") === currentAnchor) {
    currentAnchor = null;
    lastDomain = null;
    hideTooltip();
  }
}

function extractDomain(href) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function showTooltip(anchor, result) {
  if (!result || result.domain !== lastDomain) return;

  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  tooltip.dataset.ui = uiPreset;
  tooltip.innerHTML = renderTooltipContent(result, uiPreset);
  tooltip.className = `linkguard-tooltip linkguard-${result.status || "unknown"}`;
  positionTooltip(anchor);
  tooltip.style.opacity = "1";
}

function hideTooltip() {
  tooltip.style.opacity = "0";
  if (hideTimeout) clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => {
    tooltip.style.top = "-9999px";
    tooltip.style.left = "-9999px";
  }, 150);
}

function positionTooltip(anchor) {
  const rect = anchor.getBoundingClientRect();
  tooltip.style.top = `${window.scrollY + rect.top - tooltip.offsetHeight - 8}px`;
  tooltip.style.left = `${window.scrollX + rect.left}px`;
}

function createTooltip() {
  const el = document.createElement("div");
  el.className = "linkguard-tooltip";
  el.style.opacity = "0";
  document.body.appendChild(el);
  return el;
}

function initializeSettings() {
  browser.storage.local
    .get([MODE_KEY, UI_KEY])
    .then((stored) => {
      sensitivity = stored[MODE_KEY] || DEFAULT_MODE;
      uiPreset = stored[UI_KEY] || DEFAULT_UI;
    })
    .catch(() => {
      sensitivity = DEFAULT_MODE;
      uiPreset = DEFAULT_UI;
    });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[MODE_KEY]) {
      sensitivity = changes[MODE_KEY].newValue || DEFAULT_MODE;
    }
    if (changes[UI_KEY]) {
      uiPreset = changes[UI_KEY].newValue || DEFAULT_UI;
    }
  });
}

function statusLabel(status) {
  switch (status) {
    case "safe":
      return "Безопасно";
    case "warning":
      return "Внимание";
    case "danger":
      return "Опасно";
    default:
      return "Неизвестно";
  }
}

function renderTooltipContent(result, preset = DEFAULT_UI) {
  const checks = Array.isArray(result.checks) ? result.checks : [];
  const typo = result.typo || { score: 0, severity: "safe", matched: "" };
  const showDetails = preset !== "minimal";
  const showMeter = preset === "full";
  const showFooter = preset === "full";

  return `
    <div class="linkguard-header">
      <div class="linkguard-status-line">
        <div class="linkguard-status-dot"></div>
        <div>
          <div class="linkguard-status-label">${escapeHtml(statusLabel(result.status))}</div>
          <div class="linkguard-domain">${escapeHtml(result.domain || "—")}</div>
        </div>
      </div>
      <p class="linkguard-reason">${escapeHtml(result.reason || "Проверяем ссылку...")}</p>
    </div>
    ${showDetails && checks.length ? `
      <div class="linkguard-section">
        <div class="linkguard-section-title">Детали анализа</div>
        <ul class="linkguard-checks">
          ${checks.map(renderCheck).join("")}
        </ul>
      </div>
    ` : ""}
    ${showMeter ? `
      <div class="linkguard-section">
        <div class="linkguard-section-title">Риск тайпсквотинга</div>
        <div class="linkguard-meter">
          <div class="linkguard-meter-fill linkguard-meter-${typo.severity}" style="width: ${Math.min(100, Math.max(typo.score || 0, 0))}%"></div>
        </div>
        <div class="linkguard-meter-caption">${escapeHtml(typoCaption(typo))}</div>
      </div>
    ` : preset === "balanced" ? `
      <div class="linkguard-note">${escapeHtml(typoCaption(typo))}</div>
    ` : ""}
    ${showFooter ? `
      <div class="linkguard-footer">
        <span class="linkguard-help">Пожаловаться на эту ссылку</span>
      </div>
    ` : ""}
  `;
}

function renderCheck(check) {
  const severity = check.severity || "muted";
  return `
    <li class="linkguard-check">
      <span class="linkguard-check-label">${escapeHtml(check.label || "")}</span>
      <span class="linkguard-pill linkguard-pill-${severity}">
        ${escapeHtml(check.value || "")}
      </span>
    </li>
  `;
}

function typoCaption(typo) {
  if (typo.severity === "danger") {
    return typo.matched ? `Высокий риск: похоже на ${typo.matched}` : "Высокий риск тайпсквотинга";
  }

  if (typo.severity === "warning") {
    return typo.matched ? `Возможна подмена: ${typo.matched}` : "Обнаружено сходство с доверенными доменами";
  }

  return "Риск не обнаружен";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function shouldInspect(anchor) {
  const href = anchor.getAttribute("href") || "";
  if (!href) return false;

  let url;
  try {
    url = new URL(anchor.href);
  } catch {
    return false;
  }

  const isHttp = url.protocol === "http:" || url.protocol === "https:";
  const isExternal = url.hostname !== window.location.hostname;

  return sensitivity === "links" ? isHttp && isExternal : isHttp;
}