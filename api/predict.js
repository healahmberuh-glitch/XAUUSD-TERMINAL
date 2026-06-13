// api/predict.js — DEPRESSEDESIGN Trading Station
// v6.0 — Zone Pantau Engine + Dual Signal + Telegram Full Alerts

const axios = require("axios");

const TELEGRAM_TOKEN   = "8325927674:AAF3xv3r0NRRTet5H-xaK1DKIwWshemVOeU";
const TELEGRAM_CHAT_ID = "5595296615";

// ─── GLOBAL STATE ─────────────────────────────────────────────────────────────
let lastSentSwingID  = "";
let lastSentScalpID  = "";
let isSwingActive    = false;
let isScalpActive    = false;
let sentZoneIDs      = new Set();   // track zone alerts already sent
let sentEntryIDs     = new Set();   // track entry trigger alerts sent
let cachedEvents     = [];
let lastFetchTime    = 0;
let warnedEvents     = new Set();

// ─── TELEGRAM HELPERS ─────────────────────────────────────────────────────────

async function tgSend(message) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID, text: message,
      parse_mode: "HTML", disable_web_page_preview: true
    });
  } catch (e) {}
}

// 1. Macro Fundamental Alert (unchanged)
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

// 2. Zone Pantau Alert — NEW
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
    `📊 <b>STRENGTH:</b> ${zone.strength}/5\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📝 <b>ALASAN:</b> ${zone.reason}\n` +
    `🕒 <b>SESSION:</b> ${zone.session}\n` +
    `⚠️ <i>Ini ZONA PANTAU — tunggu reaksi price sebelum entry!</i>`
  );
}

// 3. Entry Trigger Alert — NEW
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
    `🔍 <b>TRIGGER:</b> M1 ChoCH displacement confirmed\n` +
    `🕒 <b>SESSION:</b> ${entry.session}\n` +
    `⚠️ <i>Hold: 5–30 menit | Min RR 1:2 | NOT FINANCIAL ADVICE</i>`
  );
}

// 4. Swing Signal Alert (unchanged logic, kept)
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

// 5. Scalp Signal Alert (unchanged logic, kept)
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
    `⚓ <b>GATED BY SWING:</b> ✅ ACTIVE\n` +
    `${(scalp.reason || []).map(r => `• ${r}`).join("\n")}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🕒 <b>SESSION:</b> ${scalp.session}\n` +
    `⚠️ <i>Hold: 5–30 menit | Min RR 1:2</i>`
  );
}

