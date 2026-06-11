var Templates = {
  preset: null,
  modules: [],

  async init() {
    this.preset = await API.loadPreset();
    if (!this.preset) return false;
    this.parseModules();
    return true;
  },

  getVirtualPrompts() {
    return {
      ejs_stage: {
        identifier: 'ejs_stage',
        name: 'EJS分阶段角色设定',
        content: `{{addvar::template_knowledge::现在你需要帮助用户编写“分阶段角色设定”的 EJS 世界书条目，参考 <template_ejs_stage> 内的规则}}{{trim}}
<template_ejs_stage>
任务目标
- 生成一个可直接写入世界书条目的 YAML + EJS 内容
- 这个条目用于根据 MVU 变量的区间，动态切换角色行为阶段
- 输出的是条目内容本身，不是解释文档

适用场景
- 用户要做角色好感度阶段
- 用户要做信任度、心情值、黑化值、服从度等变量驱动的阶段行为

工作流程
1. 先确认驱动变量路径
- 必须明确变量完整路径，如 stat_data.角色名.好感度
- 如果用户没给路径，先询问或提醒用户补充

2. 确认阶段划分
- 根据用户给的范围拆分阶段
- 如果用户没指定，默认按 4 到 5 个阶段设计
- 每个阶段名称尽量是四字短语

3. 输出完整条目内容
- 使用 YAML 格式
- 在同一份内容中嵌入 EJS if / else if 条件链
- 不要只给片段，要给完整可用版本

EJS硬性规则
- 严格只用一层 if / else if 结构
- 不要在 EJS 块内声明局部变量
- 每次直接调用 getvar()
- 不要写最终兜底 else
- 变量未定义时可以单独写错误分支

阶段内容规则
- 每个阶段都要完整自洽
- 不要写成“上一阶段加强版”
- 普通阶段写 4-6 条行为指导，2-4 条变化倾向
- 最终阶段写 6-9 条行为指导，可以不写变化倾向
- 内容要覆盖对 user 的互动、对其他角色的态度、角色自身行为

输出模板示例
\`\`\`yaml
---
<[角色名]_staged_performance>
角色阶段:
  描述: 根据变量数值展现角色不同阶段的性格与行为变化
  行为指导: 角色应根据当前阶段的行为指导进行表现
  变化倾向: 当数值接近下一阶段时展现过渡特征

\\\${主名}:
  associated_variable: [变量名] (<%= getvar('stat_data.角色名.好感度') %>)
  stage_names_overview:
    - 初识戒备 (< 20)
    - 初步认识 (20-49)
    - 友好互动 (50-79)
    - 深厚情感 (>= 80)

  <%_ if (getvar('stat_data.角色名.好感度') < 20) { _%>
  初识戒备:
    行为指导:
      - 保持礼貌但疏离的态度
      - 避免过度亲密接触
      - 回答问题简短而谨慎
    变化倾向:
      - 若 user 表现友善，语气会略微缓和
  <%_ } else if (getvar('stat_data.角色名.好感度') >= 20 && getvar('stat_data.角色名.好感度') < 50) { _%>
  初步认识:
    行为指导:
      - 可以进行日常交流
      - 愿意分享部分基本信息
      - 对 user 的帮助表示感谢
    变化倾向:
      - 数值接近下一阶段时会主动找话题
  <%_ } else if (getvar('stat_data.角色名.好感度') >= 50 && getvar('stat_data.角色名.好感度') < 80) { _%>
  友好互动:
    行为指导:
      - 主动关心 user 的状态
      - 愿意分享内心想法
      - 会开轻松的玩笑
    变化倾向:
      - 数值继续升高时会表现出依赖
  <%_ } else if (getvar('stat_data.角色名.好感度') >= 80) { _%>
  深厚情感:
    行为指导:
      - 对 user 表现出高度信任
      - 愿意为 user 承担风险
      - 在 user 面前展现脆弱一面
  <%_ } _%>
</[角色名]_staged_performance>
\`\`\`

输出要求
- 如果用户要的是正式内容，直接输出完整代码块
- 不要只讲原理不落地
- 不要擅自替用户决定变量路径
</template_ejs_stage>`,
      },
      ejs_dynamic: {
        identifier: 'ejs_dynamic',
        name: 'EJS动态剧情指引',
        content: `{{addvar::template_knowledge::现在你需要帮助用户编写“动态剧情指引”的 EJS 世界书条目，参考 <template_ejs_dynamic> 内的规则}}{{trim}}
<template_ejs_dynamic>
任务目标
- 生成一个可直接写入世界书条目的 EJS 动态指引
- 让模型只看到当前变量区间对应的那一段剧情提示
- 输出的是条目内容本身，不是教程总结

核心原则
- 先选驱动变量，再按区间或状态分支
- 每个分支都写成给模型的指令性提示词
- 模型只能看到命中的当前分支

EJS结构规则
- 起始处优先检查变量是否已定义
- 使用 if / else if 链
- 不在 EJS 中声明局部变量
- 每次直接调用 getvar()
- 不写最终兜底 else

内容规则
- 每个分支都要完整自洽
- 使用小写英文 XML 标签包裹，如 <plot_guide>、<event_trigger>
- 文案是给 LLM 的行为或剧情指引，不是给用户看的解释
- 不要把多个区间的内容混写在一个分支里

输出模板示例
\`\`\`yaml
---
<%_ if (getvar('stat_data.角色名.好感度') === undefined) { _%>
{{// 错误：关联变量 "stat_data.角色名.好感度" 未定义}}
<%_ } else if (getvar('stat_data.角色名.好感度') < 20) { _%>
<plot_guide>
当前角色对 <user> 保持距离感，避免过度亲密互动，优先维持戒备和观察。
</plot_guide>
<%_ } else if (getvar('stat_data.角色名.好感度') >= 20 && getvar('stat_data.角色名.好感度') < 50) { _%>
<plot_guide>
当前角色对 <user> 进入初步认识阶段，可以安排日常交流，但要保留边界感。
</plot_guide>
<%_ } else if (getvar('stat_data.角色名.好感度') >= 50 && getvar('stat_data.角色名.好感度') < 80) { _%>
<plot_guide>
当前角色与 <user> 已建立较稳定关系，可以安排更深入的互动和情感交换。
</plot_guide>
<%_ } else if (getvar('stat_data.角色名.好感度') >= 80) { _%>
<plot_guide>
当前角色对 <user> 依赖度和信任度都很高，可以推进关键情节或关系转折。
</plot_guide>
<%_ } _%>
\`\`\`

输出要求
- 用户要求正式内容时，直接给完整代码块
- 如果用户要多个驱动条件，可以继续扩展为多段独立条目
- 不要输出最终 else
</template_ejs_dynamic>`,
      },
      ejs_entry: {
        identifier: 'ejs_entry',
        name: 'EJS世界书条目JSON',
        content: `{{addvar::template_knowledge::现在你需要帮助用户生成“可写入世界书的 EJS 条目 JSON”，参考 <template_ejs_entry> 内的规则}}{{trim}}
<template_ejs_entry>
任务目标
- 把 EJS 内容整理成可直接插入世界书 JSON 的 entries 条目
- 如果用户同时需要两个条目，就输出两个完整 JSON 对象

条目参数规则
- constant: true
- order: 从 201 开始
- position: 4
- depth: 0
- excludeRecursion: true
- preventRecursion: true
- group: EJS行为系统
- key: []
- keysecondary: []

工作流程
1. 先确认是要生成一个条目还是两个条目
- 分阶段角色设定
- 动态剧情指引

2. 确认 comment、变量路径、内容主体

3. 输出完整 JSON
- 保持字段齐全
- content 中保留完整 EJS 字符串
- 只转义 JSON 需要的双引号

通用模板
\`\`\`json
{
  "uid": 1001,
  "key": [],
  "keysecondary": [],
  "comment": "[角色名]分阶段行为设定",
  "content": "---\\n<[角色名]_staged_performance>\\n...\\n</[角色名]_staged_performance>",
  "constant": true,
  "vectorized": false,
  "selective": true,
  "selectiveLogic": 0,
  "addMemo": true,
  "order": 201,
  "position": 4,
  "disable": false,
  "ignoreBudget": false,
  "excludeRecursion": true,
  "preventRecursion": true,
  "matchPersonaDescription": false,
  "matchCharacterDescription": false,
  "matchCharacterPersonality": false,
  "matchCharacterDepthPrompt": false,
  "matchScenario": false,
  "matchCreatorNotes": false,
  "delayUntilRecursion": 0,
  "probability": 100,
  "useProbability": true,
  "depth": 0,
  "outletName": "",
  "group": "EJS行为系统",
  "groupOverride": false,
  "groupWeight": 100,
  "scanDepth": null,
  "caseSensitive": null,
  "matchWholeWords": null,
  "useGroupScoring": null,
  "automationId": "",
  "role": null,
  "sticky": null,
  "cooldown": null,
  "delay": null,
  "triggers": [],
  "displayIndex": 1001,
  "characterFilter": {
    "isExclude": false,
    "names": [],
    "tags": []
  }
}
\`\`\`

输出要求
- 用户要正式条目时，直接输出 JSON 代码块
- 不要把教程说明混进 JSON
- 如果 uid 未知，可以提醒用户用“当前最大 uid + 1 / +2”
</template_ejs_entry>`,
      },
    };
  },

  parseModules() {
    const prompts = this.preset.prompts || [];
    this.modules = [];

    const categories = {
      core: [
        { id: '4', name: '秋青子人设', desc: '蛇娘秘书角色设定', alwaysOn: true },
        { id: '2', name: '防标记', desc: '防止 429 和内容过滤', alwaysOn: true },
        { id: '3', name: '变量初始化', desc: '模板变量初始化', alwaysOn: true },
      ],
      principles: [
        { id: '5', name: '创作思路', desc: '角色卡制作核心原则', alwaysOn: true },
        { id: '6', name: '创作原则-绝对零度', desc: '白描手法、去八股化', alwaysOn: true },
        { id: '7', name: '输出格式要求', desc: 'YAML 格式输出规则', alwaysOn: true },
      ],
      creation: [
        { id: '13', name: '世界观', desc: '创建世界设定' },
        { id: '14', name: '角色基础', desc: '基本信息、外貌、背景' },
        { id: '15', name: '性格调色盘', desc: '底色、主色调、点缀、衍生' },
        { id: '16', name: '三面性', desc: '不同场景的行为切换' },
        { id: '17', name: '二次解释', desc: '作者对角色的终极注释' },
        { id: '18', name: '衣柜', desc: '角色服装清单' },
        { id: '19', name: 'NSFW调色盘', desc: '亲密行为的性格延续' },
        { id: '20', name: '手枪卡', desc: 'XP 色情卡创作' },
        { id: '21', name: 'NPC设计', desc: '快速创建 NPC' },
        { id: '22', name: '角色速览', desc: '角色总览列表' },
        { id: '24', name: '开场白', desc: '故事开头创作' },
        { id: '23', name: '自由创作助手', desc: '场景、事件、物品等' },
        { id: '25', name: '前端美化', desc: '酒馆助手前端界面' },
      ],
      mvu: [
        { id: '29', name: 'MVU变量结构', desc: 'zod 4 变量结构脚本' },
        { id: '30', name: 'MVU初始变量', desc: '变量初始值' },
        { id: '31', name: 'MVU变量更新规则', desc: '变量更新条件' },
        { id: '32', name: 'MVU变量列表', desc: '当前变量值' },
        { id: '33', name: 'MVU变量输出格式', desc: '变量更新输出格式' },
        { id: '34', name: 'MVU变量输出格式强调', desc: '强制输出变量更新' },
        { id: '35', name: 'MVU前端状态栏', desc: '变量状态栏美化' },
      ],
      ejs: [
        { id: 'ejs_stage', name: 'EJS分阶段角色设定', desc: '按变量区间生成阶段行为条目' },
        { id: 'ejs_dynamic', name: 'EJS动态剧情指引', desc: '按变量区间生成剧情提示条目' },
        { id: 'ejs_entry', name: 'EJS世界书条目JSON', desc: '生成可写入世界书的 JSON 条目' },
      ],
      review: [{ id: '26', name: '世界书评估', desc: '评估世界书质量' }],
    };

    const promptMap = this.getVirtualPrompts();
    for (const prompt of prompts) {
      promptMap[prompt.identifier] = prompt;
    }

    for (const [category, items] of Object.entries(categories)) {
      for (const item of items) {
        const prompt = promptMap[item.id];
        if (!prompt) continue;

        this.modules.push({
          ...item,
          category,
          prompt,
          enabled: item.alwaysOn || false,
        });
      }
    }
  },

  getModules() {
    return this.modules;
  },

  toggleModule(id) {
    const module = this.modules.find((item) => item.id === id);
    if (module && !module.alwaysOn) {
      module.enabled = !module.enabled;
    }
    return module;
  },

  getEnabledModules() {
    return this.modules.filter((item) => item.enabled);
  },

  replaceVars(text) {
    const config = API.getConfig();
    let result = text;

    if (config.userName) {
      result = result.replace(/\{\{user\}\}/g, config.userName);
    }

    if (config.charName) {
      result = result.replace(/\{\{char\}\}/g, config.charName);
    }

    result = result.replace(/\{\{random::([^}]+)\}\}/g, (_, options) => {
      const items = options.split(',');
      return items[Math.floor(Math.random() * items.length)];
    });

    result = result.replace(/\{\{trim\}\}/g, '');
    result = result.replace(/\{\{setvar::[^}]+\}\}/g, '');
    result = result.replace(/\{\{addvar::[^}]+\}\}/g, '');

    return result;
  },

  buildSystemPrompt(activeModuleId) {
    const parts = [];

    const coreModules = this.modules.filter((item) => item.category === 'core' || item.alwaysOn);
    for (const module of coreModules) {
      if (module.prompt?.content) {
        parts.push(this.replaceVars(module.prompt.content));
      }
    }

    const activeCategory = this.modules.find((item) => item.id === activeModuleId)?.category;
    const isCreation = ['creation', 'mvu', 'ejs', 'review'].includes(activeCategory);

    if (isCreation) {
      const principles = this.modules.filter((item) => item.category === 'principles');
      for (const module of principles) {
        if (module.prompt?.content) {
          parts.push(this.replaceVars(module.prompt.content));
        }
      }
    }

    const activeModule = this.modules.find((item) => item.id === activeModuleId);
    if (activeModule?.prompt?.content) {
      parts.push(this.replaceVars(activeModule.prompt.content));
    }

    return parts.join('\n\n');
  },
};
