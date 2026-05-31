const mongoose = require("mongoose");

const tradeSchema = new mongoose.Schema({
  time: { type: Date, default: Date.now },

  side: String,
  instrument: String,

  quantity: Number,
  filled_qty: { type: Number, default: 0 },

  orderId: { type: String, index: true }, // broker order id

  price: Number,
  avg_price: { type: Number, default: 0 },

  status: {
    type: String,
    enum: ["OPEN", "PARTIAL", "CLOSED", "CANCELLED", "FAILED"],
    default: "OPEN"
  },

  pnl: { type: Number, default: 0 },

  exchange: String,
  product: String,
  order_type: String,

  raw: Object // full broker response
}, { timestamps: true });

module.exports = mongoose.model("Trade", tradeSchema);
