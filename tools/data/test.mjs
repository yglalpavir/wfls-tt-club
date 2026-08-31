import { ittfPingPong } from 'ittf-pingpong';

const client = new ittfPingPong();

async function test() {
  try {
    console.log('🚀 正在获取男单世界排名前10...');
    const rankings = await client.currentRankings('SEN', 'M', 'S', 10);
    console.log('✅ 排名数据:');
    console.log(JSON.stringify(rankings, null, 2));
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
    console.error('详细错误:', error);
  }
}

test();