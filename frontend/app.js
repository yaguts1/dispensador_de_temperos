// ================== Config ==================
const API = 'https://api.yaguts.com.br';
const TEMPEROS = [
  {value:'', label:'Selecione...'},
  {value:'pimenta', label:'Pimenta'},
  {value:'sal', label:'Sal'},
  {value:'alho', label:'Alho em pó'},
  {value:'oregano', label:'Orégano'},
  {value:'cominho', label:'Cominho'}
];

// ================== Helpers UI ==================
const linhasEl = document.getElementById('linhas');
const saida = document.getElementById('saida');

const toast = (msg, type='') => {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = type==='err' ? '#b91c1c' : (type==='ok' ? '#065f46' : '#111827');
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2200);
};

function makeSelect(options, attrs = {}) {
  const s = document.createElement('select');
  Object.entries(attrs).forEach(([k,v]) => s.setAttribute(k, v));
  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.value; o.textContent = opt.label; s.appendChild(o);
  });
  return s;
}

function linhaIngrediente(idx) {
  const row = document.createElement('div');
  row.className = 'row';

  const sTempero = makeSelect(TEMPEROS, { name:`tempero${idx}` });

  const sRes = makeSelect([
    {value:'', label:'—'},
    {value:'1', label:'Reservatório 1'},
    {value:'2', label:'Reservatório 2'},
    {value:'3', label:'Reservatório 3'},
    {value:'4', label:'Reservatório 4'}
  ], { name:`reservatorio${idx}`, disabled:'true' });

  const q = document.createElement('input');
  q.type = 'number'; q.name = `quantidade${idx}`;
  q.min='1'; q.max='500'; q.step='1'; q.disabled = true; q.inputMode = 'numeric';

  const del = document.createElement('button');
  del.type='button'; del.className='btn muted'; del.textContent='×'; del.title='Remover';

  function toggle() {
    const has = !!sTempero.value;
    sRes.disabled = !has; q.disabled = !has;
    if (!has) { sRes.value=''; q.value=''; }
  }

  sTempero.addEventListener('change', toggle);
  del.addEventListener('click', () => { row.remove(); renumerar(); });

  row.appendChild(sTempero); row.appendChild(sRes); row.appendChild(q); row.appendChild(del);
  return row;
}

function renumerar() {
  [...linhasEl.children].forEach((row, i) => {
    const n = i + 1;
    row.querySelector('select[name^="tempero"]').name = `tempero${n}`;
    row.querySelector('select[name^="reservatorio"]').name = `reservatorio${n}`;
    row.querySelector('input[name^="quantidade"]').name = `quantidade${n}`;
  });
}

function addLinha() {
  if (linhasEl.children.length >= 4) { toast('Máximo de 4 ingredientes.', 'err'); return; }
  const row = linhaIngrediente(linhasEl.children.length + 1);
  linhasEl.appendChild(row);
}

// inicia com 1 linha
addLinha();

// ================== Tabs ==================
const tabMontar = document.getElementById('tab-montar');
const tabConsultar = document.getElementById('tab-consultar');
const paneMontar = document.getElementById('pane-montar');
const paneConsultar = document.getElementById('pane-consultar');

function selectTab(which){
  const montar = which === 'montar';
  tabMontar.setAttribute('aria-selected', montar);
  tabConsultar.setAttribute('aria-selected', !montar);
  paneMontar.hidden = !montar;
  paneConsultar.hidden = montar;
}
tabMontar.onclick = () => selectTab('montar');
tabConsultar.onclick = () => { selectTab('consultar'); carregarLista(''); };

// ================== Regras de negócio (cliente) ==================
function coletarIngredientes() {
  const rows = [...linhasEl.children];
  const itens = [];
  const usados = new Set();

  for (const row of rows) {
    const t = row.querySelector('select[name^="tempero"]').value;
    const r = row.querySelector('select[name^="reservatorio"]').value;
    const q = row.querySelector('input[name^="quantidade"]').value;

    if (!t && !r && !q) { continue; } // linha vazia
    if (!(t && r && q)) { throw new Error('Preencha tempero, reservatório e quantidade nas linhas usadas.'); }

    const rNum = Number(r); const qNum = Number(q);
    if (!(rNum>=1 && rNum<=4)) throw new Error('Reservatório deve ser 1, 2, 3 ou 4.');
    if (!(Number.isInteger(qNum) && qNum>=1 && qNum<=500)) throw new Error('Quantidade deve ser inteiro entre 1 e 500 g.');
    if (usados.has(rNum)) throw new Error(`Reservatório ${rNum} repetido na mesma receita.`);
    usados.add(rNum);

    itens.push({ tempero:t, frasco:rNum, quantidade:qNum });
  }
  if (itens.length===0) throw new Error('Inclua pelo menos 1 ingrediente.');
  return itens;
}

