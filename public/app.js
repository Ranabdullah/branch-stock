'use strict';
const $ = selector => document.querySelector(selector);
const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const demoKey = 'branch-stock-demo-v1';
const now = new Date().toISOString();
const sample = {
  role:'owner',
  shops:[{id:'harbour',name:'Harbour Shop',active:1},{id:'market',name:'Market Shop',active:1}],
  products:[{id:'mug',name:'Ceramic mug',sku:'MUG-01',active:1},{id:'bag',name:'Canvas tote',sku:'BAG-02',active:1},{id:'note',name:'Pocket notebook',sku:'NOTE-03',active:1}],
  stock:[{shop_id:'harbour',product_id:'mug',quantity:12},{shop_id:'harbour',product_id:'bag',quantity:23},{shop_id:'market',product_id:'mug',quantity:8}],
  movements:[{shop_id:'harbour',product_id:'mug',kind:'out',before_qty:15,after_qty:12,actor:'shop',note:'Counter sale',recorded_at:now}]
};
let data;
let selected;
let token = new URLSearchParams(location.hash.slice(1)).get('shop') || '';
if (token) history.replaceState(null,'',location.pathname);
let movement;
const kinds = {in:'Stock in',out:'Stock out',set:'Stock count'};
const status = message => { $('#message').textContent = message; };

