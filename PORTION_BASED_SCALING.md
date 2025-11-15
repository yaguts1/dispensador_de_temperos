# 🍽️ Proposta: Scaling Baseado em Porções

## 📋 Visão Geral

**Problema Atual:**
- Slider 1-99× é vago: usuário não sabe quantas porções está fazendo
- 2× pode significar "dobra" ou algo completamente diferente
- Sem referência de quantidade original, fica impreciso

**Solução Proposta:**
- Receitas cadastradas com **porção base** (ex: "para 4 pessoas")
- Ao executar: usuário escolhe **quantas pessoas serão servidas**
- App calcula automaticamente: quantidade final = (quantidade base / porção_base) × pessoas_desejadas

**Exemplo:**
```
Receita: "Tempero para Churrasco"
├─ Porção base: 4 pessoas
├─ Sal: 20g
├─ Pimenta: 10g

Usuário quer fazer para 8 pessoas:
├─ Sal: (20 / 4) × 8 = 40g
├─ Pimenta: (10 / 4) × 8 = 20g
```

---

## 🗄️ Alterações no Schema

### **1. Tabela `receitas` - Adicionar `porcoes`**

```sql
ALTER TABLE receitas ADD COLUMN porcoes INTEGER DEFAULT 1 NOT NULL;
```

**Detalhes:**
- `porcoes` = número de pessoas para o qual a receita foi calibrada
- DEFAULT 1 = receita básica (pode duplicar, triplicar, etc.)
- Exemplos reais:
  - `porcoes = 4` → "Tempero para churrasco (4 pessoas)"
  - `porcoes = 2` → "Sal para camarim (2 pessoas)"
  - `porcoes = 6` → "Mix gourmet (6 pessoas)"

### **2. Tabela `jobs` - Adicionar `pessoas_solicitadas`**

```sql
ALTER TABLE jobs ADD COLUMN pessoas_solicitadas INTEGER DEFAULT NULL;
```

**Detalhes:**
- Rastreia quantas pessoas o usuário pediu
- Usado para auditoria e replay
- Se NULL → job antigo (compatibilidade)

### **3. Remover `multiplicador`?**

**Opção A (Recomendado):**
- Manter `multiplicador` como **fallback** (compatibilidade)
- Se `pessoas_solicitadas` NOT NULL → usa pessoas
- Se NULL → usa multiplicador (old style)

**Opção B (Breaking Change):**
- Remover `multiplicador` completamente
- Todos os jobs usam porções

---

## 🎨 Mudanças na UI (Frontend)

### **Formulário de Receita (Aba Montar)**

```html
<!-- ANTES -->
<label>Nome da Receita</label>
<input name="nome" />

<label>Ingredientes</label>
<!-- ... linhas dinâmicas ... -->

<!-- DEPOIS -->
<label>Nome da Receita</label>
<input name="nome" />

<label>Porção Base (quantas pessoas?)</label>
<input type="number" name="porcoes" min="1" max="20" value="1" />
<!-- Slider simples de 1-20 pessoas -->
<!-- Ex: 1, 2, 4, 6, 8, 10 pessoas -->

<label>Ingredientes (para a porção base acima)</label>
<!-- ... linhas dinâmicas ... -->
```

### **Dialog de Execução (Run Dialog)**

```html
<!-- ANTES -->
<fieldset>
  <legend>Multiplicador</legend>
  <input type="range" min="1" max="99" value="1" />
  <span>2×, 3×, 5×</span>
</fieldset>

<!-- DEPOIS -->
<fieldset>
  <legend>Quantas Pessoas?</legend>
  <div class="portion-selector">
    <!-- Display: "Receita para 4 pessoas" -->
    <span class="base-info">Receita base: 4 pessoas</span>
    
    <!-- Display grande do valor -->
    <div class="portion-display">
      <span class="num" id="portionValue">4</span>
      <span class="unit">pessoas</span>
    </div>
    
    <!-- NOVO: Quick buttons configuráveis (ex: [1p] [2p] [4p] [6p] [8p]) -->
    <div class="quick-portions" id="quickPortions">
      <!-- Gerados dinamicamente do localStorage ou default -->
    </div>
    
    <!-- NOVO: Input customizado para número qualquer -->
    <div class="custom-portion-input">
      <input 
        type="number" 
        id="customPeople" 
        min="1" 
        max="100" 
        placeholder="Ou digite um número"
        title="Digite quantas pessoas"
      />
      <button type="button" id="applyCustomPeople" class="ghost">OK</button>
    </div>
  </div>
</fieldset>

<!-- Prévia de cálculos -->
<details>
  <summary>📊 Cálculo de Ingredientes</summary>
  <div class="portion-math">
    <!-- Mostra cálculo: base ÷ porcoes_base × pessoas_desejadas -->
    Sal: 20g ÷ 4 × 8 = 40g | 40s
  </div>
</details>
```

### **Configuração de Quick Buttons (Nova Aba / Seção em Robô)**

