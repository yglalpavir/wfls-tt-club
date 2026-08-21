/* ========================================
   wtt_common.js - WTT 五项目通用数据加载模块
   支持: MS(男子单打) WS(女子单打) MD(男子双打) WD(女子双打) XD(混合双打)

   使用方法：
     1. 在 HTML 中通过 URL 参数 ?cat=ms 指定项目
     2. 或调用 setWttCategory('ms') 手动设置
     3. 然后使用 wttLoadAllData() 加载数据
   ======================================== */

// ============ 五项目定义 ============

const WTT_CATEGORIES = {
    ms: { id: 'ms', name: '男子单打', nameEn: "Men's Singles",    icon: '👤',   color: '#4da3ff', desc: 'Men\'s Singles ranking & stats' },
    ws: { id: 'ws', name: '女子单打', nameEn: "Women's Singles",  icon: '👩',   color: '#ff6b6b', desc: 'Women\'s Singles ranking & stats' },
    md: { id: 'md', name: '男子双打', nameEn: "Men's Doubles",    icon: '👥',   color: '#52c41a', desc: 'Men\'s Doubles ranking & stats' },
    wd: { id: 'wd', name: '女子双打', nameEn: "Women's Doubles",  icon: '👩‍👩', color: '#f5c542', desc: 'Women\'s Doubles ranking & stats' },
    xd: { id: 'xd', name: '混合双打', nameEn: 'Mixed Doubles',    icon: '💑',   color: '#a55eea', desc: 'Mixed Doubles ranking & stats' }
};

// ============ 当前项目状态 ============

let wttCurrentCategory = 'ms';  // 默认男子单打
let wttScoreLogData = [];
let wttInitialScoresData = null;
let wttSettings = null;  // 项目设置（scoreMode 等）
let wttEventCoefficients = null;
let wttSeasonsData = null;
let wttRankingTimeline = [];
let wttCurrentTimeIndex = 0;
let wttCurrentDisplayData = [];
let wttCurrentSortKey = '当前积分';
let wttCurrentSortDir = 'desc';
let wttCurrentScoreContext = { player: '', snapshotDate: '' };
let wttInitialized = false;
let wttNamesNormalized = false;   // 球员名归一化标记（数据重载时重置）
let wttMergedNames = null;        // 别名 -> 规范名 映射（运行时内存）
let wttPlayerAssocData = null;    // 协会籍数据：规范名 -> { assoc, country }（assoc.json 存在时加载）

// ============ 双打组合名称规范化 ============

/**
 * XD（混合双打）球员性别映射表
 * 根据 MS/WS/MD/WD 比赛数据自动生成
 * 用于 XD 双打组合中男前女后排序
 */
const WTT_KNOWN_GENDERS = {
    "Abdulbasit ABDULFATAI": "M",
    "Abdullah YIGENLER": "M",
    "Abhinandh PRADHIVADHI": "M",
    "Abir HAJ SALAH": "F",
    "Aboubaker BOURASS": "M",
    "Aditya SAREEN": "M",
    "Adriana DIAZ": "F",
    "Aia MOHAMED": "F",
    "Aishat RABIU": "F",
    "Akash PAL": "M",
    "Alexis LEBRUN": "M",
    "Alvaro ROBLES": "M",
    "Amelia NIKOLOV": "F",
    "Ana TOFANT": "F",
    "Anders LIND": "M",
    "Andrea PAVLOVIC": "F",
    "Andreea DRAGOMAN": "F",
    "Andrej STOJANOVSKI": "M",
    "Anirban GHOSH": "M",
    "Ankur BHATTACHARJEE": "M",
    "Anna HURSEY": "F",
    "Annett KAUFMANN": "F",
    "Anusha KUTUMBALE": "F",
    "Arantxa COSSIO": "F",
    "Ayhika MUKHERJEE": "F",
    "Balamurugan RAJASEKARAN": "M",
    "Barbora VARADY": "F",
    "Benedikt DUDA": "M",
    "Bernadette SZOCS": "F",
    "Borgar HAUG": "M",
    "Borna PETEK": "M",
    "Bosman BOTHA": "M",
    "Brianna BURGOS": "F",
    "Bruna TAKAHASHI": "F",
    "CHAN Baldwin": "M",
    "CHEN Junsong": "M",
    "CHEN Szu-Yu": "F",
    "CHEN Yi": "F",
    "CHEN Yuanyu": "M",
    "CHENG I-Ching": "F",
    "CHO Daeseong": "M",
    "CHOI Jiwook": "M",
    "CHOONG Javen": "M",
    "Camille LUTZ": "F",
    "Cedric MEISSNER": "M",
    "Charlotte LUTZ": "F",
    "Chinenye OKAFOR": "F",
    "Christina KALLBERG": "F",
    "Connor GREEN": "M",
    "Cynthia KWABI": "F",
    "DOO Hoi Kem": "F",
    "Dang QIU": "M",
    "Daniela FONSECA CARRAZANA": "F",
    "Daniela ORTEGA": "F",
    "Darius MOVILEANU": "M",
    "Debora VIVARELLI": "F",
    "Dina MESHREF": "F",
    "Diya CHITALE": "F",
    "Dora MADARASZ": "F",
    "Ece HARAC": "F",
    "Eduard IONESCU": "M",
    "Edward LY": "M",
    "Elizabet ABRAAMIAN": "F",
    "Esteban DORR": "M",
    "Eusebio VOS": "M",
    "Evgeny TIKHONOV": "M",
    "Fadwa GARCIA": "F",
    "Favour OJO": "F",
    "Felipe ARADO": "M",
    "Filippa BERGAND": "F",
    "Flavien COTON": "M",
    "Francis ANTWI": "M",
    "Giulia TAKAHASHI": "F",
    "Guilherme TEODORO": "M",
    "Gustavo GOMEZ": "M",
    "HAN Feier": "F",
    "HUANG Youzheng": "M",
    "Hana ARAPOVIC": "F",
    "Hana GODA": "F",
    "Harmeet DESAI": "M",
    "Hina HAYATA": "F",
    "Hiromu KOBAYASHI": "M",
    "Hitomi SATO": "F",
    "Hugo CALDERANO": "M",
    "Ibrahim GUNDUZ": "M",
    "Iskender KHARKI": "M",
    "Ivor BAN": "M",
    "JOO Cheonhui": "F",
    "James MARFO": "M",
    "Jennifer VARGHESE": "F",
    "Jessica REYES LAI": "F",
    "Jia Nan YUAN": "F",
    "Jishan LIANG": "M",
    "Joanita BORTEYE": "F",
    "Jorge CAMPOS": "M",
    "Jules ROLLAND": "M",
    "KIM Eunseo": "F",
    "KIM Kum Yong": "F",
    "KIM Nayeong": "F",
    "KIM Seongjin": "F",
    "KUAI Man": "F",
    "Kabirat AYOOLA": "F",
    "Katarina STRAZAR": "F",
    "Kaushani NATH": "F",
    "Kazuhiro YOSHIMURA": "M",
    "Kristian KARLSSON": "M",
    "Kristijan STANOJKOVSKI": "M",
    "LAM Yee Lok": "F",
    "LEE Hoi Man": "F",
    "LI Hechen": "M",
    "LIM Jonghoon": "M",
    "LIN Yun-Ju": "M",
    "LYNE Karen": "F",
    "Laura WATANABE": "F",
    "Leo DE NODREST": "M",
    "Leonardo IIZUKA": "M",
    "Lev KATSMAN": "M",
    "Lubomir PISTEJ": "M",
    "Luka MLADENOVIC": "M",
    "Maharu YOSHIMURA": "M",
    "Manav THAKKAR": "M",
    "Manika BATRA": "F",
    "Manush SHAH": "M",
    "Mao TAKAMORI": "F",
    "Maria PANFILOVA": "F",
    "Maria XIAO": "F",
    "Mariam ALHODABY": "F",
    "Mariia TAILAKOVA": "F",
    "Martin FRIIS": "M",
    "Matthew KUTI": "M",
    "Miha PODOBNIK": "M",
    "Minhyung JEE": "F",
    "Miwa HARIMOTO": "F",
    "Miyu NAGASAKI": "F",
    "Miyuu KIHARA": "F",
    "Mo ZHANG": "F",
    "Mohammed ABDULWAHHAB": "M",
    "Mudit DANI": "M",
    "Muizz ADEGOKE": "M",
    "NG Wing Lam": "F",
    "Nandan NARESH": "M",
    "Nandor ECSEKI": "M",
    "Nicholas LUM": "M",
    "Nicolas BURGOS": "M",
    "Nikita ARTEMENKO": "M",
    "Nina MITTELHAM": "F",
    "Nithya MANI": "F",
    "OH Junsung": "M",
    "OH Seunghwan": "M",
    "Olajide OMOTAYO": "M",
    "Omar ASSAR": "M",
    "Ovidiu IONESCU": "M",
    "PANG Koen": "M",
    "PARK Ganghyeon": "M",
    "PARK Gyuhyeon": "M",
    "Patrick FRANZISKA": "M",
    "Paulina VEGA": "F",
    "Payas JAIN": "M",
    "Peter HRIBAR": "M",
    "Prithika PAVADE": "F",
    "QIN Yuxuan": "F",
    "QUEK Izaac": "M",
    "RI Jong Sik": "M",
    "Reina ASO": "F",
    "Remi CHAMBET-WEIL": "M",
    "Robert GARDOS": "M",
    "Rogelio CASTRO": "M",
    "Rokaia ELBAZ": "F",
    "SER Lin Qian": "F",
    "SHI Xunyao": "F",
    "SHIN Yubin": "F",
    "SUN Yingsha": "F",
    "Sabine WINTER": "F",
    "Sally MOYLAND": "F",
    "Sara STOJANOVSKA": "F",
    "Sarah DE NUTTE": "F",
    "Sarvinoz MIRKADIROVA": "F",
    "Sathiyan GNANASEKARAN": "M",
    "Satoshi AIDA": "M",
    "Satsuki ODO": "F",
    "Sayali WANI": "F",
    "Shunsuke TOGAMI": "M",
    "Sibel ALTINKAYA": "F",
    "Sodiq ADESANYA": "M",
    "Sofia POLCANOVA": "F",
    "Sophia KLEE": "F",
    "Sora MATSUSHIMA": "M",
    "Stepan BRHEL": "M",
    "Steven MORENO": "M",
    "Sukurat AIYELABEGAN": "F",
    "Sultan AL-KUWARI": "M",
    "Swastika GHOSH": "F",
    "Syndrela DAS": "F",
    "TEE Ai Xin": "F",
    "Taiwo MATI": "M",
    "Tatiana KUKULKOVA": "F",
    "Thibault PORET": "M",
    "Tin-Tin HO": "F",
    "Tomokazu HARIMOTO": "M",
    "Valentina RIOS": "F",
    "Valeriia SHCHERBATYKH": "F",
    "Veronika POLAKOVA": "F",
    "Victoria STRASSBURGER": "F",
    "Vincent PICARD": "M",
    "Vitor ISHIY": "M",
    "Vladimir SIDORENKO": "M",
    "WANG Chuqin": "M",
    "WANG Xiaotong": "F",
    "WEN Ruibo": "M",
    "WONG Chun Ting": "M",
    "WONG Qi Shen": "M",
    "Wassim ESSID": "M",
    "Wim VERDONSCHOT": "M",
    "XUE Fei": "M",
    "Xia Lian NI": "F",
    "YAO Ruixuan": "F",
    "YIU Kwan To": "M",
    "YOO Siwoo": "F",
    "YOO Yerin": "F",
    "YUAN Licen": "M",
    "Yangzi LIU": "F",
    "Yashaswini GHORPADE": "F",
    "Youssef ABDELAZIZ": "M",
    "Yuhi SAKAI": "M",
    "ZENG Jian": "F",
    "ZONG Geman": "F"
};

