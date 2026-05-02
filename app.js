/* ============================================================
   ARCHIVA — app.js  v2
   Document Intelligence Platform
============================================================ */

'use strict';

// ── STATE ──────────────────────────────────────────────────
const state = {
  provider: 'claude',
  apiKey: '',
  connected: false,
  docType: 'Contrat commercial',
  emailProvider: 'gmail',
  storageProvider: 'gdrive',
  selectedStorageFiles: new Set(),
  charts: [],
};

// ── INIT ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Restore API key from session
  const saved = sessionStorage.getItem('archiva_key');
  const savedProv = sessionStorage.getItem('archiva_provider');
  if (saved) {
    state.apiKey = saved;
    state.provider = savedProv || 'claude';
    document.getElementById('apiKeyInput').value = saved;
    selectProvider(state.provider, false);
    setApiStatus('ok', 'Clé restaurée');
    state.connected = true;
    document.getElementById('apiCard').classList.add('connected');
  }

  // Cookie banner
  if (!localStorage.getItem('archiva_cookies')) {
    document.getElementById('cookieBanner').classList.remove('hidden');
  } else {
    document.getElementById('cookieBanner').classList.add('hidden');
  }

  // Navbar scroll effect
  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 20);
  });

  // Doc type chip selection
  document.getElementById('docTypeGrid').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#docTypeGrid .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.docType = chip.dataset.type;
  });
});

// ── NAVIGATION ─────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');

  const link = document.querySelector(`.nav-link[data-page="${name}"]`);
  if (link) link.classList.add('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobile() {
  const nav = document.getElementById('mobileNav');
  const btn = document.getElementById('hamburger');
  nav.classList.toggle('open');
  btn.classList.toggle('open');
}

// ── API CONNECTION ─────────────────────────────────────────
function selectProvider(name, updateUI = true) {
  state.provider = name;
  if (updateUI) {
    document.querySelectorAll('.prov-pill').forEach(p => p.classList.remove('active'));
    const pill = document.getElementById('pill-' + name);
    if (pill) pill.classList.add('active');
    const inp = document.getElementById('apiKeyInput');
    inp.placeholder = name === 'claude'
      ? 'sk-ant-api03-…'
      : 'Votre clé Mistral AI…';
  }
}

async function connectApi() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) { showApiResult('err', 'Veuillez entrer une clé API.'); return; }

  setApiStatus('loading', 'Vérification…');
  showApiResult('', '');

  try {
    let ok = false;
    if (state.provider === 'claude') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      ok = res.ok || res.status === 400;
    } else {
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'mistral-large-latest',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      ok = res.ok || res.status === 400;
    }

    if (ok) {
      state.apiKey = key;
      state.connected = true;
      sessionStorage.setItem('archiva_key', key);
      sessionStorage.setItem('archiva_provider', state.provider);
      setApiStatus('ok', 'Connecté');
      document.getElementById('apiCard').classList.add('connected');
      showApiResult('ok', '✓ Connexion réussie ! Tous les modules sont disponibles.');
    } else {
      throw new Error('Clé invalide');
    }
  } catch {
    setApiStatus('err', 'Erreur');
    state.connected = false;
    showApiResult('err', '✗ Clé invalide ou erreur réseau. Vérifiez votre clé et réessayez.');
  }
}

function setApiStatus(type, text) {
  const dot  = document.getElementById('statusDot');
  const span = document.getElementById('statusText');
  dot.className  = 'status-dot' + (type ? ' ' + type : '');
  span.textContent = text;
}

function showApiResult(type, msg) {
  const el = document.getElementById('apiResult');
  if (!type) { el.style.display = 'none'; return; }
  el.className = 'api-result ' + type;
  el.textContent = msg;
  el.style.display = 'block';
}

// ── PANEL SWITCHING ────────────────────────────────────────
function switchPanel(name) {
  document.querySelectorAll('.f-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.fnav').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  document.getElementById('fnav-'  + name).classList.add('active');
}

function switchDataTab(name) {
  ['upload', 'paste'].forEach(t => {
    document.getElementById('dtab-' + t).classList.toggle('active', t === name);
    document.getElementById('dtab-content-' + t).style.display = t === name ? '' : 'none';
  });
}

// ── FILE HANDLING ──────────────────────────────────────────
function handleDrag(e, zoneId) {
  e.preventDefault();
  document.getElementById(zoneId).classList.add('drag-over');
}
function handleDragLeave(e, zoneId) {
  document.getElementById(zoneId).classList.remove('drag-over');
}
function handleDrop(e, listId) {
  e.preventDefault();
  const zoneId = e.currentTarget.id;
  document.getElementById(zoneId).classList.remove('drag-over');
  renderFileList(Array.from(e.dataTransfer.files), listId);
}
function handleFileSelect(e, listId) {
  renderFileList(Array.from(e.target.files), listId);
}

