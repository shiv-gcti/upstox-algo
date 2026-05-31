const axios = require("axios");
const { getAccessToken } = require("./tokenManager");
const Trade = require("./models/Trade");

const { findInstrument } = require("./instrumentStore");
const { decodeSymbol } = require("./symbolDecoder");

// ==============================
// 🚀 PLACE ORDER (MCX_FO + LOT SIZE)
// ==============================
async function placeOrder(order) {
  try {
    const token = getAccessToken();

    const action = (order.transaction_type || "").trim().toUpperCase();
    const quantity = Number(order.quantity);
    const rawSymbol = order.TS;

    if (!["BUY", "SELL"].includes(action)) {
      throw new Error("Invalid Action");
    }

    if (!rawSymbol) {
      throw new Error("Symbol missing");
    }

    // ==============================
    // 🧠 STEP 1: DECODE SYMBOL
    // ==============================
    const decoded = decodeSymbol(rawSymbol);
    console.log("🧠 Decoded:", decoded);

    let instrumentKey = null;
    let instrumentData = null;
    let exchange = decoded.exchange;

    const resolveInstrument = (res) => {
      if (!res) return null;
      if (typeof res === "object") {
        instrumentData = res;
        return res.instrument_token;
      } else {
        instrumentData = null;
        return res;
      }
    };

    // ==============================
    // 🔍 STEP 2: FIND INSTRUMENT
    // ==============================
    if (decoded.instrumentType === "EQ") {
      const formats = [`${decoded.symbol} EQ`, `${decoded.symbol}`];

      for (const f of formats) {
        const res = findInstrument(f);
        instrumentKey = resolveInstrument(res);
        if (instrumentKey) break;
      }

      exchange = decoded.exchange || "NSE";
    }

    else if (decoded.instrumentType === "FUT") {
      const formats = [
        `${decoded.symbol} FUT ${decoded.day} ${decoded.month} ${decoded.year}`,
        `${decoded.symbol} ${decoded.month} ${decoded.year} FUT`,
        `${decoded.symbol} FUT`
      ];

      for (const f of formats) {
        const res = findInstrument(f);
        instrumentKey = resolveInstrument(res);
        if (instrumentKey) break;
      }
    }

    else if (decoded.instrumentType === "OPT") {
      const shortYear = decoded.year.slice(-2);

      const formats = [
        `${decoded.symbol} ${decoded.strike} ${decoded.optionType} ${decoded.day} ${decoded.month} ${shortYear}`,
        `${decoded.symbol} ${decoded.day} ${decoded.month} ${shortYear} ${decoded.optionType} ${decoded.strike}`
      ];

      for (const f of formats) {
        const res = findInstrument(f);
        instrumentKey = resolveInstrument(res);
        if (instrumentKey) break;
      }
    }

    if (!instrumentKey) {
      throw new Error("Instrument not found: " + rawSymbol);
    }

    // ==============================
    // 🔥 LOT SIZE
    // ==============================
    const lotSize =
      instrumentData && instrumentData.lot_size
        ? Number(instrumentData.lot_size)
        : 1;

    const finalQty = quantity * lotSize;

    console.log(
      `📦 Lot Size: ${lotSize} | Input Qty: ${quantity} | Final Qty: ${finalQty}`
    );

    console.log("🎯 Matched:", instrumentKey, "| Exchange:", exchange);

    // ==============================
    // 🚀 STEP 3: BUILD PAYLOAD
    // ==============================
    const orderPayload = {
      quantity: finalQty,
      product: order.product === "NRML" ? "D" : "I",
      validity: order.validity || "DAY",
      price: 0,

      instrument_token: instrumentKey,
      exchange: exchange,

      order_type: order.order_type || "MARKET",
      transaction_type: action,

      disclosed_quantity: 0,
      trigger_price: 0,
      is_amo: false
    };

    console.log("📡 Sending:", orderPayload);

    // ==============================
    // 📤 STEP 4: API CALL
    // ==============================
    const response = await axios.post(
      "https://api.upstox.com/v2/order/place",
      orderPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    const orderData = response.data;
    const orderId = orderData.data?.order_id || "NA";

    console.log("✅ Order Success:", orderData);

    // ==============================
    // 🧾 STEP 5: SAVE TRADE (IMPORTANT CHANGE)
    // ==============================
    await Trade.create({
      side: action,                 // BUY or SELL
      quantity: finalQty,
      instrument: instrumentKey,
      exchange,

      orderId: orderId,

      price: 0,
      avg_price: 0,
      filled_qty: 0,

      status: "OPEN",              // ALWAYS OPEN initially

      order_type: order.order_type,
      product: order.product,

      raw: orderData,
      time: new Date()
    });

    // ==============================
    // 📡 PUSH TO FRONTEND
    // ==============================
    if (global.io) {
      global.io.emit("order_update", { orderId });
    }

    return orderData;

  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);
    throw err;
  }
}

// ==============================
// 📊 TRADE LOG
// ==============================
async function getTradeLog() {
  return await Trade.find().sort({ createdAt: -1 });
}

// ==============================
module.exports = {
  placeOrder,
  getTradeLog
};	
