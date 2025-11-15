# 📊 Resumo Executivo: Portion-Based Scaling com Quick Buttons Customizáveis

## 🎯 A Ideia em 30 Segundos

**Antes:** Slide 1-99× abstrato e impreciso  
**Depois:** Usuário escolhe "quantas pessoas" + quick buttons customizáveis

```
RECEITA: "Churrasco" (para 4 pessoas)
Ingredientes: Sal 20g, Pimenta 10g

USUÁRIO EXECUTA:
┌─────────────────────────┐
│   Quantas Pessoas?      │
│                         │
│   [1p] [2p] [4p] [6p]  │  ← Customizáveis!
│        ou                │
│   [___20___] pessoas OK │  ← Input livre (1-100)
│                         │
│ → Sal: 20g÷4 × 20 = 100g │
│ → Pimenta: 10g÷4 × 20 = 50g
└─────────────────────────┘

JOB CRIADO COM:
- pessoas_solicitadas: 20
- Cálculo automático: 20÷4 = 5.0× escala
```

---

## 🎨 Interface Visual

### **1. Dialog de Execução (Novo)**

```
┌────────────────────────────────────────┐
│ Executar: Tempero para Churrasco       │ 
├────────────────────────────────────────┤
│                                        │
│ Receita base: para 4 pessoas          │
│                                        │
│              🍽️                        │
│            8 pessoas                  │  ← Display grande
│                                        │
│ [1p] [2p] [4p] [6p] [8p]              │  ← Quick buttons
│                                        │
│ Ou digitar: [___8___] pessoas [OK]    │  ← Input customizado
│                                        │
│ 📊 Cálculo de Ingredientes            │
│ Sal: 20g ÷4 × 8 = 40g | 40s          │
│ Pimenta: 10g ÷4 × 8 = 20g | 20s      │
│                                        │
│ [Cancelar]          [Executar]         │
└────────────────────────────────────────┘
```

### **2. Configuração de Quick Buttons (Aba Robô)**

```
⚡ ATALHOS DE PESSOAS
Configure os botões rápidos para seus cenários comuns

Botão 1:  [___1___] pessoas
Botão 2:  [___2___] pessoas
Botão 3:  [___4___] pessoas
Botão 4:  [___6___] pessoas
Botão 5:  [___8___] pessoas
Botão 6:  [__10___] pessoas

💡 Dica: Customize para seus cenários (meia receita, normal, dobro)

[Restaurar Padrão]  [Salvar Preferências]
```

### **3. Fluxo de Dados**

```
┌──────────────────┐
│ Aba Robô         │ Usuario customiza
│ Edita botões     │ [1] [3] [6] [10]
└────────┬─────────┘
         │ [Salvar]
         ▼
    ┌─────────────────────────┐
    │ localStorage            │
    │ "yaguts_portion_prefs"  │
    │ {                       │
    │   quickPortions:        │
    │   [1, 3, 6, 10]        │
    │   lastUsedPortion: 6    │
    │   customHistory: [5,20] │
    │ }                       │
    └────────┬────────────────┘
             │
             ▼
    ┌─────────────────────────┐
    │ Dialog Executa          │
    │ Mostra botões:          │
    │ [1p] [3p] [6p] [10p]   │
    │                         │
    │ (e input customizado)   │
    └─────────────────────────┘
```

---

## 📱 Estados da Interface

### **Estado 1: Dialog Padrão (Default)**

Quick buttons mostram padrão: `[1p] [2p] [4p] [6p] [8p]`

### **Estado 2: Dialog Customizado**

Se usuario salvou preferências na aba Robô:
Quick buttons mostram valores customizados: `[1p] [3p] [6p] [10p]`

### **Estado 3: Input Customizado Ativo**

Usuario digita número não listado:
- Input: `[___21___] pessoas`
- Button: `[OK]`
- Após aplicar: numero salvo em `customHistory`
- Próxima execução: pode acessar via histórico

---

## 💾 Armazenamento

### **localStorage (Frontend Only)**

```javascript
// Chave: "yaguts_portion_prefs"
{
  "quickPortions": [1, 2, 4, 6, 8],    // Até 6 botões customizados
  "lastUsedPortion": 4,                // Restaura ao abrir dialog
  "customPortionHistory": [3, 5, 7, 20] // Últimos 5 números
}
```

**Vantagens:**
- Sem sincronizar com servidor (rápido)
- Cada dispositivo tem suas preferências
- Funciona offline
- Sem complexidade no DB
- Sem migration de dados

---

## 🗄️ Mudanças no Backend

### **Banco de Dados (Mínimas)**

```sql
-- Tabela receitas
ALTER TABLE receitas ADD COLUMN porcoes INTEGER DEFAULT 1 NOT NULL;
-- Ex: receita para 4 pessoas

-- Tabela jobs  
ALTER TABLE jobs ADD COLUMN pessoas_solicitadas INTEGER DEFAULT NULL;
-- Ex: usuario pediu para 8 pessoas
```

### **Modelos (models.py)**

```python
class Receita(Base):
    # ... existing fields ...
    porcoes = Column(Integer, default=1)  # novo

class Job(Base):
    # ... existing fields ...
    pessoas_solicitadas = Column(Integer, nullable=True)  # novo
    multiplicador = Column(Integer, default=1)  # mantido (compatibilidade)
```

### **Schemas (schemas.py)**

