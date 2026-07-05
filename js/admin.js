/* ========================================
   admin.js - 管理后台 JSON 可视化编辑器 v2
   只读展示 + 表单化添加 + 删除
   ======================================== */

// ========================================
// 数据文件 Schema 定义
// ========================================
const SCHEMAS = {
    'about': {
        type: 'object',
        label: 'about.json',
        path: 'data/about.json',
        icon: 'fa-circle-info',
        group: 'core',
        fields: [
            { key: 'lastUpdated', label: '最后更新日期', type: 'text', required: true, placeholder: '如 2026-07-04' },
            { key: 'adminKey', label: '管理员密钥', type: 'text', required: true, placeholder: '用于搜索栏进入后台' },
            { key: 'history.title', label: '社团历史 - 标题', type: 'text', required: false },
            { key: 'history.content', label: '社团历史 - 内容', type: 'textarea', required: false },
            { key: 'philosophy.title', label: '社团理念 - 标题', type: 'text', required: false },
            { key: 'philosophy.content', label: '社团理念 - 内容', type: 'textarea', required: false },
            { key: 'activities.title', label: '社团活动 - 标题', type: 'text', required: false },
            { key: 'activities.content', label: '社团活动 - 内容', type: 'textarea', required: false }
        ]
    },
    'members': {
        type: 'array',
        label: 'members.json',
        path: 'data/members.json',
        icon: 'fa-users',
        group: 'core',
        itemLabel: '成员',
        fields: [
            { key: 'name', label: '姓名', type: 'text', required: true, placeholder: '如 张三' },
            { key: 'role', label: '职务', type: 'text', required: true, placeholder: '如 社长&校队成员' },
            { key: 'description', label: '简介', type: 'textarea', required: false, placeholder: '描述该成员的职责与特点' }
        ]
    },
    'news': {
        type: 'array',
        label: 'news.json',
        path: 'data/news.json',
        icon: 'fa-newspaper',
        group: 'core',
        itemLabel: '新闻',
        fields: [
            { key: 'id', label: 'ID', type: 'text', required: true, placeholder: '如 n16（唯一标识）' },
            { key: 'date', label: '日期', type: 'text', required: true, placeholder: '如 2026-07-04' },
            { key: 'title', label: '标题', type: 'text', required: true, placeholder: '新闻标题' },
            { key: 'excerpt', label: '摘要', type: 'textarea', required: false, placeholder: '简短摘要（可选）' },
            { key: 'content', label: '正文内容', type: 'textarea', required: true, placeholder: '支持 Markdown 格式' },
            { key: 'tag', label: '标签', type: 'select', required: true, options: [
                { value: 'notice', label: '公告 (notice)' },
                { value: 'daily', label: '日常 (daily)' },
                { value: 'match', label: '赛事 (match)' },
                { value: 'training', label: '训练 (training)' },
                { value: 'event', label: '活动 (event)' }
            ]},
            { key: 'media', label: '媒体附件', type: 'info', value: [], note: '⚠ 添加新闻后请手动在源文件中编辑 media 数组' }
        ]
    },
    'competitions': {
        type: 'array',
        label: 'competitions.json',
        path: 'data/competitions.json',
        icon: 'fa-trophy',
        group: 'core',
        itemLabel: '赛事',
        fields: [
            { key: 'id', label: 'ID', type: 'text', required: true, placeholder: '如 c6（唯一标识）' },
            { key: 'date', label: '日期', type: 'text', required: true, placeholder: '如 2026-07-04' },
            { key: 'title', label: '标题', type: 'text', required: true, placeholder: '赛事标题' },
            { key: 'excerpt', label: '摘要', type: 'textarea', required: false, placeholder: '简短摘要（可选）' },
            { key: 'content', label: '正文内容', type: 'textarea', required: true, placeholder: '支持 Markdown 格式' },
            { key: 'tag', label: '标签', type: 'select', required: true, options: [
                { value: 'upcoming', label: '即将开始 (upcoming)' },
                { value: 'live', label: '进行中 (live)' },
                { value: 'result', label: '比赛结果 (result)' }
            ]},
            { key: 'media', label: '媒体附件', type: 'info', value: [], note: '⚠ 添加赛事后请手动在源文件中编辑 media 数组' }
        ]
    },
    'draws': {
        type: 'array',
        label: 'draws.json',
        path: 'data/draws.json',
        icon: 'fa-diagram-project',
        group: 'core',
        itemLabel: '对阵表',
        fields: [
            { key: 'id', label: 'Draws ID', type: 'text', required: true, placeholder: '如 d1（唯一标识）' },
            { key: 'competitionId', label: '关联赛事ID', type: 'text', required: true, placeholder: '如 c5（对应 competitions.json 中的 id）' },
            { key: 'title', label: '对阵表标题', type: 'text', required: true, placeholder: '如 2026年单打比赛对阵表' },
            { key: 'rounds', label: '轮次/对阵数据', type: 'info', value: [], note: '⚠ 添加对阵表后请手动在源文件中编辑 rounds 数组（含 name、matches 等）' }
        ]
    },
    'qa': {
        type: 'array',
        label: 'qa.json',
        path: 'data/qa.json',
        icon: 'fa-circle-question',
        group: 'core',
        itemLabel: '问答',
        fields: [
            { key: 'id', label: 'ID', type: 'text', required: true, placeholder: '如 q3（唯一标识）' },
            { key: 'date', label: '日期', type: 'text', required: true, placeholder: '如 2026-07-04' },
            { key: 'title', label: '标题', type: 'text', required: true, placeholder: '问题标题' },
            { key: 'excerpt', label: '摘要', type: 'textarea', required: false, placeholder: '简短摘要（可选）' },
            { key: 'content', label: '正文内容', type: 'textarea', required: true, placeholder: '支持 Markdown 格式' },
            { key: 'tag', label: '标签', type: 'select', required: true, options: [
                { value: 'notice', label: '公告 (notice)' },
                { value: 'event', label: '活动 (event)' },
                { value: 'daily', label: '日常 (daily)' }
            ]},
            { key: 'media', label: '媒体附件', type: 'info', value: [], note: '⚠ 添加问答后请手动在源文件中编辑 media 数组' }
        ]
    },
    'changelog': {
        type: 'array',
        label: 'changelog.json',
        path: 'data/changelog.json',
        icon: 'fa-clock-rotate-left',
        group: 'core',
        itemLabel: '更新日志',
        fields: [
            { key: 'version', label: '版本号', type: 'text', required: true, placeholder: '如 v1.0.6' },
            { key: 'date', label: '日期', type: 'text', required: true, placeholder: '如 2026-07-04' },
            { key: 'title', label: '标题', type: 'text', required: true, placeholder: '更新标题' },
            { key: 'tag', label: '标签', type: 'select', required: true, options: [
                { value: 'release', label: '正式发布 (release)' },
                { value: 'feature', label: '新功能 (feature)' },
                { value: 'fix', label: '修复 (fix)' }
            ]},
            { key: 'changes', label: '更新内容', type: 'textarea-array', required: true, placeholder: '每行一条更新内容', note: '每行一条，自动转为数组' }
        ]
    },
    'score-log': {
        type: 'array',
        label: 'score-log.json',
        path: 'data/score-log.json',
        icon: 'fa-table-list',
        group: 'core',
        itemLabel: '比赛记录',
        fields: [
            { key: '日期', label: '日期', type: 'text', required: true, placeholder: '如 2026-07-04' },
            { key: '类型', label: '赛事类型', type: 'select', required: true, options: [
                { value: '普通', label: '普通 (系数0.2)' },
                { value: '排位赛', label: '排位赛 (系数0.6)' },
                { value: '挑战赛', label: '挑战赛 (系数0.6)' },
                { value: '校乒联赛', label: '校乒联赛 (系数0.7)' },
                { value: '十二强赛', label: '十二强赛 (系数0.7)' },
                { value: '校乒赛团体', label: '校乒赛团体 (系数0.8)' },
                { value: '校乒赛单打', label: '校乒赛单打 (系数1.0)' },
                { value: '比赛结果加分', label: '比赛结果加分 (非比赛记录)' }
            ]},
            { key: '胜者', label: '胜者', type: 'text', required: false, placeholder: '比赛类型时必填；加分类型留空', condField: '类型', condNotValue: '比赛结果加分' },
            { key: '负者', label: '负者', type: 'text', required: false, placeholder: '比赛类型时必填；加分类型留空', condField: '类型', condNotValue: '比赛结果加分' },
            { key: '对象', label: '加分对象', type: 'text', required: false, placeholder: '仅加分类型填写', condField: '类型', condValue: '比赛结果加分' },
            { key: '分数', label: '加分分数', type: 'number', required: false, placeholder: '仅加分类型填写', condField: '类型', condValue: '比赛结果加分' }
        ]
    },
    'seasons': {
        type: 'array',
        label: 'seasons.json',
        path: 'data/seasons.json',
        icon: 'fa-calendar-days',
        group: 'core',
        itemLabel: '赛季',
        fields: [
            { key: 'id', label: '赛季ID', type: 'text', required: true, placeholder: '如 2026-fall' },
            { key: 'label', label: '赛季名称', type: 'text', required: true, placeholder: '如 2026年秋季学期' },
            { key: 'startDate', label: '开始日期', type: 'text', required: true, placeholder: '如 2026-09-01' },
            { key: 'endDate', label: '结束日期', type: 'text', required: true, placeholder: '如 2027-01-15' },
            { key: 'visible', label: '是否可见', type: 'boolean', required: true },
            { key: 'snapshotDates', label: '快照日期', type: 'textarea-array', required: false, placeholder: '每行一个日期，如：2026-09-15', note: '每行一个日期' }
        ]
    },
    'initial-scores': {
        type: 'object',
        label: 'initial-scores.json',
        path: 'data/initial-scores.json',
        icon: 'fa-chart-simple',
        group: 'core',
        kvMode: true,
        kvKeyLabel: '球员姓名',
        kvValueLabel: '初始积分',
        kvValueType: 'number',
        topFields: [
            { key: 'baseDate', label: '基准日期', type: 'text', required: true, placeholder: '如 2026-03-01' }
        ],
        kvContainerKey: 'initialScores'
    },
    'event-coefficient': {
        type: 'object',
        label: 'event-coefficient.json',
        path: 'data/event-coefficient.json',
        icon: 'fa-weight-scale',
        group: 'core',
        kvMode: true,
        kvKeyLabel: '赛事类型',
        kvValueLabel: '系数',
        kvValueType: 'number',
        kvNoTopFields: true
    },
    'player-tags': {
        type: 'object',
        label: 'player-tags.json',
        path: 'data/player-tags.json',
        icon: 'fa-tags',
        group: 'core',
        readOnlyNote: '此文件结构较复杂（嵌套对象+数组），建议在源文件中手动编辑。此处仅展示只读预览。',
        readOnly: true
    },
    'personal-stats-chart-settings': {
        type: 'object',
        label: 'personal-stats-chart-settings.json',
        path: 'data/personal-stats-chart-settings.json',
        icon: 'fa-chart-pie',
        group: 'core',
        readOnlyNote: '此文件为图表配置文件，建议在源文件中手动修改。此处仅展示只读预览。',
        readOnly: true
    },
    'wtt-score-log': {
        type: 'array',
        label: 'wtt_score-log.json',
        path: 'wtt_data/wtt_score-log.json',
        icon: 'fa-table-list',
        group: 'wtt',
        itemLabel: 'WTT比赛记录',
        fields: [
            { key: '日期', label: '日期', type: 'text', required: true, placeholder: '如 2023-01-10' },
            { key: '类型', label: '赛事类型', type: 'select', required: true, options: [
                { value: '常规挑战赛', label: '常规挑战赛 (系数0.5)' },
                { value: '球星挑战赛', label: '球星挑战赛 (系数0.8)' },
                { value: '冠军赛', label: '冠军赛 (系数2.0)' },
                { value: '总决赛', label: '总决赛 (系数2.4)' },
                { value: '大满贯', label: '大满贯 (系数2.5)' },
                { value: '世界杯', label: '世界杯 (系数2.8)' },
                { value: '世乒赛', label: '世乒赛 (系数3.2)' },
                { value: '奥运会', label: '奥运会 (系数4.0)' }
            ]},
            { key: '胜者', label: '胜者', type: 'text', required: true, placeholder: '获胜选手姓名' },
            { key: '负者', label: '负者', type: 'text', required: true, placeholder: '落败选手姓名' }
        ]
    },
    'wtt-seasons': {
        type: 'array',
        label: 'wtt_seasons.json',
        path: 'wtt_data/wtt_seasons.json',
        icon: 'fa-calendar-days',
        group: 'wtt',
        itemLabel: 'WTT赛季',
        fields: [
            { key: 'id', label: '赛季ID', type: 'text', required: true },
            { key: 'label', label: '赛季名称', type: 'text', required: true },
            { key: 'startDate', label: '开始日期', type: 'text', required: true },
            { key: 'endDate', label: '结束日期', type: 'text', required: true },
            { key: 'visible', label: '是否可见', type: 'boolean', required: true },
            { key: 'snapshotDates', label: '快照日期', type: 'textarea-array', required: false, placeholder: '每行一个日期', note: '每行一个日期，自动转为数组' }
        ]
    },
    'wtt-initial-scores': {
        type: 'object',
        label: 'wtt_initial-scores.json',
        path: 'wtt_data/wtt_initial-scores.json',
        icon: 'fa-chart-simple',
        group: 'wtt',
        kvMode: true,
        kvKeyLabel: '选手姓名',
        kvValueLabel: '初始积分',
        kvValueType: 'number',
        topFields: [
            { key: 'baseDate', label: '基准日期', type: 'text', required: true }
        ],
        kvContainerKey: 'initialScores'
    },
    'wtt-event-coefficient': {
        type: 'object',
        label: 'wtt_event-coefficient.json',
        path: 'wtt_data/wtt_event-coefficient.json',
        icon: 'fa-weight-scale',
        group: 'wtt',
        kvMode: true,
        kvKeyLabel: '赛事类型',
        kvValueLabel: '系数',
        kvValueType: 'number',
        kvNoTopFields: true
    }
};

