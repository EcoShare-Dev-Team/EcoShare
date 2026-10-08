// =========================================================
// EcoShare — My Requests JavaScript
//
// Secure request loading, filtering,
// withdrawal, and resource return
// =========================================================

"use strict";

// =========================================================
// 1. GET ELEMENTS
// =========================================================

const requestsList = document.getElementById("requestsList");

const emptyRequests = document.getElementById("emptyRequests");

const requestsCount = document.getElementById("requestsCount");

const authNavButton = document.getElementById("authNavButton");

const requestFilters = document.querySelectorAll(".request-filter");

// =========================================================
// 2. CONSTANTS
// =========================================================

const LOGIN_URL = "../Phase 1/login.html";

const PROFILE_URL = "../Phase 1/profile.html";

const EXPLORE_URL = "explore.html";

const RESOURCE_DETAILS_URL = "resource-details.html";

const SUPABASE_ORIGIN =
  window.ECOSHARE_SUPABASE_URL || "https://cplbvftcbiwgqkeqmrbq.supabase.co";

const RESOURCE_IMAGE_PATH_PREFIX = "/storage/v1/object/public/resource-images/";

const VALID_STATUSES = new Set([
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "returned",
]);

const VALID_FILTERS = new Set(["all", "pending", "active", "completed"]);

// =========================================================
// 3. REQUEST STATE
// =========================================================

let allRequests = [];

let currentFilter = "all";

let isProcessingRequest = false;

let loadRequestId = 0;

let isInitialized = false;

let authListenerRegistered = false;

// =========================================================
// 4. SUPABASE CLIENT
// =========================================================

function getSupabaseClient() {
  const client = window.supabaseClient;

  if (!client || !client.auth || typeof client.rpc !== "function") {
    throw new Error("Supabase is not initialized. Please check supabase.js.");
  }

  return client;
}

// =========================================================
// 5. FORMAT CATEGORY
// =========================================================

