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

const RESERVOIRS = [
  { value: '', label: '—' },
  { value: '1', label: 'Reservatório 1' },
  { value: '2', label: 'Reservatório 2' },
  { value: '3', label: 'Reservatório 3' },
  { value: '4', label: 'Reservatório 4' },
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
    this.state = { isEditing: false, editId: null };
    this.user = null; // {id, nome} quando logado

    this.els = {
      // abas e panes
      tabMontar: document.getElementById('tab-montar'),
      tabConsultar: document.getElementById('tab-consultar'),
      paneMontar: document.getElementById('pane-montar'),
      paneConsultar: document.getElementById('pane-consultar'),

      // formulário
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

      // consulta (por nome com autocomplete)
      buscaNome: document.getElementById('q'),
      listaSugestoes: document.getElementById('listaSugestoes'),
      btnBuscar: document.getElementById('btnBuscar'),
      btnListar: document.getElementById('btnListar'),
      lista: document.getElementById('lista'),

      // ui
      dlgExcluir: document.getElementById('dlgExcluir'),
      toast: document.getElementById('toast'),
      headerRow: document.querySelector('.header-row'),
    };

    // timers / abort
    this._typeTimer = null;
    this._suggestAbort = null;
    this._searchAbort = null;

    // auth modal
    this.authDlg = null;

    this.init();
  }

  // ========= INIT =========
  async init() {
    this.injectAuthBox();
    this.bindEvents();
    await this.refreshAuth(); // tenta descobrir sessão atual
    this.renderIngredientRow(); // primeira linha vazia
    this.selectTab('consultar');
    this.handleListAll();
  }

  // ========= AUTH UI =========
  injectAuthBox() {
    const box = document.createElement('div');
    box.className = 'auth-box';
    box.style.marginLeft = 'auto';
    box.style.display = 'flex';
    box.style.gap = '8px';
    this.els.headerRow?.appendChild(box);
    this.els.authBox = box;
    this.renderAuthBox();
  }

  renderAuthBox() {
    if (!this.els.authBox) return;
    this.els.authBox.innerHTML = '';

    if (this.user) {
      const hello = document.createElement('span');
      hello.textContent = `Olá, ${this.user.nome}`;
      hello.style.alignSelf = 'center';
      hello.style.opacity = '0.85';

      const btnOut = document.createElement('button');
      btnOut.className = 'ghost';
      btnOut.type = 'button';
      btnOut.textContent = 'Sair';
      btnOut.addEventListener('click', () => this.logout());

      this.els.authBox.append(hello, btnOut);
    } else {
      const btnIn = document.createElement('button');
      btnIn.className = 'ghost';
      btnIn.type = 'button';
      btnIn.textContent = 'Entrar';
      btnIn.addEventListener('click', () => this.openAuthDialog('login'));

      const btnUp = document.createElement('button');
      btnUp.className = 'ghost';
      btnUp.type = 'button';
      btnUp.textContent = 'Registrar';
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
            <button value="cancel" class="ghost" type="submit">Cancelar</button>
            <button id="authSubmit" class="primary" type="button">Confirmar</button>
          </div>
          <p class="hint" id="authHint" style="margin-top:6px"></p>
        </form>`;
      document.body.appendChild(dlg);
      this.authDlg = dlg;

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
          this.handleListAll();
        } catch (e) {
          this.toast(e.message || 'Falha na autenticação', 'err');
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

    // Consulta: busca ao digitar + Enter + Botão
    if (this.els.buscaNome) {
      this.els.buscaNome.addEventListener('input', () => this.handleLiveInputDebounced());
      this.els.buscaNome.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.handleSearchByText(); }
      });
    }
    this.els.btnBuscar.addEventListener('click', () => this.handleSearchByText());
    this.els.btnListar.addEventListener('click', () => this.handleListAll());

    // Delegação: cliques em Editar/Excluir dentro da lista
    this.els.lista.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const card = btn.closest('.recipe-item, article.recipe-item');
      const id = Number(card?.dataset?.id);
      if (!id) return;

      if (btn.dataset.action === 'editar') {
        if (!this.ensureAuthOrPrompt()) return;
        this.loadRecipeIntoForm(id);
      }
      if (btn.dataset.action === 'excluir') {
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
    this.els.tabMontar.setAttribute('aria-selected', isMontar);
    this.els.tabConsultar.setAttribute('aria-selected', !isMontar);
    this.els.paneMontar.hidden = !isMontar;
    this.els.paneConsultar.hidden = isMontar;
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
    const reservatorioSelect = renderSelect(RESERVOIRS, { name: `reservatorio${rowCount + 1}`, disabled: 'true' });
    const quantidadeInput = renderInput('number', {
      name: `quantidade${rowCount + 1}`,
      min: '1',
      max: '500',
      step: '1',
      disabled: 'true',
      inputmode: 'numeric',
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'ghost';
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remover';
    removeBtn.title = 'Remover linha';

    temperoSelect.addEventListener('change', () => {
      const hasValue = temperoSelect.value !== '';
      reservatorioSelect.disabled = !hasValue;
      quantidadeInput.disabled = !hasValue;
      if (!hasValue) {
        reservatorioSelect.value = '';
        quantidadeInput.value = '';
      }
    });

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
    row.appendChild(wrap('Reservatório', reservatorioSelect));
    row.appendChild(wrap('Quantidade', quantidadeInput));
    row.appendChild(removeBtn);

    this.els.linhas.appendChild(row);
  }

  renumberRows() {
    const rows = [...this.els.linhas.children];
    rows.forEach((row, i) => {
      const n = i + 1;
      row.querySelector('select[name^="tempero"]').name = `tempero${n}`;
      row.querySelector('select[name^="reservatorio"]').name = `reservatorio${n}`;
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
    const usedReservoirs = new Set();
    const rows = [...this.els.linhas.querySelectorAll('.ingredient-row')];

    for (const row of rows) {
      const tempero = row.querySelector('select[name^="tempero"]').value;
      const reservatorio = row.querySelector('select[name^="reservatorio"]').value;
      const quantidade = row.querySelector('input[name^="quantidade"]').value;

      if (!tempero && !reservatorio && !quantidade) continue;

      if (!tempero || !reservatorio || !quantidade) {
        throw new Error('Preencha todos os campos dos ingredientes selecionados.');
      }

      const numReservatorio = Number(reservatorio);
      const numQuantidade = Number(quantidade);

      if (usedReservoirs.has(numReservatorio)) {
        throw new Error(`O reservatório ${numReservatorio} foi repetido.`);
      }
      usedReservoirs.add(numReservatorio);

      if (!Number.isInteger(numQuantidade) || numQuantidade < 1 || numQuantidade > 500) {
        throw new Error(`A quantidade de ${tempero} deve ser um número inteiro entre 1 e 500.`);
      }

      ingredientes.push({ tempero, frasco: numReservatorio, quantidade: numQuantidade });
    }

    if (ingredientes.length === 0) {
      throw new Error('Adicione pelo menos um ingrediente.');
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

  // ================== Consulta / Autocomplete ao digitar ==================
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

  // ---------- helpers de UI do card ----------
  _makeIngredientLi(ing) {
    const li = document.createElement('li');
    li.className = 'ingredient-line';

    const badge = document.createElement('span');
    badge.className = `reservoir-badge r${ing.frasco}`;
    badge.innerHTML = `
      <span class="full">Reservatório ${ing.frasco}</span>
      <span class="short">R${ing.frasco}</span>
    `;

    const name = document.createElement('span');
    name.className = 'ingredient-name';
    name.textContent = ing.tempero;

    const qty = document.createElement('span');
    qty.className = 'qty';
    qty.textContent = `${ing.quantidade} g`;

    li.append(badge, name, qty);
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
        const reservatorioSelect = row.querySelector('select[name^="reservatorio"]');
        const quantidadeInput = row.querySelector('input[name^="quantidade"]');

        temperoSelect.value = ing.tempero || '';
        temperoSelect.dispatchEvent(new Event('change', { bubbles: true }));
        reservatorioSelect.value = String(ing.frasco ?? '');
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
}

document.addEventListener('DOMContentLoaded', () => { new App(); });