// ========================================
// 全局状态
// ========================================
let currentFileKey = null;
let currentData = null;
let originalData = null;
let showAddForm = false;

// ========================================
// DOM 引用
// ========================================
const $ = (id) => document.getElementById(id);

function init() {
    renderSidebar();
    initTheme();
    bindEvents();
}

function initTheme() {
    const st = localStorage.getItem('wfls-tt-theme');
    if (st === 'dark') {
        document.body.classList.add('dark-mode');
        $('themeToggle').innerHTML = '<i class="fa-solid fa-sun"></i>';
    }
    $('themeToggle').addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('wfls-tt-theme', isDark ? 'dark' : 'light');
        $('themeToggle').innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    });
}

function renderSidebar() {
    const coreList = $('coreDataList');
    const wttList = $('wttDataList');
    coreList.innerHTML = '';
    wttList.innerHTML = '';

    Object.entries(SCHEMAS).forEach(([key, schema]) => {
        const li = document.createElement('li');
        li.className = 'admin-file-item';
        li.innerHTML = `<i class="fa-solid ${schema.icon}"></i>${schema.label}<span class="admin-file-badge">json</span>`;
        li.addEventListener('click', () => selectFile(key));
        li.dataset.key = key;
        if (schema.group === 'wtt') {
            wttList.appendChild(li);
        } else {
            coreList.appendChild(li);
        }
    });
}

