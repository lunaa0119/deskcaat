const { AnimationPlayer } = require('./animation-player.js');
const { MoodModel } = require('./mood-model.js');
const { BehaviorController } = require('./behavior-controller.js');
const { Mover } = require('./mover.js');
const { AudioManager } = require('./audio-manager.js');
const { createInputHandler } = require('./input-handler.js');
const { SPRITES, CLIPS } = require('./sprite-config.js');
const { makeBrowserAudio } = require('./browser-audio.js');
const { ipcRenderer } = require('electron');

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const debug = document.getElementById('debug');
// Setting canvas.width/height resets context state, so (re)apply crisp pixel
// scaling inside resize — otherwise the upscaled sprite would look blurry.
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.imageSmoothingEnabled = false;
}
resize(); window.addEventListener('resize', resize);

// Load sprite sheet images
const images = {};
for (const [key, s] of Object.entries(SPRITES.sheets)) {
  const img = new Image(); img.src = s.src; images[key] = img;
}

const bounds = { w: window.innerWidth, h: window.innerHeight };
const footprint = { w: 64, h: 64 };
const mood = new MoodModel();
const behavior = new BehaviorController({ rng: Math.random });
const player = new AnimationPlayer(CLIPS);
const mover = new Mover({ x: bounds.w / 2, y: bounds.h - 80, speed: 70, bounds, footprint });
const audio = new AudioManager({ player: makeBrowserAudio(0.7), cooldownMs: 60000 });

let lastState = behavior.update('content', null, 0);
player.play(lastState.anim);

// Input
const inputQueue = [];
const getCatRect = () => ({ x: mover.x, y: mover.y, w: footprint.w, h: footprint.h });
createInputHandler(
  canvas,
  getCatRect,
  (ev) => inputQueue.push(ev),
  (over) => ipcRenderer.send('cat:hover', over)
);

// Tray actions + mute from the main process
ipcRenderer.on('cat:action', (_e, action) => inputQueue.push({ type: action }));
ipcRenderer.on('cat:mute', (_e, m) => audio.setMuted(m));

const particles = []; // floating emoji effects (hearts, food, zzz)
let zzzTimer = 0;
let decisionTimer = 0;
// Seek attention continuously when happiness is below 40.
let interactionPause = 0;
let wasFollowing = false;
let pointer = null;
let dragging = false;
canvas.addEventListener('mousemove', (event) => {
  pointer = { x: event.clientX, y: event.clientY };
});
let prev = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  const clock = new Date();

  // drain one input per frame (priority over autonomous decisions)
  const input = inputQueue.shift() || null;
  if (input) {
    if (input.type === 'drag-start') dragging = true;
    if (input.type === 'drag-end') dragging = false;
    if (input.type !== 'drag-move') {
      interactionPause = 2.5;
    }
    if (input.type === 'drag-move') { mover.x = input.x - footprint.w / 2; mover.y = input.y - footprint.h / 2; }
    if (input.type === 'pet') { mood.pet(); spawnHearts(); }
    if (input.type === 'feed') { mood.feed(); spawnFood(); }
    if (input.type === 'play') mood.play();
    if (input.type === 'sleep') mood.energy = Math.min(mood.energy, 15);
  }

  interactionPause = Math.max(0, interactionPause - dt);
  const pointerInside = pointer && pointer.x >= 0 && pointer.y >= 0
    && pointer.x <= bounds.w && pointer.y <= bounds.h;
  const following = mood.happiness < 40 && !dragging
    && interactionPause === 0 && !!pointerInside;
  if (wasFollowing && !following) decisionTimer = 0;
  wasFollowing = following;

  // Decide behavior ~ every 2.5s, or immediately on a forcing input
  decisionTimer -= dt;
  const forcing = !!input && ['drag-start', 'drag-end', 'feed', 'play', 'pet', 'sleep'].includes(input.type);
  if (!dragging && (forcing || (!following && decisionTimer <= 0))) {
    const m = mood.dominantMood(clock);
    lastState = behavior.update(m, forcing ? input : null, dt);
    player.play(lastState.anim);
    audio.cue(lastState.sound);
    // 0.5% per calm decision; repeated sounds are limited to once per minute.
    if (!forcing && (lastState.name === 'WANDER' || lastState.name === 'SIT') && Math.random() < 0.005) {
      audio.cue('meow');
    }
    decisionTimer = 2.5;
    if (lastState.name === 'WANDER') {
      const p = mover.randomWanderPoint();
      mover.setTarget(p.x, p.y);
    }
  }

  if (following) {
    // Stop short of the pointer so the cat does not cover what you are clicking.
    const dx = pointer.x - (mover.x + footprint.w / 2);
    const dy = pointer.y - (mover.y + footprint.h / 2);
    const distance = Math.hypot(dx, dy);
    if (distance > 90) {
      mover.setTarget(pointer.x - dx / distance * 90 - footprint.w / 2,
        pointer.y - dy / distance * 90 - footprint.h / 2);
      mover.update(dt);
      if (player.name !== 'walk') player.play('walk');
      lastState = { name: 'FOLLOW', anim: 'walk', sound: null, moodState: 'active' };
    } else {
      if (player.name !== 'sit') player.play('sit');
      lastState = { name: 'FOLLOW', anim: 'sit', sound: null, moodState: 'resting' };
    }
  }

  // Advance mood with the behavior's activity state
  mood.tick(dt, clock, lastState.moodState);

  // Movement only while wandering
  if (!following && !dragging && lastState.name === 'WANDER') mover.update(dt);
  player.update(dt);

  // Floating Zzz while asleep (every ~1.4s)
  if (lastState.name === 'SLEEP') {
    zzzTimer -= dt;
    if (zzzTimer <= 0) { spawnZzz(); zzzTimer = 1.4; }
  } else {
    zzzTimer = 0;
  }

  render(dt);
  debug.textContent = `${lastState.name} | H${mood.hunger | 0} E${mood.energy | 0} J${mood.happiness | 0}`;
  requestAnimationFrame(frame);
}