/**
 * 双打类别集合
 */
const WTT_DOUBLES_CATEGORIES = new Set(['md', 'wd', 'xd']);

/**
 * 双打项目协会籍来源（从单打 assoc.json 推导）
 * md→ms，wd→ws，xd→ms+ws
 */
const WTT_ASSOC_SINGLES_SOURCE = { md: ['ms'], wd: ['ws'], xd: ['ms', 'ws'] };

/**
 * 规范化双打组合名称：确保 A/B 和 B/A 被视为同一组
 * - MD/WD：按字母顺序排序两位球员名
 * - XD：男选手在前，女选手在后（使用 WTT_KNOWN_GENDERS 映射表）
 * - 非双打类别：返回原值
 * @param {string} name - 原始组合名（如 "JANG Woojin/CHO Daeseong"）
 * @returns {string} 规范化后的组合名
 */
function wttNormalizeDoublesName(name) {
    // 非双打（无 / 分隔符）或非双打类别，直接返回
    if (!name || !name.includes('/') || !WTT_DOUBLES_CATEGORIES.has(wttCurrentCategory)) {
        return name;
    }

    // 分割两位球员
    var parts = name.split('/');
    if (parts.length !== 2) return name;
    var p1 = parts[0].trim();
    var p2 = parts[1].trim();
    if (!p1 || !p2) return name;

    if (wttCurrentCategory === 'xd') {
        // XD：男前女后
        var g1 = wttGender(p1);
        var g2 = wttGender(p2);
        if (g1 === 'M' && g2 === 'F') {
            return p1 + '/' + p2;
        } else if (g1 === 'F' && g2 === 'M') {
            return p2 + '/' + p1;
        }
        // 无法判断性别时，按字母顺序排序
        return (p1 <= p2 ? p1 : p2) + '/' + (p1 <= p2 ? p2 : p1);
    }

    // MD/WD：按字母顺序排序（所有球员同性别）
    return (p1 <= p2 ? p1 : p2) + '/' + (p1 <= p2 ? p2 : p1);
}

/**
 * 对 score-log 数据数组应用双打组合名规范化
 * @param {Array} records - 比赛记录数组
 * @returns {Array} 规范化后的数组（原地修改）
 */
function wttNormalizeDoublesScoreLog(records) {
    if (!records || !records.length) return records;
    if (!WTT_DOUBLES_CATEGORIES.has(wttCurrentCategory)) return records;
    for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r['胜者']) r['胜者'] = wttNormalizeDoublesName(r['胜者']);
        if (r['负者']) r['负者'] = wttNormalizeDoublesName(r['负者']);
    }
    return records;
}

// ============ 球员名字自动识别与合并 ============

/**
 * 计算一名球员名字的身份标识（identity key）。
 * 大小写无关、词序无关、标点无关：
 *   "HARIMOTO Tomokazu" 与 "Tomokazu HARIMOTO" 得到相同 key，
 *   因此同一球员的不同拼写会被识别为同一人（参考 player-name-format.md）。
 * @param {string} name - 单个球员名（不含双打 / 分隔）
 * @returns {string} 身份 key
 */
function wttNameIdentity(name) {
    if (!name || typeof name !== 'string') return '';
    // 转大写 -> 按空白切词 -> 每词去标点(保留字母数字) -> 排序 -> 以空格连接
    var tokens = name.toUpperCase().split(/\s+/).map(function (t) {
        return t.replace(/[^A-Z0-9]/g, '');
    }).filter(function (t) { return t.length > 0; });
    tokens.sort();
    return tokens.join(' ');
}

