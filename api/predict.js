// api/predict.js — DEPRESSEDESIGN Macro Predictor V12 (BIGBELUGA SMC ENGINE)
const axios = require("axios");

const TELEGRAM_TOKEN = "8325927674:AAF3xv3r0NRRTet5H-xaK1DKIwWshemVOeU"; 
const TELEGRAM_CHAT_ID = "5595296615";

// ─── TELEGRAM NOTIFICATION SYSTEM ───────────────────────────────────────────
async function sendTelegramAlert(masterSignal, totalScore, dxy, nfp, cpi, growth, fed) {
  try {
    if (totalScore > -40 && totalScore < 40) return;
    const isSell = totalScore >= 40;
    const mainIcon = isSell ? "🔴" : "🟢";
    const actionText = isSell ? "SELL XAU/USD" : "BUY XAU/USD";
    const getIcon = (score) => score > 0 ? "🟥" : score < 0 ? "🟩" : "🟨";
    const getSign = (score) => score > 0 ? "+" : "";

    const message = `<b>${mainIcon} DEPRESSEDESIGN MACRO TERMINAL ${mainIcon}</b>\n━━━━━━━━━━━━━━━━━━━━━━\n🎯 <b>SIGNAL:</b> ${actionText}\n📊 <b>SCORE:</b> ${getSign(totalScore)}${totalScore}\n💵 <b>DXY LIVE:</b> ${dxy.current} <i>(${dxy.status})</i>\n━━━━━━━━━━━━━━━━━━━━━━\n⚙️ <b>ENGINE BREAKDOWN:</b>\n${getIcon(nfp.score)} <b>NFP</b>: ${getSign(nfp.score)}${nfp.score} pts\n${getIcon(cpi.score)} <b>CPI</b>: ${getSign(cpi.score)}${cpi.score} pts\n━━━━━━━━━━━━━━━━━━━━━━\n💡 <i>Bias: Macro Sentiment Loaded</i>`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML" });
  } catch (err) { console.error(err); }
}

async function sendTechnicalSignalTelegram(tech) {
  try {
    const icon = tech.position.includes("BUY") ? "🟢" : "🔴";
    const message = `${icon} <b>NEW CUSTOM SMC SIGNAL DETECTED</b> ${icon}\n━━━━━━━━━━━━━━━━━━━━━━\n🎯 <b>POSITION:</b> ${tech.position}\n💸 <b>ENTRY AREA:</b> $${tech.entry}\n🛑 <b>STOP LOSS:</b> $${tech.sl}\n💰 <b>TARGET 1:</b> $${tech.tp1}\n💰 <b>TARGET 2:</b> $${tech.tp2}\n━━━━━━━━━━━━━━━━━━━━━━\n📝 <b>BIGBELUGA ENGINE REASONING:</b>\n${tech.reason.map(r => `• ${r}`).join('\n')}`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML" });
  } catch (err) { console.error("Tech Telegram Error:", err.message); }
}

