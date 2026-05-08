/**
 * extractors/pdf.js
 * Extracts metadata from PDF buffers using pdf-parse.
 */

const pdfParse = require("pdf-parse");

/**
 * Parse a PDF Info date string like "D:20260401101500+05'30'"
 * and return an ISO string or null.
 */
function parsePdfDate(raw) {
  if (!raw) return null;
  // Strip the leading "D:" prefix if present
  const str = raw.replace(/^D:/, "").trim();
  // Basic pattern: YYYYMMDDHHmmSS with optional timezone
  const match = str.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/
  );
  if (!match) return null;
  const [, yr, mo, dy, hr, mn, sc] = match;
  try {
    return new Date(`${yr}-${mo}-${dy}T${hr}:${mn}:${sc}`).toISOString();
  } catch {
    return null;
  }
}

/**
 * Detect whether the PDF buffer has incremental updates.
 * Incremental updates append new %%EOF markers after the first one.
 */
function detectIncrementalUpdates(buffer) {
  const text = buffer.toString("latin1");
  const eofMatches = [...text.matchAll(/%%EOF/g)];
  return eofMatches.length > 1;
}

/**
 * Try to detect PDF version from header.
 */
function detectPdfVersion(buffer) {
  const header = buffer.slice(0, 20).toString("ascii");
  const match = header.match(/%PDF-(\d+\.\d+)/);
  return match ? match[1] : null;
}

/**
 * Detect whether PDF is encrypted (basic check).
 */
function detectEncryption(buffer) {
  const sample = buffer.slice(0, 4096).toString("latin1");
  return /\/Encrypt\s/.test(sample);
}

async function extractPdfMetadata(buffer, originalName) {
  let parsed;
  try {
    parsed = await pdfParse(buffer, { max: 0 }); // max:0 = don't parse text content
  } catch (e) {
    throw new Error(`Could not parse PDF: ${e.message}`);
  }

  const info = parsed.info || {};

  const created = parsePdfDate(info.CreationDate);
  const modified = parsePdfDate(info.ModDate);

  return {
    file_name: originalName,
    file_size: buffer.length,
    file_type: "application/pdf",
    pdf_version: detectPdfVersion(buffer),
    created_date: created,
    modified_date: modified,
    author: info.Author || null,
    creator: info.Creator || null,
    producer: info.Producer || null,
    title: info.Title || null,
    subject: info.Subject || null,
    keywords: info.Keywords || null,
    page_count: parsed.numpages || null,
    is_encrypted: detectEncryption(buffer),
    has_incremental_updates: detectIncrementalUpdates(buffer),
    raw_creation_date_string: info.CreationDate || null,
    raw_mod_date_string: info.ModDate || null,
  };
}

module.exports = { extractPdfMetadata };
