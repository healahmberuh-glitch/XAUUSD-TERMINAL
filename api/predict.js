// api/predict.js — DEPRESSEDESIGN Trading Station
// v6.6 — SMC Limit Order + Sovereign Scalper + Frozen Anchor + Macro Fixed

const axios = require("axios");

const TELEGRAM_TOKEN   = "8325927674:AAF3xv3r0NRRTet5H-xaK1DKIwWshemVOeU";
const TELEGRAM_CHAT_ID = "5595296615";

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

// ─── TELEGRAM HELPERS ─────────────────────────────────────────────────────────
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
  const emoji = masterSignal.includes("SELL") ? "🔴" : "🟢";
  const msg = `<b>📊 MACRO FUNDAMENTAL UPDATE</b>\n\n` +
              `Bias: ${emoji} <b>${masterSignal}</b> (Score: ${totalScore})\n` +
              `DXY: <code>${dxy}</code>\n\n` +
              `• NFP: <code>${nfp}</code>\n` +
              `• CPI: <code>${cpi}</code>\n` +
              `• GDP Growth: <code>${growth}</code>\n` +
              `• Fed Rate: <code>${fed}</code>`;
  await tgSend(msg);
}

async function sendSwingAlert(swing) {
  const emoji = swing.position.includes("BUY") ? "🔵 [SWING BUY]" : "🟠 [SWING SELL]";
  const msg = `<b>🦅 NEW SWING SIGNAL DETECTED</b>\n\n` +
              `Direction: <b>${emoji}</b>\n` +
              `Entry Zone: <code>$${swing.entry}</code>\n` +
              `Stop Loss: <code>$${swing.sl}</code>\n` +
              `Take Profit 1: <code>$${swing.tp1}</code>\n` +
              `Take Profit 2: <code>$${swing.tp2}</code>\n\n` +
              `<i>Timeframe: H4/H1 Confluence Structure</i>`;
  await tgSend(msg);
}

async function sendScalpAlert(scalp) {
  const emoji = scalp.position.includes("BUY") ? "⚡ [SCALP BUY]" : "💥 [SCALP SELL]";
  const msg = `<b>🔥 NEW SCALP SIGNAL (M5)</b>\n\n` +
              `Position: <b>${emoji}</b>\n` +
              `Trigger Price: <code>$${scalp.entry}</code>\n` +
              `Stop Loss: <code>$${scalp.sl}</code>\n` +
              `Take Profit 1: <code>$${scalp.tp1}</code>\n` +
              `Take Profit 2: <code>$${scalp.tp2}</code>\n\n` +
              `<i>Status: ${scalp.position}</i>`;
  await tgSend(msg);
}

async function sendZoneAlert(zone) {
  const emoji = zone.bias === "BUY" ? "📥 BULLISH LIMIT" : "📤 BEARISH LIMIT";
  const msg = `<b>🎯 NEW SMC LIMIT ORDER</b>\n\n` +
              `Type: <b>${emoji}</b> (${zone.typeLabel})\n` +
              `Target Entry: <code>$${zone.signal.entry}</code>\n` +
              `Stop Loss: <code>$${zone.signal.sl}</code>\n` +
              `Take Profit: <code>$${zone.signal.tp1}</code>\n\n` +
              `<i>Reason: ${zone.reason}</i>`;
  await tgSend(msg);
}

async function sendPreNewsWarning(news) {
  const msg = `<b>⚠️ HIGH IMPACT NEWS FLASH (5 MINS REMAINING)</b>\n\n` +
              `Event: <code>[${news.currency}] ${news.title || news.indicator}</code>\n` +
              `Impact Level: <b>HIGH IMPACT</b>\n\n` +
              `<i>SMC Signal Execution will be heavily affected. Protect your capital or tighten SL now!</i>`;
  await tgSend(msg);
}

// ─── DATA FETCHERS ────────────────────────────────────────────────────────────
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
      { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }
    );
    if (res.data?.result?.length > 0) { cachedEvents = res.data.result; lastFetchTime = now; }
    return cachedEvents;
  } catch (e) { return cachedEvents; }
}

