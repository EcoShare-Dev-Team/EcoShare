// ==========================================
// EcoShare — Borrow & Pay JavaScript
// File: borrow-request.js
// ==========================================
//
// Responsibilities:
// - Authentication protection
// - Load resource by BIGINT ID
// - Load public owner information
// - Display resource information
// - Display resource image safely
// - Rental duration / pricing UI
// - Validate rental duration
// - Display calculated rental amount
// - Secure borrow request submission through RPC
//
// Shared navbar/authentication UI is handled by:
// ../Phase 1/page.js
//
// IMPORTANT SECURITY PRINCIPLE:
//
// The browser may DISPLAY pricing,
// but it must NEVER be trusted for:
//
// - unit_price
// - total_price
// - borrower_id
// - resource ownership
// - resource availability
//
// The database/RPC must calculate and validate
// all authoritative values server-side.
// ==========================================

"use strict";

(function () {
  // Prevent accidental duplicate initialization if this script
  // is loaded more than once.
  if (window.EcoShareBorrowRequestInitialized) {
    return;
  }

  window.EcoShareBorrowRequestInitialized = true;

  // ==========================================
  // 1. GET ELEMENTS
  // ==========================================

  // Main containers
  const borrowRequestCard = document.getElementById("borrowRequestCard");

  const resourceNotFound = document.getElementById("resourceNotFound");

  // Resource information
  const resourceLink = document.getElementById("resourceLink");

  const resourceImage = document.getElementById("resourceImage");

  const resourceCategory = document.getElementById("resourceCategory");

  const resourceTitle = document.getElementById("resourceTitle");

  const resourceDescription = document.getElementById("resourceDescription");

  const resourceOwner = document.getElementById("resourceOwner");

  const resourceLocation = document.getElementById("resourceLocation");

  const resourceAvailability = document.getElementById("resourceAvailability");

  // Rental / pricing elements
  const resourcePricingSummary = document.getElementById(
    "resourcePricingSummary",
  );

  const hourlyPriceOption = document.getElementById("hourlyPriceOption");

  const dailyPriceOption = document.getElementById("dailyPriceOption");

  const resourceHourlyPrice = document.getElementById("resourceHourlyPrice");

  const resourceDailyPrice = document.getElementById("resourceDailyPrice");

  const rentalType = document.getElementById("rentalType");

  const rentalTypeError = document.getElementById("rentalTypeError");

  const rentalQuantity = document.getElementById("rentalQuantity");

  const rentalQuantityError = document.getElementById("rentalQuantityError");

  const quantityLabel = document.getElementById("quantityLabel");

  const quantityHint = document.getElementById("quantityHint");

  const priceUnitLabel = document.getElementById("priceUnitLabel");

  const selectedUnitPrice = document.getElementById("selectedUnitPrice");

  const selectedQuantity = document.getElementById("selectedQuantity");

  const selectedQuantityUnit = document.getElementById("selectedQuantityUnit");

  const totalPrice = document.getElementById("totalPrice");

  const pricingError = document.getElementById("pricingError");

  // Request form
  const borrowRequestForm = document.getElementById("borrowRequestForm");

  const requestBtn = document.getElementById("requestBtn");

  const formMessage = document.getElementById("formMessage");

  // ==========================================
  // 2. CONFIGURATION
  // ==========================================

  const SUPABASE_PROJECT_ORIGIN = "https://cplbvftcbiwgqkeqmrbq.supabase.co";

  const RESOURCE_TABLE = "resources";

  const PUBLIC_PROFILE_TABLE = "public_profiles";

  const RESOURCE_IMAGE_BUCKET = "resource-images";

  const RESOURCE_IMAGE_PATH_PREFIX = `/storage/v1/object/public/${RESOURCE_IMAGE_BUCKET}/`;

  // Rental limits
  const MIN_RENTAL_QUANTITY = 1;

  const MAX_RENTAL_HOURS = 720;

  const MAX_RENTAL_DAYS = 365;

  const VALID_RENTAL_TYPES = new Set(["hour", "day"]);

  // ==========================================
  // 3. CURRENT STATE
  // ==========================================

  let currentResource = null;

  let currentOwner = null;

  let isSubmittingRequest = false;

  let requestCompleted = false;

  let resourceLoadRequestId = 0;

  let ownerLoadRequestId = 0;

  let redirectingToLogin = false;

  // ==========================================
  // 4. BASIC HELPERS
  // ==========================================

  function getSupabaseClient() {
    if (
      window.supabaseClient &&
      typeof window.supabaseClient.from === "function"
    ) {
      return window.supabaseClient;
    }

    return null;
  }

  function formatCategory(category) {
    if (!category) {
      return "Other";
    }

    const value = String(category).trim();

    if (!value) {
      return "Other";
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function formatCurrency(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
      return "₹0.00";
    }

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(number);
  }

  function normalizePrice(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
      return 0;
    }

    return number;
  }

  function normalizeText(value, fallback = "") {
    if (typeof value !== "string") {
      return fallback;
    }

    const trimmed = value.trim();

    return trimmed || fallback;
  }

  // ==========================================
  // 5. GET RESOURCE ID
  // ==========================================

  function getResourceId() {
    const params = new URLSearchParams(window.location.search);

    const rawId = params.get("id");

    if (!rawId) {
      return null;
    }

    const trimmedId = rawId.trim();

    // Resource IDs are BIGINT.
    //
    // We require a positive decimal integer.
    // We avoid accepting scientific notation,
    // decimals, signs, or other malformed values.

    if (!/^\d+$/.test(trimmedId)) {
      return null;
    }

    // Keep the ID as a string for as long as possible.
    // This avoids unnecessary BIGINT precision loss.
    //
    // Supabase/PostgREST can compare the textual
    // decimal representation against BIGINT safely.

    if (trimmedId === "0" || /^0+$/.test(trimmedId)) {
      return null;
    }

    return trimmedId;
  }

  // ==========================================
  // 6. FORM MESSAGE
  // ==========================================

  function showFormMessage(text, type = "error") {
    if (!formMessage) {
      return;
    }

    const message = typeof text === "string" ? text : "";

    formMessage.textContent = message;

    if (!message) {
      formMessage.className = "form-message";

      formMessage.removeAttribute("role");

      formMessage.removeAttribute("aria-live");

      return;
    }

    const allowedTypes = new Set(["error", "success", "info", "warning"]);

    const safeType = allowedTypes.has(type) ? type : "error";

    formMessage.className = `form-message ${safeType}`;

    formMessage.setAttribute("role", type === "error" ? "alert" : "status");

    formMessage.setAttribute("aria-live", "polite");
  }

  function showRentalError(text) {
    if (!pricingError) {
      return;
    }

    pricingError.textContent = text || "";
  }

  function showRentalTypeError(text) {
    if (!rentalTypeError) {
      return;
    }

    rentalTypeError.textContent = text || "";

    if (rentalTypeError.textContent) {
      rentalTypeError.setAttribute("role", "alert");
    } else {
      rentalTypeError.removeAttribute("role");
    }
  }

  function showRentalQuantityError(text) {
    if (!rentalQuantityError) {
      return;
    }

    rentalQuantityError.textContent = text || "";

    if (rentalQuantityError.textContent) {
      rentalQuantityError.setAttribute("role", "alert");
    } else {
      rentalQuantityError.removeAttribute("role");
    }
  }

  // ==========================================
  // 7. SAFE BUTTON CONTENT
  // ==========================================

  function setButtonContent(button, iconClass, text) {
    if (!button) {
      return;
    }

    button.replaceChildren();

    if (iconClass) {
      const icon = document.createElement("i");

      icon.className = iconClass;

      icon.setAttribute("aria-hidden", "true");

      button.appendChild(icon);
    }

    if (text) {
      button.appendChild(
        document.createTextNode(iconClass ? ` ${text}` : text),
      );
    }
  }

  // ==========================================
  // 8. SAFE RESOURCE IMAGE URL
  // ==========================================

  function getSafeResourceImageUrl(imageUrl) {
    if (!imageUrl || typeof imageUrl !== "string") {
      return null;
    }

    const trimmed = imageUrl.trim();

    if (!trimmed) {
      return null;
    }

    try {
      const url = new URL(trimmed);

      // HTTPS only.
      if (url.protocol !== "https:") {
        return null;
      }

      // Only EcoShare's Supabase project.
      if (url.origin !== SUPABASE_PROJECT_ORIGIN) {
        return null;
      }

      // No credentials.
      if (url.username || url.password) {
        return null;
      }

      // No query parameters or hashes.
      if (url.search || url.hash) {
        return null;
      }

      // Only resource-images bucket.
      if (!url.pathname.startsWith(RESOURCE_IMAGE_PATH_PREFIX)) {
        return null;
      }

      const objectPath = url.pathname.slice(RESOURCE_IMAGE_PATH_PREFIX.length);

      if (!objectPath) {
        return null;
      }

      // Reject suspicious path traversal.
      if (
        objectPath.includes("..") ||
        objectPath.includes("\\") ||
        objectPath.includes("//")
      ) {
        return null;
      }

      let decodedPath;

      try {
        decodedPath = decodeURIComponent(objectPath);
      } catch {
        return null;
      }

      if (
        decodedPath.includes("..") ||
        decodedPath.includes("\\") ||
        decodedPath.includes("//")
      ) {
        return null;
      }

      return url.href;
    } catch {
      console.warn("EcoShare: Invalid resource image URL.");

      return null;
    }
  }

  // ==========================================
  // 9. IMAGE PLACEHOLDER
  // ==========================================

  function removeImagePlaceholder() {
    if (!resourceImage) {
      return;
    }

    const imageContainer = resourceImage.parentElement;

    if (!imageContainer) {
      return;
    }

    const placeholder = imageContainer.querySelector(
      ".resource-image-placeholder",
    );

    if (placeholder) {
      placeholder.remove();
    }
  }

  function showImagePlaceholder() {
    if (!resourceImage) {
      return;
    }

    resourceImage.removeAttribute("src");

    resourceImage.alt = "";

    resourceImage.hidden = true;

    const imageContainer = resourceImage.parentElement;

    if (!imageContainer) {
      return;
    }

    removeImagePlaceholder();

    const placeholder = document.createElement("div");

    placeholder.className = "resource-image-placeholder";

    const icon = document.createElement("i");

    icon.className = "fa-solid fa-image";

    icon.setAttribute("aria-hidden", "true");

    placeholder.appendChild(icon);

    imageContainer.appendChild(placeholder);
  }

  function displayResourceImage(resource) {
    if (!resourceImage) {
      return;
    }

    removeImagePlaceholder();

    resourceImage.onerror = null;

    const safeImageUrl = getSafeResourceImageUrl(resource?.image_url);

    if (!safeImageUrl) {
      showImagePlaceholder();
      return;
    }

    resourceImage.hidden = false;

    resourceImage.src = safeImageUrl;

    resourceImage.alt = normalizeText(resource?.title, "Resource image");

    resourceImage.onerror = () => {
      resourceImage.onerror = null;
      showImagePlaceholder();
    };
  }

  // ==========================================
  // 10. AUTHENTICATED USER
  // ==========================================

  async function getAuthenticatedUser() {
    const client = getSupabaseClient();

    if (!client) {
      console.error("EcoShare: Supabase client is unavailable.");

      return null;
    }

    try {
      const { data, error } = await client.auth.getUser();

      if (error) {
        console.error("EcoShare: Authentication error:", error);

        return null;
      }

      return data?.user || null;
    } catch (error) {
      console.error("EcoShare: Unexpected authentication error:", error);

      return null;
    }
  }

  // ==========================================
  // 11. LOAD RESOURCE
  // ==========================================

  async function loadResource() {
    const client = getSupabaseClient();

    if (!client) {
      showFormMessage(
        "Unable to connect to EcoShare. Please refresh the page.",
        "error",
      );

      return;
    }

    const resourceId = getResourceId();

    if (!resourceId) {
      showResourceNotFound();
      return;
    }

    const requestId = ++resourceLoadRequestId;

    // Reset state for this load.
    currentResource = null;
    currentOwner = null;
    requestCompleted = false;
    isSubmittingRequest = false;

    try {
      const { data: resource, error } = await client
        .from(RESOURCE_TABLE)
        .select(
          `
                    id,
                    owner_id,
                    title,
                    description,
                    category,
                    location,
                    image_url,
                    available,
                    created_at,
                    updated_at,
                    price_per_hour,
                    price_per_day
                    `,
        )
        .eq("id", resourceId)
        .maybeSingle();

      // Ignore stale requests.
      if (requestId !== resourceLoadRequestId) {
        return;
      }

      if (error) {
        console.error("EcoShare: Resource loading error:", error);

        showFormMessage(
          "Unable to load this resource. Please try again.",
          "error",
        );

        showResourceNotFound();

        return;
      }

      if (!resource) {
        showResourceNotFound();
        return;
      }

      currentResource = resource;

      await loadOwnerProfile(resource.owner_id);

      // Ignore stale requests after owner loading.
      if (requestId !== resourceLoadRequestId) {
        return;
      }

      displayResource(resource);
    } catch (error) {
      if (requestId !== resourceLoadRequestId) {
        return;
      }

      console.error("EcoShare: Unexpected resource loading error:", error);

      showFormMessage(
        "Unable to load this resource. Please try again.",
        "error",
      );

      showResourceNotFound();
    }
  }

  // ==========================================
  // 12. LOAD OWNER PROFILE
  // ==========================================

  async function loadOwnerProfile(ownerId) {
    const client = getSupabaseClient();

    const requestId = ++ownerLoadRequestId;

    currentOwner = null;

    if (!client || !ownerId) {
      return;
    }

    try {
      const { data, error } = await client
        .from(PUBLIC_PROFILE_TABLE)
        .select(
          `
                    id,
                    full_name,
                    avatar_url,
                    gender
                    `,
        )
        .eq("id", ownerId)
        .maybeSingle();

      if (requestId !== ownerLoadRequestId) {
        return;
      }

      if (error) {
        console.warn("EcoShare: Unable to load owner profile:", error);

        return;
      }

      currentOwner = data || null;
    } catch (error) {
      if (requestId !== ownerLoadRequestId) {
        return;
      }

      console.warn("EcoShare: Unexpected owner profile error:", error);
    }
  }

  // ==========================================
  // 13. DISPLAY RESOURCE
  // ==========================================

  function displayResource(resource) {
    if (!resource) {
      showResourceNotFound();
      return;
    }

    if (borrowRequestCard) {
      borrowRequestCard.hidden = false;
    }

    if (resourceNotFound) {
      resourceNotFound.hidden = true;
    }

    const safeTitle = normalizeText(resource.title, "Resource");

    document.title = `Borrow ${safeTitle} | EcoShare`;

    // Resource link
    if (resourceLink) {
      resourceLink.textContent = safeTitle;

      resourceLink.href = `resource-details.html?id=${encodeURIComponent(
        String(resource.id),
      )}`;
    }

    // Category
    if (resourceCategory) {
      resourceCategory.textContent = formatCategory(resource.category);
    }

    // Title
    if (resourceTitle) {
      resourceTitle.textContent = normalizeText(
        resource.title,
        "Untitled Resource",
      );
    }

    // Description
    if (resourceDescription) {
      resourceDescription.textContent = normalizeText(
        resource.description,
        "No description available.",
      );
    }

    // Owner
    if (resourceOwner) {
      resourceOwner.textContent = normalizeText(
        currentOwner?.full_name,
        "EcoShare User",
      );
    }

    // Location
    if (resourceLocation) {
      resourceLocation.textContent = normalizeText(
        resource.location,
        "Not specified",
      );
    }

    // Availability
    if (resourceAvailability) {
      resourceAvailability.classList.remove("unavailable");

      if (resource.available === true) {
        resourceAvailability.textContent = "Available";
      } else {
        resourceAvailability.textContent = "Currently Borrowed";

        resourceAvailability.classList.add("unavailable");
      }
    }

    // Image
    displayResourceImage(resource);

    // Pricing
    setupPricing(resource);

    // Request form
    setupRequestForm(resource);
  }

  // ==========================================
  // 14. GET RESOURCE PRICE
  // ==========================================

  function getResourcePrice(type) {
    if (!currentResource) {
      return 0;
    }

    if (type === "day") {
      return normalizePrice(currentResource.price_per_day);
    }

    if (type === "hour") {
      return normalizePrice(currentResource.price_per_hour);
    }

    return 0;
  }

  // ==========================================
  // 15. GET SELECTED RENTAL TYPE
  // ==========================================

  function getSelectedRentalType() {
    if (!rentalType) {
      return "hour";
    }

    const value = rentalType.value;

    return VALID_RENTAL_TYPES.has(value) ? value : "";
  }

  // ==========================================
  // 16. GET SELECTED RENTAL QUANTITY
  // ==========================================

  function getSelectedRentalQuantity() {
    if (!rentalQuantity) {
      return 1;
    }

    const quantity = Number(rentalQuantity.value);

    if (!Number.isInteger(quantity) || quantity < MIN_RENTAL_QUANTITY) {
      return 1;
    }

    return quantity;
  }

  // ==========================================
  // 17. UPDATE PRICING UI
  // ==========================================

  function updatePricingUI() {
    if (!currentResource) {
      return;
    }

    const type = getSelectedRentalType();

    const quantity = getSelectedRentalQuantity();

    if (!VALID_RENTAL_TYPES.has(type)) {
      showRentalError("Please select a valid rental option.");

      return;
    }

    const unitPrice = getResourcePrice(type);

    const total = unitPrice * quantity;

    const isDay = type === "day";

    const unitSingular = isDay ? "day" : "hour";

    const unitPlural = isDay ? "days" : "hours";

    // Quantity label
    if (quantityLabel) {
      quantityLabel.textContent = quantity === 1 ? unitSingular : unitPlural;
    }

    // Quantity hint
    if (quantityHint) {
      quantityHint.textContent = isDay
        ? "Enter the number of days you need."
        : "Enter the number of hours you need.";
    }

    // Price unit
    if (priceUnitLabel) {
      priceUnitLabel.textContent = unitSingular;
    }

    // Selected unit price
    if (selectedUnitPrice) {
      selectedUnitPrice.textContent = formatCurrency(unitPrice);
    }

    // Selected quantity
    if (selectedQuantity) {
      selectedQuantity.textContent = String(quantity);
    }

    // Selected quantity unit
    if (selectedQuantityUnit) {
      selectedQuantityUnit.textContent =
        quantity === 1 ? unitSingular : unitPlural;
    }

    // Total
    if (totalPrice) {
      totalPrice.textContent = formatCurrency(total);
    }

    // Pricing availability
    if (unitPrice <= 0) {
      showRentalError(
        `No ${unitSingular} rental price has been set for this resource.`,
      );
    } else {
      showRentalError("");
    }
  }

  // ==========================================
  // 18. SETUP PRICING
  // ==========================================

  function setupPricing(resource) {
    if (!resource) {
      return;
    }

    const hourlyPrice = normalizePrice(resource.price_per_hour);

    const dailyPrice = normalizePrice(resource.price_per_day);

    // Hourly price
    if (resourceHourlyPrice) {
      resourceHourlyPrice.textContent =
        hourlyPrice > 0 ? `${formatCurrency(hourlyPrice)}/hour` : "Not set";
    }

    // Daily price
    if (resourceDailyPrice) {
      resourceDailyPrice.textContent =
        dailyPrice > 0 ? `${formatCurrency(dailyPrice)}/day` : "Not set";
    }

    // Hide unavailable options
    if (hourlyPriceOption) {
      hourlyPriceOption.hidden = hourlyPrice <= 0;
    }

    if (dailyPriceOption) {
      dailyPriceOption.hidden = dailyPrice <= 0;
    }

    // Hide pricing summary only when
    // neither option exists.
    if (resourcePricingSummary) {
      resourcePricingSummary.hidden = hourlyPrice <= 0 && dailyPrice <= 0;
    }

    // Select a valid default option.
    if (rentalType) {
      const currentType = rentalType.value;

      if (currentType === "hour" && hourlyPrice <= 0 && dailyPrice > 0) {
        rentalType.value = "day";
      }

      if (currentType === "day" && dailyPrice <= 0 && hourlyPrice > 0) {
        rentalType.value = "hour";
      }

      if (!VALID_RENTAL_TYPES.has(rentalType.value)) {
        if (hourlyPrice > 0) {
          rentalType.value = "hour";
        } else if (dailyPrice > 0) {
          rentalType.value = "day";
        }
      }
    }

    updatePricingUI();
  }

  // ==========================================
  // 19. VALIDATE RENTAL
  // ==========================================

  function validateRental() {
    showRentalError("");
    showRentalTypeError("");
    showRentalQuantityError("");

    if (!currentResource) {
      showRentalError("Resource information is unavailable.");

      return false;
    }

    if (!rentalType) {
      return true;
    }

    // Rental type
    const type = getSelectedRentalType();

    if (!VALID_RENTAL_TYPES.has(type)) {
      showRentalTypeError("Please select a valid rental option.");

      rentalType.focus();

      return false;
    }

    // Rental quantity
    const quantity = rentalQuantity ? Number(rentalQuantity.value) : 1;

    const maximum = type === "day" ? MAX_RENTAL_DAYS : MAX_RENTAL_HOURS;

    if (
      !Number.isFinite(quantity) ||
      !Number.isInteger(quantity) ||
      quantity < MIN_RENTAL_QUANTITY
    ) {
      showRentalQuantityError("Please enter a valid duration.");

      rentalQuantity?.focus();

      return false;
    }

    if (quantity > maximum) {
      showRentalQuantityError(
        type === "day"
          ? `Maximum rental duration is ${MAX_RENTAL_DAYS} days.`
          : `Maximum rental duration is ${MAX_RENTAL_HOURS} hours.`,
      );

      rentalQuantity?.focus();

      return false;
    }

    // Price
    const unitPrice = getResourcePrice(type);

    if (unitPrice <= 0) {
      showRentalError(
        type === "day"
          ? "Daily rental is not available for this resource."
          : "Hourly rental is not available for this resource.",
      );

      return false;
    }

    showRentalError("");

    return true;
  }

  // ==========================================
  // 20. SETUP REQUEST FORM
  // ==========================================

  async function setupRequestForm(resource) {
    if (!borrowRequestForm) {
      return;
    }

    borrowRequestForm.reset();

    isSubmittingRequest = false;

    requestCompleted = false;

    showRentalError("");
    showRentalTypeError("");
    showRentalQuantityError("");
    showFormMessage("");

    // Default rental type
    if (rentalType) {
      rentalType.value = "hour";
    }

    // Default quantity
    if (rentalQuantity) {
      rentalQuantity.value = "1";
    }

    updatePricingUI();

    // Resource unavailable
    if (!resource || resource.available !== true) {
      disableRequestForm("Currently Unavailable", true);

      return;
    }

    // Authentication
    const user = await getAuthenticatedUser();

    if (!user) {
      disableRequestForm("Login to Borrow", false);

      return;
    }

    enableRequestForm();
  }

  // ==========================================
  // 21. DISABLE REQUEST FORM
  // ==========================================

  function disableRequestForm(buttonText, disableButton = true) {
    if (rentalType) {
      rentalType.disabled = true;
    }

    if (rentalQuantity) {
      rentalQuantity.disabled = true;
    }

    if (requestBtn) {
      requestBtn.disabled = disableButton;

      setButtonContent(
        requestBtn,
        disableButton ? "fa-solid fa-ban" : "fa-solid fa-right-to-bracket",
        buttonText,
      );
    }
  }

  // ==========================================
  // 22. ENABLE REQUEST FORM
  // ==========================================

  function enableRequestForm() {
    if (rentalType) {
      rentalType.disabled = false;
    }

    if (rentalQuantity) {
      rentalQuantity.disabled = false;
    }

    if (requestBtn) {
      requestBtn.disabled = false;

      setButtonContent(requestBtn, "fa-solid fa-credit-card", "Pay & Borrow");
    }
  }

  // ==========================================
  // 23. HANDLE REQUEST SUBMISSION
  // ==========================================

  async function handleRequestSubmission() {
    // Prevent duplicate submissions.
    if (isSubmittingRequest || requestCompleted) {
      return;
    }

    // Resource
    if (!currentResource) {
      showFormMessage("Resource information is unavailable.", "error");

      return;
    }

    // Authentication
    const user = await getAuthenticatedUser();

    if (!user) {
      redirectToLogin();
      return;
    }

    // Defensive availability check.
    // The database/RPC checks again.
    if (currentResource.available !== true) {
      showFormMessage("This resource is currently unavailable.", "error");

      disableRequestForm("Currently Unavailable", true);

      return;
    }

    // Validate rental.
    if (!validateRental()) {
      return;
    }

    const rentalTypeValue = getSelectedRentalType();

    const rentalQuantityValue = rentalQuantity
      ? Number(rentalQuantity.value)
      : 1;

    // Final validation.
    if (!VALID_RENTAL_TYPES.has(rentalTypeValue)) {
      showFormMessage("Please select a valid rental option.", "error");

      return;
    }

    const maximum =
      rentalTypeValue === "day" ? MAX_RENTAL_DAYS : MAX_RENTAL_HOURS;

    if (
      !Number.isInteger(rentalQuantityValue) ||
      rentalQuantityValue < MIN_RENTAL_QUANTITY ||
      rentalQuantityValue > maximum
    ) {
      showFormMessage("Please enter a valid rental duration.", "error");

      return;
    }

    // Client-side calculation is ONLY
    // for displaying the amount.
    const displayedUnitPrice = getResourcePrice(rentalTypeValue);

    const displayedTotal = displayedUnitPrice * rentalQuantityValue;

    if (!Number.isFinite(displayedTotal) || displayedTotal < 0) {
      showFormMessage("Unable to calculate the rental amount.", "error");

      return;
    }

    // Lock form.
    isSubmittingRequest = true;

    if (requestBtn) {
      requestBtn.disabled = true;

      requestBtn.setAttribute("aria-busy", "true");

      setButtonContent(
        requestBtn,
        "fa-solid fa-spinner fa-spin",
        "Processing...",
      );
    }

    try {
      const client = getSupabaseClient();

      if (!client) {
        throw new Error("Supabase client unavailable");
      }

      // ==========================================
      // SECURE RPC SUBMISSION
      // ==========================================
      //
      // IMPORTANT:
      //
      // Do NOT send:
      // - unit_price
      // - total_price
      // - borrower_id
      //
      // Only user-controlled rental values are sent.
      //
      // The database/RPC must:
      // - authenticate the caller
      // - determine borrower_id
      // - verify resource ownership
      // - verify availability
      // - verify rental type
      // - verify quantity
      // - calculate authoritative price
      // - create the request
      // ==========================================

      const { data: requestId, error } = await client.rpc(
        "create_borrow_request",
        {
          p_resource_id: currentResource.id,

          p_rental_type: rentalTypeValue,

          p_rental_quantity: rentalQuantityValue,
        },
      );

      if (error) {
        console.error("EcoShare: Borrow & Pay error:", error);

        handleRequestError(error);

        return;
      }

      console.log("EcoShare: Borrow request created:", requestId);

      requestCompleted = true;

      showFormMessage(
        "Your borrow request has been created successfully.",
        "success",
      );

      // Disable controls after success.
      if (rentalType) {
        rentalType.disabled = true;
      }

      if (rentalQuantity) {
        rentalQuantity.disabled = true;
      }

      if (requestBtn) {
        requestBtn.disabled = true;

        requestBtn.setAttribute("aria-busy", "false");

        setButtonContent(requestBtn, "fa-solid fa-check", "Request Created");
      }

      // Navigate back to resource details.
      window.setTimeout(() => {
        if (window.history.length > 1) {
          window.history.back();
          return;
        }

        window.location.href = `resource-details.html?id=${encodeURIComponent(
          String(currentResource.id),
        )}`;
      }, 1200);
    } catch (error) {
      console.error("EcoShare: Unexpected borrow request error:", error);

      showFormMessage(
        "Unable to process your request right now. Please try again.",
        "error",
      );

      resetRequestButton();
    } finally {
      if (!requestCompleted) {
        isSubmittingRequest = false;
      }
    }
  }

  // ==========================================
  // 24. HANDLE REQUEST ERROR
  // ==========================================

  function handleRequestError(error) {
    const errorMessage = String(
      error?.message || error?.details || error?.hint || "",
    ).toLowerCase();

    // Duplicate request
    if (
      errorMessage.includes("already submitted") ||
      errorMessage.includes("duplicate") ||
      errorMessage.includes("already exists") ||
      errorMessage.includes("unique constraint")
    ) {
      showFormMessage(
        "You have already submitted a request for this resource.",
        "error",
      );

      resetRequestButton();

      return;
    }

    // Resource unavailable
    if (
      errorMessage.includes("cannot be requested") ||
      errorMessage.includes("unavailable") ||
      errorMessage.includes("not available")
    ) {
      showFormMessage(
        "This resource is no longer available for borrowing.",
        "error",
      );

      if (resourceAvailability) {
        resourceAvailability.textContent = "Currently Borrowed";

        resourceAvailability.classList.add("unavailable");
      }

      disableRequestForm("Currently Unavailable", true);

      return;
    }

    // Authentication
    if (
      errorMessage.includes("authentication required") ||
      errorMessage.includes("not authenticated") ||
      errorMessage.includes("auth.uid") ||
      errorMessage.includes("jwt")
    ) {
      showFormMessage("Please log in before continuing.", "error");

      resetRequestButton();

      return;
    }

    // Owner cannot borrow own resource
    if (
      errorMessage.includes("own resource") ||
      errorMessage.includes("resource owner") ||
      errorMessage.includes("cannot borrow your own")
    ) {
      showFormMessage("You cannot borrow your own resource.", "error");

      resetRequestButton();

      return;
    }

    // Rental type
    if (
      errorMessage.includes("rental type") ||
      errorMessage.includes("invalid rental")
    ) {
      showRentalTypeError("The selected rental option is invalid.");

      showFormMessage("Please select a valid rental option.", "error");

      resetRequestButton();

      return;
    }

    // Rental quantity
    if (
      errorMessage.includes("rental quantity") ||
      errorMessage.includes("duration") ||
      errorMessage.includes("quantity")
    ) {
      showRentalQuantityError("Please enter a valid rental duration.");

      showFormMessage("Please enter a valid rental duration.", "error");

      resetRequestButton();

      return;
    }

    // Price unavailable
    if (errorMessage.includes("price")) {
      showRentalError("Rental pricing is currently unavailable.");

      showFormMessage(
        "Rental pricing is currently unavailable for this resource.",
        "error",
      );

      resetRequestButton();

      return;
    }

    // Approved / moderation issue
    if (
      errorMessage.includes("approved") ||
      errorMessage.includes("moderation")
    ) {
      showFormMessage(
        "This resource is not currently available for borrowing.",
        "error",
      );

      resetRequestButton();

      return;
    }

    // Generic error.
    showFormMessage(
      "Unable to process your request right now. Please try again.",
      "error",
    );

    resetRequestButton();
  }

  // ==========================================
  // 25. RESET REQUEST BUTTON
  // ==========================================

  function resetRequestButton() {
    if (!requestBtn) {
      return;
    }

    if (requestCompleted) {
      return;
    }

    requestBtn.disabled = false;

    requestBtn.setAttribute("aria-busy", "false");

    setButtonContent(requestBtn, "fa-solid fa-credit-card", "Pay & Borrow");

    isSubmittingRequest = false;
  }

  // ==========================================
  // 26. LOGIN REDIRECT
  // ==========================================

  function redirectToLogin() {
    if (redirectingToLogin) {
      return;
    }

    redirectingToLogin = true;

    const resourceId = currentResource?.id || getResourceId();

    const returnUrl = resourceId
      ? `../Phase 2/borrow-request.html?id=${encodeURIComponent(
          String(resourceId),
        )}`
      : "../Phase 2/borrow-request.html";

    window.location.href = `../Phase 1/login.html?redirect=${encodeURIComponent(
      returnUrl,
    )}`;
  }

  // ==========================================
  // 27. FORM SUBMISSION
  // ==========================================

  if (borrowRequestForm) {
    borrowRequestForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      await handleRequestSubmission();
    });
  }

  // ==========================================
  // 28. RENTAL TYPE CHANGE
  // ==========================================

  if (rentalType) {
    rentalType.addEventListener("change", () => {
      if (isSubmittingRequest || requestCompleted) {
        return;
      }

      showRentalTypeError("");
      showRentalQuantityError("");
      showRentalError("");
      showFormMessage("");

      if (rentalQuantity) {
        rentalQuantity.value = "1";
      }

      updatePricingUI();
    });
  }

  // ==========================================
  // 29. RENTAL QUANTITY CHANGE
  // ==========================================

  if (rentalQuantity) {
    rentalQuantity.addEventListener("input", () => {
      if (isSubmittingRequest || requestCompleted) {
        return;
      }

      showRentalQuantityError("");
      showRentalError("");
      showFormMessage("");

      updatePricingUI();
    });

    rentalQuantity.addEventListener("blur", () => {
      if (isSubmittingRequest || requestCompleted) {
        return;
      }

      validateRental();
      updatePricingUI();
    });
  }

  // ==========================================
  // 30. RESOURCE NOT FOUND
  // ==========================================

  function showResourceNotFound() {
    currentResource = null;
    currentOwner = null;

    if (borrowRequestCard) {
      borrowRequestCard.hidden = true;
    }

    if (resourceNotFound) {
      resourceNotFound.hidden = false;
    }

    document.title = "Resource Not Found | EcoShare";
  }

  // ==========================================
  // 31. INITIALIZE
  // ==========================================

  async function initialize() {
    /*
     * page.js is responsible for:
     *
     * - shared navbar
     * - avatar
     * - profile dropdown
     * - logout
     * - mobile navigation
     * - notification badge
     *
     * This file intentionally does not
     * duplicate those systems.
     */

    const client = getSupabaseClient();

    if (!client) {
      console.error("EcoShare: supabaseClient is unavailable.");

      showFormMessage(
        "Unable to connect to EcoShare. Please refresh the page.",
        "error",
      );

      return;
    }

    // Authentication protection.
    const user = await getAuthenticatedUser();

    if (!user) {
      redirectToLogin();
      return;
    }

    // Load resource.
    await loadResource();
  }

  // ==========================================
  // 32. DOM READY
  // ==========================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, {
      once: true,
    });
  } else {
    initialize();
  }

  // ==========================================
  // 33. PUBLIC API
  // ==========================================

  window.EcoShareBorrowRequest = {
    getCurrentResource() {
      return currentResource;
    },

    getCurrentOwner() {
      return currentOwner;
    },

    getResourceId,

    getResourcePrice,

    getSelectedRentalType,

    getSelectedRentalQuantity,

    updatePricingUI,

    validateRental,

    reload: loadResource,
  };
})();
