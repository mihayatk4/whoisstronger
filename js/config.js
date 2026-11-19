/* Global settings. Everything you may want to tune lives here. */
window.WIS = window.WIS || {};

WIS.config = {
  brand: "Who's Stronger?",
  locale: "en",

  // Public address of the site, used in the share text. Empty = current address.
  siteUrl: "https://whoisstronger.org",

  // Day #1 of the game (local date, YYYY-MM-DD). The archive starts here and
  // the day number in the share text counts from it. Set it to the real
  // launch day before going live (changing it later reshuffles past days).
  launchDate: "2026-11-17",

  // Day 1 of data/matchups.csv (hand-made fights). Days outside the list
  // are generated automatically.
  scheduleStart: "2026-11-17",

  roundsPerDay: 5,

  // --- Power formula -------------------------------------------------------
  // score = sum(stat * weight)
  weights: {
    strike: 1.2,
    speed: 1.3,
    durability: 1.2,
    stamina: 0.8,
    skill: 1.0,
    intellect: 0.8,
    abilities: 1.5
  },
  // Win chance comes from the power rating (column "power", 100-1000), like
  // chess Elo: chance = 1 / (1 + 10^(-difference / powerScale)).
  // With 200: 35 points ≈ 60%, 100 ≈ 76%, 150 (next tier) ≈ 85%, 300 ≈ 97%.
  powerScale: 200,
  minChance: 0.03,

  // Daily fights only use pairs where the favorite's chance is in this range:
  // no coin flips, no foregone conclusions.
  dailyMinFav: 60,
  dailyMaxFav: 92,

  // --- Daily set rules -----------------------------------------------------
  maxTierGap: 1,       // only same or neighbouring tiers meet
  maxCooldownDays: 6,  // with a big roster a character rests up to this many days
  pairMemoryDays: 30,  // try not to repeat a pair seen in the last N days

  // --- Fight scoring (max 1000 a day) --------------------------------------
  scoring: {
    base: 100,                          // a right pick = base x streak multiplier
    multipliers: [1, 1.5, 2, 2.5, 3],   // 1st, 2nd, 3rd... right pick in a row
    contestedGap: 10,                   // gap up to this: a wrong pick keeps the streak
    sliderMax: { 1: 300, 2: 275 },      // max points per slider, by sliders that day
    sliderWindow: 30,                   // off by this much or more = 0 points
    sliderGrace: 1,                     // off by up to this much still counts as a bullseye
    sliderCurve: 2.5                    // points = max x (1 - (off - grace) / (window - grace)) ^ curve
  },
  // How many slider rounds each weekday has (Sunday first). Mostly one.
  sliderWeek: [2, 1, 1, 0, 1, 1, 2],

  // --- Global rank: total fight points of all days -------------------------
  ranks: [
    { name: "Mortal", label: "Starting out", at: 0 },
    { name: "Vanguard", label: "Street level", at: 1000 },
    { name: "Warlord", label: "City level", at: 3000 },
    { name: "Sovereign", label: "Country level", at: 7000 },
    { name: "Titan", label: "Planet level", at: 15000 },
    { name: "Ascendant", label: "Star level", at: 30000 },
    { name: "Celestial", label: "Galaxy level", at: 55000 },
    { name: "Eternal", label: "Universe level", at: 90000 },
    { name: "Transcendent", label: "Multiverse level", at: 140000 },
    { name: "Absolute", label: "Beyond scale", at: 200000 }
  ],
  streakFreeze: true,                   // one missed day per week keeps the streak

  // --- Guess mode ----------------------------------------------------------
  // Points for solving on hint 1, 2, 3 ... (length = number of hints)
  guessPoints: [100, 85, 70, 55, 40, 25],

  // --- Players' votes ------------------------------------------------------
  minVotesToShow: 30,
  // "auto": demo numbers on localhost / file://, real API (/api/...) on a live site
  crowdMode: "auto",

  // Cloudflare Web Analytics token (no cookies, no banner needed).
  // Cloudflare dashboard → Analytics & Logs → Web Analytics → Add a site.
  // Empty = no analytics. Never loads on localhost.
  analyticsToken: "",

  // Dashed placeholders for ad banners on wide screens
  showAdSlots: false,

  // Sound pack: "mix" (arcade blips + the theme hook), "theme" (one musical hook for the whole game: question → answer), "signal" (exact-note electronic signals, points sound grows with points), "soft" (clean UI sounds, no music), "epic" (cinematic + background score) or "classic" (arcade blips)
  soundPack: "classic",
  // Show the A-F sound switch (localhost only). Off: everyone gets soundPack above.
  showPackSwitch: false,

  // Switch modes on and off without deleting their code
  features: {
    freePlay: false,      // universe filters + endless fights (js/free.js)
    ranks: false,         // global rank card (Mortal → Absolute); points still add up
    higherLower: true     // Higher or Lower on one stat (js/hol.js)
  }
};
