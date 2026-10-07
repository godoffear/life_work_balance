'use strict';
/* Время для важного — PWA-планировщик. Данные хранятся только на устройстве (localStorage). */

const KEY = 'lwb.v3';
const CATS = {
  rop:     { n: 'Курс РОП',    c: '#3fb68b' },
  vi:      { n: 'Вьетнамский', c: '#f7b955' },
  read:    { n: 'Чтение',      c: '#7aa2f7' },
  workout: { n: 'Тренировка',  c: '#ef7d9a' },
  walk:    { n: 'Ходьба',      c: '#5cc9d9' },
  work:    { n: 'Работа',      c: '#a594f9' },
  other:   { n: 'Другое',      c: '#8a979f' }
};
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAYN = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const POMO = [[25, 5], [45, 10], [15, 3], [50, 10]];

const defaults = () => ({
  v: 3,
  sessions: [],
  todos: [],
  reviews: {},
  timer: null,
  templates: [
    { t: 'Повторить слова', cat: 'vi' },
    { t: 'Прочитать 10 страниц', cat: 'read' },
    { t: 'Разобрать кейс', cat: 'rop' },
    { t: 'Растяжка', cat: 'workout' }
  ],
  settings: {
    dailyGoal: 60,
    targets: { rop: 120, vi: 60, read: 60, workout: 4, walk: 2 },
    workoutDays: [0, 1, 3, 4],
    walkDays: [2, 5],
    lessons: { 2: '17:00–18:00', 6: '19:00–20:00' },
    workoutTime: '≈ 09:30',
    workWindow: '17:00–00:00',
    pomo: { work: 25, brk: 5 },
    adaptDismissed: '',
    sync: { on: false, token: '', repo: 'godoffear/life_work_balance', branch: 'data', path: 'data/time-app.json', last: '', status: '' }
  }
});

/* ---------- состояние ---------- */
let S = load();
const ui = { view: 'today', cat: 'rop', range: 'week', cal: null, sel: null, revOff: 0 };
let pend = null; // колбэк открытого окна ввода минут
let saveT;

function merge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  if (over && typeof over === 'object') for (const k of Object.keys(over)) out[k] = k in base ? merge(base[k], over[k]) : over[k];
  return out;
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return merge(defaults(), JSON.parse(raw));
  } catch (e) { console.error('load', e); }
  return defaults();
}
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(saveNow, 150);
}
function saveNow() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { console.error('save', e); }
}
window.addEventListener('pagehide', saveNow);

/* ---------- утилиты ---------- */
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [a, b, c] = s.split('-'); return new Date(+a, b - 1, +c); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dow = d => (d.getDay() + 6) % 7;
const weekStart = d => addDays(d, -dow(d));
const todayS = () => ymd(new Date());
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmt = m => m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ' ' + (m % 60) + ' мин' : ''}`;
const catName = c => (CATS[c] || CATS.other).n;
const catColor = c => (CATS[c] || CATS.other).c;

function inRange(a, b) { return S.sessions.filter(s => s.date >= a && s.date <= b); }
function sumBy(list) {
  const o = {};
  for (const s of list) o[s.cat] = (o[s.cat] || 0) + s.minutes;
  return o;
}
function minutesByDate() {
  const m = {};
  for (const s of S.sessions) m[s.date] = (m[s.date] || 0) + s.minutes;
  return m;
}
function weekData(off = 0) {
  const ws = addDays(weekStart(new Date()), off * 7);
  const a = ymd(ws), b = ymd(addDays(ws, 6));
  const list = inRange(a, b);
  const by = sumBy(list);
  const days = c => new Set(list.filter(s => s.cat === c).map(s => s.date)).size;
  return { a, b, ws, list, by, total: list.reduce((t, s) => t + s.minutes, 0), workouts: days('workout'), walks: days('walk') };
}

/* серия дней: один «день отдыха» за 7 дней не рвёт серию */
function streak() {
  const m = minutesByDate();
  const dates = Object.keys(m);
  if (!dates.length) return 0;
  const first = dates.sort()[0];
  let d = new Date();
  if (!m[ymd(d)]) d = addDays(d, -1);
  let n = 0, i = 0, lastGap = null;
  while (ymd(d) >= first && i < 2000) {
    if (m[ymd(d)]) n++;
    else {
      if (lastGap !== null && i - lastGap < 7) break;
      lastGap = i;
    }
    d = addDays(d, -1); i++;
  }
  return n;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 2800);
}

function logSession({ cat, minutes, note = '', date, ev = '', title }) {
  S.sessions.push({
    id: uid(), cat, minutes: Math.max(1, Math.round(minutes)), date: date || todayS(),
    time: nowHM(), note, ev, title: title || catName(cat)
  });
  saveNow();
  toast(`✓ Плюс ${fmt(Math.round(minutes))} к «${catName(cat)}». Отдых равноправен`);
}

/* ---------- окна (sheet) ---------- */
function openSheet(html) { $('#sheet-body').innerHTML = html; $('#sheet').hidden = false; }
function closeSheet() { $('#sheet').hidden = true; pend = null; }

function askMinutes({ title, opts, skip, cb }) {
  pend = cb;
  openSheet(`<h3>${esc(title)}</h3>
    <div>${opts.map(m => `<button class="chip" data-act="sheetMin" data-m="${m}">${m} мин</button>`).join('')}</div>
    <label class="l">Своё значение, минут</label>
    <div class="row"><input type="number" id="customMin" min="1" max="600" inputmode="numeric" placeholder="например, 50"><button class="btn sm pri" data-act="sheetCustom">OK</button></div>
    ${skip ? `<div class="btns"><button class="btn" data-act="sheetMin" data-m="0">${esc(skip)}</button></div>` : ''}`);
}

function catChips(sel, act) {
  return Object.keys(CATS).map(c =>
    `<button class="chip ${c === sel ? 'on' : ''}" data-act="${act}" data-c="${c}"><span class="dot" style="background:${catColor(c)};display:inline-block;margin-right:6px"></span>${catName(c)}</button>`).join('');
}

/* ---------- рисование ---------- */
function ring(pct, color, size, stroke, inner) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  return `<div class="ringbox" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#2a343b" stroke-width="${stroke}"/>
    <circle id="ringArc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - p)).toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>
    <div class="in">${inner || ''}</div></div>`;
}
function donut(by, total) {
  const size = 200, st = 34, r = (size - st) / 2, C = 2 * Math.PI * r;
  let off = 0, segs = '';
  for (const c of Object.keys(by).sort((a, b) => by[b] - by[a])) {
    const len = by[c] / total * C;
    segs += `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${catColor(c)}" stroke-width="${st}" stroke-dasharray="${Math.max(0, len - 2).toFixed(1)} ${(C - Math.max(0, len - 2)).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 100 100)"/>`;
    off += len;
  }
  return `<div class="ringbox" style="width:${size}px;height:${size}px;margin:0 auto"><svg width="${size}" height="${size}" viewBox="0 0 200 200">
    <circle cx="100" cy="100" r="${r}" fill="none" stroke="#2a343b" stroke-width="${st}"/>${segs}</svg>
    <div class="in"><div style="font-size:22px;font-weight:600">${fmt(total)}</div><div class="muted">всего</div></div></div>`;
}
const level = m => m <= 0 ? '' : m < 30 ? 'l1' : m < 60 ? 'l2' : m < 120 ? 'l3' : 'l4';

