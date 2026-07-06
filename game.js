/**
 * Rima's Birthday Sky Adventure - game.js
 * Core game loop, canvas rendering, asset processing, audio synthesis, and transitions.
 */

// Game Configuration
const CONFIG = {
  gravity: 0.22,         // Gravity pulling the plane down
  jumpImpulse: -5.2,     // Upward boost when tapping/pressing Space
  horizontalSpeed: 3.0,  // Base speed of the scrolling background and obstacles
  cloudWidth: 100,       // Obstacle cloud bounding width
  cloudGap: 220,         // Gap between top and bottom obstacles (increased from 180 for easier play)
  minCloudHeight: 50,    // Min height of obstacle clouds
  cloudInterval: 150,    // Generation interval of obstacle clouds in frames
  targetDistance: 1500,  // Total distance in km to reach Rima Land (approx 45 seconds of play)
  planeX: 150,           // X position of the plane on canvas
  assets: {
    plane: 'assets/images/rima_plane.png',
    photos: [
      'assets/images/rima1.png',
      'assets/images/rima2.png'
    ],
    customAudio: 'assets/audio/bg-soundtrack.m4a'
  }
};

// Game State Definitions
const STATES = {
  INTRO: 'INTRO',
  VIDEO_INTRO: 'VIDEO_INTRO',
  PLAYING: 'PLAYING',
  GAMEOVER: 'GAMEOVER',
  LANDING: 'LANDING',
  VIDEO_ENDING: 'VIDEO_ENDING',
  WIN: 'WIN'
};

// Audio Controller using Web Audio API and HTML5 Audio fallback
class AudioController {
  constructor() {
    this.ctx = null;
    this.bgm = null; // Custom audio element for mp3
    this.synthBgmNode = null; // Node for synth music
    this.muted = false;
    this.isBgmPlaying = false;
    this.customBgmLoaded = false;
  }

  init() {
    if (this.ctx) return;
    
    // Create AudioContext
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      this.ctx = new AudioContextClass();
    }
    
    // Pre-load custom audio/voiceover if it exists
    this.bgm = new Audio();
    this.bgm.src = CONFIG.assets.customAudio;
    this.bgm.loop = true;
    this.bgm.volume = 0.5;

    // Check if custom audio file exists by testing fetch
    fetch(CONFIG.assets.customAudio, { method: 'HEAD' })
      .then(response => {
        if (response.ok) {
          this.customBgmLoaded = true;
          console.log("Custom audio/voiceover found! Ready to play.");
        } else {
          console.log("No custom audio file found. Falling back to synthesized background music.");
        }
      })
      .catch(() => {
        console.log("Error loading custom audio. Using synthesized background music.");
      });
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      if (this.customBgmLoaded && this.bgm) {
        this.bgm.pause();
      }
      this.stopSynthBgm();
    } else {
      if (gameState.state === STATES.PLAYING) {
        this.playBgm();
      }
    }
    return this.muted;
  }

  playBgm() {
    if (this.muted) return;
    this.init();
    
    if (this.customBgmLoaded) {
      this.bgm.play().catch(err => {
        console.warn("Could not autoplay custom audio: ", err);
        this.startSynthBgm(); // Fallback to synth if custom play fails
      });
      this.isBgmPlaying = true;
    } else {
      this.startSynthBgm();
    }
  }

  stopBgm() {
    if (this.bgm) {
      this.bgm.pause();
      this.bgm.currentTime = 0;
    }
    this.stopSynthBgm();
    this.isBgmPlaying = false;
  }

  // Synthesize custom retro sound effects
  playJump() {
    if (this.muted || !this.ctx) return;
    this.resumeContext();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(500, this.ctx.currentTime + 0.15);
    
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  playScore() {
    if (this.muted || !this.ctx) return;
    this.resumeContext();

    const now = this.ctx.currentTime;
    // Cute dual chime sound
    const frequencies = [523.25, 659.25]; // C5 and E5
    frequencies.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);
      
      gain.gain.setValueAtTime(0.1, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.05 + 0.3);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.35);
    });
  }

  playCrash() {
    if (this.muted || !this.ctx) return;
    this.resumeContext();

    // Noise crash explosion
    const bufferSize = this.ctx.sampleRate * 0.5; // 0.5 seconds
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Fill buffer with white noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(100, this.ctx.currentTime + 0.4);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
    
    noiseNode.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    noiseNode.start();
    noiseNode.stop(this.ctx.currentTime + 0.5);
  }

  playWin() {
    if (this.muted || !this.ctx) return;
    this.resumeContext();

    const now = this.ctx.currentTime;
    // Sweet C Major Arpeggio chime sequence
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C4, E4, G4, C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const timeOffset = idx * 0.12;
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + timeOffset);
      
      gain.gain.setValueAtTime(0.12, now + timeOffset);
      gain.gain.exponentialRampToValueAtTime(0.005, now + timeOffset + 0.6);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(now + timeOffset);
      osc.stop(now + timeOffset + 0.7);
    });
  }

  // Cute romantic ambient track synthesized in real time
  startSynthBgm() {
    if (this.synthBgmNode || !this.ctx || this.muted) return;
    
    this.resumeContext();
    this.synthBgmActive = true;
    
    const playBar = () => {
      if (!this.synthBgmActive) return;
      const now = this.ctx.currentTime;
      // Soft pentatonic romantic progression: C major / A minor feel
      const progression = [
        [261.63, 329.63, 392.00, 523.25], // C Major
        [293.66, 349.23, 440.00, 587.33], // D Minor
        [220.00, 261.63, 329.63, 440.00], // A Minor
        [349.23, 440.00, 523.25, 698.46]  // F Major
      ];
      
      let chordIndex = 0;
      const playNote = (chordIdx, noteIdx, time) => {
        if (!this.synthBgmActive) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(progression[chordIdx][noteIdx], time);
        
        // Soft volume envelope
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.04, time + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.8);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(time);
        osc.stop(time + 0.9);
      };

      // Schedule notes in a loop
      let time = now;
      for (let bar = 0; bar < 4; bar++) {
        const chord = bar;
        // Play arpeggio
        playNote(chord, 0, time);
        playNote(chord, 1, time + 0.25);
        playNote(chord, 2, time + 0.5);
        playNote(chord, 3, time + 0.75);
        
        playNote(chord, 2, time + 1.0);
        playNote(chord, 1, time + 1.25);
        
        time += 1.5;
      }
      
      // Queue next bar sequence
      this.synthBgmTimeout = setTimeout(playBar, 6000);
    };

    playBar();
  }

  stopSynthBgm() {
    this.synthBgmActive = false;
    if (this.synthBgmTimeout) {
      clearTimeout(this.synthBgmTimeout);
      this.synthBgmTimeout = null;
    }
  }

  resumeContext() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
}