```html
<!-- ABA ROBÔ: Seção de Preferências de Execução -->
<section class="config-section">
  <h3>⚡ Atalhos de Pessoas (Quick Buttons)</h3>
  <p class="hint">Customize os botões rápidos para seus cenários mais comuns</p>
  
  <fieldset>
    <legend>Botões Rápidos de Porções</legend>
    
    <div class="quick-buttons-config">
      <!-- Até 6 botões configuráveis -->
      
      <div class="button-input-row">
        <label>Botão 1</label>
        <input 
          type="number" 
          class="quick-btn-value" 
          id="quickBtn1" 
          min="1" 
          max="100" 
          value="1"
          data-index="1"
        />
        <span class="unit">pessoas</span>
      </div>
      
      <div class="button-input-row">
        <label>Botão 2</label>
        <input 
          type="number" 
          class="quick-btn-value" 
          id="quickBtn2" 
          min="1" 
          max="100" 
          value="2"
          data-index="2"
        />
        <span class="unit">pessoas</span>
      </div>
      
      <div class="button-input-row">
        <label>Botão 3</label>
        <input 
          type="number" 
          class="quick-btn-value" 
          id="quickBtn3" 
          min="1" 
          max="100" 
          value="4"
          data-index="3"
        />
        <span class="unit">pessoas</span>
      </div>
      
      <div class="button-input-row">
        <label>Botão 4</label>
        <input 
          type="number" 
          class="quick-btn-value" 
          id="quickBtn4" 
          min="1" 
          max="100" 
          value="6"
          data-index="4"
        />
        <span class="unit">pessoas</span>
      </div>
      
      <div class="button-input-row">
        <label>Botão 5</label>
        <input 
          type="number" 
          class="quick-btn-value" 
          id="quickBtn5" 
          min="1" 
          max="100" 
          value="8"
          data-index="5"
        />
        <span class="unit">pessoas</span>
      </div>
      
      <div class="button-input-row">
        <label>Botão 6 (opcional)</label>
        <input 
          type="number" 
          class="quick-btn-value" 
          id="quickBtn6" 
          min="1" 
          max="100" 
          value="10"
          data-index="6"
        />
        <span class="unit">pessoas</span>
      </div>
    </div>
    
    <p class="hint">💡 Dica: Configure com seus cenários comuns (meia porção, normal, dobro, etc.)</p>
    <div class="actions" style="margin-top: 12px">
      <button id="btnResetQuickButtons" type="button" class="ghost">Restaurar padrão</button>
      <button id="btnSaveQuickButtons" type="button" class="primary">Salvar Preferências</button>
    </div>
  </fieldset>
</section>

<style>
.quick-buttons-config {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin: 16px 0;
}

.button-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.button-input-row label {
  min-width: 70px;
  font-weight: 600;
}

.button-input-row input {
  flex: 1;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #31407a;
  background: #0f1733;
  color: #fff;
}

.button-input-row .unit {
  min-width: 60px;
  opacity: 0.7;
}
</style>
```

---

## 💾 Schema: Modelo Pydantic (schemas.py)

### **ReceitaBase - Adicionar `porcoes`**

```python
class ReceitaBase(BaseModel):
    nome: str = Field(..., min_length=1, max_length=120)
    porcoes: int = Field(1, ge=1, le=20)  # ← NOVO
    ingredientes: List[IngredienteBase]
```

### **JobCreateIn - Trocar `multiplicador` por `pessoas`**

```python
# OPÇÃO 1: Adicionar novo campo (compatível)
class JobCreateIn(BaseModel):
    receita_id: int
    multiplicador: int = Field(None, ge=1)  # ← deprecado
    pessoas_solicitadas: int = Field(None, ge=1)  # ← novo

# OPÇÃO 2: Remover multiplicador (breaking)
class JobCreateIn(BaseModel):
    receita_id: int
    pessoas_solicitadas: int = Field(..., ge=1, le=20)
```

### **JobOut - Manter rastreabilidade**

```python
class JobOut(BaseModel):
    id: int
    status: str
    receita_id: Optional[int] = None
    receita_porcoes: Optional[int] = None  # ← quantas pessoas era a receita base
    pessoas_solicitadas: Optional[int] = None  # ← quantas o usuário pediu
    multiplicador: Optional[int] = None  # ← fallback (removido no futuro)
    # ... outros campos ...
```

---

## 🔄 Lógica de Cálculo (Backend)

### **Ao criar Job: Calcular `job_items` com novo scale**

```python
# ANTES: job_items com quantidade_g = ingrediente.quantidade * multiplicador
quantidade_g = ingrediente.quantidade * multiplicador

# DEPOIS: job_items com scale baseado em porções
escala = pessoas_solicitadas / receita.porcoes
quantidade_g = ingrediente.quantidade * escala
```

