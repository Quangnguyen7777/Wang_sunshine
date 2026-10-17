/* =====================================================================
 *  lock-tool.js — Công cụ khoá nội dung bằng mật khẩu (dùng với lock-tool.html)
 * ---------------------------------------------------------------------
 *  Đầu vào : window.LOVE_CONFIG (từ js/config.js đầy đủ) + các file ảnh người dùng chọn.
 *  Đầu ra  : 1) payload.enc.json — nội dung đã mã hoá
 *            2) config.js (bản khoá) — chỉ chứa { locked: true, payloadUrl }
 *            3) link riêng "địa chỉ trang # k=mật khẩu" để làm mã QR
 *
 *  MÃ HOÁ: mật khẩu → PBKDF2-SHA256 (250.000 vòng, salt ngẫu nhiên 16 byte)
 *          → khoá AES-256 → AES-GCM (iv ngẫu nhiên 12 byte).
 *  Mọi thứ chạy trong trình duyệt của bạn, không gửi dữ liệu đi đâu.
 *
 *  LƯU Ý AN TOÀN: file mã hoá nằm công khai trên GitHub nên kẻ xấu có thể thử đoán
 *  mật khẩu ngoại tuyến. Vì vậy hãy dùng mật khẩu ngẫu nhiên dài do công cụ tạo.
 * ===================================================================== */
