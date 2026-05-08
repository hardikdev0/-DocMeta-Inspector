/**
 * rules.js
 * Rule-based metadata mutation checker.
 *
 * Each rule returns either null (no finding) or a Finding object:
 * {
 *   title: string,
 *   severity: "Low" | "Medium" | "High",
 *   confidence: number (0-1),
 *   explanation: string,
 *   technical_detail: string,  // for developers
 *   simple_explanation: string // for non-technical readers
 * }
 */

const EDITING_TOOLS = [
  "preview",
  "acrobat",
  "photoshop",
  "illustrator",
  "canva",
  "libreoffice",
  "foxit",
  "nitro",
  "smallpdf",
  "ilovepdf",
  "pdfcandy",
  "sejda",
  "pdfescape",
  "pdf24",
  "online2pdf",
  "adobe online",
  "google docs",
  "inkscape",
  "gimp",
  "scanner",
  "scansoft",
  "nuance",
  "abbyy",
  "readiris",
];

const CREATION_TOOLS = [
  "microsoft word",
  "ms word",
  "libreoffice writer",
  "google docs",
  "pages",
  "wps office",
  "openoffice",
  "latex",
  "tex",
  "pdflatex",
  "quark",
  "indesign",
  "framemaker",
  "reportlab",
  "fpdf",
  "mpdf",
  "tcpdf",
  "wkhtmltopdf",
  "phantomjs",
  "puppeteer",
  "playwright",
];

function containsEditingTool(str) {
  if (!str) return null;
  const lower = str.toLowerCase();
  return EDITING_TOOLS.find((t) => lower.includes(t)) || null;
}

function containsCreationTool(str) {
  if (!str) return null;
  const lower = str.toLowerCase();
  return CREATION_TOOLS.find((t) => lower.includes(t)) || null;
}

function safeDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function daysDiff(a, b) {
  return Math.abs((b - a) / (1000 * 60 * 60 * 24));
}

// ─── PDF Rules ────────────────────────────────────────────────────────────────

function ruleMissingCreationDate(meta) {
  if (!meta.created_date && meta.modified_date) {
    return {
      title: "Creation date missing but modification date present",
      severity: "Medium",
      confidence: 0.65,
      explanation:
        "The document has a modification date but no creation date. This can occur when metadata is stripped or when a document is re-exported after editing.",
      technical_detail:
        "PDF Info dict has ModDate but no CreationDate. Legitimate converters sometimes omit CreationDate.",
      simple_explanation:
        "We know when the file was last changed, but not when it was originally made. This is sometimes normal, but can also happen after editing.",
    };
  }
  return null;
}

function ruleBothDatesMissing(meta) {
  if (!meta.created_date && !meta.modified_date) {
    return {
      title: "Both creation and modification dates are absent",
      severity: "Low",
      confidence: 0.45,
      explanation:
        "Neither CreationDate nor ModDate is present. Many automated PDF generators omit dates intentionally, so this alone is not a strong indicator.",
      technical_detail: "PDF Info dict has no CreationDate or ModDate fields.",
      simple_explanation:
        "This file has no date information. Many automated tools skip this on purpose.",
    };
  }
  return null;
}

function ruleModifiedBeforeCreated(meta) {
  const created = safeDate(meta.created_date);
  const modified = safeDate(meta.modified_date);
  if (created && modified && modified < created) {
    return {
      title: "Modification date is earlier than creation date",
      severity: "High",
      confidence: 0.85,
      explanation:
        "The recorded modification date precedes the creation date, which is logically impossible in a normal workflow. This strongly suggests metadata was manually altered or incorrectly written by an export tool.",
      technical_detail: `CreationDate: ${meta.created_date}, ModDate: ${meta.modified_date}. ModDate < CreationDate.`,
      simple_explanation:
        "The file says it was changed before it was created. That is not possible normally and is a strong red flag.",
    };
  }
  return null;
}