async function fetchCrudeOil() {
  try {
    const res = await axios.get("https://query2.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d&range=45d", { timeout: 6000 });
    const c = res.data.chart.result[0].indicators.quote[0].close.filter(x=>x!==null);
    return { current: c[c.length-1], avg30: c.slice(-30).reduce((a,b)=>a+b,0)/Math.min(c.length,30) };
  } catch(e) { return { current: null, avg30: null }; }
}

async function fetchDXY() {
  try {
    const res = await axios.get("https://query2.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=2d", { timeout: 6000 });
    const cur = res.data.chart.result[0].meta.regularMarketPrice;
    const prev = res.data.chart.result[0].meta.previousClose;
    return { current: parseFloat(cur.toFixed(2)), changePercent: ((cur-prev)/prev*100).toFixed(2), status: cur>=prev?"BULLISH (UP)":"BEARISH (DOWN)" };
  } catch(e) { return { current: "N/A", changePercent: "0", status: "OFFLINE" }; }
}

// ⭐ FETCH DATA SPOT XAUUSD (SINKRON OANDA)
async function fetchChartData(interval, range) {
  try {
    const res = await axios.get(
      `https://query2.finance.yahoo.com/v8/finance/chart/XAUUSD=X?interval=${interval}&range=${range}`,
      { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0" } }
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
    return { c, o, h, l, v, current: res.data.chart.result[0].meta.regularMarketPrice };
  } catch (e) {
    return { c:[], o:[], h:[], l:[], v:[], current: 0 };
  }
}

// ─── MATH PRIMITIVES ──────────────────────────────────────────────────────────
function calculateEMA(data, period) {
  if (!data || data.length === 0) return [0];
  const k = 2 / (period + 1);
  let arr = [data[0]];
  for (let i = 1; i < data.length; i++) arr.push(data[i] * k + arr[i-1] * (1-k));
  return arr;
}

function calculateRSI(closes, period = 14, returnArray = false) {
  if (!closes || closes.length <= period) return returnArray ? [50] : 50;
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
  if (!c || c.length === 0) return 0;
  let trs = [];
  for (let i = 1; i < c.length; i++)
    trs.push(Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1])));
  if (trs.length === 0) return 0;
  let atr = trs.slice(0, period).reduce((a,b) => a+b, 0) / Math.min(period, trs.length);
  for (let i = period; i < trs.length; i++) atr = (atr*13+trs[i])/14;
  return atr;
}

function findSwingHighsLows(highs, lows, left = 5, right = 5) {
  if (!highs || highs.length === 0) return { swingHighs: [], swingLows: [] };
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
  if (!c || c.length < 3) return false;
  const n = c.length;
  const curr = { o:o[n-1], h:h[n-1], l:l[n-1], c:c[n-1] };
  const prev = { o:o[n-2], h:h[n-2], l:l[n-2], c:c[n-2] };
  const bodyRatio = (curr.h - curr.l) > 0 ? Math.abs(curr.c-curr.o)/(curr.h-curr.l) : 0;
  if (bodyRatio < 0.55) return false;
  return direction === "buy" ? curr.c > prev.h && curr.c > curr.o
                              : curr.c < prev.l && curr.c < curr.o;
}

function isRsiHook(rsiArr, direction) {
  if (!rsiArr || rsiArr.length < 6) return false;
  const r5   = rsiArr.slice(-5);
  const last  = rsiArr[rsiArr.length-1];
  const prev1 = rsiArr[rsiArr.length-2];
  const prev2 = rsiArr[rsiArr.length-3];
  return direction === "buy"
    ? r5.some(r => r < 40) && last > prev1 && prev1 > prev2
    : r5.some(r => r > 60) && last < prev1 && prev1 < prev2;
}

function getSession() {
  const hr = new Date().getUTCHours();
  if (hr >= 0 && hr < 7) return "ASIAN RANGE";
  if (hr >= 7 && hr < 13) return "LONDON KILLZONE";
  if (hr >= 13 && hr < 21) return "NEW YORK KILLZONE";
  return "LATE NY";
}

