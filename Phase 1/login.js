/* =========================================================
   ECOSHARE — LOGIN

   login.js

   Responsibilities:
   - Email/password login
   - Password visibility toggle
   - Forgot-password request
   - Client-side validation
   - Loading states
   - Safe internal redirects
   - Generic authentication errors
   - Accessible status messages

   Security model:
   - Supabase Auth is the authentication authority.
   - Browser never controls authorization/roles.
   - No profile/RPC lookup during login.
   - No localStorage/sessionStorage dependency.
   - Password-reset responses do not reveal account existence.
   - Redirects are restricted to the same application origin.
   - Raw backend errors are never shown to users.
   ========================================================= */

(() => {
  "use strict";

  /* =====================================================
       1. PREVENT DUPLICATE INITIALIZATION
       ===================================================== */

  if (window.ecoShareLoginInitialized) {
    return;
  }

  window.ecoShareLoginInitialized = true;

  /* =====================================================
       2. DOM REFERENCES
       ===================================================== */

  const loginForm = document.getElementById("loginForm");

  const emailInput = document.getElementById("email");

  const passwordInput = document.getElementById("password");

  const togglePassword = document.getElementById("togglePassword");

  const forgotPassword = document.getElementById("forgotPassword");

  const loginButton = document.getElementById("loginButton");

  const message = document.getElementById("message");

  const loginLogo = document.getElementById("loginLogo");

  /* =====================================================
       3. CONFIGURATION
       ===================================================== */

  const HOME_URL = "../../index.html";

  const RESET_PASSWORD_URL = "reset-password.html";

  const MAX_EMAIL_LENGTH = 320;

  /* =====================================================
       4. STATE
       ===================================================== */

  let isLoginSubmitting = false;

  let isResetSubmitting = false;

  let loginSucceeded = false;

  /* =====================================================
       5. MESSAGE HANDLING
       ===================================================== */

  function showMessage(text = "", type = "error") {
    if (!message) {
      return;
    }

    message.textContent = "";

    message.className = "form-message";

    if (!text) {
      message.setAttribute("role", "status");

      message.setAttribute("aria-live", "polite");

      message.setAttribute("aria-atomic", "true");

      return;
    }

    message.textContent = String(text);

    if (type === "success") {
      message.classList.add("success");

      message.setAttribute("role", "status");
    } else if (type === "info") {
      message.classList.add("info");

      message.setAttribute("role", "status");
    } else {
      message.classList.add("error");

      message.setAttribute("role", "alert");
    }

    message.setAttribute(
      "aria-live",
      type === "error" ? "assertive" : "polite",
    );

    message.setAttribute("aria-atomic", "true");
  }

  /* =====================================================
       6. SUPABASE CLIENT
       ===================================================== */

  function getSupabaseClient() {
    const client = window.supabaseClient;

    if (
      !client ||
      !client.auth ||
      typeof client.auth.signInWithPassword !== "function"
    ) {
      console.error("EcoShare: Supabase client is not initialized.");

      showMessage(
        "Unable to connect to the server. Please refresh and try again.",
        "error",
      );

      return null;
    }

    return client;
  }

  /* =====================================================
       7. EMAIL VALIDATION
       ===================================================== */

  function normalizeEmail(email) {
    return String(email || "")
      .trim()
      .toLowerCase();
  }

  function isValidEmail(email) {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      return false;
    }

    if (normalizedEmail.length > MAX_EMAIL_LENGTH) {
      return false;
    }

    /*
     * Practical client-side validation.
     * Supabase Auth remains responsible for
     * actual email processing.
     */
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return emailPattern.test(normalizedEmail);
  }

  /* =====================================================
       8. PASSWORD VISIBILITY
       ===================================================== */

  function updatePasswordToggle(isVisible) {
    if (!togglePassword) {
      return;
    }

    togglePassword.textContent = isVisible ? "Hide" : "Show";

    togglePassword.setAttribute(
      "aria-label",
      isVisible ? "Hide password" : "Show password",
    );

    togglePassword.setAttribute("aria-pressed", String(isVisible));
  }

  function resetPasswordVisibility() {
    if (!passwordInput) {
      return;
    }

    passwordInput.type = "password";

    updatePasswordToggle(false);
  }

  function setupPasswordToggle() {
    if (!togglePassword || !passwordInput) {
      return;
    }

    togglePassword.addEventListener("click", () => {
      const shouldShow = passwordInput.type === "password";

      passwordInput.type = shouldShow ? "text" : "password";

      updatePasswordToggle(shouldShow);

      passwordInput.focus();
    });
  }

  /* =====================================================
       9. LOGIN BUTTON STATE
       ===================================================== */

  function setLoginLoading(isLoading) {
    if (!loginButton) {
      return;
    }

    const loading = Boolean(isLoading);

    loginButton.disabled = loading;

    loginButton.setAttribute("aria-busy", String(loading));

    loginButton.textContent = loading ? "Logging in..." : "Login";
  }

  /* =====================================================
       10. FORGOT PASSWORD BUTTON STATE
       ===================================================== */

  function setResetLoading(isLoading) {
    if (!forgotPassword) {
      return;
    }

    const loading = Boolean(isLoading);

    forgotPassword.disabled = loading;

    forgotPassword.setAttribute("aria-busy", String(loading));

    forgotPassword.setAttribute("aria-disabled", String(loading));
  }

  /* =====================================================
       11. LOGO ASSET
       ===================================================== */

  function setupLogo() {
    if (!loginLogo || !window.ECOSHARE_ASSETS || !window.ECOSHARE_ASSETS.logo) {
      return;
    }

    const logoURL = String(window.ECOSHARE_ASSETS.logo).trim();

    if (!logoURL) {
      return;
    }

    loginLogo.src = logoURL;
  }

  /* =====================================================
       12. SAFE INTERNAL REDIRECT
       ===================================================== */

  function getSafeRedirect() {
    const params = new URLSearchParams(window.location.search);

    const requestedRedirect = params.get("redirect");

    /*
     * No redirect supplied.
     */
    if (!requestedRedirect) {
      return HOME_URL;
    }

    try {
      const requestedURL = new URL(requestedRedirect, window.location.href);

      /*
       * Same-origin only.
       */
      if (requestedURL.origin !== window.location.origin) {
        return HOME_URL;
      }

      /*
       * Determine the directory containing
       * login.html.
       */
      const currentDirectory = new URL("./", window.location.href).pathname;

      let requestedPath;
      let allowedDirectory;

      try {
        requestedPath = decodeURIComponent(requestedURL.pathname);

        allowedDirectory = decodeURIComponent(currentDirectory);
      } catch (error) {
        console.warn("EcoShare: Redirect path decoding failed.", error);

        return HOME_URL;
      }

      /*
       * Prevent navigation outside the
       * current application directory.
       */
      if (!requestedPath.startsWith(allowedDirectory)) {
        return HOME_URL;
      }

      /*
       * Only allow the same protocol.
       */
      if (requestedURL.protocol !== window.location.protocol) {
        return HOME_URL;
      }

      /*
       * Return only the internal path.
       */
      return requestedURL.pathname + requestedURL.search + requestedURL.hash;
    } catch (error) {
      console.warn("EcoShare: Invalid redirect URL.", error);

      return HOME_URL;
    }
  }

  /* =====================================================
       13. LOGIN ERROR HANDLING
       ===================================================== */

  function handleLoginError(error) {
    /*
     * Detailed error remains in the developer
     * console only.
     */
    console.error("EcoShare login failed:", error);

    /*
     * Keep login errors generic.
     *
     * We intentionally do not tell the user:
     * - whether the email exists
     * - whether the password was wrong
     * - whether the account is registered
     */
    showMessage("Invalid email or password. Please try again.", "error");
  }

  /* =====================================================
       14. LOGIN
       ===================================================== */

  async function handleLogin(event) {
    event.preventDefault();

    if (isLoginSubmitting) {
      return;
    }

    showMessage("");

    const email = normalizeEmail(emailInput?.value);

    const password = passwordInput?.value || "";

    /* ---------- Email ---------- */

    if (!email) {
      showMessage("Please enter your email address.", "error");

      emailInput?.focus();

      return;
    }

    if (!isValidEmail(email)) {
      showMessage("Please enter a valid email address.", "error");

      emailInput?.focus();

      return;
    }

    /* ---------- Password ---------- */

    if (!password) {
      showMessage("Please enter your password.", "error");

      passwordInput?.focus();

      return;
    }

    /* ---------- Supabase ---------- */

    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    isLoginSubmitting = true;

    loginSucceeded = false;

    setLoginLoading(true);

    showMessage("Signing in...", "info");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      /* ---------- Auth error ---------- */

      if (error) {
        handleLoginError(error);

        return;
      }

      /*
       * A successful password login must
       * return both an authenticated user
       * and a session.
       */
      if (!data?.user || !data?.session) {
        console.error("EcoShare: Supabase returned no authenticated session.");

        showMessage("Login failed. Please try again.", "error");

        return;
      }

      /*
       * Authentication is handled by
       * Supabase Auth.
       *
       * We intentionally do NOT:
       * - query profiles
       * - call an RPC
       * - read roles from storage
       * - read roles from URL parameters
       * - trust user metadata for authorization
       *
       * Authorization is enforced separately
       * by database/RLS architecture.
       */

      loginSucceeded = true;

      showMessage("Login successful. Redirecting...", "success");

      /*
       * Keep the login button disabled
       * during navigation.
       */
      setLoginLoading(true);

      const destination = getSafeRedirect();

      window.setTimeout(() => {
        window.location.replace(destination);
      }, 400);
    } catch (error) {
      console.error("EcoShare login error:", error);

      loginSucceeded = false;

      showMessage("Something went wrong. Please try again.", "error");
    } finally {
      isLoginSubmitting = false;

      /*
       * Do not re-enable the login button
       * after successful authentication.
       * Navigation is already scheduled.
       */
      if (!loginSucceeded) {
        setLoginLoading(false);
      }
    }
  }

  /* =====================================================
       15. FORGOT PASSWORD
       ===================================================== */

  async function handleForgotPassword(event) {
    event.preventDefault();

    if (isResetSubmitting) {
      return;
    }

    showMessage("");

    const email = normalizeEmail(emailInput?.value);

    /* ---------- Email ---------- */

    if (!email) {
      showMessage("Enter your email address first.", "error");

      emailInput?.focus();

      return;
    }

    if (!isValidEmail(email)) {
      showMessage("Please enter a valid email address.", "error");

      emailInput?.focus();

      return;
    }

    /* ---------- Supabase ---------- */

    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    isResetSubmitting = true;

    setResetLoading(true);

    showMessage("Sending password reset email...", "info");

    try {
      /*
       * Build the absolute reset-password
       * URL from the current application.
       */
      const resetURL = new URL(RESET_PASSWORD_URL, window.location.href).href;

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: resetURL,
      });

      if (error) {
        console.error("EcoShare password reset error:", error);

        /*
         * Keep the user-facing message
         * generic.
         */
        showMessage(
          "Unable to send the reset email. Please try again.",
          "error",
        );

        return;
      }

      /*
       * Never tell the user whether the
       * email actually exists.
       */
      showMessage(
        "If an account exists with this email, a password reset link has been sent.",
        "success",
      );
    } catch (error) {
      console.error("EcoShare password reset error:", error);

      showMessage("Something went wrong. Please try again.", "error");
    } finally {
      isResetSubmitting = false;

      setResetLoading(false);
    }
  }

  /* =====================================================
       16. INITIALIZATION
       ===================================================== */

  function initializeLoginPage() {
    if (!loginForm) {
      console.warn("EcoShare: Login form not found.");

      return;
    }

    setupLogo();

    setupPasswordToggle();

    /* ---------- Login ---------- */

    loginForm.addEventListener("submit", handleLogin);

    /* ---------- Forgot password ---------- */

    if (forgotPassword) {
      forgotPassword.addEventListener("click", handleForgotPassword);
    }

    /*
     * Ensure the password starts hidden
     * and the accessibility state matches.
     */
    resetPasswordVisibility();
  }

  /* =====================================================
       17. START
       ===================================================== */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeLoginPage, {
      once: true,
    });
  } else {
    initializeLoginPage();
  }
})();
