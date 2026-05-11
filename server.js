require('dotenv').config();
const express    = require('express');
const { clerkMiddleware, requireAuth, getAuth } = require('@clerk/express');
const { createClerkClient } = require('@clerk/backend');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

// ── MIDDLEWARES ────────────────────────────────────────────
app.use(express.json());
app.use(clerkMiddleware({ secretKey: process.env.CLERK_SECRET_KEY }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.header('Access-Control-Allow-Origin',      origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers',     'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods',     'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Sert les fichiers statiques (index.html, styles.css, app.js)
app.use(express.static(path.join(__dirname)));

// ── API ROUTES ─────────────────────────────────────────────

// GET /api/me — infos de l'utilisateur connecté
app.get('/api/me', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await clerkClient.users.getUser(userId);
    res.json({
      id:        user.id,
      email:     user.emailAddresses[0]?.emailAddress || '',
      name:      [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Utilisateur',
      plan:      user.publicMetadata?.plan || 'gratuit',
      createdAt: user.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/user/plan — mettre à jour le plan (préparé pour Stripe)
app.post('/api/user/plan', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { plan }   = req.body;
    const valid = ['gratuit', 'pro', 'entreprise', 'sur-devis'];
    if (!valid.includes(plan)) return res.status(400).json({ error: 'Plan invalide.' });
    await clerkClient.users.updateUserMetadata(userId, { publicMetadata: { plan } });
    res.json({ success: true, plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/health — vérification que le serveur tourne
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fallback → SPA (toutes les autres routes renvoient index.html)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── START ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✓ Archiva backend démarré sur le port ${PORT}`);
});
