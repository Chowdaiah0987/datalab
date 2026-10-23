/* Login page behaviour. The browser never sees any Admin credentials: the server checks them. */
(function () {
  "use strict";

  const form = document.getElementById("loginForm");
  const identifier = document.getElementById("identifier");
  const password = document.getElementById("password");
  const label = document.getElementById("identifierLabel");
  const message = document.getElementById("loginMessage");
  const button = document.getElementById("loginBtn");
  const toggle = document.getElementById("togglePassword");
  const cards = { user: document.getElementById("roleUserCard"), admin: document.getElementById("roleAdminCard") };

  // Only same-site relative addresses are allowed as the place to go after signing in
  function destination() {
    const next = new URLSearchParams(location.search).get("next") || "";
    if (/^\/(?!\/)[^\s\\]*$/.test(next) && !/^\/login\.html/i.test(next)) return next;
    return "home.html";
  }

  function show(text, info) {
    message.hidden = !text;
    message.textContent = text || "";
    message.classList.toggle("is-info", Boolean(info));
  }

  function currentRole() {
    return form.elements.role.value === "admin" ? "admin" : "user";
  }

  function syncRole() {
    const role = currentRole();
    Object.entries(cards).forEach(([key, card]) => card.classList.toggle("is-selected", key === role));
    label.textContent = role === "admin" ? "Admin Username" : "Username / Email";
    identifier.placeholder = role === "admin" ? "Enter the admin username" : "Enter your email or username";
    identifier.autocomplete = "username";
    show("");
  }
  form.querySelectorAll('input[name="role"]').forEach((radio) => radio.addEventListener("change", syncRole));

  toggle.addEventListener("click", () => {
    const visible = password.type === "password";
    password.type = visible ? "text" : "password";
    toggle.setAttribute("aria-pressed", String(visible));
    toggle.setAttribute("aria-label", visible ? "Hide password" : "Show password");
    password.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = identifier.value.trim();
    if (!name) { show("Enter your username or email."); identifier.focus(); return; }
    if (!password.value.trim()) { show("Enter your password."); password.focus(); return; }

    button.disabled = true;
    button.querySelector("span").textContent = "Signing in…";
    show("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ role: currentRole(), identifier: name, password: password.value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not sign in. Please try again.");
      try { sessionStorage.setItem("dslRole", data.role); sessionStorage.setItem("dslName", data.name || ""); } catch (error) { /* optional */ }
      show(data.role === "admin" ? "Welcome, Admin. Opening the laboratory…" : "Signed in. Opening the laboratory…", true);
      location.replace(destination());
    } catch (error) {
      password.value = "";
      show(error.message === "Failed to fetch" ? "Cannot reach the server. Check your connection and try again." : error.message);
      button.disabled = false;
      button.querySelector("span").textContent = "Login";
      (currentRole() === "admin" ? password : password).focus();
    }
  });

  // Already signed in? Go straight in.
  fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => { if (data && data.authenticated && !new URLSearchParams(location.search).has("stay")) location.replace(destination()); })
    .catch(() => {});

  syncRole();
})();