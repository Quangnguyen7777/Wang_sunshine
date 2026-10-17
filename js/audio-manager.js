/* =====================================================================
 *  audio-manager.js — Nhạc nền (tuỳ chọn)
 * ---------------------------------------------------------------------
 *  - Ưu tiên phát file nhạc trong config.audio.src (ví dụ assets/audio/music.mp3).
 *  - Nếu file không tồn tại / không tải được và fallbackSynth = true,
 *    tự phát giai điệu nhẹ tạo bằng Web Audio API (không cần file nào).
 *  - Trình duyệt chặn tự phát âm thanh, nên nhạc chỉ bắt đầu SAU khi người dùng
 *    bấm một nút (xem app.js gọi audio.start() trong sự kiện click).
 *  - Trang vẫn chạy bình thường khi không có nhạc.
 * ===================================================================== */
(function (global) {
  'use strict';
  var Love = global.Love = global.Love || {};

  // Hợp âm nền (Hz): C – G – Am – F, mỗi hợp âm kéo dài 1 "ô nhịp"
  var CHORDS = [
    [261.63, 329.63, 392.00],
    [196.00, 246.94, 293.66],
    [220.00, 261.63, 329.63],
    [174.61, 220.00, 261.63]
  ];
  var BAR = 3.2;      // giây mỗi hợp âm
  var STEP = 0.8;     // giây giữa hai nốt rải

  class AudioManager {
    /**
     * @param {object} cfg    config.audio
     * @param {HTMLElement} button  nút bật/tắt nhạc
     */
    constructor(cfg, button) {
      this.cfg = cfg || {};
      this.button = button;
      this.wantOn = false;        // người dùng đang muốn nghe nhạc?
      this.mode = null;           // 'file' | 'synth' | null
      this.fileFailed = false;
      this.el = null;
      this.ctx = null; this.master = null; this.timer = 0; this.nextTime = 0; this.noteIdx = 0;

      if (!this.cfg.enabled) { if (button) button.hidden = true; return; }
      if (button) {
        button.hidden = false;
        var self = this;
        button.addEventListener('click', function () { self.toggle(); });
      }
      this._initFile();
      this._syncButton();
    }

    _initFile() {
      if (!this.cfg.src) { this.fileFailed = true; return; }
      var self = this;
      try {
        this.el = new Audio();
        this.el.loop = true;
        this.el.preload = 'auto';
        this.el.volume = Math.max(0, Math.min(1, this.cfg.volume == null ? 0.45 : this.cfg.volume));
        // Nếu file không tồn tại hoặc định dạng không hỗ trợ → đánh dấu để dùng nhạc dự phòng
        this.el.addEventListener('error', function () {
          self.fileFailed = true;
          if (self.wantOn && self.mode !== 'synth') self._startSynth();
        });
        this.el.src = this.cfg.src;
      } catch (e) {
        this.fileFailed = true;
      }
    }

    /** Bật nhạc (gọi từ sự kiện click của người dùng) */
    start() {
      if (!this.cfg.enabled) return;
      this.wantOn = true;
      this._syncButton();
      if (!this.fileFailed && this.el) {
        var self = this;
        var p = this.el.play();
        if (p && p.then) {
          p.then(function () { self.mode = 'file'; })
           .catch(function () { self.fileFailed = true; self._startSynth(); });
        } else { this.mode = 'file'; }
      } else {
        this._startSynth();
      }
    }

    stop() {
      this.wantOn = false;
      this._syncButton();
      if (this.el) { try { this.el.pause(); } catch (e) {} }
      this._stopSynth();
      this.mode = null;
    }

    toggle() { if (this.wantOn) this.stop(); else this.start(); }

    /** Tạm dừng khi tab bị ẩn, tiếp tục khi quay lại (nếu người dùng đang bật) */
    onVisibility(hidden) {
      if (!this.wantOn) return;
      if (hidden) {
        if (this.el && this.mode === 'file') this.el.pause();
        if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
      } else {
        if (this.el && this.mode === 'file') this.el.play().catch(function () {});
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      }
    }

    _syncButton() {
      if (!this.button) return;
      this.button.setAttribute('aria-pressed', this.wantOn ? 'true' : 'false');
      this.button.setAttribute('aria-label', this.wantOn ? 'Tắt nhạc' : 'Bật nhạc');
    }

    /* ---------- Nhạc dự phòng bằng Web Audio ---------- */

    _startSynth() {
      if (!this.cfg.fallbackSynth || this.mode === 'synth') return;
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      try {
        if (!this.ctx) {
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.master.gain.value = 0;
          // Một nhánh trễ nhẹ để tạo cảm giác vang
          var delay = this.ctx.createDelay(1); delay.delayTime.value = 0.38;
          var fb = this.ctx.createGain(); fb.gain.value = 0.35;
          delay.connect(fb); fb.connect(delay);
          this.master.connect(this.ctx.destination);
          this.master.connect(delay); delay.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        var vol = (this.cfg.volume == null ? 0.45 : this.cfg.volume) * 0.35;
        this.master.gain.cancelScheduledValues(this.ctx.currentTime);
        this.master.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 1.5);
        this.nextTime = this.ctx.currentTime + 0.1;
        this.noteIdx = 0;
        var self = this;
        clearInterval(this.timer);
        this.timer = setInterval(function () { self._schedule(); }, 300);
        this._schedule();
        this.mode = 'synth';
      } catch (e) {
        console.warn('[audio] Không thể bật nhạc dự phòng:', e);
      }
    }

    _stopSynth() {
      clearInterval(this.timer);
      if (this.ctx && this.master) {
        var t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.linearRampToValueAtTime(0, t + 0.5);
      }
    }

    /** Xếp lịch các nốt sắp tới (lookahead 1.2 giây) */
    _schedule() {
      if (!this.ctx) return;
      while (this.nextTime < this.ctx.currentTime + 1.2) {
        var perBar = Math.round(BAR / STEP);                 // số nốt mỗi hợp âm
        var bar = Math.floor(this.noteIdx / perBar) % CHORDS.length;
        var inBar = this.noteIdx % perBar;
        var chord = CHORDS[bar];
        if (inBar === 0) chord.forEach(function (f, i) { this._tone(f / 2, this.nextTime, BAR * 1.1, 'sine', 0.10 / (i + 1)); }, this);  // nền
        var order = [0, 1, 2, 1];
        this._tone(chord[order[inBar % 4]] * 2, this.nextTime, 1.8, 'triangle', 0.16);          // nốt rải
        this.nextTime += STEP;
        this.noteIdx++;
      }
    }

    _tone(freq, when, dur, type, peak) {
      var o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(peak, when + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g); g.connect(this.master);
      o.start(when); o.stop(when + dur + 0.05);
    }
  }

  Love.AudioManager = AudioManager;
})(window);