**Exemplo:**
```python
receita.porcoes = 4
pessoas_solicitadas = 8
escala = 8 / 4 = 2.0

ingrediente.quantidade = 20  # gramas
quantidade_g_final = 20 * 2.0 = 40g  ✓
```

---

## ✅ Migração de Dados

### **Receitas Existentes**

```python
# Script: Todas as receitas antigas recebem porcoes=1 (por compatibilidade)
UPDATE receitas SET porcoes = 1 WHERE porcoes IS NULL;
```

### **Jobs Existentes**

```python
# Se multiplicador=2 e receita.porcoes=1:
# Converter para pessoas_solicitadas = 2 (semanticamente igual)
UPDATE jobs 
SET pessoas_solicitadas = multiplicador 
WHERE porcoes IS NULL AND multiplicador IS NOT NULL;
```

---

## 🎯 Benefícios

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Clareza** | "2×" genérico | "8 pessoas" específico |
| **Precisão** | Usuário adivinha escala | Cálculo automático |
| **Flexibilidade** | Só x1, x2, x3, x5 | 1-20 pessoas contínuo |
| **Documentação** | Receita sem contexto | "Para 4 pessoas" incorporado |
| **Auditoria** | Apenas multiplicador | Rastreabilidade completa |
| **UX** | Multiplicador abstrato | Conceito familiar (pessoas) |

---

## � Persistência de Configurações (localStorage)

### **Armazenar Preferências do Usuário**

A configuração dos quick buttons é **local** (não vai ao servidor), salva em `localStorage`:

```javascript
// Salvar preferências
const preferences = {
  quickPortions: [1, 2, 4, 6, 8, 10],  // Array com até 6 botões
  lastUsedPortion: 4,                   // Última porção usada (convenência)
  customPortionHistory: [3, 5, 7]       // Histórico de números customizados
};

localStorage.setItem('yaguts_portion_prefs', JSON.stringify(preferences));

// Carregar preferências
const saved = JSON.parse(localStorage.getItem('yaguts_portion_prefs') || '{}');
const quickPortions = saved.quickPortions || [1, 2, 4, 6, 8];  // default
```

### **Estrutura de Dados**

```javascript
// localStorage key: "yaguts_portion_prefs"
{
  "quickPortions": [1, 2, 4, 6, 8],     // Até 6 valores customizados
  "lastUsedPortion": 4,                 // Para restaurar ao abrir dialog
  "customPortionHistory": [3, 5, 7, 20] // Histórico dos últimos 5 números custom
}
```

**Vantagens:**
- ✅ Sem sincronizar com servidor (rápido)
- ✅ Cada dispositivo/browser guarda sua preferência
- ✅ Funciona offline
- ✅ Sem complexidade no banco de dados
- ✅ Customizável por usuário, sem afetar receitas

---

## 🔧 Lógica no Frontend (app.js)

### **1. Classe para Gerenciar Preferências**

```javascript
class PortionPreferences {
  constructor() {
    this.defaultQuickPortions = [1, 2, 4, 6, 8];
    this.load();
  }

  load() {
    const saved = localStorage.getItem('yaguts_portion_prefs');
    if (saved) {
      const data = JSON.parse(saved);
      this.quickPortions = data.quickPortions || this.defaultQuickPortions;
      this.lastUsedPortion = data.lastUsedPortion || 1;
      this.customHistory = data.customPortionHistory || [];
    } else {
      this.quickPortions = this.defaultQuickPortions;
      this.lastUsedPortion = 1;
      this.customHistory = [];
    }
  }

  save() {
    localStorage.setItem('yaguts_portion_prefs', JSON.stringify({
      quickPortions: this.quickPortions,
      lastUsedPortion: this.lastUsedPortion,
      customPortionHistory: this.customHistory.slice(0, 5)  // últimos 5
    }));
  }

  addToHistory(value) {
    // Remove duplicatas e adiciona ao início
    this.customHistory = [value, ...this.customHistory.filter(v => v !== value)];
  }

  reset() {
    this.quickPortions = this.defaultQuickPortions;
    this.lastUsedPortion = 1;
    this.customHistory = [];
    this.save();
  }
}

// Na App
class App {
  constructor() {
    // ...
    this.portionPrefs = new PortionPreferences();
  }
}
```

### **2. Renderizar Quick Buttons Dinâmicos**

```javascript
_renderQuickPortionButtons() {
  const container = this.runDlg.querySelector('#quickPortions');
  container.innerHTML = '';
  
  const currentValue = Number(this.runDlg.querySelector('#customPeople')?.value || 
                              this.runDlg.querySelector('.portion-display .num')?.textContent || 1);
  
  for (const portions of this.portionPrefs.quickPortions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = portions === currentValue ? 'primary' : 'ghost';
    btn.textContent = `${portions}p`;
    btn.dataset.portions = portions;
    
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      this._setPortionValue(portions);
    });
    
    container.appendChild(btn);
  }
}

_setPortionValue(value) {
  const portionValue = this.runDlg.querySelector('.portion-display .num');
  const customInput = this.runDlg.querySelector('#customPeople');
  
  portionValue.textContent = value;
  customInput.value = value;
  
  this.portionPrefs.lastUsedPortion = value;
  this.portionPrefs.addToHistory(value);
  this.portionPrefs.save();
  
  this._renderRunPreview();
  this._updateQuickButtonStates(value);
}
```

