// game.js — фикс: явный сброс скорости/флагов при рестарте + защита от отрицательной скорости при беге
// + улучшенная и более надёжная логика показа ending.mp4 (fix for GH Pages zoom/crop issues)

const FRAME_W = 960;
const FRAME_H = 960;

const PR_RUN_FRAME_W = 643;
const PR_RUN_FRAME_H = 960;

const config = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 1600 },
            debug: false
        }
    },
    scene: { preload, create, update }
};

const game = new Phaser.Game(config);

let princess;
let groundGroup;
let zombies;
let bigZombies;
let thrownZombies;
let cursors;
let scoreText;
let levelText;
let victoryText;

let startOverlay;
let startTitleTexts = [];
let controlsText;

let jumpCount = 0;
let score = 0;
let levelScore = 0;
let level = 1;

let gameStarted = false;
let carryingZombie = null;

let dashActive = false;
let dashCooldown = false;
let dashTimer = 0;
let dashCooldownTimer = 0;

const CAMERA_SPEED = 300;
const BASE_PLAYER_SPEED = 300;
const ZOMBIE_SPEED_MULT = 0.85;

let lastGroundX = 0;
let groundLevelY = 640;
let generateGround = true;
let levelTransition = false;

const LEVEL_STEP = 80;
const PLATFORM_LENGTH = 15;

let finalRun = false;
let stopCamera = false;
let victory = false;

let cutscenePlaying = false;
let endingVideo = null;
let endingLeftBar = null;
let endingRightBar = null;
let endingOverlay = null;
let restartPrompt = null;
let restartMode = false;
let endingPlayButton = null;

let scarecrows;
let activeScarecrow = null;
let blockedByScarecrow = false;

let quicksandActive = false;
let quicksandSpeedTimer = 0;
let quicksandSpeedFactor = 1.0;
const QUICKSAND_STEP = 0.1;
const QUICKSAND_INTERVAL = 200;
const QUICKSAND_MIN = 0.3;

const BIG_ZOMBIE_CHANCE = 0.15;
const BIG_ZOMBIE_SPEED_MULT = 1.2;
const BIG_ZOMBIE_NATIVE_W = 120;
const BIG_ZOMBIE_NATIVE_H = 120;

const ACTIVATED_SPEED = BASE_PLAYER_SPEED * 1.8;

const TILE_WIDTH = 256;
const GROUND_NATIVE_W = 256;
const GROUND_NATIVE_H = 47;
const GROUND_DISPLAY_H = Math.round(GROUND_NATIVE_H * (TILE_WIDTH / GROUND_NATIVE_W));

const GROUND_PHYSICS_OFFSET = 25;
const GROUND_PHYSICS_EXTRA_BY_LEVEL = { 1: 8, 2: 0, 3: 6, 4: 6, 5: 0 };
const SHOW_DEBUG_GROUND = false;
const GROUND_KEY_BY_LEVEL = { 1: 'ground1', 2: 'ground2', 3: 'ground3', 4: 'ground4', 5: 'ground5' };

let nextPunch = 0;
let isPunching = false;

// audio container
let sounds = {};

// Персональная таблица громкостей — редактируйте вручную или через методы ниже.
// Значения 0.0 .. 1.0
let soundVolumes = {
    music: 0.5,              // главная тема
    zombie_spawn: 0.2,
    zombie_death: 0.75,
    big_zombie_spawn: 0.5,
    big_zombie_death: 0.5,
    scarecrow_death: 0.3,
    jump: 0.4,
    hit1: 0.3,
    hit2: 0.3,
    dash: 0.75,
    masterSFX: 1.0           // глобальный множитель для всех эффектов
};

function preload() {
    this.load.spritesheet('princess_run', 'assets/princess_run.png', { frameWidth: PR_RUN_FRAME_W, frameHeight: PR_RUN_FRAME_H });
    this.load.spritesheet('zombie_walk', 'assets/zombie_walk.png', { frameWidth: FRAME_W, frameHeight: FRAME_H });
    this.load.spritesheet('princess_carry_anim', 'assets/princess_carry.png', { frameWidth: FRAME_W, frameHeight: FRAME_H });
    this.load.spritesheet('big_zombie_walk', 'assets/big_zombie_walk.png', { frameWidth: FRAME_W, frameHeight: FRAME_H });

    this.load.spritesheet('princess_attack', 'assets/princess_attack.png', { frameWidth: 644, frameHeight: 960 });

    this.load.image('scarecrow', 'assets/scarecrow.png');
    this.load.image('scarecrow_hit', 'assets/scarecrow_hit.png');

    this.load.image('background', 'assets/background.png');
    this.load.image('ground1', 'assets/ground1.png');
    this.load.image('ground2', 'assets/ground2.png');
    this.load.image('ground3', 'assets/ground3.png');
    this.load.image('ground4', 'assets/ground4.png');
    this.load.image('ground5', 'assets/ground5.png');

    // ---- важное: исправлен путь для темы (уберите лишнее .ogv если у вас .ogg) ----
    this.load.audio('s_theme', 'assets/Main_theme.ogg');

    // sound effects (в assets/)
    this.load.audio('s_zombie_spawn', 'assets/zombie.wav');
    this.load.audio('s_zombie_death', 'assets/zombie_death.wav');
    this.load.audio('s_big_zombie_spawn', 'assets/big_zombie.wav');
    this.load.audio('s_big_zombie_death', 'assets/big_zombie_death.wav');
    this.load.audio('s_scarecrow_death', 'assets/scarecrow_death.wav');
    this.load.audio('s_jump', 'assets/jump.wav');
    this.load.audio('s_hit_1', 'assets/hit_1.wav');
    this.load.audio('s_hit_2', 'assets/hit_2.wav');
    this.load.audio('s_dash', 'assets/dash.wav');

    // ending video
    // *** FIX: добавил third param 'canplaythrough' как раньше, оставил mp4 — важно чтобы файл действительно был в assets и доступен.
    this.load.video('ending', 'assets/ending.mp4', 'canplaythrough');
}

