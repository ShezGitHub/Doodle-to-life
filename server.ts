import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import Database from "better-sqlite3";
import SQLiteStoreFactory from "better-sqlite3-session-store";
import { randomUUID } from "crypto";
import Stripe from "stripe";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SQLiteStore = SQLiteStoreFactory(session);

// --- Database setup ---
const db = new Database(path.join(__dirname, "data", "doodlive.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Add credits column if it doesn't exist yet (safe migration)
try {
  db.exec(`ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT 1`);
} catch {
  // Column already exists — ignore
}

// --- Generations table ---
db.exec(`
  CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    video_url TEXT NOT NULL,
    thumbnail_url TEXT,
    drawing_prompt TEXT,
    parent_context TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_gen_user ON generations(user_id)`);
fs.mkdirSync(path.join(__dirname, "data", "videos"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "data", "images"), { recursive: true });

// --- Stripe setup ---
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const CREDIT_PACKS = {
  starter: { credits: 5, unit_amount: 499, name: "Starter Pack — 5 Credits" },
  family:  { credits: 20, unit_amount: 1499, name: "Family Pack — 20 Credits" },
  studio:  { credits: 50, unit_amount: 2999, name: "Studio Pack — 50 Credits" },
} as const;

// --- Passport config ---
const googleOAuthConfigured =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

if (googleOAuthConfigured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: (process.env.APP_URL || "http://localhost:3000") + "/auth/google/callback",
      },
      (_accessToken, _refreshToken, profile, done) => {
        const googleId = profile.id;
        const email = profile.emails?.[0]?.value ?? "";
        const name = profile.displayName ?? "";
        const avatarUrl = profile.photos?.[0]?.value ?? "";

        let user = db.prepare("SELECT * FROM users WHERE google_id = ?").get(googleId) as any;

        if (!user) {
          const id = randomUUID();
          db.prepare(
            "INSERT INTO users (id, google_id, email, name, avatar_url, credits) VALUES (?, ?, ?, ?, ?, 1)"
          ).run(id, googleId, email, name, avatarUrl);
          user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
        } else {
          db.prepare(
            "UPDATE users SET email = ?, name = ?, avatar_url = ? WHERE google_id = ?"
          ).run(email, name, avatarUrl, googleId);
        }

        return done(null, user);
      }
    )
  );
} else {
  console.warn(
    "[auth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google OAuth disabled. Set these in .env to enable login."
  );
}

passport.serializeUser((user: any, done) => done(null, user.id));

passport.deserializeUser((id: string, done) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  done(null, user || false);
});