### **3. Input Customizado com Enter + Button**

```javascript
_setupCustomPortionInput() {
  const customInput = this.runDlg.querySelector('#customPeople');
  const applyBtn = this.runDlg.querySelector('#applyCustomPeople');
  
  const applyCustom = () => {
    const value = Number(customInput.value);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      customInput.focus();
      return;
    }
    this._setPortionValue(value);
  };
  
  applyBtn.addEventListener('click', applyCustom);
  customInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyCustom();
    }
  });
  
  // Restaurar último valor usado ao abrir dialog
  customInput.value = this.portionPrefs.lastUsedPortion;
}
```

### **4. Salvar Configurações de Quick Buttons (Aba Robô)**

```javascript
_setupQuickButtonsConfig() {
  const inputs = document.querySelectorAll('.quick-btn-value');
  const saveBtn = document.getElementById('btnSaveQuickButtons');
  const resetBtn = document.getElementById('btnResetQuickButtons');
  
  // Carregar valores salvos
  inputs.forEach((input, idx) => {
    if (idx < this.portionPrefs.quickPortions.length) {
      input.value = this.portionPrefs.quickPortions[idx];
    }
  });
  
  // Salvar
  saveBtn.addEventListener('click', () => {
    const values = Array.from(inputs)
      .filter(inp => inp.value)  // ignora vazios
      .map(inp => Number(inp.value))
      .filter(v => v > 0 && v <= 100);
    
    if (values.length === 0) {
      this.toast('Configure pelo menos 1 botão', 'err');
      return;
    }
    
    this.portionPrefs.quickPortions = values;
    this.portionPrefs.save();
    this.toast('Botões rápidos configurados!', 'ok');
    
    // Se run dialog está aberto, atualizar
    if (this.runDlg?.open) {
      this._renderQuickPortionButtons();
    }
  });
  
  // Restaurar padrão
  resetBtn.addEventListener('click', () => {
    if (confirm('Restaurar botões para o padrão (1, 2, 4, 6, 8)?')) {
      this.portionPrefs.reset();
      
      inputs.forEach((input, idx) => {
        if (idx < this.portionPrefs.quickPortions.length) {
          input.value = this.portionPrefs.quickPortions[idx];
        } else {
          input.value = '';
        }
      });
      
      this.toast('Botões restaurados para padrão', 'ok');
      
      // Atualizar dialog se aberto
      if (this.runDlg?.open) {
        this._renderQuickPortionButtons();
      }
    }
  });
}
```

---

## 🎯 Fluxo de UX Completo

### **Cenário 1: Usuário com Padrão (Sem Customizar)**

```
1. Abre "Executar Receita"
   ↓
2. Vê quick buttons: [1p] [2p] [4p] [6p] [8p]
   ↓
3. Clica [4p] (default para receita de 4 pessoas)
   ↓
4. Executa
```

### **Cenário 2: Usuário Quer Customizar Botões**

```
1. Abre aba Robô → Seção "Atalhos de Pessoas"
   ↓
2. Muda os valores:
   Botão 1: 1
   Botão 2: 3
   Botão 3: 6
   Botão 4: 10
   (deixa Botão 5 em branco para removê-lo)
   ↓
3. Clica "Salvar Preferências"
   ↓
4. localStorage atualizado
   ↓
5. Próxima vez que abrir "Executar", vê: [1p] [3p] [6p] [10p]
```

### **Cenário 3: Usuário Quer Número Customizado (21 pessoas)**

```
1. Abre "Executar Receita"
   ↓
2. Vê quick buttons, mas precisa fazer para 21 pessoas
   ↓
3. Clica no input "Ou digite um número"
   ↓
4. Digita "21" e pressiona Enter (ou clica OK)
   ↓
5. Display muda para "21 pessoas"
   ↓
6. "21" é salvo no customHistory
   ↓
7. Próxima vez, pode ver "21" como sugestão no histório
   ↓
8. Executa
```

---

## 🔄 Casos de Uso Reais

### **Restaurante com 2 Turnos**

```
Almoço: 30 pessoas
Janta: 50 pessoas

Quick Buttons: [15p] [30p] [50p] [100p]
```

### **Catering para Eventos**

```
Pequeno: 10 pessoas
Médio: 25 pessoas
Grande: 50 pessoas
Extra Grande: 100 pessoas

Quick Buttons: [10p] [25p] [50p] [100p]
```

### **Cozinha Doméstica**

```
Meia receita: 2 pessoas
Normal: 4 pessoas
Dobro: 8 pessoas
Festa: 20 pessoas

Quick Buttons: [2p] [4p] [8p] [20p]
```

