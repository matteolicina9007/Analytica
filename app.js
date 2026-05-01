/* ===================================================================
   ARCHIVA — app.js
   SaaS Document Intelligence Platform
   All features: generation, extraction, analysis, email, storage
=================================================================== */

'use strict';

/* ───── STATE ───── */
const S = {
  page:      'home',
  feature:   'generation',
  provider:  'claude',
  apiKey:    '',
  connected: false,
  docType:   'Contrat de travail',
  extType:   'résumé exécutif complet',
  anaType:   'financière',
  emailProv: 'gmail',
  storeProv: 'dropbox',
  emailConnected: false,
  storageConnected: false,
  extractionFiles: [],
  analysisFiles:   [],
  emailContent:    '',
  storageContent:  '',
  activeCharts: [],
};

/* ═══════════════════════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════════════════════════ */
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  if (pg) { pg.classList.add('active'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  const nl = document.getElementById('nl-' + name);
  if (nl) nl.classList.add('active');
  S.page = name;
}

function switchFeature(name) {
  document.querySelectorAll('.feature-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.fnav-btn').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');
  const btn = document.getElementById('fnav-' + name);
  if (btn) btn.classList.add('active');
  S.feature = name;
  showPage('ai');
}

function toggleMenu() {
  const menu = document.getElementById('mobile-menu');
  const ham  = document.getElementById('hamburger');
  menu.classList.toggle('open');
  ham.classList.toggle('open');
  ham.setAttribute('aria-expanded', menu.classList.contains('open'));
}

/* ═══════════════════════════════════════════════════════════════
   API KEY MANAGEMENT
═══════════════════════════════════════════════════════════════ */
function selectProvider(prov) {
  S.provider = prov;
  document.getElementById('pill-claude').classList.toggle('active', prov === 'claude');
  document.getElementById('pill-mistral').classList.toggle('active', prov === 'mistral');
  const inp = document.getElementById('api-key-input');
  inp.placeholder = prov === 'claude' ? 'sk-ant-api03-...' : 'Votre clé Mistral AI...';
}

function onApiKeyInput() {
  const v = document.getElementById('api-key-input').value.trim();
  if (!v) setApiStatus('idle', 'IA non configurée');
}

async function saveAndTestApiKey() {
  const key = document.getElementById('api-key-input').value.trim();
  if (!key) { showApiResult('error', '⚠️ Veuillez entrer votre clé API.'); return; }
  S.apiKey = key;
  setApiStatus('testing', 'Test de connexion…');
  document.getElementById('btn-connect').textContent = '…';
  document.getElementById('btn-connect').disabled = true;

  try {
    await callAI([{ role: 'user', content: 'Réponds uniquement: OK' }], 10);
    S.connected = true;
    sessionStorage.setItem('archiva_key', key);
    sessionStorage.setItem('archiva_prov', S.provider);
    setApiStatus('ok', `Connecté · ${S.provider === 'claude' ? 'Claude (Anthropic)' : 'Mistral AI'}`);
    showApiResult('ok', `✅ Connexion réussie ! Votre clé ${S.provider === 'claude' ? 'Claude' : 'Mistral'} est active.`);
    document.getElementById('api-config-card').classList.add('connected');
  } catch (e) {
    S.connected = false;
    setApiStatus('error', 'Erreur de connexion');
    showApiResult('error', '❌ Connexion échouée : ' + sanitize(e.message));
  } finally {
    document.getElementById('btn-connect').textContent = 'Connecter';
    document.getElementById('btn-connect').disabled = false;
  }
}

function setApiStatus(state, text) {
  const led  = document.getElementById('status-led');
  const span = document.getElementById('status-text');
  led.className = 'status-led' + (state === 'ok' ? ' ok' : state === 'error' ? ' error' : state === 'testing' ? ' testing' : '');
  span.textContent = text;
}

function showApiResult(type, msg) {
  const el = document.getElementById('api-test-result');
  el.className = 'api-test-result ' + type;
  el.textContent = msg;
  el.style.display = 'block';
  if (type === 'ok') setTimeout(() => el.style.display = 'none', 5000);
}

function requireApiKey() {
  if (!S.apiKey || !S.connected) {
    alert('⚠️ Veuillez d\'abord configurer et connecter votre clé API IA en haut de la page.');
    document.getElementById('api-key-input').focus();
    return false;
  }
  return true;
}

/* ═══════════════════════════════════════════════════════════════
   CORE AI CALL
═══════════════════════════════════════════════════════════════ */
async function callAI(messages, maxTokens = 4096) {
  if (!S.apiKey) throw new Error('Clé API manquante');

  if (S.provider === 'claude') {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': S.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        messages
      })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: { message: resp.statusText } }));
      throw new Error(err.error?.message || resp.statusText);
    }
    const data = await resp.json();
    return data.content[0].text;
  } else {
    const resp = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${S.apiKey}`
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        max_tokens: maxTokens,
        messages
      })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ message: resp.statusText }));
      throw new Error(err.message || err.error?.message || resp.statusText);
    }
    const data = await resp.json();
    return data.choices[0].message.content;
  }
}

/* ═══════════════════════════════════════════════════════════════
   FILE READING
═══════════════════════════════════════════════════════════════ */
async function readFileAsText(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (['txt', 'csv'].includes(ext)) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = () => rej(new Error('Lecture impossible'));
      r.readAsText(file, 'UTF-8');
    });
  }
  if (ext === 'pdf') return await readPDF(file);
  if (['docx', 'doc'].includes(ext)) return await readDOCX(file);
  if (['xlsx', 'xls'].includes(ext)) return await readXLSX(file);
  throw new Error('Format non supporté : ' + ext);
}

async function readPDF(file) {
  if (!window.pdfjsLib) throw new Error('PDF.js non chargé. Veuillez réessayer dans quelques secondes.');
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument(ab).promise;
  let text = '';
  for (let i = 1; i <= Math.min(pdf.numPages, 40); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n';
  }
  return text.trim() || '(PDF sans texte extractible)';
}

async function readDOCX(file) {
  if (!window.mammoth) throw new Error('Mammoth.js non chargé');
  const ab = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: ab });
  return result.value || '(Document vide)';
}

async function readXLSX(file) {
  if (!window.XLSX) throw new Error('SheetJS non chargé');
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: 'array' });
  let text = '';
  wb.SheetNames.forEach(name => {
    const ws = wb.Sheets[name];
    text += `[Feuille: ${name}]\n`;
    text += XLSX.utils.sheet_to_csv(ws) + '\n\n';
  });
  return text.trim();
}

/* ═══════════════════════════════════════════════════════════════
   FILE UI HELPERS
═══════════════════════════════════════════════════════════════ */
function handleDragOver(e, zoneId) {
  e.preventDefault();
  document.getElementById(zoneId)?.classList.add('drag-over');
}

function handleDragLeave(e, zoneId) {
  document.getElementById(zoneId)?.classList.remove('drag-over');
}

function handleDrop(e, inputId, listId) {
  e.preventDefault();
  const zone = e.currentTarget;
  zone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  storeAndDisplayFiles(files, listId);
}

function handleFileInput(e, listId) {
  const files = Array.from(e.target.files);
  storeAndDisplayFiles(files, listId);
}

function storeAndDisplayFiles(files, listId) {
  const listEl = document.getElementById(listId);
  if (!listEl) return;
  const prefix = listId.split('-')[0];
  if (prefix === 'ext') S.extractionFiles = files;
  if (prefix === 'ana') S.analysisFiles  = files;

  listEl.innerHTML = '';
  files.forEach((f, i) => {
    const ext  = f.name.split('.').pop().toUpperCase();
    const size = formatBytes(f.size);
    const div  = document.createElement('div');
    div.className = 'file-item';
    div.innerHTML = `
      <span class="file-item-icon">${fileIcon(ext)}</span>
      <span class="file-item-name">${sanitize(f.name)}</span>
      <span class="file-item-size">${size}</span>
      <button class="file-remove" onclick="removeFile('${listId}',${i})" title="Supprimer">✕</button>`;
    listEl.appendChild(div);
  });
}

function removeFile(listId, idx) {
  const prefix = listId.split('-')[0];
  if (prefix === 'ext') S.extractionFiles.splice(idx, 1);
  if (prefix === 'ana') S.analysisFiles.splice(idx, 1);
  storeAndDisplayFiles(prefix === 'ext' ? S.extractionFiles : S.analysisFiles, listId);
}

function switchDataTab(prefix, tab) {
  const tabs = document.querySelectorAll(`#${prefix}-tabs .dtab, .data-tabs .dtab`);
  // simple approach: find tabs in current panel
  const panel = document.getElementById('panel-' + (prefix === 'ext' ? 'extraction' : 'analysis'));
  if (!panel) return;
  panel.querySelectorAll('.dtab').forEach(t => t.classList.remove('active'));
  const uploadDc = panel.querySelector(`[id$="-dc-upload"], [id$="dc-upload"]`) || document.getElementById(`${prefix}-dc-upload`);
  const textDc   = panel.querySelector(`[id$="-dc-text"], [id$="dc-text"]`)     || document.getElementById(`${prefix}-dc-text`);
  if (tab === 'upload') {
    if (uploadDc) uploadDc.style.display = '';
    if (textDc)   textDc.style.display   = 'none';
  } else {
    if (uploadDc) uploadDc.style.display = 'none';
    if (textDc)   textDc.style.display   = '';
  }
  const clickedBtn = event && event.currentTarget;
  if (clickedBtn) clickedBtn.classList.add('active');
  else {
    panel.querySelectorAll('.dtab')[tab === 'upload' ? 0 : 1]?.classList.add('active');
  }
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE 1 — DOCUMENT GENERATION
═══════════════════════════════════════════════════════════════ */
function selectDocType(el, type) {
  document.querySelectorAll('#doctype-grid .doctype-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  S.docType = type;
}

async function generateDocument() {
  if (!requireApiKey()) return;
  const company      = document.getElementById('gen-company').value.trim();
  const recipient    = document.getElementById('gen-recipient').value.trim();
  const context      = document.getElementById('gen-context').value.trim();
  const lang         = document.getElementById('gen-lang').value;
  const tone         = document.getElementById('gen-tone').value;
  const instructions = document.getElementById('gen-instructions').value.trim();

  if (!context) { alert('Veuillez décrire le contexte et les paramètres du document.'); return; }

  showLoading('gen');
  animateLoadingSteps(['ls-g1','ls-g2','ls-g3'], [1200, 3000]);

  const prompt = `Tu es un expert juridique et rédacteur professionnel francophone.

Génère un document de type : **${S.docType}**

**Informations :**
- Société émettrice : ${company || 'Non précisé'}
- Autre partie / Destinataire : ${recipient || 'Non précisé'}
- Langue : ${lang}
- Ton souhaité : ${tone}

**Contexte et paramètres :**
${context}

${instructions ? `**Instructions supplémentaires :**\n${instructions}` : ''}

**Instructions de rédaction :**
1. Rédige un document complet, professionnel et juridiquement cohérent avec la législation française
2. Structure-le avec des sections claires (titre, parties, articles/clauses, signatures)
3. Utilise des formulations précises et professionnelles adaptées au type de document
4. Inclus toutes les mentions obligatoires légales françaises (RGPD si applicable, mentions légales, etc.)
5. Format Markdown avec titres, sous-titres et liste quand approprié

Rédige le document directement, sans introduction ni conclusion de ta part.`;

  try {
    const result = await callAI([{ role: 'user', content: prompt }], 4096);
    hideLoading('gen');
    showOutput('gen', markdownToHtml(result));
  } catch (e) {
    hideLoading('gen');
    alert('❌ Erreur : ' + e.message);
  }
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE 2 — EXTRACTION & SUMMARY
═══════════════════════════════════════════════════════════════ */
function selectExtType(el, type) {
  document.querySelectorAll('#panel-extraction .doctype-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  S.extType = type;
  const customField = document.getElementById('ext-custom-field');
  if (customField) customField.style.display = type === 'extraction personnalisée' ? '' : 'none';
}

async function runExtraction() {
  if (!requireApiKey()) return;

  let text = '';
  const textArea = document.getElementById('ext-text');
  const textVisible = textArea && textArea.closest('[id$="dc-text"]') && textArea.closest('[id$="dc-text"]').style.display !== 'none';

  if (textVisible) {
    text = textArea.value.trim();
    if (!text) { alert('Veuillez coller du texte à analyser.'); return; }
  } else if (S.extractionFiles.length > 0) {
    try {
      for (const f of S.extractionFiles) {
        text += `\n\n=== ${f.name} ===\n` + await readFileAsText(f);
      }
    } catch (e) {
      alert('❌ Erreur de lecture : ' + e.message); return;
    }
  } else {
    alert('Veuillez importer un fichier ou coller du texte.'); return;
  }

  const customInstr = document.getElementById('ext-custom')?.value.trim() || '';
  const extractType = S.extType === 'extraction personnalisée' && customInstr
    ? customInstr
    : S.extType;

  document.getElementById('ext-loading').style.display = '';
  document.getElementById('ext-output').style.display  = 'none';

  const prompt = `Tu es un expert en analyse documentaire. Effectue une extraction précise du contenu suivant.

**Type d'extraction demandé :** ${extractType}

**Document(s) à analyser :**
${text.substring(0, 12000)}${text.length > 12000 ? '\n[...document tronqué pour la longueur...]' : ''}

**Instructions :**
1. Effectue l'extraction demandée de manière exhaustive et structurée
2. Organise les résultats avec des titres et sous-titres clairs
3. Utilise des tableaux Markdown quand approprié pour les données structurées
4. Mets en gras les informations critiques
5. Si des données sont incomplètes ou illisibles, indique-le explicitement
6. Termine par une note de synthèse globale

Format : Markdown structuré`;

  try {
    const result = await callAI([{ role: 'user', content: prompt }], 4096);
    document.getElementById('ext-loading').style.display = 'none';
    document.getElementById('ext-output').style.display  = '';
    document.getElementById('ext-output-body').innerHTML = markdownToHtml(result);
  } catch (e) {
    document.getElementById('ext-loading').style.display = 'none';
    alert('❌ Erreur : ' + e.message);
  }
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE 3 — ANALYSIS & REPORTS
═══════════════════════════════════════════════════════════════ */
function selectAnaType(el, type) {
  document.querySelectorAll('#panel-analysis .doctype-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  S.anaType = type;
}

async function runAnalysis() {
  if (!requireApiKey()) return;

  const request = document.getElementById('ana-request').value.trim();
  if (!request) { alert('Veuillez décrire votre demande d\'analyse.'); return; }

  let data = '';
  const textArea = document.getElementById('ana-text');
  const textPanel = document.getElementById('ana-dc-text');
  const textVisible = textPanel && textPanel.style.display !== 'none';

  if (textVisible) {
    data = textArea?.value.trim() || '';
    if (!data) { alert('Veuillez coller des données à analyser.'); return; }
  } else if (S.analysisFiles.length > 0) {
    try {
      for (const f of S.analysisFiles) {
        data += `\n\n=== ${f.name} ===\n` + await readFileAsText(f);
      }
    } catch (e) {
      alert('❌ Erreur de lecture : ' + e.message); return;
    }
  } else {
    alert('Veuillez importer un fichier de données ou coller vos données.'); return;
  }

  const depth = document.getElementById('ana-depth').value;

  document.getElementById('ana-loading').style.display = '';
  document.getElementById('ana-output').style.display  = 'none';

  const steps = ['ls-a1','ls-a2','ls-a3','ls-a4'];
  animateLoadingSteps(steps, [1500, 4000, 6000]);
  const msgEl = document.getElementById('ana-loading-msg');
  const msgs = ['Lecture des données…', 'Analyse approfondie en cours…', 'Génération des graphiques…', 'Finalisation du rapport…'];
  msgs.forEach((m, i) => setTimeout(() => { if (msgEl) msgEl.textContent = m; }, i * 2500));

  const prompt = `Tu es un expert analyste d'entreprise senior. Réalise une analyse ${depth} de données.

**Type d'analyse :** ${S.anaType}
**Demande :** ${request}

**Données :**
${data.substring(0, 14000)}${data.length > 14000 ? '\n[...données tronquées...]' : ''}

**Format requis de ta réponse :**

1. **SYNTHÈSE EXÉCUTIVE** (3-5 points clés)
2. **ANALYSE DÉTAILLÉE** (sections thématiques avec causes ET conséquences pour chaque point)
3. **TENDANCES ET ANOMALIES** (avec explication causale)
4. **POINTS FORTS** (ce qui fonctionne bien, pourquoi)
5. **POINTS D'AMÉLIORATION** (problèmes identifiés, causes profondes, conséquences)
6. **PLAN D'ACTION** (recommandations priorisées, délais estimés, impact attendu)
7. **CONCLUSION**

Ensuite, après le rapport textuel, ajoute OBLIGATOIREMENT une section de données pour graphiques entre ces balises exactes :
<CHART_DATA>
{
  "charts": [
    {
      "type": "bar",
      "title": "Titre du graphique 1",
      "labels": ["Label1", "Label2", "Label3", "Label4", "Label5"],
      "datasets": [{"label": "Série 1", "data": [10, 20, 30, 25, 40], "color": "#f97316"}]
    },
    {
      "type": "line",
      "title": "Titre du graphique 2",
      "labels": ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun"],
      "datasets": [{"label": "Évolution", "data": [100, 120, 110, 140, 135, 160], "color": "#3b82f6"}]
    },
    {
      "type": "pie",
      "title": "Titre du graphique 3",
      "labels": ["Part A", "Part B", "Part C", "Part D"],
      "datasets": [{"label": "Répartition", "data": [35, 25, 25, 15]}]
    },
    {
      "type": "bar",
      "title": "Titre du graphique 4",
      "labels": ["Cat 1", "Cat 2", "Cat 3", "Cat 4"],
      "datasets": [{"label": "Comparaison", "data": [80, 65, 90, 75], "color": "#22c55e"}]
    }
  ]
}
</CHART_DATA>

Adapte les données des graphiques aux données réelles analysées. Utilise du Markdown pour le rapport textuel.`;

  try {
    const result = await callAI([{ role: 'user', content: prompt }], 8000);

    document.getElementById('ana-loading').style.display = 'none';
    document.getElementById('ana-output').style.display  = '';

    // Split text + chart data
    const chartMatch = result.match(/<CHART_DATA>([\s\S]*?)<\/CHART_DATA>/);
    const reportText = result.replace(/<CHART_DATA>[\s\S]*?<\/CHART_DATA>/, '').trim();

    document.getElementById('ana-output-body').innerHTML = markdownToHtml(reportText);

    // Render charts
    if (chartMatch) {
      try {
        const chartData = JSON.parse(chartMatch[1].trim());
        renderCharts(chartData.charts);
      } catch { /* ignore chart parse error */ }
    }
  } catch (e) {
    document.getElementById('ana-loading').style.display = 'none';
    alert('❌ Erreur : ' + e.message);
  }
}

function renderCharts(charts) {
  const container = document.getElementById('ana-charts');
  if (!container) return;
  container.innerHTML = '';
  S.activeCharts.forEach(c => { try { c.destroy(); } catch {} });
  S.activeCharts = [];

  if (!charts || !charts.length) return;

  const PALETTE = ['#f97316','#3b82f6','#22c55e','#a855f7','#f59e0b','#06b6d4','#ef4444','#14b8a6'];

  charts.forEach((ch, idx) => {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = `<h4>${sanitize(ch.title || 'Graphique ' + (idx+1))}</h4><canvas id="chart-${idx}"></canvas>`;
    container.appendChild(card);

    const ctx = document.getElementById('chart-' + idx);
    if (!ctx) return;

    const isDark = true;
    const dsColors = ch.type === 'pie' || ch.type === 'doughnut'
      ? PALETTE.slice(0, (ch.datasets[0]?.data || []).length)
      : (ch.datasets || []).map((ds, di) => ds.color || PALETTE[di % PALETTE.length]);

    const datasets = (ch.datasets || []).map((ds, di) => ({
      label: ds.label || 'Données',
      data: ds.data || [],
      backgroundColor: ch.type === 'pie' || ch.type === 'doughnut'
        ? dsColors.map(c => c + 'cc')
        : (dsColors[di] || PALETTE[0]) + 'cc',
      borderColor: ch.type === 'pie' || ch.type === 'doughnut'
        ? dsColors
        : dsColors[di] || PALETTE[0],
      borderWidth: 2,
      borderRadius: ch.type === 'bar' ? 4 : 0,
      tension: 0.4,
      fill: ch.type === 'line' ? { target: 'origin', above: (dsColors[di] || PALETTE[0]) + '22' } : false,
      pointBackgroundColor: dsColors[di] || PALETTE[0],
    }));

    const chartCfg = {
      type: ch.type || 'bar',
      data: { labels: ch.labels || [], datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { size: 11 } } }
        },
        scales: (ch.type === 'pie' || ch.type === 'doughnut') ? {} : {
          x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.05)' } },
          y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.07)' }, beginAtZero: true }
        }
      }
    };

    try { S.activeCharts.push(new Chart(ctx, chartCfg)); } catch {}
  });
}

async function exportReportPDF() {
  const body = document.getElementById('ana-output-body');
  if (!body || !body.innerHTML) { alert('Aucun rapport à exporter.'); return; }
  await exportDocToPDF('ana-output-body', 'rapport-analyse-archiva');
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE 4 — EMAIL CONNECTION
═══════════════════════════════════════════════════════════════ */
function selectEmailProvider(prov) {
  S.emailProv = prov;
  ['gmail','outlook','other'].forEach(p => {
    document.getElementById('email-prov-' + p)?.classList.toggle('active', p === prov);
    document.getElementById('email-cred-' + p) && (document.getElementById('email-cred-' + p).style.display = p === prov ? '' : 'none');
  });
  const btnRow = document.getElementById('email-connect-btn-row');
  if (btnRow) btnRow.style.display = prov === 'other' ? 'none' : '';
}

async function connectEmail() {
  if (!requireApiKey()) return;
  const btn = document.getElementById('btn-email-connect');
  btn.textContent = 'Connexion…'; btn.disabled = true;

  let token = '';
  if (S.emailProv === 'gmail')   token = document.getElementById('gmail-token')?.value.trim();
  if (S.emailProv === 'outlook') token = document.getElementById('outlook-token')?.value.trim();

  if (!token) {
    btn.textContent = 'Connecter la boîte mail'; btn.disabled = false;
    alert('⚠️ Veuillez entrer votre token d\'accès.'); return;
  }

  try {
    let emails = [];
    if (S.emailProv === 'gmail') {
      emails = await fetchGmailEmails(token);
    } else if (S.emailProv === 'outlook') {
      emails = await fetchOutlookEmails(token);
    }
    S.emailContent = JSON.stringify(emails);
    S.emailConnected = true;
    document.getElementById('email-connect-panel').style.display = 'none';
    document.getElementById('email-inbox-panel').style.display = '';
    renderEmailList(emails);
  } catch (e) {
    alert('❌ Connexion email échouée : ' + e.message +
      '\n\nVérifiez que votre token est valide et que les permissions API sont accordées.');
  } finally {
    btn.textContent = 'Connecter la boîte mail'; btn.disabled = false;
  }
}

async function fetchGmailEmails(token) {
  const listResp = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=in:inbox',
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (!listResp.ok) throw new Error('Accès Gmail refusé (code ' + listResp.status + ')');
  const listData = await listResp.json();
  if (!listData.messages) return [];

  const emails = [];
  for (const msg of listData.messages.slice(0, 15)) {
    const resp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (!resp.ok) continue;
    const d = await resp.json();
    const headers = {};
    (d.payload?.headers || []).forEach(h => { headers[h.name] = h.value; });
    emails.push({
      id: msg.id,
      from: headers.From || 'Inconnu',
      subject: headers.Subject || '(Sans objet)',
      date: headers.Date || '',
      snippet: d.snippet || '',
      unread: (d.labelIds || []).includes('UNREAD'),
      token
    });
  }
  return emails;
}

async function fetchOutlookEmails(token) {
  const resp = await fetch(
    'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=20&$select=subject,from,receivedDateTime,bodyPreview,isRead',
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (!resp.ok) throw new Error('Accès Outlook refusé (code ' + resp.status + ')');
  const data = await resp.json();
  return (data.value || []).map(m => ({
    id: m.id,
    from: m.from?.emailAddress?.address || 'Inconnu',
    subject: m.subject || '(Sans objet)',
    date: m.receivedDateTime || '',
    snippet: m.bodyPreview || '',
    unread: !m.isRead,
    token
  }));
}

function renderEmailList(emails) {
  const container = document.getElementById('email-list-container');
  if (!container) return;
  if (!emails.length) {
    container.innerHTML = '<p style="color:var(--t400);text-align:center;padding:2rem">Aucun email dans la boîte de réception.</p>';
    return;
  }
  container.innerHTML = '';
  emails.forEach((em, i) => {
    const div = document.createElement('div');
    div.className = 'email-item' + (em.unread ? ' unread' : '');
    div.innerHTML = `
      <div class="email-item-top">
        <span class="email-from">${sanitize(em.from)}</span>
        <span class="email-date">${formatEmailDate(em.date)}</span>
      </div>
      <div class="email-subj">${sanitize(em.subject)}</div>
      <div class="email-prev">${sanitize(em.snippet?.substring(0, 120) || '')}${em.snippet?.length > 120 ? '…' : ''}</div>
      <div class="email-actions">
        <button class="btn-pdf btn-sm" onclick="openEmailDetail(${i})">👁️ Voir</button>
        <button class="btn-pdf btn-sm" onclick="quickSummarizeEmail(${i})">📝 Résumer</button>
        <button class="btn-pdf btn-sm" onclick="quickDraftReply(${i})">✍️ Répondre</button>
      </div>`;
    container.appendChild(div);
  });
  window._archiva_emails = emails;
}

function openEmailDetail(idx) {
  const em = (window._archiva_emails || [])[idx];
  if (!em) return;
  const panel = document.getElementById('email-detail-panel');
  const header = document.getElementById('email-detail-header');
  const body   = document.getElementById('email-detail-body');
  if (!panel || !header || !body) return;
  header.innerHTML = `<strong style="color:var(--white)">${sanitize(em.subject)}</strong><br><small style="color:var(--t400)">De : ${sanitize(em.from)} · ${formatEmailDate(em.date)}</small>`;
  body.innerHTML   = sanitize(em.snippet || '(Aperçu non disponible)');
  panel.style.display = '';
  window._active_email = em;
  document.getElementById('email-ai-output').style.display = 'none';
}

async function quickSummarizeEmail(idx) {
  openEmailDetail(idx);
  await summarizeSingleEmail();
}

async function quickDraftReply(idx) {
  openEmailDetail(idx);
  await draftReply();
}

async function summarizeSingleEmail() {
  if (!requireApiKey()) return;
  const em = window._active_email;
  if (!em) return;
  const prompt = `Analyse et résume cet email professionnel de manière structurée :

De : ${em.from}
Objet : ${em.subject}
Date : ${em.date}
Contenu/Aperçu : ${em.snippet}

Fournis :
1. **Résumé en 2-3 phrases**
2. **Points d'action identifiés** (si applicable)
3. **Niveau d'urgence** (Faible / Moyen / Urgent)
4. **Catégorie** (Commercial, Administratif, Personnel, RH, etc.)
5. **Réponse recommandée** (brève indication)`;

  showEmailAiOutput('Analyse en cours…');
  try {
    const r = await callAI([{ role: 'user', content: prompt }], 1500);
    showEmailAiOutput(markdownToHtml(r));
  } catch (e) {
    showEmailAiOutput('<p style="color:var(--red)">Erreur : ' + sanitize(e.message) + '</p>');
  }
}

async function draftReply() {
  if (!requireApiKey()) return;
  const em = window._active_email;
  if (!em) return;
  const prompt = `Rédige une réponse email professionnelle en français pour l'email suivant :

De : ${em.from}
Objet : ${em.subject}
Contenu/Aperçu : ${em.snippet}

**Instructions :**
1. Commence par une formule de politesse adaptée
2. Réponds de manière professionnelle et concise
3. Propose une réponse générique mais personnalisable
4. Termine par une formule de clôture appropriée
5. Mets les parties à compléter entre [crochets]`;

  showEmailAiOutput('Rédaction en cours…');
  try {
    const r = await callAI([{ role: 'user', content: prompt }], 2000);
    showEmailAiOutput(markdownToHtml(r));
  } catch (e) {
    showEmailAiOutput('<p style="color:var(--red)">Erreur : ' + sanitize(e.message) + '</p>');
  }
}

async function summarizeAllEmails() {
  if (!requireApiKey()) return;
  const emails = window._archiva_emails || [];
  if (!emails.length) return;
  const summary = emails.slice(0,10).map((e,i) => `${i+1}. De: ${e.from} | Objet: ${e.subject} | Aperçu: ${e.snippet?.substring(0,100)}`).join('\n');
  const prompt = `Analyse ces ${emails.length} emails et fournis :
1. **Résumé global** de la boîte de réception
2. **Emails urgents** à traiter en priorité (avec numéro)
3. **Catégories identifiées** (types d'emails)
4. **Recommandations** d'organisation

Emails :\n${summary}`;

  document.getElementById('email-detail-panel').style.display = '';
  document.getElementById('email-detail-header').innerHTML = '<strong style="color:var(--white)">Résumé IA de la boîte de réception</strong>';
  document.getElementById('email-detail-body').textContent = 'Analyse en cours…';
  document.getElementById('email-ai-output').style.display = 'none';

  try {
    const r = await callAI([{ role: 'user', content: prompt }], 2000);
    document.getElementById('email-detail-body').textContent = '';
    showEmailAiOutput(markdownToHtml(r));
  } catch (e) {
    showEmailAiOutput('<p style="color:var(--red)">Erreur : ' + sanitize(e.message) + '</p>');
  }
}

async function categorizeEmails() {
  if (!requireApiKey()) return;
  const emails = window._archiva_emails || [];
  if (!emails.length) return;
  const list = emails.map((e,i) => `${i+1}. Objet: ${e.subject} | De: ${e.from}`).join('\n');
  const prompt = `Catégorise et organise ces emails en groupes thématiques. Suggère également des règles de filtrage.

Emails :\n${list}

Fournis :
1. **Groupes thématiques** avec les numéros d'emails correspondants
2. **Règles de filtrage suggérées** (par expéditeur, mots-clés, etc.)
3. **Priorité de traitement** pour chaque groupe`;

  document.getElementById('email-detail-panel').style.display = '';
  document.getElementById('email-detail-header').innerHTML = '<strong style="color:var(--white)">Catégorisation IA</strong>';
  document.getElementById('email-detail-body').textContent = '';
  showEmailAiOutput('Catégorisation en cours…');
  try {
    const r = await callAI([{ role: 'user', content: prompt }], 2000);
    showEmailAiOutput(markdownToHtml(r));
  } catch (e) {
    showEmailAiOutput('<p style="color:var(--red)">Erreur : ' + sanitize(e.message) + '</p>');
  }
}

function showEmailAiOutput(html) {
  const o = document.getElementById('email-ai-output');
  const b = document.getElementById('email-ai-body');
  if (o && b) { o.style.display = ''; b.innerHTML = html; }
}

function closeEmailDetail() {
  document.getElementById('email-detail-panel').style.display = 'none';
}

async function processManualEmails() {
  if (!requireApiKey()) return;
  const text = document.getElementById('email-manual')?.value.trim();
  if (!text) { alert('Veuillez coller vos emails.'); return; }
  S.emailConnected = true;
  window._archiva_emails = [{ id:'manual', from:'Collé manuellement', subject:'Emails manuels', date: new Date().toLocaleDateString(), snippet: text.substring(0,200), unread: true }];
  S.emailContent = text;
  document.getElementById('email-connect-panel').style.display = 'none';
  document.getElementById('email-inbox-panel').style.display   = '';
  document.getElementById('email-inbox-info').textContent = 'Emails collés manuellement · Analyse IA disponible';

  // Auto-analyze
  const list = document.getElementById('email-list-container');
  if (list) {
    list.innerHTML = `<div class="email-item unread">
      <div class="email-item-top"><span class="email-from">Emails manuels</span></div>
      <div class="email-prev">${sanitize(text.substring(0,200))}…</div>
      <div class="email-actions">
        <button class="btn-pdf btn-sm" onclick="analyzeManualEmailContent()">🤖 Analyser avec l'IA</button>
      </div></div>`;
  }
}

async function analyzeManualEmailContent() {
  if (!requireApiKey()) return;
  const prompt = `Analyse les emails suivants et fournis :
1. **Résumé de chaque email**
2. **Points d'action identifiés**
3. **Priorités de réponse**
4. **Ébauches de réponses suggérées** pour les emails nécessitant une réponse

Emails :\n${S.emailContent.substring(0, 8000)}`;

  document.getElementById('email-detail-panel').style.display = '';
  document.getElementById('email-detail-header').innerHTML = '<strong style="color:var(--white)">Analyse IA des emails</strong>';
  document.getElementById('email-detail-body').textContent = '';
  showEmailAiOutput('Analyse en cours…');
  try {
    const r = await callAI([{ role: 'user', content: prompt }], 4096);
    showEmailAiOutput(markdownToHtml(r));
  } catch (e) {
    showEmailAiOutput('<p style="color:var(--red)">Erreur : ' + sanitize(e.message) + '</p>');
  }
}

function disconnectEmail() {
  S.emailConnected = false;
  window._archiva_emails = [];
  window._active_email   = null;
  document.getElementById('email-connect-panel').style.display = '';
  document.getElementById('email-inbox-panel').style.display   = 'none';
  document.getElementById('gmail-token').value   = '';
  document.getElementById('outlook-token').value = '';
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE 5 — STORAGE CONNECTION
═══════════════════════════════════════════════════════════════ */
function selectStorageProvider(prov) {
  S.storeProv = prov;
  ['dropbox','gdrive','onedrive','manual'].forEach(p => {
    document.getElementById('store-prov-' + p)?.classList.toggle('active', p === prov);
    const credEl = document.getElementById('store-cred-' + p);
    if (credEl) credEl.style.display = p === prov ? '' : 'none';
  });
  const btnRow = document.getElementById('storage-connect-btn-row');
  if (btnRow) btnRow.style.display = prov === 'manual' ? 'none' : '';
}

async function connectStorage() {
  if (!requireApiKey()) return;
  const btn = document.getElementById('btn-storage-connect');
  btn.textContent = 'Connexion…'; btn.disabled = true;

  let token = '';
  if (S.storeProv === 'dropbox')  token = document.getElementById('dropbox-token')?.value.trim();
  if (S.storeProv === 'gdrive')   token = document.getElementById('gdrive-token')?.value.trim();
  if (S.storeProv === 'onedrive') token = document.getElementById('onedrive-token')?.value.trim();

  if (!token) {
    btn.textContent = 'Connecter le stockage'; btn.disabled = false;
    alert('⚠️ Veuillez entrer votre token d\'accès.'); return;
  }

  try {
    let files = [];
    if (S.storeProv === 'dropbox')  files = await fetchDropboxFiles(token);
    if (S.storeProv === 'gdrive')   files = await fetchGDriveFiles(token);
    if (S.storeProv === 'onedrive') files = await fetchOneDriveFiles(token);

    window._archiva_files = files;
    window._archiva_storage_token = token;
    S.storageConnected = true;
    document.getElementById('storage-connect-panel').style.display = 'none';
    document.getElementById('storage-browser-panel').style.display = '';
    renderFileList(files);
  } catch (e) {
    alert('❌ Connexion stockage échouée : ' + e.message +
      '\n\nVérifiez que votre token est valide et que les permissions sont accordées.');
  } finally {
    btn.textContent = 'Connecter le stockage'; btn.disabled = false;
  }
}

async function fetchDropboxFiles(token, path = '') {
  const resp = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: path || '', recursive: false, limit: 50 })
  });
  if (!resp.ok) throw new Error('Accès Dropbox refusé (code ' + resp.status + ')');
  const data = await resp.json();
  return (data.entries || []).map(e => ({
    id: e.id || e.path_lower,
    name: e.name,
    type: e['.tag'],
    size: e.size || 0,
    modified: e.client_modified || e.server_modified || '',
    path: e.path_display || e.path_lower
  }));
}

