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

// ================== Componentes da Aplicação ==================
class App {
  constructor() {
    this.els = {
      form: document.getElementById('formReceita'),
      nomeInput: document.getElementById('nome'),
      linhas: document.getElementById('linhas'),
      addBtn: document.getElementById('addLinha'),
      saida: document.getElementById('saida'),
      tabMontar: document.getElementById('tab-montar'),
      tabConsultar: document.getElementById('tab-consultar'),
      paneMontar: document.getElementById('pane-montar'),
      paneConsultar: document.getElementById('pane-consultar'),
      idBusca: document.getElementById('idBusca'),
      lista: document.getElementById('lista'),
      btnBuscar: document.getElementById('btnBuscar'),
      btnListar: document.getElementById('btnListar'),
      btnTeste: document.getElementById('btnTeste'),
      toast: document.getElementById('toast'),
    };
    this.init();
  }

  init() {
    this.bindEvents();
    this.renderIngredientRow();
  }

  bindEvents() {
    this.els.form.addEventListener('submit', this.handleFormSubmit.bind(this));
    this.els.nomeInput.addEventListener('keydown', this.handleEnterKey.bind(this));
    this.els.addBtn.addEventListener('click', this.handleAddRow.bind(this));
    this.els.tabMontar.addEventListener('click', () => this.selectTab('montar'));
    this.els.tabConsultar.addEventListener('click', () => this.selectTab('consultar'));
    this.els.btnBuscar.addEventListener('click', this.handleSearchById.bind(this));
    this.els.btnListar.addEventListener('click', this.handleListAll.bind(this));
    this.els.btnTeste.addEventListener('click', this.handleQuickTest.bind(this));
  }

  // ================== Funções de UI ==================
  toast(message, type = '') {
    const t = this.els.toast;
    t.textContent = message;
    const color = type === 'err' ? 'var(--color-danger)' : (type === 'ok' ? 'var(--color-success)' : 'var(--color-ink)');
    t.style.backgroundColor = color;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  }

  selectTab(which) {
    const isMontar = which === 'montar';
    this.els.tabMontar.setAttribute('aria-selected', isMontar);
    this.els.tabConsultar.setAttribute('aria-selected', !isMontar);
    this.els.paneMontar.hidden = !isMontar;
    this.els.paneConsultar.hidden = isMontar;
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

    // Envolve os elementos para melhor responsividade em mobile
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

  handleAddRow() {
    this.renderIngredientRow();
  }

  // ================== Lógica do Formulário ==================
  handleEnterKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.els.form.requestSubmit();
    }
  }

  handleFormSubmit(e) {
    e.preventDefault();
    this.salvarReceita();
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

      ingredientes.push({
        tempero: tempero,
        frasco: numReservatorio,
        quantidade: numQuantidade,
      });
    }

    if (ingredientes.length === 0) {
      throw new Error('Adicione pelo menos um ingrediente.');
    }
    return { nome, ingredientes };
  }

  async salvarReceita() {
    let payload;
    try {
      payload = this.validateForm();
    } catch (e) {
      this.toast(e.message, 'err');
      return;
    }

    this.els.saida.textContent = 'Enviando JSON...';
    try {
      const response = await fetch(`${API_URL}/receitas/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      this.els.saida.textContent = JSON.stringify(data, null, 2);

      if (!response.ok) {
        throw new Error(data?.detail || 'Erro ao salvar (JSON)');
      }

      this.toast('Receita salva com sucesso!', 'ok');
      this.els.form.reset();
      this.els.linhas.innerHTML = '';
      this.renderIngredientRow();

    } catch (e) {
      this.toast(e.message, 'err');
      // Fallback
      this.fallbackFormSubmit(payload);
    }
  }

  fallbackFormSubmit(payload) {
    this.toast('Tentando fallback /receitas/form...', '');
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
  }

  createHiddenInput(name, value) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    return input;
  }

  // ================== Ações de Consulta ==================
  async handleSearchById() {
    const id = Number(this.els.idBusca.value);
    if (!Number.isInteger(id) || id <= 0) {
      this.toast('ID inválido. Use um número inteiro maior que zero.', 'err');
      return;
    }
    this.els.lista.innerHTML = '<p class="form-hint">Carregando...</p>';

    try {
      const response = await fetch(`${API_URL}/receitas/${id}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || 'Receita não encontrada.');
      }
      this.renderRecipeList([data]);
    } catch (e) {
      this.els.lista.innerHTML = `<p class="form-hint">${e.message}</p>`;
      this.toast(e.message, 'err');
    }
  }

  async handleListAll() {
    this.els.lista.innerHTML = '<p class="form-hint">Carregando...</p>';
    try {
      const response = await fetch(`${API_URL}/receitas/`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error('Erro ao listar receitas.');
      }
      this.renderRecipeList(data);
    } catch (e) {
      this.els.lista.innerHTML = `<p class="form-hint">${e.message}</p>`;
      this.toast(e.message, 'err');
    }
  }

  renderRecipeList(recipes) {
    const listEl = this.els.lista;
    listEl.innerHTML = '';
    if (!Array.isArray(recipes) || recipes.length === 0) {
      listEl.innerHTML = '<p class="form-hint">Nenhuma receita encontrada.</p>';
      return;
    }

    recipes.forEach(recipe => {
      const item = document.createElement('div');
      item.className = 'recipe-item';
      item.innerHTML = `<h4>${recipe.nome || 'Receita sem nome'}</h4>
                        <small class="form-hint">ID: ${recipe.id || '—'}</small>`;

      const tagsContainer = document.createElement('div');
      tagsContainer.className = 'recipe-tags';

      (recipe.ingredientes || []).forEach(ing => {
        const tag = document.createElement('span');
        tag.className = 'recipe-tag';
        tag.textContent = `${ing.tempero} · R${ing.frasco} · ${ing.quantidade}g`;
        tagsContainer.appendChild(tag);
      });
      item.appendChild(tagsContainer);
      listEl.appendChild(item);
    });
    this.toast('Resultados carregados.', 'ok');
  }

  async handleQuickTest() {
    const payload = {
      nome: 'Receita Teste Rápido',
      ingredientes: [
        { tempero: 'pimenta', frasco: 1, quantidade: 2 },
        { tempero: 'sal', frasco: 2, quantidade: 1 },
      ],
    };
    this.els.saida.textContent = 'Enviando teste...';
    try {
      const response = await fetch(`${API_URL}/receitas/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      this.els.saida.textContent = JSON.stringify(data, null, 2);
      this.toast(response.ok ? 'Teste OK' : 'Erro no teste', response.ok ? 'ok' : 'err');
    } catch (e) {
      this.els.saida.textContent = e.message;
      this.toast('Erro no teste de API', 'err');
    }
  }
}

// Inicia a aplicação após o DOM estar totalmente carregado
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
