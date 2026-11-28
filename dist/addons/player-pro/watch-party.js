(() => {
    const params = new URLSearchParams(window.location.search);
    const workId = params.get('workId') || '';
    const epId = params.get('epId') || '';
    const epNum = parseInt(params.get('ep') || '1', 10) || 1;
    const initialPartyCode = (params.get('party') || '').trim().toUpperCase();

    const state = {
        code: null,
        room: null,
        lastMessageId: 0,
        pollTimer: null,
        suppressLocalEventsUntil: 0,
    };

    const $ = (id) => document.getElementById(id);

    function getVideo() {
        return document.querySelector('video');
    }

    function getCsrfToken() {
        const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    async function api(url, method = 'GET', body = null) {
        const headers = { Accept: 'application/json' };
        if (body !== null) {
            headers['Content-Type'] = 'application/json';
        }
        const xsrf = getCsrfToken();
        if (xsrf) {
            headers['X-XSRF-TOKEN'] = xsrf;
        }
        const res = await fetch(url, {
            method,
            headers,
            credentials: 'same-origin',
            body: body !== null ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.message || data.error || `HTTP ${res.status}`);
        }
        return data;
    }

    function setError(msg) {
        const el = $('wp-error');
        if (!el) return;
        if (!msg) {
            el.textContent = '';
            el.style.display = 'none';
            return;
        }
        el.textContent = msg;
        el.style.display = 'block';
    }

    function renderRoom() {
        const lobbyView = $('wp-lobby-view');
        const activeView = $('wp-active-view');
        const badge = $('wp-btn-badge');
        const liveBadge = $('wp-live-badge');

        if (!state.room) {
            if (lobbyView) lobbyView.style.display = 'flex';
            if (activeView) activeView.style.display = 'none';
            if (badge) badge.style.display = 'none';
            if (liveBadge) liveBadge.style.display = 'none';
            return;
        }

        const r = state.room;
        if (lobbyView) lobbyView.style.display = 'none';
        if (activeView) activeView.style.display = 'flex';

        if (badge) {
            badge.textContent = String(r.membersCount || 1);
            badge.style.display = 'inline-flex';
        }
        if (liveBadge) {
            liveBadge.style.display = r.liveLocked ? 'inline-flex' : 'none';
        }

        const codeEl = $('wp-room-code');
        if (codeEl) codeEl.textContent = r.leaderHandle ? `@${r.leaderHandle}` : r.code;

        const roleEl = $('wp-role-badge');
        if (roleEl) {
            roleEl.textContent = r.isLeader ? 'Líder' : 'Participante';
            roleEl.className = r.isLeader ? 'wp-pill wp-pill-leader' : 'wp-pill wp-pill-member';
        }

        const statusEl = $('wp-status-line');
        if (statusEl) {
            const liveTag = r.liveLocked ? ' • AO VIVO' : '';
            statusEl.textContent = `${r.readyCount}/${r.membersCount} prontos • ${r.status}${liveTag}`;
        }

        const startBtn = $('wp-start-all-btn');
        if (startBtn) {
            startBtn.style.display = r.isLeader && r.status === 'lobby_loading' ? 'block' : 'none';
        }

        const lockNote = $('wp-member-lock-note');
        if (lockNote) {
            lockNote.style.display = !r.isLeader ? 'block' : 'none';
        }
    }

    function appendMessages(messages) {
        if (!Array.isArray(messages) || messages.length === 0) return;
        const list = $('wp-chat-list');
        if (!list) return;

        for (const msg of messages) {
            if (msg.id <= state.lastMessageId) continue;
            state.lastMessageId = msg.id;

            const row = document.createElement('div');
            row.className = 'wp-chat-msg';

            const author = document.createElement('span');
            author.className = 'wp-chat-author';
            author.textContent = `${msg.userName || 'Usuário'}: `;

            const text = document.createElement('span');
            text.textContent = msg.body || '';

            row.appendChild(author);
            row.appendChild(text);
            list.appendChild(row);
        }
        list.scrollTop = list.scrollHeight;
    }

    function syncVideoWithRoom(room) {
        const video = getVideo();
        if (!video || !room) return;

        const now = Date.now();
        if (room.liveLocked) {
            if (Math.abs(video.currentTime - room.liveEdgeSeconds) > 1.8) {
                state.suppressLocalEventsUntil = now + 1200;
                video.currentTime = room.liveEdgeSeconds;
            }
            if (video.paused) {
                state.suppressLocalEventsUntil = now + 1200;
                video.play().catch(() => {});
            }
            return;
        }

        if (room.isLeader) return;

        const targetPos = Number(room.effectivePositionSeconds || 0);
        if (Math.abs(video.currentTime - targetPos) > 1.8) {
            state.suppressLocalEventsUntil = now + 1200;
            video.currentTime = targetPos;
        }

        if (room.status === 'playing' && video.paused) {
            state.suppressLocalEventsUntil = now + 1200;
            video.play().catch(() => {});
        } else if ((room.status === 'paused' || room.status === 'lobby_loading') && !video.paused) {
            state.suppressLocalEventsUntil = now + 1200;
            video.pause();
        }
    }

    async function pollRoom() {
        if (!state.code) return;
        try {
            const qs = state.lastMessageId > 0 ? `?after_id=${state.lastMessageId}` : '';
            const data = await api(`/api/watch-party/rooms/${encodeURIComponent(state.code)}${qs}`);
            if (data.room) {
                state.room = data.room;
                renderRoom();
                appendMessages(data.room.messages || []);
                syncVideoWithRoom(data.room);
            }
        } catch (err) {
            setError(err.message);
        }
    }

    function startPolling() {
        stopPolling();
        if (!state.code || typeof EventSource === 'undefined') return;
        const url = `/api/stream?room_code=${encodeURIComponent(state.code)}`;
        const es = new EventSource(url);
        es.addEventListener('watch_party.updated', (ev) => {
            try {
                const payload = JSON.parse(ev.data);
                if (payload?.room) {
                    if (payload.room.status === 'ended') {
                        stopPolling();
                        state.code = null;
                        state.room = null;
                        renderRoom();
                        return;
                    }
                    const localIsLeader = state.room ? Boolean(state.room.isLeader) : Boolean(payload.room.isLeader);
                    const mergedRoom = { ...payload.room, isLeader: localIsLeader };
                    state.room = mergedRoom;
                    renderRoom();
                    syncVideoWithRoom(mergedRoom);
                }
            } catch {}
        });
        es.addEventListener('watch_party.ended', () => {
            stopPolling();
            state.code = null;
            state.room = null;
            renderRoom();
        });
        es.addEventListener('watch_party.message', (ev) => {
            try {
                const payload = JSON.parse(ev.data);
                if (payload?.message) {
                    appendMessages([payload.message]);
                }
            } catch {}
        });
        state.sseSource = es;
    }

    function stopPolling() {
        if (state.sseSource) {
            try { state.sseSource.close(); } catch {}
            state.sseSource = null;
        }
        if (state.pollTimer) {
            window.clearInterval(state.pollTimer);
            state.pollTimer = null;
        }
    }

    async function enterRoom(roomData) {
        state.code = roomData.code;
        state.room = roomData;
        state.lastMessageId = 0;
        const list = $('wp-chat-list');
        if (list) list.innerHTML = '';
        setError('');
        renderRoom();
        appendMessages(roomData.messages || []);
        syncVideoWithRoom(roomData);
        startPolling();
    }

    async function sendLeaderControl(action, positionSeconds = null) {
        if (!state.code || !state.room?.isLeader) return;
        try {
            const payload = { action };
            if (positionSeconds !== null) {
                payload.positionSeconds = Math.max(0, Number(positionSeconds));
            }
            const data = await api(`/api/watch-party/rooms/${encodeURIComponent(state.code)}/control`, 'POST', payload);
            if (data.room) {
                state.room = data.room;
                renderRoom();
            }
        } catch (err) {
            setError(err.message);
        }
    }

    function bindVideoListeners() {
        const video = getVideo();
        if (!video || video.dataset.wpBound === '1') return;
        video.dataset.wpBound = '1';

        video.addEventListener('play', () => {
            if (!state.room || Date.now() < state.suppressLocalEventsUntil) return;
            if (state.room.isLeader) {
                sendLeaderControl('play', video.currentTime);
            } else if (state.room.status !== 'playing') {
                state.suppressLocalEventsUntil = Date.now() + 800;
                video.pause();
            }
        });

        video.addEventListener('pause', () => {
            if (!state.room || Date.now() < state.suppressLocalEventsUntil) return;
            if (state.room.isLeader) {
                sendLeaderControl('pause', video.currentTime);
            } else if (state.room.status === 'playing') {
                state.suppressLocalEventsUntil = Date.now() + 800;
                video.play().catch(() => {});
            }
        });

        video.addEventListener('seeked', () => {
            if (!state.room || Date.now() < state.suppressLocalEventsUntil) return;
            if (state.room.liveLocked && video.currentTime > state.room.liveEdgeSeconds + 1.5) {
                state.suppressLocalEventsUntil = Date.now() + 800;
                video.currentTime = state.room.liveEdgeSeconds;
                return;
            }
            if (state.room.isLeader) {
                sendLeaderControl('seek', video.currentTime);
            } else {
                syncVideoWithRoom(state.room);
            }
        });
    }

    function init() {
        const toggleBtn = $('wp-toggle-btn');
        const closeBtn = $('wp-close-btn');
        const drawer = $('wp-drawer');

        toggleBtn?.addEventListener('click', () => {
            drawer?.classList.toggle('wp-open');
            bindVideoListeners();
        });
        closeBtn?.addEventListener('click', () => drawer?.classList.remove('wp-open'));

        $('wp-create-party-btn')?.addEventListener('click', async () => {
            setError('');
            try {
                const password = ($('wp-create-password')?.value || '').trim();
                const payload = {
                    mode: 'party',
                    workId,
                    episodeId: epId || null,
                    episodeNumber: epNum,
                };
                if (password) {
                    payload.password = password;
                }
                const data = await api('/api/watch-party/rooms', 'POST', payload);
                await enterRoom(data.room);
            } catch (err) {
                setError(err.message);
            }
        });

        $('wp-create-live-btn')?.addEventListener('click', async () => {
            setError('');
            try {
                const data = await api('/api/watch-party/rooms', 'POST', {
                    mode: 'live_launch',
                    workId,
                    episodeId: epId || null,
                    episodeNumber: epNum,
                    isPublic: true,
                });
                await enterRoom(data.room);
            } catch (err) {
                setError(err.message);
            }
        });

        $('wp-join-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const code = ($('wp-join-code')?.value || '').trim().toUpperCase();
            if (!code) return;
            setError('');
            try {
                const data = await api(`/api/watch-party/rooms/${encodeURIComponent(code)}/join`, 'POST', { ready: true });
                await enterRoom(data.room);
            } catch (err) {
                setError(err.message);
            }
        });

        $('wp-start-all-btn')?.addEventListener('click', () => {
            const video = getVideo();
            sendLeaderControl('play', video ? video.currentTime : 0);
        });

        $('wp-copy-code-btn')?.addEventListener('click', async () => {
            if (!state.code) return;
            try {
                await navigator.clipboard.writeText(state.code);
                const btn = $('wp-copy-code-btn');
                if (btn) {
                    const prev = btn.textContent;
                    btn.textContent = 'Copiado!';
                    setTimeout(() => { btn.textContent = prev; }, 1500);
                }
            } catch (_) {}
        });

        $('wp-leave-btn')?.addEventListener('click', async () => {
            if (!state.code) return;
            const code = state.code;
            stopPolling();
            state.code = null;
            state.room = null;
            renderRoom();
            try {
                await api(`/api/watch-party/rooms/${encodeURIComponent(code)}/leave`, 'POST');
            } catch (_) {}
        });

        $('wp-chat-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = $('wp-chat-input');
            const body = (input?.value || '').trim();
            if (!body || !state.code) return;
            input.value = '';
            try {
                const data = await api(`/api/watch-party/rooms/${encodeURIComponent(state.code)}/messages`, 'POST', { body });
                if (data.message) {
                    appendMessages([data.message]);
                }
            } catch (err) {
                setError(err.message);
            }
        });

        bindVideoListeners();
        renderRoom();

        // Broadcast live playback progress to parent window every 5s (and on pause)
        const emitProgress = () => {
            const video = getVideo();
            if (!video || !workId) return;
            const pos = Math.floor(video.currentTime || 0);
            const dur = Math.floor(video.duration || 0);
            const isWatched = dur > 0 && pos >= Math.max(0, dur - 300);
            try {
                window.parent?.postMessage({
                    type: 'ANIRIUM_EPISODE_PROGRESS',
                    workId,
                    episodeId: epId || null,
                    episodeNumber: epNum,
                    title: params.get('title') || '',
                    positionSeconds: pos,
                    durationSeconds: dur,
                    isWatched,
                    updatedAt: new Date().toISOString(),
                }, '*');
            } catch (_) {}
        };
        window.setInterval(emitProgress, 5000);
        window.addEventListener('beforeunload', emitProgress);
        getVideo()?.addEventListener('pause', emitProgress);

        if (initialPartyCode) {
            drawer?.classList.add('wp-open');
            api(`/api/watch-party/rooms/${encodeURIComponent(initialPartyCode)}/join`, 'POST', { ready: true })
                .then((data) => enterRoom(data.room))
                .catch((err) => setError(err.message));
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
