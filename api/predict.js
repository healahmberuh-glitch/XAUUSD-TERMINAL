// api/predict.js — DEPRESSEDESIGN Macro Predictor Backend
// Vercel Serverless Function (Node.js) - V5 (DXY METER + TELEGRAM ALERT)

const axios = require("axios");

// ─── TELEGRAM CONFIGURATION ──────────────────────────────────────────────────
const TELEGRAM_TOKEN = "8325927674:AAF3xv3r0NRRTet5H-xaK1DKIwWshemVOeU"; 
const TELEGRAM_CHAT_ID = "5595296615";

// Fungsi untuk menembak pesan ke Telegram
async function sendTelegramAlert(masterSignal, totalScore, dxyCurrent) {
  try {
    // Bot HANYA ngirim pesan kalau sinyalnya STRONG (Skor >= 40 atau <= -40)
    // Kalau mau bot selalu ngirim pesan setiap di-refresh, hapus atau beri comment (//) pada baris di bawah ini:
    if (totalScore > -40 && totalScore < 40) return;

    const emoji = totalScore >= 40 ? "🔴" : "🟢";
    const action = totalScore >= 40 ? "SELL XAU/USD" : "BUY XAU/USD";
    
    const message = `
${emoji} *DEPRESSEDESIGN MACRO ALERT* ${emoji}

*SIGNAL:* ${action} (Skor: ${totalScore})
*DXY (US Dollar):* ${dxyCurrent}

_Cek dashboard untuk detail lengkap:_
[Buka Dashboard](https://depressedesign-macro.vercel.app/)
    `;

    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "Markdown",
      disable_web_page_preview: true
    });
    console.log("Telegram alert sent!");
  } catch (err) {
    console.error("Telegram send error:", err.message);
  }
}

// ─── Fetch DXY (US Dollar Index) ──────────────────────────────────────────────
async function fetchDXY() {
  try {
    const url = 'https://query2.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=2d';
    const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const result = res.data.chart.result[0];
    
    const current = result.meta.regularMarketPrice;
    const previous = result.meta.previousClose;
    const changePercent = ((current - previous) / previous) * 100;
    
    return { 
      current: parseFloat(current.toFixed(2)), 
      changePercent: parseFloat(changePercent.toFixed(2)),
      status: changePercent >= 0 ? "BULLISH (UP)" : "BEARISH (DOWN)"
    };
  } catch (err) {
    console.error("DXY fetch error:", err.message);
    return { current: "N/A", changePercent: "N/A", status: "FETCH FAILED" };
  }
}

