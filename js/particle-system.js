/* =====================================================================
 *  particle-system.js — TRÁI TIM HẠT SÁNG vẽ bằng HTML5 Canvas 2D
 * ---------------------------------------------------------------------
 *  Lớp chính: Love.HeartStage. Nó vẽ cả: ngôi sao nền, trái tim hạt sáng,
 *  vòng chữ xoay, trái tim nhỏ bay lên và pháo giấy.
 *
 *  THUẬT TOÁN TRÁI TIM (đọc phần này nếu muốn hiểu cách các hạt thành hình tim)
 *  1) Đường viền trái tim theo phương trình toán học, với t chạy từ 0 → 2π:
 *         x = 16·sin³(t)
 *         y = 13·cos(t) − 5·cos(2t) − 2·cos(3t) − cos(4t)
 *     Chia cho 17 để đưa về khoảng [-1, 1]; trừ đi tâm theo trục y để trái tim
 *     nằm cân giữa gốc toạ độ (0,0).
 *  2) Mỗi hạt chọn ngẫu nhiên một góc t → một điểm P trên viền.
 *     - ~62% hạt nằm sát viền: nhân P với hệ số k ≈ 0.84…1 (tạo viền dày, lấp lánh).
 *     - ~38% hạt nằm bên trong: nhân P với k = 0.84·√(ngẫu nhiên) (phân bố đều bên trong).
 *     Vì trái tim là hình "toả tròn" quanh tâm nên co P về tâm vẫn nằm trong trái tim.
 *  3) Mỗi hạt có thêm độ sâu z (±0.3). Cả trái tim xoay nhẹ quanh trục dọc,
 *     hạt gần camera to & sáng hơn, hạt xa nhỏ & mờ hơn  → cảm giác 3D.
 *  4) Toạ độ chuẩn hoá được nhân với bán kính R (px) rồi cộng vào tâm màn hình
 *     để ra vị trí vẽ trên canvas. R tự co giãn theo kích thước màn hình.
 *  5) Hội tụ: lúc bắt đầu mỗi hạt ở vị trí ngẫu nhiên xa tâm, rồi bay về đích với
 *     easeOutCubic và độ trễ riêng, nên trái tim hiện dần chứ không bật ra đột ngột.
 *  6) Nhịp đập: R nhân thêm (1 + 0.05·beat) với beat là hai xung "lub-dub".
 *
 *  HIỆU NĂNG: dữ liệu hạt lưu trong Float32Array và tính trước một lần; mỗi khung
 *  hình chỉ tính toán đơn giản + drawImage từ sprite phát sáng vẽ sẵn (không tạo
 *  đối tượng mới trong vòng lặp). Nếu máy chậm sẽ tự giảm số hạt.
 * ===================================================================== */
