export const SHIFT_KEY = 'bar001-a7d6046e8be5:rox:demo-shift:v1';
export const OPENING_CASH = 2200;
export const CASH_RESERVE = 1000;
export const START_HOUR = 22;
export const BILLS = [
  { id: '04', table: 'Стол 4', items: '2 коктейля и вода', amount: 1450 },
  { id: '07', table: 'Стол 7', items: '2 напитка и закуска', amount: 850 },
];
export const STAFF = [
  { id: 'bartender', name: 'Саша', job: 'Бармен', rate: 450 },
  { id: 'manager', name: 'Женя', job: 'Управляющий', rate: 300 },
];
export const CHECKS = [
  ['stock', 'Остатки на полке проверены'],
  ['equipment', 'Оборудование и холодильники проверены'],
  ['clean', 'Зона бара убрана'],
];
export const MOVEMENTS = {
  entry: 'Наличные за вход',
  deposit: 'Внесение',
  expense: 'Изъятие',
};

export function freshShift() {
  return {
    version: 1,
    events: [],
    hours: 4,
    phase: 'open',
    cash: OPENING_CASH + 1200,
    card: 0,
    paid: {},
    bills: {},
    checks: [],
    report: null,
  };
}

export function payDue(shift, person) {
  return shift.hours * person.rate - (shift.paid[person.id] ?? 0);
}

export function cashForPay(shift) {
  return Math.max(0, shift.cash - CASH_RESERVE);
}

function requireRule(condition, message) {
  if (!condition) throw new Error(message);
}

export function rubles(value, allowZero = false) {
  const raw = String(value).trim();
  const amount = Number(raw);
  requireRule(/^\d+$/.test(raw) && Number.isSafeInteger(amount) &&
    amount >= (allowZero ? 0 : 1) && amount <= 1000000,
  'Введите сумму целыми рублями до 1 000 000.');
  return amount;
}

export function applyShiftEvent(shift, event) {
  const { type, id, method, note, at } = event;
  requireRule(shift.events.length < 500, 'Журнал демо заполнен. Начните смену заново.');
  requireRule(typeof note === 'string' && note.length <= 240 &&
    typeof at === 'string' && Number.isFinite(Date.parse(at)), 'Некорректная запись журнала.');
  const next = { ...shift, events: [...shift.events, event] };
  if (type === 'review' || type === 'return') {
    requireRule(shift.phase === 'submitted', 'Сначала передайте смену на проверку.');
    requireRule(note.trim(), 'Добавьте короткий комментарий.');
    if (type === 'review') {
      requireRule(shift.report.cardActual !== null, 'Сначала добавьте итог терминала.');
    }
    return { ...next, phase: type === 'review' ? 'reviewed' : 'open' };
  }
  requireRule(shift.phase === 'open', 'Смена передана владельцу. Для правки её нужно вернуть.');

  switch (type) {
    case 'hour':
      requireRule(shift.hours < 8, 'Учебная смена рассчитана на 8 часов.');
      return { ...next, hours: shift.hours + 1 };
    case 'bill': {
      const bill = BILLS.find(item => item.id === id);
      requireRule(bill && !shift.bills[id], 'Этот счёт уже закрыт или отсутствует.');
      requireRule(method === 'cash' || method === 'card', 'Выберите способ оплаты.');
      return {
        ...next,
        bills: { ...shift.bills, [id]: method },
        cash: shift.cash + (method === 'cash' ? bill.amount : 0),
        card: shift.card + (method === 'card' ? bill.amount : 0),
      };
    }
    case 'pay': {
      const person = STAFF.find(item => item.id === id);
      requireRule(person, 'Сотрудник не найден.');
      const due = payDue(shift, person);
      requireRule(due > 0 && event.amount === due, 'Сумма к выплате изменилась.');
      requireRule(due <= cashForPay(shift), 'После выплаты в кассе должно остаться 1 000 ₽.');
      return { ...next, cash: shift.cash - due, paid: { ...shift.paid, [id]: (shift.paid[id] ?? 0) + due } };
    }
    case 'movement': {
      requireRule(Object.hasOwn(MOVEMENTS, method), 'Выберите тип движения.');
      requireRule(note.trim(), 'Добавьте причину движения.');
      const amount = rubles(event.amount);
      const cash = shift.cash + (method === 'expense' ? -amount : amount);
      requireRule(cash >= 0, 'В кассе недостаточно наличных.');
      return { ...next, cash };
    }
    case 'checks':
      requireRule(Array.isArray(event.checks) &&
        CHECKS.every(([key]) => event.checks.includes(key)) &&
        event.checks.length === CHECKS.length, 'Отметьте все пункты закрытия.');
      return { ...next, checks: [...event.checks] };
    case 'submit': {
      requireRule(BILLS.every(bill => shift.bills[bill.id]), 'Сначала закройте все счета.');
      requireRule(shift.checks.length === CHECKS.length, 'Сначала пройдите чек-лист закрытия.');
      const cashActual = rubles(event.cashActual, true);
      const cardActual = event.cardActual === null ? null : rubles(event.cardActual, true);
      const cashDelta = cashActual - shift.cash;
      const cardDelta = cardActual === null ? null : cardActual - shift.card;
      requireRule(!(cashDelta || cardDelta) || note.trim(), 'Поясните, что нужно сверить.');
      return {
        ...next,
        phase: 'submitted',
        report: { cashExpected: shift.cash, cashActual, cashDelta, cardExpected: shift.card, cardActual, cardDelta, note },
      };
    }
    default:
      throw new Error('Неизвестное действие смены.');
  }
}

export function restoreShift(saved) {
  requireRule(saved?.version === 1 && Array.isArray(saved.events) && saved.events.length <= 500,
    'Некорректный журнал смены.');
  return saved.events.reduce(applyShiftEvent, freshShift());
}