// --- Express app ---
async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust Railway's reverse proxy so secure cookies and OAuth callbacks work over HTTPS
  app.set("trust proxy", 1);

  // Stripe webhook needs raw body — register BEFORE express.json
  app.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json" }),
    (req, res) => {
      if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
        res.status(503).json({ error: "Stripe not configured" });
        return;
      }

      const sig = req.headers["stripe-signature"] as string;
      let event: Stripe.Event;

      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } catch (err: any) {
        console.error("[stripe webhook] signature verification failed:", err.message);
        res.status(400).json({ error: "Webhook signature invalid" });
        return;
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const creditsToAdd = parseInt(session.metadata?.credits ?? "0", 10);

        if (userId && creditsToAdd > 0) {
          db.prepare("UPDATE users SET credits = credits + ? WHERE id = ?").run(
            creditsToAdd,
            userId
          );
          console.log(`[stripe] Added ${creditsToAdd} credits to user ${userId}`);
        }
      }

      res.json({ received: true });
    }
  );

  app.use(express.json({ limit: "50mb" }));

  app.use(
    session({
      store: new SQLiteStore({ client: db, expired: { clear: true, intervalMs: 900000 } }),
      secret: process.env.SESSION_SECRET || "doodlive-dev-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.APP_URL?.startsWith("https") ?? false,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // --- Auth routes ---
  if (googleOAuthConfigured) {
    app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

    app.get(
      "/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/?auth=failed" }),
      (_req, res) => {
        res.redirect("/");
      }
    );
  } else {
    app.get("/auth/google", (_req, res) => {
      res.status(503).send(
        "Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file."
      );
    });
  }

  app.post("/auth/logout", (req, res) => {
    req.logout(() => {
      req.session.destroy(() => {
        res.sendStatus(200);
      });
    });
  });

  // Health check — used by Railway to verify the container is ready before routing traffic
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", ts: Date.now() });
  });

  app.get("/api/me", (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const u = req.user as any;
    res.json({
      id: u.id,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatar_url,
      credits: u.credits ?? 0,
    });
  });

  // Consume 1 credit before a video generation
  app.post("/api/credits/consume", (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const u = req.user as any;
    const fresh = db.prepare("SELECT credits FROM users WHERE id = ?").get(u.id) as any;

    if (!fresh || fresh.credits <= 0) {
      res.status(402).json({ error: "no_credits" });
      return;
    }

    db.prepare("UPDATE users SET credits = credits - 1 WHERE id = ?").run(u.id);
    res.json({ credits: fresh.credits - 1 });
  });

  // Create a Stripe Checkout session for a credit pack
  app.post("/api/checkout", async (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (!stripe) {
      res.status(503).json({ error: "Stripe not configured" });
      return;
    }

    const u = req.user as any;
    const { pack } = req.body as { pack: keyof typeof CREDIT_PACKS };
    const packInfo = CREDIT_PACKS[pack];

    if (!packInfo) {
      res.status(400).json({ error: "Invalid pack" });
      return;
    }

    const appUrl = process.env.APP_URL || "http://localhost:3000";

    try {
      const checkoutSession = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: packInfo.unit_amount,
              product_data: { name: packInfo.name },
            },
            quantity: 1,
          },
        ],
        metadata: {
          userId: u.id,
          credits: String(packInfo.credits),
        },
        success_url: `${appUrl}/?payment=success&credits=${packInfo.credits}`,
        cancel_url: `${appUrl}/`,
      });

      res.json({ url: checkoutSession.url });
    } catch (err: any) {
      console.error("[stripe checkout]", err.message);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  // Serve generated videos and thumbnails
  app.use("/api/videos", express.static(path.join(__dirname, "data", "videos")));
  app.use("/api/images", express.static(path.join(__dirname, "data", "images")));

  // Generate a video from a doodle — handles credit deduction + refund on failure
  app.post("/api/generate", async (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const u = req.user as any;

    // Atomically check + deduct credit
    const fresh = db.prepare("SELECT credits FROM users WHERE id = ?").get(u.id) as any;
    if (!fresh || fresh.credits <= 0) {
      res.status(402).json({ error: "no_credits" });
      return;
    }
    db.prepare("UPDATE users SET credits = credits - 1 WHERE id = ?").run(u.id);

    const { imageBytes, mimeType, parentContext, drawingPrompt } = req.body as {
      imageBytes: string;
      mimeType: string;
      parentContext?: string;
      drawingPrompt?: string;
    };

    if (!imageBytes || !mimeType) {
      db.prepare("UPDATE users SET credits = credits + 1 WHERE id = ?").run(u.id);
      res.status(400).json({ error: "Missing imageBytes or mimeType" });
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

      const base = drawingPrompt ? `The drawing is of: ${drawingPrompt}. ` : "";
      const ctx = parentContext ? `Additional context: ${parentContext}. ` : "";
      const prompt = `${base}${ctx}Animate this child's drawing. The character or object should magically pop out of the paper and come to life in a 3D space, while keeping the charming hand-drawn aesthetic. The animation should be vibrant, playful, and high-quality.`;

      let operation = await ai.models.generateVideos({
        model: "veo-3.1-fast-generate-preview",
        prompt,
        image: { imageBytes, mimeType },
        config: { numberOfVideos: 1, resolution: "720p", aspectRatio: "16:9" },
      });

      while (!operation.done) {
        await new Promise(r => setTimeout(r, 5000));
        operation = await ai.operations.getVideosOperation({ operation });
      }

      const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!uri) throw new Error("No video URI returned");

      // Download the video server-side
      const downloadUrl = new URL(uri);
      downloadUrl.searchParams.set("key", process.env.GEMINI_API_KEY!);
      const videoRes = await fetch(downloadUrl.toString());
      if (!videoRes.ok) throw new Error("Failed to download video from Gemini");

      const videoId = randomUUID();
      const videoPath = path.join(__dirname, "data", "videos", `${videoId}.mp4`);
      const buffer = Buffer.from(await videoRes.arrayBuffer());
      fs.writeFileSync(videoPath, buffer);

      // Save original drawing as thumbnail
      const imageBuffer = Buffer.from(imageBytes, "base64");
      const thumbPath = path.join(__dirname, "data", "images", `${videoId}.jpg`);
      fs.writeFileSync(thumbPath, imageBuffer);

      // Record generation in DB
      db.prepare(`
        INSERT INTO generations (id, user_id, video_url, thumbnail_url, drawing_prompt, parent_context)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(videoId, u.id, `/api/videos/${videoId}.mp4`, `/api/images/${videoId}.jpg`, drawingPrompt ?? null, parentContext ?? null);

      res.json({ videoUrl: `/api/videos/${videoId}.mp4`, credits: fresh.credits - 1 });
    } catch (err: any) {
      // Refund the credit on failure
      db.prepare("UPDATE users SET credits = credits + 1 WHERE id = ?").run(u.id);
      const raw = err.message || "";
      console.error("[generate]", raw);

      // Parse known Gemini API errors into friendly codes
      let code = "generation_failed";
      if (raw.includes("429") || raw.includes("RESOURCE_EXHAUSTED") || raw.includes("quota")) {
        code = "quota_exceeded";
      } else if (raw.includes("400") || raw.includes("INVALID_ARGUMENT")) {
        code = "invalid_image";
      } else if (raw.includes("503") || raw.includes("UNAVAILABLE")) {
        code = "service_unavailable";
      }

      res.status(500).json({ error: code });
    }
  });

  // Admin stats — only accessible by the account whose email matches ADMIN_EMAIL env var
  app.get("/api/admin/stats", (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const u = req.user as any;
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail || u.email !== adminEmail) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const totalUsers     = (db.prepare("SELECT COUNT(*) as n FROM users").get() as any).n;
    const totalGens      = (db.prepare("SELECT COUNT(*) as n FROM generations").get() as any).n;
    const totalCredits   = (db.prepare("SELECT SUM(credits) as n FROM users").get() as any).n ?? 0;
    const usersToday     = (db.prepare("SELECT COUNT(*) as n FROM users WHERE created_at >= date('now')").get() as any).n;
    const usersThisWeek  = (db.prepare("SELECT COUNT(*) as n FROM users WHERE created_at >= date('now', '-7 days')").get() as any).n;
    const gensToday      = (db.prepare("SELECT COUNT(*) as n FROM generations WHERE created_at >= date('now')").get() as any).n;
    const gensThisWeek   = (db.prepare("SELECT COUNT(*) as n FROM generations WHERE created_at >= date('now', '-7 days')").get() as any).n;
    const recentUsers    = db.prepare("SELECT name, email, credits, created_at FROM users ORDER BY created_at DESC LIMIT 20").all();
    const topGenerators  = db.prepare(`
      SELECT u.name, u.email, COUNT(g.id) as gen_count
      FROM users u JOIN generations g ON g.user_id = u.id
      GROUP BY u.id ORDER BY gen_count DESC LIMIT 10
    `).all();

    res.json({
      users: { total: totalUsers, today: usersToday, this_week: usersThisWeek },
      generations: { total: totalGens, today: gensToday, this_week: gensThisWeek },
      credits_in_system: totalCredits,
      recent_signups: recentUsers,
      top_generators: topGenerators,
    });
  });

  // Get user's past generations
  app.get("/api/generations", (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const u = req.user as any;
    const rows = db.prepare(
      "SELECT * FROM generations WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
    ).all(u.id);
    res.json(rows);
  });

  const distPath = path.join(__dirname, "dist");
  const isProd = process.env.NODE_ENV === "production" || fs.existsSync(path.join(distPath, "index.html"));

  if (isProd) {
    // --- Production: serve compiled React app ---
    console.log("[server] Production mode — serving from", distPath);
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    // --- Development: Vite dev server ---
    console.log("[server] Development mode — using Vite dev server");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
