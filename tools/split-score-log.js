/**
 * 按赛季拆分 score-log.json
 * 
 * 用法: node tools/split-score-log.js
 * 
 * 读取每个项目目录下的 seasons.json 获取赛季边界，
 * 将 score-log.json 中的记录按赛季拆分到 score-log-{seasonId}.json
 */

const fs = require('fs');
const path = require('path');

const CATEGORIES = ['ms', 'ws', 'md', 'wd', 'xd'];
const WTT_DATA_DIR = path.join(__dirname, '..', 'wtt_data');

function splitScoreLog(category) {
    const dir = path.join(WTT_DATA_DIR, category);
    const scoreLogPath = path.join(dir, 'score-log.json');
    const seasonsPath = path.join(dir, 'seasons.json');

    if (!fs.existsSync(scoreLogPath)) {
        console.log(`[${category}] score-log.json 不存在，跳过`);
        return;
    }
    if (!fs.existsSync(seasonsPath)) {
        console.log(`[${category}] seasons.json 不存在，跳过`);
        return;
    }

    console.log(`\n===== 处理 ${category} =====`);

    const scoreLog = JSON.parse(fs.readFileSync(scoreLogPath, 'utf8'));
    const seasons = JSON.parse(fs.readFileSync(seasonsPath, 'utf8'));

    console.log(`  总记录数: ${scoreLog.length}`);
    console.log(`  赛季数: ${seasons.length}`);

    // 按赛季分组
    const seasonBuckets = {};
    const noSeasonRecords = [];

    for (const record of scoreLog) {
        const date = record['日期'];
        if (!date) {
            noSeasonRecords.push(record);
            continue;
        }

        // 找到记录所属的赛季
        let found = false;
        for (const season of seasons) {
            if (date >= season.startDate && date <= season.endDate) {
                const key = season.id;
                if (!seasonBuckets[key]) seasonBuckets[key] = [];
                seasonBuckets[key].push(record);
                found = true;
                break;
            }
        }
        if (!found) {
            noSeasonRecords.push(record);
        }
    }

    // 写入各赛季文件
    for (const [seasonId, records] of Object.entries(seasonBuckets)) {
        const outPath = path.join(dir, `score-log-${seasonId}.json`);
        fs.writeFileSync(outPath, JSON.stringify(records, null, 2), 'utf8');
        const sizeKB = (Buffer.byteLength(JSON.stringify(records, null, 2)) / 1024).toFixed(1);
        console.log(`  ${seasonId}: ${records.length} 条记录 → ${sizeKB} KB`);
    }

    if (noSeasonRecords.length > 0) {
        console.log(`  ⚠ 未匹配赛季的记录: ${noSeasonRecords.length} 条`);
        // 写入未匹配的记录到单独文件
        const outPath = path.join(dir, 'score-log-unmatched.json');
        fs.writeFileSync(outPath, JSON.stringify(noSeasonRecords, null, 2), 'utf8');
    }

    // 统计总大小对比
    const originalSize = (fs.statSync(scoreLogPath).size / 1024).toFixed(1);
    console.log(`  原始文件: ${originalSize} KB`);
    console.log(`  拆分完成!`);
}

// 主流程
console.log('WTT score-log.json 按赛季拆分工具\n');

for (const cat of CATEGORIES) {
    splitScoreLog(cat);
}

console.log('\n✅ 全部完成!');
console.log('原始 score-log.json 已保留，新文件为 score-log-{seasonId}.json');
