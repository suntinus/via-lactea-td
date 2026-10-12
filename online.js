(function onlineClient() {
  const game = window.ViaLacteaGame;
  if (!game) return;

  const statusEl = document.getElementById('onlineStatus');
  const linkEl = document.getElementById('onlineLink');
  const playersEl = document.getElementById('onlinePlayers');
  const nickEl = document.getElementById('onlineNick');
  const codeEl = document.getElementById('onlineCode');
  const readyBtn = document.getElementById('btnOnlineReady');
  const STORAGE_KEY = 'viaLacteaTdOnline';

  let socket = null;
  let session = null;
  let manualClose = false;
  let ready = false;
  let reconnectTimer = null;
  let reconnects = 0;

  function wsUrl() {
    const params = new URLSearchParams(location.search);
    const fromQuery = params.get('ws');
    if (fromQuery) return fromQuery;
    const localHost = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    if ((location.protocol === 'http:' || location.protocol === 'https:') && localHost) {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${location.host}`;
    }
    return 'ws://127.0.0.1:8030';
  }

  function httpBase() {
    return wsUrl().replace(/^ws/i, 'http').replace(/\/$/, '');
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function selectedBase() {
    const active = document.querySelector('#onlineBases .pick.active');
    return active ? active.getAttribute('data-base-online') : 'terra';
  }

  function remember(welcome) {
    session = { sessionId: welcome.sessionId, token: welcome.token, wsUrl: wsUrl() };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch { /* ignore */ }
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.sessionId || !parsed.token) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function clearSession() {
    session = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  function renderLobby(view) {
    if (!view) return;
    const link = `${httpBase()}/game.html?convite=${view.inviteCode}`;
    if (linkEl) linkEl.textContent = `Convite ${view.inviteCode} · ${link}`;
    if (playersEl) {
      const other = view.opponentNick ? view.opponentNick : 'aguardando amigo';
      const youState = view.youReady ? 'pronto' : 'no lobby';
      const otherState = view.opponentNick ? (view.opponentReady ? 'pronto' : 'no lobby') : '';
      playersEl.textContent = `Você (${view.youNick}, ${youState}) · ${other}${otherState ? ` (${otherState})` : ''}`;
    }
    if (readyBtn) readyBtn.textContent = view.youReady ? 'Cancelar pronto' : 'Ficar pronto';
    ready = !!view.youReady;
    if (!view.match) {
      setStatus(view.opponentNick
        ? 'Os dois ficam prontos para começar. Magic link fica para uma versão futura.'
        : 'Envie o link para um amigo. Login desta versão: código de convite + nick.');
    } else if (view.pause) {
      setStatus(`Conexão do amigo caiu. A partida espera ${Math.ceil(view.pause.secondsLeft)}s.`);
    } else if (view.match.phase === 'over') {
      setStatus('Partida encerrada. O ranking entre amigos foi atualizado.');
    }
  }

  function onMessage(raw) {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'welcome') {
      reconnects = 0;
      remember(message);
      game.applyOnline(message.view);
      renderLobby(message.view);
      return;
    }
    if (message.type === 'state') {
      game.applyOnline(message.view);
      renderLobby(message.view);
      return;
    }
    if (message.type === 'error') {
      setStatus(message.message || 'Erro.');
      if (message.code === 'sessao') clearSession();
    }
  }

  function bindSocket(sock) {
    sock.addEventListener('message', (event) => onMessage(event.data));
    sock.addEventListener('close', () => {
      if (manualClose) return;
      if (reconnects >= 4) {
        setStatus('Não reconectou. Entre de novo com o código de convite.');
        return;
      }
      reconnects += 1;
      setStatus('Conexão caiu. Tentando reconectar…');
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        if (session) openSocket(() => {
          sockSend({ type: 'resume', sessionId: session.sessionId, token: session.token });
        });
      }, 800);
    });
    sock.addEventListener('error', () => {
      setStatus('Não conectou em ' + wsUrl() + '. Suba o servidor com npm run dev (127.0.0.1:8030).');
    });
  }

  function sockSend(message) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  }

  function openSocket(onOpen) {
    manualClose = false;
    if (socket && socket.readyState === WebSocket.OPEN) {
      onOpen();
      return;
    }
    socket = new WebSocket(wsUrl());
    bindSocket(socket);
    socket.addEventListener('open', () => {
      setStatus('Conectado.');
      game.setOnlineSender(sockSend);
      onOpen();
    });
  }

  function nickValue() {
    return nickEl && nickEl.value ? nickEl.value.trim() : '';
  }

  function hello(inviteCode) {
    const nick = nickValue();
    if (!nick) {
      setStatus('Digite um nick.');
      return;
    }
    openSocket(() => {
      const message = { type: 'hello', nick };
      if (inviteCode) message.inviteCode = inviteCode;
      sockSend(message);
    });
  }

  document.querySelectorAll('#onlineBases [data-base-online]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('#onlineBases [data-base-online]').forEach((item) => {
        item.classList.toggle('active', item === button);
      });
      if (socket && socket.readyState === WebSocket.OPEN) {
        sockSend({ type: 'lobby', base: selectedBase(), ready });
      }
    });
  });

  const createBtn = document.getElementById('btnOnlineCreate');
  const joinBtn = document.getElementById('btnOnlineJoin');
  const copyBtn = document.getElementById('btnOnlineCopy');
  if (createBtn) createBtn.addEventListener('click', () => hello(''));
  if (joinBtn) {
    joinBtn.addEventListener('click', () => {
      const code = codeEl && codeEl.value ? codeEl.value.trim() : '';
      if (!code) {
        setStatus('Cole o código de convite.');
        return;
      }
      hello(code);
    });
  }
  if (readyBtn) {
    readyBtn.addEventListener('click', () => {
      ready = !ready;
      sockSend({ type: 'lobby', ready, base: selectedBase() });
    });
  }
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const text = linkEl ? linkEl.textContent : '';
      const match = text.match(/https?:\/\/\S+/);
      const value = match ? match[0] : text;
      if (!value || !navigator.clipboard) {
        setStatus(value || 'Crie a sala para gerar o link.');
        return;
      }
      navigator.clipboard.writeText(value).then(() => {
        setStatus('Link copiado.');
      }).catch(() => {
        setStatus(value);
      });
    });
  }

  game.setOnlineSender(sockSend);
  const preset = new URLSearchParams(location.search).get('convite');
  if (preset) {
    game.showFriendSetup(preset);
    if (codeEl) codeEl.value = preset.toUpperCase();
  }
  const saved = loadSession();
  if (saved && (!preset || saved.wsUrl === wsUrl())) {
    session = saved;
    openSocket(() => sockSend({ type: 'resume', sessionId: saved.sessionId, token: saved.token }));
  }
}());