function getVolumeMultiplier(session) {
  if (session.includes("ASIAN"))  return 1.3;
  if (session.includes("LONDON")) return 2.0;
  if (session.includes("NEW YORK")) return 2.0;
  return 1.5;
}

// ─── FUNDAMENTAL SCORE ANALYZER ────────────────────────────────────────────────
function findLatestReleasedEvent(events, keywords) {
  const m = events.filter(e => keywords.some(k=>(e.title||e.indicator||"").toLowerCase().includes(k.toLowerCase())) && e.actual!=null && e.actual!=="");
  if (!m.length) return null;
  m.sort((a,b) => new Date(b.date)-new Date(a.date));
  return m[0];
}

function scoreNFP(events) {
  let score=0; const comp={};
  const adp = findLatestReleasedEvent(events,["adp employment","adp nonfarm"]);
  comp.adp = adp ? { event:adp.title, actual:adp.actual, estimate:adp.forecast, points:adp.actual>adp.forecast?40:-40, status:adp.actual>adp.forecast?"BEAT":"MISSED", date:adp.date } : { event:"ADP",actual:"N/A",estimate:"N/A",points:0,status:"NO DATA" };
  score += comp.adp.points||0;
  const ism = findLatestReleasedEvent(events,["ism manufacturing","ism services"]);
  comp.ism = ism ? { event:ism.title, actual:ism.actual, estimate:50, points:ism.actual>50?30:-30, status:ism.actual>50?"EXPANSIONARY":"CONTRACTIONARY", date:ism.date } : { event:"ISM PMI",actual:"N/A",estimate:"N/A",points:0,status:"NO DATA" };
  score += comp.ism.points||0;
  const jolts = findLatestReleasedEvent(events,["jolts"]);
  comp.jolts = jolts ? { event:jolts.title, actual:jolts.actual, estimate:jolts.forecast, points:jolts.actual>jolts.forecast?30:-30, status:jolts.actual>jolts.forecast?"BEAT":"MISSED", date:jolts.date } : { event:"JOLTs",actual:"N/A",estimate:"N/A",points:0,status:"NO DATA" };
  score += comp.jolts.points||0;
  return { score, signal:score>=20?"GOOD USD":score<=-20?"BAD USD":"MIXED", components:comp };
}

function scoreCPI(events, crude) {
  let score=0; const comp={};
  const ppi = findLatestReleasedEvent(events,["producer price index","ppi m/m","core ppi"]);
  comp.ppi = ppi ? { event:ppi.title, actual:ppi.actual, estimate:ppi.forecast, points:ppi.actual>ppi.forecast?60:-60, status:ppi.actual>ppi.forecast?"BEAT":"MISSED", date:ppi.date } : { event:"PPI",actual:"N/A",estimate:"N/A",points:0,status:"NO DATA" };
  score += comp.ppi.points||0;
  comp.crude = crude?.current!=null ? { event:"Crude Oil WTI", current:crude.current, avg30:crude.avg30, points:crude.current>crude.avg30?40:-40, status:crude.current>crude.avg30?"ABOVE":"BELOW" } : { event:"Crude",points:0,status:"FAILED" };
  score += comp.crude.points||0;
  return { score, signal:score>=20?"HIGH INFLATION":score<=-20?"LOW INFLATION":"MIXED", components:comp };
}

function scoreGrowth(events) {
  let score=0; const comp={};
  const gdp = findLatestReleasedEvent(events,["gdp growth rate","gross domestic product"]);
  comp.gdp = gdp ? { event:gdp.title, actual:gdp.actual, estimate:gdp.forecast, points:gdp.actual>gdp.forecast?50:-50, status:gdp.actual>gdp.forecast?"BEAT":"MISSED", date:gdp.date } : { event:"GDP",actual:"N/A",estimate:"N/A",points:0,status:"NO DATA" };
  score += comp.gdp.points||0;
  const retail = findLatestReleasedEvent(events,["retail sales m/m","core retail sales"]);
  comp.retail = retail ? { event:retail.title, actual:retail.actual, estimate:retail.forecast, points:retail.actual>retail.forecast?50:-50, status:retail.actual>retail.forecast?"BEAT":"MISSED", date:retail.date } : { event:"Retail Sales",actual:"N/A",estimate:"N/A",points:0,status:"NO DATA" };
  score += comp.retail.points||0;
  return { score, signal:score>=20?"STRONG":score<=-20?"WEAK":"MIXED", components:comp };
}

