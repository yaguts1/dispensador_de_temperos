// -------- Teste rápido JSON --------
async function executarReceita() {
  const payload = {
    nome: "Receita Teste",
    ingredientes: [
      { tempero: "pimenta", frasco: 1, quantidade: 2 },
      { tempero: "sal",     frasco: 2, quantidade: 1 }
    ]
  };

  const resp = await fetch("https://api.yaguts.com.br/receitas/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await resp.json();
  document.getElementById("resultado").textContent = JSON.stringify(data, null, 2);
}

// -------- Lógica do formulário --------
function toggleRow(row) {
  const sel = row.querySelector('select[name^="tempero"]');
  const res = row.querySelector('select[name^="reservatorio"]');
  const qty = row.querySelector('input[name^="quantidade"]');
  const hasTempero = sel.value !== "";
  res.disabled = !hasTempero;
  qty.disabled = !hasTempero;
  if (!hasTempero) {
    res.value = "";
    qty.value = "";
  }
}

function setupForm() {
  const rows = document.querySelectorAll("tbody tr");
  rows.forEach((row, idx) => {
    const tempero = row.querySelector('select[name^="tempero"]');
    // primeira linha sempre habilitada; demais começam desabilitadas
    if (idx > 0) {
      row.querySelector('select[name^="reservatorio"]').disabled = true;
      row.querySelector('input[name^="quantidade"]').disabled = true;
    }
    tempero.addEventListener("change", () => toggleRow(row));
  });

  const form = document.getElementById("formReceita");
  form.addEventListener("submit", () => {
    // desabilita campos de linhas incompletas => não são enviados
    document.querySelectorAll("tbody tr").forEach((row) => {
      const t = row.querySelector('select[name^="tempero"]');
      const r = row.querySelector('select[name^="reservatorio"]');
      const q = row.querySelector('input[name^="quantidade"]');
      if (!t.value || !r.value || !q.value) {
        [t, r, q].forEach((el) => (el.disabled = true));
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnTeste").addEventListener("click", executarReceita);
  setupForm();
});

// expõe no escopo global (caso use inline)
window.executarReceita = executarReceita;