/**
 * 尝试把球员名按身份 key 拆分，用于统计与规范名选择：
 * 单打返回 [name]，双打按 / 拆分。
 */
function wttSplitPlayerNames(name) {
    if (!name) return [];
    if (name.indexOf('/') === -1) return [name];
    return name.split('/').map(function (p) { return p.trim(); }).filter(function (p) { return p.length > 0; });
}

/**
 * 根据 wttScoreLogData + wttInitialScoresData 构建「同身份」分组，
 * 并为每组挑选一个规范名，生成 别名->规范名 映射。
 * 规范名规则（优先级从高到低）：
 *  1. 存在于 initial-scores.json 的写法
 *  2. 出现频次最高的写法
 *  3. 字典序最小
 * @returns {{ map: Object, mergedGroups: number, mergedAliases: number, samples: string[] }}
 */
function wttBuildNormalizedNameMap() {
    var counts = {};   // name -> 出现次数（initial-scores 键给极大权重）

    var initKeys = {};
    if (wttInitialScoresData && wttInitialScoresData.initialScores) {
        Object.keys(wttInitialScoresData.initialScores).forEach(function (k) { initKeys[k] = true; });
    }

    function addName(raw) {
        if (!raw) return;
        wttSplitPlayerNames(raw).forEach(function (n) {
            if (!n) return;
            counts[n] = (counts[n] || 0) + 1;
        });
    }

    // 遍历比赛记录（胜者/负者/对象）
    (wttScoreLogData || []).forEach(function (r) {
        addName(r['胜者']);
        addName(r['负者']);
        addName(r['对象']);
    });

    // 构建「交过手」集合：同一场比赛中站在对立两侧的名字，必为不同球员。
    // 用于防止把两个真实存在的不同球员（如 "Ali MOHAMMED" 与 "Mohammed ALI"）误判为同一人。
    var opposed = {};
    function opposedKey(a, b) { return a < b ? a + '\u0000' + b : b + '\u0000' + a; }
    (wttScoreLogData || []).forEach(function (r) {
        var winners = wttSplitPlayerNames(r && r['胜者']);
        var losers = wttSplitPlayerNames(r && r['负者']);
        if (!winners.length || !losers.length) return;
        winners.forEach(function (w) {
            if (!w) return;
            losers.forEach(function (l) {
                if (!l || w === l) return;
                opposed[opposedKey(w, l)] = true;
            });
        });
    });

    // 遍历初始积分键（作为规范名候选，极大权重保证优先）
    Object.keys(initKeys).forEach(function (n) {
        counts[n] = (counts[n] || 0) + 1000000;
    });

    // 分组建表：identity -> [名字...]
    var groups = {};
    Object.keys(counts).forEach(function (n) {
        var id = wttNameIdentity(n);
        if (!id) return;
        if (!groups[id]) groups[id] = [];
        groups[id].push(n);
    });

    var aliasMap = {};
    var mergedGroups = 0;
    var mergedAliases = 0;
    var samples = [];

    Object.keys(groups).forEach(function (id) {
        var names = groups[id];
        if (names.length < 2) return;
        mergedGroups++;
        // 选出规范名
        var best = names[0];
        var bestScore = -Infinity;
        names.forEach(function (n) {
            var score = counts[n] || 0;
            if (initKeys[n]) score += 1000000;
            if (score > bestScore) { bestScore = score; best = n; }
            else if (score === bestScore && n < best) { best = n; }
        });
        names.forEach(function (n) {
            if (n === best) return;
            // 若这两个写法在比赛中交过手，则它们属于两个真实的不同球员，禁止合并。
            if (opposed[opposedKey(n, best)]) {
                if (samples.length < 10) samples.push("'" + n + "' 与 '" + best + "' 交过手，保留为不同球员");
                return;
            }
            aliasMap[n] = best;
            mergedAliases++;
            if (samples.length < 10) samples.push("'" + n + "' -> '" + best + "'");
        });
    });

    return { map: aliasMap, mergedGroups: mergedGroups, mergedAliases: mergedAliases, samples: samples };
}

/**
 * 归一化单个球员名（可能是双打组合）。
 * @param {string} name
 * @returns {string}
 */
function wttNormalizeMergedName(name) {
    if (!name || !wttMergedNames) return name;
    if (name.indexOf('/') === -1) {
        return wttMergedNames[name] || name;
    }
    // 双打：逐半归一化后拼回
    return name.split('/').map(function (p) {
        var t = p.trim();
        return wttMergedNames[t] || t;
    }).join('/');
}

/**
 * 应用球员名合并（幂等）。
 * 就地改写 wttScoreLogData / wttInitialScoresData，并重建双打排序。
 */
function wttApplyNameNormalization() {
    if (wttNamesNormalized) return;
    var res = wttBuildNormalizedNameMap();
    wttMergedNames = res.map;

    if (wttScoreLogData) {
        wttScoreLogData.forEach(function (r) {
            if (r['胜者']) r['胜者'] = wttNormalizeMergedName(r['胜者']);
            if (r['负者']) r['负者'] = wttNormalizeMergedName(r['负者']);
            if (r['对象']) r['对象'] = wttNormalizeMergedName(r['对象']);
        });
    }
    if (wttInitialScoresData && wttInitialScoresData.initialScores) {
        var ns = {};
        Object.keys(wttInitialScoresData.initialScores).forEach(function (k) {
            var nk = wttNormalizeMergedName(k);
            ns[nk] = wttInitialScoresData.initialScores[k];
        });
        wttInitialScoresData.initialScores = ns;
    }
    clearFirstAppearanceCache();
    wttNormalizeDoublesScoreLog(wttScoreLogData);
    wttNamesNormalized = true;

    if (res.mergedAliases > 0) {
        console.warn('[WTT] 识别并合并 ' + res.mergedGroups + ' 个球员名分组，共 ' + res.mergedAliases + ' 个别名');
        res.samples.forEach(function (s) { console.warn('[WTT]   ' + s); });
    }
}

/**
 * 查询球员性别：先查已知表，再回退合并后的规范名。
 * @param {string} name
 * @returns {string|undefined} 'M' / 'F'
 */
function wttGender(name) {
    if (!name) return undefined;
    var g = WTT_KNOWN_GENDERS[name];
    if (g) return g;
    var merged = wttMergedNames ? (wttMergedNames[name] || name) : name;
    return WTT_KNOWN_GENDERS[merged];
}

// ============ 项目切换 ============

/**
 * 从 URL 参数或默认值设置当前项目
 */
function wttDetectCategory() {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get('cat');
    if (cat && WTT_CATEGORIES[cat]) {
        wttCurrentCategory = cat;
    }
    return wttCurrentCategory;
}

/**
 * 手动切换项目
 */
function setWttCategory(cat) {
    if (WTT_CATEGORIES[cat]) {
        wttCurrentCategory = cat;
        // 更新 URL 参数（不刷新页面）
        const url = new URL(window.location);
        url.searchParams.set('cat', cat);
        window.history.replaceState({}, '', url);
    }
}

/**
 * 获取当前项目的数据目录路径
 */
function wttGetDataPath(filename) {
    return `wtt_data/${wttCurrentCategory}/${filename}`;
}

// ============ 数据加载 ============

/**
 * 严格校验一条记录是否为有效的比赛/加分记录
 * 排除：无日期、日期以_开头、包含 _placeholder 占位符的记录
 */
