/* =====================================================================
 *  scene-manager.js — Điều khiển chuyển cảnh
 * ---------------------------------------------------------------------
 *  Mỗi cảnh là một <section data-scene="tên"> trong index.html.
 *  SceneManager chỉ hiện MỘT cảnh tại một thời điểm (thêm class is-active),
 *  gọi hàm enter/leave đã đăng ký, và quản lý các bộ hẹn giờ (timer) của cảnh
 *  để khi đổi cảnh thì timer cũ tự bị huỷ — tránh lời nhắn "chạy nhầm" sang cảnh sau.
 * ===================================================================== */
(function (global) {
  'use strict';
  var Love = global.Love = global.Love || {};

  class SceneManager {
    constructor(root) {
      this.scenes = {};       // tên → phần tử DOM
      this.hooks = {};        // tên → { enter, leave }
      this.timers = new Set();
      this.current = null;
      var self = this;
      root.querySelectorAll('[data-scene]').forEach(function (el) {
        self.scenes[el.getAttribute('data-scene')] = el;
        el.inert = true;                       // cảnh ẩn không nhận focus / đọc màn hình
        el.setAttribute('aria-hidden', 'true');
      });
    }

    /** Đăng ký hàm chạy khi vào / rời một cảnh */
    on(name, hooks) { this.hooks[name] = hooks; }

    /** Hẹn giờ gắn với cảnh hiện tại; tự huỷ khi chuyển cảnh */
    later(fn, ms) {
      var self = this;
      var id = setTimeout(function () { self.timers.delete(id); fn(); }, ms);
      this.timers.add(id);
      return id;
    }

    clearTimers() {
      this.timers.forEach(function (id) { clearTimeout(id); });
      this.timers.clear();
    }

    /** Chuyển sang cảnh có tên `name` */
    go(name) {
      var next = this.scenes[name];
      if (!next) { console.error('[SceneManager] Không có cảnh: ' + name); return; }
      var prevName = this.current;
      this.clearTimers();

      if (prevName && this.scenes[prevName]) {
        var prev = this.scenes[prevName];
        prev.classList.remove('is-active');
        prev.inert = true;
        prev.setAttribute('aria-hidden', 'true');
        var leave = this.hooks[prevName] && this.hooks[prevName].leave;
        if (leave) { try { leave(); } catch (e) { console.error(e); } }
      }

      this.current = name;
      next.inert = false;
      next.setAttribute('aria-hidden', 'false');
      next.scrollTop = 0;
      // requestAnimationFrame để trình duyệt kịp áp dụng trạng thái ban đầu rồi mới chạy transition
      requestAnimationFrame(function () { next.classList.add('is-active'); });

      var enter = this.hooks[name] && this.hooks[name].enter;
      if (enter) { try { enter(prevName); } catch (e) { console.error(e); } }

      // Đưa focus vào nút chính của cảnh (hỗ trợ bàn phím / trình đọc màn hình)
      var focusTarget = next.querySelector('[data-autofocus]');
      if (focusTarget) { setTimeout(function () { try { focusTarget.focus({ preventScroll: true }); } catch (e) {} }, 400); }
    }
  }

  Love.SceneManager = SceneManager;
})(window);
