require('dotenv').config();
const express  = require('express');
const { createRemoteJWKSet, jwtVerify } = require('jose');
const Stripe   = require('stripe');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');

const app    = express();
const PORT   = process.env.PORT || 3000;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const KINDE_DOMAIN = process.env.KINDE_DOMAIN || 'https://aelcorporation.kinde.com';
const JWKS = createRemoteJWKSet(new URL(`${KINDE_DOMAIN}/.well-known/jwks`));

// Wrapper pour capturer les erreurs dans les routes async (Express 4)
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Empêche les crashes sur promesses non gérées
process.on('unhandledRejection', (err) => console.error('UnhandledRejection:', err));

// ── IN-MEMORY PLAN STORAGE ─────────────────────────────────
const userPlans = new Map();

const PRODUCT_PLAN = {
  'prod_UOOnnUxP5ugY6J': { plan: 'pro',        period: 'mensuel' },
  'prod_UToPyjLGc4P78s': { plan: 'pro',        period: 'annuel'  },
  'prod_UTl6uQBtZfbgwN': { plan: 'entreprise', period: 'mensuel' },
  'prod_UTl7nKtP1jGmaQ': { plan: 'entreprise', period: 'annuel'  },
};

// ── OAUTH 2.0 STORAGE (in-memory — clients chargés depuis env) ─
// Les codes et tokens sont éphémères (expiry 1h), perte OK au redémarrage.
// Les clients sont rechargés depuis les variables d'env à chaque démarrage.
let oauthStore = { clients: {}, codes: {}, access_tokens: {}, refresh_tokens: {} };

function saveOAuth() {
  // No-op: stockage in-memory uniquement, pas de fichier (filesystem Railway éphémère)
}

// Charge le client OAuth depuis les variables d'environnement Railway
function loadEnvClients() {
  const clientId     = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;
  const redirectUris = process.env.OAUTH_REDIRECT_URIS;
  if (clientId && clientSecret && redirectUris) {
    oauthStore.clients[clientId] = {
      name:          process.env.OAUTH_CLIENT_NAME || 'Claude.ai',
      redirect_uris: redirectUris.split(',').map(u => u.trim()),
      client_secret: clientSecret,
    };
    console.log(`✓ Client OAuth chargé depuis env: ${clientId}`);
  }
}
loadEnvClients();

function genToken(prefix = '') {
  return prefix + crypto.randomBytes(32).toString('hex');
}

function cleanExpired() {
  const now = Date.now();
  for (const k of Object.keys(oauthStore.codes)) {
    if (oauthStore.codes[k].expires_at < now) delete oauthStore.codes[k];
  }
  for (const k of Object.keys(oauthStore.access_tokens)) {
    if (oauthStore.access_tokens[k].expires_at < now) delete oauthStore.access_tokens[k];
  }
}

setInterval(cleanExpired, 15 * 60 * 1000);

// ── KINDE AUTH MIDDLEWARE ──────────────────────────────────
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

// ── MCP OAUTH MIDDLEWARE ───────────────────────────────────
function requireMcpAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });
  const token = header.slice(7);
  cleanExpired();
  const data = oauthStore.access_tokens[token];
  if (!data) return res.status(401).json({ error: 'invalid_token' });
  req.mcpUserId   = data.user_id;
  req.mcpClientId = data.client_id;
  req.mcpScope    = data.scope;
  next();
}

