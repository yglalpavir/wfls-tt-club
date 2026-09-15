/* =====================================================================
 *  audio.js — WebAudio 音效系统
 * ===================================================================== */
'use strict';

/* ---------------- 6. 音效 ---------------- */
let AC = null, master = null, noiseBuf = null, soundOn = true;
function ensureAudio(){
  if(AC){ if(AC.state==='suspended') AC.resume(); return; }
  try{
    AC = new (window.AudioContext||window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = soundOn?0.85:0; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate*0.25, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
    const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const lp = AC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value = 260;
    const g = AC.createGain(); g.gain.value = 0.02;
    src.connect(lp); lp.connect(g); g.connect(master); src.start();
  }catch(e){}
}
function tone(f, t0, dur, type, gain){
  if(!AC) return;
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + t0;
  o.type = type||'triangle'; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(gain||0.2, t+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+dur+0.05);
}
function playStroke(stroke, pw){
  if(!AC) return; const t = AC.currentTime;
  const fh = stroke==='forehand';
  const s = AC.createBufferSource(); s.buffer = noiseBuf;
  const bp = AC.createBiquadFilter(); bp.type='bandpass'; bp.Q.value = 0.9;
  bp.frequency.value = fh ? 900+pw*1100 : 2000+pw*1600;
  const g = AC.createGain();
  const peak = fh ? 0.5+pw*0.4 : 0.35+pw*0.35;
  const dec  = fh ? 0.07+pw*0.03 : 0.045+pw*0.02;
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(peak, t+0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t+dec);
  s.connect(bp); bp.connect(g); g.connect(master); s.start(t); s.stop(t+dec+0.06);
  const o = AC.createOscillator(); o.type='triangle';
  if(fh){ o.frequency.setValueAtTime(240+pw*150,t); o.frequency.exponentialRampToValueAtTime(80,t+0.08); }
  else{ o.frequency.setValueAtTime(430+pw*180,t); o.frequency.exponentialRampToValueAtTime(180,t+0.05); }
  const g2 = AC.createGain();
  g2.gain.setValueAtTime(0.0001,t);
  g2.gain.exponentialRampToValueAtTime(fh?0.42:0.28, t+0.005);
  g2.gain.exponentialRampToValueAtTime(0.0001, t+(fh?0.1:0.06));
  o.connect(g2); g2.connect(master); o.start(t); o.stop(t+0.14);
}
function playPaddleHit(pw){ playStroke('forehand', pw); }
function playSwipe(pw){
  if(!AC) return; const t = AC.currentTime;
  const s = AC.createBufferSource(); s.buffer = noiseBuf;
  const bp = AC.createBiquadFilter(); bp.type='bandpass'; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(700,t); bp.frequency.exponentialRampToValueAtTime(2600,t+0.09);
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(0.18*pw,t+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001,t+0.12);
  s.connect(bp); bp.connect(g); g.connect(master); s.start(t); s.stop(t+0.15);
}
function playBounce(){ if(!AC)return; const t=AC.currentTime;
  const o=AC.createOscillator(),g=AC.createGain(); o.type='sine';
  o.frequency.setValueAtTime(250,t); o.frequency.exponentialRampToValueAtTime(160,t+0.045);
  g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.22,t+0.004);
  g.gain.exponentialRampToValueAtTime(0.0001,t+0.06);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+0.08);
}
function playNet(){ if(!AC)return; const t=AC.currentTime;
  const s=AC.createBufferSource(); s.buffer=noiseBuf;
  const lp=AC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=700;
  const g=AC.createGain();
  g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.28,t+0.006);
  g.gain.exponentialRampToValueAtTime(0.0001,t+0.14);
  s.connect(lp); lp.connect(g); g.connect(master); s.start(t); s.stop(t+0.2);
  tone(150, 0, 0.1, 'sawtooth', 0.08);
}
function playServe(){ tone(520,0,0.07,'square',0.08); }
function playScore(w){ w ? (tone(660,0,0.12), tone(880,0.11,0.16)) : (tone(330,0,0.12), tone(247,0.11,0.18)); }
function playWin(){ [523,659,784,1047].forEach((f,i)=>tone(f, i*0.13, 0.22, 'triangle', 0.22)); }
function playLose(){ [392,330,262,196].forEach((f,i)=>tone(f, i*0.15, 0.24, 'triangle', 0.18)); }