async function fetchGDriveFiles(token) {
  const resp = await fetch(
    "https://www.googleapis.com/drive/v3/files?pageSize=50&fields=files(id,name,mimeType,size,modifiedTime)",
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (!resp.ok) throw new Error('Accès Google Drive refusé (code ' + resp.status + ')');
  const data = await resp.json();
  return (data.files || []).map(f => ({
    id: f.id,
    name: f.name,
    type: f.mimeType?.includes('folder') ? 'folder' : 'file',
    size: parseInt(f.size) || 0,
    modified: f.modifiedTime || '',
    path: '/' + f.name
  }));
}

async function fetchOneDriveFiles(token) {
  const resp = await fetch(
    'https://graph.microsoft.com/v1.0/me/drive/root/children?$top=50&$select=id,name,file,folder,size,lastModifiedDateTime',
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (!resp.ok) throw new Error('Accès OneDrive refusé (code ' + resp.status + ')');
  const data = await resp.json();
  return (data.value || []).map(f => ({
    id: f.id,
    name: f.name,
    type: f.folder ? 'folder' : 'file',
    size: f.size || 0,
    modified: f.lastModifiedDateTime || '',
    path: '/' + f.name
  }));
}

function renderFileList(files) {
  const container = document.getElementById('storage-file-list');
  if (!container) return;
  if (!files.length) {
    container.innerHTML = '<p style="color:var(--t400);text-align:center;padding:2rem">Aucun fichier trouvé.</p>';
    return;
  }
  container.innerHTML = '';
  files.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'storage-item';
    const icon = f.type === 'folder' ? '📁' : storageFileIcon(f.name);
    div.innerHTML = `
      <span class="storage-icon">${icon}</span>
      <span class="storage-name">${sanitize(f.name)}</span>
      <span class="storage-size">${f.type === 'folder' ? 'Dossier' : formatBytes(f.size)}</span>
      <div class="storage-actions">
        <button class="btn-pdf btn-sm" onclick="analyzeStorageFile(${i})" title="Analyser avec IA">🤖</button>
      </div>`;
    container.appendChild(div);
  });
}

