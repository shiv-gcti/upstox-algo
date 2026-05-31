const axios = require("axios");
const Trade = require("./models/Trade");
const { getAccessToken } = require("./tokenManager");

async function syncOrders() {
  try {
    const token = getAccessToken();
    if (!token) return;

    const response = await axios.get(
      "https://api.upstox.com/v2/order/retrieve-all",
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    const brokerOrders = response.data?.data || [];

    // 🔹 Create map of broker orders
    const brokerMap = new Map();
    brokerOrders.forEach(o => {
      brokerMap.set(o.order_id, o);
    });

    // 🔹 Get all OPEN trades from DB
    const openTrades = await Trade.find({
      status: { $in: ["OPEN", "PARTIAL"] }
    });

    for (const trade of openTrades) {
      const brokerOrder = brokerMap.get(trade.orderId);

      // ==============================
      // ✅ CASE 1: FOUND IN BROKER
      // ==============================
      if (brokerOrder) {
        const newStatus = mapStatus(brokerOrder.status);

        await Trade.updateOne(
          { orderId: trade.orderId },
          {
            status: newStatus,
            filled_qty: brokerOrder.filled_quantity || 0,
            avg_price: brokerOrder.average_price || 0,
            raw: brokerOrder
          }
        );

        if (global.io) {
          global.io.emit("order_update", {
            orderId: trade.orderId,
            status: newStatus
          });
        }
      }

      // ==============================
      // ❗ CASE 2: NOT IN BROKER
      // ==============================
      else {
        console.log("⚠️ Not found in broker:", trade.orderId);

        await Trade.updateOne(
          { orderId: trade.orderId },
          {
            status: "CLOSED" // or "CANCELLED" if you prefer
          }
        );

        if (global.io) {
          global.io.emit("order_update", {
            orderId: trade.orderId,
            status: "CLOSED"
          });
        }
      }
    }

  } catch (err) {
    console.error("❌ Sync error:", err.response?.data || err.message);
  }
}

// ==============================
// STATUS MAP
// ==============================
function mapStatus(status) {
  if (!status) return "OPEN";

  status = status.toLowerCase();

  if (status.includes("complete")) return "CLOSED";
  if (status.includes("cancel")) return "CANCELLED";
  if (status.includes("reject")) return "FAILED";
  if (status.includes("partial")) return "PARTIAL";

  return "OPEN";
}

module.exports = { syncOrders };
