// api/predict.js — DEPRESSEDESIGN Macro Predictor Backend
// Vercel Serverless Function (Node.js) - V17 (MTF AGGRESSIVE SNIPER ENGINE)

const axios = require("axios");

const TELEGRAM_TOKEN = "8325927674:AAF3xv3r0NRRTet5H-xaK1DKIwWshemVOeU"; 
const TELEGRAM_CHAT_ID = "5595296615";

// ─── GLOBAL MEMORY CACHE ─────────────────────────────────────────────────────
let lastSentSignalID = "";
let isSignalActive = false;
let cachedEvents = [];
let lastFetchTime = 0;
let warnedEvents = new Set();

// ─── TELEGRAM SENDERS ────────────────────────────────────────────────────────
async function sendTelegramAlert(masterSignal, totalScore, dxy, nfp, cpi, growth, fed) {
  try {
    if (totalScore > -40 && totalScore < 40) return;
    const isSell = totalScore >= 40;
    const mainIcon = isSell ? "🔴" : "🟢";
    const message = `<b>${mainIcon} DEPRESSEDESIGN MACRO TERMINAL ${mainIcon}</b>\n━━━━━━━━━━━━━━━━━━━━━━\n🎯 <b>SIGNAL:</b> ${isSell ? "SELL XAU/USD" : "BUY XAU/USD"}\n📊 <b>SCORE:</b> ${totalScore > 0 ? "+" : ""}${totalScore}\n💵 <b>DXY LIVE:</b> ${dxy.current} <i>(${dxy.status})</i>\n━━━━━━━━━━━━━━━━━━━━━━\n⚙️ <b>ENGINE BREAKDOWN:</b>\n${nfp.score > 0 ? "🟥" : nfp.score < 0 ? "🟩" : "🟨"} <b>NFP</b>: ${nfp.score > 0 ? "+" : ""}${nfp.score} pts\n${cpi.score > 0 ? "🟥" : cpi.score < 0 ? "🟩" : "🟨"} <b>CPI</b>: ${cpi.score > 0 ? "+" : ""}${cpi.score} pts\n${growth.score > 0 ? "🟥" : growth.score < 0 ? "🟩" : "🟨"} <b>GROWTH</b>: ${growth.score > 0 ? "+" : ""}${growth.score} pts\n${fed.score > 0 ? "🟥" : fed.score < 0 ? "🟩" : "🟨"} <b>FED</b>: ${fed.score > 0 ? "+" : ""}${fed.score} pts`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML", disable_web_page_preview: true });
  } catch (err) {}
}

async function sendTechnicalSignalTelegram(tech) {
  try {
    const icon = tech.position.includes("BUY") ? "🟢" : "🔴";
    const message = `${icon} <b>AGRESSIVE MTF SIGNAL DETECTED</b> ${icon}\n━━━━━━━━━━━━━━━━━━━━━━\n🎯 <b>POSITION:</b> ${tech.position}\n💸 <b>ENTRY AREA (M1):</b> $${tech.entry}\n🛑 <b>STOP LOSS:</b> $${tech.sl}\n💰 <b>TARGET 1:</b> $${tech.tp1}\n💰 <b>TARGET 2:</b> $${tech.tp2}\n━━━━━━━━━━━━━━━━━━━━━━\n📝 <b>TOP-DOWN ANALYSIS REASONING:</b>\n${tech.reason.map(r => `• ${r}`).join('\n')}`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML" });
  } catch (err) {}
}

async function sendInvalidSignalTelegram() {
  try {
    const message = `⚠️ <b>SIGNAL UPDATE: INVALID / CLOSED</b> ⚠️\n━━━━━━━━━━━━━━━━━━━━━━\nHarga (M1) telah meninggalkan zona eksekusi (SL Hit / Invalidasi arah).\nSinyal teknikal dibatalkan. Kembali ke mode WAIT & SEE.`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML" });
  } catch (err) {}
}

