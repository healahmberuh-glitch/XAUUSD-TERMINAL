// api/predict.js — DEPRESSEDESIGN Trading Station Backend
// Vercel Serverless Function (Node.js)
// UPGRADED: Triple-TF Swing + Scalp Dual Signal Engine

const axios = require("axios");

const TELEGRAM_TOKEN  = "8325927674:AAF3xv3r0NRRTet5H-xaK1DKIwWshemVOeU";
const TELEGRAM_CHAT_ID = "5595296615";

// ─── GLOBAL MEMORY CACHE ─────────────────────────────────────────────────────
let lastSentSwingID   = "";
let lastSentScalpID   = "";
let isSwingActive     = false;
let isScalpActive     = false;
let cachedEvents      = [];
let lastFetchTime     = 0;
let warnedEvents      = new Set();

// ─── TELEGRAM SENDERS ────────────────────────────────────────────────────────

async function sendTelegramAlert(masterSignal, totalScore, dxy, nfp, cpi, growth, fed) {
  try {
    if (totalScore > -40 && totalScore < 40) return;
    const isSell   = totalScore >= 40;
    const mainIcon = isSell ? "🔴" : "🟢";
    const message  = `<b>${mainIcon} DEPRESSEDESIGN MACRO TERMINAL ${mainIcon}</b>\n━━━━━━━━━━━━━━━━━━━━━━\n🎯 <b>SIGNAL:</b> ${isSell ? "SELL XAU/USD" : "BUY XAU/USD"}\n📊 <b>SCORE:</b> ${totalScore > 0 ? "+" : ""}${totalScore}\n💵 <b>DXY LIVE:</b> ${dxy.current} <i>(${dxy.status})</i>\n━━━━━━━━━━━━━━━━━━━━━━\n⚙️ <b>ENGINE BREAKDOWN:</b>\n${nfp.score > 0 ? "🟥" : nfp.score < 0 ? "🟩" : "🟨"} <b>NFP</b>: ${nfp.score > 0 ? "+" : ""}${nfp.score} pts\n${cpi.score > 0 ? "🟥" : cpi.score < 0 ? "🟩" : "🟨"} <b>CPI</b>: ${cpi.score > 0 ? "+" : ""}${cpi.score} pts\n${growth.score > 0 ? "🟥" : growth.score < 0 ? "🟩" : "🟨"} <b>GROWTH</b>: ${growth.score > 0 ? "+" : ""}${growth.score} pts\n${fed.score > 0 ? "🟥" : fed.score < 0 ? "🟩" : "🟨"} <b>FED</b>: ${fed.score > 0 ? "+" : ""}${fed.score} pts`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML", disable_web_page_preview: true
    });
  } catch (err) {}
}

// NEW: Swing Signal Alert
async function sendSwingSignalTelegram(swing) {
  try {
    const icon    = swing.position.includes("BUY") ? "🟢" : "🔴";
    const message = `${icon} <b>⚓ SWING TRADE SIGNAL — H4/H1</b> ${icon}\n━━━━━━━━━━━━━━━━━━━━━━\n🎯 <b>POSITION:</b> ${swing.position}\n📐 <b>H4 BIAS:</b> ${swing.h4Bias}\n💸 <b>ENTRY:</b> $${swing.entry}\n🛑 <b>STOP LOSS:</b> $${swing.sl} <i>(H1 Zone boundary)</i>\n💰 <b>TARGET 1:</b> $${swing.tp1} <i>(~${swing.tp1Pips} pips)</i>\n💰 <b>TARGET 2:</b> $${swing.tp2} <i>(~${swing.tp2Pips} pips)</i>\n━━━━━━━━━━━━━━━━━━━━━━\n📊 <b>CONFLUENCE:</b> ${swing.confluenceScore}/5\n${swing.reason.map(r => `• ${r}`).join('\n')}\n━━━━━━━━━━━━━━━━━━━━━━\n🕒 <b>SESSION:</b> ${swing.session}\n⚠️ <i>Hold: Hours to Days | Min RR 1:3</i>`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML"
    });
  } catch (err) {}
}

// NEW: Scalp Signal Alert
async function sendScalpSignalTelegram(scalp) {
  try {
    const icon    = scalp.position.includes("BUY") ? "🟢" : "🔴";
    const message = `${icon} <b>⚡ SCALP SIGNAL — M5 EXECUTION</b> ${icon}\n━━━━━━━━━━━━━━━━━━━━━━\n🎯 <b>POSITION:</b> ${scalp.position}\n💸 <b>ENTRY (M5):</b> $${scalp.entry}\n🛑 <b>STOP LOSS:</b> $${scalp.sl} <i>(M5 ATR scaled)</i>\n💰 <b>TARGET 1:</b> $${scalp.tp1} <i>(~${scalp.tp1Pips} pips)</i>\n💰 <b>TARGET 2:</b> $${scalp.tp2} <i>(~${scalp.tp2Pips} pips)</i>\n━━━━━━━━━━━━━━━━━━━━━━\n📊 <b>CONFLUENCE:</b> ${scalp.confluenceScore}/5\n⚓ <b>GATED BY SWING:</b> ✅ ACTIVE & ALIGNED\n${scalp.reason.map(r => `• ${r}`).join('\n')}\n━━━━━━━━━━━━━━━━━━━━━━\n🕒 <b>SESSION:</b> ${scalp.session}\n⚠️ <i>Hold: 5–30 menit | Min RR 1:2</i>`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML"
    });
  } catch (err) {}
}