function scoreFed(events) {
  let score=0; const comp={};
  const fed = findLatestReleasedEvent(events,["fed interest rate","interest rate decision"]);
  comp.fed = fed ? { event:fed.title, actual:fed.actual, estimate:fed.forecast, points:fed.actual>=fed.forecast?100:-100, status:fed.actual>=fed.forecast?"HAWKISH":"DOVISH", date:fed.date } : { event:"Fed Rate",actual:"N/A",estimate:"N/A",points:0,status:"NO DATA" };
  score += comp.fed.points||0;
  return { score, signal:score>0?"HAWKISH":score<0?"DOVISH":"MIXED", components:comp };
}

// ─── SWING SIGNAL ENGINE (CLOSED-CANDLE ANCHOR) ──────────────────────────────
async function calculateSwingSignal(h4, h1, session) {
  try {
    if (!h4.c || h4.c.length < 50 || !h1.c || h1.c.length < 50) throw new Error("Data Kosong");

    // 1. FROZEN STRUCTURE: Gunakan data candle H4 yang SUDAH CLOSE
    const h4Len = h4.c.length;
    const h4Ema21  = calculateEMA(h4.c, 21);
    const h4Ema50  = calculateEMA(h4.c, 50);
    const h4Last   = h4.c[h4Len - 2]; 
    const h4E21    = h4Ema21[h4Len - 2];
    const h4E50    = h4Ema50[h4Len - 2];
    const emaDiff  = Math.abs(h4E21 - h4E50) / h4E50 * 100;

    let h4Bias = "NEUTRAL";
    if (emaDiff >= 0.15) { 
      if      (h4E21 > h4E50 && h4Last > h4E21) h4Bias = "BULLISH";
      else if (h4E21 < h4E50 && h4Last < h4E21) h4Bias = "BEARISH";
    }

    // 2. FROZEN H1: Potong array H1 untuk membuang running candle yang berkedip
    const h1Closed = { c: h1.c.slice(0, -1), h: h1.h.slice(0, -1), l: h1.l.slice(0, -1), v: h1.v.slice(0, -1) };
    const h1Swings = findSwingHighsLows(h1Closed.h, h1Closed.l, 5, 5);
    const h1Atr    = calculateATR(h1Closed.h, h1Closed.l, h1Closed.c, 14);
    
    // Harga LIVE hanya dipakai untuk trigger, bukan pengubah struktur
    const price    = h1.current; 
    
    const lastSH   = h1Swings.swingHighs.length > 0 ? h1Swings.swingHighs[h1Swings.swingHighs.length-1].val : h1Closed.h[h1Closed.h.length-3];
    const lastSL   = h1Swings.swingLows.length  > 0 ? h1Swings.swingLows[h1Swings.swingLows.length-1].val  : h1Closed.l[h1Closed.l.length-3];
    const dTop = lastSL + h1Atr*0.5, dBtm = lastSL - h1Atr*0.3;
    const sTop = lastSH + h1Atr*0.3, sBtm = lastSH - h1Atr*0.5;
    const h1VolEma = calculateEMA(h1Closed.v, 20);
    const h1VolSpike = h1Closed.v[h1Closed.v.length-1] > h1VolEma[h1VolEma.length-1]*1.5;
    const h1RsiArr = calculateRSI(h1Closed.c, 14, true);
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
    let position = "WAIT & SEE / NO SETUP", entry="0.00", sl="0.00", tp1="0.00", tp2="0.00", tp1Pips="0", tp2Pips="0", reason=[];

    if (isBull && conf.zoneTouch && fs >= 3) {
      position = fs >= 4 ? "SWING BUY — ACTIVE" : "SWING BUY — PENDING";
      entry = price.toFixed(2); sl = (dBtm - h1Atr*0.5).toFixed(2);
      tp1 = (price + h1Atr*3).toFixed(2); tp2 = (price + h1Atr*7).toFixed(2);
      tp1Pips = (h1Atr*3).toFixed(0); tp2Pips = (h1Atr*7).toFixed(0);
      reason = [`H4 Bias: ${h4Bias}`, `H1 Demand: $${dBtm.toFixed(2)}–$${dTop.toFixed(2)}`, `Struktur H1 Terkunci (Closed-Candle)`];
    } else if (isBear && conf.zoneTouch && fs >= 3) {
      position = fs >= 4 ? "SWING SELL — ACTIVE" : "SWING SELL — PENDING";
      entry = price.toFixed(2); sl = (sTop + h1Atr*0.5).toFixed(2);
      tp1 = (price - h1Atr*3).toFixed(2); tp2 = (price - h1Atr*7).toFixed(2);
      tp1Pips = (h1Atr*3).toFixed(0); tp2Pips = (h1Atr*7).toFixed(0);
      reason = [`H4 Bias: ${h4Bias}`, `H1 Supply: $${sBtm.toFixed(2)}–$${sTop.toFixed(2)}`, `Struktur H1 Terkunci (Closed-Candle)`];
    } else {
      reason = [`H4 Bias: ${h4Bias}`, `Menunggu pullback ke zona yg dikunci.`, `Confluence: ${fs}/5`];
    }

    return { position, h4Bias, entry, sl, tp1, tp2, tp1Pips, tp2Pips, confluenceScore:fs, confluenceDetail:conf, reason, session, demandZone:{top:dTop.toFixed(2),btm:dBtm.toFixed(2)}, supplyZone:{top:sTop.toFixed(2),btm:sBtm.toFixed(2)}, h1Rsi:h1Rsi.toFixed(1), currentPrice:price.toFixed(2) };
  } catch (e) {
    return { position:"WAIT & SEE / DATA ERROR", h4Bias:"UNKNOWN", entry:"0.00", sl:"0.00", tp1:"0.00", tp2:"0.00", tp1Pips:"0", tp2Pips:"0", confluenceScore:0, reason:["Error Swing: "+e.message], session };
  }
}

