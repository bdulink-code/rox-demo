import {menuGroups} from './menu.js';
import {createShiftView} from './shift-ui.js?v=4';
import {loadRun, saveRun, runProgress} from './count-run.js';
import {KEY,products,freshState,calculate,latestCounts,validateState,totals,lowProducts} from './model.js';
const $=s=>document.querySelector(s),main=$('#main'),sheet=$('#sheet'),info=$('#info-dialog');
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(v);
const litres=ml=>`${num(ml/1000)} л`,money=v=>`${num(Math.round(v))} ₽`;
const signed=ml=>`${ml>0?'+':ml<0?'−':''}${num(Math.abs(ml))} мл`;
const time=at=>new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Irkutsk'}).format(new Date(at));
const day=at=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'Asia/Irkutsk'}).format(new Date(at));
let state=freshState(),view='shelf',role='bartender',category='Все',query='',ownerFilter='pending',toastTimer,lastFocus=null;
try{const raw=localStorage.getItem(KEY);if(raw){const saved=JSON.parse(raw);if(validateState(saved))state=saved;else queueMicrotask(()=>toast('Сохранённое демо повреждено. Загружены стартовые данные.'));}}catch{queueMicrotask(()=>toast('Хранилище недоступно. Демо работает до закрытия страницы.'));}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));return true;}catch{return false;}}
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
const roleNames = { bartender: 'Бармен', manager: 'Управляющий', owner: 'Владелец' };
let countRun = loadRun(state.counts), listView = false, guided = false;
const shiftView = createShiftView({main, heading, getRole: () => role, render, toast});
const bottleSlots = new Map(products.map((product, index) => [product.id, index]));
function bottle(p){
  const slot = bottleSlots.get(p.id);
  const x = (slot % 6) * 20;
  const y = Math.floor(slot / 6) * 50;
  return `<span class="bottle-photo" style="--sprite-x:${x}%;--sprite-y:${y}%" aria-hidden="true"></span>`;
}

function chooseMode(){
  const labels = { bartender: 'Полка и счета гостей', manager: 'Касса, выплаты и закрытие смены', owner: 'Сверка и расхождения' };
  info.innerHTML = `<div class="info-body"><div class="sheet-top"><h2 id="info-title">Режим демо</h2>
    <button class="close" data-info-close aria-label="Закрыть">×</button></div>
    <div class="mode-list">${Object.entries(roleNames).map(([key, name]) =>
      `<button data-role="${key}" aria-pressed="${key===role}"><strong>${name}</strong><small>${labels[key]}</small></button>`).join('')}</div></div>`;
  info.showModal();
}

function chooseRole(nextRole){
  if (!Object.hasOwn(roleNames, nextRole)) return;
  role = nextRole;
  if (info.open) info.close();
  const defaultView = {bartender: 'shelf', manager: 'shift', owner: 'owner'};
  setView(view === 'shift' ? 'shift' : defaultView[role]);
}
function heading(title,sub,eyebrow='ROX / BACKSTAGE'){
  return `<section class="page-heading"><div class="heading-text"><p class="eyebrow">${eyebrow}</p>
    <h1>${title}</h1><p class="subtitle">${sub}</p></div></section>`;
}
function nav(){
  for (const button of document.querySelectorAll('nav [data-view]')) {
    const target = button.dataset.view;
    button.hidden = (target==='owner' && role!=='owner') || (target==='counts' && role==='bartender');
    button.classList.toggle('active', target===view);
    if (target===view) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  }
  $('#nav-badge').textContent=totals(state).pending || '';
  $('#role-button').textContent=roleNames[role];
  $('#role-button').setAttribute('aria-label',`Сменить режим. Сейчас ${roleNames[role]}`);
}
function render(){
  const screens = {shelf: renderShelf, menu: renderMenu, counts: renderCounts,
    owner: renderOwner, shift: shiftView.screen, media: renderMedia};
  screens[view]();
  nav();
}
function setView(v){view=v;if(v==='owner')role='owner';render();window.scrollTo({top:0,behavior:'instant'});}
function renderShelf(){
  const {done,next}=runProgress(countRun,state.counts,products);
  const label = !countRun ? 'Начать пересчёт' : next ? 'Продолжить пересчёт' : 'Пересчитать заново';
  main.innerHTML=`<section class="shelf-head rox-night-hero">
    <div><p class="eyebrow">ROX / ОСНОВНОЙ БАР</p><h1>Полка</h1></div>
    <div class="rox-night-actions">
      <a class="small-button" href="./3d.html">3D-полка ↗</a>
      <button class="small-button" data-view="shift">К смене →</button>
    </div>
  </section>
  <section class="count-run" aria-label="Пересчёт полки">
    <div><strong>${countRun && !next ? 'Полка пересчитана' : 'Пересчёт полки'}</strong>
      <span>${done.size} из ${products.length} посчитано</span>
      <progress value="${done.size}" max="${products.length}" aria-label="Посчитано позиций"></progress></div>
    ${role==='owner' ? '<button class="small-button" data-view="owner">К расхождениям</button>'
      : `<button class="primary" data-action="start-count">${label} →</button>`}
  </section>
  <div class="shelf-toolbar simple-toolbar">
    <label class="search"><span aria-hidden="true">⌕</span><input id="search" type="search" placeholder="Найти напиток" aria-label="Найти напиток" value="${esc(query)}" autocomplete="off"></label>
    <button class="small-button" data-action="toggle-list" aria-pressed="${listView}">${listView ? 'Вид полки' : 'Список'}</button>
  </div>
  <section class="bar-room simple-room" aria-label="Полка с напитками">
    <div class="room-header"><span>НАЖМИТЕ НА БУТЫЛКУ</span><span id="result-count"></span></div>
    <div class="bottle-grid${listView?' bottle-list':''}" id="bottles"></div>
  </section>
  <div class="shelf-note"><span>Учебные остатки · этикетки по мотивам оригиналов.</span><button class="small-button" data-view="menu">Меню ROX</button></div>`;
  renderBottles();
}

