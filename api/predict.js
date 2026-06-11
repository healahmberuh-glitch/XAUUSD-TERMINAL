// api/predict.js — DEPRESSEDESIGN Macro Predictor Backend
// Vercel Serverless Function (Node.js) - V20 (GLOBAL SENTINEL)

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
    const message = `${icon} <b>INSTITUTIONAL SMC SIGNAL</b> ${icon}\n━━━━━━━━━━━━━━━━━━━━━━\n🎯 <b>POSITION:</b> ${tech.position}\n💸 <b>ENTRY (M1):</b> $${tech.entry}\n🛑 <b>STOP LOSS:</b> $${tech.sl} <i>(ATR Scaled)</i>\n💰 <b>TARGET 1:</b> $${tech.tp1}\n💰 <b>TARGET 2:</b> $${tech.tp2}\n━━━━━━━━━━━━━━━━━━━━━━\n📝 <b>ALGORITHMIC CONFLUENCE:</b>\n${tech.reason.map(r => `• ${r}`).join('\n')}\n━━━━━━━━━━━━━━━━━━━━━━\n🕒 <b>MARKET SESSION:</b> ${tech.session}`;
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

// ─── THE SMART CACHE ENGINE (GLOBAL NEWS UNLOCKED) ───────────────────────────
async function fetchTradingViewData() {
  const now = Date.now();
  let needFreshData = false;
  if (cachedEvents.length === 0 || (now - lastFetchTime) > 900000) needFreshData = true;
  else {
    const hasNewsWindow = cachedEvents.some(e => {
      // Alert Telegram & trigger agresif tetap fokus ke USD aja biar aman
      if (e.country !== "US" && e.currency !== "USD") return false;
      const diffMins = (now - new Date(e.date).getTime()) / 60000;
      return diffMins >= -5 && diffMins <= 15; 
    });
    if (hasNewsWindow) needFreshData = true;
  }
  if (!needFreshData) return cachedEvents;
  try { 
    const today = new Date(); const fromDate = new Date(today); fromDate.setDate(today.getDate() - 2); const toDate = new Date(today); toDate.setDate(today.getDate() + 7); 
    // HAPUS FILTER &countries=US UNTUK MENDAPATKAN SEMUA BERITA GLOBAL
    const res = await axios.get(`https://economic-calendar.tradingview.com/events?from=${fromDate.toISOString()}&to=${toDate.toISOString()}`, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Origin': 'https://www.tradingview.com', 'Referer': 'https://www.tradingview.com/' } }); 
    if (res.data && res.data.result && res.data.result.length > 0) { cachedEvents = res.data.result; lastFetchTime = now; }
    return cachedEvents;
  } catch (err) { return cachedEvents; } 
}

// ─── MATHEMATICAL & TECHNICAL INDICATORS ENGINE (V19) ────────────────────────
function calculateEMA(data, period) { const k = 2 / (period + 1); let emaArray = [data[0]]; for (let i = 1; i < data.length; i++) { emaArray.push(data[i] * k + emaArray[i - 1] * (1 - k)); } return emaArray; }
function findPivots(highs, lows, leftBars, rightBars) { let pivotHighs = []; let pivotLows = []; for (let i = leftBars; i < highs.length - rightBars; i++) { let isHigh = true; let isLow = true; for (let j = i - leftBars; j <= i + rightBars; j++) { if (i === j) continue; if (highs[j] >= highs[i]) isHigh = false; if (lows[j] <= lows[i]) isLow = false; } if (isHigh) pivotHighs.push({ index: i, val: highs[i] }); if (isLow) pivotLows.push({ index: i, val: lows[i] }); } return { pivotHighs, pivotLows }; }

function calculateRSI(closes, period = 14) {
  let gains = 0, losses = 0;
  for(let i=1; i<=period; i++) { let diff = closes[i] - closes[i-1]; if(diff>=0) gains += diff; else losses -= diff; }
  let avgGain = gains/period; let avgLoss = losses/period;
  for(let i=period+1; i<closes.length; i++) {
    let diff = closes[i] - closes[i-1];
    if(diff>=0){ avgGain = (avgGain*13 + diff)/14; avgLoss = (avgLoss*13)/14; }
    else { avgGain = (avgGain*13)/14; avgLoss = (avgLoss*13 - diff)/14; }
  }
  let rs = avgGain/avgLoss;
  return 100 - (100/(1+rs));
}

function calculateATR(h, l, c, period = 14) {
  let trs = [];
  for(let i=1; i<c.length; i++) { trs.push(Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1]))); }
  let atr = trs.slice(0, period).reduce((a,b)=>a+b)/period;
  for(let i=period; i<trs.length; i++) { atr = (atr*13 + trs[i])/14; }
  return atr;
}

