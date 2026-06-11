var Sessions = {
  STORAGE_KEY: 'wc_sessions',
  currentSessionId: null,

  getAll() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  },

  saveAll(sessions) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessions));
  },

  create(name) {
    const sessions = this.getAll();
    const session = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name || this.formatTime(Date.now()),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      activeModuleId: null,
      conversationHistory: [],
      allYamlBlocks: [],
    };

    sessions.unshift(session);
    this.saveAll(sessions);
    this.currentSessionId = session.id;
    return session;
  },

  getCurrent() {
    if (!this.currentSessionId) return null;
    return this.getAll().find((session) => session.id === this.currentSessionId) || null;
  },

  switchTo(id) {
    this.currentSessionId = id;
    return this.getCurrent();
  },

  updateCurrent(data) {
    if (!this.currentSessionId) return;

    const sessions = this.getAll();
    const index = sessions.findIndex((session) => session.id === this.currentSessionId);
    if (index === -1) return;

    Object.assign(sessions[index], data, { updatedAt: Date.now() });
    this.saveAll(sessions);
  },

  rename(id, name) {
    const sessions = this.getAll();
    const session = sessions.find((item) => item.id === id);
    if (!session) return;

    session.name = name;
    session.updatedAt = Date.now();
    this.saveAll(sessions);
  },

  delete(id) {
    let sessions = this.getAll();
    sessions = sessions.filter((session) => session.id !== id);
    this.saveAll(sessions);

    if (this.currentSessionId === id) {
      this.currentSessionId = sessions[0]?.id || null;
    }
  },

  formatTime(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  truncate(text, len = 30) {
    if (!text) return '';
    return text.length > len ? `${text.slice(0, len)}...` : text;
  },
};
