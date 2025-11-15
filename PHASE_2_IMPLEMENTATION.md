# FASE 2 - Implementação da UI de Seletor de Porções

**Status:** ✅ COMPLETA  
**Data:** 2024  
**Objetivo:** Substituir o slider multiplicador (1-99×) por uma UI intuitiva baseada em número de pessoas

---

## 📋 Resumo das Alterações

### 1. **Frontend - app.js**

#### ✅ Classe `PortionPreferences` (Adicionada)
- **Localização:** Linhas ~115-160
- **Responsabilidade:** Gerenciar preferências de porção via localStorage
- **Métodos:**
  - `load()` - Carrega preferências do localStorage
  - `save()` - Persiste preferências no localStorage
  - `addToHistory(value)` - Adiciona porção ao histórico
  - `reset()` - Reseta para valores padrão
  - `setQuickPortions(values)` - Configura botões rápidos

**Propriedades armazenadas:**
```javascript
{
  quickPortions: [1, 2, 4, 6, 8],      // Botões rápidos personalizáveis
  lastUsedPortion: 1,                   // Última porção usada
  customHistory: []                     // Histórico de valores customizados
}
```

#### ✅ Método `_openRunDialog(recipe, mapping)` (REESCRITO)
- **Localização:** Linhas ~1131-1237
- **Alterações Principais:**
  - ❌ Removido: Range slider multiplicador (input type="range")
  - ❌ Removido: Botões estáticos [1×][2×][3×][5×]
  - ✅ Adicionado: Exibição grande de número (2.5rem)
  - ✅ Adicionado: Botões dinâmicos baseados em `portionPrefs.quickPortions`
  - ✅ Adicionado: Input customizado com validação 1-100
  - ✅ Adicionado: Informação sobre porção base da receita

**Dialog HTML Structure:**
```html
<dialog id="dlgRun">
  <fieldset>
    <legend>Quantas Pessoas?</legend>
    <small id="baseInfo">Receita base: para X pessoas</small>
    
    <div class="portion-control">
      <!-- Grande exibição -->
      <div class="portion-display">
        <span id="portionValue">1</span> <span>pessoas</span>
      </div>
      
      <!-- Botões rápidos dinâmicos -->
      <div id="quickPortions"></div>
      
      <!-- Input customizado -->
      <div class="custom-portion-input">
        <input id="customPeople" type="number" min="1" max="100" />
        <button id="applyCustomPeople">OK</button>
      </div>
    </div>
  </fieldset>
  
  <!-- Prévia recalculada -->
  <details>
    <summary>📊 Prévia dos tempos</summary>
    <ul id="runPreview"></ul>
  </details>
</dialog>
```

