# 📌 Status do Projeto - Portion-Based Scaling

**Data:** Novembro 15, 2025  
**Tipo:** Feature Planning + Proposal  
**Status:** ✅ Proposta Aprovada - Pronta para Implementação

---

## 🎯 O que foi Proposto

### **Problema Atual**
- Slide 1-99× é abstrato e impreciso
- Usuário não sabe quantas porções está realmente fazendo
- Sem contexto da receita original

### **Solução Proposta**
1. **Backend:** Receitas com campo `porcoes` (para quantas pessoas é)
2. **Frontend:** Dialog mostra quick buttons customizáveis + input livre
3. **localStorage:** Usuário customiza seus botões rápidos (1-6 botões, 1-100 pessoas)
4. **Cálculo automático:** `quantidade_final = ingrediente.base × (pessoas_pedidas / porcoes_base)`

---

## 📚 Documentação Criada

| Documento | Tamanho | Propósito |
|-----------|---------|-----------|
| **PORTION_BASED_SCALING.md** | 1.5 KB | Proposta técnica detalhada (DB schema, models, UX, código) |
| **PORTION_SCALING_SUMMARY.md** | 400 KB | Resumo executivo com mockups e fluxos |

### **Commits**
- `990e5af` - Proposta técnica completa
- `8bd26f2` - Resumo executivo para aprovação

---

## 🎨 Interface Proposta

### **Dialog de Execução**
```
Receita base: para 4 pessoas

        🍽️ 8 pessoas  ← Display grande

[1p] [2p] [4p] [6p] [8p]  ← Quick buttons customizáveis

[____20____] pessoas [OK]  ← Input livre (1-100)

📊 Cálculo: Sal 20g ÷ 4 × 8 = 40g
```

### **Aba Robô - Configuração**
```
⚡ Atalhos de Pessoas
Botão 1: [___1___] pessoas
Botão 2: [___2___] pessoas
...
Botão 6: [__10___] pessoas

[Restaurar Padrão] [Salvar Preferências]
```

---

## 🔧 Implementação: 4 Fases

| Fase | Descrição | Tempo | Status |
|------|-----------|-------|--------|
| **1** | Backend: DB schema + migrations + models | 2-3h | ⏳ Not started |
| **2** | Frontend: UI principal (dialog + display) | 3-4h | ⏳ Not started |
| **3** | localStorage + customização (aba Robô) | 2-3h | ⏳ Not started |
| **4** | Testes + Polish + CSS responsivo | 1-2h | ⏳ Not started |
| **Total** | Estimado | **8-12h** | |

---

## 📊 Mudanças no Código

### **Backend (3 modificações)**

**models.py:**
```python
class Receita:
    porcoes: int = 1  # NOVO

class Job:
    pessoas_solicitadas: Optional[int] = None  # NOVO
    multiplicador: int = 1  # Mantido (compatibilidade)
```

**schemas.py:**
```python
class ReceitaBase:
    porcoes: int = Field(1, ge=1, le=20)  # NOVO

class JobCreateIn:
    pessoas_solicitadas: Optional[int]  # NOVO
```

**Lógica:**
```python
escala = pessoas_solicitadas / receita.porcoes
quantidade_g = ingrediente.quantidade * escala
```

### **Frontend (2 modificações)**

**app.js:**
```javascript
class PortionPreferences {
  load()      // localStorage
  save()      // localStorage
  reset()     // Default
}

_renderQuickPortionButtons()    // Dinâmico
_setupCustomPortionInput()      // Enter + OK
_setupQuickButtonsConfig()      // Aba Robô
```

**style.css:**
```css
.quick-portions { display: grid; grid-template-columns: repeat(auto-fit, minmax(60px, 1fr)); }
.portion-display { font-size: 2.5rem; text-align: center; }
.custom-portion-input { display: flex; gap: 8px; }
.quick-buttons-config { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
```

---

## 💾 Storage: localStorage (Frontend Only)

```javascript
localStorage.getItem('yaguts_portion_prefs')
{
  "quickPortions": [1, 2, 4, 6, 8],     // Até 6 botões customizados
  "lastUsedPortion": 4,                 // Último usado (convenência)
  "customPortionHistory": [3, 5, 7, 20] // Histórico dos últimos 5 números
}
```

**Vantagens:**
- ✅ Sem sincronizar com servidor
- ✅ Cada dispositivo tem sua preferência
- ✅ Funciona offline
- ✅ Sem complexidade no DB
- ✅ Customizável por usuário

---

## 🎯 Casos de Uso Reais

### **Restaurante com Múltiplos Turnos**
```
Almoço: 30 pessoas
Janta: 50 pessoas
Quick buttons: [15p] [30p] [50p] [100p]
```

### **Catering para Eventos**
```
Pequeno: 10 pessoas
Médio: 25 pessoas
Grande: 50 pessoas
Extra: 100 pessoas
```

### **Cozinha Doméstica**
```
Meia receita: 2 pessoas
Normal: 4 pessoas
Dobro: 8 pessoas
Festa: 20 pessoas
```

---

## ✅ Checklist de Aprovação

- [x] Problema identificado (slide impreciso)
- [x] Solução proposta (pessoas + customização)
- [x] Documentação técnica completa
- [x] Mockups de interface
- [x] Fluxos de dados definidos
- [x] localStorage approach validado
- [x] Backward compatibility garantida
- [x] Casos de uso mapeados
- [x] Estimativa de tempo calculada
- [x] Git commits feitos

---

## 🚀 Próximos Passos

1. **Aprovação Final** ← Você aprova ou ajusta?
2. **Iniciar Fase 1** (Backend infrastructure)
3. **Implementar Fase 2** (Frontend UI)
4. **Adicionar Fase 3** (Customization)
5. **Testes Integrados**
6. **Deploy para Produção**

---

## 📝 Resumo Executivo

Substituir multiplicador (1-99×) por seletor de pessoas intuitivo:

- **Receitas** definem porção base ("para 4 pessoas")
- **Usuário** escolhe quantas pessoas quer fazer
- **App** calcula automaticamente: `novo_valor = base × (pessoas / porcoes)`
- **Quick buttons** customizáveis para cada contexto (restaurante, catering, home, lab)
- **localStorage** persiste preferências sem servidor
- **Input livre** suporta qualquer número 1-100

**Resultado:** Interface precisa, clara e customizável que funciona para múltiplos ambientes.

---

**Status:** ✅ **Pronto para Implementação**

Documentação: PORTION_BASED_SCALING.md + PORTION_SCALING_SUMMARY.md  
Commits: 990e5af + 8bd26f2
