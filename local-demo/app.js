'use strict';
const $ = selector => document.querySelector(selector);
const key = 'branch-stock-local-v1';
const html = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const dateTime = new Intl.DateTimeFormat('en-IE',{dateStyle:'medium',timeStyle:'medium'});
function example(){
  const shops = [{id:'harbour',name:'Harbour Shop'},{id:'market',name:'Market Shop'}];
  const products = [{id:'mug',name:'Ceramic mug',category:'Homeware',sku:'MUG-01',threshold:5},{id:'tote',name:'Canvas tote',category:'Accessories',sku:'TOTE-02',threshold:5},{id:'pad',name:'Pocket notebook',category:'Stationery',sku:'PAD-03',threshold:5}];
  const stock = {harbour:{mug:12,tote:4,pad:25},market:{mug:8,tote:10,pad:5}};
  const at = new Date().toISOString();
  const movements = [
    {shopId:'harbour',shop:'Harbour Shop',productId:'mug',product:'Ceramic mug',category:'Homeware',kind:'out',from:15,to:12,note:'Sample stock out',at},
    {shopId:'market',shop:'Market Shop',productId:'tote',product:'Canvas tote',category:'Accessories',kind:'in',from:4,to:10,note:'Sample delivery',at}
  ];
  return {shops,products,stock,movements,expiry:{}};
}
function read(){
  try { return JSON.parse(localStorage.getItem(key)) || example(); }
  catch { return example(); }
}
let data = read();
let adjustId;
const status = message => { $('#message').textContent = message; };
function change(update,message){
  const next = read();
  try {
    update(next);
    localStorage.setItem(key,JSON.stringify(next));
    data=next;
    render();
    status(message);
    return true;
  } catch(error){ status(error.message); return false; }
}
function id(){ return crypto.randomUUID(); }
function qty(shopId,productId,state=data){ return state.stock[shopId]?.[productId] ?? 0; }
const typeLabel={in:'Stock in',out:'Stock out',set:'Count'};
const delta=entry=>entry.to-entry.from;
const active=rows=>rows.filter(row=>!row.archived);
function options(select, rows, first){
  const selected=select.value;
  select.innerHTML=(first?'<option value="all">All shops</option>':'')+rows.map(row=>`<option value="${html(row.id)}">${html(row.name)}${row.archived?' (archived)':''}</option>`).join('');
  if([...select.options].some(option=>option.value===selected)) select.value=selected;
}
function stats(id,rows){
  $(id).innerHTML=rows.map(([name,value])=>`<div><span>${name}</span><strong>${value}</strong></div>`).join('');
}
function inventory(){
  const shop=$('#shop').value;
  const query=$('#search').value.trim().toLowerCase();
  const products=shop?active(data.products):[];
  const low=products.filter(row=>qty(shop,row.id)<=row.threshold);
  stats('#stockSummary',[['Products',products.length],['Units in stock',products.reduce((sum,row)=>sum+qty(shop,row.id),0)],['Low stock',low.length]]);
  const visible=($('#low').checked?low:products).filter(row=>[row.name,row.category,row.sku].some(value=>value.toLowerCase().includes(query)));
  $('#stock').innerHTML=visible.map(row=>{
    const quantity=qty(shop,row.id);
    const expiry=data.expiry?.[shop]?.[row.id];
    const today=new Intl.DateTimeFormat('sv-SE').format(new Date());
    return `<tr><td>${html(row.name)}</td><td>${html(row.category)}</td><td>${html(row.sku||'—')}</td><td class="${quantity<=row.threshold?'low':''}">${quantity}</td><td class="${expiry && expiry<=today?'low':''}">${html(expiry||'—')}</td><td><button data-adjust="${html(row.id)}">Adjust stock</button><button data-expiry="${html(row.id)}">Set expiry</button></td></tr>`;
  }).join('') || '<tr><td colspan="6">No matching products. Add shops and items under Manage.</td></tr>';
}
// Adapted from the original movement dashboard's date, direction and search filters.
function movementRangeStart(range){
  if(range==='all') return null;
  const start=new Date();
  start.setHours(0,0,0,0);
  if(range!=='today') start.setDate(start.getDate()-Number.parseInt(range,10));
  return start.getTime();
}
function movementEntries(){
  const start=movementRangeStart($('#movementRange').value);
  const type=$('#movementType').value;
  const shop=$('#movementShop').value;
  const search=$('#movementSearch').value.trim().toLowerCase();
  return data.movements.filter(entry=>{
    if(shop!=='all' && entry.shopId!==shop) return false;
    if(start!==null && Date.parse(entry.at)<start) return false;
    if(type==='added' && delta(entry)<=0) return false;
    if(type==='gone' && delta(entry)>=0) return false;
    return [entry.category,entry.product,entry.shop,entry.note].some(value=>value.toLowerCase().includes(search));
  });
}
function outgoing(entries,key,label){
  const counts=new Map();
  for(const entry of entries){
    const removed=entry.from-entry.to;
    if(removed<=0) continue;
    const row=counts.get(entry[key]) || {name:entry[label],removed:0};
    row.removed+=removed;
    counts.set(entry[key],row);
  }
  return [...counts.values()].sort((a,b)=>b.removed-a.removed || a.name.localeCompare(b.name)).slice(0,8);
}
function graph(title,rows){
  return `<article><h2>${title}</h2>${rows.length?rows.map(row=>`<div class="chart-row"><span>${html(row.name)}</span><meter min="0" max="${rows[0].removed}" value="${row.removed}" aria-label="${html(row.name)} units out"></meter><strong>${row.removed}</strong></div>`).join(''):'<p>No outgoing units for these filters.</p>'}</article>`;
}
function movements(){
  const entries=movementEntries();
  stats('#movementSummary',[['Movements',entries.length],['Units in',entries.reduce((sum,row)=>sum+Math.max(0,delta(row)),0)],['Units out',entries.reduce((sum,row)=>sum+Math.max(0,-delta(row)),0)]]);
  $('#charts').innerHTML=graph('Outgoing by product',outgoing(entries,'productId','product'))+graph('Outgoing by category',outgoing(entries,'category','category'));
  $('#log').innerHTML=entries.map(row=>`<tr><td><time datetime="${html(row.at)}" title="${html(row.at)}">${dateTime.format(new Date(row.at))}</time></td><td>${html(row.shop)}</td><td>${html(row.product)}</td><td>${typeLabel[row.kind]}</td><td>${row.from}</td><td>${row.to}</td><td>${delta(row)>0?'+':''}${delta(row)}</td><td>${html(row.note)}</td></tr>`).join('') || '<tr><td colspan="8">No movements match your filters.</td></tr>';
}
function render(){
  options($('#shop'),active(data.shops),false);
  options($('#movementShop'),data.shops,true);
  inventory();
  movements();
  for(const [list,type] of [['#shops','shops'],['#products','products']]){
    $(list).innerHTML=data[type].map(row=>`<li><span>${html(row.name)}${row.archived?' · Archived':''}</span><button data-toggle="${html(row.id)}" data-type="${type}">${row.archived?'Restore':'Archive'}</button></li>`).join('');
  }
}
function switchView(view){
  for(const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed',button.dataset.view===view);
  for(const panel of document.querySelectorAll('[data-panel]')) panel.hidden=panel.id!==view;
  $('#title').textContent={inventory:'Inventory',movement:'Stock movements',manage:'Manage catalogue'}[view];
}
for(const button of document.querySelectorAll('[data-view]')) button.onclick=()=>switchView(button.dataset.view);
for(const element of document.querySelectorAll('.filters input,.filters select')) element.addEventListener('input',()=>{inventory();movements();});
const dialog=$('#adjustDialog');
const form=$('#adjustForm');
const expiryDialog=$('#expiryDialog');
const expiryForm=$('#expiryForm');
let expiryTarget;
$('#stock').onclick=event=>{
  if(event.target.dataset.expiry){
    expiryTarget={shop:$('#shop').value,product:event.target.dataset.expiry};
    expiryForm.elements.date.value=data.expiry?.[expiryTarget.shop]?.[expiryTarget.product] || '';
    expiryDialog.showModal();
    return;
  }
  if(!event.target.dataset.adjust) return;
  adjustId=event.target.dataset.adjust;
  const product=data.products.find(row=>row.id===adjustId);
  $('#adjustTitle').textContent=product.name;
  $('#adjustQuantity').textContent='Current stock '+qty($('#shop').value,adjustId);
  form.reset();
  dialog.showModal();
};
$('#cancel').onclick=()=>dialog.close();
$('#cancelExpiry').onclick=()=>expiryDialog.close();
expiryForm.onsubmit=event=>{
  event.preventDefault();
  const {shop,product}=expiryTarget;
  const date=expiryForm.elements.date.value;
  if(change(next=>{
    if(!active(next.shops).some(row=>row.id===shop) || !active(next.products).some(row=>row.id===product)) throw Error('This product or shop is archived.');
    next.expiry ||= {};
    next.expiry[shop] ||= {};
    if(date) next.expiry[shop][product]=date;
    else delete next.expiry[shop][product];
  },date?'Expiry saved.':'Expiry cleared.')) expiryDialog.close();
  else alert($('#message').textContent);
};
form.onsubmit=event=>{
  event.preventDefault();
  const {kind,quantity,note}=Object.fromEntries(new FormData(form));
  const amount=Number(quantity);
  const shopId=$('#shop').value;
  const saved=change(next=>{
    const product=active(next.products).find(row=>row.id===adjustId);
    const shop=active(next.shops).find(row=>row.id===shopId);
    if(!product || !shop) throw Error('This product or shop is archived.');
    const from=qty(shopId,adjustId,next);
    const to=kind==='set'?amount:from+(kind==='in'?amount:-amount);
    if(!Number.isSafeInteger(to) || to<0 || to>1000000 || (kind!=='set' && amount<1)) throw Error('Check the quantity and available stock.');
    if(from===to) throw Error('The quantity is unchanged.');
    next.stock[shopId] ||= {};
    next.stock[shopId][adjustId]=to;
    next.movements.unshift({shopId,shop:shop.name,productId:product.id,product:product.name,category:product.category,kind,from,to,note:note.trim(),at:new Date().toISOString()});
  },'Movement recorded.');
  if(saved) dialog.close();
  else alert($('#message').textContent);
};
for(const [selector,type] of [['#shopForm','shops'],['#productForm','products']]){
  const entryForm=$(selector);
  entryForm.onsubmit=event=>{
    event.preventDefault();
    const values=Object.fromEntries(new FormData(entryForm));
    const name=values.name.trim();
    if(!name || (type==='products' && !values.category.trim())) return status('Enter a name and the required category.');
    if(change(next=>{
      if(next[type].some(row=>row.name.toLowerCase()===name.toLowerCase() && (type==='shops' || row.category.toLowerCase()===values.category.trim().toLowerCase()))) throw Error('That entry already exists. Restore it if archived.');
      const row={id:id(),name};
      if(type==='products') Object.assign(row,{category:values.category.trim(),sku:values.sku.trim(),threshold:Number(values.threshold)});
      next[type].push(row);
    },'Entry added.')) entryForm.reset();
  };
}
$('#manage').onclick=event=>{
  const {type,toggle}=event.target.dataset;
  if(!toggle) return;
  const row=data[type].find(row=>row.id===toggle);
  if(!row.archived && !confirm('Archive this entry? Its movements will stay in the report.')) return;
  change(next=>{next[type].find(row=>row.id===toggle).archived=!row.archived;},row.archived?'Entry restored.':'Entry archived.');
};
$('#reset').onclick=()=>{
  if(!confirm('Reset all local sample changes?')) return;
  change(next=>Object.assign(next,example()),'Sample data restored.');
};
$('#csv').onclick=()=>{
  const cell=value=>typeof value==='number'?String(value):'"'+String(value).replace(/^[\s]*[=+\-@]/,text=>"'"+text).replace(/"/g,'""')+'"';
  const rows=[['Timestamp (UTC)','Shop','Product','Category','Movement','Before','After','Change','Note']];
  for(const row of movementEntries()) rows.push([row.at,row.shop,row.product,row.category,typeLabel[row.kind],row.from,row.to,delta(row),row.note]);
  const blob=new Blob(['\ufeff',rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download='branch-stock-movements.csv';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('#print').onclick=()=>window.print();
window.addEventListener('storage',event=>{if(event.key===key){data=read();render();}});
switchView('inventory');
render();
