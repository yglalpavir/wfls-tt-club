/* =====================================================================
 *  scene.js — 渲染器 / 场景 / 相机 / 灯光 / 程序化纹理 / 场馆搭建
 * ===================================================================== */
'use strict';

/* ---------------- 2. 渲染器 / 场景 / 相机 / 灯光 ---------------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d14);
scene.fog = new THREE.Fog(0x0a0d14, 9, 24);

const camera = new THREE.PerspectiveCamera(40, innerWidth/innerHeight, 0.1, 60);
camera.position.set(0, 2.72, 4.88);

const renderer = new THREE.WebGLRenderer({ antialias: QUALITY.antialias, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY.dprCap));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = QUALITY.shadow > 0;
renderer.shadowMap.type = QUALITY.shadow === 2 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);
QUALITY.init(renderer);
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

scene.add(new THREE.HemisphereLight(0x93a7cc, 0x1c1e26, 0.5));
const dirLight = new THREE.DirectionalLight(0xffe9c9, 1.15);
dirLight.position.set(4.5, 7.5, 4);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(QUALITY.shadowSize, QUALITY.shadowSize);
dirLight.shadow.camera.left = -4.2; dirLight.shadow.camera.right = 4.2;
dirLight.shadow.camera.top = 4.2;   dirLight.shadow.camera.bottom = -4.2;
dirLight.shadow.camera.near = 2;    dirLight.shadow.camera.far = 18;
dirLight.shadow.bias = -0.0004;
scene.add(dirLight);
const ptTop = new THREE.PointLight(0xcfe4ff, 0.55, 12, 2); ptTop.position.set(0,3.6,0); scene.add(ptTop);
const rimR  = new THREE.PointLight(0xff6a3d, 0.4, 14);  rimR.position.set(-5,2.2,-4.5); scene.add(rimR);
const rimB  = new THREE.PointLight(0x3d7bff, 0.35, 14); rimB.position.set( 5,2.2,-4.5); scene.add(rimB);

/* ---------------- 3. 程序化纹理 ---------------- */
function canvasTex(w, h, draw){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO;
  return t;
}
const tableTex = canvasTex(512, 1024, (g)=>{
  const gr = g.createLinearGradient(0,0,0,1024);
  gr.addColorStop(0,'#0e5cab'); gr.addColorStop(.5,'#0a4c92'); gr.addColorStop(1,'#0e5cab');
  g.fillStyle = gr; g.fillRect(0,0,512,1024);
  for(let i=0;i<4000;i++){ g.fillStyle = Math.random()<.5?'rgba(255,255,255,.03)':'rgba(0,0,0,.04)';
    g.fillRect(Math.random()*512, Math.random()*1024, 1.5, 1.5); }
  g.strokeStyle = '#f5f8fc'; g.lineWidth = 10; g.strokeRect(8,8,496,1008);
  g.fillStyle = '#f5f8fc'; g.fillRect(254,8,4,1008);
});
const ballTex = canvasTex(128, 128, (g)=>{
  g.fillStyle = '#fdfdfd'; g.fillRect(0,0,128,128);
  g.strokeStyle = 'rgba(120,130,140,.35)'; g.lineWidth = 3;
  g.beginPath(); g.arc(64,64,42,0.4,2.7); g.stroke();
  g.fillStyle = 'rgba(220,60,70,.5)'; g.beginPath(); g.arc(92,42,7,0,7); g.fill();
});
const netTex = canvasTex(512, 64, (g)=>{
  g.clearRect(0,0,512,64);
  g.strokeStyle = 'rgba(215,225,235,.8)'; g.lineWidth = 1.4;
  g.beginPath();
  for(let x=0;x<=512;x+=7){ g.moveTo(x,0); g.lineTo(x,64); }
  for(let y=0;y<=64;y+=7){ g.moveTo(0,y); g.lineTo(512,y); }
  g.stroke();
});
const floorTex = canvasTex(256, 256, (g)=>{
  g.fillStyle = '#14161c'; g.fillRect(0,0,256,256);
  for(let x=0;x<256;x+=32){
    g.fillStyle = 'hsl(220,12%,'+(9+Math.random()*3)+'%)'; g.fillRect(x,0,32,256);
    g.fillStyle = '#0b0c10'; g.fillRect(x,0,2,256);
    g.fillRect(x, Math.random()*256, 32, 2);
  }
});
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(10,10);
const crowdTex = canvasTex(256, 64, (g)=>{
  g.fillStyle = '#0c0e14'; g.fillRect(0,0,256,64);
  const pal = ['#4a4f5e','#6b5138','#7a4444','#3f5f78','#78603f','#8a8f9c','#5d3a52','#3a6b52'];
  for(let y=8;y<64;y+=12) for(let x=4;x<256;x+=8){
    if(Math.random()<0.32) continue;
    g.globalAlpha = .5+Math.random()*.5;
    g.fillStyle = pal[(Math.random()*pal.length)|0];
    g.beginPath(); g.arc(x+Math.random()*3, y+Math.random()*3, 2.2, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
});
const ledTex = canvasTex(1024, 128, (g)=>{
  g.fillStyle = '#05080f'; g.fillRect(0,0,1024,128);
  g.font = 'bold 84px Impact,"Microsoft YaHei",sans-serif'; g.textBaseline = 'middle';
  const txt = '乒乓对决 ★ TABLE TENNIS ARENA ★ PING PONG ★ ';
  const w = g.measureText(txt).width, cols = ['#f2b64c','#e03443','#8fd0ff'];
  let x = 0, i = 0;
  while(x < 1024 + w){ g.fillStyle = cols[i%3]; g.fillText(txt, x, 68); x += w; i++; }
});
ledTex.wrapS = THREE.RepeatWrapping; ledTex.repeat.set(1.35, 1);

/* ---------------- 4. 场馆搭建 ---------------- */
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(34,34),
    new THREE.MeshStandardMaterial({ map:floorTex, roughness:.55, metalness:.15 }));
  floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);
  const mat = new THREE.Mesh(new THREE.BoxGeometry(6.6,0.02,4.1),
    new THREE.MeshStandardMaterial({ color:0x8f2126, roughness:.95 }));
  mat.position.y = 0.011; mat.receiveShadow = true; scene.add(mat);
}
{
  const sideMat = new THREE.MeshStandardMaterial({ color:0x0a3a75, roughness:.5 });
  const topMat  = new THREE.MeshStandardMaterial({ map:tableTex, roughness:.32, metalness:.05 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE_W,0.06,TABLE_L),
    [sideMat,sideMat,topMat,sideMat,sideMat,sideMat]);
  top.position.y = TABLE_TOP-0.03; top.castShadow = top.receiveShadow = true; scene.add(top);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(2.5,0.1,1.28),
    new THREE.MeshStandardMaterial({ color:0x16233a, roughness:.6, metalness:.3 }));
  apron.position.y = 0.66; scene.add(apron);
  const legMat = new THREE.MeshStandardMaterial({ color:0x22304a, roughness:.4, metalness:.6 });
  [[-1.15,-0.62],[1.15,-0.62],[-1.15,0.62],[1.15,0.62]].forEach(([x,z])=>{
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,0.71,12), legMat);
    leg.position.set(x,0.375,z); leg.castShadow = true; scene.add(leg);
  });
  [-0.62,0.62].forEach(z=>{
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.3,0.05,0.05), legMat);
    bar.position.set(0,0.3,z); scene.add(bar);
  });
}
{
  const net = new THREE.Mesh(new THREE.PlaneGeometry(NET_LEN, NET_H),
    new THREE.MeshBasicMaterial({ map:netTex, transparent:true, side:THREE.DoubleSide, depthWrite:false }));
  net.position.set(0, TABLE_TOP+NET_H/2, 0); net.renderOrder = 2; scene.add(net);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(NET_LEN,0.014,0.006),
    new THREE.MeshStandardMaterial({ color:0xf4f7fb, roughness:.6 }));
  tape.position.set(0, TABLE_TOP+NET_H-0.007, 0); scene.add(tape);
  const postMat = new THREE.MeshStandardMaterial({ color:0x2a2f3a, roughness:.35, metalness:.8 });
  [-NET_LEN/2, NET_LEN/2].forEach(x=>{
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.017,0.017,0.22,10), postMat);
    p.position.set(x, 0.81, 0); scene.add(p);
  });
}
{
  const dark = new THREE.MeshStandardMaterial({ color:0x171a22, roughness:.9 });
  const face = new THREE.MeshStandardMaterial({ map:crowdTex, emissive:0xffffff,
    emissiveMap:crowdTex, emissiveIntensity:.25, roughness:1 });
  function bleacher(len, rows){
    const grp = new THREE.Group();
    for(let i=0;i<rows;i++){
      const m = new THREE.Mesh(new THREE.BoxGeometry(len,0.5,0.8),
        [dark,dark,dark,dark,face,dark]);
      m.position.set(0, 0.25+i*0.52, -i*0.82); grp.add(m);
    }
    return grp;
  }
  const back = bleacher(12,4); back.position.z = -3.9; scene.add(back);
  const left = bleacher(9,4);  left.rotation.y =  Math.PI/2; left.position.set(-4.6,0,-0.8); scene.add(left);
  const right= bleacher(9,4);  right.rotation.y = -Math.PI/2; right.position.set( 4.6,0,-0.8); scene.add(right);
}
{
  const ledMat = new THREE.MeshBasicMaterial({ map:ledTex });
  function board(w,x,z,ry){
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w,0.55), ledMat);
    m.position.set(x,0.33,z); m.rotation.y = ry; scene.add(m);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w,0.1,0.08),
      new THREE.MeshStandardMaterial({ color:0x0a0c12 }));
    base.position.set(x,0.05,z); base.rotation.y = ry; scene.add(base);
  }
  board(5.4, 0, -2.8, 0);  board(5.4, 0, 3.2, Math.PI);
  board(3.8, -2.7, 0, Math.PI/2); board(3.8, 2.7, 0, -Math.PI/2);
  for(let i=-1;i<=1;i++){
    const f = new THREE.Mesh(new THREE.BoxGeometry(1.7,0.08,0.55),
      new THREE.MeshBasicMaterial({ color:0xfff3dc }));
    f.position.set(i*2.2, 4.15, -0.5); scene.add(f);
  }
}