function findFVG(o, h, l, c) {
  let bullFVG = null; let bearFVG = null;
  for(let i = h.length - 3; i > h.length - 30; i--) { 
    if(l[i+2] > h[i] && c[i+2] > o[i+2] && !bullFVG) bullFVG = { top: l[i+2], btm: h[i] }; 
    if(h[i+2] < l[i] && c[i+2] < o[i+2] && !bearFVG) bearFVG = { top: l[i], btm: h[i+2] }; 
  }
  return { bullFVG, bearFVG };
}

function getSession() {
  const utcHour = new Date().getUTCHours();
  if (utcHour >= 0 && utcHour < 7) return "ASIAN RANGE (Akumulasi / Sideways)";
  if (utcHour >= 7 && utcHour < 12) return "LONDON KILLZONE (Volatilitas Naik / Sweep)";
  if (utcHour >= 12 && utcHour < 21) return "NEW YORK KILLZONE (High Volatility / Trend Reversal)";
  return "LATE NY (Konsolidasi)";
}

async function fetchChartData(interval, range) {
  const res = await axios.get(`https://query2.finance.yahoo.com/v8/finance/chart/GC=F?interval=${interval}&range=${range}`, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const q = res.data.chart.result[0].indicators.quote[0];
  let c = [], o = [], h = [], l = [], v = [];
  for(let i=0; i<q.close.length; i++) { if(q.close[i] !== null) { c.push(q.close[i]); o.push(q.open[i]); h.push(q.high[i]); l.push(q.low[i]); v.push(q.volume[i] || 0); } }
  return { c, o, h, l, v, current: c[c.length - 1] };
}

// ─── THE NEW INSTITUTIONAL GOD ENGINE (V19) ──────────────────────────────────
async function calculateNativeAlgorithms() {
  try {
    const [h1, m5, m1] = await Promise.all([ fetchChartData('1h', '5d'), fetchChartData('5m', '2d'), fetchChartData('1m', '1d') ]);
    const currentPrice = m1.current;
    const sessionName = getSession();

    const h1Ema20 = calculateEMA(h1.c, 20); const h1Ema50 = calculateEMA(h1.c, 50);
    const h1Trend = h1Ema20[h1Ema20.length - 1] > h1Ema50[h1Ema50.length - 1] ? "BULLISH" : "BEARISH";

    const m5Pivots = findPivots(m5.h, m5.l, 3, 3);
    const m5Res = m5Pivots.pivotHighs.length > 0 ? m5Pivots.pivotHighs[m5Pivots.pivotHighs.length - 1].val : m5.h[m5.h.length - 3];
    const m5Sup = m5Pivots.pivotLows.length > 0 ? m5Pivots.pivotLows[m5Pivots.pivotLows.length - 1].val : m5.l[m5.l.length - 3];
    const fvg = findFVG(m5.o, m5.h, m5.l, m5.c);

    const m1Rsi = calculateRSI(m1.c, 14);
    const m1Atr = calculateATR(m1.h, m1.l, m1.c, 14);

    let position = "WAIT & SEE / NO SETUP"; let entry = "0.00"; let sl = "0.00"; let tp1 = "0.00"; let tp2 = "0.00"; let reasonArr = [];

    let buyTarget = fvg.bullFVG && fvg.bullFVG.top < m5Sup + 2 ? fvg.bullFVG.top : m5Sup;
    let sellTarget = fvg.bearFVG && fvg.bearFVG.btm > m5Res - 2 ? fvg.bearFVG.btm : m5Res;

    if (h1Trend === "BULLISH" && currentPrice <= (buyTarget + 2.0) && currentPrice >= (buyTarget - 1.5)) {
      if (m1Rsi < 40) { 
        position = "BUY LIMIT / BUY NOW (LTF SNIPER)";
        entry = currentPrice.toFixed(2);
        sl = (buyTarget - (m1Atr * 1.5)).toFixed(2); 
        tp1 = (currentPrice + (m1Atr * 3)).toFixed(2); 
        tp2 = (currentPrice + (m1Atr * 6)).toFixed(2);
        reasonArr = [
          `HTF (H1): Market structure sejajar dengan tren BULLISH`,
          `MTF (M5): Harga masuk ke Demand / area FVG Magnet ($${buyTarget.toFixed(2)})`,
          `LTF (M1): RSI M1 (${m1Rsi.toFixed(1)}) mendeteksi exhaust & potensi hook up`,
          `VOLATILITY: Stop Loss & Target dilindungi oleh perhitungan Dynamic ATR (${m1Atr.toFixed(2)} pts)`
        ];
      }
    }
    else if (h1Trend === "BEARISH" && currentPrice >= (sellTarget - 2.0) && currentPrice <= (sellTarget + 1.5)) {
      if (m1Rsi > 60) { 
        position = "SELL LIMIT / SELL NOW (LTF SNIPER)";
        entry = currentPrice.toFixed(2);
        sl = (sellTarget + (m1Atr * 1.5)).toFixed(2); 
        tp1 = (currentPrice - (m1Atr * 3)).toFixed(2); 
        tp2 = (currentPrice - (m1Atr * 6)).toFixed(2);
        reasonArr = [
          `HTF (H1): Market structure sejajar dengan tren BEARISH`,
          `MTF (M5): Harga pullback ke Supply / area FVG Magnet ($${sellTarget.toFixed(2)})`,
          `LTF (M1): RSI M1 (${m1Rsi.toFixed(1)}) mendeteksi overbought, siap terjun`,
          `VOLATILITY: Stop Loss & Target dilindungi oleh perhitungan Dynamic ATR (${m1Atr.toFixed(2)} pts)`
        ];
      }
    } else {
      const waitTarget = h1Trend === "BULLISH" ? buyTarget : sellTarget;
      let fvgMsg = h1Trend === "BULLISH" && fvg.bullFVG ? ` (Terdapat Bullish FVG di $${fvg.bullFVG.top.toFixed(2)})` : h1Trend === "BEARISH" && fvg.bearFVG ? ` (Terdapat Bearish FVG di $${fvg.bearFVG.btm.toFixed(2)})` : "";
      reasonArr = [
        `HTF (H1): Bias directional mengikuti arus ${h1Trend}`,
        `MTF (M5): Menunggu mitigasi di area likuiditas SMC ($${waitTarget.toFixed(2)})${fvgMsg}`,
        `LTF (M1): RSI saat ini di ${m1Rsi.toFixed(1)}. Menunggu konfirmasi momentum.`
      ];
    }

    return { currentPrice: currentPrice.toFixed(2), position, entry, sl, tp1, tp2, reason: reasonArr, session: sessionName };
  } catch (err) {
    return { currentPrice: "N/A", position: "WAIT & SEE / NO SETUP", entry: "0.00", sl: "0.00", tp1: "0.00", tp2: "0.00", reason: ["Sinkronisasi data multi-timeframe tertunda."], session: "UNKNOWN" };
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

    // GLOBAL NEWS EXTRACTION FOR FRONTEND UI (V20 Feature)
    const nowMs = Date.now();
    const globalUpcoming = events.filter(e => {
        const diffMins = (new Date(e.date).getTime() - nowMs) / 60000;
        return diffMins > 0; // Filter data masa depan
    }).sort((a,b) => new Date(a.date) - new Date(b.date)).slice(0, 10); // Kirim 10 berita terdekat

    if (isCron) {
      const currentSignalID = tech.position + "_" + tech.entry;
      if (!tech.position.includes("WAIT & SEE")) {
        if (currentSignalID !== lastSentSignalID) {
          await sendTechnicalSignalTelegram(tech);
          lastSentSignalID = currentSignalID; 
          isSignalActive = true;
        }
      } else {
        if (isSignalActive === true) {
          await sendInvalidSignalTelegram();
          lastSentSignalID = ""; 
          isSignalActive = false;
        }
      }

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
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      dxy_live: dxy,
      master_signal: { signal: masterSignal, total_score: totalScore },
      nfp, cpi, growth, fed,
      technical_signal: tech,
      global_upcoming: globalUpcoming // DATA BARU UNTUK LIST GLOBAL NEWS DI WEB
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
