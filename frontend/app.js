async function executarReceita() {
  const response = await fetch("http://localhost:8000/receitas/", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      nome: "Receita Teste",
      ingredientes: [
        {"frasco": 1, "quantidade": 2.5},
        {"frasco": 2, "quantidade": 1.0}
      ]
    })
  });
  const data = await response.json();
  document.getElementById("resultado").innerText = JSON.stringify(data);
}
