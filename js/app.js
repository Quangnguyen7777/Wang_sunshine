/* =====================================================================
 *  app.js — ĐIỂM KHỞI ĐẦU: nối config, giao diện, cảnh, canvas và âm thanh
 * ---------------------------------------------------------------------
 *  Luồng trải nghiệm:
 *    intro → heart (trái tim + lời nhắn bay) → letter (lá thư)
 *          → yes (SAY YES)  hoặc  think (để mình suy nghĩ)  → end → (xem lại)
 *
 *  Mọi chữ hiển thị đều lấy từ js/config.js và được đặt bằng textContent
 *  (không dùng innerHTML) nên không có nguy cơ chèn mã độc từ nội dung.
 * ===================================================================== */
(function () {
  'use strict';

  var Love = window.Love || {};
  var C = window.LOVE_CONFIG;
  if (!C) { console.error('Không tìm thấy js/config.js'); return; }

  /* ---------- Tiện ích ---------- */
  function $(id) { return document.getElementById(id); }

  /** Thay {recipient}, {sender}, {days} trong chuỗi */
  function fmt(str, extra) {
    var vars = { recipient: C.recipient, sender: C.sender };
    if (extra) Object.keys(extra).forEach(function (k) { vars[k] = extra[k]; });
    return String(str == null ? '' : str).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  var reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var T = C.timing;

  /* ---------- 1) Áp màu từ config vào biến CSS ---------- */
  (function applyTheme() {
    var t = C.theme || {}, s = document.documentElement.style;
    if (t.background) { s.setProperty('--bg', t.background); document.body.style.background = t.background; }
    if (t.pink) s.setProperty('--pink', t.pink);
    if (t.pinkSoft) s.setProperty('--pink-soft', t.pinkSoft);
    if (t.violet) s.setProperty('--violet', t.violet);
    if (t.white) s.setProperty('--white', t.white);
    if (t.textDim) s.setProperty('--text-dim', t.textDim);
    if (C.pageTitle) document.title = fmt(C.pageTitle);
  })();

  /* ---------- 2) Điền chữ từ config vào giao diện ---------- */
  function fillTexts() {
    // Cảnh 1
    var lines = $('introLines');
    lines.textContent = '';
    (C.intro.lines || []).forEach(function (txt) {
      var p = document.createElement('p');
      p.className = 'intro-line';
      p.textContent = fmt(txt);
      lines.appendChild(p);
    });
    $('btnStart').textContent = C.intro.startButton;

    // Cảnh 2-3
    $('btnSkip').textContent = C.heartScene.skipButton;

    // Cảnh 4: lá thư
    $('letterGreeting').textContent = fmt(C.letter.greeting);
    var body = $('letterBody');
    body.textContent = '';
    (C.letter.paragraphs || []).forEach(function (txt) {
      var p = document.createElement('p');
      p.className = 'reveal';
      p.textContent = fmt(txt);
      body.appendChild(p);
    });
    $('letterQuestion').textContent = fmt(C.letter.question);
    $('letterSign').textContent = fmt(C.letter.signature);
    $('btnYes').textContent = C.buttons.yes;
    $('btnThink').textContent = C.buttons.think;

    // Ngày kỷ niệm
    var daysEl = $('letterDays'), a = C.letter.anniversary;
    daysEl.hidden = true;
    if (a && a.enabled) {
      var ms = Date.now() - new Date(a.date).getTime();
      if (isFinite(ms) && ms >= 0) {
        daysEl.textContent = fmt(a.text, { days: Math.floor(ms / 86400000) });
        daysEl.hidden = false;
      } else {
        console.warn('[config] letter.anniversary.date không hợp lệ hoặc ở tương lai:', a.date);
      }
    }

    // Cảnh 5, 6
    $('yesTitle').textContent = fmt(C.yesScene.title);
    $('yesMessage').textContent = fmt(C.yesScene.message);
    $('btnYesNext').textContent = C.buttons.yesNext;
    $('btnYesBack').textContent = C.buttons.yesBack;
    $('thinkMessage').textContent = fmt(C.thinkScene.message);
    $('btnThinkBack').textContent = C.buttons.thinkBack;
    $('btnThinkRestart').textContent = C.buttons.replay;
    $('endMessage').textContent = fmt(C.ending.message);
    $('btnReplay').textContent = C.buttons.replay;
    $('btnShare').textContent = C.buttons.share;
  }

  /** Đánh số thứ tự hiện dần (--i) cho các phần tử .reveal trong lá thư */
  function indexReveals() {
    var i = 0;
    document.querySelectorAll('[data-scene="letter"] .reveal').forEach(function (el) {
      if (el.hidden) return;
      el.style.setProperty('--i', i++);
    });
  }

  /* ---------- 3) Dải ảnh kỷ niệm ---------- */
  function buildPhotos() {
    var block = $('photoBlock'), strip = $('photoStrip');
    strip.textContent = '';
    block.hidden = true;
    var P = C.photos;
    if (!P || !P.enabled || !P.items || !P.items.length) return;
    $('photoTitle').textContent = fmt(C.letter.photosTitle || '');

    P.items.forEach(function (item, idx) {
      if (!item || !item.src) return;
      var li = document.createElement('li');
      li.className = 'polaroid';
      li.style.setProperty('--rot', (idx % 2 ? 1.8 : -1.8) + 'deg');   // xoay nhẹ cho tự nhiên
      var img = document.createElement('img');
      img.src = item.src;
      img.alt = item.caption || ('Ảnh ' + (idx + 1));
      img.loading = 'lazy';
      img.decoding = 'async';
      // Ảnh lỗi (sai đường dẫn/tên file) → bỏ ảnh đó, ghi cảnh báo trong Console, trang vẫn chạy
      img.addEventListener('error', function () {
        console.warn('[photos] Không tải được ảnh: ' + item.src + ' — kiểm tra tên file trong js/config.js và thư mục assets/images/');
        li.remove();
        if (!strip.children.length) { block.hidden = true; indexReveals(); }
      });
      li.appendChild(img);
      if (item.caption) {
        var cap = document.createElement('figcaption');
        cap.textContent = item.caption;
        li.appendChild(cap);
      }
      strip.appendChild(li);
    });
    block.hidden = !strip.children.length;
  }

  /* ---------- 4) Canvas + âm thanh + cảnh ---------- */
  fillTexts();
  buildPhotos();
  indexReveals();

  var canvas = $('stage');
  var stage = null;
  try {
    var level = (C.performance.level || 'AUTO').toUpperCase();
    if (level === 'AUTO') level = Love.detectPerformanceLevel();
    stage = new Love.HeartStage(canvas, {
      heart: C.heart, level: level,
      autoDowngrade: C.performance.autoDowngrade, reducedMotion: reducedMotion
    });
    stage.resize();
    stage.start();
  } catch (err) {
    // Không có Canvas → vẫn dùng được trang (chỉ mất hiệu ứng hạt)
    console.error('[stage] Không khởi tạo được canvas:', err);
    stage = null;
  }
  function S(method) {          // gọi hàm của stage một cách an toàn
    if (!stage) return;
    stage[method].apply(stage, Array.prototype.slice.call(arguments, 1));
  }

  var audio = new Love.AudioManager(C.audio, $('btnAudio'));
  var scenes = new Love.SceneManager($('app'));

  var resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { S('resize'); }, 120);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  document.addEventListener('visibilitychange', function () { audio.onVisibility(document.hidden); });

  /* ---------- 5) Định nghĩa từng cảnh ---------- */

  // CẢNH 1 — mở đầu: các dòng chữ hiện dần rồi tới nút bắt đầu
  scenes.on('intro', {
    enter: function () {
      var lines = document.querySelectorAll('#introLines .intro-line');
      var btn = $('btnStart');
      btn.classList.remove('is-in');
      lines.forEach(function (l) { l.classList.remove('is-in'); });
      var delay = 600;
      lines.forEach(function (l) {
        scenes.later(function () { l.classList.add('is-in'); }, delay);
        delay += T.introLineDelay;
      });
      scenes.later(function () { btn.classList.add('is-in'); }, delay + 400);
      S('setView', 'hidden');
    }
  });

  // CẢNH 2 + 3 — trái tim hội tụ, vòng chữ, rồi lần lượt từng lời nhắn
  var msgEl = $('floatMsg');
  function showMessage(i) {
    var list = C.heartScene.messages || [];
    if (i >= list.length) { scenes.later(function () { scenes.go('letter'); }, 800); return; }
    msgEl.className = 'float-msg ' + (i % 2 === 0 ? 'pos-top' : 'pos-bottom');   // xen kẽ trên/dưới → không chồng nhau
    msgEl.textContent = fmt(list[i]);
    // force reflow để transition chạy lại từ đầu
    void msgEl.offsetWidth;
    msgEl.classList.add('is-in');
    scenes.later(function () {
      msgEl.classList.remove('is-in');
      msgEl.classList.add('is-out');
      scenes.later(function () { showMessage(i + 1); }, T.messageGap);
    }, T.messageVisible);
  }
  scenes.on('heart', {
    enter: function () {
      msgEl.className = 'float-msg';
      msgEl.textContent = '';
      S('setView', 'heart');
      S('setCalm', false);
      S('form', T.heartFormDuration);
      scenes.later(function () { S('setRing', C.heartScene.orbitText || '', true); }, T.heartFormDuration * 0.7);
      scenes.later(function () { showMessage(0); }, T.messageStartDelay + T.heartFormDuration * 0.5);
    },
    leave: function () { S('setRing', '', false); msgEl.className = 'float-msg'; }
  });

  // CẢNH 4 — lá thư: trái tim mờ đi làm nền
  scenes.on('letter', { enter: function () { S('setView', 'letter'); } });

  // CẢNH 5a — SAY YES: bùng nổ
  scenes.on('yes', {
    enter: function () {
      S('setView', 'yes');
      S('burst');
      scenes.later(function () { S('burst'); }, 1100);
      scenes.later(function () { S('burst'); }, 2400);
    },
  });

  // CẢNH 5b — để mình suy nghĩ: nhẹ nhàng, không ép buộc
  scenes.on('think', { enter: function () { S('setView', 'letter'); S('setCalm', true); }, leave: function () { S('setCalm', false); } });

  // CẢNH 6 — kết thúc: trái tim nhỏ, chuyển động chậm
  scenes.on('end', {
    enter: function () { S('setView', 'end'); S('setCalm', true); },
    leave: function () { S('setCalm', false); }
  });

  /* ---------- 6) Sự kiện nút bấm ---------- */
  $('btnStart').addEventListener('click', function () {
    if (C.audio.startOnOpen) audio.start();      // click của người dùng → được phép phát âm thanh
    scenes.go('heart');
  });
  $('btnSkip').addEventListener('click', function () { scenes.go('letter'); });
  $('btnYes').addEventListener('click', function () { scenes.go('yes'); });
  $('btnThink').addEventListener('click', function () { scenes.go('think'); });
  $('btnYesNext').addEventListener('click', function () { scenes.go('end'); });
  $('btnYesBack').addEventListener('click', function () { scenes.go('letter'); });
  $('btnThinkBack').addEventListener('click', function () { scenes.go('letter'); });
  $('btnThinkRestart').addEventListener('click', restart);
  $('btnReplay').addEventListener('click', restart);

  function restart() {
    S('reset');
    scenes.go('intro');
  }

  // Chia sẻ: dùng Web Share nếu có, không thì sao chép liên kết của chính trang này
  var toastTimer = 0;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }
  $('btnShare').addEventListener('click', function () {
    var url = location.href.split('#')[0];
    function copy() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { toast(C.ending.shareCopied); }, function () { toast(url); });
      } else { toast(url); }
    }
    if (navigator.share) {
      navigator.share({ title: fmt(C.ending.shareTitle), url: url }).catch(copy);
    } else { copy(); }
  });

  /* ---------- 7) Bắt đầu ---------- */
  scenes.go('intro');

  // Cho phép gỡ lỗi nhanh từ Console: Love.debug.go('letter')
  Love.debug = { go: function (n) { scenes.go(n); }, stage: stage };
  window.Love = Love;
})();
