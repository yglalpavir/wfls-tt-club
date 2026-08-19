# -*- coding: utf-8 -*-
"""
ITTF 2013年世界巡回赛 赛事信息批量创建脚本
自动过滤掉 Challenge Series 级别的赛事
"""

# ==================== 数据部分 ====================
# 原始数据（已手动过滤，只保留非 Challenge Series）
data = """124	2013	World Tour Grand Finals Dubai 2013	ITTF World Tour / Pro Tour	Grand Finals	76	2014-01-09	2014-01-12
122	2013	World Tour Swedish Open Stockholm 2013	ITTF World Tour / Pro Tour	Major Series	450	2013-11-27	2013-12-01
123	2013	World Tour Russian Open Ekaterinburg 2013	ITTF World Tour / Pro Tour	Major Series	263	2013-11-20	2013-11-24
120	2013	World Tour German Open Bremen 2013	ITTF World Tour / Pro Tour	Super Series	787	2013-11-13	2013-11-17
121	2013	World Tour Polish Open Spala 2013	ITTF World Tour / Pro Tour	Major Series	666	2013-11-06	2013-11-10
117	2013	World Tour Czeck Open Olomouc 2013	ITTF World Tour / Pro Tour	Major Series	583	2013-08-21	2013-08-25
119	2013	World Tour Harmony China Open Suzhou 2013	ITTF World Tour / Pro Tour	--	314	2013-08-14	2013-08-18
113	2013	World Tour Japan Open Yokohama 2013	ITTF World Tour / Pro Tour	Super Series	350	2013-06-19	2013-06-23
112	2013	World Tour China Open Changchun 2013	ITTF World Tour / Pro Tour	Super Series	263	2013-06-12	2013-06-16
110	2013	World Tour Korea Open Incheon 2013	ITTF World Tour / Pro Tour	Major Series	411	2013-04-03	2013-04-07
107	2013	World Tour Qatar Open Doha 2013	ITTF World Tour / Pro Tour	Super Series	448	2013-02-20	2013-02-24
108	2013	World Tour Kuwait Open Kuwait City 2013	ITTF World Tour / Pro Tour	Super Series	318	2013-02-14	2013-02-18
106	2013	World Tour Austrian Open Wels 2013	ITTF World Tour / Pro Tour	Major Series	656	2013-01-23	2013-01-27
105	2013	Euro-Africa Spanish Open Almeria 2013	ITTF World Tour / Pro Tour	Challenge Series	276	2013-01-17	2013-01-20"""

# ==================== 核心逻辑 ====================

# 按行拆分
lines = data.strip().split('\n')

# 过滤掉 Challenge Series
filtered_lines = [line for line in lines if "Challenge Series" not in line]

# 字段名（用于输出标签）
fields = ['赛事编号', '年份', '赛事名称', '赛事类型', '赛事种类', '参赛人数', '开始日期', '结束日期']

# ==================== 执行创建 ====================

print("=" * 60)
print("  2013年 ITTF 世界巡回赛 赛事信息文件生成器")
print("  (已自动过滤 Challenge Series)")
print("=" * 60)
print()

print(f"📊 原始数据共 {len(lines)} 站赛事")
print(f"📊 过滤后共 {len(filtered_lines)} 站赛事（不含 Challenge Series）")
print()

print("⏳ 正在生成文件，请稍候...\n")

# 统计变量
success_count = 0
fail_count = 0
failed_files = []

for line in filtered_lines:
    # 按制表符分割
    values = line.split('\t')
    
    # 提取赛事名称作为文件名
    event_name = values[2]  # 第3列是赛事名称
    
    # 处理文件名中的非法字符（Windows不允许）
    illegal_chars = ['\\', '/', ':', '*', '?', '"', '<', '>', '|']
    safe_name = event_name
    for char in illegal_chars:
        safe_name = safe_name.replace(char, '_')
    
    filename = f"{safe_name}.txt"
    
    try:
        # 写入文件
        with open(filename, 'w', encoding='utf-8') as f:
            # 写入所有字段
            for i, value in enumerate(values):
                f.write(f"{fields[i]}：{value}\n")
            
            # 额外添加一条分隔线和统计信息（可选）
            f.write("\n" + "-" * 40 + "\n")
            f.write(f"数据来源：ITTF World Tour 2013\n")
            f.write(f"文件生成时间：自动生成\n")
        
        print(f"  ✅ 已创建：{filename}")
        success_count += 1
        
    except Exception as e:
        print(f"  ❌ 创建失败：{filename}，错误：{e}")
        fail_count += 1
        failed_files.append(filename)

# ==================== 统计输出 ====================

print()
print("=" * 60)
print("📈 生成统计")
print("=" * 60)
print(f"  ✅ 成功创建：{success_count} 个文件")
print(f"  ❌ 创建失败：{fail_count} 个文件")
if failed_files:
    print(f"  失败列表：{', '.join(failed_files)}")
print()
print("📁 文件按赛事名称命名，保存于当前目录")
print("=" * 60)
print("🎉 所有文件生成完毕！")
print()

# 可选：按赛事系列分类统计
print("📊 赛事系列分类统计：")
series_count = {
    'Grand Finals': 0,
    'Super Series': 0,
    'Major Series': 0,
    '其他/未标注': 0
}

for line in filtered_lines:
    values = line.split('\t')
    event_kind = values[4]  # 第5列是 Event Kind
    if 'Grand Finals' in event_kind:
        series_count['Grand Finals'] += 1
    elif 'Super Series' in event_kind:
        series_count['Super Series'] += 1
    elif 'Major Series' in event_kind:
        series_count['Major Series'] += 1
    else:
        series_count['其他/未标注'] += 1

print(f"  🏆 Grand Finals：{series_count['Grand Finals']} 站")
print(f"  ⭐ Super Series：{series_count['Super Series']} 站")
print(f"  📌 Major Series：{series_count['Major Series']} 站")
print(f"  📝 其他/未标注：{series_count['其他/未标注']} 站")
print()
print("-" * 60)