async function organizeWithAI() {
  if (!requireApiKey()) return;
  const files = window._archiva_files || [];
  if (!files.length) return;
  const fileList = files.map(f => `- ${f.type === 'folder' ? '📁' : '📄'} ${f.name} (${f.type === 'folder' ? 'Dossier' : formatBytes(f.size)})`).join('\n');
  const prompt = `Tu es un expert en gestion documentaire d'entreprise. Analyse cette liste de fichiers et propose une organisation optimale.

**Fichiers actuels :**
${fileList}

**Fournis :**
1. **Analyse de la structure actuelle** (points positifs et problèmes)
2. **Structure recommandée** (arborescence de dossiers optimale)
3. **Règles de nommage** suggérées
4. **Fichiers à archiver** vs **fichiers actifs**
5. **Plan d'action** pour réorganiser (étapes concrètes)
6. **Bonnes pratiques** de GED pour ce type de contenu`;

  document.getElementById('storage-ai-panel').style.display = '';
  document.getElementById('storage-ai-body').innerHTML = '<div class="loading-overlay"><div class="loading-ring"></div><p>Organisation IA en cours…</p></div>';
  try {
    const r = await callAI([{ role: 'user', content: prompt }], 3000);
    document.getElementById('storage-ai-body').innerHTML = markdownToHtml(r);
  } catch (e) {
    document.getElementById('storage-ai-body').innerHTML = '<p style="color:var(--red)">Erreur : ' + sanitize(e.message) + '</p>';
  }
}

