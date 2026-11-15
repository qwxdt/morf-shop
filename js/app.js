/* MORF.SHOP — сайт: лоадер + морф зипок (из прототипа a_bw), меню-краска, каталог, вещь, корзина, заказ в Telegram. */
(function () {
'use strict';
var D = document, H = D.documentElement, M = window.MORF, W8 = window;
var $ = function (s, r) { return (r || D).querySelector(s); };
var RM = W8.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
var WIDE = W8.matchMedia('(min-width:900px)');
var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
var fmt = function (u) { return String(u).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009'); };
var price = function (u) { return u ? fmt(u) + ' грн' : 'цена в лс'; };
var szs = function (a) { return a && a.length ? a.join(' · ').replace(/-/g, '–') : ''; };
var BY = {}; M.items.forEach(function (i) { BY[i.id] = i; });
var TG = 'https://t.me/' + M.tg;
var cap = $('#cap'), stage = $('#stage'), ld = $('#ld'), hd = $('.hd');
var locks = 0;
function lock(on) { locks = Math.max(0, locks + (on ? 1 : -1)); H.classList.toggle('lock', locks > 0); }

/* ---------- меню: густая белая краска стекает из-под шапки ----------
   Рисуется на canvas одним путём: кромка + капли (шея, круглая бульба на конце, скругления у кромки),
   без нитей и линий. Капли разной длины бегут впереди кромки со своей скоростью (вязкость),
   кромка догоняет и заливает экран. Пункты открываются ровно там, где уже есть краска (clip по кромке).
   Закрытие — краска втягивается вверх быстрее. Шапка выше меню, бургер всегда на месте. */
var bg = $('#bg'), menu = $('#menu'), mcv = $('#mcv'), mlist = $('#mlist'), mctx = mcv.getContext('2d');
var mT = 0, mDir = 0, mRaf = 0, mLast = 0, mDr = null, mW = 0, mH = 0, mDpr = 1, OPEN_MS = 900, CLOSE_MS = 560;
function mSeed(w, h) {
  var sd = 7, r = function () { sd = sd * 16807 % 2147483647; return (sd - 1) / 2147483646; };
  var f = Math.min(1.35, Math.max(.9, w / 390)), a = [], x = 10 + r() * 14;
  while (x < w - 8) {
    var big = r() > .38, n = (big ? 7 + r() * 6 : 4 + r() * 3) * f;
    a.push({ x: x, n: n, rb: n * (1.28 + r() * .22), L: h * (big ? .2 + r() * .26 : .07 + r() * .1), v: .55 + r() * .9, w: r() * 6.28 });
    x += n * 2 + (big ? 22 : 14) * f + r() * 34 * f;
  }
  return a;
}
function mEdgeY(x, B) { return B + 3 * Math.sin(x * .034 + 1.3) + 1.6 * Math.sin(x * .093); }
function mDraw(t) { /* t 0..1 — насколько налита краска */
  var w = mW, h = mH, c = mctx, i, d;
  var e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  var B = -24 + (h + 40) * e; /* кромка: из-под шапки до низа с запасом */
  c.setTransform(mDpr, 0, 0, mDpr, 0, 0); c.clearRect(0, 0, w, h);
  c.beginPath(); c.moveTo(0, 0); c.lineTo(0, mEdgeY(0, B));
  for (i = 0; i < mDr.length; i++) {
    d = mDr[i];
    var g = Math.min(1, t * (1.5 + d.v)), gg = g * g * (3 - 2 * g);          /* рост капли: быстрые убегают вперёд */
    var L = d.L * gg * (1 - .35 * e) + 2, rb = d.rb * Math.min(1, .35 + gg), n = Math.min(d.n * Math.min(1, .45 + gg), rb * .82);
    var E = mEdgeY(d.x, B), cy = E + Math.max(L, rb * .4), s = Math.sqrt(Math.max(0, rb * rb - n * n));
    var nb = cy - s, fl = Math.max(0, Math.min(n * 1.6, nb - E - 1));         /* низ шеи и скругление у кромки */
    var xl = d.x - n, xr = d.x + n;
    c.lineTo(xl - fl, mEdgeY(xl - fl, B));
    c.quadraticCurveTo(xl, E, xl, E + fl);
    c.lineTo(xl, nb);
    c.arc(d.x, cy, rb, Math.atan2(-s, -n), Math.atan2(-s, n), true);
    c.lineTo(xr, E + fl);
    c.quadraticCurveTo(xr, E, xr + fl, mEdgeY(xr + fl, B));
  }
  c.lineTo(w, mEdgeY(w, B)); c.lineTo(w, 0); c.closePath();
  c.fillStyle = 'rgba(0,0,0,.45)'; c.save(); c.translate(0, 3); c.fill(); c.restore(); /* толщина слоя на тёмном */
  c.fillStyle = '#f4f2ee'; c.fill();
  mlist.style.clipPath = 'inset(0 0 ' + Math.max(0, h - B - 18).toFixed(1) + 'px 0)';
}
function mSize() {
  var w = menu.clientWidth, h = menu.clientHeight, dp = Math.min(2, W8.devicePixelRatio || 1);
  if (w === mW && h === mH && dp === mDpr && mDr) return;
  mW = w; mH = h; mDpr = dp; mcv.width = Math.round(w * dp); mcv.height = Math.round(h * dp); mDr = mSeed(w, h);
}
function mTick(now) {
  var dt = Math.min(48, now - (mLast || now)); mLast = now;
  mT = Math.max(0, Math.min(1, mT + mDir * dt / (mDir > 0 ? OPEN_MS : CLOSE_MS)));
  mDraw(mT);
  if ((mDir > 0 && mT < 1) || (mDir < 0 && mT > 0)) { mRaf = requestAnimationFrame(mTick); return; }
  mRaf = 0; if (mDir < 0) menu.classList.remove('open', 'cl');
}
function setMenu(o) {
  var was = menu.classList.contains('open') && !menu.classList.contains('cl'); if (o === was) return;
  if (o) closeSheets(true);
  bg.setAttribute('aria-expanded', o ? 'true' : 'false'); bg.setAttribute('aria-label', o ? 'Закрыть меню' : 'Меню');
  lock(o);
  if (o) { menu.classList.remove('cl'); menu.classList.add('open'); } else menu.classList.add('cl');
  menu.classList.toggle('in', o);
  mSize();
  if (RM) { mT = o ? 1 : 0; mDraw(mT); if (!o) menu.classList.remove('open', 'cl'); return; }
  mDir = o ? 1 : -1; mLast = 0;
  if (!mRaf) mRaf = requestAnimationFrame(mTick);
}
W8.__menuAt = function (t) { mDir = 0; mSize(); mT = t; mDraw(t); }; /* для QA-кадров */
addEventListener('resize', function () {
  if (!menu.classList.contains('open')) return;
  mSize(); mDraw(mT);
});
bg.addEventListener('click', function () { setMenu(!(menu.classList.contains('open') && !menu.classList.contains('cl'))); });
menu.addEventListener('click', function (e) {
  var a = e.target.closest('a'); if (!a) return;
  if (a.hasAttribute('data-cart')) { e.preventDefault(); setMenu(false); setTimeout(function () { openCart(); }, RM ? 0 : 220); return; }
  setMenu(false);
});

/* ================= каталог ================= */
var grid = $('#grid'), flt = $('#flt');
function card(p) {
  var cls = 'ph' + (p.kind === 'cut' ? ' cut' : '');
  return '<button class="card" type="button" data-id="' + esc(p.id) + '" data-cat="' + esc(p.cat) + '">' +
    '<span class="' + cls + '">' +
    '<img src="' + p.img + '" width="' + p.w + '" height="' + p.h + '" loading="lazy" decoding="async" alt="' + esc(p.name) + '"></span>' +
    '<span class="nm">' + esc(p.name) + '</span><span class="pr">' + price(p.uah) + '</span>' +
    (p.sizes && p.sizes.length ? '<span class="sz">' + szs(p.sizes) + '</span>' : '') +
    /* r3 Б5: без плашки на фото; если архив включат (MORF_ASK=1) — обычным текстом под ценой */
    (p.st === 'ask' ? '<span class="sz">наличие уточнить</span>' : '') + '</button>';
}
grid.innerHTML = M.items.map(card).join('');
flt.innerHTML = ['Все'].concat(M.cats).map(function (c, i) {
  return '<button type="button" aria-pressed="' + (i ? 'false' : 'true') + '" data-c="' + esc(c) + '">' + esc(c) + '</button>';
}).join('');
flt.addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  var c = b.getAttribute('data-c');
  [].forEach.call(flt.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
  [].forEach.call(grid.children, function (x) { x.hidden = !(c === 'Все' || x.getAttribute('data-cat') === c); });
  var top = $('#catalog .flt').getBoundingClientRect().top;
  if (top < hd.offsetHeight + 1) scrollTo({ top: scrollY + ($('#grid').getBoundingClientRect().top - hd.offsetHeight - flt.offsetHeight - 6), behavior: RM ? 'auto' : 'smooth' });
  b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: RM ? 'auto' : 'smooth' });
});
grid.addEventListener('click', function (e) { var c = e.target.closest('.card'); if (c) openItem(c.getAttribute('data-id')); });