// ─── SCALP SIGNAL ENGINE (SOVEREIGN M5) ──────────────────────────────────────
async function calculateScalpSignal(m5, swing, session) {
  try {
    if (!m5.c || m5.c.length === 0) throw new Error("Chart Data Kosong");
    const price = m5.current;
    
    // Mesin M5 Merdeka
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
    const rsiValBuy  = m5Rsi >= 30 && m5Rsi <= 55;
    const rsiValSell = m5Rsi >= 45 && m5Rsi <= 70;

    let localBias = "NEUTRAL";
    let score = 1; 
    const conf = { swingAligned:false, engulfing:false, volume:false, rsiHook:false };

    if (chochBuy && rsiValBuy) localBias = "BUY";
    if (chochSell && rsiValSell) localBias = "SELL";

    if (localBias === "BUY") {
      if (chochBuy) { score++; conf.engulfing = true; }
      if (hookBuy) { score++; conf.rsiHook = true; }
      if (hasVol) { score++; conf.volume = true; }
    } else if (localBias === "SELL") {
      if (chochSell) { score++; conf.engulfing = true; }
      if (hookSell) { score++; conf.rsiHook = true; }
      if (hasVol) { score++; conf.volume = true; }
    }

    let isProTrend = false;
    if (localBias !== "NEUTRAL") {
      if ((localBias === "BUY" && swing.h4Bias.includes("BULLISH")) || 
          (localBias === "SELL" && swing.h4Bias.includes("BEARISH"))) {
        score++; 
        conf.swingAligned = true;
        isProTrend = true;
      }
    }

    let position="WAIT & SEE", entry="0.00", sl="0.00", tp1="0.00", tp2="0.00", tp1Pips="0", tp2Pips="0", reason=[];

    if (localBias === "BUY" && score >= 3) {
      position = isProTrend ? "SCALP BUY — PRO-TREND (A+)" : "SCALP BUY — COUNTER-TREND";
      entry = price.toFixed(2); 
      sl = (m5.l[m5.l.length-1] - m5Atr*(isProTrend ? 1.2 : 0.8)).toFixed(2); 
      const risk = Math.abs(parseFloat(entry) - parseFloat(sl));
      tp1 = (price + risk*2).toFixed(2); 
      tp2 = isProTrend ? (price + risk*4).toFixed(2) : (price + risk*2.5).toFixed(2); 
      tp1Pips = (risk*2).toFixed(0); tp2Pips = (isProTrend ? risk*4 : risk*2.5).toFixed(0);
      reason = [`M5 Bias: BUY (Independen)`, `Korelasi H4: ${isProTrend ? "Pro-Trend" : "Counter-Trend (Ketatkan SL)"}`, `Confluence: ${score}/5`];
    } else if (localBias === "SELL" && score >= 3) {
      position = isProTrend ? "SCALP SELL — PRO-TREND (A+)" : "SCALP SELL — COUNTER-TREND";
      entry = price.toFixed(2); 
      sl = (m5.h[m5.h.length-1] + m5Atr*(isProTrend ? 1.2 : 0.8)).toFixed(2);
      const risk = Math.abs(parseFloat(sl) - parseFloat(entry));
      tp1 = (price - risk*2).toFixed(2); 
      tp2 = isProTrend ? (price - risk*4).toFixed(2) : (price - risk*2.5).toFixed(2);
      tp1Pips = (risk*2).toFixed(0); tp2Pips = (isProTrend ? risk*4 : risk*2.5).toFixed(0);
      reason = [`M5 Bias: SELL (Independen)`, `Korelasi H4: ${isProTrend ? "Pro-Trend" : "Counter-Trend (Ketatkan SL)"}`, `Confluence: ${score}/5`];
    } else {
      position = "WAIT & SEE / NO SETUP";
      reason = [`Menunggu konfirmasi M5 independen.`, `RSI M5: ${m5Rsi.toFixed(1)}`, `Momentum Volume: ${hasVol ? "OK" : "Low"}`];
    }

    return { position, gatedBySwing:isProTrend, swingBias:swing.h4Bias, entry, sl, tp1, tp2, tp1Pips, tp2Pips, confluenceScore:score, confluenceDetail:conf, reason, session, m5Rsi:m5Rsi.toFixed(1), m5Atr:m5Atr.toFixed(2), volMultiplier:volMult, currentPrice:price.toFixed(2) };
  } catch (e) {
    return { position:"BLOCKED — DATA ERROR", gatedBySwing:false, swingBias:"UNKNOWN", entry:"0.00", sl:"0.00", tp1:"0.00", tp2:"0.00", tp1Pips:"0", tp2Pips:"0", confluenceScore:0, reason:["Error Scalp: "+e.message], session };
  }
}