function formatCategory(category) {
  if (!category) {
    return "Other";
  }

  return String(category)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

// =========================================================
// 6. FORMAT STATUS
// =========================================================

function formatStatus(status) {
  if (!status) {
    return "Unknown";
  }

  return String(status)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

// =========================================================
// 7. STATUS ICON
// =========================================================

function getStatusIcon(status) {
  switch (status) {
    case "pending":
      return "fa-clock";

    case "approved":
      return "fa-circle-check";

    case "rejected":
      return "fa-circle-xmark";

    case "cancelled":
      return "fa-ban";

    case "returned":
      return "fa-arrow-rotate-left";

    default:
      return "fa-circle-question";
  }
}

// =========================================================
// 8. FORMAT DATE
// =========================================================

function formatDate(dateValue) {
  if (!dateValue) {
    return "Date unavailable";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// =========================================================
// 9. VALIDATE NUMERIC ID
// =========================================================

function isValidId(value) {
  return /^\d+$/.test(String(value ?? ""));
}

// =========================================================
// 10. SAFE RESOURCE IMAGE URL
// =========================================================

function getSafeResourceImageUrl(imageUrl) {
  if (typeof imageUrl !== "string" || !imageUrl.trim()) {
    return null;
  }

  try {
    const url = new URL(imageUrl.trim());

    // HTTPS only.
    if (url.protocol !== "https:") {
      return null;
    }

    // Only EcoShare's Supabase project.
    if (url.origin !== SUPABASE_ORIGIN) {
      return null;
    }

    // No embedded credentials.
    if (url.username || url.password) {
      return null;
    }

    // No query strings or fragments.
    if (url.search || url.hash) {
      return null;
    }

    // Only the resource-images bucket.
    if (!url.pathname.startsWith(RESOURCE_IMAGE_PATH_PREFIX)) {
      return null;
    }

    const objectPath = url.pathname.slice(RESOURCE_IMAGE_PATH_PREFIX.length);

    if (!objectPath) {
      return null;
    }

    // Reject suspicious raw paths.
    if (
      objectPath.includes("..") ||
      objectPath.includes("\\") ||
      objectPath.includes("//")
    ) {
      return null;
    }

    // Validate decoded path as well.
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
    return null;
  }
}

// =========================================================
// 11. CREATE ICON
// =========================================================

function createIcon(className) {
  const icon = document.createElement("i");

  icon.className = className;

  icon.setAttribute("aria-hidden", "true");

  return icon;
}

// =========================================================
// 12. UPDATE AUTH NAVIGATION
// =========================================================

async function updateAuthNavigation() {
  if (!authNavButton) {
    return;
  }

  try {
    const supabase = getSupabaseClient();

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      console.error("Auth session error:", error);
    }

    authNavButton.replaceChildren();

    if (session) {
      authNavButton.appendChild(createIcon("fa-solid fa-user"));

      authNavButton.appendChild(document.createTextNode(" Profile"));

      authNavButton.href = PROFILE_URL;

      authNavButton.setAttribute("aria-label", "Open profile");

      return;
    }

    authNavButton.appendChild(createIcon("fa-solid fa-right-to-bracket"));

    authNavButton.appendChild(document.createTextNode(" Login"));

    authNavButton.href = LOGIN_URL;

    authNavButton.setAttribute("aria-label", "Login");
  } catch (error) {
    console.error("Auth navigation error:", error);
  }
}

// =========================================================
// 13. GET CURRENT PAGE REDIRECT
// =========================================================

function getLoginRedirectUrl() {
  const currentPath = window.location.pathname + window.location.search;

  return `${LOGIN_URL}?redirect=` + encodeURIComponent(currentPath);
}

// =========================================================
// 14. SHOW ERROR
// =========================================================

function showError(message) {
  if (!requestsList) {
    return;
  }

  requestsList.replaceChildren();

  requestsList.hidden = false;

  if (emptyRequests) {
    emptyRequests.hidden = true;
  }

  const errorContainer = document.createElement("div");

  errorContainer.className = "requests-error";

  const icon = createIcon("fa-solid fa-triangle-exclamation");

  const heading = document.createElement("h3");

  heading.textContent = "Unable to load your requests";

  const paragraph = document.createElement("p");

  paragraph.textContent = message;

  errorContainer.appendChild(icon);
  errorContainer.appendChild(heading);
  errorContainer.appendChild(paragraph);

  requestsList.appendChild(errorContainer);
}

// =========================================================
// 15. SHOW LOADING STATE
// =========================================================

function showLoadingState() {
  if (!requestsList) {
    return;
  }

  requestsList.replaceChildren();

  requestsList.hidden = false;

  if (emptyRequests) {
    emptyRequests.hidden = true;
  }

  const loadingContainer = document.createElement("div");

  loadingContainer.className = "requests-error";

  const loadingIcon = createIcon("fa-solid fa-spinner fa-spin");

  const loadingHeading = document.createElement("h3");

  loadingHeading.textContent = "Loading requests...";

  const loadingParagraph = document.createElement("p");

  loadingParagraph.textContent =
    "Please wait while we load your borrow requests.";

  loadingContainer.appendChild(loadingIcon);

  loadingContainer.appendChild(loadingHeading);

  loadingContainer.appendChild(loadingParagraph);

  requestsList.appendChild(loadingContainer);
}

// =========================================================
// 16. CHECK FILTER
// =========================================================

function matchesFilter(request, filter) {
  if (!request) {
    return false;
  }

  switch (filter) {
    case "all":
      return true;

    case "pending":
      return request.status === "pending";

    case "active":
      return request.status === "approved";

    case "completed":
      return request.status === "returned";

    default:
      return true;
  }
}

// =========================================================
// 17. APPLY REQUEST FILTER
// =========================================================

function applyRequestFilter() {
  if (!requestsList) {
    return;
  }

  const filteredRequests = allRequests.filter((request) =>
    matchesFilter(request, currentFilter),
  );

  requestsList.hidden = false;

  if (emptyRequests) {
    emptyRequests.hidden = true;
  }

  if (filteredRequests.length === 0) {
    renderFilterEmptyState();

    if (requestsCount) {
      requestsCount.textContent =
        currentFilter === "all"
          ? "No requests yet"
          : `No ${currentFilter} requests`;
    }

    return;
  }

  if (requestsCount) {
    requestsCount.textContent = `${filteredRequests.length} request${
      filteredRequests.length === 1 ? "" : "s"
    }`;
  }

  displayRequests(filteredRequests);
}

// =========================================================
// 18. FILTER EMPTY STATE
// =========================================================

function renderFilterEmptyState() {
  if (!requestsList) {
    return;
  }

  requestsList.replaceChildren();

  const container = document.createElement("div");

  container.className = "empty-requests";

  const iconContainer = document.createElement("div");

  iconContainer.className = "empty-requests-icon";

  iconContainer.appendChild(createIcon("fa-solid fa-filter"));

  const heading = document.createElement("h3");

  heading.textContent = "No requests found";

  const paragraph = document.createElement("p");

  if (currentFilter === "all") {
    paragraph.textContent = "You don't have any borrow requests yet.";
  } else {
    paragraph.textContent = `You don't have any ${currentFilter} requests.`;
  }

  container.appendChild(iconContainer);

  container.appendChild(heading);

  container.appendChild(paragraph);

  if (currentFilter === "all") {
    const exploreLink = document.createElement("a");

    exploreLink.href = EXPLORE_URL;

    exploreLink.className = "primary-btn";

    exploreLink.appendChild(createIcon("fa-solid fa-magnifying-glass"));

    exploreLink.appendChild(document.createTextNode(" Explore Resources"));

    container.appendChild(exploreLink);
  }

  requestsList.appendChild(container);
}

// =========================================================
// 19. GET AUTHENTICATED USER
// =========================================================

async function getAuthenticatedUser() {
  try {
    const supabase = getSupabaseClient();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      console.error("Authentication error:", error);

      return null;
    }

    return user || null;
  } catch (error) {
    console.error("Authentication request failed:", error);

    return null;
  }
}

// =========================================================
// 20. LOAD MY REQUESTS
// =========================================================

async function loadMyRequests() {
  if (!requestsList) {
    return;
  }

  const requestLoadId = ++loadRequestId;

  const user = await getAuthenticatedUser();

  if (!user) {
    window.location.href = getLoginRedirectUrl();

    return;
  }

  showLoadingState();

  try {
    const supabase = getSupabaseClient();

    /*
     * IMPORTANT SECURITY MODEL
     *
     * Do not query borrow_requests directly.
     *
     * get_my_requests() is responsible for:
     *
     * - auth.uid()
     * - borrower ownership
     * - returning only the authenticated
     *   user's requests
     *
     * The frontend never supplies borrower_id.
     */

    const { data: requests, error } = await supabase.rpc("get_my_requests");

    // Ignore stale responses.
    if (requestLoadId !== loadRequestId) {
      return;
    }

    if (error) {
      console.error("My requests loading error:", error);

      showError("Please refresh the page and try again.");

      return;
    }

    allRequests = Array.isArray(requests) ? requests : [];

    if (allRequests.length === 0) {
      requestsList.replaceChildren();

      requestsList.hidden = true;

      if (emptyRequests) {
        emptyRequests.hidden = false;
      }

      if (requestsCount) {
        requestsCount.textContent = "No requests yet";
      }

      return;
    }

    requestsList.hidden = false;

    if (emptyRequests) {
      emptyRequests.hidden = true;
    }

    applyRequestFilter();
  } catch (error) {
    if (requestLoadId !== loadRequestId) {
      return;
    }

    console.error("Load my requests error:", error);

    showError("Please refresh the page and try again.");
  }
}

// =========================================================
// 21. DISPLAY REQUESTS
// =========================================================

function displayRequests(requests) {
  if (!requestsList) {
    return;
  }

  requestsList.replaceChildren();

  const fragment = document.createDocumentFragment();

  requests.forEach((request) => {
    if (!request) {
      return;
    }

    const card = document.createElement("article");

    card.className = "request-card";

    // -------------------------------------------------
    // IMAGE
    // -------------------------------------------------

    const imageContainer = document.createElement("div");

    imageContainer.className = "request-image";

    const safeImageUrl = getSafeResourceImageUrl(request.resource_image_url);

    if (safeImageUrl) {
      const image = document.createElement("img");

      image.src = safeImageUrl;

      image.alt = request.resource_title
        ? String(request.resource_title)
        : "Resource image";

      image.loading = "lazy";

      image.decoding = "async";

      image.addEventListener(
        "error",
        () => {
          imageContainer.replaceChildren();

          imageContainer.appendChild(createIcon("fa-solid fa-image"));
        },
        {
          once: true,
        },
      );

      imageContainer.appendChild(image);
    } else {
      imageContainer.appendChild(createIcon("fa-solid fa-image"));
    }

    // -------------------------------------------------
    // CONTENT
    // -------------------------------------------------

    const content = document.createElement("div");

    content.className = "request-content";

    // Category

    const category = document.createElement("span");

    category.className = "request-category";

    category.textContent = formatCategory(request.resource_category);

    // Title

    const title = document.createElement("h3");

    title.textContent = request.resource_title || "Untitled resource";

    // Description

    const description = document.createElement("p");

    description.className = "request-description";

    description.textContent =
      request.resource_description || "No description available.";

    // -------------------------------------------------
    // META
    // -------------------------------------------------

    const meta = document.createElement("div");

    meta.className = "request-meta";

    // Location

    const locationSpan = document.createElement("span");

    locationSpan.appendChild(createIcon("fa-solid fa-location-dot"));

    locationSpan.appendChild(
      document.createTextNode(
        request.resource_location || "Location not specified",
      ),
    );

    // Date

    const dateSpan = document.createElement("span");

    dateSpan.appendChild(createIcon("fa-regular fa-calendar"));

    dateSpan.appendChild(
      document.createTextNode(formatDate(request.created_at)),
    );

    meta.appendChild(locationSpan);

    meta.appendChild(dateSpan);

    // -------------------------------------------------
    // ACTIONS
    // -------------------------------------------------

    const actions = document.createElement("div");

    actions.className = "request-actions";

    // View Resource

    if (isValidId(request.resource_id)) {
      const viewButton = document.createElement("button");

      viewButton.type = "button";

      viewButton.className = "view-request-btn";

      viewButton.dataset.resourceId = String(request.resource_id);

      viewButton.appendChild(createIcon("fa-solid fa-eye"));

      viewButton.appendChild(document.createTextNode(" View Resource"));

      viewButton.addEventListener("click", () => {
        const resourceId = viewButton.dataset.resourceId;

        if (!isValidId(resourceId)) {
          return;
        }

        window.location.href = `${RESOURCE_DETAILS_URL}?id=${encodeURIComponent(
          resourceId,
        )}`;
      });

      actions.appendChild(viewButton);
    }

    // Withdraw Request

    if (request.status === "pending") {
      const withdrawButton = document.createElement("button");

      withdrawButton.type = "button";

      withdrawButton.className = "withdraw-request-btn";

      withdrawButton.dataset.requestId = String(request.id);

      withdrawButton.appendChild(createIcon("fa-solid fa-ban"));

      withdrawButton.appendChild(document.createTextNode(" Withdraw Request"));

      withdrawButton.addEventListener("click", () =>
        handleWithdrawRequest(withdrawButton),
      );

      actions.appendChild(withdrawButton);
    }

    // Return Resource

    if (request.status === "approved") {
      const returnButton = document.createElement("button");

      returnButton.type = "button";

      returnButton.className = "return-resource-btn";

      returnButton.dataset.requestId = String(request.id);

      returnButton.appendChild(createIcon("fa-solid fa-arrow-rotate-left"));

      returnButton.appendChild(document.createTextNode(" Return Resource"));

      returnButton.addEventListener("click", () =>
        handleReturnResource(returnButton),
      );

      actions.appendChild(returnButton);
    }

    // =========================================================
    // RATE & REVIEW RESOURCE
    // =========================================================

    if (request.status === "returned") {
      const reviewButton = document.createElement("button");

      reviewButton.type = "button";

      reviewButton.className = "review-resource-btn";

      reviewButton.dataset.resourceId = String(request.resource_id);

      reviewButton.appendChild(createIcon("fa-solid fa-star"));

      reviewButton.appendChild(document.createTextNode(" Rate & Review"));

      reviewButton.addEventListener("click", () => {
        const resourceId = reviewButton.dataset.resourceId;

        if (!isValidId(resourceId)) {
          return;
        }

        window.location.href = `../Phase 4/resource-reviews.html?id=${encodeURIComponent(
          resourceId,
        )}`;
      });

      actions.appendChild(reviewButton);
    }

    // -------------------------------------------------
    // ASSEMBLE CONTENT
    // -------------------------------------------------

    content.appendChild(category);

    content.appendChild(title);

    content.appendChild(description);

    content.appendChild(meta);

    content.appendChild(actions);

    // -------------------------------------------------
    // STATUS
    // -------------------------------------------------

    const statusContainer = document.createElement("div");

    statusContainer.className = "request-status";

    const statusBadge = document.createElement("span");

    const safeStatus = VALID_STATUSES.has(request.status)
      ? request.status
      : "unknown";

    statusBadge.className = `status-badge status-${safeStatus}`;

    statusBadge.appendChild(
      createIcon(`fa-solid ${getStatusIcon(safeStatus)}`),
    );

    statusBadge.appendChild(
      document.createTextNode(` ${formatStatus(safeStatus)}`),
    );

    statusContainer.appendChild(statusBadge);

    // -------------------------------------------------
    // FINAL CARD
    // -------------------------------------------------

    card.appendChild(imageContainer);

    card.appendChild(content);

    card.appendChild(statusContainer);

    fragment.appendChild(card);
  });

  requestsList.appendChild(fragment);
}

// =========================================================
// 22. RESET WITHDRAW BUTTON
// =========================================================

function resetWithdrawButton(button) {
  if (!button) {
    return;
  }

  button.disabled = false;

  button.replaceChildren();

  button.appendChild(createIcon("fa-solid fa-ban"));

  button.appendChild(document.createTextNode(" Withdraw Request"));
}

// =========================================================
// 23. RESET RETURN BUTTON
// =========================================================

function resetReturnButton(button) {
  if (!button) {
    return;
  }

  button.disabled = false;

  button.replaceChildren();

  button.appendChild(createIcon("fa-solid fa-arrow-rotate-left"));

  button.appendChild(document.createTextNode(" Return Resource"));
}

// =========================================================
// 24. WITHDRAW REQUEST
// =========================================================

async function handleWithdrawRequest(withdrawButton) {
  if (!withdrawButton || isProcessingRequest) {
    return;
  }

  const requestId = withdrawButton.dataset.requestId;

  if (!isValidId(requestId)) {
    alert("Invalid request.");

    return;
  }

  const confirmed = window.confirm(
    "Are you sure you want to withdraw this borrow request?",
  );

  if (!confirmed) {
    return;
  }

  isProcessingRequest = true;

  withdrawButton.disabled = true;

  withdrawButton.replaceChildren();

  withdrawButton.appendChild(createIcon("fa-solid fa-spinner fa-spin"));

  withdrawButton.appendChild(document.createTextNode(" Withdrawing..."));

  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      window.location.href = getLoginRedirectUrl();

      return;
    }

    const supabase = getSupabaseClient();

    /*
     * Secure database operation.
     *
     * The RPC is responsible for checking:
     * - authenticated user
     * - borrower ownership
     * - pending status
     *
     * No borrower_id is supplied by the client.
     */

    const { error } = await supabase.rpc("cancel_borrow_request", {
      request_id: requestId,
    });

    if (error) {
      console.error("Withdraw request error:", error);

      resetWithdrawButton(withdrawButton);

      alert(getSafeRequestErrorMessage(error, "withdraw"));

      return;
    }

    await loadMyRequests();
  } catch (error) {
    console.error("Withdraw request failed:", error);

    resetWithdrawButton(withdrawButton);

    alert("Unable to withdraw the request. Please try again.");
  } finally {
    isProcessingRequest = false;
  }
}

