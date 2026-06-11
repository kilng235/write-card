var App = {
  activeModuleId: null,
  isGenerating: false,
  conversationHistory: [],
  allYamlBlocks: [],
  insertIndex: -1,
  insertRole: 'user',
  pendingImage: null,

  async init() {
    await API.initConfig();

    var ok = await Templates.init();
    if (!ok) {
      alert('加载 preset.json 失败');
      return;
    }

    this.renderModules();
    this.setupModelPickers();
    this.bindEvents();
    this.applyPlatformState();
    this.loadSettingsToForm();
    this.renderSessionList();

    var sessions = Sessions.getAll();
    if (sessions.length > 0) {
      this.restoreSession(sessions[0].id);
    } else {
      this.newSession();
    }

    // Check for updates in the background (non-blocking)
    if (typeof UpdateChecker !== 'undefined' && typeof UpdateChecker.checkAndPrompt === 'function') {
      setTimeout(function deferredUpdateCheck() {
        UpdateChecker.checkAndPrompt().catch(function onUpdateErr(e) {
          console.warn('[UpdateChecker] Silent error:', e);
        });
      }, 2000);
    }
  },

  applyPlatformState() {
    document.body.classList.toggle('platform-android', Platform.isAndroidApp);
    document.body.classList.toggle('platform-web', !Platform.isAndroidApp);

    var apiKeyNote = document.getElementById('api-key-note');
    if (apiKeyNote) {
      apiKeyNote.textContent = Platform.isAndroidApp
        ? '密钥仅保存在这台手机上，请求会直接发往你配置的模型接口。'
        : '密钥仅保存在当前设备。';
    }

    var uploadBtn = document.getElementById('btn-upload-img');
    if (uploadBtn && Platform.isAndroidApp) {
      uploadBtn.style.display = 'none';
    }
  },

  renderSessionList() {
    var container = document.getElementById('session-list');
    var sessions = Sessions.getAll();
    container.innerHTML = '';

    if (!sessions.length) {
      container.innerHTML =
        '<p style="padding:12px;font-size:12px;color:var(--text-muted);text-align:center">暂无会话</p>';
      return;
    }

    for (var session of sessions) {
      var item = document.createElement('div');
      item.className = 'session-item' + (session.id === Sessions.currentSessionId ? ' active' : '');
      item.dataset.id = session.id;

      var name = document.createElement('span');
      name.className = 'session-name';
      name.textContent = session.name;
      name.title = session.name;

      var time = document.createElement('span');
      time.className = 'session-time';
      time.textContent = Sessions.formatTime(session.updatedAt);

      var actions = document.createElement('span');
      actions.className = 'session-actions';

      var renameBtn = document.createElement('button');
      renameBtn.textContent = '改名';
      renameBtn.title = '重命名会话';
      renameBtn.addEventListener('click', (function bindRename(id) {
        return function handleRename(event) {
          event.stopPropagation();
          App.renameSession(id);
        };
      })(session.id));

      var deleteBtn = document.createElement('button');
      deleteBtn.textContent = '删除';
      deleteBtn.title = '删除会话';
      deleteBtn.addEventListener('click', (function bindDelete(id) {
        return function handleDelete(event) {
          event.stopPropagation();
          App.deleteSession(id);
        };
      })(session.id));

      actions.appendChild(renameBtn);
      actions.appendChild(deleteBtn);

      item.appendChild(name);
      item.appendChild(time);
      item.appendChild(actions);
      item.addEventListener('click', (function bindRestore(id) {
        return function handleRestore() {
          App.restoreSession(id);
        };
      })(session.id));

      container.appendChild(item);
    }
  },

  newSession() {
    this.saveCurrentSession();

    Sessions.create();
    this.activeModuleId = '13';
    this.conversationHistory = [];
    this.allYamlBlocks = [];
    this.pendingImage = null;

    this.selectModule('13');
    UI.clearChat();
    UI.renderPreview([]);
    this.renderSessionList();
  },

  restoreSession(id) {
    this.saveCurrentSession();

    var session = Sessions.switchTo(id);
    if (!session) return;

    this.activeModuleId = session.activeModuleId || '13';
    this.conversationHistory = Array.isArray(session.conversationHistory)
      ? session.conversationHistory.slice()
      : [];
    this.allYamlBlocks = Array.isArray(session.allYamlBlocks) ? session.allYamlBlocks.slice() : [];
    this.pendingImage = null;

    UI.highlightModule(this.activeModuleId);
    UI.clearChatAndRestore(this.conversationHistory);
    UI.renderPreview(this.allYamlBlocks);
    this.renderSessionList();
  },

  saveCurrentSession() {
    if (!Sessions.currentSessionId) return;

    Sessions.updateCurrent({
      activeModuleId: this.activeModuleId,
      conversationHistory: this.conversationHistory,
      allYamlBlocks: this.allYamlBlocks,
    });
  },

  renameSession(id) {
    var session = Sessions.getAll().find(function findSession(item) {
      return item.id === id;
    });
    if (!session) return;

    var newName = prompt('重命名会话', session.name);
    if (newName && newName.trim()) {
      Sessions.rename(id, newName.trim());
      this.renderSessionList();
    }
  },

  deleteSession(id) {
    if (!confirm('确定删除这个会话吗？')) return;

    Sessions.delete(id);

    if (Sessions.currentSessionId === id || !Sessions.currentSessionId) {
      var sessions = Sessions.getAll();
      if (sessions.length > 0) {
        this.restoreSession(sessions[0].id);
      } else {
        this.newSession();
      }
    } else {
      this.renderSessionList();
    }
  },

  startEditMessage(msgEl) {
    if (this.isGenerating) return;

    var index = parseInt(msgEl.dataset.index, 10);
    if (Number.isNaN(index) || index < 0 || index >= this.conversationHistory.length) return;

    var currentContent = this.conversationHistory[index].content;
    var body = msgEl.querySelector('.msg-body');
    var originalHTML = body.innerHTML;

    body.innerHTML = [
      '<textarea class="msg-edit-input" rows="4"></textarea>',
      '<div class="msg-edit-actions">',
      '<button class="btn-primary msg-edit-save" data-index="' + index + '">保存并重新生成</button>',
      '<button class="btn-secondary msg-edit-cancel">取消</button>',
      '<span class="msg-edit-hint">保存后会移除后续回复，并从这里重新生成。</span>',
      '</div>',
    ].join('');

    body.classList.add('msg-editing');

    var textarea = body.querySelector('.msg-edit-input');
    textarea.value = currentContent;
    textarea.focus();
    textarea.selectionStart = textarea.value.length;

    body.querySelector('.msg-edit-cancel').addEventListener('click', function cancelEdit() {
      body.innerHTML = originalHTML;
      body.classList.remove('msg-editing');
    });

    body.querySelector('.msg-edit-save').addEventListener('click', (function bindSave(indexValue) {
      return function handleSave() {
        var newContent = textarea.value.trim();
        if (!newContent) return;
        App.confirmEditMessage(indexValue, newContent);
      };
    })(index));
  },

  async confirmEditMessage(index, newContent) {
    if (this.isGenerating) return;

    this.conversationHistory[index].content = newContent;
    this.conversationHistory.splice(index + 1);

    this.rebuildChatUI();
    this.saveCurrentSession();

    var lastMsg = this.conversationHistory[this.conversationHistory.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      await this.resendFromHistory();
    }
  },

  async resendFromHistory() {
    if (this.isGenerating) return;

    var systemPrompt = Templates.buildSystemPrompt(this.activeModuleId);
    var messages = [{ role: 'system', content: systemPrompt }].concat(this.conversationHistory);

    this.isGenerating = true;
    UI.setInputEnabled(false);
    UI.showLoading();

    var msgBody = null;

    await API.sendMessageStream(
      messages,
      function onChunk(_, full) {
        if (!msgBody) {
          UI.hideLoading();
          msgBody = UI.addMessage('assistant', full);
        } else {
          UI.updateMessage(msgBody, full);
        }
      },
      (function bindDone() {
        return function onDone(finalText) {
          App.conversationHistory.push({ role: 'assistant', content: finalText });
          App.updatePreview(finalText);
          App.isGenerating = false;
          UI.setInputEnabled(true);
          App.saveCurrentSession();
        };
      })(),
      (function bindError() {
        return function onError(err) {
          UI.hideLoading();
          UI.addMessage('assistant', '错误：' + err);
          App.isGenerating = false;
          UI.setInputEnabled(true);
        };
      })()
    );
  },

  undoLast() {
    if (this.conversationHistory.length < 2) return;
    this.conversationHistory.splice(-2, 2);
    this.rebuildChatUI();
    this.saveCurrentSession();
  },

  deleteMessage(index) {
    var histIndex = this.getHistoryIndex(index);
    if (histIndex < 0 || histIndex >= this.conversationHistory.length) return;

    this.conversationHistory.splice(histIndex, 1);
    this.rebuildChatUI();
    this.saveCurrentSession();
  },

  openInsertDialog(beforeIndex) {
    this.insertIndex = this.getHistoryIndex(beforeIndex);
    this.insertRole = 'user';
    document.getElementById('insert-content').value = '';
    document.querySelectorAll('.insert-role-btn').forEach(function updateRole(btn) {
      btn.classList.toggle('active', btn.dataset.role === 'user');
    });
    document.getElementById('insert-modal').style.display = 'flex';
  },

  confirmInsert() {
    var content = document.getElementById('insert-content').value.trim();
    if (!content) return;

    this.conversationHistory.splice(this.insertIndex, 0, {
      role: this.insertRole,
      content: content,
    });

    this.rebuildChatUI();
    this.saveCurrentSession();
    this.closeInsert();
  },

  closeInsert() {
    document.getElementById('insert-modal').style.display = 'none';
  },

  getHistoryIndex(domIndex) {
    return parseInt(domIndex, 10);
  },

  rebuildChatUI() {
    this.allYamlBlocks = [];

    for (var msg of this.conversationHistory) {
      if (msg.role === 'assistant') {
        this.allYamlBlocks = this.allYamlBlocks.concat(UI.extractCodeBlocks(msg.content));
      }
    }

    UI.renderPreview(this.allYamlBlocks);
    UI.clearChatAndRestore(this.conversationHistory);
  },

  renderModules() {
    UI.renderModuleList(
      Templates.getModules(),
      (function bindSelect() {
        return function handleSelect(id) {
          App.selectModule(id);
        };
      })(),
      (function bindToggle() {
        return function handleToggle(id) {
          App.toggleModule(id);
        };
      })()
    );
  },

  selectModule(id) {
    this.activeModuleId = id;
    UI.highlightModule(id);
    Sessions.updateCurrent({ activeModuleId: id });
  },

  toggleModule(id) {
    Templates.toggleModule(id);
    this.renderModules();
  },

  async sendMessage() {
    if (this.isGenerating) return;

    if (this.pendingImage) {
      await this.analyzeImage();
      var inputAfterVision = document.getElementById('user-input').value.trim();
      if (!inputAfterVision) return;
    }

    var input = document.getElementById('user-input');
    var text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';

    UI.addMessage('user', text);
    this.conversationHistory.push({ role: 'user', content: text });

    var systemPrompt = Templates.buildSystemPrompt(this.activeModuleId);
    var messages = [{ role: 'system', content: systemPrompt }].concat(this.conversationHistory);

    this.isGenerating = true;
    UI.setInputEnabled(false);
    UI.showLoading();

    var msgBody = null;

    await API.sendMessageStream(
      messages,
      function onChunk(_, full) {
        if (!msgBody) {
          UI.hideLoading();
          msgBody = UI.addMessage('assistant', full);
        } else {
          UI.updateMessage(msgBody, full);
        }
      },
      function onDone(finalText) {
        App.conversationHistory.push({ role: 'assistant', content: finalText });
        App.updatePreview(finalText);
        App.isGenerating = false;
        UI.setInputEnabled(true);
        App.saveCurrentSession();

        if (App.conversationHistory.length === 2) {
          var firstUserMsg = (
            App.conversationHistory.find(function findUser(item) {
              return item.role === 'user';
            }) || { content: '' }
          ).content;
          Sessions.updateCurrent({ name: Sessions.truncate(firstUserMsg, 20) });
          App.renderSessionList();
        }
      },
      function onError(err) {
        UI.hideLoading();
        UI.addMessage('assistant', '错误：' + err);
        App.isGenerating = false;
        UI.setInputEnabled(true);
      }
    );
  },

  updatePreview(text) {
    var blocks = UI.extractCodeBlocks(text);
    this.allYamlBlocks = this.allYamlBlocks.concat(blocks);
    UI.renderPreview(this.allYamlBlocks);
  },

  openNovelModal() {
    document.getElementById('novel-modal').style.display = 'flex';
    document.getElementById('novel-content').focus();
  },

  closeNovelModal() {
    if (this.isGenerating) return;
    document.getElementById('novel-modal').style.display = 'none';
    document.getElementById('novel-file-input').value = '';
    this.setNovelStatus('', '');
  },

  setNovelStatus(message, type) {
    var status = document.getElementById('novel-status');
    if (!message) {
      status.style.display = 'none';
      status.textContent = '';
      status.className = 'novel-status';
      return;
    }

    status.style.display = 'block';
    status.textContent = message;
    status.className = ('novel-status ' + (type || '')).trim();
  },

  splitNovelIntoChunks(text, maxLength) {
    maxLength = maxLength || 6000;

    var normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];

    var paragraphs = normalized
      .split(/\n{2,}/)
      .map(function trimItem(item) {
        return item.trim();
      })
      .filter(Boolean);

    var chunks = [];
    var current = '';

    function pushCurrent() {
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
    }

    for (var paragraph of paragraphs) {
      if (paragraph.length > maxLength) {
        pushCurrent();

        var start = 0;
        while (start < paragraph.length) {
          chunks.push(paragraph.slice(start, start + maxLength).trim());
          start += maxLength;
        }
        continue;
      }

      var candidate = current ? current + '\n\n' + paragraph : paragraph;
      if (candidate.length > maxLength) {
        pushCurrent();
        current = paragraph;
      } else {
        current = candidate;
      }
    }

    pushCurrent();
    return chunks;
  },

  async readNovelFile(file) {
    var buffer = await file.arrayBuffer();

    function tryDecode(encoding) {
      try {
        return new TextDecoder(encoding, { fatal: true }).decode(buffer);
      } catch {
        return null;
      }
    }

    var encodings = ['utf-8', 'gb18030', 'gbk', 'utf-16le'];
    for (var encoding of encodings) {
      var decoded = tryDecode(encoding);
      if (decoded && decoded.replace(/\s/g, '').length > 0) {
        return decoded.replace(/^\uFEFF/, '');
      }
    }

    return new TextDecoder().decode(buffer).replace(/^\uFEFF/, '');
  },

  async handleNovelFileSelect(file) {
    if (!file) return;

    var fileNameEl = document.getElementById('novel-file-name');
    var contentEl = document.getElementById('novel-content');
    var titleEl = document.getElementById('novel-title');

    try {
      this.setNovelStatus('正在读取小说文件...', 'running');
      var text = await this.readNovelFile(file);

      if (!text.trim()) {
        throw new Error('所选文件为空。');
      }

      contentEl.value = text.trim();
      fileNameEl.textContent = '已导入：' + file.name;

      if (!titleEl.value.trim()) {
        titleEl.value = file.name.replace(/\.[^.]+$/, '');
      }

      this.setNovelStatus('已导入：' + file.name, 'running');
      setTimeout((function clearStatus() {
        return function resetStatus() {
          App.setNovelStatus('', '');
        };
      })(), 1800);
    } catch (err) {
      fileNameEl.textContent = '导入失败';
      this.setNovelStatus('文件导入失败：' + err.message, 'error');
    }
  },

  buildNovelFocusText() {
    var focus = [];
    if (document.getElementById('novel-focus-world').checked) focus.push('世界观');
    if (document.getElementById('novel-focus-characters').checked) focus.push('主要角色');
    if (document.getElementById('novel-focus-optimize').checked) focus.push('优化表达');
    return focus.length ? focus.join('、') : '世界观和主要角色';
  },

  async runNovelExtraction() {
    if (this.isGenerating) return;

    var title = document.getElementById('novel-title').value.trim();
    var content = document.getElementById('novel-content').value.trim();
    var note = document.getElementById('novel-note').value.trim();
    var focusText = this.buildNovelFocusText();
    var runBtn = document.getElementById('btn-run-novel');

    if (!content) {
      this.setNovelStatus('请先粘贴或导入小说正文。', 'error');
      return;
    }

    var chunks = this.splitNovelIntoChunks(content);
    if (!chunks.length) {
      this.setNovelStatus('小说内容为空。', 'error');
      return;
    }

    this.isGenerating = true;
    UI.setInputEnabled(false);
    runBtn.disabled = true;

    try {
      this.setNovelStatus('已切分为 ' + chunks.length + ' 段，正在阅读...', 'running');

      var chunkSummaries = [];
      for (var i = 0; i < chunks.length; i += 1) {
        this.setNovelStatus('正在阅读第 ' + (i + 1) + ' / ' + chunks.length + ' 段...', 'running');

        var chunkMessages = [
          {
            role: 'system',
            content:
              '你是小说设定编辑。请阅读给定片段，只提取对世界观、角色、关系、阵营、冲突和设定线索真正有用的信息，忠于原文并保持结构清晰。',
          },
          {
            role: 'user',
            content: [
              title ? '小说标题：' + title : '',
              '提取重点：' + focusText,
              note ? '补充要求：' + note : '',
              '这是第 ' + (i + 1) + ' / ' + chunks.length + ' 段，请提取：',
              '1. 当前片段补充或明确了哪些世界观信息',
              '2. 当前片段出现或强化了哪些主要角色信息',
              '3. 人物关系、阵营、冲突、悬念或关键设定线索',
              '4. 只保留对后续写卡或设定整理有价值的内容',
              '',
              chunks[i],
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ];

        var summary = await API.sendMessageOnce(chunkMessages, {
          temperature: 0.3,
          maxTokens: 1800,
        });

        chunkSummaries.push('[第 ' + (i + 1) + ' 段摘要]\n' + summary);
      }

      this.setNovelStatus('正在合并各段摘要并生成最终提取结果...', 'running');

      var finalMessages = [
        {
          role: 'system',
          content:
            '你是资深小说策划与角色设定编辑。请把分段摘要整合成忠于原文、但更适合继续做世界观卡和角色卡的结果，不要虚构原文没有支持的信息。',
        },
        {
          role: 'user',
          content: [
            title ? '小说标题：' + title : '',
            '提取重点：' + focusText,
            note ? '补充要求：' + note : '',
            '',
            '请按以下结构输出：',
            '1. 一段简短总评，说明作品气质和适合提取的方向',
            '2. 整理后的世界观部分，包含时代、背景、规则、势力、冲突和关键词',
            '3. 主要角色设计，包含身份定位、外在特征、性格、动机、关系线和写卡亮点',
            '4. 如果信息足够，请附一个 YAML 代码块，至少包含 worldview 和 characters 两部分',
            '',
            '以下是分段摘要：',
            chunkSummaries.join('\n\n'),
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ];

      var finalText = await API.sendMessageOnce(finalMessages, {
        temperature: 0.5,
        maxTokens: 3200,
      });

      var userSummary = title
        ? '[小说提取] ' + title + '：提取并优化世界观与主要角色设计'
        : '[小说提取] 提取并优化世界观与主要角色设计';

      UI.addMessage('user', userSummary);
      UI.addMessage('assistant', finalText);

      this.conversationHistory.push(
        { role: 'user', content: userSummary },
        { role: 'assistant', content: finalText }
      );

      this.updatePreview(finalText);
      this.saveCurrentSession();
      this.renderSessionList();

      document.getElementById('novel-modal').style.display = 'none';
      this.setNovelStatus('', '');
    } catch (err) {
      this.setNovelStatus('提取失败：' + err.message, 'error');
    } finally {
      this.isGenerating = false;
      UI.setInputEnabled(true);
      runBtn.disabled = false;
    }
  },

  bindEvents() {
    document.getElementById('btn-send').addEventListener('click', (function bindSend() {
      return function handleSend() {
        App.sendMessage();
      };
    })());

    var input = document.getElementById('user-input');
    input.addEventListener('keydown', function handleKeydown(event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        App.sendMessage();
      }
    });

    input.addEventListener('input', function handleInput() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    document.getElementById('btn-settings').addEventListener('click', function openSettings() {
      App.openSettings();
    });
    document.getElementById('btn-new-session').addEventListener('click', function newSession() {
      App.newSession();
    });
    document.getElementById('btn-new-chat').addEventListener('click', function newChat() {
      App.newSession();
    });
    document.getElementById('btn-undo').addEventListener('click', function undo() {
      App.undoLast();
    });
    document.getElementById('btn-open-novel').addEventListener('click', function openNovel() {
      App.openNovelModal();
    });
    document.getElementById('btn-run-novel').addEventListener('click', function runNovel() {
      App.runNovelExtraction();
    });
    document.getElementById('btn-upload-novel-file').addEventListener('click', function triggerNovelFile() {
      document.getElementById('novel-file-input').click();
    });
    document.getElementById('novel-file-input').addEventListener('change', async function handleNovelFile(event) {
      var file = event.target.files && event.target.files[0];
      if (file) {
        await App.handleNovelFileSelect(file);
      }
    });

    document.querySelectorAll('.insert-role-btn').forEach(function bindRoleButton(btn) {
      btn.addEventListener('click', function changeRole() {
        document.querySelectorAll('.insert-role-btn').forEach(function clearState(item) {
          item.classList.remove('active');
        });
        btn.classList.add('active');
        App.insertRole = btn.dataset.role;
      });
    });

    document.getElementById('btn-load-models').addEventListener('click', function loadModels() {
      App.loadModels();
    });
    document.getElementById('btn-load-aux-models').addEventListener('click', function loadAuxModels() {
      App.loadAuxModels();
    });

    var modelPicker = document.getElementById('cfg-model-select');
    if (modelPicker) {
      modelPicker.addEventListener('change', function changeModel(event) {
        document.getElementById('cfg-model').value = event.target.value;
      });
    }

    var auxModelPicker = document.getElementById('cfg-aux-model-select');
    if (auxModelPicker) {
      auxModelPicker.addEventListener('change', function changeAuxModel(event) {
        document.getElementById('cfg-aux-model').value = event.target.value;
      });
    }

    var uploadImageBtn = document.getElementById('btn-upload-img');
    if (uploadImageBtn) {
      uploadImageBtn.addEventListener('click', function triggerImageInput() {
        App.triggerFileInput();
      });
    }

    document.getElementById('file-input').addEventListener('change', function handleImageFile(event) {
      if (event.target.files[0]) App.handleFileSelect(event.target.files[0]);
    });

    document.getElementById('btn-remove-img').addEventListener('click', function removeImage() {
      App.removePendingImage();
    });

    document.getElementById('btn-copy-all').addEventListener('click', function copyAll() {
      if (!App.allYamlBlocks.length) return;

      UI.copyText(UI.formatPreviewBlocks(App.allYamlBlocks)).then(function copied() {
        var btn = document.getElementById('btn-copy-all');
        btn.textContent = '已复制';
        setTimeout(function resetCopyText() {
          btn.textContent = '复制';
        }, 1500);
      }).catch(function onCopyError() {
        var btn = document.getElementById('btn-copy-all');
        btn.textContent = '复制失败';
        setTimeout(function resetCopyText() {
          btn.textContent = '复制';
        }, 1500);
      });
    });

    document.getElementById('btn-export').addEventListener('click', function exportYaml() {
      UI.exportCodeBlocks(App.allYamlBlocks);
    });
  },

  openSettings() {
    this.loadSettingsToForm();
    document.getElementById('settings-modal').style.display = 'flex';
  },

  loadSettingsToForm() {
    var config = API.getConfig();

    document.getElementById('cfg-base-url').value = config.baseUrl || '';
    document.getElementById('cfg-api-key').value = '';
    document.getElementById('cfg-api-key').placeholder = config.hasApiKey
      ? '留空则保持当前密钥不变'
      : 'sk-...';
    document.getElementById('cfg-model').value = config.model || '';
    document.getElementById('cfg-temperature').value = config.temperature || '0.8';
    document.getElementById('cfg-max-tokens').value = config.maxTokens || '4096';
    document.getElementById('cfg-user-name').value = config.userName || '';
    document.getElementById('cfg-char-name').value = config.charName || '';
    document.getElementById('cfg-aux-base-url').value = config.auxBaseUrl || '';
    document.getElementById('cfg-aux-api-key').value = '';
    document.getElementById('cfg-aux-api-key').placeholder = config.hasAuxApiKey
      ? '留空则保持当前密钥不变'
      : '可选，留空则沿用主密钥';
    document.getElementById('cfg-aux-model').value = config.auxModel || '';
  },

  triggerFileInput() {
    if (Platform.isAndroidApp) return;
    document.getElementById('file-input').click();
  },

  handleFileSelect(file) {
    if (!file || !file.type.startsWith('image/')) return;

    var reader = new FileReader();
    reader.onload = function handleLoad(event) {
      var result = event.target.result;
      var base64 = result.split(',')[1];
      App.pendingImage = {
        base64: base64,
        mimeType: file.type,
        fileName: file.name,
      };
      document.getElementById('upload-thumb').src = result;
      document.getElementById('upload-preview').style.display = 'flex';
    };
    reader.readAsDataURL(file);
  },

  removePendingImage() {
    this.pendingImage = null;
    document.getElementById('upload-preview').style.display = 'none';
    document.getElementById('upload-thumb').src = '';
    document.getElementById('file-input').value = '';
  },

  async analyzeImage() {
    if (!this.pendingImage) return null;

    UI.addMessage('user', '[已上传一张图片用于外貌分析]');

    this.isGenerating = true;
    UI.setInputEnabled(false);
    UI.showLoading();

    try {
      var result = await API.analyzeImage(this.pendingImage.base64, this.pendingImage.mimeType);

      UI.hideLoading();
      UI.addMessage(
        'assistant',
        '**识图结果**\n\n' +
          result +
          '\n\n---\n你可以直接基于这些外貌信息继续写卡，或进一步要求调整。'
      );

      this.conversationHistory.push(
        { role: 'user', content: '[已上传一张图片用于外貌分析]' },
        { role: 'assistant', content: result }
      );

      this.saveCurrentSession();
      this.removePendingImage();

      return result;
    } catch (err) {
      UI.hideLoading();
      UI.addMessage('assistant', '识图请求失败：' + err.message);
      this.removePendingImage();
      return null;
    } finally {
      this.isGenerating = false;
      UI.setInputEnabled(true);
    }
  },

  setupModelPickers() {
    this.ensureModelPicker('cfg-model', 'cfg-model-select', '请先加载模型，再从这里选择');
    this.ensureModelPicker('cfg-aux-model', 'cfg-aux-model-select', '请先加载识图模型，再从这里选择');
  },

  ensureModelPicker(inputId, pickerId, placeholder) {
    var input = document.getElementById(inputId);
    if (!input) return;

    var datalistId = input.getAttribute('list');
    if (datalistId) {
      input.removeAttribute('list');
      var datalist = document.getElementById(datalistId);
      if (datalist) datalist.remove();
    }

    if (document.getElementById(pickerId)) return;

    var row = input.closest('.model-row');
    if (!row) return;

    var picker = document.createElement('select');
    picker.id = pickerId;
    picker.className = 'model-select';
    picker.disabled = true;

    var option = document.createElement('option');
    option.value = '';
    option.textContent = placeholder;
    picker.appendChild(option);

    row.insertAdjacentElement('afterend', picker);
  },

  populateModelPicker(pickerId, inputId, models, placeholder) {
    var picker = document.getElementById(pickerId);
    var input = document.getElementById(inputId);
    if (!picker || !input) return;

    picker.innerHTML = '';

    var defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = placeholder;
    picker.appendChild(defaultOption);

    for (var model of models) {
      var option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      picker.appendChild(option);
    }

    picker.disabled = models.length === 0;
    picker.value = models.includes(input.value) ? input.value : '';
  },
};

function closeInsert() {
  App.closeInsert();
}

function confirmInsert() {
  App.confirmInsert();
}

function closeNovelModal() {
  App.closeNovelModal();
}

function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}

function collectSettingsPayload() {
  return {
    baseUrl: document.getElementById('cfg-base-url').value.trim(),
    apiKey: document.getElementById('cfg-api-key').value.trim(),
    model: document.getElementById('cfg-model').value.trim(),
    temperature: document.getElementById('cfg-temperature').value,
    maxTokens: document.getElementById('cfg-max-tokens').value,
    userName: document.getElementById('cfg-user-name').value.trim(),
    charName: document.getElementById('cfg-char-name').value.trim(),
    auxBaseUrl: document.getElementById('cfg-aux-base-url').value.trim(),
    auxApiKey: document.getElementById('cfg-aux-api-key').value.trim(),
    auxModel: document.getElementById('cfg-aux-model').value.trim(),
  };
}

App.loadModels = async function loadModelsSecure() {
  var status = document.getElementById('model-status');
  var btn = document.getElementById('btn-load-models');
  var payload = collectSettingsPayload();

  if (!payload.baseUrl) {
    status.textContent = '请先填写接口地址。';
    status.style.color = 'var(--accent)';
    return;
  }

  btn.disabled = true;
  btn.textContent = '加载中...';
  status.textContent = '正在获取模型列表...';
  status.style.color = 'var(--text-muted)';

  try {
    await API.saveConfig(payload);
    this.loadSettingsToForm();

    var models = await API.loadModels();
    if (!models.length) {
      status.textContent = '没有获取到可用模型。';
      status.style.color = 'var(--accent)';
      return;
    }

    this.populateModelPicker('cfg-model-select', 'cfg-model', models, '请选择已加载的模型');
    status.textContent = '已加载 ' + models.length + ' 个模型。';
    status.style.color = 'var(--success)';
  } catch (err) {
    status.textContent = '加载模型失败：' + err.message;
    status.style.color = 'var(--accent)';
  } finally {
    btn.disabled = false;
    btn.textContent = '加载模型';
  }
};

App.loadAuxModels = async function loadAuxModelsSecure() {
  var status = document.getElementById('aux-model-status');
  var btn = document.getElementById('btn-load-aux-models');
  var payload = collectSettingsPayload();

  btn.disabled = true;
  btn.textContent = '加载中...';
  status.textContent = '正在获取识图模型列表...';
  status.style.color = 'var(--text-muted)';

  try {
    await API.saveConfig(payload);
    this.loadSettingsToForm();

    var models = await API.loadAuxModels();
    if (!models.length) {
      status.textContent = '没有获取到可用识图模型。';
      status.style.color = 'var(--accent)';
      return;
    }

    this.populateModelPicker('cfg-aux-model-select', 'cfg-aux-model', models, '请选择已加载的识图模型');
    status.textContent = '已加载 ' + models.length + ' 个识图模型。';
    status.style.color = 'var(--success)';
  } catch (err) {
    status.textContent = '加载识图模型失败：' + err.message;
    status.style.color = 'var(--accent)';
  } finally {
    btn.disabled = false;
    btn.textContent = '加载识图模型';
  }
};

async function saveSettings() {
  try {
    await API.saveConfig(collectSettingsPayload());
    App.loadSettingsToForm();
    closeSettings();
  } catch (err) {
    alert(err.message || '保存设置失败。');
  }
}

document.addEventListener('DOMContentLoaded', function onReady() {
  App.init();
});