(function () {
  'use strict';

  var ITER = 250000;
  var MAX_SIDE = 1200;            // cạnh dài tối đa của ảnh sau khi thu nhỏ
  var ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // bỏ ký tự dễ nhầm (l, I, O, 0, 1)

  function $(id) { return document.getElementById(id); }
  var cfg = window.LOVE_CONFIG;
  var el = { info: $('cfgInfo'), list: $('photoList'), files: $('photoFiles'), pass: $('passInput'), gen: $('genPass'),
             url: $('siteUrl'), go: $('goBtn'), msg: $('msg'), done: $('done'), link: $('finalLink'), qr: $('qrLink') };

  function say(text, bad) {
    el.msg.textContent = text;
    el.msg.classList.toggle('hidden', !text);
    el.msg.style.background = bad ? 'rgba(255,90,90,.16)' : '';
    el.msg.style.color = bad ? '#FFB4B4' : '';
  }

  if (!cfg || cfg.locked) {
    el.info.textContent = 'Không đọc được nội dung đầy đủ. Hãy chắc chắn js/config.js là bản ĐẦY ĐỦ của bạn (chưa phải bản đã khoá).';
    el.go.disabled = true;
    return;
  }

  var items = (cfg.photos && cfg.photos.enabled && cfg.photos.items) ? cfg.photos.items.filter(function (i) { return i && i.src; }) : [];
  el.info.textContent = 'Người nhận: ' + cfg.recipient + ' · Người gửi: ' + cfg.sender + ' · ' + (cfg.letter.paragraphs || []).length + ' đoạn thư · ' + items.length + ' ảnh.';

  function baseName(path) { return String(path).split('/').pop().toLowerCase(); }

  /** Cập nhật danh sách ảnh: đã chọn / còn thiếu */
  function renderPhotos() {
    el.list.textContent = '';
    var have = {};
    Array.prototype.forEach.call(el.files.files, function (f) { have[f.name.toLowerCase()] = f; });
    items.forEach(function (it) {
      var li = document.createElement('li');
      var ok = !!have[baseName(it.src)];
      li.className = ok ? 'ok' : 'bad';
      li.textContent = (ok ? '✓ ' : '✗ chưa chọn: ') + it.src;
      el.list.appendChild(li);
    });
    if (!items.length) { var li2 = document.createElement('li'); li2.textContent = 'config.js không có ảnh nào (photos.enabled: false hoặc danh sách trống).'; el.list.appendChild(li2); }
    return have;
  }
  el.files.addEventListener('change', renderPhotos);
  renderPhotos();

  /* ---------- Mật khẩu ngẫu nhiên ---------- */
  function randomPass(n) {
    var arr = new Uint8Array(n), out = '';
    crypto.getRandomValues(arr);
    for (var i = 0; i < n; i++) out += ALPHABET[arr[i] % ALPHABET.length];   // sai lệch phân bố không đáng kể với 56 ký tự
    return out;
  }
  el.gen.addEventListener('click', function () { el.pass.value = randomPass(20); });
  el.pass.value = randomPass(20);

  /* ---------- Xử lý ảnh: thu nhỏ → JPEG data URL ---------- */
  async function fileToDataUrl(file) {
    var url = URL.createObjectURL(file);
    try {
      var img = new Image();
      img.src = url;
      await img.decode();
      var w = img.naturalWidth || 600, h = img.naturalHeight || 750;
      var k = Math.min(1, MAX_SIDE / Math.max(w, h));
      var cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
      var g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);   // nền trắng cho ảnh trong suốt
      g.drawImage(img, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/jpeg', 0.82);
    } finally { URL.revokeObjectURL(url); }
  }

  /* ---------- Mã hoá ---------- */
  function toB64(bytes) {
    var s = '', chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(s);
  }
  async function encrypt(obj, pass) {
    var enc = new TextEncoder();
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    var material = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    var key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: ITER, hash: 'SHA-256' },
      material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    var buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(JSON.stringify(obj)));
    return { v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: toB64(salt), iv: toB64(iv), data: toB64(new Uint8Array(buf)) };
  }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  el.go.addEventListener('click', async function () {
    say('');
    el.done.classList.add('hidden');
    var pass = el.pass.value.trim();
    if (pass.length < 10) { say('Mật khẩu quá ngắn (tối thiểu 10 ký tự). Bấm "Tạo mật khẩu mới".', true); return; }
    if (!(window.crypto && crypto.subtle)) { say('Trình duyệt không hỗ trợ mã hoá. Hãy dùng Chrome, Edge hoặc Safari bản mới.', true); return; }
    var site = el.url.value.trim();
    if (site) {
      try { var u = new URL(site); if (u.protocol !== 'https:') { say('Địa chỉ trang nên bắt đầu bằng https://', true); return; } }
      catch (e) { say('Địa chỉ trang chưa hợp lệ.', true); return; }
    }

    var have = renderPhotos();
    var missing = items.filter(function (it) { return !have[baseName(it.src)]; });
    if (missing.length) { say('Còn thiếu ảnh: ' + missing.map(function (m) { return m.src; }).join(', ') + '. Hãy chọn đủ ở bước 2 hoặc xoá ảnh đó khỏi config.js.', true); return; }

    el.go.disabled = true; say('Đang mã hoá, vui lòng đợi vài giây...');
    try {
      // Sao chép config rồi thay đường dẫn ảnh bằng dữ liệu ảnh (đã thu nhỏ)
      var copy = JSON.parse(JSON.stringify(cfg));
      if (copy.photos && copy.photos.items) {
        for (var i = 0; i < copy.photos.items.length; i++) {
          var it = copy.photos.items[i];
          if (it && it.src) it.src = await fileToDataUrl(have[baseName(it.src)]);
        }
      }
      var pack = await encrypt({ config: copy }, pass);
      var json = JSON.stringify(pack);
      var stub = '/* Bản KHOÁ do lock-tool.html tạo. Nội dung thật nằm trong payload.enc.json (đã mã hoá). */\n' +
                 'window.LOVE_CONFIG = {\n  locked: true,\n  payloadUrl: "payload.enc.json"\n};\n';
      download('payload.enc.json', json, 'application/json');
      setTimeout(function () { download('config.js', stub, 'text/javascript'); }, 400);

      var base = site || 'https://TÊN-BẠN.github.io/love-experience/';
      var link = base.replace(/#.*$/, '') + '#k=' + encodeURIComponent(pass);
      el.link.textContent = link;
      el.qr.href = 'qr-generator.html?u=' + encodeURIComponent(link);
      el.done.classList.remove('hidden');
      say('Xong. Kích thước file mã hoá: ' + Math.round(json.length / 1024) + ' KB.' + (json.length > 8 * 1024 * 1024 ? ' File khá lớn, hãy dùng ít ảnh hơn.' : ''));
      if (!site) say('Xong, nhưng bạn chưa nhập địa chỉ trang nên link bên dưới đang là địa chỉ mẫu. Hãy nhập địa chỉ thật rồi bấm lại.', true);
    } catch (e) {
      console.error(e);
      say('Có lỗi khi mã hoá: ' + (e && e.message ? e.message : e), true);
    } finally { el.go.disabled = false; }
  });
})();