// ── CONSENT PAGE HTML ──────────────────────────────────────
function consentPageHtml({ client, formState, scope, error }) {
  const scopeLabels = {
    mcp:  '📡 Accès MCP — lire et écrire des documents via l\'IA',
    read: '📖 Lecture de vos documents Archiva',
  };
  const scopeItems = (scope || 'mcp').split(' ')
    .map(s => `<li>${scopeLabels[s] || s}</li>`).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Autoriser — Archiva</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',sans-serif;background:#050c1a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;background-image:radial-gradient(ellipse 80% 50% at 50% -20%,rgba(249,115,22,.15),transparent)}
    .card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:2.5rem;max-width:440px;width:100%;backdrop-filter:blur(20px)}
    .logo{display:flex;align-items:center;gap:.6rem;margin-bottom:2rem;justify-content:center}
    .logo-ico{width:36px;height:36px;background:linear-gradient(135deg,#f97316,#ea580c);border-radius:9px;display:flex;align-items:center;justify-content:center}
    .logo-name{font-size:1.3rem;font-weight:800;color:#fff}
    h2{font-size:1.1rem;font-weight:700;color:#f1f5f9;margin-bottom:.4rem;text-align:center}
    .sub{font-size:.85rem;color:#64748b;text-align:center;margin-bottom:1.75rem}
    .app-badge{display:flex;align-items:center;gap:.75rem;background:rgba(249,115,22,.08);border:1px solid rgba(249,115,22,.2);border-radius:12px;padding:.85rem 1.1rem;margin-bottom:1.5rem}
    .app-ico{font-size:1.5rem}
    .app-name{font-weight:700;color:#f1f5f9;font-size:.95rem}
    .app-desc{font-size:.78rem;color:#64748b}
    .perms{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:1rem 1.25rem;margin-bottom:1.5rem}
    .perms-title{font-size:.75rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.75rem}
    .perms ul{list-style:none;display:flex;flex-direction:column;gap:.5rem}
    .perms li{font-size:.875rem;color:#cbd5e1;display:flex;align-items:center;gap:.5rem}
    .user-row{display:flex;align-items:center;gap:.6rem;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);border-radius:10px;padding:.7rem 1rem;margin-bottom:1.5rem;font-size:.85rem}
    .user-row .ico{font-size:1.1rem}
    #userStatus{color:#94a3b8;font-style:italic}
    .btn-row{display:flex;gap:.75rem}
    .btn{flex:1;padding:.75rem;border-radius:10px;border:none;font-family:'Inter',sans-serif;font-size:.9rem;font-weight:600;cursor:pointer;transition:opacity .2s}
    .btn-approve{background:linear-gradient(135deg,#f97316,#ea580c);color:#fff}
    .btn-deny{background:rgba(255,255,255,.06);color:#94a3b8;border:1px solid rgba(255,255,255,.1)}
    .btn:hover{opacity:.85}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    .error{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);border-radius:10px;padding:.75rem 1rem;font-size:.85rem;color:#f87171;margin-bottom:1rem;text-align:center}
    .fine{font-size:.75rem;color:#475569;text-align:center;margin-top:1.25rem}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="logo-ico">
        <svg width="20" height="20" fill="none" stroke="#fff" stroke-width="2.2" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </div>
      <span class="logo-name">Archiva</span>
    </div>

    <h2>Autoriser l'accès</h2>
    <p class="sub">Une application souhaite accéder à votre compte Archiva</p>

    ${error ? `<div class="error">⚠️ ${error}</div>` : ''}

    <div class="app-badge">
      <div class="app-ico">🔌</div>
      <div>
        <div class="app-name">${escHtmlServer(client.name)}</div>
        <div class="app-desc">Application tierce demandant un accès OAuth 2.0</div>
      </div>
    </div>

    <div class="perms">
      <div class="perms-title">Permissions demandées</div>
      <ul>${scopeItems}</ul>
    </div>

    <div class="user-row">
      <span class="ico">👤</span>
      <span id="userStatus">Vérification de la session…</span>
    </div>

    <div class="btn-row">
      <button type="button" class="btn btn-deny" onclick="submitConsent('denied')">Refuser</button>
      <button type="button" class="btn btn-approve" id="approveBtn" onclick="submitConsent('granted')" disabled>
        Autoriser
      </button>
    </div>

    <p class="fine">En autorisant, vous accordez à cette application l'accès décrit ci-dessus.<br>Vous pouvez révoquer cet accès à tout moment.</p>
  </div>

  <script>
    let kindeToken  = localStorage.getItem('kinde_access_token') || '';
    const statusEl  = document.getElementById('userStatus');
    const approveBtn = document.getElementById('approveBtn');

    if (kindeToken) {
      try {
        const parts   = kindeToken.split('.');
        const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
        const name    = payload.given_name || payload.email || 'Utilisateur';
        const exp     = payload.exp ? payload.exp * 1000 : 0;
        if (exp && Date.now() > exp) {
          statusEl.textContent = 'Session expirée — reconnectez-vous sur Archiva.';
          kindeToken = '';
        } else {
          statusEl.textContent = 'Connecté en tant que ' + name;
          statusEl.style.color = '#4ade80';
          statusEl.style.fontStyle = 'normal';
          approveBtn.disabled = false;
        }
      } catch {
        statusEl.textContent = 'Session non reconnue — connectez-vous sur Archiva.';
        kindeToken = '';
      }
    } else {
      statusEl.innerHTML = 'Non connecté — <a href="/" style="color:#f97316">connectez-vous sur Archiva</a> d\'abord.';
    }

    async function submitConsent(value) {
      approveBtn.disabled = true;
      const denyBtn = document.querySelector('.btn-deny');
      if (denyBtn) denyBtn.disabled = true;

      try {
        const resp = await fetch('/oauth/authorize', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consent:     value,
            form_state:  \`${formState}\`,
            kinde_token: kindeToken,
          }),
        });
        const data = await resp.json();
        if (data.redirect_url) {
          window.location.href = data.redirect_url;
        } else {
          const msg = data.error || 'Erreur inconnue';
          statusEl.textContent = '⚠️ ' + msg;
          statusEl.style.color = '#f87171';
          approveBtn.disabled = false;
          if (denyBtn) denyBtn.disabled = false;
        }
      } catch (err) {
        statusEl.textContent = '⚠️ Erreur réseau : ' + err.message;
        statusEl.style.color = '#f87171';
        approveBtn.disabled = false;
        if (denyBtn) denyBtn.disabled = false;
      }
    }
  </script>
</body>
</html>`;
}

function escHtmlServer(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
app.use(express.urlencoded({ extended: false, limit: '4mb' }));

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

// ══════════════════════════════════════════════════════════
//  OAUTH 2.0 ROUTES
// ══════════════════════════════════════════════════════════

// Metadata endpoint — requis par Claude.ai
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const base = process.env.APP_URL || `http://localhost:${PORT}`;
  res.json({
    issuer:                                base,
    authorization_endpoint:               `${base}/oauth/authorize`,
    token_endpoint:                       `${base}/oauth/token`,
    registration_endpoint:                `${base}/oauth/register-client`,
    scopes_supported:                     ['mcp', 'read'],
    response_types_supported:             ['code'],
    grant_types_supported:                ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported:['client_secret_post', 'client_secret_basic'],
    code_challenge_methods_supported:     ['S256'],
    response_modes_supported:             ['query'],
  });
});

// Enregistrer un nouveau client OAuth
app.post('/oauth/register-client', (req, res) => {
  const adminSecret = process.env.OAUTH_ADMIN_SECRET;
  if (adminSecret && req.headers['x-admin-secret'] !== adminSecret) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const { name, redirect_uris } = req.body;
  if (!name || !Array.isArray(redirect_uris) || !redirect_uris.length) {
    return res.status(400).json({ error: 'name et redirect_uris requis' });
  }
  const client_id     = genToken('client_');
  const client_secret = genToken('secret_');
  oauthStore.clients[client_id] = { name, redirect_uris, client_secret, created_at: Date.now() };
  saveOAuth();
  res.json({ client_id, client_secret, name, redirect_uris });
});

// GET /oauth/authorize — page de consentement
app.get('/oauth/authorize', wrap(async (req, res) => {
  const { client_id, redirect_uri, response_type, scope, state, code_challenge, code_challenge_method } = req.query;

  if (response_type !== 'code') {
    return res.status(400).send('response_type must be "code"');
  }

  const client = oauthStore.clients[client_id];
  if (!client) return res.status(400).send('client_id inconnu.');
  if (!client.redirect_uris.includes(redirect_uri)) return res.status(400).send('redirect_uri non autorisé.');

  const formState = Buffer.from(JSON.stringify({
    client_id, redirect_uri, scope: scope || 'mcp', state,
    code_challenge, code_challenge_method,
  })).toString('base64url');

  res.send(consentPageHtml({ client, formState, scope: scope || 'mcp' }));
}));

// POST /oauth/authorize — traitement du consentement (body JSON envoyé par fetch)
app.post('/oauth/authorize', wrap(async (req, res) => {
  console.log('[oauth/authorize POST] body keys:', Object.keys(req.body || {}));

  const { consent, form_state, kinde_token } = req.body || {};

  if (!form_state) {
    console.error('[oauth/authorize POST] form_state manquant');
    return res.status(400).json({ error: 'form_state manquant' });
  }

  let params;
  try { params = JSON.parse(Buffer.from(form_state, 'base64url').toString()); }
  catch (e) {
    console.error('[oauth/authorize POST] décodage form_state échoué:', e.message);
    return res.status(400).json({ error: 'Paramètres invalides' });
  }

  const { client_id, redirect_uri, scope, state, code_challenge, code_challenge_method } = params;
  console.log('[oauth/authorize POST] client_id:', client_id, '| redirect_uri:', redirect_uri);

  const client = oauthStore.clients[client_id];
  if (!client) {
    console.error('[oauth/authorize POST] client inconnu:', client_id, '| clients connus:', Object.keys(oauthStore.clients));
    return res.status(400).json({ error: 'client_id inconnu — le serveur a peut-être redémarré. Reconnectez le MCP depuis Claude.ai.' });
  }
  if (!client.redirect_uris.includes(redirect_uri)) {
    return res.status(400).json({ error: 'redirect_uri non autorisé' });
  }

  const redirectUrl = new URL(redirect_uri);
  if (state) redirectUrl.searchParams.set('state', state);

  if (consent !== 'granted') {
    redirectUrl.searchParams.set('error', 'access_denied');
    return res.json({ redirect_url: redirectUrl.toString() });
  }

  // Decode Kinde token (validated client-side before submission)
  let userId = null;
  if (kinde_token) {
    try {
      const parts = kinde_token.split('.');
      if (parts.length === 3) {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
        if (payload.sub && (!payload.exp || Math.floor(Date.now() / 1000) < payload.exp + 300)) {
          userId = payload.sub;
        }
      }
    } catch { /* token malformé */ }
  }

  console.log('[oauth/authorize POST] userId:', userId);

  if (!userId) {
    return res.status(401).json({ error: 'Connectez-vous à Archiva avant d\'autoriser.' });
  }

  const code = genToken('code_');
  oauthStore.codes[code] = {
    client_id, redirect_uri, user_id: userId,
    scope: scope || 'mcp',
    expires_at: Date.now() + 10 * 60 * 1000,
    code_challenge, code_challenge_method,
    used: false,
  };

  redirectUrl.searchParams.set('code', code);
  console.log('[oauth/authorize POST] ✓ code généré, redirect vers:', redirectUrl.toString());
  res.json({ redirect_url: redirectUrl.toString() });
}));

// POST /oauth/token — échange code → access_token
app.post('/oauth/token', express.urlencoded({ extended: false }), (req, res) => {
  const body = req.body;
  let client_id     = body.client_id;
  let client_secret = body.client_secret;

  // Support HTTP Basic auth
  const auth = req.headers.authorization;
  if (auth?.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString();
    const sep     = decoded.indexOf(':');
    client_id     = decoded.slice(0, sep);
    client_secret = decoded.slice(sep + 1);
  }

  const client = oauthStore.clients[client_id];
  if (!client || client.client_secret !== client_secret) {
    return res.status(401).json({ error: 'invalid_client' });
  }

  // ── Authorization Code Grant ──
  if (body.grant_type === 'authorization_code') {
    const codeData = oauthStore.codes[body.code];
    if (!codeData || codeData.used || codeData.expires_at < Date.now()) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Code expiré ou déjà utilisé.' });
    }
    if (codeData.client_id !== client_id || codeData.redirect_uri !== body.redirect_uri) {
      return res.status(400).json({ error: 'invalid_grant' });
    }

    // PKCE verification
    if (codeData.code_challenge) {
      if (!body.code_verifier) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'code_verifier manquant.' });
      }
      const hash = crypto.createHash('sha256').update(body.code_verifier).digest('base64url');
      if (hash !== codeData.code_challenge) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'code_verifier incorrect.' });
      }
    }

    oauthStore.codes[body.code].used = true;

    const access_token  = genToken('at_');
    const refresh_token = genToken('rt_');
    const expires_in    = 3600; // 1h

    oauthStore.access_tokens[access_token] = {
      client_id, user_id: codeData.user_id,
      scope: codeData.scope,
      expires_at: Date.now() + expires_in * 1000,
    };
    oauthStore.refresh_tokens[refresh_token] = {
      client_id, user_id: codeData.user_id,
      scope: codeData.scope,
      current_access_token: access_token,
    };
    saveOAuth();

    return res.json({
      access_token, token_type: 'Bearer',
      expires_in, refresh_token,
      scope: codeData.scope,
    });
  }

  // ── Refresh Token Grant ──
  if (body.grant_type === 'refresh_token') {
    const rtData = oauthStore.refresh_tokens[body.refresh_token];
    if (!rtData || rtData.client_id !== client_id) {
      return res.status(400).json({ error: 'invalid_grant' });
    }

    // Revoke old access token
    if (rtData.current_access_token) delete oauthStore.access_tokens[rtData.current_access_token];

    const access_token = genToken('at_');
    const expires_in   = 3600;

    oauthStore.access_tokens[access_token] = {
      client_id, user_id: rtData.user_id,
      scope: rtData.scope,
      expires_at: Date.now() + expires_in * 1000,
    };
    oauthStore.refresh_tokens[body.refresh_token].current_access_token = access_token;
    saveOAuth();

    return res.json({ access_token, token_type: 'Bearer', expires_in, scope: rtData.scope });
  }

  return res.status(400).json({ error: 'unsupported_grant_type' });
});

// ══════════════════════════════════════════════════════════
//  MCP ROUTES (protégées par OAuth)
// ══════════════════════════════════════════════════════════

app.get('/mcp', requireMcpAuth, (req, res) => {
  res.json({
    name:        'Archiva MCP',
    version:     '1.0.0',
    description: 'Archiva Document Intelligence — connecteur MCP',
    user_id:     req.mcpUserId,
    scope:       req.mcpScope,
    capabilities: ['document.generate', 'document.extract', 'document.analyze'],
  });
});

app.post('/mcp/tools/list', requireMcpAuth, (req, res) => {
  res.json({
    tools: [
      {
        name:        'generate_document',
        description: 'Génère un document professionnel (contrat, rapport, lettre…)',
        inputSchema: {
          type: 'object',
          properties: {
            type:    { type: 'string', description: 'Type de document' },
            context: { type: 'string', description: 'Contexte et instructions' },
            lang:    { type: 'string', enum: ['français','anglais'], default: 'français' },
          },
          required: ['type'],
        },
      },
      {
        name:        'extract_document',
        description: 'Extrait et résume le contenu d\'un texte ou document',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Texte à analyser' },
            mode: { type: 'string', enum: ['résumé','extraction','points-action','analyse-complète'], default: 'résumé' },
          },
          required: ['text'],
        },
      },
    ],
  });
});

// ══════════════════════════════════════════════════════════
//  API ROUTES (protégées par Kinde)
// ══════════════════════════════════════════════════════════

app.get('/api/me', requireAuth, wrap(async (req, res) => {
  const planData = userPlans.get(req.userId) || { plan: 'gratuit', period: 'mensuel' };
  res.json({
    id:     req.userId,
    email:  req.userEmail,
    name:   req.userName || 'Utilisateur',
    plan:   planData.plan,
    period: planData.period,
  });
}));

app.post('/api/user/plan', requireAuth, wrap(async (req, res) => {
  const { plan } = req.body;
  const valid = ['gratuit', 'pro', 'entreprise', 'sur-devis'];
  if (!valid.includes(plan)) return res.status(400).json({ error: 'Plan invalide.' });
  const existing = userPlans.get(req.userId) || {};
  userPlans.set(req.userId, { ...existing, plan });
  res.json({ success: true, plan });
}));

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

app.get('/api/stripe/session/:sessionId', requireAuth, async (req, res) => {
  try {
    const session  = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    const planInfo = PRODUCT_PLAN[session.metadata?.productId] || null;
    res.json({ status: session.payment_status, planInfo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fallback SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Middleware d'erreur global — empêche les crashes 500
app.use((err, req, res, next) => {
  console.error('Express error:', err.stack || err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Erreur serveur interne', detail: err.message });
});

// ── START ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✓ Archiva backend démarré sur le port ${PORT}`);
});
