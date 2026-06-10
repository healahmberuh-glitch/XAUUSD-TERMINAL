// api/predict.js — DEPRESSEDESIGN Macro Predictor Backend
// Vercel Serverless Function (Node.js) - FOREX FACTORY EDITION (100% FREE)

const axios = require("axios");

// ─── Free Public Feeds (No API Key Required) ─────────────────────────────
const FF_URL_THIS = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const FF_URL_LAST = "https://nfs.faireconomy.media/ff_calendar_lastweek.json";

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function fetchForexFactoryData() {
  try {
    // Menarik data minggu lalu dan minggu ini sekaligus untuk jangkauan yang lebih luas
    const [thisWeek, lastWeek] = await Promise.all([
      axios.get(FF_URL_THIS, { timeout: 8000 }),
      axios.get(FF_URL_LAST, { timeout: 8000 })
    ]);
    return [...lastWeek.data, ...thisWeek.data];
  } catch (err) {
    console.error("Forex Factory fetch error:", err.message);
    return [];
  }
}

function findMacroEvent(events, keywords) {
  // Mencari event USD yang cocok dengan kata kunci
  const matches = events.filter(e =>
    e.country === "USD" &&
    keywords.some(kw => e.title.toLowerCase().includes(kw.toLowerCase()))
  );

  if (matches.length === 0) return null;

  // Mengurutkan dari yang paling terbaru
  matches.sort((a, b) => new Date(b.date) - new Date(a.date));
  return matches[0];
}

function parseFFValue(str) {
  if (str === null || str === undefined || str === "") return null;
  // Membuang huruf K, M, B, % agar angkanya bisa dihitung oleh sistem
  const cleaned = str.replace(/[^0-9.-]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

// ─── Scoring Engine ───────────────────────────────────────────────────────────

function scoreNFP(events) {
  let score = 0;
  const components = {};

  // 1. ADP Nonfarm
  const adp = findMacroEvent(events, ["ADP Non-Farm"]);
  const adpActual = adp ? parseFFValue(adp.actual) : null;
  const adpForecast = adp ? parseFFValue(adp.forecast) : null;

  if (adpActual !== null && adpForecast !== null) {
    const pts = adpActual > adpForecast ? 50 : -50;
    score += pts;
    components.adp = {
      event: adp.title,
      actual: adp.actual,
      estimate: adp.forecast,
      points: pts,
      status: pts > 0 ? "BEAT" : "MISSED",
    };
  } else {
    components.adp = { event: "ADP Nonfarm", actual: null, estimate: null, points: 0, status: adp ? "UPCOMING" : "NOT THIS WEEK" };
  }

  // 2. ISM PMI
  const ism = findMacroEvent(events, ["ISM Manufacturing PMI", "ISM Services PMI"]);
  const ismActual = ism ? parseFFValue(ism.actual) : null;

  if (ismActual !== null) {
    const pts = ismActual > 50 ? 30 : -30;
    score += pts;
    components.ism = {
      event: ism.title,
      actual: ism.actual,
      estimate: "50.0",
      points: pts,
      status: pts > 0 ? "EXPANSIONARY" : "CONTRACTIONARY",
    };
  } else {
    components.ism = { event: "ISM PMI", actual: null, estimate: null, points: 0, status: ism ? "UPCOMING" : "NOT THIS WEEK" };
  }

  // 3. JOLTs
  const jolts = findMacroEvent(events, ["JOLTS Job Openings"]);
  const joltsActual = jolts ? parseFFValue(jolts.actual) : null;
  const joltsForecast = jolts ? parseFFValue(jolts.forecast) : null;

  if (joltsActual !== null && joltsForecast !== null) {
    const pts = joltsActual > joltsForecast ? 20 : -20;
    score += pts;
    components.jolts = {
      event: jolts.title,
      actual: jolts.actual,
      estimate: jolts.forecast,
      points: pts,
      status: pts > 0 ? "BEAT" : "MISSED",
    };
  } else {
    components.jolts = { event: "JOLTs Job Openings", actual: null, estimate: null, points: 0, status: jolts ? "UPCOMING" : "NOT THIS WEEK" };
  }

  let signal = score > 40 ? "GOOD USD (SELL XAU)" : score < -40 ? "BAD USD (BUY XAU)" : "MIXED (WAIT & SEE)";
  return { score, signal, components };
}

function scoreCPI(events) {
  let score = 0;
  const components = {};

  // 1. PPI
  const ppi = findMacroEvent(events, ["PPI m/m", "Core PPI"]);
  const ppiActual = ppi ? parseFFValue(ppi.actual) : null;
  const ppiForecast = ppi ? parseFFValue(ppi.forecast) : null;

  if (ppiActual !== null && ppiForecast !== null) {
    const pts = ppiActual > ppiForecast ? 60 : -60;
    score += pts;
    components.ppi = {
      event: ppi.title,
      actual: ppi.actual,
      estimate: ppi.forecast,
      points: pts,
      status: pts > 0 ? "BEAT" : "MISSED",
    };
  } else {
    components.ppi = { event: "Producer Price Index", actual: null, estimate: null, points: 0, status: ppi ? "UPCOMING" : "NOT THIS WEEK" };
  }

  // 2. Crude Oil (API diblokir, skor dinonaktifkan sementara)
  components.crude = { event: "Crude Oil WTI", current: "N/A", avg30: "N/A", points: 0, status: "DISABLED" };

  let signal = score > 40 ? "GOOD USD (SELL XAU)" : score < -40 ? "BAD USD (BUY XAU)" : "MIXED (WAIT & SEE)";
  return { score, signal, components };
}

// ─── Serverless Handler ───────────────────────────────────────────────────────

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    return res.status(200).end();
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  try {
    console.log("Fetching Forex Factory JSON...");
    const events = await fetchForexFactoryData();

    const nfp = scoreNFP(events);
    const cpi = scoreCPI(events);

    const payload = {
      success: true,
      timestamp: new Date().toISOString(),
      nfp,
      cpi,
      meta: {
        dataSource: "Forex Factory Public Feed",
        note: "100% Free Tier. Shows data for Current & Last Week only.",
      }
    };

    return res.status(200).json(payload);
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
};