/* ================= шторки ================= */
var openSh = null, toastT = 0;
function toast(t) {
  var el = $('#toast'), b = openSh && $('.buy', openSh);
  /* r3 В7: в открытой шторке тост над панелью кнопок, а не на ней */
  el.style.bottom = b && b.offsetHeight && innerWidth < 1024 ? (b.offsetHeight + 12) + 'px' : '';
  el.textContent = t; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('on'); }, 2200);
}
function show(sh) {
  if (openSh === sh) return;
  if (openSh) hide(openSh, true); else lock(true);
  openSh = sh; sh.classList.add('on');
  try { history.pushState({ sh: sh.id }, ''); } catch (e) {}
  setTimeout(function () { var x = $('.x', sh); if (x) x.focus({ preventScroll: true }); }, 60);
}
function hide(sh, swap) {
  sh.classList.remove('on');
  if (!swap) { openSh = null; lock(false); }
}
function closeSheets(noHist) {
  if (!openSh) return;
  hide(openSh);
  if (!noHist && history.state && history.state.sh) { try { history.back(); } catch (e) {} }
}
addEventListener('popstate', function () { if (openSh) hide(openSh); });
D.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeSheets(); });
D.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  if (openSh) closeSheets(); else if (menu.classList.contains('open')) setMenu(false);
});

