const SAFE_DOMAINS = new Set([
  "google.com",
  "facebook.com",
  "youtube.com",
  "twitter.com",
  "instagram.com",
  "linkedin.com",
  "microsoft.com",
  "apple.com",
  "amazon.com",
  "netflix.com",
  "github.com"
]);

const TYPO_DISTANCE_THRESHOLD = 2;
const TYPO_MAX_DISTANCE = 6;

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== "LINKGUARD_ANALYZE") {
    return Promise.resolve();
  }

  const domain = normalizeDomain(message.domain);
  const result = analyzeDomain(domain);

  return Promise.resolve(result);
});

function analyzeDomain(domain) {
  if (!domain) {
    return buildResponse({
      status: "unknown",
      reason: "Не удалось определить домен.",
      domain: ""
    });
  }

  const inWhitelist = SAFE_DOMAINS.has(domain);
  const similarity = findSimilarity(domain);

  if (inWhitelist) {
    return buildResponse({
      status: "safe",
      reason: "Домен найден в белом списке.",
      domain,
      whitelist: inWhitelist,
      similarity
    });
  }

  if (similarity.isSuspicious) {
    return buildResponse({
      status: "danger",
      reason: similarity.reason,
      domain,
      whitelist: inWhitelist,
      similarity
    });
  }

  return buildResponse({
    status: "warning",
    reason: "Домен не найден в белом списке. Проявите осторожность.",
    domain,
    whitelist: inWhitelist,
    similarity
  });
}

function normalizeDomain(domain) {
  return domain ? domain.toLowerCase().replace(/^www\./, "") : "";
}

function findSimilarity(domain) {
  let bestDistance = Infinity;
  let closestDomain = null;
  let isHomoglyph = false;

  for (const safe of SAFE_DOMAINS) {
    const distance = levenshtein(domain, safe);
    if (distance < bestDistance) {
      bestDistance = distance;
      closestDomain = safe;
    }
    if (distance <= TYPO_DISTANCE_THRESHOLD) {
      return {
        isSuspicious: true,
        distance,
        matchedDomain: safe,
        reason: `Подозрительно похоже на ${safe} (расстояние ${distance}).`
      };
    }
    if (!isHomoglyph && stripHomoglyphs(domain) === stripHomoglyphs(safe)) {
      isHomoglyph = true;
      return {
        isSuspicious: true,
        distance,
        matchedDomain: safe,
        reason: `Возможен омоглиф: выглядит как ${safe}.`
      };
    }
  }

  if (bestDistance === Infinity) {
    return { isSuspicious: false };
  }

  return {
    isSuspicious: false,
    distance: bestDistance <= TYPO_MAX_DISTANCE ? bestDistance : null,
    matchedDomain: closestDomain
  };
}

function stripHomoglyphs(value) {
  return value
    .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^\x00-\x7F]/g, "");
}

function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function buildResponse({ status, reason, domain, whitelist = false, similarity = {} }) {
  const suspicious = !whitelist && Boolean(similarity.isSuspicious);
  const distance = !whitelist ? similarity.distance : null;
  const typoScore = suspicious
    ? 100
    : distance != null
      ? computeTypoScore(distance)
      : 0;
  const typoSeverity = suspicious
    ? "danger"
    : typoScore >= 50
      ? "warning"
      : "safe";

  return {
    status,
    reason,
    domain,
    checks: [
      {
        label: "Проверка по белому списку",
        value: whitelist ? "Доверенный" : "Не найден",
        severity: whitelist ? "success" : "warning"
      },
      {
        label: "Анализ угроз",
        value: status === "danger" ? "Есть риск" : "Угроз не найдено",
        severity: status === "danger" ? "danger" : "success"
      },
      {
        label: "Риск тайпсквотинга",
        value: whitelist
          ? "Рисков нет"
          : distance != null
            ? `Расст. ${distance}`
            : "Нет совпадений",
        severity: suspicious
          ? "danger"
          : distance != null && distance <= TYPO_DISTANCE_THRESHOLD
            ? "warning"
            : "muted"
      }
    ],
    typo: {
      score: typoScore,
      severity: typoSeverity,
      matched: !whitelist && similarity.matchedDomain ? similarity.matchedDomain : ""
    }
  };
}

function computeTypoScore(distance) {
  if (distance == null) {
    return 0;
  }

  const clamped = Math.min(distance, TYPO_MAX_DISTANCE);
  const normalized = 1 - clamped / TYPO_MAX_DISTANCE;
  return Math.max(0, Math.round(normalized * 100));
}