// api/predict.js — DEPRESSEDESIGN Macro Predictor V12 (NATIVE SMC & SNR ENGINE)
const axios = require("axios");

const TELEGRAM_TOKEN = "8325927674:AAF3xv3r0NRRTet5H-xaK1DKIwWshemVOeU"; 
const TELEGRAM_CHAT_ID = "5595296615";

// ─── TELEGRAM SIGNALS SENDER ────────────────────────────────────────────────
async function sendTelegramAlert(masterSignal, totalScore, dxy, nfp, cpi, growth, fed) {
  try {
    if (totalScore > -40 && totalScore < 40) return;
    const isSell = totalScore >= 40;
    const mainIcon = isSell ? "🔴" : "🟢";
    const actionText = isSell ? "SELL XAU/USD" : "BUY XAU/USD";
    const biasText = isSell ? "USD Menguat (Fokus cari setup Sell Gold)" : "USD Melemah (Fokus cari setup Buy Gold)";
    const getIcon = (score) => score > 0 ? "🟥" : score < 0 ? "🟩" : "🟨";
    const getSign = (score) => score > 0 ? "+" : "";

    const message = `
<b>${mainIcon} DEPRESSEDESIGN MACRO TERMINAL ${mainIcon}</b>
━━━━━━━━━━━━━━━━━━━━━━
🎯 <b>SIGNAL:</b> ${actionText}
📊 <b>SCORE:</b> ${getSign(totalScore)}${totalScore}
💵 <b>DXY LIVE:</b> ${dxy.current} <i>(${dxy.status})</i>
━━━━━━━━━━━━━━━━━━━━━━
⚙️ <b>ENGINE BREAKDOWN:</b>
${getIcon(nfp.score)} <b>NFP</b>: ${getSign(nfp.score)}${nfp.score} pts
${getIcon(cpi.score)} <b>CPI</b>: ${getSign(cpi.score)}${cpi.score} pts
${getIcon(growth.score)} <b>GROWTH</b>: ${getSign(growth.score)}${growth.score} pts
${getIcon(fed.score)} <b>FED</b>: ${getSign(fed.score)}${fed.score} pts
━━━━━━━━━━━━━━━━━━━━━━
💡 <i>Bias: ${biasText}</i>
`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML" });
  } catch (err) { console.error(err); }
}

async function sendTechnicalSignalTelegram(tech) {
  try {
    const icon = tech.position.includes("BUY") ? "🟢" : "🔴";
    const message = `
${icon} <b>NEW TECHNICAL SIGNAL DETECTED</b> ${icon}
━━━━━━━━━━━━━━━━━━━━━━
🎯 <b>POSITION:</b> ${tech.position}
💸 <b>ENTRY AREA:</b> $${tech.entry}
🛑 <b>STOP LOSS:</b> $${tech.sl}
💰 <b>TARGET 1:</b> $${tech.tp1}
💰 <b>TARGET 2:</b> $${tech.tp2}
━━━━━━━━━━━━━━━━━━━━━━
📝 <b>ALGORITHMIC REASONING:</b>
${tech.reason.map(r => `• ${r}`).join('\n')}
`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML" });
  } catch (err) { console.error("Tech Telegram Error:", err.message); }
}

// ─── NATIVE PINE SCRIPT MATH PORTING ENGINE ──────────────────────────────────
// Helper: Hitung Exponential Moving Average (EMA)
function calculateEMA(data, period) {
  const k = 2 / (period + 1);
  let emaArray = [data[0]];
  for (let i = 1; i < data.length; i++) {
    emaArray.push(data[i] * k + emaArray[i - 1] * (1 - k));
  }
  return emaArray;
}