/* ---------- вещь ---------- */
var cur = null, pick = null, itsc = $('#itsc'), add = $('#add');
function openItem(id) {
  var p = BY[id]; if (!p) return;
  cur = p; pick = p.sizes && p.sizes.length === 1 ? p.sizes[0] : null;
  var g = p.gal && p.gal.length ? p.gal : [[p.img, p.w, p.h]];
  var cutCls = p.kind === 'cut' && !(p.gal && p.gal.length) ? ' class="cut"' : '';
  itsc.innerHTML =
    '<div class="gal"><div class="gs" id="gs">' + g.map(function (x, k) {
      /* r3 Б2: маленькие исходники не растягивать больше натурального размера */
      return '<figure><img' + cutCls + ' style="max-width:' + x[1] + 'px;max-height:' + x[2] + 'px" src="' + x[0] + '" width="' + x[1] + '" height="' + x[2] + '" ' + (k ? 'loading="lazy" ' : '') + 'decoding="async" alt="' + esc(p.name) + (g.length > 1 ? ', фото ' + (k + 1) + ' из ' + g.length : '') + '"></figure>';
    }).join('') + '</div>' +
    (g.length > 1 ? '<div class="dots" aria-hidden="true">' + g.map(function (x, k) { return '<i' + (k ? '' : ' class="on"') + '></i>'; }).join('') + '</div>' +
      '<button class="ga l" type="button" aria-label="Предыдущее фото"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<button class="ga r" type="button" aria-label="Следующее фото"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>' : '') +
    '</div>' +
    '<div class="inf"><h3>' + esc(p.name) + '</h3><p class="pr">' + price(p.uah) + '</p>' +
    /* r3 В6: размеры сразу под ценой — на 390 видны без скролла */
    (p.sizes && p.sizes.length
      ? '<p class="lbl" id="szl">Размер</p><div class="szs" id="szs" role="group" aria-labelledby="szl">' + p.sizes.map(function (s) {
          return '<button type="button" aria-pressed="' + (s === pick ? 'true' : 'false') + '" data-s="' + esc(s) + '">' + esc(s.replace(/-/g, '–')) + '</button>';
        }).join('') + '</div><p class="hint" id="hint" aria-live="polite"></p>'
      : '') +
    (p.st === 'ask'
      ? '<p class="st ask">Вещь из старого поста — наличие уточнит @' + M.tg + '</p>'
      : '<p class="st">В наличии · доставка 1–3 дня</p>') +
    '<p class="note">Нужен другой размер или другая вещь? Поможем с размером, а почти любую шмотку привезём под заказ — предоплата 50% или полная. Пиши <a href="' + TG + '" target="_blank" rel="noopener">@' + M.tg + '</a>.</p>' +
    (p.post ? '<p class="note"><a href="https://t.me/' + M.channel + '/' + p.post + '" target="_blank" rel="noopener">Пост с этой вещью в канале</a></p>' : '') +
    '</div>';
  setAdd();
  var gs = $('#gs'), dots = $('.dots', itsc);
  gs.scrollLeft = 0;
  if (dots) {
    var di = dots.children, n = g.length, last = 0;
    gs.addEventListener('scroll', function () {
      var k = Math.round(gs.scrollLeft / gs.clientWidth); if (k === last || k < 0 || k >= n) return;
      di[last].classList.remove('on'); di[k].classList.add('on'); last = k;
    }, { passive: true });
    $('.ga.l', itsc).addEventListener('click', function () { gs.scrollBy({ left: -gs.clientWidth, behavior: RM ? 'auto' : 'smooth' }); });
    $('.ga.r', itsc).addEventListener('click', function () { gs.scrollBy({ left: gs.clientWidth, behavior: RM ? 'auto' : 'smooth' }); });
  }
  var box = $('#szs');
  if (box) box.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    pick = b.getAttribute('data-s');
    [].forEach.call(box.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    box.classList.remove('bad'); $('#hint').textContent = '';
    setAdd();
  });
  itsc.scrollTop = 0;
  show($('#item'));
}
function inCart(p, s) { return cart.some(function (c) { return c.id === p.id && c.s === s; }); }
var addT = 0;
function setAdd() {
  if (!cur) return;
  clearTimeout(addT);
  add.textContent = inCart(cur, pick) ? 'В корзине — открыть' : 'В корзину · ' + price(cur.uah);
}
add.addEventListener('click', function () {
  var p = cur; if (!p) return;
  if (p.sizes && p.sizes.length && !pick) {
    /* r3 В6: причину видно всегда — ряд размеров в центр шторки + текст на самой кнопке */
    var box = $('#szs'); box.classList.add('bad'); $('#hint').textContent = 'Выбери размер';
    box.scrollIntoView({ block: 'center', behavior: RM ? 'auto' : 'smooth' });
    if (box.animate && !RM) box.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 });
    clearTimeout(addT); add.textContent = 'Сначала выбери размер';
    addT = setTimeout(setAdd, 1500);
    return;
  }
  if (inCart(p, pick)) { openCart(); return; }
  /* r3 В7: в шторке без тоста — кнопка сама меняется на «В корзине — открыть», счётчик в шапке растёт */
  cart.push({ id: p.id, s: pick }); save(); setAdd();
});