function renderFileList(files, listId) {
  const container = document.getElementById(listId);
  container.innerHTML = '';
  files.forEach((f, i) => {
    const ext = f.name.split('.').pop().toLowerCase();
    const ico = { pdf: '📄', docx: '📝', xlsx: '📊', csv: '📋', txt: '📃' }[ext] || '📎';
    const div = document.createElement('div');
    div.className = 'file-item';
    div.dataset.index = i;
    div.innerHTML = `
      <span class="file-ico">${ico}</span>
      <span class="file-name">${f.name}</span>
      <span class="file-sz">${formatSize(f.size)}</span>
      <button class="file-rm" onclick="this.closest('.file-item').remove()">✕</button>`;
    div._file = f;
    container.appendChild(div);
  });
  container._files = files;
}

function formatSize(b) {
  if (b < 1024) return b + ' o';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' Ko';
  return (b / 1024 / 1024).toFixed(1) + ' Mo';
}

async function readFileText(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'txt' || ext === 'csv') return file.text();
  if (ext === 'pdf')  return readPdf(file);
  if (ext === 'docx') return readDocx(file);
  if (ext === 'xlsx') return readXlsx(file);
  return file.text();
}

async function readPdf(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(s => s.str).join(' ') + '\n';
  }
  return text;
}

async function readDocx(file) {
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return result.value;
}

function readXlsx(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary' });
        let text = '';
        wb.SheetNames.forEach(name => {
          text += `=== ${name} ===\n`;
          text += XLSX.utils.sheet_to_csv(wb.Sheets[name]) + '\n\n';
        });
        resolve(text);
      } catch (err) { reject(err); }
    };
    reader.readAsBinaryString(file);
  });
}

// ── AI CALL ────────────────────────────────────────────────
async function callAI(prompt, maxTokens = 2048) {
  if (!state.connected || !state.apiKey) {
    throw new Error('Veuillez d\'abord connecter votre clé API dans l\'Espace IA.');
  }

  if (state.provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': state.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Erreur API Claude');
    }
    const data = await res.json();
    return data.content[0].text;
  } else {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + state.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Erreur API Mistral');
    }
    const data = await res.json();
    return data.choices[0].message.content;
  }
}

function showLoading(containerId, steps = []) {
  const el = document.getElementById(containerId);
  const stepsHtml = steps.map((s, i) => `
    <div class="ls-row" id="step-${i}">
      <div class="ls-dot ${i === 0 ? 'on' : ''}"></div>
      <span>${s}</span>
    </div>`).join('');
  el.style.display = 'block';
  el.querySelector('.output-body, #' + containerId.replace('Output', 'Content'))?.remove?.();
  el.innerHTML = `
    <div class="output-bar">
      <span class="output-lbl">Traitement en cours…</span>
    </div>
    <div class="loading-box">
      <div class="loading-ring"></div>
      <h3>L'IA analyse votre demande</h3>
      <p>Cela prend généralement 5 à 30 secondes</p>
      ${stepsHtml ? `<div class="loading-steps">${stepsHtml}</div>` : ''}
    </div>`;
}

function advanceStep(i) {
  const prev = document.getElementById('step-' + (i - 1));
  const curr = document.getElementById('step-' + i);
  if (prev) prev.querySelector('.ls-dot').className = 'ls-dot done';
  if (curr) curr.querySelector('.ls-dot').className = 'ls-dot on';
}

// ── MODULE 1: GÉNÉRATION ───────────────────────────────────
async function generateDoc() {
  if (!checkConnection()) return;

  const type    = state.docType;
  const company = document.getElementById('genCompany').value.trim();
  const lang    = document.getElementById('genLang').value;
  const instr   = document.getElementById('genInstructions').value.trim();
  const length  = document.getElementById('genLength').value;

  const outputBox = document.getElementById('genOutput');
  showLoading('genOutput', [
    'Analyse de votre demande',
    'Structuration du document',
    'Rédaction par l\'IA',
    'Mise en forme finale',
  ]);

  const prompt = `Tu es un expert en rédaction professionnelle. Génère un(e) ${type} professionnel(le) en ${lang}.

Contexte entreprise : ${company || 'Non précisé'}
Longueur souhaitée : ${length}
Instructions : ${instr || 'Document standard professionnel'}

Génère un document complet, structuré avec titres (## pour H2, ### pour H3), bien formaté en Markdown.
Inclus toutes les sections nécessaires pour un document professionnel de ce type.
Sois précis, professionnel et complet.`;

  try {
    advanceStep(1);
    setTimeout(() => advanceStep(2), 800);
    const result = await callAI(prompt, 3000);
    advanceStep(3);

    outputBox.innerHTML = `
      <div class="output-bar">
        <span class="output-lbl">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          ${type} généré
        </span>
        <div class="output-acts">
          <button class="btn btn-sm btn-ghost" onclick="copyOutput('genContent')">📋 Copier</button>
          <button class="btn btn-sm btn-primary" onclick="exportPdf('genContent')">⬇️ PDF</button>
        </div>
      </div>
      <div class="output-body" id="genContent">${markdownToHtml(result)}</div>`;
    outputBox.style.display = 'block';
    outputBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    showError('genOutput', err.message);
  }
}

