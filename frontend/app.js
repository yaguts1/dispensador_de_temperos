// ================== Configurações ==================
const API_URL = 'https://api.yaguts.com.br';

const INGREDIENTS = [
  { value: '', label: 'Selecione...' },
  { value: 'pimenta', label: 'Pimenta' },
  { value: 'sal', label: 'Sal' },
  { value: 'alho', label: 'Alho em pó' },
  { value: 'oregano', label: 'Orégano' },
  { value: 'cominho', label: 'Cominho' },
];

// Busca ao digitar
const AUTOCOMPLETE_MIN_CHARS = 1;
const TYPING_DEBOUNCE_MS = 200;

// -------- fetch helper (com cookies + tratamento de erro) --------
async function jfetch(url, opts = {}) {
  const resp = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  let data = null;
  try { data = await resp.json(); } catch {}
  if (!resp.ok) {
    const err = new Error(data?.detail || `HTTP ${resp.status}`);
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ================== App ==================
class App {
  constructor() {
    this.state = { isEditing: false, editId: null, roboLoaded: false };
    this.user = null;               // {id, nome} quando logado
    this.robotCfg = [];             // itens do GET /config/robo
    this.robotCfgIndex = {};        // índice por rótulo (lowercase)

    this.els = {
      // abas e panes
      tabMontar: document.getElementById('tab-montar'),
      tabConsultar: document.getElementById('tab-consultar'),
      tabRobo: document.getElementById('tab-robo'),
      paneMontar: document.getElementById('pane-montar'),
      paneConsultar: document.getElementById('pane-consultar'),
      paneRobo: document.getElementById('pane-robo'),

      // formulário de receita
      form: document.getElementById('formReceita'),
      nomeInput: document.getElementById('nome'),
      linhas: document.getElementById('linhas'),
      addBtn: document.getElementById('addLinha'),
      btnSalvar: document.getElementById('btnSalvar'),
      btnAtualizar: document.getElementById('btnAtualizar'),
      btnCancelarEdicao: document.getElementById('btnCancelarEdicao'),
      btnExcluirAtual: document.getElementById('btnExcluirAtual'),
      receitaIdInput: document.getElementById('receitaId'),
      editInfo: document.getElementById('editInfo'),
      editNome: document.getElementById('editNome'),
      editId: document.getElementById('editId'),

      // consulta
      buscaNome: document.getElementById('q'),
      listaSugestoes: document.getElementById('listaSugestoes'),
      btnBuscar: document.getElementById('btnBuscar'),
      btnListar: document.getElementById('btnListar'),
      lista: document.getElementById('lista'),

      // ROBÔ
      formRobo: document.getElementById('formRobo'),
      btnSalvarRobo: document.getElementById('btnSalvarRobo'),
      btnRecarregarRobo: document.getElementById('btnRecarregarRobo'),
      roboFields: {
        1: { rotulo: document.getElementById('r1_rotulo'), conteudo: document.getElementById('r1_conteudo'), g: document.getElementById('r1_gps') },
        2: { rotulo: document.getElementById('r2_rotulo'), conteudo: document.getElementById('r2_conteudo'), g: document.getElementById('r2_gps') },
        3: { rotulo: document.getElementById('r3_rotulo'), conteudo: document.getElementById('r3_conteudo'), g: document.getElementById('r3_gps') },
        4: { rotulo: document.getElementById('r4_rotulo'), conteudo: document.getElementById('r4_conteudo'), g: document.getElementById('r4_gps') },
      },

      // ui
      dlgExcluir: document.getElementById('dlgExcluir'),
      toast: document.getElementById('toast'),
      headerRow: document.querySelector('.header-row'),
      headerTop: document.querySelector('.header-top'),
    };

    // timers / abort
    this._typeTimer = null;
    this._suggestAbort = null;
    this._searchAbort = null;

    // dialogs
    this.authDlg = null;
    this.runDlg = null;

    this.init();
  }

  // ========= INIT =========
  async init() {
    this.ensureAuthBox();
    this.bindEvents();
    await this.refreshAuth();                 // tenta descobrir sessão atual
    if (this.user) { await this.loadRobotConfig(); } // já deixa em cache
    this.renderIngredientRow();               // primeira linha vazia
    this.selectTab('consultar');
    this.handleListAll();
  }

  // ========= AUTH UI =========
  ensureAuthBox() {
    this.els.authBox = document.querySelector('.auth-box') || this.els.authBox;
    if (!this.els.authBox) {
      const box = document.createElement('div');
      box.className = 'auth-box';
      (this.els.headerTop || this.els.headerRow)?.appendChild(box);
      this.els.authBox = box;
    }
    this.renderAuthBox();
  }

  renderAuthBox() {
    if (!this.els.authBox) return;
    this.els.authBox.innerHTML = '';

    if (this.user) {
      const hello = document.createElement('span');
      hello.textContent = `Olá, ${this.user.nome}`;
      hello.className = 'lead';

      const btnOut = document.createElement('button');
      btnOut.className = 'ghost with-icon';
      btnOut.type = 'button';
      // usa o mesmo ícone “login”, espelhado para sugerir “sair”
      btnOut.innerHTML = '<span class="icon icon-login" aria-hidden="true" style="transform: scaleX(-1)"></span><span>Sair</span>';
      btnOut.addEventListener('click', () => this.logout());

      this.els.authBox.append(hello, btnOut);
    } else {
      const btnIn = document.createElement('button');
      btnIn.className = 'ghost with-icon';
      btnIn.type = 'button';
      btnIn.innerHTML = '<span class="icon icon-login" aria-hidden="true"></span><span>Entrar</span>';
      btnIn.addEventListener('click', () => this.openAuthDialog('login'));

      const btnUp = document.createElement('button');
      btnUp.className = 'dark with-icon';
      btnUp.type = 'button';
      btnUp.innerHTML = '<span class="icon icon-login" aria-hidden="true"></span><span>Criar conta</span>';
      btnUp.addEventListener('click', () => this.openAuthDialog('register'));

      this.els.authBox.append(btnIn, btnUp);
    }
  }

  ensureAuthOrPrompt() {
    if (this.user) return true;
    this.openAuthDialog('login');
    return false;
  }

  async refreshAuth() {
    try {
      const me = await jfetch(`${API_URL}/auth/me`);
      this.user = me;
      this.renderAuthBox();
    } catch (e) {
      this.user = null;
      this.renderAuthBox();
    }
  }

  openAuthDialog(mode = 'login') {
    if (!this.authDlg) {
      const dlg = document.createElement('dialog');
      dlg.id = 'dlgAuth';
      dlg.innerHTML = `
        <form method="dialog" style="min-width: 320px">
          <h3 id="dlgAuthTitle" style="margin:0 0 8px">Entrar</h3>
          <label>Usuário</label>
          <input id="authNome" type="text" autocomplete="username" required />
          <label>Senha</label>
          <input id="authSenha" type="password" autocomplete="current-password" required />
          <div class="actions" style="grid-template-columns: 1fr 1fr">
            <button id="authCancel" type="button" class="ghost">Cancelar</button>
            <button id="authSubmit" class="primary" type="button">Confirmar</button>
          </div>
          <p class="hint" id="authHint" style="margin-top:6px"></p>
        </form>`;
      document.body.appendChild(dlg);
      this.authDlg = dlg;

      // Confirmar
      dlg.querySelector('#authSubmit').addEventListener('click', async () => {
        const nome = dlg.querySelector('#authNome').value.trim();
        const senha = dlg.querySelector('#authSenha').value;
        if (!nome || !senha) return;

        try {
          if (this.authMode === 'register') {
            await jfetch(`${API_URL}/auth/register`, {
              method: 'POST',
              body: JSON.stringify({ nome, senha }),
            });
            await jfetch(`${API_URL}/auth/login`, {
              method: 'POST',
              body: JSON.stringify({ nome, senha }),
            });
            this.toast('Cadastro realizado, bem-vindo!', 'ok');
          } else {
            await jfetch(`${API_URL}/auth/login`, {
              method: 'POST',
              body: JSON.stringify({ nome, senha }),
            });
            this.toast('Login efetuado.', 'ok');
          }
          dlg.close();
          await this.refreshAuth();
          if (this.user) { await this.loadRobotConfig(); }
          this.handleListAll();
        } catch (e) {
          this.toast(e.message || 'Falha na autenticação', 'err');
        }
      });

      // Cancelar
      dlg.querySelector('#authCancel').addEventListener('click', () => dlg.close('cancel'));

      // Enter = confirmar
      dlg.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          dlg.querySelector('#authSubmit').click();
        }
      });
    }

    this.authMode = mode;
    this.authDlg.querySelector('#dlgAuthTitle').textContent =
      mode === 'register' ? 'Criar conta' : 'Entrar';
    this.authDlg.querySelector('#authHint').textContent =
      mode === 'register'
        ? 'Crie um usuário e senha para acessar suas receitas.'
        : 'Faça login para ver e editar suas receitas.';
    this.authDlg.showModal();
  }

  async logout() {
    try { await jfetch(`${API_URL}/auth/logout`, { method: 'POST' }); } catch {}
    this.user = null;
    this.renderAuthBox();
    this.toast('Sessão encerrada.', 'ok');
    this.handleListAll();
  }

  // ================== Bindings ==================
  bindEvents() {
    // Tabs
    this.els.tabMontar.addEventListener('click', () => this.selectTab('montar'));
    this.els.tabConsultar.addEventListener('click', () => this.selectTab('consultar'));
    this.els.tabRobo.addEventListener('click', () => this.selectTab('robo'));

    // Form
    if (this.els.form) {
      this.els.form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!this.ensureAuthOrPrompt()) return;
        if (this.state.isEditing) this.atualizarReceita();
        else this.salvarReceita();
      });
    }
    this.els.nomeInput.addEventListener('keydown', (e) => this.handleEnterKey(e));
    this.els.addBtn.addEventListener('click', () => {
      if (!this.ensureAuthOrPrompt()) return;
      this.handleAddRow();
    });

    // Botões de edição no formulário
    this.els.btnAtualizar.addEventListener('click', () => {
      if (!this.ensureAuthOrPrompt()) return;
      this.atualizarReceita();
    });
    this.els.btnCancelarEdicao.addEventListener('click', () => this.setModeCreate());
    this.els.btnExcluirAtual.addEventListener('click', async () => {
      if (!this.ensureAuthOrPrompt()) return;
      const id = this.state.editId;
      if (!id) return;
      const ok = await this.confirmDelete();
      if (ok) this.excluirReceita(id);
    });

    // Robô
    this.els.btnSalvarRobo.addEventListener('click', async () => {
      if (!this.ensureAuthOrPrompt()) return;
      await this.saveRobotConfig();
      await this.loadRobotConfig(true); // recarrega índice
      this.handleListAll();             // atualiza badges nos cards
    });
    this.els.btnRecarregarRobo.addEventListener('click', () => {
      if (!this.ensureAuthOrPrompt()) return;
      this.loadRobotConfig(true);
    });

    // Consulta: busca ao digitar + Enter + Botão
    if (this.els.buscaNome) {
      this.els.buscaNome.addEventListener('input', () => this.handleLiveInputDebounced());
      this.els.buscaNome.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.handleSearchByText(); }
      });
    }
    this.els.btnBuscar.addEventListener('click', () => this.handleSearchByText());
    this.els.btnListar.addEventListener('click', () => this.handleListAll());

    // Delegação: cliques em Play/Editar/Excluir dentro da lista
    this.els.lista.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const card = btn.closest('.recipe-item, article.recipe-item');
      const id = Number(card?.dataset?.id);
      if (!id) return;

      const action = btn.dataset.action;
      if (action === 'play') {
        if (!this.ensureAuthOrPrompt()) return;
        this.runRecipe(id, btn);
      } else if (action === 'editar') {
        if (!this.ensureAuthOrPrompt()) return;
        this.loadRecipeIntoForm(id);
      } else if (action === 'excluir') {
        if (!this.ensureAuthOrPrompt()) return;
        const ok = await this.confirmDelete();
        if (ok) this.excluirReceita(id);
      }
    });
  }

  // ================== UI helpers ==================
  toast(message, type = '') {
    const t = this.els.toast;
    if (!t) return;

    const color = type === 'err' ? '#ef4444' : (type === 'ok' ? '#22c55e' : 'var(--ink)');
    t.style.backgroundColor = color;

    t.classList.remove('show');
    void t.offsetHeight;
    t.textContent = message;
    t.classList.add('show');

    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
  }

  selectTab(which) {
    const isMontar = which === 'montar';
    const isConsultar = which === 'consultar';
    const isRobo = which === 'robo';

    this.els.tabMontar.setAttribute('aria-selected', isMontar);
    this.els.tabConsultar.setAttribute('aria-selected', isConsultar);
    this.els.tabRobo.setAttribute('aria-selected', isRobo);

    this.els.paneMontar.hidden = !isMontar;
    this.els.paneConsultar.hidden = !isConsultar;
    this.els.paneRobo.hidden = !isRobo;

    if (isRobo && !this.state.roboLoaded) {
      if (this.ensureAuthOrPrompt()) this.loadRobotConfig();
    }
  }

  setModeCreate() {
    this.state.isEditing = false;
    this.state.editId = null;

    this.els.receitaIdInput.value = '';
    this.els.editInfo.hidden = true;
    this.els.btnSalvar.hidden = false;
    this.els.btnAtualizar.hidden = true;
    this.els.btnCancelarEdicao.hidden = true;
    this.els.btnExcluirAtual.hidden = true;

    this.els.form.reset();
    this.els.linhas.innerHTML = '';
    this.renderIngredientRow();
  }

  setModeEdit(recipe) {
    this.state.isEditing = true;
    this.state.editId = recipe.id;

    this.els.receitaIdInput.value = String(recipe.id);
    this.els.editNome.textContent = recipe.nome || '—';
    this.els.editId.textContent = String(recipe.id);
    this.els.editInfo.hidden = false;
    this.els.btnSalvar.hidden = true;
    this.els.btnAtualizar.hidden = false;
    this.els.btnCancelarEdicao.hidden = false;
    this.els.btnExcluirAtual.hidden = false;
  }

  async confirmDelete() {
    const dlg = this.els.dlgExcluir;
    if (dlg && typeof dlg.showModal === 'function') {
      return new Promise((resolve) => {
        const onClose = () => {
          dlg.removeEventListener('close', onClose);
          resolve(dlg.returnValue === 'confirm');
        };
        dlg.addEventListener('close', onClose, { once: true });
        dlg.showModal();
      });
    }
    return window.confirm('Tem certeza que deseja excluir esta receita?');
  }

  // ================== Ingredientes Dinâmicos ==================
  renderIngredientRow() {
    const rowCount = this.els.linhas.children.length;
    if (rowCount >= 4) {
      this.toast('Máximo de 4 ingredientes.', 'err');
      return;
    }

    const row = document.createElement('div');
    row.className = 'ingredient-row';

    const renderSelect = (options, attrs = {}) => {
      const select = document.createElement('select');
      Object.entries(attrs).forEach(([key, value]) => select.setAttribute(key, value));
      options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
      });
      return select;
    };

    const renderInput = (type, attrs = {}) => {
      const input = document.createElement('input');
      input.type = type;
      Object.entries(attrs).forEach(([key, value]) => input.setAttribute(key, value));
      return input;
    };

    const temperoSelect = renderSelect(INGREDIENTS, { name: `tempero${rowCount + 1}` });
    const quantidadeInput = renderInput('number', {
      name: `quantidade${rowCount + 1}`,
      min: '1',
      max: '500',
      step: '1',
      inputmode: 'numeric',
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'ghost';
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remover';
    removeBtn.title = 'Remover linha';

    removeBtn.addEventListener('click', () => {
      row.remove();
      this.renumberRows();
    });

    const wrap = (label, element) => {
      const div = document.createElement('div');
      const mobileLabel = document.createElement('span');
      mobileLabel.className = 'mobile-label';
      mobileLabel.textContent = label;
      div.appendChild(mobileLabel);
      div.appendChild(element);
      return div;
    };

    row.appendChild(wrap('Tempero', temperoSelect));
    row.appendChild(wrap('Quantidade', quantidadeInput));
    row.appendChild(removeBtn);

    this.els.linhas.appendChild(row);
  }

  renumberRows() {
    const rows = [...this.els.linhas.children];
    rows.forEach((row, i) => {
      const n = i + 1;
      row.querySelector('select[name^="tempero"]').name = `tempero${n}`;
      row.querySelector('input[name^="quantidade"]').name = `quantidade${n}`;
    });
  }

  handleAddRow() { this.renderIngredientRow(); }

  // ================== Serialização / Validação ==================
  handleEnterKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.els.form.requestSubmit();
    }
  }

  validateForm() {
    const nome = this.els.nomeInput.value.trim();
    if (!nome) {
      this.els.nomeInput.focus();
      throw new Error('Informe o nome da receita.');
    }

    const ingredientes = [];
    const rows = [...this.els.linhas.querySelectorAll('.ingredient-row')];

    for (const row of rows) {
      const tempero = row.querySelector('select[name^="tempero"]').value;
      const quantidade = row.querySelector('input[name^="quantidade"]').value;

      if (!tempero && !quantidade) continue;

      if (!tempero || !quantidade) {
        throw new Error('Preencha tempero e quantidade nos ingredientes selecionados.');
      }

      const numQuantidade = Number(quantidade);
      if (!Number.isInteger(numQuantidade) || numQuantidade < 1 || numQuantidade > 500) {
        throw new Error(`A quantidade de ${tempero} deve ser um número inteiro entre 1 e 500.`);
      }

      ingredientes.push({ tempero, quantidade: numQuantidade });
    }

    if (ingredientes.length === 0) {
      throw new Error('Adicione pelo menos um ingrediente.');
    }
    if (ingredientes.length > 4) {
      throw new Error('Máximo de 4 ingredientes por receita.');
    }
    return { nome, ingredientes };
  }

  // ================== CRUD ==================
  async salvarReceita() {
    let payload;
    try { payload = this.validateForm(); }
    catch (e) { this.toast(e.message, 'err'); return; }

    try {
      await jfetch(`${API_URL}/receitas/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      this.toast('Receita salva com sucesso!', 'ok');
      this.setModeCreate();
      this.selectTab('consultar');
      this.handleListAll();
    } catch (e) {
      if (e.status === 401) return this.openAuthDialog('login');
      this.toast(e.message, 'err');
    }
  }

  async atualizarReceita() {
    if (!this.state.isEditing || !this.state.editId) return;

    let payload;
    try { payload = this.validateForm(); }
    catch (e) { this.toast(e.message, 'err'); return; }

    try {
      await jfetch(`${API_URL}/receitas/${this.state.editId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      this.toast('Receita atualizada!', 'ok');
      this.setModeCreate();
      this.selectTab('consultar');
      this.handleListAll();
    } catch (e) {
      if (e.status === 401) return this.openAuthDialog('login');
      this.toast(e.message, 'err');
    }
  }

  async excluirReceita(id) {
    try {
      await jfetch(`${API_URL}/receitas/${id}`, { method: 'DELETE' });
      this.toast('Receita excluída.', 'ok');

      if (this.state.isEditing && this.state.editId === id) {
        this.setModeCreate();
        this.selectTab('consultar');
      }
      this.handleListAll();
    } catch (e) {
      if (e.status === 401) return this.openAuthDialog('login');
      this.toast(e.message, 'err');
    }
  }

  // ================== Consulta / Autocomplete ==================
  handleLiveInputDebounced() {
    clearTimeout(this._typeTimer);
    this._typeTimer = setTimeout(() => this.handleLiveInput(), TYPING_DEBOUNCE_MS);
  }

  async handleLiveInput() {
    const q = this.els.buscaNome?.value.trim() ?? '';

    if (q.length < AUTOCOMPLETE_MIN_CHARS) {
      if (this.els.listaSugestoes) this.els.listaSugestoes.innerHTML = '';
      this.handleListAll();
      return;
    }

    await Promise.allSettled([this.fetchSuggestions(q), this.fetchSearchResults(q, true)]);
  }

  async fetchSuggestions(q) {
    try {
      if (this._suggestAbort) this._suggestAbort.abort();
      this._suggestAbort = new AbortController();
      const data = await jfetch(
        `${API_URL}/receitas/sugestoes?q=${encodeURIComponent(q)}`,
        { signal: this._suggestAbort.signal }
      );
      if (!this.els.listaSugestoes) return;
      this.els.listaSugestoes.innerHTML = Array.isArray(data)
        ? data.map(s => `<option value="${s.nome} — #${s.id}"></option>`).join('')
        : '';
    } catch (_) { /* silencioso */ }
  }

  async fetchSearchResults(q, quiet = false) {
    try {
      if (this._searchAbort) this._searchAbort.abort();
      this._searchAbort = new AbortController();
      const data = await jfetch(
        `${API_URL}/receitas/?q=${encodeURIComponent(q)}&limit=100`,
        { signal: this._searchAbort.signal }
      );
      this.renderRecipeList(data, { quiet });
    } catch (_) { /* silencioso */ }
  }

  async handleSearchByText() {
    const txt = this.els.buscaNome?.value.trim() ?? '';
    if (!txt) { this.handleListAll(); return; }

    const m = txt.match(/#(\d+)\s*$/);
    if (m) {
      const id = Number(m[1]);
      if (Number.isInteger(id) && id > 0) {
        try {
          const data = await jfetch(`${API_URL}/receitas/${id}`);
          this.renderRecipeList([data]);
        } catch (e) {
          this.renderRecipeList([]);
          if (e.status === 401) this.openAuthDialog('login');
          this.toast(e.message || 'Erro ao buscar', 'err');
        }
        return;
      }
    }

    try {
      const data = await jfetch(`${API_URL}/receitas/?q=${encodeURIComponent(txt)}&limit=100`);
      this.renderRecipeList(data);
    } catch (e) {
      this.renderRecipeList([]);
      if (e.status === 401) this.openAuthDialog('login');
      this.toast(e.message || 'Erro na busca', 'err');
    }
  }

  async handleListAll() {
    this.els.lista.innerHTML = '<p class="form-hint">Carregando...</p>';
    try {
      const data = await jfetch(`${API_URL}/receitas/`);
      this.renderRecipeList(data);
    } catch (e) {
      if (e.status === 401) {
        // sem sessão → mostra CTA para login
        this.renderRecipeList([]);
        this.toast('Entre para ver suas receitas.', 'err');
        return;
      }
      this.renderRecipeList([]);
      this.toast(e.message || 'Falha ao listar', 'err');
    }
  }

  // ---------- Mapeamento dinâmico (rótulo -> frasco preferido) ----------
  _indexRobotCfg(items) {
    const idx = {};
    for (const it of items || []) {
      if (!it?.rotulo) continue;
      const key = String(it.rotulo).trim().toLowerCase();
      if (!idx[key]) idx[key] = [];
      idx[key].push(it);
    }
    // ordena: preferir quem tem g/s definido; empate por frasco asc
    for (const key of Object.keys(idx)) {
      idx[key].sort((a, b) => {
        const ag = Number.isFinite(a.g_por_seg) ? a.g_por_seg : -1;
        const bg = Number.isFinite(b.g_por_seg) ? b.g_por_seg : -1;
        if (ag !== bg) return bg - ag; // quem tem g/s primeiro
        return a.frasco - b.frasco;
      });
    }
    return idx;
  }

  resolveReservoirFor(tempero) {
    if (!tempero) return null;
    const key = String(tempero).trim().toLowerCase();
    const arr = this.robotCfgIndex[key] || [];
    if (!arr.length) return null;
    const cfg = arr[0];
    const gps = Number.isFinite(cfg.g_por_seg) ? Number(cfg.g_por_seg) : null;
    return { frasco: cfg.frasco, gps };
  }

  resolveMapping(ingredientes) {
    const mapped = [];
    const missingMap = new Set();
    const missingCal = new Set();

    for (const ing of ingredientes || []) {
      const match = this.resolveReservoirFor(ing.tempero);
      if (!match) {
        missingMap.add(ing.tempero);
        continue;
      }
      if (!match.gps || match.gps <= 0) {
        missingCal.add(ing.tempero);
        continue;
      }
      mapped.push({
        tempero: ing.tempero,
        quantidade: ing.quantidade,
        frasco: match.frasco,
        gps: match.gps,
      });
    }
    return {
      mapped,
      missingMap: Array.from(missingMap),
      missingCal: Array.from(missingCal),
    };
  }

  // ---------- helpers de UI do card ----------
  _makeIngredientLi(ing) {
    const li = document.createElement('li');
    li.className = 'ingredient-line';

    // tenta resolver frasco pra mostrar badge
    const resolved = this.resolveReservoirFor(ing.tempero);
    if (resolved?.frasco) {
      const badge = document.createElement('span');
      badge.className = `reservoir-badge r${resolved.frasco}`;
      badge.innerHTML = `
        <span class="full">Reservatório ${resolved.frasco}</span>
        <span class="short">R${resolved.frasco}</span>
      `;
      li.appendChild(badge);
    }

    const name = document.createElement('span');
    name.className = 'ingredient-name';
    name.textContent = ing.tempero;

    const qty = document.createElement('span');
    qty.className = 'qty';
    qty.textContent = `${ing.quantidade} g`;

    li.append(name, qty);
    return li;
  }

  renderRecipeList(recipes, { quiet = false } = {}) {
    const listEl = this.els.lista;
    listEl.innerHTML = '';

    if (!Array.isArray(recipes) || recipes.length === 0) {
      listEl.innerHTML = `
        <div class="recipe-item">
          <h4>${this.user ? 'Nenhuma receita cadastrada ainda.' : 'Faça login para ver suas receitas.'}</h4>
          <p class="hint">${this.user ? 'Que tal começar criando sua primeira receita?' : 'Use o botão abaixo para entrar.'}</p>
          <div class="actions" style="grid-template-columns:1fr">
            <button type="button" id="ctaPrimario" class="primary">${this.user ? 'Criar receita' : 'Entrar'}</button>
          </div>
        </div>`;
      const btn = document.getElementById('ctaPrimario');
      if (btn) btn.addEventListener('click', () => {
        if (this.user) {
          this.setModeCreate();
          this.selectTab('montar');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          this.openAuthDialog('login');
        }
      });
      return;
    }

    for (const recipe of recipes) {
      const item = document.createElement('article');
      item.className = 'recipe-item';
      item.dataset.id = String(recipe.id);

      item.innerHTML = `
        <div class="card-actions">
          <button type="button" class="icon-btn primary" data-action="play" title="Executar receita" aria-label="Executar receita">
            <span class="icon icon-play" aria-hidden="true"></span>
          </button>
          <button type="button" class="icon-btn ghost" data-action="editar" title="Editar receita" aria-label="Editar receita">
            <span class="icon icon-edit" aria-hidden="true"></span>
          </button>
          <button type="button" class="icon-btn dark" data-action="excluir" title="Excluir receita" aria-label="Excluir receita">
            <span class="icon icon-trash" aria-hidden="true"></span>
          </button>
        </div>

        <h4>${recipe.nome || 'Receita sem nome'}</h4>
        <small class="form-hint">ID: ${recipe.id || '—'}</small>
        <ul class="ingredients"></ul>
      `;

      const ul = item.querySelector('.ingredients');
      (recipe.ingredientes || []).forEach(ing => ul.appendChild(this._makeIngredientLi(ing)));

      listEl.appendChild(item);
    }

    if (!quiet) this.toast('Resultados carregados.', 'ok');
  }

  // ================== Carregar no formulário (Editar) ==================
  async loadRecipeIntoForm(id) {
    try {
      const recipe = await jfetch(`${API_URL}/receitas/${id}`);
      this.els.form.reset();
      this.els.nomeInput.value = recipe.nome || '';

      this.els.linhas.innerHTML = '';
      const itens = Array.isArray(recipe.ingredientes) ? recipe.ingredientes : [];
      if (itens.length === 0) this.renderIngredientRow();
      itens.forEach((ing, idx) => {
        this.renderIngredientRow();
        const row = this.els.linhas.children[idx];
        const temperoSelect = row.querySelector('select[name^="tempero"]');
        const quantidadeInput = row.querySelector('input[name^="quantidade"]');

        temperoSelect.value = ing.tempero || '';
        quantidadeInput.value = String(ing.quantidade ?? '');
      });

      this.setModeEdit(recipe);
      this.selectTab('montar');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      if (e.status === 401) return this.openAuthDialog('login');
      this.toast(String(e.message || e), 'err');
    }
  }

  // ================== Robô: carregar / salvar ==================
  _readRobotFields() {
    const arr = [];
    for (let i = 1; i <= 4; i++) {
      const f = this.els.roboFields[i];
      const rotulo = f.rotulo.value.trim() || null;
      const conteudo = f.conteudo.value.trim() || null;
      const gtxt = f.g.value.trim();
      const g = gtxt === '' ? null : Number(gtxt);
      arr.push({ frasco: i, rotulo, conteudo, g_por_seg: Number.isFinite(g) ? g : null });
    }
    return arr;
  }

  _fillRobotFields(items) {
    // zera
    for (let i = 1; i <= 4; i++) {
      const f = this.els.roboFields[i];
      f.rotulo.value = '';
      f.conteudo.value = '';
      f.g.value = '';
    }
    // preenche
    for (const it of (items || [])) {
      const f = this.els.roboFields[it.frasco];
      if (!f) continue;
      f.rotulo.value = it.rotulo ?? '';
      f.conteudo.value = it.conteudo ?? '';
      f.g.value = (it.g_por_seg ?? '') === '' ? '' : String(it.g_por_seg);
    }
  }

  async loadRobotConfig(forceToast = false) {
    try {
      const data = await jfetch(`${API_URL}/config/robo`);
      this.robotCfg = Array.isArray(data) ? data : [];
      this.robotCfgIndex = this._indexRobotCfg(this.robotCfg);
      this._fillRobotFields(this.robotCfg);
      this.state.roboLoaded = true;
      if (forceToast) this.toast('Configuração carregada.', 'ok');
    } catch (e) {
      if (e.status === 401) return this.openAuthDialog('login');
      this.toast(e.message || 'Falha ao carregar configuração', 'err');
    }
  }

  async saveRobotConfig() {
    const payload = this._readRobotFields();
    try {
      await jfetch(`${API_URL}/config/robo`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      this.toast('Configuração salva!', 'ok');
      this.state.roboLoaded = false; // força recarga futura
    } catch (e) {
      if (e.status === 401) return this.openAuthDialog('login');
      this.toast(e.message || 'Falha ao salvar configuração', 'err');
    }
  }

  // ================== Play com multiplicador ==================
  _ensureRobotLoaded = async () => {
    if (!this.state.roboLoaded) { await this.loadRobotConfig(); }
  };

  _openRunDialog(recipe, mapping) {
    if (!this.runDlg) {
      const dlg = document.createElement('dialog');
      dlg.id = 'dlgRun';
      dlg.innerHTML = `
        <form method="dialog" style="min-width: 320px">
          <h3 id="runTitle" style="margin:0 0 8px">Executar</h3>

          <label for="runMult">Multiplicador</label>
          <div style="display:grid;grid-template-columns:1fr auto auto auto;gap:8px">
            <input id="runMult" type="number" min="1" max="99" step="1" value="1" inputmode="numeric" />
            <button type="button" class="ghost" data-quick="1">1×</button>
            <button type="button" class="ghost" data-quick="2">2×</button>
            <button type="button" class="ghost" data-quick="3">3×</button>
          </div>

          <details style="margin-top:10px">
            <summary>Prévia dos tempos</summary>
            <ul id="runPreview" class="ingredients" style="margin-top:8px"></ul>
          </details>

          <div class="actions" style="grid-template-columns: 1fr 1fr; margin-top: 12px">
            <button id="runCancel" type="button" class="ghost">Cancelar</button>
            <button id="runConfirm" class="primary" type="button">Executar</button>
          </div>
          <p class="hint" id="runHint" style="margin-top:6px"></p>
        </form>`;
      document.body.appendChild(dlg);
      this.runDlg = dlg;

      // binds estáticos
      dlg.querySelector('#runCancel').addEventListener('click', () => dlg.close('cancel'));
      // quick buttons
      dlg.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-quick]');
        if (!btn) return;
        ev.preventDefault();
        const mult = Number(btn.dataset.quick);
        const input = dlg.querySelector('#runMult');
        input.value = String(mult);
        this._renderRunPreview();
      });
      // alterações do multiplicador
      dlg.querySelector('#runMult').addEventListener('input', () => this._renderRunPreview());
    }

    // salva contexto atual pra preview/execução
    this._runCtx = { recipe, mapping };
    this.runDlg.querySelector('#runTitle').textContent = `Executar: ${recipe.nome}`;
    this.runDlg.querySelector('#runHint').textContent = '';

    // (re)bind confirmar a cada abertura
    const confirmBtn = this.runDlg.querySelector('#runConfirm');
    confirmBtn.replaceWith(confirmBtn.cloneNode(true)); // remove listeners antigos
    const newConfirm = this.runDlg.querySelector('#runConfirm');
    newConfirm.addEventListener('click', async () => {
      const mult = Math.max(1, Math.min(99, Number(this.runDlg.querySelector('#runMult').value || 1)));
      try {
        newConfirm.disabled = true;
        const data = await jfetch(`${API_URL}/jobs`, {
          method: 'POST',
          body: JSON.stringify({ receita_id: recipe.id, multiplicador: mult }),
        });
        this.toast(data?.detail || 'Receita enviada ao robô!', 'ok');
        this.runDlg.close('ok');
      } catch (e) {
        const msg = e?.data?.detail || e.message || 'Falha ao iniciar execução';
        this.runDlg.querySelector('#runHint').textContent = msg;
        this.toast(msg, 'err');
      } finally {
        newConfirm.disabled = false;
      }
    });

    // renderiza preview e abre
    this._renderRunPreview();
    this.runDlg.showModal();
  }

  _renderRunPreview() {
    const ctx = this._runCtx;
    if (!ctx) return;
    const mult = Math.max(1, Math.min(99, Number(this.runDlg.querySelector('#runMult').value || 1)));
    const ul = this.runDlg.querySelector('#runPreview');
    ul.innerHTML = '';

    for (const it of ctx.mapping.mapped) {
      const total = it.quantidade * mult;
      const secs = it.gps > 0 ? Math.round((total / it.gps) * 1000) / 1000 : 0;
      const li = document.createElement('li');
      li.className = 'ingredient-line';
      const badge = document.createElement('span');
      badge.className = `reservoir-badge r${it.frasco}`;
      badge.innerHTML = `<span class="short">R${it.frasco}</span><span class="full">Reservatório ${it.frasco}</span>`;
      const name = document.createElement('span');
      name.className = 'ingredient-name';
      name.textContent = it.tempero;
      const qty = document.createElement('span');
      qty.className = 'qty';
      qty.textContent = `${it.quantidade} g × ${mult} = ${total} g • ${secs}s`;
      li.append(badge, name, qty);
      ul.appendChild(li);
    }
  }

  async runRecipe(id, btnEl) {
    try {
      if (btnEl) btnEl.disabled = true;

      await this._ensureRobotLoaded();
      const recipe = await jfetch(`${API_URL}/receitas/${id}`);

      // valida mapeamento no cliente para UX
      const mapping = this.resolveMapping(recipe.ingredientes || []);
      if (mapping.missingMap?.length) {
        this.toast(`Mapeamento ausente: ${mapping.missingMap.join(', ')}. Defina na aba Robô.`, 'err');
        return;
      }
      if (mapping.missingCal?.length) {
        this.toast(`Calibração pendente (g/s) para: ${mapping.missingCal.join(', ')}. Aba Robô.`, 'err');
        return;
      }

      // abre diálogo com multiplicador + preview
      this._openRunDialog(recipe, mapping);
    } catch (e) {
      if (e.status === 401) return this.openAuthDialog('login');
      const msg = e?.data?.detail || e.message || 'Falha ao iniciar execução';
      this.toast(msg, 'err');
    } finally {
      if (btnEl) btnEl.disabled = false;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