async function sendSwingInvalidTelegram() {
  try {
    const message = `⚠️ <b>SWING SIGNAL: INVALIDATED</b> ⚠️\n━━━━━━━━━━━━━━━━━━━━━━\nH1 price structure telah meninggalkan zona swing.\nSwing signal dibatalkan. Scalp signal otomatis diblok.\nKembali ke mode WAIT & SEE.`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML"
    });
  } catch (err) {}
}

async function sendScalpInvalidTelegram() {
  try {
    const message = `⚡ <b>SCALP SIGNAL: INVALID / CLOSED</b> ⚡\n━━━━━━━━━━━━━━━━━━━━━━\nHarga M5 telah meninggalkan zona eksekusi scalp.\nSinyal scalp dibatalkan. Swing signal masih aktif — tunggu re-entry.`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML"
    });
  } catch (err) {}
}

async function sendPreNewsWarning(newsItem) {
  try {
    const message = `⏳ <b>PRE-NEWS WARNING</b> ⏳\n━━━━━━━━━━━━━━━━━━━━━━\n🚨 <b>${newsItem.title || newsItem.indicator || "USD High Impact News"}</b>\nAkan rilis dalam <b>5 MENIT!</b>\n📊 <b>Forecast:</b> ${newsItem.forecast || "N/A"}\n⚠️ <i>Siap-siap volatilitas tinggi. Amankan SL atau hindari entry!</i>`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML"
    });
  } catch (err) {}
}

// ─── SMART CACHE ENGINE ───────────────────────────────────────────────────────
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
    const today    = new Date();
    const fromDate = new Date(today); fromDate.setDate(today.getDate() - 45);
    const toDate   = new Date(today); toDate.setDate(today.getDate() + 15);
    const res = await axios.get(
      `https://economic-calendar.tradingview.com/events?from=${fromDate.toISOString()}&to=${toDate.toISOString()}&countries=US`,
      { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Origin': 'https://www.tradingview.com', 'Referer': 'https://www.tradingview.com/' } }
    );
    if (res.data && res.data.result && res.data.result.length > 0) {
      cachedEvents = res.data.result; lastFetchTime = now;
    }
    return cachedEvents;
  } catch (err) { return cachedEvents; }
}

// ─── MATH & INDICATOR PRIMITIVES ─────────────────────────────────────────────
function calculateEMA(data, period) {
  const k = 2 / (period + 1);
  let emaArr = [data[0]];
  for (let i = 1; i < data.length; i++) {
    emaArr.push(data[i] * k + emaArr[i - 1] * (1 - k));
  }
  return emaArr;
}

function calculateRSI(closes, period = 14, returnArray = false) {
  let rsiArray = [];
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  rsiArray.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) { avgGain = (avgGain * 13 + diff) / 14; avgLoss = (avgLoss * 13) / 14; }
    else           { avgGain = (avgGain * 13) / 14; avgLoss = (avgLoss * 13 - diff) / 14; }
    rsiArray.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
  }
  return returnArray ? rsiArray : rsiArray[rsiArray.length - 1];
}

function calculateATR(h, l, c, period = 14) {
  let trs = [];
  for (let i = 1; i < c.length; i++) {
    trs.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  }
  let atr = trs.slice(0, period).reduce((a, b) => a + b) / period;
  for (let i = period; i < trs.length; i++) atr = (atr * 13 + trs[i]) / 14;
  return atr;
}

function findSwingHighsLows(highs, lows, leftBars = 5, rightBars = 5) {
  let swingHighs = [], swingLows = [];
  for (let i = leftBars; i < highs.length - rightBars; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (highs[j] >= highs[i]) isHigh = false;
      if (lows[j]  <= lows[i])  isLow  = false;
    }
    if (isHigh) swingHighs.push({ index: i, val: highs[i] });
    if (isLow)  swingLows.push({ index: i, val: lows[i] });
  }
  return { swingHighs, swingLows };
}

// NEW: Displacement-based ChoCH (body must close beyond prev candle range)
function isDisplacementChoCH(o, h, l, c, direction) {
  const len = c.length;
  if (len < 3) return false;
  const curr = { o: o[len-1], h: h[len-1], l: l[len-1], c: c[len-1] };
  const prev = { o: o[len-2], h: h[len-2], l: l[len-2], c: c[len-2] };
  const bodySize     = Math.abs(curr.c - curr.o);
  const candleRange  = curr.h - curr.l;
  const bodyRatio    = candleRange > 0 ? bodySize / candleRange : 0;
  // Body must be at least 55% of candle range (no wick-dominated candles)
  if (bodyRatio < 0.55) return false;
  if (direction === 'buy') {
    // Bullish displacement: close above prev candle HIGH (not just prev close)
    return curr.c > prev.h && curr.c > curr.o;
  } else {
    // Bearish displacement: close below prev candle LOW
    return curr.c < prev.l && curr.c < curr.o;
  }
}

