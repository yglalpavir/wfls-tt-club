# -*- coding: utf-8 -*-

# 2014年赛事数据（不含 Challenge Series）
data = """2014,Men's World Cup Dusseldorf 2014,ITTF World Cup,--,28,2014-10-24,2014-10-26
2014,Women's World Cup Linz 2014,ITTF World Cup,--,28,2014-10-17,2014-10-19
2014,World Tour Grand Finals Bangkok 2014,ITTF World Tour / Pro Tour,Grand Finals,74,2014-12-11,2014-12-14
2014,World Tour Swedish Open Stockholm 2014,ITTF World Tour / Pro Tour,Major Series,502,2014-11-12,2014-11-16
2014,World Tour Russian Open Ekaterinburg 2014,ITTF World Tour / Pro Tour,Major Series,394,2014-11-05,2014-11-09
2014,World Tour Czech Open Olomouc 2014,ITTF World Tour / Pro Tour,Major Series,615,2014-08-27,2014-08-31
2014,World Tour Japan Open Yokohama 2014,ITTF World Tour / Pro Tour,Super Series,375,2014-06-18,2014-06-22
2014,World Tour Korea Open Incheon 2014,ITTF World Tour / Pro Tour,Super Series,452,2014-06-11,2014-06-15
2014,World Tour China Open Chengdu 2014,ITTF World Tour / Pro Tour,Super Series,270,2014-06-04,2014-06-08
2014,World Tour Spanish Open Almeria 2014,ITTF World Tour / Pro Tour,Major Series,483,2014-04-02,2014-04-06
2014,World Tour German Open Magdeburg 2014,ITTF World Tour / Pro Tour,Super Series,462,2014-03-26,2014-03-30
2014,World Tour Qatar Open Doha 2014,ITTF World Tour / Pro Tour,Super Series,451,2014-02-18,2014-02-23
2014,World Tour Kuwait Open Kuwait City 2014,ITTF World Tour / Pro Tour,Super Series,466,2014-02-12,2014-02-16
2014,World Team Table Tennis Championships Tokyo 2014,ITTF WTTC,--,2650,2014-04-28,2014-05-05"""

# 字段映射（按 CSV 顺序）
fields = ['年份', '赛事名称', '赛事类型', '赛事种类', '参赛人数', '开始日期', '结束日期']

print("正在创建2014年赛事信息文件（不含Challenge Series）...\n")

# 按行分割
lines = data.strip().split('\n')
count = 0

for line in lines:
    values = line.split(',')
    if len(values) < 7:
        continue
    
    # 提取字段
    year = values[0]
    name = values[1]
    event_type = values[2]
    event_kind = values[3]
    matches = values[4]
    start_date = values[5]
    end_date = values[6]
    
    # 以赛事名称作为文件名
    filename = f"{name}.txt"
    
    # 写入内容
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(f"年份：{year}\n")
        f.write(f"赛事名称：{name}\n")
        f.write(f"赛事类型：{event_type}\n")
        f.write(f"赛事种类：{event_kind}\n")
        f.write(f"参赛人数：{matches}\n")
        f.write(f"开始日期：{start_date}\n")
        f.write(f"结束日期：{end_date}\n")
    
    print(f"√ 已创建：{filename}")
    count += 1

print(f"\n✅ 全部完成！共创建 {count} 个文件。")