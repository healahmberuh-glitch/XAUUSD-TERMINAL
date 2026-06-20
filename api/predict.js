// api/predict.js — DEPRESSEDESIGN Trading Station
// v6.4 — FRED API + News Prediction Engine + Win/Loss Tracking

const axios = require("axios");

const TELEGRAM_TOKEN   = "8325927674:AAF3xv3r0NRRTet5H-xaK1DKIwWshemVOeU";
const TELEGRAM_CHAT_ID = "5595296615";
const FRED_API_KEY     = "17d5f5c1eb18e504373a2328c96e1fee";

// ─── GLOBAL STATE ─────────────────────────────────────────────────────────────
let lastSentSwingID  = "";
let lastSentScalpID  = "";
let isSwingActive    = false;
let isScalpActive    = false;
let sentZoneIDs      = new Set();
let sentEntryIDs     = new Set();
let cachedEvents     = [];
let lastFetchTime    = 0;
let warnedEvents     = new Set();

// --- SWING CACHE: hitung ulang hanya jika candle H1 baru ---
let lastH1CloseTime = null;
let cachedSwing = null;
let lastSwingPrice = null;

// --- NEWS PREDICTION STATE ---
let predictionHistory = [];
let cachedFredData = {};
let lastFredFetchTime = 0;

// ─── TELEGRAM HELPERS (tidak berubah) ─────────────────────────────────────────
async function tgSend(message) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID, text: message,
      parse_mode: "HTML", disable_web_page_preview: true
    });
  } catch (e) {}
}

async function sendTelegramAlert(masterSignal, totalScore, dxy, nfp, cpi, growth, fed) {
  if (totalScore > -40 && totalScore < 40) return;
  const isSell = totalScore >= 40;
  const icon   = isSell ? "🔴" : "🟢";
  await tgSend(
    `${icon} <b>DEPRESSEDESIGN MACRO TERMINAL</b> ${icon}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 <b>SIGNAL:</b> ${isSell ? "SELL XAU/USD" : "BUY XAU/USD"}\n` +
    `📊 <b>SCORE:</b> ${totalScore > 0 ? "+" : ""}${totalScore} / ±400\n` +
    `💵 <b>DXY LIVE:</b> ${dxy.current} <i>(${dxy.status})</i>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⚙️ <b>BREAKDOWN:</b>\n` +
    `${nfp.score > 0 ? "🟥" : nfp.score < 0 ? "🟩" : "🟨"} NFP: ${nfp.score > 0 ? "+" : ""}${nfp.score} pts\n` +
    `${cpi.score > 0 ? "🟥" : cpi.score < 0 ? "🟩" : "🟨"} CPI: ${cpi.score > 0 ? "+" : ""}${cpi.score} pts\n` +
    `${growth.score > 0 ? "🟥" : growth.score < 0 ? "🟩" : "🟨"} GROWTH: ${growth.score > 0 ? "+" : ""}${growth.score} pts\n` +
    `${fed.score > 0 ? "🟥" : fed.score < 0 ? "🟩" : "🟨"} FED: ${fed.score > 0 ? "+" : ""}${fed.score} pts`
  );
}

async function sendZoneAlert(zone) {
  const icon     = zone.bias === "BUY" ? "🟢" : "🔴";
  const typeIcon = { FVG:"🔷", OB:"🔶", PHP:"⬜", PHL:"⬜", LIQ:"💧", BRK:"🔀", SESSION:"🕐" }[zone.type] || "📍";
  await tgSend(
    `${icon} <b>ZONA PANTAU BARU — XAU/USD</b> ${icon}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${typeIcon} <b>TYPE:</b> ${zone.typeLabel}\n` +
    `📐 <b>BIAS:</b> ${zone.bias}\n` +
    `📍 <b>ZONA:</b> $${zone.low.toFixed(2)} – $${zone.high.toFixed(2)}\n` +
    `💡 <b>MIDPOINT:</b> $${((zone.low + zone.high) / 2).toFixed(2)}\n` +
    `📊 <b>STRENGTH:</b> ${zone.strength}/10\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📝 <b>ALASAN:</b> ${zone.reason}\n` +
    `🕒 <b>SESSION:</b> ${zone.session}\n` +
    `⚠️ <i>Ini ZONA PANTAU — tunggu reaksi price sebelum entry!</i>`
  );
}

async function sendEntryTriggerAlert(entry) {
  const icon = entry.bias === "BUY" ? "🟢" : "🔴";
  await tgSend(
    `${icon} <b>⚡ ENTRY TRIGGERED — M1 KONFIRMASI</b> ${icon}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 <b>POSITION:</b> ${entry.bias} XAU/USD\n` +
    `📍 <b>ZONE:</b> ${entry.zoneType} (${entry.zoneBias})\n` +
    `💸 <b>ENTRY:</b> $${entry.entry.toFixed(2)}\n` +
    `🛑 <b>STOP LOSS:</b> $${entry.sl.toFixed(2)}\n` +
    `💰 <b>TP1:</b> $${entry.tp1.toFixed(2)} (~${entry.tp1Pips} pips)\n` +
    `💰 <b>TP2:</b> $${entry.tp2.toFixed(2)} (~${entry.tp2Pips} pips)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 <b>CONFLUENCE:</b> ${entry.confluence}/5\n` +
    `🔍 <b>TRIGGER:</b> Liquidity Sweep + M1 ChoCH confirmed\n` +
    `🕒 <b>SESSION:</b> ${entry.session}\n` +
    `⚠️ <i>Hold: 5–30 menit | Min RR 1:2 | NOT FINANCIAL ADVICE</i>`
  );
}

async function sendSwingSignalTelegram(swing) {
  const icon = swing.position.includes("BUY") ? "🟢" : "🔴";
  await tgSend(
    `${icon} <b>⚓ SWING SIGNAL — H4/H1</b> ${icon}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 <b>POSITION:</b> ${swing.position}\n` +
    `📐 <b>H4 BIAS:</b> ${swing.h4Bias}\n` +
    `💸 <b>ENTRY:</b> $${swing.entry}\n` +
    `🛑 <b>STOP LOSS:</b> $${swing.sl}\n` +
    `💰 <b>TP1:</b> $${swing.tp1} (~${swing.tp1Pips} pips)\n` +
    `💰 <b>TP2:</b> $${swing.tp2} (~${swing.tp2Pips} pips)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 <b>CONFLUENCE:</b> ${swing.confluenceScore}/5\n` +
    `${(swing.reason || []).map(r => `• ${r}`).join("\n")}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🕒 <b>SESSION:</b> ${swing.session}\n` +
    `⚠️ <i>Hold: Hours–Days | Min RR 1:3</i>`
  );
}

async function sendScalpSignalTelegram(scalp) {
  const icon = scalp.position.includes("BUY") ? "🟢" : "🔴";
  await tgSend(
    `${icon} <b>⚡ SCALP SIGNAL — M5 EXECUTION</b> ${icon}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 <b>POSITION:</b> ${scalp.position}\n` +
    `💸 <b>ENTRY:</b> $${scalp.entry}\n` +
    `🛑 <b>STOP LOSS:</b> $${scalp.sl}\n` +
    `💰 <b>TP1:</b> $${scalp.tp1} (~${scalp.tp1Pips} pips)\n` +
    `💰 <b>TP2:</b> $${scalp.tp2} (~${scalp.tp2Pips} pips)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 <b>CONFLUENCE:</b> ${scalp.confluenceScore}/5\n` +
    `⚓ <b>SWING ALIGNED:</b> ${scalp.swingAligned ? "✅ YES" : "⚠️ NO (still valid but lower strength)"}\n` +
    `${(scalp.reason || []).map(r => `• ${r}`).join("\n")}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🕒 <b>SESSION:</b> ${scalp.session}\n` +
    `⚠️ <i>Hold: 5–30 menit | Min RR 1:2</i>`
  );
}

async function sendSwingInvalidTelegram() {
  await tgSend(
    `⚠️ <b>SWING SIGNAL: INVALIDATED</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `H1 structure keluar dari zona swing.\n` +
    `Swing dibatalkan. Scalp tetap independen.\n` +
    `Mode: WAIT &amp; SEE.`
  );
}

async function sendScalpInvalidTelegram() {
  await tgSend(
    `⚡ <b>SCALP SIGNAL: CLOSED</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Harga M5 keluar dari zona eksekusi.\n` +
    `Scalp dibatalkan. Swing masih aktif — tunggu re-entry.`
  );
}

async function sendPreNewsWarning(newsItem) {
  await tgSend(
    `⏳ <b>PRE-NEWS WARNING</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🚨 <b>${newsItem.title || newsItem.indicator || "USD High Impact News"}</b>\n` +
    `Rilis dalam <b>5 MENIT!</b>\n` +
    `📊 Forecast: ${newsItem.forecast || "N/A"}\n` +
    `⚠️ <i>Volatilitas tinggi. Amankan SL atau hindari entry!</i>`
  );
}

// ─── SMART CACHE ENGINE (tidak berubah) ───────────────────────────────────────
async function fetchTradingViewData() {
  const now = Date.now();
  let needFresh = cachedEvents.length === 0 || (now - lastFetchTime) > 900000;
  if (!needFresh) {
    needFresh = cachedEvents.some(e => {
      if (e.country !== "US" && e.currency !== "USD") return false;
      const diff = (now - new Date(e.date).getTime()) / 60000;
      return diff >= -5 && diff <= 15;
    });
  }
  if (!needFresh) return cachedEvents;
  try {
    const today = new Date();
    const from  = new Date(today); from.setDate(today.getDate() - 45);
    const to    = new Date(today); to.setDate(today.getDate() + 15);
    const res = await axios.get(
      `https://economic-calendar.tradingview.com/events?from=${from.toISOString()}&to=${to.toISOString()}&countries=US`,
      { timeout: 10000, headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json", "Origin": "https://www.tradingview.com", "Referer": "https://www.tradingview.com/" } }
    );
    if (res.data?.result?.length > 0) { cachedEvents = res.data.result; lastFetchTime = now; }
    return cachedEvents;
  } catch (e) { return cachedEvents; }
}

// ─── MATH PRIMITIVES (tidak berubah) ─────────────────────────────────────────
function calculateEMA(data, period) {
  const k = 2 / (period + 1);
  let arr = [data[0]];
  for (let i = 1; i < data.length; i++) arr.push(data[i] * k + arr[i-1] * (1-k));
  return arr;
}