// ── MODULE 2: EXTRACTION ───────────────────────────────────
async function runExtraction() {
  if (!checkConnection()) return;

  const mode = document.getElementById('extractMode').value;
  let text = '';

  const tab = document.querySelector('.dtab.active')?.id;
  if (tab === 'dtab-paste') {
    text = document.getElementById('extractPasteText').value.trim();
    if (!text) { showNotif('Veuillez coller du texte à analyser.'); return; }
  } else {
    const container = document.getElementById('extractFiles');
    const items = container.querySelectorAll('.file-item');
    if (!items.length) { showNotif('Veuillez importer au moins un fichier.'); return; }

    showLoading('extractOutput', [
      'Lecture des fichiers',
      'Extraction du contenu',
      'Analyse par l\'IA',
      'Génération du résumé',
    ]);

    try {
      const texts = [];
      for (const item of items) {
        const file = container._files?.[parseInt(item.dataset.index)];
        if (file) {
          advanceStep(0);
          texts.push(`=== ${file.name} ===\n` + await readFileText(file));
        }
      }
      text = texts.join('\n\n---\n\n');
    } catch (err) {
      showError('extractOutput', 'Erreur de lecture : ' + err.message);
      return;
    }
  }

  if (!document.getElementById('extractOutput').querySelector('.loading-box')) {
    showLoading('extractOutput', [
      'Analyse du contenu',
      'Extraction des données',
      'Formulation du résumé',
    ]);
  }

  const prompt = `Tu es un expert en analyse documentaire. Effectue une ${mode} du document suivant.

Réponds en Markdown structuré avec des sections claires (##), des listes à puces et des données mises en valeur en **gras**.

DOCUMENT :
${text.slice(0, 12000)}`;

  try {
    advanceStep(1);
    const result = await callAI(prompt, 2500);

    document.getElementById('extractOutput').innerHTML = `
      <div class="output-bar">
        <span class="output-lbl">Résultats de l'analyse</span>
        <div class="output-acts">
          <button class="btn btn-sm btn-ghost" onclick="copyOutput('extractContent')">📋 Copier</button>
          <button class="btn btn-sm btn-primary" onclick="exportPdf('extractContent')">⬇️ PDF</button>
        </div>
      </div>
      <div class="output-body" id="extractContent">${markdownToHtml(result)}</div>`;
    document.getElementById('extractOutput').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    showError('extractOutput', err.message);
  }
}

