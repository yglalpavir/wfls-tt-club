/* ========================================
   build_players.js - 一次性迁移脚本
   合并 legacy 数据（initial-scores / player-tags / members）
   生成统一球员档案 data/players.json，分配 5 位 uid（10000 起）
   用法: node tools/build_players.js
   ======================================== */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LEGACY_DIR = path.join(DATA_DIR, 'legacy');

function readJson(file) {
    const p = path.join(DATA_DIR, file);
    if (!fs.existsSync(p)) throw new Error('缺少数据文件: ' + file);
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const initial = readJson('initial-scores.json');          // { baseDate, initialScores: {name: score} }
const tags    = readJson('player-tags.json');             // { players: {name: {tags, honors}} }
const members = readJson('members.json');                 // [{ name, role, description, qq }]

const tagMap = tags && tags.players ? tags.players : {};
const memberMap = {};
for (const m of members || []) {
    if (m && m.name) memberMap[m.name] = m;
}

// 姓名 -> 初始积分，按积分降序（同分按姓名拼音升序）稳定分配 uid
const entries = Object.entries(initial.initialScores || {})
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'zh'));

const players = entries.map(([name, score], i) => {
    const uid = 10000 + i;
    const t = tagMap[name] || {};
    const m = memberMap[name] || {};
    return {
        uid: uid,
        name: name,
        aliases: [],
        initialScore: score,
        tags: Array.isArray(t.tags) ? t.tags : [],
        honors: Array.isArray(t.honors) ? t.honors : [],
        role: m.role || '',
        qq: m.qq || '',
        description: m.description || '',
        status: 'active'
    };
});

const result = {
    version: 1,
    baseDate: initial.baseDate || '2026-03-01',
    players: players
};

// 校验 uid 唯一性
const uidSet = new Set(players.map(p => p.uid));
if (uidSet.size !== players.length) throw new Error('uid 生成重复，终止写入');
for (const p of players) {
    if (!/^\d{5,}$/.test(String(p.uid))) throw new Error('uid 格式非法: ' + p.uid);
}

// 备份旧文件检查：若目标已存在则拒绝覆盖（防数据丢失）
const outPath = path.join(DATA_DIR, 'players.json');
if (fs.existsSync(outPath)) {
    throw new Error('data/players.json 已存在，拒绝覆盖。请确认后手动处理。');
}

fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log('[OK] 已生成 data/players.json，共 ' + players.length + ' 名球员');
console.log('     uid 范围: ' + players[0].uid + ' ~ ' + players[players.length - 1].uid);
console.log('     baseDate: ' + result.baseDate);

// 校验输出可解析
const check = JSON.parse(fs.readFileSync(outPath, 'utf8'));
if (check.players.length !== players.length) throw new Error('生成文件校验失败');
console.log('[OK] 生成文件校验通过');