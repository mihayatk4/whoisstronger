/* Sound, synthesised in the browser (no audio files, no music rights to worry about).

   Packs:
     "classic" is the chosen pack (config.soundPack); the others are kept but hidden.
     "mix"     — arcade blips playing the "theme" hook
     "theme"   — one musical hook for the whole game: each fight
                 plays a question, a right pick plays the answer. No music.
     "signal"  — exact-note electronic signals
     "soft"    — clean UI sounds
     "classic" — short arcade blips (the original sounds), no music
     "epic"    — cinematic effects + quiet background score: low drone,
                 taiko drums and a tense string ostinato in D minor.
   The epic score follows the screen: calm in menus, fuller in a fight, heavy
   drums in the boss fight. It ducks under big moments (reveal, win, lose).

   Events: tap, hit(side), vs, boss, win({level, boss, run}), partial, lose,
   correct, wrong, flips(list), hint, solve(points), points(points),
   slide(value), roll(ms), tick(i), done(score), logo.

   W.sound.play(name, arg)   effect
   W.sound.setScene(name)    "menu" | "fight" | "boss" | "guess" | "quiet"
   W.sound.setPack(name)     "mix" | "theme" | "signal" | "soft" | "classic" | "epic"
   W.sound.refresh()         call after the sound on/off setting changes */