function wttIsValidRecord(r) {
    // 必须有日期且为有效字符串，不能以 _ 开头（模板注释标记）
    if (!r['日期'] || typeof r['日期'] !== 'string' || r['日期'].startsWith('_')) return false;

    // 辅助：检查选手名是否为占位符
    function isPlaceholder(name) {
        if (!name || typeof name !== 'string') return true;  // 无名 = 无效
        if (name.startsWith('_placeholder') || name.startsWith('_template')) return true;
        return false;
    }

    // 比赛记录：必须有 胜者+负者，且都不是占位符
    if (r['胜者'] && r['负者']) {
        if (isPlaceholder(r['胜者']) || isPlaceholder(r['负者'])) return false;
        return true;
    }

    // 加分记录：类型必须是"比赛结果加分"且有对象，且对象不是占位符
    if (r['类型'] === '比赛结果加分' && r['对象']) {
        if (isPlaceholder(r['对象'])) return false;
        return true;
    }

    return false;
}

function wttLoadScoreLog() {
    // 🔥 优先尝试按赛季拆分的文件（每个赛季的 score-log 小很多，加载更快）
    return wttLoadScoreLogFromSeasonFiles().catch(() => {
        // 回退到原始的单文件
        return fetch(wttGetDataPath('score-log.json'))
            .then(r => r.json())
            .then(d => {
                wttApplyLoadedLog(d);
            });
    }).catch(e => {
        console.error(`WTT[${wttCurrentCategory}] score-log 加载失败`, e);
        wttScoreLogData = [];
    });
}

/**
 * 对合并后的记录做统一后处理（过滤 + 归一化 + 清缓存）
 */
function wttApplyLoadedLog(records) {
    wttScoreLogData = records.filter(wttIsValidRecord);
    wttNamesNormalized = false;
    wttNormalizeDoublesScoreLog(wttScoreLogData);
    clearFirstAppearanceCache();
}

/**
 * 根据当前 category 构建可能的赛季 ID 列表（无 manifest 时的回退用）
 * MS/WS 各自使用 "wtt"/"ws" 后缀，MD/WD/XD 统一使用 "wtt" 后缀
 */
function wttBuildSeasonIds() {
    const wttYears = ['2021', '2022', '2023', '2024', '2025', '2026'];
    const ittfYears = ['2008', '2009', '2011', '2013', '2015', '2017', '2019'];
    let seasonIds;
    if (wttCurrentCategory === 'ms') {
        seasonIds = [...ittfYears.map(y => `${y}-ittf`), ...wttYears.map(y => `${y}-wtt`)];
    } else if (wttCurrentCategory === 'ws') {
        seasonIds = [...ittfYears.map(y => `${y}-ittf`), ...wttYears.map(y => `${y}-ws`)];
    } else {
        seasonIds = [...ittfYears.map(y => `${y}-ittf`), ...wttYears.map(y => `${y}-wtt`), ...wttYears.map(y => `${y}-${wttCurrentCategory}`)];
    }
    // 额外尝试无年份前缀的特殊文件（tts, unmatched 等）
    seasonIds.push('tts', 'unmatched');
    return seasonIds;
}

/**
 * 尝试从 manifest.json 读取该分项真实存在的赛季文件名，并行加载。
 * manifest.json 格式: { "scoreLogs": ["score-log-2024-wtt.json", ...] }
 * 成功并加载到数据时返回 true。
 */
