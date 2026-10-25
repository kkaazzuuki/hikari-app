(function () {
  'use strict';

  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  // members[名前] = { days:{日付:{seko,juko}}, stamps:{日付:更新日時}, reported:最終報告日時, inactive:休止中 }
  var members = {};   // 表示中のグループのメンバー(groups[cur].members と同じもの)
  var groups = {};    // id -> { name, members }
  var order = [];     // グループの並び順
  var cur = '';       // 表示中・読み込み先のグループid
  var open = {};
  var STORE = 'hikari_admin_data_v1';

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
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function agoDays(iso) {
    if (!iso) return null;
    var d = new Date(iso), t = new Date();
    if (isNaN(d.getTime())) return null;
    var a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var b = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.max(0, Math.round((b - a) / 86400000));
  }
  function repLabel(iso) {
    var n = agoDays(iso);
    if (n === null) return '<span class="bad">未報告</span>';
    var cls = n >= 15 ? 'bad' : n >= 8 ? 'warn' : '';
    return '<span class="' + cls + '">' + (n === 0 ? '今日' : n + '日前') + '</span>';
  }
  function repDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  // ---------- 保存(この端末) ----------
  function newGid() { return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function loadStore() {
    var o = null;
    try { o = JSON.parse(localStorage.getItem(STORE)); } catch (e) {}
    groups = {}; order = []; cur = '';
    if (o && o.groups && typeof o.groups === 'object') {
      groups = o.groups;
      order = (o.order || []).filter(function (g) { return groups[g]; });
      Object.keys(groups).forEach(function (g) { if (order.indexOf(g) < 0) order.push(g); });
      cur = groups[o.current] ? o.current : order[0];
    } else if (o && o.members && typeof o.members === 'object') {
      // 以前の形式(グループなし)を、最初のグループとして引き継ぐ
      groups.g1 = { name: 'グループ1', members: o.members };
      order = ['g1']; cur = 'g1';
    }
    if (!order.length) { groups.g1 = { name: 'グループ1', members: {} }; order = ['g1']; cur = 'g1'; }
    order.forEach(function (g) { if (!groups[g].members) groups[g].members = {}; });
    members = groups[cur].members;
  }
  function saveStore() {
    try { localStorage.setItem(STORE, JSON.stringify({ version: 3, groups: groups, order: order, current: cur })); }
    catch (e) { $('#msg').innerHTML = '<div class="ng">× この端末に保存できませんでした</div>'; }
  }
  function gname() { return groups[cur] ? groups[cur].name : ''; }
  function selectGroup(id) {
    if (!groups[id]) return;
    cur = id;
    members = groups[id].members;
    open = {};
    $('#msg').innerHTML = '';
    saveStore();
    render();
  }
  function renderGroups() {
    $('#grpChips').innerHTML = order.map(function (g) {
      return '<button class="gtab' + (g === cur ? ' on' : '') + '" data-g="' + g + '">' + esc(groups[g].name) +
        '<small>' + Object.keys(groups[g].members).length + '人</small></button>';
    }).join('');
    $('#grpSel').innerHTML = order.map(function (g) {
      return '<option value="' + g + '"' + (g === cur ? ' selected' : '') + '>' + esc(groups[g].name) + '</option>';
    }).join('');
    ['#gnTable', '#gnChart', '#gnUn'].forEach(function (id) { $(id).textContent = gname(); });
    $('#grpDel').disabled = order.length <= 1;
    $('#grpDel').style.opacity = order.length <= 1 ? '.4' : '1';
  }
  $('#grpChips').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-g]');
    if (b) selectGroup(b.getAttribute('data-g'));
  });
  $('#grpSel').addEventListener('change', function () { selectGroup(this.value); });
  function nameTaken(n, exceptId) {
    return order.some(function (g) { return g !== exceptId && groups[g].name === n; });
  }
  $('#grpAdd').addEventListener('click', function () {
    var n = prompt('新しいグループの名前を入力してください');
    if (n === null) return;
    n = n.trim().slice(0, 30);
    if (!n) return;
    if (nameTaken(n, '')) { alert('同じ名前のグループがあります'); return; }
    var id = newGid();
    groups[id] = { name: n, members: {} };
    order.push(id);
    selectGroup(id);
  });
  $('#grpRename').addEventListener('click', function () {
    var n = prompt('グループの新しい名前を入力してください', gname());
    if (n === null) return;
    n = n.trim().slice(0, 30);
    if (!n) return;
    if (nameTaken(n, cur)) { alert('同じ名前のグループがあります'); return; }
    groups[cur].name = n;
    saveStore();
    render();
  });
  $('#grpDel').addEventListener('click', function () {
    if (order.length <= 1) { alert('グループは最低1つ必要です'); return; }
    var cnt = Object.keys(members).length;
    if (!confirm('グループ「' + gname() + '」(' + cnt + '人分の記録)を、すべて削除します。元に戻せません。よろしいですか?')) return;
    var id = cur;
    var idx = order.indexOf(id);
    order.splice(idx, 1);
    delete groups[id];
    selectGroup(order[Math.max(0, idx - 1)]);
  });
  function ensure(name) {
    var m = members[name] || (members[name] = { days: {}, stamps: {}, reported: '', inactive: false });
    if (!m.days) m.days = {};
    if (!m.stamps) m.stamps = {};
    return m;
  }

  // ---------- 読み込み ----------
  // 新規・更新・変更なしの日数を数えて返す
  function merge(name, entries, stamp) {
    var m = ensure(name);
    var c = { added: 0, updated: 0, same: 0 };
    var rs = stamp || new Date().toISOString();
    if (rs > (m.reported || '')) m.reported = rs;
    entries.forEach(function (e) {
      if (!e.seko && e.juko == null) return;
      var old = m.days[e.k];
      if (old) {
        if (old.seko === e.seko && (old.juko || null) === (e.juko || null)) {
          c.same++;
          if (!m.stamps[e.k] || m.stamps[e.k] < rs) m.stamps[e.k] = rs;
          return;
        }
        if (m.stamps[e.k] && m.stamps[e.k] > rs) return; // もっと新しい記録がある
        m.days[e.k] = { seko: e.seko, juko: e.juko };
        m.stamps[e.k] = rs;
        c.updated++;
      } else {
        m.days[e.k] = { seko: e.seko, juko: e.juko };
        m.stamps[e.k] = rs;
        c.added++;
      }
    });
    return c;
  }

  // LINEで届く文章形式(複数人分が連なっていてもOK)
  function addTextBlock(block) {
    var nm = /名前[:：]\s*(.+)/.exec(block);
    if (!nm) return { ok: false, msg: 'お名前が見つかりません' };
    var name = nm[1].trim().slice(0, 40);
    var st = /送信[:：]\s*(\S+)/.exec(block);
    var stamp = st ? st[1] : '';
    var re = /(\d{4}-\d{2}-\d{2})\s*施光\s*(\d+)\s*回(?:\s*受光\s*(\d+)\s*分)?/g;
    var entries = [], x;
    while ((x = re.exec(block))) {
      var juko = x[3] ? clamp(x[3], 1440) : null;
      if (juko === 0) juko = null;
      entries.push({ k: x[1], seko: clamp(x[2], 9999), juko: juko });
    }
    if (!entries.length) return { ok: false, msg: name + 'さんの記録が見つかりません' };
    return { ok: true, name: name, c: merge(name, entries, stamp) };
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
    return { ok: true, name: name, c: merge(name, entries, String(obj.exportedAt || '')) };
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
      if (!x.ok) return '<div class="ng">× ' + esc(x.label) + ':' + esc(x.msg) + '</div>';
      var c = x.c, parts = [];
      var gp = '[' + esc(gname()) + '] ';
      if (!c.added && !c.updated) return '<div class="ok">✓ ' + gp + esc(x.name) + 'さん:すでに登録済みです(変更なし ' + c.same + '日分)</div>';
      if (c.added) parts.push('新規 ' + c.added + '日');
      if (c.updated) parts.push('更新 ' + c.updated + '日');
      if (c.same) parts.push('変更なし ' + c.same + '日');
      return '<div class="ok">✓ ' + gp + esc(x.name) + 'さん:' + parts.join('・') + '</div>';
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
      rd.onload = function () { results[i] = addAny(String(rd.result), f.name); done(); };
      rd.onerror = function () { results[i] = [{ ok: false, label: f.name, msg: '開けませんでした' }]; done(); };
      rd.readAsText(f);
    });
    function done() {
      if (--left) return;
      showMsgs([].concat.apply([], results));
      input.value = '';
      saveStore();
      render();
    }
  });

  $('#addPaste').addEventListener('click', function () {
    var t = $('#paste').value;
    if (!t.trim()) return;
    var rs = addAny(t, '貼り付け');
    showMsgs(rs);
    if (rs.some(function (r) { return r.ok; })) $('#paste').value = '';
    saveStore();
    render();
  });

  $('#rosterAdd').addEventListener('click', function () {
    var names = $('#roster').value.split(/[\n,、]+/).map(function (s) { return s.trim().slice(0, 40); }).filter(Boolean);
    if (!names.length) return;
    var added = 0;
    names.forEach(function (n) { if (!members[n]) { ensure(n); added++; } });
    saveStore();
    $('#roster').value = '';
    $('#msg').innerHTML = '<div class="ok">✓ 名簿に登録しました(新規 ' + added + '人・すでにいた人 ' + (names.length - added) + '人)</div>';
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
      var m = members[nm], d = m.days;
      var x = { name: nm, seko: 0, juko: 0, jd: 0, sd: 0, last: '', list: [], reported: m.reported || '', inactive: !!m.inactive };
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
      if (s === 'rep' && a.reported !== b.reported) return a.reported < b.reported ? -1 : 1;
      return a.name.localeCompare(b.name, 'ja');
    });
    return rows;
  }

  function renderUnreported() {
    var names = Object.keys(members);
    $('#unrep').hidden = !names.length;
    if (!names.length) return;
    var limit = parseInt($('#unDays').value, 10) || 7;
    var late = names.filter(function (n) { return !members[n].inactive; }).map(function (n) {
      return { name: n, rep: members[n].reported || '', n: agoDays(members[n].reported) };
    }).filter(function (x) { return x.n === null || x.n >= limit; });
    late.sort(function (a, b) {
      if (a.n === null && b.n !== null) return -1;
      if (b.n === null && a.n !== null) return 1;
      return (b.n || 0) - (a.n || 0);
    });
    $('#unList').innerHTML = late.length ? late.map(function (x) {
      return '<div class="un"><div>' + esc(x.name) + '</div><div class="r">' +
        (x.n === null ? '<span class="bad">まだ届いていません</span>' : '<span class="' + (x.n >= 15 ? 'bad' : 'warn') + '">' + x.n + '日前</span> <span style="color:var(--sub)">(' + repDateTime(x.rep) + ')</span>') +
        '</div></div>';
    }).join('') : '<div class="okline">✓ ' + limit + '日以上報告がない人はいません</div>';
  }

  function bars(items, fmt, cls) {
    if (!items.length) return '<div class="note">表示できるデータがありません</div>';
    var max = Math.max.apply(null, items.map(function (i) { return i.v; }).concat([1]));
    return items.map(function (i) {
      return '<div class="bar"><div class="bl" title="' + esc(i.l) + '">' + esc(i.l) + '</div>' +
        '<div class="bt"><div class="bf ' + cls + '" style="width:' + Math.round(i.v / max * 100) + '%"></div></div>' +
        '<div class="bv">' + fmt(i.v) + '</div></div>';
    }).join('');
  }
  function renderChart(rows) {
    var metric = $('#chartMetric').value, mode = $('#chartMode').value;
    var isS = metric === 'seko';
    var fmt = isS ? function (v) { return v + '回'; } : fmtMin;
    var cls = isS ? 'g' : 'b';
    var items;
    if (mode === 'member') {
      items = rows.map(function (x) { return { l: x.name, v: isS ? x.seko : x.juko }; })
        .sort(function (a, b) { return b.v - a.v; });
    } else {
      var sum = {};
      Object.keys(members).forEach(function (nm) {
        var d = members[nm].days;
        Object.keys(d).forEach(function (k) {
          var mo = k.slice(0, 7);
          sum[mo] = (sum[mo] || 0) + (isS ? (d[k].seko || 0) : (d[k].juko || 0));
        });
      });
      items = Object.keys(sum).sort().slice(-12).map(function (mo) {
        return { l: mo.slice(0, 4) + '/' + (+mo.slice(5)), v: sum[mo] };
      });
    }
    $('#chart').innerHTML = bars(items, fmt, cls);
  }

  function render() {
    renderGroups();
    var names = Object.keys(members);
    $('#result').hidden = !names.length;
    $('#chartCard').hidden = !names.length;
    renderUnreported();
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
    var tS = 0, tJ = 0;
    rows.forEach(function (x) { tS += x.seko; tJ += x.juko; });

    $('#summary').innerHTML =
      '<div class="stat"><div class="l">人数</div><div class="v">' + rows.length + '人</div></div>' +
      '<div class="stat"><div class="l">施光 合計</div><div class="v g">' + tS + '回</div></div>' +
      '<div class="stat"><div class="l">受光 合計</div><div class="v b">' + fmtMin(tJ) + '</div></div>';

    var html = '<thead><tr><th>名前</th><th>施光</th><th>受光</th><th>最終報告</th></tr></thead><tbody>';
    rows.forEach(function (x) {
      html += '<tr class="m' + (x.inactive ? ' off' : '') + '" data-n="' + esc(x.name) + '"><td>' + esc(x.name) + (x.inactive ? '(休止)' : '') + '</td>' +
        '<td class="s">' + x.seko + '回</td><td class="j">' + fmtMin(x.juko) + '</td><td>' + (x.inactive && !x.reported ? '—' : repLabel(x.reported)) + '</td></tr>';
      if (open[x.name]) {
        var m = members[x.name], d = m.days;
        html += '<tr class="d"><td colspan="4">' +
          '<div style="color:var(--sub)">受光した日 ' + x.jd + '日 / 最終記録 ' + (x.last ? shortDate(x.last) : '—') + ' / 最終報告 ' + repDateTime(x.reported) + '</div>' +
          (x.list.length ? x.list.map(function (k) {
            var r = d[k];
            return shortDate(k) + ' 施光 ' + r.seko + '回 / 受光 ' + (r.juko ? fmtMin(r.juko) : '—') +
              ' <button class="ed" data-edit="' + esc(x.name) + '" data-k="' + k + '">修正</button>';
          }).join('<br>') : 'この期間の記録はありません') +
          '<br><button class="ed" data-add="' + esc(x.name) + '" style="padding-left:0">＋この人の記録を追加</button>' +
          '<button class="ed" data-inact="' + esc(x.name) + '">' + (x.inactive ? '休止をやめる' : '休止中にする') + '</button>' +
          '<button class="ed dn" data-del="' + esc(x.name) + '">この人を削除</button></td></tr>';
      }
    });
    html += '</tbody><tfoot><tr><td>合計</td><td class="s">' + tS + '回</td><td class="j">' + fmtMin(tJ) + '</td><td></td></tr></tfoot>';
    $('#table').innerHTML = html;
    renderChart(rows);
  }

  $('#period').addEventListener('change', render);
  $('#sort').addEventListener('change', render);
  $('#unDays').addEventListener('change', renderUnreported);
  $('#chartMode').addEventListener('change', function () { renderChart(compute()); });
  $('#chartMetric').addEventListener('change', function () { renderChart(compute()); });

  $('#table').addEventListener('click', function (e) {
    var ed = e.target.closest('button[data-edit]');
    if (ed) { openEdit(ed.getAttribute('data-edit'), ed.getAttribute('data-k')); return; }
    var ad = e.target.closest('button[data-add]');
    if (ad) { openEdit(ad.getAttribute('data-add'), null); return; }
    var ia = e.target.closest('button[data-inact]');
    if (ia) {
      var nn = ia.getAttribute('data-inact');
      members[nn].inactive = !members[nn].inactive;
      saveStore(); render();
      return;
    }
    var dl = e.target.closest('button[data-del]');
    if (dl) {
      var n2 = dl.getAttribute('data-del');
      if (!confirm(n2 + 'さんの保存済みの記録を、すべて削除します。元に戻せません。よろしいですか?')) return;
      delete members[n2]; delete open[n2];
      $('#msg').innerHTML = '';
      saveStore(); render();
      return;
    }
    var tr = e.target.closest('tr.m');
    if (!tr) return;
    var n = tr.getAttribute('data-n');
    open[n] = !open[n];
    render();
  });

  $('#clear').addEventListener('click', function () {
    if (!confirm('グループ「' + gname() + '」の記録を、すべて削除します(他のグループは残ります)。元に戻せません。よろしいですか?')) return;
    groups[cur].members = {};
    members = groups[cur].members;
    open = {};
    $('#msg').innerHTML = '';
    saveStore();
    render();
  });

  $('#csv').addEventListener('click', function () {
    var rows = compute();
    function q(s) { return '"' + String(s).replace(/"/g, '""') + '"'; }
    var p = $('#period').value;
    var lines = ['グループ,名前,施光合計(回),受光合計(分),受光日数,最終記録日,最終報告日時,休止中'];
    rows.forEach(function (x) {
      lines.push([q(gname()), q(x.name), x.seko, x.juko, x.jd, x.last, q(x.reported), x.inactive ? '休止' : ''].join(','));
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hikari-' + gname().replace(/[\\\/:*?"<>|\s]/g, '') + '-' + (p === 'all' ? 'all' : p) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  // ---------- 手入力・修正 ----------
  function openEdit(name, key) {
    $('#eTitle').textContent = name ? name + 'さんの記録' : 'メンバーを追加';
    $('#eName').value = name || '';
    $('#eName').readOnly = !!name;
    $('#eNames').innerHTML = Object.keys(members).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    $('#eDate').max = todayStr();
    $('#eDate').value = key || todayStr();
    $('#eRep').checked = true;
    fillEdit();
    $('#eDlg').showModal();
  }
  function fillEdit() {
    var n = $('#eName').value.trim(), k = $('#eDate').value;
    var r = (members[n] && members[n].days[k]) || null;
    $('#eSeko').value = r ? r.seko : 0;
    $('#eJuko').value = r && r.juko ? r.juko : '';
    $('#ePrev').textContent = r ? 'この日の記録があります。保存すると上書きされます' : 'この日の記録はまだありません(新しく追加されます)';
  }
  $('#addMember').addEventListener('click', function () { openEdit(null, null); });
  $('#eDate').addEventListener('change', fillEdit);
  $('#eName').addEventListener('change', fillEdit);
  $('#eClose').addEventListener('click', function () { $('#eDlg').close(); });
  $('#eSave').addEventListener('click', function () {
    var name = $('#eName').value.trim().slice(0, 40);
    var k = $('#eDate').value;
    if (!name) { alert('名前を入力してください'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) { alert('日付を選んでください'); return; }
    var seko = clamp($('#eSeko').value, 9999);
    var juko = clamp($('#eJuko').value, 1440) || null;
    var m = ensure(name);
    var now = new Date().toISOString();
    if (!seko && juko == null) { delete m.days[k]; delete m.stamps[k]; }
    else { m.days[k] = { seko: seko, juko: juko }; m.stamps[k] = now; }
    if ($('#eRep').checked) m.reported = now;
    saveStore();
    $('#eDlg').close();
    $('#msg').innerHTML = '<div class="ok">✓ ' + esc(name) + 'さんの ' + esc(shortDate(k)) + ' を保存しました</div>';
    render();
  });
  $('#eDel').addEventListener('click', function () {
    var name = $('#eName').value.trim(), k = $('#eDate').value;
    var m = members[name];
    if (!m || !m.days[k]) { alert('この日の記録はありません'); return; }
    if (!confirm(name + 'さんの ' + shortDate(k) + ' の記録を消しますか?')) return;
    delete m.days[k];
    delete m.stamps[k];
    saveStore();
    $('#eDlg').close();
    render();
  });

  // ---------- バックアップ ----------
  $('#bkOut').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify({ app: 'hikari-admin', version: 3, groups: groups, order: order }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hikari-admin-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  $('#bkIn').addEventListener('click', function () { $('#bkFile').click(); });

  // バックアップ内のメンバーを、指定のグループへマージ(同じ日は新しいほうを残す)
  function mergeInto(target, src) {
    var n = 0;
    Object.keys(src || {}).forEach(function (nm) {
      var sm = src[nm] || {};
      var days = sm.days || {}, st = sm.stamps || {};
      var name = String(nm).trim().slice(0, 40);
      if (!name) return;
      var m = target[name] || (target[name] = { days: {}, stamps: {}, reported: '', inactive: false });
      if (!m.days) m.days = {};
      if (!m.stamps) m.stamps = {};
      if (sm.reported && String(sm.reported) > (m.reported || '')) m.reported = String(sm.reported);
      if (sm.inactive) m.inactive = true;
      Object.keys(days).forEach(function (k) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
        var r = days[k] || {};
        var seko = clamp(r.seko, 9999);
        var juko = (r.juko == null) ? null : (clamp(r.juko, 1440) || null);
        var stamp = String(st[k] || '');
        if (!seko && juko == null) return;
        if (m.stamps[k] && m.stamps[k] > stamp) return;
        m.days[k] = { seko: seko, juko: juko };
        m.stamps[k] = stamp;
        n++;
      });
    });
    return n;
  }
  $('#bkFile').addEventListener('change', function () {
    var input = this, f = input.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var o = JSON.parse(String(rd.result));
        if (!o || o.app !== 'hikari-admin') throw new Error('bad');
        var n = 0, gcount = 0;
        if (o.groups && typeof o.groups === 'object') {
          var ids = (o.order || Object.keys(o.groups)).filter(function (g) { return o.groups[g]; });
          if (!confirm(ids.length + 'グループ分のバックアップを読み込みます。同じ名前のグループには、同じ日の記録は新しいほうが残るように合わせます。よろしいですか?')) { input.value = ''; return; }
          ids.forEach(function (gid) {
            var src = o.groups[gid];
            var gn = String(src.name || 'グループ').trim().slice(0, 30) || 'グループ';
            var hit = order.filter(function (g) { return groups[g].name === gn; })[0];
            if (!hit) { hit = newGid(); groups[hit] = { name: gn, members: {} }; order.push(hit); }
            n += mergeInto(groups[hit].members, src.members);
            gcount++;
          });
        } else if (o.members) {
          if (!confirm('バックアップ(グループなし)を、グループ「' + gname() + '」に読み込みます。よろしいですか?')) { input.value = ''; return; }
          n += mergeInto(members, o.members);
          gcount = 1;
        } else { throw new Error('bad'); }
        members = groups[cur].members;
        saveStore();
        $('#msg').innerHTML = '<div class="ok">✓ バックアップを読み込みました(' + gcount + 'グループ・' + n + '日分)</div>';
        render();
      } catch (e) {
        $('#msg').innerHTML = '<div class="ng">× バックアップファイルを読み込めませんでした</div>';
      }
      input.value = '';
    };
    rd.readAsText(f);
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
    loadStore();
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