// ── MODULE 3: ANALYSE & GRAPHIQUES ────────────────────────
async function runAnalysis() {
  if (!checkConnection()) return;

  const type    = document.getElementById('analysisType').value;
  const context = document.getElementById('analysisContext').value.trim();
  const container = document.getElementById('analysisFiles');
  const items = container.querySelectorAll('.file-item');

  if (!items.length) { showNotif('Veuillez importer au moins un fichier de données.'); return; }

  showLoading('analysisOutput', [
    'Lecture des données',
    'Analyse statistique',
    'Génération du rapport',
    'Création des graphiques',
  ]);

  let dataText = '';
  try {
    for (const item of items) {
      const file = container._files?.[parseInt(item.dataset.index)];
      if (file) dataText += `=== ${file.name} ===\n` + await readFileText(file) + '\n\n';
    }
  } catch (err) {
    showError('analysisOutput', 'Erreur de lecture : ' + err.message);
    return;
  }

  advanceStep(1);

  const prompt = `Tu es un analyste de données expert. Réalise une ${type}.

Contexte / Objectif : ${context || 'Analyse générale'}

DONNÉES :
${dataText.slice(0, 12000)}

Produis un rapport complet en Markdown avec :
1. ## Synthèse exécutive (3-5 points clés en bullet points)
2. ## Analyse détaillée (sections par thématique)
3. ## Données clés (tableau markdown avec chiffres importants)
4. ## Tendances identifiées
5. ## Recommandations stratégiques
6. ## Données graphiques JSON

Pour la section "Données graphiques JSON", fournis EXACTEMENT ce format JSON valide à la fin de ta réponse, délimité par \`\`\`chartdata et \`\`\` :
\`\`\`chartdata
{
  "charts": [
    {
      "type": "bar",
      "title": "Titre du graphique 1",
      "labels": ["Label1","Label2","Label3","Label4"],
      "data": [100,200,150,300],
      "color": "orange"
    },
    {
      "type": "line",
      "title": "Titre du graphique 2",
      "labels": ["Jan","Fév","Mar","Avr","Mai"],
      "data": [10,25,18,35,28],
      "color": "blue"
    },
    {
      "type": "doughnut",
      "title": "Répartition",
      "labels": ["A","B","C"],
      "data": [40,35,25],
      "color": "mixed"
    }
  ]
}
\`\`\``;

  try {
    advanceStep(2);
    const result = await callAI(prompt, 3500);
    advanceStep(3);

    const chartMatch = result.match(/```chartdata\s*([\s\S]*?)```/);
    const reportText = result.replace(/```chartdata[\s\S]*?```/, '').trim();

    document.getElementById('analysisOutput').innerHTML = `
      <div class="output-bar">
        <span class="output-lbl">📊 Rapport d'analyse</span>
        <div class="output-acts">
          <button class="btn btn-sm btn-ghost" onclick="copyOutput('analysisContent')">📋 Copier</button>
          <button class="btn btn-sm btn-primary" onclick="exportFullReport()">⬇️ PDF complet</button>
        </div>
      </div>
      <div class="output-body" id="analysisContent">${markdownToHtml(reportText)}</div>
      <div id="chartsArea" style="padding:1.25rem 1.5rem;border-top:1px solid var(--border)"></div>`;

    if (chartMatch) {
      try {
        const chartData = JSON.parse(chartMatch[1].trim());
        renderCharts(chartData.charts || []);
      } catch { /* silently skip bad JSON */ }
    }

    document.getElementById('analysisOutput').style.display = 'block';
    document.getElementById('analysisOutput').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    showError('analysisOutput', err.message);
  }
}

function renderCharts(charts) {
  const area = document.getElementById('chartsArea');
  if (!charts.length) return;

  // Destroy previous charts
  state.charts.forEach(c => c.destroy());
  state.charts = [];

  const grid = document.createElement('div');
  grid.className = 'charts-grid';

  const palette = {
    orange: ['rgba(249,115,22,.8)', 'rgba(251,146,60,.6)', 'rgba(234,88,12,.5)'],
    blue:   ['rgba(99,102,241,.8)', 'rgba(129,140,248,.6)', 'rgba(67,56,202,.5)'],
    green:  ['rgba(34,197,94,.8)',  'rgba(74,222,128,.6)',  'rgba(22,163,74,.5)'],
    mixed:  ['rgba(249,115,22,.8)', 'rgba(99,102,241,.8)', 'rgba(34,197,94,.8)',
             'rgba(245,158,11,.8)', 'rgba(239,68,68,.8)'],
  };

  charts.forEach((ch, i) => {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = `<h4>${ch.title || 'Graphique ' + (i+1)}</h4><canvas id="chart-${i}"></canvas>`;
    grid.appendChild(card);

    requestAnimationFrame(() => {
      const ctx = document.getElementById('chart-' + i)?.getContext('2d');
      if (!ctx) return;
      const colors = palette[ch.color] || palette.orange;

      const datasets = [{
        label: ch.title || '',
        data: ch.data || [],
        backgroundColor: ch.type === 'line' ? 'transparent' : colors,
        borderColor: ch.type === 'line' ? colors[0] : colors,
        borderWidth: ch.type === 'line' ? 2.5 : 1,
        borderRadius: ch.type === 'bar' ? 6 : 0,
        tension: 0.4,
        fill: ch.type === 'line',
        pointRadius: ch.type === 'line' ? 4 : 0,
        pointBackgroundColor: colors[0],
      }];

      const instance = new Chart(ctx, {
        type: ch.type || 'bar',
        data: { labels: ch.labels || [], datasets },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: ch.type === 'doughnut' || ch.type === 'pie',
              labels: { color: '#94a3b8', font: { size: 11 } } },
          },
          scales: (ch.type === 'bar' || ch.type === 'line') ? {
            x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.04)' } },
            y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.06)' } },
          } : {},
        },
      });
      state.charts.push(instance);
    });
  });

  area.appendChild(grid);
}