function renderBottles(){
  const term=query.trim().toLowerCase();
  const low = category==='Заканчивается' ? new Set(lowProducts(state).map(p=>p.id)) : null;
  const filtered=products.filter(p=>(!low||low.has(p.id))&&`${p.name} ${p.kind}`.toLowerCase().includes(term));
  const latest=new Map(latestCounts(state).map(c=>[c.productId,c]));
  const {done,next}=runProgress(countRun,state.counts,products);
  $('#result-count').textContent=`${filtered.length} / ${products.length}`;
  $('#bottles').innerHTML=filtered.map(p=>{
    const c=latest.get(p.id);
    const quantity=c
      ? `${c.sealed} бут.${c.openMl?` + ${num(c.openMl)} мл`:''}`
      : `≈ ${num(p.expected/p.size)} бут.`;
    const status=done.has(p.id)?'✓ Готово':next?.id===p.id?'Дальше':'';
    return `<button class="bottle-card${next?.id===p.id?' next-bottle':''}" data-product="${p.id}" aria-label="${esc(p.name)}, ${quantity}">
      <span class="bottle-stage">${bottle(p)}${status?`<span class="bottle-status">${status}</span>`:''}</span>
      <span class="shelf-plank" aria-hidden="true"></span>
      <span class="bottle-name">${esc(p.name)}</span>
      <span class="bottle-quantity">${quantity}<small>${c?'Последний замер':'По учёту'}</small></span></button>`;
  }).join('') || '<div class="empty"><strong>Ничего не найдено</strong>Попробуйте другое название.</div>';
}

function continueCount(){
  if(role==='owner') return;
  if(!countRun || !runProgress(countRun,state.counts,products).next){
    countRun={afterId:state.counts.at(-1)?.id ?? null};
    saveRun(countRun);
  }
  category='Все';
  query='';
  setView('shelf');
  openProduct(runProgress(countRun,state.counts,products).next.id,true);
}