function bindEvents() {
    $('sidebarToggle').addEventListener('click', () => {
        $('adminSidebar').classList.toggle('open');
    });
    $('generateJsonBtn').addEventListener('click', generateJson);
    $('rawJsonHeader').addEventListener('click', () => {
        $('rawJsonPanel').classList.toggle('collapsed');
    });
    $('copyJsonBtn').addEventListener('click', (e) => { e.stopPropagation(); copyRawJson(); });
    $('copyJsonBtn2').addEventListener('click', copyRawJson);
    $('resetAllBtn').addEventListener('click', resetAll);
    $('addRootItemBtn').addEventListener('click', () => { showAddForm = true; renderEditor(); });
    $('expandAllBtn').addEventListener('click', () => {
        document.querySelectorAll('.json-node-ro .json-child-ro').forEach(el => el.style.display = '');
    });
    $('collapseAllBtn').addEventListener('click', () => {
        document.querySelectorAll('.json-node-ro .json-child-ro').forEach(el => el.style.display = 'none');
    });
}

// ========================================
// 文件加载
// ========================================
async function selectFile(key) {
    if (currentFileKey === key) return;
    currentFileKey = key;
    showAddForm = false;

    document.querySelectorAll('.admin-file-item').forEach(el => el.classList.remove('active'));
    const target = document.querySelector(`.admin-file-item[data-key="${CSS.escape(key)}"]`);
    if (target) target.classList.add('active');

    const schema = SCHEMAS[key];
    $('currentFileName').textContent = schema.label;
    $('breadcrumb').textContent = ` / ${schema.label}`;

    try {
        const resp = await fetch(schema.path);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        originalData = JSON.parse(JSON.stringify(data));
        currentData = JSON.parse(JSON.stringify(data));
        renderEditor();
        $('adminSidebar').classList.remove('open');
    } catch (err) {
        $('editorBody').innerHTML = `<div class="admin-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>加载失败：${err.message}</p></div>`;
        currentData = null;
        originalData = null;
    }
}