/* ---------- экраны ---------- */
function vToday() {
  const now = new Date(), t = todayS(), di = dow(now), st = S.settings;
  const mt = minutesByDate()[t] || 0;
  const k = streak();
  const todaySess = S.sessions.filter(s => s.date === t);
  const done = ev => todaySess.some(s => s.ev === ev);
  const evs = [];
  if (st.workoutDays.includes(di)) evs.push({ k: 'workout', t: 'Тренировка', s: st.workoutTime, c: '#ef7d9a', opts: [45, 60, 75, 90] });
  if (st.walkDays.includes(di)) evs.push({ k: 'walk', t: 'Ходьба', s: '≈ 60 минут', c: '#5cc9d9', opts: [45, 60, 75, 90, 120] });
  if (st.lessons[di]) evs.push({ k: 'lesson', t: 'Урок вьетнамского', s: st.lessons[di], c: '#f7b955', opts: [45, 60, 90] });

  const todos = S.todos.filter(x => x.date === t || (!x.done && x.date < t));
  const w = weekData(0), tg = st.targets;
  const bars = [
    ['rop', w.by.rop || 0, tg.rop, 'мин'], ['vi', w.by.vi || 0, tg.vi, 'мин'], ['read', w.by.read || 0, tg.read, 'мин'],
    ['workout', w.workouts, tg.workout, 'дн'], ['walk', w.walks, tg.walk, 'дн']
  ].map(([c, v, g, u]) => `<div style="margin-bottom:12px"><div class="row sp"><span>${catName(c)}</span><span class="muted">${v} / ${g} ${u}</span></div>
    <div class="bar"><i style="width:${Math.min(100, g ? v / g * 100 : 0)}%;background:${catColor(c)}"></i></div></div>`).join('');

  return `<div class="row sp"><div><div style="font-size:20px;font-weight:600;text-transform:capitalize">${DAYN[di]}</div>
      <div class="muted">${now.getDate()} ${MONTHS_G[now.getMonth()]}</div></div>
      <span class="streak">🔥 ${k} ${plural(k, 'день', 'дня', 'дней')}</span></div>
    ${k ? '' : '<div class="note" style="margin-top:12px">Серия начнётся с первой записи. Один день отдыха в неделю серию не рвёт.</div>'}
    <div class="card hero" style="margin-top:14px">
      ${ring(mt / st.dailyGoal, '#3fb68b', 104, 12, `<div style="font-size:20px;font-weight:600">${mt}</div><div class="muted">мин</div>`)}
      <div class="grow"><div class="muted">Цель дня: ${st.dailyGoal} мин</div>
        <div class="btns"><button class="btn pri sm" data-act="nav" data-v="focus">▶ Фокус</button><button class="btn sm" data-act="quickLog">+ Записать</button></div></div></div>
    <h2>События сегодня</h2>
    ${evs.map(e => `<div class="card ev ${done(e.k) ? 'done' : ''}" style="border-left-color:${e.c}"><div class="grow"><div class="t">${e.t}</div><div class="muted">${e.s}</div></div>
      <button class="check ${done(e.k) ? 'on' : ''}" data-act="evLog" data-k="${e.k}" aria-label="Отметить">${done(e.k) ? '✓' : ''}</button></div>`).join('')}
    <div class="card ev" style="border-left-color:#8a979f"><div class="grow"><div class="t">Рабочее окно</div><div class="muted">${esc(st.workWindow)}</div></div></div>
    <div class="row sp"><h2>Мои дела</h2><button class="btn sm" data-act="todoAdd">+ Добавить</button></div>
    ${todos.length ? todos.map(x => `<div class="card ev ${x.done ? 'done' : ''}" style="border-left-color:${catColor(x.cat)}"><div class="grow"><div class="t">${esc(x.t)}</div>
      <div class="muted">${catName(x.cat)}${x.date < t ? ' · с ' + x.date.slice(8) + '.' + x.date.slice(5, 7) : ''}</div></div>
      <button class="check ${x.done ? 'on' : ''}" data-act="todoDone" data-id="${x.id}">${x.done ? '✓' : ''}</button>
      <button class="icon-btn" data-act="todoDel" data-id="${x.id}" aria-label="Удалить">×</button></div>`).join('')
      : '<div class="muted">Пока пусто. Добавь дело из своих шаблонов или новое.</div>'}
    <h2>Прогресс недели</h2><div class="card">${bars}</div>${adaptCard()}`;
}