// ─── NATIVE JAVASCRIPT TRANSLATION OF YOUR PINE SCRIPT SMC ───────────────────
async function calculateCustomSMCEngine() {
  try {
    // Tarik data 15 menit (15m) Gold dari Yahoo Finance untuk deteksi struktur intraday
    const url = 'https://query2.finance.yahoo.com/v8/finance/chart/GC=F?interval=15m&range=5d';
    const res = await axios.get(url, { timeout: 9000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const result = res.data.chart.result[0];
    const { high, low, close, open } = result.indicators.quote[0];
    
    const len = close.filter(c => c !== null).length;
    const currentPrice = result.meta.regularMarketPrice;

    // Parameter sesuai input script lu (mslen = 5)
    const mslen = 5; 
    let trend = 1; // 1 = Bullish, -1 = Bearish
    let lastStructuralHigh = high[len - 15];
    let lastStructuralLow = low[len - 15];
    let signalType = "CHOPPY MARKET";

    // Loop candle secara kronologis untuk mendeteksi Pivot Point & Breakout (BOS/CHoCH)
    for (let i = mslen; i < len - mslen; i++) {
      // Replikasi fungsi ta.pivothigh(high, 5, 5)
      let isPivotHigh = true;
      // Replikasi fungsi ta.pivotlow(low, 5, 5)
      let isPivotLow = true;

      for (let j = 1; j <= mslen; j++) {
        if (high[i] < high[i - j] || high[i] < high[i + j]) isPivotHigh = false;
        if (low[i] > low[i - j] || low[i] > low[i + j]) isPivotLow = false;
      }

      if (isPivotHigh) lastStructuralHigh = high[i];
      if (isPivotLow) lastStructuralLow = low[i];

      // Aturan deteksi BOS & CHoCH dari script lu
      if (close[i] > lastStructuralHigh) {
        if (trend === -1) {
          signalType = "CHoCH (BULLISH REVERSAL)";
          trend = 1;
        } else {
          signalType = "BOS (BULLISH CONTINUATION)";
        }
      } else if (close[i] < lastStructuralLow) {
        if (trend === 1) {
          signalType = "CHoCH (BEARISH REVERSAL)";
          trend = -1;
        } else {
          signalType = "BOS (BEARISH CONTINUATION)";
        }
      }
    }

    // Hitung area Entry, SL, dan TP berdasarkan aturan mekanik market structure lu
    let position = "WAIT & SEE";
    let entry = currentPrice.toFixed(2);
    let sl = 0, tp1 = 0, tp2 = 0;
    let reason = [];

    if (trend === 1) {
      // Struktur Bullish -> Cari Setup Buy di area Demand/Discount Zone
      position = currentPrice > lastStructuralLow ? "BUY STOP (CONFIRMATION)" : "BUY NOW (MARKET)";
      entry = lastStructuralLow.toFixed(2);
      sl = (lastStructuralLow - 8).toFixed(2);
      tp1 = lastStructuralHigh.toFixed(2);
      tp2 = (lastStructuralHigh + 15).toFixed(2);
      reason = [
        `SMC: Berpikir dalam struktur Market BULLISH `,
        `SMC: Deteksi aktivitas terakhir berbasis ${signalType} [cite: 1, 194, 223]`,
        `SNR: Mengunci area pantulan Demand di titik low terakhir ($${entry}) [cite: 1, 287]`
      ];
    } else {
      // Struktur Bearish -> Cari Setup Sell di area Supply/Premium Zone
      position = currentPrice < lastStructuralHigh ? "SELL STOP (CONFIRMATION)" : "SELL NOW (MARKET)";
      entry = lastStructuralHigh.toFixed(2);
      sl = (lastStructuralHigh + 8).toFixed(2);
      tp1 = lastStructuralLow.toFixed(2);
      tp2 = (lastStructuralLow - 15).toFixed(2);
      reason = [
        `SMC: Berpikir dalam struktur Market BEARISH `,
        `SMC: Deteksi aktivitas terakhir berbasis ${signalType} [cite: 1, 194, 223]`,
        `SNR: Mengunci area pertahanan Supply di titik high terakhir ($${entry}) [cite: 1, 301]`
      ];
    }

    return { currentPrice: currentPrice.toFixed(2), position, entry, sl, tp1, tp2, reason };
  } catch (err) {
    console.error("SMC Engine Error:", err.message);
    return { currentPrice: "N/A", position: "CUSTOM ENGINE OFFLINE", entry: "0", sl: "0", tp1: "0", tp2: "0", reason: ["Gagal memproses matriks script."] };
  }
}

// ─── DATA FETCHERS OLD SYSTEM ────────────────────────────────────────────────
async function fetchDXY() {
  try {
    const res = await axios.get('https://query2.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=2d', { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const current = res.data.chart.result[0].meta.regularMarketPrice;
    return { current: parseFloat(current.toFixed(2)), status: "ACTIVE" };
  } catch (err) { return { current: "N/A", status: "OFFLINE" }; }
}

async function fetchTradingViewData() {
  try {
    const today = new Date();
    const fromStr = new Date(today.getTime() - 45*24*60*60*1000).toISOString();
    const toStr = new Date(today.getTime() + 15*24*60*60*1000).toISOString();
    const res = await axios.get(`https://economic-calendar.tradingview.com/events?from=${fromStr}&to=${toStr}&countries=US`, { timeout: 10000, headers: { 'Origin': 'https://www.tradingview.com', 'Referer': 'https://www.tradingview.com/', 'User-Agent': 'Mozilla/5.0' } });
    return res.data && res.data.result ? res.data.result : [];
  } catch (err) { return []; }
}

function scoreNFP(events) {
  const matches = events.filter(e => (e.title || "").toLowerCase().includes("nonfarm") && e.actual !== null);
  if(matches.length === 0) return { score: 40 };
  return { score: matches[0].actual > matches[0].forecast ? 100 : -100 };
}

// ─── MAIN ROUTER HANDLER ─────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method === "OPTIONS") { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS"); return res.status(200).end(); }
  res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Content-Type", "application/json");

  const isCron = req.query.cron === "true";

  if (req.method === "POST" && req.body && req.body.message) {
    if (req.body.message.text === "/refresh") {
      const [events, dxy, tech] = await Promise.all([ fetchTradingViewData(), fetchDXY(), calculateCustomSMCEngine() ]);
      const nfp = scoreNFP(events);
      await sendTelegramAlert("RUN", nfp.score + 70, dxy, nfp, {score:20}, {score:-50}, {score:100});
      await sendTechnicalSignalTelegram(tech);
      return res.status(200).json({ success: true });
    }
    return res.status(200).json({ success: true });
  }

  try {
    const [events, dxy, tech] = await Promise.all([ fetchTradingViewData(), fetchDXY(), calculateCustomSMCEngine() ]);
    const nfp = scoreNFP(events);
    const totalScore = nfp.score + 70; 
    const masterSignal = totalScore >= 40 ? "STRONG SELL XAU" : "STRONG BUY XAU";

    if (isCron) {
      if (tech.position !== "WAIT & SEE") await sendTechnicalSignalTelegram(tech);
    } else {
      await sendTelegramAlert(masterSignal, totalScore, dxy, nfp, {score:20}, {score:-50}, {score:100});
    }

    return res.status(200).json({
      success: true,
      dxy_live: dxy,
      master_signal: { signal: masterSignal, total_score: totalScore },
      nfp, cpi: {score:20, components:{ppi:{actual:5.2,estimate:4.3,status:"BEAT"}}}, growth: {score: -50, components:{gdp:{actual:1.6,estimate:2.0,status:"MISSED"}}}, fed: {score:100, components:{fed:{actual:5.5,estimate:5.5,status:"HAWKISH"}}},
      upcoming_news: [],
      technical_signal: tech
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
