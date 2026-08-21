# -*- coding: utf-8 -*-

data = """2015,Team World Cup Dubai 2015,ITTF World Cup,--,132,2015-01-08,2015-01-11
2015,World Table Tennis Championships Suzhou 2015,ITTF WTTC,--,1018,2015-04-26,2015-05-03
2015,GAC Group World Tour Spanish Open Almeria 2015,ITTF World Tour / Pro Tour,Major Series,585,2015-03-25,2015-03-29
2015,GAC Group World Tour German Open Bremen 2015,ITTF World Tour / Pro Tour,Super Series,496,2015-03-18,2015-03-22
2015,GAC Group World Tour Qatar Open Doha 2015,ITTF World Tour / Pro Tour,Super Series,283,2015-02-17,2015-02-22
2015,GAC Group World Tour Kuwait Open Kuwait City 2015,ITTF World Tour / Pro Tour,Super Series,307,2015-02-11,2015-02-15
2015,GAC Group World Tour Korea Open Incheon 2015,ITTF World Tour / Pro Tour,Super Series,191,2015-07-01,2015-07-05
2015,GAC Group World Tour Japan Open Kobe 2015,ITTF World Tour / Pro Tour,Super Series,260,2015-06-24,2015-06-28
2015,GAC Group World Tour China Open Chengdu 2015,ITTF World Tour / Pro Tour,Super Series,248,2015-08-05,2015-08-09
2015,GAC Group World Tour Austrian Open Wels 2015,ITTF World Tour / Pro Tour,Major Series,609,2015-09-02,2015-09-06
2015,GAC Group World Tour Czech Open Olomouc 2015,ITTF World Tour / Pro Tour,Major Series,600,2015-08-26,2015-08-30
2015,GAC Group World Tour Swedish Open Stockholm 2015,ITTF World Tour / Pro Tour,Major Series,491,2015-11-11,2015-11-15
2015,GAC Group World Tour Polish Open Warsaw 2015,ITTF World Tour / Pro Tour,Major Series,666,2015-10-21,2015-10-25
2015,GAC Group World Tour Grand Finals Lisbon 2015,ITTF World Tour / Pro Tour,Grand Finals,74,2015-12-10,2015-12-13
2015,Men's World Cup Halmstad 2015,ITTF World Cup,--,28,2015-10-16,2015-10-18
2015,Women's World Cup Sendai 2015,ITTF World Cup,--,28,2015-10-30,2015-11-01"""

fields = ['年份', '赛事名称', '赛事类型', '赛事种类', '参赛人数', '开始日期', '结束日期']

print("正在创建2015年赛事信息文件（不含Challenge Series）...\n")

lines = data.strip().split('\n')
count = 0

for line in lines:
    values = line.split(',')
    if len(values) < 7:
        continue
    
    year, name, event_type, event_kind, matches, start_date, end_date = values[:7]
    
    filename = f"{name}.txt"
    
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