// NEW: RSI Hook with 5-candle lookback + 2 consecutive ticks
function isRsiHook(rsiArr, direction) {
  if (rsiArr.length < 6) return false;
  const recent5 = rsiArr.slice(-5);
  const last    = rsiArr[rsiArr.length - 1];
  const prev1   = rsiArr[rsiArr.length - 2];
  const prev2   = rsiArr[rsiArr.length - 3];
  if (direction === 'buy') {
    const touchedOversold = recent5.some(r => r < 40);
    const consecutiveUp   = last > prev1 && prev1 > prev2;
    return touchedOversold && consecutiveUp;
  } else {
    const touchedOverbought = recent5.some(r => r > 60);
    const consecutiveDown   = last < prev1 && prev1 < prev2;
    return touchedOverbought && consecutiveDown;
  }
}

// NEW: Session-aware volume multiplier
function getVolumeMultiplier(sessionName) {
  if (sessionName.includes("ASIAN"))  return 1.3;
  if (sessionName.includes("LONDON")) return 2.0;
  if (sessionName.includes("NEW YORK")) return 2.0;
  return 1.5; // Late NY
}

function getSession() {
  const utcHour = new Date().getUTCHours();
  if (utcHour >= 0  && utcHour < 7)  return "ASIAN RANGE";
  if (utcHour >= 7  && utcHour < 12) return "LONDON KILLZONE";
  if (utcHour >= 12 && utcHour < 21) return "NEW YORK KILLZONE";
  return "LATE NY";
}

