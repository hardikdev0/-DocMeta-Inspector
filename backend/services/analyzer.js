
const { extractPdfMetadata } = require("./pdfExtractor");
const { extractImageMetadata } = require("./imageExtractor");
const { runPdfRules, runImageRules } = require("./rules");
const { calculateRisk, recommendedAction } = require("./scoring");

async function analyzeDocument(file) {
  const { buffer, originalname, mimetype } = file;
  const ext = originalname.split(".").pop().toLowerCase();

  let metadata;
  let findings;

  const isPdf = mimetype === "application/pdf" || ext === "pdf";
  const isImage =
    ["image/jpeg", "image/png"].includes(mimetype) ||
    ["jpg", "jpeg", "png"].includes(ext);

  if (isPdf) {
    metadata = await extractPdfMetadata(buffer, originalname);
    findings = runPdfRules(metadata);
  } else if (isImage) {
    metadata = extractImageMetadata(buffer, originalname, mimetype);
    findings = runImageRules(metadata);
  } else {
    throw new Error(
      `Unsupported file type: ${mimetype}. Please upload a PDF, JPG, or PNG.`
    );
  }

  const { score, risk_level, summary } = calculateRisk(findings);
  const action = recommendedAction(risk_level, findings);

  const extracted_metadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== null && value !== undefined && key !== "raw_exif") {
      extracted_metadata[key] = value;
    }
  }

  return {
    document_name: originalname,
    file_type: metadata.file_type,
    file_size_bytes: metadata.file_size,
    metadata_risk_score: score,
    metadata_risk_level: risk_level,
    summary,
    extracted_metadata,
    findings,
    recommended_action: action,
  };
}

module.exports = { analyzeDocument };