---

## 💾 Schema: Sem Alterações no Backend

**Importante:** A configuração de quick buttons é **100% local** (localStorage), não sincroniza com servidor.

**Razão:**
- É preferência do usuário (local device)
- Não impacta receitas ou jobs (que vêm com `porcoes` definido)
- Mais simples: sem API, sem migrations
- Cada dispositivo guarda sua própria preferência
- Se usuário limpa localStorage, volta ao padrão

Se no futuro quiser sincronizar (ex: entre dispositivos), basta:
1. Adicionar coluna `user_settings` na tabela `usuarios` (JSON)
2. Fazer GET/PUT `/users/me/settings`
3. Sincronizar localStorage ↔ servidor

Por enquanto: **localStorage é suficiente**.

---

## 📊 Resumo de Implementação

| Componente | Tipo | Status |
|-----------|------|--------|
| Quick Buttons Dinâmicos | Frontend | localStorage-based |
| Input Customizado | Frontend | HTML + JS |
| Configuração de Botões | Frontend | Aba Robô (nova seção) |
| Histórico de Números | Frontend | localStorage (últimos 5) |
| Persistência | localStorage | Nativo do browser |
| Backend | Nenhuma mudança | ✅ Compatible |
| DB Migrations | Nenhuma | ✅ Not needed |



### **Fase 1: Preparação (Apenas Backend)**
- ✅ Adicionar coluna `porcoes` a `receitas`
- ✅ Adicionar coluna `pessoas_solicitadas` a `jobs`
- ✅ Manter `multiplicador` para compatibilidade
- ✅ Lógica de cálculo: preferir `pessoas` se fornecido, senão usar `multiplicador`
- ✅ Migrar dados antigos

### **Fase 2: Frontend Update**
- Remover slide 1-99
- Adicionar field `porcoes` no formulário de receita
- Novo dialog de execução com seletor visual de pessoas
- Quick buttons contextual (1, 2, 4, 6, 8, ...)

### **Fase 3: Cleanup (v2.0)**
- Remover `multiplicador` do schema (breaking change)
- Remover código legado de compatibilidade
- Requerer `pessoas_solicitadas` sempre

---

## 💡 Detalhes de UX

### **Slider vs Buttons**

**Atual:**
```
[━━━━━━━━━━━━━━━━━━] 1-99 (muito abstrato)
```

**Proposto:**
```
[━━━━━━━━━━━━━━━━━━] 1-20 pessoas

[1p] [2p] [4p] [6p] [8p]  ← Rápido para casos comuns
```

### **Display Visual**

```
┌─────────────────────┐
│ 🍽️  8 pessoas      │  ← Número grande (2.5rem)
│                     │
│ Base: 4 pessoas     │  ← Contexto
│ Escala: 2.0×        │  ← Cálculo transparente
└─────────────────────┘
```

### **Prévia de Cálculos**

```
Ingrediente    Base    Escala    Final
────────────────────────────────────
Sal            20g     ÷4 × 8    = 40g (40s)
Pimenta        10g     ÷4 × 8    = 20g (20s)
```

---

## 🔐 Validações

1. **Na Receita:**
   - `porcoes` entre 1 e 20
   - Pelo menos 1 ingrediente
   - Cada ingrediente tem quantidade >0

2. **Na Execução:**
   - `pessoas_solicitadas` entre 1 e 20
   - Validar que escala não resulta em quantidade >500g por ingrediente
   - Warning se algum frasco fica vazio (estoque <quantidade final)

---

## 🚀 Exemplo Completo de Fluxo

### **1. Cadastro de Receita**
```
User: "Tempero para Churrasco"
Porcoes: 4
├─ Sal: 20g
├─ Pimenta: 10g
└─ Alho: 5g
```

### **2. Requisição de Job**
```json
{
  "receita_id": 42,
  "pessoas_solicitadas": 8
}
```

### **3. Job gerado com os itens calculados**
```json
{
  "id": 100,
  "receita_id": 42,
  "pessoas_solicitadas": 8,
  "receita_porcoes": 4,
  "itens": [
    {"tempero": "Sal", "quantidade_g": 40, "segundos": 40},
    {"tempero": "Pimenta", "quantidade_g": 20, "segundos": 20},
    {"tempero": "Alho", "quantidade_g": 10, "segundos": 10}
  ]
}
```

### **4. Cálculo no Backend**
```
escala = 8 / 4 = 2.0
Sal: 20 × 2.0 = 40g ✓
Pimenta: 10 × 2.0 = 20g ✓
Alho: 5 × 2.0 = 10g ✓
```

---

## 🎨 Mockups da Interface

### **Dialog de Execução - Com Quick Buttons + Input Customizado**