function plural(n, a, b, c) {
  const m = n % 100, d = n % 10;
  return m > 10 && m < 20 ? c : d === 1 ? a : d > 1 && d < 5 ? b : c;
}

function adaptCard() {
  const tg = S.settings.targets.rop, key = weekData(-1).a;
  if (S.settings.adaptDismissed === key || tg >= 200) return '';
  const ok = [-1, -2, -3].every(o => (weekData(o).by.rop || 0) >= tg * 1.25);
  if (!ok) return '';
  return `<div class="card"><div class="t">Вижу, что ты стабилен</div><div class="muted">Три недели подряд РОП заметно выше нормы. Поднять цель до ${tg + 30} мин? Решение за тобой.</div>
    <div class="btns"><button class="btn pri sm" data-act="adaptYes">Поднять</button><button class="btn sm" data-act="adaptNo">Оставить</button></div></div>`;
}

function vFocus() {
  const T = S.timer, p = S.settings.pomo;
  if (!T) {
    return `<h2 style="margin-top:0">Помидор: время и вопрос в конце</h2>
      <div class="card"><label class="l" style="margin-top:0">Над чем работаешь?</label>${catChips(ui.cat, 'pickCat')}
      <label class="l">Длина фокуса и перерыва</label>
      ${POMO.map(([w, b]) => `<button class="chip ${p.work === w && p.brk === b ? 'on' : ''}" data-act="pomoSet" data-w="${w}" data-b="${b}">${w} / ${b}</button>`).join('')}
      <div class="row" style="margin-top:4px"><div class="grow"><label class="l" style="margin-top:0">Фокус, мин</label><input type="number" id="pw" min="1" max="180" value="${p.work}" data-set="pomoWork"></div>
      <div class="grow"><label class="l" style="margin-top:0">Перерыв, мин</label><input type="number" id="pb" min="0" max="60" value="${p.brk}" data-set="pomoBrk"></div></div>
      <div class="btns"><button class="btn pri" data-act="timerStart">▶ Начать фокус</button></div></div>
      <div class="muted">Когда время выйдет, я спрошу, чем ты занимался, и запишу это в статистику, календарь и серию. Экран не гаснет, пока идёт таймер.</div>`;
  }
  if (T.saved) {
    return `<div class="card center"><div style="font-size:42px">✓</div><div class="t" style="font-size:18px">Записано: ${fmt(T.minutes)} · ${catName(T.cat)}</div>
      <div class="muted" style="margin-top:6px">Хорошая работа. Перерыв — тоже часть работы.</div>
      <div class="btns">${p.brk ? `<button class="btn pri" data-act="breakStart">Перерыв ${p.brk} мин</button>` : ''}<button class="btn" data-act="timerReset">Ещё помидор</button></div></div>`;
  }
  if (T.done) {
    const m = T.elapsed;
    return `<div class="card"><div class="t" style="font-size:18px">Чем ты занимался эти ${m} мин?</div>
      <label class="l">Занятие</label>${catChips(T.cat, 'askCat')}
      <label class="l">Сколько минут (можно поправить)</label><input type="number" id="askMin" min="1" max="600" value="${m}">
      <label class="l">Заметка (необязательно)</label><input type="text" id="askNote" maxlength="200" placeholder="например, юнит-экономика">
      <div class="btns"><button class="btn pri" data-act="askSave">Записать</button><button class="btn warn" data-act="askDrop">Не записывать</button></div></div>`;
  }
  const brk = T.mode === 'break', left = timerLeft();
  return `<div class="center" style="margin-top:8px"><div class="muted">${brk ? 'Перерыв' : catName(T.cat)}</div>
    ${ring(1 - left / T.total, brk ? '#7aa2f7' : catColor(T.cat), 260, 16, `<div class="big" id="tm">${mmss(left)}</div><div class="muted">${T.paused ? 'пауза' : brk ? 'отдыхай' : 'в фокусе'}</div>`)}
    <div class="btns" style="margin-top:20px"><button class="btn" data-act="timerPause">${T.paused ? 'Продолжить' : 'Пауза'}</button>
    <button class="btn ${brk ? '' : 'pri'}" data-act="timerStop">${brk ? 'Пропустить' : 'Завершить'}</button></div></div>`;
}

function vStats() {
  const now = new Date(), t = ymd(now);
  const from = ui.range === 'week' ? ymd(weekStart(now)) : ui.range === 'month' ? ymd(new Date(now.getFullYear(), now.getMonth(), 1)) : '0000-01-01';
  const list = inRange(from, t), by = sumBy(list), total = list.reduce((a, s) => a + s.minutes, 0);
  const days = new Set(list.map(s => s.date)).size;
  const keys = Object.keys(by).sort((a, b) => by[b] - by[a]);
  return `<div class="seg">${[['week', 'Неделя'], ['month', 'Месяц'], ['all', 'Всё время']].map(([k, n]) => `<button class="chip ${ui.range === k ? 'on' : ''}" data-act="range" data-r="${k}">${n}</button>`).join('')}</div>
    ${total ? `<div class="card">${donut(by, total)}</div>
    <div class="card">${keys.map(c => `<div class="row sp" style="padding:6px 0"><div class="row"><span class="dot" style="background:${catColor(c)}"></span><span>${catName(c)}</span></div>
      <div><b>${Math.round(by[c] / total * 100)}%</b> <span class="muted">· ${fmt(by[c])}</span></div></div>`).join('')}</div>
    <div class="card center"><div class="muted">Активных дней</div><div style="font-size:22px;font-weight:600">${days}</div></div>
    <div class="card center"><div class="muted">В среднем за активный день</div><div style="font-size:22px;font-weight:600">${fmt(Math.round(total / days))}</div></div>`
    : '<div class="card center muted">В этом периоде пока нет записей. Запусти первый фокус — и диаграмма появится.</div>'}`;
}

