/* =====================================================================
 *  i18n.js — tt_game self-contained i18n (does NOT use js/common.js)
 *  · dictionary: window.GAME_I18N = { zh: {...}, en: {...} }
 *  · localStorage key `wfls-lang.v1` is shared with the main site
 *  · attributes walked on switch: data-i18n / data-i18n-title /
 *    data-i18n-placeholder / data-i18n-aria / data-i18n-content
 *  · JS-rendered text: window.gameT(key, data) + window.gameReapplyI18n()
 * ===================================================================== */
'use strict';

window.GAME_I18N = {
  zh: {
    "g_lang_btn": "EN",
    "g_meta_desc": "WFLS 乒乓球社团彩蛋：Three.js 3D 乒乓球对决。正手重旋、反手快撕，与五个等级的 AI 一较高下。",
    "g_title": "🏓 乒乓·对决 | WFLS Table Tennis Club",
    "g_live_chip": "LIVE · 乒乓竞技场",
    "g_game_point": "局点",
    "g_name_you": "你 YOU",
    "g_mid_label": "11分制 · ITTF 规则",
    "g_name_ai": "AI 电脑",
    "g_status_demo": "AI 演示对局 · 按任意键开始",
    "g_status_demo_touch": "AI 演示对局 · 点击「开始比赛」开始",
    "g_counter_hint": "◎ 重旋来球 · 反手快撕借力反击!",
    "g_push_hint": "◎ 下旋来球 · 按住 Ctrl 搓球",
    "g_push_hint_touch": "◎ 下旋来球 · 按住「搓」钮搓球",
    "g_push_now": "◎ 搓球 · 拍面放平",
    "g_serve_chip_top": "▲ 上旋发球",
    "g_serve_chip_side": "无侧旋",
    "g_serve_top": "▲上旋",
    "g_serve_side_l": "◀ 左侧旋",
    "g_serve_side_r": "▶ 右侧旋",
    "g_serve_side_n": "直",
    "g_pw_weak": "弱",
    "g_pw_mid": "中",
    "g_pw_strong": "强",
    "g_stance_fh": "正手 FOREHAND",
    "g_stance_fh_sub": "极重上旋 · 重炮 · 几乎不漏球",
    "g_stance_bh": "反手 BACKHAND",
    "g_stance_bh_sub": "快速 · 大角度 · 快撕中等旋转",
    "g_windup": "引拍蓄力中…",
    "g_swing_label": "挥拍",
    "g_swipe_charge": "横向滑动蓄力",
    "g_charge_l": "◀ 左旋蓄力",
    "g_charge_r": "右旋蓄力 ▶",
    "g_hint_move_lr": "<kbd>鼠标左右</kbd>移动",
    "g_hint_move_ud": "<kbd>鼠标上下</kbd>压深/摆短",
    "g_hint_swipe": "<kbd>快速横滑</kbd>强力侧旋",
    "g_hint_flip": "<kbd>自动换面</kbd>反手快撕",
    "g_hint_reset": "<kbd>R</kbd>重置",
    "g_hint_assist": "◎ 正手重旋 · 反手快撕",
    "g_btn_home": "‹ 返回首页",
    "g_btn_quality": "画质：",
    "g_btn_help": "帮助 ?",
    "g_btn_sound_on": "音效：开",
    "g_btn_sound_off": "音效：关",
    "g_btn_reset": "重置比分",
    "g_btn_exit_watch": "✕ 退出观看",
    "g_btn_spin_l": "◀ 左旋",
    "g_btn_spin_r": "右旋 ▶",
    "g_btn_pow_minus": "强 −",
    "g_btn_pow_plus": "强 ＋",
    "g_btn_push": "搓",
    "g_btn_start": "开始比赛 ▶",
    "g_btn_watch": "AI 斗蛐蛐 ▶",
    "g_btn_again": "再来一局 ▶",
    "g_btn_menu": "主菜单",
    "g_btn_close": "关闭 ✕",
    "g_ov_kicker": "WFLS TABLE TENNIS CLUB · 彩蛋 EASTER EGG",
    "g_ov_title": "乒乓·对决",
    "g_ov_sub": "TABLE TENNIS ARENA · 11分制 · 净胜两球 · ITTF 规则",
    "g_h3_move": "移动与瞄准",
    "g_h3_strokes": "击球技术",
    "g_h3_serve": "发球",
    "g_h3_serve_sys": "发球与系统",
    "g_row_move_lr": "移动球拍",
    "g_row_move_ud": "压深/摆短",
    "g_row_aim": "瞄准落点",
    "g_row_swipe": "强力侧旋 · 爆冲爆扣",
    "g_row_flip": "自动选正/反手",
    "g_row_ctrl": "按住=搓球",
    "g_row_serve_toss": "垂直抛球 → 自动击球",
    "g_row_serve_sd": "左 / 右侧旋",
    "g_row_serve_qe": "旋转强度 弱 / 强",
    "g_row_serve_click": "发球 · 高球可扣杀",
    "g_row_r_reset": "重置比分",
    "g_row_m_sound": "音效开关",
    "g_row_t_drag": "移动球拍",
    "g_row_t_push_pull": "上推快攻 / 下拉弧圈",
    "g_row_t_pushbtn": "按住=搓球",
    "g_row_t_lr_btn": "按住=左 / 右侧旋",
    "g_row_t_topbtns": "重置比分 · 音效开关",
    "g_row_t_exit": "观看模式退出",
    "g_choose_model": "选择对战模型",
    "g_model_standard": "普通 AI",
    "g_model_hell": "地狱 AI",
    "g_model_grandslam": "大满贯预备种子",
    "g_model_ttmouse": "鼠标上的tt玩家",
    "g_model_nemesis": "地狱AI克星",
    "g_mhint_standard": "普通 AI：标准水平 · 攻守平衡",
    "g_mhint_hell": "地狱 AI：自对弈打法 · 会搓球/快撕/爆冲",
    "g_mhint_grandslam": "大满贯预备种子：模仿你的打法 · 攻守全能",
    "g_mhint_ttmouse": "鼠标上的tt玩家：真人级手感 · 用鼠标 X/Y/Ctrl 三个原始输入还原真人对打",
    "g_mhint_nemesis": "地狱AI克星：专门克制地狱AI的打法 · 对地狱AI胜球率 60.6%（内战基线 49.5%）",
    "g_fight_group": "AI 斗蛐蛐 · 五局三胜",
    "g_fight_left": "左 AI",
    "g_fight_right": "右 AI",
    "g_fight_hint0": "可选相同/不同 AI · 不换边 · 先赢 3 大局者胜",
    "g_fight_tail": " · 不换边 · 先赢3大局者胜",
    "g_vs_civil": "（内战）",
    "g_end_kicker_init": "比赛结束",
    "g_end_over": "比赛结束 · GAME OVER",
    "g_end_win": "胜利!",
    "g_lose": "惜败",
    "g_end_stats": "最长回合 {r} 拍 · 总得分 {t}",
    "g_help_kicker": "操作指南",
    "g_help_title": "完整键位与技巧",
    "g_st_series": "系列 {a} : {b} · 5局三胜",
    "g_deuce": "DEUCE · 平分",
    "g_game_point_state": "局点 GAME POINT",
    "g_left_prefix": "左·",
    "g_right_prefix": "右·",
    "g_fight_title": "AI 斗蛐蛐",
    "g_fight_end_kicker": "AI 斗蛐蛐 · 五局三胜 · 决出冠军",
    "g_win_suffix": " 获胜!",
    "g_series": "系列",
    "g_fight_stats": " · 不换边 · 最长回合 {r} 拍",
    "g_msg_serve_out": "发球出界",
    "g_msg_no_return": "对手未能回球",
    "g_msg_rush_net": "对下旋抢点 · 下网!",
    "g_msg_net": "下网!",
    "g_msg_out": "出界!",
    "g_msg_let": "擦网 · 重发球",
    "g_msg_serve_first": "发球失误 · 未先落自己半台",
    "g_msg_serve_twice_own": "发球失误 · 两跳都在自己半台",
    "g_msg_double": "双跳 · 回球失败",
    "g_msg_not_over": "未过网",
    "g_st_watch_series": "AI 斗蛐蛐 · {a} vs {b} · 系列 {l} : {r} · 新一大局",
    "g_st_your_serve": "你的发球 · A=上旋 S/D=左右旋 Q/E=强度 · 点击发出",
    "g_st_serve": "发球!",
    "g_st_ai_serve": "AI 发球…",
    "g_st_toss": "抛球发球!",
    "g_st_ai_serve2": "AI 发球!",
    "g_st_rally": "回合进行中 · 发球先落己方再弹过网 · 看胶面翻转预判 AI 出球",
    "g_toast_point": "得分!",
    "g_toast_lost": "失分",
    "g_st_deep": "回合进行中 · 压深压制",
    "g_st_short": "回合进行中 · 摆短控制",
    "g_q_auto": "自动",
    "g_q_high": "高",
    "g_q_med": "中",
    "g_q_low": "低",
    "g_q_auto_sub": "按设备自动档位 + 动态分辨率调节",
    "g_q_manual_sub": "分辨率与阴影已即时应用",
    "g_st_fight_start": "AI 斗蛐蛐 · {a} vs {b} · 5局三胜",
    "g_toast_fight_sub": "{a} vs {b} · 5局三胜 · 不换边",
    "g_toast_match_start": "比赛开始",
    "g_toast_match_start_sub": "正手重旋 · 反手快撕 · 对轰开始",
    "g_toast_netcord": "擦网!",
    "g_toast_push": "搓球!",
    "g_toast_push_sub": "PUSH · 下旋低平",
    "g_toast_fh_smash": "正手爆扣!",
    "g_toast_bh_smash": "反手爆抽!",
    "g_toast_counter": "快撕反击!",
    "g_toast_fh_loop": "正手爆冲!",
    "g_toast_sidespin": "强侧旋!",
    "g_curve_l": "左拐 LEFT CURVE",
    "g_curve_r": "右拐 RIGHT CURVE",
    "g_toast_fh_drive": "正手快带!",
    "g_toast_bh_snap": "反手快撕!",
    "g_toast_wide": "大角度!",
    "g_toast_ai_push": "AI搓球!",
    "g_toast_ai_push_sub": "AI PUSH · 下旋低平",
    "g_toast_ai_lift": "AI拉球!",
    "g_toast_ai_counter": "AI快撕!",
    "g_toast_ai_loop": "AI正手爆冲!",
    "g_toast_ai_loop_sub": "HEAVY LOOP · 反手快撕可破",
    "g_toast_ai_smash": "AI扣杀!",
    "g_led_banner": "乒乓对决 ★ TABLE TENNIS ARENA ★ PING PONG ★ ",
    "g_btn_quality_full": "画质：自动",
    "g_serve_pow_fmt": "旋转强度{p}",
    "g_lang_aria": "切换语言",
    "g_hint_auto_side": "自动换面",
    "g_hint_red_crosshair": "红色准星",
    "g_hint_top_right": "右上按钮",
    "g_in_mouse_lr": "鼠标左右",
    "g_in_mouse_ud": "鼠标上下",
    "g_in_quick_swipe": "快速横滑",
    "g_in_swipe": "横向滑动",
    "g_in_click_space": "点击 / 空格",
    "g_in_finger_drag": "手指拖动",
    "g_in_push_pull": "上推 / 下拉",
    "g_in_push_btn": "「搓」钮",
    "g_in_tap_screen": "轻点屏幕",
    "g_in_lr_btn": "◀ / ▶ 钮",
    "g_in_minus_plus_btn": "− / ＋ 钮",
    "g_in_close_btn": "✕ 钮"
  },
  en: {
    "g_lang_btn": "中文",
    "g_meta_desc": "WFLS Table Tennis Club easter egg: a Three.js 3D table tennis duel. Heavy-topspin forehand, fast backhand counter — take on five levels of AI.",
    "g_title": "🏓 Ping Pong Duel | WFLS Table Tennis Club",
    "g_live_chip": "LIVE · Ping Pong Arena",
    "g_game_point": "GAME PT",
    "g_name_you": "YOU",
    "g_mid_label": "First to 11 · ITTF rules",
    "g_name_ai": "AI CPU",
    "g_status_demo": "AI demo match · Press any key to start",
    "g_status_demo_touch": "AI demo match · Tap Start Match to begin",
    "g_counter_hint": "◎ Heavy topspin incoming · counter with a backhand snap!",
    "g_push_hint": "◎ Backspin incoming · hold Ctrl to push",
    "g_push_hint_touch": "◎ Backspin incoming · hold the PUSH button",
    "g_push_now": "◎ Push · flatten the racket",
    "g_serve_chip_top": "▲ Topspin serve",
    "g_serve_chip_side": "No sidespin",
    "g_serve_top": "▲Topspin",
    "g_serve_side_l": "◀ Left sidespin",
    "g_serve_side_r": "▶ Right sidespin",
    "g_serve_side_n": "Straight",
    "g_pw_weak": "Low",
    "g_pw_mid": "Mid",
    "g_pw_strong": "High",
    "g_stance_fh": "FOREHAND",
    "g_stance_fh_sub": "Heavy topspin · cannon · rarely misses",
    "g_stance_bh": "BACKHAND",
    "g_stance_bh_sub": "Fast · wide angle · snap on medium spin",
    "g_windup": "Loading up…",
    "g_swing_label": "Swing",
    "g_swipe_charge": "Swipe sideways to charge",
    "g_charge_l": "◀ Charge left spin",
    "g_charge_r": "Charge right spin ▶",
    "g_hint_move_lr": "<kbd>Mouse L/R</kbd>move",
    "g_hint_move_ud": "<kbd>Mouse U/D</kbd>deep / short",
    "g_hint_swipe": "<kbd>Fast swipe</kbd>strong sidespin",
    "g_hint_flip": "<kbd>Auto flip</kbd>backhand snap",
    "g_hint_reset": "<kbd>R</kbd>reset",
    "g_hint_assist": "◎ Heavy FH · backhand snap",
    "g_btn_home": "‹ Home",
    "g_btn_quality": "Quality: ",
    "g_btn_help": "Help ?",
    "g_btn_sound_on": "Sound: On",
    "g_btn_sound_off": "Sound: Off",
    "g_btn_reset": "Reset score",
    "g_btn_exit_watch": "✕ Exit watch",
    "g_btn_spin_l": "◀ Left spin",
    "g_btn_spin_r": "Right spin ▶",
    "g_btn_pow_minus": "Pwr −",
    "g_btn_pow_plus": "Pwr ＋",
    "g_btn_push": "PUSH",
    "g_btn_start": "Start Match ▶",
    "g_btn_watch": "AI Battle ▶",
    "g_btn_again": "Play again ▶",
    "g_btn_menu": "Main menu",
    "g_btn_close": "Close ✕",
    "g_ov_kicker": "WFLS TABLE TENNIS CLUB · EASTER EGG",
    "g_ov_title": "Ping Pong Duel",
    "g_ov_sub": "TABLE TENNIS ARENA · First to 11 · Win by 2 · ITTF rules",
    "g_h3_move": "Move & aim",
    "g_h3_strokes": "Strokes",
    "g_h3_serve": "Serve",
    "g_h3_serve_sys": "Serve & system",
    "g_row_move_lr": "Move the racket",
    "g_row_move_ud": "Deep / short",
    "g_row_aim": "Aim the landing spot",
    "g_row_swipe": "Strong sidespin · loops and smashes",
    "g_row_flip": "Auto pick forehand / backhand",
    "g_row_ctrl": "Hold to push",
    "g_row_serve_toss": "Toss vertically → auto strike",
    "g_row_serve_sd": "Left / right sidespin",
    "g_row_serve_qe": "Spin power low / high",
    "g_row_serve_click": "Serve · smash a high ball",
    "g_row_r_reset": "Reset the score",
    "g_row_m_sound": "Toggle sound",
    "g_row_t_drag": "Move the racket",
    "g_row_t_push_pull": "Push up / pull down",
    "g_row_t_pushbtn": "Hold to push",
    "g_row_t_lr_btn": "Hold = left / right sidespin",
    "g_row_t_topbtns": "Reset score · toggle sound",
    "g_row_t_exit": "Leave watch mode",
    "g_choose_model": "Choose your opponent",
    "g_model_standard": "Standard AI",
    "g_model_hell": "Hell AI",
    "g_model_grandslam": "Grand-slam seed",
    "g_model_ttmouse": "Mouse TT player",
    "g_model_nemesis": "Hell AI nemesis",
    "g_mhint_standard": "Standard AI: solid all-round · balanced attack and defense",
    "g_mhint_hell": "Hell AI: self-play style · pushes, snaps and power loops",
    "g_mhint_grandslam": "Grand-slam seed: mirrors your own playstyle · complete game",
    "g_mhint_ttmouse": "Mouse TT player: human-like feel · reproduces real play from raw mouse X/Y/Ctrl",
    "g_mhint_nemesis": "Hell AI nemesis: built specifically to counter Hell AI · 60.6% point rate vs Hell (49.5% baseline)",
    "g_fight_group": "AI Battle · Best of five",
    "g_fight_left": "Left AI",
    "g_fight_right": "Right AI",
    "g_fight_hint0": "Same or different AIs · no side switch · first to 3 games",
    "g_fight_tail": " · No side switch · First to 3 games",
    "g_vs_civil": " (mirror match)",
    "g_end_kicker_init": "Match over",
    "g_end_over": "Match over · GAME OVER",
    "g_end_win": "Victory!",
    "g_lose": "So close",
    "g_end_stats": "Longest rally {r} · Total points {t}",
    "g_help_kicker": "CONTROLS",
    "g_help_title": "Full keys and tips",
    "g_st_series": "Series {a} : {b} · Best of 5",
    "g_deuce": "DEUCE · All square",
    "g_game_point_state": "GAME POINT",
    "g_left_prefix": "L·",
    "g_right_prefix": "R·",
    "g_fight_title": "AI Battle",
    "g_fight_end_kicker": "AI Battle · Best of 5 · Crown the champion",
    "g_win_suffix": " wins!",
    "g_series": "Series",
    "g_fight_stats": " · No side switch · Longest rally {r}",
    "g_msg_serve_out": "Serve out",
    "g_msg_no_return": "No return",
    "g_msg_rush_net": "Early on backspin · into the net!",
    "g_msg_net": "Into the net!",
    "g_msg_out": "Out!",
    "g_msg_let": "Net cord · replay",
    "g_msg_serve_first": "Fault · must bounce own half first",
    "g_msg_serve_twice_own": "Fault · both bounces on own half",
    "g_msg_double": "Double bounce · no return",
    "g_msg_not_over": "Did not cross the net",
    "g_st_watch_series": "AI Battle · {a} vs {b} · Series {l} : {r} · New game",
    "g_st_your_serve": "Your serve · A=topspin S/D=sidespin Q/E=power · click to serve",
    "g_st_serve": "Serve!",
    "g_st_ai_serve": "AI serving…",
    "g_st_toss": "Toss and serve!",
    "g_st_ai_serve2": "AI serves!",
    "g_st_rally": "Rally · serve bounces own half first · read the rubber flip to predict the AI",
    "g_toast_point": "Point!",
    "g_toast_lost": "Lost",
    "g_st_deep": "Rally · pin them deep",
    "g_st_short": "Rally · drop it short",
    "g_q_auto": "Auto",
    "g_q_high": "High",
    "g_q_med": "Med",
    "g_q_low": "Low",
    "g_q_auto_sub": "Auto tier for your device + dynamic resolution",
    "g_q_manual_sub": "Resolution and shadows applied",
    "g_st_fight_start": "AI Battle · {a} vs {b} · Best of 5",
    "g_toast_fight_sub": "{a} vs {b} · Best of 5 · No side switch",
    "g_toast_match_start": "Match start",
    "g_toast_match_start_sub": "Heavy forehand · backhand snap · let's trade",
    "g_toast_netcord": "Net cord!",
    "g_toast_push": "Push!",
    "g_toast_push_sub": "PUSH · low backspin",
    "g_toast_fh_smash": "Forehand smash!",
    "g_toast_bh_smash": "Backhand rip!",
    "g_toast_counter": "Snap counter!",
    "g_toast_fh_loop": "Forehand power loop!",
    "g_toast_sidespin": "Heavy sidespin!",
    "g_curve_l": "LEFT CURVE",
    "g_curve_r": "RIGHT CURVE",
    "g_toast_fh_drive": "Forehand quick drive!",
    "g_toast_bh_snap": "Backhand snap!",
    "g_toast_wide": "Wide angle!",
    "g_toast_ai_push": "AI push!",
    "g_toast_ai_push_sub": "AI PUSH · low backspin",
    "g_toast_ai_lift": "AI loop up!",
    "g_toast_ai_counter": "AI snap!",
    "g_toast_ai_loop": "AI power loop!",
    "g_toast_ai_loop_sub": "HEAVY LOOP · beat it with a backhand snap",
    "g_toast_ai_smash": "AI smash!",
    "g_led_banner": "PING PONG DUEL ★ TABLE TENNIS ARENA ★ PING PONG ★ ",
    "g_btn_quality_full": "Quality: Auto",
    "g_serve_pow_fmt": "Spin power {p}",
    "g_lang_aria": "Switch language",
    "g_hint_auto_side": "auto side-switch",
    "g_hint_red_crosshair": "red crosshair",
    "g_hint_top_right": "top-right button",
    "g_in_mouse_lr": "mouse left / right",
    "g_in_mouse_ud": "mouse up / down",
    "g_in_quick_swipe": "quick swipe",
    "g_in_swipe": "swipe sideways",
    "g_in_click_space": "click / spacebar",
    "g_in_finger_drag": "drag finger",
    "g_in_push_pull": "push up / pull down",
    "g_in_push_btn": "push (chop) button",
    "g_in_tap_screen": "tap screen",
    "g_in_lr_btn": "◀ / ▶ button",
    "g_in_minus_plus_btn": "− / ＋ button",
    "g_in_close_btn": "✕ button"
  }
};

