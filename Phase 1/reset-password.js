/* =========================================================
   ECOSHARE — RESET PASSWORD

   reset-password.js

   Responsibilities:
   - Detect Supabase password recovery session
   - Verify authenticated recovery user
   - Validate new password
   - Confirm password
   - Update password through Supabase Auth
   - Prevent unauthenticated password changes
   - Safely handle errors
   - Clean up auth listener
   ========================================================= */

(() => {
  "use strict";

  /* =========================================================
       1. PREVENT DUPLICATE INITIALIZATION
       ========================================================= */

  if (window.ecoShareResetPasswordInitialized) {
    return;
  }

  window.ecoShareResetPasswordInitialized = true;

  /* =========================================================
       2. DOM REFERENCES
       ========================================================= */

  const resetForm = document.getElementById("resetPasswordForm");

  const newPasswordInput = document.getElementById("newPassword");

  const confirmPasswordInput = document.getElementById("confirmPassword");

  const toggleNewPassword = document.getElementById("toggleNewPassword");

  const toggleConfirmPassword = document.getElementById(
    "toggleConfirmPassword",
  );

  const resetButton = document.getElementById("resetButton");

  const message = document.getElementById("message");

  /* =========================================================
       3. CONFIGURATION
       ========================================================= */

  const LOGIN_URL = "login.html";

  const MIN_PASSWORD_LENGTH = 8;

  const MAX_PASSWORD_LENGTH = 128;

  /* =========================================================
       4. STATE
       ========================================================= */

  let recoverySessionVerified = false;

  let passwordUpdateInProgress = false;

  let passwordUpdateSucceeded = false;

  let authSubscription = null;

  /*
   * Incremented whenever recovery verification starts.
   *
   * This prevents an older async verification result from
   * changing the UI after a newer verification has already
   * completed.
   */
  let verificationRequestId = 0;

  /* =========================================================
       5. MESSAGE HANDLING
       ========================================================= */

  function showMessage(text = "", type = "error") {
    if (!message) {
      return;
    }

    const safeType = ["success", "error", "info"].includes(type)
      ? type
      : "error";

    message.textContent = String(text || "");

    message.className = "form-message";

    if (!text) {
      message.setAttribute("role", "status");

      message.setAttribute("aria-live", "polite");

      message.setAttribute("aria-atomic", "true");

      return;
    }

    message.classList.add(safeType);

    message.setAttribute("role", safeType === "error" ? "alert" : "status");

    message.setAttribute(
      "aria-live",
      safeType === "error" ? "assertive" : "polite",
    );

    message.setAttribute("aria-atomic", "true");
  }

  /* =========================================================
       6. SUPABASE CLIENT
       ========================================================= */

  function getSupabaseClient() {
    const client = window.supabaseClient;

    if (
      client &&
      typeof client === "object" &&
      client.auth &&
      typeof client.auth.getSession === "function" &&
      typeof client.auth.getUser === "function" &&
      typeof client.auth.updateUser === "function"
    ) {
      return client;
    }

    console.error("EcoShare: Supabase client is not initialized.");

    showMessage(
      "Unable to connect to the server. Please refresh and try again.",
      "error",
    );

    return null;
  }

  /* =========================================================
       7. PASSWORD VISIBILITY
       ========================================================= */

  function setPasswordVisibility(button, input, visible) {
    if (!button || !input) {
      return;
    }

    input.type = visible ? "text" : "password";

    button.textContent = visible ? "Hide" : "Show";

    button.setAttribute(
      "aria-label",
      visible ? "Hide password" : "Show password",
    );

    button.setAttribute("aria-pressed", String(visible));
  }

  function setupPasswordToggle(button, input) {
    if (!button || !input) {
      return;
    }

    button.addEventListener("click", () => {
      const shouldShow = input.type === "password";

      setPasswordVisibility(button, input, shouldShow);

      input.focus();
    });
  }

  function resetPasswordVisibility() {
    setPasswordVisibility(toggleNewPassword, newPasswordInput, false);

    setPasswordVisibility(toggleConfirmPassword, confirmPasswordInput, false);
  }

  /* =========================================================
       8. BUTTON STATE
       ========================================================= */

  function setResetLoading(isLoading) {
    if (!resetButton) {
      return;
    }

    const loading = Boolean(isLoading);

    resetButton.disabled = loading;

    resetButton.setAttribute("aria-busy", String(loading));

    resetButton.textContent = loading ? "Updating..." : "Update Password";
  }

  function setResetAvailable(isAvailable) {
    if (!resetButton) {
      return;
    }

    const available = Boolean(isAvailable);

    resetButton.disabled = !available;

    if (!available) {
      resetButton.setAttribute("aria-disabled", "true");
    } else {
      resetButton.removeAttribute("aria-disabled");
    }
  }

  /* =========================================================
       9. PASSWORD VALIDATION
       ========================================================= */

  function validatePassword(password) {
    if (typeof password !== "string" || password.length === 0) {
      return "Please enter a new password.";
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return (
        `Password must be at least ` + `${MIN_PASSWORD_LENGTH} characters long.`
      );
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      return (
        `Password must be no more than ` +
        `${MAX_PASSWORD_LENGTH} characters long.`
      );
    }

    if (!/[a-z]/.test(password)) {
      return "Password must contain at least " + "one lowercase letter.";
    }

    if (!/[A-Z]/.test(password)) {
      return "Password must contain at least " + "one uppercase letter.";
    }

    if (!/[0-9]/.test(password)) {
      return "Password must contain at least " + "one number.";
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      return "Password must contain at least " + "one special character.";
    }

    return null;
  }

  /* =========================================================
       10. RECOVERY SESSION VERIFICATION
       ========================================================= */

  async function verifyRecoverySession() {
    const supabase = getSupabaseClient();

    if (!supabase) {
      recoverySessionVerified = false;

      return false;
    }

    const requestId = ++verificationRequestId;

    /*
     * Disable the form while verification is
     * being performed.
     */
    setResetAvailable(false);

    try {
      /*
       * First confirm that Supabase has an active
       * session created by the recovery flow.
       */
      const { data, error } = await supabase.auth.getSession();

      if (requestId !== verificationRequestId) {
        return false;
      }

      if (error) {
        console.error("EcoShare recovery session error:", error);

        recoverySessionVerified = false;

        return false;
      }

      const session = data?.session;

      if (!session?.user?.id) {
        recoverySessionVerified = false;

        return false;
      }

      /*
       * Verify the authenticated user against
       * the Supabase Auth server.
       */
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (requestId !== verificationRequestId) {
        return false;
      }

      if (userError || !userData?.user?.id) {
        console.error("EcoShare recovery user verification failed:", userError);

        recoverySessionVerified = false;

        return false;
      }

      /*
       * Confirm that the session user and
       * server-verified user are the same user.
       */
      if (session.user.id !== userData.user.id) {
        console.error("EcoShare: Recovery session user mismatch.");

        recoverySessionVerified = false;

        return false;
      }

      recoverySessionVerified = true;

      return true;
    } catch (error) {
      console.error("EcoShare recovery verification error:", error);

      recoverySessionVerified = false;

      return false;
    }
  }

  /* =========================================================
       11. PASSWORD RECOVERY EVENT
       ========================================================= */

  function setupAuthListener() {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return null;
    }

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "PASSWORD_RECOVERY") {
        return;
      }

      /*
       * PASSWORD_RECOVERY must provide
       * an authenticated recovery session.
       */
      if (!session?.user?.id) {
        recoverySessionVerified = false;

        setResetAvailable(false);

        showMessage(
          "Your password reset link is invalid or has expired.",
          "error",
        );

        return;
      }

      /*
       * Verify the recovery user against
       * Supabase Auth instead of trusting
       * the event alone.
       */
      verifyRecoverySession()
        .then((verified) => {
          if (!verified) {
            setResetAvailable(false);

            showMessage(
              "Your password reset link is invalid or has expired.",
              "error",
            );

            return;
          }

          setResetAvailable(true);

          showMessage("Choose a new password for your account.", "info");

          newPasswordInput?.focus();
        })
        .catch((error) => {
          console.error("EcoShare recovery verification error:", error);

          recoverySessionVerified = false;

          setResetAvailable(false);

          showMessage(
            "Your password reset link is invalid or has expired.",
            "error",
          );
        });
    });

    authSubscription = data?.subscription || null;

    return authSubscription;
  }

  /* =========================================================
       12. PASSWORD UPDATE
       ========================================================= */

  async function handlePasswordUpdate(event) {
    event.preventDefault();

    if (passwordUpdateInProgress || resetButton?.disabled) {
      return;
    }

    showMessage("");

    const newPassword = newPasswordInput?.value || "";

    const confirmPassword = confirmPasswordInput?.value || "";

    /* -----------------------------------------------------
           Verify recovery session
           ----------------------------------------------------- */

    if (!recoverySessionVerified) {
      const verified = await verifyRecoverySession();

      if (!verified) {
        setResetAvailable(false);

        showMessage(
          "Your password reset link is invalid or has expired.",
          "error",
        );

        return;
      }

      setResetAvailable(true);
    }

    /* -----------------------------------------------------
           Validate password
           ----------------------------------------------------- */

    const passwordError = validatePassword(newPassword);

    if (passwordError) {
      showMessage(passwordError, "error");

      newPasswordInput?.focus();

      return;
    }

    /* -----------------------------------------------------
           Confirm password
           ----------------------------------------------------- */

    if (newPassword !== confirmPassword) {
      showMessage("The passwords do not match.", "error");

      confirmPasswordInput?.focus();

      return;
    }

    /* -----------------------------------------------------
           Supabase client
           ----------------------------------------------------- */

    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    passwordUpdateInProgress = true;

    passwordUpdateSucceeded = false;

    setResetLoading(true);

    try {
      /*
       * Final server-backed verification immediately
       * before changing the password.
       */
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError || !userData?.user?.id) {
        recoverySessionVerified = false;

        showMessage(
          "Your password reset session is invalid or has expired.",
          "error",
        );

        setResetAvailable(false);

        return;
      }

      /*
       * Update password through Supabase Auth.
       */
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        console.error("EcoShare password update failed:", error);

        showMessage(getPasswordUpdateErrorMessage(error), "error");

        return;
      }

      /* -------------------------------------------------
               Success
               ------------------------------------------------- */

      passwordUpdateSucceeded = true;

      showMessage(
        "Your password has been updated successfully. Redirecting to login...",
        "success",
      );

      /*
       * Clear sensitive values immediately.
       */
      clearPasswordFields();

      recoverySessionVerified = false;

      setResetAvailable(false);

      /*
       * End the recovery session.
       *
       * The password has already been updated,
       * so a sign-out failure must not turn a
       * successful password update into an error.
       */
      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        console.warn(
          "EcoShare: Recovery session sign-out failed after successful password update.",
          signOutError,
        );
      }

      /*
       * Redirect to login.
       */
      window.setTimeout(() => {
        window.location.replace(LOGIN_URL);
      }, 1200);
    } catch (error) {
      console.error("EcoShare password update error:", error);

      passwordUpdateSucceeded = false;

      showMessage("Something went wrong. Please try again.", "error");
    } finally {
      passwordUpdateInProgress = false;

      /*
       * Keep the button disabled after
       * successful password update while
       * redirecting to login.
       */
      if (!passwordUpdateSucceeded) {
        setResetLoading(false);

        if (recoverySessionVerified) {
          setResetAvailable(true);
        }
      }
    }
  }

  /* =========================================================
       13. PASSWORD UPDATE ERROR HANDLING
       ========================================================= */

  function getPasswordUpdateErrorMessage(error) {
    const rawMessage = String(error?.message || "").toLowerCase();

    /*
     * Password policy error.
     */
    if (
      rawMessage.includes("password") &&
      (rawMessage.includes("weak") ||
        rawMessage.includes("short") ||
        rawMessage.includes("requirements"))
    ) {
      return "Your password does not meet the security requirements.";
    }

    /*
     * Recovery/session error.
     */
    if (
      rawMessage.includes("session") ||
      rawMessage.includes("auth") ||
      rawMessage.includes("expired") ||
      rawMessage.includes("token")
    ) {
      recoverySessionVerified = false;

      return "Your password reset session is invalid or has expired.";
    }

    /*
     * Network error.
     */
    if (rawMessage.includes("network") || rawMessage.includes("fetch")) {
      return "Unable to connect to the server. Check your internet connection and try again.";
    }

    /*
     * Safe fallback.
     */
    return "Unable to update your password. Please try again.";
  }

  /* =========================================================
       14. CLEAR PASSWORD FIELDS
       ========================================================= */

  function clearPasswordFields() {
    if (newPasswordInput) {
      newPasswordInput.value = "";
    }

    if (confirmPasswordInput) {
      confirmPasswordInput.value = "";
    }

    resetPasswordVisibility();
  }

  /* =========================================================
       15. CLEANUP AUTH LISTENER
       ========================================================= */

  function cleanupAuthListener() {
    if (
      authSubscription &&
      typeof authSubscription.unsubscribe === "function"
    ) {
      authSubscription.unsubscribe();

      authSubscription = null;
    }
  }

  /* =========================================================
       16. INITIALIZE
       ========================================================= */

  async function initializeResetPage() {
    if (!resetForm) {
      console.warn("EcoShare: Reset password form not found.");

      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      setResetAvailable(false);

      return;
    }

    /*
     * Always begin with the submit button disabled.
     *
     * It becomes available only after a valid
     * recovery session has been verified.
     */
    setResetAvailable(false);

    /* -----------------------------------------------------
           Password visibility
           ----------------------------------------------------- */

    setupPasswordToggle(toggleNewPassword, newPasswordInput);

    setupPasswordToggle(toggleConfirmPassword, confirmPasswordInput);

    resetPasswordVisibility();

    /* -----------------------------------------------------
           Form submission
           ----------------------------------------------------- */

    resetForm.addEventListener("submit", handlePasswordUpdate);

    /* -----------------------------------------------------
           Auth state listener
           ----------------------------------------------------- */

    setupAuthListener();

    /* -----------------------------------------------------
           Check existing recovery session
           ----------------------------------------------------- */

    const verified = await verifyRecoverySession();

    if (!verified) {
      clearPasswordFields();

      setResetAvailable(false);

      showMessage(
        "Open the password reset link from your email to continue.",
        "error",
      );

      return;
    }

    /*
     * A valid recovery session already exists.
     */
    setResetAvailable(true);

    showMessage("Choose a new password for your account.", "info");

    newPasswordInput?.focus();
  }

  /* =========================================================
       17. PAGE UNLOAD
       ========================================================= */

  window.addEventListener("pagehide", cleanupAuthListener, {
    once: true,
  });

  /* =========================================================
       18. START
       ========================================================= */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeResetPage, {
      once: true,
    });
  } else {
    initializeResetPage();
  }
})();