// ========================================
// 主渲染
// ========================================
function renderEditor() {
    if (!currentData || !currentFileKey) return;
    const schema = SCHEMAS[currentFileKey];
    const body = $('editorBody');
    body.innerHTML = '';

    const addBtn = $('addRootItemBtn');
    if (schema.readOnly) {
        addBtn.style.display = 'none';
    } else if (schema.type === 'array') {
        addBtn.style.display = 'inline-flex';
        addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> 添加' + (schema.itemLabel || '项');
    } else if (schema.kvMode) {
        addBtn.style.display = 'inline-flex';
        addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> 添加键值对';
    } else if (schema.fields) {
        addBtn.style.display = 'inline-flex';
        addBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> 编辑顶层字段';
    } else {
        addBtn.style.display = 'none';
    }

    // Read-only note
    if (schema.readOnly && schema.readOnlyNote) {
        const note = document.createElement('div');
        note.className = 'admin-readonly-note';
        note.innerHTML = `<i class="fa-solid fa-lock"></i> ${schema.readOnlyNote}`;
        body.appendChild(note);
    }

    // Render data preview
    if (schema.type === 'array') {
        renderArrayPreview(body, schema);
    } else if (schema.kvMode) {
        renderKVPreview(body, schema);
    } else if (schema.fields) {
        renderObjectPreview(body, schema);
    }

    // Read-only JSON tree
    const treeContainer = document.createElement('div');
    treeContainer.className = 'json-tree-readonly';
    treeContainer.style.marginTop = '16px';
    const treeTitle = document.createElement('div');
    treeTitle.className = 'admin-section-title';
    treeTitle.style.cursor = 'pointer';
    treeTitle.innerHTML = '<i class="fa-solid fa-sitemap"></i> 数据结构预览 <span style="font-size:0.7rem;color:var(--admin-text-muted);">（点击展开/折叠子节点）</span>';
    treeContainer.appendChild(treeTitle);
    treeContainer.appendChild(renderReadonlyTree(currentData, []));
    body.appendChild(treeContainer);

    // Add form
    if (!schema.readOnly) {
        renderAddForm(body, schema);
    }

    updateRawJson();
}

// ========================================
// Array Preview
// ========================================
function renderArrayPreview(container, schema) {
    if (!Array.isArray(currentData) || currentData.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'admin-empty';
        empty.innerHTML = `<i class="fa-solid fa-inbox"></i><p>暂无${schema.itemLabel || '数据'}，点击上方"添加"按钮新增</p>`;
        container.appendChild(empty);
        return;
    }

    const countInfo = document.createElement('div');
    countInfo.className = 'admin-count-info';
    countInfo.textContent = `共 ${currentData.length} 条${schema.itemLabel || '记录'}`;
    container.appendChild(countInfo);

    const wrapper = document.createElement('div');
    wrapper.className = 'admin-table-wrapper';

    const table = document.createElement('table');
    table.className = 'admin-data-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = '<th style="width:40px;">#</th>';
    const displayFields = getDisplayFields(schema);
    displayFields.forEach(f => {
        headerRow.innerHTML += `<th>${f.label}</th>`;
    });
    headerRow.innerHTML += '<th style="width:60px;">操作</th>';
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    currentData.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `<td class="row-num">${index + 1}</td>`;
        displayFields.forEach(f => {
            let val = getNestedValue(item, f.key);
            if (f.type === 'boolean') {
                val = val ? '✅' : '❌';
            } else if (Array.isArray(val)) {
                val = val.length > 0 ? val.slice(0, 3).join(', ') + (val.length > 3 ? '...' : '') : '<span class="null-val">(空)</span>';
            } else if (val === null || val === undefined) {
                val = '<span class="null-val">(空)</span>';
            } else if (typeof val === 'object') {
                val = '<span class="obj-val">{...}</span>';
            } else {
                val = escapeHtml(String(val).substring(0, 60) + (String(val).length > 60 ? '...' : ''));
            }
            row.innerHTML += `<td>${val}</td>`;
        });
        row.innerHTML += `<td><button class="admin-btn sm danger delete-row-btn" data-index="${index}" title="删除此项"><i class="fa-solid fa-trash-can"></i></button></td>`;
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);
    container.appendChild(wrapper);

    wrapper.querySelectorAll('.delete-row-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            confirmDelete(`确定要删除第 ${idx + 1} 条${schema.itemLabel || '记录'}吗？`, () => {
                currentData.splice(idx, 1);
                renderEditor();
            });
        });
    });
}

