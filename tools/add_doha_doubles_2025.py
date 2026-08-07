#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""将 2025 多哈世乒赛(ITTF WTC Finals Doha 2025)男双/女双/混双数据合并到正式文件。"""
import json
import re
from pathlib import Path

BASE = Path(r"s:\wfls-tt-club\wfls-tt-club\wtt_data")

# 目标: 类别 -> (目录, 文件名)
TARGET = {
    "MD": ("md", "score-log-2025-wtt.json"),
    "WD": ("wd", "score-log-2025-ws.json"),
    "XD": ("xd", "score-log-2025-wtt.json"),
}


def clean(name):
    """去除种子号 (1) 并整理空白。"""
    return re.sub(r"\(\d+\)", "", name).strip()


# ---------------- 男双 MD ----------------
# (日期, 胜者组合, 负者组合)
MD = [
    # Round Of 64
    ("2025-05-18", "Felix LEBRUN/Alexis LEBRUN", "Daniel BERZOSA/Juan PEREZ"),
    ("2025-05-17", "Benyamin FARAJI/Amirmahdi KESHAVARZI", "Aidos KENZHIGULOV/Sanzhar ZHUBANOV"),
    ("2025-05-17", "Anton KALLBERG/Truls MOREGARD", "Marcos MADRID/Rogelio CASTRO"),
    ("2025-05-17", "Horacio CIFUENTES/Santiago LORENZO", "Sergio CARRILLO/Heber MOSCOSO"),
    ("2025-05-18", "Mattias FALCK/Kristian KARLSSON", "Fabio RAKOTOARIMANANA/Antoine RAZAFINARIVO"),
    ("2025-05-17", "Alberto MINO/Diego PIGUAVE", "Vladislav ZAKHAROV/Bakdaulet AKIMALI"),
    ("2025-05-18", "Dang QIU/Benedikt DUDA", "Choolwe HAMALAMBO/Charles BANDA"),
    ("2025-05-17", "Manav THAKKAR/Manush SHAH", "Peter HRIBAR/Deni KOZUL"),
    ("2025-05-17", "KAO Cheng-Jui/LIN Yun-Ju", "Matteo MUTTI/Andrea PUPPO"),
    ("2025-05-17", "Lubomir PISTEJ/Jakub ZELINKA", "Aly GHALLAB/Mahmoud HELMY"),
    ("2025-05-17", "Tomislav PUCAR/Darko JORGIC", "Abdullah YIGENLER/Ibrahim GUNDUZ"),
    ("2025-05-17", "HUANG Youzheng/LIANG Jingkun", "Edward LY/Simeon MARTIN"),
    ("2025-05-18", "Balazs LEI/Samuel ARPAS", "Vitor ISHIY/Guilherme TEODORO"),
    ("2025-05-18", "JANG Woojin/CHO Daeseong", "Connor GREEN/Liam PITCHFORD"),
    ("2025-05-18", "Iulian CHIRITA/Eduard IONESCU", "Mohammed ABDULWAHHAB/Abdullah ABDULWAHHAB"),
    ("2025-05-17", "LIN Gaoyuan/LIN Shidong", "Carlo ROSSI/John OYEBODE"),
    ("2025-05-18", "Tomokazu HARIMOTO/Sora MATSUSHIMA", "Jeremy DEY/Jerome MORISSEAU"),
    ("2025-05-17", "Robert GARDOS/Daniel HABESOHN", "Martin ALLEGRO/Adrien RASSENFOSSE"),
    ("2025-05-17", "Ovidiu IONESCU/Alvaro ROBLES", "LIN Yen-Chun/KUO Guan-Hong"),
    ("2025-05-18", "Hwan BAE/Aditya SAREEN", "Patrick FRANZISKA/Dimitrij OVTCHAROV"),
    ("2025-05-17", "CHAN Baldwin/WONG Chun Ting", "Muizz ADEGOKE/Abdulbasit ABDULFATAI"),
    ("2025-05-18", "Nicolas BURGOS/Gustavo GOMEZ", "Matthew KUTI/Olajide OMOTAYO"),
    ("2025-05-18", "Maciej KOLODZIEJCZYK/Vladislav URSU", "Harmeet DESAI/Sathiyan GNANASEKARAN"),
    ("2025-05-18", "Florian BOURRASSAUD/Esteban DORR", "CHOONG Javen/WONG Qi Shen"),
    ("2025-05-18", "LIM Jonghoon/AN Jaehyun", "Finn LUU/Nicholas LUM"),
    ("2025-05-17", "Mohamed ELBEIALI/Youssef ABDELAZIZ", "Yoan REBETEZ/Chaitanya VEPA"),
    ("2025-05-18", "Yang WANG/Konstantinos ANGELAKIS", "Ali ALKHADRAWI/Abdulaziz BU SHULAYBI"),
    ("2025-05-17", "CHEW Clarence/CHUA Josh", "Sultan AL-KUWARI/Rawad ALNASER"),
    ("2025-05-18", "QUEK Izaac/PANG Koen", "Anders LIND/Martin ANDERSEN"),
    ("2025-05-17", "Mehdi BOULOUSS/Milhane JELLOULI", "Dean SHU/Timothy CHOI"),
    ("2025-05-18", "KWAN Man Ho/YIU Kwan To", "Jishan LIANG/Sid NARESH"),
    ("2025-05-18", "Hiroto SHINOZUKA/Shunsuke TOGAMI", "Samuel KULCZYCKI/Milosz REDZIMSKI"),
    # Round Of 32
    ("2025-05-19", "Felix LEBRUN/Alexis LEBRUN", "Benyamin FARAJI/Amirmahdi KESHAVARZI"),
    ("2025-05-19", "Anton KALLBERG/Truls MOREGARD", "Horacio CIFUENTES/Santiago LORENZO"),
    ("2025-05-19", "Mattias FALCK/Kristian KARLSSON", "Alberto MINO/Diego PIGUAVE"),
    ("2025-05-19", "Dang QIU/Benedikt DUDA", "Manav THAKKAR/Manush SHAH"),
    ("2025-05-19", "KAO Cheng-Jui/LIN Yun-Ju", "Lubomir PISTEJ/Jakub ZELINKA"),
    ("2025-05-19", "HUANG Youzheng/LIANG Jingkun", "Tomislav PUCAR/Darko JORGIC"),
    ("2025-05-19", "JANG Woojin/CHO Daeseong", "Balazs LEI/Samuel ARPAS"),
    ("2025-05-19", "LIN Gaoyuan/LIN Shidong", "Iulian CHIRITA/Eduard IONESCU"),
    ("2025-05-19", "Tomokazu HARIMOTO/Sora MATSUSHIMA", "Robert GARDOS/Daniel HABESOHN"),
    ("2025-05-19", "Ovidiu IONESCU/Alvaro ROBLES", "Hwan BAE/Aditya SAREEN"),
    ("2025-05-19", "CHAN Baldwin/WONG Chun Ting", "Nicolas BURGOS/Gustavo GOMEZ"),
    ("2025-05-19", "Florian BOURRASSAUD/Esteban DORR", "Maciej KOLODZIEJCZYK/Vladislav URSU"),
    ("2025-05-19", "Mohamed ELBEIALI/Youssef ABDELAZIZ", "LIM Jonghoon/AN Jaehyun"),
    ("2025-05-19", "Yang WANG/Konstantinos ANGELAKIS", "CHEW Clarence/CHUA Josh"),
    ("2025-05-19", "QUEK Izaac/PANG Koen", "Mehdi BOULOUSS/Milhane JELLOULI"),
    ("2025-05-19", "Hiroto SHINOZUKA/Shunsuke TOGAMI", "KWAN Man Ho/YIU Kwan To"),
    # Round Of 16
    ("2025-05-21", "Felix LEBRUN/Alexis LEBRUN", "Anton KALLBERG/Truls MOREGARD"),
    ("2025-05-20", "Mattias FALCK/Kristian KARLSSON", "Dang QIU/Benedikt DUDA"),
    ("2025-05-20", "KAO Cheng-Jui/LIN Yun-Ju", "HUANG Youzheng/LIANG Jingkun"),
    ("2025-05-21", "LIN Gaoyuan/LIN Shidong", "JANG Woojin/CHO Daeseong"),
    ("2025-05-21", "Ovidiu IONESCU/Alvaro ROBLES", "Tomokazu HARIMOTO/Sora MATSUSHIMA"),
    ("2025-05-21", "Florian BOURRASSAUD/Esteban DORR", "CHAN Baldwin/WONG Chun Ting"),
    ("2025-05-20", "Mohamed ELBEIALI/Youssef ABDELAZIZ", "Yang WANG/Konstantinos ANGELAKIS"),
    ("2025-05-20", "Hiroto SHINOZUKA/Shunsuke TOGAMI", "QUEK Izaac/PANG Koen"),
    # QuarterFinal
    ("2025-05-23", "Felix LEBRUN/Alexis LEBRUN", "Mattias FALCK/Kristian KARLSSON"),
    ("2025-05-22", "KAO Cheng-Jui/LIN Yun-Ju", "LIN Gaoyuan/LIN Shidong"),
    ("2025-05-22", "Florian BOURRASSAUD/Esteban DORR", "Ovidiu IONESCU/Alvaro ROBLES"),
    ("2025-05-23", "Hiroto SHINOZUKA/Shunsuke TOGAMI", "Mohamed ELBEIALI/Youssef ABDELAZIZ"),
    # SemiFinal
    ("2025-05-24", "KAO Cheng-Jui/LIN Yun-Ju", "Felix LEBRUN/Alexis LEBRUN"),
    ("2025-05-24", "Hiroto SHINOZUKA/Shunsuke TOGAMI", "Florian BOURRASSAUD/Esteban DORR"),
    # Final
    ("2025-05-25", "Hiroto SHINOZUKA/Shunsuke TOGAMI", "KAO Cheng-Jui/LIN Yun-Ju"),
]

