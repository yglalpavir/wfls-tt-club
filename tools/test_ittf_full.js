/**
 * 全面测试 ittf-pingpong API + 直接调用底层 WTT API
 * 用法: node tools/test_ittf_full.js
 */

const { ittfPingPong } = require('ittf-pingpong');
const client = new ittfPingPong();

// ========== 底层 API 配置 (从包源码提取) ==========
const API_KEYS = {
  'apikey': '2bf8b222-532c-4c60-8ebe-eb6fdfebe84a',
  'secapimkey': 'S_WTT_882jjh7basdj91834783mds8j2jsd81',
};
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  ...API_KEYS,
};

async function fetchJSON(url, label) {
  const start = Date.now();
  try {
    const r = await fetch(url, { headers: HEADERS });
    const d = await r.json();
    const ms = Date.now() - start;
    console.log(`  ✅ ${label}: ${r.status} (${ms}ms)`);
    return d;
  } catch (e) {
    console.log(`  ❌ ${label}: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  ittf-pingpong API 全面测试         ║');
  console.log('╚══════════════════════════════════════╝\n');

  // ===== 1. currentRankings =====
  console.log('─'.repeat(50));
  console.log('1. currentRankings - 各类排名测试');
  console.log('─'.repeat(50));

  const testCases = [
    ['SEN', 'M', 'S', 5, '男子单打 SEN/M/S'],
    ['SEN', 'W', 'S', 5, '女子单打 SEN/W/S'],
    ['SEN', 'M', 'D', 5, '男子双打 SEN/M/D'],
    ['SEN', 'W', 'D', 5, '女子双打 SEN/W/D'],
    ['SEN', 'X', 'D', 5, '混合双打 SEN/X/D'],
    ['SEN', 'M', 'DI', 3, '男子双打个人 SEN/M/DI'],
    ['YOU', 'M', 'S', 3, '青年男子单打 YOU/M/S'],
    ['YOU', 'W', 'S', 3, '青年女子单打 YOU/W/S'],
  ];

  for (const [type, gender, cat, n, desc] of testCases) {
    try {
      const r = await client.currentRankings(type, gender, cat, n);
      const names = r.slice(0, 3).map(x => x.PlayerName).join(', ');
      console.log(`  ${desc}(top${n}): ${names}`);
    } catch (e) {
      console.log(`  ❌ ${desc}: ${e.message}`);
    }
  }

  // ===== 2. playerIttfId =====
  console.log('\n' + '─'.repeat(50));
  console.log('2. playerIttfId - 球员ID搜索');
  console.log('─'.repeat(50));

  const searches = [
    [{ playerFullName: 'FAN Zhendong' }, '樊振东'],
    [{ playerFullName: 'WANG Chuqin' }, '王楚钦'],
    [{ playerFullName: 'SUN Yingsha' }, '孙颖莎'],
    [{ playerFamilyName: 'Harimoto' }, '张本家族'],
    [{ playerFamilyName: 'Lebrun' }, '勒布伦兄弟'],
    [{ playerGivenName: 'Truls' }, 'Truls(莫雷加德)'],
  ];

  for (const [params, desc] of searches) {
    try {
      const r = await client.playerIttfId(params);
      const names = r.slice(0, 3).map(x => `${x.PlayerFamilyNameFirst}(${x.IttfId})`).join(', ');
      console.log(`  ${desc}: ${names}`);
    } catch (e) {
      console.log(`  ❌ ${desc}: ${e.message}`);
    }
  }

  // ===== 3. playerProfile =====
  console.log('\n' + '─'.repeat(50));
  console.log('3. playerProfile - 球员详细资料');
  console.log('─'.repeat(50));

  const profiles = [
    [{ playerIttfId: 121404 }, '樊振东(121404)'],
    [{ playerIttfId: 121558 }, '王楚钦(121558)'],
    [{ playerFullName: 'SUN Yingsha' }, '孙颖莎'],
  ];

  for (const [params, desc] of profiles) {
    try {
      const r = await client.playerProfile(params, { includeExtendedDetails: true });
      const yrs = r.stats?.total?.length || 0;
      console.log(`  ${desc}: ${yrs}年数据, top rank=${r.ranking?.BestPos?.[0]?.Rank || '?'}`);
    } catch (e) {
      console.log(`  ❌ ${desc}: ${e.message}`);
    }
  }

  // ===== 4. 直接调用底层 WTT API =====
  console.log('\n' + '─'.repeat(50));
  console.log('4. 直接调用 WTT/ITTF 底层 API');
  console.log('─'.repeat(50));

  // WTT Frontdoor (top 100)
  const fd = await fetchJSON(
    "https://wtt-web-frontdoor-withoutcache-cqakg0andqf5hchn.a01.azurefd.net/ranking/?Gender=MEN%27S&AgeCategory=SENIOR&CategoryCode=S&RankingYear=2026&RankingMonth=7&RankingWeek=30&Limit=100",
    'WTT Frontdoor MS Top100'
  );
  if (fd?.data) console.log(`    记录数: ${fd.data.length}, 第一: ${fd.data[0]?.PlayerName}`);

  // WTT CMS API
  const cms = await fetchJSON(
    "https://wttcmsapigateway-new.azure-api.net/internalttu/RankingsCurrentWeek/CurrentWeek/",
    'WTT CMS Rankings'
  );

  // ITTF Player Profile
  const profile = await fetchJSON(
    "https://ranking.ittf.com/public/s/player/profile/121404",
    'ITTF Profile (121404 樊振东)'
  );
  if (profile) console.log(`    Keys: ${Object.keys(profile).join(', ')}`);

  // All Players
  const all = await fetchJSON(
    "https://wttcmsapigateway-new.azure-api.net/ttu/Players/GetPlayers?limit=500",
    'WTT Players (limit=500)'
  );
  if (all?.data) console.log(`    记录数: ${all.data.length}`);

  // ===== 5. 获取完整排名数据 =====
  console.log('\n' + '─'.repeat(50));
  console.log('5. 批量获取全部排名 (用于数据导入)');
  console.log('─'.repeat(50));

  try {
    const allMS = await client.currentRankings('SEN', 'M', 'S', 'all');
    console.log(`  男子单打全部: ${allMS.length} 人`);
    console.log(`  最后一名: ${allMS[allMS.length - 1]?.PlayerName} (Rank ${allMS[allMS.length - 1]?.CurrentRank})`);
  } catch (e) {
    console.log(`  ❌ 男子单打全部: ${e.message}`);
  }

  console.log('\n✅ 测试完成!');
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