// ── MODULE 4: EMAIL ────────────────────────────────────────
function selectEmailProvider(name) {
  state.emailProvider = name;
  document.querySelectorAll('[id^="eprov-"]').forEach(el => el.classList.remove('active'));
  document.getElementById('eprov-' + name).classList.add('active');
  document.getElementById('emailConfigGmail').style.display   = name === 'gmail'   ? '' : 'none';
  document.getElementById('emailConfigOutlook').style.display = name === 'outlook' ? '' : 'none';
}

async function connectEmail() {
  if (!checkConnection()) return;

  const count = parseInt(document.getElementById('emailCount').value);
  let emails = [];

  try {
    if (state.emailProvider === 'gmail') {
      emails = await fetchGmailEmails(count);
    } else {
      emails = await fetchOutlookEmails(count);
    }
    renderEmails(emails);
  } catch (err) {
    showNotif('Erreur de connexion email : ' + err.message);
  }
}

async function fetchGmailEmails(count) {
  const token = document.getElementById('gmailToken').value.trim();
  if (!token) throw new Error('Access Token Gmail requis');

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${count}&labelIds=INBOX`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (!listRes.ok) throw new Error('Token Gmail invalide ou expiré');

  const listData = await listRes.json();
  const messages = listData.messages || [];
  const emails = [];

  for (const msg of messages.slice(0, count)) {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (!res.ok) continue;
    const data = await res.json();
    const headers = {};
    (data.payload?.headers || []).forEach(h => { headers[h.name] = h.value; });
    emails.push({
      id: msg.id,
      from: headers.From || 'Inconnu',
      subject: headers.Subject || '(Sans objet)',
      date: headers.Date || '',
      snippet: data.snippet || '',
      unread: (data.labelIds || []).includes('UNREAD'),
    });
  }
  return emails;
}

async function fetchOutlookEmails(count) {
  const token = document.getElementById('outlookToken').value.trim();
  if (!token) throw new Error('Access Token Outlook requis');

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=${count}&$select=from,subject,receivedDateTime,bodyPreview,isRead`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (!res.ok) throw new Error('Token Outlook invalide ou expiré');

  const data = await res.json();
  return (data.value || []).map(m => ({
    id: m.id,
    from: m.from?.emailAddress?.address || 'Inconnu',
    subject: m.subject || '(Sans objet)',
    date: m.receivedDateTime || '',
    snippet: m.bodyPreview || '',
    unread: !m.isRead,
  }));
}

function renderEmails(emails) {
  const wrap = document.getElementById('emailsWrap');
  const list = document.getElementById('emailsList');
  list.innerHTML = '';

  if (!emails.length) {
    list.innerHTML = '<p style="color:var(--t500);font-size:.875rem;padding:.5rem">Aucun email trouvé.</p>';
    wrap.style.display = 'block';
    return;
  }

  emails.forEach(email => {
    const row = document.createElement('div');
    row.className = 'email-row' + (email.unread ? ' unread' : '');
    const dateStr = email.date ? new Date(email.date).toLocaleDateString('fr-FR') : '';
    row.innerHTML = `
      <div class="email-top">
        <span class="email-from">${escHtml(email.from)}</span>
        <span class="email-date">${dateStr}</span>
      </div>
      <div class="email-subj">${escHtml(email.subject)}</div>
      <div class="email-prev">${escHtml(email.snippet.slice(0, 100))}…</div>
      <div class="email-acts">
        <button class="btn btn-sm btn-ghost" onclick="summarizeEmail(this)"
          data-subj="${encodeURIComponent(email.subject)}"
          data-body="${encodeURIComponent(email.snippet)}">
          🤖 Résumer
        </button>
      </div>`;
    list.appendChild(row);
  });

  wrap.style.display = 'block';
}