/* ---------- корзина ---------- */
var KEY = 'morf_cart_v1', cart = [];
try { cart = (JSON.parse(localStorage.getItem(KEY)) || []).filter(function (c) { return BY[c.id]; }); } catch (e) { cart = []; }
var cnt = $('#cnt');
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {}
  cnt.textContent = cart.length ? cart.length : ''; cnt.classList.toggle('on', cart.length > 0);
  $('#cb').setAttribute('aria-label', cart.length ? 'Корзина, вещей: ' + cart.length : 'Корзина');
  cnt.classList.remove('bump'); void cnt.offsetWidth; if (cart.length) cnt.classList.add('bump');
  if ($('#cart').classList.contains('on')) drawCart();
}
function total() { return cart.reduce(function (a, c) { return a + (BY[c.id].uah || 0); }, 0); }
var ONE = /^one\s*size$/i;
function orderText() {
  var L = ['Привет! Хочу заказать с сайта MORF.SHOP:', ''];
  cart.forEach(function (c) {
    var p = BY[c.id];
    L.push('— ' + p.name + (c.s ? (ONE.test(c.s) ? ', ' + c.s : ', размер ' + c.s) : '') + ' — ' + price(p.uah) + (p.st === 'ask' ? ' (уточнить наличие)' : '') + (p.post ? ' · t.me/' + M.channel + '/' + p.post : ''));
  });
  L.push('', 'Итого: ' + fmt(total()) + ' грн', '', 'Доставка — куда и как удобнее, напишу.');
  return L.join('\n');
}
function drawCart() {
  var b = $('#ctb'), f = $('#ctf');
  if (!cart.length) {
    b.innerHTML = '<h3>Корзина</h3><div class="empty"><p>Пока пусто. Загляни в каталог.</p><a class="btn p" href="#catalog" data-close>В каталог</a></div>';
    f.hidden = true; return;
  }
  f.hidden = false;
  b.innerHTML = '<h3>Корзина</h3>' + cart.map(function (c, k) {
    var p = BY[c.id];
    return '<div class="row"><span class="ph' + (p.kind === 'cut' ? ' cut' : '') + '"><img src="' + p.img + '" width="' + p.w + '" height="' + p.h + '" alt="" loading="lazy" decoding="async"></span>' +
      '<div><b>' + esc(p.name) + '</b><span>' + (c.s ? (ONE.test(c.s) ? esc(c.s) : 'Размер ' + esc(c.s.replace(/-/g, '–'))) : 'Без размера') + (p.st === 'ask' ? ' · уточнить наличие' : '') + '</span><span class="p2">' + price(p.uah) + '</span></div>' +
      '<button class="rm" type="button" data-k="' + k + '" aria-label="Убрать ' + esc(p.name) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
  }).join('') +
    '<p class="tot"><span>Итого</span><span>' + fmt(total()) + ' грн</span></p>' +
    '<p class="how">Заказ уйдёт менеджеру @' + M.tg + ' в Telegram: текст с вещами и суммой подставим и скопируем, останется отправить. Оплата и доставка — в переписке.</p>';
  f.innerHTML = '<a class="btn p" id="go" href="' + TG + '?text=' + encodeURIComponent(orderText()) + '" target="_blank" rel="noopener">Оформить в Telegram</a>';
}
function openCart() { drawCart(); show($('#cart')); }
$('#cb').addEventListener('click', function () { if (menu.classList.contains('open')) setMenu(false); openCart(); });
$('#ctb').addEventListener('click', function (e) {
  var r = e.target.closest('.rm'); if (!r) return;
  cart.splice(+r.getAttribute('data-k'), 1); save(); setAdd();
});
/* копирование: сначала синхронно (жест не теряется, ссылка открывается сразу), потом Clipboard API;
   «скопирован» пишем только при успехе, иначе — текст заказа в корзине и кнопка «Скопировать» */