// =========================================================
// 25. RETURN RESOURCE
// =========================================================

async function handleReturnResource(returnButton) {
  if (!returnButton || isProcessingRequest) {
    return;
  }

  const requestId = returnButton.dataset.requestId;

  if (!isValidId(requestId)) {
    alert("Invalid request.");

    return;
  }

  const confirmed = window.confirm(
    "Are you sure you want to return this resource?",
  );

  if (!confirmed) {
    return;
  }

  isProcessingRequest = true;

  returnButton.disabled = true;

  returnButton.replaceChildren();

  returnButton.appendChild(createIcon("fa-solid fa-spinner fa-spin"));

  returnButton.appendChild(document.createTextNode(" Returning..."));

  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      window.location.href = getLoginRedirectUrl();

      return;
    }

    const supabase = getSupabaseClient();

    /*
     * Secure database operation.
     *
     * The RPC is responsible for checking:
     * - authenticated user
     * - borrower ownership
     * - approved request
     * - resource state
     *
     * No borrower_id is supplied by the client.
     */

    const { error } = await supabase.rpc("return_borrowed_resource", {
      request_id: requestId,
    });

    if (error) {
      console.error("Return resource error:", error);

      resetReturnButton(returnButton);

      alert(getSafeRequestErrorMessage(error, "return"));

      return;
    }

    await loadMyRequests();
  } catch (error) {
    console.error("Return resource failed:", error);

    resetReturnButton(returnButton);

    alert("Unable to return the resource. Please try again.");
  } finally {
    isProcessingRequest = false;
  }
}