async function fetchChartData(interval, range) {
  const res = await axios.get(
    `https://query2.finance.yahoo.com/v8/finance/chart/GC=F?interval=${interval}&range=${range}`,
    { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  const q = res.data.chart.result[0].indicators.quote[0];
  let c = [], o = [], h = [], l = [], v = [];
  for (let i = 0; i < q.close.length; i++) {
    if (q.close[i] !== null) {
      c.push(q.close[i]); o.push(q.open[i]);
      h.push(q.high[i]);  l.push(q.low[i]);
      v.push(q.volume[i] || 0);
    }
  }
  return { c, o, h, l, v, current: c[c.length - 1] };
}

// ─── SWING SIGNAL ENGINE (H4 Bias + H1 Structure) ────────────────────────────
async function calculateSwingSignal(h4, h1, sessionName) {
  try {
    // ── LAYER 1: H4 TREND BIAS ──────────────────────────────────────────────
    const h4Ema21 = calculateEMA(h4.c, 21);
    const h4Ema50 = calculateEMA(h4.c, 50);
    const h4Last  = h4.c[h4.c.length - 1];
    const h4E21   = h4Ema21[h4Ema21.length - 1];
    const h4E50   = h4Ema50[h4Ema50.length - 1];

    // Neutral zone: EMAs within 0.3% of each other
    const emaDiffPct = Math.abs(h4E21 - h4E50) / h4E50 * 100;
    let h4Bias = "NEUTRAL";
    if (emaDiffPct >= 0.3) {
      if (h4E21 > h4E50 && h4Last > h4E21) h4Bias = "BULLISH";
      else if (h4E21 < h4E50 && h4Last < h4E21) h4Bias = "BEARISH";
      else if (h4E21 > h4E50) h4Bias = "BULLISH_WEAK";
      else h4Bias = "BEARISH_WEAK";
    }

    // No trade on neutral H4
    if (h4Bias === "NEUTRAL") {
      return {
        position: "WAIT & SEE / NEUTRAL H4",
        h4Bias: "NEUTRAL",
        entry: "0.00", sl: "0.00", tp1: "0.00", tp2: "0.00",
        tp1Pips: "0", tp2Pips: "0",
        confluenceScore: 0,
        reason: ["H4 EMA21 dan EMA50 terlalu dekat — tidak ada bias directional yang jelas. Tidak ada swing trade."],
        session: sessionName
      };
    }

    // ── LAYER 2: H1 STRUCTURE & KEY LEVELS ──────────────────────────────────
    const h1Swings  = findSwingHighsLows(h1.h, h1.l, 5, 5);
    const h1Atr     = calculateATR(h1.h, h1.l, h1.c, 14);
    const currentPrice = h1.current;

    // Last significant swing levels
    const lastSwingHigh = h1Swings.swingHighs.length > 0
      ? h1Swings.swingHighs[h1Swings.swingHighs.length - 1].val : h1.h[h1.h.length - 3];
    const lastSwingLow  = h1Swings.swingLows.length > 0
      ? h1Swings.swingLows[h1Swings.swingLows.length - 1].val  : h1.l[h1.l.length - 3];

    // H1 Demand Zone (for BUY): area around last swing low
    const demandZoneTop = lastSwingLow + (h1Atr * 0.5);
    const demandZoneBtm = lastSwingLow - (h1Atr * 0.3);

    // H1 Supply Zone (for SELL): area around last swing high
    const supplyZoneBtm = lastSwingHigh - (h1Atr * 0.5);
    const supplyZoneTop = lastSwingHigh + (h1Atr * 0.3);

    // H1 Volume confirmation
    const h1VolEma = calculateEMA(h1.v, 20);
    const h1AvgVol = h1VolEma[h1VolEma.length - 1];
    const h1RecentVol = h1.v[h1.v.length - 1];
    const h1VolSpike  = h1RecentVol > (h1AvgVol * 1.5);

    // H1 RSI for state check
    const h1RsiArr = calculateRSI(h1.c, 14, true);
    const h1Rsi    = h1RsiArr[h1RsiArr.length - 1];

    // ── CONFLUENCE SCORING (0–5) ─────────────────────────────────────────────
    let score = 0;
    const confluence = {
      h4Trend: false, zoneTouch: false,
      structureAlign: false, volume: false, rsiState: false
    };

    // +1: H4 Trend (strong bias scores, weak bias still counts)
    if (h4Bias === "BULLISH" || h4Bias === "BEARISH") { score++; confluence.h4Trend = true; }
    else if (h4Bias === "BULLISH_WEAK" || h4Bias === "BEARISH_WEAK") { score += 0.5; }

    const isBullishBias = h4Bias.includes("BULLISH");
    const isBearishBias = h4Bias.includes("BEARISH");

    // +1: Zone Touch — price within H1 Demand/Supply zone
    if (isBullishBias && currentPrice >= demandZoneBtm && currentPrice <= demandZoneTop + h1Atr) {
      score++; confluence.zoneTouch = true;
    }
    if (isBearishBias && currentPrice >= supplyZoneBtm - h1Atr && currentPrice <= supplyZoneTop) {
      score++; confluence.zoneTouch = true;
    }

    // +1: Structure Alignment — H1 higher high/low for bull, lower high/low for bear
    if (h1Swings.swingHighs.length >= 2 && h1Swings.swingLows.length >= 2) {
      const sh = h1Swings.swingHighs, sl = h1Swings.swingLows;
      const isHH = sh[sh.length-1].val > sh[sh.length-2].val;
      const isHL = sl[sl.length-1].val > sl[sl.length-2].val;
      const isLH = sh[sh.length-1].val < sh[sh.length-2].val;
      const isLL = sl[sl.length-1].val < sl[sl.length-2].val;
      if (isBullishBias && isHH && isHL) { score++; confluence.structureAlign = true; }
      if (isBearishBias && isLH && isLL) { score++; confluence.structureAlign = true; }
    }

    // +1: Volume spike on H1
    if (h1VolSpike) { score++; confluence.volume = true; }

    // +1: RSI State (not extreme, has room to run)
    if (isBullishBias && h1Rsi >= 35 && h1Rsi <= 65) { score++; confluence.rsiState = true; }
    if (isBearishBias && h1Rsi >= 35 && h1Rsi <= 65) { score++; confluence.rsiState = true; }

    const finalScore = Math.round(score);

    // ── SIGNAL DECISION ──────────────────────────────────────────────────────
    let position = "WAIT & SEE / NO SWING SETUP";
    let entry = "0.00", sl = "0.00", tp1 = "0.00", tp2 = "0.00";
    let tp1Pips = "0", tp2Pips = "0";
    let reasonArr = [];

    if (isBullishBias && confluence.zoneTouch && finalScore >= 3) {
      position = finalScore >= 4 ? "SWING BUY — ACTIVE SIGNAL" : "SWING BUY — PENDING (Low Confluence)";
      entry = currentPrice.toFixed(2);
      // SL: below demand zone bottom with buffer
      sl    = (demandZoneBtm - h1Atr * 0.5).toFixed(2);
      // TP1: 150 pips, TP2: 400 pips (dynamic ATR scaled)
      tp1   = (currentPrice + h1Atr * 3).toFixed(2);
      tp2   = (currentPrice + h1Atr * 7).toFixed(2);
      tp1Pips = (h1Atr * 3).toFixed(0);
      tp2Pips = (h1Atr * 7).toFixed(0);
      reasonArr = [
        `H4 Bias: ${h4Bias} — EMA21 (${h4E21.toFixed(2)}) ${h4Bias.includes("BULLISH") ? ">" : "<"} EMA50 (${h4E50.toFixed(2)})`,
        `H1 Demand Zone: $${demandZoneBtm.toFixed(2)} – $${demandZoneTop.toFixed(2)} (Price di zona demand)`,
        confluence.structureAlign ? "H1 Structure: Higher High + Higher Low confirmed — trend intact" : "H1 Structure: Belum konfirmasi HH/HL penuh — hati-hati",
        confluence.volume ? `Volume H1: Spike terdeteksi (${(h1RecentVol/h1AvgVol).toFixed(1)}× average)` : "Volume H1: Normal — belum ada konfirmasi volume",
        `RSI H1: ${h1Rsi.toFixed(1)} — ${confluence.rsiState ? "Valid range, ada ruang naik" : "Perlu perhatian"}`
      ];
    } else if (isBearishBias && confluence.zoneTouch && finalScore >= 3) {
      position = finalScore >= 4 ? "SWING SELL — ACTIVE SIGNAL" : "SWING SELL — PENDING (Low Confluence)";
      entry = currentPrice.toFixed(2);
      sl    = (supplyZoneTop + h1Atr * 0.5).toFixed(2);
      tp1   = (currentPrice - h1Atr * 3).toFixed(2);
      tp2   = (currentPrice - h1Atr * 7).toFixed(2);
      tp1Pips = (h1Atr * 3).toFixed(0);
      tp2Pips = (h1Atr * 7).toFixed(0);
      reasonArr = [
        `H4 Bias: ${h4Bias} — EMA21 (${h4E21.toFixed(2)}) < EMA50 (${h4E50.toFixed(2)})`,
        `H1 Supply Zone: $${supplyZoneBtm.toFixed(2)} – $${supplyZoneTop.toFixed(2)} (Price di zona supply)`,
        confluence.structureAlign ? "H1 Structure: Lower High + Lower Low confirmed — downtrend intact" : "H1 Structure: Belum konfirmasi LH/LL penuh — hati-hati",
        confluence.volume ? `Volume H1: Spike terdeteksi (${(h1RecentVol/h1AvgVol).toFixed(1)}× average)` : "Volume H1: Normal — belum ada konfirmasi volume",
        `RSI H1: ${h1Rsi.toFixed(1)} — ${confluence.rsiState ? "Valid range, ada ruang turun" : "Perlu perhatian"}`
      ];
    } else {
      const waitFor = isBullishBias
        ? `Menunggu pullback ke Demand Zone $${demandZoneBtm.toFixed(2)} – $${demandZoneTop.toFixed(2)}`
        : `Menunggu pullback ke Supply Zone $${supplyZoneBtm.toFixed(2)} – $${supplyZoneTop.toFixed(2)}`;
      reasonArr = [
        `H4 Bias: ${h4Bias} — Market direction sudah teridentifikasi`,
        waitFor,
        `Confluence Score saat ini: ${finalScore}/5 — Butuh minimum 3/5 untuk Pending, 4/5 untuk Active`
      ];
    }

    return {
      position, h4Bias, entry, sl, tp1, tp2,
      tp1Pips, tp2Pips,
      confluenceScore: finalScore,
      confluenceDetail: confluence,
      reason: reasonArr,
      session: sessionName,
      demandZone: { top: demandZoneTop.toFixed(2), btm: demandZoneBtm.toFixed(2) },
      supplyZone: { top: supplyZoneTop.toFixed(2), btm: supplyZoneBtm.toFixed(2) },
      h1Rsi: h1Rsi.toFixed(1),
      currentPrice: currentPrice.toFixed(2)
    };
  } catch (err) {
    return {
      position: "WAIT & SEE / DATA ERROR",
      h4Bias: "UNKNOWN",
      entry: "0.00", sl: "0.00", tp1: "0.00", tp2: "0.00",
      tp1Pips: "0", tp2Pips: "0",
      confluenceScore: 0,
      reason: ["Error sinkronisasi data swing: " + err.message],
      session: sessionName
    };
  }
}

// ─── SCALP SIGNAL ENGINE (M5 Setup — GATED by Swing) ─────────────────────────
async function calculateScalpSignal(m5, swingSignal, sessionName) {
  try {
    const currentPrice = m5.current;

    // ── GATE CHECK: Scalp only fires if Swing is active and directional ───────
    const swingIsBuy  = swingSignal.position.includes("BUY");
    const swingIsSell = swingSignal.position.includes("SELL");
    const swingActive = swingIsBuy || swingIsSell;

    if (!swingActive) {
      return {
        position: "BLOCKED — Waiting for Swing Signal",
        gatedBySwing: false,
        swingBias: swingSignal.h4Bias || "NEUTRAL",
        entry: "0.00", sl: "0.00", tp1: "0.00", tp2: "0.00",
        tp1Pips: "0", tp2Pips: "0",
        confluenceScore: 0,
        reason: ["Scalp signal diblok — Swing signal belum aktif. Scalp hanya fire saat Swing confirmed dan searah."],
        session: sessionName
      };
    }

    // ── M5 INDICATORS ────────────────────────────────────────────────────────
    const m5Atr    = calculateATR(m5.h, m5.l, m5.c, 14);
    const m5RsiArr = calculateRSI(m5.c, 14, true);
    const m5Rsi    = m5RsiArr[m5RsiArr.length - 1];

    // Session-aware volume threshold
    const volMultiplier = getVolumeMultiplier(sessionName);
    const m5VolEma  = calculateEMA(m5.v, 20);
    const m5AvgVol  = m5VolEma[m5VolEma.length - 1];
    const recentVols = m5.v.slice(-3);
    const hasVolSpike = recentVols.some(vol => vol > (m5AvgVol * volMultiplier));

    // M5 Engulfing detection (proper displacement)
    const chochBuy  = isDisplacementChoCH(m5.o, m5.h, m5.l, m5.c, 'buy');
    const chochSell = isDisplacementChoCH(m5.o, m5.h, m5.l, m5.c, 'sell');

    // RSI Hook (new 5-candle, 2-tick logic)
    const rsiHookBuy  = isRsiHook(m5RsiArr, 'buy');
    const rsiHookSell = isRsiHook(m5RsiArr, 'sell');

    // RSI State filter (not overbought/oversold for entry)
    const rsiValidBuy  = m5Rsi >= 35 && m5Rsi <= 55;
    const rsiValidSell = m5Rsi >= 45 && m5Rsi <= 65;

    // Swing zone proximity check (price near H1 Demand/Supply)
    const nearDemand = swingSignal.demandZone
      ? currentPrice >= parseFloat(swingSignal.demandZone.btm) - m5Atr
        && currentPrice <= parseFloat(swingSignal.demandZone.top) + m5Atr * 2
      : true;
    const nearSupply = swingSignal.supplyZone
      ? currentPrice >= parseFloat(swingSignal.supplyZone.btm) - m5Atr * 2
        && currentPrice <= parseFloat(swingSignal.supplyZone.top) + m5Atr
      : true;

    // ── CONFLUENCE SCORING (0–5) ─────────────────────────────────────────────
    let score = 0;
    const confluence = {
      swingAligned: false, zoneProximity: false,
      engulfing: false, volume: false, rsiHook: false
    };

    // +1: Swing gate (already confirmed above, always add)
    score++; confluence.swingAligned = true;

    // +1: Zone proximity
    if (swingIsBuy  && nearDemand) { score++; confluence.zoneProximity = true; }
    if (swingIsSell && nearSupply) { score++; confluence.zoneProximity = true; }

    // +1: M5 Displacement Engulfing
    if (swingIsBuy  && chochBuy)  { score++; confluence.engulfing = true; }
    if (swingIsSell && chochSell) { score++; confluence.engulfing = true; }

    // +1: Session-aware volume spike
    if (hasVolSpike) { score++; confluence.volume = true; }

    // +1: RSI Hook + State
    if (swingIsBuy  && rsiHookBuy  && rsiValidBuy)  { score++; confluence.rsiHook = true; }
    if (swingIsSell && rsiHookSell && rsiValidSell) { score++; confluence.rsiHook = true; }

    // ── SIGNAL DECISION ──────────────────────────────────────────────────────
    let position = "WAIT & SEE / NO SCALP SETUP";
    let entry = "0.00", sl = "0.00", tp1 = "0.00", tp2 = "0.00";
    let tp1Pips = "0", tp2Pips = "0";
    let reasonArr = [];

    if (swingIsBuy && score >= 4) {
      position = "SCALP BUY — ACTIVE (M5 SNIPER)";
      entry    = currentPrice.toFixed(2);
      // SL: below M5 entry candle low + ATR buffer (tighter than swing)
      const entryLow = m5.l[m5.l.length - 1];
      sl  = (entryLow - m5Atr * 1.2).toFixed(2);
      tp1 = (currentPrice + m5Atr * 2).toFixed(2);
      tp2 = (currentPrice + m5Atr * 4).toFixed(2);
      tp1Pips = (m5Atr * 2).toFixed(0);
      tp2Pips = (m5Atr * 4).toFixed(0);
      reasonArr = [
        `Swing Gate: AKTIF — Swing BUY confirmed, scalp searah`,
        `Zone Proximity: Price ${nearDemand ? "berada di" : "mendekati"} H1 Demand Zone ($${swingSignal.demandZone?.btm} – $${swingSignal.demandZone?.top})`,
        confluence.engulfing ? "M5 Engulfing: Bullish displacement candle valid (body ≥55%, close > prev HIGH)" : "M5 Engulfing: Belum terbentuk",
        confluence.volume ? `Volume: Spike ${(recentVols[recentVols.length-1]/m5AvgVol).toFixed(1)}× > ${volMultiplier}× threshold (${sessionName})` : `Volume: Belum spike (threshold ${volMultiplier}× untuk ${sessionName})`,
        confluence.rsiHook ? `RSI M5: ${m5Rsi.toFixed(1)} — Hook UP terkonfirmasi (5-candle lookback, 2 consecutive ticks)` : `RSI M5: ${m5Rsi.toFixed(1)} — Menunggu hook formation`
      ];
    } else if (swingIsSell && score >= 4) {
      position = "SCALP SELL — ACTIVE (M5 SNIPER)";
      entry    = currentPrice.toFixed(2);
      const entryHigh = m5.h[m5.h.length - 1];
      sl  = (entryHigh + m5Atr * 1.2).toFixed(2);
      tp1 = (currentPrice - m5Atr * 2).toFixed(2);
      tp2 = (currentPrice - m5Atr * 4).toFixed(2);
      tp1Pips = (m5Atr * 2).toFixed(0);
      tp2Pips = (m5Atr * 4).toFixed(0);
      reasonArr = [
        `Swing Gate: AKTIF — Swing SELL confirmed, scalp searah`,
        `Zone Proximity: Price ${nearSupply ? "berada di" : "mendekati"} H1 Supply Zone ($${swingSignal.supplyZone?.btm} – $${swingSignal.supplyZone?.top})`,
        confluence.engulfing ? "M5 Engulfing: Bearish displacement candle valid (body ≥55%, close < prev LOW)" : "M5 Engulfing: Belum terbentuk",
        confluence.volume ? `Volume: Spike ${(recentVols[recentVols.length-1]/m5AvgVol).toFixed(1)}× > ${volMultiplier}× threshold (${sessionName})` : `Volume: Belum spike (threshold ${volMultiplier}× untuk ${sessionName})`,
        confluence.rsiHook ? `RSI M5: ${m5Rsi.toFixed(1)} — Hook DOWN terkonfirmasi (5-candle lookback, 2 consecutive ticks)` : `RSI M5: ${m5Rsi.toFixed(1)} — Menunggu hook formation`
      ];
    } else {
      // Pending state — show what's missing
      const missing = [];
      if (!confluence.zoneProximity) missing.push("Zone Proximity");
      if (!confluence.engulfing) missing.push("M5 Engulfing");
      if (!confluence.volume) missing.push(`Volume >${volMultiplier}×`);
      if (!confluence.rsiHook) missing.push("RSI Hook");
      position = score >= 2 ? "SCALP PENDING — Waiting Confirmation" : "WAIT & SEE / NO SCALP SETUP";
      reasonArr = [
        `Swing Gate: AKTIF — ${swingIsBuy ? "BUY" : "SELL"} bias dari H4/H1`,
        `Confluence Score: ${score}/5 — Butuh 4/5 untuk Active Signal`,
        `Menunggu: ${missing.join(", ")}`,
        `RSI M5 saat ini: ${m5Rsi.toFixed(1)} | ATR M5: ${m5Atr.toFixed(2)}`
      ];
    }

    return {
      position, gatedBySwing: true,
      swingBias: swingSignal.h4Bias,
      entry, sl, tp1, tp2,
      tp1Pips, tp2Pips,
      confluenceScore: score,
      confluenceDetail: confluence,
      reason: reasonArr,
      session: sessionName,
      m5Rsi: m5Rsi.toFixed(1),
      m5Atr: m5Atr.toFixed(2),
      volMultiplier,
      currentPrice: currentPrice.toFixed(2)
    };
  } catch (err) {
    return {
      position: "BLOCKED — DATA ERROR",
      gatedBySwing: false,
      swingBias: "UNKNOWN",
      entry: "0.00", sl: "0.00", tp1: "0.00", tp2: "0.00",
      tp1Pips: "0", tp2Pips: "0",
      confluenceScore: 0,
      reason: ["Error sinkronisasi data scalp: " + err.message],
      session: sessionName
    };
  }
}

// ─── MAIN DUAL SIGNAL ORCHESTRATOR ───────────────────────────────────────────
async function calculateDualSignals() {
  const sessionName = getSession();
  try {
    // Fetch all timeframes in parallel
    // H4: Yahoo Finance supports '1h' reliably; use 1d as H4 proxy via '4h' attempt
    const [h4Raw, h1, m5] = await Promise.all([
      fetchChartData('1d', '60d').catch(() => fetchChartData('1h', '10d')), // Daily as H4 bias proxy
      fetchChartData('1h', '7d'),
      fetchChartData('5m', '2d')
    ]);

    const swing = await calculateSwingSignal(h4Raw, h1, sessionName);
    const scalp = await calculateScalpSignal(m5, swing, sessionName);

    return { swing, scalp };
  } catch (err) {
    const fallback = {
      position: "WAIT & SEE / DATA ERROR",
      h4Bias: "UNKNOWN", entry: "0.00", sl: "0.00", tp1: "0.00", tp2: "0.00",
      tp1Pips: "0", tp2Pips: "0", confluenceScore: 0,
      reason: ["Sinkronisasi data multi-timeframe gagal: " + err.message],
      session: sessionName
    };
    return { swing: fallback, scalp: { ...fallback, gatedBySwing: false, swingBias: "UNKNOWN" } };
  }
}

// ─── DATA FETCHERS & MACRO SCORING ENGINES ───────────────────────────────────
// BAGIAN INI TIDAK DIUBAH SAMA SEKALI
async function fetchDXY() {
  try {
    const res = await axios.get('https://query2.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=2d',
      { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const current = res.data.chart.result[0].meta.regularMarketPrice;
    return {
      current: parseFloat(current.toFixed(2)),
      status: current >= res.data.chart.result[0].meta.previousClose ? "BULLISH (UP)" : "BEARISH (DOWN)"
    };
  } catch (err) { return { current: "N/A", status: "OFFLINE" }; }
}

async function fetchCrudeOil() {
  try {
    const res = await axios.get('https://query2.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d&range=45d',
      { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const closes = res.data.chart.result[0].indicators.quote[0].close.filter(c => c !== null);
    return {
      current: closes[closes.length - 1],
      avg30: closes.slice(-30).reduce((a, b) => a + b, 0) / Math.min(closes.length, 30)
    };
  } catch (err) { return { current: null, avg30: null }; }
}

function findLatestReleasedEvent(events, keywords) {
  const matches = events.filter(e =>
    keywords.some(kw => (e.title || e.indicator || "").toLowerCase().includes(kw.toLowerCase())) &&
    e.actual !== undefined && e.actual !== null && e.actual !== ""
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => new Date(b.date) - new Date(a.date));
  return matches[0];
}

function scoreNFP(events) {
  let score = 0; const components = {};
  const adp = findLatestReleasedEvent(events, ["adp employment", "adp nonfarm"]);
  if (adp) { const pts = adp.actual > adp.forecast ? 40 : -40; score += pts; components.adp = { event: adp.title, actual: adp.actual, estimate: adp.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" }; }
  else components.adp = { event: "ADP Nonfarm", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };
  const ism = findLatestReleasedEvent(events, ["ism manufacturing", "ism services"]);
  if (ism) { const pts = ism.actual > 50 ? 30 : -30; score += pts; components.ism = { event: ism.title, actual: ism.actual, estimate: 50.0, points: pts, status: pts > 0 ? "EXPANSIONARY" : "CONTRACTIONARY" }; }
  else components.ism = { event: "ISM PMI", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };
  const jolts = findLatestReleasedEvent(events, ["jolts"]);
  if (jolts) { const pts = jolts.actual > jolts.forecast ? 30 : -30; score += pts; components.jolts = { event: jolts.title, actual: jolts.actual, estimate: jolts.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" }; }
  else components.jolts = { event: "JOLTs Job Openings", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };
  return { score, signal: score >= 20 ? "GOOD USD" : score <= -20 ? "BAD USD" : "MIXED", components };
}

function scoreCPI(events, crudeOil) {
  let score = 0; const components = {};
  const ppi = findLatestReleasedEvent(events, ["producer price index", "ppi m/m", "core ppi"]);
  if (ppi) { const pts = ppi.actual > ppi.forecast ? 60 : -60; score += pts; components.ppi = { event: ppi.title, actual: ppi.actual, estimate: ppi.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" }; }
  else components.ppi = { event: "Producer Price Index", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };
  if (crudeOil && crudeOil.current !== null) { const pts = crudeOil.current > crudeOil.avg30 ? 40 : -40; score += pts; components.crude = { event: "Crude Oil WTI", current: crudeOil.current, avg30: crudeOil.avg30, points: pts, status: pts > 0 ? "ABOVE" : "BELOW" }; }
  else components.crude = { event: "Crude Oil WTI", points: 0, status: "FAILED" };
  return { score, signal: score >= 20 ? "HIGH INFLATION" : score <= -20 ? "LOW INFLATION" : "MIXED", components };
}

function scoreGrowth(events) {
  let score = 0; const components = {};
  const gdp = findLatestReleasedEvent(events, ["gdp growth rate", "gross domestic product"]);
  if (gdp) { const pts = gdp.actual > gdp.forecast ? 50 : -50; score += pts; components.gdp = { event: gdp.title, actual: gdp.actual, estimate: gdp.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" }; }
  else components.gdp = { event: "GDP Growth Rate", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };
  const retail = findLatestReleasedEvent(events, ["retail sales m/m", "core retail sales"]);
  if (retail) { const pts = retail.actual > retail.forecast ? 50 : -50; score += pts; components.retail = { event: retail.title, actual: retail.actual, estimate: retail.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" }; }
  else components.retail = { event: "Retail Sales", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };
  return { score, signal: score >= 20 ? "STRONG" : score <= -20 ? "WEAK" : "MIXED", components };
}

function scoreFed(events) {
  let score = 0; const components = {};
  const fed = findLatestReleasedEvent(events, ["fed interest rate", "interest rate decision"]);
  if (fed) { const pts = fed.actual >= fed.forecast ? 100 : -100; score += pts; components.fed = { event: fed.title, actual: fed.actual, estimate: fed.forecast, points: pts, status: pts > 0 ? "HAWKISH" : "DOVISH" }; }
  else components.fed = { event: "Fed Interest Rate", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };
  return { score, signal: score > 0 ? "HAWKISH" : score < 0 ? "DOVISH" : "MIXED", components };
}

// ─── MAIN ROUTER HANDLER ─────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    return res.status(200).end();
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  const isCron = req.query.cron === "true";

  if (req.method === "POST" && req.body && req.body.message) {
    if (req.body.message.text === "/refresh") {
      const [events, crudeOil, dxy, signals] = await Promise.all([
        fetchTradingViewData(), fetchCrudeOil(), fetchDXY(), calculateDualSignals()
      ]);
      const nfp = scoreNFP(events), cpi = scoreCPI(events, crudeOil);
      const growth = scoreGrowth(events), fed = scoreFed(events);
      const totalScore = nfp.score + cpi.score + growth.score + fed.score;
      await sendTelegramAlert(totalScore >= 40 ? "SELL" : "BUY", totalScore, dxy, nfp, cpi, growth, fed);
      return res.status(200).json({ success: true });
    }
    return res.status(200).json({ success: true });
  }

  try {
    const [events, crudeOil, dxy, signals] = await Promise.all([
      fetchTradingViewData(), fetchCrudeOil(), fetchDXY(), calculateDualSignals()
    ]);

    const nfp    = scoreNFP(events);
    const cpi    = scoreCPI(events, crudeOil);
    const growth = scoreGrowth(events);
    const fed    = scoreFed(events);
    const totalScore  = nfp.score + cpi.score + growth.score + fed.score;
    const masterSignal = totalScore >= 40 ? "STRONG SELL XAU" : totalScore <= -40 ? "STRONG BUY XAU" : "NEUTRAL";

    const { swing, scalp } = signals;

    if (isCron) {
      // ── Swing signal tracking ────────────────────────────────────────────
      const swingID = swing.position + "_" + swing.entry;
      const swingIsActive = swing.position.includes("SWING BUY — ACTIVE") || swing.position.includes("SWING SELL — ACTIVE");
      if (swingIsActive) {
        if (swingID !== lastSentSwingID) {
          await sendSwingSignalTelegram(swing);
          lastSentSwingID = swingID;
          isSwingActive   = true;
        }
      } else {
        if (isSwingActive) {
          await sendSwingInvalidTelegram();
          lastSentSwingID = "";
          isSwingActive   = false;
        }
      }

      // ── Scalp signal tracking ────────────────────────────────────────────
      const scalpID = scalp.position + "_" + scalp.entry;
      const scalpIsActive = scalp.position.includes("SCALP BUY — ACTIVE") || scalp.position.includes("SCALP SELL — ACTIVE");
      if (scalpIsActive) {
        if (scalpID !== lastSentScalpID) {
          await sendScalpSignalTelegram(scalp);
          lastSentScalpID = scalpID;
          isScalpActive   = true;
        }
      } else {
        if (isScalpActive) {
          await sendScalpInvalidTelegram();
          lastSentScalpID = "";
          isScalpActive   = false;
        }
      }

      // ── Pre-news warnings ────────────────────────────────────────────────
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
      swing_signal: swing,
      scalp_signal: scalp,
      // Legacy key for backward compat
      technical_signal: scalp
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
