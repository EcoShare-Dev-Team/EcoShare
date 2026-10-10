/* =========================================================
   ECOSHARE — REGISTER PAGE

   register.js

   Responsibilities:
   - Registration form handling
   - Client-side validation
   - Password visibility
   - GPS location detection
   - Reverse geocoding
   - Supabase Auth registration
   - Email verification handling
   - Registration status messages

   Security model:
   - Browser only uses the Supabase publishable key
   - No service-role/secret key
   - No client-controlled role
   - No direct profiles INSERT
   - Profile creation is handled by the database trigger
   - No old RPC dependency
   ========================================================= */

(() => {
  "use strict";

  /* =====================================================
       1. PREVENT DUPLICATE INITIALIZATION
       ===================================================== */

  if (window.ecoShareRegisterInitialized) {
    return;
  }

  window.ecoShareRegisterInitialized = true;

  /* =====================================================
       2. DOM HELPERS
       ===================================================== */

  const $ = (id) => document.getElementById(id);

  const registerForm = $("registerForm");
  const registerMessage = $("registerMessage");

  const nameInput = $("name");
  const genderInput = $("gender");
  const emailInput = $("registerEmail");

  const passwordInput = $("registerPassword");
  const confirmPasswordInput = $("confirmPassword");

  const termsInput = $("terms");

  const togglePasswordBtn = $("toggleRegisterPassword");

  /* ---------- Location ---------- */

  const locationInput = $("registerLocation");
  const locationButton = $("useRegisterLocationBtn");
  const locationButtonText = $("registerLocationButtonText");

  const locationHelp = $("registerLocationHelp");
  const locationError = $("registerLocationError");

  /* ---------- Submit ---------- */

  const submitButton = registerForm?.querySelector('button[type="submit"]');

  /* ---------- Logo ---------- */

  const registerLogo = $("registerLogo");

  /* =====================================================
       3. CONFIGURATION
       ===================================================== */

  const APP_URL = "../index.html";

  /*
   * These values match the password policy configured
   * in the current Supabase project.
   */
  const MIN_PASSWORD_LENGTH = 8;
  const MAX_PASSWORD_LENGTH = 128;

  const MIN_NAME_LENGTH = 2;
  const MAX_NAME_LENGTH = 100;

  const MAX_LOCATION_LENGTH = 150;

  const MIN_LATITUDE = -90;
  const MAX_LATITUDE = 90;

  const MIN_LONGITUDE = -180;
  const MAX_LONGITUDE = 180;

  /*
   * OpenStreetMap Nominatim reverse-geocoding endpoint.
   */
  const GEOCODING_URL = "https://nominatim.openstreetmap.org/reverse";

  /* =====================================================
       4. STATE
       ===================================================== */

  let isRegistering = false;
  let isGettingLocation = false;

  /*
   * Prevents a second submission after successful
   * registration while the page is still visible.
   */
  let registrationCompleted = false;

  /*
   * Coordinates belonging to the currently selected
   * location.
   */
  let userLatitude = null;
  let userLongitude = null;

  /*
   * Invalidates stale GPS/reverse-geocoding requests.
   */
  let locationRequestId = 0;

  /* =====================================================
       5. SUPABASE CLIENT
       ===================================================== */

  function getSupabaseClient() {
    const client = window.supabaseClient;

    if (
      client &&
      typeof client === "object" &&
      client.auth &&
      typeof client.auth.signUp === "function"
    ) {
      return client;
    }

    return null;
  }

  /* =====================================================
       6. LOGO
       ===================================================== */

  function setupLogo() {
    if (!registerLogo) {
      return;
    }

    /*
     * Prefer the centrally configured Supabase-hosted
     * asset when available.
     *
     * The HTML fallback remains untouched if the
     * shared asset configuration is unavailable.
     */
    const logoUrl = window.ECOSHARE_ASSETS?.logo;

    if (typeof logoUrl === "string" && logoUrl.trim()) {
      registerLogo.src = logoUrl.trim();
    }

    registerLogo.addEventListener(
      "error",
      () => {
        /*
         * Avoid repeatedly attempting to replace
         * a failed image source.
         */
        registerLogo.removeAttribute("src");
      },
      {
        once: true,
      },
    );
  }

  /* =====================================================
       7. MESSAGE HANDLING
       ===================================================== */

  function showRegisterMessage(message, type = "error") {
    if (!registerMessage) {
      return;
    }

    const safeType = ["success", "error", "info"].includes(type)
      ? type
      : "error";

    registerMessage.textContent = String(message || "");

    registerMessage.classList.remove("success", "error", "info");

    registerMessage.classList.add(safeType);

    registerMessage.setAttribute(
      "role",
      safeType === "error" ? "alert" : "status",
    );

    registerMessage.setAttribute(
      "aria-live",
      safeType === "error" ? "assertive" : "polite",
    );

    registerMessage.setAttribute("aria-atomic", "true");
  }

  function clearRegisterMessage() {
    if (!registerMessage) {
      return;
    }

    registerMessage.textContent = "";

    registerMessage.classList.remove("success", "error", "info");

    registerMessage.setAttribute("role", "status");

    registerMessage.setAttribute("aria-live", "polite");
  }

  function showLocationError(message) {
    if (!locationError) {
      return;
    }

    locationError.textContent = String(message || "");

    locationError.hidden = !message;
  }

  function clearLocationError() {
    if (!locationError) {
      return;
    }

    locationError.textContent = "";
    locationError.hidden = true;
  }

  /* =====================================================
       8. ACCESSIBILITY VALIDATION STATE
       ===================================================== */

  function setInputInvalid(input, isInvalid) {
    if (!input) {
      return;
    }

    input.setAttribute("aria-invalid", String(Boolean(isInvalid)));
  }

  function clearInputInvalidState() {
    setInputInvalid(nameInput, false);
    setInputInvalid(genderInput, false);
    setInputInvalid(emailInput, false);
    setInputInvalid(passwordInput, false);
    setInputInvalid(confirmPasswordInput, false);
    setInputInvalid(locationInput, false);
    setInputInvalid(termsInput, false);
  }

  function markInvalidAndFocus(input) {
    setInputInvalid(input, true);
    focusInput(input);
  }

  /* =====================================================
       9. SUBMIT BUTTON STATE
       ===================================================== */

  function setSubmitting(isSubmitting) {
    if (!submitButton) {
      return;
    }

    if (isSubmitting) {
      if (!submitButton.dataset.originalText) {
        submitButton.dataset.originalText = submitButton.textContent.trim();
      }

      submitButton.disabled = true;

      submitButton.setAttribute("aria-busy", "true");

      submitButton.textContent = "Creating Account...";

      return;
    }

    /*
     * Never re-enable the submit button after a
     * successful registration.
     */
    if (registrationCompleted) {
      submitButton.disabled = true;

      submitButton.removeAttribute("aria-busy");

      return;
    }

    submitButton.disabled = false;

    submitButton.removeAttribute("aria-busy");

    submitButton.textContent =
      submitButton.dataset.originalText || "Create Account";
  }

  /* =====================================================
       10. PASSWORD VISIBILITY
       ===================================================== */

  function updatePasswordToggleUI(isVisible) {
    if (!togglePasswordBtn) {
      return;
    }

    togglePasswordBtn.setAttribute(
      "aria-label",
      isVisible ? "Hide password" : "Show password",
    );

    togglePasswordBtn.setAttribute("aria-pressed", String(isVisible));

    const icon = togglePasswordBtn.querySelector("i");

    if (!icon) {
      return;
    }

    icon.classList.toggle("fa-eye", !isVisible);

    icon.classList.toggle("fa-eye-slash", isVisible);
  }

  function resetPasswordVisibility() {
    if (passwordInput) {
      passwordInput.type = "password";
    }

    if (confirmPasswordInput) {
      confirmPasswordInput.type = "password";
    }

    updatePasswordToggleUI(false);
  }

  function setupPasswordToggle() {
    if (!passwordInput || !togglePasswordBtn) {
      return;
    }

    togglePasswordBtn.addEventListener("click", () => {
      const shouldShow = passwordInput.type === "password";

      passwordInput.type = shouldShow ? "text" : "password";

      if (confirmPasswordInput) {
        confirmPasswordInput.type = shouldShow ? "text" : "password";
      }

      updatePasswordToggleUI(shouldShow);
    });
  }

  /* =====================================================
       11. LOCATION BUTTON STATE
       ===================================================== */

  function setLocationLoading(isLoading) {
    if (!locationButton) {
      return;
    }

    isGettingLocation = Boolean(isLoading);

    locationButton.disabled = isGettingLocation || isRegistering;

    locationButton.setAttribute("aria-busy", String(isGettingLocation));

    if (locationButtonText) {
      locationButtonText.textContent = isGettingLocation
        ? "Detecting Location..."
        : "Use My Current Location";
    }

    const icon = locationButton.querySelector("i");

    if (icon) {
      icon.classList.toggle("fa-spinner", isGettingLocation);

      icon.classList.toggle("fa-spin", isGettingLocation);

      icon.classList.toggle("fa-location-crosshairs", !isGettingLocation);
    }
  }

  /* =====================================================
       12. LOCATION INPUT HANDLING
       ===================================================== */

  function invalidateLocationCoordinates() {
    /*
     * Invalidate every outstanding GPS/geocoding
     * operation.
     */
    locationRequestId++;

    userLatitude = null;
    userLongitude = null;

    clearLocationError();

    /*
     * Important:
     * If the user starts typing while GPS is still
     * running, immediately release the button.
     *
     * The requestId above makes the old GPS request
     * stale, so its result can no longer overwrite
     * the manual location.
     */
    if (isGettingLocation) {
      setLocationLoading(false);
    }
  }

  function setupLocationInput() {
    if (!locationInput) {
      return;
    }

    locationInput.addEventListener("input", () => {
      invalidateLocationCoordinates();

      setInputInvalid(locationInput, false);

      if (locationHelp) {
        locationHelp.textContent =
          "Location entered manually. " +
          "Use GPS to save coordinates for " +
          "nearby-resource filtering.";
      }
    });
  }

  /* =====================================================
       13. REVERSE GEOCODING
       ===================================================== */

  function isValidCoordinates(latitude, longitude) {
    return (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= MIN_LATITUDE &&
      latitude <= MAX_LATITUDE &&
      longitude >= MIN_LONGITUDE &&
      longitude <= MAX_LONGITUDE
    );
  }

  async function getReadableAddress(latitude, longitude) {
    if (!isValidCoordinates(latitude, longitude)) {
      throw new Error("Invalid GPS coordinates.");
    }

    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(latitude),
      lon: String(longitude),
      zoom: "18",
      addressdetails: "1",
    });

    const response = await fetch(`${GEOCODING_URL}?${params.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Unable to convert GPS coordinates into an address.");
    }

    const data = await response.json();

    if (!data || typeof data !== "object" || !data.address) {
      throw new Error("No readable address was found for your location.");
    }

    const address = data.address;

    const city =
      address.city ||
      address.town ||
      address.village ||
      address.suburb ||
      address.municipality ||
      address.county ||
      "";

    const state = address.state || "";

    const country = address.country || "";

    const parts = [city, state, country]
      .map((part) => String(part).trim())
      .filter(Boolean);

    const uniqueParts = [...new Set(parts)];

    const readableAddress = uniqueParts.join(", ");

    if (!readableAddress) {
      throw new Error("Unable to find a readable city or town.");
    }

    return readableAddress.slice(0, MAX_LOCATION_LENGTH);
  }

  /* =====================================================
       14. GEOLOCATION
       ===================================================== */

  function getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by this browser."));

        return;
      }

      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      });
    });
  }

  function getGeolocationErrorMessage(error) {
    if (error?.code === 1) {
      return (
        "Location permission was denied. " +
        "Allow location access in your browser " +
        "settings or enter your location manually."
      );
    }

    if (error?.code === 2) {
      return (
        "Your current location could not be detected. " +
        "Check that GPS or location services are enabled."
      );
    }

    if (error?.code === 3) {
      return (
        "Location detection timed out. " +
        "Please try again or enter your location manually."
      );
    }

    return "Unable to detect your location. " + "Please try again.";
  }

  /* =====================================================
       15. GET CURRENT LOCATION
       ===================================================== */

  async function handleGetCurrentLocation() {
    if (isGettingLocation || isRegistering || registrationCompleted) {
      return;
    }

    clearLocationError();

    const requestId = ++locationRequestId;

    setLocationLoading(true);

    setInputInvalid(locationInput, false);

    if (locationHelp) {
      locationHelp.textContent =
        "Please allow location access when your browser asks.";
    }

    try {
      const position = await getCurrentPosition();

      /*
       * Ignore stale GPS responses.
       */
      if (requestId !== locationRequestId) {
        return;
      }

      const latitude = Number(position?.coords?.latitude);

      const longitude = Number(position?.coords?.longitude);

      if (!isValidCoordinates(latitude, longitude)) {
        throw new Error("Invalid GPS coordinates received.");
      }

      const readableAddress = await getReadableAddress(latitude, longitude);

      /*
       * Check again after reverse
       * geocoding.
       */
      if (requestId !== locationRequestId) {
        return;
      }

      userLatitude = latitude;
      userLongitude = longitude;

      if (locationInput) {
        locationInput.value = readableAddress;

        setInputInvalid(locationInput, false);
      }

      clearLocationError();

      if (locationHelp) {
        locationHelp.textContent = "Location detected successfully.";
      }
    } catch (error) {
      if (requestId !== locationRequestId) {
        return;
      }

      console.error("EcoShare location detection error:", error);

      userLatitude = null;
      userLongitude = null;

      showLocationError(getGeolocationErrorMessage(error));

      if (locationHelp) {
        locationHelp.textContent = "You can enter your location manually.";
      }
    } finally {
      if (requestId === locationRequestId) {
        setLocationLoading(false);
      }
    }
  }

  function setupLocationButton() {
    if (!locationButton) {
      return;
    }

    locationButton.addEventListener("click", handleGetCurrentLocation);
  }

  /* =====================================================
       16. VALIDATION HELPERS
       ===================================================== */

  function focusInput(input) {
    if (input && typeof input.focus === "function") {
      input.focus();
    }
  }

  function validatePassword(password) {
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      return "Password must be at least 8 characters.";
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      return "Password is too long.";
    }

    if (!/[a-z]/.test(password)) {
      return "Password must contain a lowercase letter.";
    }

    if (!/[A-Z]/.test(password)) {
      return "Password must contain an uppercase letter.";
    }

    if (!/[0-9]/.test(password)) {
      return "Password must contain a number.";
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      return "Password must contain a special character.";
    }

    return null;
  }

  function validateRegistration(values) {
    const {
      name,
      gender,
      email,
      password,
      confirmPassword,
      location,
      termsAccepted,
    } = values;

    clearInputInvalidState();

    /* ---------- Name ---------- */

    if (!name) {
      showRegisterMessage("Please enter your full name.");

      markInvalidAndFocus(nameInput);

      return false;
    }

    if (name.length < MIN_NAME_LENGTH) {
      showRegisterMessage("Name must contain at least 2 characters.");

      markInvalidAndFocus(nameInput);

      return false;
    }

    if (name.length > MAX_NAME_LENGTH) {
      showRegisterMessage("Name cannot exceed 100 characters.");

      markInvalidAndFocus(nameInput);

      return false;
    }

    /* ---------- Gender ---------- */

    const allowedGenders = ["male", "female", "other"];

    if (!allowedGenders.includes(gender)) {
      showRegisterMessage("Please select a valid gender.");

      markInvalidAndFocus(genderInput);

      return false;
    }

    /* ---------- Email ---------- */

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email) {
      showRegisterMessage("Please enter your email address.");

      markInvalidAndFocus(emailInput);

      return false;
    }

    if (email.length > 254 || !emailPattern.test(email)) {
      showRegisterMessage("Please enter a valid email address.");

      markInvalidAndFocus(emailInput);

      return false;
    }

    /* ---------- Password ---------- */

    const passwordError = validatePassword(password);

    if (passwordError) {
      showRegisterMessage(passwordError);

      markInvalidAndFocus(passwordInput);

      return false;
    }

    /* ---------- Confirm Password ---------- */

    if (!confirmPassword) {
      showRegisterMessage("Please confirm your password.");

      markInvalidAndFocus(confirmPasswordInput);

      return false;
    }

    if (password !== confirmPassword) {
      showRegisterMessage("Passwords do not match.");

      markInvalidAndFocus(confirmPasswordInput);

      return false;
    }

    /* ---------- Location ---------- */

    if (!location) {
      showRegisterMessage("Please enter your city or detect your location.");

      markInvalidAndFocus(locationInput);

      return false;
    }

    if (location.length > MAX_LOCATION_LENGTH) {
      showRegisterMessage("Location cannot exceed 150 characters.");

      markInvalidAndFocus(locationInput);

      return false;
    }

    /* ---------- Terms ---------- */

    if (!termsAccepted) {
      showRegisterMessage("Please agree to the Terms & Conditions.");

      markInvalidAndFocus(termsInput);

      return false;
    }

    return true;
  }

  /* =====================================================
       17. SUPABASE ERROR HANDLING
       ===================================================== */

  function getRegistrationErrorMessage(error) {
    const message = String(error?.message || "").toLowerCase();

    /*
     * Do NOT reveal whether an email is already
     * registered.
     *
     * This avoids unnecessary account enumeration.
     */

    if (
      message.includes("rate limit") ||
      message.includes("too many requests")
    ) {
      return (
        "Too many registration attempts. " +
        "Please wait a few minutes and try again."
      );
    }

    if (
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("failed to fetch")
    ) {
      return (
        "Unable to connect to the server. " +
        "Check your internet connection and try again."
      );
    }

    if (
      message.includes("password") &&
      (message.includes("weak") ||
        message.includes("short") ||
        message.includes("characters") ||
        message.includes("requirements"))
    ) {
      return (
        "Your password does not meet the security " +
        "requirements. Please choose a stronger password."
      );
    }

    if (
      message.includes("invalid email") ||
      message.includes("email address")
    ) {
      return "Please enter a valid email address.";
    }

    /*
     * Keep unexpected Auth errors generic.
     * Detailed errors remain in the browser
     * console for development.
     */

    return "Registration failed. Please try again.";
  }

  /* =====================================================
       18. READ FORM VALUES
       ===================================================== */

  function getFormValues() {
    return {
      name: nameInput?.value.trim() || "",

      gender: genderInput?.value || "",

      email: emailInput?.value.trim().toLowerCase() || "",

      password: passwordInput?.value || "",

      confirmPassword: confirmPasswordInput?.value || "",

      location: locationInput?.value.trim() || "",

      termsAccepted: Boolean(termsInput?.checked),
    };
  }

  /* =====================================================
       19. RESET FORM STATE
       ===================================================== */

  function clearSensitiveFields() {
    if (passwordInput) {
      passwordInput.value = "";
    }

    if (confirmPasswordInput) {
      confirmPasswordInput.value = "";
    }

    resetPasswordVisibility();
  }

  function resetRegistrationForm() {
    registerForm?.reset();

    clearSensitiveFields();

    userLatitude = null;
    userLongitude = null;

    locationRequestId++;

    clearLocationError();

    clearInputInvalidState();

    if (locationHelp) {
      locationHelp.textContent = "Enter your location manually or use GPS.";
    }

    setLocationLoading(false);
  }

  /* =====================================================
       20. AUTH REDIRECT URL
       ===================================================== */

  function getEmailRedirectUrl() {
    try {
      return new URL(APP_URL, window.location.href).href;
    } catch (error) {
      console.error("EcoShare: Unable to create auth redirect URL.", error);

      return null;
    }
  }

  /* =====================================================
       21. REGISTRATION SUBMISSION
       ===================================================== */

  async function handleRegistrationSubmit(event) {
    event.preventDefault();

    if (isRegistering || registrationCompleted) {
      return;
    }

    clearRegisterMessage();

    clearInputInvalidState();

    const client = getSupabaseClient();

    if (!client) {
      showRegisterMessage(
        "Supabase is not initialized. " +
          "Please check supabase.js and try again.",
        "error",
      );

      console.error("EcoShare Register: Supabase client not found.");

      return;
    }

    /* ---------- Read values ---------- */

    const values = getFormValues();

    /* ---------- Validate ---------- */

    if (!validateRegistration(values)) {
      return;
    }

    /*
     * Coordinates are only submitted when they belong
     * to the currently selected location.
     */
    const coordinatesValid = isValidCoordinates(userLatitude, userLongitude);

    const safeLatitude = coordinatesValid ? userLatitude : null;

    const safeLongitude = coordinatesValid ? userLongitude : null;

    const emailRedirectTo = getEmailRedirectUrl();

    isRegistering = true;

    setSubmitting(true);

    /*
     * Prevent an active GPS request from modifying
     * registration state while registration is running.
     */
    locationRequestId++;

    setLocationLoading(false);

    showRegisterMessage("Creating your EcoShare account...", "info");

    try {
      /*
       * =================================================
       * CREATE SUPABASE AUTH ACCOUNT
       *
       * IMPORTANT:
       * Public registration never supplies a role.
       *
       * Profile creation is handled by the database
       * trigger in the Supabase project.
       * =================================================
       */

      const signUpOptions = {
        data: {
          full_name: values.name,

          gender: values.gender,

          location: values.location,

          latitude: safeLatitude,

          longitude: safeLongitude,
        },
      };

      /*
       * Only include emailRedirectTo when a valid
       * browser URL could be constructed.
       */
      if (emailRedirectTo) {
        signUpOptions.emailRedirectTo = emailRedirectTo;
      }

      const { data, error } = await client.auth.signUp({
        email: values.email,
        password: values.password,
        options: signUpOptions,
      });

      /* ---------- Supabase error ---------- */

      if (error) {
        console.error("Supabase registration error:", error);

        showRegisterMessage(getRegistrationErrorMessage(error), "error");

        return;
      }

      /* ---------- Missing user ---------- */

      if (!data?.user) {
        showRegisterMessage(
          "Registration could not be completed. " + "Please try again.",
          "error",
        );

        return;
      }

      /*
       * Supabase can return a user with an empty
       * identities array in situations where the
       * signup did not actually create a new identity.
       *
       * Keep the response generic to avoid revealing
       * whether an email already exists.
       */
      if (
        Array.isArray(data.user.identities) &&
        data.user.identities.length === 0
      ) {
        showRegisterMessage(
          "Registration could not be completed. " +
            "Please try again or use another email address.",
          "error",
        );

        return;
      }

      /*
       * =================================================
       * EMAIL VERIFICATION REQUIRED
       * =================================================
       */

      if (!data.session) {
        registrationCompleted = true;

        resetRegistrationForm();

        setSubmitting(false);

        showRegisterMessage(
          "Account created successfully! " +
            "Please check your email and click " +
            "the verification link to activate " +
            "your EcoShare account.",
          "success",
        );

        return;
      }

      /*
       * =================================================
       * REGISTRATION WITH ACTIVE SESSION
       * =================================================
       *
       * This can occur when email confirmation is
       * disabled in a particular Supabase environment.
       *
       * The current project has email confirmation
       * enabled, so this is mainly a defensive fallback.
       * =================================================
       */

      registrationCompleted = true;

      resetRegistrationForm();

      setSubmitting(false);

      showRegisterMessage(
        "Account created successfully! " + "Redirecting to login...",
        "success",
      );

      window.setTimeout(() => {
        window.location.replace(APP_URL);
      }, 1500);
    } catch (error) {
      console.error("EcoShare registration error:", error);

      showRegisterMessage(getRegistrationErrorMessage(error), "error");
    } finally {
      isRegistering = false;

      /*
       * setSubmitting() knows whether registration
       * completed successfully and will keep the
       * button disabled in that case.
       */
      setSubmitting(false);

      /*
       * Restore location button state only when
       * registration has not completed.
       */
      if (!registrationCompleted) {
        setLocationLoading(false);
      }
    }
  }

  /* =====================================================
       22. LIVE FIELD STATE
       ===================================================== */

  function setupFieldState() {
    const fields = [
      nameInput,
      genderInput,
      emailInput,
      passwordInput,
      confirmPasswordInput,
      locationInput,
      termsInput,
    ];

    fields.forEach((field) => {
      if (!field) {
        return;
      }

      const eventName =
        field.type === "checkbox" || field.tagName === "SELECT"
          ? "change"
          : "input";

      field.addEventListener(eventName, () => {
        setInputInvalid(field, false);

        if (field === locationInput) {
          clearLocationError();
        }

        /*
         * Remove the general message once
         * the user starts correcting a field.
         */
        if (registerMessage && registerMessage.classList.contains("error")) {
          clearRegisterMessage();
        }
      });
    });
  }

  /* =====================================================
       23. FORM SETUP
       ===================================================== */

  function setupRegistrationForm() {
    if (!registerForm) {
      console.warn("EcoShare Register: registerForm not found.");

      return;
    }

    registerForm.addEventListener("submit", handleRegistrationSubmit);
  }

  /* =====================================================
       24. TERMS LINK
       ===================================================== */

  function setupTermsLink() {
    const termsLink = $("termsLink");

    if (!termsLink) {
      return;
    }

    termsLink.href = "terms.html";
    termsLink.removeAttribute("aria-disabled");
  }

  /* =====================================================
       25. INITIALIZATION
       ===================================================== */

  function initializeRegisterPage() {
    setupLogo();

    setupPasswordToggle();

    setupLocationInput();

    setupLocationButton();

    setupRegistrationForm();

    setupFieldState();

    setupTermsLink();

    clearLocationError();

    clearInputInvalidState();

    resetPasswordVisibility();

    /*
     * Ensure the initial location button state
     * matches the current registration state.
     */
    setLocationLoading(false);

    /*
     * Make sure the submit button starts in its
     * normal state.
     */
    setSubmitting(false);
  }

  /* =====================================================
       26. START
       ===================================================== */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeRegisterPage, {
      once: true,
    });
  } else {
    initializeRegisterPage();
  }
})();