function ruleModifiedMuchLaterThanCreated(meta) {
  const created = safeDate(meta.created_date);
  const modified = safeDate(meta.modified_date);
  if (created && modified && modified > created) {
    const days = daysDiff(created, modified);
    if (days > 365) {
      return {
        title: "Document modified significantly after creation",
        severity: "Medium",
        confidence: 0.6,
        explanation: `The document was last modified approximately ${Math.round(days)} days after its creation date. While this can reflect legitimate long-term revisions, it may also indicate late-stage editing or metadata manipulation.`,
        technical_detail: `Days between CreationDate and ModDate: ${Math.round(days)}.`,
        simple_explanation:
          "There is a large gap between when this file was created and when it was last changed. This is not automatically suspicious, but worth noting.",
      };
    }
    if (days > 30 && days <= 365) {
      return {
        title: "Document modified after creation",
        severity: "Low",
        confidence: 0.5,
        explanation: `The modification date is approximately ${Math.round(days)} days after the creation date. Minor edits, conversions, and resaves commonly produce this pattern.`,
        technical_detail: `Days between CreationDate and ModDate: ${Math.round(days)}.`,
        simple_explanation:
          "The file was changed some time after it was created. This is common and usually not suspicious.",
      };
    }
  }
  return null;
}

function ruleCreatorProducerMismatch(meta) {
  if (!meta.creator || !meta.producer) return null;

  const creatorLower = meta.creator.toLowerCase();
  const producerLower = meta.producer.toLowerCase();

  // Same tool family — not suspicious
  if (
    creatorLower.includes("acrobat") &&
    producerLower.includes("acrobat")
  )
    return null;
  if (creatorLower.includes("word") && producerLower.includes("word"))
    return null;

  // Creator is a doc editor, producer is a different PDF engine
  const creatorIsDocTool = containsCreationTool(meta.creator);
  const producerIsEditTool = containsEditingTool(meta.producer);

  if (creatorIsDocTool && producerIsEditTool) {
    return {
      title: "Creator and producer software differ",
      severity: "Low",
      confidence: 0.55,
      explanation: `The document was apparently created using "${meta.creator}" and then processed or exported by "${meta.producer}". This is a common pattern in PDF workflows (e.g., Word → Acrobat conversion) and is generally not suspicious on its own.`,
      technical_detail: `Creator: "${meta.creator}", Producer: "${meta.producer}".`,
      simple_explanation:
        "Two different programs are listed — one that made the file and one that processed it. This often happens in normal document workflows.",
    };
  }

  // Completely unrelated tools
  if (
    creatorLower !== producerLower &&
    !producerLower.includes(creatorLower.split(" ")[0]) &&
    !creatorLower.includes(producerLower.split(" ")[0])
  ) {
    return {
      title: "Creator and producer are from unrelated tool families",
      severity: "Medium",
      confidence: 0.6,
      explanation: `The creator field references "${meta.creator}" and the producer field references "${meta.producer}". These tools are from different software families, which may indicate the document passed through multiple processing steps after initial creation.`,
      technical_detail: `Creator: "${meta.creator}", Producer: "${meta.producer}".`,
      simple_explanation:
        "Two very different programs are listed as having handled this file. This could be normal, but is worth reviewing.",
    };
  }

  return null;
}

function ruleProducerIsOnlineEditor(meta) {
  const onlineEditors = [
    "smallpdf",
    "ilovepdf",
    "pdfcandy",
    "sejda",
    "pdfescape",
    "pdf24",
    "online2pdf",
    "adobe online",
    "canva",
  ];

  const fieldToCheck = [meta.producer, meta.creator, meta.title, meta.subject];
  for (const field of fieldToCheck) {
    if (!field) continue;
    const lower = field.toLowerCase();
    const match = onlineEditors.find((e) => lower.includes(e));
    if (match) {
      return {
        title: "Document processed by an online PDF editor",
        severity: "Medium",
        confidence: 0.7,
        explanation: `Metadata indicates the document was processed using an online editing service ("${match}"). Online editors are commonly used to modify existing documents and may alter or strip original metadata in the process.`,
        technical_detail: `Online editor detected in metadata fields: "${match}" found in "${field}".`,
        simple_explanation:
          "This file appears to have been opened and saved by an online editing tool. These services are often used to change document contents.",
      };
    }
  }
  return null;
}

function ruleIncrementalUpdates(meta) {
  if (meta.has_incremental_updates) {
    return {
      title: "PDF contains incremental update sections",
      severity: "Medium",
      confidence: 0.72,
      explanation:
        "The PDF file structure contains multiple %%EOF markers, which indicates incremental updates were appended to the original document. Incremental updates are used to modify PDFs while preserving the original content, and can be used both for legitimate revisions and for post-creation editing.",
      technical_detail:
        "Multiple %%EOF sequences detected in the binary file. This is a structural indicator of incremental PDF updates (ISO 32000-1 §7.5.6).",
      simple_explanation:
        "The internal structure of this file shows it was updated or changed after it was originally created.",
    };
  }
  return null;
}

