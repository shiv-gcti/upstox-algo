const mongoose = require("mongoose");

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("✅ MongoDB Atlas Connected");
  } catch (err) {
    console.error("❌ DB Error:", err);
    process.exit(1); // stop app if DB fails
  }
}

// ==============================
// 🔍 Debug Logs (IMPORTANT)
// ==============================
mongoose.connection.on("connected", () => {
  console.log("📡 Mongoose connected");
});

mongoose.connection.on("error", (err) => {
  console.log("❌ Mongoose error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("⚠️ Mongoose disconnected");
});

module.exports = connectDB;