async function api(route, body) {
  const options = { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' };
  if (body) {
    options.method = 'POST';
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch('/api/' + route, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}

function render() {
  const owner = data.role === 'owner';
  const shops = data.shops.filter(shop => shop.active);
  if (!shops.some(shop => shop.id === selected)) selected = shops[0]?.id;
  $('#mode').textContent = token ? (owner ? 'Owner workspace' : 'Shop workspace') : 'Demo · sample products';
  $('#connect').hidden = Boolean(token);
  $('#owner').hidden = false;
  $('#shopForm').hidden = !owner;
  $('#shopForm').style.display = owner ? '' : 'none';
  $('#shopActions').hidden = !owner || !selected;
  $('#link').hidden = !token;
  $('#shops').innerHTML = shops.map(shop => `<option value="${shop.id}">${h(shop.name)}</option>`).join('');
  $('#shops').value = selected ?? '';
  const products = selected ? data.products.filter(p => p.active && (!p.shop_id || p.shop_id === selected)) : [];
  const amount = id => data.stock.find(row => row.shop_id === selected && row.product_id === id)?.quantity ?? 0;
  $('#stock').innerHTML = products.map(p => `<tr><td>${h(p.name)}</td><td>${h(p.sku || '—')}</td><td>${amount(p.id)}</td><td><button data-move="${p.id}">Adjust stock</button>${owner ? `<button data-archive="${p.id}">Archive</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4">Add a shop and a product to start tracking stock.</td></tr>';
  $('#movements').innerHTML = data.movements.filter(m => m.shop_id === selected).map(m => `<tr>
    <td><time datetime="${h(m.recorded_at)}" title="${h(m.recorded_at)}">${h(new Date(m.recorded_at).toLocaleString())}</time></td>
    <td>${h(data.products.find(p => p.id === m.product_id)?.name ?? 'Archived product')}</td>
    <td>${kinds[m.kind]}</td><td>${m.before_qty}</td><td>${m.after_qty}</td><td>${m.actor}</td><td>${h(m.note)}</td></tr>`).join('') || '<tr><td colspan="7">No movements for this shop yet.</td></tr>';
}

function openDemo() {
  token = '';
  try { data = JSON.parse(localStorage.getItem(demoKey)) || structuredClone(sample); }
  catch { data = structuredClone(sample); }
  $('#share').replaceChildren();
  status('');
  render();
}

async function change(route, payload, localChange, operation = 'Saved.') {
  try {
    if (token) {
      await api(route, payload);
      data = await api('dashboard');
    } else {
      localChange();
      localStorage.setItem(demoKey, JSON.stringify(data));
    }
    render();
    status(operation);
    return true;
  } catch (error) {
    status(error.message);
    return false;
  }
}

function submit(form, callback) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button:not([type=button])');
    button.disabled = true;
    try { await callback(Object.fromEntries(new FormData(form))); }
    finally { button.disabled = false; }
  });
}

$('#demo').onclick = openDemo;
$('#connect').onclick = () => $('#connectDialog').showModal();
for (const button of document.querySelectorAll('[data-close]')) button.onclick = () => button.closest('dialog').close();
submit($('#connectForm'), async fields => {
  token = fields.key;
  try {
    data = await api('dashboard');
    $('#connectDialog').close();
    $('#connectForm').reset();
    status('');
    render();
  } catch (error) {
    token = '';
    $('#connectDialog').close();
    status(error.message);
  }
});
submit($('#shopForm'), async fields => {
  if (!fields.name.trim()) return status('Enter a shop name.');
  if (await change('shops', fields, () => data.shops.push({id:crypto.randomUUID(), name:fields.name.trim(),active:1}))) $('#shopForm').reset();
});
submit($('#productForm'), async fields => {
  if (!fields.name.trim()) return status('Enter a product name.');
  if (await change('products', fields, () => data.products.push({id:crypto.randomUUID(),name:fields.name.trim(),sku:fields.sku.trim(),active:1}))) $('#productForm').reset();
});
$('#shops').onchange = event => { selected = event.target.value; $('#share').replaceChildren(); render(); };
$('#link').onclick = async () => {
  if (!selected || !confirm('Create a new link? Any previous link for this shop will stop working.')) return;
  try {
    const {key} = await api('link', {id:selected});
    const url = new URL(location.pathname, location.origin);
    url.hash = 'shop=' + key;
    const copy = document.createElement('button');
    copy.textContent = 'Copy shop link';
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(url.href); status('Shop link copied.'); }
      catch { status('Copy the displayed link manually.'); }
    };
    $('#share').replaceChildren(copy, document.createTextNode(' ' + url.href));
  } catch (error) { status(error.message); }
};
function archive(type, id) {
  if (!confirm('Archive this record? Its movement history will remain.')) return;
  $('#share').replaceChildren();
  return change('archive',{type,id},() => { data[type].find(r => r.id === id).active = 0; }, 'Archived.');
}
$('#archiveShop').onclick = () => archive('shops',selected);
$('#stock').onclick = event => {
  const { move, archive: product } = event.target.dataset;
  if (product) return archive('products',product);
  if (!move) return;
  movement = { id:crypto.randomUUID(), shopId:selected,productId:move };
  $('#movementForm').reset();
  $('#movementTitle').textContent = data.products.find(p=>p.id===move).name;
  $('#movementDialog').showModal();
};
submit($('#movementForm'), async fields => {
  const payload = {...movement,kind:fields.kind,quantity:Number(fields.quantity),note:fields.note.trim()};
  const saved = await change('move', payload, () => {
    const {shopId,productId,kind,quantity,note} = payload;
    const row = data.stock.find(s => s.shop_id === shopId && s.product_id === productId);
    const before = row?.quantity ?? 0;
    if (kind !== 'set' && quantity <= 0) throw new Error('Enter a positive quantity.');
    const after = kind === 'set' ? quantity : before + (kind === 'in' ? quantity : -quantity);
    if (after < 0 || after > 100000000) throw new Error('This change exceeds the available stock or quantity limit.');
    if (row) row.quantity = after;
    else data.stock.push({shop_id:shopId,product_id:productId,quantity:after});
    data.movements.unshift({shop_id:shopId,product_id:productId,kind,before_qty:before,after_qty:after,note,actor:'owner',recorded_at:new Date().toISOString()});
    data.movements.length = Math.min(data.movements.length,200);
  }, 'Movement saved.');
  if (saved) $('#movementDialog').close();
  else alert($('#message').textContent);
});
if (token) {
  api('dashboard').then(result => { data = result; render(); }).catch(error => {
    openDemo();
    status(error.message);
  });
} else openDemo();