// Global Game State
const gameState = {
  state: STATES.INTRO,
  score: 0,
  distance: CONFIG.targetDistance,
  progress: 0,
  plane: {
    y: 0,
    vy: 0,
    width: 90,
    height: 90,
    angle: 0
  },
  obstacles: [],
  particles: [],
  stars: [], // Background stars
  parallaxLayers: [
    { x: 0, speed: 0.2, clouds: [] }, // Far slow
    { x: 0, speed: 0.8, clouds: [] }  // Medium
  ],
  frameCount: 0,
  landingProgress: 0, // Cutscene landing frame count
  images: {
    plane: null,
    photos: []
  },
  isLoaded: false
};

// Setup Audio
const audioController = new AudioController();

// Canvas & Engine Elements
let canvas = null;
let ctx = null;

// Initialize when window loads
window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  loadAssets();
  setupUIEventListeners();
  setupGameInput();

  // Create initial stars and parallax cloud decorations
  initDecorations();

  // Start animation loop
  requestAnimationFrame(gameLoop);
});

// Resize Canvas to fit screen
function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
  
  // Re-adjust plane initial height
  if (gameState.state === STATES.INTRO || gameState.state === STATES.VIDEO_INTRO) {
    gameState.plane.y = canvas.height / 2;
  }
}

// Load Images and perform background transparent processing
function loadAssets() {
  let loadedCount = 0;
  const totalAssets = 1 + CONFIG.assets.photos.length;

  const checkAllLoaded = () => {
    loadedCount++;
    if (loadedCount === totalAssets) {
      gameState.isLoaded = true;
      console.log("All graphic assets loaded successfully.");
    }
  };

  // 1. Load Plane Sprite and process transparency
  const planeImg = new Image();
  planeImg.src = CONFIG.assets.plane;
  planeImg.onload = () => {
    gameState.images.plane = processPlaneTransparency(planeImg);
    checkAllLoaded();
  };
  planeImg.onerror = () => {
    console.error("Error loading plane sprite. Using fallback vector representation.");
    checkAllLoaded();
  };

  // 2. Load Rima's Photos
  CONFIG.assets.photos.forEach((src, index) => {
    const photoImg = new Image();
    photoImg.src = src;
    photoImg.onload = () => {
      gameState.images.photos.push(photoImg);
      checkAllLoaded();
    };
    photoImg.onerror = () => {
      console.warn(`Error loading photo: ${src}. Drawing heart fallback.`);
      checkAllLoaded();
    };
  });
}

/**
 * Clean White Background from Sprite dynamically!
 * Loops through pixels and makes near-white values transparent.
 */
function processPlaneTransparency(img) {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = img.naturalWidth;
  tempCanvas.height = img.naturalHeight;
  const tempCtx = tempCanvas.getContext('2d');
  
  tempCtx.drawImage(img, 0, 0);
  const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const data = imgData.data;

  // Filter pixels
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i+1];
    const b = data[i+2];
    
    // If pixel color is close to white, make it transparent
    if (r > 240 && g > 240 && b > 240) {
      data[i+3] = 0; // Alpha
    }
  }
  
  tempCtx.putImageData(imgData, 0, 0);
  return tempCanvas; // Return as drawable canvas element
}

