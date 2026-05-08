import React, { useState, useCallback } from "react";
import "./App.css";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(str) {
  if (!str) return "—";
  try {
    return new Date(str).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return str; }
}

function severityClass(sev) {
  if (sev === "High") return "sev-high";
  if (sev === "Medium") return "sev-medium";
  return "sev-low";
}

function riskClass(level) {
  if (level === "High") return "risk-high";
  if (level === "Medium") return "risk-medium";
  return "risk-low";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RiskGauge({ score, level }) {
  const clampedScore = Math.min(100, Math.max(0, score));
  const angle = (clampedScore / 100) * 180;

  return (
    <div className="gauge-wrap">
      <svg viewBox="0 0 200 110" className="gauge-svg">
        {/* Background arc */}
        <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="#1e2433" strokeWidth="18" strokeLinecap="round" />
        {/* Colored arc */}
        <path
          d="M 10 100 A 90 90 0 0 1 190 100"
          fill="none"
          stroke={level === "High" ? "#ff4757" : level === "Medium" ? "#ffa502" : "#2ed573"}
          strokeWidth="18"
          strokeLinecap="round"
          strokeDasharray={`${(clampedScore / 100) * 283} 283`}
          className="gauge-fill"
        />
        {/* Needle */}
        <g transform={`rotate(${angle - 90}, 100, 100)`}>
          <line x1="100" y1="100" x2="100" y2="18" stroke="#e2e8f0" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="100" cy="100" r="5" fill="#e2e8f0" />
        </g>
        {/* Score text */}
        <text x="100" y="92" textAnchor="middle" className="gauge-score">{clampedScore}</text>
        <text x="100" y="108" textAnchor="middle" className="gauge-label">/100</text>
      </svg>
      <div className={`risk-badge ${riskClass(level)}`}>{level} Risk</div>
    </div>
  );
}

function MetadataTable({ metadata }) {
  const prettyKey = (k) =>
    k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const dateKeys = ["created_date", "modified_date", "date_time", "date_time_original", "date_time_digitized"];
  const boolKeys = ["is_encrypted", "has_incremental_updates", "has_exif"];

  return (
    <div className="meta-table">
      {Object.entries(metadata).map(([k, v]) => {
        if (v === null || v === undefined || v === "") return null;
        let display;
        if (dateKeys.includes(k)) display = formatDate(v);
        else if (boolKeys.includes(k)) display = v ? "Yes" : "No";
        else if (k === "file_size") display = formatBytes(v);
        else display = String(v);

        return (
          <div key={k} className="meta-row">
            <span className="meta-key">{prettyKey(k)}</span>
            <span className="meta-val">{display}</span>
          </div>
        );
      })}
    </div>
  );
}

function FindingCard({ finding }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`finding-card ${severityClass(finding.severity)}`}>
      <div className="finding-header" onClick={() => setExpanded((e) => !e)}>
        <div className="finding-left">
          <span className={`sev-tag ${severityClass(finding.severity)}`}>{finding.severity}</span>
          <span className="finding-title">{finding.title}</span>
        </div>
        <div className="finding-right">
          <span className="conf-label">Confidence: {Math.round(finding.confidence * 100)}%</span>
          <span className="expand-icon">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>
      {expanded && (
        <div className="finding-body">
          <p className="finding-simple"><strong>In plain terms:</strong> {finding.simple_explanation}</p>
          <p className="finding-detail"><strong>Full explanation:</strong> {finding.explanation}</p>
          {finding.technical_detail && (
            <p className="finding-tech"><code>{finding.technical_detail}</code></p>
          )}
        </div>
      )}
    </div>
  );
}

function DropZone({ onFile, loading }) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }, [onFile]);

  const handleChange = (e) => {
    const file = e.target.files[0];
    if (file) onFile(file);
  };

  return (
    <div
      className={`dropzone ${dragOver ? "drag-over" : ""} ${loading ? "loading" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        id="fileInput"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={handleChange}
        style={{ display: "none" }}
        disabled={loading}
      />
      <label htmlFor="fileInput" className="dropzone-label">
        {loading ? (
          <>
            <div className="spinner" />
            <span className="drop-text">Analysing document…</span>
          </>
        ) : (
          <>
            <div className="drop-icon">⬆</div>
            <span className="drop-text">Drop a file here or <u>click to browse</u></span>
            <span className="drop-sub">PDF · JPG · PNG — up to 20 MB</span>
          </>
        )}
      </label>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleFile(file) {
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/analyze", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function downloadReport() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `metadata-report-${result.document_name}.json`;
    a.click();
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">◈</span>
            <span className="logo-text">DocMeta <span className="logo-accent">Inspector</span></span>
          </div>
          <p className="header-sub">Metadata mutation analysis for PDF, JPG &amp; PNG documents</p>
        </div>
      </header>

      <main className="main">
        <DropZone onFile={handleFile} loading={loading} />

        {error && (
          <div className="error-box">
            <span className="error-icon">⚠</span> {error}
          </div>
        )}

        {result && (
          <div className="report">
            {/* Report header */}
            <div className="report-top">
              <div className="report-title-block">
                <h2 className="report-doc-name">{result.document_name}</h2>
                <p className="report-summary">{result.summary}</p>
              </div>
              <RiskGauge score={result.metadata_risk_score} level={result.metadata_risk_level} />
            </div>

            {/* Action box */}
            <div className={`action-box ${riskClass(result.metadata_risk_level)}`}>
              <span className="action-label">Recommended Action</span>
              <p className="action-text">{result.recommended_action}</p>
            </div>

            {/* Two-column: metadata + findings */}
            <div className="report-grid">
              <section className="report-section">
                <h3 className="section-title">Extracted Metadata</h3>
                <MetadataTable metadata={result.extracted_metadata} />
              </section>

              <section className="report-section">
                <h3 className="section-title">
                  Findings
                  <span className="findings-count">{result.findings.length}</span>
                </h3>
                {result.findings.length === 0 ? (
                  <p className="no-findings">No anomalies detected.</p>
                ) : (
                  result.findings.map((f, i) => <FindingCard key={i} finding={f} />)
                )}
              </section>
            </div>

            <div className="report-footer">
              <span className="report-id">Analysis ID: {result.analysis_id}</span>
              <button className="download-btn" onClick={downloadReport}>
                ⬇ Download JSON Report
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>Metadata signals are not absolute proof of tampering. Findings should be reviewed alongside additional evidence.</p>
      </footer>
    </div>
  );
}
