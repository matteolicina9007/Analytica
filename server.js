require('dotenv').config();
const express         = require('express');
const { clerkMiddleware, requireAuth, getAuth } = require('@clerk/express');
const { createClerkClient } = require('@clerk/backend');
const Stripe          = require('stripe');
const path            = require('path');

const app         = express();
const PORT        = process.env.PORT || 3000;
const stripe      = Stripe(process.env.STRIPE_SECRET_KEY);
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// Correspondance produit → plan Archiva
const PRODUCT_PLAN = {
  'prod_UOOnnUxP5ugY6J': { plan: 'pro',        period: 'mensuel' },
  'prod_UToPyjLGc4P78s': { plan: 'pro',        period: 'annuel'  },
  'prod_UTl6uQBtZfbgwN': { plan: 'entreprise', period: 'mensuel' },
  'prod_UTl7nKtP1jGmaQ': { plan: 'entreprise', period: 'annuel'  },
};

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
        try {
          await clerkClient.users.updateUserMetadata(userId, {
            publicMetadata: {
              plan:             planInfo.plan,
              period:           planInfo.period,
              stripeCustomerId: session.customer,
              subscriptionId:   session.subscription,
            },
          });
          console.log(`✓ Plan "${planInfo.plan}" activé pour ${userId}`);
        } catch (e) {
          console.error('Clerk metadata update error:', e.message);
        }
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      // Abonnement résilié → retour au plan gratuit
      const sub    = event.data.object;
      const custId = sub.customer;
      try {
        const customers = await stripe.customers.search({ query: `id:"${custId}"`, limit: 1 });
        // On retrouve l'userId via les metadata de la session originale — géré via Clerk lookup
        // Pour l'instant on log, la gestion complète nécessite une DB
        console.log(`Subscription cancelled for customer ${custId}`);
      } catch (e) {
        console.error(e.message);
      }
    }

    res.json({ received: true });
  }
);

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

app.use(express.static(path.join(__dirname)));

// ── API ROUTES ─────────────────────────────────────────────

// GET /api/me
app.get('/api/me', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await clerkClient.users.getUser(userId);
    res.json({
      id:        user.id,
      email:     user.emailAddresses[0]?.emailAddress || '',
      name:      [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Utilisateur',
      plan:      user.publicMetadata?.plan   || 'gratuit',
      period:    user.publicMetadata?.period || 'mensuel',
      createdAt: user.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/user/plan
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

// POST /api/stripe/checkout — crée une session Stripe Checkout
app.post('/api/stripe/checkout', requireAuth(), async (req, res) => {
  try {
    const { userId }   = getAuth(req);
    const { productId } = req.body;
    if (!PRODUCT_PLAN[productId]) return res.status(400).json({ error: 'Produit invalide.' });

    // Récupère le 1er prix actif pour ce produit
    const prices = await stripe.prices.list({ product: productId, active: true, limit: 1 });
    if (!prices.data.length) return res.status(400).json({ error: 'Aucun prix trouvé pour ce produit.' });

    const user  = await clerkClient.users.getUser(userId);
    const email = user.emailAddresses[0]?.emailAddress;
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;

    const session = await stripe.checkout.sessions.create({
      mode:                 'subscription',
      payment_method_types: ['card'],
      line_items:           [{ price: prices.data[0].id, quantity: 1 }],
      customer_email:       email,
      success_url:          `${appUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:           `${appUrl}/?payment=cancelled`,
      metadata:             { userId, productId },
      locale:               'fr',
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stripe/session/:id — vérifie le statut d'un paiement
app.get('/api/stripe/session/:sessionId', requireAuth(), async (req, res) => {
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
