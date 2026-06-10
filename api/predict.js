// api/predict.js — DEPRESSEDESIGN Macro Predictor Backend
// Vercel Serverless Function (Node.js) - JBLANKED EDITION (100% FREE)

const axios = require("axios");

// ─── Free Public Feeds (No API Key Required) ─────────────────────────────
// Menggunakan JBlanked API untuk menembus blokir IP Vercel terhadap Forex Factory
const API_URL = "https://www.jblanked.com/news/api/forex-factory/calendar/week/";

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function fetchMacroData() {
  try {
    const res = await axios.get(API_URL, { 
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    
    // Fleksibilitas parsing jika struktur JSON dibungkus dalam object 'data'
    if (res.data && Array.isArray(res.data)) {
        return res.data;
    } else if (res.data && res.data.data && Array.isArray(res.data.data)) {
        return res.data.data;
    }
    return [];
  } catch (err) {
    console.error("API fetch error:", err.message);
    return [];
  }
}

function findMacroEvent(events, keywords) {
  const matches = events.filter(e => {
    const currency = (e.currency || e.Currency || "").toUpperCase();
    const title = (e.title || e.event || e.Name || "").toLowerCase();
    
    if (currency !== "USD") return false;
    return keywords.some(kw => title.includes(kw.toLowerCase()));
  });

  if (matches.length === 0) return null;
  // Mengurutkan dari yang paling terbaru
  matches.sort((a, b) => new Date(b.date || b.Date) - new Date(a.date || a.Date));
  return matches[0];
}

function parseValue(str) {
  if (str === null || str === undefined || str === "") return null;
  // Membuang huruf K, M, B, % agar angkanya murni
  const cleaned = String(str).replace(/[^0-9.-]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

// ─── Scoring Engine ───────────────────────────────────────────────────────────

function scoreNFP(events) {
  let score = 0;
  const components = {};

  // 1. ADP Nonfarm
  const adp = findMacroEvent(events, ["adp non-farm", "adp nonfarm"]);
  const adpActual = adp ? parseValue(adp.actual || adp.Actual) : null;
  const adpForecast = adp ? parseValue(adp.forecast || adp.Forecast) : null;

  if (adpActual !== null && adpForecast !== null) {
    const pts = adpActual > adpForecast ? 50 : -50;
    score += pts;
    components.adp = {
      event: adp.title || adp.event,
      actual: adp.actual || adp.Actual,
      estimate: adp.forecast || adp.Forecast,
      points: pts,
      status: pts > 0 ? "BEAT" : "MISSED",
    };
  } else {
    components.adp = { event: "ADP Nonfarm", actual: null, estimate: null, points: 0, status: adp ? "UPCOMING" : "NOT THIS WEEK" };
  }

  // 2. ISM PMI
  const ism = findMacroEvent(events, ["ism manufacturing pmi", "ism services pmi"]);
  const ismActual = ism ? parseValue(ism.actual || ism.Actual) : null;

  if (ismActual !== null) {
    const pts = ismActual > 50 ? 30 : -30;
    score += pts;
    components.ism = {
      event: ism.title || ism.event,
      actual: ism.actual || ism.Actual,
      estimate: "50.0",
      points: pts,
      status: pts > 0 ? "EXPANSIONARY" : "CONTRACTIONARY",
    };
  } else {
    components.ism = { event: "ISM PMI", actual: null, estimate: null, points: 0, status: ism ? "UPCOMING" : "NOT THIS WEEK" };
  }

  // 3. JOLTs
  const jolts = findMacroEvent(events, ["jolts job openings"]);
  const joltsActual = jolts ? parseValue(jolts.actual || jolts.Actual) : null;
  const joltsForecast = jolts ? parseValue(jolts.forecast || jolts.Forecast) : null;

  if (joltsActual !== null && joltsForecast !== null) {
    const pts = joltsActual > joltsForecast ? 20 : -20;
    score += pts;
    components.jolts = {
      event: jolts.title || jolts.event,
      actual: jolts.actual || jolts.Actual,
      estimate: jolts.forecast || jolts.Forecast,
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
  const ppi = findMacroEvent(events, ["ppi m/m", "core ppi"]);
  const ppiActual = ppi ? parseValue(ppi.actual || ppi.Actual) : null;
  const ppiForecast = ppi ? parseValue(ppi.forecast || ppi.Forecast) : null;

  if (ppiActual !== null && ppiForecast !== null) {
    const pts = ppiActual > ppiForecast ? 60 : -60;
    score += pts;
    components.ppi = {
      event: ppi.title || ppi.event,
      actual: ppi.actual || ppi.Actual,
      estimate: ppi.forecast || ppi.Forecast,
      points: pts,
      status: pts > 0 ? "BEAT" : "MISSED",
    };
  } else {
    components.ppi = { event: "Producer Price Index", actual: null, estimate: null, points: 0, status: ppi ? "UPCOMING" : "NOT THIS WEEK" };
  }

  // 2. Crude Oil (Dinonaktifkan sementara)
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
    console.log("Fetching Macro Data from Free API...");
    const events = await fetchMacroData();

    const nfp = scoreNFP(events);
    const cpi = scoreCPI(events);

    const payload = {
      success: true,
      timestamp: new Date().toISOString(),
      nfp,
      cpi,
      meta: {
        dataSource: "Free Community Macro API",
        note: "100% Free Tier. Shows data for this week.",
      }
    };

    return res.status(200).json(payload);
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
};