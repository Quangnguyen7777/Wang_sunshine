/* =====================================================================
 *  loader.js — NẠP CHƯƠNG TRÌNH (chế độ thường hoặc chế độ KHOÁ)
 * ---------------------------------------------------------------------
 *  CHẾ ĐỘ THƯỜNG: js/config.js chứa đầy đủ nội dung → nạp thẳng các module.
 *
 *  CHẾ ĐỘ KHOÁ (riêng tư): js/config.js chỉ có { locked: true, payloadUrl: "..." }.
 *  Toàn bộ nội dung cá nhân (tên, lá thư, ảnh) nằm trong file payload.enc.json,
 *  đã mã hoá AES-256-GCM bằng lock-tool.html. Loader sẽ:
 *    1) Lấy mật khẩu từ phần #k=... của địa chỉ (có sẵn trong mã QR) hoặc hỏi người dùng.
 *       Phần sau dấu # KHÔNG bao giờ được gửi lên máy chủ.
 *    2) Giải mã bằng Web Crypto (PBKDF2-SHA256 → AES-GCM) ngay trên máy người xem.
 *    3) Gán nội dung vào window.LOVE_CONFIG rồi mới nạp chương trình chính.
 *  Không có mật khẩu thì không đọc được gì ngoài màn hình khoá.
 * ===================================================================== */
(function () {
  'use strict';

  var APP_SCRIPTS = ['js/audio-manager.js', 'js/particle-system.js', 'js/scene-manager.js', 'js/app.js'];

  function $(id) { return document.getElementById(id); }

  /** Nạp lần lượt các script (đúng thứ tự, không chạy song song) */
  function loadScripts(list, done) {
    var i = 0;
    (function next() {
      if (i >= list.length) { if (done) done(); return; }
      var s = document.createElement('script');
      s.src = list[i++];
      s.onload = next;
      s.onerror = function () { console.error('[loader] Không nạp được: ' + s.src); };
      document.head.appendChild(s);
    })();
  }

  var cfg = window.LOVE_CONFIG || {};
  if (!cfg.locked) { loadScripts(APP_SCRIPTS); return; }

  /* ----------------- CHẾ ĐỘ KHOÁ ----------------- */
  var lock = $('lockScreen'), form = $('lockForm'), input = $('lockInput'), errEl = $('lockError'), btn = $('lockBtn');
  var pack = null;

  function b64(str) {
    var bin = atob(str), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** Giải mã gói {salt, iv, iter, data}; ném lỗi nếu sai mật khẩu */
  async function decrypt(p, pass) {
    var enc = new TextEncoder();
    var material = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    var key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64(p.salt), iterations: p.iter, hash: 'SHA-256' },
      material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    var buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(p.iv) }, key, b64(p.data));
    return JSON.parse(new TextDecoder().decode(buf));
  }

  /** Thử mở khoá bằng mật khẩu `pass`. Trả về true nếu thành công. */
  async function tryUnlock(pass) {
    if (!pass) return false;
    try {
      var data = await decrypt(pack, pass);
      window.LOVE_CONFIG = data.config;       // thay config tối thiểu bằng config đầy đủ
      lock.hidden = true;
      loadScripts(APP_SCRIPTS);
      return true;
    } catch (e) {
      return false;                           // GCM không xác thực được → sai mật khẩu
    }
  }

  function showForm(msg) {
    lock.hidden = false;
    errEl.textContent = msg || '';
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 100);
  }

  form.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    btn.disabled = true; errEl.textContent = '';
    var ok = await tryUnlock(input.value.trim());
    btn.disabled = false;
    if (!ok) { errEl.textContent = 'Mật khẩu chưa đúng, bạn thử lại nhé.'; input.select(); }
  });

  (async function start() {
    if (!(window.crypto && crypto.subtle)) {
      showForm('Trình duyệt này không hỗ trợ giải mã. Hãy mở bằng Chrome, Safari hoặc Edge bản mới, và dùng địa chỉ https.');
      form.querySelector('input').disabled = true; btn.disabled = true;
      return;
    }
    try {
      var res = await fetch(cfg.payloadUrl || 'payload.enc.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      pack = await res.json();
    } catch (e) {
      console.error('[loader] Không đọc được file nội dung đã mã hoá:', e);
      showForm('Không tải được nội dung. Hãy kiểm tra file payload.enc.json đã được tải lên cùng index.html chưa.');
      return;
    }
    // Mật khẩu có sẵn trong địa chỉ (#k=...) → mở luôn, người nhận không phải gõ gì
    var m = /[#&]k=([^&]+)/.exec(location.hash);
    if (m) {
      var ok = false;
      try { ok = await tryUnlock(decodeURIComponent(m[1])); } catch (e) {}
      if (ok) return;
      showForm('Liên kết này không còn đúng. Hãy nhập mật khẩu.');
      return;
    }
    showForm('');
  })();
})();