// ─── RAW ZONE SCANNERS ────────────────────────────────────────────────────────
function scanPreviousHL(h1, session) {
  const zones = [];
  const swings = findSwingHighsLows(h1.h, h1.l, 4, 4);
  if (!h1.c || h1.c.length === 0) return zones; 
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
    zones.push({ type: "PHP", typeLabel: "Previous High (Supply)", bias: "SELL", high: zHigh, low: zLow, strength: Math.min(5, Math.max(1, strength)), reason: `Swing high di $${sh.val.toFixed(2)}`, session, id: `PHP_${sh.val.toFixed(2)}` });
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
    zones.push({ type: "PHL", typeLabel: "Previous Low (Demand)", bias: "BUY", high: zHigh, low: zLow, strength: Math.min(5, Math.max(1, strength)), reason: `Swing low di $${sl.val.toFixed(2)}`, session, id: `PHL_${sl.val.toFixed(2)}` });
  });
  return zones;
}

function scanFVG(m5, session) {
  const zones = [];
  if (!m5.c || m5.c.length === 0) return zones;
  const atr = calculateATR(m5.h, m5.l, m5.c, 14);
  const price = m5.current;
  const len = m5.c.length;

  for (let i = len - 30; i < len - 2; i++) {
    if (i < 2) continue;
    const bullGapLow = m5.l[i];
    const bullGapHigh = m5.h[i + 2];
    if (bullGapLow > bullGapHigh) {
      let filled = false;
      for (let j = i + 3; j < len; j++) { if (m5.l[j] <= bullGapHigh && m5.h[j] >= bullGapLow) { filled = true; break; } }
      const midpoint = (bullGapLow + bullGapHigh) / 2;
      const isBelowPrice = midpoint < price;
      if (!filled && Math.abs(price - midpoint) < atr * 3) {
        const strength = (bullGapLow - bullGapHigh) > atr * 0.5 ? 5 : 3;
        zones.push({ type: "FVG", typeLabel: "Fair Value Gap (Demand)", bias: isBelowPrice ? "BUY" : "TARGET", high: bullGapLow, low: bullGapHigh, strength, reason: `Bullish FVG unfilled di $${bullGapHigh.toFixed(2)}-$${bullGapLow.toFixed(2)}`, session, id: `FVG_BULL_${i}_${bullGapLow.toFixed(2)}` });
      }
    }

    const bearGapHigh = m5.h[i];
    const bearGapLow = m5.l[i + 2];
    if (bearGapHigh < bearGapLow) {
      let filled = false;
      for (let j = i + 3; j < len; j++) { if (m5.h[j] >= bearGapLow && m5.l[j] <= bearGapHigh) { filled = true; break; } }
      const midpoint = (bearGapHigh + bearGapLow) / 2;
      const isAbovePrice = midpoint > price;
      if (!filled && Math.abs(price - midpoint) < atr * 3) {
        const strength = (bearGapLow - bearGapHigh) > atr * 0.5 ? 5 : 3;
        zones.push({ type: "FVG", typeLabel: "Fair Value Gap (Supply)", bias: isAbovePrice ? "SELL" : "TARGET", high: bearGapLow, low: bearGapHigh, strength, reason: `Bearish FVG unfilled di $${bearGapHigh.toFixed(2)}-$${bearGapLow.toFixed(2)}`, session, id: `FVG_BEAR_${i}_${bearGapHigh.toFixed(2)}` });
      }
    }
  }
  return zones;
}

