(function () {
  'use strict';
  var K_THEME = 'hikari_theme', K_FS = 'hikari_fs';
  var THEMES = { white: '白', cream: 'クリーム', dark: '黒' };
  var META = { white: '#ffffff', cream: '#f6f3ec', dark: '#181c24' };

  function get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function apply() {
    var t = get(K_THEME, 'white');
    if (!THEMES[t]) t = 'white';
    var fs = get(K_FS, 'normal') === 'large' ? 'large' : 'normal';
    var r = document.documentElement;
    r.setAttribute('data-theme', t);
    r.setAttribute('data-fs', fs);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', META[t]);
    return { theme: t, fs: fs };
  }

  function opts(list, cur, key) {
    return '<div class="opts" data-k="' + key + '">' + list.map(function (o) {
      return '<button type="button" class="opt' + (o[0] === cur ? ' on' : '') + '" data-v="' + o[0] + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function mount(el) {
    if (!el) return;
    function draw() {
      var s = apply();
      el.innerHTML = '<div class="prefs"><div class="pl">背景の色</div>' +
        opts([['white', '白'], ['cream', 'クリーム'], ['dark', '黒']], s.theme, 'theme') +
        '<div class="pl">文字の大きさ</div>' +
        opts([['normal', '標準'], ['large', '大']], s.fs, 'fs') + '</div>';
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest('.opt');
      if (!b) return;
      var k = b.parentNode.getAttribute('data-k');
      set(k === 'theme' ? K_THEME : K_FS, b.getAttribute('data-v'));
      draw();
    });
    draw();
  }

  apply();
  document.addEventListener('DOMContentLoaded', apply);
  window.hikariPrefs = { mount: mount, apply: apply };
})();