async function analyzeStorageWithAI() {
  if (!requireApiKey()) return;
  const files = window._archiva_files || [];
  if (!files.length) return;
  const stats = { total: files.length, folders: files.filter(f=>f.type==='folder').length, totalSize: files.reduce((a,f)=>a+f.size,0) };
  const list  = files.slice(0,30).map(f=>`${f.name} (${f.type}, ${formatBytes(f.size)})`).join(', ');
  const prompt = `Analyse le contenu de ce stockage d'entreprise et fournis une vue d'ensemble intelligente.

**Statistiques :**
- Total : ${stats.total} éléments (${stats.folders} dossiers)
- Taille totale : ${formatBytes(stats.totalSize)}

**Fichiers :** ${list}

**Analyse demandée :**
1. **Portrait général** du stockage (type d'activité, secteur)
2. **Inventaire thématique** des contenus
3. **Fichiers potentiellement importants** ou sensibles
4. **Risques identifiés** (fichiers obsolètes, doublons potentiels, etc.)
5. **Opportunités d'optimisation** (consolidation, archivage, etc.)`;

  document.getElementById('storage-ai-panel').style.display = '';
  document.getElementById('storage-ai-body').innerHTML = '<div class="loading-overlay"><div class="loading-ring"></div><p>Analyse en cours…</p></div>';
  try {
    const r = await callAI([{ role: 'user', content: prompt }], 2500);
    document.getElementById('storage-ai-body').innerHTML = markdownToHtml(r);
  } catch (e) {
    document.getElementById('storage-ai-body').innerHTML = '<p style="color:var(--red)">Erreur : ' + sanitize(e.message) + '</p>';
  }
}