function scanOrderBlocks(m5, session) {
  const zones  = [];
  if (!m5.c || m5.c.length === 0) return zones;
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
          zones.push({ type: "OB", typeLabel: "Order Block (Bullish OB)", bias: "BUY", high: m5.o[i], low: m5.l[i], strength: impulse ? 5 : 3, reason: `Bull OB di $${m5.l[i].toFixed(2)}–$${m5.o[i].toFixed(2)}`, session, id: `OB_BULL_${i}_${m5.l[i].toFixed(2)}` });
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
          zones.push({ type: "OB", typeLabel: "Order Block (Bearish OB)", bias: "SELL", high: m5.h[i], low: m5.o[i], strength: impulse ? 5 : 3, reason: `Bear OB di $${m5.o[i].toFixed(2)}–$${m5.h[i].toFixed(2)}`, session, id: `OB_BEAR_${i}_${m5.h[i].toFixed(2)}` });
        }
      }
    }
  }
  return zones;
}

function scanBreakers(m5, session) { return []; }
function scanLiquidityLevels(h1, m5, session) { return []; }
function scanSessionLevels(h1, session) { return []; }

// ─── SPATIAL CONFLUENCE & LIMIT ORDER ENGINE ─────────────────────────────────
async function scanAllZones(h1, m5, session, swing) {
  try {
    if (!h1.c || h1.c.length === 0 || !m5.c || m5.c.length === 0) return []; 
    const raw = [ ...scanPreviousHL(h1, session), ...scanFVG(m5, session), ...scanOrderBlocks(m5, session), ...scanBreakers(m5, session), ...scanLiquidityLevels(h1, m5, session), ...scanSessionLevels(h1, session) ];

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

    const m5Atr = calculateATR(m5.h, m5.l, m5.c, 14);

    return deduped.slice(0, 8).map(z => {
      const isBuy = z.bias === "BUY";
      const entryPrice = isBuy ? z.high : z.low; 
      const slPrice = isBuy ? (z.low - m5Atr * 0.2) : (z.high + m5Atr * 0.2);
      const risk = Math.abs(entryPrice - slPrice);
      const tp1 = isBuy ? (entryPrice + risk * 2) : (entryPrice - risk * 2); 
      const tp2 = isBuy ? (entryPrice + risk * 3) : (entryPrice - risk * 3); 

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
          tp1Pips: (risk * 2).toFixed(1)
        }
      };
    });
  } catch (e) { return []; }
}