// ================== Envio ==================
async function salvarReceita(event) {
  event.preventDefault();
  const nome = document.getElementById('nome').value.trim();
  if (!nome) { toast('Informe o nome da receita', 'err'); return; }

  let ingredientes;
  try { ingredientes = coletarIngredientes(); }
  catch(e){ toast(e.message, 'err'); return; }

  const payload = { nome, ingredientes };
  saida.textContent = 'Enviando...';

  try {
    const resp = await fetch(`${API}/receitas/`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
    const data = await resp.json();
    saida.textContent = JSON.stringify(data, null, 2);
    if (resp.ok) { toast('Receita salva com sucesso!', 'ok'); }
    else { toast(data?.detail || 'Erro ao salvar', 'err'); }
  } catch (err) {
    // fallback: tentar /receitas/form
    try{
      const formData = new FormData();
      formData.append('nome', nome);
      ingredientes.forEach((it, i) => {
        const n = i+1;
        formData.append(`tempero${n}`, it.tempero);
        formData.append(`reservatorio${n}`, String(it.frasco));
        formData.append(`quantidade${n}`, String(it.quantidade));
      });
      const resp2 = await fetch(`${API}/receitas/form`, { method:'POST', body: formData });
      const texto = await resp2.text();
      saida.textContent = texto;
      toast(resp2.ok ? 'Receita salva (fallback form)!' : 'Erro no fallback form', resp2.ok ? 'ok' : 'err');
    }catch(e2){
      saida.textContent = String(e2);
      toast('Falha de rede ao salvar', 'err');
    }
  }
}

// ================== Teste rápido ==================
async function executarReceita(){
  const payload = { nome:'Receita Teste', ingredientes:[
    {tempero:'pimenta', frasco:1, quantidade:2},
    {tempero:'sal', frasco:2, quantidade:1}
  ]};
  saida.textContent = 'Enviando teste...';
  const resp = await fetch(`${API}/receitas/`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
  });
  const data = await resp.json();
  saida.textContent = JSON.stringify(data, null, 2);
  toast(resp.ok ? 'Teste OK' : 'Erro no teste', resp.ok ? 'ok' : 'err');
}

// ================== Consulta ==================
async function carregarLista(q=''){
  const lista = document.getElementById('lista');
  lista.innerHTML = '<div class="hint">Carregando...</div>';
  try{
    const url = new URL(`${API}/receitas/`);
    if(q) url.searchParams.set('q', q);
    const resp = await fetch(url.toString(), { headers:{'Accept':'application/json'} });
    if(!resp.ok) throw new Error('GET /receitas/ não disponível');
    const arr = await resp.json();

    if(!Array.isArray(arr) || arr.length===0){
      lista.innerHTML = '<div class="hint">Nenhuma receita encontrada.</div>';
      return;
    }
    lista.innerHTML = '';
    for(const r of arr){
      const card = document.createElement('div'); card.className='item';
      const h4 = document.createElement('h4'); h4.textContent = r.nome || '(sem nome)'; card.appendChild(h4);
      const meta = document.createElement('small'); meta.textContent = `ID: ${r.id ?? '—'}`; card.appendChild(meta);
      const line = document.createElement('div'); line.style.margin='6px 0';

      if(Array.isArray(r.ingredientes)){
        r.ingredientes.forEach(it=>{
          const span=document.createElement('span'); span.className='tag';
          span.textContent = `${it.tempero} · R${it.frasco} · ${it.quantidade}g`;
          line.appendChild(span);
        });
      }
      card.appendChild(line);

      const btn = document.createElement('button'); btn.className='btn muted'; btn.textContent='Detalhes';
      btn.onclick = ()=> detalharReceita(r.id);
      card.appendChild(btn);

      lista.appendChild(card);
    }
  }catch(e){
    lista.innerHTML = '<div class="hint">Backend não expõe listagem (GET /receitas/). Veja instruções na página.</div>';
  }
}

async function detalharReceita(id){
  if(id==null){ toast('ID inválido', 'err'); return; }
  try{
    const resp = await fetch(`${API}/receitas/${id}`, { headers:{'Accept':'application/json'} });
    if(!resp.ok) throw new Error('GET /receitas/{id} não disponível');
    const data = await resp.json();
    saida.textContent = JSON.stringify(data, null, 2);
    toast('Detalhe carregado');
    selectTab('montar');
  }catch(e){ toast('Endpoint de detalhe não disponível', 'err'); }
}

// ================== Listeners ==================
document.getElementById('addLinha').onclick = addLinha;
document.getElementById('formReceita').addEventListener('submit', salvarReceita);
document.getElementById('btnTeste').onclick = executarReceita;
document.getElementById('btnBuscar').onclick = () => carregarLista(document.getElementById('busca').value.trim());
document.getElementById('btnRecarregar').onclick = () => carregarLista('');
