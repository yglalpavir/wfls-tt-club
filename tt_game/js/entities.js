/* =====================================================================
 *  entities.js — 球 / 球拍 / 拖尾特效 / 落点环 / 瞄准准星
 * ===================================================================== */
'use strict';

/* ---------------- 5. 球 / 球拍 / 特效 ---------------- */
const ball = { pos:new THREE.Vector3(0,1,0.8), vel:new THREE.Vector3(), spin:new THREE.Vector3(), active:true, lastStroke:'' };
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R,20,14),
  new THREE.MeshStandardMaterial({ map:ballTex, roughness:.35 }));
ballMesh.castShadow = true; scene.add(ballMesh);

function makePaddle(){
  const group = new THREE.Group(), inner = new THREE.Group();
  const wood  = new THREE.MeshStandardMaterial({ color:0xc98d54, roughness:.6 });
  const red   = new THREE.MeshStandardMaterial({ color:0xd0283a, roughness:.55 });
  const black = new THREE.MeshStandardMaterial({ color:0x15161c, roughness:.5 });
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.084,0.084,0.006,28), wood);
  blade.rotation.x = Math.PI/2; blade.castShadow = true; inner.add(blade);
  const rF = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,0.003,28), red);
  rF.rotation.x = Math.PI/2; rF.position.z = -0.0045; inner.add(rF);
  const rB = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,0.003,28), black);
  rB.rotation.x = Math.PI/2; rB.position.z = 0.0045; inner.add(rB);
  // 拍柄：水平横向伸出（真实球拍横着握，拍柄在拍面平面内朝向体侧）
  // 右手执拍 → 拍柄朝玩家左侧(-X)；反手翻面(rotation.y=π)与对手镜像(组 rotation.y=π)会自动反向
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.095,0.028,0.022),
    new THREE.MeshStandardMaterial({ color:0x8a5a33, roughness:.6 }));
  handle.position.set(-0.13, 0, 0.012); handle.castShadow = true; inner.add(handle);
  group.add(inner); scene.add(group);
  return { group, inner, swing:0, svx:0, svz:0, predX:0, predZ:0, predT:-1,
           flipT:0, flipTarget:0, swingType:'forehand', recover:0, strokeT:-9,
           phase:'ready', phaseT:0, windup:0, power:0.6, serveSide:0,
           stance:'forehand', stanceT:-9 };   // 正/反手姿态状态（simcore.resolveStance 维护）
}
const playerPad = makePaddle();
playerPad.group.position.set(0, PADDLE_Y, PLAYER_Z);
const aiPad = makePaddle();
aiPad.group.rotation.y = Math.PI;
aiPad.group.position.set(0, PADDLE_Y, AI_Z);
aiPad.predZ = AI_Z;

const TRAIL_N = 16, trailMeshes = [];
/* 拖尾历史:预分配 Vector3 的环形缓冲,每帧 copy 而非 clone/unshift(零 GC 分配);
 * trailHead 指向下一个写入槽,最新点位于 (trailHead-1+TRAIL_N)%TRAIL_N */
const trailHist = [];
let trailHead = 0;
for(let i=0;i<TRAIL_N;i++){
  trailHist.push(new THREE.Vector3(0,1,0.8));
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.016,8,6),
    new THREE.MeshBasicMaterial({ color:0xaee2ff, transparent:true, opacity:0,
      blending:THREE.AdditiveBlending, depthWrite:false }));
  m.renderOrder = 3; scene.add(m); trailMeshes.push(m);
}
const ringGeo = new THREE.RingGeometry(0.028,0.045,28), rings = [];
for(let i=0;i<8;i++){
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color:0xffffff,
    transparent:true, opacity:0, side:THREE.DoubleSide, depthWrite:false }));
  m.rotation.x = -Math.PI/2; m.visible = false; m.renderOrder = 2; scene.add(m);
  rings.push({ m, life:0 });
}
function spawnRing(x,z){ for(const r of rings) if(r.life<=0){ r.life=1; r.m.visible=true; r.m.position.set(x,TABLE_TOP+0.004,z); return; } }
const flashSpr = new THREE.Sprite(new THREE.SpriteMaterial({ color:0xfff2c8, transparent:true,
  opacity:0, blending:THREE.AdditiveBlending, depthWrite:false }));
flashSpr.scale.setScalar(0.1); scene.add(flashSpr);
let flashLife = 0;

const landRing = new THREE.Mesh(new THREE.RingGeometry(0.05,0.075,32),
  new THREE.MeshBasicMaterial({ color:0xf2b64c, transparent:true, opacity:0,
    side:THREE.DoubleSide, depthWrite:false }));
landRing.rotation.x = -Math.PI/2; landRing.renderOrder = 2; landRing.visible = false;
scene.add(landRing);
let landT = 0;

const aimGroup = new THREE.Group();
const aimMatOuter = new THREE.MeshBasicMaterial({ color:0xe03443, transparent:true, opacity:0.85, side:THREE.DoubleSide, depthWrite:false });
const aimMatTick  = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.7,  side:THREE.DoubleSide, depthWrite:false });
const aimMatInner = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.85, side:THREE.DoubleSide, depthWrite:false });
const aimMatDot   = new THREE.MeshBasicMaterial({ color:0xf2b64c, transparent:true, opacity:0.95, side:THREE.DoubleSide, depthWrite:false });
aimGroup.add(new THREE.Mesh(new THREE.RingGeometry(0.075,0.092,36), aimMatOuter));
aimGroup.add(new THREE.Mesh(new THREE.RingGeometry(0.028,0.04,24), aimMatInner));
aimGroup.add(new THREE.Mesh(new THREE.CircleGeometry(0.011,16), aimMatDot));
const tickGeo = new THREE.PlaneGeometry(0.014,0.04);
[[0,-0.118,0],[0,0.118,0],[-0.118,0,Math.PI/2],[0.118,0,Math.PI/2]].forEach(([x,y,rz])=>{
  const t = new THREE.Mesh(tickGeo, aimMatTick);
  t.position.set(x,y,0); t.rotation.z = rz; aimGroup.add(t);
});
aimGroup.rotation.x = -Math.PI/2;
aimGroup.position.set(0, TABLE_TOP+0.007, -0.8);
aimGroup.traverse(o=>{ o.renderOrder = 2; });
scene.add(aimGroup);
const _cFhDeep = new THREE.Color(0xe03443), _cBhDeep = new THREE.Color(0x2f7fe0), _cShort = new THREE.Color(0xf2b64c);
const aim = { x:0, z:-0.9 };
function computeAim(){
  const g = playerPad.group.position;
  const st = STROKE[playerStance];
  aim.x = clamp(g.x*AIM.xFromPos + playerPad.svx*AIM.xFromSwipe, -st.aimXMax, st.aimXMax);
  // 深度直接由鼠标垂直位置决定（球拍 z 拟合不影响瞄准 → 更跟手）
  const t = clamp(mouseNy!=null ? mouseNy : 0.5, 0, 1);
  aim.z = THREE.MathUtils.lerp(AIM.zDeep, AIM.zShort, t*t);
}