function getDisplayFields(schema) {
    if (!schema.fields) return [];
    return schema.fields.filter(f => f.type !== 'info').slice(0, 6);
}

function getNestedValue(obj, key) {
    if (!obj) return undefined;
    const parts = key.split('.');
    let val = obj;
    for (const p of parts) {
        if (val === null || val === undefined) return undefined;
        val = val[p];
    }
    return val;
}

// ========================================
// KV Object Preview
// ========================================
function renderKVPreview(container, schema) {
    let kvData = currentData;
    if (schema.kvContainerKey) {
        kvData = currentData[schema.kvContainerKey] || {};
    }
    if (schema.kvNoTopFields) {
        kvData = currentData;
    }

    const entries = Object.entries(kvData);

    // Top fields
    if (schema.topFields && !schema.kvNoTopFields) {
        const tfWrapper = document.createElement('div');
        tfWrapper.className = 'admin-kv-section';
        const tfTitle = document.createElement('div');
        tfTitle.className = 'admin-section-title';
        tfTitle.innerHTML = '<i class="fa-solid fa-gear"></i> 顶层字段';
        tfWrapper.appendChild(tfTitle);
        schema.topFields.forEach(f => {
            const row = document.createElement('div');
            row.className = 'admin-kv-row';
            const val = currentData[f.key] !== undefined ? escapeHtml(String(currentData[f.key])) : '<span class="null-val">(未设置)</span>';
            row.innerHTML = `<span class="admin-kv-key">${f.label}</span><span class="admin-kv-val">${val}</span>`;
            tfWrapper.appendChild(row);
        });
        container.appendChild(tfWrapper);
    }

    const kvWrapper = document.createElement('div');
    kvWrapper.className = 'admin-kv-section';
    const kvTitle = document.createElement('div');
    kvTitle.className = 'admin-section-title';
    const labelDesc = schema.kvContainerKey ? ` ${schema.label} · 键值对` : ' 键值对列表';
    kvTitle.innerHTML = `<i class="fa-solid fa-list-ol"></i>${labelDesc} (${entries.length}条)`;
    kvWrapper.appendChild(kvTitle);

    if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'admin-empty';
        empty.innerHTML = '<p>暂无数据</p>';
        kvWrapper.appendChild(empty);
    } else {
        const kvTable = document.createElement('table');
        kvTable.className = 'admin-data-table admin-kv-table';
        kvTable.innerHTML = `<thead><tr><th>#</th><th>${schema.kvKeyLabel || '键'}</th><th>${schema.kvValueLabel || '值'}</th><th style="width:60px;">操作</th></tr></thead>`;
        const tbody = document.createElement('tbody');
        entries.forEach(([key, value], index) => {
            const row = document.createElement('tr');
            row.innerHTML = `<td class="row-num">${index + 1}</td><td><code>${escapeHtml(key)}</code></td><td>${escapeHtml(String(value))}</td>`;
            row.innerHTML += `<td><button class="admin-btn sm danger delete-kv-btn" data-key="${escapeHtml(key)}"><i class="fa-solid fa-trash-can"></i></button></td>`;
            tbody.appendChild(row);
        });
        kvTable.appendChild(tbody);
        kvWrapper.appendChild(kvTable);
    }
    container.appendChild(kvWrapper);

    kvWrapper.querySelectorAll('.delete-kv-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const k = btn.dataset.key;
            confirmDelete(`确定要删除 "${k}" 吗？`, () => {
                if (schema.kvNoTopFields) {
                    delete currentData[k];
                } else if (schema.kvContainerKey) {
                    delete currentData[schema.kvContainerKey][k];
                }
                renderEditor();
            });
        });
    });
}

// ========================================
// Object Preview (for about.json)
// ========================================
function renderObjectPreview(container, schema) {
    if (!schema.fields) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'admin-kv-section';
    const title = document.createElement('div');
    title.className = 'admin-section-title';
    title.innerHTML = '<i class="fa-solid fa-rectangle-list"></i> 当前字段值';
    wrapper.appendChild(title);
    schema.fields.forEach(f => {
        const row = document.createElement('div');
        row.className = 'admin-kv-row';
        let val = getNestedValue(currentData, f.key);
        if (val === undefined || val === null) val = '<span class="null-val">(未设置)</span>';
        else if (typeof val === 'object') val = '<span class="obj-val">' + escapeHtml(JSON.stringify(val).substring(0, 60)) + '...</span>';
        else val = escapeHtml(String(val).substring(0, 120));
        row.innerHTML = `<span class="admin-kv-key">${f.label}</span><span class="admin-kv-val">${val}</span>`;
        wrapper.appendChild(row);
    });
    container.appendChild(wrapper);
}

