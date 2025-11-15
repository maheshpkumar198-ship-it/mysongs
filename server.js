// server.js (SUPER SIMPLE + diagnostics, Render-ready)

const express = require("express");
const path = require("path");
const app = express();

// Render/Cloud will inject this
const PORT = process.env.PORT || 3000;

// ---- YouTube API Key via ENV (DO NOT hardcode) ----
const YT_API_KEY = process.env.YT_API_KEY;

app.use(express.json());
app.use(express.static(path.join(__dirname))); // serves customer.html / dj.html

// In-memory queue
let requests = [];
let nextRequestId = 1;
const norm = (s) => String(s || "").toUpperCase();

/* ---------------- DIAGNOSTICS ---------------- */

// quick health
app.get("/healthz", (_, res) => res.status(200).send("ok"));

// check env + node
app.get("/diag", (req, res) => {
  const key = process.env.YT_API_KEY || "";
  res.json({
    hasKey: !!key,
    keyPrefix: key ? key.slice(0, 6) : null,
    node: process.version
  });
});

/* --------------- YOUTUBE SEARCH --------------- */

app.get("/search-songs", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "q is required" });
  if (!YT_API_KEY) return res.status(500).json({ error: "YT_API_KEY missing on server" });

  const url =
    "https://www.googleapis.com/youtube/v3/search" +
    `?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(q)}&key=${YT_API_KEY}`;

  try {
    // Node 18+ has global fetch
    const r = await fetch(url);

    // read as text first so we can show raw errors
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!r.ok || data.error) {
      console.error("YouTube API error:", r.status, data.error || data);
      return res.status(r.status || 502).json({
        error: "YouTube API error",
        status: r.status,
        details: data.error || data
      });
    }

    const results = (data.items || [])
      .map(i => ({
        videoId: i.id?.videoId,
        title: i.snippet?.title,
        channel: i.snippet?.channelTitle,
        thumbnail: i.snippet?.thumbnails?.default?.url || ""
      }))
      .filter(x => !!x.videoId);

    res.json(results);
  } catch (e) {
    console.error("YouTube fetch failed:", e);
    res.status(500).json({ error: "YouTube fetch failed", message: String(e) });
  }
});

/* ----------------- REQUEST QUEUE ---------------- */

app.post("/request", (req, res) => {
  let { tableNo, songId, songTitle, songUrl } = req.body;
  if (tableNo === undefined || songId === undefined)
    return res.status(400).json({ error: "tableNo and songId are required" });

  tableNo = Number(tableNo);
  if (!Number.isInteger(tableNo) || tableNo <= 0)
    return res.status(400).json({ error: "tableNo must be a positive integer" });

  const exists = requests.find(
    r => r.tableNo === tableNo && ["PENDING", "PLAYING"].includes(r.status)
  );
  if (exists) {
    return res.status(409).json({
      message: "This table already has a song pending or playing."
    });
  }

  const newReq = {
    id: nextRequestId++,
    tableNo,
    songId,
    songName: songTitle || "(YouTube song)",
    songUrl: songUrl || "",
    status: "PENDING",
    createdAt: new Date().toISOString()
  };

  requests.push(newReq);
  res.status(201).json(newReq);
});

app.get("/requests", (req, res) => {
  const { status } = req.query;
  let out = requests;
  if (status) out = out.filter(r => r.status === norm(status));
  out = [...out].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  res.json(out);
});

app.patch("/requests/:id/status", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body || {};
  const r = requests.find(x => x.id === id);
  if (!r) return res.status(404).json({ error: "Not found" });
  r.status = norm(status || "DONE");
  res.json(r);
});

/* ------------------- ROOT ------------------- */

app.get("/", (_, res) => res.send("✅ Simple backend running"));

app.listen(PORT, () => {
  console.log(`Server → http://localhost:${PORT}`);
});

