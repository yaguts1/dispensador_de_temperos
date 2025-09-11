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

// ================== App ==================
class App {
  constructor() {
    this.state = { isEditing: false, editId: null };

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
      tplCard: document.getElementById('tpl-receita'),

      // ui
      dlgExcluir: document.getElementById('dlgExcluir'),
      toast: document.getElementById('toast'),
    };

    // controle de debounce / abort
    this._typeTimer = null;
    this._suggestAbort = null;
    this._searchAbort = null;

    this.init();
  }

  init() {
    this.bindEvents();
    this.renderIngredientRow(); // primeira linha vazia
    this.selectTab('consultar');
    this.handleListAll();
  }

  bindEvents() {
    // Tabs
    this.els.tabMontar.addEventListener('click', () => this.selectTab('montar'));
    this.els.tabConsultar.addEventListener('click', () => this.selectTab('consultar'));

    // Form
    if (this.els.form) {
      this.els.form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (this.state.isEditing) this.atualizarReceita();
        else this.salvarReceita();
      });
    }
    this.els.nomeInput.addEventListener('keydown', (e) => this.handleEnterKey(e));
    this.els.addBtn.addEventListener('click', () => this.handleAddRow());

    // Botões de edição no formulário
    this.els.btnAtualizar.addEventListener('click', () => this.atualizarReceita());
    this.els.btnCancelarEdicao.addEventListener('click', () => this.setModeCreate());
    this.els.btnExcluirAtual.addEventListener('click', async () => {
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

      if (btn.dataset.action === 'editar') this.loadRecipeIntoForm(id);
      if (btn.dataset.action === 'excluir') {
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

    // reinicia animação
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
      const response = await fetch(`${API_URL}/receitas/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Erro ao salvar (JSON)');

      this.toast('Receita salva com sucesso!', 'ok');
      this.setModeCreate();
      this.selectTab('consultar');
      this.handleListAll();
    } catch (e) {
      this.toast(e.message, 'err');
      this.fallbackFormSubmit(payload); // apenas criação
    }
  }

  async atualizarReceita() {
    if (!this.state.isEditing || !this.state.editId) return;

    let payload;
    try { payload = this.validateForm(); }
    catch (e) { this.toast(e.message, 'err'); return; }

    try {
      const response = await fetch(`${API_URL}/receitas/${this.state.editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || `HTTP ${response.status}`);

      this.toast('Receita atualizada!', 'ok');
      this.setModeCreate();
      this.selectTab('consultar');
      this.handleListAll();
    } catch (e) {
      this.toast(e.message, 'err');
    }
  }

  async excluirReceita(id) {
    try {
      const response = await fetch(`${API_URL}/receitas/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        let msg = `Erro ao excluir (HTTP ${response.status})`;
        try {
          const data = await response.json();
          if (data?.detail) msg = `Erro ao excluir: ${data.detail}`;
        } catch {}
        throw new Error(msg);
      }
      this.toast('Receita excluída.', 'ok');

      if (this.state.isEditing && this.state.editId === id) {
        this.setModeCreate();
        this.selectTab('consultar');
      }
      this.handleListAll();
    } catch (e) {
      this.toast(e.message, 'err');
    }
  }

  // Fallback de formulário (somente criação)
  fallbackFormSubmit(payload) {
    try {
      const tempForm = document.createElement('form');
      tempForm.action = `${API_URL}/receitas/form`;
      tempForm.method = 'POST';
      tempForm.target = '_blank';
      tempForm.style.display = 'none';

      tempForm.appendChild(this.createHiddenInput('nome', payload.nome));
      payload.ingredientes.forEach((it, i) => {
        const n = i + 1;
        tempForm.appendChild(this.createHiddenInput(`tempero${n}`, it.tempero));
        tempForm.appendChild(this.createHiddenInput(`reservatorio${n}`, String(it.frasco)));
        tempForm.appendChild(this.createHiddenInput(`quantidade${n}`, String(it.quantidade)));
      });

      document.body.appendChild(tempForm);
      tempForm.submit();
      tempForm.remove();
      this.toast('Enviado via fallback.', 'ok');
    } catch {
      this.toast('Não foi possível usar o fallback.', 'err');
    }
  }

  createHiddenInput(name, value) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    return input;
  }

  // ================== Consulta / Autocomplete ao digitar ==================
  handleLiveInputDebounced() {
    clearTimeout(this._typeTimer);
    this._typeTimer = setTimeout(() => this.handleLiveInput(), TYPING_DEBOUNCE_MS);
  }

  async handleLiveInput() {
    const q = this.els.buscaNome?.value.trim() ?? '';

    // Limpa sugestões quando vazio e mostra todas as receitas
    if (q.length < AUTOCOMPLETE_MIN_CHARS) {
      if (this.els.listaSugestoes) this.els.listaSugestoes.innerHTML = '';
      this.handleListAll();
      return;
    }

    // dispara em paralelo: sugestões + resultados
    await Promise.allSettled([this.fetchSuggestions(q), this.fetchSearchResults(q, true)]);
  }

  async fetchSuggestions(q) {
    try {
      if (this._suggestAbort) this._suggestAbort.abort();
      this._suggestAbort = new AbortController();
      const resp = await fetch(
        `${API_URL}/receitas/sugestoes?q=${encodeURIComponent(q)}`,
        { signal: this._suggestAbort.signal }
      );
      const data = await resp.json().catch(() => []);
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
      const resp = await fetch(
        `${API_URL}/receitas/?q=${encodeURIComponent(q)}&limit=100`,
        { signal: this._searchAbort.signal }
      );
      const data = await resp.json().catch(() => []);
      if (!resp.ok) throw new Error('Erro na busca.');
      this.renderRecipeList(data, { quiet });
    } catch (_) { /* silencioso para não poluir enquanto digita */ }
  }

  async handleSearchByText() {
    const txt = this.els.buscaNome?.value.trim() ?? '';
    if (!txt) { this.handleListAll(); return; }

    // se terminar com "#ID", busca direta por id
    const m = txt.match(/#(\d+)\s*$/);
    if (m) {
      const id = Number(m[1]);
      if (Number.isInteger(id) && id > 0) {
        try {
          const response = await fetch(`${API_URL}/receitas/${id}`);
          const data = await response.json();
          if (!response.ok) throw new Error(data?.detail || 'Receita não encontrada.');
          this.renderRecipeList([data]);
        } catch (e) {
          this.renderRecipeList([]);
          this.toast(e.message || 'Erro ao buscar', 'err');
        }
        return;
      }
    }

    // caso contrário, filtra por nome
    try {
      const response = await fetch(`${API_URL}/receitas/?q=${encodeURIComponent(txt)}&limit=100`);
      const data = await response.json();
      if (!response.ok) throw new Error('Erro na busca.');
      this.renderRecipeList(data);
    } catch (e) {
      this.renderRecipeList([]); // mostra CTA de criar
      this.toast(e.message || 'Erro na busca', 'err');
    }
  }

  async handleListAll() {
    this.els.lista.innerHTML = '<p class="form-hint">Carregando...</p>';
    try {
      const response = await fetch(`${API_URL}/receitas/`);
      const data = await response.json();
      if (!response.ok) throw new Error('Erro ao listar receitas.');
      this.renderRecipeList(data);
    } catch (e) {
      this.renderRecipeList([]); // mostra CTA de criar
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
          <h4>Nenhuma receita cadastrada ainda.</h4>
          <p class="hint">Que tal começar criando sua primeira receita?</p>
          <div class="actions" style="grid-template-columns:1fr">
            <button type="button" id="ctaCriar" class="primary">Criar receita</button>
          </div>
        </div>`;
      const btn = document.getElementById('ctaCriar');
      if (btn) btn.addEventListener('click', () => {
        this.setModeCreate();
        this.selectTab('montar');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      return;
    }

    // Sempre gera o card com ícones inline (sem depender de <template>)
    for (const recipe of recipes) {
      const item = document.createElement('article');
      item.className = 'recipe-item';
      item.dataset.id = String(recipe.id);

      item.innerHTML = `
        <div class="card-actions">
          <button type="button" class="icon-btn ghost" data-action="editar" title="Editar receita" aria-label="Editar receita">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm14.85-9.9c.2-.2.2-.51 0-.71l-2.49-2.49a.5.5 0 0 0-.71 0l-1.83 1.83 3.75 3.75 1.28-1.28z"/>
            </svg>
          </button>
          <button type="button" class="icon-btn dark" data-action="excluir" title="Excluir receita" aria-label="Excluir receita">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="currentColor" d="M6 7h12v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7zm3-3h6l1 1h3v2H5V5h3l1-1z"/>
            </svg>
          </button>
        </div>

        <h4>${recipe.nome || 'Receita sem nome'}</h4>
        <small class="form-hint">ID: ${recipe.id || '—'}</small>
        <ul class="ingredients"></ul>
      `;

      // Preenche a lista rica de ingredientes
      const ul = item.querySelector('.ingredients');
      (recipe.ingredientes || []).forEach(ing => {
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
        ul.appendChild(li);
      });

      listEl.appendChild(item);
    }

    if (!quiet) this.toast('Resultados carregados.', 'ok');
  }


  // ================== Carregar no formulário (Editar) ==================
  async loadRecipeIntoForm(id) {
    try {
      const response = await fetch(`${API_URL}/receitas/${id}`);
      const recipe = await response.json();
      if (!response.ok) throw new Error(recipe?.detail || 'Receita não encontrada.');

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
      this.toast(String(e.message || e), 'err');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => { new App(); });