// ========================================
// Read-only JSON Tree
// ========================================
function renderReadonlyTree(data, path) {
    const container = document.createElement('div');
    container.className = 'json-node-ro';

    if (data === null || data === undefined) {
        const span = document.createElement('span');
        span.className = 'json-v-ro json-null-ro';
        span.textContent = 'null';
        container.appendChild(span);
        return container;
    }
    if (typeof data === 'string') {
        const span = document.createElement('span');
        span.className = 'json-v-ro json-str-ro';
        const display = data.length > 100 ? data.substring(0, 100) + '...' : data;
        span.textContent = '"' + display + '"';
        span.title = data;
        container.appendChild(span);
        return container;
    }
    if (typeof data === 'number') {
        const span = document.createElement('span');
        span.className = 'json-v-ro json-num-ro';
        span.textContent = String(data);
        container.appendChild(span);
        return container;
    }
    if (typeof data === 'boolean') {
        const span = document.createElement('span');
        span.className = 'json-v-ro json-bool-ro';
        span.textContent = String(data);
        container.appendChild(span);
        return container;
    }
    if (Array.isArray(data)) {
        const toggle = document.createElement('span');
        toggle.className = 'json-ro-toggle';
        toggle.textContent = '▼ ';
        toggle.style.cursor = 'pointer';
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const child = container.querySelector('.json-child-ro');
            if (child) {
                const hidden = child.style.display === 'none';
                child.style.display = hidden ? '' : 'none';
                toggle.textContent = hidden ? '▼ ' : '▶ ';
            }
        });

        const openSpan = document.createElement('span');
        openSpan.className = 'json-b-ro';
        openSpan.textContent = '[';
        container.appendChild(toggle);
        container.appendChild(openSpan);

        if (data.length > 0) {
            const inner = document.createElement('div');
            inner.className = 'json-child-ro';
            data.slice(0, 20).forEach((item, i) => {
                const childContainer = document.createElement('div');
                childContainer.className = 'json-line-ro';
                const idxSpan = document.createElement('span');
                idxSpan.className = 'json-k-ro';
                idxSpan.textContent = i + ': ';
                childContainer.appendChild(idxSpan);
                childContainer.appendChild(renderReadonlyTree(item, [...path, i]));
                if (i < Math.min(data.length, 20) - 1) {
                    const comma = document.createElement('span');
                    comma.className = 'json-comma-ro';
                    comma.textContent = ',';
                    childContainer.appendChild(comma);
                }
                inner.appendChild(childContainer);
            });
            if (data.length > 20) {
                const more = document.createElement('div');
                more.className = 'json-line-ro';
                more.innerHTML = '<span class="json-more-ro">... 还有 ' + (data.length - 20) + ' 项</span>';
                inner.appendChild(more);
            }
            container.appendChild(inner);
        }
        const closeSpan = document.createElement('span');
        closeSpan.className = 'json-b-ro';
        closeSpan.textContent = '] (' + data.length + ' items)';
        container.appendChild(closeSpan);
        return container;
    }
    // Object
    const entries = Object.entries(data);
    const toggle = document.createElement('span');
    toggle.className = 'json-ro-toggle';
    toggle.textContent = '▼ ';
    toggle.style.cursor = 'pointer';
    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const child = container.querySelector('.json-child-ro');
        if (child) {
            const hidden = child.style.display === 'none';
            child.style.display = hidden ? '' : 'none';
            toggle.textContent = hidden ? '▼ ' : '▶ ';
        }
    });

    const openSpan = document.createElement('span');
    openSpan.className = 'json-b-ro';
    openSpan.textContent = '{';
    container.appendChild(toggle);
    container.appendChild(openSpan);

    if (entries.length > 0) {
        const inner = document.createElement('div');
        inner.className = 'json-child-ro';
        entries.slice(0, 30).forEach(([key, value], i) => {
            const childContainer = document.createElement('div');
            childContainer.className = 'json-line-ro';
            const keySpan = document.createElement('span');
            keySpan.className = 'json-k-ro';
            keySpan.textContent = '"' + key + '": ';
            childContainer.appendChild(keySpan);
            childContainer.appendChild(renderReadonlyTree(value, [...path, key]));
            if (i < Math.min(entries.length, 30) - 1) {
                const comma = document.createElement('span');
                comma.className = 'json-comma-ro';
                comma.textContent = ',';
                childContainer.appendChild(comma);
            }
            inner.appendChild(childContainer);
        });
        if (entries.length > 30) {
            const more = document.createElement('div');
            more.className = 'json-line-ro';
            more.innerHTML = '<span class="json-more-ro">... 还有 ' + (entries.length - 30) + ' 个字段</span>';
            inner.appendChild(more);
        }
        container.appendChild(inner);
    }
    const closeSpan = document.createElement('span');
    closeSpan.className = 'json-b-ro';
    closeSpan.textContent = '} (' + entries.length + ' keys)';
    container.appendChild(closeSpan);
    return container;
}