// 6. Swing Invalidated
async function sendSwingInvalidTelegram() {
  await tgSend(
    `⚠️ <b>SWING SIGNAL: INVALIDATED</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `H1 structure keluar dari zona swing.\n` +
    `Swing dibatalkan. Scalp otomatis diblok.\n` +
    `Mode: WAIT &amp; SEE.`
  );
}

// 7. Scalp Invalidated
async function sendScalpInvalidTelegram() {
  await tgSend(
    `⚡ <b>SCALP SIGNAL: CLOSED</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Harga M5 keluar dari zona eksekusi.\n` +
    `Scalp dibatalkan. Swing masih aktif — tunggu re-entry.`
  );
}

// 8. Pre-news Warning (unchanged)
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

// ─── SMART CACHE ENGINE ───────────────────────────────────────────────────────
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

// ─── MATH PRIMITIVES ─────────────────────────────────────────────────────────
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

function isDisplacementChoCH(o, h, l, c, direction) {
  const n = c.length; if (n < 3) return false;
  const curr = { o:o[n-1], h:h[n-1], l:l[n-1], c:c[n-1] };
  const prev = { o:o[n-2], h:h[n-2], l:l[n-2], c:c[n-2] };
  const bodyRatio = (curr.h - curr.l) > 0 ? Math.abs(curr.c-curr.o)/(curr.h-curr.l) : 0;
  if (bodyRatio < 0.55) return false;
  return direction === "buy" ? curr.c > prev.h && curr.c > curr.o
                              : curr.c < prev.l && curr.c < curr.o;
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

// ─── ZONE SCANNER ENGINE ──────────────────────────────────────────────────────
// Scans 6 zone types, returns top 8 sorted by strength

function scanPreviousHL(h1, session) {
  const zones = [];
  const swings = findSwingHighsLows(h1.h, h1.l, 4, 4);
  const atr    = calculateATR(h1.h, h1.l, h1.c, 14);
  const price  = h1.current;

  // Last 5 swing highs → Supply zones
  swings.swingHighs.slice(-5).forEach((sh, i) => {
    const zHigh = sh.val + atr * 0.2;
    const zLow  = sh.val - atr * 0.4;
    const dist  = Math.abs(price - sh.val);
    if (dist > atr * 8) return; // too far
    const strength = 5 - i;
    zones.push({
      type: "PHP", typeLabel: "Previous High (Supply)",
      bias: "SELL", high: zHigh, low: zLow,
      strength: Math.min(5, Math.max(1, strength)),
      reason: `Swing high di $${sh.val.toFixed(2)} — potential supply / reaction zone`,
      session, id: `PHP_${sh.val.toFixed(2)}`
    });
  });

  // Last 5 swing lows → Demand zones
  swings.swingLows.slice(-5).forEach((sl, i) => {
    const zHigh = sl.val + atr * 0.4;
    const zLow  = sl.val - atr * 0.2;
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

function scanFVG(m5, session) {
  const zones = [];
  const atr   = calculateATR(m5.h, m5.l, m5.c, 14);
  const price = m5.current;
  const len   = m5.c.length;
  // Scan last 30 candles for unfilled FVGs
  for (let i = len - 30; i < len - 2; i++) {
    if (i < 2) continue;
    // Bullish FVG: gap between candle[i].low and candle[i+2].high
    const bullGapLow  = m5.l[i];
    const bullGapHigh = m5.h[i+2];
    if (bullGapLow > bullGapHigh) { // valid upward FVG
      // Check unfilled: price has not entered the gap since formation
      let filled = false;
      for (let j = i+3; j < len; j++) {
        if (m5.l[j] <= bullGapHigh && m5.h[j] >= bullGapLow) { filled = true; break; }
      }
      if (!filled && Math.abs(price - (bullGapLow + bullGapHigh)/2) < atr * 10) {
        const strength = bullGapLow - bullGapHigh > atr * 0.5 ? 5 : 3;
        zones.push({
          type: "FVG", typeLabel: "Fair Value Gap (Demand)",
          bias: "BUY", high: bullGapLow, low: bullGapHigh,
          strength, reason: `Bullish FVG unfilled di $${bullGapHigh.toFixed(2)}–$${bullGapLow.toFixed(2)} — imbalance magnet`,
          session, id: `FVG_BULL_${i}_${bullGapLow.toFixed(2)}`
        });
      }
    }
    // Bearish FVG
    const bearGapHigh = m5.h[i];
    const bearGapLow  = m5.l[i+2];
    if (bearGapHigh < bearGapLow) { // valid downward FVG — note: inverted
      let filled = false;
      for (let j = i+3; j < len; j++) {
        if (m5.h[j] >= bearGapLow && m5.l[j] <= bearGapHigh) { filled = true; break; }
      }
      if (!filled && Math.abs(price - (bearGapHigh + bearGapLow)/2) < atr * 10) {
        const strength = bearGapLow - bearGapHigh > atr * 0.5 ? 5 : 3;
        zones.push({
          type: "FVG", typeLabel: "Fair Value Gap (Supply)",
          bias: "SELL", high: bearGapLow, low: bearGapHigh,
          strength, reason: `Bearish FVG unfilled di $${bearGapHigh.toFixed(2)}–$${bearGapLow.toFixed(2)} — imbalance magnet`,
          session, id: `FVG_BEAR_${i}_${bearGapHigh.toFixed(2)}`
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
    if (bodySize < atr * 0.3) continue; // ignore small candles

    // Bullish OB: last red candle before impulsive up move
    const isBearCandle = m5.c[i] < m5.o[i];
    if (isBearCandle) {
      // Check if followed by 2+ bullish candles with decent momentum
      const nextUp = m5.c[i+1] > m5.o[i+1] && m5.c[i+2] > m5.o[i+2];
      const impulse = m5.c[i+2] - m5.o[i+1] > atr * 0.6;
      if (nextUp && impulse) {
        const dist = Math.abs(price - m5.l[i]);
        if (dist < atr * 12) {
          zones.push({
            type: "OB", typeLabel: "Order Block (Bullish OB)",
            bias: "BUY",
            high: m5.o[i], low: m5.l[i],
            strength: impulse ? 5 : 3,
            reason: `Bull OB di $${m5.l[i].toFixed(2)}–$${m5.o[i].toFixed(2)} — last red candle sebelum impulse up`,
            session, id: `OB_BULL_${i}_${m5.l[i].toFixed(2)}`
          });
        }
      }
    }

    // Bearish OB: last green candle before impulsive down move
    const isBullCandle = m5.c[i] > m5.o[i];
    if (isBullCandle) {
      const nextDn = m5.c[i+1] < m5.o[i+1] && m5.c[i+2] < m5.o[i+2];
      const impulse = m5.o[i+1] - m5.c[i+2] > atr * 0.6;
      if (nextDn && impulse) {
        const dist = Math.abs(price - m5.h[i]);
        if (dist < atr * 12) {
          zones.push({
            type: "OB", typeLabel: "Order Block (Bearish OB)",
            bias: "SELL",
            high: m5.h[i], low: m5.o[i],
            strength: impulse ? 5 : 3,
            reason: `Bear OB di $${m5.o[i].toFixed(2)}–$${m5.h[i].toFixed(2)} — last green candle sebelum impulse down`,
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
  const atr   = calculateATR(m5.h, m5.l, m5.c, 14);
  const price = m5.current;
  const len   = m5.c.length;

  for (let i = len - 50; i < len - 5; i++) {
    if (i < 1) continue;
    // Breaker: OB that has been broken through
    // Bull breaker: was a Bearish OB, price broke above it → now support
    const isBullCandleHere = m5.c[i] > m5.o[i];
    if (isBullCandleHere) {
      const obHigh = m5.h[i];
      // Was it broken by subsequent price moving above this level?
      let wasBroken = false;
      for (let j = i+2; j < Math.min(i+15, len); j++) {
        if (m5.l[j] > obHigh) { wasBroken = true; break; }
      }
      const retestedBreaker =
    m5.l[len - 1] <= obHigh + atr * 0.2;

const stillAboveBreaker =
    price > obHigh;

if (
    wasBroken &&
    retestedBreaker &&
    stillAboveBreaker
) {
        zones.push({
          type: "BRK", typeLabel: "Breaker Block (Flipped Support)",
          bias: "BUY",
          high: obHigh + atr * 0.3, low: obHigh - atr * 0.2,
          strength: 4,
          reason: `Breaker di $${obHigh.toFixed(2)} — ex-resistance flip ke support setelah structure break`,
          session, id: `BRK_BULL_${i}_${obHigh.toFixed(2)}`
        });
      }
    }
  }
  return zones;
}

function scanLiquidityLevels(h1, m5, session) {
  const zones = [];
  const atr   = calculateATR(h1.h, h1.l, h1.c, 14);
  const price = h1.current;
  const len   = h1.h.length;

  // Find equal highs (within $2.00 range) — potential liquidity sweep zone
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
            high: lvl + tolerance, low: lvl - tolerance * 0.5,
            strength: 4,
            reason: `Equal highs di ~$${lvl.toFixed(2)} — stop hunt zone, potensi reversal setelah sweep`,
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
            bias: belowPrice ? "BUY" : "TARGET",
            high: lvl + tolerance * 0.5, low: lvl - tolerance,
            strength: 4,
            reason: `Equal lows di ~$${lvl.toFixed(2)} — stop hunt zone, potensi reversal setelah sweep`,
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

  // London open level (07:00 UTC) — relevant during London + NY
  if (utcH >= 7 && utcH <= 20) {
    const londonOpen = h1.o[h1.o.length - Math.min(utcH - 7 + 1, h1.o.length - 1)] || price;
    const dist       = Math.abs(price - londonOpen);
    if (dist < atr * 6) {
      zones.push({
        type: "SESSION", typeLabel: "Session Level (London Open)",
        bias: price > londonOpen ? "SELL" : "BUY",
        high: londonOpen + atr * 0.3, low: londonOpen - atr * 0.3,
        strength: 3,
        reason: `London open level $${londonOpen.toFixed(2)} — institutional reference price`,
        session, id: `SESSION_LONDON_${londonOpen.toFixed(2)}`
      });
    }
  }
  return zones;
}

// Master zone scanner — aggregates all types, returns top 8
async function scanAllZones(h1, m5, session) {
  try {
    const raw = [
      ...scanPreviousHL(h1, session),
      ...scanFVG(m5, session),
      ...scanOrderBlocks(m5, session),
      ...scanBreakers(m5, session),
      ...scanLiquidityLevels(h1, m5, session),
      ...scanSessionLevels(h1, session)
    ];

    // Deduplicate by id
    const seen = new Set();
    const deduped = raw.filter(z => {
      if (seen.has(z.id)) return false;
      seen.add(z.id); return true;
    });

    // Sort by strength desc, then proximity to current price
    const price = m5.current;
const filtered = deduped.filter(z => {

  const midpoint = (z.high + z.low) / 2;

  // BUY zone harus berada di bawah harga
  if (z.bias === "BUY") {
    return midpoint <= price;
  }

  // SELL zone harus berada di atas harga
  if (z.bias === "SELL") {
    return midpoint >= price;
  }

  return true;
});
     filtered.sort((a, b) => {
      if (b.strength !== a.strength) return b.strength - a.strength;
      const dA = Math.abs(price - (a.high + a.low) / 2);
      const dB = Math.abs(price - (b.high + b.low) / 2);
      return dA - dB;
    });

    // Return top 8
    return filtered.slice(0, 8).map(z => ({
      ...z,
      midpoint:   ((z.high + z.low) / 2).toFixed(2),
      highStr:    z.high.toFixed(2),
      lowStr:     z.low.toFixed(2),
      priceInZone: price >= z.low && price <= z.high
    }));
  } catch (e) {
    return [];
  }
}

// ─── ENTRY TRIGGER ENGINE (M1) ────────────────────────────────────────────────
// Checks if price has entered any active zone and M1 confirms ChoCH
async function checkEntryTriggers(m1, zones, session) {
  const triggers = [];
  if (!zones || zones.length === 0) return triggers;

  const m1Atr    = calculateATR(m1.h, m1.l, m1.c, 14);
  const m1RsiArr = calculateRSI(m1.c, 14, true);
  const price    = m1.current;

  for (const zone of zones) {
    // Price must be inside or within 0.5 ATR of zone
    const nearZone = price >= zone.low - m1Atr * 0.5 && price <= zone.high + m1Atr * 0.5;
    if (!nearZone) continue;

    const dir  = zone.bias === "BUY" ? "buy" : "sell";
    const choch = isDisplacementChoCH(m1.o, m1.h, m1.l, m1.c, dir);
    if (!choch) continue;

    // RSI state check
    const m1Rsi = m1RsiArr[m1RsiArr.length - 1];
    const rsiOk = dir === "buy" ? (m1Rsi >= 30 && m1Rsi <= 60) : (m1Rsi >= 40 && m1Rsi <= 70);
    if (!rsiOk) continue;

    // Build entry
    const entryPrice = price;
    let sl, tp1, tp2;
    if (dir === "buy") {
      sl  = zone.low - m1Atr * 0.8;
      tp1 = entryPrice + m1Atr * 2;
      tp2 = entryPrice + m1Atr * 4;
    } else {
      sl  = zone.high + m1Atr * 0.8;
      tp1 = entryPrice - m1Atr * 2;
      tp2 = entryPrice - m1Atr * 4;
    }

    // Confluence: zone.strength + choch + rsiOk + zone type bonus
    const typeBonus = ["FVG","OB","LIQ"].includes(zone.type) ? 1 : 0;
    const confluence = Math.min(5, Math.round(zone.strength * 0.6 + 1.5 + typeBonus));

    triggers.push({
      bias: zone.bias,
      zoneType: zone.typeLabel,
      zoneBias: zone.bias,
      entry:     entryPrice,
      sl,
      tp1,
      tp2,
      tp1Pips:  Math.abs(tp1 - entryPrice).toFixed(0),
      tp2Pips:  Math.abs(tp2 - entryPrice).toFixed(0),
      confluence,
      session,
      zoneId:   zone.id,
      triggerId: `ENTRY_${zone.id}_${entryPrice.toFixed(2)}`
    });
  }

  return triggers;
}

// ─── SWING SIGNAL ENGINE (H4/H1) — UNCHANGED ─────────────────────────────────
async function calculateSwingSignal(h4, h1, session) {
  try {
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

    if (h4Bias === "NEUTRAL") return {
      position:"WAIT & SEE / NEUTRAL H4", h4Bias:"NEUTRAL",
      entry:"0.00", sl:"0.00", tp1:"0.00", tp2:"0.00", tp1Pips:"0", tp2Pips:"0",
      confluenceScore:0, confluenceDetail:{},
      reason:["H4 EMA21 dan EMA50 terlalu dekat — tidak ada bias directional."],
      session, demandZone:null, supplyZone:null, h1Rsi:"—", currentPrice:h1.current.toFixed(2)
    };

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

    let score = 0, conf = { h4Trend:false, zoneTouch:false, structureAlign:false, volume:false, rsiState:false };
    if (h4Bias === "BULLISH" || h4Bias === "BEARISH") { score++; conf.h4Trend = true; }
    else score += 0.5;

    const isBull = h4Bias.includes("BULLISH"), isBear = h4Bias.includes("BEARISH");
    if (isBull && price >= dBtm && price <= dTop + h1Atr) { score++; conf.zoneTouch = true; }
    if (isBear && price >= sBtm - h1Atr && price <= sTop) { score++; conf.zoneTouch = true; }

    if (h1Swings.swingHighs.length >= 2 && h1Swings.swingLows.length >= 2) {
      const sh = h1Swings.swingHighs, sl = h1Swings.swingLows;
      if (isBull && sh[sh.length-1].val > sh[sh.length-2].val && sl[sl.length-1].val > sl[sl.length-2].val) { score++; conf.structureAlign = true; }
      if (isBear && sh[sh.length-1].val < sh[sh.length-2].val && sl[sl.length-1].val < sl[sl.length-2].val) { score++; conf.structureAlign = true; }
    }

    if (h1VolSpike) { score++; conf.volume = true; }
    if (h1Rsi >= 35 && h1Rsi <= 65) { score++; conf.rsiState = true; }

    const fs = Math.round(score);
    let position = "WAIT & SEE / NO SWING SETUP", entry="0.00", sl="0.00", tp1="0.00", tp2="0.00", tp1Pips="0", tp2Pips="0", reason=[];

    if (isBull && conf.zoneTouch && fs >= 3) {
      position = fs >= 4 ? "SWING BUY — ACTIVE SIGNAL" : "SWING BUY — PENDING";
      entry = price.toFixed(2); sl = (dBtm - h1Atr*0.5).toFixed(2);
      tp1 = (price + h1Atr*3).toFixed(2); tp2 = (price + h1Atr*7).toFixed(2);
      tp1Pips = (h1Atr*3).toFixed(0); tp2Pips = (h1Atr*7).toFixed(0);
      reason = [`H4: ${h4Bias} — EMA21 $${h4E21.toFixed(2)} > EMA50 $${h4E50.toFixed(2)}`,`H1 Demand Zone: $${dBtm.toFixed(2)}–$${dTop.toFixed(2)}`,conf.structureAlign?"H1 HH+HL confirmed":"H1 structure belum full HH/HL",conf.volume?`Volume spike ${(h1.v[h1.v.length-1]/h1VolEma[h1VolEma.length-1]).toFixed(1)}×`:"Volume normal",`RSI H1: ${h1Rsi.toFixed(1)}`];
    } else if (isBear && conf.zoneTouch && fs >= 3) {
      position = fs >= 4 ? "SWING SELL — ACTIVE SIGNAL" : "SWING SELL — PENDING";
      entry = price.toFixed(2); sl = (sTop + h1Atr*0.5).toFixed(2);
      tp1 = (price - h1Atr*3).toFixed(2); tp2 = (price - h1Atr*7).toFixed(2);
      tp1Pips = (h1Atr*3).toFixed(0); tp2Pips = (h1Atr*7).toFixed(0);
      reason = [`H4: ${h4Bias} — EMA21 $${h4E21.toFixed(2)} < EMA50 $${h4E50.toFixed(2)}`,`H1 Supply Zone: $${sBtm.toFixed(2)}–$${sTop.toFixed(2)}`,conf.structureAlign?"H1 LH+LL confirmed":"H1 structure belum full LH/LL",conf.volume?`Volume spike ${(h1.v[h1.v.length-1]/h1VolEma[h1VolEma.length-1]).toFixed(1)}×`:"Volume normal",`RSI H1: ${h1Rsi.toFixed(1)}`];
    } else {
      reason = [`H4 Bias: ${h4Bias}`,isBull?`Menunggu pullback ke Demand $${dBtm.toFixed(2)}–$${dTop.toFixed(2)}`:`Menunggu pullback ke Supply $${sBtm.toFixed(2)}–$${sTop.toFixed(2)}`,`Confluence: ${fs}/5`];
    }

    return { position, h4Bias, entry, sl, tp1, tp2, tp1Pips, tp2Pips, confluenceScore:fs, confluenceDetail:conf, reason, session, demandZone:{top:dTop.toFixed(2),btm:dBtm.toFixed(2)}, supplyZone:{top:sTop.toFixed(2),btm:sBtm.toFixed(2)}, h1Rsi:h1Rsi.toFixed(1), currentPrice:price.toFixed(2) };
  } catch (e) {
    return { position:"WAIT & SEE / DATA ERROR", h4Bias:"UNKNOWN", entry:"0.00", sl:"0.00", tp1:"0.00", tp2:"0.00", tp1Pips:"0", tp2Pips:"0", confluenceScore:0, reason:["Error: "+e.message], session };
  }
}

// ─── SCALP SIGNAL ENGINE (M5, gated by Swing) — UNCHANGED ────────────────────
async function calculateScalpSignal(m5, swing, session) {
  try {
    const price = m5.current;
    const swingBuy  = swing.position.includes("BUY");
    const swingSell = swing.position.includes("SELL");
    if (!swingBuy && !swingSell) return {
      position:"BLOCKED — Waiting for Swing Signal", gatedBySwing:false,
      swingBias:swing.h4Bias||"NEUTRAL", entry:"0.00", sl:"0.00", tp1:"0.00", tp2:"0.00",
      tp1Pips:"0", tp2Pips:"0", confluenceScore:0,
      reason:["Scalp diblok — Swing signal belum aktif."], session
    };

    const m5Atr    = calculateATR(m5.h, m5.l, m5.c, 14);
    const m5RsiArr = calculateRSI(m5.c, 14, true);
    const m5Rsi    = m5RsiArr[m5RsiArr.length-1];
    const volMult  = getVolumeMultiplier(session);
    const m5VolEma = calculateEMA(m5.v, 20);
    const hasVol   = m5.v.slice(-3).some(v => v > m5VolEma[m5VolEma.length-1]*volMult);
    const chochBuy  = isDisplacementChoCH(m5.o, m5.h, m5.l, m5.c, "buy");
    const chochSell = isDisplacementChoCH(m5.o, m5.h, m5.l, m5.c, "sell");
    const hookBuy  = isRsiHook(m5RsiArr, "buy");
    const hookSell = isRsiHook(m5RsiArr, "sell");
    const rsiValBuy  = m5Rsi >= 35 && m5Rsi <= 55;
    const rsiValSell = m5Rsi >= 45 && m5Rsi <= 65;
    const nearDemand = swing.demandZone ? price >= parseFloat(swing.demandZone.btm)-m5Atr && price <= parseFloat(swing.demandZone.top)+m5Atr*2 : true;
    const nearSupply = swing.supplyZone ? price >= parseFloat(swing.supplyZone.btm)-m5Atr*2 && price <= parseFloat(swing.supplyZone.top)+m5Atr : true;

    let score = 1; // swing gate always +1
    const conf = { swingAligned:true, zoneProximity:false, engulfing:false, volume:false, rsiHook:false };
    if (swingBuy && nearDemand)   { score++; conf.zoneProximity = true; }
    if (swingSell && nearSupply)  { score++; conf.zoneProximity = true; }
    if (swingBuy && chochBuy)     { score++; conf.engulfing = true; }
    if (swingSell && chochSell)   { score++; conf.engulfing = true; }
    if (hasVol)                   { score++; conf.volume = true; }
    if (swingBuy && hookBuy && rsiValBuy)    { score++; conf.rsiHook = true; }
    if (swingSell && hookSell && rsiValSell) { score++; conf.rsiHook = true; }

    let position="WAIT & SEE", entry="0.00", sl="0.00", tp1="0.00", tp2="0.00", tp1Pips="0", tp2Pips="0", reason=[];

    if (swingBuy && score >= 4) {
      position = "SCALP BUY — ACTIVE (M5 SNIPER)";
      entry = price.toFixed(2);
      sl  = (m5.l[m5.l.length-1] - m5Atr*1.2).toFixed(2);
      tp1 = (price + m5Atr*2).toFixed(2); tp2 = (price + m5Atr*4).toFixed(2);
      tp1Pips = (m5Atr*2).toFixed(0); tp2Pips = (m5Atr*4).toFixed(0);
      reason = ["Swing Gate: AKTIF — BUY confirmed",`Zone: ${nearDemand?"Dalam Demand Zone":"Mendekati Demand"}`,conf.engulfing?"M5 Bullish Engulfing valid (body≥55%)":"M5 Engulfing belum terbentuk",conf.volume?`Volume ${volMult}× threshold OK`:`Volume belum spike (${volMult}× threshold)`,conf.rsiHook?`RSI M5: ${m5Rsi.toFixed(1)} — Hook UP confirmed`:`RSI M5: ${m5Rsi.toFixed(1)}`];
    } else if (swingSell && score >= 4) {
      position = "SCALP SELL — ACTIVE (M5 SNIPER)";
      entry = price.toFixed(2);
      sl  = (m5.h[m5.h.length-1] + m5Atr*1.2).toFixed(2);
      tp1 = (price - m5Atr*2).toFixed(2); tp2 = (price - m5Atr*4).toFixed(2);
      tp1Pips = (m5Atr*2).toFixed(0); tp2Pips = (m5Atr*4).toFixed(0);
      reason = ["Swing Gate: AKTIF — SELL confirmed",`Zone: ${nearSupply?"Dalam Supply Zone":"Mendekati Supply"}`,conf.engulfing?"M5 Bearish Engulfing valid (body≥55%)":"M5 Engulfing belum terbentuk",conf.volume?`Volume ${volMult}× threshold OK`:`Volume belum spike (${volMult}× threshold)`,conf.rsiHook?`RSI M5: ${m5Rsi.toFixed(1)} — Hook DOWN confirmed`:`RSI M5: ${m5Rsi.toFixed(1)}`];
    } else {
      const missing = [!conf.zoneProximity&&"Zone Proximity",!conf.engulfing&&"M5 Engulfing",!conf.volume&&`Volume>${volMult}×`,!conf.rsiHook&&"RSI Hook"].filter(Boolean);
      position = score >= 2 ? "SCALP PENDING — Waiting" : "WAIT & SEE / NO SCALP";
      reason = [`Swing Gate: ${swingBuy?"BUY":"SELL"} bias aktif`,`Confluence: ${score}/5 (butuh 4)`,`Menunggu: ${missing.join(", ")}`,`RSI M5: ${m5Rsi.toFixed(1)} | ATR: ${m5Atr.toFixed(2)}`];
    }

    return { position, gatedBySwing:true, swingBias:swing.h4Bias, entry, sl, tp1, tp2, tp1Pips, tp2Pips, confluenceScore:score, confluenceDetail:conf, reason, session, m5Rsi:m5Rsi.toFixed(1), m5Atr:m5Atr.toFixed(2), volMultiplier:volMult, currentPrice:price.toFixed(2) };
  } catch (e) {
    return { position:"BLOCKED — DATA ERROR", gatedBySwing:false, swingBias:"UNKNOWN", entry:"0.00", sl:"0.00", tp1:"0.00", tp2:"0.00", tp1Pips:"0", tp2Pips:"0", confluenceScore:0, reason:["Error: "+e.message], session };
  }
}

// ─── MACRO ENGINES (UNTOUCHED) ────────────────────────────────────────────────
async function fetchDXY() {
  try {
    const r = await axios.get("https://query2.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=2d",{ timeout:8000, headers:{"User-Agent":"Mozilla/5.0"} });
    const cur = r.data.chart.result[0].meta.regularMarketPrice;
    const prev = r.data.chart.result[0].meta.previousClose;
    return { current:parseFloat(cur.toFixed(2)), changePercent:((cur-prev)/prev*100).toFixed(2), status: cur>=prev?"BULLISH (UP)":"BEARISH (DOWN)" };
  } catch (e) { return { current:"N/A", changePercent:"0", status:"OFFLINE" }; }
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

  if (req.method === "POST" && req.body?.message?.text === "/refresh") {
    const [events, crude, dxy] = await Promise.all([fetchTradingViewData(), fetchCrudeOil(), fetchDXY()]);
    const nfp=scoreNFP(events), cpi=scoreCPI(events,crude), growth=scoreGrowth(events), fed=scoreFed(events);
    await sendTelegramAlert("", nfp.score+cpi.score+growth.score+fed.score, dxy, nfp, cpi, growth, fed);
    return res.status(200).json({ success:true });
  }

  try {
    const session = getSession();

    // Fetch all timeframes + macro in parallel
    const [events, crude, dxy, h4Raw, h1, m5, m1] = await Promise.all([
      fetchTradingViewData(),
      fetchCrudeOil(),
      fetchDXY(),
      fetchChartData("1d","60d").catch(() => fetchChartData("1h","10d")),
      fetchChartData("1h","7d"),
      fetchChartData("5m","2d"),
      fetchChartData("1m","1d")
    ]);

    // Macro scoring
    const nfp    = scoreNFP(events);
    const cpi    = scoreCPI(events, crude);
    const growth = scoreGrowth(events);
    const fed    = scoreFed(events);
    const total  = nfp.score + cpi.score + growth.score + fed.score;
    const master = total >= 40 ? "STRONG SELL XAU" : total <= -40 ? "STRONG BUY XAU" : "NEUTRAL";

    // Swing + Scalp signals
    const swing  = await calculateSwingSignal(h4Raw, h1, session);
    const scalp  = await calculateScalpSignal(m5, swing, session);

    // Zone scanner + Entry triggers
    const zones   = await scanAllZones(h1, m5, session);
    const entries = await checkEntryTriggers(m1, zones, session);

    // ── CRON: Telegram alert logic ───────────────────────────────────────────
    if (isCron) {
      // Macro alert
      await sendTelegramAlert(master, total, dxy, nfp, cpi, growth, fed);

      // Swing tracking
      const swingID     = swing.position + "_" + swing.entry;
      const swingActive = swing.position.includes("SWING BUY — ACTIVE") || swing.position.includes("SWING SELL — ACTIVE");
      if (swingActive && swingID !== lastSentSwingID) {
        await sendSwingSignalTelegram(swing);
        lastSentSwingID = swingID; isSwingActive = true;
      } else if (!swingActive && isSwingActive) {
        await sendSwingInvalidTelegram();
        lastSentSwingID = ""; isSwingActive = false;
      }

      // Scalp tracking
      const scalpID     = scalp.position + "_" + scalp.entry;
      const scalpActive = scalp.position.includes("SCALP BUY — ACTIVE") || scalp.position.includes("SCALP SELL — ACTIVE");
      if (scalpActive && scalpID !== lastSentScalpID) {
        await sendScalpSignalTelegram(scalp);
        lastSentScalpID = scalpID; isScalpActive = true;
      } else if (!scalpActive && isScalpActive) {
        await sendScalpInvalidTelegram();
        lastSentScalpID = ""; isScalpActive = false;
      }

      // Zone alerts — NEW: alert every new zone found
      for (const zone of zones) {
        if (!sentZoneIDs.has(zone.id)) {
          await sendZoneAlert(zone);
          sentZoneIDs.add(zone.id);
          if (sentZoneIDs.size > 200) sentZoneIDs.clear(); // memory cleanup
        }
      }

      // Entry trigger alerts — NEW: alert every new entry triggered
      for (const entry of entries) {
        if (!sentEntryIDs.has(entry.triggerId)) {
          await sendEntryTriggerAlert(entry);
          sentEntryIDs.add(entry.triggerId);
          if (sentEntryIDs.size > 200) sentEntryIDs.clear();
        }
      }

      // Pre-news warnings
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
      dxy_live: dxy,
      master_signal: { signal:master, total_score:total },
      nfp, cpi, growth, fed,
      swing_signal: swing,
      scalp_signal: scalp,
      technical_signal: scalp,
      zone_pantau: zones,
      entry_triggers: entries,
      upcoming_news: events
        .filter(e => (e.country==="US"||e.currency==="USD") && new Date(e.date).getTime() > Date.now()-3600000)
        .sort((a,b) => new Date(a.date)-new Date(b.date))
        .slice(0, 15)
    });

  } catch (err) {
    return res.status(500).json({ success:false, error:err.message });
  }
};