function ruleMissingAuthor(meta) {
  if (!meta.author && (meta.created_date || meta.producer)) {
    return {
      title: "Author field is empty",
      severity: "Low",
      confidence: 0.35,
      explanation:
        "The author metadata field is absent. Many legitimate documents have no author set — this depends entirely on the software settings used to produce the file. This is a weak signal and should not be treated as suspicious on its own.",
      technical_detail: "PDF Info dict Author field is empty or absent.",
      simple_explanation:
        "No author name is recorded in the file. This is very common and usually not significant.",
    };
  }
  return null;
}

function ruleFutureDates(meta) {
  const now = new Date();
  const created = safeDate(meta.created_date);
  const modified = safeDate(meta.modified_date);

  if ((created && created > now) || (modified && modified > now)) {
    return {
      title: "Document contains a future date",
      severity: "High",
      confidence: 0.9,
      explanation:
        "One or more metadata dates are set in the future. This is not possible in a legitimately produced document and strongly suggests the metadata was manually altered.",
      technical_detail: `CreationDate: ${meta.created_date}, ModDate: ${meta.modified_date}, Current time: ${now.toISOString()}.`,
      simple_explanation:
        "The file claims to have been created or changed in the future. This is not possible normally and is a strong red flag.",
    };
  }
  return null;
}

function ruleSuspiciousKeywords(meta) {
  const suspiciousPatterns = [/edited/i, /modified/i, /converted/i, /fake/i, /temp/i, /copy/i];
  const fieldsToCheck = {
    title: meta.title,
    subject: meta.subject,
    keywords: meta.keywords,
    creator: meta.creator,
    producer: meta.producer,
  };

  for (const [fieldName, value] of Object.entries(fieldsToCheck)) {
    if (!value) continue;
    const matchedPattern = suspiciousPatterns.find((p) => p.test(value));
    if (matchedPattern) {
      return {
        title: `Suspicious keyword in "${fieldName}" field`,
        severity: "Low",
        confidence: 0.4,
        explanation: `The ${fieldName} field contains a word that may suggest post-creation modification: "${value}". This is a weak signal; such words appear in many legitimate document workflows.`,
        technical_detail: `Pattern "${matchedPattern}" matched in ${fieldName}: "${value}".`,
        simple_explanation: `A word like "edited" or "converted" appears in the file's metadata. This sometimes happens naturally.`,
      };
    }
  }
  return null;
}

// ─── Image Rules ──────────────────────────────────────────────────────────────

function ruleImageNoExif(meta) {
  if (!meta.has_exif) {
    return {
      title: "No EXIF metadata found in image",
      severity: "Low",
      confidence: 0.4,
      explanation:
        "The image contains no EXIF metadata. EXIF data is automatically added by cameras and most image editors. Its absence can indicate the metadata was stripped — intentionally or by an editing tool.",
      technical_detail: "No EXIF APP1 segment detected in JPEG/PNG.",
      simple_explanation:
        "Images usually have hidden technical information (camera model, date taken, etc). This one has none, which can happen after editing.",
    };
  }
  return null;
}

function ruleImageSoftwareMismatch(meta) {
  if (!meta.software) return null;
  const editTool = containsEditingTool(meta.software);
  if (editTool) {
    return {
      title: "Image was processed by editing software",
      severity: "Low",
      confidence: 0.5,
      explanation: `The EXIF Software tag indicates the image was processed by "${meta.software}". This is common in document workflows and does not confirm tampering.`,
      technical_detail: `EXIF Software: "${meta.software}".`,
      simple_explanation:
        "An image editing program handled this file. That is normal for many workflows.",
    };
  }
  return null;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

function runPdfRules(meta) {
  const rules = [
    ruleFutureDates,
    ruleModifiedBeforeCreated,
    ruleIncrementalUpdates,
    ruleProducerIsOnlineEditor,
    ruleMissingCreationDate,
    ruleBothDatesMissing,
    ruleModifiedMuchLaterThanCreated,
    ruleCreatorProducerMismatch,
    ruleSuspiciousKeywords,
    ruleMissingAuthor,
  ];

  return rules.map((r) => r(meta)).filter(Boolean);
}

function runImageRules(meta) {
  return [ruleImageNoExif(meta), ruleImageSoftwareMismatch(meta)].filter(
    Boolean
  );
}

module.exports = { runPdfRules, runImageRules };
