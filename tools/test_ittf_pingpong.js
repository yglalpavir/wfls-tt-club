/**
 * 测试 ittf-pingpong npm 包的 API
 * 使用方法: node tools/test_ittf_pingpong.js
 */

const { ittfPingPong } = require('ittf-pingpong');

const client = new ittfPingPong();

async function main() {
  console.log('=== ittf-pingpong API 测试 ===\n');

  // 1. 测试 currentRankings - 获取男子单打排名前10
  console.log('1. 获取男子单打(SEN/M/S)排名前10...');
  try {
    const rankings = await client.currentRankings('SEN', 'M', 'S', 10);
    console.log(`   获取到 ${rankings.length} 条记录`);
    if (rankings.length > 0) {
      console.log('   前3条:');
      rankings.slice(0, 3).forEach((r, i) => {
        console.log(`     ${i + 1}. ${r.PlayerName || r.FamilyName + ' ' + r.GivenName} (ID: ${r.IttfId}, Rank: ${r.Rank})`);
      });
      console.log('   完整第一条:', JSON.stringify(rankings[0], null, 2));
    }
  } catch (e) {
    console.error('   ❌ 错误:', e.message);
  }

  console.log('');

  // 2. 测试 playerIttfId - 搜索球员ID
  console.log('2. 搜索球员 "FAN Zhendong"...');
  try {
    const ids = await client.playerIttfId({ playerFullName: 'FAN Zhendong' });
    console.log(`   找到 ${ids.length} 条结果:`, JSON.stringify(ids, null, 2));
  } catch (e) {
    console.error('   ❌ 错误:', e.message);
  }

  console.log('');

  // 3. 测试 playerProfile - 获取球员详细资料
  console.log('3. 获取球员 121404 (樊振东) 详细资料...');
  try {
    const profile = await client.playerProfile({ playerIttfId: 121404 }, { includeExtendedDetails: true });
    console.log('   资料:', JSON.stringify(profile, null, 2));
  } catch (e) {
    console.error('   ❌ 错误:', e.message);
  }

  console.log('');

  // 4. 女子单打排名
  console.log('4. 获取女子单打(SEN/W/S)排名前10...');
  try {
    const rankings = await client.currentRankings('SEN', 'W', 'S', 10);
    console.log(`   获取到 ${rankings.length} 条记录`);
    if (rankings.length > 0) {
      rankings.slice(0, 5).forEach((r, i) => {
        console.log(`     ${i + 1}. ${r.PlayerName || r.FamilyName + ' ' + r.GivenName} (Rank: ${r.Rank})`);
      });
    }
  } catch (e) {
    console.error('   ❌ 错误:', e.message);
  }

  console.log('');

  // 5. 男子双打排名
  console.log('5. 获取男子双打(SEN/M/D)排名前10...');
  try {
    const rankings = await client.currentRankings('SEN', 'M', 'D', 10);
    console.log(`   获取到 ${rankings.length} 条记录`);
    if (rankings.length > 0) {
      rankings.slice(0, 5).forEach((r, i) => {
        console.log(`     ${i + 1}. ${r.PlayerName || JSON.stringify(r)} (Rank: ${r.Rank})`);
      });
    }
  } catch (e) {
    console.error('   ❌ 错误:', e.message);
  }

  console.log('\n=== 测试完成 ===');
}

main().catch(console.error);