// ─── Fetch TradingView Calendar ──────────────────────────────────────────────
async function fetchTradingViewData() {
  try {
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - 45); 
    const toDate = new Date(today);
    toDate.setDate(today.getDate() + 15);   

    const url = `https://economic-calendar.tradingview.com/events?from=${fromDate.toISOString()}&to=${toDate.toISOString()}&countries=US`;
    const res = await axios.get(url, {
      timeout: 10000,
      headers: {
        'Origin': 'https://www.tradingview.com',
        'Referer': 'https://www.tradingview.com/',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    return res.data && res.data.result ? res.data.result : [];
  } catch (err) {
    return [];
  }
}

// ─── Fetch Crude Oil ─────────────────────────────
async function fetchCrudeOil() {
  try {
    const url = 'https://query2.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d&range=45d';
    const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const result = res.data.chart.result[0];
    const closes = result.indicators.quote[0].close.filter(c => c !== null);
    
    if (closes.length === 0) return { current: null, avg30: null };
    const current = closes[closes.length - 1];
    const last30 = closes.slice(-30);
    const avg30 = last30.reduce((a,b) => a+b, 0) / last30.length;
    
    return { current, avg30 };
  } catch (err) {
    return { current: null, avg30: null };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function findLatestReleasedEvent(events, keywords) {
  const matches = events.filter(e => {
    const title = (e.title || e.indicator || "").toLowerCase();
    const isMatch = keywords.some(kw => title.includes(kw.toLowerCase()));
    const hasActual = e.actual !== undefined && e.actual !== null && e.actual !== "";
    return isMatch && hasActual;
  });
  if (matches.length === 0) return null;
  matches.sort((a, b) => new Date(b.date) - new Date(a.date));
  return matches[0]; 
}

function getUpcomingNews(events) {
  const now = new Date();
  const upcoming = events.filter(e => new Date(e.date) > now && (e.country === "US" || e.currency === "USD"));
  upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
  return upcoming.slice(0, 5).map(e => ({
    event: e.title || e.indicator,
    date: e.date,
    forecast: e.forecast !== undefined && e.forecast !== null ? e.forecast : "N/A"
  }));
}

// ─── AGGRESSIVE SCORING ENGINE (Threshold: 20) ────────────────────────────────
function scoreNFP(events) {
  let score = 0;
  const components = {};

  const adp = findLatestReleasedEvent(events, ["adp employment", "adp nonfarm"]);
  if (adp && adp.forecast !== undefined && adp.forecast !== null) {
    const pts = adp.actual > adp.forecast ? 40 : -40; score += pts;
    components.adp = { event: adp.title || "ADP Nonfarm", actual: adp.actual, estimate: adp.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" };
  } else components.adp = { event: "ADP Nonfarm", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  const ism = findLatestReleasedEvent(events, ["ism manufacturing", "ism services"]);
  if (ism) {
    const pts = ism.actual > 50 ? 30 : -30; score += pts;
    components.ism = { event: ism.title || "ISM PMI", actual: ism.actual, estimate: 50.0, points: pts, status: pts > 0 ? "EXPANSIONARY" : "CONTRACTIONARY" };
  } else components.ism = { event: "ISM PMI", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  const jolts = findLatestReleasedEvent(events, ["jolts"]);
  if (jolts && jolts.forecast !== undefined && jolts.forecast !== null) {
    const pts = jolts.actual > jolts.forecast ? 30 : -30; score += pts;
    components.jolts = { event: jolts.title || "JOLTs Job Openings", actual: jolts.actual, estimate: jolts.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" };
  } else components.jolts = { event: "JOLTs Job Openings", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  let signal = score >= 20 ? "GOOD USD (SELL XAU)" : score <= -20 ? "BAD USD (BUY XAU)" : "MIXED (WAIT)";
  return { score, signal, components };
}

function scoreCPI(events, crudeOil) {
  let score = 0;
  const components = {};

  const ppi = findLatestReleasedEvent(events, ["producer price index", "ppi m/m", "core ppi"]);
  if (ppi && ppi.forecast !== undefined && ppi.forecast !== null) {
    const pts = ppi.actual > ppi.forecast ? 60 : -60; score += pts;
    components.ppi = { event: ppi.title || "Producer Price Index", actual: ppi.actual, estimate: ppi.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" };
  } else components.ppi = { event: "Producer Price Index", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  if (crudeOil && crudeOil.current !== null && crudeOil.avg30 !== null) {
    const pts = crudeOil.current > crudeOil.avg30 ? 40 : -40; score += pts;
    components.crude = { event: "Crude Oil WTI", current: parseFloat(crudeOil.current.toFixed(2)), avg30: parseFloat(crudeOil.avg30.toFixed(2)), points: pts, status: pts > 0 ? "ABOVE 30-DAY AVG" : "BELOW 30-DAY AVG" };
  } else components.crude = { event: "Crude Oil WTI", current: "N/A", avg30: "N/A", points: 0, status: "FETCH FAILED" };

  let signal = score >= 20 ? "HIGH INFLATION (SELL XAU)" : score <= -20 ? "LOW INFLATION (BUY XAU)" : "MIXED (WAIT)";
  return { score, signal, components };
}

function scoreGrowth(events) {
  let score = 0;
  const components = {};

  const gdp = findLatestReleasedEvent(events, ["gdp growth rate", "gross domestic product"]);
  if (gdp && gdp.forecast !== undefined && gdp.forecast !== null) {
    const pts = gdp.actual > gdp.forecast ? 50 : -50; score += pts;
    components.gdp = { event: gdp.title || "GDP Growth Rate", actual: gdp.actual, estimate: gdp.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" };
  } else components.gdp = { event: "GDP Growth Rate", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  const retail = findLatestReleasedEvent(events, ["retail sales m/m", "core retail sales"]);
  if (retail && retail.forecast !== undefined && retail.forecast !== null) {
    const pts = retail.actual > retail.forecast ? 50 : -50; score += pts;
    components.retail = { event: retail.title || "Retail Sales", actual: retail.actual, estimate: retail.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" };
  } else components.retail = { event: "Retail Sales", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  let signal = score >= 20 ? "STRONG ECONOMY (SELL XAU)" : score <= -20 ? "WEAK ECONOMY (BUY XAU)" : "MIXED (WAIT)";
  return { score, signal, components };
}

function scoreFed(events) {
  let score = 0;
  const components = {};

  const fed = findLatestReleasedEvent(events, ["fed interest rate decision", "interest rate decision"]);
  if (fed && fed.forecast !== undefined && fed.forecast !== null) {
    const pts = fed.actual >= fed.forecast ? 100 : -100; score += pts;
    components.fed = { event: fed.title || "Fed Interest Rate", actual: fed.actual, estimate: fed.forecast, points: pts, status: pts > 0 ? "HAWKISH" : "DOVISH" };
  } else components.fed = { event: "Fed Interest Rate", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  let signal = score > 0 ? "HAWKISH (SELL XAU)" : score < 0 ? "DOVISH (BUY XAU)" : "MIXED (WAIT)";
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
    const [events, crudeOil, dxy] = await Promise.all([ fetchTradingViewData(), fetchCrudeOil(), fetchDXY() ]);

    const nfp = scoreNFP(events);
    const cpi = scoreCPI(events, crudeOil);
    const growth = scoreGrowth(events);
    const fed = scoreFed(events);

    const totalScore = nfp.score + cpi.score + growth.score + fed.score;
    let masterSignal = "NEUTRAL / CHOPPY MARKET";
    if (totalScore >= 40) masterSignal = "STRONG SELL XAU";
    if (totalScore <= -40) masterSignal = "STRONG BUY XAU";

    // Pemicu Telegram Alert
    await sendTelegramAlert(masterSignal, totalScore, dxy.current);

    const payload = {
      success: true,
      timestamp: new Date().toISOString(),
      dxy_live: dxy,
      master_signal: { signal: masterSignal, total_score: totalScore },
      nfp, cpi, growth, fed,
      upcoming_news: getUpcomingNews(events)
    };

    return res.status(200).json(payload);
  } catch (err) {
    console.error("Predict handler error:", err);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
};
