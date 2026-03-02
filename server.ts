import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import SQLiteStore from "better-sqlite3-session-store";
import Stripe from "stripe";

const SqliteSessionStore = SQLiteStore(session);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("memories.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    name TEXT,
    picture TEXT,
    credits INTEGER DEFAULT 1
  );
`);

// Migration: Ensure credits column exists (in case table was created without it)
try {
  db.prepare("ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 1").run();
} catch (e) {}

// Migration: Ensure picture column exists
try {
  db.prepare("ALTER TABLE users ADD COLUMN picture TEXT").run();
} catch (e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    title TEXT,
    description TEXT,
    parent_note TEXT,
    drawing_image TEXT,
    video_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS auth_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.set("trust proxy", true);

  // Stripe Webhook MUST be before express.json() to get raw body
  app.post("/api/webhook", express.raw({ type: 'application/json' }), async (req: any, res) => {
    // Stripe Initialization (Lazy)
    const getStripe = () => {
      if (process.env.STRIPE_SECRET_KEY) {
        return new Stripe(process.env.STRIPE_SECRET_KEY);
      }
      return null;
    };

    const s = getStripe();
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!s || !sig || !webhookSecret) {
      console.error("Webhook missing Stripe config or signature");
      return res.status(400).send("Webhook Error: Missing config");
    }

    let event;

    try {
      event = s.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error(`Webhook Signature Verification Failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const creditsToAdd = parseInt(session.metadata?.credits || "0");

      if (userId && creditsToAdd > 0) {
        try {
          db.prepare("UPDATE users SET credits = credits + ? WHERE id = ?").run(creditsToAdd, userId);
          console.log(`Successfully added ${creditsToAdd} credits to user ${userId}`);
        } catch (error) {
          console.error("Failed to update credits from webhook:", error);
          return res.status(500).send("Internal Server Error");
        }
      }
    }

    res.json({ received: true });
  });

  app.use(express.json({ limit: '50mb' }));

  // Token-based Auth Middleware
  app.use((req: any, res, next) => {
    const token = req.headers['x-auth-token'];
    if (token) {
      try {
        const session = db.prepare("SELECT user_id FROM auth_tokens WHERE token = ?").get(token);
        if (session) {
          const user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id);
          if (user) {
            req.user = user;
            // Mock isAuthenticated for passport compatibility in routes
            req.isAuthenticated = () => true;
          }
        }
      } catch (err) {
        console.error("Token auth error:", err);
      }
    }
    next();
  });

  // Session configuration
  console.log("Session Secret status:", process.env.SESSION_SECRET ? "Set" : "Using Default");
  app.use(
    session({
      store: new SqliteSessionStore({
        client: db,
        expired: {
          clear: true,
          intervalMs: 900000 // 15 minutes
        }
      }),
      secret: process.env.SESSION_SECRET || "doodle-magic-secret",
      resave: false,
      saveUninitialized: false,
      proxy: true,
      cookie: {
        secure: true,
        sameSite: "none",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      }
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser((id: string, done) => {
    try {
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: "/auth/google/callback",
          proxy: true
        },
        (accessToken, refreshToken, profile, done) => {
          try {
            console.log("Google Strategy Verify Callback for profile:", profile.id);
            let user = db.prepare("SELECT * FROM users WHERE id = ?").get(profile.id);
            if (!user) {
              console.log("Creating new user for profile:", profile.id);
              const email = profile.emails?.[0]?.value;
              const initialCredits = email === "katherine@hoja.ai" ? 4 : 1;
              
              db.prepare("INSERT INTO users (id, email, name, picture, credits) VALUES (?, ?, ?, ?, ?)")
                .run(profile.id, email, profile.displayName, profile.photos?.[0]?.value, initialCredits);
              user = db.prepare("SELECT * FROM users WHERE id = ?").get(profile.id);
            } else {
              console.log("Updating existing user for profile:", profile.id);
              // Update picture if it changed or was missing
              db.prepare("UPDATE users SET picture = ?, name = ? WHERE id = ?")
                .run(profile.photos?.[0]?.value, profile.displayName, profile.id);
              user = db.prepare("SELECT * FROM users WHERE id = ?").get(profile.id);
            }
            return done(null, user);
          } catch (err) {
            console.error("Error in Google Strategy Verify Callback:", err);
            return done(err);
          }
        }
      )
    );
  }

  // Auth Routes
  app.get("/auth/google", (req: any, res, next) => {
    console.log("Starting Google Auth...");
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.error("Missing Google Credentials");
      return res.status(500).send("Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in secrets.");
    }
    
    // Force HTTPS and use current host for callback
    const protocol = 'https'; 
    let host = req.headers['x-forwarded-host'] || req.headers.host || req.get('host') || '';
    
    // If host is internal/localhost, try Referer or APP_URL
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      const referer = req.headers.referer;
      if (referer) {
        try {
          host = new URL(referer).host;
        } catch (e) {}
      }
    }

    // Final fallback to APP_URL if still on localhost
    if ((host.includes('localhost') || host.includes('127.0.0.1')) && process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
      try {
        host = new URL(process.env.APP_URL).host;
      } catch (e) {}
    }
    
    const callbackURL = `${protocol}://${host}/auth/google/callback`;
    console.log("OAuth Attempt - Host:", host, "Callback:", callbackURL);

    passport.authenticate("google", { 
      scope: ["profile", "email"],
      callbackURL: callbackURL
    })(req, res, next);
  });

  app.get(
    "/auth/google/callback",
    (req: any, res, next) => {
      console.log("Google Auth Callback received");
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.status(500).send("Google OAuth is not configured.");
      }

      // Force HTTPS and use current host for callback (must match the one sent in /auth/google)
      const protocol = 'https';
      let host = req.headers['x-forwarded-host'] || req.headers.host || req.get('host') || '';

      if (host.includes('localhost') || host.includes('127.0.0.1')) {
        const referer = req.headers.referer;
        if (referer) {
          try {
            host = new URL(referer).host;
          } catch (e) {}
        }
      }

      if ((host.includes('localhost') || host.includes('127.0.0.1')) && process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
        try {
          host = new URL(process.env.APP_URL).host;
        } catch (e) {}
      }

      const callbackURL = `${protocol}://${host}/auth/google/callback`;

      passport.authenticate("google", { 
        failureRedirect: "/login",
        callbackURL: callbackURL 
      }, (err, user, info) => {
        if (err) {
          console.error("Passport Auth Error:", err);
          return next(err);
        }
        if (!user) {
          console.error("No user found in callback:", info);
          return res.redirect("/login");
        }
        req.logIn(user, (err: any) => {
          if (err) {
            console.error("Login Error:", err);
            return next(err);
          }
          console.log("User logged in successfully:", user.id);
          
          // Generate a token for frontend fallback
          const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
          db.prepare("INSERT INTO auth_tokens (token, user_id) VALUES (?, ?)").run(token, user.id);

          // Explicitly save session before proceeding
          req.session.save((err: any) => {
            if (err) {
              console.error("Session Save Error:", err);
              return next(err);
            }
            console.log("Session saved successfully");
            (req as any).authToken = token; // Pass token to next handler
            next();
          });
        });
      })(req, res, next);
    },
    (req: any, res) => {
      const token = req.authToken || "";
      res.send(`
        <html>
          <body>
            <script>
              console.log("OAuth Success Popup: Sending message to opener...");
              const token = '${token}';
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS',
                  token: token
                }, '*');
                console.log("Message sent. Closing window in 1 second...");
                setTimeout(() => window.close(), 1000);
              } else {
                console.error("No window.opener found! Redirecting to home...");
                window.location.href = '/';
              }
            </script>
            <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
              <h2>Login Successful!</h2>
              <p>This window will close automatically.</p>
              <p style="font-size: 12px; color: #666;">If it doesn't close, you can close it manually and refresh the main page.</p>
            </div>
          </body>
        </html>
      `);
    }
  );

  app.get("/api/user", (req: any, res) => {
    console.log("Fetching user, authenticated:", req.isAuthenticated(), "User:", req.user?.id);
    res.json(req.user || null);
  });

  app.post("/api/logout", (req: any, res) => {
    req.logout(() => {
      res.json({ success: true });
    });
  });

  // Middleware to check if user is authenticated
  const isAuthenticated = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ error: "Unauthorized" });
  };

  // Stripe Initialization (Lazy)
  let stripe: Stripe | null = null;
  const getStripe = () => {
    if (!stripe && process.env.STRIPE_SECRET_KEY) {
      stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
    return stripe;
  };

  // API Routes
  app.get("/api/credits", isAuthenticated, (req: any, res) => {
    try {
      const user = db.prepare("SELECT credits FROM users WHERE id = ?").get(req.user.id);
      // Fallback for users who might have null credits from before migration
      const credits = user.credits ?? 1;
      if (user.credits === null) {
        db.prepare("UPDATE users SET credits = 1 WHERE id = ?").run(req.user.id);
      }
      res.json({ credits });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch credits" });
    }
  });

  app.post("/api/credits/deduct", isAuthenticated, (req: any, res) => {
    try {
      const user = db.prepare("SELECT credits FROM users WHERE id = ?").get(req.user.id);
      if (user.credits <= 0) {
        return res.status(403).json({ error: "Insufficient credits" });
      }
      db.prepare("UPDATE users SET credits = credits - 1 WHERE id = ?").run(req.user.id);
      const newUser = db.prepare("SELECT credits FROM users WHERE id = ?").get(req.user.id);
      res.json(newUser);
    } catch (error) {
      res.status(500).json({ error: "Failed to deduct credits" });
    }
  });

  // Stripe Checkout Session
  app.post("/api/create-checkout-session", isAuthenticated, async (req: any, res) => {
    const s = getStripe();
    if (!s) {
      return res.status(500).json({ error: "Stripe is not configured" });
    }

    const { amount, credits } = req.body;
    const protocol = 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || req.get('host');
    const origin = `${protocol}://${host}`;

    try {
      const session = await s.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${credits} Doodle Credits`,
                description: 'Credits for generating animations and doodles',
              },
              unit_amount: amount, // in cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${origin}/?success=true`,
        cancel_url: `${origin}/?canceled=true`,
        metadata: {
          userId: req.user.id,
          credits: credits.toString(),
        },
      });

      res.json({ id: session.id, url: session.url });
    } catch (error: any) {
      console.error("Stripe Checkout Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Stripe Webhook
  // Moved to top of startServer()

  app.get("/api/memories", isAuthenticated, (req: any, res) => {
    try {
      const memories = db.prepare("SELECT * FROM memories WHERE user_id = ? ORDER BY created_at DESC").all(req.user.id);
      res.json(memories);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch memories" });
    }
  });

  app.post("/api/memories", isAuthenticated, (req: any, res) => {
    const { title, description, parent_note, drawing_image, video_data } = req.body;
    try {
      const info = db.prepare(`
        INSERT INTO memories (user_id, title, description, parent_note, drawing_image, video_data)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(req.user.id, title, description, parent_note, drawing_image, video_data);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to save memory" });
    }
  });

  app.delete("/api/memories/:id", isAuthenticated, (req: any, res) => {
    const { id } = req.params;
    try {
      db.prepare("DELETE FROM memories WHERE id = ? AND user_id = ?").run(id, req.user.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete memory" });
    }
  });

  app.get("/api/memories/:id", (req, res) => {
    const { id } = req.params;
    try {
      const memory = db.prepare("SELECT * FROM memories WHERE id = ?").get(id);
      if (memory) {
        res.json(memory);
      } else {
        res.status(404).json({ error: "Memory not found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch memory" });
    }
  });

  app.get("/share/:id", (req, res) => {
    const { id } = req.params;
    try {
      const memory = db.prepare("SELECT * FROM memories WHERE id = ?").get(id);
      if (!memory) {
        return res.status(404).send("Memory not found");
      }
      
      // Simple HTML page for sharing
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Doodlive - ${memory.title}</title>
          <style>
            body { 
              background-color: #f5f5f0; 
              color: #1a1a1a; 
              font-family: 'Inter', sans-serif; 
              display: flex; 
              flex-direction: column; 
              align-items: center; 
              justify-content: center; 
              min-height: 100vh; 
              margin: 0; 
              padding: 20px;
            }
            .card {
              background: white;
              padding: 20px;
              border-radius: 40px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.05);
              max-width: 600px;
              width: 100%;
              text-align: center;
            }
            video {
              width: 100%;
              border-radius: 30px;
              margin-bottom: 20px;
            }
            h1 { font-family: 'Georgia', serif; font-style: italic; margin-bottom: 10px; }
            p { color: #666; margin-bottom: 20px; }
            .logo { font-weight: bold; font-size: 24px; margin-bottom: 30px; color: #5A5A40; text-decoration: none; }
          </style>
        </head>
        <body>
          <a href="/" class="logo">🎨 Doodlive</a>
          <div class="card">
            <h1>${memory.title}</h1>
            <video src="${memory.video_data}" controls autoplay loop></video>
            <p>${memory.parent_note || memory.description}</p>
            <div style="font-size: 12px; color: #999; margin-top: 20px;">Created on ${new Date(memory.created_at).toLocaleDateString()}</div>
          </div>
        </body>
        </html>
      `);
    } catch (error) {
      res.status(500).send("Internal Server Error");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