#### ✅ Método `_setPortionValue(value)` (NOVO)
- **Localização:** Linhas ~1240-1250
- **Responsabilidade:** Atualizar o valor de porção e refazer cálculos
- **Lógica:**
  1. Valida intervalo (1-100)
  2. Atualiza display (#portionValue)
  3. Atualiza input customizado
  4. Re-renderiza botões rápidos (highlight)
  5. Re-renderiza prévia com cálculo atualizado

#### ✅ Método `_renderQuickPortionButtons()` (NOVO)
- **Localização:** Linhas ~1252-1267
- **Responsabilidade:** Renderizar dinamicamente os botões rápidos
- **Lógica:**
  1. Lê valores de `portionPrefs.quickPortions`
  2. Compara com valor atual
  3. Marca como `.primary` se corresponde
  4. Marca como `.ghost` se não corresponde

#### ✅ Método `_renderRunPreview()` (REESCRITO)
- **Localização:** Linhas ~1269-1299
- **Alteração Principal:**
  - ❌ Antes: `quantidade × multiplicador`
  - ✅ Depois: `quantidade × (pessoas_desejadas / porcoes_base)`
  
**Cálculo de escala:**
```javascript
const escala = pessoas / porcoesBase;  // Ex: 8 pessoas / 4 porcoes = 2.0×
const total = Math.round(quantidade * escala * 10) / 10;  // 1 casa decimal
```

**Exemplo:**
- Receita base: 4 pessoas (porcoes=4)
- Usuário quer: 8 pessoas
- Ingrediente original: 50g
- Resultado: 50g × (8/4) = 100g

#### ✅ Integração com Jobs (POST /jobs)
- **Antes:** `{ receita_id, multiplicador: int }`
- **Depois:** `{ receita_id, pessoas_solicitadas: int }`
- **Payload Atualizado:** Linhas ~1214-1216
```javascript
body: JSON.stringify({ 
  receita_id: recipe.id, 
  pessoas_solicitadas: pessoas 
})
```

#### ✅ Persistência localStorage
- **Localização:** Linhas ~1218-1221
- **Ação:** Salva porção usada para próxima execução
```javascript
this.portionPrefs.lastUsedPortion = pessoas;
this.portionPrefs.addToHistory(pessoas);
this.portionPrefs.save();
```

#### ✅ Método `setModeCreate()` (ATUALIZADO)
- **Localização:** Linhas ~539-560
- **Alteração:** Reseta campo porcoes para 1 ao limpar formulário
```javascript
const porcoesInput = document.getElementById('porcoes');
if (porcoesInput) porcoesInput.value = 1;
```

#### ✅ Método `loadRecipeIntoForm()` (JÁ IMPLEMENTADO)
- Carrega `porcoes` do servidor e popula o formulário
- Validação 1-20 no `validateForm()`

---

### 2. **Frontend - index.html**

#### ✅ Campo de Entrada "porcoes" (Adicionado)
- **Localização:** Fieldset "Informações básicas"
- **HTML:**
```html
<fieldset>
  <legend>Informações básicas</legend>
  
  <label for="nome">Nome da receita</label>
  <input id="nome" name="nome" type="text" placeholder="Ex: Vinagrete picante" required />
  
  <label for="porcoes">Quantas pessoas (porção base)?</label>
  <input id="porcoes" name="porcoes" type="number" min="1" max="20" value="1" required />
  <small>A porção base define o tamanho de referência para escalas futuras</small>
</fieldset>
```

---

### 3. **Frontend - style.css**

#### ✅ CSS para Portion Selector (Adicionado)
- **Localização:** Final do arquivo (após ~770 linhas)
- **Classes Adicionadas:**

| Classe | Responsabilidade | Propriedades |
|--------|-----------------|--------------|
| `.portion-control` | Container flex | flex-direction: column; gap: 16px |
| `.portion-display` | Box de exibição | padding: 16px; background: gradiente; border |
| `.portion-num` | Número grande | font-size: 2.5rem; font-weight: 700 |
| `.portion-unit` | Texto "pessoas" | font-size: 0.875rem; color: muted |
| `.quick-portions` | Grid botões | grid-template-columns: repeat(auto-fit, minmax(50px, 1fr)) |
| `.custom-portion-input` | Input + botão | display: flex; gap: 8px |

**Design Tokens Usados:**
- Cores: `--primary`, `--muted`, `--ink`, `--surface`
- Espaçamento: `--space-sm`, `--space-md`, `--space-lg`
- Transições: `--transition-base`
- Raios: `--radius` (14px)

---

## 🔄 Fluxo de Interação (ATUALIZADO)

### Cenário: Usuário executa receita com 8 pessoas

1. **Clique em "Executar"**
   - Carrega receita (porcoes=4)
   - Mostra dialog com info: "Receita base: para 4 pessoas"

2. **Dialog abre**
   - Display mostra "1 pessoas" (restaurada do localStorage)
   - Botões rápidos: [1p][2p][4p][6p][8p]
   - Preview recalculado: baseado em 1 pessoa

3. **Clique em botão [8p]**
   - `_setPortionValue(8)` chamado
   - Display atualiza para "8 pessoas"
   - Botão [8p] fica `.primary`
   - Preview recalculado:
     ```
     escala = 8 / 4 = 2.0×
     ingrediente_original × 2.0 = resultado
     ```

4. **Submit**
   - POST `/jobs` com `pessoas_solicitadas: 8`
   - localStorage salva: `lastUsedPortion: 8`
   - Dialog fecha

5. **Próxima abertura**
   - Display mostra "8 pessoas" (restaurado)
   - Mesmo botão pré-selecionado

---

## 🎨 UI/UX Improvements

### Antes (Multiplicador)
```
Quantidade: [————●————]  mult=43
[1×] [2×] [3×] [5×]
Preview: 50g × 43 = 2150g (!!!)
```

### Depois (Porções)
```
Quantas Pessoas?
Receita base: para 4 pessoas

         8
      pessoas
  
[1p] [2p] [4p] [6p] [8p]

Ou digite um número: [___] OK

Preview: 50g × 2.0 = 100g
```

**Vantagens:**
✅ Contexto claro (número de pessoas, não multiplicador abstrato)  
✅ Referência visual à receita base  
✅ Botões personalizáveis (FASE 3)  
✅ Input customizado para casos especiais  
✅ Preview em tempo real com escala correta  
✅ Persistência entre execuções  

---

## 📊 Estado do App (Atualizado)

### Propriedades App adicionadas
```javascript
this.portionPrefs = new PortionPreferences();  // localStorage manager
this._runCtx = { recipe, mapping };             // contexto dialog
```

### Esquema de dados esperado (backend)

**Receita (GET /receitas/:id)**
```json
{
  "id": 1,
  "nome": "Vinagrete",
  "porcoes": 4,           // ← NOVO CAMPO
  "ingredientes": [
    {"tempero": "Sal", "quantidade": 10}
  ]
}
```

**Job (POST /jobs)**
```json
{
  "receita_id": 1,
  "pessoas_solicitadas": 8  // ← ANTES: multiplicador
}
```

---

## 🚀 Próximas Etapas (FASE 3 & 4)

### FASE 3: Backend - DB & Models
- [ ] Adicionar coluna `porcoes` à tabela `receitas`
- [ ] Adicionar coluna `pessoas_solicitadas` à tabela `jobs`
- [ ] Atualizar schema Pydantic para `PessoasForm`
- [ ] Migração DB (alembic ou manual)

### FASE 4: Customização de Botões (Robot Tab)
- [ ] UI no Robot Tab para editar quick buttons
- [ ] Salvar preferências no localStorage
- [ ] Sincronizar com servidor (opcional)

---

## ✅ Validação

**Validações Implementadas:**

| Campo | Validação | Mensagem |
|-------|-----------|----------|
| porcoes (form) | 1-20, inteiro | "porção base deve ser número inteiro entre 1 e 20" |
| pessoas (dialog) | 1-100, inteiro | Input type="number" nativo |
| escala (preview) | Cálculo: pessoas/porcoes | Arredonda 1 casa decimal |

---

## 🧪 Testes Recomendados

```javascript
// Test 1: Renderizar buttons rápidos
console.assert(portionPrefs.quickPortions.length === 5, 'Botões padrão');

// Test 2: Calcular escala corretamente
const escala = 8 / 4;  // 2.0
const total = 50 * escala;
console.assert(total === 100, 'Escala OK');

// Test 3: Persistência localStorage
portionPrefs.save();
const loaded = new PortionPreferences().lastUsedPortion;
console.assert(loaded === 1, 'localStorage OK');

// Test 4: Dialog submit com payload correto
// POST /jobs { receita_id: 1, pessoas_solicitadas: 8 }
```

---

## 📝 Notas Importantes

1. **Compatibilidade de Receitas Antigas:**
   - Se `porcoes` não existir, defaulta para 1 (escala = pessoas/1)
   - Backend pode retornar receitas sem `porcoes` durante transição

2. **Validação de Backend:**
   - Atualmente, endpoints POST `/jobs` esperam `multiplicador`
   - Será atualizado em FASE 3 para `pessoas_solicitadas`
   - Será necessário remover campo `multiplicador` das schemas

3. **localStorage Cleanup:**
   - PortionPreferences usa apenas ~200 bytes
   - Não requer limpeza periódica
   - Persiste entre sessões/abas

4. **Mobile Responsiveness:**
   - Grid botões usa `auto-fit` para adaptar a telas pequenas
   - Display "pessoas" centralizado (2.5rem font scales bem)
   - Input customizado 100% width em mobile

---

**Implementado por:** GitHub Copilot  
**Tempo:** ~45 minutos (3 arquivos, 100+ linhas de código novo)  
**Status:** Pronto para FASE 3 (Backend)