// ========================================
// Add Form
// ========================================
function renderAddForm(container, schema) {
    if (!showAddForm) {
        const showBtn = document.createElement('button');
        showBtn.className = 'admin-btn primary';
        showBtn.style.cssText = 'margin-top:20px;align-self:flex-start;';
        showBtn.innerHTML = '<i class="fa-solid fa-plus"></i> 展开添加表单';
        showBtn.addEventListener('click', () => { showAddForm = true; renderEditor(); });
        container.appendChild(showBtn);
        return;
    }

    // For object type with fields (like about.json)
    if (schema.fields && schema.type === 'object') {
        renderObjectEditForm(container, schema);
        return;
    }

    const formWrapper = document.createElement('div');
    formWrapper.className = 'admin-add-form glass-card';
    formWrapper.style.cssText = 'margin-top:20px;';

    const formTitle = document.createElement('h3');
    formTitle.className = 'admin-add-title';
    if (schema.type === 'array') {
        formTitle.innerHTML = `<i class="fa-solid fa-square-plus"></i> 添加${schema.itemLabel || '新项'}`;
    } else if (schema.kvMode) {
        formTitle.innerHTML = '<i class="fa-solid fa-square-plus"></i> 添加键值对';
    }
    formWrapper.appendChild(formTitle);

    const formFields = document.createElement('div');
    formFields.className = 'admin-form-fields';

    if (schema.type === 'array' && schema.fields) {
        schema.fields.forEach(f => {
            formFields.appendChild(createFormField(f));
        });
    } else if (schema.kvMode) {
        const keyField = { key: '_kv_key', label: schema.kvKeyLabel || '键', type: 'text', required: true, placeholder: '输入键名' };
        const valField = { key: '_kv_val', label: schema.kvValueLabel || '值', type: schema.kvValueType || 'text', required: true, placeholder: '输入值' };
        formFields.appendChild(createFormField(keyField));
        formFields.appendChild(createFormField(valField));
    }

    formWrapper.appendChild(formFields);

    const btnRow = document.createElement('div');
    btnRow.className = 'admin-form-buttons';
    const submitBtn = document.createElement('button');
    submitBtn.className = 'admin-btn success';
    submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> 确认添加';
    submitBtn.addEventListener('click', () => handleAddSubmit(schema, formWrapper));
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'admin-btn';
    cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> 取消';
    cancelBtn.addEventListener('click', () => { showAddForm = false; renderEditor(); });
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(submitBtn);
    formWrapper.appendChild(btnRow);
    container.appendChild(formWrapper);
    formWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderObjectEditForm(container, schema) {
    const formWrapper = document.createElement('div');
    formWrapper.className = 'admin-add-form glass-card';
    formWrapper.style.cssText = 'margin-top:20px;';
    const formTitle = document.createElement('h3');
    formTitle.className = 'admin-add-title';
    formTitle.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> 编辑顶层字段';
    formWrapper.appendChild(formTitle);

    const formFields = document.createElement('div');
    formFields.className = 'admin-form-fields';

    schema.fields.forEach(f => {
        const fieldWrapper = createFormField(f);
        // Pre-fill with existing value
        const input = fieldWrapper.querySelector('input, textarea, select');
        if (input && input.tagName !== 'SELECT') {
            const existing = getNestedValue(currentData, f.key);
            if (existing !== undefined && existing !== null) {
                if (f.type === 'textarea') {
                    input.value = String(existing);
                } else {
                    input.value = String(existing);
                }
            }
        }
        formFields.appendChild(fieldWrapper);
    });

    formWrapper.appendChild(formFields);

    const btnRow = document.createElement('div');
    btnRow.className = 'admin-form-buttons';
    const submitBtn = document.createElement('button');
    submitBtn.className = 'admin-btn success';
    submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> 保存修改';
    submitBtn.addEventListener('click', () => handleAddSubmit(schema, formWrapper));
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'admin-btn';
    cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> 取消';
    cancelBtn.addEventListener('click', () => { showAddForm = false; renderEditor(); });
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(submitBtn);
    formWrapper.appendChild(btnRow);
    container.appendChild(formWrapper);
    formWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function createFormField(fieldDef) {
    const wrapper = document.createElement('div');
    wrapper.className = 'admin-form-field';
    wrapper.dataset.fieldKey = fieldDef.key;

    const label = document.createElement('label');
    label.className = 'admin-form-label';
    label.innerHTML = fieldDef.label + (fieldDef.required ? ' <span class="required-star">*</span>' : ' <span class="optional-tag">可选</span>');
    if (fieldDef.note) {
        const note = document.createElement('span');
        note.className = 'admin-form-note';
        note.textContent = ' ' + fieldDef.note;
        label.appendChild(note);
    }
    wrapper.appendChild(label);

    if (fieldDef.type === 'info') {
        const info = document.createElement('div');
        info.className = 'admin-form-info';
        info.innerHTML = '<i class="fa-solid fa-circle-info"></i> ' + (fieldDef.note || '添加后请在源文件中手动设置此字段');
        wrapper.appendChild(info);
        return wrapper;
    }

    if (fieldDef.type === 'select') {
        const select = document.createElement('select');
        select.className = 'admin-form-input';
        select.dataset.fieldKey = fieldDef.key;
        fieldDef.options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            select.appendChild(option);
        });
        wrapper.appendChild(select);
        return wrapper;
    }

    if (fieldDef.type === 'boolean') {
        const cbWrapper = document.createElement('div');
        cbWrapper.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'admin-form-checkbox';
        checkbox.dataset.fieldKey = fieldDef.key;
        checkbox.checked = true;
        checkbox.style.cssText = 'width:18px;height:18px;cursor:pointer;';
        const checkboxLabel = document.createElement('span');
        checkboxLabel.textContent = '可见';
        checkboxLabel.style.cssText = 'font-size:0.85rem;';
        cbWrapper.appendChild(checkbox);
        cbWrapper.appendChild(checkboxLabel);
        wrapper.appendChild(cbWrapper);
        return wrapper;
    }

    if (fieldDef.type === 'textarea' || fieldDef.type === 'textarea-array') {
        const textarea = document.createElement('textarea');
        textarea.className = 'admin-form-input admin-form-textarea';
        textarea.dataset.fieldKey = fieldDef.key;
        textarea.placeholder = fieldDef.placeholder || '';
        textarea.rows = fieldDef.type === 'textarea-array' ? 4 : 5;
        wrapper.appendChild(textarea);
        return wrapper;
    }

    const input = document.createElement('input');
    input.type = fieldDef.type === 'number' ? 'number' : 'text';
    input.className = 'admin-form-input';
    input.dataset.fieldKey = fieldDef.key;
    input.placeholder = fieldDef.placeholder || '';
    if (fieldDef.type === 'number') input.step = 'any';
    wrapper.appendChild(input);
    return wrapper;
}