async function analyzeStorageFile(idx) {
  if (!requireApiKey()) return;
  const f = (window._archiva_files || [])[idx];
  if (!f) return;
  const prompt = `Analyse ce fichier dans un contexte d'entreprise :

**Nom :** ${f.name}
**Type :** ${f.type}
**Taille :** ${formatBytes(f.size)}
**Dernière modification :** ${f.modified || 'Non disponible'}
**Chemin :** ${f.path || '/'}

**Fournis :**
1. **Nature probable** du document (type, contenu supposé)
2. **Importance stratégique** estimée
3. **Recommandations** (archiver, mettre à jour, partager, protéger…)
4. **Conventions de nommage** améliorées suggérées`;

  document.getElementById('storage-ai-panel').style.display = '';
  document.getElementById('storage-ai-body').innerHTML = '<div class="loading-overlay"><div class="loading-ring"></div><p>Analyse du fichier…</p></div>';
  try {
    const r = await callAI([{ role: 'user', content: prompt }], 1500);
    document.getElementById('storage-ai-body').innerHTML = markdownToHtml(r);
  } catch (e) {
    document.getElementById('storage-ai-body').innerHTML = '<p style="color:var(--red)">Erreur : ' + sanitize(e.message) + '</p>';
  }
}

async function processManualStorage() {
  if (!requireApiKey()) return;
  const text = document.getElementById('storage-manual-list')?.value.trim();
  if (!text) { alert('Veuillez coller votre liste de fichiers.'); return; }
  S.storageContent = text;
  S.storageConnected = true;

  // Parse manually listed files
  const lines = text.split('\n').filter(l => l.trim());
  const files = lines.map(l => ({ id: l, name: l.replace(/[\/\-\s]+/,'').trim(), type: l.includes('/') && !l.includes('.') ? 'folder' : 'file', size: 0, modified: '', path: l }));
  window._archiva_files = files;

  document.getElementById('storage-connect-panel').style.display = 'none';
  document.getElementById('storage-browser-panel').style.display = '';
  document.getElementById('storage-path-display').textContent = '/ (manuel)';
  renderFileList(files);
  await organizeWithAI();
}