// =========================================================
// 26. SAFE REQUEST ERROR MESSAGE
// =========================================================

function getSafeRequestErrorMessage(error, action) {
  const rawMessage = String(error?.message || "").toLowerCase();

  if (
    rawMessage.includes("authentication required") ||
    rawMessage.includes("jwt") ||
    rawMessage.includes("not authenticated")
  ) {
    return "Your session has expired. Please log in again.";
  }

  if (
    rawMessage.includes("not found") ||
    rawMessage.includes("access denied") ||
    rawMessage.includes("unauthorized") ||
    rawMessage.includes("permission denied")
  ) {
    return action === "withdraw"
      ? "This request could not be withdrawn."
      : "This resource could not be returned.";
  }

  if (rawMessage.includes("not pending")) {
    return "This request is no longer pending.";
  }

  if (rawMessage.includes("not approved")) {
    return "This resource is no longer available for return.";
  }

  if (rawMessage.includes("already returned")) {
    return "This resource has already been returned.";
  }

  if (rawMessage.includes("already cancelled")) {
    return "This request has already been withdrawn.";
  }

  return action === "withdraw"
    ? "Unable to withdraw the request. Please try again."
    : "Unable to return the resource. Please try again.";
}

// =========================================================
// 27. REQUEST FILTER BUTTONS
// =========================================================