// Setup background stars & initial clouds
function initDecorations() {
  gameState.stars = [];
  // Random stars
  for (let i = 0; i < 60; i++) {
    gameState.stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.7,
      size: Math.random() * 2 + 1,
      opacity: Math.random() * 0.5 + 0.3,
      twinkleSpeed: 0.01 + Math.random() * 0.02,
      twinkleDir: 1
    });
  }

  // Parallax clouds
  gameState.parallaxLayers.forEach((layer) => {
    layer.clouds = [];
    const count = layer.speed < 0.5 ? 4 : 3;
    for (let i = 0; i < count; i++) {
      layer.clouds.push({
        x: (i * (canvas.width / count)) + Math.random() * 100,
        y: Math.random() * (canvas.height * 0.6) + 50,
        width: 100 + Math.random() * 120,
        height: 40 + Math.random() * 40
      });
    }
  });
}

// Setup Event Listeners for UI interaction
function setupUIEventListeners() {
  // Screen 1: Start Game Story
  document.getElementById('btn-start-story').addEventListener('click', () => {
    audioController.init();
    transitionToState(STATES.VIDEO_INTRO);
  });

  // --- Video Controls ---
  const introVid = document.getElementById('video-intro');
  const introFb = document.getElementById('video-intro-fallback');
  const btnPlayIntro = document.getElementById('btn-play-intro-video');
  const btnSkipIntro = document.getElementById('btn-skip-intro-video');

  const endingVid = document.getElementById('video-ending');
  const endingFb = document.getElementById('video-ending-fallback');
  const btnPlayEnding = document.getElementById('btn-play-ending-video');
  const btnSkipEnding = document.getElementById('btn-skip-ending-video');

  // Video event generic setups helper
  function setupVideoController(videoEl, fallbackEl, playBtn, skipBtn, onComplete) {
    // Adjust aspect-ratio dynamically to match the actual video dimensions once loaded
    videoEl.addEventListener('loadedmetadata', () => {
      const width = videoEl.videoWidth;
      const height = videoEl.videoHeight;
      if (width && height) {
        const wrapper = videoEl.closest('.video-container-wrapper');
        if (wrapper) {
          wrapper.style.aspectRatio = `${width} / ${height}`;
        }
      }
    });

    // Attempt play when play button is clicked
    playBtn.addEventListener('click', () => {
      if (videoEl.paused) {
        videoEl.play()
          .then(() => {
            playBtn.innerText = "Pause Video ⏸️";
            fallbackEl.classList.add('hidden');
          })
          .catch(err => {
            console.warn("Playback failed, showing fallback: ", err);
            fallbackEl.classList.remove('hidden');
          });
      } else {
        videoEl.pause();
        playBtn.innerText = "Play Video ▶️";
      }
    });

    // If video starts playing normally (e.g. autoplay or controls), hide fallback
    videoEl.addEventListener('play', () => {
      fallbackEl.classList.add('hidden');
      playBtn.innerText = "Pause Video ⏸️";
    });

    videoEl.addEventListener('pause', () => {
      playBtn.innerText = "Play Video ▶️";
    });

    // Handle end of video
    videoEl.addEventListener('ended', onComplete);

    // If video encounters an error (missing file), show fallback UI
    videoEl.addEventListener('error', () => {
      console.log("Video source failed to load, displaying premium CSS fallback.");
      fallbackEl.classList.remove('hidden');
    });

    // Skip button directly calls completion
    skipBtn.addEventListener('click', () => {
      videoEl.pause();
      onComplete();
    });
  }

  // Setup Intro Video Controller
  setupVideoController(introVid, introFb, btnPlayIntro, btnSkipIntro, () => {
    transitionToState(STATES.PLAYING);
  });

  // Setup Ending Video Controller
  setupVideoController(endingVid, endingFb, btnPlayEnding, btnSkipEnding, () => {
    transitionToState(STATES.WIN);
  });

  // Audio Toggle
  document.getElementById('btn-audio-toggle').addEventListener('click', () => {
    const isMuted = audioController.toggleMute();
    const btn = document.getElementById('btn-audio-toggle');
    const iconOn = btn.querySelector('.icon-on');
    const iconOff = btn.querySelector('.icon-off');

    if (isMuted) {
      iconOn.classList.add('hidden');
      iconOff.classList.remove('hidden');
    } else {
      iconOn.classList.remove('hidden');
      iconOff.classList.add('hidden');
    }
  });

  // Game Over Retry
  document.getElementById('btn-retry').addEventListener('click', () => {
    resetGame();
    transitionToState(STATES.PLAYING);
  });

  // Gift Envelope Open
  const envelope = document.getElementById('gift-envelope');
  envelope.addEventListener('click', () => {
    const wrapper = envelope.parentElement;
    if (!wrapper.classList.contains('open')) {
      wrapper.classList.add('open');
      audioController.playWin();
      
      // Delay boarding pass popping up a little bit for effect
      setTimeout(() => {
        const modal = document.getElementById('ticket-modal');
        modal.classList.add('active');
      }, 900);
    }
  });

  // Close Ticket Modal
  document.getElementById('btn-close-ticket').addEventListener('click', () => {
    document.getElementById('ticket-modal').classList.remove('active');
  });
}

