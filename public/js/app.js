(function () {
  'use strict';

  /* ================= WebSocket ================= */
  var ws = null;
  var reconnectDelay = 500;
  var connEl = document.getElementById('conn');
  var connText = document.getElementById('conn-text');
  var queue = [];
  var settingsDialog = document.getElementById('config-dialog');
  var ma3Dialog = settingsDialog;
  var ma3Waiting = false;

  var ma3State = { ip: '', port: 8000, mode: 'simulation' };
  var clientId = '';
  var pendingServerSettings = null;

  function getClientId() {
    try {
      var stored = localStorage.getItem('ma3.clientId');
      if (stored && /^[A-Za-z0-9_-]{8,80}$/.test(stored)) return stored;
      var generated = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'client-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      localStorage.setItem('ma3.clientId', generated);
      return generated;
    } catch (e) {
      return 'client-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    }
  }

  function localClientSettings() {
    var settings = {};
    try {
      settings.frost = JSON.parse(localStorage.getItem('ma3.frostPresets.v1'));
      settings.bar = JSON.parse(localStorage.getItem('ma3.bar.v3'));
      settings.toggles = JSON.parse(localStorage.getItem('ma3.toggles.v1'));
      settings.page = localStorage.getItem('ma3.page');
    } catch (e) {}
    return settings;
  }

  clientId = getClientId();

  function setConn(state, text) {
    connEl.className = 'conn ' + state;
    connText.textContent = text;
  }

  function describeState() {
    if (ma3State.mode === 'simulation') return 'Simulation mode (no MA3 address set)';
    var ping = ma3State.reachable === true
      ? 'Network reachable'
      : ma3State.reachable === false
        ? 'Not reachable by network ping'
        : 'Checking network reachability';
    return 'Commands are sent via OSC (UDP) to ' + ma3State.ip + ':' + ma3State.port + '. ' + ping + '. OSC command processing is not confirmed.';
  }

  function renderStatus() {
    document.getElementById('ma3-state').textContent = describeState();
    if (ma3State.mode === 'simulation') setConn('sim', 'Simulation');
    else if (ma3State.reachable === true) setConn('on', ma3State.ip + ':' + ma3State.port);
    else if (ma3State.reachable === false) setConn('off', 'Unreachable');
    else setConn('warn', 'Checking');
  }

  function connect() {
    var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    ws = new WebSocket(proto + location.host + '/ws');
    ws.onopen = function () {
      reconnectDelay = 500;
      setConn('sim', 'Server');
      send({ type: 'registerClient', clientId: clientId, settings: localClientSettings() });
      while (queue.length) ws.send(queue.shift());
    };
    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.type === 'configError') {
        document.getElementById('ma3-error').textContent = msg.error;
        return;
      }
      if (msg.type === 'clientSettings') {
        pendingServerSettings = msg.settings || {};
        if (msg.name) document.getElementById('client-name').value = msg.name;
        var synced = false;
        try {
          if (!sessionStorage.getItem('ma3.serverSync')) {
            var syncKeys = { frost: 'ma3.frostPresets.v1', bar: 'ma3.bar.v3', toggles: 'ma3.toggles.v1' };
            Object.keys(syncKeys).forEach(function (key) {
              if (pendingServerSettings[key]) {
                var value = JSON.stringify(pendingServerSettings[key]);
                if (localStorage.getItem(syncKeys[key]) !== value) {
                  localStorage.setItem(syncKeys[key], value);
                  synced = true;
                }
              }
            });
            if (pendingServerSettings.page && localStorage.getItem('ma3.page') !== pendingServerSettings.page) {
              localStorage.setItem('ma3.page', pendingServerSettings.page);
              synced = true;
            }
            sessionStorage.setItem('ma3.serverSync', '1');
            if (synced) window.location.reload();
          }
        } catch (e) {}
        return;
      }
      if (msg.type === 'groups') {
        groupsWaiting = false;
        renderGroups(msg.groups);
        return;
      }
      if (msg.type === 'groupsTimeout') {
        groupsWaiting = false;
        setGroupsStatus('No response from the MA3. Is the "MA3 Focus Buddy Groups" plugin present in the showfile?', true);
        return;
      }
      if (msg.type === 'colours') {
        coloursWaiting = false;
        renderColours(msg.colours);
        return;
      }
      if (msg.type === 'coloursTimeout') {
        coloursWaiting = false;
        setColoursStatus('No response from the MA3. Is the "MA3 Focus Buddy Colours" plugin present in the showfile?', true);
        return;
      }
      if (msg.type !== 'status') return;
      ma3State = msg;
      if (ma3Dialog.open && ma3Waiting) { ma3Waiting = false; ma3Dialog.close(); }
      renderStatus();
    };
    ws.onclose = function () {
      setConn('off', 'Offline');
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 5000);
    };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }

  function send(obj) {
    var data = JSON.stringify(obj);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
    else if (obj.type === 'cmd' && queue.length < 20) queue.push(data); // do not buffer encoder events
  }
  function cmd(text) { send({ type: 'cmd', cmd: text }); }

  setInterval(function () {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
  }, 10000);

  Encoders.setSender(send);
  connect();

  var ipInput = document.getElementById('ma3-ip');
  var portInput = document.getElementById('ma3-port');
  var errEl = document.getElementById('ma3-error');
  connEl.title = 'Open settings';
  connEl.addEventListener('click', function () {
    ipInput.value = ma3State.ip || '127.0.0.1';
    portInput.value = ma3State.port || 8000;
    errEl.textContent = '';
    document.getElementById('ma3-state').textContent = describeState();
    renderFrostConfig();
    renderConfig();
    renderClients();
    settingsDialog.showModal();
  });
  document.getElementById('ma3-local').addEventListener('click', function () { ipInput.value = '127.0.0.1'; portInput.value = 8000; });
  document.getElementById('ma3-save').addEventListener('click', function () {
    var ip = ipInput.value.trim();
    var port = parseInt(portInput.value, 10);
    if (!/^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(ip) || !(port >= 1 && port <= 65535)) {
      errEl.textContent = 'Invalid IP address or port';
      return;
    }
    errEl.textContent = '';
    if (!ws || ws.readyState !== WebSocket.OPEN) { errEl.textContent = 'No connection to the server'; return; }
    ma3Waiting = true;
    ma3State.reachable = null;
    renderStatus();
    sendSettings({ ip: ip, port: port });
  });

  /* ================= Navigatie ================= */
  var navBtns = document.querySelectorAll('.nav-btn');
  var pages = document.querySelectorAll('.page');
  function showPage(name) {
    navBtns.forEach(function (b) { b.classList.toggle('active', b.dataset.page === name); });
    pages.forEach(function (p) { p.classList.toggle('active', p.id === 'page-' + name); });
    try { localStorage.setItem('ma3.page', name); } catch (e) {}
    if (name === 'fixtures') startGroupPolling(); else stopGroupPolling();
  }
  navBtns.forEach(function (b) { b.addEventListener('click', function () { showPage(b.dataset.page); }); });
  try { var saved = localStorage.getItem('ma3.page'); if (saved) showPage(saved); } catch (e) {}

  ['bar-buttons', 'config-list'].forEach(function (id) {
    document.getElementById(id).classList.add('scrollable');
  });

  /* ================= Encoders ================= */
  var Wheel = Encoders.Wheel;
  new Wheel(document.getElementById('wheel-pan'), { attr: 'Pan', label: 'Pan', pxPerStep: 6, stepSize: 0.05 });
  new Wheel(document.getElementById('wheel-tilt'), { attr: 'Tilt', label: 'Tilt', pxPerStep: 6, stepSize: 0.05 });
  var mid = document.getElementById('wheels-middle');
  var frostPanel = document.getElementById('frost-presets');
  mid.removeChild(frostPanel);
  new Wheel(mid, { attr: 'Zoom', label: 'Zoom', pxPerStep: 7, stepSize: 1 });
  mid.appendChild(frostPanel);
  new Wheel(mid, { attr: 'Focus', label: 'Focus', pxPerStep: 7, stepSize: 1 });

  var FROST_KEY = 'ma3.frostPresets.v1';
  var FROST_LABELS = ['No Frost', 'Light Frost', 'Medium Frost', 'Combined Frost'];
  var frostPresets = ['5.1', '5.2', '5.3', '5.4'];
  var frostButtons = document.querySelector('#frost-presets .frost-buttons');
  var frostDialog = settingsDialog;
  var frostConfig = document.getElementById('frost-config');
  var frostError = document.getElementById('frost-error');

  try {
    var savedFrost = JSON.parse(localStorage.getItem(FROST_KEY));
    if (Array.isArray(savedFrost) && savedFrost.length === FROST_LABELS.length &&
        savedFrost.every(function (preset) { return typeof preset === 'string' && /^\d+(?:\.\d+)?$/.test(preset); })) {
      frostPresets = savedFrost;
    }
  } catch (e) {}

  function renderFrostButtons() {
    frostButtons.innerHTML = '';
    FROST_LABELS.forEach(function (label, idx) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'frost-btn';
      b.textContent = label;
      b.addEventListener('click', function () { cmd('At Preset ' + frostPresets[idx]); });
      frostButtons.appendChild(b);
    });
  }

  function renderFrostConfig() {
    frostConfig.innerHTML = '';
    FROST_LABELS.forEach(function (label, idx) {
      var input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.value = frostPresets[idx];
      input.dataset.index = idx;
      var field = document.createElement('label');
      field.textContent = label;
      field.appendChild(input);
      frostConfig.appendChild(field);
    });
  }

  document.getElementById('frost-save').addEventListener('click', function () {
    var values = Array.prototype.map.call(frostConfig.querySelectorAll('input'), function (input) {
      return input.value.trim();
    });
    if (values.some(function (value) { return !/^\d+(?:\.\d+)?$/.test(value); })) {
      frostError.textContent = 'Enter a valid MA3 preset number for every button';
      return;
    }
    frostPresets = values;
    try { localStorage.setItem(FROST_KEY, JSON.stringify(frostPresets)); } catch (e) {}
    renderFrostButtons();
    sendSettings();
  });
  renderFrostButtons();

  var grid = document.getElementById('shaper-grid');
  for (var i = 1; i <= 4; i++) {
    var box = document.createElement('div');
    box.className = 'shaper-blade';
    box.innerHTML = '<h3>Blade ' + i + '</h3><div class="pair"></div>';
    var pair = box.querySelector('.pair');
    grid.appendChild(box);
    new Wheel(pair, { attr: 'Blade' + i, label: 'Insert', pxPerStep: 7, stepSize: 0.05, accel: true });
    new Wheel(pair, { attr: 'Blade' + i + 'Rot', label: 'Rotation', pxPerStep: 7, stepSize: 0.05, accel: true });
  }


  /* ================= Fixtures ================= */
  var selMode = 'fixture';
  var selInput = document.getElementById('sel-input');
  var selBtns = document.querySelectorAll('#sel-mode .seg');
  selBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      selMode = b.dataset.mode;
      selBtns.forEach(function (x) { x.classList.toggle('active', x === b); });
      selInput.placeholder = selMode === 'group' ? 'e.g. 3 or 1 thru 4' : 'e.g. 1 thru 8 + 12';
    });
  });

  var keys = ['7', '8', '9', 'Thru', '4', '5', '6', '+', '1', '2', '3', '-', '0', '.', '⌫', 'C'];
  var keypad = document.getElementById('keypad');
  keys.forEach(function (k) {
    var b = document.createElement('button');
    b.textContent = k;
    b.addEventListener('click', function () {
      var v = selInput.value;
      if (k === '⌫') selInput.value = v.slice(0, -1);
      else if (k === 'C') selInput.value = '';
      else if (k === 'Thru' || k === '+' || k === '-') selInput.value = (v.trim() + ' ' + k.toLowerCase() + ' ').replace(/^\s+/, '');
      else selInput.value = v + k;
    });
    keypad.appendChild(b);
  });

  document.getElementById('sel-clear').addEventListener('click', function () { selInput.value = ''; });
  document.getElementById('sel-apply').addEventListener('click', function () {
    var text = selInput.value.replace(/[^0-9a-zA-Z .+\-]/g, '').trim();
    if (!text) return;
    cmd((selMode === 'group' ? 'Group ' : 'Fixture ') + text);
    selInput.value = '';
  });

  /* ================= Groups (datapool 2, via MA3 plugin) ================= */
  var groupGrid = document.getElementById('group-grid');
  var groupsStatus = document.getElementById('groups-status');
  var groupsWaiting = false;
  var groupPollTimer = null;
  var GROUP_POLL_MS = 5000;

  function setGroupsStatus(text, isError) {
    groupsStatus.textContent = text;
    groupsStatus.classList.toggle('error-text', !!isError);
  }

  function renderGroups(groups) {
    groupGrid.innerHTML = '';
    if (!groups.length) {
      setGroupsStatus('Datapool 2 contains no groups.');
      return;
    }
    setGroupsStatus(groups.length + ' groups loaded from the MA3.');
    groups.forEach(function (group) {
      var b = document.createElement('button');
      b.className = 'group-chip';
      b.innerHTML = '<span class="group-no">' + group.number + '</span><span class="group-name"></span>';
      b.querySelector('.group-name').textContent = group.name;
      b.addEventListener('click', function () { cmd('SelectFixtures Datapool 2 Group ' + group.number); });
      groupGrid.appendChild(b);
    });
  }

  function requestGroups() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setGroupsStatus('No connection to the server.', true);
      return;
    }
    groupsWaiting = true;
    setGroupsStatus('Waiting for the MA3…');
    send({ type: 'requestGroups' });
  }

  function startGroupPolling() {
    stopGroupPolling();
    requestGroups();
    groupPollTimer = setInterval(function () {
      if (!groupsWaiting) requestGroups();
    }, GROUP_POLL_MS);
  }

  function stopGroupPolling() {
    if (groupPollTimer) clearInterval(groupPollTimer);
    groupPollTimer = null;
  }

  document.getElementById('groups-refresh').addEventListener('click', requestGroups);

  /* ================= Colour presets (pool 4, via MA3 plugin) ================= */
  var colourGrid = document.getElementById('colour-grid');
  var coloursStatus = document.getElementById('colours-status');
  var coloursWaiting = false;

  function setColoursStatus(text, isError) {
    coloursStatus.textContent = text;
    coloursStatus.classList.toggle('error-text', !!isError);
  }

  function renderColours(colours) {
    colourGrid.innerHTML = '';
    if (!colours.length) {
      setColoursStatus('No presets found in this range.');
      return;
    }
    setColoursStatus(colours.length + ' presets loaded from the MA3.');
    colours.forEach(function (preset) {
      var b = document.createElement('button');
      b.className = 'colour-chip';
      b.innerHTML = '<span class="group-no">' + preset.number + '</span><span class="group-name"></span>';
      b.querySelector('.group-name').textContent = preset.name;
      b.addEventListener('click', function () { cmd('Preset 4.' + preset.number); });
      colourGrid.appendChild(b);
    });
  }

  function requestColours() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setColoursStatus('No connection to the server.', true);
      return;
    }
    coloursWaiting = true;
    setColoursStatus('Waiting for the MA3…');
    send({ type: 'requestColours' });
  }

  document.getElementById('colours-refresh').addEventListener('click', requestColours);

  /* ================= Toggles ================= */
  var TOGGLES_KEY = 'ma3.toggles.v1';
  var toggles = [];
  var toggleGrid = document.getElementById('toggle-grid');
  var togglesDialog = document.getElementById('toggles-dialog');
  var togglesList = document.getElementById('toggles-list');
  var togglesError = document.getElementById('toggles-error');

  try {
    var savedToggles = JSON.parse(localStorage.getItem(TOGGLES_KEY));
    if (Array.isArray(savedToggles)) toggles = savedToggles;
  } catch (e) {}

  function saveToggles() {
    try { localStorage.setItem(TOGGLES_KEY, JSON.stringify(toggles)); } catch (e) {}
  }

  function renderToggles() {
    toggleGrid.innerHTML = '';
    if (!toggles.length) {
      var empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'No toggles yet. Use the gear to add buttons.';
      toggleGrid.appendChild(empty);
      return;
    }
    toggles.forEach(function (toggle, idx) {
      var b = document.createElement('button');
      b.className = 'toggle-btn';
      b.textContent = toggle.label;
      b.addEventListener('click', function () {
        cmd('Toggle Sequence ' + toggle.seq);
      });
      toggleGrid.appendChild(b);
    });
  }

  function renderTogglesConfig() {
    togglesList.innerHTML = '';
    toggles.forEach(function (toggle, idx) {
      var li = document.createElement('li');
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = toggle.label;
      var small = document.createElement('small');
      small.textContent = 'Sequence ' + toggle.seq;
      name.appendChild(small);
      li.appendChild(name);
      [['▲', -1], ['▼', 1]].forEach(function (a) {
        var btn = document.createElement('button');
        btn.textContent = a[0];
        btn.addEventListener('click', function () {
          var to = idx + a[1];
          if (to < 0 || to >= toggles.length) return;
          var tmp = toggles[idx]; toggles[idx] = toggles[to]; toggles[to] = tmp;
          saveToggles(); renderToggles(); renderTogglesConfig(); sendSettings();
        });
        li.appendChild(btn);
      });
      var del = document.createElement('button');
      del.textContent = '✕';
      del.addEventListener('click', function () {
        toggles.splice(idx, 1);
        saveToggles(); renderToggles(); renderTogglesConfig(); sendSettings();
      });
      li.appendChild(del);
      togglesList.appendChild(li);
    });
  }

  document.getElementById('toggles-config').addEventListener('click', function () {
    togglesError.textContent = '';
    renderTogglesConfig();
    if (togglesDialog.showModal) togglesDialog.showModal(); else togglesDialog.setAttribute('open', '');
  });
  document.getElementById('toggles-close').addEventListener('click', function () {
    if (togglesDialog.close) togglesDialog.close(); else togglesDialog.removeAttribute('open');
  });
  document.getElementById('toggle-add').addEventListener('click', function () {
    var labelEl = document.getElementById('toggle-label');
    var seqEl = document.getElementById('toggle-seq');
    var label = labelEl.value.trim();
    var seq = parseFloat(seqEl.value);
    if (!label || !isFinite(seq) || seq <= 0) {
      togglesError.textContent = 'Enter a label and a valid sequence number';
      return;
    }
    togglesError.textContent = '';
    toggles.push({ label: label, seq: seq });
    labelEl.value = '';
    seqEl.value = '';
    saveToggles(); renderToggles(); renderTogglesConfig(); sendSettings();
  });
  renderToggles();

  /* ================= Bottom button bar ================= */
  var DEFAULT_BUTTONS = [
    { id: 'highlight', label: 'Highlight', cmd: 'Highlight', visible: true },
    { id: 'next', label: 'Next', cmd: 'Next', visible: true },
    { id: 'prev', label: 'Previous', cmd: 'Previous', visible: true },
    { id: 'set', label: 'Set', cmd: "Set Selection Property 'Active'", visible: true },
    { id: 'full', label: 'Full', cmd: 'At Full', visible: true },
    { id: 'clear', label: 'Clear', cmd: 'Clear', visible: true },
    { id: 'esc', label: 'Esc', cmd: 'Escape', visible: true },
    { id: 'store', label: 'Store', cmd: 'Store', visible: false },
    { id: 'update', label: 'Update', cmd: 'Update', visible: false }
  ];
  var BAR_KEY = 'ma3.bar.v3';
  var barButtons = loadBar();
  var barEl = document.getElementById('bar-buttons');
  var dialog = document.getElementById('config-dialog');
  var listEl = document.getElementById('config-list');

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function loadBar() {
    try {
      var s = JSON.parse(localStorage.getItem(BAR_KEY));
      if (Array.isArray(s) && s.length) return s;
    } catch (e) {}
    return clone(DEFAULT_BUTTONS);
  }
  function saveBar() {
    try { localStorage.setItem(BAR_KEY, JSON.stringify(barButtons)); } catch (e) {}
  }
  function sendSettings(overrides) {
    var settings = {
      name: document.getElementById('client-name').value.trim(),
      ip: ma3State.ip,
      port: ma3State.port,
      frost: frostPresets,
      bar: barButtons,
      toggles: toggles,
      page: localStorage.getItem('ma3.page') || 'encoders'
    };
    Object.assign(settings, overrides || {});
    send({ type: 'saveSettings', settings: settings });
  }

  function renderBar() {
    barEl.innerHTML = '';
    barButtons.forEach(function (def) {
      if (!def.visible) return;
      var b = document.createElement('button');
      b.className = 'bar-btn';
      b.textContent = def.label;
      b.addEventListener('touchstart', function () { b.classList.add('pressed'); }, { passive: true });
      ['touchend', 'touchcancel'].forEach(function (t) {
        b.addEventListener(t, function () { b.classList.remove('pressed'); }, { passive: true });
      });
      b.addEventListener('click', function () {
        cmd(def.cmd);
      });
      barEl.appendChild(b);
    });
  }

  function renderConfig() {
    listEl.innerHTML = '';
    barButtons.forEach(function (def, idx) {
      var li = document.createElement('li');
      var chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = def.visible;
      chk.addEventListener('change', function () { def.visible = chk.checked; saveBar(); renderBar(); sendSettings(); });
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = def.label;
      var small = document.createElement('small');
      small.textContent = def.cmd;
      name.appendChild(small);
      li.appendChild(chk);
      li.appendChild(name);
      [['▲', -1], ['▼', 1]].forEach(function (a) {
        var btn = document.createElement('button');
        btn.textContent = a[0];
        btn.addEventListener('click', function () {
          var to = idx + a[1];
          if (to < 0 || to >= barButtons.length) return;
          var tmp = barButtons[idx]; barButtons[idx] = barButtons[to]; barButtons[to] = tmp;
          saveBar(); renderBar(); renderConfig(); sendSettings();
        });
        li.appendChild(btn);
      });
      if (def.custom) {
        var del = document.createElement('button');
        del.textContent = '✕';
        del.addEventListener('click', function () {
          barButtons.splice(idx, 1);
          saveBar(); renderBar(); renderConfig(); sendSettings();
        });
        li.appendChild(del);
      }
      listEl.appendChild(li);
    });
  }

  document.getElementById('config-close').addEventListener('click', function () {
    if (dialog.close) dialog.close(); else dialog.removeAttribute('open');
  });
  document.getElementById('config-reset').addEventListener('click', function () {
    barButtons = clone(DEFAULT_BUTTONS);
    saveBar(); renderBar(); renderConfig(); sendSettings();
  });
  document.getElementById('custom-add').addEventListener('click', function () {
    var labelEl = document.getElementById('custom-label');
    var cmdEl = document.getElementById('custom-cmd');
    var label = labelEl.value.trim();
    var c = cmdEl.value.trim();
    if (!label || !c) return;
    barButtons.push({ id: 'custom-' + Date.now(), label: label, cmd: c, visible: true, custom: true });
    labelEl.value = '';
    cmdEl.value = '';
    saveBar(); renderBar(); renderConfig(); sendSettings();
  });

  document.getElementById('client-name-save').addEventListener('click', function () {
    sendSettings({ name: document.getElementById('client-name').value.trim() });
    renderClients();
  });

  function renderClients() {
    var list = document.getElementById('client-list');
    fetch('/api/clients').then(function (response) { return response.json(); }).then(function (clients) {
      list.innerHTML = '';
      clients.forEach(function (client) {
        var item = document.createElement('li');
        var name = document.createElement('span');
        name.className = 'name';
        name.textContent = client.name + ' (' + client.ip + ':' + client.port + ')';
        item.appendChild(name);
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.addEventListener('click', function () {
          send({ type: 'deleteClient', clientId: client.id });
          item.remove();
        });
        item.appendChild(remove);
        list.appendChild(item);
      });
    }).catch(function () {});
  }

  renderBar();
  renderConfig();
  renderClients();

  /* ================= Service worker ================= */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }
})();