async function sendPreNewsWarning(newsItem) {
  try {
    const message = `⏳ <b>PRE-NEWS WARNING</b> ⏳\n━━━━━━━━━━━━━━━━━━━━━━\n🚨 <b>${newsItem.title || newsItem.indicator || "USD High Impact News"}</b> \nAkan rilis dalam <b>5 MENIT!</b>\n📊 <b>Forecast:</b> ${newsItem.forecast || "N/A"}\n⚠️ <i>Siap-siap volatilitas tinggi. Amankan SL atau hindari entry!</i>`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML" });
  } catch (err) {}
}

// ─── THE SMART CACHE ENGINE ──────────────────────────────────────────────────
async function fetchTradingViewData() {
  const now = Date.now();
  let needFreshData = false;
  if (cachedEvents.length === 0 || (now - lastFetchTime) > 900000) needFreshData = true;
  else {
    const hasNewsWindow = cachedEvents.some(e => {
      if (e.country !== "US" && e.currency !== "USD") return false;
      const diffMins = (now - new Date(e.date).getTime()) / 60000;
      return diffMins >= -5 && diffMins <= 15; 
    });
    if (hasNewsWindow) needFreshData = true;
  }

  if (!needFreshData) return cachedEvents;

  try { 
    const today = new Date(); const fromDate = new Date(today); fromDate.setDate(today.getDate() - 45); const toDate = new Date(today); toDate.setDate(today.getDate() + 15); 
    const res = await axios.get(`https://economic-calendar.tradingview.com/events?from=${fromDate.toISOString()}&to=${toDate.toISOString()}&countries=US`, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Origin': 'https://www.tradingview.com', 'Referer': 'https://www.tradingview.com/' } }); 
    if (res.data && res.data.result && res.data.result.length > 0) { cachedEvents = res.data.result; lastFetchTime = now; }
    return cachedEvents;
  } catch (err) { return cachedEvents; } 
}

// ─── MULTI-TIMEFRAME (MTF) MATH UTILITIES ────────────────────────────────────
function calculateEMA(data, period) { const k = 2 / (period + 1); let emaArray = [data[0]]; for (let i = 1; i < data.length; i++) { emaArray.push(data[i] * k + emaArray[i - 1] * (1 - k)); } return emaArray; }
function findPivots(highs, lows, leftBars, rightBars) { let pivotHighs = []; let pivotLows = []; for (let i = leftBars; i < highs.length - rightBars; i++) { let isHigh = true; let isLow = true; for (let j = i - leftBars; j <= i + rightBars; j++) { if (i === j) continue; if (highs[j] >= highs[i]) isHigh = false; if (lows[j] <= lows[i]) isLow = false; } if (isHigh) pivotHighs.push({ index: i, val: highs[i] }); if (isLow) pivotLows.push({ index: i, val: lows[i] }); } return { pivotHighs, pivotLows }; }

async function fetchChartData(interval, range) {
  const res = await axios.get(`https://query2.finance.yahoo.com/v8/finance/chart/GC=F?interval=${interval}&range=${range}`, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const q = res.data.chart.result[0].indicators.quote[0];
  let c = [], o = [], h = [], l = [], v = [];
  for(let i=0; i<q.close.length; i++) { if(q.close[i] !== null) { c.push(q.close[i]); o.push(q.open[i]); h.push(q.high[i]); l.push(q.low[i]); v.push(q.volume[i] || 0); } }
  return { c, o, h, l, v, current: c[c.length - 1] };
}

// ─── THE NEW MTF AGGRESSIVE ENGINE ───────────────────────────────────────────
async function calculateNativeAlgorithms() {
  try {
    // Tarik 3 Timeframe Sekaligus: H1 (Trend), M15 (Structure), M1 (Execution)
    const [h1, m15, m1] = await Promise.all([
      fetchChartData('1h', '5d'),
      fetchChartData('15m', '2d'),
      fetchChartData('1m', '1d')
    ]);

    const currentPrice = m1.current;

    // 1. HTF ANALYSIS (H1) - Tren Utama
    const h1Ema20 = calculateEMA(h1.c, 20);
    const h1Ema50 = calculateEMA(h1.c, 50);
    const h1Trend = h1Ema20[h1Ema20.length - 1] > h1Ema50[h1Ema50.length - 1] ? "BULLISH" : "BEARISH";

    // 2. MTF ANALYSIS (M15) - Penentuan Area Konfirmasi / POI
    const m15Pivots = findPivots(m15.h, m15.l, 5, 5);
    const m15Res = m15Pivots.pivotHighs.length > 0 ? m15Pivots.pivotHighs[m15Pivots.pivotHighs.length - 1].val : m15.h[m15.h.length - 5];
    const m15Sup = m15Pivots.pivotLows.length > 0 ? m15Pivots.pivotLows[m15Pivots.pivotLows.length - 1].val : m15.l[m15.l.length - 5];

    let position = "WAIT & SEE / NO SETUP";
    let entry = currentPrice.toFixed(2);
    let sl = (currentPrice - 2).toFixed(2);
    let tp1 = (currentPrice + 4).toFixed(2);
    let tp2 = (currentPrice + 8).toFixed(2);
    let reasonArr = [];

    // 3. LTF EXECUTION (M1) - Penembak Jitu Agresif
    // SETUP BUY: H1 Bullish, dan harga (M1) jatuh menyentuh Support/Demand M15
    if (h1Trend === "BULLISH" && currentPrice <= (m15Sup + 2.5) && currentPrice >= (m15Sup - 1.5)) {
      position = "BUY LIMIT / BUY NOW (LTF AGGRESSIVE)";
      entry = currentPrice.toFixed(2);
      sl = (m15Sup - 3).toFixed(2); // SL super tipis di bawah Support M15
      tp1 = (currentPrice + 5).toFixed(2);
      tp2 = (currentPrice + 12).toFixed(2);
      reasonArr = [
        `HTF (H1): Market structure & EMA Trend adalah BULLISH`,
        `MTF (M15): Harga terkoreksi ke zona Demand / Order Block ($${m15Sup.toFixed(2)})`,
        `LTF (M1): Momentum oversold agresif, siap eksekusi rejection ke atas`
      ];
    }
    // SETUP SELL: H1 Bearish, dan harga (M1) meroket menyentuh Resistance/Supply M15
    else if (h1Trend === "BEARISH" && currentPrice >= (m15Res - 2.5) && currentPrice <= (m15Res + 1.5)) {
      position = "SELL LIMIT / SELL NOW (LTF AGGRESSIVE)";
      entry = currentPrice.toFixed(2);
      sl = (m15Res + 3).toFixed(2); // SL super tipis di atas Resistance M15
      tp1 = (currentPrice - 5).toFixed(2);
      tp2 = (currentPrice - 12).toFixed(2);
      reasonArr = [
        `HTF (H1): Market structure & EMA Trend adalah BEARISH`,
        `MTF (M15): Harga *rally* ke zona Supply / Order Block ($${m15Res.toFixed(2)})`,
        `LTF (M1): Momentum overbought agresif, siap eksekusi penolakan ke bawah`
      ];
    } else {
      // Kondisi No Setup (Menunggu)
      const targetArea = h1Trend === "BULLISH" ? m15Sup : m15Res;
      reasonArr = [
        `HTF (H1): Trend skala besar terpantau ${h1Trend}`,
        `MTF (M15): Menunggu harga masuk ke zona eksekusi SMC ($${targetArea.toFixed(2)})`,
        `LTF (M1): Harga saat ini ($${currentPrice.toFixed(2)}) belum memicu sinyal agresif`
      ];
    }

    return { currentPrice: currentPrice.toFixed(2), position, entry, sl, tp1, tp2, reason: reasonArr };
  } catch (err) {
    return { currentPrice: "N/A", position: "WAIT & SEE / NO SETUP", entry: "0", sl: "0", tp1: "0", tp2: "0", reason: ["Menunggu sinkronisasi data chart MTF."] };
  }
}

// ─── DATA FETCHERS & SCORING ENGINES ─────────────────────────────────────────
async function fetchDXY() { try { const res = await axios.get('https://query2.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=2d', { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }); const current = res.data.chart.result[0].meta.regularMarketPrice; return { current: parseFloat(current.toFixed(2)), status: current >= res.data.chart.result[0].meta.previousClose ? "BULLISH (UP)" : "BEARISH (DOWN)" }; } catch (err) { return { current: "N/A", status: "OFFLINE" }; } }
async function fetchCrudeOil() { try { const res = await axios.get('https://query2.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d&range=45d', { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }); const closes = res.data.chart.result[0].indicators.quote[0].close.filter(c => c !== null); return { current: closes[closes.length - 1], avg30: closes.slice(-30).reduce((a,b) => a+b, 0) / Math.min(closes.length, 30) }; } catch (err) { return { current: null, avg30: null }; } }
function findLatestReleasedEvent(events, keywords) { const matches = events.filter(e => keywords.some(kw => (e.title || e.indicator || "").toLowerCase().includes(kw.toLowerCase())) && e.actual !== undefined && e.actual !== null && e.actual !== ""); if (matches.length === 0) return null; matches.sort((a, b) => new Date(b.date) - new Date(a.date)); return matches[0]; }

function scoreNFP(events) { let score = 0; const components = {}; const adp = findLatestReleasedEvent(events, ["adp employment", "adp nonfarm"]); if (adp) { const pts = adp.actual > adp.forecast ? 40 : -40; score += pts; components.adp = { event: adp.title, actual: adp.actual, estimate: adp.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" }; } else components.adp = { event: "ADP Nonfarm", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" }; const ism = findLatestReleasedEvent(events, ["ism manufacturing", "ism services"]); if (ism) { const pts = ism.actual > 50 ? 30 : -30; score += pts; components.ism = { event: ism.title, actual: ism.actual, estimate: 50.0, points: pts, status: pts > 0 ? "EXPANSIONARY" : "CONTRACTIONARY" }; } else components.ism = { event: "ISM PMI", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" }; const jolts = findLatestReleasedEvent(events, ["jolts"]); if (jolts) { const pts = jolts.actual > jolts.forecast ? 30 : -30; score += pts; components.jolts = { event: jolts.title, actual: jolts.actual, estimate: jolts.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" }; } else components.jolts = { event: "JOLTs Job Openings", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" }; return { score, signal: score >= 20 ? "GOOD USD" : score <= -20 ? "BAD USD" : "MIXED", components }; }
function scoreCPI(events, crudeOil) { let score = 0; const components = {}; const ppi = findLatestReleasedEvent(events, ["producer price index", "ppi m/m", "core ppi"]); if (ppi) { const pts = ppi.actual > ppi.forecast ? 60 : -60; score += pts; components.ppi = { event: ppi.title, actual: ppi.actual, estimate: ppi.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" }; } else components.ppi = { event: "Producer Price Index", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" }; if (crudeOil && crudeOil.current !== null) { const pts = crudeOil.current > crudeOil.avg30 ? 40 : -40; score += pts; components.crude = { event: "Crude Oil WTI", current: crudeOil.current, avg30: crudeOil.avg30, points: pts, status: pts > 0 ? "ABOVE" : "BELOW" }; } else components.crude = { event: "Crude Oil WTI", points: 0, status: "FAILED" }; return { score, signal: score >= 20 ? "HIGH INFLATION" : score <= -20 ? "LOW INFLATION" : "MIXED", components }; }
function scoreGrowth(events) { let score = 0; const components = {}; const gdp = findLatestReleasedEvent(events, ["gdp growth rate", "gross domestic product"]); if (gdp) { const pts = gdp.actual > gdp.forecast ? 50 : -50; score += pts; components.gdp = { event: gdp.title, actual: gdp.actual, estimate: gdp.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" }; } else components.gdp = { event: "GDP Growth Rate", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" }; const retail = findLatestReleasedEvent(events, ["retail sales m/m", "core retail sales"]); if (retail) { const pts = retail.actual > retail.forecast ? 50 : -50; score += pts; components.retail = { event: retail.title, actual: retail.actual, estimate: retail.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" }; } else components.retail = { event: "Retail Sales", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" }; return { score, signal: score >= 20 ? "STRONG" : score <= -20 ? "WEAK" : "MIXED", components }; }
function scoreFed(events) { let score = 0; const components = {}; const fed = findLatestReleasedEvent(events, ["fed interest rate", "interest rate decision"]); if (fed) { const pts = fed.actual >= fed.forecast ? 100 : -100; score += pts; components.fed = { event: fed.title, actual: fed.actual, estimate: fed.forecast, points: pts, status: pts > 0 ? "HAWKISH" : "DOVISH" }; } else components.fed = { event: "Fed Interest Rate", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" }; return { score, signal: score > 0 ? "HAWKISH" : score < 0 ? "DOVISH" : "MIXED", components }; }

// ─── MAIN ROUTER HANDLER ─────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method === "OPTIONS") { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS"); return res.status(200).end(); }
  res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Content-Type", "application/json");

  const isCron = req.query.cron === "true";

  if (req.method === "POST" && req.body && req.body.message) {
    if (req.body.message.text === "/refresh") {
      const [events, crudeOil, dxy, tech] = await Promise.all([ fetchTradingViewData(), fetchCrudeOil(), fetchDXY(), calculateNativeAlgorithms() ]);
      const nfp = scoreNFP(events); const cpi = scoreCPI(events, crudeOil); const growth = scoreGrowth(events); const fed = scoreFed(events);
      const totalScore = nfp.score + cpi.score + growth.score + fed.score;
      await sendTelegramAlert(totalScore >= 40 ? "SELL" : "BUY", totalScore, dxy, nfp, cpi, growth, fed);
      return res.status(200).json({ success: true });
    }
    return res.status(200).json({ success: true });
  }

  try {
    const [events, crudeOil, dxy, tech] = await Promise.all([ fetchTradingViewData(), fetchCrudeOil(), fetchDXY(), calculateNativeAlgorithms() ]);
    const nfp = scoreNFP(events); const cpi = scoreCPI(events, crudeOil); const growth = scoreGrowth(events); const fed = scoreFed(events);
    const totalScore = nfp.score + cpi.score + growth.score + fed.score;
    const masterSignal = totalScore >= 40 ? "STRONG SELL XAU" : totalScore <= -40 ? "STRONG BUY XAU" : "NEUTRAL";

    if (isCron) {
      // Logic Anti-Spam (Agresif M1)
      const currentSignalID = tech.position + "_" + tech.entry;
      
      if (!tech.position.includes("WAIT & SEE")) {
        // Kalau ketemu setup agresif baru
        if (currentSignalID !== lastSentSignalID) {
          await sendTechnicalSignalTelegram(tech);
          lastSentSignalID = currentSignalID; 
          isSignalActive = true;
        }
      } else {
        // Kalau harga udah kabur dari zona / invalid
        if (isSignalActive === true) {
          await sendInvalidSignalTelegram();
          lastSentSignalID = ""; 
          isSignalActive = false;
        }
      }

      // Logic Pre-News Warning
      const nowMs = Date.now();
      const upcomingNews = events.filter(e => {
        if (e.country !== "US" && e.currency !== "USD") return false;
        const diffMins = (new Date(e.date).getTime() - nowMs) / 60000;
        return diffMins > 0 && diffMins <= 5;
      });
      for (const news of upcomingNews) {
        const eventId = (news.title || "news") + "_" + news.date;
        if (!warnedEvents.has(eventId)) {
          await sendPreNewsWarning(news);
          warnedEvents.add(eventId);
          if (warnedEvents.size > 100) warnedEvents.clear(); 
        }
      }
    } else {
      await sendTelegramAlert(masterSignal, totalScore, dxy, nfp, cpi, growth, fed);
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      dxy_live: dxy,
      master_signal: { signal: masterSignal, total_score: totalScore },
      nfp, cpi, growth, fed,
      technical_signal: tech
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