function copySync(t) {
  var ta = D.createElement('textarea'), ok = false, fo = D.activeElement;
  ta.value = t; ta.setAttribute('readonly', ''); ta.setAttribute('aria-hidden', 'true');
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;pointer-events:none';
  D.body.appendChild(ta);
  try { ta.focus({ preventScroll: true }); ta.select(); ta.setSelectionRange(0, t.length); ok = D.execCommand('copy'); } catch (er) { ok = false; }
  D.body.removeChild(ta);
  try { fo && fo.focus && fo.focus({ preventScroll: true }); } catch (er) {}
  return !!ok;
}
function copyText(t, done) {
  if (copySync(t)) { done(true); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { navigator.clipboard.writeText(t).then(function () { done(true); }, function () { done(false); }); return; } catch (er) {}
  }
  done(false);
}
function showOrder(t, copied) {
  var box = $('#otx');
  if (!box) {
    box = D.createElement('div'); box.className = 'otx'; box.id = 'otx';
    box.innerHTML = '<p id="otxl"></p><textarea readonly rows="10" aria-labelledby="otxl"></textarea><button class="btn" type="button" id="ocp">Скопировать</button>';
    $('#ctb').appendChild(box);
  }
  $('#otxl', box).textContent = copied ? 'Текст заказа скопирован. Открой чат @' + M.tg + ' и вставь его.' : 'Скопируй текст заказа и отправь его @' + M.tg + ':';
  $('textarea', box).value = t;
  $('#go').textContent = 'Открыть чат @' + M.tg;
  box.scrollIntoView({ block: 'nearest', behavior: RM ? 'auto' : 'smooth' });
}
$('#ctb').addEventListener('click', function (e) {
  if (!e.target.closest('#ocp')) return;
  var ta = $('#otx textarea'), t = ta.value;
  copyText(t, function (ok) {
    if (ok) { toast('Скопировано'); return; }
    ta.focus(); ta.select(); try { ta.setSelectionRange(0, t.length); } catch (er) {}
    toast('Выдели текст и скопируй вручную');
  });
});
$('#ctf').addEventListener('click', function (e) {
  var a = e.target.closest('#go'); if (!a) return;
  var t = orderText();
  a.href = TG + '?text=' + encodeURIComponent(t);
  if ($('#otx')) return; /* текст уже показан — просто открываем чат */
  if (copySync(t)) { toast('Заказ скопирован — открываем @' + M.tg); return; }
  e.preventDefault();
  copyText(t, function (ok) { showOrder(t, ok); });
});
save(); cnt.classList.remove('bump');

