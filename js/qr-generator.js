/* =====================================================================
 *  qr-generator.js — Công cụ tạo mã QR (dùng với qr-generator.html)
 * ---------------------------------------------------------------------
 *  - Dùng thư viện vendor/qrcode.js (qrcode-generator, MIT) để tính ma trận ô.
 *  - Tự vẽ ma trận lên canvas (PNG) và dựng SVG, nên kiểm soát được màu,
 *    vùng trắng yên tĩnh (quiet zone) và logo trái tim ở giữa.
 *  - QR chỉ chứa URL. Không có dữ liệu nào bị gửi ra ngoài.
 *
 *  LƯU Ý QUÉT ĐƯỢC:
 *   • Giữ quiet zone ≥ 4 ô xung quanh.
 *   • Logo chiếm ≤ ~18% chiều rộng và dùng mức sửa lỗi H.
 *   • Màu ô phải ĐẬM hơn nền (độ tương phản cao).
 * ===================================================================== */
(function () {
  'use strict';

  var C = window.LOVE_CONFIG || { qr: {} };
  var QUIET = 4;                 // số ô trắng viền quanh QR
  var LOGO_RATIO = 0.18;         // logo tối đa 18% chiều rộng vùng mã

  function $(id) { return document.getElementById(id); }

  var el = {
    url: $('urlInput'), caption: $('captionInput'), bottom: $('bottomInput'),
    fg: $('fgInput'), bg: $('bgInput'), ec: $('ecSelect'), logo: $('logoCheck'),
    card: $('cardCanvas'), urlWarn: $('urlWarn'), contrast: $('contrastWarn'), error: $('errorMsg')
  };

  if (typeof qrcode !== 'function') {
    el.error.hidden = false;
    el.error.textContent = 'Không nạp được thư viện QR (vendor/qrcode.js). Hãy kiểm tra thư mục vendor/ còn đủ file.';
    return;
  }

  /* ---------- Giá trị mặc định ---------- */
  var q = C.qr || {};
  el.caption.value = q.caption || '';
  el.bottom.value = q.bottomText || '';
  // Nếu trang được mở từ web (http/https), tự điền URL của index.html cùng thư mục
  if (q.defaultUrl) {
    el.url.value = q.defaultUrl;
  } else if (/^https?:$/.test(location.protocol)) {
    try { el.url.value = new URL('index.html', location.href).href.replace(/index\.html$/, ''); } catch (e) {}
  }

  // Địa chỉ truyền sẵn từ lock-tool.html (?u=...) → tự điền (đã gồm mật khẩu #k=...)
  try {
    var passed = new URLSearchParams(location.search).get('u');
    if (passed) el.url.value = passed;
  } catch (e) { /* bỏ qua */ }

  /* ---------- Tiện ích ---------- */
  function hexToRgb(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec(h);
    if (!m) return [0, 0, 0];
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function luminance(h) {
    var c = hexToRgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrastRatio(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  /** Tạo đối tượng QR từ URL; trả về null nếu rỗng */
  function makeQr(text) {
    if (!text) return null;
    var qr = qrcode(0, el.ec.value);   // 0 = tự chọn phiên bản nhỏ nhất đủ chứa dữ liệu
    qr.addData(text);
    qr.make();
    return qr;
  }

  /** Vẽ trái tim (đường dẫn Bezier) vào ô vuông (x,y,size) */
  function heartPath(ctx, x, y, s) {
    var k = s / 64;
    ctx.beginPath();
    ctx.moveTo(x + 32 * k, y + 54 * k);
    ctx.bezierCurveTo(x + 6 * k, y + 36 * k, x + 4 * k, y + 20 * k, x + 14 * k, y + 12 * k);
    ctx.bezierCurveTo(x + 22 * k, y + 6 * k, x + 32 * k, y + 10 * k, x + 32 * k, y + 19 * k);
    ctx.bezierCurveTo(x + 32 * k, y + 10 * k, x + 42 * k, y + 6 * k, x + 50 * k, y + 12 * k);
    ctx.bezierCurveTo(x + 60 * k, y + 20 * k, x + 58 * k, y + 36 * k, x + 32 * k, y + 54 * k);
    ctx.closePath();
  }

  /**
   * Vẽ QR lên ctx tại (ox, oy) với kích thước `size` px (đã gồm quiet zone).
   * Trả về kích thước mỗi ô.
   */
  function drawQr(ctx, qr, ox, oy, size, fg, bg, withLogo) {
    var n = qr.getModuleCount(), total = n + QUIET * 2;
    var cell = size / total, r, c;
    ctx.fillStyle = bg;
    ctx.fillRect(ox, oy, size, size);
    ctx.fillStyle = fg;
    for (r = 0; r < n; r++) {
      for (c = 0; c < n; c++) {
        if (qr.isDark(r, c)) {
          // +0.5 để tránh khe hở giữa các ô khi làm tròn pixel
          ctx.fillRect(ox + (c + QUIET) * cell, oy + (r + QUIET) * cell, cell + 0.5, cell + 0.5);
        }
      }
    }
    if (withLogo) {
      var logo = n * cell * LOGO_RATIO, cx = ox + size / 2, cy = oy + size / 2, pad = logo * 0.16;
      ctx.fillStyle = bg;                                    // nền sạch phía sau trái tim
      ctx.beginPath();
      var rr = logo / 2 + pad;
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FF3D81';
      heartPath(ctx, cx - logo / 2, cy - logo / 2 - logo * 0.02, logo);
      ctx.fill();
    }
    return cell;
  }

  /* ---------- Vẽ thẻ xem trước ---------- */
  function renderCard() {
    var ctx = el.card.getContext('2d'), W = el.card.width, H = el.card.height;
    // Nền tím như một tấm thiệp
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#5B0F6B'); g.addColorStop(1, '#2A0B4A');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Thẻ trắng bo góc
    var m = 60, cw = W - m * 2, ch = H - m * 2;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(m, m, cw, ch, 36); else ctx.rect(m, m, cw, ch);
    ctx.fill();

    ctx.textAlign = 'center'; ctx.fillStyle = '#2A1B33';
    ctx.font = '700 38px "Segoe UI", system-ui, Arial, sans-serif';
    ctx.fillText(el.caption.value || '', W / 2, m + 80, cw - 60);

    var qr = null;
    try { qr = makeQr(el.url.value.trim()); } catch (e) { showError('Địa chỉ quá dài để tạo QR. Hãy dùng địa chỉ ngắn hơn.'); return null; }
    showError('');
    var size = cw - 80;
    if (qr) {
      drawQr(ctx, qr, m + 40, m + 120, size, el.fg.value, el.bg.value, el.logo.checked);
    } else {
      ctx.fillStyle = '#EEE'; ctx.fillRect(m + 40, m + 120, size, size);
      ctx.fillStyle = '#6B5A75'; ctx.font = '26px "Segoe UI", Arial, sans-serif';
      ctx.fillText('Nhập địa chỉ website để tạo QR', W / 2, m + 120 + size / 2, size - 40);
    }
    ctx.fillStyle = '#FF3D81';
    ctx.font = '800 44px "Segoe UI", system-ui, Arial, sans-serif';
    ctx.fillText(el.bottom.value || '', W / 2, H - m - 50, cw - 60);
    return qr;
  }

  function showError(msg) { el.error.hidden = !msg; el.error.textContent = msg || ''; }

  function checkInputs() {
    var v = el.url.value.trim(), msg = '';
    if (v) {
      var u;
      try { u = new URL(v); } catch (e) { u = null; }
      if (!u) msg = 'Địa chỉ chưa hợp lệ. Hãy bắt đầu bằng https://';
      else if (u.protocol !== 'https:') msg = 'Nên dùng địa chỉ https:// để điện thoại mở được an toàn.';
      else if (/^(localhost|127\.|192\.168\.|10\.)/.test(u.hostname)) msg = 'Đây là địa chỉ trong máy/mạng nội bộ. Chỉ thiết bị cùng mạng mới mở được. Hãy triển khai lên web trước khi gửi cho người nhận.';
    }
    el.urlWarn.hidden = !msg; el.urlWarn.textContent = msg;
    el.contrast.hidden = !(contrastRatio(el.fg.value, el.bg.value) < 4 || luminance(el.fg.value) > luminance(el.bg.value));
  }

  function refresh() { checkInputs(); renderCard(); }
  ['input', 'change'].forEach(function (ev) {
    [el.url, el.caption, el.bottom, el.fg, el.bg, el.ec, el.logo].forEach(function (x) { x.addEventListener(ev, refresh); });
  });

  /* ---------- Tải về ---------- */
  function download(href, name) {
    var a = document.createElement('a');
    a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function needUrl() {
    if (!el.url.value.trim()) { showError('Hãy nhập địa chỉ website trước khi tải.'); return true; }
    return false;
  }

  $('dlCard').addEventListener('click', function () {
    if (needUrl()) return;
    renderCard();
    download(el.card.toDataURL('image/png'), 'love-qr-card.png');
  });

  $('dlQr').addEventListener('click', function () {
    if (needUrl()) return;
    var qr = makeQr(el.url.value.trim());
    var cv = document.createElement('canvas');
    // Kích thước = bội số nguyên của số ô → mỗi ô đúng số pixel nguyên, ảnh sắc nét, dễ quét
    var total = qr.getModuleCount() + QUIET * 2, px = total * Math.max(8, Math.floor(1024 / total));
    cv.width = cv.height = px;
    drawQr(cv.getContext('2d'), qr, 0, 0, px, el.fg.value, el.bg.value, el.logo.checked);
    download(cv.toDataURL('image/png'), 'love-qr.png');
  });

  $('dlSvg').addEventListener('click', function () {
    if (needUrl()) return;
    var qr = makeQr(el.url.value.trim());
    var n = qr.getModuleCount(), total = n + QUIET * 2, d = '', r, c;
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + (c + QUIET) + ' ' + (r + QUIET) + 'h1v1h-1z';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" shape-rendering="crispEdges" width="1024" height="1024">' +
      '<rect width="' + total + '" height="' + total + '" fill="' + el.bg.value + '"/>' +
      '<path d="' + d + '" fill="' + el.fg.value + '"/>';
    if (el.logo.checked) {
      var logo = n * LOGO_RATIO, cx = total / 2, k = logo / 64, x0 = cx - logo / 2, y0 = cx - logo / 2 - logo * 0.02;
      svg += '<circle cx="' + cx + '" cy="' + cx + '" r="' + (logo / 2 + logo * 0.16) + '" fill="' + el.bg.value + '"/>' +
        '<path fill="#FF3D81" transform="translate(' + x0 + ' ' + y0 + ') scale(' + k + ')" d="M32 54C6 36 4 20 14 12C22 6 32 10 32 19C32 10 42 6 50 12C60 20 58 36 32 54Z"/>';
    }
    svg += '</svg>';
    var blob = new Blob([svg], { type: 'image/svg+xml' });
    var url = URL.createObjectURL(blob);
    download(url, 'love-qr.svg');
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  refresh();
})();
