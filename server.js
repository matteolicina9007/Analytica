require('dotenv').config();
const express  = require('express');
const { createRemoteJWKSet, jwtVerify } = require('jose');
const Stripe   = require('stripe');
const path     = require('path');

const app    = express();
const PORT   = process.env.PORT || 3000;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const KINDE_DOMAIN = process.env.KINDE_DOMAIN || 'https://aelcorporation.kinde.com';
const JWKS = createRemoteJWKSet(new URL(`${KINDE_DOMAIN}/.well-known/jwks`));

// In-memory plan storage (resets on redeploy — acceptable for MVP)
const userPlans = new Map();

const PRODUCT_PLAN = {
  'prod_UOOnnUxP5ugY6J': { plan: 'pro',        period: 'mensuel' },
  'prod_UToPyjLGc4P78s': { plan: 'pro',        period: 'annuel'  },
  'prod_UTl6uQBtZfbgwN': { plan: 'entreprise', period: 'mensuel' },
  'prod_UTl7nKtP1jGmaQ': { plan: 'entreprise', period: 'annuel'  },
};

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const { payload } = await jwtVerify(header.slice(7), JWKS, { issuer: KINDE_DOMAIN });
    req.userId    = payload.sub;
    req.userEmail = payload.email;
    req.userName  = [payload.given_name, payload.family_name].filter(Boolean).join(' ') || payload.email;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide' });
  }
}

// ── WEBHOOK STRIPE (raw body — doit être avant express.json) ──
app.post('/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature error:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session   = event.data.object;
      const userId    = session.metadata?.userId;
      const productId = session.metadata?.productId;
      const planInfo  = PRODUCT_PLAN[productId];
      if (userId && planInfo) {
        userPlans.set(userId, {
          plan:             planInfo.plan,
          period:           planInfo.period,
          stripeCustomerId: session.customer,
          subscriptionId:   session.subscription,
        });
        console.log(`✓ Plan "${planInfo.plan}" activé pour ${userId}`);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      for (const [uid, data] of userPlans.entries()) {
        if (data.stripeCustomerId === sub.customer) {
          userPlans.delete(uid);
          console.log(`Subscription cancelled for ${uid}`);
          break;
        }
      }
    }

    res.json({ received: true });
  }
);

// ── MIDDLEWARES ────────────────────────────────────────────
app.use(express.json());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.header('Access-Control-Allow-Origin',      origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers',     'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods',     'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.static(path.join(__dirname)));

// ── API ROUTES ─────────────────────────────────────────────

// GET /api/me
app.get('/api/me', requireAuth, (req, res) => {
  const planData = userPlans.get(req.userId) || { plan: 'gratuit', period: 'mensuel' };
  res.json({
    id:     req.userId,
    email:  req.userEmail,
    name:   req.userName || 'Utilisateur',
    plan:   planData.plan,
    period: planData.period,
  });
});

// POST /api/user/plan
app.post('/api/user/plan', requireAuth, (req, res) => {
  const { plan } = req.body;
  const valid = ['gratuit', 'pro', 'entreprise', 'sur-devis'];
  if (!valid.includes(plan)) return res.status(400).json({ error: 'Plan invalide.' });
  const existing = userPlans.get(req.userId) || {};
  userPlans.set(req.userId, { ...existing, plan });
  res.json({ success: true, plan });
});

// POST /api/stripe/checkout
app.post('/api/stripe/checkout', requireAuth, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!PRODUCT_PLAN[productId]) return res.status(400).json({ error: 'Produit invalide.' });

    const prices = await stripe.prices.list({ product: productId, active: true, limit: 1 });
    if (!prices.data.length) return res.status(400).json({ error: 'Aucun prix trouvé pour ce produit.' });

    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;

    const session = await stripe.checkout.sessions.create({
      mode:                 'subscription',
      payment_method_types: ['card'],
      line_items:           [{ price: prices.data[0].id, quantity: 1 }],
      customer_email:       req.userEmail,
      success_url:          `${appUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:           `${appUrl}/?payment=cancelled`,
      metadata:             { userId: req.userId, productId },
      locale:               'fr',
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stripe/session/:id
app.get('/api/stripe/session/:sessionId', requireAuth, async (req, res) => {
  try {
    const session  = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    const planInfo = PRODUCT_PLAN[session.metadata?.productId] || null;
    res.json({ status: session.payment_status, planInfo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fallback SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── START ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✓ Archiva backend démarré sur le port ${PORT}`);
});
