/*
=========================================================
  EcoShare — My Listings

  Secure listing loading, rendering and deletion.

  SECURITY MODEL
  -------------------------------------------------------
  1. Listing loading uses get_my_listings().
  2. The database function must use auth.uid().
  3. Listing deletion uses delete_my_resource().
  4. owner_id is NEVER supplied by the browser.
  5. Storage cleanup is best-effort after DB deletion.
  6. User/database text is rendered with textContent.
=========================================================
*/

(() => {
  "use strict";

  /* =====================================================
       DOM ELEMENTS
       ===================================================== */

  const listingsGrid = document.getElementById("listingsGrid");

  const loadingState = document.getElementById("loadingState");

  const emptyState = document.getElementById("emptyState");

  const pageMessage = document.getElementById("pageMessage");

  const authNavButton = document.getElementById("authNavButton");

  /* =====================================================
       CONSTANTS
       ===================================================== */

  const LOGIN_URL = "../Phase 1/login.html";

  const MY_LISTINGS_URL = "../Phase 2/my-listings.html";

  const RESOURCE_DETAILS_URL = "../Phase 2/resource-details.html";

  const PROFILE_URL = "../Phase 1/profile.html";

  const STORAGE_BUCKET = "resource-images";

  const SUPABASE_ORIGIN =
    window.ECOSHARE_SUPABASE_URL || "https://cplbvftcbiwgqkeqmrbq.supabase.co";

  const DEFAULT_IMAGE =
    window.ECOSHARE_ASSETS?.logo ||
    `${SUPABASE_ORIGIN}/storage/v1/object/public/site-assets/logo.png`;

  const STORAGE_PUBLIC_PREFIX = `/storage/v1/object/public/${STORAGE_BUCKET}/`;

  /* =====================================================
       STATE
       ===================================================== */

  let isDeleting = false;
  let authListenerRegistered = false;
  let loadRequestId = 0;
  let destroyed = false;

  /* =====================================================
       SUPABASE CLIENT
       ===================================================== */

  function getSupabaseClient() {
    const client = window.supabaseClient;

    if (!client || !client.auth || !client.rpc || !client.storage) {
      throw new Error("Supabase is not initialized. Please check supabase.js.");
    }

    return client;
  }

  /* =====================================================
       BASIC HELPERS
       ===================================================== */

  function getSafeText(value, fallback = "") {
    if (value === null || value === undefined) {
      return fallback;
    }

    const text = String(value).trim();

    return text || fallback;
  }

  function isValidResourceId(value) {
    return /^\d+$/.test(String(value));
  }

  function formatCategory(category) {
    const value = getSafeText(category, "Other");

    return value
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  function formatDate(dateString) {
    if (!dateString) {
      return "Unknown date";
    }

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return "Unknown date";
    }

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  /* =====================================================
       PRICE HELPERS
       ===================================================== */

  function hasValidPrice(value) {
    if (value === null || value === undefined || value === "") {
      return false;
    }

    const number = Number(value);

    return Number.isFinite(number) && number >= 0;
  }

  function formatPrice(value) {
    if (!hasValidPrice(value)) {
      return "Not specified";
    }

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number(value));
  }

  function firstDefinedValue(object, keys) {
    if (!object || typeof object !== "object") {
      return null;
    }

    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        const value = object[key];

        if (value !== null && value !== undefined && value !== "") {
          return value;
        }
      }
    }

    return null;
  }

  function getHourlyPrice(resource) {
    return firstDefinedValue(resource, [
      "price_per_hour",
      "hourly_price",
      "rent_per_hour",
      "price_hour",
    ]);
  }

  function getDailyPrice(resource) {
    return firstDefinedValue(resource, [
      "price_per_day",
      "daily_price",
      "rent_per_day",
      "price_day",
    ]);
  }

  function getBuyPrice(resource) {
    return firstDefinedValue(resource, [
      "buy_price",
      "purchase_price",
      "sale_price",
      "price",
    ]);
  }

  /* =====================================================
       PAGE MESSAGE
       ===================================================== */

  function showMessage(message, type = "error") {
    if (!pageMessage) {
      return;
    }

    const safeType = ["success", "error", "info"].includes(type)
      ? type
      : "error";

    pageMessage.textContent = getSafeText(message, "Something went wrong.");

    pageMessage.className = `page-message ${safeType}`;

    pageMessage.hidden = false;
  }

  function hideMessage() {
    if (!pageMessage) {
      return;
    }

    pageMessage.textContent = "";
    pageMessage.className = "page-message";
    pageMessage.hidden = true;
  }

  /* =====================================================
       LOADING STATE
       ===================================================== */

  function setLoadingState(isLoading) {
    if (loadingState) {
      loadingState.hidden = !isLoading;

      loadingState.setAttribute("aria-busy", String(isLoading));
    }

    if (isLoading) {
      if (emptyState) {
        emptyState.hidden = true;
      }

      if (listingsGrid) {
        listingsGrid.hidden = true;
      }
    }
  }

  /* =====================================================
       AUTHENTICATION
       ===================================================== */

  async function getAuthenticatedUser() {
    try {
      const supabase = getSupabaseClient();

      const { data, error } = await supabase.auth.getUser();

      if (error) {
        console.error("Authentication error:", error);

        return null;
      }

      return data?.user || null;
    } catch (error) {
      console.error("Authentication request failed:", error);

      return null;
    }
  }

  function redirectToLogin() {
    const redirectUrl = `${LOGIN_URL}?redirect=${encodeURIComponent(
      MY_LISTINGS_URL,
    )}`;

    window.location.href = redirectUrl;
  }

  /* =====================================================
       AUTH NAVIGATION
       ===================================================== */

  function setAuthButtonContent(isLoggedIn) {
    if (!authNavButton) {
      return;
    }

    authNavButton.replaceChildren();

    const icon = document.createElement("i");

    icon.className = isLoggedIn
      ? "fa-solid fa-user"
      : "fa-solid fa-right-to-bracket";

    icon.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");

    text.textContent = isLoggedIn ? "Profile" : "Login";

    authNavButton.appendChild(icon);
    authNavButton.appendChild(text);
  }

  async function updateAuthNavigation() {
    if (!authNavButton) {
      return;
    }

    try {
      const supabase = getSupabaseClient();

      const { data } = await supabase.auth.getSession();

      const session = data?.session;

      if (session) {
        setAuthButtonContent(true);

        authNavButton.href = PROFILE_URL;

        authNavButton.classList.add("profile-button");

        return;
      }

      setAuthButtonContent(false);

      authNavButton.href = `${LOGIN_URL}?redirect=${encodeURIComponent(
        MY_LISTINGS_URL,
      )}`;

      authNavButton.classList.remove("profile-button");
    } catch (error) {
      console.error("Auth navigation error:", error);

      setAuthButtonContent(false);

      authNavButton.href = `${LOGIN_URL}?redirect=${encodeURIComponent(
        MY_LISTINGS_URL,
      )}`;

      authNavButton.classList.remove("profile-button");
    }
  }

  /* =====================================================
       LOAD MY LISTINGS
       ===================================================== */

  async function loadMyListings() {
    if (!listingsGrid || !loadingState || !emptyState) {
      console.error("My Listings: required DOM elements are missing.");

      return;
    }

    const currentRequest = ++loadRequestId;

    setLoadingState(true);
    hideMessage();

    const user = await getAuthenticatedUser();

    if (currentRequest !== loadRequestId) {
      return;
    }

    if (!user) {
      setLoadingState(false);
      redirectToLogin();
      return;
    }

    try {
      const supabase = getSupabaseClient();

      /*
       * SECURITY:
       *
       * Do NOT query public.resources directly.
       *
       * The RPC determines the current user
       * using auth.uid() on the server.
       */

      const { data, error } = await supabase.rpc("get_my_listings");

      if (currentRequest !== loadRequestId) {
        return;
      }

      if (error) {
        console.error("Failed to load listings:", error);

        setLoadingState(false);

        showMessage(getSafeListingErrorMessage(error), "error");

        return;
      }

      const resources = Array.isArray(data)
        ? data.filter((resource) => resource && isValidResourceId(resource.id))
        : [];

      setLoadingState(false);

      if (resources.length === 0) {
        listingsGrid.replaceChildren();
        listingsGrid.hidden = true;
        emptyState.hidden = false;

        return;
      }

      emptyState.hidden = true;

      renderListings(resources);

      listingsGrid.hidden = false;
    } catch (error) {
      if (currentRequest !== loadRequestId) {
        return;
      }

      console.error("Listing load error:", error);

      setLoadingState(false);

      showMessage("Unable to load your listings. Please try again.", "error");
    }
  }

  /* =====================================================
       RENDER LISTINGS
       ===================================================== */

  function renderListings(resources) {
    if (!listingsGrid) {
      return;
    }

    listingsGrid.replaceChildren();

    const fragment = document.createDocumentFragment();

    resources.forEach((resource) => {
      if (!resource || !isValidResourceId(resource.id)) {
        return;
      }

      fragment.appendChild(createListingCard(resource));
    });

    listingsGrid.appendChild(fragment);
  }

  /* =====================================================
       CREATE LISTING CARD
       ===================================================== */

  function createListingCard(resource) {
    const article = document.createElement("article");

    article.className = "listing-card";

    article.dataset.resourceId = String(resource.id);

    /* IMAGE */

    const imageContainer = document.createElement("div");

    imageContainer.className = "listing-image";

    const image = document.createElement("img");

    const title = getSafeText(resource.title, "Untitled resource");

    image.alt = `${title} image`;

    image.loading = "lazy";
    image.decoding = "async";

    image.src = isSafeImageUrl(resource.image_url)
      ? resource.image_url
      : DEFAULT_IMAGE;

    image.addEventListener(
      "error",
      () => {
        if (image.src.endsWith(DEFAULT_IMAGE)) {
          return;
        }

        image.src = DEFAULT_IMAGE;
      },
      {
        once: true,
      },
    );

    imageContainer.appendChild(image);

    /* CONTENT */

    const content = document.createElement("div");

    content.className = "listing-content";

    /* CATEGORY */

    const category = document.createElement("div");

    category.className = "listing-category";

    category.textContent = formatCategory(resource.category);

    /* TITLE */

    const titleElement = document.createElement("h2");

    titleElement.className = "listing-title";

    titleElement.textContent = title;

    /* DESCRIPTION */

    const description = document.createElement("p");

    description.className = "listing-description";

    description.textContent = getSafeText(
      resource.description,
      "No description provided.",
    );

    /* META */

    const meta = createMetaSection(resource);

    /* STATUS */

    const statusRow = createStatusSection(resource);

    /* PRICING */

    const pricing = createPricingSection(resource);

    /* ACTIONS */

    const actions = createActionSection(resource);

    content.appendChild(category);
    content.appendChild(titleElement);
    content.appendChild(description);
    content.appendChild(meta);
    content.appendChild(statusRow);
    content.appendChild(pricing);
    content.appendChild(actions);

    article.appendChild(imageContainer);
    article.appendChild(content);

    return article;
  }

  /* =====================================================
       META SECTION
       ===================================================== */

  function createMetaSection(resource) {
    const meta = document.createElement("div");

    meta.className = "listing-meta";

    const location = getSafeText(resource.location, "");

    if (location) {
      meta.appendChild(createMetaItem("fa-solid fa-location-dot", location));
    }

    meta.appendChild(
      createMetaItem(
        "fa-regular fa-calendar",
        `Listed ${formatDate(resource.created_at)}`,
      ),
    );

    return meta;
  }

  function createMetaItem(iconClass, text) {
    const item = document.createElement("div");

    item.className = "listing-meta-item";

    const icon = document.createElement("i");

    icon.className = iconClass;

    icon.setAttribute("aria-hidden", "true");

    const textElement = document.createElement("span");

    textElement.textContent = text;

    item.appendChild(icon);
    item.appendChild(textElement);

    return item;
  }

  /* =====================================================
       STATUS SECTION
       ===================================================== */

  function createStatusSection(resource) {
    const statusRow = document.createElement("div");

    statusRow.className = "listing-status-row";

    const isAvailable = resource.available === true;

    const availabilityBadge = document.createElement("span");

    availabilityBadge.className = `availability-badge ${
      isAvailable ? "available" : "unavailable"
    }`;

    availabilityBadge.textContent = isAvailable
      ? "Available"
      : "Currently Unavailable";

    statusRow.appendChild(availabilityBadge);

    const moderationStatus = getSafeText(
      resource.moderation_status,
      "",
    ).toLowerCase();

    if (moderationStatus) {
      const moderationBadge = document.createElement("span");

      moderationBadge.className = `moderation-badge ${getModerationClass(
        moderationStatus,
      )}`;

      moderationBadge.textContent = formatModerationStatus(moderationStatus);

      statusRow.appendChild(moderationBadge);
    }

    return statusRow;
  }

  function formatModerationStatus(status) {
    switch (status) {
      case "approved":
        return "Approved";

      case "rejected":
        return "Rejected";

      case "pending":
        return "Pending";

      default:
        return "Pending";
    }
  }

  function getModerationClass(status) {
    switch (status) {
      case "approved":
        return "approved";

      case "rejected":
        return "rejected";

      case "pending":
        return "pending";

      default:
        return "pending";
    }
  }

  /* =====================================================
       PRICING SECTION
       ===================================================== */

  function createPricingSection(resource) {
    const pricing = document.createElement("div");

    pricing.className = "listing-pricing";

    const heading = document.createElement("div");

    heading.className = "listing-pricing-heading";

    const headingIcon = document.createElement("i");

    headingIcon.className = "fa-solid fa-indian-rupee-sign";

    headingIcon.setAttribute("aria-hidden", "true");

    const headingText = document.createElement("span");

    headingText.textContent = "Pricing";

    heading.appendChild(headingIcon);
    heading.appendChild(headingText);

    const priceGrid = document.createElement("div");

    priceGrid.className = "listing-price-grid";

    priceGrid.appendChild(
      createPriceItem(
        "fa-solid fa-clock",
        "Per hour",
        getHourlyPrice(resource),
        "hour-price",
      ),
    );

    priceGrid.appendChild(
      createPriceItem(
        "fa-solid fa-calendar-day",
        "Per day",
        getDailyPrice(resource),
        "day-price",
      ),
    );

    priceGrid.appendChild(
      createPriceItem(
        "fa-solid fa-cart-shopping",
        "Buy price",
        getBuyPrice(resource),
        "buy-price",
      ),
    );

    pricing.appendChild(heading);
    pricing.appendChild(priceGrid);

    return pricing;
  }

  function createPriceItem(iconClass, label, value, modifier = "") {
    const item = document.createElement("div");

    item.className = `listing-price-item ${modifier}`.trim();

    const icon = document.createElement("i");

    icon.className = iconClass;

    icon.setAttribute("aria-hidden", "true");

    const text = document.createElement("div");

    text.className = "listing-price-text";

    const labelElement = document.createElement("span");

    labelElement.className = "listing-price-label";

    labelElement.textContent = label;

    const valueElement = document.createElement("strong");

    valueElement.className = "listing-price-value";

    valueElement.textContent = formatPrice(value);

    text.appendChild(labelElement);
    text.appendChild(valueElement);

    item.appendChild(icon);
    item.appendChild(text);

    return item;
  }

  /* =====================================================
       ACTION SECTION
       ===================================================== */

  function createActionSection(resource) {
    const actions = document.createElement("div");

    actions.className = "listing-actions";

    /* VIEW */

    const viewLink = document.createElement("a");

    viewLink.href = `${RESOURCE_DETAILS_URL}?id=${encodeURIComponent(
      String(resource.id),
    )}`;

    viewLink.className = "listing-action view-resource-button";

    viewLink.setAttribute(
      "aria-label",
      `View ${getSafeText(resource.title, "resource")}`,
    );

    const viewIcon = document.createElement("i");

    viewIcon.className = "fa-solid fa-eye";

    viewIcon.setAttribute("aria-hidden", "true");

    viewLink.appendChild(viewIcon);

    viewLink.appendChild(document.createTextNode(" View Resource"));

    /* DELETE */

    const deleteButton = document.createElement("button");

    deleteButton.type = "button";

    deleteButton.className = "listing-action delete-resource-button";

    deleteButton.dataset.deleteId = String(resource.id);

    deleteButton.dataset.deleteTitle = getSafeText(
      resource.title,
      "this resource",
    );

    deleteButton.setAttribute(
      "aria-label",
      `Delete ${getSafeText(resource.title, "resource")}`,
    );

    const deleteIcon = document.createElement("i");

    deleteIcon.className = "fa-solid fa-trash";

    deleteIcon.setAttribute("aria-hidden", "true");

    deleteButton.appendChild(deleteIcon);

    deleteButton.appendChild(document.createTextNode(" Delete"));

    deleteButton.addEventListener("click", handleDeleteResource);

    actions.appendChild(viewLink);
    actions.appendChild(deleteButton);

    return actions;
  }

  /* =====================================================
       DELETE RESOURCE
       ===================================================== */

  async function handleDeleteResource(event) {
    const button = event.currentTarget;

    if (!button || isDeleting) {
      return;
    }

    const resourceId = button.dataset.deleteId;

    const resourceTitle = getSafeText(
      button.dataset.deleteTitle,
      "this resource",
    );

    if (!isValidResourceId(resourceId)) {
      showMessage("Invalid resource.", "error");

      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete "${resourceTitle}"?\n\nThis action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    isDeleting = true;

    button.disabled = true;

    setDeleteButtonLoading(button);

    try {
      const user = await getAuthenticatedUser();

      if (!user) {
        redirectToLogin();
        return;
      }

      const supabase = getSupabaseClient();

      /*
       * SECURITY:
       *
       * NEVER send owner_id.
       *
       * The SECURITY DEFINER database function
       * must use auth.uid() to determine ownership.
       */

      const { data, error } = await supabase.rpc("delete_my_resource", {
        p_resource_id: Number(resourceId),
      });

      if (error) {
        console.error("Failed to delete resource:", error);

        showMessage(getSafeDeleteErrorMessage(error), "error");

        resetDeleteButton(button);

        return;
      }

      /*
       * Database deletion succeeded.
       *
       * Extract the previous image URL for
       * best-effort Storage cleanup.
       */

      const imageUrl = extractImageUrl(data);

      if (imageUrl) {
        await removeResourceImage(supabase, imageUrl);
      }

      showMessage(`"${resourceTitle}" was deleted successfully.`, "success");

      /*
       * Invalidate any currently running
       * listing request before refreshing.
       */

      loadRequestId++;

      await loadMyListings();
    } catch (error) {
      console.error("Delete resource error:", error);

      showMessage("Unable to delete the resource. Please try again.", "error");

      resetDeleteButton(button);
    } finally {
      isDeleting = false;
    }
  }

  /* =====================================================
       EXTRACT IMAGE URL FROM DELETE RPC RESPONSE
       ===================================================== */

  function extractImageUrl(data) {
    if (typeof data === "string" && data.trim()) {
      return data.trim();
    }

    if (data && typeof data === "object" && !Array.isArray(data)) {
      const imageUrl = data.image_url || data.imageUrl || data.image || null;

      if (typeof imageUrl === "string" && imageUrl.trim()) {
        return imageUrl.trim();
      }
    }

    if (Array.isArray(data) && data.length > 0 && data[0]) {
      const imageUrl =
        data[0].image_url || data[0].imageUrl || data[0].image || null;

      if (typeof imageUrl === "string" && imageUrl.trim()) {
        return imageUrl.trim();
      }
    }

    return null;
  }

  /* =====================================================
       STORAGE IMAGE CLEANUP
       ===================================================== */

  async function removeResourceImage(supabase, imageUrl) {
    const storagePath = getResourceStoragePath(imageUrl);

    if (!storagePath) {
      console.warn("Could not determine resource image storage path.");

      return;
    }

    try {
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([storagePath]);

      if (error) {
        console.error("Resource image cleanup failed:", error);
      }
    } catch (error) {
      console.error("Storage cleanup error:", error);
    }
  }

  /* =====================================================
       GET STORAGE PATH
       ===================================================== */

  function getResourceStoragePath(imageUrl) {
    if (typeof imageUrl !== "string" || !imageUrl.trim()) {
      return null;
    }

    try {
      const url = new URL(imageUrl.trim());

      if (url.protocol !== "https:" || url.origin !== SUPABASE_ORIGIN) {
        return null;
      }

      if (url.username || url.password) {
        return null;
      }

      if (url.search || url.hash) {
        return null;
      }

      if (!url.pathname.startsWith(STORAGE_PUBLIC_PREFIX)) {
        return null;
      }

      const objectPath = url.pathname.slice(STORAGE_PUBLIC_PREFIX.length);

      if (!objectPath) {
        return null;
      }

      return validateStoragePath(objectPath);
    } catch {
      return null;
    }
  }

  /* =====================================================
       SAFE IMAGE URL
       ===================================================== */

  function isSafeImageUrl(imageUrl) {
    if (typeof imageUrl !== "string" || !imageUrl.trim()) {
      return false;
    }

    try {
      const url = new URL(imageUrl.trim());

      if (url.protocol !== "https:" || url.origin !== SUPABASE_ORIGIN) {
        return false;
      }

      if (url.username || url.password) {
        return false;
      }

      if (url.search || url.hash) {
        return false;
      }

      if (!url.pathname.startsWith(STORAGE_PUBLIC_PREFIX)) {
        return false;
      }

      const objectPath = url.pathname.slice(STORAGE_PUBLIC_PREFIX.length);

      return Boolean(validateStoragePath(objectPath));
    } catch {
      return false;
    }
  }

  /* =====================================================
       STORAGE PATH VALIDATION
       ===================================================== */

  function validateStoragePath(objectPath) {
    if (typeof objectPath !== "string" || !objectPath) {
      return null;
    }

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

    const segments = decodedPath.split("/");

    if (segments.length < 2 || !segments[0] || !segments[1]) {
      return null;
    }

    return decodedPath;
  }

  /* =====================================================
       ERROR HANDLING
       ===================================================== */

  function getSafeListingErrorMessage(error) {
    const message = String(error?.message || "").toLowerCase();

    if (
      message.includes("jwt") ||
      message.includes("session") ||
      message.includes("authentication")
    ) {
      return "Your session has expired. Please log in again.";
    }

    if (message.includes("get_my_listings") || message.includes("function")) {
      return "Your listings could not be loaded. Please try again.";
    }

    return "Unable to load your listings. Please try again.";
  }

  function getSafeDeleteErrorMessage(error) {
    const message = String(error?.message || "").toLowerCase();

    if (
      message.includes("authentication required") ||
      message.includes("jwt") ||
      message.includes("session") ||
      message.includes("authentication")
    ) {
      return "Your session has expired. Please log in again.";
    }

    if (
      message.includes("resource not found") ||
      message.includes("access denied") ||
      message.includes("not authorized")
    ) {
      return "This resource could not be found or you no longer have access to it.";
    }

    if (
      message.includes("delete_my_resource") ||
      message.includes("function")
    ) {
      return "The resource could not be deleted. Please try again.";
    }

    return "Unable to delete the resource. Please try again.";
  }

  /* =====================================================
       DELETE BUTTON UI
       ===================================================== */

  function setDeleteButtonLoading(button) {
    if (!button) {
      return;
    }

    button.replaceChildren();

    const icon = document.createElement("i");

    icon.className = "fa-solid fa-spinner fa-spin";

    icon.setAttribute("aria-hidden", "true");

    button.appendChild(icon);

    button.appendChild(document.createTextNode(" Deleting..."));
  }

  function resetDeleteButton(button) {
    if (!button) {
      return;
    }

    button.disabled = false;

    button.replaceChildren();

    const icon = document.createElement("i");

    icon.className = "fa-solid fa-trash";

    icon.setAttribute("aria-hidden", "true");

    button.appendChild(icon);

    button.appendChild(document.createTextNode(" Delete"));
  }

  /* =====================================================
       AUTH STATE LISTENER
       ===================================================== */

  function registerAuthListener() {
    if (authListenerRegistered) {
      return;
    }

    try {
      const supabase = getSupabaseClient();

      supabase.auth.onAuthStateChange((event) => {
        if (destroyed) {
          return;
        }

        if (
          event === "SIGNED_IN" ||
          event === "SIGNED_OUT" ||
          event === "USER_UPDATED" ||
          event === "TOKEN_REFRESHED"
        ) {
          /*
           * Defer async work so additional
           * Supabase calls do not execute
           * directly inside the auth callback.
           */

          setTimeout(() => {
            if (destroyed) {
              return;
            }

            updateAuthNavigation();

            if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
              loadMyListings();
            }
          }, 0);
        }
      });

      authListenerRegistered = true;
    } catch (error) {
      console.error("Unable to register auth listener:", error);
    }
  }

  /* =====================================================
       INITIALIZE
       ===================================================== */

  async function init() {
    if (destroyed) {
      return;
    }

    registerAuthListener();

    await updateAuthNavigation();

    if (destroyed) {
      return;
    }

    await loadMyListings();
  }

  /* =====================================================
       START
       ===================================================== */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {
      once: true,
    });
  } else {
    init();
  }

  /* =====================================================
       CLEANUP
       ===================================================== */

  window.addEventListener(
    "pagehide",
    () => {
      destroyed = true;
      loadRequestId++;
    },
    {
      once: true,
    },
  );
})();