async function summarizeEmail(btn) {
  const subj = decodeURIComponent(btn.dataset.subj);
  const body = decodeURIComponent(btn.dataset.body);
  btn.disabled = true;
  btn.textContent = '⏳ Analyse…';

  try {
    const result = await callAI(
      `Résume cet email en français en 3 points clés maximum et propose une réponse courte si nécessaire.\n\nSujet: ${subj}\nContenu: ${body}`,
      500
    );
    const row = btn.closest('.email-row');
    const existing = row.querySelector('.email-summary');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.className = 'email-summary';
    div.style.cssText = 'margin-top:.6rem;padding:.6rem .75rem;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);border-radius:8px;font-size:.8rem;color:var(--t300);line-height:1.55';
    div.innerHTML = markdownToHtml(result);
    row.appendChild(div);
  } catch (err) {
    showNotif(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🤖 Résumer';
  }
}

// ── MODULE 5: STOCKAGE ─────────────────────────────────────
function selectStorageProvider(name) {
  state.storageProvider = name;
  document.querySelectorAll('[id^="sprov-"]').forEach(el => el.classList.remove('active'));
  document.getElementById('sprov-' + name).classList.add('active');
  document.getElementById('storageConfigGdrive').style.display   = name === 'gdrive'   ? '' : 'none';
  document.getElementById('storageConfigDropbox').style.display  = name === 'dropbox'  ? '' : 'none';
  document.getElementById('storageConfigOnedrive').style.display = name === 'onedrive' ? '' : 'none';
}

async function connectStorage() {
  if (!checkConnection()) return;

  try {
    let files = [];
    if (state.storageProvider === 'gdrive')   files = await listGDriveFiles();
    if (state.storageProvider === 'dropbox')  files = await listDropboxFiles();
    if (state.storageProvider === 'onedrive') files = await listOneDriveFiles();
    renderStorageFiles(files);
  } catch (err) {
    showNotif('Erreur connexion stockage : ' + err.message);
  }
}

async function listGDriveFiles() {
  const token    = document.getElementById('gdriveToken').value.trim();
  const folderId = document.getElementById('gdriveFolderId').value.trim();
  if (!token) throw new Error('Access Token Google Drive requis');
  const q = folderId ? `'${folderId}' in parents` : "'root' in parents";
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,size,mimeType,modifiedTime)&pageSize=50`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (!res.ok) throw new Error('Token Drive invalide ou expiré');
  const data = await res.json();
  return (data.files || []).map(f => ({
    id: f.id, name: f.name,
    size: f.size ? formatSize(parseInt(f.size)) : '—',
    type: f.mimeType, source: 'gdrive',
  }));
}

async function listDropboxFiles() {
  const token = document.getElementById('dropboxToken').value.trim();
  const path  = document.getElementById('dropboxPath').value.trim() || '';
  if (!token) throw new Error('Access Token Dropbox requis');
  const res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: path || '', recursive: false }),
  });
  if (!res.ok) throw new Error('Token Dropbox invalide ou expiré');
  const data = await res.json();
  return (data.entries || []).filter(e => e['.tag'] === 'file').map(f => ({
    id: f.id, name: f.name,
    size: f.size ? formatSize(f.size) : '—',
    type: f.name.split('.').pop(), source: 'dropbox',
  }));
}

async function listOneDriveFiles() {
  const token = document.getElementById('onedriveToken').value.trim();
  if (!token) throw new Error('Access Token OneDrive requis');
  const res = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,size,file,lastModifiedDateTime', {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!res.ok) throw new Error('Token OneDrive invalide ou expiré');
  const data = await res.json();
  return (data.value || []).filter(f => f.file).map(f => ({
    id: f.id, name: f.name,
    size: f.size ? formatSize(f.size) : '—',
    type: f.name.split('.').pop(), source: 'onedrive',
  }));
}

function renderStorageFiles(files) {
  const wrap = document.getElementById('storageWrap');
  const list = document.getElementById('storageList');
  state.selectedStorageFiles.clear();
  list.innerHTML = '';

  if (!files.length) {
    list.innerHTML = '<p style="color:var(--t500);font-size:.875rem">Aucun fichier trouvé.</p>';
    wrap.style.display = 'block';
    return;
  }

  files.forEach(file => {
    const ext = file.name.split('.').pop().toLowerCase();
    const ico = { pdf: '📄', docx: '📝', xlsx: '📊', csv: '📋', txt: '📃' }[ext] || '📎';
    const row = document.createElement('div');
    row.className = 'storage-row';
    row.innerHTML = `
      <input type="checkbox" style="accent-color:var(--orange)" onchange="toggleStorageFile('${file.id}',this)">
      <span class="storage-ico">${ico}</span>
      <span class="storage-name">${escHtml(file.name)}</span>
      <span class="storage-sz">${file.size}</span>
      <div class="storage-acts">
        <button class="btn btn-sm btn-ghost" onclick="analyzeStorageFile('${encodeURIComponent(file.name)}','${file.id}','${file.source}')">
          🔍 Analyser
        </button>
      </div>`;
    list.appendChild(row);
  });
  wrap.style.display = 'block';
}

function toggleStorageFile(id, cb) {
  if (cb.checked) state.selectedStorageFiles.add(id);
  else state.selectedStorageFiles.delete(id);
}

async function analyzeStorageFile(encodedName, fileId, source) {
  if (!checkConnection()) return;
  const name = decodeURIComponent(encodedName);
  showNotif(`Analyse de "${name}" en cours…`);
  const prompt = `Analyse ce fichier cloud nommé "${name}" (source: ${source}).
Fournis un résumé exécutif en Markdown avec les points clés attendus pour ce type de fichier.
Note: le contenu exact n'est pas accessible directement, mais propose une structure d'analyse et des recommandations basées sur le nom du fichier.`;
  try {
    const result = await callAI(prompt, 1000);
    document.getElementById('storageOutput').innerHTML = `
      <div class="output-bar">
        <span class="output-lbl">📂 Analyse — ${escHtml(name)}</span>
        <div class="output-acts">
          <button class="btn btn-sm btn-ghost" onclick="copyOutput('storageContent')">📋 Copier</button>
          <button class="btn btn-sm btn-primary" onclick="exportPdf('storageContent')">⬇️ PDF</button>
        </div>
      </div>
      <div class="output-body" id="storageContent">${markdownToHtml(result)}</div>`;
    document.getElementById('storageOutput').style.display = 'block';
    document.getElementById('storageOutput').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    showNotif(err.message);
  }
}

async function analyzeSelectedFiles() {
  if (!state.selectedStorageFiles.size) {
    showNotif('Sélectionnez au moins un fichier pour l\'analyse.');
    return;
  }
  showNotif(`Analyse de ${state.selectedStorageFiles.size} fichier(s)…`);
}

// ── EXPORT & COPY ──────────────────────────────────────────
function copyOutput(id) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.innerText).then(() => showNotif('✓ Copié dans le presse-papiers'));
}

async function exportPdf(contentId) {
  const el = document.getElementById(contentId);
  if (!el) return;

  showNotif('Génération du PDF…');
  try {
    const canvas = await html2canvas(el, {
      backgroundColor: '#050c1a',
      scale: 2,
      useCORS: true,
    });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const w = pdf.internal.pageSize.getWidth();
    const h = canvas.height * w / canvas.width;
    const pageH = pdf.internal.pageSize.getHeight();
    let y = 0;

    while (y < h) {
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width  = canvas.width;
      sliceCanvas.height = Math.min(canvas.height, (pageH * canvas.width) / w);
      const ctx = sliceCanvas.getContext('2d');
      ctx.drawImage(canvas, 0, -(y * canvas.width / w), canvas.width, canvas.height);
      pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 0, 0, w, Math.min(pageH, h - y));
      y += pageH;
      if (y < h) pdf.addPage();
    }

    pdf.save('archiva-document.pdf');
    showNotif('✓ PDF téléchargé');
  } catch {
    showNotif('Erreur lors de la génération du PDF.');
  }
}

async function exportFullReport() {
  const analysisEl = document.getElementById('analysisContent');
  const chartsEl   = document.getElementById('chartsArea');
  if (!analysisEl) return;

  showNotif('Génération du rapport PDF…');
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'background:#050c1a;padding:2rem;color:#e2e8f0;font-family:Inter,sans-serif';
  wrapper.appendChild(analysisEl.cloneNode(true));
  if (chartsEl) wrapper.appendChild(chartsEl.cloneNode(true));
  document.body.appendChild(wrapper);

  try {
    const canvas = await html2canvas(wrapper, { backgroundColor: '#050c1a', scale: 2, useCORS: true });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const w = pdf.internal.pageSize.getWidth();
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, canvas.height * w / canvas.width);
    pdf.save('archiva-rapport.pdf');
    showNotif('✓ Rapport PDF téléchargé');
  } catch {
    showNotif('Erreur lors de l\'export.');
  } finally {
    document.body.removeChild(wrapper);
  }
}

// ── CONTACT FORM ───────────────────────────────────────────
function submitContact() {
  const firstname = document.getElementById('cFirstname').value.trim();
  const lastname  = document.getElementById('cLastname').value.trim();
  const email     = document.getElementById('cEmail').value.trim();
  const subject   = document.getElementById('cSubject').value;
  const message   = document.getElementById('cMessage').value.trim();
  const rgpd      = document.getElementById('cRgpd').checked;

  if (!firstname || !lastname) { showNotif('Veuillez renseigner votre prénom et nom.'); return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showNotif('Veuillez entrer un email valide.'); return; }
  if (!subject)  { showNotif('Veuillez sélectionner un sujet.'); return; }
  if (!message)  { showNotif('Veuillez écrire votre message.'); return; }
  if (!rgpd)     { showNotif('Veuillez accepter la politique de confidentialité.'); return; }

  document.getElementById('contactFormArea').style.display = 'none';
  document.getElementById('successEmail').textContent = email;
  document.getElementById('contactSuccess').style.display = 'flex';

  const mailtoLink = `mailto:a.e.l.corporation@hotmail.com?subject=${encodeURIComponent('[Archiva] ' + subject + ' — ' + firstname + ' ' + lastname)}&body=${encodeURIComponent(`Prénom : ${firstname}\nNom : ${lastname}\nEmail : ${email}\nTéléphone : ${document.getElementById('cPhone').value}\nEntreprise : ${document.getElementById('cCompany').value}\n\n${message}`)}`;
  window.location.href = mailtoLink;
}

function resetContact() {
  document.getElementById('cFirstname').value = '';
  document.getElementById('cLastname').value  = '';
  document.getElementById('cEmail').value     = '';
  document.getElementById('cPhone').value     = '';
  document.getElementById('cCompany').value   = '';
  document.getElementById('cSubject').value   = '';
  document.getElementById('cMessage').value   = '';
  document.getElementById('cRgpd').checked    = false;
  document.getElementById('contactFormArea').style.display = '';
  document.getElementById('contactSuccess').style.display  = 'none';
}

// ── MODALS ─────────────────────────────────────────────────
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('open');
}
function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// ── COOKIES ────────────────────────────────────────────────
function acceptCookies() {
  localStorage.setItem('archiva_cookies', 'all');
  hideCookieBanner();
}
function rejectCookies() {
  localStorage.setItem('archiva_cookies', 'essential');
  hideCookieBanner();
}
function hideCookieBanner() {
  document.getElementById('cookieBanner').classList.add('hidden');
}
function toggleCookie(el) {
  if (el.classList.contains('disabled')) return;
  el.classList.toggle('on');
}
function saveCookiePrefs() {
  const analytics = document.getElementById('togAnalytics').classList.contains('on');
  const prefs     = document.getElementById('togPrefs').classList.contains('on');
  localStorage.setItem('archiva_cookies', JSON.stringify({ analytics, prefs }));
  closeModal('modalCookies');
  hideCookieBanner();
  showNotif('✓ Préférences sauvegardées');
}
function acceptAllCookies() {
  document.getElementById('togAnalytics').classList.add('on');
  document.getElementById('togPrefs').classList.add('on');
  saveCookiePrefs();
}

// ── FAQ ────────────────────────────────────────────────────
function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
  if (!isOpen) item.classList.add('open');
}

// ── HELPERS ────────────────────────────────────────────────
function checkConnection() {
  if (!state.connected || !state.apiKey) {
    showPage('ai');
    setTimeout(() => showNotif('⚠️ Veuillez connecter votre clé API pour utiliser cette fonctionnalité.'), 300);
    return false;
  }
  return true;
}

function showError(boxId, msg) {
  const box = document.getElementById(boxId);
  box.innerHTML = `
    <div class="output-bar"><span class="output-lbl" style="color:var(--red)">⚠️ Erreur</span></div>
    <div class="loading-box">
      <div style="font-size:2.5rem">⚠️</div>
      <h3 style="color:var(--red)">Une erreur est survenue</h3>
      <p>${escHtml(msg)}</p>
      <p style="font-size:.8rem;color:var(--t500)">Vérifiez votre clé API et réessayez.</p>
    </div>`;
  box.style.display = 'block';
}

let _notifTimeout;
function showNotif(msg) {
  let notif = document.getElementById('globalNotif');
  if (!notif) {
    notif = document.createElement('div');
    notif.id = 'globalNotif';
    notif.style.cssText = `
      position:fixed;top:80px;right:1.25rem;z-index:3000;
      background:rgba(11,22,40,.97);border:1px solid rgba(249,115,22,.3);
      color:var(--t100);font-size:.85rem;font-weight:500;
      padding:.7rem 1.25rem;border-radius:10px;
      box-shadow:0 8px 32px rgba(0,0,0,.5);backdrop-filter:blur(12px);
      transition:opacity .3s ease;max-width:320px;line-height:1.4;`;
    document.body.appendChild(notif);
  }
  notif.textContent = msg;
  notif.style.opacity = '1';
  clearTimeout(_notifTimeout);
  _notifTimeout = setTimeout(() => { notif.style.opacity = '0'; }, 3500);
}

function markdownToHtml(md) {
  if (!md) return '';
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^---$/gm, '<hr>')
    .replace(/^\> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^\| (.+) \|$/gm, (_, row) => {
      const cells = row.split(' | ');
      return '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
    })
    .replace(/(<tr>.*<\/tr>\n?)+/g, m => `<table>${m}</table>`)
    .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^(?!<[htupbcl])(.+)$/gm, (m) => m ? m : '')
    .replace(/<p><\/p>/g, '')
    .replace(/((?!<).+(?!>))/s, m => m.trim() ? `<p>${m}</p>` : m);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
