// api/predict.js — DEPRESSEDESIGN Macro Predictor Backend
// Vercel Serverless Function (Node.js) - TRADINGVIEW EDITION

const axios = require("axios");

module.exports = async (req, res) => {
  // Aktifkan CORS biar web kamu bisa akses API ini
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  try {
    // 1. Tarik data dari TradingView (Lebih stabil & Gratis)
    // Kita tarik data kalender ekonomi US 30 hari ke belakang dan 7 hari ke depan
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const url = `https://economic-calendar.tradingview.com/events?from=${from}&to=${to}&countries=US`;
    
    const response = await axios.get(url, {
      headers: {
        'Origin': 'https://www.tradingview.com',
        'Referer': 'https://www.tradingview.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const events = response.data.result;

    // 2. Fungsi Helper cari berita
    const findEvent = (keywords) => {
      return events.find(e => keywords.some(kw => (e.title || "").toLowerCase().includes(kw.toLowerCase())));
    };

    // 3. Scoring Logic (Sederhana tapi efektif)
    const nfpData = findEvent(["adp", "nonfarm"]);
    const cpiData = findEvent(["cpi", "inflation"]);
    const ismData = findEvent(["ism manufacturing"]);

    // Kirim data ke frontend
    res.status(200).json({
      success: true,
      nfp: { score: nfpData ? (nfpData.actual > nfpData.forecast ? 30 : -30) : 0, data: nfpData },
      cpi: { score: cpiData ? (cpiData.actual > cpiData.forecast ? -50 : 50) : 0, data: cpiData },
      ism: { score: ismData ? (ismData.actual > 50 ? 20 : -20) : 0, data: ismData }
    });

  } catch (err) {
    console.error("API Error:", err.message);
    res.status(500).json({ success: false, error: "Gagal menarik data makro." });
  }
};