function vCal() {
  const now = new Date();
  if (!ui.cal) ui.cal = { y: now.getFullYear(), m: now.getMonth() };
  if (!ui.sel) ui.sel = todayS();
  const { y, m } = ui.cal, md = minutesByDate(), first = new Date(y, m, 1), n = new Date(y, m + 1, 0).getDate();
  let cells = DAYS.map(d => `<div class="h">${d}</div>`).join('') + '<div class="d e"></div>'.repeat(dow(first));
  for (let d = 1; d <= n; d++) {
    const k = ymd(new Date(y, m, d));
    cells += `<button class="d ${level(md[k] || 0)} ${k === todayS() ? 'today' : ''} ${k === ui.sel ? 'sel' : ''}" data-act="selDay" data-d="${k}">${d}</button>`;
  }
  // тепловая карта: 16 недель
  const start = addDays(weekStart(now), -15 * 7);
  let heat = '';
  for (let i = 0; i < 16 * 7; i++) {
    const k = ymd(addDays(start, i));
    heat += `<i class="${level(md[k] || 0)}" title="${k}: ${md[k] || 0} мин" style="${k > todayS() ? 'opacity:.3' : ''}"></i>`;
  }
  const day = S.sessions.filter(s => s.date === ui.sel);
  const dsum = day.reduce((a, s) => a + s.minutes, 0);
  return `<div class="row sp"><button class="icon-btn" data-act="calMove" data-n="-1">‹</button><b>${MONTHS[m]} ${y}</b><button class="icon-btn" data-act="calMove" data-n="1">›</button></div>
    <div class="cal" style="margin-top:8px">${cells}</div>
    <div class="row sp" style="margin-top:16px"><h2 style="margin:0">${parse(ui.sel).getDate()} ${MONTHS_G[parse(ui.sel).getMonth()]}${dsum ? ' · ' + fmt(dsum) : ''}</h2><button class="btn sm" data-act="quickLog" data-d="${ui.sel}">+ Запись</button></div>
    ${day.length ? day.map(s => `<div class="card row" style="margin-top:8px"><span class="dot" style="background:${catColor(s.cat)}"></span>
      <div class="grow"><div class="t">${catName(s.cat)} · ${fmt(s.minutes)}</div><div class="muted">${s.time}${s.note ? ' · ' + esc(s.note) : ''}</div></div>
      <button class="icon-btn" data-act="sessDel" data-id="${s.id}" aria-label="Удалить">×</button></div>`).join('') : '<div class="muted" style="margin-top:8px">В этот день записей нет.</div>'}
    <h2>Последние 16 недель</h2><div class="card"><div class="heat">${heat}</div></div>`;
}

function vReview() {
  const w = weekData(ui.revOff), p = weekData(ui.revOff - 1), tg = S.settings.targets;
  const byDay = {};
  for (const s of w.list) byDay[s.date] = (byDay[s.date] || 0) + s.minutes;
  const best = Object.keys(byDay).sort((a, b) => byDay[b] - byDay[a])[0];
  const topCat = Object.keys(w.by).sort((a, b) => w.by[b] - w.by[a])[0];
  const diff = w.total - p.total;
  const hours = (w.total) / 60;
  const load = hours < 5 ? ['Спокойная неделя', '#7aa2f7'] : hours < 7 ? ['Умеренная нагрузка', '#3fb68b'] : hours < 10 ? ['Оптимальная нагрузка', '#3fb68b'] : hours < 12 ? ['Высокая нагрузка', '#f7b955'] : ['Риск выгорания — добавь отдыха', '#ef7d9a'];
  const goals = [['rop', w.by.rop || 0, tg.rop, 'мин'], ['vi', w.by.vi || 0, tg.vi, 'мин'], ['read', w.by.read || 0, tg.read, 'мин'], ['workout', w.workouts, tg.workout, 'дн'], ['walk', w.walks, tg.walk, 'дн']];
  const rv = S.reviews[w.a] || {};
  const label = ui.revOff === 0 ? 'Эта неделя' : ui.revOff === -1 ? 'Прошлая неделя' : `${ymd(w.ws).slice(5).split('-').reverse().join('.')} – ${w.b.slice(5).split('-').reverse().join('.')}`;
  return `<div class="row sp"><button class="icon-btn" data-act="revMove" data-n="-1">‹</button><b>${label}</b><button class="icon-btn" data-act="revMove" data-n="1" ${ui.revOff >= 0 ? 'disabled style="opacity:.3"' : ''}>›</button></div>
    <div class="card center" style="margin-top:10px"><div class="muted">Всего за неделю</div><div style="font-size:28px;font-weight:600">${fmt(w.total)}</div>
      <div class="muted">${p.total ? (diff >= 0 ? '+' : '−') + fmt(Math.abs(diff)) + ' к прошлой неделе' : 'пока нет данных за прошлую'}</div>
      <div style="margin-top:8px;color:${load[1]}">${load[0]}</div></div>
    ${w.total ? `<div class="card"><div class="muted">Лучший день: <b style="color:var(--tx)">${DAYS[dow(parse(best))]}</b> · ${fmt(byDay[best])}</div>
      <div class="muted">Чаще всего: <b style="color:var(--tx)">${catName(topCat)}</b> · ${fmt(w.by[topCat])}</div></div>` : ''}
    <h2>Ориентиры</h2><div class="card">${goals.map(([c, v, g, u]) => `<div style="margin-bottom:12px"><div class="row sp"><span>${catName(c)}</span><span class="muted">${v} / ${g} ${u}${v >= g ? ' ✓' : ''}</span></div>
      <div class="bar"><i style="width:${Math.min(100, g ? v / g * 100 : 0)}%;background:${catColor(c)}"></i></div></div>`).join('')}
      <div class="muted">${w.total ? 'Не дотянул до нормы — ничего страшного, качество важнее количества.' : 'Неделя пока пустая. Новый день — новая возможность.'}</div></div>
    <h2>Итоги</h2><div class="card"><label class="l" style="margin-top:0">Что получилось?</label><textarea data-set="revWin" data-k="${w.a}" placeholder="Победы недели">${esc(rv.win || '')}</textarea>
      <label class="l">Что мешало?</label><textarea data-set="revBlock" data-k="${w.a}" placeholder="Помехи и выводы">${esc(rv.block || '')}</textarea></div>`;
}

