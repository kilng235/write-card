var UI = {
  renderModuleList(modules, onSelect, onToggle) {
    var container = document.getElementById('module-list');
    container.innerHTML = '';

    var categoryNames = {
      core: '核心',
      principles: '原则',
      creation: '创作',
      mvu: 'MVU',
      ejs: 'EJS',
      review: '评估',
    };

    var currentCategory = '';

    modules.forEach(function renderModule(mod) {
      if (mod.category !== currentCategory) {
        currentCategory = mod.category;

        var header = document.createElement('div');
        header.className = 'module-category';
        header.textContent = categoryNames[currentCategory] || currentCategory;
        header.style.cssText = [
          'padding: 12px 12px 6px',
          'font-size: 11px',
          'color: var(--text-muted)',
          'text-transform: uppercase',
          'letter-spacing: 0.5px',
          'font-weight: 600',
        ].join(';');

        container.appendChild(header);
      }

      var item = document.createElement('div');
      item.className = 'module-item' + (mod.enabled && !mod.alwaysOn ? ' active' : '');
      item.dataset.id = mod.id;

      var toggle = document.createElement('span');
      toggle.className = 'toggle' + (mod.enabled ? ' on' : '');
      toggle.textContent = mod.enabled ? '开' : '';

      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = mod.name;
      name.title = mod.desc || mod.name;

      item.appendChild(toggle);
      item.appendChild(name);

      item.addEventListener('click', function handleClick(event) {
        if (event.target === toggle && !mod.alwaysOn) {
          onToggle(mod.id);
          return;
        }

        onSelect(mod.id);
      });

      container.appendChild(item);
    });
  },

  highlightModule(id) {
    document.querySelectorAll('.module-item').forEach(function updateState(el) {
      el.classList.toggle('active', el.dataset.id === id && !el.querySelector('.toggle.on'));
    });
  },

  addMessage(role, content, index) {
    var container = document.getElementById('messages');
    var welcome = container.querySelector('.welcome-msg');
    if (welcome) welcome.remove();

    var msg = document.createElement('div');
    msg.className = 'msg ' + role;

    var insertAt =
      index !== undefined && index < container.children.length ? index : container.children.length;
    msg.dataset.index = String(insertAt);

    var actions = document.createElement('div');
    actions.className = 'msg-actions';

    var editBtn = document.createElement('button');
    editBtn.className = 'msg-action-btn msg-action-edit';
    editBtn.textContent = '编辑';
    editBtn.title = '编辑这条消息，并从这里重新生成。';
    editBtn.addEventListener('click', function onEdit() {
      App.startEditMessage(msg);
    });

    var insertBtn = document.createElement('button');
    insertBtn.className = 'msg-action-btn';
    insertBtn.textContent = '插入';
    insertBtn.title = '在这条消息前插入新消息。';
    insertBtn.addEventListener('click', function onInsert() {
      App.openInsertDialog(msg.dataset.index);
    });

    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'msg-action-btn';
    deleteBtn.textContent = '删除';
    deleteBtn.title = '删除这条消息。';
    deleteBtn.addEventListener('click', function onDelete() {
      App.deleteMessage(msg.dataset.index);
    });

    actions.appendChild(editBtn);
    actions.appendChild(insertBtn);
    actions.appendChild(deleteBtn);
    msg.appendChild(actions);

    var roleLabel = document.createElement('div');
    roleLabel.className = 'msg-role';
    roleLabel.textContent = role === 'user' ? '你' : '写卡助手';

    var body = document.createElement('div');
    body.className = 'msg-body';
    body.innerHTML = this.renderMarkdown(content);
    this.decorateCodeBlocks(body);

    msg.appendChild(roleLabel);
    msg.appendChild(body);

    if (index !== undefined && index < container.children.length) {
      container.insertBefore(msg, container.children[index]);
    } else {
      container.appendChild(msg);
    }

    container.scrollTop = container.scrollHeight;
    this.reindexMessages();

    return body;
  },

  reindexMessages() {
    document.querySelectorAll('#messages .msg').forEach(function assignIndex(el, i) {
      el.dataset.index = String(i);
    });
  },

  updateMessage(bodyEl, content) {
    bodyEl.innerHTML = this.renderMarkdown(content);
    this.decorateCodeBlocks(bodyEl);
    var container = document.getElementById('messages');
    container.scrollTop = container.scrollHeight;
  },

  showLoading() {
    var container = document.getElementById('messages');
    var loading = document.createElement('div');
    loading.className = 'msg assistant';
    loading.id = 'loading-msg';

    var roleLabel = document.createElement('div');
    roleLabel.className = 'msg-role';
    roleLabel.textContent = '写卡助手';

    var dots = document.createElement('div');
    dots.className = 'loading-dots';
    dots.innerHTML = '<span></span><span></span><span></span>';

    loading.appendChild(roleLabel);
    loading.appendChild(dots);
    container.appendChild(loading);
    container.scrollTop = container.scrollHeight;
  },

  hideLoading() {
    var loading = document.getElementById('loading-msg');
    if (loading) loading.remove();
  },

  renderMarkdown(text) {
    var source = String(text ?? '');
    var codeBlocks = [];
    var inlineCodes = [];

    var html = this.escapeHtml(source);

    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function replaceCodeBlock(_, lang, code) {
      var token = '@@CODE_BLOCK_' + codeBlocks.length + '@@';
      codeBlocks.push('<pre><code class="lang-' + (lang || 'text') + '">' + code.trim() + '</code></pre>');
      return token;
    });

    html = html.replace(/`([^`]+)`/g, function replaceInline(_, code) {
      var token = '@@INLINE_CODE_' + inlineCodes.length + '@@';
      inlineCodes.push('<code>' + code + '</code>');
      return token;
    });

    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br>');

    html = html.replace(/@@CODE_BLOCK_(\d+)@@/g, function restoreCode(_, index) {
      return codeBlocks[Number(index)] || '';
    });

    html = html.replace(/@@INLINE_CODE_(\d+)@@/g, function restoreInline(_, index) {
      return inlineCodes[Number(index)] || '';
    });

    return html;
  },

  escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  extractCodeBlocks(text) {
    var blocks = [];
    var regex = /```([^\n`]*)\n([\s\S]*?)```/g;
    var match;

    while ((match = regex.exec(text)) !== null) {
      blocks.push({
        lang: (match[1] || '').trim().toLowerCase(),
        content: match[2].trim(),
      });
    }

    return blocks;
  },

  normalizePreviewBlock(block) {
    if (typeof block === 'string') {
      return {
        lang: 'yaml',
        content: block,
      };
    }

    return {
      lang: typeof block.lang === 'string' ? block.lang : '',
      content: typeof block.content === 'string' ? block.content : '',
    };
  },

  getPreviewBlockTitle(block, index) {
    var normalized = this.normalizePreviewBlock(block);
    if (normalized.lang === 'yaml' || normalized.lang === 'yml') {
      return 'YAML #' + (index + 1);
    }

    if (normalized.lang) {
      return normalized.lang.toUpperCase() + ' #' + (index + 1);
    }

    return '代码块 #' + (index + 1);
  },

  formatPreviewBlocks(blocks) {
    return blocks
      .map(
        (function bindFormat() {
          return function formatBlock(block) {
            var normalized = UI.normalizePreviewBlock(block);
            var fence = '```' + (normalized.lang || '');
            return [fence, normalized.content, '```'].join('\n');
          };
        })()
      )
      .join('\n\n');
  },

  async copyText(text) {
    if (!text) return;

    if (Platform.copyText) {
      await Platform.copyText(text);
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    throw new Error('复制失败');
  },

  bindCopyFeedback(button, getText) {
    button.addEventListener('click', async function onCopy() {
      var originalText = button.dataset.label || button.textContent;
      button.disabled = true;

      try {
        await UI.copyText(getText());
        button.textContent = '已复制';
      } catch {
        button.textContent = '复制失败';
      }

      setTimeout(function resetCopyText() {
        button.textContent = originalText;
        button.disabled = false;
      }, 1500);
    });
  },

  decorateCodeBlocks(container) {
    if (!container) return;

    container.querySelectorAll('pre').forEach(function renderCopyButton(pre) {
      if (pre.parentElement && pre.parentElement.classList.contains('code-block-shell')) {
        return;
      }

      var wrapper = document.createElement('div');
      wrapper.className = 'code-block-shell';

      var copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn code-copy-btn';
      copyBtn.textContent = '复制';
      copyBtn.dataset.label = '复制';
      UI.bindCopyFeedback(copyBtn, function getCodeText() {
        return pre.textContent || '';
      });

      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(copyBtn);
      wrapper.appendChild(pre);
    });
  },

  renderPreview(codeBlocks) {
    var container = document.getElementById('preview-content');
    var exportBtn = document.getElementById('btn-export');

    if (!codeBlocks.length) {
      container.innerHTML = '<p class="placeholder">AI 输出中的代码块会显示在这里。</p>';
      exportBtn.style.display = 'none';
      return;
    }

    exportBtn.style.display = 'block';
    container.innerHTML = '';

    codeBlocks.forEach(function renderBlock(block, i) {
      var normalized = UI.normalizePreviewBlock(block);
      var div = document.createElement('div');
      div.className = 'yaml-block';

      var title = document.createElement('span');
      title.className = 'yaml-tag';
      title.textContent = UI.getPreviewBlockTitle(normalized, i);
      div.appendChild(title);

      var copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn yaml-copy-btn';
      copyBtn.textContent = '复制';
      copyBtn.dataset.label = '复制';
      UI.bindCopyFeedback(copyBtn, function getBlockText() {
        return normalized.content;
      });
      div.appendChild(copyBtn);

      var code = document.createElement('code');
      code.className = 'yaml-code';
      code.textContent = normalized.content;

      div.appendChild(code);
      container.appendChild(div);
    });
  },

  async exportCodeBlocks(codeBlocks) {
    var content = this.formatPreviewBlocks(codeBlocks);

    if (Platform.isAndroidApp) {
      var shared = await Platform.shareText('写卡助手代码块', content);
      if (!shared) {
        alert('代码块内容已复制到剪贴板。');
      }
      return;
    }

    var blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'writecard-codeblocks_' + new Date().toISOString().slice(0, 10) + '.md';
    a.click();
    URL.revokeObjectURL(url);
  },

  setInputEnabled(enabled) {
    var input = document.getElementById('user-input');
    var btn = document.getElementById('btn-send');
    input.disabled = !enabled;
    btn.disabled = !enabled;
    if (enabled && !Platform.isAndroidApp) input.focus();
  },

  clearChat() {
    document.getElementById('messages').innerHTML = [
      '<div class="welcome-msg">',
      '<h2>新会话已开始</h2>',
      '<p>选择一个创作模块，开始下一轮写卡。</p>',
      '</div>',
    ].join('');
  },

  clearChatAndRestore(history) {
    var container = document.getElementById('messages');
    container.innerHTML = '';

    if (!history || !history.length) {
      container.innerHTML = [
        '<div class="welcome-msg">',
        '<h2>继续创作</h2>',
        '<p>选择一个模块，继续之前的会话。</p>',
        '</div>',
      ].join('');
      return;
    }

    for (var msg of history) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        this.addMessage(msg.role, msg.content);
      }
    }
  },
};
