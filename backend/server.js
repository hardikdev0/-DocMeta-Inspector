const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { analyzeDocument } = require("./services/analyzer");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json());

// Multer - memory storage (no disk writes needed)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    const allowedExts = [".pdf", ".jpg", ".jpeg", ".png"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Please upload PDF, JPG, or PNG."));
    }
  },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/health", (req, res) => res.json({ status: "ok", version: "1.0.0" }));

app.post("/api/analyze", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const result = await analyzeDocument(req.file);
    result.analysis_id = uuidv4();
    result.analyzed_at = new Date().toISOString();

    res.json(result);
  } catch (err) {
    console.error("[analyze error]", err.message);
    res.status(500).json({ error: err.message || "Analysis failed." });
  }
});

// Error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  res.status(400).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🔍 Metadata Checker API running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health\n`);
});
