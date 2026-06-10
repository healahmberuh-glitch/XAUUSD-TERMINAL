// api/predict.js — DEPRESSEDESIGN Macro Predictor Backend
// Vercel Serverless Function (Node.js) - TRADINGVIEW EDITION (100% FREE & STABLE)

const axios = require("axios");

// ─── TradingView Public API ──────────────────────────────────────────────────
// Menembak langsung ke server kalender TradingView dengan rentang waktu dinamis
async function fetchTradingViewData() {
  try {
    const today = new Date();
    
    // Tarik data 45 hari ke belakang
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - 45);
    
    // Tarik jadwal 15 hari ke depan
    const toDate = new Date(today);
    toDate.setDate(today.getDate() + 15);

    const url = `https://economic-calendar.tradingview.com/events?from=${fromDate.toISOString()}&to=${toDate.toISOString()}&countries=US`;

    const res = await axios.get(url, {
      timeout: 10000,
      headers: {
        'Origin': 'https://www.tradingview.com',
        'Referer': 'https://www.tradingview.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36)'
      }
    });

    return res.data && res.data.result ? res.data.result : [];
  } catch (err) {
    console.error("TradingView API fetch error:", err.message);
    return [];
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findTVEvent(events, keywords) {
  const matches = events.filter(e => {
    // TradingView menyimpan nama berita di 'title' atau 'indicator'
    const title = (e.title || e.indicator || "").toLowerCase();
    return keywords.some(kw => title.includes(kw.toLowerCase()));
  });

  if (matches.length === 0) return null;
  
  // Urutkan berdasarkan tanggal terbaru (descending)
  matches.sort((a, b) => new Date(b.date) - new Date(a.date));
  return matches[0];
}

// ─── Scoring Engine ───────────────────────────────────────────────────────────

function scoreNFP(events) {
  let score = 0;
  const components = {};

  // 1. ADP Nonfarm
  const adp = findTVEvent(events, ["adp employment", "adp nonfarm"]);
  if (adp && adp.actual !== undefined && adp.forecast !== undefined) {
    const pts = adp.actual > adp.forecast ? 50 : -50;
    score += pts;
    components.adp = {
      event: adp.title || "ADP Nonfarm",
      actual: adp.actual,
      estimate: adp.forecast,
      points: pts,
      status: pts > 0 ? "BEAT" : "MISSED",
    };
  } else {
    components.adp = { event: "ADP Nonfarm", actual: null, estimate: null, points: 0, status: adp ? "UPCOMING" : "NO DATA" };
  }

  // 2. ISM PMI (Cari Manufacturing atau Services)
  const ism = findTVEvent(events, ["ism manufacturing", "ism services"]);
  if (ism && ism.actual !== undefined) {
    const pts = ism.actual > 50 ? 30 : -30;
    score += pts;
    components.ism = {
      event: ism.title || "ISM PMI",
      actual: ism.actual,
      estimate: 50.0,
      points: pts,
      status: pts > 0 ? "EXPANSIONARY" : "CONTRACTIONARY",
    };
  } else {
    components.ism = { event: "ISM PMI", actual: null, estimate: null, points: 0, status: ism ? "UPCOMING" : "NO DATA" };
  }

  // 3. JOLTs
  const jolts = findTVEvent(events, ["jolts"]);
  if (jolts && jolts.actual !== undefined && jolts.forecast !== undefined) {
    const pts = jolts.actual > jolts.forecast ? 20 : -20;
    score += pts;
    components.jolts = {
      event: jolts.title || "JOLTs Job Openings",
      actual: jolts.actual,
      estimate: jolts.forecast,
      points: pts,
      status: pts > 0 ? "BEAT" : "MISSED",
    };
  } else {
    components.jolts = { event: "JOLTs Job Openings", actual: null, estimate: null, points: 0, status: jolts ? "UPCOMING" : "NO DATA" };
  }

  let signal = score > 40 ? "GOOD USD (SELL XAU)" : score < -40 ? "BAD USD (BUY XAU)" : "MIXED (WAIT & SEE)";
  return { score, signal, components };
}

function scoreCPI(events) {
  let score = 0;
  const components = {};

  // 1. PPI
  const ppi = findTVEvent(events, ["producer price index", "ppi m/m", "core ppi"]);
  if (ppi && ppi.actual !== undefined && ppi.forecast !== undefined) {
    const pts = ppi.actual > ppi.forecast ? 60 : -60;
    score += pts;
    components.ppi = {
      event: ppi.title || "Producer Price Index",
      actual: ppi.actual,
      estimate: ppi.forecast,
      points: pts,
      status: pts > 0 ? "BEAT" : "MISSED",
    };
  } else {
    components.ppi = { event: "Producer Price Index", actual: null, estimate: null, points: 0, status: ppi ? "UPCOMING" : "NO DATA" };
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
    console.log("Fetching Macro Data from TradingView...");
    const events = await fetchTradingViewData();

    const nfp = scoreNFP(events);
    const cpi = scoreCPI(events);

    const payload = {
      success: true,
      timestamp: new Date().toISOString(),
      nfp,
      cpi,
      meta: {
        dataSource: "TradingView Engine",
        note: "100% Free & Unrestricted. Data synced with TradingView calendar.",
      }
    };

    return res.status(200).json(payload);
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
};