function vSettings() {
  const st = S.settings, tg = st.targets, sy = st.sync;
  const num = (id, v, mx) => `<input type="number" min="0" max="${mx}" value="${v}" data-set="${id}">`;
  return `<h2 style="margin-top:0">Цели на неделю</h2><div class="card">
      <div class="row"><div class="grow"><label class="l" style="margin-top:0">РОП, мин</label>${num('t_rop', tg.rop, 600)}</div><div class="grow"><label class="l" style="margin-top:0">Вьетнамский, мин</label>${num('t_vi', tg.vi, 600)}</div></div>
      <div class="row"><div class="grow"><label class="l">Чтение, мин</label>${num('t_read', tg.read, 600)}</div><div class="grow"><label class="l">Цель дня, мин</label>${num('dailyGoal', st.dailyGoal, 600)}</div></div>
      <div class="row"><div class="grow"><label class="l">Тренировок, дней</label>${num('t_workout', tg.workout, 7)}</div><div class="grow"><label class="l">Прогулок, дней</label>${num('t_walk', tg.walk, 7)}</div></div></div>
    <h2>Расписание</h2><div class="card"><label class="l" style="margin-top:0">Тренировки (дни)</label>
      <div class="days">${DAYS.map((d, i) => `<button class="chip ${st.workoutDays.includes(i) ? 'on' : ''}" data-act="dayTog" data-k="workoutDays" data-i="${i}">${d}</button>`).join('')}</div>
      <label class="l">Ходьба (дни)</label>
      <div class="days">${DAYS.map((d, i) => `<button class="chip ${st.walkDays.includes(i) ? 'on' : ''}" data-act="dayTog" data-k="walkDays" data-i="${i}">${d}</button>`).join('')}</div>
      <label class="l">Время тренировки</label><input type="text" value="${esc(st.workoutTime)}" data-set="workoutTime">
      <label class="l">Рабочее окно</label><input type="text" value="${esc(st.workWindow)}" data-set="workWindow">
      <label class="l">Уроки вьетнамского (пусто = нет урока)</label>
      <div class="lessons">${DAYS.map((d, i) => `<div class="row"><span class="muted" style="width:22px">${d}</span><input type="text" value="${esc(st.lessons[i] || '')}" placeholder="17:00–18:00" data-set="lesson" data-i="${i}"></div>`).join('')}</div></div>
    <h2>Мои шаблоны дел</h2><div class="card">${S.templates.map((x, i) => `<div class="row sp" style="padding:4px 0"><span><span class="dot" style="background:${catColor(x.cat)};display:inline-block;margin-right:8px"></span>${esc(x.t)}</span>
      <button class="icon-btn" data-act="tplDel" data-i="${i}">×</button></div>`).join('') || '<div class="muted">Нет шаблонов</div>'}
      <div class="btns"><button class="btn sm" data-act="tplAdd">+ Новый шаблон</button></div></div>
    <h2>Автосохранение на GitHub</h2><div class="card">
      <div class="row sp"><span>Каждый вечер в 23:59</span><button class="chip ${sy.on ? 'on' : ''}" style="margin:0" data-act="syncTog">${sy.on ? 'Вкл' : 'Выкл'}</button></div>
      <label class="l">Токен GitHub (fine-grained, только этот репозиторий, Contents: Read and write)</label><input type="password" autocomplete="off" value="${esc(sy.token)}" data-set="syncToken" placeholder="github_pat_...">
      <label class="l">Репозиторий</label><input type="text" value="${esc(sy.repo)}" data-set="syncRepo">
      <label class="l">Ветка для данных</label><input type="text" value="${esc(sy.branch)}" data-set="syncBranch">
      <div class="muted" style="margin-top:8px">${sy.last ? 'Последнее сохранение: ' + esc(sy.last) : 'Ещё не сохранялось'}${sy.status ? ' · ' + esc(sy.status) : ''}</div>
      <div class="muted" style="margin-top:6px">Браузер не умеет работать в фоне в точное время: сохранение случится в 23:59, если приложение открыто, а иначе при следующем открытии. Токен хранится только на этом устройстве. Если репозиторий публичный, данные будут видны всем.</div>
      <div class="btns"><button class="btn" data-act="syncNow">Сохранить сейчас</button></div></div>
    <h2>Данные</h2><div class="card"><div class="muted" style="margin-bottom:10px">Данные хранятся только на этом устройстве. Делай копию время от времени.</div>
      <div class="btns" style="margin-top:0"><button class="btn" data-act="export">📥 Скачать копию</button><button class="btn" data-act="import">📤 Загрузить</button></div>
      <div class="btns"><button class="btn warn" data-act="wipe">Удалить все записи</button></div></div>
    <button class="btn" data-act="nav" data-v="today" style="margin-top:4px">← На главный</button>`;
}