function record(c,{review=false}={}){const p=products.find(p=>p.id===c.productId);return `<article class="record"><button class="mini-bottle" data-product="${p.id}" aria-label="Открыть ${p.name}" style="border:0">${bottle(p)}</button><div class="record-main"><div class="record-title"><strong>${p.name}</strong><span class="delta ${c.delta>0?'positive':c.delta===0?'zero':''}">${c.delta===0?'Совпадает':signed(c.delta)}</span></div><p class="record-sub">${day(c.at)}, ${time(c.at)} · ${esc(c.actor)}</p><div class="record-values"><span>По учёту <b>${litres(c.expected)}</b></span><span>По факту <b>${litres(c.actual)}</b></span></div>${c.note?`<p class="note">${esc(c.note)}</p>`:''}${c.reviewed?`<p class="record-sub">✓ ${c.reviewedAt?'Просмотрено владельцем · '+time(c.reviewedAt):c.delta===0?'Остаток совпадает':'Просмотрено владельцем'}</p>`:''}</div>${review&&c.delta!==0&&!c.reviewed?`<button class="small-button review-button" data-review="${c.id}">Отметить проверенным</button>`:''}</article>`;}
function renderCounts(){const latest=latestCounts(state).sort((a,b)=>new Date(b.at)-new Date(a.at));main.innerHTML=heading('Пересчитать. И выдохнуть.','Каждая бутылка на счету. Каждый пересчёт сохранён.','РАБОЧЕЕ МЕСТО БАРМЕНА')+`<section class="owner-intro"><span class="big-icon" aria-hidden="true">☷</span><p><strong>Посчитано ${latest.length} из ${products.length} позиций</strong>Закрытые бутылки — в штуках. Остаток в открытых — суммарно в миллилитрах.</p></section><div class="section-title"><h2>Последние пересчёты</h2><button class="small-button" data-action="shelf">+ Пересчитать</button></div><div class="count-list">${latest.length?latest.map(c=>record(c)).join(''):'<div class="empty"><strong>Начните с первой бутылки</strong>Выберите напиток на полке.</div>'}</div><h3 class="history-heading">История действий <span style="color:var(--muted)">/ ${state.counts.length}</span></h3><div>${[...state.counts].reverse().slice(0,20).map(c=>`<div class="history-row"><div>${products.find(p=>p.id===c.productId).name}<small>${day(c.at)} · ${time(c.at)} · ${esc(c.actor)}</small></div><div>${litres(c.actual)}<small>${signed(c.delta)} к учёту</small></div></div>`).join('')}</div>${state.counts.length>20?'<p class="record-sub">Показаны последние 20 действий. Более ранние пересчёты сохранены в этом браузере.</p>':''}<div class="section-bottom"><p>Данные сохраняются только в этом браузере. Демороли доступны без авторизации.</p><button class="quiet-button" data-action="reset">Начать демо заново</button></div>`;}
function renderOwner(){const t=totals(state),latest=latestCounts(state).sort((a,b)=>new Date(b.at)-new Date(a.at));const filtered=latest.filter(c=>ownerFilter==='all'||ownerFilter==='pending'&&c.delta!==0&&!c.reviewed||ownerFilter==='reviewed'&&(c.reviewed||c.delta===0));main.innerHTML=heading('Бар под контролем.','Видно главное: где всё сходится, а где нужен второй взгляд.','РАБОЧЕЕ МЕСТО ВЛАДЕЛЬЦА')+shiftView.ownerSummary()+`<section class="overview"><div class="metric"><span class="metric-label">Требуют внимания</span><strong class="${t.pending?'accent':''}">${t.pending}<small>поз.</small></strong></div><div class="metric"><span class="metric-label">Недостача · по себест.</span><strong class="accent">${money(t.shortage)}</strong></div><div class="metric"><span class="metric-label">Излишек · по себест.</span><strong>${money(t.surplus)}</strong></div></section><section class="restock-summary"><span>Проверить запас перед сменой</span><strong>${lowProducts(state).length} — меньше одной бутылки</strong><p>${lowProducts(state).map(p=>p.name).join(" · ")||"Все позиции выше демопорога"}</p><button class="small-button" data-action="low">Посмотреть на полке ↗</button><small>По последнему замеру, иначе по демосрезу. Порог пока условный.</small></section><section class="owner-intro"><span class="big-icon" aria-hidden="true">◈</span><p><strong>Сначала проверяем, потом делаем выводы</strong>Расхождение может возникнуть из-за замера, рецептуры или пропущенного документа.</p></section><div class="owner-layout"><section><div class="owner-tabs" aria-label="Фильтр пересчётов">${[['pending','На проверке'],['all','Все'],['reviewed','Проверены']].map(([id,title])=>`<button class="chip ${ownerFilter===id?'active':''}" data-owner-filter="${id}" aria-pressed="${ownerFilter===id}">${title}${id==='pending'?' · '+t.pending:''}</button>`).join('')}</div><div class="count-list">${filtered.length?filtered.map(c=>record(c,{review:true})).join(''):`<div class="empty"><strong>${ownerFilter==='pending'?'Всё проверено ✓':'Пока ничего нет'}</strong>${ownerFilter==='pending'?'Новые расхождения появятся здесь после пересчёта.':'Пересчёты появятся после работы с полкой.'}</div>`}</div></section><aside class="owner-aside" style="margin-top:24px"><p class="eyebrow">ПРОЗРАЧНЫЙ УЧЁТ</p><h3>За каждой цифрой — действие.</h3><ol><li>Бармен вводит фактический остаток.</li><li>Прототип сравнивает его с учётным срезом.</li><li>Владелец проверяет причину расхождения.</li></ol><p>Отметка «проверено» фиксирует просмотр. Она не меняет остаток, не списывает товар и не скрывает расхождение из общей суммы.</p><p>Суммы рассчитаны по демонстрационной себестоимости. Это не выручка и не прибыль.</p></aside></div><div class="section-bottom"><p>Срез по учёту: 6 ноября 2026, 21:00. Часовой пояс: Иркутск. Демо не получает новые продажи.</p><button class="quiet-button" data-action="reset">Начать демо заново</button></div>`;}
function openProduct(id, nextInRun=false){
  const p=products.find(item=>item.id===id);
  if(!p) return;
  guided=nextInRun;
  if(!sheet.open) lastFocus=document.activeElement;
  const c=latestCounts(state).find(item=>item.productId===id);
  const {done}=runProgress(countRun,state.counts,products);
  const showComparison=!guided || role==='owner';
  sheet.classList.add('quick-sheet');
  sheet.innerHTML=`<div class="sheet-inner"><div class="sheet-handle"></div>
    <div class="sheet-top"><span class="eyebrow">${guided ? `ПЕРЕСЧЁТ · ${done.size} ИЗ ${products.length}` : esc(p.kind.toUpperCase())}</span>
      <button class="close" data-close aria-label="Закрыть карточку">×</button></div>
    <div class="product-summary quick-product"><div class="product-portrait">${bottle(p)}</div>
      <div><h2 id="sheet-title">${esc(p.name)}</h2><p>Бутылка · ${p.size} мл</p>
        ${showComparison?`<div class="stock-value">${litres(p.expected)} <span>по учёту</span></div>
        ${c?`<p>Последний замер: ${litres(c.actual)}</p>`:''}`:''}
      </div></div>
    ${role==='owner'?'<p class="shift-help">Замеры сотрудника доступны в «Контроле».</p>':`
      <form id="count-form" data-product-id="${p.id}" novalidate>
        <div class="quick-field"><label for="sealed">Целых бутылок</label>
          <div class="stepper">
            <button type="button" data-step="-1" aria-label="Уменьшить количество">−</button>
            <input id="sealed" name="sealed" type="text" inputmode="numeric" autocomplete="off" placeholder="0" required>
            <button type="button" data-step="1" aria-label="Увеличить количество">+</button>
          </div></div>
        <div class="quick-field"><label for="opened">В открытых, всего мл</label>
          <div class="open-volume"><input id="opened" name="opened" type="text" inputmode="numeric" autocomplete="off" placeholder="мл" required>
            <button type="button" data-no-open>Открытых нет</button></div></div>
        <div class="live-result" aria-live="polite"><div>Всего на полке<b id="actual-result">—</b></div>
          ${showComparison?`<div>К учётному остатку<b id="delta-result">—</b></div>`:''}</div>
        <details class="count-note"><summary>Комментарий</summary><textarea id="count-note" maxlength="500" aria-label="Комментарий к пересчёту"></textarea></details>
        <p id="form-error" class="error" role="alert"></p>
        <button class="primary" type="submit">${guided?'Сохранить и дальше':'Сохранить пересчёт'} →</button>
      </form>`}
    </div>`;
  if(!sheet.open) sheet.showModal();
  else sheet.scrollTop=0;
  sheet.querySelector('[data-close]').focus({preventScroll:true});
  document.body.style.overflow='hidden';
}