(function () {
  const W = window.WIS;
  let ctx = null, master = null, sfxBus = null, musicBus = null, verb = null;

  // the player's own choice only counts while the switch is shown
  const pack = () => ((W.config.showPackSwitch && W.store.settings.soundPack) || W.config.soundPack || "classic");
  const on = () => !!W.store.settings.sound;

  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.6;
      // gentle glue so stacked layers don't clip
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
      master.connect(comp); comp.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
      verb = makeVerb(); verb.out.connect(master);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  /* simple hall reverb from a decaying noise impulse */
  function makeVerb() {
    const len = Math.floor(ctx.sampleRate * 2.6);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = ctx.createConvolver(); conv.buffer = buf;
    const inp = ctx.createGain(); inp.gain.value = 0.35;
    const out = ctx.createGain(); out.gain.value = 0.55;
    inp.connect(conv); conv.connect(out);
    return { in: inp, out };
  }

  // ---------- building blocks ----------
  function env(g, t0, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  function tone(freq, at, dur, type, vol, slideTo, bus, wet) {
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    env(g, t0, 0.012, vol || 0.15, dur);
    o.connect(g); g.connect(bus || sfxBus);
    if (wet) g.connect(verb.in);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(at, dur, vol, cutoff, bus, type) {
    const t0 = ctx.currentTime + at;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type || "lowpass"; f.frequency.value = cutoff || 1200;
    const g = ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(bus || sfxBus);
    src.start(t0);
  }
  /* brass / string pad: detuned saws through a filter that opens up */
  function swell(freqs, at, dur, vol, cutFrom, cutTo, bus, wet) {
    const t0 = ctx.currentTime + at;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.Q.value = 2;
    f.frequency.setValueAtTime(cutFrom, t0);
    f.frequency.exponentialRampToValueAtTime(cutTo, t0 + dur * 0.35);
    f.frequency.exponentialRampToValueAtTime(Math.max(200, cutFrom), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.25, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    f.connect(g); g.connect(bus || sfxBus);
    if (wet !== false) g.connect(verb.in);
    freqs.forEach((fr) => [-7, 7].forEach((det) => {
      const o = ctx.createOscillator(); o.type = "sawtooth";
      o.frequency.value = fr; o.detune.value = det;
      o.connect(f); o.start(t0); o.stop(t0 + dur + 0.05);
    }));
  }
  /* taiko / timpani: pitch-dropping sine + skin noise */
  function drum(at, vol, top, bottom, bus, len) {
    const t0 = ctx.currentTime + at, d = len || 0.45;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(top || 140, t0);
    o.frequency.exponentialRampToValueAtTime(bottom || 48, t0 + d * 0.6);
    env(g, t0, 0.004, vol, d);
    o.connect(g); g.connect(bus || sfxBus); g.connect(verb.in);
    o.start(t0); o.stop(t0 + d + 0.05);
    noise(at, 0.08, vol * 0.5, 1800, bus);
  }
  /* the cinematic "braaam" */
  function braam(at, root, vol, dur) {
    swell([root, root * 1.5, root * 2], at, dur || 2.2, vol, 180, 1400);
    drum(at, vol * 1.6, 90, 32, sfxBus, 1.2);
    noise(at, 1.2, vol * 0.5, 260);
  }
  const N = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  // ---------- music ducking ----------
  function duck(level, back) {
    if (!musicBus || !musicTarget) return;
    const t = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setTargetAtTime(musicTarget * level, t, 0.06);
    musicBus.gain.setTargetAtTime(musicTarget, t + (back || 1.6), 0.5);
  }

  // ---------- effect packs ----------
  const classic = {
    tap() { tone(540, 0, 0.06, "triangle", 0.18); },
    hit() { noise(0, 0.2, 0.6, 900); tone(150, 0, 0.25, "sine", 0.6, 42); },
    tick(i) { tone(420 + (i || 0) * 62, 0, 0.055, "square", 0.05); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.085, 0.16, "square", 0.11)); tone(1568, 0.34, 0.3, "triangle", 0.1); },
    partial() { tone(440, 0, 0.14, "square", 0.1); tone(554, 0.11, 0.2, "square", 0.1); },
    lose() { tone(320, 0, 0.16, "sawtooth", 0.1, 220); tone(210, 0.15, 0.34, "sawtooth", 0.1, 95); },
    /* boss fight: an arcade "warning" build-up, about 1.6 s (same as the banner).
       A bass pulse speeds up and gets louder, chromatic stabs climb over it,
       a two-tone alarm and a rising sweep join. No boom at the end. */
    boss() {
      const pulses = [];
      let t = 0;
      for (let i = 0; i < 12; i++) {
        pulses.push(t);
        tone(N(33), t, 0.09, "square", 0.05 + i * 0.006);   // A1 pulse
        tone(N(45), t, 0.07, "triangle", 0.08 + i * 0.006); // A2 body
        t += 0.125 - i * 0.005;                              // a little faster each beat
      }
      const end = t;
      // chromatic stabs climbing every second beat: A3 B♭3 B3 C4 C♯4 D4
      [57, 58, 59, 60, 61, 62].forEach((m, i) => {
        tone(N(m), pulses[i * 2], 0.08, "square", 0.05 + i * 0.01);
        tone(N(m + 6), pulses[i * 2] + 0.02, 0.06, "square", 0.025 + i * 0.006); // tritone above: tension
      });
      // two-tone alarm in the second half
      for (let i = 0; i < 4; i++) tone(N(i % 2 ? 75 : 69), 0.62 + i * 0.16, 0.14, "triangle", 0.04 + i * 0.01);
      tone(N(45), 0.1, end - 0.1, "sawtooth", 0.035, N(81)); // rising sweep
      // no final hit: it just builds up and stops
    },
    hint() { tone(660, 0, 0.07, "triangle", 0.16); tone(990, 0.07, 0.1, "triangle", 0.13); },
    wrong() { tone(170, 0, 0.2, "square", 0.13, 110); },
    /* slider guessed to the percent: jackpot. A fast run up two octaves,
       a bright chord with a high ring, then coins raining down. */
    perfect() {
      [440, 554, 659, 880, 1109, 1319, 1760].forEach((f, i) => tone(f, i * 0.05, 0.12, "square", 0.09));
      [880, 1109, 1319, 1760].forEach((f) => tone(f, 0.38, 0.7, "triangle", 0.07));
      tone(3520, 0.38, 0.6, "triangle", 0.045);
      for (let k = 0; k < 6; k++) {
        const at = 0.8 + k * 0.13, v = 0.05 - k * 0.006;
        tone(1976, at, 0.05, "square", v);
        tone(2637, at + 0.05, 0.12, "square", v);
      }
    },
    correct() { [659, 784, 988, 1319].forEach((f, i) => tone(f, i * 0.09, 0.2, "square", 0.11)); tone(1976, 0.38, 0.35, "triangle", 0.09); },
    done() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.24, "triangle", 0.15)); }
  };

  const epic = {
    // a soft wooden knock
    tap() { tone(220, 0, 0.07, "sine", 0.22, 140); noise(0, 0.03, 0.12, 2500, sfxBus, "bandpass"); },
    // the pick lands: a deep cinematic hit with a whoosh
    hit() {
      duck(0.35, 1.4);
      noise(0, 0.35, 0.18, 3200, sfxBus, "highpass");
      drum(0.02, 0.9, 120, 30, sfxBus, 0.9);
      tone(55, 0.02, 0.9, "sine", 0.5, 30);
    },
    // stat bars filling: a rising metallic tick
    tick(i) { tone(N(74 + (i || 0) * 2), 0, 0.08, "triangle", 0.07, null, sfxBus, true); },
    // right pick: heroic major swell with timpani
    win() {
      duck(0.25, 2.2);
      drum(0, 0.7, 110, 45);
      swell([N(50), N(57), N(62), N(66)], 0.02, 1.9, 0.11, 400, 3200);
      [N(74), N(78), N(81)].forEach((f, i) => tone(f, 0.08 + i * 0.09, 0.9, "triangle", 0.08, null, sfxBus, true));
    },
    // close call: suspended, unresolved
    partial() {
      duck(0.35, 1.8);
      drum(0, 0.5, 100, 50);
      swell([N(50), N(55), N(57), N(64)], 0.02, 1.6, 0.09, 300, 1800);
    },
    // wrong pick: dark minor braam, sinking
    lose() {
      duck(0.25, 2.4);
      braam(0, N(38), 0.16, 2.2);
      swell([N(50), N(53), N(56)], 0.05, 1.8, 0.07, 900, 300);
      tone(N(62), 0.1, 1.2, "sine", 0.08, N(55), sfxBus, true);
    },
    // boss: the big braam and a drum roll
    boss() {
      duck(0.3, 3);
      braam(0, N(33), 0.2, 3);
      for (let i = 0; i < 10; i++) drum(1.1 + i * 0.09, 0.15 + i * 0.04, 160, 70, sfxBus, 0.2);
    },
    hint() { tone(N(81), 0, 0.5, "sine", 0.1, null, sfxBus, true); tone(N(88), 0.08, 0.6, "sine", 0.07, null, sfxBus, true); },
    wrong() { duck(0.5, 1); tone(N(45), 0, 0.5, "sawtooth", 0.08, N(40)); drum(0, 0.35, 90, 45, sfxBus, 0.4); },
    correct() { epic.win(); [N(86), N(90), N(93)].forEach((f, i) => tone(f, 0.5 + i * 0.1, 1, "sine", 0.06, null, sfxBus, true)); },
    // day complete: a short triumphant cadence
    done() {
      duck(0.2, 3);
      drum(0, 0.6, 120, 45); drum(0.35, 0.6, 120, 45); drum(0.7, 0.9, 110, 35, sfxBus, 1);
      swell([N(46), N(53), N(58), N(62)], 0, 0.7, 0.1, 400, 2400);
      swell([N(48), N(55), N(60), N(64)], 0.35, 0.7, 0.1, 400, 2400);
      swell([N(50), N(57), N(62), N(66), N(69)], 0.7, 2.4, 0.12, 400, 3600);
    }
  };

  /* "soft": clean, satisfying UI sounds, no music. Marimba, bells, pops.
     Small sounds stay tiny; results are clearly louder and easy to tell apart. */
  function marimba(freq, at, vol, len) {
    const t0 = ctx.currentTime + at, d = len || 0.5;
    [[1, 1], [4, 0.12], [10, 0.03]].forEach(([mult, amt]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = freq * mult;
      env(g, t0, 0.003, vol * amt, mult === 1 ? d : d * 0.25);
      o.connect(g); g.connect(sfxBus); if (mult === 1) g.connect(verb.in);
      o.start(t0); o.stop(t0 + d + 0.05);
    });
  }
  function bell(freq, at, vol, len) {
    const t0 = ctx.currentTime + at, d = len || 1.2;
    [[1, 1], [2.76, 0.35], [5.4, 0.12], [8.9, 0.05]].forEach(([mult, amt]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = freq * mult;
      env(g, t0, 0.002, vol * amt, d / mult + 0.08);
      o.connect(g); g.connect(sfxBus); g.connect(verb.in);
      o.start(t0); o.stop(t0 + d + 0.1);
    });
  }
  function pop(at, vol, from, to) {
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(from || 700, t0);
    o.frequency.exponentialRampToValueAtTime(to || 220, t0 + 0.07);
    env(g, t0, 0.002, vol, 0.09);
    o.connect(g); g.connect(sfxBus);
    o.start(t0); o.stop(t0 + 0.12);
  }
  function sparkle(at, vol) {
    [96, 100, 103, 108].forEach((m, i) => bell(N(m), at + i * 0.045, vol * (1 - i * 0.15), 0.5));
  }

  const soft = {
    // barely-there click for buttons
    tap() { pop(0, 0.07, 1400, 900); },
    // picking a fighter: a small, round pop
    hit() { pop(0, 0.22, 640, 180); noise(0, 0.04, 0.05, 3000, sfxBus, "bandpass"); },
    // stat bars: soft marimba ticks climbing up
    tick(i) { marimba(N(72 + [0, 2, 4, 7, 9, 12, 14][(i || 0) % 7]), 0, 0.05, 0.25); },
    // right pick: bright "ding-ding" up and a sparkle
    win() {
      [N(72), N(76), N(79), N(84)].forEach((f, i) => marimba(f, i * 0.07, 0.3, 0.6));
      sparkle(0.3, 0.07);
    },
    // close call: two neutral notes
    partial() { marimba(N(69), 0, 0.26, 0.5); marimba(N(74), 0.12, 0.24, 0.7); },
    // wrong pick: a gentle "bwom" going down
    lose() {
      marimba(N(64), 0, 0.3, 0.5); marimba(N(60), 0.16, 0.3, 0.5); marimba(N(55), 0.32, 0.34, 0.9);
      tone(N(43), 0.32, 0.5, "sine", 0.12, N(38));
    },
    // boss fight: a short rising swish and a low knock, tension without drama
    boss() {
      noise(0, 0.5, 0.06, 900, sfxBus, "bandpass");
      tone(N(48), 0, 0.5, "sine", 0.06, N(60));
      pop(0.5, 0.3, 220, 70);
      bell(N(57), 0.52, 0.08, 1.4);
    },
    // a new hint opens: one soft bell
    hint() { bell(N(84), 0, 0.09, 0.9); },
    // wrong guess: a muted double knock
    wrong() { pop(0, 0.18, 300, 120); pop(0.1, 0.14, 260, 100); },
    // guessed the character: a playful little jingle
    correct() {
      const tune = [72, 76, 79, 76, 79, 84];
      tune.forEach((m, i) => marimba(N(m), i * 0.09, 0.28, 0.5));
      bell(N(88), 0.56, 0.12, 1.6); bell(N(91), 0.62, 0.1, 1.6);
      sparkle(0.7, 0.06);
    },
    // the day's score appears: a short "ta-da" on bells
    done() {
      bell(N(72), 0, 0.14, 1.2); bell(N(76), 0.12, 0.14, 1.2);
      [N(79), N(84), N(88)].forEach((f) => bell(f, 0.3, 0.12, 2.2));
      sparkle(0.42, 0.06);
    }
  };

  /* "signal": short electronic signals built from exact notes (D major).
     A glassy voice, no music. Points sound grows with the points earned. */
  function glass(freq, at, dur, vol, out) {
    const t0 = ctx.currentTime + at, tail = dur + 0.14;
    [[1, 1, "sine"], [2, 0.16, "sine"], [3, 0.05, "triangle"]].forEach(([mult, amt, type]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq * mult;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol * amt, t0 + 0.004);
      g.gain.setValueAtTime(vol * amt * 0.8, t0 + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + tail);
      o.connect(g); g.connect(out || sfxBus);
      o.start(t0); o.stop(t0 + tail + 0.05);
    });
  }
  function muted(freq, at, dur, vol) {
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.value = freq;
    f.type = "lowpass"; f.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.08);
    o.connect(f); f.connect(g); g.connect(sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.12);
  }
  /* play a list of [freq, ms] one after another */
  function seq(notes, vol, voice, start) {
    let at = start || 0;
    notes.forEach(([f, ms]) => { (voice || glass)(f, at, ms / 1000, vol); at += ms / 1000; });
    return at;
  }
  const D5 = 587.33, FS5 = 739.99, A5 = 880, D6 = 1174.66, FS6 = 1479.98;

  const signal = {
    tap() { glass(D6, 0, 0.02, 0.035); },
    hit() { glass(A5, 0, 0.03, 0.06); noise(0, 0.025, 0.04, 4000, sfxBus, "highpass"); },
    tick(i) { glass(D6 * Math.pow(2, ((i || 0) * 2) / 12), 0, 0.025, 0.025); },
    // correct answer: D5 → F#5 → A5, the last one a little longer
    win() { seq([[D5, 80], [FS5, 90], [A5, 180]], 0.16); },
    correct() { signal.win(); },
    // close call: two notes, not resolved
    partial() { seq([[D5, 90], [FS5, 160]], 0.13); },
    // wrong answer: A4 → F#4, muted, soft ending
    lose() { seq([[440, 100], [369.99, 150]], 0.14, muted); },
    wrong() { signal.lose(); },
    hint() { glass(A5, 0, 0.08, 0.07); },
    // boss level: D3 → A3 → D4 → F#4 over a deep bass, metallic ring,
    // a rising electronic bed and an echo on the last note
    boss() {
      const notes = [[146.83, 180], [220, 200], [293.66, 250], [369.99, 300]];
      const total = notes.reduce((s, n) => s + n[1], 0) / 1000;
      const t0 = ctx.currentTime;
      // rising bed
      const len = Math.floor(ctx.sampleRate * (total + 0.2));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 6;
      bp.frequency.setValueAtTime(300, t0); bp.frequency.exponentialRampToValueAtTime(3200, t0 + total);
      const bg = ctx.createGain(); bg.gain.setValueAtTime(0.0001, t0);
      bg.gain.exponentialRampToValueAtTime(0.05, t0 + total * 0.9); bg.gain.exponentialRampToValueAtTime(0.0001, t0 + total + 0.2);
      src.connect(bp); bp.connect(bg); bg.connect(sfxBus); src.start(t0);
      // echo for the last note
      const delay = ctx.createDelay(1); delay.delayTime.value = 0.19;
      const fb = ctx.createGain(); fb.gain.value = 0.38;
      const wet = ctx.createGain(); wet.gain.value = 0.7;
      delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(sfxBus); wet.connect(verb.in);
      let at = 0;
      notes.forEach(([f, ms], i) => {
        const d = ms / 1000, last = i === notes.length - 1;
        // deep synth bass
        const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = "sawtooth"; o.frequency.value = f / 2;
        lp.type = "lowpass"; lp.frequency.value = 600;
        g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(0.12, t0 + at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + d + (last ? 0.5 : 0.05));
        o.connect(lp); lp.connect(g); g.connect(sfxBus);
        o.start(t0 + at); o.stop(t0 + at + d + 0.6);
        // the note itself, glassy; the last one feeds the echo
        glass(f, at, d, 0.14, last ? delay : sfxBus);
        if (last) glass(f, at, d, 0.14);
        // small metallic ring above it
        glass(f * 2.76, at, d * 0.6, 0.03);
        at += d;
      });
    },
    // points earned: the bigger the reward, the longer the run
    points(pts) {
      pts = pts || 0;
      if (pts <= 0) return;
      if (pts < 50) { seq([[D5, 70], [A5, 140]], 0.12); return; }
      if (pts < 150) { seq([[D5, 70], [FS5, 70], [A5, 200]], 0.13); return; }
      if (pts < 250) {
        const end = seq([[D5, 60], [FS5, 60], [A5, 70], [D6, 240]], 0.13);
        glass(D6 * 2, end - 0.2, 0.25, 0.04);
        return;
      }
      const end = seq([[D5, 60], [FS5, 60], [A5, 60], [D6, 70], [FS6, 320]], 0.13);
      // shine: a few quiet high glints
      [2349.32, 2959.96, 3520].forEach((f, i) => glass(f, end - 0.3 + i * 0.06, 0.12, 0.035));
    },
    // the day's score: the biggest version
    done() { signal.points(300); }
  };

  /* ===== "theme" (pack E): the whole game is built from one tune =====
     The game asks a question, you answer it. One six-note hook in A major,
     played on a glassy FM electric-piano voice:
       question  E4 · A4 · B4      rises and stops on an open note ("Who's stronger?")
       answer    C#5 · E5 · A5     same rhythm, lands home ("This one!")
     Every new fight plays the question, a right pick plays the answer.
     A wrong pick bends it into minor (C5 · B4 · E4). The streak adds layers
     to the answer, points tick up the scale together with the counter,
     the slider is a little harp, and the day's score plays the whole hook
     over a V → I bass (E → A), so it lands like the end of a song.
     No background music. */
  const PENTA = [57, 59, 61, 64, 66, 69, 71, 73, 76, 78, 81, 83, 85, 88, 90, 93, 95, 97, 100, 102]; // A major pentatonic from A3
  const HOOK_Q = [[64, 0.1], [69, 0.1], [71, 0.32]];
  const HOOK_A = [[73, 0.09], [76, 0.09], [81, 0.6]];
  const stepsBefore = (notes, k) => notes.slice(0, -1).reduce((s, n) => s + n[1], 0) * (k || 1);

  /* output with optional stereo position and reverb send */
  function dest(pan, wet) {
    const g = ctx.createGain();
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); p.connect(sfxBus);
    } else g.connect(sfxBus);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(verb.in); }
    return g;
  }
  /* the signature voice: 2-operator FM. ratio 1 = electric piano, 3.5 = bell */
  function ep(midi, at, o) {
    o = o || {};
    const f = N(midi + (o.oct || 0) * 12);
    const t0 = ctx.currentTime + at, dur = o.dur || 0.5, vol = o.vol || 0.15;
    const ratio = o.ratio || 1, index = o.index == null ? 1.6 : o.index;
    const out = dest(o.pan || 0, o.wet == null ? 0.22 : o.wet);
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), amp = ctx.createGain();
    car.frequency.setValueAtTime(f, t0);
    mod.frequency.setValueAtTime(f * ratio, t0);
    if (o.bend) {
      car.frequency.exponentialRampToValueAtTime(f * o.bend, t0 + dur);
      mod.frequency.exponentialRampToValueAtTime(f * ratio * o.bend, t0 + dur);
    }
    // bright attack that mellows out, like a struck tine
    mg.gain.setValueAtTime(f * index + 0.01, t0);
    mg.gain.exponentialRampToValueAtTime(f * index * 0.08 + 0.01, t0 + (o.bright || 0.25));
    mod.connect(mg); mg.connect(car.frequency);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(vol, t0 + 0.004);
    amp.gain.exponentialRampToValueAtTime(vol * 0.35, t0 + Math.min(0.12, dur * 0.4));
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    car.connect(amp); amp.connect(out);
    car.start(t0); mod.start(t0);
    car.stop(t0 + dur + 0.05); mod.stop(t0 + dur + 0.05);
  }
  /* soft synth bass (audible on phone speakers too) */
  function bass(midi, at, dur, vol) {
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "sawtooth"; o.frequency.value = N(midi);
    lp.type = "lowpass"; lp.frequency.setValueAtTime(900, t0); lp.frequency.exponentialRampToValueAtTime(240, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(lp); lp.connect(g); g.connect(sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  /* warm chord behind the big moments */
  function pad(midis, at, dur, vol) {
    const t0 = ctx.currentTime + at, out = dest(0, 0.5);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    lp.connect(g); g.connect(out);
    midis.forEach((m) => [-6, 6].forEach((det) => {
      const o = ctx.createOscillator(); o.type = "triangle";
      o.frequency.value = N(m); o.detune.value = det;
      o.connect(lp); o.start(t0); o.stop(t0 + dur + 0.05);
    }));
  }
  /* punch for a click on a fighter */
  function thump(at, vol, pan) {
    const t0 = ctx.currentTime + at, out = dest(pan || 0, 0.08);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(170, t0);
    o.frequency.exponentialRampToValueAtTime(48, t0 + 0.12);
    env(g, t0, 0.003, vol, 0.18);
    o.connect(g); g.connect(out);
    o.start(t0); o.stop(t0 + 0.25);
    noise(at, 0.035, vol * 0.45, 2200, out, "bandpass");
  }
  /* air moving past: fighters flying in */
  function whoosh(at, dur, vol, from, to, pan) {
    const t0 = ctx.currentTime + at, len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(from, t0);
    bp.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.65);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp); bp.connect(g); g.connect(dest(pan || 0, 0.15));
    src.start(t0); src.stop(t0 + dur + 0.02);
  }
  /* a few high bell glints, left and right */
  function sparkle(at, vol) {
    [93, 100, 97, 105].forEach((m, i) => ep(m, at + i * 0.05, {
      ratio: 3.5, index: 2, dur: 0.7, vol: (vol || 0.035) * (1 - i * 0.15), wet: 0.5, pan: i % 2 ? 0.45 : -0.45
    }));
  }
  /* play a list of [midi, step] notes; the last one rings */
  function phrase(notes, at, o) {
    o = o || {};
    const k = o.speed || 1;
    let t = at;
    notes.forEach(([m, step], i) => {
      const last = i === notes.length - 1;
      ep(m, t, Object.assign({}, o, { dur: last ? (o.tail || 0.9) : Math.max(0.35, step * k * 3) }));
      t += step * k;
    });
    return t;
  }
  /* the whole hook with its V → I bass. Returns when the last note lands. */
  function hook(at, o) {
    o = o || {};
    const k = o.speed || 1, vol = o.vol || 0.15;
    const notes = HOOK_Q.concat(HOOK_A);
    phrase(notes, at, { vol, speed: k, tail: o.tail || 1.2 });
    const qLand = at + stepsBefore(HOOK_Q, k);           // B4: the open question
    const land = at + stepsBefore(notes, k);              // A5: home
    if (o.bass !== false) { bass(40, qLand, land - qLand + 0.05, 0.07); bass(45, land, 1.0, 0.09); }
    return land;
  }

  let slideIdx = -1, slideT = 0;
  function ladder(n) {
    const i = Math.min(Math.max(0, n - 1), 10);
    ep(PENTA[5 + i], 0, { dur: 0.3, vol: 0.12 });
    ep(PENTA[7 + i], 0.08, { dur: 0.6, vol: 0.14 });
    if (n >= 5) ep(PENTA[7 + i], 0.08, { oct: 1, ratio: 3.5, index: 2, dur: 0.9, vol: 0.04, wet: 0.4 });
  }

  const theme = {
    // menus and buttons: a tiny soft "tock"
    tap() { tone(1500, 0, 0.03, "sine", 0.035, 1100); },
    // a click on a fighter: punch from that fighter's side
    hit(side) {
      const pan = (side || 0) * 0.5;
      thump(0, 0.3, pan);
      ep(57, 0, { dur: 0.14, vol: 0.06, index: 4, bright: 0.05, pan, wet: 0 });
    },
    // a new fight: both fighters fly in, the VS rings, the question plays
    vs() {
      slideIdx = -1;
      whoosh(0, 0.26, 0.09, 500, 3000, -0.75);
      whoosh(0.08, 0.26, 0.09, 500, 3000, 0.75);
      thump(0.3, 0.14, 0);
      ep(88, 0.3, { ratio: 3.5, index: 2.5, dur: 0.6, vol: 0.035, wet: 0.4 });
      phrase(HOOK_Q, 0.42, { vol: 0.085, tail: 0.7 });
    },
    // boss fight: the same question, low and heavy, held open with a rising shimmer
    boss() {
      slideIdx = -1;
      const steps = [[40, 0.24], [45, 0.24], [47, 0.9]];
      let t = 0;
      steps.forEach(([m, st], i) => {
        const last = i === steps.length - 1;
        bass(m, t, last ? 1.5 : st + 0.15, 0.13);
        ep(m + 24, t, { dur: last ? 1.4 : 0.5, vol: 0.12, index: 2.2 });
        if (last) ep(m + 36, t, { ratio: 3.5, index: 3, dur: 1.6, vol: 0.04, wet: 0.6 });
        t += st;
      });
      thump(0.48, 0.3, 0);
      whoosh(0.1, 0.95, 0.07, 250, 4000, 0);
      for (let i = 0; i < 8; i++) {
        ep(83, 0.5 + i * 0.07, { ratio: 3.5, index: 1.5, dur: 0.2, vol: 0.02 + i * 0.004, pan: i % 2 ? 0.3 : -0.3, wet: 0.4 });
      }
    },
    // right pick: the answer. {level: streak 1-5} adds layers, {boss} = everything,
    // {run: n} = Higher or Lower, climbing a step with every right answer
    win(arg) {
      const o = arg && typeof arg === "object" ? arg : {};
      if (o.run) { ladder(o.run); return; }
      const L = o.boss ? 5 : Math.max(1, Math.min(5, o.level || 1));
      let t = 0;
      if (L >= 4) { ep(69, 0, { dur: 0.2, vol: 0.06 }); ep(71, 0.045, { dur: 0.2, vol: 0.07 }); t = 0.09; }
      phrase(HOOK_A, t, { vol: 0.16 });
      const land = t + stepsBefore(HOOK_A);
      if (L >= 2) phrase(HOOK_A, t, { vol: 0.045, oct: 1, ratio: 3.5, index: 2, wet: 0.4, tail: 1.1 });
      if (L >= 3) { bass(45, land, 0.8, 0.09); pad([69, 73, 76], land, 1.1, 0.03); }
      if (L >= 4) ep(85, land, { vol: 0.07, dur: 0.9 });
      if (L >= 5) sparkle(land + 0.06, 0.04);
    },
    // slider bullseye
    correct() { theme.win({ level: 5 }); },
    // close call: the answer starts but never lands
    partial() {
      phrase([[73, 0.09], [76, 0.45]], 0, { vol: 0.13, tail: 0.6 });
      ep(71, 0.09, { vol: 0.05, dur: 0.55 });
    },
    // wrong pick: the answer in minor, sinking
    lose() {
      ep(72, 0, { dur: 0.35, vol: 0.13, index: 0.9 });
      ep(71, 0.1, { dur: 0.35, vol: 0.12, index: 0.9 });
      ep(64, 0.2, { dur: 0.6, vol: 0.13, index: 0.7, bend: 0.97 });
      bass(40, 0.2, 0.5, 0.08);
    },
    // a wrong name in Guess: small and soft (it happens a lot)
    wrong() {
      ep(59, 0, { dur: 0.3, vol: 0.1, index: 0.8, bend: 0.92 });
      thump(0, 0.1, 0);
    },
    // the comparison tiles flipping one by one: bright = match, dull = no match
    flips(list) {
      (list || []).forEach((ok, i) => {
        if (ok) ep(PENTA[8 + i], 0.05 + i * 0.08, { dur: 0.25, vol: 0.06, ratio: 3, index: 1.2, pan: -0.3 + i * 0.2 });
        else tone(700, 0.05 + i * 0.08, 0.03, "sine", 0.03, 500);
      });
    },
    // a new hint appears
    hint() {
      ep(83, 0, { ratio: 3.5, index: 2, dur: 0.5, vol: 0.05, wet: 0.4 });
      ep(88, 0.07, { ratio: 3.5, index: 2, dur: 0.8, vol: 0.05, wet: 0.4 });
    },
    // Guess solved: the whole hook, faster; more points = more layers
    solve(pts) {
      pts = pts || 0;
      const land = hook(0, { speed: 0.75, vol: 0.15 });
      phrase(HOOK_A, land - stepsBefore(HOOK_A, 0.75), { speed: 0.75, vol: 0.045, oct: 1, ratio: 3.5, index: 2, wet: 0.4, tail: 1.2 });
      pad([69, 73, 76], land, 1.3, 0.03);
      if (pts >= 55) ep(85, land, { vol: 0.07, dur: 1 });
      sparkle(land + 0.06, pts >= 85 ? 0.045 : 0.025);
    },
    // points: coins climbing the scale while the number counts up (0.5 s)
    points(pts) {
      pts = pts || 0;
      if (pts <= 0) return;
      const n = Math.max(3, Math.min(10, Math.round(pts / 35) + 2)), span = 0.5;
      for (let i = 0; i < n; i++) {
        ep(PENTA[10 + i], (i * span) / n, { ratio: 3, index: 1.2, dur: 0.18, vol: 0.04, wet: 0.2, pan: -0.3 + (0.6 * i) / (n - 1) });
      }
      if (pts >= 250) sparkle(span, 0.03);
      else ep(PENTA[10 + n - 1], span, { ratio: 3.5, index: 2, dur: 0.5, vol: 0.035, wet: 0.4 });
    },
    // the slider is a harp: each step of the pentatonic scale plays as you drag
    slide(v) {
      const i = Math.round(((v - 1) / 98) * 14);
      if (i === slideIdx) return;
      const now = performance.now();
      if (now - slideT < 30) return; // fast drags: at most one note every 30 ms
      slideIdx = i; slideT = now;
      ep(PENTA[i], 0, { dur: 0.22, vol: 0.06, index: 1.2, pan: -(v - 50) / 80, wet: 0.15 });
    },
    // Higher or Lower: soft ticks while the hidden number rolls up
    roll(ms) {
      const d = (ms || 650) / 1000, n = 9;
      for (let i = 0; i < n; i++) tone(900 + i * 70, (i * d) / n, 0.02, "sine", 0.018 + i * 0.002);
    },
    // stat bars: kept silent, the coins are playing at the same time
    tick() {},
    // the day's result: the whole hook; a better score = a fuller ending
    done(score) {
      const s = score == null ? 600 : score;
      const land = hook(0, { vol: 0.15 });
      if (s >= 400) pad([69, 73, 76], land, 1.4, 0.032);
      if (s >= 700) {
        phrase(HOOK_A, land - stepsBefore(HOOK_A), { vol: 0.045, oct: 1, ratio: 3.5, index: 2, wet: 0.4, tail: 1.3 });
        ep(85, land, { vol: 0.07, dur: 1.1 });
      }
      if (s >= 900) { sparkle(land + 0.06, 0.045); ep(93, land + 0.3, { ratio: 3.5, index: 2, dur: 1.4, vol: 0.04, wet: 0.6 }); }
    },
    // the game's signature: Play button on the intro screen
    logo() { theme.done(750); }
  };

  /* ===== "mix" (pack F): arcade A + motif E =====
     The motif's notes and structure (question on every fight, answer on a
     right pick, minor on a wrong one, streak layers, coins, harp slider),
     played on the arcade pack's chip voices (square / triangle blips, fast
     arpeggios, punchy hit, sliding-down lose). The glassy FM voice stays
     underneath, quietly, to keep it warm. */
  function chip(midi, at, o) {
    o = o || {};
    const f = N(midi + (o.oct || 0) * 12);
    const t0 = ctx.currentTime + at, dur = o.dur || 0.14, vol = o.vol || 0.1;
    const osc = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    osc.type = o.type || "square";
    osc.frequency.setValueAtTime(f, t0);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(f * o.slide, t0 + dur);
    lp.type = "lowpass"; lp.frequency.value = o.cut || 3800; // takes the harsh edge off the square
    env(g, t0, 0.005, vol, dur);
    osc.connect(lp); lp.connect(g); g.connect(dest(o.pan || 0, o.wet == null ? 0.08 : o.wet));
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }
  /* play [midi, step] notes as chip blips, last one longer; FM underneath if warm */
  function arp(notes, at, o) {
    o = o || {};
    let t = at;
    notes.forEach(([m, step], i) => {
      const last = i === notes.length - 1;
      chip(m, t, { vol: o.vol || 0.1, dur: last ? (o.tail || 0.3) : Math.max(0.1, step * 1.6), type: o.type, oct: o.oct, pan: o.pan });
      if (o.warm) ep(m, t, { vol: o.warm, dur: last ? 0.8 : 0.35, oct: o.oct });
      t += step;
    });
    return at + notes.slice(0, -1).reduce((s, n) => s + n[1], 0); // when the last note lands
  }
  const Q_FAST = [[64, 0.085], [69, 0.085], [71, 0.2]];
  const A_FAST = [[73, 0.085], [76, 0.085], [81, 0.3]];

  const mix = {
    tap() { chip(76, 0, { type: "triangle", dur: 0.05, vol: 0.12 }); },
    // the arcade punch, from the picked fighter's side
    hit(side) {
      const out = dest((side || 0) * 0.5, 0.05);
      noise(0, 0.16, 0.42, 900, out);
      tone(150, 0, 0.22, "sine", 0.5, 42, out);
    },
    // new fight: fighters fly in, then the question as chip blips
    vs() {
      slideIdx = -1;
      whoosh(0, 0.24, 0.07, 500, 3000, -0.75);
      whoosh(0.08, 0.24, 0.07, 500, 3000, 0.75);
      chip(88, 0.3, { type: "triangle", dur: 0.18, vol: 0.07 });
      arp(Q_FAST, 0.4, { vol: 0.06, warm: 0.04, tail: 0.25 });
    },
    // boss: the arcade boss rumble + the question low and slow
    boss() {
      slideIdx = -1;
      tone(72, 0, 1.0, "sawtooth", 0.22, 44);
      noise(0, 0.55, 0.3, 320);
      const steps = [[52, 0.22], [57, 0.22], [59, 0.6]];
      let t = 0.15;
      steps.forEach(([m, st], i) => {
        chip(m, t, { vol: 0.1, dur: i === 2 ? 0.7 : 0.2 });
        ep(m + 12, t, { vol: 0.07, dur: i === 2 ? 1.2 : 0.4 });
        t += st;
      });
      for (let i = 0; i < 6; i++) chip(83, 0.65 + i * 0.07, { type: "triangle", dur: 0.05, vol: 0.03 + i * 0.006, pan: i % 2 ? 0.3 : -0.3 });
    },
    // right pick: the answer as a fast arcade arpeggio + a triangle "ding" on top.
    // The streak adds layers; {run} = Higher or Lower climbing.
    win(arg) {
      const o = arg && typeof arg === "object" ? arg : {};
      if (o.run) {
        const i = Math.min(Math.max(0, o.run - 1), 10);
        chip(PENTA[5 + i], 0, { dur: 0.1, vol: 0.1 });
        chip(PENTA[7 + i], 0.085, { dur: 0.22, vol: 0.1 });
        if (o.run >= 5) chip(PENTA[7 + i], 0.17, { type: "triangle", oct: 1, dur: 0.25, vol: 0.07 });
        return;
      }
      const L = o.boss ? 5 : Math.max(1, Math.min(5, o.level || 1));
      let t = 0;
      if (L >= 4) { chip(69, 0, { dur: 0.06, vol: 0.07 }); chip(71, 0.045, { dur: 0.06, vol: 0.08 }); t = 0.09; }
      const land = arp(A_FAST, t, { vol: 0.1, warm: 0.06 });
      chip(93, land + 0.09, { type: "triangle", dur: 0.3, vol: 0.09 }); // A6 ding, like the arcade win
      if (L >= 2) arp(A_FAST, t, { vol: 0.035, oct: 1, type: "triangle", tail: 0.25 });
      if (L >= 3) { bass(45, land, 0.6, 0.08); chip(85, land, { type: "triangle", dur: 0.35, vol: 0.05 }); }
      if (L >= 5) { arp([[85, 0.06], [88, 0.06], [93, 0.3]], land + 0.18, { type: "triangle", vol: 0.06 }); sparkle(land + 0.3, 0.03); }
    },
    correct() { mix.win({ level: 5 }); },
    // close call: the arcade "hm" on the first two answer notes
    partial() { chip(73, 0, { dur: 0.14, vol: 0.1 }); chip(76, 0.11, { dur: 0.22, vol: 0.1 }); },
    // wrong pick: the minor answer, then the arcade slide down
    lose() {
      chip(72, 0, { dur: 0.1, vol: 0.09 });
      chip(71, 0.09, { dur: 0.1, vol: 0.09 });
      tone(N(64), 0.18, 0.34, "sawtooth", 0.08, N(64) * 0.5);
      ep(64, 0.18, { vol: 0.06, dur: 0.5, index: 0.7, bend: 0.97 });
    },
    wrong() { tone(170, 0, 0.18, "square", 0.1, 110); },
    flips(list) {
      (list || []).forEach((ok, i) => {
        if (ok) chip(PENTA[8 + i], 0.05 + i * 0.08, { dur: 0.08, vol: 0.06, pan: -0.3 + i * 0.2 });
        else chip(52, 0.05 + i * 0.08, { type: "triangle", dur: 0.04, vol: 0.05 });
      });
    },
    hint() { chip(76, 0, { type: "triangle", dur: 0.07, vol: 0.14 }); chip(83, 0.07, { type: "triangle", dur: 0.12, vol: 0.12 }); },
    // Guess solved: the whole hook as one fast arcade run, E → A bass under it
    solve(pts) {
      pts = pts || 0;
      const qLand = arp(Q_FAST, 0, { vol: 0.1, warm: 0.05, tail: 0.15 });
      bass(40, qLand, 0.25, 0.07);
      const land = arp(A_FAST, qLand + 0.2, { vol: 0.1, warm: 0.06, tail: 0.4 });
      bass(45, land, 0.8, 0.09);
      chip(93, land + 0.09, { type: "triangle", dur: 0.35, vol: 0.09 });
      if (pts >= 55) arp(A_FAST, qLand + 0.2, { vol: 0.035, oct: 1, type: "triangle" });
      sparkle(land + 0.2, pts >= 85 ? 0.04 : 0.022);
    },
    // points: arcade coins climbing the scale with the counter (0.5 s)
    points(pts) {
      pts = pts || 0;
      if (pts <= 0) return;
      const n = Math.max(3, Math.min(10, Math.round(pts / 35) + 2)), span = 0.5;
      for (let i = 0; i < n; i++) chip(PENTA[10 + i], (i * span) / n, { dur: 0.05, vol: 0.045, pan: -0.3 + (0.6 * i) / (n - 1) });
      chip(PENTA[10 + n - 1], span, { type: "triangle", oct: 1, dur: 0.25, vol: 0.05 });
      if (pts >= 250) sparkle(span + 0.05, 0.025);
    },
    // slider: chip blips on the scale as you drag
    slide(v) {
      const i = Math.round(((v - 1) / 98) * 14);
      if (i === slideIdx) return;
      const now = performance.now();
      if (now - slideT < 30) return;
      slideIdx = i; slideT = now;
      chip(PENTA[i] + 12, 0, { dur: 0.05, vol: 0.05, pan: -(v - 50) / 80 });
    },
    roll(ms) {
      const d = (ms || 650) / 1000, n = 9;
      for (let i = 0; i < n; i++) chip(PENTA[5 + i], (i * d) / n, { dur: 0.03, vol: 0.025 });
    },
    tick() {},
    // the day's result: the whole hook on triangle + square, like the arcade "done" run
    done(score) {
      const s = score == null ? 600 : score;
      const qLand = arp([[64, 0.1], [69, 0.1], [71, 0.24]], 0, { type: "triangle", vol: 0.14, warm: 0.05, tail: 0.25 });
      bass(40, qLand, 0.3, 0.07);
      const land = arp([[73, 0.1], [76, 0.1], [81, 0.4]], qLand + 0.24, { type: "triangle", vol: 0.14, warm: 0.06, tail: 0.5 });
      bass(45, land, 1.0, 0.09);
      if (s >= 400) arp([[73, 0.1], [76, 0.1], [81, 0.4]], qLand + 0.24, { vol: 0.045, tail: 0.4 });
      if (s >= 700) { chip(85, land, { type: "triangle", dur: 0.5, vol: 0.06 }); chip(93, land + 0.12, { type: "triangle", dur: 0.45, vol: 0.08 }); }
      if (s >= 900) sparkle(land + 0.2, 0.04);
    },
    logo() { mix.done(750); }
  };

  // ---------- background score (epic pack only) ----------
  /* D minor, i – VI – III – VII (Dm, Bb, F, C), 92 BPM, 2 bars per chord.
     Layers by intensity: 0 drone, 1 + ostinato & pulse, 2 + heavy drums. */
  const BPM = 92, BEAT = 60 / BPM, STEP = BEAT / 2;   // eighth notes
  const CHORDS = [
    [50, 53, 57], // Dm
    [46, 50, 53], // Bb
    [53, 57, 60], // F
    [48, 52, 55]  // C
  ];
  let musicTarget = 0, intensity = 0, timer = null, nextTime = 0, step = 0, drone = null;
  const SCENE = { menu: 0, guess: 0.6, fight: 1, boss: 2, quiet: -1 };
  let scene = "menu";

  function startDrone() {
    if (drone) return;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 380; f.Q.value = 1;
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07; lfoGain.gain.value = 160;
    lfo.connect(lfoGain); lfoGain.connect(f.frequency); lfo.start();
    const g = ctx.createGain(); g.gain.value = 0.11;
    f.connect(g); g.connect(musicBus); g.connect(verb.in);
    const oscs = [];
    [[N(38), -6], [N(38), 6], [N(45), 0], [N(26), 0]].forEach(([fr, det], i) => {
      const o = ctx.createOscillator(); o.type = i === 3 ? "sine" : "sawtooth";
      o.frequency.value = fr; o.detune.value = det; o.connect(f); o.start(); oscs.push(o);
    });
    drone = { oscs, lfo, filter: f, gain: g };
  }
  function setDroneChord(rootMidi, t) {
    if (!drone) return;
    const r = N(rootMidi - 12);
    drone.oscs[0].frequency.setTargetAtTime(r, t, 0.6);
    drone.oscs[1].frequency.setTargetAtTime(r, t, 0.6);
    drone.oscs[2].frequency.setTargetAtTime(r * 1.5, t, 0.6);
    drone.oscs[3].frequency.setTargetAtTime(r / 2, t, 0.6);
  }
  function pluck(freq, t, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = "sawtooth"; o.frequency.value = freq;
    f.type = "lowpass"; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.25);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(f); f.connect(g); g.connect(musicBus); g.connect(verb.in);
    o.start(t); o.stop(t + 0.36);
  }
  function mdrum(t, vol, top, bottom, len) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(top, t); o.frequency.exponentialRampToValueAtTime(bottom, t + len * 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(musicBus); g.connect(verb.in);
    o.start(t); o.stop(t + len + 0.05);
  }
  function scheduleStep(t, s) {
    const bar = Math.floor(s / 8), inBar = s % 8;
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    if (s % 16 === 0) setDroneChord(chord[0], t);
    // ostinato: chord tones in a restless pattern, an octave up
    if (intensity >= 0.6) {
      const pattern = [0, 1, 2, 1, 0, 2, 1, 2];
      const note = chord[pattern[inBar]] + 12 + (inBar === 5 && intensity >= 2 ? 12 : 0);
      pluck(N(note), t, 0.035 + (intensity >= 2 ? 0.015 : 0));
    }
    // pulse: low taiko on 1 and the "and" of 2, soft
    if (intensity >= 1) {
      if (inBar === 0) mdrum(t, 0.22, 110, 42, 0.55);
      if (inBar === 3) mdrum(t, 0.12, 120, 50, 0.4);
      if (inBar === 4) mdrum(t, 0.16, 105, 44, 0.5);
    } else if (inBar === 0 && bar % 2 === 0) {
      mdrum(t, 0.1, 90, 40, 0.8);            // menu: a distant heartbeat
    }
    // boss: driving drums every eighth, accents
    if (intensity >= 2) {
      mdrum(t, inBar % 2 === 0 ? 0.14 : 0.08, 170, 70, 0.18);
      if (inBar === 6 || inBar === 7) mdrum(t, 0.18, 130, 55, 0.3);
    }
  }
  function tick() {
    while (nextTime < ctx.currentTime + 0.2) {
      scheduleStep(nextTime, step);
      nextTime += STEP; step++;
    }
  }
  function musicLevel() {
    if (!on() || pack() !== "epic" || SCENE[scene] < 0) return 0;
    return intensity >= 2 ? 0.34 : intensity >= 1 ? 0.3 : 0.24;
  }
  function updateMusic() {
    if (!ctx) return;
    intensity = Math.max(0, SCENE[scene] || 0);
    musicTarget = musicLevel();
    musicBus.gain.setTargetAtTime(musicTarget, ctx.currentTime, 0.8);
    if (musicTarget > 0) {
      startDrone();
      if (!timer) { nextTime = ctx.currentTime + 0.1; step = 0; timer = setInterval(tick, 50); }
    } else if (timer) {
      // let it fade, then stop scheduling
      const stopAt = ctx.currentTime + 2;
      setTimeout(() => { if (musicTarget === 0 && timer) { clearInterval(timer); timer = null; } }, 2200);
      void stopAt;
    }
  }
  // pause music while the tab is hidden
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else if (on()) ctx.resume();
  });

  /* events only pack E knows: what the older packs do instead */
  let lastSlide = 50;
  const FALLBACK = {
    slide(fx, v) { if (Math.abs(v - lastSlide) >= 5) { lastSlide = v; if (fx.tick) fx.tick(2); } },
    solve(fx, pts) {
      if (fx.correct) fx.correct();
      if (fx.points) setTimeout(() => { try { fx.points(pts); } catch (e) { /* ignore */ } }, 400);
    },
    logo(fx) { if (fx.tap) fx.tap(); },
    perfect(fx) { if (fx.correct) fx.correct(); }
  };

  W.sound = {
    play(name, arg) {
      if (!on()) return;
      try {
        if (!audio()) return;
        const fx = { epic, classic, soft, signal, theme, mix }[pack()] || classic;
        if (name === "vs" || name === "boss") lastSlide = 50;
        if (fx[name]) fx[name](arg);
        else if (FALLBACK[name]) FALLBACK[name](fx, arg);
        updateMusic(); // the first sound also starts the score (browsers need a click first)
      } catch (e) { /* sound is optional */ }
    },
    setScene(name) {
      scene = SCENE[name] !== undefined ? name : "menu";
      try { if (ctx) updateMusic(); } catch (e) { /* ignore */ }
    },
    setPack(name) {
      W.store.setSetting("soundPack", name);
      try { if (ctx) updateMusic(); } catch (e) { /* ignore */ }
    },
    refresh() { try { if (ctx) { if (on()) ctx.resume(); updateMusic(); } } catch (e) { /* ignore */ } },
    get pack() { return pack(); }
  };
})();