// ─── MAIN WEB ROUTER / HANDLER (ERROR-PROOF + MACRO FIXED) ────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const session = getSession();
    
    // Fetch all data
    const [events, crude, dxy, h4Raw, h1, m5, m1] = await Promise.all([
      fetchTradingViewData().catch(() => []),
      fetchCrudeOil().catch(() => ({ current: null, avg30: null })),
      fetchDXY().catch(() => ({ current: "N/A", changePercent: "0", status: "OFFLINE" })),
      fetchChartData("1d", "60d").catch(() => fetchChartData("1h", "20d")),
      fetchChartData("1h", "15d"),
      fetchChartData("5m", "2d"),
      fetchChartData("1m", "1d")
    ]);

    // 1. Calculate Core Macro (FIXED: Fungsi Macro Aktif Kembali!)
    const nfp    = scoreNFP(events || []);
    const cpi    = scoreCPI(events || [], crude);
    const growth = scoreGrowth(events || []);
    const fed    = scoreFed(events || []);
    
    let total = (nfp.score || 0) + (cpi.score || 0) + (growth.score || 0) + (fed.score || 0);
    const master = total >= 40 ? "STRONG SELL XAU" : total <= -40 ? "STRONG BUY XAU" : "NEUTRAL";

    // 2. Technical Signals & SMC Confluence
    const swing = await calculateSwingSignal(h4Raw, h1, session);
    const scalp = await calculateScalpSignal(m5, swing, session);
    const zones = await scanAllZones(h1, m5, session, swing);

    // 3. Telegram Automations (Cron)
    if (req.query.cron === "true" || req.headers["x-vercel-cron"] === "true") {
      if (master !== "NEUTRAL") {
        await sendTelegramAlert(master, total, dxy.current, nfp.val, cpi.val, growth.val, fed.val);
      }
      
      const swingID = swing.position + "_" + swing.entry;
      const isSwingCurrentlyActive = swing.position.includes("ACTIVE");
      if (isSwingCurrentlyActive && swingID !== lastSentSwingID) {
        await sendSwingAlert(swing); 
        lastSentSwingID = swingID; 
        isSwingActive = true;
      }
      
      const scalpID = scalp.position + "_" + scalp.entry;
      const isScalpCurrentlyActive = scalp.position.includes("ACTIVE");
      if (isScalpCurrentlyActive && scalpID !== lastSentScalpID) {
        await sendScalpAlert(scalp); 
        lastSentScalpID = scalpID; 
        isScalpActive = true;
      }

      for (const zone of zones) {
        if (!sentZoneIDs.has(zone.id) && zone.strength >= 3) {
          await sendZoneAlert(zone); 
          sentZoneIDs.add(zone.id);
          if (sentZoneIDs.size > 100) sentZoneIDs.clear();
        }
      }
    }

    // 4. Return Output
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      dxy_live: dxy,
      master_signal: { signal: master, total_score: total },
      nfp, cpi, growth, fed,
      swing_signal: swing,
      scalp_signal: scalp,
      technical_signal: scalp,
      zone_pantau: zones,
      entry_triggers: [], // Di-handle secara live oleh index.html
      upcoming_news: events.filter(e => (e.country==="US"||e.currency==="USD") && new Date(e.date).getTime() > Date.now()-3600000).sort((a,b) => new Date(a.date)-new Date(b.date)).slice(0, 15)
    });

  } catch (err) {
    // 🛡️ ANTI-CRASH VERCEL (Return 200 supaya web frontend tetap menangkap pesan)
    return res.status(200).json({ success: false, error: err.message });
  }
};