# ---------------- 女双 WD ----------------
WD = [
    # Round Of 64
    ("2025-05-18", "Satsuki ODO/Sakura YOKOI", "Veronika MATIUNINA/Solomiya BRATEYKO"),
    ("2025-05-17", "Anel BAKHYT/Angelina ROMANOVSKAYA", "Hanitra RAHARIMANANA/Ranto RAKOTONDRAZAKA"),
    ("2025-05-17", "TAN Zhao Yun/ZHANG Wanling", "Zauresh AKASHEVA/Sarvinoz MIRKADIROVA"),
    ("2025-05-17", "Mateja JEGER/Lea RAKOVAC", "Elizabeta SAMARA/Andreea DRAGOMAN"),
    ("2025-05-17", "Ayhika MUKHERJEE/Sutirtha MUKHERJEE", "Ozge YILMAZ/Ece HARAC"),
    ("2025-05-17", "Annett KAUFMANN/Xiaona SHAN", "Mo ZHANG/Ivy LIAO"),
    ("2025-05-17", "Georgina POTA/Sarah DE NUTTE", "Ana TOFANT/Sara TOKIC"),
    ("2025-05-18", "SHIN Yubin/RYU Hanna", "Yassamine BOUHENNI/Malissa NASRI"),
    ("2025-05-17", "Hana MATELOVA/Barbora BALAZOVA", "Ivana MALOBABIC/Hana ARAPOVIC"),
    ("2025-05-17", "Hend FATHY/Hana GODA", "Danisha PATEL/Rochica SONDAY"),
    ("2025-05-17", "Clio BARCENAS/Arantxa COSSIO", "Marta GULTI/Feven KINFU"),
    ("2025-05-18", "Sofia POLCANOVA/Bernadette SZOCS", "Mubanga KUNDA/Latifa NALAVWE"),
    ("2025-05-18", "TSAI Yun-En/HUANG Yi-Hua", "Izabela LUPULESKU/Sabina SURJAN"),
    ("2025-05-17", "Charlotte LUTZ/Leana HOCHART", "Fana FTWI/Yordanos DEJENE"),
    ("2025-05-17", "Sabine WINTER/Yuan WAN", "Aia MOHAMED/Maryam ALI"),
    ("2025-05-18", "QIAN Tianyi/CHEN Xingtong", "Daniela FONSECA/Estela CRESPO"),
    ("2025-05-18", "Miwa HARIMOTO/Miyuu KIHARA", "Paulina VEGA/Daniela ORTEGA"),
    ("2025-05-17", "Jia Nan YUAN/Prithika PAVADE", "Sally MOYLAND/Jessica REYES LAI"),
    ("2025-05-17", "ZENG Jian/SER Lin Qian", "Judith NANGONZI/Jemimah NAKAWALA"),
    ("2025-05-17", "Yashaswini GHORPADE/Diya CHITALE", "Markhabo MAGDIEVA/Asel ERKEBAEVA"),
    ("2025-05-18", "Natalia BAJOR/Tatiana KUKULKOVA", "Kabirat AYOOLA/Ajoke OJOMU"),
    ("2025-05-17", "KIM Nayeong/LEE Eunhye", "Linda BERGSTROM/Christina KALLBERG"),
    ("2025-05-18", "Rachel MORET/Gaia MONFARDINI", "Jiamuwa WU/Constantina PSIHOGIOS"),
    ("2025-05-18", "CHENG I-Ching/LI Yu-Jhun", "Jocelyn LAM/Lisa GEAR"),
    ("2025-05-18", "NG Wing Lam/ZHU Chengzhu", "Charlotte CAREY/Anna HURSEY"),
    ("2025-05-17", "Mariam ALHODABY/Marwa ALHODABY", "Ruth TAVARES/Isabel ALBINO"),
    ("2025-05-18", "Lucia CORDERO/Hidalynn ZAPATA", "Andrea TODOROVIC/Sibel ALTINKAYA"),
    ("2025-05-18", "Maria XIAO/Adina DIACONU", "Giulia TAKAHASHI/Laura WATANABE"),
    ("2025-05-18", "LEE Hoi Man/KONG Tsz Lam", "Orawan PARANANG/Suthasini SAWETTABUT"),
    ("2025-05-18", "CHANG Li Sian/LYNE Karen", "Fatimo BELLO/Hope UDOAKA"),
    ("2025-05-18", "CHA Su Yong/PAK Su Gyong", "Jinnipa SAWETTABUT/Kulapassr VIJITVIRIYAGUL"),
    ("2025-05-18", "WANG Manyu/KUAI Man", "Katarzyna WEGRZYN/Zuzanna WIELGOS"),
    # Round Of 32
    ("2025-05-19", "Satsuki ODO/Sakura YOKOI", "Anel BAKHYT/Angelina ROMANOVSKAYA"),
    ("2025-05-19", "Mateja JEGER/Lea RAKOVAC", "TAN Zhao Yun/ZHANG Wanling"),
    ("2025-05-19", "Annett KAUFMANN/Xiaona SHAN", "Ayhika MUKHERJEE/Sutirtha MUKHERJEE"),
    ("2025-05-19", "SHIN Yubin/RYU Hanna", "Georgina POTA/Sarah DE NUTTE"),
    ("2025-05-19", "Hana MATELOVA/Barbora BALAZOVA", "Hend FATHY/Hana GODA"),
    ("2025-05-19", "Sofia POLCANOVA/Bernadette SZOCS", "Clio BARCENAS/Arantxa COSSIO"),
    ("2025-05-19", "TSAI Yun-En/HUANG Yi-Hua", "Charlotte LUTZ/Leana HOCHART"),
    ("2025-05-19", "QIAN Tianyi/CHEN Xingtong", "Sabine WINTER/Yuan WAN"),
    ("2025-05-19", "Miwa HARIMOTO/Miyuu KIHARA", "Jia Nan YUAN/Prithika PAVADE"),
    ("2025-05-19", "Yashaswini GHORPADE/Diya CHITALE", "ZENG Jian/SER Lin Qian"),
    ("2025-05-19", "KIM Nayeong/LEE Eunhye", "Natalia BAJOR/Tatiana KUKULKOVA"),
    ("2025-05-19", "CHENG I-Ching/LI Yu-Jhun", "Rachel MORET/Gaia MONFARDINI"),
    ("2025-05-19", "NG Wing Lam/ZHU Chengzhu", "Mariam ALHODABY/Marwa ALHODABY"),
    ("2025-05-19", "Maria XIAO/Adina DIACONU", "Lucia CORDERO/Hidalynn ZAPATA"),
    ("2025-05-19", "LEE Hoi Man/KONG Tsz Lam", "CHANG Li Sian/LYNE Karen"),
    ("2025-05-19", "WANG Manyu/KUAI Man", "CHA Su Yong/PAK Su Gyong"),
    # Round Of 16
    ("2025-05-21", "Satsuki ODO/Sakura YOKOI", "Mateja JEGER/Lea RAKOVAC"),
    ("2025-05-20", "SHIN Yubin/RYU Hanna", "Annett KAUFMANN/Xiaona SHAN"),
    ("2025-05-21", "Sofia POLCANOVA/Bernadette SZOCS", "Hana MATELOVA/Barbora BALAZOVA"),
    ("2025-05-21", "Sabine WINTER/Yuan WAN", "TSAI Yun-En/HUANG Yi-Hua"),
    ("2025-05-21", "Miwa HARIMOTO/Miyuu KIHARA", "Yashaswini GHORPADE/Diya CHITALE"),
    ("2025-05-20", "KIM Nayeong/LEE Eunhye", "CHENG I-Ching/LI Yu-Jhun"),
    ("2025-05-20", "Maria XIAO/Adina DIACONU", "NG Wing Lam/ZHU Chengzhu"),
    ("2025-05-20", "WANG Manyu/KUAI Man", "LEE Hoi Man/KONG Tsz Lam"),
    # QuarterFinal
    ("2025-05-22", "SHIN Yubin/RYU Hanna", "Satsuki ODO/Sakura YOKOI"),
    ("2025-05-23", "Sofia POLCANOVA/Bernadette SZOCS", "Sabine WINTER/Yuan WAN"),
    ("2025-05-22", "Miwa HARIMOTO/Miyuu KIHARA", "KIM Nayeong/LEE Eunhye"),
    ("2025-05-23", "WANG Manyu/KUAI Man", "Maria XIAO/Adina DIACONU"),
    # SemiFinal
    ("2025-05-24", "Sofia POLCANOVA/Bernadette SZOCS", "SHIN Yubin/RYU Hanna"),
    ("2025-05-24", "WANG Manyu/KUAI Man", "Miwa HARIMOTO/Miyuu KIHARA"),
    # Final
    ("2025-05-25", "WANG Manyu/KUAI Man", "Sofia POLCANOVA/Bernadette SZOCS"),
]