function initializeRequestFilters() {
  requestFilters.forEach((filterButton) => {
    filterButton.addEventListener("click", () => {
      const requestedFilter = filterButton.dataset.filter;

      currentFilter = VALID_FILTERS.has(requestedFilter)
        ? requestedFilter
        : "all";

      requestFilters.forEach((button) => {
        button.classList.toggle("active", button === filterButton);
      });

      applyRequestFilter();
    });
  });
}

// =========================================================
// 28. AUTH STATE LISTENER
// =========================================================

function initializeAuthListener() {
  if (authListenerRegistered) {
    return;
  }

  try {
    const supabase = getSupabaseClient();

    supabase.auth.onAuthStateChange((event) => {
      /*
       * Navigation should update whenever the
       * authentication state changes.
       */

      updateAuthNavigation();

      /*
       * If the user signs out while this page
       * is open, send them back through login.
       */

      if (event === "SIGNED_OUT") {
        allRequests = [];

        if (requestsList) {
          requestsList.replaceChildren();
        }

        if (emptyRequests) {
          emptyRequests.hidden = true;
        }

        window.location.href = getLoginRedirectUrl();
      }
    });

    authListenerRegistered = true;
  } catch (error) {
    console.error("Unable to register auth listener:", error);
  }
}

// =========================================================
// 29. INITIALIZE
// =========================================================

async function init() {
  if (isInitialized) {
    return;
  }

  isInitialized = true;

  initializeRequestFilters();

  initializeAuthListener();

  await updateAuthNavigation();

  await loadMyRequests();
}

// =========================================================
// 30. START
// =========================================================

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, {
    once: true,
  });
} else {
  init();
}