window.GAME_LANG_KEY = 'wfls-lang.v1';
window.gameLang = 'zh';
/* 语言偏好必须在解析期就生效:本文件第一个加载,后续脚本(含 scene.js 的 LED 贴图、
 * 启动时的 demo 文案)第一次调用 gameT 就要拿到正确语言 */
try{
  window.gameLang = (localStorage.getItem(window.GAME_LANG_KEY) === 'en') ? 'en' : 'zh';
}catch(e){}

/** key -> localized string; {placeholders} are filled from `data`;
 *  fallback chain: current lang -> zh -> the key itself. */
window.gameT = function(key, data){
  var lang = window.gameLang;
  var dict = (window.GAME_I18N[lang] || window.GAME_I18N.zh) || {};
  var v = dict[key];
  if(v === undefined || v === null) v = (window.GAME_I18N.zh || {})[key];
  if(v === undefined || v === null) v = key;
  if(data){
    v = String(v).replace(/\{(\w+)\}/g, function(m, k){
      return (data[k] !== undefined && data[k] !== null) ? String(data[k]) : m;
    });
  }
  return v;
};

/** raw Chinese value (data contract for internal parsers, e.g. TT_STATS reason keywords) */
window.gameTzh = function(key){
  var v = (window.GAME_I18N.zh || {})[key];
  return (v === undefined || v === null) ? key : v;
};