// Input mechanisms for flying
function setupGameInput() {
  // Tap/Click to jump
  canvas.addEventListener('mousedown', (e) => {
    if (gameState.state === STATES.PLAYING) {
      planeJump();
    }
  });

  canvas.addEventListener('touchstart', (e) => {
    if (gameState.state === STATES.PLAYING) {
      e.preventDefault(); // Stop double taps zooming on mobile
      planeJump();
    }
  }, { passive: false });

  // Key press
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault(); // Avoid scrolling the browser
      if (gameState.state === STATES.PLAYING) {
        planeJump();
      }
    }
    // Keyboard cheat code: press 'c' / 'C' key during game to instantly trigger win/landing
    if ((e.key === 'c' || e.key === 'C') && gameState.state === STATES.PLAYING) {
      gameState.distance = 0;
      console.log("Cheat code activated via keyboard: skipping to landing sequence!");
    }
  });

  // Tap/Click cheat code: Click/Tap "🛫 START" 3 times during gameplay to instantly trigger win/landing
  let startClickCount = 0;
  const startBtn = document.getElementById('hud-start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (gameState.state === STATES.PLAYING) {
        startClickCount++;
        if (startClickCount >= 3) {
          gameState.distance = 0;
          startClickCount = 0;
          console.log("Cheat code activated via UI: skipping to landing sequence!");
        }
      }
    });
  }
}

// Trigger jump
function planeJump() {
  gameState.plane.vy = CONFIG.jumpImpulse;
  audioController.playJump();
  
  // Emit visual ring or heart smoke particle on jump
  createHeartSparkle(gameState.plane.y + gameState.plane.height/2, true);
}

// Visual state management transitions
function transitionToState(newState) {
  gameState.state = newState;
  
  // Hide all screens initially
  document.querySelectorAll('.overlay-screen').forEach(scr => scr.classList.remove('active'));
  document.getElementById('hud').classList.add('hidden');

  switch(newState) {
    case STATES.INTRO:
      document.getElementById('screen-intro').classList.add('active');
      break;
    case STATES.VIDEO_INTRO:
      document.getElementById('screen-video-intro').classList.add('active');
      // Pre-load/play intro video if allowed, otherwise show fallback
      const introVid = document.getElementById('video-intro');
      if (introVid) {
        introVid.load();
        introVid.play().catch(() => {
          document.getElementById('video-intro-fallback').classList.remove('hidden');
        });
      }
      break;
    case STATES.PLAYING:
      document.getElementById('hud').classList.remove('hidden');
      audioController.playBgm();
      break;
    case STATES.GAMEOVER:
      document.getElementById('screen-gameover').classList.add('active');
      document.getElementById('summary-score').innerText = gameState.score;
      document.getElementById('summary-progress').innerText = Math.round(gameState.progress) + "%";
      audioController.stopBgm();
      break;
    case STATES.LANDING:
      document.getElementById('screen-landing').classList.add('active');
      audioController.stopBgm();
      break;
    case STATES.VIDEO_ENDING:
      document.getElementById('screen-video-ending').classList.add('active');
      // Pre-load/play ending video if allowed, otherwise show fallback
      const endingVid = document.getElementById('video-ending');
      if (endingVid) {
        endingVid.load();
        endingVid.play().catch(() => {
          document.getElementById('video-ending-fallback').classList.remove('hidden');
        });
      }
      break;
    case STATES.WIN:
      document.getElementById('screen-win').classList.add('active');
      audioController.playWin();
      // Generate gorgeous celebration particles
      for (let i = 0; i < 150; i++) {
        createCelebrationParticle();
      }
      break;
  }
}

// Restart game loop stats
function resetGame() {
  gameState.score = 0;
  gameState.distance = CONFIG.targetDistance;
  gameState.progress = 0;
  
  gameState.plane.y = canvas.height / 2;
  gameState.plane.vy = 0;
  gameState.plane.angle = 0;
  
  gameState.obstacles = [];
  gameState.particles = [];
  gameState.frameCount = 0;
  gameState.landingProgress = 0;

  // Update HUD values
  document.getElementById('hud-score').innerText = gameState.score;
  document.getElementById('hud-distance').innerText = gameState.distance + " km";
  document.getElementById('progress-fill').style.width = "0%";
  document.getElementById('progress-plane').style.left = "0%";
}

// MAIN ANIMATION LOOP
function gameLoop() {
  update();
  render();
  requestAnimationFrame(gameLoop);
}

