const speakeasy = require("speakeasy");

const secret = speakeasy.generateSecret({
  name: "Algo Dashboard"
});

console.log("SECRET (save in .env):", secret.base32);
console.log("QR URL:", secret.otpauth_url);