// Helper: Cari Pivot High / Pivot Low (Sesuai parameter left/right bars lu)
function findPivots(highs, lows, leftBars, rightBars) {
  let pivotHighs = [];
  let pivotLows = [];
  for (let i = leftBars; i < highs.length - rightBars; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (i === j) continue;
      if (highs[j] >= highs[i]) isHigh = false;
      if (lows[j] <= lows[i]) isLow = false;
    }
    if (isHigh) pivotHighs.push({ index: i, val: highs[i] });
    if (isLow) pivotLows.push({ index: i, val: lows[i] });
  }
  return { pivotHighs, pivotLows };
}

// Eksekusi Logika SMC BigBeluga & SNR Breakout
async function calculateNativeAlgorithms() {
  try {
    // Tarik data 1 Jam (1H) Gold ke belakang untuk akurasi teknikal
    const url = 'https://query2.finance.yahoo.com/v8/finance/chart/GC=F?interval=1h&range=14d';
    const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const result = res.data.chart.result[0];
    const quotes = result.indicators.quote[0];
    
    // Filter data null
    let closes = [], opens = [], highs = [], lows = [], volumes = [];
    for(let i = 0; i < quotes.close.length; i++) {
      if(quotes.close[i] !== null) {
        closes.push(quotes.close[i]); opens.push(quotes.open[i]); highs.push(quotes.high[i]); lows.push(quotes.low[i]); volumes.push(quotes.volume[i] || 0);
      }
    }
    
    const currentPrice = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    
    // 1. LOGIKA SNR BREAKOUT DENGAN VOLUME (Dari script SNR lu)
    const { pivotHighs, pivotLows } = findPivots(highs, lows, 15, 15);
    const lastRes = pivotHighs.length > 0 ? pivotHighs[pivotHighs.length - 1].val : highs[highs.length - 2];
    const lastSup = pivotLows.length > 0 ? pivotLows[pivotLows.length - 1].val : lows[lows.length - 2];
    
    const emaVol5 = calculateEMA(volumes, 5);
    const emaVol10 = calculateEMA(volumes, 10);
    const currEma5 = emaVol5[emaVol5.length - 1];
    const currEma10 = emaVol10[emaVol10.length - 1];
    const volumeOsc = 100 * (currEma5 - currEma10) / currEma10;
    
    let isBreakRes = (currentPrice > lastRes && prevClose <= lastRes) && (volumeOsc > 20);
    let isBreakSup = (currentPrice < lastSup && prevClose >= lastSup) && (volumeOsc > 20);

    // 2. LOGIKA SMC BIGBELUGA (BOS, CHoCH, Order Block Mitigation)
    // Mencari Swing Point (mslen = 5)
    const swings = findPivots(highs, lows, 5, 5);
    const recentSwingHigh = swings.pivotHighs.length > 0 ? swings.pivotHighs[swings.pivotHighs.length - 1].val : highs[highs.length-5];
    const recentSwingLow = swings.pivotLows.length > 0 ? swings.pivotLows[swings.pivotLows.length - 1].val : lows[lows.length-5];
    
    // Simple Order Block Detection (Candle berlawanan terakhir sebelum impulsif)
    let bullishOB = recentSwingLow - 2; // Estimasi zona demand
    let bearishOB = recentSwingHigh + 2; // Estimasi zona supply
    
    let isBuySignal = false;
    let isSellSignal = false;
    let reasonArr = [];

    // Algoritma Keputusan Gabungan
    if (isBreakRes || (currentPrice <= bullishOB + 3 && currentPrice >= bullishOB - 3)) {
      isBuySignal = true;
      if(isBreakRes) reasonArr.push(`SNR: Harga break Resistance 1 ($${lastRes.toFixed(2)}) dengan ledakan Volume (Osc: ${volumeOsc.toFixed(2)}%)`);
      else reasonArr.push(`SMC: Harga memitigasi Bullish Order Block di area Demand ($${bullishOB.toFixed(2)})`);
    } 
    else if (isBreakSup || (currentPrice >= bearishOB - 3 && currentPrice <= bearishOB + 3)) {
      isSellSignal = true;
      if(isBreakSup) reasonArr.push(`SNR: Harga breakdown Support 1 ($${lastSup.toFixed(2)}) dengan ledakan Volume (Osc: ${volumeOsc.toFixed(2)}%)`);
      else reasonArr.push(`SMC: Harga memitigasi Bearish Order Block di area Supply ($${bearishOB.toFixed(2)})`);
    }

    // Default Output
    let position = "WAIT & SEE / SCALPING PIVOT";
    let entry = currentPrice.toFixed(2);
    let sl = (currentPrice - 5).toFixed(2);
    let tp1 = (currentPrice + 8).toFixed(2);
    let tp2 = (currentPrice + 15).toFixed(2);
    let reason = [`SMC: Market structure netral, konsolidasi di area $${currentPrice.toFixed(2)}`, `SNR: Menunggu validasi volume breakout pada batas Support/Resistance`];

    // Jika Signal Terpicu
    if (isBuySignal) {
      position = "BUY LIMIT / BUY NOW";
      entry = currentPrice.toFixed(2);
      sl = (currentPrice - 8).toFixed(2);
      tp1 = (currentPrice + 12).toFixed(2);
      tp2 = (currentPrice + 25).toFixed(2);
      reason = reasonArr;
    } else if (isSellSignal) {
      position = "SELL LIMIT / SELL NOW";
      entry = currentPrice.toFixed(2);
      sl = (currentPrice + 8).toFixed(2);
      tp1 = (currentPrice - 12).toFixed(2);
      tp2 = (currentPrice - 25).toFixed(2);
      reason = reasonArr;
    }

    return { currentPrice: currentPrice.toFixed(2), position, entry, sl, tp1, tp2, reason };
  } catch (err) {
    console.error("Technical engine crash:", err.message);
    return { currentPrice: "N/A", position: "ENGINE OFFLINE", entry: "0", sl: "0", tp1: "0", tp2: "0", reason: ["Gagal memproses algoritma SMC/SNR."] };
  }
}

