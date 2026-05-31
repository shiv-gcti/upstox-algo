async function login() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const res = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  if (res.ok) {
    const data = await res.json();

    if (data.step === "otp") {
      document.getElementById("otpBox").style.display = "block";
    }
  } else {
    alert("Invalid login");
  }
}

async function verifyOtp() {
  const token = document.getElementById("otp").value;

  const res = await fetch("/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });

  if (res.ok) {
    window.location.href = "/";
  } else {
    alert("Invalid OTP");
  }
}