function updateCountPreview(){
  const form=$('#count-form');
  if(!form) return;
  const p=products.find(item=>item.id===form.dataset.productId);
  $('#form-error').textContent='';
  const delta=$('#delta-result');
  try {
    const values=calculate(p,$('#sealed').value,$('#opened').value);
    $('#actual-result').textContent=litres(values.actual);
    if(delta) delta.textContent=signed(values.delta);
  } catch {
    $('#actual-result').textContent='—';
    if(delta) delta.textContent='—';
  }
}

sheet.addEventListener('close',()=>{
  document.body.style.overflow='';
  if(lastFocus?.isConnected) lastFocus.focus();
  else document.querySelector('[data-action="start-count"]')?.focus({preventScroll:true});
});
sheet.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(button?.hasAttribute('data-close')) sheet.close();
  if(button?.dataset.step){
    const field=$('#sealed');
    const current=/^\d+$/.test(field.value.trim())?Number(field.value):0;
    field.value=String(Math.min(999,Math.max(0,current+Number(button.dataset.step))));
    updateCountPreview();
  }
  if(button?.hasAttribute('data-no-open')){
    $('#opened').value='0';
    updateCountPreview();
  }
  if(event.target===sheet){
    const bounds=sheet.getBoundingClientRect();
    if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom) sheet.close();
  }
});
sheet.addEventListener('input',event=>{
  if(['sealed','opened'].includes(event.target.id)) updateCountPreview();
});
sheet.addEventListener('submit',event=>{
  event.preventDefault();
  if(role==='owner' || event.target.id!=='count-form') return;
  const p=products.find(item=>item.id===event.target.dataset.productId);
  try {
    const values=calculate(p,$('#sealed').value,$('#opened').value);
    state.counts.push({
      id:crypto.randomUUID ? crypto.randomUUID() : Date.now()+'-'+Math.random().toString(36).slice(2),
      productId:p.id,...values,note:$('#count-note').value.trim(),
      at:new Date().toISOString(),actor:roleNames[role]+' · демо',reviewed:values.delta===0,
    });
    const saved=persist();
    const {next}=runProgress(countRun,state.counts,products);
    render();
    if(guided && next) openProduct(next.id,true);
    else sheet.close();
    toast(saved ? (guided && !next ? 'Все позиции посчитаны' : 'Остаток сохранён') : 'Замер записан до закрытия страницы.');
  } catch(error) {
    $('#form-error').textContent=error.message;
  }
});