/* ================= первый экран: лоадер + морф зипок (из прототипа) ================= */
function setCap(p) { cap.innerHTML = '<span>' + esc(p.name) + (p.uah ? ' · <b>' + price(p.uah) + '</b>' : '') + '</span>'; }
var finished = false;
function left(max, min, by) { var n = W8.performance && performance.now ? performance.now() : 0; return Math.max(min, Math.min(max, by - n)); }
function finish() {
  if (finished) return; finished = true; ld.classList.add('off');
  setTimeout(function () { H.classList.remove('loading'); ld.style.display = 'none'; }, RM ? 0 : 320);
}
function load(src) {
  return new Promise(function (res) {
    var i = new Image();
    i.onload = function () { (i.decode ? i.decode() : Promise.resolve()).then(function () { res(i); }, function () { res(i); }); };
    i.onerror = function () { res(i); }; i.src = src;
  });
}
var cv = D.createElement('canvas'); cv.id = 'cv'; cv.setAttribute('role', 'img'); stage.appendChild(cv);
var HERO = M.hero, Z = M.morph, P = [Z[Z.length - 1], HERO].concat(Z.slice(0, -1)), imgs = [], at = 1, busy = true, CW = 0, CH = 0, dpr = 1, last = [0, 1, 0];
var ctx = cv.getContext('2d');
function size() {
  var r = cv.getBoundingClientRect(); dpr = Math.min(W8.devicePixelRatio || 1, 2);
  var w = Math.round(r.width * dpr), h = Math.round(r.height * dpr); if (!w || !h) return false;
  if (w !== CW || h !== CH) { CW = cv.width = w; CH = cv.height = h; } return true;
}
function fit(I) {
  var iw = I.naturalWidth, ih = I.naturalHeight, wd = WIDE.matches;
  var top = wd ? 24 * dpr : 0, bw = CW * (wd ? .94 : 1.08), bh = wd ? CH - 2 * top : CH;
  var s = Math.min(bw / iw, bh / ih), w = iw * s, h = ih * s;
  return { I: I, iw: iw, ih: ih, s: s, w: w, h: h, x: (CW - w) / 2, y: wd ? top + (bh - h) / 2 : (CH - h) / 2 };
}
function band(f, y0, y1, dx, k, al) {
  var a = Math.max(y0, f.y), b = Math.min(y1, f.y + f.h); if (b - a < .5 || al <= 0) return;
  ctx.globalAlpha = al; ctx.drawImage(f.I, 0, (a - f.y) / f.s, f.iw, (b - a) / f.s, f.x + dx - f.w * (k - 1) / 2, a, f.w * k, b - a);
}
function light() {
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = '#0b0b0b'; ctx.fillRect(0, 0, CW, CH);
  var rx = CW * .5, ry = CH * .5; ctx.save(); ctx.translate(CW / 2, CH / 2); ctx.scale(1, ry / rx);
  var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, '#3c3c3c'); g.addColorStop(.5, '#1f1f1f'); g.addColorStop(1, '#0b0b0b');
  ctx.fillStyle = g; ctx.fillRect(-rx, -rx, 2 * rx, 2 * rx); ctx.restore();
}
function paint(a, b, p) {
  last = [a, b, p]; if (!CW) return; light();
  var A = imgs[a], B = imgs[b];
  if (p <= 0 || p >= 1) { var I = p >= 1 ? B : A; if (I && I.naturalWidth) { var f = fit(I); ctx.drawImage(I, f.x, f.y, f.w, f.h); } return; }
  if (!A || !B || !A.naturalWidth || !B.naturalWidth) return;
  var fa = fit(A), fb = fit(B), top = Math.min(fa.y, fb.y), bot = Math.max(fa.y + fa.h, fb.y + fb.h), N = 96, amp = Math.max(fa.w, fb.w) * .075;
  for (var i = 0; i < N; i++) {
    var u = i / (N - 1), q = p * 1.6 - u * .6; q = q < 0 ? 0 : q > 1 ? 1 : q; q = q * q * (3 - 2 * q);
    var bell = Math.sin(Math.PI * q), y0 = Math.round(top + i * (bot - top) / N), y1 = Math.round(top + (i + 1) * (bot - top) / N);
    band(fa, y0, y1, amp * bell * Math.sin(u * 10 + p * 9), 1 + bell * .14 * Math.sin(u * 6 + p * 5), Math.min(1, 2 - 2 * q));
    band(fb, y0, y1, -amp * bell * Math.sin(u * 8 + p * 8 + 1.3), 1 + bell * .14 * Math.sin(u * 5 + p * 7 + 2), Math.min(1, 2 * q));
  }
  ctx.globalAlpha = 1;
}
function run(a, b, dur, done, mid) {
  var t0 = 0, midDone = false;
  function step(t) {
    if (!t0) t0 = t; var x = Math.min(1, (t - t0) / dur), e = x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    paint(a, b, e); if (!midDone && x >= .5) { midDone = true; mid && mid(); }
    if (x < 1) requestAnimationFrame(step); else done && done();
  }
  requestAnimationFrame(step);
}
function label() { cv.setAttribute('aria-label', P[at].name); }
setCap(P[1]);
var EVERY = 3900, HOLD = 6900, tm = 0, seen = true, live = false, hero = $('.hero');
/* r3 М8: лоадер уходит, когда шрифт вордмарка уже готов — MORF не меняет ширину после лоадера (WebKit) */
function fontReady() {
  if (!(D.fonts && D.fonts.load)) return Promise.resolve();
  return Promise.race([D.fonts.load('400 100px Wet', 'MORF').catch(function () {}), new Promise(function (r) { setTimeout(r, 1500); })]);
}
Promise.all([load(P[0].img), load(P[1].img), fontReady()]).then(function (r) {
  imgs[0] = r[0]; imgs[1] = r[1]; size();
  P.slice(2).forEach(function (p, i) { load(p.img).then(function (im) { imgs[i + 2] = im; }); });
  function end() { at = 1; busy = false; label(); finish(); live = true; arm(); }
  if (RM) { paint(0, 1, 1); end(); return; }
  paint(0, 1, 0);
  setTimeout(function () { run(0, 1, left(1000, 550, 1450), end); }, 60);
});
function onScr() { var r = hero.getBoundingClientRect(); return r.bottom > innerHeight * .2 && r.top < innerHeight * .8; }
function can() { return live && !RM && seen && !D.hidden && onScr() && !openSh && !menu.classList.contains('open'); }
function arm() { if (tm || busy || !can()) return; tm = setTimeout(next, P[at].n === HERO.n ? HOLD : EVERY); }
function disarm() { clearTimeout(tm); tm = 0; }
function next() {
  tm = 0; if (busy || !can()) { arm(); return; } var n = -1;
  for (var k = 1; k < P.length; k++) { var j = (at + k) % P.length; if (imgs[j] && imgs[j].naturalWidth) { n = j; break; } }
  if (n < 0) { arm(); return; }
  busy = true; cap.classList.add('sw');
  run(at, n, 1100, function () { at = n; busy = false; label(); arm(); }, function () { setCap(P[n]); cap.classList.remove('sw'); });
}
if ('IntersectionObserver' in W8) new IntersectionObserver(function (e) { seen = e[e.length - 1].isIntersecting; seen ? arm() : disarm(); }, { threshold: .2 }).observe(hero);
D.addEventListener('visibilitychange', function () { D.hidden ? disarm() : arm(); });
setInterval(function () { if (!tm && !busy) arm(); }, 1500); /* после закрытия шторки/меню автосмена продолжается */
var rt; addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (size()) paint(last[0], last[1], busy ? last[2] : 1); }, 80); });
setTimeout(finish, 4000); /* страховка, если фото не загрузились */
/* «Купить» на первом экране — карточка вещи, которая сейчас на сцене */
$('#hbuy').addEventListener('click', function () {
  var p = P[at], id = p && p.id; if (id && BY[id]) openItem(id); else location.hash = '#catalog';
});

/* ================= капли краски с букв ================= */
if (W8.MorfDrips) {
  [].forEach.call(D.querySelectorAll('[data-drips]'), function (el) {
    var heroT = el.getAttribute('data-drips') === 'hero';
    MorfDrips.attach(el, heroT ? { room: 0.9, busy: 0.6, seed: 'h' } : { room: 0.85, busy: 0.5 });
  });
}
})();