const VIEWS = { today: vToday, focus: vFocus, stats: vStats, cal: vCal, review: vReview, settings: vSettings };

function render() {
  $('#view').innerHTML = VIEWS[ui.view]();
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.v === ui.view));
}

/* ---------- таймер ---------- */
function mmss(s) { return `${Math.floor(s / 60)}:${pad(s % 60)}`; }
function timerLeft() {
  const T = S.timer;
  return T.paused ? T.left : Math.max(0, Math.ceil((T.endAt - Date.now()) / 1000));
}
let wake = null;
async function wakeOn() { try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { wake = null; } }
function wakeOff() { try { wake && wake.release(); } catch (e) { /* ignore */ } wake = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.timer && !S.timer.paused && !S.timer.done && !S.timer.saved) wakeOn();
});

function beep() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach(t => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(.2, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + t + .2);
      o.start(ac.currentTime + t); o.stop(ac.currentTime + t + .22);
    });
  } catch (e) { /* звук недоступен */ }
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { /* ignore */ }
}
function notify(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(r => r.showNotification(title, { body, icon: 'icons/icon-192.png' })).catch(() => new Notification(title, { body }));
      else new Notification(title, { body });
    }
  } catch (e) { /* ignore */ }
}

function timerStart(min, mode) {
  S.timer = { mode, cat: ui.cat, total: min * 60, endAt: Date.now() + min * 60000, paused: false, left: min * 60, done: false };
  saveNow(); wakeOn(); render();
}
function timerFinish() {
  const T = S.timer;
  wakeOff(); beep();
  if (T.mode === 'work') {
    T.done = true; T.elapsed = Math.round(T.total / 60);
    notify('Время вышло', 'Чем ты занимался? Запиши в приложении.');
  } else {
    S.timer = null; toast('Перерыв закончился');
    notify('Перерыв закончился', 'Можно начинать новый фокус.');
  }
  saveNow(); render();
}
setInterval(() => {
  const T = S.timer;
  if (T && !T.done && !T.saved) {
    if (!T.paused && timerLeft() <= 0) return timerFinish();
    if (ui.view === 'focus') {
      const l = timerLeft(), el = $('#tm'), arc = $('#ringArc');
      if (el) el.textContent = mmss(l);
      if (arc) { const c = parseFloat(arc.getAttribute('stroke-dasharray')); arc.setAttribute('stroke-dashoffset', (c * (l / T.total)).toFixed(1)); }
      document.title = `${mmss(l)} · Время для важного`;
    }
  } else if (document.title !== 'Время для важного') document.title = 'Время для важного';
  autoSync();
}, 500);