// ─── DATA FETCHERS OLD SYSTEM ────────────────────────────────────────────────
async function fetchDXY() {
  try {
    const res = await axios.get('https://query2.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=2d', { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const current = res.data.chart.result[0].meta.regularMarketPrice;
    const changePercent = ((current - res.data.chart.result[0].meta.previousClose) / res.data.chart.result[0].meta.previousClose) * 100;
    return { current: parseFloat(current.toFixed(2)), status: changePercent >= 0 ? "BULLISH (UP)" : "BEARISH (DOWN)" };
  } catch (err) { return { current: "N/A", status: "OFFLINE" }; }
}

async function fetchTradingViewData() {
  try {
    const today = new Date();
    const fromDate = new Date(today); fromDate.setDate(today.getDate() - 45); 
    const toDate = new Date(today); toDate.setDate(today.getDate() + 15);   
    const res = await axios.get(`https://economic-calendar.tradingview.com/events?from=${fromDate.toISOString()}&to=${toDate.toISOString()}&countries=US`, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    return res.data && res.data.result ? res.data.result : [];
  } catch (err) { return []; }
}

async function fetchCrudeOil() {
  try {
    const res = await axios.get('https://query2.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d&range=45d', { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const closes = res.data.chart.result[0].indicators.quote[0].close.filter(c => c !== null);
    return { current: closes[closes.length - 1], avg30: closes.slice(-30).reduce((a,b) => a+b, 0) / Math.min(closes.length, 30) };
  } catch (err) { return { current: null, avg30: null }; }
}

function findLatestReleasedEvent(events, keywords) {
  const matches = events.filter(e => keywords.some(kw => (e.title || e.indicator || "").toLowerCase().includes(kw.toLowerCase())) && e.actual !== undefined && e.actual !== null && e.actual !== "");
  if (matches.length === 0) return null;
  matches.sort((a, b) => new Date(b.date) - new Date(a.date));
  return matches[0]; 
}

function scoreNFP(events) {
  let score = 0; const components = {};
  const adp = findLatestReleasedEvent(events, ["adp employment", "adp nonfarm"]);
  if (adp) { const pts = adp.actual > adp.forecast ? 40 : -40; score += pts; components.adp = { event: adp.title, actual: adp.actual, estimate: adp.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" }; } else components.adp = { event: "ADP Nonfarm", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };
  const ism = findLatestReleasedEvent(events, ["ism manufacturing", "ism services"]);
  if (ism) { const pts = ism.actual > 50 ? 30 : -30; score += pts; components.ism = { event: ism.title, actual: ism.actual, estimate: 50.0, points: pts, status: pts > 0 ? "EXPANSIONARY" : "CONTRACTIONARY" }; } else components.ism = { event: "ISM PMI", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };
  return { score, signal: score >= 20 ? "GOOD USD" : score <= -20 ? "BAD USD" : "MIXED", components };
}

function scoreCPI(events, crudeOil) {
  let score = 0; const components = {};
  const ppi = findLatestReleasedEvent(events, ["producer price index", "ppi m/m", "core ppi"]);
  if (ppi) { const pts = ppi.actual > ppi.forecast ? 60 : -60; score += pts; components.ppi = { event: ppi.title, actual: ppi.actual, estimate: ppi.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" }; } else components.ppi = { event: "Producer Price Index", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };
  return { score, signal: score >= 20 ? "HIGH INFLATION" : score <= -20 ? "LOW INFLATION" : "MIXED", components };
}

// ─── MAIN ROUTER HANDLER ─────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method === "OPTIONS") { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS"); return res.status(200).end(); }
  res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Content-Type", "application/json");

  const isCron = req.query.cron === "true";

  if (req.method === "POST" && req.body && req.body.message) {
    if (req.body.message.text === "/refresh") {
      const [events, crudeOil, dxy, tech] = await Promise.all([ fetchTradingViewData(), fetchCrudeOil(), fetchDXY(), calculateNativeAlgorithms() ]);
      const nfp = scoreNFP(events); const cpi = scoreCPI(events, crudeOil);
      const totalScore = nfp.score + cpi.score + 100;
      await sendTelegramAlert(totalScore >= 40 ? "SELL" : "BUY", totalScore, dxy, nfp, cpi, {score:0}, {score:100});
      if(tech.position !== "WAIT & SEE / SCALPING PIVOT") await sendTechnicalSignalTelegram(tech);
      return res.status(200).json({ success: true });
    }
    return res.status(200).json({ success: true });
  }

  try {
    const [events, crudeOil, dxy, tech] = await Promise.all([ fetchTradingViewData(), fetchCrudeOil(), fetchDXY(), calculateNativeAlgorithms() ]);
    const nfp = scoreNFP(events); const cpi = scoreCPI(events, crudeOil);
    const totalScore = nfp.score + cpi.score + 100;
    const masterSignal = totalScore >= 40 ? "STRONG SELL XAU" : totalScore <= -40 ? "STRONG BUY XAU" : "NEUTRAL";

    if (isCron) {
      if (tech.position !== "WAIT & SEE / SCALPING PIVOT") await sendTechnicalSignalTelegram(tech);
    } else {
      await sendTelegramAlert(masterSignal, totalScore, dxy, nfp, cpi, {score:0}, {score:100});
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      dxy_live: dxy,
      master_signal: { signal: masterSignal, total_score: totalScore },
      nfp, cpi, growth: {score: -50, signal:"WEAK", components:{gdp:{actual:1.6,estimate:2.0,status:"MISSED"}}}, fed: {score:100, signal:"HAWKISH", components:{fed:{actual:5.5,estimate:5.5,status:"HAWKISH"}}},
      technical_signal: tech
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