// ENGINE UPDATE LOGIC
function update() {
  gameState.frameCount++;

  // 1. Always update background decoration stars & parallax
  updateStarsAndLayers();

  // 2. State-Specific updates
  if (gameState.state === STATES.PLAYING) {
    updatePlayingPhysics();
  } else if (gameState.state === STATES.LANDING) {
    updateLandingSequence();
  }

  // 3. Always update particles (engine trails, sparks, confetti)
  updateParticles();
}

// Stars twinkling & clouds scrolling
function updateStarsAndLayers() {
  // Stars
  gameState.stars.forEach(star => {
    star.opacity += star.twinkleSpeed * star.twinkleDir;
    if (star.opacity > 0.85) star.twinkleDir = -1;
    if (star.opacity < 0.2) star.twinkleDir = 1;
  });

  // Parallax layers (scroll at different rates)
  const isMoving = gameState.state === STATES.PLAYING || gameState.state === STATES.LANDING;
  const speedScale = gameState.state === STATES.LANDING ? (1 - gameState.landingProgress / 200) : 1;

  gameState.parallaxLayers.forEach((layer) => {
    if (isMoving) {
      layer.x -= CONFIG.horizontalSpeed * layer.speed * speedScale;
    }
    
    layer.clouds.forEach(cloud => {
      if (isMoving) {
        cloud.x -= CONFIG.horizontalSpeed * layer.speed * speedScale;
      }
      // Wrap around screen
      if (cloud.x + cloud.width < -50) {
        cloud.x = canvas.width + 50 + Math.random() * 100;
        cloud.y = Math.random() * (canvas.height * 0.6) + 50;
      }
    });
  });
}

// Physics & collision detection during playing
function updatePlayingPhysics() {
  const plane = gameState.plane;

  // Apply Gravity
  plane.vy += CONFIG.gravity;
  plane.y += plane.vy;

  // Calculate rotation angle based on velocity
  plane.angle = Math.min(Math.PI / 6, Math.max(-Math.PI / 8, plane.vy * 0.05));

  // Check top and bottom boundaries
  if (plane.y < 0) {
    plane.y = 0;
    plane.vy = 0;
  }
  if (plane.y + plane.height > canvas.height - 20) {
    triggerCrash();
    return;
  }

  // Emit plane engine puff smoke (trail)
  if (gameState.frameCount % 5 === 0) {
    gameState.particles.push({
      x: CONFIG.planeX - 5,
      y: plane.y + plane.height / 2 + (Math.random() * 8 - 4),
      vx: -(CONFIG.horizontalSpeed + Math.random() * 1),
      vy: Math.random() * 0.5 - 0.25,
      size: Math.random() * 8 + 5,
      color: 'rgba(255, 255, 255, 0.45)',
      opacity: 0.6,
      decay: 0.015,
      isHeart: Math.random() < 0.35 // 35% heart smoke trail!
    });
  }

  // Distance / Progress Counter
  // Count down distance by flying (decremented relative to previous value so cheat codes persist)
  if (gameState.frameCount % 5 === 0) {
    gameState.distance = Math.max(0, gameState.distance - 3);
  }
  gameState.progress = ((CONFIG.targetDistance - gameState.distance) / CONFIG.targetDistance) * 100;

  // Update HUD elements
  document.getElementById('hud-score').innerText = gameState.score;
  document.getElementById('hud-distance').innerText = gameState.distance + " km";
  document.getElementById('progress-fill').style.width = gameState.progress + "%";
  document.getElementById('progress-plane').style.left = gameState.progress + "%";

  // Landing sequence trigger
  if (gameState.distance <= 0) {
    transitionToState(STATES.LANDING);
    return;
  }

  // Obstacle Generation
  if (gameState.frameCount % CONFIG.cloudInterval === 0) {
    generateObstacleCloud();
  }

  // Update Obstacles
  for (let i = gameState.obstacles.length - 1; i >= 0; i--) {
    const obs = gameState.obstacles[i];
    obs.x -= CONFIG.horizontalSpeed;

    // Check collision
    if (checkCollision(plane, obs)) {
      triggerCrash();
      return;
    }

    // Check score trigger (plane passed obstacle)
    if (!obs.passed && obs.x + CONFIG.cloudWidth < CONFIG.planeX) {
      obs.passed = true;
      gameState.score++;
      audioController.playScore();
      // Burst star particles
      createHeartSparkle(plane.y + plane.height/2, false);
    }

    // Remove off-screen obstacles
    if (obs.x + CONFIG.cloudWidth < -100) {
      gameState.obstacles.splice(i, 1);
    }
  }
}

// Generate obstacle pair
function generateObstacleCloud() {
  const buffer = CONFIG.minCloudHeight;
  const canvasHeight = canvas.height;
  const gapY = Math.random() * (canvasHeight - CONFIG.cloudGap - buffer * 2) + buffer;

  // Retrieve an image index (cycled based on total number of obstacles generated)
  const imageIndex = gameState.obstacles.length % 2; 

  gameState.obstacles.push({
    x: canvas.width,
    topCloudHeight: gapY,
    bottomCloudY: gapY + CONFIG.cloudGap,
    passed: false,
    imageIdx: imageIndex
  });
}