(function (global) {
  'use strict';
  var Love = global.Love = global.Love || {};

  var TAU = Math.PI * 2;

  /* ---------- Hàm tiện ích ---------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) { var u = 1 - t; return 1 - u * u * u; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function bump(x, center, width) { var d = (x - center) / width; return Math.exp(-d * d); }

  /* ---------- Phương trình trái tim (đã chuẩn hoá) ---------- */
  var HEART = (function () {
    var minY = Infinity, maxY = -Infinity, i, t, y;
    for (i = 0; i <= 360; i++) {
      t = (i / 360) * TAU;
      y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    var midY = (minY + maxY) / 2;
    return {
      /** Điểm trên viền trái tim, trục y hướng LÊN, nằm trong khoảng ~[-0.85, 0.85] */
      point: function (t, out) {
        out[0] = (16 * Math.pow(Math.sin(t), 3)) / 17;
        out[1] = ((13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) - midY) / 17;
      },
      bottom: (minY - midY) / 17     // toạ độ y của đỉnh nhọn phía dưới (âm)
    };
  })();

  /* Đa giác xấp xỉ viền trái tim — dùng để lấy mẫu ĐỀU các điểm bên trong (phương pháp loại trừ) */
  var POLY = (function () {
    var pts = [], p = [0, 0], i;
    for (i = 0; i < 180; i++) { HEART.point((i / 180) * TAU, p); pts.push([p[0], p[1]]); }
    return pts;
  })();
  function insideHeart(x, y) {
    var inside = false, i, j = POLY.length - 1, a, b;
    for (i = 0; i < POLY.length; i++) {
      a = POLY[i]; b = POLY[j];
      if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) inside = !inside;
      j = i;
    }
    return inside;
  }

  /* ---------- Sprite phát sáng vẽ sẵn (tránh tạo gradient mỗi khung hình) ---------- */
  function makeGlowSprite(color) {
    var s = 48, c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, color);
    grad.addColorStop(0.55, color + '55');   // màu + độ trong suốt ~33%
    grad.addColorStop(1, color + '00');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    return c;
  }

  function makeHeartSprite(color) {
    var s = 64, c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    g.shadowColor = color;
    g.shadowBlur = 8;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(32, 54);
    g.bezierCurveTo(6, 36, 4, 20, 14, 12);
    g.bezierCurveTo(22, 6, 32, 10, 32, 19);
    g.bezierCurveTo(32, 10, 42, 6, 50, 12);
    g.bezierCurveTo(60, 20, 58, 36, 32, 54);
    g.fill();
    return c;
  }

  /* Chuẩn hoá mã màu về dạng #RRGGBB (6 ký tự) để nối thêm độ trong suốt */
  function normHex(c) {
    c = String(c).trim();
    if (/^#[0-9a-f]{3}$/i.test(c)) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    return /^#[0-9a-f]{6}$/i.test(c) ? c : '#FF5FA2';
  }

  /* Các "góc nhìn" của trái tim theo từng cảnh: tỉ lệ, vị trí tâm (0..1), độ trong */
  var VIEWS = {
    hidden: { scale: 1,    cx: 0.5, cy: 0.42, alpha: 0 },
    heart:  { scale: 1,    cx: 0.5, cy: 0.47, alpha: 1 },
    letter: { scale: 0.55, cx: 0.5, cy: 0.5,  alpha: 0.22 },
    yes:    { scale: 1.08, cx: 0.5, cy: 0.38, alpha: 1 },
    end:    { scale: 0.6,  cx: 0.5, cy: 0.36, alpha: 0.95 }
  };

  /* ===================================================================
   *  HeartStage
   * =================================================================== */
  class HeartStage {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object} opts  { heart: config.heart, level: 'LOW'|'MEDIUM'|'HIGH',
     *                         autoDowngrade: bool, reducedMotion: bool }
     */
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      if (!this.ctx) throw new Error('Trình duyệt không hỗ trợ Canvas 2D');
      this.cfg = opts.heart;
      this.level = opts.level;
      this.autoDowngrade = !!opts.autoDowngrade;
      this.reduced = !!opts.reducedMotion;

      this.time = 0;              // đồng hồ riêng (giây), không nhảy cóc khi tab bị ẩn
      this.formStart = null;      // thời điểm bắt đầu hội tụ (null = chưa bắt đầu)
      this.formDuration = 4.2;
      this.view = Object.assign({}, VIEWS.hidden);
      this.viewTarget = VIEWS.hidden;
      this.ringAlpha = 0; this.ringTarget = 0; this.ringText = ''; this.ringChars = [];
      this.explode = 0;           // 0..1 : sức "nổ" của hạt khi bấm SAY YES
      this.shock = -1;            // sóng xung kích (tiến trình 0..1, -1 = tắt)
      this.calm = false;
      this.running = false;
      this.raf = 0;
      this.lastTs = 0;
      this.fpsAcc = 0; this.fpsFrames = 0; this.downgrades = 0;
      this.riserTimer = 0;

      // Sprite theo màu
      this.colors = this._pickColors(this.cfg.particleColors);
      this.glowSprites = this.colors.map(function (c) { return makeGlowSprite(normHex(c.color)); });
      this.heartSprites = ['#FF5FA2', '#FFB7D5', '#8B5CF6', '#FFFFFF'].map(makeHeartSprite);

      this._buildParticles();
      this._buildStars();
      this._buildPools();
      this.setLevel(this.level);

      this._onVisibility = this._onVisibility.bind(this);
      this._frame = this._frame.bind(this);
      document.addEventListener('visibilitychange', this._onVisibility);
    }

    /* ---------------- Khởi tạo dữ liệu ---------------- */

    _pickColors(list) {
      // Trả về danh sách {color, cum} để chọn ngẫu nhiên theo trọng số
      var total = 0, out = [];
      (list && list.length ? list : [{ color: '#FF5FA2', weight: 1 }]).forEach(function (c) {
        total += Math.max(0.01, c.weight || 1);
        out.push({ color: c.color, cum: total });
      });
      out.total = total;
      return out;
    }

    _buildParticles() {
      var max = Math.max(this.cfg.particleCount.LOW, this.cfg.particleCount.MEDIUM, this.cfg.particleCount.HIGH);
      this.maxCount = max;
      var F = Float32Array;
      this.tx = new F(max); this.ty = new F(max); this.tz = new F(max);     // đích (đã chuẩn hoá)
      this.sx = new F(max); this.sy = new F(max);                           // vị trí xuất phát
      this.sz = new F(max); this.al = new F(max);                           // kích thước, độ sáng
      this.ph = new F(max); this.sp = new F(max);                           // pha & tốc độ dao động
      this.dl = new F(max); this.du = new F(max);                           // độ trễ & thời lượng hội tụ
      this.es = new F(max); this.ex = new F(max);                           // biên độ "thoát ly", hệ số nổ
      this.ci = new Uint8Array(max);                                        // chỉ số màu

      var p = [0, 0], i, k, r, a, rnd, c, j;
      for (i = 0; i < max; i++) {
        if (Math.random() < 0.55) {
          // Hạt sát viền: lấy điểm trên đường cong rồi co nhẹ về tâm (k ≈ 0.88…1) → viền dày, sáng
          HEART.point(Math.random() * TAU, p);
          k = 1 - Math.pow(Math.random(), 2) * 0.12;
          this.tx[i] = p[0] * k + (Math.random() - 0.5) * 0.018;
          this.ty[i] = p[1] * k + (Math.random() - 0.5) * 0.018;
        } else {
          // Hạt bên trong: lấy ngẫu nhiên trong hình chữ nhật bao rồi chỉ giữ điểm nằm TRONG trái tim
          do { p[0] = rand(-0.95, 0.95); p[1] = rand(-0.86, 0.86); } while (!insideHeart(p[0], p[1]));
          this.tx[i] = p[0]; this.ty[i] = p[1];
          k = 0.9;
        }
        this.tz[i] = (Math.random() * 2 - 1) * 0.3 * (1 - k * 0.35);

        a = Math.random() * TAU; r = rand(1.2, 3.2);
        this.sx[i] = Math.cos(a) * r; this.sy[i] = Math.sin(a) * r;

        this.sz[i] = rand(0.45, 1.5);
        this.al[i] = rand(0.5, 1);
        this.ph[i] = Math.random() * TAU;
        this.sp[i] = rand(0.6, 1.8);
        this.dl[i] = Math.random() * 0.45;                   // 0..45% tổng thời gian
        this.du[i] = rand(0.5, 0.55);
        this.es[i] = Math.random() < 0.1 ? rand(0.06, 0.16) : 0;   // 10% hạt thỉnh thoảng bay ra rồi quay lại
        this.ex[i] = rand(0.4, 1.4);

        rnd = Math.random() * this.colors.total;
        c = 0;
        for (j = 0; j < this.colors.length; j++) { if (rnd <= this.colors[j].cum) { c = j; break; } }
        this.ci[i] = c;
      }
    }

    _buildStars() {
      var n = 200;
      this.starX = new Float32Array(n); this.starY = new Float32Array(n);
      this.starS = new Float32Array(n); this.starP = new Float32Array(n); this.starV = new Float32Array(n);
      for (var i = 0; i < n; i++) {
        this.starX[i] = Math.random(); this.starY[i] = Math.random();
        this.starS[i] = rand(0.6, 1.7); this.starP[i] = Math.random() * TAU; this.starV[i] = rand(0.4, 1.6);
      }
    }

    _buildPools() {
      // Trái tim nhỏ bay lên
      this.risers = [];
      for (var i = 0; i < 22; i++) this.risers.push({ on: false, x: 0, y: 0, vy: 0, ph: 0, size: 0, age: 0, life: 1, spr: 0 });
      // Pháo giấy
      this.confetti = [];
      for (i = 0; i < 220; i++) this.confetti.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, size: 0, age: 0, life: 1, col: '#fff', heart: false, spr: 0 });
    }

    /* ---------------- Điều khiển công khai ---------------- */

    /** Đổi mức hiệu năng: LOW | MEDIUM | HIGH */
    setLevel(level) {
      if (!this.cfg.particleCount[level]) level = 'MEDIUM';
      this.level = level;
      this.count = Math.min(this.maxCount, this.cfg.particleCount[level]);
      this.starCountActive = Math.min(200, this.cfg.starCount[level]);
      this.dprCap = this.cfg.pixelRatioCap[level];
      if (this.w) this.resize();
    }

    /** Thay đổi kích thước canvas theo cửa sổ (gọi khi resize / xoay màn hình) */
    resize() {
      var dpr = Math.min(global.devicePixelRatio || 1, this.dprCap || 1.5);
      var w = this.canvas.clientWidth || global.innerWidth;
      var h = this.canvas.clientHeight || global.innerHeight;
      this.w = w; this.h = h; this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /** Bắt đầu cho các hạt hội tụ thành trái tim */
    form(durationMs) {
      this.formDuration = (durationMs || 4200) / 1000;
      this.formStart = this.reduced ? this.time - this.formDuration * 2 : this.time;
    }

    /** Quay lại trạng thái chưa có trái tim (khi "Xem lại từ đầu") */
    reset() {
      this.formStart = null;
      this.explode = 0; this.shock = -1;
      this.ringTarget = 0;
      this.confetti.forEach(function (c) { c.on = false; });
      this.risers.forEach(function (c) { c.on = false; });
      this.setView('hidden');
      this.view = Object.assign({}, VIEWS.hidden);
    }

    setView(name) { this.viewTarget = VIEWS[name] || VIEWS.heart; }
    setCalm(v) { this.calm = !!v; }

    /** Đặt dòng chữ xoay thành vòng; text rỗng = tắt */
    setRing(text, visible) {
      if (typeof text === 'string' && text !== this.ringText) {
        this.ringText = text;
        var s = text;
        while (s.length > 0 && s.length < 56) s += text;   // lặp cho đủ vòng
        this.ringChars = Array.from(s);
      }
      this.ringTarget = (visible && this.ringChars.length) ? 1 : 0;
    }

    /** Hiệu ứng "bùng nổ" khi bấm SAY YES: hạt nở ra, sóng xung kích, pháo giấy */
    burst() {
      if (this.reduced) return;
      this.explode = 1;
      this.shock = 0;
      var cx = this.w * this.view.cx, cy = this.h * this.viewTarget.cy;
      this._spawnConfetti(cx, cy, Math.min(this.confetti.length, this.level === 'LOW' ? 90 : 200));
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.lastTs = 0;
      this.raf = requestAnimationFrame(this._frame);
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }

    /** Giải phóng listener khi không dùng nữa */
    destroy() {
      this.stop();
      document.removeEventListener('visibilitychange', this._onVisibility);
    }

    /* ---------------- Vòng lặp ---------------- */

    _onVisibility() {
      // Tab bị ẩn → dừng vẽ cho đỡ tốn pin; hiện lại → chạy tiếp
      if (document.hidden) { cancelAnimationFrame(this.raf); }
      else if (this.running) { this.lastTs = 0; this.raf = requestAnimationFrame(this._frame); }
    }

    _frame(ts) {
      if (!this.running) return;
      this.raf = requestAnimationFrame(this._frame);
      var dt = this.lastTs ? (ts - this.lastTs) / 1000 : 0.016;
      this.lastTs = ts;
      dt = Math.min(dt, 0.05);                 // chặn bước thời gian quá lớn
      this._watchFps(dt);
      this.time += dt * (this.cfg.speed || 1) * (this.calm ? 0.45 : 1);
      this._update(dt);
      this._draw();
    }

    /** Theo dõi FPS: nếu máy yếu thì tự giảm số hạt (tối đa 3 lần) */
    _watchFps(dt) {
      if (!this.autoDowngrade) return;
      this.fpsAcc += dt; this.fpsFrames++;
      if (this.fpsAcc >= 2) {
        var fps = this.fpsFrames / this.fpsAcc;
        this.fpsAcc = 0; this.fpsFrames = 0;
        if (fps < 38 && this.downgrades < 3 && this.formStart !== null) {
          this.downgrades++;
          this.count = Math.max(300, Math.floor(this.count * 0.7));
          this.starCountActive = Math.max(40, Math.floor(this.starCountActive * 0.7));
          if (this.dpr > 1) { this.dprCap = 1; this.resize(); }
        }
      }
    }

    _update(dt) {
      // Làm mượt góc nhìn (lerp theo hàm mũ → không phụ thuộc FPS)
      var k = 1 - Math.exp(-dt * 3), v = this.view, t = this.viewTarget;
      v.scale = lerp(v.scale, t.scale, k); v.cx = lerp(v.cx, t.cx, k);
      v.cy = lerp(v.cy, t.cy, k); v.alpha = lerp(v.alpha, t.alpha, k);
      this.ringAlpha = lerp(this.ringAlpha, this.ringTarget, 1 - Math.exp(-dt * 2));

      if (this.explode > 0) this.explode = Math.max(0, this.explode - dt * 0.55);
      if (this.shock >= 0) { this.shock += dt * 0.9; if (this.shock > 1) this.shock = -1; }

      var i, c;
      // Pháo giấy: trọng lực + lực cản
      for (i = 0; i < this.confetti.length; i++) {
        c = this.confetti[i];
        if (!c.on) continue;
        c.age += dt;
        if (c.age >= c.life) { c.on = false; continue; }
        c.vy += 520 * dt; c.vx *= (1 - 0.9 * dt); c.vy *= (1 - 0.5 * dt);
        c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
      }

      // Trái tim nhỏ bay lên (chỉ khi trái tim đã hình thành)
      if (!this.reduced && this.formStart !== null && this.view.alpha > 0.5) {
        this.riserTimer -= dt;
        if (this.riserTimer <= 0) { this.riserTimer = rand(0.35, 0.8); this._spawnRiser(); }
      }
      for (i = 0; i < this.risers.length; i++) {
        c = this.risers[i];
        if (!c.on) continue;
        c.age += dt;
        if (c.age >= c.life) { c.on = false; continue; }
        c.y += c.vy * dt;
      }
    }

    _spawnRiser() {
      for (var i = 0; i < this.risers.length; i++) {
        var r = this.risers[i];
        if (r.on) continue;
        var p = [0, 0], R = this._radius();
        HEART.point(Math.random() * TAU, p);
        r.on = true; r.age = 0; r.life = rand(3, 5.5);
        r.x = this.w * this.view.cx + p[0] * R * 1.05;
        r.y = this.h * this.view.cy - p[1] * R * 1.05;
        r.vy = -rand(14, 34) * (R / 180);
        r.ph = Math.random() * TAU;
        r.size = rand(7, 14) * clamp(R / 200, 0.7, 1.3);
        r.spr = (Math.random() * this.heartSprites.length) | 0;
        return;
      }
    }

    _spawnConfetti(cx, cy, n) {
      var palette = ['#FF5FA2', '#FFB7D5', '#8B5CF6', '#FFFFFF', '#FF3D81'];
      var spawned = 0;
      for (var i = 0; i < this.confetti.length && spawned < n; i++) {
        var c = this.confetti[i];
        if (c.on) continue;
        var a = Math.random() * TAU, sp = rand(120, 620);
        c.on = true; c.age = 0; c.life = rand(2.4, 4.2);
        c.x = cx; c.y = cy;
        c.vx = Math.cos(a) * sp; c.vy = Math.sin(a) * sp - 220;
        c.rot = Math.random() * TAU; c.vr = rand(-8, 8);
        c.size = rand(5, 10);
        c.col = palette[(Math.random() * palette.length) | 0];
        c.heart = Math.random() < 0.3;
        c.spr = (Math.random() * this.heartSprites.length) | 0;
        spawned++;
      }
    }

    /** Bán kính R (px) của trái tim theo kích thước màn hình hiện tại */
    _radius() {
      return Math.min(this.w * 0.42, this.h * 0.28) * (this.cfg.sizeScale || 1) * this.view.scale;
    }

    /** Hàm nhịp tim "lub-dub": hai xung Gauss trong mỗi chu kỳ */
    _beat() {
      if (this.reduced) return 0;
      var period = 60 / (this.cfg.beatsPerMinute || 48);
      var c = (this.time % period) / period;
      return bump(c, 0.10, 0.07) + 0.6 * bump(c, 0.32, 0.09);
    }

    /* ---------------- Vẽ ---------------- */

    _draw() {
      var ctx = this.ctx, w = this.w, h = this.h, time = this.time, i;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';           // cộng sáng → hiệu ứng phát sáng

      this._drawStars(ctx, w, h, time);

      var vis = this.view.alpha;
      if (this.formStart !== null && vis > 0.01) {
        this._drawHeart(ctx, time, vis);
        if (this.ringAlpha > 0.01) this._drawRing(ctx, time, vis);
      }
      this._drawRisers(ctx);
      this._drawShock(ctx);
      this._drawConfetti(ctx);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    _drawStars(ctx, w, h, time) {
      ctx.fillStyle = '#FFFFFF';
      var n = this.starCountActive, tw;
      for (var i = 0; i < n; i++) {
        tw = this.reduced ? 0.6 : 0.5 + 0.5 * Math.sin(time * this.starV[i] + this.starP[i]);
        ctx.globalAlpha = 0.15 + 0.7 * tw;
        ctx.fillRect(this.starX[i] * w, this.starY[i] * h, this.starS[i], this.starS[i]);
      }
    }

    _drawHeart(ctx, time, vis) {
      var R = this._radius();
      var Rp = R * (1 + (this.calm ? 0.03 : 0.05) * this._beat());     // R có nhịp đập
      var cx = this.w * this.view.cx, cy = this.h * this.view.cy;
      var ang = this.reduced ? 0 : Math.sin(time * 0.35) * 0.5;        // xoay ±0.5 rad quanh trục dọc
      var cosA = Math.cos(ang), sinA = Math.sin(ang);
      var sizeK = clamp(R / 180, 0.7, 1.6) * (this.cfg.particleSize || 1);
      var glow = this.cfg.glow || 1;
      var wander = this.reduced ? 0 : 0.008;
      var explode = this.explode, expK = explode * explode;
      var form = this.formStart, dur = this.formDuration;
      var n = this.count, i, p, e, x, y, z, rx, rz, persp, wx, wy, ds, a, X, Y, s, eo;

      for (i = 0; i < n; i++) {
        p = (time - form - this.dl[i] * dur) / (this.du[i] * dur + 0.001);
        if (p <= 0) continue;
        if (p > 1) p = 1;
        e = easeOutCubic(p);

        x = this.tx[i]; y = this.ty[i]; z = this.tz[i];
        rx = x * cosA + z * sinA;                       // xoay quanh trục dọc
        rz = -x * sinA + z * cosA;
        persp = 1 / (1 - rz * 0.55);                    // phối cảnh đơn giản

        wx = 0; wy = 0;
        if (wander) {                                    // dao động nhẹ quanh vị trí đích
          wx = Math.sin(time * this.sp[i] + this.ph[i]) * wander;
          wy = Math.cos(time * this.sp[i] * 0.9 + this.ph[i] * 1.3) * wander;
        }
        eo = this.es[i];
        if (eo > 0 && !this.reduced) {                   // hạt "thoát ly": bay ra khỏi viền rồi quay về
          s = Math.sin(time * 0.7 + this.ph[i] * 3);
          if (s > 0) { s = eo * s * s * s; wx += x * s; wy += y * s; }
        }
        if (expK > 0) {                                  // nổ khi bấm SAY YES
          s = expK * this.ex[i] * 0.9; wx += x * s; wy += y * s;
        }

        X = cx + lerp(this.sx[i] * R, (rx + wx) * Rp * persp, e);
        Y = cy + lerp(this.sy[i] * R, -(y + wy) * Rp * persp, e);

        ds = (3.6 + this.sz[i] * 4.8) * sizeK * persp;
        a = this.al[i] * (0.55 + 0.45 * persp) * glow * vis * Math.min(1, p * 2.5);
        if (!this.reduced) a *= 0.82 + 0.18 * Math.sin(time * 2 + this.ph[i] * 5);   // lấp lánh nhẹ
        if (a < 0.02) continue;
        ctx.globalAlpha = a > 1 ? 1 : a;
        ctx.drawImage(this.glowSprites[this.ci[i]], X - ds / 2, Y - ds / 2, ds, ds);
      }
    }

    /** Vòng chữ xoay dưới trái tim (elip giả lập phối cảnh) */
    _drawRing(ctx, time, vis) {
      var chars = this.ringChars, n = chars.length, R = this._radius();
      var cx = this.w * this.view.cx;
      var rx = Math.min(R * 1.35, this.w * 0.46), ry = rx * 0.17;
      var cy = this.h * this.view.cy - HEART.bottom * R + ry * 0.4;
      var fs = clamp(R * 0.085, 12, 19);
      var base = this.reduced ? 0 : time * 0.22;
      var step = TAU / n, i, a, sa, depth, x, y;
      ctx.font = fs + 'px system-ui, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFE3F0';
      for (i = 0; i < n; i++) {
        a = base + i * step;
        sa = Math.sin(a);
        depth = (sa + 1) / 2;                          // 0 = phía sau, 1 = phía trước
        x = cx - Math.cos(a) * rx;          // dấu trừ: mặt trước vòng chữ đọc được từ trái sang phải
        y = cy + sa * ry;
        ctx.globalAlpha = (0.15 + 0.75 * depth) * this.ringAlpha * vis;
        ctx.fillText(chars[i], x, y);
      }
    }

    _drawRisers(ctx) {
      var i, r, t, a;
      for (i = 0; i < this.risers.length; i++) {
        r = this.risers[i];
        if (!r.on) continue;
        t = r.age / r.life;
        a = Math.sin(Math.PI * t) * 0.85;
        ctx.globalAlpha = a;
        ctx.drawImage(this.heartSprites[r.spr], r.x + Math.sin(r.age * 1.3 + r.ph) * 10 - r.size / 2, r.y - r.size / 2, r.size, r.size);
      }
    }

    _drawShock(ctx) {
      if (this.shock < 0) return;
      var R = this._radius(), t = easeOutCubic(this.shock);
      ctx.globalAlpha = (1 - this.shock) * 0.7;
      ctx.strokeStyle = '#FF8FC0';
      ctx.lineWidth = 3 * (1 - this.shock) + 0.5;
      ctx.beginPath();
      ctx.arc(this.w * this.view.cx, this.h * this.view.cy, R * (0.5 + t * 1.5), 0, TAU);
      ctx.stroke();
    }

    _drawConfetti(ctx) {
      var i, c, a;
      for (i = 0; i < this.confetti.length; i++) {
        c = this.confetti[i];
        if (!c.on) continue;
        a = 1 - Math.pow(c.age / c.life, 3);
        ctx.globalAlpha = a;
        if (c.heart) {
          ctx.drawImage(this.heartSprites[c.spr], c.x - c.size, c.y - c.size, c.size * 2, c.size * 2);
        } else {
          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.rotate(c.rot);
          ctx.fillStyle = c.col;
          ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
          ctx.restore();
        }
      }
    }
  }

  Love.HeartStage = HeartStage;

  /** Tự nhận biết mức hiệu năng phù hợp với thiết bị */
  Love.detectPerformanceLevel = function () {
    var mem = navigator.deviceMemory || 4;
    var cores = navigator.hardwareConcurrency || 4;
    var small = Math.min(global.screen.width, global.screen.height) < 500;
    if (mem <= 2 || cores <= 2) return 'LOW';
    if (small || mem <= 4 || cores <= 4) return 'MEDIUM';
    return 'HIGH';
  };

})(window);