function create() {
    // init sound objects and set per-sound volumes from soundVolumes
    try {
        sounds.zombie_spawn = this.sound.add('s_zombie_spawn'); sounds.zombie_spawn.setVolume(soundVolumes.zombie_spawn * soundVolumes.masterSFX);
        sounds.zombie_death = this.sound.add('s_zombie_death'); sounds.zombie_death.setVolume(soundVolumes.zombie_death * soundVolumes.masterSFX);
        sounds.big_zombie_spawn = this.sound.add('s_big_zombie_spawn'); sounds.big_zombie_spawn.setVolume(soundVolumes.big_zombie_spawn * soundVolumes.masterSFX);
        sounds.big_zombie_death = this.sound.add('s_big_zombie_death'); sounds.big_zombie_death.setVolume(soundVolumes.big_zombie_death * soundVolumes.masterSFX);
        sounds.scarecrow_death = this.sound.add('s_scarecrow_death'); sounds.scarecrow_death.setVolume(soundVolumes.scarecrow_death * soundVolumes.masterSFX);
        sounds.jump = this.sound.add('s_jump'); sounds.jump.setVolume(soundVolumes.jump * soundVolumes.masterSFX);
        sounds.hit1 = this.sound.add('s_hit_1'); sounds.hit1.setVolume(soundVolumes.hit1 * soundVolumes.masterSFX);
        sounds.hit2 = this.sound.add('s_hit_2'); sounds.hit2.setVolume(soundVolumes.hit2 * soundVolumes.masterSFX);
        sounds.dash = this.sound.add('s_dash'); sounds.dash.setVolume(soundVolumes.dash * soundVolumes.masterSFX);

        // theme: loop, volume controlled by soundVolumes.music
        sounds.theme = this.sound.add('s_theme', { loop: true, volume: soundVolumes.music });
    } catch (e) {
        console.warn('Audio init failed', e);
    }

    // animations (unchanged)
    this.anims.create({ key: 'princess_run', frames: this.anims.generateFrameNumbers('princess_run', { start: 0, end: 7 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: 'princess_carry', frames: this.anims.generateFrameNumbers('princess_carry_anim', { start: 0, end: 9 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: 'zombie_walk', frames: this.anims.generateFrameNumbers('zombie_walk', { start: 0, end: 16 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: 'big_zombie_walk', frames: this.anims.generateFrameNumbers('big_zombie_walk', { start: 0, end: 9 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'punch_left', frames: this.anims.generateFrameNumbers('princess_attack', { start: 0, end: 1 }), frameRate: 14, repeat: 0 });
    this.anims.create({ key: 'punch_right', frames: this.anims.generateFrameNumbers('princess_attack', { start: 2, end: 3 }), frameRate: 14, repeat: 0 });

    // init game state (unchanged)
    score = 0; levelScore = 0; level = 1;
    groundLevelY = 640; generateGround = true; levelTransition = false;
    finalRun = false; stopCamera = false; victory = false;
    jumpCount = 0; gameStarted = false; carryingZombie = null;
    dashActive = false; dashCooldown = false;
    activeScarecrow = null; blockedByScarecrow = false;
    quicksandActive = false; quicksandSpeedTimer = 0; quicksandSpeedFactor = 1.0;
    cutscenePlaying = false; restartMode = false;
    this._finalRunTriggered = false;
    nextPunch = 0;
    isPunching = false;

    this.physics.world.setBounds(0, 0, 100000, 720);
    this.cameras.main.setBounds(0, 0, 100000, 720);

    this.add.image(0, 0, 'background').setOrigin(0, 0).setScrollFactor(0).setDisplaySize(this.sys.game.config.width, this.sys.game.config.height);

    groundGroup = this.physics.add.staticGroup();

    zombies = this.physics.add.group();
    bigZombies = this.physics.add.group();
    thrownZombies = this.physics.add.group();
    scarecrows = this.physics.add.group();

    for (let i = 0; i < 20; i++) createGroundTile.call(this, i * TILE_WIDTH);

    // создаём принцессу относительно камеры (явно обнуляем скорость и направление)
    const camX = (this.cameras && this.cameras.main) ? this.cameras.main.scrollX : 0;
    princess = this.physics.add.sprite(camX + 300, 500, 'princess_run', 0);
    princess.setDisplaySize(80, 120);
    princess.setDepth(50);
    princess.setFrame(0);
    try {
        if (princess.body) {
            princess.body.setVelocity(0, 0); // важный фикс — обнуляем скорость
            princess.body.setAllowGravity(true);
        }
    } catch (e) {}
    princess.setFlipX(false); // гарантируем направление вправо по умолчанию

    princess.on('animationcomplete', (anim) => {
        if (anim && (anim.key === 'punch_left' || anim.key === 'punch_right')) {
            tryHitScarecrow.call(this);
            isPunching = false;
            // переключаем руку для следующего удара (логика предыдущей реализации)
            nextPunch = (nextPunch === 0) ? 1 : 0;
            if (gameStarted) {
                if (carryingZombie) princess.play('princess_carry'); else princess.play('princess_run');
            } else {
                princess.setFrame(0);
            }
        }
    });

    // collisions / overlaps (unchanged, but sfx triggers remain)
    this.physics.add.collider(princess, groundGroup, (player, tile) => {
        jumpCount = 0;
        if (levelTransition && tile.y < groundLevelY) completeLevelTransition.call(this, tile.y);
    });
    this.physics.add.collider(zombies, groundGroup);
    this.physics.add.collider(scarecrows, groundGroup);
    this.physics.add.collider(bigZombies, groundGroup);
    this.physics.add.collider(princess, zombies, () => { if (!carryingZombie) resetGame.call(this); });
    this.physics.add.collider(princess, bigZombies, () => { resetGame.call(this); });
    this.physics.add.collider(princess, scarecrows, (player, sc) => {
        if (carryingZombie) return;
        activeScarecrow = sc;
        blockedByScarecrow = true;
        princess.x = sc.x - ((sc.displayWidth + princess.displayWidth) / 2 + 2);
        princess.setVelocityX(0);
        princess.setFlipX(false);
        quicksandActive = false; quicksandSpeedTimer = 0;
    });

    this.physics.add.overlap(thrownZombies, zombies, (thrown, normal) => {
        if (thrown && normal) {
            try { thrown.destroy(); normal.destroy(); } catch (e) {}
            try { if (sounds.zombie_death) sounds.zombie_death.play(); } catch (e) {}
            score += 15; levelScore += 15; updateScoreText.call(this);
        }
    });
    this.physics.add.overlap(thrownZombies, scarecrows, (thrown, sc) => {
        if (thrown && sc) {
            try { thrown.destroy(); sc.destroy(); } catch (e) {}
            if (activeScarecrow === sc) activeScarecrow = null;
            blockedByScarecrow = false;
            try { if (sounds.scarecrow_death) sounds.scarecrow_death.play(); } catch (e) {}
            score += 10; levelScore += 10; updateScoreText.call(this);
        }
    });
    this.physics.add.overlap(thrownZombies, bigZombies, (thrown, big) => {
        if (thrown && big) {
            try { thrown.destroy(); if (big.destroy) big.destroy(); } catch (e) {}
            try { if (sounds.big_zombie_death) sounds.big_zombie_death.play(); } catch (e) {}
            score += 15; levelScore += 15; updateScoreText.call(this);
        }
    });

    this.time.addEvent({ delay: 2000, callback: spawnZombie, callbackScope: this, loop: true });
    this.time.addEvent({ delay: 1000, callback: () => {
        if (gameStarted && !victory && !cutscenePlaying && !restartMode) { score++; levelScore++; updateScoreText.call(this); checkLevelTransition.call(this); }
    }, loop: true });

    scoreText = this.add.text(20, 20, "Score: 0", { font: 'bold 36px Arial', fill: '#ffffff' }).setScrollFactor(0);
    //levelText = this.add.text(20, 60, "Level: 1", { fontSize: '28px', fill: '#ffff00' }).setScrollFactor(0);
    //levelText.setVisible(false);
    updateScoreText.call(this);

    victoryText = this.add.text(640, 360, "", { fontSize: '56px', fill: '#00ff00' }).setOrigin(0.5).setScrollFactor(0);
    victoryText.visible = false;

    cursors = this.input.keyboard.createCursorKeys();

    this.input.on('pointerdown', () => {
        if (!gameStarted || victory || cutscenePlaying || restartMode) return;
        if (carryingZombie) { throwZombie.call(this); return; }
        if (activeScarecrow) { startPunch.call(this); return; }
        tryGrabZombie.call(this);
    });

    createStartScreen.call(this);
    this.input.keyboard.once('keydown', () => startGame.call(this));

    // --- keyboard shortcuts for quick volume control / testing ---
    this.input.keyboard.on('keydown-M', () => { try { toggleMusicMute(); } catch (e) {} });
    this.input.keyboard.on('keydown-[', () => { setMusicVolume(Math.max(0, Math.round((soundVolumes.music - 0.1)*10)/10)); });
    this.input.keyboard.on('keydown-]', () => { setMusicVolume(Math.min(1, Math.round((soundVolumes.music + 0.1)*10)/10)); });
    this.input.keyboard.on('keydown-;', () => { setSFXVolume(Math.max(0, Math.round((soundVolumes.masterSFX - 0.1)*10)/10)); });
    this.input.keyboard.on("keydown-'", () => { setSFXVolume(Math.min(1, Math.round((soundVolumes.masterSFX + 0.1)*10)/10)); });
}

function createStartScreen() {
    const w = this.sys.game.config.width; const h = this.sys.game.config.height;
    startOverlay = this.add.rectangle(0, 0, w, h, 0x000000, 0.6).setOrigin(0, 0).setScrollFactor(0).setDepth(200);
    const cx = w/2; const cy = h/2;
    const lines = ["Press", "- ANY KEY -", "to start"]; const baseSize = 56; const gap = 56;
    startTitleTexts = [];
    for (let i=0;i<lines.length;i++){
        const t = this.add.text(cx, cy - gap + i*gap, lines[i], { font: `bold ${baseSize}px Arial`, color: '#ffffff', align: 'center' })
            .setOrigin(0.5).setScrollFactor(0).setDepth(210);
        startTitleTexts.push(t);
    }
    controlsText = this.add.text(cx, cy + 140, "[ SPACE - jump | SHIFT - dash | LMB - punch/grab zombie ]", { font: `bold 20px Arial`, color: '#ffffff', align: 'center' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(210);
}

function startGame() {
    if (startOverlay) { startOverlay.destroy(); startOverlay = null; }
    if (startTitleTexts && startTitleTexts.length) { startTitleTexts.forEach(t => { try { t.destroy(); } catch(e){} }); startTitleTexts = []; }
    if (controlsText) { controlsText.destroy(); controlsText = null; }

    gameStarted = true;
    if (carryingZombie) princess.play('princess_carry'); else princess.play('princess_run');

    // play main theme after user interaction — should allow browsers to play it
    try { if (sounds.theme && !sounds.theme.isPlaying) sounds.theme.play(); } catch (e) { console.warn('Theme play failed', e); }
}

function setMusicVolume(v) {
    v = Math.max(0, Math.min(1, v));
    soundVolumes.music = v;
    try { if (sounds.theme) sounds.theme.setVolume(v); } catch (e) {}
}
function toggleMusicMute() {
    try {
        if (!sounds.theme) return;
        const was = sounds.theme.mute || false;
        sounds.theme.setMute(!was);
    } catch (e) {}
}
function setSFXVolume(v) {
    v = Math.max(0, Math.min(1, v));
    soundVolumes.masterSFX = v;
    try {
        if (sounds.zombie_spawn) sounds.zombie_spawn.setVolume(soundVolumes.zombie_spawn * v);
        if (sounds.zombie_death) sounds.zombie_death.setVolume(soundVolumes.zombie_death * v);
        if (sounds.big_zombie_spawn) sounds.big_zombie_spawn.setVolume(soundVolumes.big_zombie_spawn * v);
        if (sounds.big_zombie_death) sounds.big_zombie_death.setVolume(soundVolumes.big_zombie_death * v);
        if (sounds.scarecrow_death) sounds.scarecrow_death.setVolume(soundVolumes.scarecrow_death * v);
        if (sounds.jump) sounds.jump.setVolume(soundVolumes.jump * v);
        if (sounds.hit1) sounds.hit1.setVolume(soundVolumes.hit1 * v);
        if (sounds.hit2) sounds.hit2.setVolume(soundVolumes.hit2 * v);
        if (sounds.dash) sounds.dash.setVolume(soundVolumes.dash * v);
    } catch (e) {}
}
function setSFXVolumeFor(name, v) {
    v = Math.max(0, Math.min(1, v));
    if (soundVolumes[name] === undefined) { console.warn('Unknown SFX name', name); return; }
    soundVolumes[name] = v;
    try {
        const obj = {
            'zombie_spawn': sounds.zombie_spawn,
            'zombie_death': sounds.zombie_death,
            'big_zombie_spawn': sounds.big_zombie_spawn,
            'big_zombie_death': sounds.big_zombie_death,
            'scarecrow_death': sounds.scarecrow_death,
            'jump': sounds.jump,
            'hit1': sounds.hit1,
            'hit2': sounds.hit2,
            'dash': sounds.dash
        }[name];
        if (obj) obj.setVolume(v * soundVolumes.masterSFX);
    } catch (e) {}
}

function startPunch() {
    if (isPunching) return;
    if (!activeScarecrow) return;
    const dx = activeScarecrow.x - princess.x;
    if (!(dx > 0 && dx < 180)) return;

    isPunching = true;
    princess.setVelocityX(0);

    try {
        if (nextPunch === 0) {
            if (sounds.hit1) sounds.hit1.play();
            princess.play('punch_left');
        } else {
            if (sounds.hit2) sounds.hit2.play();
            princess.play('punch_right');
        }
    } catch (e) {
        if (nextPunch === 0) princess.play('punch_left'); else princess.play('punch_right');
    }
}

function updateScoreText() {
    scoreText.setText("Score: " + score );
    //levelText.setText("Level: " + level);
}

function update(time, delta) {
    if (restartMode) return;
    if (cutscenePlaying) return;
    if (!gameStarted) return;

    const cam = this.cameras.main;
    const screenW = this.sys.game.config.width;

    if (!stopCamera) cam.scrollX += CAMERA_SPEED * (delta / 1000);
    if (victory) return;

    let playerSpeed = BASE_PLAYER_SPEED;
    const onGround = princess.body && princess.body.blocked && princess.body.blocked.down;

    if (level === 3 && onGround && !dashActive && !blockedByScarecrow && !levelTransition && !finalRun && !victory) {
        quicksandActive = true;
        quicksandSpeedTimer += delta;
        if (quicksandSpeedTimer >= QUICKSAND_INTERVAL) {
            quicksandSpeedTimer -= QUICKSAND_INTERVAL;
            quicksandSpeedFactor = Math.max(QUICKSAND_MIN, +(quicksandSpeedFactor - QUICKSAND_STEP).toFixed(2));
        }
    } else quicksandActive = false;

    playerSpeed = Math.floor(playerSpeed * quicksandSpeedFactor);

    if (Phaser.Input.Keyboard.JustDown(cursors.shift) && !dashActive && !dashCooldown) {
        if (Math.abs(quicksandSpeedFactor - 1.0) < 0.001) {
            dashActive = true; dashTimer = 1000;
            try { if (sounds.dash) sounds.dash.play(); } catch (e) {}
        }
    }
    if (dashActive) { playerSpeed *= 2; dashTimer -= delta; if (dashTimer <= 0) { dashActive = false; dashCooldown = true; dashCooldownTimer = 3000; } }
    if (dashCooldown) { dashCooldownTimer -= delta; if (dashCooldownTimer <= 0) dashCooldown = false; }

    if (carryingZombie) playerSpeed = Math.floor(playerSpeed * 0.75);

    if (finalRun && !isPunching) {
        // гарантия положительной скорости при финальном забеге
        princess.setVelocityX(Math.abs(Math.max(BASE_PLAYER_SPEED, 220)));
        if (!princess.anims.isPlaying || (princess.anims.currentAnim && princess.anims.currentAnim.key !== (carryingZombie ? 'princess_carry' : 'princess_run'))) {
            if (carryingZombie) princess.play('princess_carry'); else princess.play('princess_run');
        }
    } else {
        if (blockedByScarecrow && activeScarecrow) {
            const offset = (activeScarecrow.displayWidth + princess.displayWidth) / 2 + 2;
            princess.x = activeScarecrow.x - offset;
            princess.setVelocityX(0);
            princess.setFlipX(false);
        } else {
            if (!isPunching) {
                // защита: гарантируем положительную (вправо) скорость
                princess.setVelocityX(Math.abs(playerSpeed));
            }
        }
    }

    // синхронизация flipX по фактическому vx (подстраховка)
    try {
        if (princess.body && princess.body.velocity) {
            const vx = princess.body.velocity.x;
            if (vx < 0) princess.setFlipX(true);
            else if (vx > 0) princess.setFlipX(false);
        }
    } catch (e) {}

    // move and cleanup enemies (unchanged)...
    zombies.children.iterate(function (zombie) {
        if (!zombie) return;
        const bvx = zombie.body ? zombie.body.velocity.x : (zombie._vx || (-BASE_PLAYER_SPEED * ZOMBIE_SPEED_MULT));
        if (zombie.setFlipX) zombie.setFlipX(bvx > 0);
        if (level === 5) {
            const leftEdge = cam.scrollX + 10; const rightEdge = cam.scrollX + screenW - 10;
            if (zombie.x <= leftEdge && bvx < 0) {
                const newV = ACTIVATED_SPEED; if (zombie.body) zombie.body.setVelocityX(newV); else zombie._vx = newV;
                zombie._activated = true; if (zombie.setFlipX) zombie.setFlipX(true);
            } else if (zombie.x >= rightEdge && bvx > 0) {
                const newV = -ACTIVATED_SPEED; if (zombie.body) zombie.body.setVelocityX(newV); else zombie._vx = newV;
                zombie._activated = true; if (zombie.setFlipX) zombie.setFlipX(false);
            }
        } else { if (zombie.x < cam.scrollX - 200) zombie.destroy(); }
    });

    bigZombies.children.iterate(function (b) {
        if (!b) return;
        const bvx = b.body ? b.body.velocity.x : (b._vx || (-BASE_PLAYER_SPEED * BIG_ZOMBIE_SPEED_MULT));
        if (b.setFlipX) b.setFlipX(bvx > 0);
        if (level === 5) {
            const leftEdge = cam.scrollX + 10; const rightEdge = cam.scrollX + screenW - 10;
            if (b.x <= leftEdge && bvx < 0) {
                const newV = ACTIVATED_SPEED; if (b.body) b.body.setVelocityX(newV); else b._vx = newV;
                b._activated = true; if (b.setFlipX) b.setFlipX(true);
            } else if (b.x >= rightEdge && bvx > 0) {
                const newV = -ACTIVATED_SPEED; if (b.body) b.body.setVelocityX(newV); else b._vx = newV;
                b._activated = true; if (b.setFlipX) b.setFlipX(false);
            }
        } else { if (b.x < cam.scrollX - 200) { if (b.destroy) b.destroy(); } }
    });

    scarecrows.children.iterate(function (sc) {
        if (!sc) return;
        if (sc.x < cam.scrollX - 200) { if (activeScarecrow === sc) activeScarecrow = null; sc.destroy(); blockedByScarecrow = false; }
    });

    thrownZombies.children.iterate(function (z) { if (!z) return; if (z.y > 900) z.destroy(); });

    if (generateGround && cam.scrollX + this.sys.game.config.width > lastGroundX - 500) createGroundTile.call(this, lastGroundX);

    if (!carryingZombie && Phaser.Input.Keyboard.JustDown(cursors.space)) {
        if (jumpCount < 2) {
            try { if (sounds.jump) sounds.jump.play(); } catch (e) {}
            princess.setVelocityY(-650);
            jumpCount++; blockedByScarecrow = false; quicksandSpeedFactor = 1.0; quicksandSpeedTimer = 0; quicksandActive = false;
        }
    }

    const leftCullX = cam.scrollX - 400;
    groundGroup.getChildren().slice().forEach((tile) => {
        if (!tile) return;
        if ((tile.x + TILE_WIDTH) < leftCullX) {
            if (tile._visual && tile._visual.destroy) { try { tile._visual.destroy(); } catch (e) {} }
            if (tile.destroy) { try { tile.destroy(); } catch (e) {} }
        }
    });

    if (finalRun && !cutscenePlaying && !restartMode) {
        const edgeX = cam.scrollX + screenW - 40;
        const offscreenX = cam.scrollX + screenW + 80;
        if (!this._finalRunTriggered && princess.x >= edgeX) {
            this._finalRunTriggered = true;
            stopCamera = true;
            try { if (sounds.theme && sounds.theme.isPlaying) sounds.theme.stop(); } catch (e) {}
        }
        if (this._finalRunTriggered && princess.x >= offscreenX) startEndingCutscene.call(this);
    }

    if (!finalRun && !cutscenePlaying && !restartMode) {
        if (princess.x < cam.scrollX || princess.x > cam.scrollX + this.sys.game.config.width || princess.y > 900) resetGame.call(this);
    }
}

// --- rest of functions: checkLevelTransition, completeLevelTransition, startFinalRun (unchanged) ---
function checkLevelTransition() {
    if (level < 5 && levelScore >= 10 && !levelTransition) {
        levelTransition = true; generateGround = false;
        const startX = lastGroundX; const elevatedY = groundLevelY - LEVEL_STEP; const nextLevel = Math.min(5, level + 1);
        for (let i = 0; i < PLATFORM_LENGTH; i++) { const x = startX + i * TILE_WIDTH; createGroundTile.call(this, x, elevatedY, nextLevel); }
    }
    if (level === 5 && levelScore >= 10 && !finalRun) startFinalRun.call(this);
}
function completeLevelTransition(newY) {
    groundLevelY = newY; level++; levelScore = 0; updateScoreText.call(this);
    //levelText.setText("Level: " + level); 
    generateGround = true; levelTransition = false;
    quicksandActive = false; quicksandSpeedFactor = 1.0; quicksandSpeedTimer = 0;
}
function startFinalRun() {
    finalRun = true; stopCamera = true; generateGround = true; this._finalRunTriggered = false;
    if (carryingZombie) princess.play('princess_carry'); else princess.play('princess_run');
    princess.setVelocityX(Math.abs(Math.max(BASE_PLAYER_SPEED, 220)));
}

// --- ending cutscene (robustified) ---
// *** FIX: improved/resilient layout for video on GH Pages / different browsers
function startEndingCutscene() {
    cutscenePlaying = true; stopCamera = true; generateGround = false;
    try { this.physics.world.pause(); } catch (e) {}
    try { if (sounds.theme && sounds.theme.isPlaying) sounds.theme.stop(); } catch (e) {}
    const w = this.sys.game.config.width; const h = this.sys.game.config.height;
    try { if (endingPlayButton) { endingPlayButton.destroy(); endingPlayButton = null; } } catch (e) {}
    // create Phaser video object
    endingVideo = this.add.video(w/2, h/2, 'ending').setScrollFactor(0).setDepth(1001);
    endingVideo.setOrigin(0.5, 0.5); // *** FIX: ensure origin is centered

    // Ensure underlying HTMLVideoElement is accessible and more robustly handled
    let nativeVideo = null;
    try { nativeVideo = endingVideo.video || null; } catch(e){ nativeVideo = null; }

    // *** FIX: try to allow crossOrigin (some GH Pages setups may need it to read metadata)
    try {
        if (nativeVideo) {
            try { nativeVideo.crossOrigin = 'anonymous'; } catch(e) {}
            // don't force muted here; we'll manage it when playing
        }
    } catch(e){}

    // overlay while we compute layout
    const tempOverlay = this.add.rectangle(0,0,w,h,0x000000,0.85).setOrigin(0,0).setScrollFactor(0).setDepth(1000);

    const finalizeVideoLayout = () => {
        // compute video native size robustly with fallbacks
        let vidW = 1072, vidH = 720; // safe defaults (original design)
        try {
            if (nativeVideo) {
                if (nativeVideo.videoWidth && nativeVideo.videoHeight) {
                    vidW = nativeVideo.videoWidth;
                    vidH = nativeVideo.videoHeight;
                } else if (nativeVideo.width && nativeVideo.height) {
                    vidW = nativeVideo.width;
                    vidH = nativeVideo.height;
                }
            }
        } catch(e){}

        // compute maximum allowed display area (leave small padding)
        const padX = 20; const padY = 20;
        const maxW = Math.max(1, w - padX * 2);
        const maxH = Math.max(1, h - padY * 2);

        // *** FIX: avoid upscaling beyond native video size (prevents "zoom in" effect)
        const scale = Math.min(maxW / vidW, maxH / vidH, 1);

        const displayW = Math.round(vidW * scale);
        const displayH = Math.round(vidH * scale);

        // apply display size and center
        try {
            endingVideo.setDisplaySize(displayW, displayH);
            endingVideo.setPosition(w/2, h/2);
            endingVideo.setOrigin(0.5, 0.5);
        } catch(e){ console.warn('setDisplaySize failed', e); }

        // create black side bars if needed
        try { if (endingLeftBar) endingLeftBar.destroy(); } catch(e){}
        try { if (endingRightBar) endingRightBar.destroy(); } catch(e){}
        const pad = Math.max(0, Math.round((w - displayW)/2));
        if (pad > 0) {
            endingLeftBar = this.add.rectangle(0,0,pad,h,0x000000,1).setOrigin(0,0).setScrollFactor(0).setDepth(1000);
            endingRightBar = this.add.rectangle(w - pad, 0, pad, h, 0x000000, 1).setOrigin(0,0).setScrollFactor(0).setDepth(1000);
        }

        try { tempOverlay.destroy(); } catch(e){}
        let playPromise = null;
        try { playPromise = endingVideo.play(false); } catch(e) { playPromise = null; }

        // If autoplay allowed and playing begins — disable input.
        if (playPromise && typeof playPromise.then === 'function') {
            playPromise.then(()=>{ this.input.enabled = false; }).catch(()=>{ createEndingPlayButton.call(this, displayW, displayH); });
        } else {
            // if native video shows as paused, show play button; else try to lock input
            try {
                if (nativeVideo && nativeVideo.paused) createEndingPlayButton.call(this, displayW, displayH);
                else this.input.enabled = false;
            } catch(e) { createEndingPlayButton.call(this, displayW, displayH); }
        }

        // listen for video end both on Phaser and native element
        try { endingVideo.off('complete'); endingVideo.on('complete', ()=>{ onEndingVideoComplete.call(this); }); } catch(e){}
        try {
            if (nativeVideo && nativeVideo.addEventListener) {
                // remove possible previous to avoid duplicates
                try { nativeVideo.removeEventListener('ended', onEndingVideoCompleteWrapper); } catch(e){}
                nativeVideo.addEventListener('ended', onEndingVideoCompleteWrapperOnce.bind(this), { once: true });
            }
        } catch(e){}
    };

    function onEndingVideoCompleteWrapper(){}
    function onEndingVideoCompleteWrapperOnce(){ onEndingVideoComplete.call(this); }

    // If metadata available now — finalize; otherwise wait for loadedmetadata and use timeout fallback
    try {
        if (nativeVideo && nativeVideo.readyState >= 1 && nativeVideo.videoWidth && nativeVideo.videoHeight) {
            finalizeVideoLayout.call(this);
        } else if (nativeVideo && nativeVideo.addEventListener) {
            nativeVideo.addEventListener('loadedmetadata', ()=>{ try { finalizeVideoLayout.call(this); } catch(e){ finalizeVideoLayout.call(this); } }, { once: true });
            // fallback: if metadata doesn't fire quickly, try again shortly
            this.time.delayedCall(600, ()=>{ try { if (endingVideo && endingVideo.video && endingVideo.video.videoWidth) finalizeVideoLayout.call(this); } catch(e){ finalizeVideoLayout.call(this); } });
        } else {
            // no native video element accessible — just finalize with defaults after short delay
            this.time.delayedCall(100, ()=> finalizeVideoLayout.call(this));
        }
    } catch(e){
        // last resort
        this.time.delayedCall(100, ()=> finalizeVideoLayout.call(this));
    }
}

function createEndingPlayButton(displayW, displayH) {
    const w = this.sys.game.config.width; const h = this.sys.game.config.height;
    try { if (endingPlayButton) endingPlayButton.destroy(); } catch(e){}
    const panel = this.add.rectangle(w/2, h/2 + displayH/2 + 36, 480, 72, 0x000000, 0.7).setOrigin(0.5).setScrollFactor(0).setDepth(1200);
    const btnText = this.add.text(w/2, h/2 + displayH/2 + 36, "Click to play cutscene with sound", { fontSize: '22px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(1201);
    btnText.setInteractive({ useHandCursor: true });
    panel.setInteractive(new Phaser.Geom.Rectangle(-240, -36, 480, 72), Phaser.Geom.Rectangle.Contains);
    endingPlayButton = this.add.container(0,0,[panel, btnText]).setDepth(1200);

    const startWithSound = () => {
        try { endingPlayButton.list.forEach(i => i.disableInteractive && i.disableInteractive()); } catch(e){}
        this.input.enabled = false;
        try { if (endingVideo && endingVideo.video) { endingVideo.video.muted = false; try { endingVideo.video.volume = 1.0; } catch(e){} } } catch(e){}
        try {
            const p = endingVideo.play(false);
            if (p && typeof p.then === 'function') {
                p.then(()=>{ try{ endingPlayButton.destroy(); endingPlayButton = null; } catch(e){} }).catch(()=>{ this.input.enabled = true; try{ if (endingPlayButton) endingPlayButton.list.forEach(i => i.setInteractive && i.setInteractive()); } catch(e){} });
            } else { try{ endingPlayButton.destroy(); endingPlayButton = null; } catch(e){} }
        } catch(e){ this.input.enabled = true; try{ if (endingPlayButton) endingPlayButton.list.forEach(i => i.setInteractive && i.setInteractive()); } catch(e){} }
    };
    panel.on('pointerdown', startWithSound); btnText.on('pointerdown', startWithSound);
}
function onEndingVideoComplete() {
    try { if (endingVideo) { endingVideo.stop(); endingVideo.destroy(); } } catch(e){}
    try { if (endingLeftBar) endingLeftBar.destroy(); } catch(e){}
    try { if (endingRightBar) endingRightBar.destroy(); } catch(e){}
    endingVideo = null; endingLeftBar = null; endingRightBar = null;
    try { if (endingPlayButton) { endingPlayButton.destroy(); endingPlayButton = null; } } catch(e){}
    const w = this.sys.game.config.width; const h = this.sys.game.config.height;
    endingOverlay = this.add.rectangle(0,0,w,h,0x000000,0.6).setOrigin(0,0).setScrollFactor(0).setDepth(1100);
    restartPrompt = this.add.text(w/2, h/2, "Press - ANY KEY - to restart", { fontSize:'48px', color:'#ffffff', fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(1110);
    restartMode = true; this.input.enabled = true;
    this.input.keyboard.once('keydown', ()=>{ resetGame.call(this); });
}

function tryGrabZombie() {
    let radius = 220;
    zombies.children.iterate((zombie) => {
        if (!zombie) return;
        let dx = zombie.x - princess.x; let dy = zombie.y - princess.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < radius && dx > 0) {
            carryingZombie = zombie; zombies.remove(zombie, true, false); try { zombie.destroy(); } catch(e){}
            princess.play('princess_carry');
        }
    });
}

function throwZombie() {
    if (!carryingZombie) return;
    carryingZombie = null; princess.play('princess_run');
    const spawnX = princess.x + 80;
    const dummy = this.physics.add.sprite(0,0,'zombie_walk',0).setDisplaySize(100,100);
    const spawnY = groundLevelY - (dummy.displayHeight / 2);
    dummy.destroy();
    const thrown = this.physics.add.sprite(spawnX, spawnY, 'zombie_walk', 0);
    thrown.setDisplaySize(100,100); if (thrown.play) thrown.play('zombie_walk');
    thrownZombies.add(thrown);
    const throwForce = 900;
    thrown.setVelocityX(CAMERA_SPEED + throwForce);
    thrown.setVelocityY(-300);
}

function createGroundTile(x, forcedY, levelForTile) {
    const physY = (typeof forcedY === 'number') ? forcedY : groundLevelY;
    const lvl = (typeof levelForTile === 'number') ? levelForTile : level;
    const key = GROUND_KEY_BY_LEVEL[lvl] || 'ground1';
    const extra = (GROUND_PHYSICS_EXTRA_BY_LEVEL && GROUND_PHYSICS_EXTRA_BY_LEVEL[lvl]) ? GROUND_PHYSICS_EXTRA_BY_LEVEL[lvl] : 0;
    const totalPhysicsOffset = GROUND_PHYSICS_OFFSET + extra;
    const visualY = physY - totalPhysicsOffset;
    const visual = this.add.image(x, visualY, key); visual.setOrigin(0,0); visual.setDisplaySize(TILE_WIDTH, GROUND_DISPLAY_H); visual.setDepth(0);
    let tile = groundGroup.create(x, physY, key);
    tile.setOrigin(0,0); tile.setDisplaySize(TILE_WIDTH, GROUND_DISPLAY_H); tile.refreshBody();
    if (tile.body && tile.body.setSize) { try { tile.body.setSize(TILE_WIDTH, GROUND_DISPLAY_H); tile.body.setOffset(0,0); } catch(e){} }
    tile.visible = false; tile._visual = visual;
    tile.on('destroy', ()=>{ if (tile._visual && tile._visual.destroy) try{ tile._visual.destroy(); }catch(e){} });
    lastGroundX = x + TILE_WIDTH;
    if (SHOW_DEBUG_GROUND) {
        const g = this.add.graphics().setScrollFactor(1);
        g.lineStyle(2, 0x00ff00, 1); g.strokeRect(x, visualY, TILE_WIDTH, 2);
        g.lineStyle(2, 0xff0000, 1); g.strokeRect(x, physY, TILE_WIDTH, 2);
        tile._debugGraphic = g;
        tile.on('destroy', ()=>{ if (tile._debugGraphic && tile._debugGraphic.destroy) try{ tile._debugGraphic.destroy(); }catch(e){} });
    }
}

function spawnZombie() {
    if (!gameStarted || levelTransition || finalRun || victory || activeScarecrow || cutscenePlaying) return;
    let spawnX = this.cameras.main.scrollX + 1400;
    if ((level === 4 || level === 5) && Math.random() < BIG_ZOMBIE_CHANCE) {
        const bigSpawnY = groundLevelY - (BIG_ZOMBIE_NATIVE_H / 2);
        let b = bigZombies.create(spawnX, bigSpawnY, 'big_zombie_walk', 0);
        b.setDisplaySize(BIG_ZOMBIE_NATIVE_W, BIG_ZOMBIE_NATIVE_H);
        if (b.body) { b.body.setSize(b.displayWidth, b.displayHeight); b.body.setOffset(0,0); b.body.setAllowGravity(false); b.body.setImmovable(true); b.body.setVelocityX(-BASE_PLAYER_SPEED * BIG_ZOMBIE_SPEED_MULT); b._activated = false; } else { b._vx = -BASE_PLAYER_SPEED * BIG_ZOMBIE_SPEED_MULT; b._activated = false; }
        if (b.play) b.play('big_zombie_walk'); if (b.setFlipX) b.setFlipX(false);
        try { if (sounds.big_zombie_spawn) sounds.big_zombie_spawn.play(); } catch(e){}
        return;
    }
    if (level >= 2 && Math.random() < 0.30) {
        let sc = scarecrows.create(spawnX, groundLevelY - 60, 'scarecrow');
        sc.setDisplaySize(80,100); sc.hp = 5;
        if (sc.body) sc.body.setVelocityX(-BASE_PLAYER_SPEED * 0.5); else sc.setVelocityX && sc.setVelocityX(-BASE_PLAYER_SPEED * 0.5);
        activeScarecrow = sc;
    } else {
        let zombie = zombies.create(spawnX, 0, 'zombie_walk', 0);
        zombie.setDisplaySize(100,100); zombie.y = groundLevelY - (zombie.displayHeight / 2);
        if (zombie.body) { zombie.body.setAllowGravity(false); zombie.body.setVelocityX(-BASE_PLAYER_SPEED * ZOMBIE_SPEED_MULT); zombie._activated = false; } else { zombie._vx = -BASE_PLAYER_SPEED * ZOMBIE_SPEED_MULT; zombie._activated = false; }
        if (zombie.play) zombie.play('zombie_walk'); if (zombie.setFlipX) zombie.setFlipX(false);
        try { if (sounds.zombie_spawn) sounds.zombie_spawn.play(); } catch(e){}
    }
}

function tryHitScarecrow() {
    if (!activeScarecrow) return;
    const dx = activeScarecrow.x - princess.x;
    if (dx > 0 && dx < 140) {
        const sc = activeScarecrow;
        try { if (sc.setTexture) sc.setTexture('scarecrow_hit'); this.time.delayedCall(120, ()=>{ try{ if (sc && sc.active && sc.setTexture) sc.setTexture('scarecrow'); }catch(e){} }); } catch(e){}
        sc.hp--; score += 1; levelScore += 1; updateScoreText.call(this);
        if (sc.hp <= 0) {
            try { if (sounds.scarecrow_death) sounds.scarecrow_death.play(); } catch (e){}
            sc.destroy(); activeScarecrow = null; blockedByScarecrow = false;
            score += 5; levelScore += 5; updateScoreText.call(this);
        }
    }
}

function resetGame() {
    // Полный явный сброс всех флагов/состояний чтобы не перенести "хвосты"
    cutscenePlaying = false;
    restartMode = false;
    finalRun = false;
    stopCamera = false;
    victory = false;
    isPunching = false;
    blockedByScarecrow = false;
    activeScarecrow = null;
    carryingZombie = null;
    dashActive = false;
    dashCooldown = false;
    quicksandActive = false;
    quicksandSpeedTimer = 0;
    quicksandSpeedFactor = 1.0;
    this._finalRunTriggered = false;
    nextPunch = 0;

    // если есть физическое тело принцессы — остановим его и выставим направление вправо
    try {
        if (princess && princess.body) {
            princess.body.setVelocity(0,0);
            princess.setFlipX(false);
        }
    } catch (e) {}

    // сброс положения генерации земли и камера
    lastGroundX = 0;
    try { this.cameras.main.setScroll(0, 0); this.cameras.main.scrollX = 0; } catch (e) {}

    try { this.physics.world.resume(); } catch(e){}
    try { if (sounds.theme && sounds.theme.isPlaying) sounds.theme.stop(); } catch(e){}

    // если есть открытое видео, убрать его
    try { if (endingVideo) { endingVideo.stop(); endingVideo.destroy(); endingVideo = null; } } catch(e){}
    try { if (endingLeftBar) endingLeftBar.destroy(); } catch(e){}
    try { if (endingRightBar) endingRightBar.destroy(); } catch(e){}
    try { if (endingPlayButton) endingPlayButton.destroy(); endingPlayButton = null; } catch(e){}
    try { if (endingOverlay) endingOverlay.destroy(); endingOverlay = null; } catch(e){}
    try { if (restartPrompt) restartPrompt.destroy(); restartPrompt = null; } catch(e){}

    // Перезапускаем сцену
    this.scene.restart();
}