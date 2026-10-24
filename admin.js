(function () {
  'use strict';

  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  var members = {};   // 名前 -> { days: {日付: {seko, juko}}, stamps: {日付: 送信日時} }
  var open = {};      // 内訳を開いている名前

  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clamp(v, max) {
    v = parseInt(v, 10);
    if (isNaN(v) || v < 0) v = 0;
    return Math.min(v, max);
  }
  function fmtMin(m) {
    if (!m) return '0分';
    var h = Math.floor(m / 60), mm = m % 60;
    if (h && mm) return h + '時間' + mm + '分';
    if (h) return h + '時間';
    return mm + '分';
  }
  function shortDate(k) {
    var p = k.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return (+p[1]) + '/' + (+p[2]) + '(' + WD[d.getDay()] + ')';
  }

  // ---------- 読み込み ----------
  function merge(name, entries, stamp) {
    var m = members[name] || (members[name] = { days: {}, stamps: {} });
    var n = 0;
    entries.forEach(function (e) {
      if (!e.seko && e.juko == null) return;
      if (m.stamps[e.k] && m.stamps[e.k] > stamp) return; // 新しい送信を優先
      m.days[e.k] = { seko: e.seko, juko: e.juko };
      m.stamps[e.k] = stamp;
      n++;
    });
    return n;
  }

  // LINEで届く文章形式(複数人分が連なっていてもOK)
  function addTextBlock(block) {
    var nm = /名前[:\uff1a]\s*(.+)/.exec(block);
    if (!nm) return { ok: false, msg: 'お名前が見つかりません' };
    var name = nm[1].trim().slice(0, 40);
    var st = /送信[:\uff1a]\s*(\S+)/.exec(block);
    var stamp = st ? st[1] : '';
    var re = /(\d{4}-\d{2}-\d{2})\s*施光\s*(\d+)\s*回(?:\s*受光\s*(\d+)\s*分)?/g;
    var entries = [], x;
    while ((x = re.exec(block))) {
      var juko = x[3] ? clamp(x[3], 1440) : null;
      if (juko === 0) juko = null;
      entries.push({ k: x[1], seko: clamp(x[2], 9999), juko: juko });
    }
    if (!entries.length) return { ok: false, msg: name + 'さんの記録が見つかりません' };
    return { ok: true, name: name, n: merge(name, entries, stamp) };
  }

  // ファイル書き出し(旧形式JSON)
  function addJson(raw) {
    var a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a < 0 || b < a) return { ok: false, msg: '読み取れませんでした' };
    var obj;
    try { obj = JSON.parse(raw.slice(a, b + 1)); } catch (e) { return { ok: false, msg: '読み取れませんでした' }; }
    if (!obj || obj.app !== 'hikari' || !obj.data || typeof obj.data !== 'object') {
      return { ok: false, msg: '光の記録のデータではありません' };
    }
    var name = String(obj.name || '').trim().slice(0, 40);
    if (!name) return { ok: false, msg: 'お名前が入っていません' };
    var entries = [];
    for (var k in obj.data) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
      var r = obj.data[k] || {};
      var juko = (r.juko == null) ? null : clamp(r.juko, 1440);
      if (juko === 0) juko = null;
      entries.push({ k: k, seko: clamp(r.seko, 9999), juko: juko });
    }
    return { ok: true, name: name, n: merge(name, entries, String(obj.exportedAt || '')) };
  }

  // 文章でもJSONでも読み込む。結果は人数分の配列で返す
  function addAny(raw, label) {
    var res = [];
    if (raw.indexOf('【光の記録】') >= 0) {
      raw.split('【光の記録】').slice(1).forEach(function (blk) { res.push(addTextBlock(blk)); });
    } else {
      res.push(addJson(raw));
    }
    res.forEach(function (r) { r.label = label; });
    return res;
  }

  function showMsgs(list) {
    $('#msg').innerHTML = list.map(function (x) {
      return x.ok
        ? '<div class="ok">✓ ' + esc(x.label) + ':' + esc(x.name) + 'さん ' + x.n + '日分</div>'
        : '<div class="ng">× ' + esc(x.label) + ':' + esc(x.msg) + '</div>';
    }).join('');
  }

  $('#files').addEventListener('change', function () {
    var input = this;
    var files = Array.prototype.slice.call(input.files);
    if (!files.length) return;
    var results = new Array(files.length);
    var left = files.length;
    files.forEach(function (f, i) {
      var rd = new FileReader();
      rd.onload = function () {
        results[i] = addAny(String(rd.result), f.name);
        done();
      };
      rd.onerror = function () { results[i] = [{ ok: false, label: f.name, msg: '開けませんでした' }]; done(); };
      rd.readAsText(f);
    });
    function done() {
      if (--left) return;
      showMsgs([].concat.apply([], results));
      input.value = '';
      render();
    }
  });

  $('#addPaste').addEventListener('click', function () {
    var t = $('#paste').value;
    if (!t.trim()) return;
    var rs = addAny(t, '貼り付け');
    showMsgs(rs);
    if (rs.some(function (r) { return r.ok; })) $('#paste').value = '';
    render();
  });

  // ---------- 集計 ----------
  function monthsAvailable() {
    var s = {};
    for (var nm in members) for (var k in members[nm].days) s[k.slice(0, 7)] = 1;
    return Object.keys(s).sort().reverse();
  }

  function compute() {
    var period = $('#period').value;
    var rows = Object.keys(members).map(function (nm) {
      var d = members[nm].days;
      var x = { name: nm, seko: 0, juko: 0, jd: 0, sd: 0, last: '', list: [] };
      Object.keys(d).sort().forEach(function (k) {
        if (period !== 'all' && k.slice(0, 7) !== period) return;
        var r = d[k];
        if (r.seko) { x.seko += r.seko; x.sd++; }
        if (r.juko) { x.juko += r.juko; x.jd++; }
        x.last = k;
        x.list.push(k);
      });
      return x;
    });
    var s = $('#sort').value;
    rows.sort(function (a, b) {
      if (s === 'seko' && b.seko !== a.seko) return b.seko - a.seko;
      if (s === 'juko' && b.juko !== a.juko) return b.juko - a.juko;
      return a.name.localeCompare(b.name, 'ja');
    });
    return rows;
  }

  function render() {
    var names = Object.keys(members);
    $('#result').hidden = !names.length;

    $('#chips').innerHTML = names.sort().map(function (nm) {
      return '<span class="chip">' + esc(nm) + '<button data-n="' + esc(nm) + '" aria-label="' + esc(nm) + 'を外す">×</button></span>';
    }).join('');

    if (!names.length) return;

    var sel = $('#period');
    var cur = sel.value;
    var months = monthsAvailable();
    sel.innerHTML = '<option value="all">全期間</option>' + months.map(function (m) {
      return '<option value="' + m + '">' + m.slice(0, 4) + '年' + (+m.slice(5)) + '月</option>';
    }).join('');
    if (cur && (cur === 'all' || months.indexOf(cur) >= 0)) sel.value = cur;
    else sel.value = months.length ? months[0] : 'all';

    var rows = compute();
    var tS = 0, tJ = 0, tJd = 0;
    rows.forEach(function (x) { tS += x.seko; tJ += x.juko; tJd += x.jd; });

    $('#summary').innerHTML =
      '<div class="stat"><div class="l">人数</div><div class="v">' + rows.length + '人</div></div>' +
      '<div class="stat"><div class="l">施光 合計</div><div class="v g">' + tS + '回</div></div>' +
      '<div class="stat"><div class="l">受光 合計</div><div class="v b">' + fmtMin(tJ) + '</div></div>';

    var html = '<thead><tr><th>名前</th><th>施光</th><th>受光</th><th>受光日数</th><th>最終記録</th></tr></thead><tbody>';
    rows.forEach(function (x) {
      html += '<tr class="m" data-n="' + esc(x.name) + '"><td>' + esc(x.name) + '</td>' +
        '<td class="s">' + x.seko + '回</td><td class="j">' + fmtMin(x.juko) + '</td>' +
        '<td>' + x.jd + '日</td><td>' + (x.last ? shortDate(x.last) : '—') + '</td></tr>';
      if (open[x.name]) {
        var d = members[x.name].days;
        html += '<tr class="d"><td colspan="5">' + (x.list.length ? x.list.map(function (k) {
          var r = d[k];
          return shortDate(k) + ' 施光 ' + r.seko + '回 / 受光 ' + (r.juko ? fmtMin(r.juko) : '—');
        }).join('<br>') : 'この期間の記録はありません') + '</td></tr>';
      }
    });
    html += '</tbody><tfoot><tr><td>合計</td><td class="s">' + tS + '回</td><td class="j">' + fmtMin(tJ) +
      '</td><td>' + tJd + '日</td><td></td></tr></tfoot>';
    $('#table').innerHTML = html;
  }

  $('#period').addEventListener('change', render);
  $('#sort').addEventListener('change', render);

  $('#table').addEventListener('click', function (e) {
    var tr = e.target.closest('tr.m');
    if (!tr) return;
    var n = tr.getAttribute('data-n');
    open[n] = !open[n];
    render();
  });

  $('#chips').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-n]');
    if (!b) return;
    var n = b.getAttribute('data-n');
    if (!confirm(n + 'さんの記録を読み込みから外しますか?')) return;
    delete members[n];
    delete open[n];
    $('#msg').innerHTML = '';
    render();
  });

  $('#clear').addEventListener('click', function () {
    if (!confirm('読み込んだ記録をすべてクリアしますか?')) return;
    members = {};
    open = {};
    $('#msg').innerHTML = '';
    render();
  });

  $('#csv').addEventListener('click', function () {
    var rows = compute();
    function q(s) { return '"' + String(s).replace(/"/g, '""') + '"'; }
    var p = $('#period').value;
    var lines = ['名前,施光合計(回),受光合計(分),受光日数,最終記録日'];
    rows.forEach(function (x) {
      lines.push([q(x.name), x.seko, x.juko, x.jd, x.last].join(','));
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hikari-' + (p === 'all' ? 'all' : p) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  // ---------- 管理者の確認(パスコード) ----------
  var SALT = 'hikari-ba39f40854a87c8c', ITER = 100000, HASH = '3f63ff1e7cb4f41f1ade1fba01281b105a8c905f607fbaabff692d7ef819ab0a', LSKEY = 'hikari_admin_key';
  function derive(pass) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT), iterations: ITER }, k, 256);
    }).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  }
  function unlock() {
    $('#lock').hidden = true;
    $('#content').hidden = false;
    render();
  }
  function tryUnlock() {
    var v = $('#pass').value.trim();
    if (!v) return;
    if (!(window.crypto && crypto.subtle)) { $('#lockMsg').innerHTML = '<span class="ng">このブラウザでは使えません。ChromeでHTTPSのURLを開いてください</span>'; return; }
    $('#lockMsg').textContent = '確認中…';
    derive(v).then(function (h) {
      if (h === HASH) {
        try { localStorage.setItem(LSKEY, h); } catch (e) {}
        unlock();
      } else {
        $('#pass').value = '';
        $('#lockMsg').innerHTML = '<span class="ng">アクセスできません。管理者以外は使えないページです</span>';
      }
    });
  }
  $('#unlock').addEventListener('click', tryUnlock);
  $('#pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') tryUnlock(); });
  var saved = null;
  try { saved = localStorage.getItem(LSKEY); } catch (e) {}
  if (saved && saved === HASH) unlock();
})();
