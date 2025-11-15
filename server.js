// server.js (SUPER SIMPLE)

const express = require("express");
const path = require("path");
const app = express();
const PORT = 3000;

// ---- YouTube API Key ----
const YT_API_KEY = "AIzaSyCF2yjUnyqHwGa72kyaTsSTeuMm_BmMYyI"; // इथे तुझी YouTube key

app.use(express.json());
app.use(express.static(path.join(__dirname))); // serve customer.html / dj.html

// --- Requests (in-memory) ---
let requests = [];
let nextRequestId = 1;
const normalize = (s) => String(s || "").toUpperCase();

// ---------------------------
// GET /search-songs?q=... → YouTube search
// ---------------------------
app.get("/search-songs", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "q is required" });

  try {
    const url =
      "https://www.googleapis.com/youtube/v3/search" +
      `?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(q)}&key=${YT_API_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.error) return res.status(500).json({ error: "YouTube API error", details: data.error });

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
    console.error(e);
    res.status(500).json({ error: "YouTube fetch failed" });
  }
});

// ---------------------------
// POST /request  { tableNo, songId, songTitle, songUrl }
// super simple: per-table spam control (one active at a time)
// ---------------------------
app.post("/request", (req, res) => {
  let { tableNo, songId, songTitle, songUrl } = req.body;
  if (tableNo === undefined || songId === undefined)
    return res.status(400).json({ error: "tableNo and songId are required" });

  tableNo = Number(tableNo);
  if (!Number.isInteger(tableNo) || tableNo <= 0)
    return res.status(400).json({ error: "tableNo must be a positive integer" });

  const exists = requests.find(r =>
    r.tableNo === tableNo && ["PENDING", "PLAYING"].includes(r.status)
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

// ---------------------------
// GET /requests?status=PENDING → DJ queue
// ---------------------------
app.get("/requests", (req, res) => {
  const { status } = req.query;
  let out = requests;
  if (status) out = out.filter(r => r.status === normalize(status));
  out = [...out].sort((a,b)=> new Date(a.createdAt) - new Date(b.createdAt));
  res.json(out);
});

// ---------------------------
app.patch("/requests/:id/status", (req, res) => {
  const id = parseInt(req.params.id,10);
  const { status } = req.body || {};
  const r = requests.find(x => x.id === id);
  if (!r) return res.status(404).json({ error: "Not found" });
  r.status = normalize(status || "DONE");
  res.json(r);
});

app.get("/", (_, res) => res.send("✅ Simple backend running"));
app.listen(PORT, () => console.log(`Server → http://localhost:${PORT}`));

