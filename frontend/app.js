// ================== Config ==================
const API = 'https://api.yaguts.com.br';
const TEMPEROS = [
  { value: '',        label: 'Selecione...' },
  { value: 'pimenta', label: 'Pimenta' },
  { value: 'sal',     label: 'Sal' },
  { value: 'alho',    label: 'Alho em pó' },
  { value: 'oregano', label: 'Orégano' },
  { value: 'cominho', label: 'Cominho' },
];

// ================== Atalhos de DOM ==================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const linhasEl = $('#linhas');
const saida     = $('#saida');

// ================== UI: toast ==================
function toast(msg, type = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.style.background = type === 'err' ? '#b91c1c' : (type === 'ok' ? '#065f46' : '#111827');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ================== Helpers ==================
function makeSelect(options, attrs = {}) {
  const s = document.createElement('select');
  Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    s.appendChild(o);
  }
  return s;
}
function micro(text) {
  const x = document.createElement('span');
  x.className = 'mlabel';
  x.textContent = text;
  return x;
}
function hidden(name, value) {
  const i = document.createElement('input');
  i.type = 'hidden'; i.name = name; i.value = value;
  return i;
}

// ================== Ingrediente: linha dinâmica ==================
function linhaIngrediente(idx) {
  const row = document.createElement('div');
  row.className = 'row';

  // Tempero
  const wT = document.createElement('div');
  wT.appendChild(micro('Tempero'));
  const selT = makeSelect(TEMPEROS, { name: `tempero${idx}` });
  wT.appendChild(selT);

  // Reservatório
  const wR = document.createElement('div');
  wR.appendChild(micro('Reservatório'));
  const selR = makeSelect(
    [
      { value: '', label: '—' },
      { value: '1', label: 'Reservatório 1' },
      { value: '2', label: 'Reservatório 2' },
      { value: '3', label: 'Reservatório 3' },
      { value: '4', label: 'Reservatório 4' },
    ],
    { name: `reservatorio${idx}`, disabled: 'true' },
  );
  wR.appendChild(selR);

  // Quantidade
  const wQ = document.createElement('div');
  wQ.appendChild(micro('Quantidade (g)'));
  const inpQ = document.createElement('input');
  inpQ.type = 'number';
  inpQ.name = `quantidade${idx}`;
  inpQ.min = '1'; inpQ.max = '500'; inpQ.step = '1';
  inpQ.disabled = true;
  inpQ.inputMode = 'numeric';
  wQ.appendChild(inpQ);

  // Remover
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn ghost';
  del.title = 'Remover linha';
  del.textContent = 'Remover';

  // Habilita/desabilita campos conforme escolha de tempero
  function toggle() {
    const has = !!selT.value;
    selR.disabled = !has;
    inpQ.disabled = !has;
    if (!has) {
      selR.value = '';
      inpQ.value = '';
    }
  }
  selT.addEventListener('change', toggle);
  del.addEventListener('click', () => { row.remove(); renumerar(); });

  row.appendChild(wT);
  row.appendChild(wR);
  row.appendChild(wQ);
  row.appendChild(del);
  return row;
}

function renumerar() {
  $$('#linhas .row').forEach((row, i) => {
    const n = i + 1;
    row.querySelector('select[name^="tempero"]').name = `tempero${n}`;
    row.querySelector('select[name^="reservatorio"]').name = `reservatorio${n}`;
    row.querySelector('input[name^="quantidade"]').name = `quantidade${n}`;
  });
}

function addLinha() {
  if (linhasEl.children.length >= 4) {
    toast('Máximo de 4 ingredientes.', 'err');
    return;
  }
  const row = linhaIngrediente(linhasEl.children.length + 1);
  linhasEl.appendChild(row);
}

// ================== Tabs ==================
function initTabs() {
  const tabMontar = $('#tab-montar');
  const tabConsultar = $('#tab-consultar');
  const paneMontar = $('#pane-montar');
  const paneConsultar = $('#pane-consultar');

  function selectTab(which) {
    const montar = which === 'montar';
    tabMontar.setAttribute('aria-selected', montar);
    tabConsultar.setAttribute('aria-selected', !montar);
    paneMontar.hidden = !montar;
    paneConsultar.hidden = montar;
  }

  tabMontar.addEventListener('click', () => selectTab('montar'));
  tabConsultar.addEventListener('click', () => selectTab('consultar'));
}

// ================== Coleta/validação ==================
function coletarIngredientes() {
  const itens = [];
  const usados = new Set();

  for (const row of $$('#linhas .row')) {
    const t = row.querySelector('select[name^="tempero"]').value;
    const r = row.querySelector('select[name^="reservatorio"]').value;
    const q = row.querySelector('input[name^="quantidade"]').value;

    if (!t && !r && !q) continue; // linha completamente vazia

    if (!(t && r && q)) {
      throw new Error('Preencha tempero, reservatório e quantidade nas linhas usadas.');
    }

    const rNum = Number(r);
    const qNum = Number(q);

    if (!(rNum >= 1 && rNum <= 4)) {
      throw new Error('Reservatório deve ser 1, 2, 3 ou 4.');
    }
    if (!(Number.isInteger(qNum) && qNum >= 1 && qNum <= 500)) {
      throw new Error('Quantidade deve ser inteiro entre 1 e 500 g.');
    }
    if (usados.has(rNum)) {
      throw new Error(`Reservatório ${rNum} repetido na mesma receita.`);
    }
    usados.add(rNum);

    itens.push({ tempero: t, frasco: rNum, quantidade: qNum });
  }

  if (itens.length === 0) {
    throw new Error('Inclua pelo menos 1 ingrediente.');
  }
  return itens;
}