// Generic floating-emoji particle. Drifts up and fades out.
function spawnParticle(char, o = {}) {
  particles.push({
    x: mover.x + (o.dx ?? footprint.w / 2),
    y: mover.y + (o.dy ?? 0),
    char,
    vx: o.vx ?? 0,
    vy: o.vy ?? -30,
    size: o.size ?? 20,
    life: o.life ?? 1,
    maxLife: o.life ?? 1,
  });
}
function spawnHearts() {
  for (let i = 0; i < 2; i++) {
    spawnParticle('❤️', { dx: footprint.w / 2 + (Math.random() * 20 - 10), vy: -35, life: 1, size: 18 });
  }
}
function spawnFood() {
  spawnParticle('🍖', { dx: footprint.w / 2, dy: 6, vy: -24, life: 1.4, size: 24 });
}
function spawnZzz() {
  spawnParticle('💤', { dx: footprint.w * 0.62, dy: 6, vx: 10, vy: -18, life: 1.6, size: 18 });
}

function render(dt) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const clip = SPRITES.clips[lastState.anim] || SPRITES.clips.idle;
  const sheet = SPRITES.sheets[clip.sheet];
  const img = images[clip.sheet];
  const f = player.currentFrame();
  if (img && img.complete && img.naturalWidth > 0) {
    const sx = ((clip.col || 0) + f) * sheet.frameW;
    const sy = clip.row * sheet.frameH;
    ctx.save();
    // The bundled side-view art faces RIGHT; mirror it only when moving left.
    if (mover.facing === -1) {
      ctx.translate(mover.x + footprint.w, mover.y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, sheet.frameW, sheet.frameH, 0, 0, footprint.w, footprint.h);
    } else {
      ctx.drawImage(img, sx, sy, sheet.frameW, sheet.frameH, mover.x, mover.y, footprint.w, footprint.h);
    }
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(255,170,90,.9)';
    ctx.fillRect(mover.x, mover.y, footprint.w, footprint.h); // fallback block until art loads
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.font = `${p.size}px serif`;
    ctx.fillText(p.char, p.x, p.y);
    ctx.globalAlpha = 1;
  }
}

requestAnimationFrame(frame);