function calculateRSI(closes, period = 14, returnArray = false) {
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i-1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let ag = gains/period, al = losses/period;
  const arr = [al === 0 ? 100 : 100-(100/(1+ag/al))];
  for (let i = period+1; i < closes.length; i++) {
    const d = closes[i] - closes[i-1];
    if (d >= 0) { ag=(ag*13+d)/14; al=(al*13)/14; } else { ag=(ag*13)/14; al=(al*13-d)/14; }
    arr.push(al === 0 ? 100 : 100-(100/(1+ag/al)));
  }
  return returnArray ? arr : arr[arr.length-1];
}

function calculateATR(h, l, c, period = 14) {
  let trs = [];
  for (let i = 1; i < c.length; i++)
    trs.push(Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1])));
  let atr = trs.slice(0, period).reduce((a,b) => a+b) / period;
  for (let i = period; i < trs.length; i++) atr = (atr*13+trs[i])/14;
  return atr;
}

function findSwingHighsLows(highs, lows, left = 5, right = 5) {
  let sH = [], sL = [];
  for (let i = left; i < highs.length - right; i++) {
    let hi = true, lo = true;
    for (let j = i-left; j <= i+right; j++) {
      if (j===i) continue;
      if (highs[j] >= highs[i]) hi = false;
      if (lows[j]  <= lows[i])  lo = false;
    }
    if (hi) sH.push({ index:i, val:highs[i] });
    if (lo) sL.push({ index:i, val:lows[i]  });
  }
  return { swingHighs:sH, swingLows:sL };
}

// ─── VOLUME ANALYSIS: Climax + Consistency ────────────────────────────────────
function analyzeVolume(v, period = 20) {
  if (v.length < period + 3) return { hasClimax: false, spikeMultiplier: 0, isConsistent: false };
  const volEma = calculateEMA(v, period);
  const currentVol = v[v.length - 1];
  const ema = volEma[volEma.length - 1];
  const multiplier = ema > 0 ? currentVol / ema : 0;

  // Climax: current volume > 2.5x EMA (extreme spike)
  const hasClimax = multiplier > 2.5;

  // Consistent: last 3 candles all above EMA (sustained interest)
  const last3 = v.slice(-3);
  const isConsistent = last3.every(vol => vol > ema);

  return { hasClimax, spikeMultiplier: multiplier, isConsistent };
}

// ─── SWING QUALITY: Check if swing point is fresh (not too old) ───────────────
function isSwingFresh(swingIndex, totalLength, maxAge = 20) {
  return (totalLength - 1 - swingIndex) <= maxAge;
}

// ─── PROPER ChoCH: Structure Break + Displacement Candle ────────────────────────
// ChoCH = price breaks a recent swing high/low with a displacement candle (strong body)
function isDisplacementChoCH(o, h, l, c, direction) {
  const n = c.length;
  if (n < 15) return false;
  const curr = { o:o[n-1], h:h[n-1], l:l[n-1], c:c[n-1] };
  const prev = { o:o[n-2], h:h[n-2], l:l[n-2], c:c[n-2] };

  // Step 1: Displacement candle — strong body (>55% of range), directional
  const bodySize = Math.abs(curr.c - curr.o);
  const candleRange = curr.h - curr.l;
  if (candleRange <= 0) return false;
  const bodyRatio = bodySize / candleRange;
  if (bodyRatio < 0.55) return false;

  const isBullCandle = curr.c > curr.o;
  const isBearCandle = curr.c < curr.o;

  // Step 2: Find recent swing high/low (lookback 10 candles)
  const lookback = Math.min(10, n - 3);
  let recentSwingHigh = -Infinity, recentSwingLow = Infinity;
  for (let i = n - lookback - 2; i < n - 2; i++) {
    if (h[i] > recentSwingHigh) recentSwingHigh = h[i];
    if (l[i] < recentSwingLow) recentSwingLow = l[i];
  }

  // Step 3: Structure break — candle CLOSE must break the swing level
  if (direction === "buy") {
    // Bullish ChoCH: displacement candle closes above recent swing high
    return isBullCandle && curr.c > recentSwingHigh && curr.c > prev.h;
  } else {
    // Bearish ChoCH: displacement candle closes below recent swing low
    return isBearCandle && curr.c < recentSwingLow && curr.c < prev.l;
  }
}

function isRsiHook(rsiArr, direction) {
  if (rsiArr.length < 6) return false;
  const r5   = rsiArr.slice(-5);
  const last  = rsiArr[rsiArr.length-1];
  const prev1 = rsiArr[rsiArr.length-2];
  const prev2 = rsiArr[rsiArr.length-3];
  return direction === "buy"
    ? r5.some(r => r < 40) && last > prev1 && prev1 > prev2
    : r5.some(r => r > 60) && last < prev1 && prev1 < prev2;
}

function getSession() {
  const h = new Date().getUTCHours();
  if (h >= 0  && h < 7)  return "ASIAN RANGE";
  if (h >= 7  && h < 12) return "LONDON KILLZONE";
  if (h >= 12 && h < 21) return "NEW YORK KILLZONE";
  return "LATE NY";
}

function getVolumeMultiplier(session) {
  if (session.includes("ASIAN"))  return 1.3;
  if (session.includes("LONDON")) return 2.0;
  if (session.includes("NEW YORK")) return 2.0;
  return 1.5;
}

async function fetchChartData(interval, range) {
  const res = await axios.get(
    `https://query2.finance.yahoo.com/v8/finance/chart/GC=F?interval=${interval}&range=${range}`,
    { timeout: 12000, headers: { "User-Agent": "Mozilla/5.0" } }
  );
  const q = res.data.chart.result[0].indicators.quote[0];
  let c=[], o=[], h=[], l=[], v=[];
  for (let i = 0; i < q.close.length; i++) {
    if (q.close[i] !== null) {
      c.push(q.close[i]); o.push(q.open[i]);
      h.push(q.high[i]);  l.push(q.low[i]);
      v.push(q.volume[i] || 0);
    }
  }
  return { c, o, h, l, v, current: c[c.length-1] };
}