function applyStaticI18n(root){
  var lang = window.gameLang;
  var dict = (window.GAME_I18N[lang] || window.GAME_I18N.zh) || {};
  var zhDict = window.GAME_I18N.zh || {};
  function val(key){
    var v = dict[key];
    if(v === undefined || v === null) v = zhDict[key];
    return (v === undefined || v === null) ? null : v;
  }
  root = root || document;
  [['data-i18n', 'innerHTML'],
   ['data-i18n-title', 'title'],
   ['data-i18n-placeholder', 'placeholder'],
   ['data-i18n-aria', 'aria-label'],
   ['data-i18n-content', 'content']].forEach(function(pair){
    var attr = pair[0], prop = pair[1];
    var nodes = root.querySelectorAll ? root.querySelectorAll('[' + attr + ']') : [];
    Array.prototype.forEach.call(nodes, function(el){
      var v = val(el.getAttribute(attr));
      if(v === null) return;   /* missing key keeps current markup */
      if(prop === 'innerHTML') el.innerHTML = v;
      else if(prop === 'aria-label') el.setAttribute('aria-label', v);
      else if(prop === 'content') el.setAttribute('content', v);
      else el[prop] = v;
    });
  });
  var toggle = document.getElementById('gameLangToggle');
  if(toggle){
    var span = toggle.querySelector('[data-i18n]');
    var label = val('g_lang_btn');
    if(span && label !== null) span.innerHTML = label;
    var aria = val('g_lang_aria');
    if(aria !== null){ toggle.setAttribute('aria-label', aria); toggle.title = aria; }
  }
  document.documentElement.lang = (lang === 'en') ? 'en' : 'zh-CN';
}

window.setGameLanguage = function(lang){
  lang = (lang === 'en') ? 'en' : 'zh';
  window.gameLang = lang;
  try{ localStorage.setItem(window.GAME_LANG_KEY, lang); }catch(e){}
  applyStaticI18n(document);
  if(typeof window.gameReapplyI18n === 'function'){
    try{ window.gameReapplyI18n(); }catch(e){ if(window.console) console.warn(e); }
  }
};

window.toggleGameLanguage = function(){
  window.setGameLanguage(window.gameLang === 'en' ? 'zh' : 'en');
};

function gameI18nInit(){
  var stored = null;
  try{ stored = localStorage.getItem(window.GAME_LANG_KEY); }catch(e){}
  window.gameLang = (stored === 'en') ? 'en' : 'zh';
  applyStaticI18n(document);
  var toggle = document.getElementById('gameLangToggle');
  if(toggle && !toggle.__i18nBound){
    toggle.__i18nBound = true;
    toggle.addEventListener('click', function(e){
      e.preventDefault(); e.stopPropagation();
      window.toggleGameLanguage();
    });
  }
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', gameI18nInit);
}else{
  gameI18nInit();
}