function handleAddSubmit(schema, formWrapper) {
    const newItem = {};
    const inputs = formWrapper.querySelectorAll('[data-field-key]');

    for (const input of inputs) {
        const key = input.dataset.fieldKey;
        if (!key) continue;
        let value;

        if (input.type === 'checkbox') {
            value = input.checked;
        } else if (input.tagName === 'SELECT') {
            value = input.value;
        } else if (input.tagName === 'TEXTAREA') {
            const fieldDef = schema.fields ? schema.fields.find(f => f.key === key) : null;
            if (fieldDef && fieldDef.type === 'textarea-array') {
                value = input.value.split('\n').map(s => s.trim()).filter(s => s.length > 0);
            } else {
                value = input.value;
            }
        } else if (input.type === 'number') {
            value = input.value === '' ? 0 : Number(input.value);
        } else {
            value = input.value;
        }

        if (key.startsWith('_kv_')) continue;
        newItem[key] = value;
    }

    // Validate required fields
    const fieldList = schema.fields || [];
    for (const f of fieldList) {
        if (f.required && f.type !== 'info') {
            const val = newItem[f.key];
            if (val === undefined || val === null || String(val).trim() === '') {
                showToast('请填写必填字段：' + f.label);
                return;
            }
        }
    }

    // Handle conditional fields (score-log)
    for (const f of fieldList) {
        if (f.condField && f.condValue !== undefined) {
            const condVal = newItem[f.condField];
            if (condVal !== f.condValue) {
                delete newItem[f.key];
            }
        }
        if (f.condField && f.condNotValue !== undefined) {
            const condVal = newItem[f.condField];
            if (condVal === f.condNotValue) {
                delete newItem[f.key];
            }
        }
    }

    // Apply
    if (schema.type === 'array') {
        for (const f of fieldList) {
            if (f.type === 'info') {
                newItem[f.key] = f.value !== undefined ? JSON.parse(JSON.stringify(f.value)) : [];
            }
        }
        currentData.push(newItem);
    } else if (schema.kvMode) {
        const kvKey = formWrapper.querySelector('[data-field-key="_kv_key"]');
        const kvVal = formWrapper.querySelector('[data-field-key="_kv_val"]');
        if (!kvKey || !kvVal || !kvKey.value.trim()) {
            showToast('请填写键名和值');
            return;
        }
        const k = kvKey.value.trim();
        let v = kvVal.value;
        if (schema.kvValueType === 'number') v = Number(v) || 0;

        if (schema.kvNoTopFields) {
            currentData[k] = v;
        } else if (schema.kvContainerKey) {
            if (!currentData[schema.kvContainerKey]) currentData[schema.kvContainerKey] = {};
            currentData[schema.kvContainerKey][k] = v;
        }
    } else if (schema.fields && schema.type === 'object') {
        // For about.json type
        for (const f of fieldList) {
            if (f.type === 'info') continue;
            const parts = f.key.split('.');
            if (parts.length === 1) {
                if (newItem[f.key] !== undefined) currentData[f.key] = newItem[f.key];
            } else {
                let obj = currentData;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!obj[parts[i]]) obj[parts[i]] = {};
                    obj = obj[parts[i]];
                }
                if (newItem[f.key] !== undefined) obj[parts[parts.length - 1]] = newItem[f.key];
            }
        }
    }

    showAddForm = false;
    renderEditor();
    showToast('已保存！请点击「生成 JSON」复制内容手动替换源文件');
}

// ========================================
// JSON 生成与复制
// ========================================
function updateRawJson() {
    if (!currentData) return;
    $('rawJsonOutput').textContent = JSON.stringify(currentData, null, 2);
}

function generateJson() {
    if (!currentData) { showToast('请先选择数据文件'); return; }
    updateRawJson();
    $('rawJsonPanel').classList.remove('collapsed');
    $('rawJsonPanel').scrollIntoView({ behavior: 'smooth' });
    showToast('JSON 已生成，请手动复制替换源文件');
}

function copyRawJson() {
    const text = $('rawJsonOutput').textContent;
    if (!text || text.startsWith('//')) { showToast('请先生成 JSON'); return; }
    navigator.clipboard.writeText(text).then(() => {
        showToast('已复制到剪贴板！');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        showToast('已复制到剪贴板！');
    });
}

function resetAll() {
    if (!originalData) return;
    confirmDelete('所有未保存的修改将丢失，确定要重置吗？', () => {
        currentData = JSON.parse(JSON.stringify(originalData));
        showAddForm = false;
        renderEditor();
        showToast('已重置为原始数据');
    });
}

// ========================================
// 工具函数
// ========================================
function confirmDelete(message, callback) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
        <div class="confirm-dialog glass-card">
            <h3><i class="fa-solid fa-triangle-exclamation" style="color:var(--admin-danger);"></i> 确认操作</h3>
            <p>${message}</p>
            <div class="confirm-dialog-actions">
                <button class="admin-btn danger" id="confirmDeleteYes">确认</button>
                <button class="admin-btn" id="confirmDeleteNo">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirmDeleteYes').addEventListener('click', () => { overlay.remove(); callback(); });
    overlay.querySelector('#confirmDeleteNo').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function showToast(message) {
    const existing = document.querySelector('.copy-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'copy-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ========================================
// 启动
// ========================================
document.addEventListener('DOMContentLoaded', init);