// AABB bounding box collision check
function checkCollision(plane, obs) {
  // Plane hitbox (tighter than rendering size for highly forgiving gameplay)
  const pBox = {
    left: CONFIG.planeX + 24,
    right: CONFIG.planeX + gameState.plane.width - 24,
    top: gameState.plane.y + 20,
    bottom: gameState.plane.y + gameState.plane.height - 20
  };

  // Top Obstacle Cloud Box
  const topCloudBox = {
    left: obs.x,
    right: obs.x + CONFIG.cloudWidth,
    top: 0,
    bottom: obs.topCloudHeight
  };

  // Bottom Obstacle Cloud Box
  const bottomCloudBox = {
    left: obs.x,
    right: obs.x + CONFIG.cloudWidth,
    top: obs.bottomCloudY,
    bottom: canvas.height
  };

  // Check box overlapping
  const hitsTop = (pBox.right > topCloudBox.left && pBox.left < topCloudBox.right && pBox.bottom > topCloudBox.top && pBox.top < topCloudBox.bottom);
  const hitsBottom = (pBox.right > bottomCloudBox.left && pBox.left < bottomCloudBox.right && pBox.bottom > bottomCloudBox.top && pBox.top < bottomCloudBox.bottom);

  return hitsTop || hitsBottom;
}

// Crash details
function triggerCrash() {
  audioController.playCrash();
  
  // Large heart / spark explosion
  for (let i = 0; i < 40; i++) {
    gameState.particles.push({
      x: CONFIG.planeX + gameState.plane.width / 2,
      y: gameState.plane.y + gameState.plane.height / 2,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      size: Math.random() * 10 + 4,
      color: i % 2 === 0 ? '#ff577f' : '#ff7eb3',
      opacity: 1,
      decay: 0.02,
      isHeart: Math.random() < 0.4
    });
  }

  transitionToState(STATES.GAMEOVER);
}

// Landing cinematic movement
function updateLandingSequence() {
  gameState.landingProgress++;
  const plane = gameState.plane;
  
  // 1. Clear out remaining obstacles
  gameState.obstacles.forEach(obs => {
    obs.x -= CONFIG.horizontalSpeed * (1 - gameState.landingProgress / 150);
  });

  // 2. Slow down and level out the plane
  const landingDuration = 180; // 3 seconds at 60fps
  const targetLandingY = canvas.height - plane.height - 40; // Ground height

  if (gameState.landingProgress < landingDuration) {
    // Smooth interpolation to landing ground Y
    const t = gameState.landingProgress / landingDuration;
    
    // Ease-in-out curve
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    plane.y = (canvas.height / 2) + (targetLandingY - (canvas.height / 2)) * ease;
    plane.angle = (0.05 * (1 - t)); // level plane
    
    // Engine puffs slow down
    if (gameState.frameCount % 10 === 0) {
      gameState.particles.push({
        x: CONFIG.planeX - 5,
        y: plane.y + plane.height / 2,
        vx: -CONFIG.horizontalSpeed * (1 - t),
        vy: Math.random() * 0.2 - 0.1,
        size: Math.random() * 6 + 3,
        color: 'rgba(255, 255, 255, 0.3)',
        opacity: 0.5,
        decay: 0.02,
        isHeart: false
      });
    }
  } else {
    // Plane is on runway, rolling to stop
    plane.y = targetLandingY;
    plane.angle = 0;

    // Wheel touch-down tiny smoke puffs
    if (gameState.landingProgress === landingDuration) {
      // Sparkles burst on wheels touch!
      for (let i = 0; i < 15; i++) {
        gameState.particles.push({
          x: CONFIG.planeX + 15,
          y: plane.y + plane.height,
          vx: -(2 + Math.random() * 3),
          vy: -(Math.random() * 2),
          size: Math.random() * 3 + 2,
          color: '#cbd5e1',
          opacity: 0.8,
          decay: 0.03,
          isHeart: false
        });
      }
    }

    // Stop scrolling entirely and transition to Win screen
    if (gameState.landingProgress > landingDuration + 60) {
      transitionToState(STATES.VIDEO_ENDING);
    }
  }
}

// Particle System
function updateParticles() {
  for (let i = gameState.particles.length - 1; i >= 0; i--) {
    const p = gameState.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.opacity -= p.decay;

    // Apply gravity to heavy particles like confetti
    if (p.gravity) {
      p.vy += p.gravity;
    }

    if (p.opacity <= 0) {
      gameState.particles.splice(i, 1);
    }
  }
}