function disconnectStorage() {
  S.storageConnected = false;
  window._archiva_files = [];
  document.getElementById('storage-connect-panel').style.display = '';
  document.getElementById('storage-browser-panel').style.display = 'none';
  document.getElementById('storage-ai-panel').style.display = 'none';
  ['dropbox-token','gdrive-token','onedrive-token'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

/* ═══════════════════════════════════════════════════════════════
   LOADING HELPERS
═══════════════════════════════════════════════════════════════ */
function showLoading(prefix) {
  const l = document.getElementById(prefix + '-loading');
  const o = document.getElementById(prefix + '-output');
  if (l) l.style.display = '';
  if (o) o.style.display = 'none';
}

function hideLoading(prefix) {
  const l = document.getElementById(prefix + '-loading');
  if (l) l.style.display = 'none';
}

function showOutput(prefix, html) {
  const o = document.getElementById(prefix + '-output');
  const b = document.getElementById(prefix + '-output-body');
  if (o) o.style.display = '';
  if (b) b.innerHTML = html;
}

function animateLoadingSteps(stepIds, delays) {
  stepIds.forEach((id, i) => {
    if (i === 0) {
      const el = document.getElementById(id);
      if (el) el.className = 'ls-dot active';
    } else {
      setTimeout(() => {
        const prev = document.getElementById(stepIds[i-1]);
        const curr = document.getElementById(id);
        if (prev) prev.className = 'ls-dot done';
        if (curr) curr.className = 'ls-dot active';
      }, delays[i-1] || 2000);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   PDF EXPORT
═══════════════════════════════════════════════════════════════ */
async function exportDocToPDF(bodyId, filename) {
  const el = document.getElementById(bodyId);
  if (!el || !el.innerHTML.trim()) { alert('Aucun contenu à exporter.'); return; }

  if (window.jspdf && window.html2canvas) {
    try {
      const { jsPDF } = window.jspdf;
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#0a1628', logging: false });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const pageWidth  = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth   = pageWidth - 20;
      const imgHeight  = (canvas.height * imgWidth) / canvas.width;
      let position = 10;
      let heightLeft = imgHeight;

      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - 20;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight - 20;
      }

      pdf.save((filename || 'archiva-document') + '.pdf');
      return;
    } catch { /* fallback below */ }
  }

  // Fallback: plain text export
  const text = el.innerText || el.textContent || '';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: (filename||'archiva-document') + '.txt' });
  a.click();
  URL.revokeObjectURL(url);
}

function copyOutput(bodyId) {
  const el = document.getElementById(bodyId);
  if (!el) return;
  const text = el.innerText || el.textContent || '';
  navigator.clipboard.writeText(text).then(
    () => showToast('✅ Copié dans le presse-papiers'),
    () => { /* silent fail */ }
  );
}

function showToast(msg) {
  const t = Object.assign(document.createElement('div'), { textContent: msg });
  Object.assign(t.style, {
    position: 'fixed', bottom: '2rem', right: '2rem', zIndex: '9999',
    background: '#22c55e', color: '#fff', padding: '.75rem 1.25rem',
    borderRadius: '10px', fontSize: '.875rem', fontWeight: '600',
    boxShadow: '0 4px 20px rgba(0,0,0,.4)', animation: 'pageIn .3s ease'
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

/* ═══════════════════════════════════════════════════════════════
   MARKDOWN TO HTML (simple)
═══════════════════════════════════════════════════════════════ */
function markdownToHtml(md) {
  if (!md) return '';
  let html = md
    // Headers
    .replace(/^#### (.+)$/gm,  '<h4>$1</h4>')
    .replace(/^### (.+)$/gm,   '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,    '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,     '<h1>$1</h1>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,         '<em>$1</em>')
    .replace(/__(.+?)__/g,         '<strong>$1</strong>')
    .replace(/_(.+?)_/g,           '<em>$1</em>')
    // Code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Blockquote
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // HR
    .replace(/^---+$/gm, '<hr>')
    // Unordered list items
    .replace(/^\s*[-*+] (.+)$/gm, '<li>$1</li>')
    // Ordered list items
    .replace(/^\s*\d+\. (.+)$/gm, '<li>$1</li>')
    // Paragraphs (double newline)
    .replace(/\n\n/g, '</p><p>')
    // Single newline → <br>
    .replace(/\n/g, '<br>');

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>(?:(?!<\/ul>)<br>)?.*?<\/li>(?:<br>)?)+/gs, m =>
    '<ul>' + m.replace(/<br>/g, '') + '</ul>');

  // Wrap in paragraphs if not already wrapped
  if (!html.startsWith('<h') && !html.startsWith('<ul') && !html.startsWith('<p')) {
    html = '<p>' + html + '</p>';
  }

  // Clean up
  html = html
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(<h[1-6]>)/g, '$1')
    .replace(/(<\/h[1-6]>)<\/p>/g, '$1')
    .replace(/<p>(<ul>)/g, '$1')
    .replace(/(<\/ul>)<\/p>/g, '$1')
    .replace(/<p>(<hr>)<\/p>/g, '$1')
    .replace(/<p>(<blockquote>)/g, '$1')
    .replace(/(<\/blockquote>)<\/p>/g, '$1');

  return html;
}

/* ═══════════════════════════════════════════════════════════════
   COOKIES & RGPD
═══════════════════════════════════════════════════════════════ */
function acceptCookies() {
  localStorage.setItem('archiva_consent', JSON.stringify({ accepted: true, pref: true, analytics: false, date: Date.now() }));
  document.getElementById('cookie-banner').classList.add('hidden');
}

function rejectCookies() {
  localStorage.setItem('archiva_consent', JSON.stringify({ accepted: false, pref: false, analytics: false, date: Date.now() }));
  document.getElementById('cookie-banner').classList.add('hidden');
}

function saveCookiePrefs() {
  const pref      = document.getElementById('toggle-pref')?.classList.contains('on');
  const analytics = document.getElementById('toggle-analytics')?.classList.contains('on');
  localStorage.setItem('archiva_consent', JSON.stringify({ accepted: true, pref, analytics, date: Date.now() }));
  document.getElementById('cookie-banner').classList.add('hidden');
  closeModal('cookies');
  showToast('✅ Préférences cookies sauvegardées');
}

function toggleCookiePref(type) {
  const el = document.getElementById('toggle-' + type);
  if (!el || el.classList.contains('disabled')) return;
  el.classList.toggle('on');
  el.setAttribute('aria-checked', el.classList.contains('on'));
}

function checkCookieConsent() {
  const consent = JSON.parse(localStorage.getItem('archiva_consent') || 'null');
  const banner  = document.getElementById('cookie-banner');
  if (consent) { banner?.classList.add('hidden'); return; }
  banner?.classList.remove('hidden');
}

/* ═══════════════════════════════════════════════════════════════
   MODALS
═══════════════════════════════════════════════════════════════ */
function showModal(name) {
  const m = document.getElementById('modal-' + name);
  if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; }
}

function closeModal(name) {
  const m = document.getElementById('modal-' + name);
  if (m) { m.classList.remove('open'); document.body.style.overflow = ''; }
}

function closeModalOutside(e, name) {
  if (e.target === e.currentTarget) closeModal(name);
}

/* ═══════════════════════════════════════════════════════════════
   FAQ
═══════════════════════════════════════════════════════════════ */
function toggleFaq(btn) {
  const item = btn.parentElement;
  const wasOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(el => el.classList.remove('open'));
  if (!wasOpen) item.classList.add('open');
}

/* ═══════════════════════════════════════════════════════════════
   CONTACT FORM
═══════════════════════════════════════════════════════════════ */
function submitContact(e) {
  e.preventDefault();
  const fields = ['cf-firstname','cf-lastname','cf-email','cf-subject','cf-message','cf-consent'];
  let valid = true;
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if ((el.type === 'checkbox' && !el.checked) || (!el.value.trim() && el.required)) {
      el.style.borderColor = 'var(--red)';
      valid = false;
    } else {
      el.style.borderColor = '';
    }
  });
  const emailEl = document.getElementById('cf-email');
  if (emailEl && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value)) {
    emailEl.style.borderColor = 'var(--red)';
    valid = false;
  }
  if (!valid) { alert('Veuillez remplir tous les champs obligatoires correctement.'); return; }

  const btn = document.getElementById('btn-contact-submit');
  btn.textContent = 'Envoi en cours…'; btn.disabled = true;

  // Simulate send (no backend — show success)
  setTimeout(() => {
    document.getElementById('contact-form').style.display = 'none';
    document.getElementById('form-success').style.display = '';
    btn.textContent = 'Envoyer le message'; btn.disabled = false;
  }, 1200);
}

function resetContactForm() {
  document.getElementById('contact-form').style.display = '';
  document.getElementById('form-success').style.display = 'none';
  document.getElementById('contact-form').reset();
}

/* ═══════════════════════════════════════════════════════════════
   NAVBAR SCROLL
═══════════════════════════════════════════════════════════════ */
window.addEventListener('scroll', () => {
  document.getElementById('navbar')?.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
function sanitize(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#x27;');
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024, sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatEmailDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000) {
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 604800000) {
      return d.toLocaleDateString('fr-FR', { weekday: 'short' });
    }
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  } catch { return dateStr.substring(0, 10); }
}

function fileIcon(ext) {
  const icons = { PDF:'📕', DOCX:'📘', DOC:'📘', XLSX:'📗', XLS:'📗', CSV:'📊', TXT:'📄', PNG:'🖼️', JPG:'🖼️', JPEG:'🖼️', ZIP:'🗜️', RAR:'🗜️', PPT:'📙', PPTX:'📙' };
  return icons[ext?.toUpperCase()] || '📄';
}

function storageFileIcon(name) {
  const ext = name?.split('.').pop()?.toUpperCase();
  return fileIcon(ext);
}

/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Check saved API key
  const savedKey  = sessionStorage.getItem('archiva_key');
  const savedProv = sessionStorage.getItem('archiva_prov');
  if (savedKey) {
    S.apiKey = savedKey;
    S.connected = true;
    if (savedProv) { S.provider = savedProv; selectProvider(savedProv); }
    document.getElementById('api-key-input').value = savedKey;
    setApiStatus('ok', `Reconnecté · ${S.provider === 'claude' ? 'Claude' : 'Mistral AI'}`);
    document.getElementById('api-config-card').classList.add('connected');
  }

  // Cookie banner
  checkCookieConsent();

  // Keyboard nav
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      ['privacy','legal','cgv','cookies'].forEach(closeModal);
      document.body.style.overflow = '';
    }
  });

  // Navbar logo keyboard
  document.querySelector('.nav-logo')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') showPage('home');
  });

  // Auto-switch extraction tab handler
  document.querySelectorAll('#panel-extraction .dtab').forEach((btn, i) => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('#panel-extraction .dtab').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      const tab = i === 0 ? 'upload' : 'text';
      const uploadEl = document.getElementById('ext-dc-upload');
      const textEl   = document.getElementById('ext-dc-text');
      if (uploadEl) uploadEl.style.display = tab === 'upload' ? '' : 'none';
      if (textEl)   textEl.style.display   = tab === 'text'   ? '' : 'none';
    });
  });

  document.querySelectorAll('#panel-analysis .dtab').forEach((btn, i) => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('#panel-analysis .dtab').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      const tab = i === 0 ? 'upload' : 'text';
      const uploadEl = document.getElementById('ana-dc-upload');
      const textEl   = document.getElementById('ana-dc-text');
      if (uploadEl) uploadEl.style.display = tab === 'upload' ? '' : 'none';
      if (textEl)   textEl.style.display   = tab === 'text'   ? '' : 'none';
    });
  });

  console.log('%cArchiva IA 1.0 — Prêt', 'color:#f97316;font-weight:bold;font-size:14px');
});