```
┌────────────────────────────────────────┐
│ Executar: Tempero para Churrasco       │ 
│ ✕                                      │
├────────────────────────────────────────┤
│                                        │
│ Receita base: para 4 pessoas          │
│                                        │
│              🍽️                        │
│            8 pessoas                  │
│                                        │
│ ┌─ Quick Buttons ─────────────────┐  │
│ │ [1p] [2p] [4p] [6p] [8p]        │  │
│ │ (configuráveis na aba Robô)      │  │
│ └─────────────────────────────────┘  │
│                                        │
│ ┌─ Ou Digite um Número ───────────┐  │
│ │ [____________] pessoas [OK]     │  │
│ │ Min: 1 | Max: 100               │  │
│ └─────────────────────────────────┘  │
│                                        │
│ 📊 Cálculo de Ingredientes ▼          │
│                                        │
│ Sal: 20g ÷ 4 × 8 = 40g | 40s         │
│ Pimenta: 10g ÷ 4 × 8 = 20g | 20s     │
│                                        │
│ ┌──────────────────────────────────┐ │
│ │ Cancelar      Executar (Primary) │ │
│ └──────────────────────────────────┘ │
└────────────────────────────────────────┘
```

### **Aba Robô - Seção de Configuração de Botões**

```
┌─────────────────────────────────────────────┐
│ ⚡ Atalhos de Pessoas (Quick Buttons)       │
│ Customize os botões rápidos para seus       │
│ cenários mais comuns                        │
│                                             │
│ Botões Rápidos de Porções                  │
│ ──────────────────────────────────────────  │
│                                             │
│ Botão 1   [____1____] pessoas              │
│ Botão 2   [____2____] pessoas              │
│ Botão 3   [____4____] pessoas              │
│ Botão 4   [____6____] pessoas              │
│ Botão 5   [____8____] pessoas              │
│ Botão 6   [___10____] pessoas              │
│                                             │
│ 💡 Dica: Configure com seus cenários       │
│ comuns (meia porção, normal, dobro, etc.)  │
│                                             │
│ ┌────────────────────────────────────────┐ │
│ │ Restaurar Padrão │ Salvar Preferências│ │
│ └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### **Fluxo de Dados - localStorage**

```
┌─────────────────────────────────────┐
│ Aba Robô: Edita Quick Buttons       │
│ Botão 1: 1 pessoa                   │
│ Botão 2: 3 pessoas                  │
│ Botão 3: 6 pessoas                  │
│ Botão 4: 10 pessoas                 │
│                                     │
│         [Salvar] ───────────┐      │
└─────────────────────────────┼──────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ localStorage    │
                    ├─────────────────┤
                    │ quickPortions:  │
                    │ [1,3,6,10]      │
                    │                 │
                    │ lastUsedPortion │
                    │ customHistory   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Dialog Executa  │
                    │ Renderiza botões│
                    │ [1p][3p][6p][10]│
                    └─────────────────┘
```

---

## 💾 Storage: localStorage (Frontend Only)

### **Armazenar Preferências do Usuário**

A configuração dos quick buttons é **local** (não vai ao servidor), salva em `localStorage`:

```javascript
// Salvar preferências
const preferences = {
  quickPortions: [1, 2, 4, 6, 8, 10],  // Array com até 6 botões
  lastUsedPortion: 4,                   // Última porção usada (convenência)
  customPortionHistory: [3, 5, 7]       // Histórico de números customizados
};

localStorage.setItem('yaguts_portion_prefs', JSON.stringify(preferences));

// Carregar preferências
const saved = JSON.parse(localStorage.getItem('yaguts_portion_prefs') || '{}');
const quickPortions = saved.quickPortions || [1, 2, 4, 6, 8];  // default
```

### **Estrutura de Dados**

```javascript
// localStorage key: "yaguts_portion_prefs"
{
  "quickPortions": [1, 2, 4, 6, 8],     // Até 6 valores customizados
  "lastUsedPortion": 4,                 // Para restaurar ao abrir dialog
  "customPortionHistory": [3, 5, 7, 20] // Histórico dos últimos 5 números custom
}
```

**Vantagens:**
- ✅ Sem sincronizar com servidor (rápido)
- ✅ Cada dispositivo/browser guarda sua preferência
- ✅ Funciona offline
- ✅ Sem complexidade no banco de dados
- ✅ Customizável por usuário, sem afetar receitas

---

## 🔧 Lógica no Frontend (app.js) - Pseudocódigo

### **1. Classe para Gerenciar Preferências**

```javascript
class PortionPreferences {
  constructor() {
    this.defaultQuickPortions = [1, 2, 4, 6, 8];
    this.load();
  }

  load() {
    const saved = localStorage.getItem('yaguts_portion_prefs');
    if (saved) {
      const data = JSON.parse(saved);
      this.quickPortions = data.quickPortions || this.defaultQuickPortions;
      this.lastUsedPortion = data.lastUsedPortion || 1;
      this.customHistory = data.customPortionHistory || [];
    } else {
      this.quickPortions = this.defaultQuickPortions;
      this.lastUsedPortion = 1;
      this.customHistory = [];
    }
  }