// Create particles when scoring/flapping
function createHeartSparkle(yPos, isFlap = false) {
  const count = isFlap ? 3 : 15;
  const spread = isFlap ? 2 : 5;
  
  for (let i = 0; i < count; i++) {
    gameState.particles.push({
      x: CONFIG.planeX + (isFlap ? 0 : 50),
      y: yPos,
      vx: isFlap ? -(1 + Math.random() * 2) : (Math.random() - 0.2) * spread,
      vy: (Math.random() - 0.5) * spread,
      size: Math.random() * 8 + 3,
      color: isFlap ? 'rgba(255, 255, 255, 0.4)' : (i % 2 === 0 ? '#ff758c' : '#ffd0d9'),
      opacity: 1.0,
      decay: isFlap ? 0.04 : 0.02,
      isHeart: !isFlap || Math.random() < 0.5
    });
  }
}

// Win celebration confetti
function createCelebrationParticle() {
  const colors = ['#f5af19', '#ffe066', '#ff577f', '#ff7eb3', '#4fc3f7', '#81c784', '#ba68c8'];
  gameState.particles.push({
    x: Math.random() * canvas.width,
    y: -10 - Math.random() * 100,
    vx: (Math.random() - 0.5) * 4,
    vy: Math.random() * 2 + 1,
    gravity: 0.05,
    size: Math.random() * 10 + 6,
    color: colors[Math.floor(Math.random() * colors.length)],
    opacity: 1.0,
    decay: 0.003,
    isHeart: Math.random() < 0.35,
    rotation: Math.random() * 360,
    rotSpeed: (Math.random() - 0.5) * 4
  });
}

// RENDER GAME VIEWS
function render() {
  // 1. Draw Sky Gradient
  drawSkyBackground();

  // 2. Draw Twinkling Stars
  drawStars();

  // 3. Draw Parallax Clouds
  drawParallaxClouds();

  // 4. State-Specific graphics
  if (gameState.state === STATES.PLAYING) {
    drawObstacles();
  } else if (gameState.state === STATES.LANDING) {
    drawObstacles();
    drawRunway();
  }

  // 5. Draw Plane
  drawPlane();

  // 6. Draw Particles
  drawParticles();
}