async function wttTryLoadFromManifest() {
    try {
        const resp = await fetch(wttGetDataPath('manifest.json'));
        if (!resp.ok) return false;
        const manifest = await resp.json();
        const names = Array.isArray(manifest) ? manifest
                     : (manifest && Array.isArray(manifest.scoreFiles) ? manifest.scoreFiles : []);
        const files = names.filter(n => typeof n === 'string' && n.startsWith('score-log-') && n.endsWith('.json'));
        if (!files.length) return false;

        // 并行加载所有真实存在的赛季文件
        const grouped = await Promise.all(files.map(async name => {
            try {
                const r = await fetch(wttGetDataPath(name));
                if (!r.ok) return [];
                const data = await r.json();
                return Array.isArray(data) ? data : [];
            } catch (e) {
                return [];
            }
        }));
        const allRecords = grouped.flat();
        if (!allRecords.length) return false;

        console.log(`WTT[${wttCurrentCategory}] 从 manifest 并行加载了 ${allRecords.length} 条记录（${files.length} 个文件）`);
        wttApplyLoadedLog(allRecords);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * 尝试从按赛季拆分的文件中加载 score log
 * 文件名格式: score-log-{seasonId}.json（如 score-log-2021-wtt.json）
 *
 * 优先读取 manifest.json（并行加载真实存在的文件、避免 404 探测）；
 * 若无 manifest 则逐个探测（兼容旧部署）。
 */
async function wttLoadScoreLogFromSeasonFiles() {
    if (await wttTryLoadFromManifest()) return;

    const seasonIds = wttBuildSeasonIds();
    const allRecords = [];
    let foundAny = false;

    for (const seasonId of seasonIds) {
        try {
            const resp = await fetch(wttGetDataPath(`score-log-${seasonId}.json`));
            if (resp.ok) {
                const data = await resp.json();
                if (Array.isArray(data) && data.length > 0) {
                    allRecords.push(...data);
                    foundAny = true;
                }
            }
        } catch (e) {
            // 该赛季文件不存在，跳过
        }
    }

    if (!foundAny) {
        throw new Error('No season files found, fall back to single file');
    }

    console.log(`WTT[${wttCurrentCategory}] 从多个赛季文件中加载了 ${allRecords.length} 条记录`);
    wttApplyLoadedLog(allRecords);
}

function wttLoadInitialScores() {
    return fetch(wttGetDataPath('initial-scores.json'))
        .then(r => r.json())
        .then(d => {
            wttInitialScoresData = d;
            wttNamesNormalized = false;
            return true;
        })
        .catch(e => { console.error(`WTT[${wttCurrentCategory}] initial-scores 加载失败`, e); return false; });
}

function wttLoadSettings() {
    return fetch(wttGetDataPath('settings.json'))
        .then(r => r.json())
        .then(d => {
            wttSettings = d;
            // 应用自定义 baseScore（如未配置则保持默认 1300）
            if (d.baseScore && typeof d.baseScore === 'number') {
                DEFAULT_INITIAL_SCORE = d.baseScore;
            }
            // WTT 积分规则：取消赛季内衰减，负者扣分 = 胜者得分
            SCORE_TIME_DECAY_ENABLED = false;
            LOSER_POINT_MULTIPLIER = 1.0;
            console.log(`WTT[${wttCurrentCategory}] 设置加载成功, scoreMode: ${d.scoreMode || 'initial'}, baseScore: ${DEFAULT_INITIAL_SCORE}`);
            return true;
        })
        .catch(e => {
            // settings.json 不存在时使用默认值
            wttSettings = { scoreMode: 'initial', baseScore: 1300 };
            DEFAULT_INITIAL_SCORE = 1300;
            // WTT 积分规则：取消赛季内衰减，负者扣分 = 胜者得分
            SCORE_TIME_DECAY_ENABLED = false;
            LOSER_POINT_MULTIPLIER = 1.0;
            console.warn(`WTT[${wttCurrentCategory}] settings.json 未找到，使用默认设置 (scoreMode: initial, baseScore: 1300)`);
            return true;
        });
}

/**
 * 获取当前模式下的有效初始分数
 * 'initial' 模式：使用 initial-scores.json 的数据
 * 'flat1300' 模式：返回空对象，score-engine 会自动给每位球员使用 DEFAULT_INITIAL_SCORE（可在 settings.json 中配置 baseScore）
 */
function wttGetEffectiveInitialScores() {
    if (wttSettings && wttSettings.scoreMode === 'flat1300') {
        console.log(`[WTT ${wttCurrentCategory}] 🔄 使用 flat1300 模式：所有球员初始分 = ${DEFAULT_INITIAL_SCORE}`);
        return {};
    }
    const count = wttInitialScoresData && wttInitialScoresData.initialScores ? Object.keys(wttInitialScoresData.initialScores).length : 0;
    console.log(`[WTT ${wttCurrentCategory}] 📋 使用 initial-scores.json 模式：${count} 名球员有预设初始分`);
    return wttInitialScoresData ? wttInitialScoresData.initialScores : {};
}

/**
 * 获取适配 score-engine 全局变量格式的 initialScoresData 对象
 * 供需要手动切换全局变量的模块使用
 */
function wttGetInitialScoresDataForEngine() {
    const effScores = wttGetEffectiveInitialScores();
    return { initialScores: effScores, baseDate: wttInitialScoresData?.baseDate || '2020-12-31' };
}

function wttLoadEventCoefficients() {
    return fetch(wttGetDataPath('event-coefficient.json'))
        .then(r => r.json())
        .then(d => {
            wttEventCoefficients = d;
            return true;
        })
        .catch(e => { console.error(`WTT[${wttCurrentCategory}] event-coefficient 加载失败`, e); return false; });
}

function wttLoadSeasons() {
    return fetch(wttGetDataPath('seasons.json'))
        .then(r => r.json())
        .then(d => {
            wttSeasonsData = d.filter(s => s.visible !== false);
            return true;
        })
        .catch(e => { wttSeasonsData = []; return false; });
}

/**
 * 加载协会籍数据（assoc.json），按项目目录存放：wtt_data/{cat}/assoc.json
 * 文件不存在或解析失败时不报错、不展示（静默返回 false）。
 * 兼容两种格式：
 *   1) 数组/rows 形式: [{ "name": "WANG Chuqin", "assoc": "CHN", "country": "China" }, ...]
 *   2) 映射形式: { "WANG Chuqin": "CHN" } 或 { "WANG Chuqin": { "assoc": "CHN", "country": "China" } }
 * 查询时按 wttNameIdentity 归一化匹配，与球员名合并规则一致。
 * 双打项目（md/wd/xd）无独立 assoc.json，改为从单打 assoc.json 推导：
 *   两名球员都有协会记录且协会相同 → 该组合归该协会；否则该组合无协会数据。
 */
async function wttLoadPlayerAssoc() {
    wttPlayerAssocData = null;
    try {
        const map = {};
        const sources = WTT_DOUBLES_CATEGORIES.has(wttCurrentCategory)
            ? (WTT_ASSOC_SINGLES_SOURCE[wttCurrentCategory] || [])
            : [wttCurrentCategory];

        for (const src of sources) {
            const resp = await fetch(`wtt_data/${src}/assoc.json`);
            if (!resp.ok) continue;
            const d = await resp.json();
            if (!d) continue;

            const rows = Array.isArray(d) ? d : (d.rows && Array.isArray(d.rows) ? d.rows : null);
            if (rows) {
                for (const r of rows) {
                    if (!r || !r.name || !r.assoc) continue;
                    const key = wttNameIdentity(r.name);
                    if (!key) continue;
                    map[key] = { assoc: String(r.assoc), country: r.country ? String(r.country) : '' };
                }
            } else if (typeof d === 'object') {
                for (const name of Object.keys(d)) {
                    const v = d[name];
                    if (!name || !v) continue;
                    const key = wttNameIdentity(name);
                    if (!key) continue;
                    if (typeof v === 'string') map[key] = { assoc: v, country: '' };
                    else if (v && v.assoc) map[key] = { assoc: String(v.assoc), country: v.country ? String(v.country) : '' };
                }
            }
        }
        wttPlayerAssocData = Object.keys(map).length ? map : null;
        console.log(`WTT[${wttCurrentCategory}] 协会籍数据加载成功: ${wttPlayerAssocData ? Object.keys(wttPlayerAssocData).length : 0} 人${WTT_DOUBLES_CATEGORIES.has(wttCurrentCategory) ? '（由单打 assoc.json 推导）' : ''}`);
        return !!wttPlayerAssocData;
    } catch (e) {
        console.warn(`WTT[${wttCurrentCategory}] assoc.json 未找到，跳过协会籍显示`);
        wttPlayerAssocData = null;
        return false;
    }
}

/**
 * 查询球员协会籍信息
 * 单打：按身份归一化匹配 assoc.json 记录。
 * 双打（组合名含 /）：拆分两名球员分别查单打表，
 *   两人均有记录且协会相同 → 返回该协会；任一缺失或协会不同 → 返回 null（无协会数据）。
 * @param {string} name - 球员/组合名（自动按身份归一化匹配）
 * @returns {{ assoc: string, country: string }|null} 未加载/未匹配时返回 null
 */
function wttGetPlayerAssoc(name) {
    if (!wttPlayerAssocData || !name) return null;
    const single = wttPlayerAssocData[wttNameIdentity(name)];
    if (single) return single;
    if (String(name).indexOf('/') === -1) return null;
    const parts = wttSplitPlayerNames(name);
    if (parts.length < 2) return null;
    const a1 = wttPlayerAssocData[wttNameIdentity(parts[0])];
    const a2 = wttPlayerAssocData[wttNameIdentity(parts[1])];
    if (!a1 || !a2 || !a1.assoc || !a2.assoc) return null;
    if (String(a1.assoc).toUpperCase() !== String(a2.assoc).toUpperCase()) return null;
    return { assoc: a1.assoc, country: a1.country || a2.country || '' };
}

/**
 * 协会代码 -> flag-icons 旗帜类名（SVG 旗帜，跨平台渲染，含 Windows）
 * 非 ISO 3166-1 代码手工映射；其余三位 ITTF 代码经 WTT_ASSOC_ISO2 转两位 ISO 代码。
 * 用于积分数据表姓名左侧展示。
 */
const WTT_ASSOC_FLAG_CLASSES = {
    'ENG': 'gb-eng', 'SCO': 'gb-sct', 'WAL': 'gb-wls', 'NIR': 'gb-nir',
    'TPE': 'ctoc', 'HKG': 'hk', 'MAC': 'mo', 'UNK': '', 'OTH': ''
};
// 三位 ITTF/奥运协会代码 -> ISO 3166-1 alpha-2（flag-icons 使用两位 ISO 代码）
const WTT_ASSOC_ISO2 = {
    ALG: 'DZ', ARG: 'AR', AUS: 'AU', AUT: 'AT', BEL: 'BE', BEN: 'BJ', BRA: 'BR', BRN: 'BH',
    CAN: 'CA', CHI: 'CL', CHN: 'CN', CMR: 'CM', COL: 'CO', CRO: 'HR', CZE: 'CZ', DEN: 'DK',
    EGY: 'EG', ESP: 'ES', FRA: 'FR', GER: 'DE', GHA: 'GH', GRE: 'GR', HUN: 'HU', IND: 'IN',
    IRI: 'IR', ITA: 'IT', JPN: 'JP', KAZ: 'KZ', KOR: 'KR', KSA: 'SA', LBN: 'LB', LUX: 'LU',
    MAD: 'MG', MAS: 'MY', MDA: 'MD', MEX: 'MX', MGL: 'MN', MKD: 'MK', MLT: 'MT', NED: 'NL',
    NEP: 'NP', NGR: 'NG', NOR: 'NO', NZL: 'NZ', OMA: 'OM', PHI: 'PH', POL: 'PL', POR: 'PT',
    PUR: 'PR', QAT: 'QA', ROU: 'RO', RUS: 'RU', SGP: 'SG', SLO: 'SI', SRB: 'RS', SUI: 'CH',
    SVK: 'SK', SWE: 'SE', THA: 'TH', TOG: 'TG', TUN: 'TN', TUR: 'TR', USA: 'US'
};
/**
 * 协会代码 -> flag-icons 类名（如 "fi fi-cn"）；无法识别时返回 ''。
 */
function wttAssocFlagClass(assoc) {
    if (!assoc) return '';
    const code = String(assoc).toUpperCase().trim();
    if (WTT_ASSOC_FLAG_CLASSES[code] !== undefined) {
        const c = WTT_ASSOC_FLAG_CLASSES[code];
        return c ? `fi fi-${c}` : '';
    }
    const iso2 = code.length === 3 ? (WTT_ASSOC_ISO2[code] || '') : (code.length === 2 ? code : '');
    return /^[A-Z]{2}$/.test(iso2) ? `fi fi-${iso2.toLowerCase()}` : '';
}

/**
 * 加载当前项目的全部数据
 * 返回 true/false 表示是否加载成功
 */
async function wttLoadAllData() {
    try {
        await Promise.all([
            wttLoadInitialScores(),
            wttLoadSettings(),
            wttLoadEventCoefficients(),
            wttLoadSeasons(),
            wttLoadScoreLog()
        ]);
        // flat1300 模式不需要 initialScoresData
        const isFlat = wttSettings && wttSettings.scoreMode === 'flat1300';
        if (!isFlat && !wttInitialScoresData) {
            throw new Error('initial-scores.json 加载失败');
        }
        if (!wttEventCoefficients || !wttSeasonsData) {
            throw new Error('核心数据加载失败');
        }
        return true;
    } catch (e) {
        console.error(`WTT[${wttCurrentCategory}] 数据加载失败`, e);
        return false;
    }
}

// ============ 排名计算（封装全局变量切换） ============

/**
 * 在 WTT 数据上下文中执行计算
 * 临时切换到 WTT 全局变量，执行 fn()，然后恢复
 * 支持同步和异步回调
 */
function wttWithDataContext(fn) {
    const origScoreLog = (typeof scoreLogData !== 'undefined') ? scoreLogData : undefined;
    const origInitial = (typeof initialScoresData !== 'undefined') ? initialScoresData : undefined;
    const origEvent = (typeof eventCoefficients !== 'undefined') ? eventCoefficients : undefined;
    const origSeasons = (typeof seasonsData !== 'undefined') ? seasonsData : undefined;
    const origDefaultScore = DEFAULT_INITIAL_SCORE;

    // 切换到 WTT 数据
    if (typeof scoreLogData !== 'undefined') scoreLogData = wttScoreLogData;
    // flat1300 模式：使用空的 initialScores，DEFAULT_INITIAL_SCORE 已在 wttLoadSettings 中设置
    if (typeof initialScoresData !== 'undefined') initialScoresData = wttGetInitialScoresDataForEngine();
    if (typeof eventCoefficients !== 'undefined') eventCoefficients = wttEventCoefficients;
    if (typeof seasonsData !== 'undefined') seasonsData = wttSeasonsData;

    let result;
    try {
        result = fn();
    } finally {
        // 恢复原数据（如果 fn 返回 Promise，这里恢复可能过早；异步版本见下方）
        if (!(result && typeof result.then === 'function')) {
            if (origScoreLog !== undefined) scoreLogData = origScoreLog;
            if (origInitial !== undefined) initialScoresData = origInitial;
            if (origEvent !== undefined) eventCoefficients = origEvent;
            if (origSeasons !== undefined) seasonsData = origSeasons;
            DEFAULT_INITIAL_SCORE = origDefaultScore;
        }
    }
    return result;
}

/**
 * 异步版本：在 WTT 数据上下文中执行异步计算
 */
async function wttWithDataContextAsync(fn) {
    const origScoreLog = (typeof scoreLogData !== 'undefined') ? scoreLogData : undefined;
    const origInitial = (typeof initialScoresData !== 'undefined') ? initialScoresData : undefined;
    const origEvent = (typeof eventCoefficients !== 'undefined') ? eventCoefficients : undefined;
    const origSeasons = (typeof seasonsData !== 'undefined') ? seasonsData : undefined;
    const origDefaultScore = DEFAULT_INITIAL_SCORE;

    if (typeof scoreLogData !== 'undefined') scoreLogData = wttScoreLogData;
    // flat1300 模式：使用空的 initialScores，DEFAULT_INITIAL_SCORE 已在 wttLoadSettings 中设置
    if (typeof initialScoresData !== 'undefined') initialScoresData = wttGetInitialScoresDataForEngine();
    if (typeof eventCoefficients !== 'undefined') eventCoefficients = wttEventCoefficients;
    if (typeof seasonsData !== 'undefined') seasonsData = wttSeasonsData;

    try {
        return await fn();
    } finally {
        if (origScoreLog !== undefined) scoreLogData = origScoreLog;
        if (origInitial !== undefined) initialScoresData = origInitial;
        if (origEvent !== undefined) eventCoefficients = origEvent;
        if (origSeasons !== undefined) seasonsData = origSeasons;
        DEFAULT_INITIAL_SCORE = origDefaultScore;
    }
}

/**
 * 异步分块计算 WTT 排名时间线（🔥 性能优化版）
 * 使用 score-engine.js 的 calculateAllRankingsWithSeasonsAsync
 * 每个快照 yield 到浏览器，保持 UI 流畅响应
 * @param {function} onProgress - 进度回调 (current, total, message)
 */
async function wttCalculateAllRankingsAsync(onProgress) {
    wttApplyNameNormalization();
    return wttWithDataContextAsync(async () => {
        const effScores = wttGetEffectiveInitialScores();
        const timeline = await calculateAllRankingsWithSeasonsAsync(
            wttScoreLogData,
            effScores,
            wttSeasonsData,
            onProgress,
            1  // 🔥 每个快照后都 yield（之前是 2，导致 UI 长时间冻结）
        );
        // 🔥 实时排名计算前先 yield 并报告进度
        if (onProgress) {
            const totalSnapshots = wttSeasonsData.reduce((sum, s) => sum + s.snapshotDates.filter(d => d > s.startDate).length, wttSeasonsData.length);
            onProgress(totalSnapshots + 1, totalSnapshots + 1, '实时积分');
        }
        await new Promise(r => setTimeout(r, 0));
        // 实时排名
        const rt = calculateRealtimeRanking();
        if (rt) timeline.push(rt);
        return timeline;
    });
}

/**
 * 同步版本（兼容旧代码调用，在支持异步的地方请用 wttCalculateAllRankingsAsync）
 */
function wttCalculateAllRankings() {
    wttApplyNameNormalization();
    return wttWithDataContext(() => {
        const effScores = wttGetEffectiveInitialScores();
        const timeline = calculateAllRankingsWithSeasons(
            wttScoreLogData,
            effScores,
            wttSeasonsData
        );
        const rt = calculateRealtimeRanking();
        if (rt) timeline.push(rt);
        return timeline;
    });
}

// ============ 加载状态 UI（进度条 + 百分比 + 已用时） ============

const _wttLoadTimers = new WeakMap();

function _wttLpEl(target) { return typeof target === 'string' ? document.getElementById(target) : target; }

function _wttLpLang() {
    return (typeof i18n !== 'undefined' && typeof currentLang !== 'undefined' && i18n[currentLang]) ? i18n[currentLang] : {};
}

/**
 * 构建标准加载块 HTML：spinner + 主文案 + 进度条 + 百分比 + 详情 + 已用时
 * @param {string} message - 主文案
 * @param {object} [opts] - { compact: boolean } 紧凑横向布局（表格上方等窄空间）
 */
function wttLoadingBlockHtml(message, opts) {
    const lang = _wttLpLang();
    const txt = message || lang.wtt_loading || '加载数据中...';
    const elapsed0 = lang.wtt_elapsed ? lang.wtt_elapsed.replace('{s}', 0) : '0s';
    const spin = (size, bw) => `<div class="wtt-spinner" style="width:${size}px;height:${size}px;border:${bw}px solid var(--border-color);border-top-color:var(--accent-blue);border-radius:50%;animation:wttSpin 0.8s linear infinite;flex-shrink:0;"></div>`;
    if (opts && opts.compact) {
        return `<div style="display:flex;align-items:center;gap:12px;padding:6px 2px;color:var(--text-secondary);">${spin(18, 2)}
            <div style="flex:1;min-width:0;">
                <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
                    <span class="wtt-lp-main" style="font-size:0.85rem;">${txt}</span>
                    <span class="wtt-lp-pct" style="font-size:0.75rem;color:var(--text-muted);">0%</span>
                </div>
                <div class="wtt-lp-track" style="margin-top:8px;"><div class="wtt-lp-fill"></div></div>
                <div class="wtt-progress-meta" style="justify-content:flex-start;"><span class="wtt-lp-detail"></span><span class="wtt-lp-elapsed">${elapsed0}</span></div>
            </div>
        </div>`;
    }
    return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;color:var(--text-secondary);">
        ${spin(40, 3)}
        <p class="wtt-lp-main" style="font-size:0.95rem;margin:0;">${txt}</p>
        <div class="wtt-lp-pct" style="font-size:0.85rem;margin-top:10px;">0%</div>
        <div class="wtt-lp-track"><div class="wtt-lp-fill"></div></div>
        <div class="wtt-progress-meta"><span class="wtt-lp-detail"></span><span class="wtt-lp-elapsed">${elapsed0}</span></div>
    </div>`;
}

/**
 * 启动已用时计时器（每秒更新 .wtt-lp-elapsed；元素脱离文档时自清理）
 */
function wttStartLoadingTimer(el) {
    wttStopLoadingTimer(el);
    const t0 = Date.now();
    const id = setInterval(() => {
        if (!document.contains(el)) { clearInterval(id); _wttLoadTimers.delete(el); return; }
        const span = el.querySelector('.wtt-lp-elapsed');
        if (span) {
            const s = Math.floor((Date.now() - t0) / 1000);
            const lang = _wttLpLang();
            span.textContent = lang.wtt_elapsed ? lang.wtt_elapsed.replace('{s}', s) : (s + 's');
        }
    }, 1000);
    _wttLoadTimers.set(el, id);
}

/**
 * 停止已用时计时器
 * @param {string|HTMLElement} target
 */
function wttStopLoadingTimer(target) {
    const el = _wttLpEl(target);
    if (el && _wttLoadTimers.has(el)) {
        clearInterval(_wttLoadTimers.get(el));
        _wttLoadTimers.delete(el);
    }
}

/**
 * 挂载加载块（已挂载则只更新主文案，不重置计时器）
 * @param {string|HTMLElement} target
 * @param {string} message
 * @param {object} [opts]
 */
function wttMountLoading(target, message, opts) {
    const el = _wttLpEl(target);
    if (!el) return null;
    if (!el.querySelector('.wtt-lp-fill')) {
        el.innerHTML = wttLoadingBlockHtml(message, opts);
        wttStartLoadingTimer(el);
    } else if (message) {
        const mainEl = el.querySelector('.wtt-lp-main');
        if (mainEl) mainEl.textContent = message;
    }
    return el;
}

/**
 * 更新进度：百分比 + 进度条宽度 + 详情文字（可选更新主文案）
 * @param {string|HTMLElement} target
 * @param {number} pct 0-100（自动 clamp）
 * @param {string} [detailText] 详情行（如"正在下载 xx (1/5)"）
 * @param {string} [mainText] 可选，替换主文案
 */
function wttSetLoadingProgress(target, pct, detailText, mainText) {
    const el = _wttLpEl(target);
    if (!el) return;
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    const fill = el.querySelector('.wtt-lp-fill');
    const pctEl = el.querySelector('.wtt-lp-pct');
    const detEl = el.querySelector('.wtt-lp-detail');
    const mainEl = el.querySelector('.wtt-lp-main');
    if (fill) fill.style.width = p + '%';
    if (pctEl) pctEl.textContent = p + '%';
    if (detEl && detailText != null) detEl.textContent = detailText;
    if (mainEl && mainText) mainEl.textContent = mainText;
}

/**
 * 在指定容器中强制挂载加载块（兼容旧调用：整体替换内容）
 * @param {string} containerId - 容器元素 ID
 * @param {string} message - 加载提示文字
 */
function wttShowLoading(containerId, message) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = wttLoadingBlockHtml(message);
    wttStartLoadingTimer(el);
}

/**
 * 骨架屏占位表格行
 * @param {number} rows 行数
 * @param {number} cols 列数
 */
function wttSkeletonRowsHtml(rows, cols) {
    let html = '';
    for (let r = 0; r < rows; r++) {
        html += '<tr>';
        for (let c = 0; c < cols; c++) {
            const w = c === 0 ? 55 : ((r + c) % 3 === 0 ? 70 : 85);
            html += `<td><div class="wtt-skel" style="height:14px;width:${w}%"></div></td>`;
        }
        html += '</tr>';
    }
    return html;
}

// ============ 数据加载编排（并行 + 统一进度映射） ============

/**
 * 统一加载阶段进度映射：
 *   download: done/total ∈ [0,1] → [5%, 40%]
 *   calc:     done/total ∈ [0,1] → [40%, 98%]
 *   realtime: 固定 98%
 */
function wttLoadPhasePct(phase, done, total) {
    total = Math.max(1, total || 1);
    if (phase === 'download') return 5 + (done / total) * 35;
    if (phase === 'calc') return 40 + (Math.min(done, total) / total) * 58;
    return 98;
}

/**
 * settings 先行 → score-log 与其余数据文件并行加载。
 * 所有 loader 内部已容错不抛错；单个任务异常不影响其它任务。
 * @param {boolean} includeAssoc - 是否加载 assoc.json
 * @param {function} [onFileDone] - 每个文件完成时回调 (done, total, label)
 *   注意：settings 完成为第 1 步（不含在此回调内），调用方按 (done+1)/(total+1) 计入总进度
 */
async function wttLoadSettingsAndFiles(includeAssoc, onFileDone) {
    await wttLoadSettings();
    const needsInitScores = !wttSettings || wttSettings.scoreMode !== 'flat1300';
    const tasks = [
        { loader: wttLoadScoreLog,          label: i18n[currentLang].wtt_file_matches },
        { loader: wttLoadEventCoefficients, label: i18n[currentLang].wtt_file_event },
        { loader: wttLoadSeasons,           label: i18n[currentLang].wtt_file_season }
    ];
    if (needsInitScores) tasks.unshift({ loader: wttLoadInitialScores, label: i18n[currentLang].wtt_file_initial });
    if (includeAssoc !== false) tasks.push({ loader: wttLoadPlayerAssoc, label: i18n[currentLang].wtt_pp_assoc });
    const total = tasks.length;
    let done = 0;
    await Promise.all(tasks.map(t => Promise.resolve(t.loader()).then(() => {
        done++;
        if (onFileDone) { try { onFileDone(done, total, t.label); } catch (e) { /* 回调异常不阻断 */ } }
    }).catch(e => console.error('[WTT] 数据文件加载失败:', t.label, e))));
}

/**
 * 注入旋转动画关键帧（如果页面还没有）
 */
(function injectSpinnerStyle() {
    if (document.getElementById('wtt-spinner-style')) return;
    const style = document.createElement('style');
    style.id = 'wtt-spinner-style';
    style.textContent = '@keyframes wttSpin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
})();

// ============ 获取当前项目信息 ============

function wttGetCategoryInfo() {
    return WTT_CATEGORIES[wttCurrentCategory] || WTT_CATEGORIES['ms'];
}

/**
 * 获取所有有数据的项目列表（用于 hub 页面判断哪些项目已就绪）
 */
async function wttCheckCategoryStatus() {
    const statuses = {};
    for (const [id, info] of Object.entries(WTT_CATEGORIES)) {
        try {
            const resp = await fetch(`wtt_data/${id}/score-log.json`);
            if (!resp.ok) { statuses[id] = 'empty'; continue; }
            const data = await resp.json();
            const realRecords = data.filter(wttIsValidRecord);
            statuses[id] = realRecords.length > 0 ? 'ready' : 'template';
        } catch (e) {
            statuses[id] = 'empty';
        }
    }
    return statuses;
}

// ============ 向后兼容的桥接函数 ============
// 保留旧函数名以确保现有代码不报错

// 注意：如果 wtt_ranking.js 已加载，它会覆盖 loadRankingData() 为异步版本（带进度条）
// 此版本作为回退：如果 wtt_ranking.js 未加载，则使用异步分块计算避免 UI 冻结
function loadRankingData() {
    return wttLoadAllData().then(async () => {
        if (typeof wttCalculateAllRankingsAsync === 'function') {
            // 使用异步分块计算（不阻塞 UI，但没有进度回调因为不知道容器）
            wttRankingTimeline = await wttCalculateAllRankingsAsync(null);
        } else {
            wttRankingTimeline = wttCalculateAllRankings();
        }
        return wttRankingTimeline;
    });
}

// 供其他模块使用的旧函数名（回退版本，通常被 wtt_ranking.js 覆盖）
function wttLoadRankingDataLegacy() {
    return loadRankingData();
}

// ============ 初始化 ============

/**
 * 页面加载时自动检测项目并初始化
 */
wttDetectCategory();
console.log(`[WTT Common] 当前项目: ${wttCurrentCategory} (${WTT_CATEGORIES[wttCurrentCategory].name})`);

/**
 * 更新页面上的项目名称显示（Hero 标题中的 <span id="wttCatName">）
 * 根据当前语言显示中英文名称
 */
function wttGetCategoryDisplayName() {
    const info = wttGetCategoryInfo();
    if (typeof currentLang !== 'undefined' && currentLang === 'en' && info.nameEn) {
        return info.nameEn;
    }
    return info.name;
}

function wttUpdatePageCategoryDisplay() {
    const catEl = document.getElementById('wttCatName');
    if (catEl) {
        const info = wttGetCategoryInfo();
        catEl.textContent = wttGetCategoryDisplayName();
        catEl.style.color = info.color;
    }
}

/**
 * 语言切换后的 WTT 通用重审触发函数
 */
function wttReapplyI18n() {
    wttUpdatePageCategoryDisplay();
    wttPatchInternalLinks();
}

// 页面加载后自动更新显示
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        wttUpdatePageCategoryDisplay();
        wttPatchInternalLinks();
    });
} else {
    wttUpdatePageCategoryDisplay();
    wttPatchInternalLinks();
}

/**
 * 自动给 WTT 内部链接（wtt_*.html）追加 ?cat= 参数
 */
function wttPatchInternalLinks() {
    const cat = wttCurrentCategory;
    document.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (!href) return;
        // 匹配 wtt_*.html 的内部链接
        if (href.match(/^wtt_\w+\.html$/)) {
            try {
                // 使用当前页面完整 URL 作为基准解析相对路径
                // 在 file:/// 和 GitHub Pages 子目录下都能正确解析
                const url = new URL(href, window.location.href);
                if (!url.searchParams.has('cat')) {
                    url.searchParams.set('cat', cat);
                    a.setAttribute('href', url.pathname + url.search);
                }
            } catch (e) {
                // file:// 等不支持 URL 解析的环境——手动拼接
                const sep = href.includes('?') ? '&' : '?';
                a.setAttribute('href', href + sep + 'cat=' + cat);
            }
        }
        // wtt_hub.html 不需要 cat 参数
    });
}

// ============ 球员 uid（确定性哈希路由） ============

/**
 * FNV-1a 32 位哈希
 * @param {string} str
 * @param {number} seed - 32 位种子
 * @returns {number} 无符号 32 位整数
 */
function wttFnv1a(str, seed) {
    let h = seed >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

/**
 * 生成球员的确定性 uid：{cat}-{64bit hex}
 * 基于规范化后的最终姓名：同一姓名永远同一 uid（幂等、零维护、无需注册表）
 * @param {string} name
 * @returns {string}
 */
function wttPlayerUid(name) {
    const cat = wttCurrentCategory || 'ms';
    const a = wttFnv1a(String(name), 0x811c9dc5).toString(16).padStart(8, '0');
    const b = wttFnv1a(String(name), 0x9e3779b9).toString(16).padStart(8, '0');
    return cat + '-' + a + b;
}

// uid -> 姓名 反向索引（数据加载完成后构建）
let wttUidIndex = null;

/**
 * 收集当前项目全部球员名（规范化后），供 uid 解析
 * @returns {string[]}
 */
function wttCollectWttPlayerNames() {
    const set = new Set();
    if (wttScoreLogData && wttScoreLogData.length) {
        for (const r of wttScoreLogData) {
            if (isMatchRecord(r)) {
                if (r['胜者']) set.add(r['胜者']);
                if (r['负者']) set.add(r['负者']);
            } else if (isBonusRecord(r) && r['对象']) {
                set.add(r['对象']);
            }
        }
    }
    if (wttInitialScoresData && wttInitialScoresData.initialScores) {
        for (const n of Object.keys(wttInitialScoresData.initialScores)) {
            if (n) set.add(n);
        }
    }
    if (wttRankingTimeline && wttRankingTimeline.length) {
        for (const t of wttRankingTimeline) {
            if (t && t.data && t.data.length) {
                for (const p of t.data) {
                    if (p['姓名']) set.add(p['姓名']);
                }
            }
        }
    }
    return Array.from(set);
}

/**
 * 构建 uid -> 姓名 索引（带碰撞检测）
 */
function wttBuildUidIndex() {
    wttApplyNameNormalization();
    wttUidIndex = {};
    const players = wttCollectWttPlayerNames();
    for (const n of players) {
        const uid = wttPlayerUid(n);
        if (wttUidIndex[uid] && wttUidIndex[uid] !== n) {
            console.warn('[WTT] uid 碰撞:', uid, wttUidIndex[uid], '<->', n);
        }
        wttUidIndex[uid] = n;
    }
    return wttUidIndex;
}

/**
 * 从 URL 参数解析球员名：优先 uid，回退 player 参数
 * @returns {string|null}
 */
function wttResolvePlayerParam() {
    const params = new URLSearchParams(window.location.search);
    const uid = params.get('uid');
    if (uid) {
        if (!wttUidIndex) wttBuildUidIndex();
        if (wttUidIndex[uid]) return wttUidIndex[uid];
    }
    const name = params.get('player');
    return name ? String(name) : null;
}

/**
 * 生成球员个人页 URL（带 uid 参数，?cat= 显式携带避免与 wttPatchInternalLinks 冲突）
 * @param {string} name
 * @returns {string}
 */
function wttPlayerPageUrl(name) {
    return 'wtt_player.html?cat=' + encodeURIComponent(wttCurrentCategory || 'ms') + '&uid=' + encodeURIComponent(wttPlayerUid(name));
}

/**
 * 生成球员姓名链接（用于排名表 / 记录对手列）
 * @param {string} name
 * @returns {string}
 */
function wttLinkPlayerName(name) {
    if (!name) return '';
    const safe = escapeHtml(String(name));
    return '<a href="' + wttPlayerPageUrl(name) + '" class="player-name-link" title="' + escapeHtml(i18n[currentLang].wtt_pp_open) + '">' + safe + '</a>';
}