# ---------------- 混双 XD ----------------
XD = [
    # Round Of 64
    ("2025-05-17", "LIN Shidong/KUAI Man", "Liam PITCHFORD/Anna HURSEY"),
    ("2025-05-18", "Simon GAUZY/Prithika PAVADE", "Patrick FRANZISKA/Annett KAUFMANN"),
    ("2025-05-17", "Mattias FALCK/Linda BERGSTROM", "Samuel ARPAS/Barbora BALAZOVA"),
    ("2025-05-17", "Robert GARDOS/Sofia POLCANOVA", "Dimitrije LEVAJAC/Izabela LUPULESKU"),
    ("2025-05-18", "Maharu YOSHIMURA/Satsuki ODO", "QUEK Izaac/ZENG Jian"),
    ("2025-05-17", "KUO Guan-Hong/HUANG Yi-Hua", "CHOONG Javen/LYNE Karen"),
    ("2025-05-17", "Nicolas BURGOS/Paulina VEGA", "Nandan NARESH/Sally MOYLAND"),
    ("2025-05-17", "RI Jong Sik/KIM Kum Yong", "Timothy CHOI/Lisa GEAR"),
    ("2025-05-18", "Alvaro ROBLES/Maria XIAO", "Benedikt DUDA/Yuan WAN"),
    ("2025-05-18", "Thitaphat PREECHAYAN/Kulapassr VIJITVIRIYAGUL", "Mohammed ABDULWAHHAB/Aia MOHAMED"),
    ("2025-05-18", "Jorge CAMPOS/Daniela FONSECA", "Marcos MADRID/Clio BARCENAS"),
    ("2025-05-17", "Lubomir PISTEJ/Tatiana KUKULKOVA", "Nicholas LUM/Ivy LIAO"),
    ("2025-05-17", "Guilherme TEODORO/Giulia TAKAHASHI", "Francisco SANCHI/Ana CODINA"),
    ("2025-05-18", "Daniel BERZOSA/Veronika MATIUNINA", "HAM Yu Song/PYON Song Gyong"),
    ("2025-05-17", "Milhane JELLOULI/Amina KESSACI", "Ahmed KORANI/Maryam ALI"),
    ("2025-05-17", "WONG Chun Ting/DOO Hoi Kem", "PANG Koen/SER Lin Qian"),
    ("2025-05-18", "LIM Jonghoon/SHIN Yubin", "CHAN Baldwin/ZHU Chengzhu"),
    ("2025-05-17", "Olajide OMOTAYO/Kabirat AYOOLA", "Mahmoud HELMY/Hend FATHY"),
    ("2025-05-17", "Samuel KULCZYCKI/Zuzanna WIELGOS", "Edward LY/Natalie CHAN"),
    ("2025-05-18", "Thibault PORET/Leana HOCHART", "Harmeet DESAI/Yashaswini GHORPADE"),
    ("2025-05-18", "Manush SHAH/Diya CHITALE", "Mehdi BOULOUSS/Malissa NASRI"),
    ("2025-05-18", "OH Junsung/KIM Nayeong", "Dean SHU/Jocelyn LAM"),
    ("2025-05-18", "LIN Yun-Ju/CHENG I-Ching", "Iskender KHARKI/Angelina ROMANOVSKAYA"),
    ("2025-05-18", "Kristian KARLSSON/Christina KALLBERG", "Anton LIMONOV/Solomiya BRATEYKO"),
    ("2025-05-17", "Sora MATSUSHIMA/Miwa HARIMOTO", "Matthew KUTI/Ajoke OJOMU"),
    ("2025-05-17", "Ivor BAN/Hana ARAPOVIC", "John OYEBODE/Gaia MONFARDINI"),
    ("2025-05-18", "Youssef ABDELAZIZ/Mariam ALHODABY", "Hwan BAE/Constantina PSIHOGIOS"),
    ("2025-05-17", "Niagol STOYANOV/Giorgia PICCOLIN", "Eduard IONESCU/Bernadette SZOCS"),
    ("2025-05-18", "Ovidiu IONESCU/Elizabeta SAMARA", "Rogelio CASTRO/Arantxa COSSIO"),
    ("2025-05-18", "Ibrahim GUNDUZ/Sibel ALTINKAYA", "Adrian PEREZ/Estela CRESPO"),
    ("2025-05-17", "Hugo CALDERANO/Bruna TAKAHASHI", "Fabio RAKOTOARIMANANA/Hanitra RAHARIMANANA"),
    ("2025-05-18", "WANG Chuqin/SUN Yingsha", "Jishan LIANG/Amy WANG"),
    # Round Of 32
    ("2025-05-19", "LIN Shidong/KUAI Man", "Simon GAUZY/Prithika PAVADE"),
    ("2025-05-19", "Robert GARDOS/Sofia POLCANOVA", "Mattias FALCK/Linda BERGSTROM"),
    ("2025-05-19", "Maharu YOSHIMURA/Satsuki ODO", "KUO Guan-Hong/HUANG Yi-Hua"),
    ("2025-05-19", "RI Jong Sik/KIM Kum Yong", "Nicolas BURGOS/Paulina VEGA"),
    ("2025-05-19", "Alvaro ROBLES/Maria XIAO", "Thitaphat PREECHAYAN/Kulapassr VIJITVIRIYAGUL"),
    ("2025-05-19", "Lubomir PISTEJ/Tatiana KUKULKOVA", "Jorge CAMPOS/Daniela FONSECA"),
    ("2025-05-19", "Guilherme TEODORO/Giulia TAKAHASHI", "Daniel BERZOSA/Veronika MATIUNINA"),
    ("2025-05-19", "WONG Chun Ting/DOO Hoi Kem", "Milhane JELLOULI/Amina KESSACI"),
    ("2025-05-19", "LIM Jonghoon/SHIN Yubin", "Olajide OMOTAYO/Kabirat AYOOLA"),
    ("2025-05-19", "Samuel KULCZYCKI/Zuzanna WIELGOS", "Thibault PORET/Leana HOCHART"),
    ("2025-05-19", "OH Junsung/KIM Nayeong", "Manush SHAH/Diya CHITALE"),
    ("2025-05-19", "LIN Yun-Ju/CHENG I-Ching", "Kristian KARLSSON/Christina KALLBERG"),
    ("2025-05-19", "Sora MATSUSHIMA/Miwa HARIMOTO", "Ivor BAN/Hana ARAPOVIC"),
    ("2025-05-19", "Youssef ABDELAZIZ/Mariam ALHODABY", "Niagol STOYANOV/Giorgia PICCOLIN"),
    ("2025-05-19", "Ovidiu IONESCU/Elizabeta SAMARA", "Ibrahim GUNDUZ/Sibel ALTINKAYA"),
    ("2025-05-19", "WANG Chuqin/SUN Yingsha", "Hugo CALDERANO/Bruna TAKAHASHI"),
    # Round Of 16
    ("2025-05-20", "LIN Shidong/KUAI Man", "Robert GARDOS/Sofia POLCANOVA"),
    ("2025-05-20", "Maharu YOSHIMURA/Satsuki ODO", "RI Jong Sik/KIM Kum Yong"),
    ("2025-05-20", "Alvaro ROBLES/Maria XIAO", "Lubomir PISTEJ/Tatiana KUKULKOVA"),
    ("2025-05-20", "WONG Chun Ting/DOO Hoi Kem", "Guilherme TEODORO/Giulia TAKAHASHI"),
    ("2025-05-20", "LIM Jonghoon/SHIN Yubin", "Samuel KULCZYCKI/Zuzanna WIELGOS"),
    ("2025-05-20", "LIN Yun-Ju/CHENG I-Ching", "OH Junsung/KIM Nayeong"),
    ("2025-05-20", "Sora MATSUSHIMA/Miwa HARIMOTO", "Youssef ABDELAZIZ/Mariam ALHODABY"),
    ("2025-05-20", "WANG Chuqin/SUN Yingsha", "Ovidiu IONESCU/Elizabeta SAMARA"),
    # QuarterFinal
    ("2025-05-21", "Maharu YOSHIMURA/Satsuki ODO", "LIN Shidong/KUAI Man"),
    ("2025-05-21", "WONG Chun Ting/DOO Hoi Kem", "Alvaro ROBLES/Maria XIAO"),
    ("2025-05-22", "LIM Jonghoon/SHIN Yubin", "LIN Yun-Ju/CHENG I-Ching"),
    ("2025-05-22", "WANG Chuqin/SUN Yingsha", "Sora MATSUSHIMA/Miwa HARIMOTO"),
    # SemiFinal
    ("2025-05-23", "Maharu YOSHIMURA/Satsuki ODO", "WONG Chun Ting/DOO Hoi Kem"),
    ("2025-05-23", "WANG Chuqin/SUN Yingsha", "LIM Jonghoon/SHIN Yubin"),
    # Final
    ("2025-05-24", "WANG Chuqin/SUN Yingsha", "Maharu YOSHIMURA/Satsuki ODO"),
]

CATS = {"MD": MD, "WD": WD, "XD": XD}

for cat, records in CATS.items():
    sub, fn = TARGET[cat]
    target = BASE / sub / fn
    data = json.loads(target.read_text(encoding="utf-8-sig"))
    def key(r):
        return (r.get("日期"), r.get("类型"), r.get("胜者"), r.get("负者"))
    seen = {key(r) for r in data}
    added = 0
    for date, w, l in records:
        rec = {"日期": date, "类型": "世乒赛", "胜者": clean(w), "负者": clean(l)}
        if key(rec) not in seen:
            data.append(rec)
            seen.add(key(rec))
            added += 1
    data.sort(key=lambda r: r.get("日期", ""))
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    st = [r for r in data if r.get("类型") == "世乒赛"]
    print(f"{cat}: +{added} (现世乒赛 {len(st)} 条, 总 {len(data)})")
    from collections import Counter
    c = Counter(r["日期"] for r in st)
    print("   按日期:", dict(sorted(c.items())))
