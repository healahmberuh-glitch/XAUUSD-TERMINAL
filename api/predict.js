// api/predict.js — DEPRESSEDESIGN Macro Predictor Backend
// Vercel Serverless Function (Node.js) - TRADINGVIEW EDITION V3 (PREDICTIVE LOGIC & CRUDE OIL)

const axios = require("axios");

// ─── Fetch TradingView Calendar ──────────────────────────────────────────────
async function fetchTradingViewData() {
  try {
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - 45); // Tarik 45 hari ke belakang
    const toDate = new Date(today);
    toDate.setDate(today.getDate() + 15);   // Tarik 15 hari ke depan

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

// ─── Fetch Crude Oil (Yahoo Finance Direct API) ─────────────────────────────
// Menggunakan direct URL untuk menghindari Vercel 429 Too Many Requests
async function fetchCrudeOil() {
  try {
    const url = 'https://query2.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d&range=45d';
    const res = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const result = res.data.chart.result[0];
    const closes = result.indicators.quote[0].close.filter(c => c !== null);
    
    if (closes.length === 0) return { current: null, avg30: null };

    const current = closes[closes.length - 1];
    const last30 = closes.slice(-30);
    const avg30 = last30.reduce((a,b) => a+b, 0) / last30.length;
    
    return { current, avg30 };
  } catch (err) {
    console.error("Crude Oil fetch error:", err.message);
    return { current: null, avg30: null };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function findLatestReleasedEvent(events, keywords) {
  const matches = events.filter(e => {
    const title = (e.title || e.indicator || "").toLowerCase();
    const isMatch = keywords.some(kw => title.includes(kw.toLowerCase()));
    
    // KUNCI PREDIKSI: Hanya ambil event yang SUDAH ADA angka actual-nya (sudah rilis)
    const hasActual = e.actual !== undefined && e.actual !== null && e.actual !== "";
    return isMatch && hasActual;
  });

  if (matches.length === 0) return null;
  // Urutkan berdasarkan tanggal terbaru (descending)
  matches.sort((a, b) => new Date(b.date) - new Date(a.date));
  return matches[0]; // Selalu mengembalikan rilis data aktual yang paling terakhir
}

// ─── Scoring Engine ───────────────────────────────────────────────────────────

function scoreNFP(events) {
  let score = 0;
  const components = {};

  // 1. ADP Nonfarm
  const adp = findLatestReleasedEvent(events, ["adp employment", "adp nonfarm"]);
  if (adp && adp.forecast !== undefined && adp.forecast !== null) {
    const pts = adp.actual > adp.forecast ? 50 : -50;
    score += pts;
    components.adp = {
      event: adp.title || "ADP Nonfarm",
      actual: adp.actual,
      estimate: adp.forecast,
      points: pts,
      status: pts > 0 ? "BEAT" : "MISSED",
    };
  } else if (adp) {
    components.adp = { event: adp.title, actual: adp.actual, estimate: "N/A", points: 0, status: "NO FORECAST" };
  } else {
    components.adp = { event: "ADP Nonfarm", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };
  }

  // 2. ISM PMI
  const ism = findLatestReleasedEvent(events, ["ism manufacturing", "ism services"]);
  if (ism) {
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
    components.ism = { event: "ISM PMI", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };
  }

  // 3. JOLTs
  const jolts = findLatestReleasedEvent(events, ["jolts"]);
  if (jolts && jolts.forecast !== undefined && jolts.forecast !== null) {
    const pts = jolts.actual > jolts.forecast ? 20 : -20;
    score += pts;
    components.jolts = {
      event: jolts.title || "JOLTs Job Openings",
      actual: jolts.actual,
      estimate: jolts.forecast,
      points: pts,
      status: pts > 0 ? "BEAT" : "MISSED",
    };
  } else if (jolts) {
    components.jolts = { event: jolts.title, actual: jolts.actual, estimate: "N/A", points: 0, status: "NO FORECAST" };
  } else {
    components.jolts = { event: "JOLTs Job Openings", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };
  }

  let signal = score > 40 ? "GOOD USD (SELL XAU)" : score < -40 ? "BAD USD (BUY XAU)" : "MIXED (WAIT & SEE)";
  return { score, signal, components };
}

function scoreCPI(events, crudeOil) {
  let score = 0;
  const components = {};

  // 1. PPI
  const ppi = findLatestReleasedEvent(events, ["producer price index", "ppi m/m", "core ppi"]);
  if (ppi && ppi.forecast !== undefined && ppi.forecast !== null) {
    const pts = ppi.actual > ppi.forecast ? 60 : -60;
    score += pts;
    components.ppi = {
      event: ppi.title || "Producer Price Index",
      actual: ppi.actual,
      estimate: ppi.forecast,
      points: pts,
      status: pts > 0 ? "BEAT" : "MISSED",
    };
  } else if (ppi) {
    components.ppi = { event: ppi.title, actual: ppi.actual, estimate: "N/A", points: 0, status: "NO FORECAST" };
  } else {
    components.ppi = { event: "Producer Price Index", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };
  }

  // 2. Crude Oil (RESTORED!)
  if (crudeOil && crudeOil.current !== null && crudeOil.avg30 !== null) {
    const pts = crudeOil.current > crudeOil.avg30 ? 40 : -40;
    score += pts;
    components.crude = {
      event: "Crude Oil WTI (CL=F)",
      current: parseFloat(crudeOil.current.toFixed(2)),
      avg30: parseFloat(crudeOil.avg30.toFixed(2)),
      points: pts,
      status: pts > 0 ? "ABOVE 30-DAY AVG" : "BELOW 30-DAY AVG",
    };
  } else {
    components.crude = { event: "Crude Oil WTI (CL=F)", current: "N/A", avg30: "N/A", points: 0, status: "FETCH FAILED" };
  }

  let signal = score > 40 ? "HIGH INFLATION / GOOD USD (SELL XAU)" : score < -40 ? "LOW INFLATION / BAD USD (BUY XAU)" : "MIXED (WAIT & SEE)";
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
    // Tarik data TradingView dan Crude Oil secara bersamaan
    const [events, crudeOil] = await Promise.all([
      fetchTradingViewData(),
      fetchCrudeOil()
    ]);

    const nfp = scoreNFP(events);
    const cpi = scoreCPI(events, crudeOil);

    const payload = {
      success: true,
      timestamp: new Date().toISOString(),
      nfp,
      cpi,
      meta: {
        dataSource: "TradingView Engine & Yahoo Direct",
        note: "Predictive Logic: Fetching only the latest released actual data.",
      }
    };

    return res.status(200).json(payload);
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
};