// ─── REAL-TIME GOLD PRICE ────────────────────────────────────────────────────
async function fetchGoldPrice() {
  // Method 1: Yahoo Finance - try spot tickers first
  try {
    const res = await axios.get(
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=XAU=X,GC=F`,
      { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const quotes = res.data?.quoteResponse?.result || [];
    // XAU=X is Yahoo's gold spot ticker (closest to OANDA)
    const spot = quotes.find(q => q.symbol === "XAU=X");
    const futures = quotes.find(q => q.symbol === "GC=F");
    const q = spot || futures;
    if (q && q.regularMarketPrice) {
      return {
        price: q.regularMarketPrice,
        change: q.regularMarketChange,
        changePercent: q.regularMarketChangePercent,
        source: spot ? "XAU=X (spot)" : "GC=F (futures)",
        time: q.regularMarketTime
      };
    }
  } catch (e) {}

  // Method 2: Yahoo Finance v8 chart API (fallback)
  try {
    const res = await axios.get(
      `https://query2.finance.yahoo.com/v8/finance/chart/XAU=X?interval=1m&range=1d`,
      { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const meta = res.data?.chart?.result?.[0]?.meta;
    if (meta && meta.regularMarketPrice) {
      return {
        price: meta.regularMarketPrice,
        change: meta.regularMarketChange || 0,
        changePercent: meta.regularMarketChangePercent || 0,
        source: "XAU=X chart (spot)",
        time: meta.regularMarketTime
      };
    }
  } catch (e) {}

  // Method 3: Gold-API.io free endpoint (no key needed for basic)
  try {
    const res = await axios.get(
      `https://www.goldapi.io/api/XAU/USD`,
      { timeout: 5000, headers: { "x-access-token": "goldapi-demo" } }
    );
    if (res.data && res.data.price) {
      return {
        price: res.data.price,
        change: res.data.ch || 0,
        changePercent: res.data.chp || 0,
        source: "GoldAPI (spot)",
        time: res.data.timestamp
      };
    }
  } catch (e) {}

  return null;
}

// ─── RAW ZONE SCANNERS (tidak berubah) ──────────────────────────────────────
function scanPreviousHL(h1, session) {
  const zones = [];
  const swings = findSwingHighsLows(h1.h, h1.l, 4, 4);
  const atr    = calculateATR(h1.h, h1.l, h1.c, 14);
  const price  = h1.current;

  swings.swingHighs.slice(-5).forEach((sh, i) => {
    const zHigh = sh.val + atr * 0.2;
    const zLow  = sh.val - atr * 0.4;
    const midpoint = (zHigh + zLow) / 2;
    if (midpoint <= price) return;
    const broken = price > sh.val;
    if (broken) return;
    const dist  = Math.abs(price - sh.val);
    if (dist > atr * 8) return; 
    const strength = 5 - i;
    zones.push({
      type: "PHP", typeLabel: "Previous High (Supply)",
      bias: "SELL", high: zHigh, low: zLow,
      strength: Math.min(5, Math.max(1, strength)),
      reason: `Swing high di $${sh.val.toFixed(2)} — potential supply / reaction zone`,
      session, id: `PHP_${sh.val.toFixed(2)}`
    });
  });

  swings.swingLows.slice(-5).forEach((sl, i) => {
    const zHigh = sl.val + atr * 0.4;
    const zLow  = sl.val - atr * 0.2;
    const midpoint = (zHigh + zLow) / 2;
    if (midpoint >= price) return;
    const broken = price < sl.val;
    if (broken) return;
    const dist  = Math.abs(price - sl.val);
    if (dist > atr * 8) return;
    const strength = 5 - i;
    zones.push({
      type: "PHL", typeLabel: "Previous Low (Demand)",
      bias: "BUY", high: zHigh, low: zLow,
      strength: Math.min(5, Math.max(1, strength)),
      reason: `Swing low di $${sl.val.toFixed(2)} — potential demand / bounce zone`,
      session, id: `PHL_${sl.val.toFixed(2)}`
    });
  });
  return zones;
}

// ─── FVG SCANNER (Fixed naming: gapTop > gapBottom = correct) ──────────────────
function scanFVG(m5, session) {
  const zones = [];
  const atr = calculateATR(m5.h, m5.l, m5.c, 14);
  const price = m5.current;
  const len = m5.c.length;

  for (let i = len - 30; i < len - 2; i++) {
    if (i < 2) continue;

    // Bullish FVG: candle[i] low > candle[i+2] high = gap up
    const gapBottom = m5.h[i + 2];  // lower boundary of gap
    const gapTop    = m5.l[i];       // upper boundary of gap
    if (gapTop > gapBottom) {
      let filled = false;
      for (let j = i + 3; j < len; j++) {
        if (m5.l[j] <= gapBottom && m5.h[j] >= gapTop) { filled = true; break; }
      }
      const midpoint = (gapTop + gapBottom) / 2;
      const isBelowPrice = midpoint < price;
      if (!filled && Math.abs(price - midpoint) < atr * 3) {
        const gapSize = gapTop - gapBottom;
        const strength = gapSize > atr * 0.5 ? 5 : 3;
        zones.push({
          type: "FVG", typeLabel: "Fair Value Gap (Demand)",
          bias: isBelowPrice ? "BUY" : "TARGET",
          high: gapTop, low: gapBottom, strength,
          reason: `Bullish FVG unfilled di $${gapBottom.toFixed(2)}-$${gapTop.toFixed(2)}`,
          session, id: `FVG_BULL_${i}_${gapTop.toFixed(2)}`
        });
      }
    }

    // Bearish FVG: candle[i] high < candle[i+2] low = gap down
    const bearGapTop    = m5.l[i + 2]; // upper boundary of gap
    const bearGapBottom = m5.h[i];      // lower boundary of gap
    if (bearGapBottom < bearGapTop) {
      let filled = false;
      for (let j = i + 3; j < len; j++) {
        if (m5.h[j] >= bearGapTop && m5.l[j] <= bearGapBottom) { filled = true; break; }
      }
      const midpoint = (bearGapTop + bearGapBottom) / 2;
      const isAbovePrice = midpoint > price;
      if (!filled && Math.abs(price - midpoint) < atr * 3) {
        const gapSize = bearGapTop - bearGapBottom;
        const strength = gapSize > atr * 0.5 ? 5 : 3;
        zones.push({
          type: "FVG", typeLabel: "Fair Value Gap (Supply)",
          bias: isAbovePrice ? "SELL" : "TARGET",
          high: bearGapTop, low: bearGapBottom, strength,
          reason: `Bearish FVG unfilled di $${bearGapBottom.toFixed(2)}-$${bearGapTop.toFixed(2)}`,
          session, id: `FVG_BEAR_${i}_${bearGapBottom.toFixed(2)}`
        });
      }
    }
  }
  return zones;
}

function scanOrderBlocks(m5, session) {
  const zones  = [];
  const atr    = calculateATR(m5.h, m5.l, m5.c, 14);
  const price  = m5.current;
  const len    = m5.c.length;

  for (let i = len - 40; i < len - 3; i++) {
    if (i < 1) continue;
    const bodySize = Math.abs(m5.c[i] - m5.o[i]);
    if (bodySize < atr * 0.3) continue;

    const isBearCandle = m5.c[i] < m5.o[i];
    if (isBearCandle) {
      const nextUp = m5.c[i+1] > m5.o[i+1] && m5.c[i+2] > m5.o[i+2];
      const impulse = m5.c[i+2] - m5.o[i+1] > atr * 0.6;
      if (nextUp && impulse) {
        const dist = Math.abs(price - m5.l[i]);
        if (dist < atr * 12) {
          zones.push({
            type: "OB", typeLabel: "Order Block (Bullish OB)", bias: "BUY",
            high: m5.o[i], low: m5.l[i], strength: impulse ? 5 : 3,
            reason: `Bull OB di $${m5.l[i].toFixed(2)}–$${m5.o[i].toFixed(2)}`,
            session, id: `OB_BULL_${i}_${m5.l[i].toFixed(2)}`
          });
        }
      }
    }

    const isBullCandle = m5.c[i] > m5.o[i];
    if (isBullCandle) {
      const nextDn = m5.c[i+1] < m5.o[i+1] && m5.c[i+2] < m5.o[i+2];
      const impulse = m5.o[i+1] - m5.c[i+2] > atr * 0.6;
      if (nextDn && impulse) {
        const dist = Math.abs(price - m5.h[i]);
        if (dist < atr * 12) {
          zones.push({
            type: "OB", typeLabel: "Order Block (Bearish OB)", bias: "SELL",
            high: m5.h[i], low: m5.o[i], strength: impulse ? 5 : 3,
            reason: `Bear OB di $${m5.o[i].toFixed(2)}–$${m5.h[i].toFixed(2)}`,
            session, id: `OB_BEAR_${i}_${m5.h[i].toFixed(2)}`
          });
        }
      }
    }
  }
  return zones;
}

function scanBreakers(m5, session) {
  const zones = [];
  const atr = calculateATR(m5.h, m5.l, m5.c, 14);
  const price = m5.current;
  const len = m5.c.length;

  for (let i = len - 50; i < len - 5; i++) {
    if (i < 1) continue;
    const isBullCandleHere = m5.c[i] > m5.o[i];
    if (isBullCandleHere) {
      const obHigh = m5.h[i], obLow  = m5.l[i];
      let wasBroken = false;
      for (let j = i + 2; j < Math.min(i + 15, len); j++) { if (m5.l[j] > obHigh) { wasBroken = true; break; } }
      if (!wasBroken) continue;
      const midpoint = (obHigh + obLow) / 2;
      if (price < midpoint) continue;
      if (Math.abs(price - midpoint) > atr * 5) continue;
      const retestedBreaker = m5.l[len - 1] <= obHigh + atr * 0.2;
      if (!retestedBreaker) continue;
      zones.push({
        type: "BRK", typeLabel: "Breaker Block (Flipped Support)",
        bias: midpoint < price ? "BUY" : "TARGET",
        high: obHigh + atr * 0.3, low: obLow - atr * 0.2, strength: 4,
        reason: `Breaker di $${obHigh.toFixed(2)} — ex-resistance flip ke support`,
        session, id: `BRK_BULL_${i}_${obHigh.toFixed(2)}`
      });
    }

    const isBearCandleHere = m5.c[i] < m5.o[i];
    if (isBearCandleHere) {
      const obHigh = m5.h[i], obLow  = m5.l[i];
      let wasBroken = false;
      for (let j = i + 2; j < Math.min(i + 15, len); j++) { if (m5.h[j] < obLow) { wasBroken = true; break; } }
      if (!wasBroken) continue;
      const midpoint = (obHigh + obLow) / 2;
      if (Math.abs(price - midpoint) > atr * 5) continue;
      if (price > midpoint) continue;
      const retestedBreaker = m5.h[len - 1] >= obLow - atr * 0.2;
      if (!retestedBreaker) continue;
      zones.push({
        type: "BRK", typeLabel: "Breaker Block (Flipped Resistance)",
        bias: midpoint > price ? "SELL" : "TARGET",
        high: obHigh + atr * 0.2, low: obLow - atr * 0.3, strength: 4,
        reason: `Breaker di $${obLow.toFixed(2)} — ex-support flip ke resistance`,
        session, id: `BRK_BEAR_${i}_${obLow.toFixed(2)}`
      });
    }
  }
  return zones;
}

function scanLiquidityLevels(h1, m5, session) {
  const zones = [];
  const atr   = calculateATR(h1.h, h1.l, h1.c, 14);
  const price = h1.current;
  const len   = h1.h.length;
  const tolerance = Math.min(atr * 0.5, 2.0);

  for (let i = len - 30; i < len - 2; i++) {
    for (let j = i + 2; j < len - 1; j++) {
      const diffH = Math.abs(h1.h[i] - h1.h[j]);
      const diffL = Math.abs(h1.l[i] - h1.l[j]);

      if (diffH < tolerance) {
        const lvl  = (h1.h[i] + h1.h[j]) / 2;
        const abovePrice = lvl > price;
        const dist = Math.abs(price - lvl);
        if (dist < atr * 10 && dist > atr * 0.5) {
          zones.push({
            type: "LIQ", typeLabel: "Liquidity Level (Equal Highs)",
            bias: abovePrice ? "SELL" : "TARGET",
            high: lvl + tolerance, low: lvl - tolerance * 0.5, strength: 4,
            reason: `Equal highs di ~$${lvl.toFixed(2)} — stop hunt zone`,
            session, id: `LIQ_HIGH_${lvl.toFixed(2)}`
          });
        }
      }

      if (diffL < tolerance) {
        const lvl  = (h1.l[i] + h1.l[j]) / 2;
        const belowPrice = lvl < price;
        const dist = Math.abs(price - lvl);
        if (dist < atr * 10 && dist > atr * 0.5) {
          zones.push({
            type: "LIQ", typeLabel: "Liquidity Level (Equal Lows)",
            bias: "BUY",
            high: lvl + tolerance * 0.5, low: lvl - tolerance, strength: 4,
            reason: `Equal lows di ~$${lvl.toFixed(2)} — stop hunt zone`,
            session, id: `LIQ_LOW_${lvl.toFixed(2)}`
          });
        }
      }
    }
  }
  return zones;
}

function scanSessionLevels(h1, session) {
  const zones = [];
  const atr   = calculateATR(h1.h, h1.l, h1.c, 14);
  const price = h1.current;
  const now   = new Date();
  const utcH  = now.getUTCHours();

  if (utcH >= 7 && utcH <= 20) {
    const londonOpen = h1.o[h1.o.length - Math.min(utcH - 7 + 1, h1.o.length - 1)] || price;
    const dist       = Math.abs(price - londonOpen);
    if (dist < atr * 6) {
      zones.push({
        type: "SESSION", typeLabel: "Session Level (London Open)",
        bias: price > londonOpen ? "SELL" : "BUY",
        high: londonOpen + atr * 0.3, low: londonOpen - atr * 0.3, strength: 3,
        reason: `London open level $${londonOpen.toFixed(2)}`,
        session, id: `SESSION_LONDON_${londonOpen.toFixed(2)}`
      });
    }
  }
  return zones;
}

// ─── SPATIAL CONFLUENCE & LIMIT ORDER ENGINE (dengan perbaikan entry untuk SELL) ───
async function scanAllZones(h1, m5, session, swing) {
  try {
    if (!h1.c || h1.c.length === 0 || !m5.c || m5.c.length === 0) return []; 
    const raw = [
      ...scanPreviousHL(h1, session),
      ...scanFVG(m5, session),
      ...scanOrderBlocks(m5, session),
      ...scanBreakers(m5, session),
      ...scanLiquidityLevels(h1, m5, session),
      ...scanSessionLevels(h1, session)
    ];

    const recentH1High = Math.max(...h1.h.slice(-48));
    const recentH1Low  = Math.min(...h1.l.slice(-48));
    const equilibrium  = (recentH1High + recentH1Low) / 2;
    const h4Bias = swing ? (swing.h4Bias || "NEUTRAL") : "NEUTRAL";

    let scoredZones = raw.map(z => {
      let score = z.strength;
      let notes = [z.reason];
      const midpoint = (z.high + z.low) / 2;

      if (h4Bias.includes("BULLISH") && z.bias === "BUY") { score += 2; notes.push("Searah H4 Trend"); }
      if (h4Bias.includes("BEARISH") && z.bias === "SELL") { score += 2; notes.push("Searah H4 Trend"); }
      if (z.bias === "BUY" && midpoint < equilibrium) { score += 1; notes.push("Discount Pricing"); }
      if (z.bias === "SELL" && midpoint > equilibrium) { score += 1; notes.push("Premium Pricing"); }

      return { ...z, strength: score, advancedReason: notes.join(" + ") };
    });

    const fvgs = scoredZones.filter(z => z.type === "FVG");
    scoredZones.forEach(z => {
      if (z.type === "OB") {
         const overlappingFVG = fvgs.find(f => f.bias === z.bias && z.low <= f.high && z.high >= f.low);
         if (overlappingFVG) {
            z.strength += 3;
            z.advancedReason = "⚡ GOLDEN POI (OB+FVG Overlap) + " + z.advancedReason;
            z.typeLabel = "Golden POI (OB + FVG)";
         }
      }
    });

    const price = m5.current;
    
    let filtered = scoredZones.filter(z => {
      if (z.bias === "TARGET") return false;
      if (h4Bias.includes("BULLISH") && z.bias === "SELL" && z.strength < 5) return false; 
      if (h4Bias.includes("BEARISH") && z.bias === "BUY" && z.strength < 5) return false;
      return z.bias === "BUY" ? ((z.high + z.low)/2) < price : ((z.high + z.low)/2) > price;
    });

    const seen = new Set();
    const deduped = filtered.filter(z => {
      if (seen.has(z.id)) return false;
      seen.add(z.id); return true;
    });

    deduped.sort((a,b) => {
      const scoreA = (a.strength * 100) - Math.abs(price - ((a.high + a.low) / 2));
      const scoreB = (b.strength * 100) - Math.abs(price - ((b.high + b.low) / 2));
      return scoreB - scoreA;
    });

    // SMC SL/TP ENGINE (berbasis swing terdekat + ATR)
    const m5Swings = findSwingHighsLows(m5.h, m5.l, 3, 3);
    const m5Atr = calculateATR(m5.h, m5.l, m5.c, 14);

    return deduped.slice(0, 8).map(z => {
      const isBuy = z.bias === "BUY";
      const entryPrice = isBuy ? z.low : z.high;

      const nearestSwingHigh = m5Swings.swingHighs
        .filter(sh => sh.val > entryPrice)
        .sort((a,b) => a.val - b.val)[0]?.val;
      const nearestSwingLow = m5Swings.swingLows
        .filter(sl => sl.val < entryPrice)
        .sort((a,b) => b.val - a.val)[0]?.val;

      let slPrice;
      if (isBuy) {
        const baseSL = nearestSwingLow ? nearestSwingLow - m5Atr * 0.3 : z.low - m5Atr;
        slPrice = Math.min(baseSL, z.low - m5Atr * 0.5);
      } else {
        const baseSL = nearestSwingHigh ? nearestSwingHigh + m5Atr * 0.3 : z.high + m5Atr;
        slPrice = Math.max(baseSL, z.high + m5Atr * 0.5);
      }

      const risk = Math.abs(entryPrice - slPrice);
      const tp1 = isBuy ? entryPrice + risk * 2 : entryPrice - risk * 2;
      const tp2 = isBuy ? entryPrice + risk * 3 : entryPrice - risk * 3;

      return {
        ...z,
        reason: z.advancedReason || z.reason,
        midpoint: ((z.high + z.low) / 2).toFixed(2),
        highStr: z.high.toFixed(2),
        lowStr: z.low.toFixed(2),
        priceInZone: price >= z.low && price <= z.high,
        signal: {
          entry: entryPrice.toFixed(2),
          sl: slPrice.toFixed(2),
          tp1: tp1.toFixed(2),
          tp2: tp2.toFixed(2),
          riskPips: risk.toFixed(1),
          tp1Pips: (risk * 2).toFixed(1),
          tp2Pips: (risk * 3).toFixed(1)
        }
      };
    });
  } catch (e) { return []; }
}

// ─── ENTRY TRIGGER ENGINE (M1) — M1 Confirmation for limit orders ─────────────
// Checks if price is inside a zone and M1 shows entry confirmation
async function checkEntryTriggers(m1, zones, session) {
  try {
    if (!m1 || !m1.c || m1.c.length < 10 || !zones || zones.length === 0) return [];

    const price = m1.current;
    const m1Atr = calculateATR(m1.h, m1.l, m1.c, 14);
    const m1RsiArr = calculateRSI(m1.c, 14, true);
    const m1Rsi = m1RsiArr[m1RsiArr.length - 1];
    const volAnalysis = analyzeVolume(m1.v, 14);

    const triggers = [];

    for (const zone of zones) {
      if (!zone.signal) continue;
      const zoneHigh = zone.high;
      const zoneLow = zone.low;
      const isBuy = zone.bias === "BUY";
      const isSell = zone.bias === "SELL";

      // Check: is price currently inside or touching this zone?
      const entryPrice = parseFloat(zone.signal.entry);
      const tolerance = m1Atr * 0.5;
      const isInRange = isBuy
        ? price >= zoneLow - tolerance && price <= zoneHigh + tolerance
        : price >= zoneLow - tolerance && price <= zoneHigh + tolerance;

      if (!isInRange) continue;

      // M1 confirmation checks
      let confScore = 0;
      const confReasons = [];

      // 1. RSI alignment (buy: oversold hooking up, sell: overbought hooking down)
      if (isBuy && m1Rsi >= 25 && m1Rsi <= 45) { confScore++; confReasons.push("RSI oversold zone"); }
      else if (isSell && m1Rsi >= 55 && m1Rsi <= 75) { confScore++; confReasons.push("RSI overbought zone"); }

      // 2. Volume spike on M1 (confirmation of interest at zone)
      if (volAnalysis.hasClimax || volAnalysis.spikeMultiplier > 1.5) { confScore++; confReasons.push("M1 volume spike"); }

      // 3. M1 candle structure: rejection wick (buy: long lower wick, sell: long upper wick)
      const lastCandle = { o: m1.o[m1.o.length-1], h: m1.h[m1.h.length-1], l: m1.l[m1.l.length-1], c: m1.c[m1.c.length-1] };
      const bodySize = Math.abs(lastCandle.c - lastCandle.o);
      const totalRange = lastCandle.h - lastCandle.l;
      if (totalRange > 0) {
        if (isBuy) {
          const lowerWick = Math.min(lastCandle.o, lastCandle.c) - lastCandle.l;
          if (lowerWick / totalRange > 0.5 && bodySize / totalRange < 0.35) {
            confScore++; confReasons.push("M1 bullish rejection wick");
          }
        } else {
          const upperWick = lastCandle.h - Math.max(lastCandle.o, lastCandle.c);
          if (upperWick / totalRange > 0.5 && bodySize / totalRange < 0.35) {
            confScore++; confReasons.push("M1 bearish rejection wick");
          }
        }
      }

      // 4. Price proximity to zone midpoint (better entry quality)
      const midpoint = (zoneHigh + zoneLow) / 2;
      const distToMid = Math.abs(price - midpoint);
      if (distToMid < m1Atr * 0.5) { confScore++; confReasons.push("Near zone midpoint"); }

      // Need at least 2 M1 confirmations to trigger
      if (confScore >= 2) {
        triggers.push({
          triggerId: `TRIG_${zone.id}_${Date.now()}`,
          bias: isBuy ? "BUY" : "SELL",
          zoneType: zone.typeLabel || zone.type,
          zoneBias: zone.bias,
          entry: entryPrice,
          sl: parseFloat(zone.signal.sl),
          tp1: parseFloat(zone.signal.tp1),
          tp2: parseFloat(zone.signal.tp2),
          tp1Pips: parseFloat(zone.signal.tp1Pips),
          tp2Pips: parseFloat(zone.signal.tp2Pips),
          confluence: confScore,
          reasons: confReasons,
          session,
          timestamp: new Date().toISOString()
        });
      }
    }

    return triggers;
  } catch (e) {
    return [];
  }
}

// ─── SWING SIGNAL ENGINE (H4/H1) — Fixed cache + Zone Touch gradation ────────
async function calculateSwingSignal(h4, h1, session) {
  try {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    const h1Length = h1.c.length;
    const currentPrice = h1.current;

    // Cache invalidation: recalc if new candle OR price moved > 0.5 ATR since last calc
    if (cachedSwing && lastH1CloseTime === h1Length && lastSwingPrice !== null) {
      const h1Atr = calculateATR(h1.h, h1.l, h1.c, 14);
      const priceDelta = Math.abs(currentPrice - lastSwingPrice);
      if (priceDelta < h1Atr * 0.5) {
        return { ...cachedSwing, currentPrice: currentPrice.toFixed(2) };
      }
    }
    lastH1CloseTime = h1Length;
    lastSwingPrice = currentPrice;

    const h4Ema21  = calculateEMA(h4.c, 21);
    const h4Ema50  = calculateEMA(h4.c, 50);
    const h4Last   = h4.c[h4.c.length-1];
    const h4E21    = h4Ema21[h4Ema21.length-1];
    const h4E50    = h4Ema50[h4Ema50.length-1];
    const emaDiff  = Math.abs(h4E21-h4E50)/h4E50*100;

    let h4Bias = "NEUTRAL";
    if (emaDiff >= 0.3) {
      if      (h4E21 > h4E50 && h4Last > h4E21) h4Bias = "BULLISH";
      else if (h4E21 < h4E50 && h4Last < h4E21) h4Bias = "BEARISH";
      else if (h4E21 > h4E50)                    h4Bias = "BULLISH_WEAK";
      else                                        h4Bias = "BEARISH_WEAK";
    }

    if (h4Bias === "NEUTRAL") {
      const swingResult = {
        position:"WAIT & SEE / NEUTRAL H4", h4Bias:"NEUTRAL",
        entry:"0.00", sl:"0.00", tp1:"0.00", tp2:"0.00", tp1Pips:"0", tp2Pips:"0",
        confluenceScore:0, confluenceDetail:{},
        reason:["H4 EMA21 dan EMA50 terlalu dekat — tidak ada bias directional."],
        session, demandZone:null, supplyZone:null, h1Rsi:"—", currentPrice:h1.current.toFixed(2)
      };
      cachedSwing = swingResult;
      return swingResult;
    }

    const h1Swings = findSwingHighsLows(h1.h, h1.l, 5, 5);
    const h1Atr    = calculateATR(h1.h, h1.l, h1.c, 14);
    const price    = h1.current;
    const lastSH   = h1Swings.swingHighs.length > 0 ? h1Swings.swingHighs[h1Swings.swingHighs.length-1].val : h1.h[h1.h.length-3];
    const lastSL   = h1Swings.swingLows.length  > 0 ? h1Swings.swingLows[h1Swings.swingLows.length-1].val  : h1.l[h1.l.length-3];
    const dTop = lastSL + h1Atr*0.5, dBtm = lastSL - h1Atr*0.3;
    const sTop = lastSH + h1Atr*0.3, sBtm = lastSH - h1Atr*0.5;
    const h1VolEma = calculateEMA(h1.v, 20);
    const h1VolSpike = h1.v[h1.v.length-1] > h1VolEma[h1VolEma.length-1]*1.5;
    const h1RsiArr = calculateRSI(h1.c, 14, true);
    const h1Rsi   = h1RsiArr[h1RsiArr.length-1];

    const last6 = { high: h1.h.slice(-6), low: h1.l.slice(-6), close: h1.c.slice(-6) };
    // Zone touch gradation: 0=none, 1=wick only, 2=close inside, 3=multiple touches
    let zoneTouchScore = 0;
    let zoneTouchCount = 0;
    if (h4Bias.includes("BULLISH")) {
      const wickTouches = last6.low.filter(low => low <= dTop && low >= dBtm).length;
      const closeTouches = last6.close.filter(c => c <= dTop && c >= dBtm).length;
      zoneTouchCount = Math.max(wickTouches, closeTouches);
      if (closeTouches >= 2) zoneTouchScore = 3;
      else if (closeTouches >= 1) zoneTouchScore = 2;
      else if (wickTouches >= 1) zoneTouchScore = 1;
    } else if (h4Bias.includes("BEARISH")) {
      const wickTouches = last6.high.filter(high => high >= sBtm && high <= sTop).length;
      const closeTouches = last6.close.filter(c => c >= sBtm && c <= sTop).length;
      zoneTouchCount = Math.max(wickTouches, closeTouches);
      if (closeTouches >= 2) zoneTouchScore = 3;
      else if (closeTouches >= 1) zoneTouchScore = 2;
      else if (wickTouches >= 1) zoneTouchScore = 1;
    }

    let score = 0, conf = { h4Trend:false, zoneTouch:false, structureAlign:false, volume:false, rsiState:false };
    if (h4Bias === "BULLISH" || h4Bias === "BEARISH") { score++; conf.h4Trend = true; }
    else score += 0.5;

    const isBull = h4Bias.includes("BULLISH"), isBear = h4Bias.includes("BEARISH");
    // Zone touch gradation: 1=wick(+0.5), 2=close(+1), 3=multiple(+1.5)
    if (zoneTouchScore >= 2) { score += 1; conf.zoneTouch = true; }
    else if (zoneTouchScore === 1) { score += 0.5; conf.zoneTouch = true; }

    if (h1Swings.swingHighs.length >= 2 && h1Swings.swingLows.length >= 2) {
      const sh = h1Swings.swingHighs, sl = h1Swings.swingLows;
      if (isBull && sh[sh.length-1].val > sh[sh.length-2].val && sl[sl.length-1].val > sl[sl.length-2].val) { score++; conf.structureAlign = true; }
      if (isBear && sh[sh.length-1].val < sh[sh.length-2].val && sl[sl.length-1].val < sl[sl.length-2].val) { score++; conf.structureAlign = true; }
    }

    if (h1VolSpike) { score++; conf.volume = true; }
    if (h1Rsi >= 35 && h1Rsi <= 65) { score++; conf.rsiState = true; }

    const fs = Math.round(score);
    let position = "WAIT & SEE / NO SWING SETUP", entry="0.00", sl="0.00", tp1="0.00", tp2="0.00", tp1Pips="0", tp2Pips="0", reason=[];

    if (isBull && zoneTouchScore >= 1 && fs >= 3) {
      position = fs >= 4 ? "SWING BUY — ACTIVE SIGNAL" : "SWING BUY — PENDING";
      entry = price.toFixed(2); sl = (dBtm - h1Atr*0.5).toFixed(2);
      tp1 = (price + h1Atr*3).toFixed(2); tp2 = (price + h1Atr*7).toFixed(2);
      tp1Pips = (h1Atr*3).toFixed(0); tp2Pips = (h1Atr*7).toFixed(0);
      const touchDesc = zoneTouchScore >= 3 ? "body close x2+ (strong)" : zoneTouchScore >= 2 ? "body close (confirmed)" : "wick only (early)";
      reason = [`H4: ${h4Bias} — EMA21 $${h4E21.toFixed(2)} > EMA50 $${h4E50.toFixed(2)}`,`H1 Demand Zone: $${dBtm.toFixed(2)}–$${dTop.toFixed(2)} — ${touchDesc}`,conf.structureAlign?"H1 HH+HL confirmed":"H1 structure belum full HH/HL",conf.volume?`Volume spike ${(h1.v[h1.v.length-1]/h1VolEma[h1VolEma.length-1]).toFixed(1)}×`:"Volume normal",`RSI H1: ${h1Rsi.toFixed(1)}`];
    } else if (isBear && zoneTouchScore >= 1 && fs >= 3) {
      position = fs >= 4 ? "SWING SELL — ACTIVE SIGNAL" : "SWING SELL — PENDING";
      entry = price.toFixed(2); sl = (sTop + h1Atr*0.5).toFixed(2);
      tp1 = (price - h1Atr*3).toFixed(2); tp2 = (price - h1Atr*7).toFixed(2);
      tp1Pips = (h1Atr*3).toFixed(0); tp2Pips = (h1Atr*7).toFixed(0);
      const touchDesc = zoneTouchScore >= 3 ? "body close x2+ (strong)" : zoneTouchScore >= 2 ? "body close (confirmed)" : "wick only (early)";
      reason = [`H4: ${h4Bias} — EMA21 $${h4E21.toFixed(2)} < EMA50 $${h4E50.toFixed(2)}`,`H1 Supply Zone: $${sBtm.toFixed(2)}–$${sTop.toFixed(2)} — ${touchDesc}`,conf.structureAlign?"H1 LH+LL confirmed":"H1 structure belum full LH/LL",conf.volume?`Volume spike ${(h1.v[h1.v.length-1]/h1VolEma[h1VolEma.length-1]).toFixed(1)}×`:"Volume normal",`RSI H1: ${h1Rsi.toFixed(1)}`];
    } else {
      reason = [`H4 Bias: ${h4Bias}`,isBull?`Menunggu harga menyentuh Demand $${dBtm.toFixed(2)}–$${dTop.toFixed(2)}`:`Menunggu harga menyentuh Supply $${sBtm.toFixed(2)}–$${sTop.toFixed(2)}`,`Confluence: ${fs}/5`];
    }

    const swingResult = { position, h4Bias, entry, sl, tp1, tp2, tp1Pips, tp2Pips, confluenceScore:fs, confluenceDetail:conf, reason, session, demandZone:{top:dTop.toFixed(2),btm:dBtm.toFixed(2)}, supplyZone:{top:sTop.toFixed(2),btm:sBtm.toFixed(2)}, h1Rsi:h1Rsi.toFixed(1), currentPrice:price.toFixed(2) };
    cachedSwing = swingResult;
    return swingResult;
  } catch (e) {
    return { position:"WAIT & SEE / DATA ERROR", h4Bias:"UNKNOWN", entry:"0.00", sl:"0.00", tp1:"0.00", tp2:"0.00", tp1Pips:"0", tp2Pips:"0", confluenceScore:0, reason:["Error: "+e.message], session };
  }
}

// ─── SCALP SIGNAL ENGINE (M5) — Fixed: score from 0, structural SL, better volume ──
async function calculateScalpSignal(m5, swing, session) {
  try {
    const price = m5.current;
    const swingBuy  = swing.position.includes("BUY");
    const swingSell = swing.position.includes("SELL");

    const m5Atr    = calculateATR(m5.h, m5.l, m5.c, 14);
    const m5RsiArr = calculateRSI(m5.c, 14, true);
    const m5Rsi    = m5RsiArr[m5RsiArr.length-1];
    const volMult  = getVolumeMultiplier(session);

    // Improved volume: climax OR sustained
    const volAnalysis = analyzeVolume(m5.v, 20);
    const hasVol = volAnalysis.hasClimax || (volAnalysis.isConsistent && volAnalysis.spikeMultiplier > volMult);

    const chochBuy  = isDisplacementChoCH(m5.o, m5.h, m5.l, m5.c, "buy");
    const chochSell = isDisplacementChoCH(m5.o, m5.h, m5.l, m5.c, "sell");
    const hookBuy  = isRsiHook(m5RsiArr, "buy");
    const hookSell = isRsiHook(m5RsiArr, "sell");
    const rsiValBuy  = m5Rsi >= 35 && m5Rsi <= 55;
    const rsiValSell = m5Rsi >= 45 && m5Rsi <= 65;
    const nearDemand = swing.demandZone ? price >= parseFloat(swing.demandZone.btm)-m5Atr && price <= parseFloat(swing.demandZone.top)+m5Atr*2 : false;
    const nearSupply = swing.supplyZone ? price >= parseFloat(swing.supplyZone.btm)-m5Atr*2 && price <= parseFloat(swing.supplyZone.top)+m5Atr : false;

    // Score starts from 0 (not 1)
    let score = 0;
    const conf = { swingAligned: false, zoneProximity: false, engulfing: false, volume: false, rsiHook: false };
    
    if ((swingBuy && nearDemand) || (swingSell && nearSupply)) { 
      score += 1.5; 
      conf.zoneProximity = true;
      conf.swingAligned = true; 
    }
    if ((swingBuy && chochBuy) || (swingSell && chochSell)) { 
      score++; 
      conf.engulfing = true; 
    }
    if (hasVol) { 
      score++; 
      conf.volume = true; 
    }
    if ((swingBuy && hookBuy && rsiValBuy) || (swingSell && hookSell && rsiValSell)) { 
      score++; 
      conf.rsiHook = true; 
    }

    let position="WAIT & SEE", entry="0.00", sl="0.00", tp1="0.00", tp2="0.00", tp1Pips="0", tp2Pips="0", reason=[];

    let neededScore = 3.5;
    if (conf.swingAligned) neededScore = 3;

    // Structural SL: use nearest M5 swing instead of last candle low/high
    const m5Swings = findSwingHighsLows(m5.h, m5.l, 3, 3);

    if (score >= neededScore) {
      const isBuySignal = (swingBuy && score >= neededScore) || (!swingBuy && !swingSell && score >= 3.5 && (chochBuy || hookBuy));
      const isSellSignal = (swingSell && score >= neededScore) || (!swingBuy && !swingSell && score >= 3.5 && (chochSell || hookSell));
      
      if (isBuySignal) {
        position = "SCALP BUY — ACTIVE (M5 SNIPER)";
        entry = price.toFixed(2);
        // SL: nearest M5 swing low below price, or zone boundary
        const nearestLow = m5Swings.swingLows
          .filter(sl => sl.val < price)
          .sort((a,b) => b.val - a.val)[0]?.val;
        const zoneBoundary = swing.demandZone ? parseFloat(swing.demandZone.btm) - m5Atr * 0.3 : price - m5Atr * 2;
        const rawSL = nearestLow ? Math.min(nearestLow - m5Atr * 0.3, zoneBoundary) : zoneBoundary;
        sl  = rawSL.toFixed(2);
        tp1 = (price + m5Atr*2).toFixed(2); tp2 = (price + m5Atr*4).toFixed(2);
        tp1Pips = (m5Atr*2).toFixed(0); tp2Pips = (m5Atr*4).toFixed(0);
        const volDesc = volAnalysis.hasClimax ? `Volume CLIMAX ${volAnalysis.spikeMultiplier.toFixed(1)}×` : `Volume sustained ${volAnalysis.spikeMultiplier.toFixed(1)}×`;
        reason = [`Swing Gate: ${swingBuy ? "AKTIF (SEARAH)" : swingSell ? "BERLAWANAN" : "NETRAL"}`, `Zone: ${nearDemand ? "Dalam Demand Zone" : "Tidak dekat Demand"}`, conf.engulfing ? "M5 ChoCH + Displacement valid" : "M5 ChoCH belum terbentuk", conf.volume ? volDesc : `Volume belum spike (${volMult}× threshold)`, conf.rsiHook ? `RSI M5: ${m5Rsi.toFixed(1)} — Hook UP confirmed` : `RSI M5: ${m5Rsi.toFixed(1)}`];
      } else if (isSellSignal) {
        position = "SCALP SELL — ACTIVE (M5 SNIPER)";
        entry = price.toFixed(2);
        // SL: nearest M5 swing high above price, or zone boundary
        const nearestHigh = m5Swings.swingHighs
          .filter(sh => sh.val > price)
          .sort((a,b) => a.val - b.val)[0]?.val;
        const zoneBoundary = swing.supplyZone ? parseFloat(swing.supplyZone.top) + m5Atr * 0.3 : price + m5Atr * 2;
        const rawSL = nearestHigh ? Math.max(nearestHigh + m5Atr * 0.3, zoneBoundary) : zoneBoundary;
        sl  = rawSL.toFixed(2);
        tp1 = (price - m5Atr*2).toFixed(2); tp2 = (price - m5Atr*4).toFixed(2);
        tp1Pips = (m5Atr*2).toFixed(0); tp2Pips = (m5Atr*4).toFixed(0);
        const volDesc = volAnalysis.hasClimax ? `Volume CLIMAX ${volAnalysis.spikeMultiplier.toFixed(1)}×` : `Volume sustained ${volAnalysis.spikeMultiplier.toFixed(1)}×`;
        reason = [`Swing Gate: ${swingSell ? "AKTIF (SEARAH)" : swingBuy ? "BERLAWANAN" : "NETRAL"}`, `Zone: ${nearSupply ? "Dalam Supply Zone" : "Tidak dekat Supply"}`, conf.engulfing ? "M5 ChoCH + Displacement valid" : "M5 ChoCH belum terbentuk", conf.volume ? volDesc : `Volume belum spike (${volMult}× threshold)`, conf.rsiHook ? `RSI M5: ${m5Rsi.toFixed(1)} — Hook DOWN confirmed` : `RSI M5: ${m5Rsi.toFixed(1)}`];
      } else {
        position = "SCALP PENDING — Waiting";
        reason = [`Swing Gate: ${swingBuy ? "BUY" : swingSell ? "SELL" : "NETRAL"}`, `Confluence: ${score.toFixed(1)}/5 (butuh ${neededScore})`, `RSI M5: ${m5Rsi.toFixed(1)} | ATR: ${m5Atr.toFixed(2)}`];
      }
    } else {
      position = score >= 2 ? "SCALP PENDING — Waiting" : "WAIT & SEE / NO SCALP";
      reason = [`Swing Gate: ${swingBuy ? "BUY" : swingSell ? "SELL" : "NETRAL"}`, `Confluence: ${score.toFixed(1)}/5 (butuh ${neededScore})`, `Menunggu: ${!conf.engulfing ? "ChoCH, " : ""}${!conf.volume ? "Volume, " : ""}${!conf.rsiHook ? "RSI Hook" : ""}`, `RSI M5: ${m5Rsi.toFixed(1)} | ATR: ${m5Atr.toFixed(2)}`];
    }

    return { position, gatedBySwing: true, swingAligned: conf.swingAligned, swingBias: swing.h4Bias, entry, sl, tp1, tp2, tp1Pips, tp2Pips, confluenceScore: score, confluenceDetail: conf, reason, session, m5Rsi: m5Rsi.toFixed(1), m5Atr: m5Atr.toFixed(2), volMultiplier: volMult, currentPrice: price.toFixed(2) };
  } catch (e) {
    return { position:"DATA ERROR", gatedBySwing: false, swingAligned: false, swingBias:"UNKNOWN", entry:"0.00", sl:"0.00", tp1:"0.00", tp2:"0.00", tp1Pips:"0", tp2Pips:"0", confluenceScore:0, reason:["Error: "+e.message], session };
  }
}

// ─── MACRO ENGINES (tidak berubah) ────────────────────────────────────────────
async function fetchDXY() {
  // Method 1: Yahoo Finance v7 quote API (more reliable for real-time change)
  try {
    const r = await axios.get("https://query2.finance.yahoo.com/v7/finance/quote?symbols=DX-Y.NYB", {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const q = r.data?.quoteResponse?.result?.[0];
    if (q && q.regularMarketPrice) {
      const cur = q.regularMarketPrice;
      const change = q.regularMarketChange || 0;
      const changePct = q.regularMarketChangePercent || 0;
      const prev = q.regularMarketPreviousClose || cur;
      return {
        current: parseFloat(cur.toFixed(2)),
        change: parseFloat(change.toFixed(2)),
        changePercent: parseFloat(changePct.toFixed(2)),
        previousClose: prev,
        status: changePct >= 0 ? "BULLISH (UP)" : "BEARISH (DOWN)"
      };
    }
  } catch (e) {}

  // Method 2: Yahoo Finance v8 chart API (fallback)
  try {
    const r = await axios.get("https://query2.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=5d", {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const meta = r.data.chart.result[0].meta;
    const cur = meta.regularMarketPrice;
    const prev = meta.previousClose;
    if (cur && prev && prev > 0) {
      const changePct = ((cur - prev) / prev) * 100;
      return {
        current: parseFloat(cur.toFixed(2)),
        change: parseFloat((cur - prev).toFixed(2)),
        changePercent: parseFloat(changePct.toFixed(2)),
        previousClose: prev,
        status: changePct >= 0 ? "BULLISH (UP)" : "BEARISH (DOWN)"
      };
    }
  } catch (e) {}

  return { current: "N/A", change: 0, changePercent: 0, previousClose: null, status: "OFFLINE" };
}

async function fetchCrudeOil() {
  try {
    const r = await axios.get("https://query2.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d&range=45d",{ timeout:8000, headers:{"User-Agent":"Mozilla/5.0"} });
    const c = r.data.chart.result[0].indicators.quote[0].close.filter(x=>x!==null);
    return { current:c[c.length-1], avg30:c.slice(-30).reduce((a,b)=>a+b,0)/Math.min(c.length,30) };
  } catch (e) { return { current:null, avg30:null }; }
}

function findLatestReleasedEvent(events, keywords) {
  const m = events.filter(e => keywords.some(k=>(e.title||e.indicator||"").toLowerCase().includes(k.toLowerCase())) && e.actual!=null && e.actual!=="");
  if (!m.length) return null;
  m.sort((a,b) => new Date(b.date)-new Date(a.date));
  return m[0];
}

function scoreNFP(events) {
  let score=0; const comp={};
  const adp = findLatestReleasedEvent(events,["adp employment","adp nonfarm"]);
  comp.adp = adp ? { event:adp.title, actual:adp.actual, estimate:adp.forecast, points:adp.actual>adp.forecast?40:-40, status:adp.actual>adp.forecast?"BEAT":"MISSED" } : { event:"ADP",actual:"N/A",estimate:"N/A",points:0,status:"NO DATA" };
  score += comp.adp.points||0;
  const ism = findLatestReleasedEvent(events,["ism manufacturing","ism services"]);
  comp.ism = ism ? { event:ism.title, actual:ism.actual, estimate:50, points:ism.actual>50?30:-30, status:ism.actual>50?"EXPANSIONARY":"CONTRACTIONARY" } : { event:"ISM PMI",actual:"N/A",estimate:"N/A",points:0,status:"NO DATA" };
  score += comp.ism.points||0;
  const jolts = findLatestReleasedEvent(events,["jolts"]);
  comp.jolts = jolts ? { event:jolts.title, actual:jolts.actual, estimate:jolts.forecast, points:jolts.actual>jolts.forecast?30:-30, status:jolts.actual>jolts.forecast?"BEAT":"MISSED" } : { event:"JOLTs",actual:"N/A",estimate:"N/A",points:0,status:"NO DATA" };
  score += comp.jolts.points||0;
  return { score, signal:score>=20?"GOOD USD":score<=-20?"BAD USD":"MIXED", components:comp };
}

function scoreCPI(events, crude) {
  let score=0; const comp={};
  const ppi = findLatestReleasedEvent(events,["producer price index","ppi m/m","core ppi"]);
  comp.ppi = ppi ? { event:ppi.title, actual:ppi.actual, estimate:ppi.forecast, points:ppi.actual>ppi.forecast?60:-60, status:ppi.actual>ppi.forecast?"BEAT":"MISSED" } : { event:"PPI",actual:"N/A",estimate:"N/A",points:0,status:"NO DATA" };
  score += comp.ppi.points||0;
  comp.crude = crude?.current!=null ? { event:"Crude Oil WTI", current:crude.current, avg30:crude.avg30, points:crude.current>crude.avg30?40:-40, status:crude.current>crude.avg30?"ABOVE":"BELOW" } : { event:"Crude",points:0,status:"FAILED" };
  score += comp.crude.points||0;
  return { score, signal:score>=20?"HIGH INFLATION":score<=-20?"LOW INFLATION":"MIXED", components:comp };
}

function scoreGrowth(events) {
  let score=0; const comp={};
  const gdp = findLatestReleasedEvent(events,["gdp growth rate","gross domestic product"]);
  comp.gdp = gdp ? { event:gdp.title, actual:gdp.actual, estimate:gdp.forecast, points:gdp.actual>gdp.forecast?50:-50, status:gdp.actual>gdp.forecast?"BEAT":"MISSED" } : { event:"GDP",actual:"N/A",estimate:"N/A",points:0,status:"NO DATA" };
  score += comp.gdp.points||0;
  const retail = findLatestReleasedEvent(events,["retail sales m/m","core retail sales"]);
  comp.retail = retail ? { event:retail.title, actual:retail.actual, estimate:retail.forecast, points:retail.actual>retail.forecast?50:-50, status:retail.actual>retail.forecast?"BEAT":"MISSED" } : { event:"Retail Sales",actual:"N/A",estimate:"N/A",points:0,status:"NO DATA" };
  score += comp.retail.points||0;
  return { score, signal:score>=20?"STRONG":score<=-20?"WEAK":"MIXED", components:comp };
}

function scoreFed(events) {
  let score=0; const comp={};
  const fed = findLatestReleasedEvent(events,["fed interest rate","interest rate decision"]);
  comp.fed = fed ? { event:fed.title, actual:fed.actual, estimate:fed.forecast, points:fed.actual>=fed.forecast?100:-100, status:fed.actual>=fed.forecast?"HAWKISH":"DOVISH" } : { event:"Fed Rate",actual:"N/A",estimate:"N/A",points:0,status:"NO DATA" };
  score += comp.fed.points||0;
  return { score, signal:score>0?"HAWKISH":score<0?"DOVISH":"MIXED", components:comp };
}

// ─── FRED API ENGINE ──────────────────────────────────────────────────────────
const FRED_SERIES = {
  UNRATE:   { name: "Unemployment Rate",         keywords: ["unemployment", "nfp", "nonfarm", "payroll", "employment"] },
  CPIAUCSL: { name: "CPI All Urban Consumers",   keywords: ["cpi", "consumer price", "inflation"] },
  GDP:      { name: "Gross Domestic Product",     keywords: ["gdp", "gross domestic product", "growth"] },
  FEDFUNDS: { name: "Federal Funds Rate",         keywords: ["fed", "interest rate", "fomc", "federal funds"] },
  PAYEMS:   { name: "Total Nonfarm Payrolls",     keywords: ["nonfarm", "nfp", "payroll"] },
  PPIACSL:  { name: "Producer Price Index",       keywords: ["ppi", "producer price"] },
  RSAFS:    { name: "Advance Retail Sales",       keywords: ["retail sales", "retail"] }
};

async function fetchFredSeries(seriesId) {
  try {
    const r = await axios.get("https://api.stlouisfed.org/fred/series/observations", {
      params: {
        series_id: seriesId,
        api_key: FRED_API_KEY,
        file_type: "json",
        sort_order: "desc",
        limit: 5
      },
      timeout: 10000
    });
    const obs = r.data?.observations || [];
    return obs.filter(o => o.value !== ".").map(o => ({
      date: o.date,
      value: parseFloat(o.value)
    }));
  } catch (e) {
    return [];
  }
}

async function fetchFredData() {
  const now = Date.now();
  if (Object.keys(cachedFredData).length > 0 && (now - lastFredFetchTime) < 3600000) {
    return cachedFredData;
  }
  const results = {};
  const series = Object.keys(FRED_SERIES);
  await Promise.all(series.map(async (id) => {
    results[id] = await fetchFredSeries(id);
  }));
  cachedFredData = results;
  lastFredFetchTime = now;
  return results;
}

function getFredMacroScore(fredData) {
  let score = 0;
  const details = {};

  // NFP/Unemployment: lower unemployment = stronger USD = bearish XAU
  const unrate = fredData.UNRATE;
  if (unrate && unrate.length >= 2) {
    const curr = unrate[0].value;
    const prev = unrate[1].value;
    const diff = curr - prev;
    if (diff < -0.2) { score -= 40; details.UNRATE = { change: diff.toFixed(1), signal: "BEARISH XAU (strong jobs)" }; }
    else if (diff > 0.2) { score += 40; details.UNRATE = { change: diff.toFixed(1), signal: "BULLISH XAU (weak jobs)" }; }
    else { details.UNRATE = { change: diff.toFixed(1), signal: "NEUTRAL" }; }
  }

  // CPI: higher CPI = inflation fear = bullish XAU
  const cpi = fredData.CPIAUCSL;
  if (cpi && cpi.length >= 2) {
    const curr = cpi[0].value;
    const prev = cpi[1].value;
    const pctChange = ((curr - prev) / prev) * 100;
    if (pctChange > 0.3) { score -= 30; details.CPI = { change: pctChange.toFixed(2)+"%", signal: "BEARISH XAU (high inflation → rate hike)" }; }
    else if (pctChange < 0.1) { score += 30; details.CPI = { change: pctChange.toFixed(2)+"%", signal: "BULLISH XAU (low inflation)" }; }
    else { details.CPI = { change: pctChange.toFixed(2)+"%", signal: "NEUTRAL" }; }
  }

  // GDP: higher growth = stronger USD = bearish XAU
  const gdp = fredData.GDP;
  if (gdp && gdp.length >= 2) {
    const curr = gdp[0].value;
    const prev = gdp[1].value;
    const pctChange = ((curr - prev) / prev) * 100;
    if (pctChange > 0.5) { score -= 30; details.GDP = { change: pctChange.toFixed(2)+"%", signal: "BEARISH XAU (strong growth)" }; }
    else if (pctChange < 0) { score += 30; details.GDP = { change: pctChange.toFixed(2)+"%", signal: "BULLISH XAU (recession fear)" }; }
    else { details.GDP = { change: pctChange.toFixed(2)+"%", signal: "NEUTRAL" }; }
  }

  // Fed Rate: higher rate = stronger USD = bearish XAU
  const fed = fredData.FEDFUNDS;
  if (fed && fed.length >= 2) {
    const curr = fed[0].value;
    const prev = fed[1].value;
    const diff = curr - prev;
    if (diff > 0.1) { score -= 60; details.FED = { rate: curr.toFixed(2)+"%", change: "+"+diff.toFixed(2)+"%", signal: "BEARISH XAU (hawkish)" }; }
    else if (diff < -0.1) { score += 60; details.FED = { rate: curr.toFixed(2)+"%", change: diff.toFixed(2)+"%", signal: "BULLISH XAU (dovish)" }; }
    else { details.FED = { rate: curr.toFixed(2)+"%", signal: "NEUTRAL (unchanged)" }; }
  }

  return { score, details };
}

// ─── NEWS PREDICTION ENGINE ───────────────────────────────────────────────────
// Predicts market direction 5 minutes before high-impact news release

const HIGH_IMPACT_KEYWORDS = [
  "nonfarm", "nfp", "payroll", "fomc", "interest rate", "cpi", "gdp",
  "employment change", "unemployment rate", "retail sales", "ism manufacturing",
  "ism services", "adp employment", "jolts", "consumer confidence",
  "durable goods", "housing starts", "building permits", "trade balance",
  "core pce", "initial jobless"
];

function isHighImpact(event) {
  const title = (event.title || event.event || event.name || "").toLowerCase();
  return HIGH_IMPACT_KEYWORDS.some(k => title.includes(k));
}

function getNewsSentimentKeywords(title) {
  const t = title.toLowerCase();
  // Hawkish = bearish XAU, Dovish = bullish XAU
  const hawkish = ["rate hike", "tightening", "hawkish", "inflation", "overheating", "stronger", "beat"];
  const dovish = ["rate cut", "easing", "dovish", "recession", "weaker", "miss", "unemployment", "layoff"];

  const hawkScore = hawkish.filter(k => t.includes(k)).length;
  const dovScore = dovish.filter(k => t.includes(k)).length;

  if (hawkScore > dovScore) return "HAWKISH";
  if (dovScore > hawkScore) return "DOVISH";
  return "NEUTRAL";
}

async function generateNewsPrediction(event, technicalBias, macroScore, fredData) {
  const title = event.title || event.event || "Unknown";
  const eventTime = new Date(event.date).getTime();
  const nowMs = Date.now();
  const minutesUntil = (eventTime - nowMs) / 60000;

  // Only predict within 5 minutes of release
  if (minutesUntil > 5 || minutesUntil < -2) return null;

  const sentiment = getNewsSentimentKeywords(title);
  let bullPoints = 0, bearPoints = 0;
  const reasons = [];

  // Factor 1: Technical Bias (30%)
  if (technicalBias.includes("BULLISH")) { bullPoints += 30; reasons.push("Technical: Bullish trend"); }
  else if (technicalBias.includes("BEARISH")) { bearPoints += 30; reasons.push("Technical: Bearish trend"); }
  else { bullPoints += 15; bearPoints += 15; reasons.push("Technical: Neutral"); }

  // Factor 2: Macro Score (25%)
  if (macroScore < -20) { bullPoints += 25; reasons.push("Macro: Dovish bias (bullish XAU)"); }
  else if (macroScore > 20) { bearPoints += 25; reasons.push("Macro: Hawkish bias (bearish XAU)"); }
  else { bullPoints += 12; bearPoints += 12; reasons.push("Macro: Neutral"); }

  // Factor 3: News Type Sentiment (25%)
  if (sentiment === "HAWKISH") { bearPoints += 25; reasons.push("News keywords: Hawkish"); }
  else if (sentiment === "DOVISH") { bullPoints += 25; reasons.push("News keywords: Dovish"); }
  else { bullPoints += 12; bearPoints += 12; reasons.push("News keywords: Neutral"); }

  // Factor 4: FRED Data Context (20%)
  if (fredData.UNRATE && fredData.UNRATE.length >= 1) {
    const unemployment = fredData.UNRATE[0].value;
    if (unemployment > 4.5) { bullPoints += 20; reasons.push(`FRED: High unemployment (${unemployment}%) → bullish XAU`); }
    else if (unemployment < 3.5) { bearPoints += 20; reasons.push(`FRED: Low unemployment (${unemployment}%) → bearish XAU`); }
    else { bullPoints += 10; bearPoints += 10; }
  }

  // Calculate prediction
  const confidence = Math.abs(bullPoints - bearPoints);
  let prediction = "NEUTRAL";
  if (confidence >= 15) {
    prediction = bullPoints > bearPoints ? "BULLISH" : "BEARISH";
  }

  const predictionObj = {
    id: `PRED_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    title,
    eventTime: event.date,
    timestamp: new Date().toISOString(),
    prediction,
    confidence,
    bullPoints,
    bearPoints,
    reasons,
    sentiment,
    result: null,  // WIN, LOSS, or null (pending)
    actualDirection: null,
    checkedAt: null
  };

  predictionHistory.push(predictionObj);
  if (predictionHistory.length > 100) predictionHistory = predictionHistory.slice(-100);

  return predictionObj;
}

async function checkPredictionResults(predictions, currentPrice, previousPrice) {
  if (!currentPrice || !previousPrice) return predictions;

  const priceChange = currentPrice - previousPrice;
  const actualDirection = priceChange > 0.5 ? "BULLISH" : priceChange < -0.5 ? "BEARISH" : "NEUTRAL";

  for (const pred of predictions) {
    if (pred.result !== null) continue;
    if (!pred.eventTime) continue;

    const eventTime = new Date(pred.eventTime).getTime();
    const nowMs = Date.now();
    const minutesSince = (nowMs - eventTime) / 60000;

    // Check result 3 minutes after release
    if (minutesSince >= 3 && minutesSince <= 30) {
      if (pred.prediction === "NEUTRAL") {
        pred.result = "SKIP";
        pred.actualDirection = actualDirection;
      } else if (pred.prediction === actualDirection) {
        pred.result = "WIN";
        pred.actualDirection = actualDirection;
      } else if (actualDirection === "NEUTRAL") {
        pred.result = "PUSH";
        pred.actualDirection = actualDirection;
      } else {
        pred.result = "LOSS";
        pred.actualDirection = actualDirection;
      }
      pred.checkedAt = new Date().toISOString();
    }
  }

  return predictions;
}

function getPredictionStats() {
  const finished = predictionHistory.filter(p => p.result === "WIN" || p.result === "LOSS");
  const wins = finished.filter(p => p.result === "WIN").length;
  const losses = finished.filter(p => p.result === "LOSS").length;
  const accuracy = finished.length > 0 ? ((wins / finished.length) * 100).toFixed(1) : "0.0";
  return { wins, losses, total: finished.length, accuracy, recent: predictionHistory.slice(-10) };
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin","*");
    res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
    return res.status(200).end();
  }
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Content-Type","application/json");

  const isCron = req.query.cron === "true";
  const goldOnly = req.query.gold_only === "1";

  // Lightweight gold-only endpoint for fast polling
  if (goldOnly) {
    try {
      const goldData = await fetchGoldPrice();
      return res.status(200).json({
        success: true,
        gold_price: goldData ? goldData.price : null,
        gold_source: goldData ? goldData.source : null
      });
    } catch (e) {
      return res.status(200).json({ success: true, gold_price: null });
    }
  }

  if (req.method === "POST" && req.body?.message?.text === "/refresh") {
    const [events, crude, dxy] = await Promise.all([fetchTradingViewData(), fetchCrudeOil(), fetchDXY()]);
    const nfp=scoreNFP(events), cpi=scoreCPI(events,crude), growth=scoreGrowth(events), fed=scoreFed(events);
    await sendTelegramAlert("", nfp.score+cpi.score+growth.score+fed.score, dxy, nfp, cpi, growth, fed);
    return res.status(200).json({ success:true });
  }

  try {
    const session = getSession();

    const [events, crude, dxy, goldData, fredData, h4Raw, h1, m5, m1] = await Promise.all([
      fetchTradingViewData(),
      fetchCrudeOil(),
      fetchDXY(),
      fetchGoldPrice(),
      fetchFredData(),
      fetchChartData("1d","60d").catch(() => fetchChartData("1h","10d")),
      fetchChartData("1h","7d"),
      fetchChartData("5m","2d"),
      fetchChartData("1m","d1")
    ]);

    const nfp    = scoreNFP(events);
    const cpi    = scoreCPI(events, crude);
    const growth = scoreGrowth(events);
    const fed    = scoreFed(events);
    const total  = nfp.score + cpi.score + growth.score + fed.score;
    const master = total >= 40 ? "STRONG SELL XAU" : total <= -40 ? "STRONG BUY XAU" : "NEUTRAL";

    // FRED macro score (official government data)
    const fredMacro = getFredMacroScore(fredData);

    const swing  = await calculateSwingSignal(h4Raw, h1, session);
    const scalp  = await calculateScalpSignal(m5, swing, session);
    const zones   = await scanAllZones(h1, m5, session, swing);
    const entries = await checkEntryTriggers(m1, zones, session);

    // ─── NEWS PREDICTION ENGINE ─────────────────────────────────────────
    const upcomingHighImpact = events.filter(e => {
      if (e.country !== "US" && e.currency !== "USD") return false;
      if (!isHighImpact(e)) return false;
      const diff = (new Date(e.date).getTime() - Date.now()) / 60000;
      return diff > -5 && diff <= 5;
    });

    let newPredictions = [];
    for (const event of upcomingHighImpact) {
      const pred = await generateNewsPrediction(event, swing.h4Bias, total, fredData);
      if (pred) newPredictions.push(pred);
    }

    // Check results for pending predictions
    const currentPrice = m5?.current || h1?.current || 0;
    const prevPrice = h1?.current || 0;
    predictionHistory = await checkPredictionResults(predictionHistory, currentPrice, prevPrice);
    const predStats = getPredictionStats();

    if (isCron) {
      await sendTelegramAlert(master, total, dxy, nfp, cpi, growth, fed);

      const swingID     = swing.position + "_" + swing.entry;
      const swingActive = swing.position.includes("SWING BUY — ACTIVE") || swing.position.includes("SWING SELL — ACTIVE");
      if (swingActive && swingID !== lastSentSwingID) {
        await sendSwingSignalTelegram(swing);
        lastSentSwingID = swingID; isSwingActive = true;
      } else if (!swingActive && isSwingActive) {
        await sendSwingInvalidTelegram();
        lastSentSwingID = ""; isSwingActive = false;
      }

      const scalpID     = scalp.position + "_" + scalp.entry;
      const scalpActive = scalp.position.includes("SCALP BUY — ACTIVE") || scalp.position.includes("SCALP SELL — ACTIVE");
      if (scalpActive && scalpID !== lastSentScalpID) {
        await sendScalpSignalTelegram(scalp);
        lastSentScalpID = scalpID; isScalpActive = true;
      } else if (!scalpActive && isScalpActive) {
        await sendScalpInvalidTelegram();
        lastSentScalpID = ""; isScalpActive = false;
      }

      for (const zone of zones) {
        if (!sentZoneIDs.has(zone.id)) {
          await sendZoneAlert(zone);
          sentZoneIDs.add(zone.id);
          if (sentZoneIDs.size > 200) sentZoneIDs.clear();
        }
      }

      for (const entry of entries) {
        if (!sentEntryIDs.has(entry.triggerId)) {
          await sendEntryTriggerAlert(entry);
          sentEntryIDs.add(entry.triggerId);
          if (sentEntryIDs.size > 200) sentEntryIDs.clear();
        }
      }

      const nowMs = Date.now();
      const upcoming = events.filter(e => {
        if (e.country !== "US" && e.currency !== "USD") return false;
        const diff = (new Date(e.date).getTime() - nowMs) / 60000;
        return diff > 0 && diff <= 5;
      });
      for (const news of upcoming) {
        const eid = (news.title||"news") + "_" + news.date;
        if (!warnedEvents.has(eid)) {
          await sendPreNewsWarning(news);
          warnedEvents.add(eid);
          if (warnedEvents.size > 100) warnedEvents.clear();
        }
      }
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      gold_price: goldData ? goldData.price : (h1 ? h1.current : null),
      gold_change: goldData ? goldData.changePercent : null,
      dxy_live: dxy,
      master_signal: { signal:master, total_score:total },
      nfp, cpi, growth, fed,
      fred_macro: fredMacro,
      swing_signal: swing,
      scalp_signal: scalp,
      technical_signal: scalp,
      zone_pantau: zones,
      entry_triggers: entries,
      news_predictions: {
        new: newPredictions,
        stats: predStats,
        active: predictionHistory.filter(p => p.result === null)
      },
      upcoming_news: events
        .filter(e => (e.country==="US"||e.currency==="USD") && new Date(e.date).getTime() > Date.now()-3600000)
        .sort((a,b) => new Date(a.date)-new Date(b.date))
        .slice(0, 20)
        .map(e => {
          // Determine impact from API field OR keyword detection
          let impact = "low";
          const apiImpact = e.impact ?? e.importance;
          if (apiImpact) {
            if (typeof apiImpact === "string") {
              const lower = apiImpact.toLowerCase();
              if (lower.includes("high")) impact = "high";
              else if (lower.includes("med")) impact = "medium";
            } else if (Number(apiImpact) === 3) impact = "high";
            else if (Number(apiImpact) === 2) impact = "medium";
          }
          // Fallback: keyword-based impact detection for known high/medium events
          if (impact === "low") {
            const title = (e.title || e.event || e.name || "").toLowerCase();
            const highKeywords = ["nonfarm","nfp","payroll","fomc","interest rate","cpi","gdp","employment change","unemployment rate","retail sales","ism manufacturing","ism services","adp employment","jolts","consumer confidence","durable goods","housing starts","building permits","trade balance"];
            const medKeywords = ["pmi","manufacturing","services","richmond","philadelphia","fed","treasury","initial jobless","continuing claims","consumer price","producer price","core ppi","core cpi","personal income","personal spending","pce","michigan","new home sales","existing home","pending home","industrial production","capacity utilization","beige book","empire state","naHB"];
            if (highKeywords.some(k => title.includes(k))) impact = "high";
            else if (medKeywords.some(k => title.includes(k))) impact = "medium";
          }
          return {
            date: e.date,
            event: e.title || e.event || e.name || "Unknown",
            impact: impact,
            forecast: e.forecast ?? e.estimate ?? null,
            previous: e.previous ?? null,
            actual: e.actual ?? null,
            country: e.country,
            currency: e.currency
          };
        })
    });

  } catch (err) {
    return res.status(500).json({ success:false, error:err.message });
  }
};
