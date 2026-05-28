import express from "express";
import cors from "cors";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// ── User Settings ────────────────────────────────────────────────────────────

app.get("/api/users/:telegramId/settings", async (req, res) => {
  const telegramId = parseInt(req.params.telegramId);
  if (isNaN(telegramId)) return res.status(400).json({ error: "Invalid telegram_id" });
  try {
    const result = await pool.query(
      "SELECT * FROM user_settings WHERE telegram_id = $1",
      [telegramId]
    );
    if (result.rows.length === 0) {
      return res.json({
        notifications: true,
        dark_mode: false,
        feature_payment: true,
        feature_explore: true,
        feature_schedule: true,
        feature_favorites: true,
        feature_notes: true,
        feature_qr: true,
      });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/users/:telegramId/settings", async (req, res) => {
  const telegramId = parseInt(req.params.telegramId);
  if (isNaN(telegramId)) return res.status(400).json({ error: "Invalid telegram_id" });
  const {
    notifications, dark_mode, first_name, last_name, username,
    feature_payment, feature_explore, feature_schedule, feature_favorites, feature_notes, feature_qr,
  } = req.body;
  try {
    await pool.query(
      `INSERT INTO user_settings
         (telegram_id, first_name, last_name, username, notifications, dark_mode,
          feature_payment, feature_explore, feature_schedule, feature_favorites, feature_notes, feature_qr, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (telegram_id) DO UPDATE SET
         first_name        = COALESCE($2,  user_settings.first_name),
         last_name         = COALESCE($3,  user_settings.last_name),
         username          = COALESCE($4,  user_settings.username),
         notifications     = COALESCE($5,  user_settings.notifications),
         dark_mode         = COALESCE($6,  user_settings.dark_mode),
         feature_payment   = COALESCE($7,  user_settings.feature_payment),
         feature_explore   = COALESCE($8,  user_settings.feature_explore),
         feature_schedule  = COALESCE($9,  user_settings.feature_schedule),
         feature_favorites = COALESCE($10, user_settings.feature_favorites),
         feature_notes     = COALESCE($11, user_settings.feature_notes),
         feature_qr        = COALESCE($12, user_settings.feature_qr),
         updated_at        = NOW()`,
      [
        telegramId,
        first_name ?? null, last_name ?? null, username ?? null,
        notifications ?? null, dark_mode ?? null,
        feature_payment ?? null, feature_explore ?? null,
        feature_schedule ?? null, feature_favorites ?? null,
        feature_notes ?? null, feature_qr ?? null,
      ]
    );
    const result = await pool.query("SELECT * FROM user_settings WHERE telegram_id = $1", [telegramId]);
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── Notes ────────────────────────────────────────────────────────────────────

app.get("/api/users/:telegramId/notes", async (req, res) => {
  const telegramId = parseInt(req.params.telegramId);
  if (isNaN(telegramId)) return res.status(400).json({ error: "Invalid telegram_id" });
  try {
    const result = await pool.query(
      "SELECT * FROM notes WHERE telegram_id = $1 ORDER BY updated_at DESC",
      [telegramId]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/users/:telegramId/notes", async (req, res) => {
  const telegramId = parseInt(req.params.telegramId);
  if (isNaN(telegramId)) return res.status(400).json({ error: "Invalid telegram_id" });
  const { title, content } = req.body;
  if (!title && !content) return res.status(400).json({ error: "title or content required" });
  try {
    const result = await pool.query(
      "INSERT INTO notes (telegram_id, title, content) VALUES ($1, $2, $3) RETURNING *",
      [telegramId, title ?? "", content ?? ""]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.put("/api/users/:telegramId/notes/:noteId", async (req, res) => {
  const telegramId = parseInt(req.params.telegramId);
  const noteId = parseInt(req.params.noteId);
  if (isNaN(telegramId) || isNaN(noteId)) return res.status(400).json({ error: "Invalid id" });
  const { title, content } = req.body;
  try {
    const result = await pool.query(
      `UPDATE notes SET title = $1, content = $2, updated_at = NOW()
       WHERE id = $3 AND telegram_id = $4 RETURNING *`,
      [title ?? "", content ?? "", noteId, telegramId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Note not found" });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.delete("/api/users/:telegramId/notes/:noteId", async (req, res) => {
  const telegramId = parseInt(req.params.telegramId);
  const noteId = parseInt(req.params.noteId);
  if (isNaN(telegramId) || isNaN(noteId)) return res.status(400).json({ error: "Invalid id" });
  try {
    await pool.query(
      "DELETE FROM notes WHERE id = $1 AND telegram_id = $2",
      [noteId, telegramId]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── Send QR to Telegram ──────────────────────────────────────────────────────

app.post("/api/users/:telegramId/send-qr", async (req, res) => {
  const telegramId = parseInt(req.params.telegramId);
  if (isNaN(telegramId)) return res.status(400).json({ error: "Invalid telegram_id" });

  const { imageBase64, text } = req.body;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return res.status(500).json({ error: "Bot token not configured" });
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });

  try {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const form = new FormData();
    form.append("chat_id", telegramId.toString());
    form.append("document", new Blob([buffer], { type: "image/png" }), "limsovannrady_bot.png");

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendDocument`,
      { method: "POST", body: form }
    );
    const data = await response.json() as any;
    if (!data.ok) return res.status(500).json({ error: data.description });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to send to Telegram" });
  }
});

const API_PORT = parseInt(process.env.API_PORT || "3000");
app.listen(API_PORT, "0.0.0.0", () => {
  console.log(`API server running on port ${API_PORT}`);
});