// ================== Submit receita ==================
async function salvarReceita(ev) {
  ev.preventDefault(); // primeiro tenta JSON; se falhar, faz fallback para /receitas/form

  const nome = $('#nome').value.trim();
  if (!nome) { toast('Informe o nome da receita', 'err'); return; }

  let ingredientes;
  try { ingredientes = coletarIngredientes(); }
  catch (e) { toast(e.message, 'err'); return; }

  const payload = { nome, ingredientes };
  saida.textContent = 'Enviando (JSON)...';

  try {
    const resp = await fetch(`${API}/receitas/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    saida.textContent = JSON.stringify(data, null, 2);
    if (!resp.ok) throw new Error(data?.detail || 'Erro ao salvar (JSON)');
    toast('Receita salva com sucesso!', 'ok');
  } catch {
    // Fallback: submete via /receitas/form em nova aba (mantém a página estável)
    toast('Tentando fallback /receitas/form...', '');
    const f = document.createElement('form');
    f.action = `${API}/receitas/form`;
    f.method = 'POST';
    f.target = '_blank';
    f.style.display = 'none';
    f.appendChild(hidden('nome', nome));
    ingredientes.forEach((it, i) => {
      const n = i + 1;
      f.appendChild(hidden(`tempero${n}`, it.tempero));
      f.appendChild(hidden(`reservatorio${n}`, String(it.frasco)));
      f.appendChild(hidden(`quantidade${n}`, String(it.quantidade)));
    });
    document.body.appendChild(f);
    f.submit();
    f.remove();
  }
}

// ================== Teste rápido ==================
async function executarReceita() {
  const payload = {
    nome: 'Receita Teste',
    ingredientes: [
      { tempero: 'pimenta', frasco: 1, quantidade: 2 },
      { tempero: 'sal',     frasco: 2, quantidade: 1 },
    ],
  };
  saida.textContent = 'Enviando teste...';
  const resp = await fetch(`${API}/receitas/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  saida.textContent = JSON.stringify(data, null, 2);
  toast(resp.ok ? 'Teste OK' : 'Erro no teste', resp.ok ? 'ok' : 'err');
}

// ================== Consultas ==================
async function buscarPorId() {
  const id = Number($('#idBusca').value);
  const lista = $('#lista');
  if (!Number.isInteger(id) || id < 1) { toast('ID inválido', 'err'); return; }
  lista.innerHTML = '<div class="hint">Carregando...</div>';

  try {
    const resp = await fetch(`${API}/receitas/${id}`, { headers: { Accept: 'application/json' } });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.detail || 'Erro ao buscar');

    lista.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'item';
    card.innerHTML = `<h4>${data.nome || '(sem nome)'}</h4><small>ID: ${data.id ?? id}</small>`;
    const line = document.createElement('div');
    (data.ingredientes || []).forEach((it) => {
      const s = document.createElement('span');
      s.className = 'tag';
      s.textContent = `${it.tempero} · R${it.frasco} · ${it.quantidade}g`;
      line.appendChild(s);
    });
    card.appendChild(line);
    lista.appendChild(card);
    toast('Receita carregada');
  } catch {
    lista.innerHTML = '<div class="hint">Não foi possível obter o detalhe. Verifique se o endpoint existe.</div>';
  }
}

async function listarReceitas() {
  const lista = $('#lista');
  lista.innerHTML = '<div class="hint">Carregando...</div>';

  try {
    const resp = await fetch(`${API}/receitas/`, { headers: { Accept: 'application/json' } });
    if (!resp.ok) throw new Error('GET /receitas/ indisponível');
    const arr = await resp.json();

    if (!Array.isArray(arr) || arr.length === 0) {
      lista.innerHTML = '<div class="hint">Nenhuma receita encontrada.</div>';
      return;
    }

    lista.innerHTML = '';
    arr.forEach((r) => {
      const card = document.createElement('div');
      card.className = 'item';
      card.innerHTML = `<h4>${r.nome || '(sem nome)'}</h4><small>ID: ${r.id ?? '—'}</small>`;
      const line = document.createElement('div');
      (r.ingredientes || []).forEach((it) => {
        const s = document.createElement('span');
        s.className = 'tag';
        s.textContent = `${it.tempero} · R${it.frasco} · ${it.quantidade}g`;
        line.appendChild(s);
      });
      card.appendChild(line);
      lista.appendChild(card);
    });
    toast('Lista carregada');
  } catch {
    lista.innerHTML = '<div class="hint">Listagem indisponível. Implemente GET /receitas/ no backend.</div>';
  }
}

// ================== Boot ==================
function boot() {
  // Primeiro ingrediente
  addLinha();

  // Tabs
  initTabs();

  // Ações principais
  $('#addLinha').addEventListener('click', addLinha);
  $('#formReceita').addEventListener('submit', salvarReceita);
  $('#btnTeste').addEventListener('click', executarReceita);

  // Consultas
  $('#btnBuscar').addEventListener('click', buscarPorId);
  $('#btnListar').addEventListener('click', listarReceitas);

  // Evita submit ao pressionar Enter no campo nome
  $('#nome').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
}

// Como o script está com `defer`, o DOM já estará pronto aqui:
boot();