/* ---------- действия ---------- */
const A = {
  nav: d => { ui.view = d.v; if (d.v === 'cal') ui.sel = ui.sel || todayS(); render(); window.scrollTo(0, 0); },
  closeSheet,
  sheetMin: d => { const cb = pend; closeSheet(); cb && cb(+d.m); },
  sheetCustom: () => { const v = parseInt($('#customMin').value, 10); if (v > 0) { const cb = pend; closeSheet(); cb && cb(v); } },
  evLog: d => {
    const t = todayS(), ex = S.sessions.find(s => s.date === t && s.ev === d.k);
    if (ex) { S.sessions = S.sessions.filter(s => s !== ex); saveNow(); return render(); }
    const map = { workout: ['workout', 'Сколько длилась тренировка?', [45, 60, 75, 90]], walk: ['walk', 'Сколько гуляли?', [45, 60, 75, 90, 120]], lesson: ['vi', 'Сколько длился урок?', [45, 60, 90]] }[d.k];
    askMinutes({ title: map[1], opts: map[2], cb: m => { if (m > 0) { logSession({ cat: map[0], minutes: m, ev: d.k }); render(); } } });
  },
  quickLog: d => {
    const date = d.d || todayS(); ui.qc = 'rop';
    openSheet(`<h3>Записать время${date !== todayS() ? ' · ' + date.split('-').reverse().join('.') : ''}</h3>${catChips(ui.qc, 'qcCat')}
      <label class="l">Минут</label><input type="number" id="qMin" min="1" max="600" inputmode="numeric" value="25">
      <label class="l">Заметка</label><input type="text" id="qNote" maxlength="200">
      <div class="btns"><button class="btn pri" data-act="qSave" data-d="${date}">Записать</button></div>`);
  },
  qcCat: d => { ui.qc = d.c; document.querySelectorAll('#sheet-body [data-act=qcCat]').forEach(b => b.classList.toggle('on', b.dataset.c === d.c)); },
  qSave: d => {
    const m = parseInt($('#qMin').value, 10); if (!(m > 0)) return;
    logSession({ cat: ui.qc, minutes: m, note: $('#qNote').value.trim(), date: d.d });
    closeSheet(); render();
  },
  todoAdd: () => {
    ui.tc = 'other';
    openSheet(`<h3>Новое дело на сегодня</h3>
      ${S.templates.length ? `<div class="muted" style="margin-bottom:6px">Из моего списка</div><div>${S.templates.map((x, i) => `<button class="chip" data-act="tplUse" data-i="${i}">${esc(x.t)}</button>`).join('')}</div>` : ''}
      <label class="l">Или своё</label><input type="text" id="todoT" maxlength="80" placeholder="Что нужно сделать?">
      <label class="l">Категория</label>${catChips(ui.tc, 'tcCat')}
      <div class="btns"><button class="btn pri" data-act="todoSave">Добавить</button></div>`);
  },
  tcCat: d => { ui.tc = d.c; document.querySelectorAll('#sheet-body [data-act=tcCat]').forEach(b => b.classList.toggle('on', b.dataset.c === d.c)); },
  tplUse: d => { const x = S.templates[+d.i]; S.todos.push({ id: uid(), t: x.t, cat: x.cat, date: todayS(), done: false }); saveNow(); closeSheet(); render(); },
  todoSave: () => {
    const t = $('#todoT').value.trim(); if (!t) return;
    S.todos.push({ id: uid(), t, cat: ui.tc, date: todayS(), done: false }); saveNow(); closeSheet(); render();
  },
  todoDone: d => {
    const x = S.todos.find(i => i.id === d.id); if (!x) return;
    if (x.done) { x.done = false; saveNow(); return render(); }
    x.done = true; saveNow(); render();
    askMinutes({ title: `Сколько минут ушло: «${x.t}»?`, opts: [10, 15, 30, 45], skip: 'Без учёта времени', cb: m => { if (m > 0) { logSession({ cat: x.cat, minutes: m, note: x.t }); } render(); } });
  },
  todoDel: d => { S.todos = S.todos.filter(i => i.id !== d.id); saveNow(); render(); },
  tplAdd: () => {
    ui.tc = 'other';
    openSheet(`<h3>Новый шаблон</h3><label class="l" style="margin-top:0">Название</label><input type="text" id="todoT" maxlength="80">
      <label class="l">Категория</label>${catChips(ui.tc, 'tcCat')}<div class="btns"><button class="btn pri" data-act="tplSave">Сохранить</button></div>`);
  },
  tplSave: () => { const t = $('#todoT').value.trim(); if (!t) return; S.templates.push({ t, cat: ui.tc }); saveNow(); closeSheet(); render(); },
  tplDel: d => { S.templates.splice(+d.i, 1); saveNow(); render(); },
  adaptYes: () => { S.settings.targets.rop += 30; saveNow(); toast(`Цель РОП: ${S.settings.targets.rop} мин`); render(); },
  adaptNo: () => { S.settings.adaptDismissed = weekData(-1).a; saveNow(); render(); },
  pickCat: d => { ui.cat = d.c; render(); },
  pomoSet: d => { S.settings.pomo = { work: +d.w, brk: +d.b }; saveNow(); render(); },
  timerStart: () => {
    const w = parseInt($('#pw').value, 10), b = parseInt($('#pb').value, 10);
    if (!(w > 0)) return toast('Укажи длину фокуса');
    S.settings.pomo = { work: w, brk: b >= 0 ? b : 0 };
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { /* ignore */ }
    timerStart(w, 'work');
  },
  timerPause: () => {
    const T = S.timer;
    if (T.paused) { T.paused = false; T.endAt = Date.now() + T.left * 1000; wakeOn(); }
    else { T.left = timerLeft(); T.paused = true; wakeOff(); }
    saveNow(); render();
  },
  timerStop: () => {
    const T = S.timer;
    if (T.mode === 'break') { S.timer = null; wakeOff(); saveNow(); return render(); }
    const el = Math.round((T.total - timerLeft()) / 60);
    wakeOff();
    if (el < 1) { S.timer = null; toast('Меньше минуты — не записываю'); }
    else { T.done = true; T.elapsed = el; }
    saveNow(); render();
  },
  askCat: d => { S.timer.cat = d.c; document.querySelectorAll('[data-act=askCat]').forEach(b => b.classList.toggle('on', b.dataset.c === d.c)); },
  askSave: () => {
    const T = S.timer, m = parseInt($('#askMin').value, 10); if (!(m > 0)) return;
    logSession({ cat: T.cat, minutes: m, note: $('#askNote').value.trim() });
    ui.cat = T.cat;
    S.timer = { saved: true, minutes: m, cat: T.cat }; saveNow(); render();
  },
  askDrop: () => { S.timer = null; saveNow(); render(); },
  breakStart: () => timerStart(S.settings.pomo.brk, 'break'),
  timerReset: () => { S.timer = null; saveNow(); render(); },
  range: d => { ui.range = d.r; render(); },
  selDay: d => { ui.sel = d.d; render(); },
  calMove: d => { let { y, m } = ui.cal; m += +d.n; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } ui.cal = { y, m }; render(); },
  sessDel: d => { S.sessions = S.sessions.filter(s => s.id !== d.id); saveNow(); render(); },
  revMove: d => { const n = ui.revOff + +d.n; if (n <= 0) { ui.revOff = n; render(); } },
  dayTog: d => {
    const a = S.settings[d.k], i = +d.i, p = a.indexOf(i);
    if (p >= 0) a.splice(p, 1); else a.push(i);
    saveNow(); render();
  },
  syncTog: () => {
    const sy = S.settings.sync;
    if (!sy.on && !sy.token) return toast('Сначала вставь токен GitHub');
    sy.on = !sy.on; saveNow(); render();
  },
  syncNow: () => syncNow(true),
  export: () => {
    const b = new Blob([JSON.stringify(publicState(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = `time-app-${todayS()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  import: () => $('#importFile').click(),
  wipe: () => {
    if (!confirm('Удалить все записи, дела и итоги? Настройки сохранятся.')) return;
    S.sessions = []; S.todos = []; S.reviews = {}; S.timer = null; saveNow(); toast('Записи удалены'); render();
  }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && A[el.dataset.act]) A[el.dataset.act](el.dataset, el);
});

/* поля настроек и заметок сохраняются при изменении, без перерисовки */
document.addEventListener('change', e => {
  const el = e.target, k = el.dataset && el.dataset.set;
  if (el.id === 'importFile') return importFile(el);
  if (!k) return;
  const st = S.settings, n = parseInt(el.value, 10);
  if (k.startsWith('t_')) { if (n >= 0) st.targets[k.slice(2)] = n; }
  else if (k === 'dailyGoal') { if (n > 0) st.dailyGoal = n; }
  else if (k === 'pomoWork') { if (n > 0) st.pomo.work = n; }
  else if (k === 'pomoBrk') { if (n >= 0) st.pomo.brk = n; }
  else if (k === 'syncToken') st.sync.token = el.value.trim();
  else if (k === 'syncRepo') st.sync.repo = el.value.trim();
  else if (k === 'syncBranch') st.sync.branch = el.value.trim() || 'data';
  else if (k === 'workoutTime' || k === 'workWindow') st[k] = el.value.trim();
  else if (k === 'lesson') { const v = el.value.trim(); if (v) st.lessons[el.dataset.i] = v; else delete st.lessons[el.dataset.i]; }
  else if (k === 'revWin' || k === 'revBlock') {
    const r = S.reviews[el.dataset.k] = S.reviews[el.dataset.k] || {};
    r[k === 'revWin' ? 'win' : 'block'] = el.value; toast('Сохранено');
  }
  saveNow();
});

function importFile(el) {
  const f = el.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result);
      if (!j || !Array.isArray(j.sessions)) throw new Error('bad');
      if (!confirm(`Загрузить копию (${j.sessions.length} записей)? Текущие данные будут заменены.`)) return;
      S = merge(defaults(), j); S.timer = null; saveNow(); toast('Данные загружены'); render();
    } catch (err) { toast('Не получилось прочитать файл'); }
    el.value = '';
  };
  r.readAsText(f);
}


/* ---------- автосохранение на GitHub ---------- */
function publicState() {
  const c = JSON.parse(JSON.stringify(S));
  c.settings.sync.token = '';
  c.timer = null;
  return c;
}
const b64 = str => btoa(unescape(encodeURIComponent(str)));
let syncing = false, lastTry = 0;

async function syncNow(manual) {
  const sy = S.settings.sync;
  if (syncing) return;
  if (!sy.token || !/^[\w.-]+\/[\w.-]+$/.test(sy.repo)) { if (manual) toast('Укажи токен и репозиторий'); return; }
  syncing = true; lastTry = Date.now();
  const api = p => fetch(`https://api.github.com/repos/${sy.repo}${p}`, { headers: { Authorization: `Bearer ${sy.token}`, Accept: 'application/vnd.github+json' } });
  const send = (p, method, body) => fetch(`https://api.github.com/repos/${sy.repo}${p}`, { method, headers: { Authorization: `Bearer ${sy.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const q = `/contents/${sy.path}?ref=${encodeURIComponent(sy.branch)}`;
    let r = await api(q);
    if (r.status === 404) { // нет файла или ветки — создаём ветку от основной
      const rr = await api('/git/ref/heads/' + encodeURIComponent(sy.branch));
      if (rr.status === 404) {
        const def = (await (await api('')).json()).default_branch;
        const base = await (await api('/git/ref/heads/' + def)).json();
        const mk = await send('/git/refs', 'POST', { ref: 'refs/heads/' + sy.branch, sha: base.object.sha });
        if (!mk.ok) throw new Error('ветка: ' + mk.status);
      }
    }
    const sha = r.ok ? (await r.json()).sha : undefined;
    const put = await send(`/contents/${sy.path}`, 'PUT', {
      message: `Данные за ${todayS()}`, content: b64(JSON.stringify(publicState(), null, 2)), branch: sy.branch, ...(sha ? { sha } : {})
    });
    if (!put.ok) throw new Error(put.status === 401 || put.status === 403 ? 'нет доступа, проверь токен' : 'ошибка ' + put.status);
    sy.last = `${todayS()} ${nowHM()}`; sy.status = 'ок'; sy.lastDay = todayS();
    if (manual) toast('✓ Сохранено на GitHub');
  } catch (e) {
    sy.status = 'не вышло: ' + (e.message || 'сеть'); if (manual) toast('Не удалось сохранить: ' + (e.message || 'нет сети'));
  }
  syncing = false; saveNow();
  if (ui.view === 'settings') render();
}
/* 23:59 при открытом приложении; иначе — догоняем при следующем открытии */
function autoSync() {
  const sy = S.settings.sync;
  if (!sy.on || syncing || Date.now() - lastTry < 5 * 60000) return;
  const d = new Date();
  const due = (d.getHours() === 23 && d.getMinutes() === 59 && sy.last !== `${todayS()} 23:59`) ||
    (sy.lastDay && sy.lastDay < todayS() && S.sessions.some(x => x.date > sy.lastDay));
  if (due || (!sy.lastDay && S.sessions.length)) syncNow(false);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') autoSync(); });

/* ---------- старт ---------- */
(function init() {
  const q = new URLSearchParams(location.search).get('view');
  if (q && VIEWS[q]) ui.view = q;
  if (S.timer && !S.timer.done && !S.timer.saved && !S.timer.paused && timerLeft() <= 0) {
    if (S.timer.mode === 'work') { S.timer.done = true; S.timer.elapsed = Math.round(S.timer.total / 60); } else S.timer = null;
  } else if (S.timer && !S.timer.done && !S.timer.saved && !S.timer.paused) wakeOn();
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