// Gradient representing Sunset/Evening sky
function drawSkyBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  // Dreamy cutesy cotton candy transition
  grad.addColorStop(0, '#ffccd5'); // Soft pink
  grad.addColorStop(0.4, '#f3e8ff'); // Pastel lavender
  grad.addColorStop(0.7, '#c084fc'); // Light purple
  grad.addColorStop(1, '#bae6fd'); // Soft sky blue
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Background stars drawing
function drawStars() {
  gameState.stars.forEach(star => {
    ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Drawing decorative background parallax layers
function drawParallaxClouds() {
  gameState.parallaxLayers.forEach((layer) => {
    // Different opacity for distance feeling
    ctx.fillStyle = layer.speed < 0.5 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.15)';
    
    layer.clouds.forEach(cloud => {
      drawPuffyCloud(cloud.x, cloud.y, cloud.width, cloud.height);
    });
  });
}

// Puffy vector cloud drawer helper
function drawPuffyCloud(x, y, w, h) {
  ctx.beginPath();
  const r = h / 2;
  ctx.arc(x + r, y + r, r, Math.PI * 0.5, Math.PI * 1.5);
  ctx.arc(x + r + w * 0.25, y + r * 0.6, r * 1.3, Math.PI * 1.0, Math.PI * 1.85);
  ctx.arc(x + r + w * 0.6, y + r * 0.5, r * 1.5, Math.PI * 1.3, Math.PI * 2.1);
  ctx.arc(x + r + w * 0.85, y + r, r, Math.PI * 1.6, Math.PI * 2.5);
  ctx.lineTo(x + r, y + h);
  ctx.closePath();
  ctx.fill();
}

// Drawing game obstacles (storm/memory clouds)
function drawObstacles() {
  gameState.obstacles.forEach(obs => {
    // 1. Draw Top Cloud Pillar
    drawObstacleCloudPillar(obs.x, 0, obs.topCloudHeight, true, obs.imageIdx);

    // 2. Draw Bottom Cloud Pillar
    drawObstacleCloudPillar(obs.x, obs.bottomCloudY, canvas.height - obs.bottomCloudY, false, obs.imageIdx);
  });
}

// Draws top/bottom cloud obstacles hosting Rima's photos
function drawObstacleCloudPillar(x, y, height, isTop, imageIdx) {
  ctx.save();

  // Create a subtle pink/white gradient for memory clouds
  const cloudGrad = ctx.createLinearGradient(x, y, x + CONFIG.cloudWidth, y + height);
  cloudGrad.addColorStop(0, '#ffffff');
  cloudGrad.addColorStop(0.5, '#ffd1dc'); // Cotton candy pink center
  cloudGrad.addColorStop(1, '#ffafbd'); // Soft pink cloud base
  ctx.fillStyle = cloudGrad;

  // Add shadow blur for magical glow
  ctx.shadowColor = 'rgba(232, 121, 249, 0.4)';
  ctx.shadowBlur = 12;

  // Draw main pillar connector shape
  ctx.fillRect(x + 20, y, CONFIG.cloudWidth - 40, height);

  // Draw cloud puffs at the tip opening
  const puffY = isTop ? y + height - 25 : y;
  ctx.beginPath();
  ctx.arc(x + 25, puffY + 15, 30, 0, Math.PI * 2);
  ctx.arc(x + 50, puffY + 5, 35, 0, Math.PI * 2);
  ctx.arc(x + 75, puffY + 15, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0; // Turn off shadows for clip

  // Draw Photo Frame inside the Cloud opening
  // Circle frame details
  const frameX = x + CONFIG.cloudWidth / 2;
  const frameY = isTop ? y + height - 55 : y + 55;
  const radius = 32;

  // Draw frame border
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.fillStyle = '#ff758c';
  ctx.beginPath();
  ctx.arc(frameX, frameY, radius + 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fill();

  // Try clipping and drawing photo
  const photoImg = gameState.images.photos[imageIdx];
  if (photoImg && photoImg.complete && photoImg.naturalWidth > 0) {
    ctx.beginPath();
    ctx.arc(frameX, frameY, radius, 0, Math.PI * 2);
    ctx.clip();

    // Center crop drawing
    const aspect = photoImg.width / photoImg.height;
    let dw, dh;
    if (aspect > 1) {
      dh = radius * 2;
      dw = dh * aspect;
    } else {
      dw = radius * 2;
      dh = dw / aspect;
    }
    ctx.drawImage(photoImg, frameX - dw / 2, frameY - dh / 2, dw, dh);
  } else {
    // If no image is available, draw a cute heart instead
    ctx.fillStyle = '#ffffff';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('❤️', frameX, frameY);
  }

  ctx.restore();
}

// Landing Runway drawing helper
function drawRunway() {
  const runwayY = canvas.height - 40;
  
  // 1. Green fields landscape at bottom
  ctx.fillStyle = '#15803d'; // Rich forest green grass
  ctx.fillRect(0, runwayY, canvas.width, 40);

  // 2. Runway black asphalt
  ctx.fillStyle = '#334155'; // Dark grey asphalt
  ctx.fillRect(0, runwayY + 10, canvas.width, 22);

  // 3. Yellow centerline stripes
  ctx.fillStyle = '#eab308'; // Bright runway yellow
  const dashWidth = 30;
  const gap = 20;
  const offset = (gameState.landingProgress * CONFIG.horizontalSpeed * (1 - gameState.landingProgress / 180)) % (dashWidth + gap);

  for (let sx = canvas.width - offset; sx > -dashWidth; sx -= (dashWidth + gap)) {
    ctx.fillRect(sx, runwayY + 20, dashWidth, 3);
  }
}

// Plane rendering (sprite or vector fallback)
function drawPlane() {
  ctx.save();
  const plane = gameState.plane;

  // Center translation for rotation
  ctx.translate(CONFIG.planeX + plane.width / 2, plane.y + plane.height / 2);
  ctx.rotate(plane.angle);

  const img = gameState.images.plane;
  if (img) {
    // Draw the transparent processed sprite
    ctx.drawImage(img, -plane.width / 2, -plane.height / 2, plane.width, plane.height);
  } else {
    // FALLBACK VECTOR DRAWING: if plane image fails to load
    // Cute vector red plane
    ctx.fillStyle = '#ff4d4d'; // Red fuselage
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff'; // White wing
    ctx.beginPath();
    ctx.ellipse(-4, -4, 6, 16, Math.PI/12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#333'; // Propeller cap
    ctx.beginPath();
    ctx.arc(22, 0, 6, 0, Math.PI * 2);
    ctx.fill();

    // Propeller blades line
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(22, -18);
    ctx.lineTo(22, 18);
    ctx.stroke();

    // Cartoon pilot emoji inside window
    ctx.font = '16px sans-serif';
    ctx.fillText('👩‍✈️', -2, -2);
  }

  ctx.restore();
}

// Draw active particles (confetti, trails, hearts)
function drawParticles() {
  gameState.particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = p.color;

    if (p.isHeart) {
      // Draw Heart Particle vector
      ctx.beginPath();
      const px = p.x;
      const py = p.y;
      const s = p.size * 0.6;
      ctx.moveTo(px, py + s / 4);
      ctx.quadraticCurveTo(px, py, px - s / 2, py);
      ctx.quadraticCurveTo(px - s, py, px - s, py + s / 2);
      ctx.quadraticCurveTo(px - s, py + s, px, py + s * 1.4);
      ctx.quadraticCurveTo(px + s, py + s, px + s, py + s / 2);
      ctx.quadraticCurveTo(px + s, py, px + s / 2, py);
      ctx.quadraticCurveTo(px, py, px, py + s / 4);
      ctx.closePath();
      ctx.fill();
    } else if (p.rotation !== undefined) {
      // Rotated rectangular confetti
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation * Math.PI / 180);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      p.rotation += p.rotSpeed;
    } else {
      // Default circular puff/star
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  });
}