  save() {
    localStorage.setItem('yaguts_portion_prefs', JSON.stringify({
      quickPortions: this.quickPortions,
      lastUsedPortion: this.lastUsedPortion,
      customPortionHistory: this.customHistory.slice(0, 5)
    }));
  }

  addToHistory(value) {
    this.customHistory = [value, ...this.customHistory.filter(v => v !== value)];
  }

  reset() {
    this.quickPortions = this.defaultQuickPortions;
    this.lastUsedPortion = 1;
    this.customHistory = [];
    this.save();
  }
}
```

### **2. Renderizar Quick Buttons Dinâmicos**

```javascript
_renderQuickPortionButtons() {
  const container = this.runDlg.querySelector('#quickPortions');
  container.innerHTML = '';
  
  for (const portions of this.portionPrefs.quickPortions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `${portions}p`;
    btn.dataset.portions = portions;
    
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      this._setPortionValue(portions);
    });
    
    container.appendChild(btn);
  }
}
```

### **3. Input Customizado com Enter + Button**

```javascript
_setupCustomPortionInput() {
  const customInput = this.runDlg.querySelector('#customPeople');
  const applyBtn = this.runDlg.querySelector('#applyCustomPeople');
  
  const applyCustom = () => {
    const value = Number(customInput.value);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      customInput.focus();
      return;
    }
    this._setPortionValue(value);
    this.portionPrefs.addToHistory(value);
    this.portionPrefs.save();
  };
  
  applyBtn.addEventListener('click', applyCustom);
  customInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyCustom();
    }
  });
  
  // Restaurar último valor usado
  customInput.value = this.portionPrefs.lastUsedPortion;
}
```

### **4. Salvar Configurações de Quick Buttons (Aba Robô)**

```javascript
_setupQuickButtonsConfig() {
  const inputs = document.querySelectorAll('.quick-btn-value');
  const saveBtn = document.getElementById('btnSaveQuickButtons');
  const resetBtn = document.getElementById('btnResetQuickButtons');
  
  // Salvar
  saveBtn.addEventListener('click', () => {
    const values = Array.from(inputs)
      .filter(inp => inp.value)
      .map(inp => Number(inp.value))
      .filter(v => v > 0 && v <= 100);
    
    if (values.length === 0) {
      this.toast('Configure pelo menos 1 botão', 'err');
      return;
    }
    
    this.portionPrefs.quickPortions = values;
    this.portionPrefs.save();
    this.toast('Botões rápidos configurados!', 'ok');
    
    // Atualizar dialog se aberto
    if (this.runDlg?.open) {
      this._renderQuickPortionButtons();
    }
  });
  
  // Restaurar padrão
  resetBtn.addEventListener('click', () => {
    if (confirm('Restaurar padrão (1, 2, 4, 6, 8)?')) {
      this.portionPrefs.reset();
      this.toast('Botões restaurados', 'ok');
      
      if (this.runDlg?.open) {
        this._renderQuickPortionButtons();
      }
    }
  });
}
```

---

## 🎯 Casos de Uso Reais

### **Restaurante com 2 Turnos**

```
Almoço: 30 pessoas
Janta: 50 pessoas

Quick Buttons Customizados: [15p] [30p] [50p] [100p]
```

### **Catering para Eventos**

```
Pequeno evento: 10 pessoas
Médio: 25 pessoas
Grande: 50 pessoas
Extra grande: 100 pessoas

Quick Buttons: [10p] [25p] [50p] [100p]
```

### **Cozinha Doméstica**

```
Meia receita: 2 pessoas
Normal: 4 pessoas
Dobro: 8 pessoas
Festa: 20 pessoas

