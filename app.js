(function () {
  'use strict';

  var KEY = 'hikari_v1';
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  var MAX_SEKO = 9999;
  var MAX_JUKO = 1440; // 1日は1440分

  function $(s) { return document.querySelector(s); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  // ---------- データ ----------
  var data = load();
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { toast('保存できませんでした'); }
  }
  function rec(k) {
    var r = data[k];
    return { seko: (r && r.seko) || 0, juko: (r && r.juko != null) ? r.juko : null };
  }
  function setRec(k, r) {
    if (!r.seko && r.juko == null) delete data[k];
    else data[k] = { seko: r.seko || 0, juko: r.juko };
    persist();
  }
  function clampInt(v, max) {
    v = parseInt(v, 10);
    if (isNaN(v) || v < 0) v = 0;
    return Math.min(v, max);
  }
  function fmtMin(m) {
    if (m == null) return '—';
    var h = Math.floor(m / 60), mm = m % 60;
    if (h && mm) return h + '時間' + mm + '分';
    if (h) return h + '時間';
    return mm + '分';
  }
  function shortMin(m) { return Math.floor(m / 60) + ':' + pad(m % 60); }

  function sumRange(filter) {
    var seko = 0, juko = 0, jd = 0, sd = 0;
    for (var k in data) {
      if (!filter(k)) continue;
      var r = data[k];
      if (r.seko) { seko += r.seko; sd++; }
      if (r.juko) { juko += r.juko; jd++; }
    }
    return { seko: seko, juko: juko, jd: jd, sd: sd };
  }
  function statHtml(label, value, cls) {
    return '<div class="stat"><div class="l">' + label + '</div><div class="v ' + (cls || '') + '">' + value + '</div></div>';
  }
  function statsBlock(s) {
    return statHtml('施光 合計', s.seko + '回', 'g') +
           statHtml('受光 合計', fmtMin(s.juko || 0), 'b') +
           statHtml('受光した日数', s.jd + '日') +
           statHtml('施光 1日平均', s.sd ? (s.seko / s.sd).toFixed(1) + '回' : '—');
  }

  // ---------- トースト ----------
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  // ---------- ホーム ----------
  var todayKey = keyOf(new Date());

  function renderHome() {
    var d = new Date();
    todayKey = keyOf(d);
    $('#todayLabel').textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日(' + WD[d.getDay()] + ')';
    var r = rec(todayKey);
    if (document.activeElement !== $('#sekoInput')) $('#sekoInput').value = r.seko;
    $('#jukoState').innerHTML = r.juko == null
      ? '<span class="pill off">本日は未記録</span>'
      : '<span class="pill on">記録済み:' + fmtMin(r.juko) + '</span>';
    if (document.activeElement !== $('#jukoInput')) $('#jukoInput').value = r.juko == null ? '' : r.juko;
    updateJukoPreview();
    var prefix = todayKey.slice(0, 8);
    $('#homeStats').innerHTML = statsBlock(sumRange(function (k) { return k.indexOf(prefix) === 0; }));
  }
  function updateJukoPreview() {
    var v = $('#jukoInput').value;
    $('#jukoPreview').textContent = v === '' ? '' : '＝ ' + fmtMin(clampInt(v, MAX_JUKO));
  }
  function changeSeko(delta) {
    var r = rec(todayKey);
    r.seko = Math.max(0, Math.min(MAX_SEKO, r.seko + delta));
    setRec(todayKey, r);
    renderHome();
  }

  $('#sekoPlus').addEventListener('click', function () {
    changeSeko(1);
    if (navigator.vibrate) navigator.vibrate(15);
  });
  $('#sekoMinus').addEventListener('click', function () { changeSeko(-1); });
  $('#sekoInput').addEventListener('change', function () {
    var r = rec(todayKey);
    r.seko = clampInt(this.value, MAX_SEKO);
    setRec(todayKey, r);
    renderHome();
  });
  $('#sekoInput').addEventListener('focus', function () { this.select(); });

  $('#jukoInput').addEventListener('input', updateJukoPreview);
  Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (b) {
    b.addEventListener('click', function () {
      var cur = clampInt($('#jukoInput').value, MAX_JUKO);
      $('#jukoInput').value = Math.min(MAX_JUKO, cur + parseInt(b.getAttribute('data-add'), 10));
      updateJukoPreview();
    });
  });
  $('#jukoSave').addEventListener('click', function () {
    var v = clampInt($('#jukoInput').value, MAX_JUKO);
    if (v < 1) { toast('受光した分数を入力してください'); return; }
    var r = rec(todayKey);
    r.juko = v;
    setRec(todayKey, r);
    $('#jukoInput').blur();
    renderHome();
    toast('受光 ' + fmtMin(v) + ' を記録しました');
  });
  $('#jukoClear').addEventListener('click', function () {
    var r = rec(todayKey);
    if (r.juko == null) { toast('今日の受光は未記録です'); return; }
    if (!confirm('今日の受光記録を消しますか?')) return;
    r.juko = null;
    setRec(todayKey, r);
    $('#jukoInput').value = '';
    renderHome();
  });

  // ---------- 実績 ----------
  var now0 = new Date();
  var viewY = now0.getFullYear(), viewM = now0.getMonth();

  function renderHistory() {
    var y = viewY, m = viewM;
    var prefix = y + '-' + pad(m + 1) + '-';
    $('#monthLabel').textContent = y + '年' + (m + 1) + '月';
    var cur = new Date();
    $('#nextMonth').disabled = (y > cur.getFullYear()) || (y === cur.getFullYear() && m >= cur.getMonth());

    $('#monthStats').innerHTML = statsBlock(sumRange(function (k) { return k.indexOf(prefix) === 0; }));
    $('#allStats').innerHTML = statsBlock(sumRange(function () { return true; }));
    updateSendInfo();

    var first = new Date(y, m, 1).getDay();
    var days = new Date(y, m + 1, 0).getDate();
    var html = WD.map(function (w, i) {
      return '<div class="wd ' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + w + '</div>';
    }).join('');
    for (var i = 0; i < first; i++) html += '<div class="cell empty"></div>';
    for (var d = 1; d <= days; d++) {
      var k = prefix + pad(d);
      var r = data[k];
      var future = k > todayKey;
      html += '<button class="cell' + (k === todayKey ? ' today' : '') + '" data-k="' + k + '"' + (future ? ' disabled' : '') + '>' +
        '<span class="dn">' + d + '</span>' +
        (r && r.seko ? '<span class="s">' + r.seko + '</span>' : '') +
        (r && r.juko ? '<span class="j">' + shortMin(r.juko) + '</span>' : '') +
        '</button>';
    }
    $('#calendar').innerHTML = html;

    // 週別(日曜はじまり)
    var weeks = [], w = null;
    for (var dd = 1; dd <= days; dd++) {
      var dow = new Date(y, m, dd).getDay();
      if (!w || dow === 0) { w = { from: dd, to: dd, seko: 0, juko: 0, jd: 0 }; weeks.push(w); }
      w.to = dd;
      var rr = data[prefix + pad(dd)];
      if (rr) {
        if (rr.seko) w.seko += rr.seko;
        if (rr.juko) { w.juko += rr.juko; w.jd++; }
      }
    }
    $('#weeks').innerHTML = weeks.map(function (x) {
      return '<div class="week"><div>' + (m + 1) + '/' + x.from + ' 〜 ' + (m + 1) + '/' + x.to + '</div>' +
        '<div class="r"><span class="s">' + x.seko + '回</span>　<span class="j">' + fmtMin(x.juko) + '(' + x.jd + '日)</span></div></div>';
    }).join('');
  }

  $('#prevMonth').addEventListener('click', function () {
    viewM--; if (viewM < 0) { viewM = 11; viewY--; }
    renderHistory();
  });
  $('#nextMonth').addEventListener('click', function () {
    viewM++; if (viewM > 11) { viewM = 0; viewY++; }
    renderHistory();
  });
  $('#calendar').addEventListener('click', function (e) {
    var b = e.target.closest('.cell[data-k]');
    if (b && !b.disabled) openEdit(b.getAttribute('data-k'));
  });

  // ---------- 過去日の編集 ----------
  var editKey = null;
  function openEdit(k) {
    editKey = k;
    var p = k.split('-');
    var dt = new Date(+p[0], +p[1] - 1, +p[2]);
    $('#dlgTitle').textContent = p[0] + '年' + (+p[1]) + '月' + (+p[2]) + '日(' + WD[dt.getDay()] + ')';
    var r = rec(k);
    $('#dlgSeko').value = r.seko;
    $('#dlgJuko').value = r.juko == null ? '' : r.juko;
    updateDlgPreview();
    $('#dlg').showModal();
  }
  function updateDlgPreview() {
    var v = $('#dlgJuko').value;
    $('#dlgPreview').textContent = v === '' ? '受光:記録なし' : '受光:' + fmtMin(clampInt(v, MAX_JUKO));
  }
  $('#dlgJuko').addEventListener('input', updateDlgPreview);
  $('#dlgSave').addEventListener('click', function () {
    var seko = clampInt($('#dlgSeko').value, MAX_SEKO);
    var jv = $('#dlgJuko').value;
    var juko = null;
    if (jv !== '') { juko = clampInt(jv, MAX_JUKO); if (juko < 1) juko = null; }
    setRec(editKey, { seko: seko, juko: juko });
    $('#dlg').close();
    renderHistory(); renderHome();
    toast('保存しました');
  });
  $('#dlgDelete').addEventListener('click', function () {
    if (!confirm('この日の記録をすべて消しますか?')) return;
    setRec(editKey, { seko: 0, juko: null });
    $('#dlg').close();
    renderHistory(); renderHome();
  });
  $('#dlgClose').addEventListener('click', function () { $('#dlg').close(); });

  // ---------- バックアップ ----------
  $('#exportBtn').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify({ app: 'hikari', version: 1, data: data }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hikari-backup-' + keyOf(new Date()) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  $('#importBtn').addEventListener('click', function () { $('#importFile').click(); });
  $('#importFile').addEventListener('change', function () {
    var f = this.files[0];
    var input = this;
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var obj = JSON.parse(reader.result);
        var src = obj && obj.data ? obj.data : obj;
        var clean = {}, n = 0;
        for (var k in src) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
          var r = src[k] || {};
          var seko = clampInt(r.seko, MAX_SEKO);
          var juko = (r.juko == null) ? null : clampInt(r.juko, MAX_JUKO);
          if (juko === 0) juko = null;
          if (seko || juko != null) { clean[k] = { seko: seko, juko: juko }; n++; }
        }
        if (!n) { toast('読み込める記録がありませんでした'); return; }
        if (!confirm(n + '日分の記録を読み込みます。現在の記録は置き換わります。よろしいですか?')) return;
        data = clean;
        persist();
        renderHome(); renderHistory();
        toast('読み込みました');
      } catch (e) {
        toast('ファイルを読み込めませんでした');
      }
      input.value = '';
    };
    reader.readAsText(f);
  });

  // ---------- 管理者へ送る(LINE) ----------
  var NAME_KEY = 'hikari_name';
  function getName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } }
  function setName(v) { try { localStorage.setItem(NAME_KEY, v); } catch (e) {} }
  function periodPrefix(p) {
    var now = new Date();
    if (p === 'this') return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-';
    if (p === 'last') {
      var l = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return l.getFullYear() + '-' + pad(l.getMonth() + 1) + '-';
    }
    return null;
  }
  function sendKeys() {
    var prefix = periodPrefix($('#sendPeriod').value);
    return Object.keys(data).filter(function (k) {
      return !prefix || k.indexOf(prefix) === 0;
    }).sort();
  }
  function buildText() {
    var keys = sendKeys();
    var lines = ['【光の記録】', '名前:' + $('#sendName').value.trim(), '送信:' + new Date().toISOString()];
    keys.forEach(function (k) {
      var r = data[k];
      lines.push(k + ' 施光' + (r.seko || 0) + '回' + (r.juko ? ' 受光' + r.juko + '分' : ''));
    });
    return { text: lines.join('\n'), days: keys.length };
  }
  function updateSendInfo() {
    if (document.activeElement !== $('#sendName')) $('#sendName').value = getName();
    $('#sendInfo').textContent = '送る記録:' + sendKeys().length + '日分';
  }
  function readyText() {
    if (!$('#sendName').value.trim()) { toast('お名前を入力してください'); $('#sendName').focus(); return null; }
    var p = buildText();
    if (!p.days) { toast('その期間の記録がありません'); return null; }
    return p.text;
  }
  $('#sendName').addEventListener('input', function () { setName(this.value.trim()); });
  $('#sendPeriod').addEventListener('change', updateSendInfo);
  $('#sendBtn').addEventListener('click', function () {
    var text = readyText();
    if (!text) return;
    var url = 'https://line.me/R/msg/text/?' + encodeURIComponent(text);
    if (url.length > 7000) {
      toast('記録が多すぎます。期間を短くするか「コピー」をお使いください');
      return;
    }
    location.href = url;
  });
  $('#copyBtn').addEventListener('click', function () {
    var text = readyText();
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { toast('コピーしました。LINEに貼り付けて送ってください'); },
        function () { toast('コピーできませんでした'); });
    } else {
      toast('コピーできませんでした');
    }
  });

  // ---------- タブ ----------
  function showTab(name) {
    $('#view-home').classList.toggle('active', name === 'home');
    $('#view-history').classList.toggle('active', name === 'history');
    $('#tabHome').classList.toggle('active', name === 'home');
    $('#tabHistory').classList.toggle('active', name === 'history');
    if (name === 'history') renderHistory(); else renderHome();
    window.scrollTo(0, 0);
  }
  $('#tabHome').addEventListener('click', function () { showTab('home'); });
  $('#tabHistory').addEventListener('click', function () { showTab('history'); });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      renderHome();
      if ($('#view-history').classList.contains('active')) renderHistory();
    }
  });

  renderHome();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