function showInfo(reset=false){info.innerHTML=reset?`<div class="info-body"><div class="sheet-top"><h2 id="info-title">Начать демо заново?</h2><button class="close" data-info-close aria-label="Закрыть">×</button></div><p>В этом браузере восстановятся стартовые остатки и учебная смена.</p><button class="primary" data-confirm-reset>Восстановить демоданные</button><button class="small-button" data-info-close>Продолжить работу</button></div>`:`<div class="info-body"><div class="sheet-top"><h2 id="info-title">ROX. Своя полка.</h2><button class="close" data-info-close aria-label="Закрыть">×</button></div><p>Демо для бармена, управляющего и владельца. На экране «Смена» можно закрыть учебные счета, отметить выплаты и передать кассу на проверку. Названия взяты с двух фотографий меню ROX в 2ГИС. Остатки, объёмы бутылок и закупочные цены демонстрационные. iiko не подключена.</p><p>Выберите бутылку, введите фактический остаток и откройте «Контроль». Для первой пробы: у Barrister введите 4 закрытые бутылки и 200 мл в открытых. Получится 3 л и расхождение −120 мл.</p><p>Роли здесь переключаются свободно — это демонстрация интерфейсов, не система доступа. Пересчёты остаются в текущем браузере; на другом телефоне или после очистки данных их не будет.</p><p>Интерьер — иллюстрация по мотивам оформления ROX. Этикетки сгенерированы по мотивам оригинальных упаковок.</p><p>Точный остаток доступен в карточке бутылки.</p><button class="primary" data-info-close>Посмотреть полку →</button></div>`;info.showModal();}
info.addEventListener('click',e=>{if(e.target.closest('[data-info-close]'))info.close();if(e.target.closest('[data-confirm-reset]')){state=freshState();countRun=null;saveRun(null);const stockSaved=persist();const shiftSaved=shiftView.reset();const saved=stockSaved&&shiftSaved;info.close();render();toast(saved?'Демо восстановлено. Можно попробовать снова.':'Демо сброшено в памяти; сохранение в браузер недоступно.');}});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.view)setView(b.dataset.view);if(b.dataset.role)chooseRole(b.dataset.role);if(b.dataset.category){category=b.dataset.category;renderShelf();nav();}if(b.dataset.product)openProduct(b.dataset.product);if(b.dataset.ownerFilter){ownerFilter=b.dataset.ownerFilter;renderOwner();nav();}if(b.dataset.review){const c=state.counts.find(c=>c.id===b.dataset.review);if(c&&!c.reviewed){c.reviewed=true;c.reviewedAt=new Date().toISOString();const saved=persist();render();toast(saved?'Проверка отмечена. Учётный остаток не изменён.':'Отметка в памяти; сохранение недоступно.');}}if(b.dataset.action==='low'){category='Заканчивается';query='';setView('shelf');}if(b.dataset.action==='control')setView('owner');if(b.dataset.action==='shelf')setView('shelf');if(b.dataset.action==='reset')showInfo(true);
  if(b.dataset.action==='sample-count')openSampleCount();
  if(b.dataset.action==='start-count')continueCount();
  if(b.dataset.action==='toggle-list'){listView=!listView;renderShelf();}
  if(b.dataset.action==='about')showInfo();
  shiftView.click(b);});
