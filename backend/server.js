/**
 * Time Tracker — Express backend
 * Stores all data in ./data.json
 *
 * Endpoints:
 *   GET    /api/data          → return entire JSON file
 *   PUT    /api/data/:date    → upsert a day record   { study, video, studyLog, videoLog }
 *   PATCH  /api/data/:date    → add minutes to a day  { type: "study"|"video", mins: Number }
 *   DELETE /api/data/:date    → delete a day record
 *   DELETE /api/data/:date/:type → reset study or video for a day
 *
 * Run:
 *   npm install express cors
 *   node server.js
 */

const express = require("express");
const cors    = require("cors");
const fs      = require("fs");
const path    = require("path");

const app      = express();
const PORT     = process.env.PORT || 3001;
const DB_PATH  = path.join(__dirname, "data.json");

app.use(cors({ origin: process.env.CORS_ORIGIN || 'https://studytimetracer.onrender.com' }));
app.use(express.json());

// ── helpers ──────────────────────────────────────────────────────────────────
function readDB() {
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, "{}", "utf8");
  try { return JSON.parse(fs.readFileSync(DB_PATH, "utf8")); }
  catch { return {}; }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

// Cairo timestamp helper (server-side)
function cairoNow() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(new Date());
}

// ── GET /api/data ─────────────────────────────────────────────────────────────
app.get("/api/data", (req, res) => {
  res.json(readDB());
});

// ── PUT /api/data/:date  (full upsert) ────────────────────────────────────────
app.put("/api/data/:date", (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });

  const db = readDB();
  db[date] = { study:0, video:0, studyLog:[], videoLog:[], ...req.body };
  writeDB(db);
  res.json({ date, record: db[date] });
});

// ── PATCH /api/data/:date  (add minutes — concatenate) ────────────────────────
app.patch("/api/data/:date", (req, res) => {
  const { date } = req.params;
  const { type, mins } = req.body;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
  if (!["study","video"].includes(type))
    return res.status(400).json({ error: "type must be 'study' or 'video'" });
  if (!Number.isInteger(mins) || mins <= 0)
    return res.status(400).json({ error: "mins must be a positive integer" });

  const db      = readDB();
  const logKey  = type === "study" ? "studyLog" : "videoLog";
  const existing = db[date] || { study:0, video:0, studyLog:[], videoLog:[] };

  db[date] = {
    ...existing,
    [type]:   (existing[type] || 0) + mins,
    [logKey]: [...(existing[logKey] || []), { added: mins, at: cairoNow() }],
  };

  writeDB(db);
  res.json({ date, record: db[date] });
});

// ── DELETE /api/data/:date  (remove entire day) ───────────────────────────────
app.delete("/api/data/:date", (req, res) => {
  const { date } = req.params;
  const db = readDB();
  if (!db[date]) return res.status(404).json({ error: "Date not found" });
  delete db[date];
  writeDB(db);
  res.json({ deleted: date });
});

// ── DELETE /api/data/:date/:type  (reset study or video for a day) ────────────
app.delete("/api/data/:date/:type", (req, res) => {
  const { date, type } = req.params;
  if (!["study","video"].includes(type))
    return res.status(400).json({ error: "type must be 'study' or 'video'" });

  const db = readDB();
  if (!db[date]) return res.status(404).json({ error: "Date not found" });

  const logKey = type === "study" ? "studyLog" : "videoLog";
  db[date] = { ...db[date], [type]: 0, [logKey]: [] };
  writeDB(db);
  res.json({ date, record: db[date] });
});

// ── start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  Time Tracker API running at http://localhost:${PORT}`);
  console.log(`📁  Data file: ${DB_PATH}`);
});