Quick Buttons: [2p] [4p] [8p] [20p]
```

---

## ✨ Vantagens da Abordagem Customizável

| Vantagem | Descrição |
|----------|-----------|
| **Flexibilidade** | Customizar botões sem tocar receitas |
| **Portabilidade** | Cada usuário/dispositivo tem sua preferência |
| **Simplicidade** | Apenas localStorage (sem servidor) |
| **Sem Breaking Changes** | Compatível com schema existente |
| **Offline-first** | Funciona sem conexão |
| **Escalável** | Suporta 1 pessoa até 100 pessoas |
| **Múltiplos Ambientes** | Restaurante, catering, cozinha, eventos |
| **Input Livre** | Digitar número customizado (ex: 21 pessoas) |
| **Histórico** | Guardar últimos números usados |

---

## 📝 Resumo de Mudanças

| Componente | Mudança | Impacto |
|-----------|---------|--------|
| **DB Schema** | +2 colunas (`porcoes`, `pessoas_solicitadas`) | Migração simples |
| **Models** | Adicionar field `porcoes` em `Receita` | Backward compatible |
| **Schemas** | `ReceitaBase`, `JobCreateIn`, `JobOut` | Validações novas |
| **Backend Logic** | Cálculo de escala = pessoas / porcoes | Core change |
| **Frontend UI** | Replace slider → portion selector + input custom | Visual rewrite |
| **Job Items** | `quantidade_g` calculado com escala | Automático |
| **Compatibilidade** | Manter `multiplicador` como fallback | No breaking changes (Fase 1-2) |
| **localStorage** | Novo: armazena quick buttons customizados | Frontend only, sem API |

---

## 🚀 Implementação Recomendada

### **Fase 1: Backend (Infraestrutura)**
- ✅ Adicionar coluna `porcoes` a `receitas`
- ✅ Adicionar coluna `pessoas_solicitadas` a `jobs`
- ✅ Manter `multiplicador` para compatibilidade
- ✅ Lógica: preferir `pessoas` se fornecido, senão usar `multiplicador`
- ✅ Migrar dados antigos

### **Fase 2: Frontend (UI Principal)**
- Remover slide 1-99
- Adicionar field `porcoes` no formulário de receita (1-20 pessoas)
- Dialog de execução com seletor de pessoas
- Quick buttons padrão: [1p] [2p] [4p] [6p] [8p]
- Input customizado para números livres (1-100)

### **Fase 3: Personalização (localStorage)**
- Nova seção na aba Robô: "⚡ Atalhos de Pessoas"
- Interface para editar cada quick button (até 6)
- Botão "Salvar Preferências" (localStorage)
- Botão "Restaurar Padrão"
- Histórico de números customizados

### **Fase 4: Cleanup (v2.0)**
- Remover `multiplicador` do schema (breaking change)
- Remover código legado de compatibilidade
- Requerer `pessoas_solicitadas` sempre

---

## 📊 Arquitetura Final

```
┌─────────────────────────────────────────────────────────┐
│ RECEITA (DB)                                            │
├─────────────────────────────────────────────────────────┤
│ id: 1                                                   │
│ nome: "Tempero para Churrasco"                          │
│ porcoes: 4  ← NOVO: para quantas pessoas é a receita   │
│ ingredientes: [Sal 20g, Pimenta 10g]                   │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ Usuário escolhe
                   ▼
        ┌──────────────────────┐
        │ Dialog Executa      │
        ├──────────────────────┤
        │ Porcoes Base: 4     │
        │ Quick: [1][2][4][6] │  ← localStorage
        │ Custom: [___] OK    │
        │ Seleciona: 8 pessoas│
        └──────────────┬───────┘
                       │
                       │ Cálculo: 8/4 = 2.0×
                       ▼
        ┌──────────────────────┐
        │ JOB (DB)            │
        ├──────────────────────┤
        │ id: 100             │
        │ receita_id: 1       │
        │ pessoas_solicitadas │
        │ : 8  ← NOVO        │
        │                     │
        │ job_items:          │
        │ - Sal: 40g (2.0×)   │
        │ - Pimenta: 20g      │
        └──────────────────────┘
```

---

## ✅ Checklist de Implementação

### **Backend (models.py)**
- [ ] Adicionar `porcoes: int` a `Receita`
- [ ] Adicionar `pessoas_solicitadas: Optional[int]` a `Job`
- [ ] Manter `multiplicador` para compatibilidade

### **Backend (schemas.py)**
- [ ] `ReceitaBase.porcoes: int = Field(1, ge=1, le=20)`
- [ ] `JobCreateIn.pessoas_solicitadas: Optional[int]`
- [ ] `JobOut.receita_porcoes, pessoas_solicitadas, multiplicador`

### **Backend (endpoints)**
- [ ] POST `/receitas/` valida `porcoes`
- [ ] POST `/jobs` calcula scale = `pessoas_solicitadas / receita.porcoes`
- [ ] Job items criados com `quantidade_g = original * scale`

### **Frontend (HTML)**
- [ ] Adicionar field `porcoes` no form de receita
- [ ] Novo dialog com quick buttons + input custom
- [ ] Nova seção na aba Robô para editar botões

### **Frontend (app.js)**
- [ ] Classe `PortionPreferences` com localStorage
- [ ] Método `_renderQuickPortionButtons()`
- [ ] Método `_setupCustomPortionInput()`
- [ ] Método `_setupQuickButtonsConfig()` (aba Robô)

### **Frontend (CSS)**
- [ ] Estilo para `.quick-portions` (grid de botões)
- [ ] Estilo para `.custom-portion-input`
- [ ] Estilo para `.portion-display` (número grande)
- [ ] Responsive: mobile 1-2 cols, desktop 4-6 cols

### **Database (migrations)**
- [ ] ALTER TABLE `receitas` ADD COLUMN `porcoes`
- [ ] ALTER TABLE `jobs` ADD COLUMN `pessoas_solicitadas`
- [ ] UPDATE receitas SET porcoes = 1

---

**Status:** ✅ **Proposta Completa - Pronto para Implementação**