document.addEventListener('input',e=>{if(e.target.id==='search'){query=e.target.value;renderBottles();}});
$('.brand').addEventListener('click',e=>{e.preventDefault();category='Все';query='';setView('shelf');});
$('#role-button').addEventListener('click',chooseMode);
document.addEventListener('submit', shiftView.submit);
render();

function renderMenu(){main.innerHTML=heading('То самое меню ROX.','Ассортимент с двух фотографий меню в 2ГИС.','ROX / DRINKS')+`<section class="menu-intro"><span class="menu-logo">drinks.</span><p>Коктейли, крепкий алкоголь, вино и шоты.</p><small>Цены переписаны с фото, актуальность не подтверждена. Объём порции на фото не указан. Это справочник, не приём заказов.</small><a href="https://2gis.ru/ulanude/firm/70000001104914446/tab/menu" target="_blank" rel="noopener noreferrer">Посмотреть оригинал меню ↗</a></section><div class="menu-groups">${menuGroups.map(g=>`<section class="menu-group"><h2>${g.name}</h2>${g.items.map(([name,price])=>`<div class="menu-item"><span>${name}</span><strong>${price} <small>₽</small></strong></div>`).join('')}</section>`).join('')}</div><section class="owner-intro"><p><strong>Коктейль — это рецептура, а не бутылка.</strong>Списание ингредиентов добавим после получения техкарт ROX. Рецепты и популярность напитков по фото определить нельзя.</p></section>`;}

function openSampleCount(){
  role='bartender';
  setView('shelf');
  openProduct('barrister');
  $('#sealed').value = '4';
  $('#opened').value = '200';
  $('#opened').dispatchEvent(new Event('input', {bubbles: true}));
}

function renderMedia(){
  main.innerHTML = heading('Попробовать ROX', 'От бутылки на полке до проверенной смены.', 'ROX / ПОКАЗ')
    + `<div class="tour-grid">
      <figure class="tour-card"><img src="rox-room-v005.webp" alt="Иллюстрация ночного бара ROX">
        <figcaption><h2>Бар как в игре</h2><p>Визуальный концепт, созданный ИИ.</p></figcaption>
      </figure>
      <section>
        <article class="tour-card"><span class="tour-step">01 / ПОЛКА</span><h2>Пересчитайте Barrister</h2>
          <p>4 бутылки по 700 мл и 200 мл в открытых дают 3 л. Сохраните замер и найдите разницу в «Контроле».</p>
          <button class="primary" data-action="sample-count">Попробовать пересчёт →</button></article>
        <article class="tour-card"><span class="tour-step">02 / СМЕНА</span><h2>Закройте учебный счёт</h2>
          <p>Проведите один счёт наличными, второй картой. Посмотрите, как меняется сумма к выплате.</p>
          <button class="small-button" data-view="shift">Перейти к смене →</button></article>
        <article class="tour-card"><span class="tour-step">03 / КОНТРОЛЬ</span><h2>Проверьте смену владельцем</h2>
          <p>Управляющий отправляет отчёт после чек-листа. Владелец сверяет кассу и может вернуть отчёт с комментарием.</p>
          <button class="small-button" data-role="owner">Открыть контроль →</button></article>
        <button class="small-button" data-action="about">О демо</button>
      </section>
    </div>`;
}
