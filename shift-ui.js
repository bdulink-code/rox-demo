import {
  BILLS, STAFF, CHECKS, MOVEMENTS, CASH_RESERVE, OPENING_CASH, START_HOUR,
  SHIFT_KEY, freshShift, restoreShift, payDue, cashForPay, rubles, applyShiftEvent,
} from './shift.js';

const format = new Intl.NumberFormat('ru-RU');
const money = amount => `${format.format(amount)} ₽`;
const signed = amount => amount === 0 ? 'Сходится' : `${amount > 0 ? '+' : '−'}${money(Math.abs(amount))}`;
const safe = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const localTime = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Irkutsk' });
const phases = { open: 'Идёт смена', submitted: 'На проверке', reviewed: 'Проверено' };
const roleNames = { bartender: 'Бармен', manager: 'Управляющий', owner: 'Владелец' };
const hhmm = hour => `${String(hour % 24).padStart(2, '0')}:00`;

export function createShiftView({ main, heading, getRole, render, toast }) {
  let shift = freshShift();
  try {
    const raw = localStorage.getItem(SHIFT_KEY);
    if (raw) shift = restoreShift(JSON.parse(raw));
  } catch {
    queueMicrotask(() => toast('Загрузили стартовый пример смены.'));
  }

  function save() {
    try {
      localStorage.setItem(SHIFT_KEY, JSON.stringify({ version: shift.version, events: shift.events }));
      return true;
    } catch {
      return false;
    }
  }

  function commit(event, message) {
    shift = applyShiftEvent(shift, {
      note: '', ...event, actor: roleNames[getRole()], at: new Date().toISOString(),
    });
    const saved = save();
    render();
    toast(saved ? message : 'Действие записано до закрытия страницы.');
  }

  function wageRows(canPay) {
    return STAFF.map(person => {
      const due = payDue(shift, person);
      const paid = shift.paid[person.id] ?? 0;
      const enough = due <= cashForPay(shift);
      return `<article class="shift-row">
        <div><strong>${person.name}</strong><small>${person.job} · ${money(person.rate)}/ч</small></div>
        <div><strong>${money(due)} к выплате</strong><small>Начислено ${money(shift.hours * person.rate)} · выдано ${money(paid)}</small></div>
        ${canPay && due ? (enough
          ? `<button class="small-button" data-shift-pay="${person.id}">Отметить выплату</button>`
          : '<span class="shift-chip warning">Мало наличных</span>') : ''}
      </article>`;
    }).join('');
  }

  function billRows(open) {
    return BILLS.map(bill => {
      const method = shift.bills[bill.id];
      return `<article class="shift-row">
        <div><strong>${bill.table}</strong><small>${bill.items}</small></div>
        <strong>${money(bill.amount)}</strong>
        ${method ? `<span class="shift-chip">Закрыт · ${method === 'cash' ? 'наличные' : 'карта'}</span>` : open
          ? `<div class="shift-actions"><button class="small-button" data-shift-bill="${bill.id}" data-method="cash">Наличными</button>
             <button class="small-button" data-shift-bill="${bill.id}" data-method="card">Картой</button></div>`
          : '<span class="shift-chip warning">Открыт</span>'}
      </article>`;
    }).join('');
  }

  function reportMarkup() {
    if (!shift.report) return '<p class="shift-help">Здесь появится итог, когда управляющий передаст смену на проверку.</p>';
    const { cashExpected, cashActual, cashDelta, cardExpected, cardActual, cardDelta, note } = shift.report;
    return `<div class="shift-report">
      <div><span>Наличные</span><strong>${signed(cashDelta)}</strong><small>По журналу ${money(cashExpected)} · пересчитано ${money(cashActual)}</small></div>
      <div><span>Терминал</span><strong>${cardActual === null ? 'Нужен отчёт' : signed(cardDelta)}</strong>
        <small>По закрытым счетам ${money(cardExpected)}${cardActual === null ? '' : ` · в отчёте ${money(cardActual)}`}</small></div>
      ${note ? `<p class="shift-note">${safe(note)}</p>` : ''}
    </div>`;
  }

  function reviewForm() {
    if (getRole() !== 'owner' || shift.phase !== 'submitted') return '';
    return `<form data-shift-form="review" class="shift-form">
      <label>Комментарий владельца<input name="note" maxlength="240" required placeholder="Например, суммы и чек проверены"></label>
      <div class="shift-actions">
        <button type="submit" class="small-button" value="return">Вернуть на сверку</button>
        <button type="submit" class="primary" value="review"${shift.report.cardActual === null ? ' disabled' : ''}>Отметить проверенной</button>
      </div>
      <p class="shift-form-error" role="alert"></p>
    </form>`;
  }

  function closureForm() {
    return `<form data-shift-form="submit" class="shift-form">
      <div class="shift-checks">${CHECKS.map(([key, label]) => `<label><input type="checkbox" name="check" value="${key}" required${shift.checks.includes(key) ? ' checked' : ''}>${label}</label>`).join('')}</div>
      <div class="shift-fields">
        <label>Посчитали в кассе, ₽<input name="cashActual" inputmode="numeric" required placeholder="${shift.cash}"></label>
        <label>Итог терминала, ₽<input name="cardActual" inputmode="numeric" placeholder="Пусто, если отчёта нет"></label>
      </div>
      <label>Комментарий<input name="note" maxlength="240" placeholder="Например, уточнить банковский отчёт"></label>
      <div class="shift-actions">
        <button type="button" class="small-button" data-shift-fill>Подставить суммы для пробы</button>
        <button type="submit" class="primary">Передать владельцу</button>
      </div>
      <p class="shift-form-error" role="alert"></p>
    </form>`;
  }

  function journalRow(event) {
    const bill = BILLS.find(item => item.id === event.id);
    const person = STAFF.find(item => item.id === event.id);
    const label = {
      hour: 'Перешли на час вперёд',
      bill: bill ? `${bill.table} · ${money(bill.amount)} · ${event.method === 'cash' ? 'наличные' : 'карта'}` : '',
      pay: person ? `Выплата · ${person.name} · ${money(event.amount)}` : '',
      movement: event.type === 'movement' ? `${MOVEMENTS[event.method]} · ${money(event.amount)}` : '',
      checks: 'Чек-лист закрытия пройден',
      submit: 'Смена передана владельцу',
      return: 'Смена возвращена на сверку',
      review: 'Смена проверена владельцем',
    }[event.type];
    return `<li><div><strong>${label}</strong><small>${safe(event.actor ?? 'Демо')}${event.note ? ` · ${safe(event.note)}` : ''}</small></div>
      <time datetime="${safe(event.at)}">${localTime.format(new Date(event.at))}</time></li>`;
  }

  function screen() {
    const role = getRole();
    const open = shift.phase === 'open';
    const manager = role === 'manager' && open;
    const bartender = role !== 'owner' && open;
    const unpaid = STAFF.reduce((total, person) => total + payDue(shift, person), 0);
    main.innerHTML = heading('Смена за баром', 'Счета гостей, касса и выплаты за одну учебную ночь.', 'ROX / РАБОЧАЯ СМЕНА') + `
      <section class="shift-banner">
        <div><span class="eyebrow">УЧЕБНАЯ НОЧЬ · 22:00–06:00</span>
          <h2>${hhmm(START_HOUR + shift.hours)} <small>· ${shift.hours} из 8 часов</small></h2>
          <span class="shift-chip">${phases[shift.phase]}</span></div>
        ${manager && shift.hours < 8 ? '<button class="small-button" data-shift-hour>Ещё час смены →</button>' : ''}
      </section>
      ${role === 'bartender' ? `<section class="shift-panel own-wage"><span class="eyebrow">МОЯ СМЕНА</span>
        <h2>${money(payDue(shift, STAFF[0]))} к выплате</h2><p class="shift-help">Начислено за ${shift.hours} ч · учебный пример.</p></section>` : `<section class="shift-metrics" aria-label="Касса и выплаты">
        <div><span>Наличными в кассе</span><strong>${money(shift.cash)}</strong><small>Старт ${money(OPENING_CASH)} + 1 200 ₽ первых продаж</small></div>
        <div><span>Оплаты картой</span><strong>${money(shift.card)}</strong><small>По закрытым счетам</small></div>
        <div><span>Доступно к выплатам</span><strong>${money(cashForPay(shift))}</strong><small>После резерва ${money(CASH_RESERVE)}</small></div>
      </section>`}
      <div class="shift-columns">
        <section class="shift-panel"><h2>Счета гостей</h2><p class="shift-help">Отметьте, как гость оплатил счёт. Сумма сразу попадёт в нужную колонку.</p>
          ${billRows(bartender)}</section>
        ${role === 'bartender' ? '' : `<section class="shift-panel"><h2>Выплаты к этому часу</h2><p class="shift-help">Осталось выдать ${money(unpaid)}. Часы и ставки в этом примере условные.</p>
          ${wageRows(manager)}</section>`}
      </div>
      ${manager ? `<details class="shift-panel"><summary>Движение наличных</summary>
        <form data-shift-form="movement" class="shift-form">
          <div class="shift-fields"><label>Операция<select name="method">${Object.entries(MOVEMENTS).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label>
          <label>Сумма, ₽<input name="amount" inputmode="numeric" required></label></div>
          <label>За что<input name="note" maxlength="240" required placeholder="Например, размен"></label>
          <button type="submit" class="small-button">Добавить в журнал</button><p class="shift-form-error" role="alert"></p>
        </form></details>` : ''}
      ${role === 'bartender' ? '' : `<section class="shift-panel"><h2>${manager ? 'Закрытие смены' : 'Отчёт смены'}</h2>
        ${manager ? closureForm() : reportMarkup() + reviewForm()}</section>
      <details class="shift-panel"><summary>Журнал смены</summary>
        ${shift.events.length ? `<ol class="shift-journal">${shift.events.slice(-12).reverse().map(journalRow).join('')}</ol>`
          : '<p class="shift-help">Закрытия счетов, выплаты и проверки появятся здесь.</p>'}
      </details>`}
      <div class="section-bottom"><p>Учебные операции сохраняются в этом браузере.</p>
        <button class="quiet-button" data-action="reset">Начать демо заново</button></div>`;
  }

  function ownerSummary() {
    return `<section class="shift-panel shift-owner">
      <div class="shift-owner-head"><div><p class="eyebrow">СМЕНА БАРА</p><h2>${phases[shift.phase]}</h2></div>
      <button class="small-button" data-view="shift">Открыть смену ↗</button></div>
      ${shift.phase === 'open' ? `<p class="shift-help">В кассе ${money(shift.cash)} · закрыто счетов ${Object.keys(shift.bills).length} из ${BILLS.length}</p>` : reportMarkup()}
    </section>`;
  }

  function click(button) {
    const form = button.closest('form');
    if (button.hasAttribute('data-shift-fill') && form) {
      form.elements.cashActual.value = shift.cash;
      form.elements.cardActual.value = shift.card;
      return;
    }
    try {
      if (button.hasAttribute('data-shift-hour') && getRole() === 'manager') {
        commit({ type: 'hour' }, 'Час добавлен, начисления пересчитаны');
      }
      if (button.dataset.shiftBill && getRole() !== 'owner') {
        commit({ type: 'bill', id: button.dataset.shiftBill, method: button.dataset.method }, 'Демосчёт закрыт');
      }
      if (button.dataset.shiftPay && getRole() === 'manager') {
        const person = STAFF.find(item => item.id === button.dataset.shiftPay);
        if (person) commit({ type: 'pay', id: person.id, amount: payDue(shift, person) }, 'Демовыплата отмечена');
      }
    } catch (error) {
      toast(error.message);
    }
  }

  function submit(event) {
    const form = event.target;
    const type = form.dataset.shiftForm;
    if (!type) return;
    event.preventDefault();
    const values = new FormData(form);
    const note = String(values.get('note') ?? '').trim();
    try {
      if (type === 'movement' && getRole() === 'manager') {
        commit({ type, note, method: values.get('method'), amount: rubles(values.get('amount')) }, 'Движение записано');
      }
      if (type === 'submit' && getRole() === 'manager') {
        const cashActual = rubles(values.get('cashActual'), true);
        const cardRaw = String(values.get('cardActual') ?? '').trim();
        const cardActual = cardRaw ? rubles(cardRaw, true) : null;
        const withChecks = applyShiftEvent(shift, {
          type: 'checks', checks: values.getAll('check'), note: '', actor: 'Управляющий', at: new Date().toISOString(),
        });
        const submitted = applyShiftEvent(withChecks, {
          type, cashActual, cardActual, note, actor: 'Управляющий', at: new Date().toISOString(),
        });
        shift = submitted;
        const saved = save();
        render();
        toast(saved ? 'Смена передана владельцу' : 'Смена передана до закрытия страницы.');
      }
      if (type === 'review' && getRole() === 'owner' && ['review', 'return'].includes(event.submitter?.value)) {
        const action = event.submitter.value;
        commit({ type: action, note }, action === 'review' ? 'Смена проверена' : 'Смена возвращена управляющему');
      }
    } catch (error) {
      form.querySelector('.shift-form-error').textContent = error.message;
    }
  }

  return {
    screen, ownerSummary, click, submit,
    reset() { shift = freshShift(); return save(); },
  };
}