```python
class ReceitaBase(BaseModel):
    nome: str
    porcoes: int = Field(1, ge=1, le=20)  # novo
    ingredientes: List[IngredienteBase]

class JobCreateIn(BaseModel):
    receita_id: int
    pessoas_solicitadas: Optional[int]  # novo
    multiplicador: Optional[int]  # mantido
```

### **Lógica de Cálculo**

```python
# Ao criar job
if pessoas_solicitadas is not None:
    escala = pessoas_solicitadas / receita.porcoes
else:
    escala = multiplicador  # fallback

for ingrediente in receita.ingredientes:
    quantidade_final = ingrediente.quantidade * escala
    job_item.quantidade_g = quantidade_final
```

---

## 🎨 Mudanças no Frontend

### **app.js - Nova Classe**

```javascript
class PortionPreferences {
  load()        // Carrega do localStorage
  save()        // Salva no localStorage
  reset()       // Restaura padrão
  addToHistory(value)  // Adiciona ao histórico
}

// Na App
this.portionPrefs = new PortionPreferences();
```

### **app.js - Novos Métodos**

```javascript
_renderQuickPortionButtons()      // Renderiza botões dinâmicos
_setupCustomPortionInput()        // Input customizado com Enter
_setupQuickButtonsConfig()        // Config na aba Robô
_setPortionValue(value)           // Atualiza display e localStorage
```

### **HTML - Seções Novas**

```html
<!-- Em: dialog#dlgRun -->
<div class="quick-portions" id="quickPortions">
  <!-- Renderizado dinamicamente -->
</div>

<div class="custom-portion-input">
  <input id="customPeople" type="number" min="1" max="100" />
  <button id="applyCustomPeople">OK</button>
</div>

<!-- Em: tab-robo (nova seção) -->
<section class="config-section">
  <h3>⚡ Atalhos de Pessoas (Quick Buttons)</h3>
  <!-- Form com 6 inputs para customizar botões -->
  <button id="btnSaveQuickButtons">Salvar Preferências</button>
  <button id="btnResetQuickButtons">Restaurar Padrão</button>
</section>
```

### **CSS - Novos Estilos**

```css
.quick-portions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));
  gap: 8px;
}

.quick-portions button {
  padding: 8px;
  border-radius: 6px;
}

.quick-portions button.active {
  background: var(--primary);
  color: white;
}

.custom-portion-input {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.portion-display {
  text-align: center;
  padding: 16px;
  font-size: 2.5rem;
  font-weight: bold;
}

.quick-buttons-config {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
```

---

## 🚀 Fases de Implementação

### **Fase 1: Backend Infra** (2-3 horas)
- [ ] Adicionar colunas ao DB
- [ ] Migrations
- [ ] Atualizar models e schemas
- [ ] Implementar lógica de cálculo
- [x] Compatibilidade com multiplicador (fallback)

### **Fase 2: Frontend Principal** (3-4 horas)
- [ ] Adicionar field `porcoes` no form de receita
- [ ] Novo dialog com quick buttons + input custom
- [ ] Display visual grande de pessoas
- [ ] Lógica de seleção e preview

### **Fase 3: Customização** (2-3 horas)
- [ ] Classe `PortionPreferences`
- [ ] localStorage integration
- [ ] Nova seção na aba Robô
- [ ] Salvar/restaurar botões
- [ ] Histórico de números custom

### **Fase 4: Polish** (1-2 horas)
- [ ] Testes
- [ ] CSS responsivo
- [ ] Validações
- [ ] Toast notifications

**Total Estimado: 8-12 horas**

---

## 💡 Exemplos de Uso

### **Restaurante com Múltiplos Turnos**

```
Almoço: 30 pessoas
Janta: 50 pessoas

Quick Buttons Customizados:
[15p] [30p] [50p] [100p]
```

### **Catering para Eventos**

```
Pequeno evento: 10 pessoas
Médio: 25 pessoas
Grande: 50 pessoas
Extra grande: 100 pessoas

Quick Buttons:
[10p] [25p] [50p] [100p]
```

### **Cozinha Doméstica**

```
Meia receita: 2 pessoas
Normal: 4 pessoas
Dobro: 8 pessoas
Festa: 20 pessoas

Quick Buttons:
[2p] [4p] [8p] [20p]
```

### **Laboratorio de Especiarias**

```
Lote pequeno: 1 pessoa
Lote normal: 5 pessoas
Lote grande: 25 pessoas

Quick Buttons:
[1p] [5p] [25p]
```

---

## ✨ Benefícios Finais

| Benefício | Impacto |
|-----------|---------|
| **Precisão** | Cálculo automático baseado em pessoas |
| **Clareza** | "8 pessoas" é mais claro que "2×" |
| **Flexibilidade** | Customizar botões sem editar receitas |
| **Reutilização** | Mesma receita com diferentes escalas |
| **Portabilidade** | Cada contexto tem seus botões |
| **Offline** | localStorage funciona sem internet |
| **Histórico** | Acesso rápido aos últimos números |
| **Sem Servidor** | localStorage = sem complexidade no backend |

---

## ✅ Próximos Passos

1. **Revisar proposta** → Aprovar ou ajustar
2. **Implementar Fase 1** → Backend infrastructure
3. **Implementar Fase 2** → Frontend principal UI
4. **Implementar Fase 3** → Customization features
5. **Testes** → Mobile, desktop, offline
6. **Deploy** → Production release

---

**Status:** ✅ **Proposta Completa e Pronta para Implementação**

Git: `commit 990e5af` (PORTION_BASED_SCALING.md)
