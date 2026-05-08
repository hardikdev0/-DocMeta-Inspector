/**
 * scoring.js
 * Calculates a risk score (0–100) from a list of findings.
 *
 * Design principles:
 * - Severity and confidence both contribute to score.
 * - Multiple findings add up, but with diminishing returns to avoid inflation.
 * - Correlated findings (e.g., multiple date issues) get a small boost.
 * - Weak signals alone (Low severity, low confidence) cannot produce High risk.
 */

const SEVERITY_WEIGHTS = {
  Low: 8,
  Medium: 22,
  High: 40,
};

/**
 * Calculate base score from a single finding.
 * score = severityWeight × confidence
 */
function findingScore(finding) {
  const base = SEVERITY_WEIGHTS[finding.severity] || 0;
  return base * finding.confidence;
}

/**
 * Detect correlated finding groups and add a small boost.
 * E.g., date anomalies + tool mismatch + incremental updates = correlated set.
 */
function correlationBonus(findings) {
  const dateFindings = findings.filter(
    (f) =>
      f.title.toLowerCase().includes("date") ||
      f.title.toLowerCase().includes("creation") ||
      f.title.toLowerCase().includes("modification")
  );
  const toolFindings = findings.filter(
    (f) =>
      f.title.toLowerCase().includes("creator") ||
      f.title.toLowerCase().includes("producer") ||
      f.title.toLowerCase().includes("editor") ||
      f.title.toLowerCase().includes("software")
  );
  const structuralFindings = findings.filter(
    (f) =>
      f.title.toLowerCase().includes("incremental") ||
      f.title.toLowerCase().includes("structural") ||
      f.title.toLowerCase().includes("future")
  );

  let bonus = 0;
  if (dateFindings.length >= 2) bonus += 5;
  if (toolFindings.length >= 2) bonus += 3;
  if (structuralFindings.length >= 1 && dateFindings.length >= 1) bonus += 5;

  return bonus;
}

/**
 * Main scoring function.
 * Returns: { score, risk_level, summary }
 */
function calculateRisk(findings) {
  if (!findings || findings.length === 0) {
    return {
      score: 0,
      risk_level: "Low",
      summary:
        "No metadata anomalies were detected. The document metadata appears consistent.",
    };
  }

  // Sort by score descending so highest-impact findings contribute most
  const sorted = [...findings].sort(
    (a, b) => findingScore(b) - findingScore(a)
  );

  // Diminishing returns: each subsequent finding contributes at 70% of previous
  let rawScore = 0;
  let multiplier = 1.0;
  for (const finding of sorted) {
    rawScore += findingScore(finding) * multiplier;
    multiplier *= 0.7;
  }

  rawScore += correlationBonus(findings);

  // Clamp to 0–100
  const score = Math.min(100, Math.round(rawScore));

  let risk_level;
  let summary;

  if (score <= 30) {
    risk_level = "Low";
    summary =
      "The document metadata does not show significant anomalies. Minor signals detected are consistent with normal document workflows.";
  } else if (score <= 65) {
    risk_level = "Medium";
    summary =
      "The document contains metadata patterns that may indicate post-creation modification. These signals should be reviewed, but they do not confirm tampering on their own.";
  } else {
    risk_level = "High";
    summary =
      "The document contains multiple or strong metadata indicators that warrant careful review. These findings suggest a meaningful possibility of metadata manipulation or post-creation editing. Additional evidence should be gathered before drawing conclusions.";
  }

  return { score, risk_level, summary };
}

function recommendedAction(risk_level, findings) {
  const hasHighSeverity = findings.some((f) => f.severity === "High");
  const hasFutureDates = findings.some((f) =>
    f.title.toLowerCase().includes("future")
  );
  const hasIncrementalUpdates = findings.some((f) =>
    f.title.toLowerCase().includes("incremental")
  );

  if (risk_level === "High" || hasFutureDates) {
    return "Do not rely on this document for sensitive decisions without obtaining the original from a verified source. The metadata contains indicators that are difficult to explain through normal workflows.";
  }
  if (risk_level === "Medium") {
    if (hasIncrementalUpdates) {
      return "Request the original document from the issuing party. Incremental PDF updates combined with other signals suggest the document may have been edited post-creation.";
    }
    return "Review this document manually if it is part of a high-value or sensitive process. Cross-reference with the issuing party if authenticity is critical.";
  }
  return "No immediate action required. Standard verification procedures apply for sensitive documents.";
}

module.exports = { calculateRisk, recommendedAction };
