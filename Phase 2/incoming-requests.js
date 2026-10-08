/*
=========================================================
  EcoShare — Incoming Requests JavaScript

  File: incoming-requests.js

  Responsibilities:
  - Authentication protection
  - Load owner-scoped incoming requests
  - Render request cards safely
  - Display resource / borrower information
  - Approve pending requests
  - Reject pending requests
  - Highlight a requested request from URL
  - Handle loading / empty / error states

  SECURITY:
  - Browser never supplies owner_id to the database query.
  - Database view is owner-scoped.
  - Approve/reject operations use secure RPC functions.
  - Database remains authoritative for authorization/status.
  - User/database text is inserted with textContent.
  - Resource images are restricted to the EcoShare
    Supabase resource-images bucket.

  Global functionality such as:
  - Navbar
  - Profile dropdown
  - Notifications
  - Shared authentication UI
  - Global mobile navigation

  is handled by page.js.
=========================================================
*/

"use strict";

/* ======================================================
   1. DOM REFERENCES
   ====================================================== */

const requestsList = document.getElementById("requestsList");

const emptyRequests = document.getElementById("emptyRequests");

const requestsCount = document.getElementById("requestsCount");

/* ======================================================
   2. CONFIGURATION
   ====================================================== */

const LOGIN_URL = "../Phase 1/login.html";

const RESOURCE_IMAGE_BUCKET = "resource-images";

const RESOURCE_IMAGE_PATH_PREFIX = `/storage/v1/object/public/${RESOURCE_IMAGE_BUCKET}/`;

const REQUEST_STATUSES = Object.freeze({
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
});

/* ======================================================
   3. SUPABASE CLIENT
   ====================================================== */

function getSupabaseClient() {
  const client = window.supabaseClient;

  if (
    !client ||
    !client.auth ||
    typeof client.from !== "function" ||
    typeof client.rpc !== "function"
  ) {
    console.error("EcoShare: Supabase client is unavailable.");

    return null;
  }

  return client;
}

const supabaseClient = getSupabaseClient();

/* ======================================================
   4. SUPABASE ORIGIN
   ====================================================== */

function getSupabaseOrigin() {
  if (
    typeof window.ECOSHARE_SUPABASE_URL === "string" &&
    window.ECOSHARE_SUPABASE_URL.trim()
  ) {
    try {
      return new URL(window.ECOSHARE_SUPABASE_URL).origin;
    } catch {
      return null;
    }
  }

  /*
   * Fallback only for compatibility with older
   * deployments where ECOSHARE_SUPABASE_URL
   * was not exposed by supabase.js.
   */
  try {
    return new URL("https://cplbvftcbiwgqkeqmrbq.supabase.co").origin;
  } catch {
    return null;
  }
}

const SUPABASE_ORIGIN = getSupabaseOrigin();

/* ======================================================
   5. TEXT HELPERS
   ====================================================== */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function formatCategory(category) {
  const value = safeText(category, "Other");

  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/* ======================================================
   6. STATUS HELPERS
   ====================================================== */

function normalizeStatus(status) {
  const value = safeText(status).toLowerCase();

  return Object.prototype.hasOwnProperty.call(REQUEST_STATUSES, value)
    ? value
    : "unknown";
}

function formatStatus(status) {
  const normalized = normalizeStatus(status);

  return REQUEST_STATUSES[normalized] || "Unknown";
}

function getStatusIcon(status) {
  switch (normalizeStatus(status)) {
    case "pending":
      return "fa-clock";

    case "approved":
      return "fa-circle-check";

    case "rejected":
      return "fa-circle-xmark";

    case "cancelled":
      return "fa-ban";

    default:
      return "fa-circle-question";
  }
}

/* ======================================================
   7. DATE FORMATTER
   ====================================================== */

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

/* ======================================================
   8. REQUEST ID VALIDATION
   ====================================================== */

function normalizeRequestId(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const id = String(value).trim();

  /*
   * Request IDs must be positive decimal
   * integers.
   */
  if (!/^[1-9]\d*$/.test(id)) {
    return null;
  }

  /*
   * Keep the ID as a string.
   *
   * This avoids unnecessary conversion through
   * JavaScript Number and avoids precision loss
   * for large database integer identifiers.
   */
  return id;
}

/* ======================================================
   9. SAFE RESOURCE IMAGE VALIDATION
   ====================================================== */

function isSafeResourceImageUrl(imageUrl) {
  if (typeof imageUrl !== "string" || !imageUrl.trim() || !SUPABASE_ORIGIN) {
    return false;
  }

  try {
    const url = new URL(imageUrl.trim());

    if (url.protocol !== "https:") {
      return false;
    }

    if (url.origin !== SUPABASE_ORIGIN) {
      return false;
    }

    if (url.username || url.password) {
      return false;
    }

    /*
     * Resource image URLs should be direct
     * public-storage URLs.
     */
    if (url.search || url.hash) {
      return false;
    }

    if (!url.pathname.startsWith(RESOURCE_IMAGE_PATH_PREFIX)) {
      return false;
    }

    const objectPath = url.pathname.slice(RESOURCE_IMAGE_PATH_PREFIX.length);

    if (!objectPath) {
      return false;
    }

    /*
     * Reject traversal / malformed paths.
     */
    if (
      objectPath.includes("..") ||
      objectPath.includes("\\") ||
      objectPath.includes("//")
    ) {
      return false;
    }

    let decodedPath;

    try {
      decodedPath = decodeURIComponent(objectPath);
    } catch {
      return false;
    }

    if (
      decodedPath.includes("..") ||
      decodedPath.includes("\\") ||
      decodedPath.includes("//")
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/* ======================================================
   10. AUTHENTICATED USER
   ====================================================== */

async function getAuthenticatedUser() {
  if (!supabaseClient) {
    return null;
  }

  try {
    const { data, error } = await supabaseClient.auth.getUser();

    if (error) {
      console.error("EcoShare: Authentication error:", error);

      return null;
    }

    return data?.user || null;
  } catch (error) {
    console.error("EcoShare: Authentication exception:", error);

    return null;
  }
}

/* ======================================================
   11. LOGIN REDIRECT
   ====================================================== */

function redirectToLogin() {
  const returnUrl = window.location.pathname + window.location.search;

  const loginUrl = `${LOGIN_URL}?returnUrl=${encodeURIComponent(returnUrl)}`;

  window.location.replace(loginUrl);
}

/* ======================================================
   12. ERROR STATE
   ====================================================== */

function showError(message) {
  if (!requestsList) {
    return;
  }

  requestsList.hidden = false;

  requestsList.replaceChildren();

  const container = document.createElement("div");

  container.className = "requests-error";

  container.setAttribute("role", "alert");

  const icon = document.createElement("i");

  icon.className = "fa-solid fa-triangle-exclamation";

  icon.setAttribute("aria-hidden", "true");

  const heading = document.createElement("h3");

  heading.textContent = "Unable to load incoming requests";

  const paragraph = document.createElement("p");

  paragraph.textContent = safeText(message, "Please try again.");

  container.appendChild(icon);
  container.appendChild(heading);
  container.appendChild(paragraph);

  requestsList.appendChild(container);

  if (emptyRequests) {
    emptyRequests.hidden = true;
  }

  if (requestsCount) {
    requestsCount.textContent = "Unable to load requests";
  }
}

/* ======================================================
   13. LOADING STATE
   ====================================================== */

function showLoadingState() {
  if (!requestsList) {
    return;
  }

  requestsList.hidden = false;

  requestsList.replaceChildren();

  const container = document.createElement("div");

  container.className = "requests-error";

  const icon = document.createElement("i");

  icon.className = "fa-solid fa-spinner fa-spin";

  icon.setAttribute("aria-hidden", "true");

  const heading = document.createElement("h3");

  heading.textContent = "Loading requests...";

  const paragraph = document.createElement("p");

  paragraph.textContent = "Please wait while we load your incoming requests.";

  container.appendChild(icon);
  container.appendChild(heading);
  container.appendChild(paragraph);

  requestsList.appendChild(container);

  if (emptyRequests) {
    emptyRequests.hidden = true;
  }

  if (requestsCount) {
    requestsCount.textContent = "Loading requests...";
  }
}

/* ======================================================
   14. EMPTY STATE
   ====================================================== */

function showEmptyState(message) {
  if (requestsList) {
    requestsList.replaceChildren();
    requestsList.hidden = true;
  }

  if (emptyRequests) {
    emptyRequests.hidden = false;

    const paragraph = emptyRequests.querySelector("p");

    if (paragraph) {
      paragraph.textContent = safeText(
        message,
        "When someone requests one of your resources, it will appear here.",
      );
    }
  }

  if (requestsCount) {
    requestsCount.textContent = "No requests";
  }
}

/* ======================================================
   15. RESOURCE IMAGE
   ====================================================== */

function createResourceImage(resource) {
  const container = document.createElement("div");

  container.className = "incoming-request-image";

  const imageUrl = resource?.image_url;

  if (!isSafeResourceImageUrl(imageUrl)) {
    appendImagePlaceholder(container);

    return container;
  }

  const image = document.createElement("img");

  image.src = imageUrl.trim();

  image.alt = safeText(resource?.title, "Resource image");

  image.loading = "lazy";

  image.decoding = "async";

  image.addEventListener(
    "error",
    () => {
      image.remove();

      appendImagePlaceholder(container);
    },
    {
      once: true,
    },
  );

  container.appendChild(image);

  return container;
}

function appendImagePlaceholder(container) {
  if (container.querySelector("i")) {
    return;
  }

  const icon = document.createElement("i");

  icon.className = "fa-solid fa-image";

  icon.setAttribute("aria-hidden", "true");

  container.appendChild(icon);
}

/* ======================================================
   16. STATUS BADGE
   ====================================================== */

function createStatusBadge(status) {
  const container = document.createElement("div");

  container.className = "incoming-request-status";

  const normalized = normalizeStatus(status);

  const badge = document.createElement("span");

  badge.className = `status-badge status-${normalized}`;

  const icon = document.createElement("i");

  icon.className = `fa-solid ${getStatusIcon(normalized)}`;

  icon.setAttribute("aria-hidden", "true");

  const label = document.createTextNode(` ${formatStatus(status)}`);

  badge.appendChild(icon);
  badge.appendChild(label);

  container.appendChild(badge);

  return container;
}

/* ======================================================
   17. ACTION BUTTON
   ====================================================== */

function createActionButton(action, requestId) {
  const button = document.createElement("button");

  button.type = "button";

  button.className =
    action === "approved" ? "approve-request-btn" : "reject-request-btn";

  button.dataset.requestId = String(requestId);

  const icon = document.createElement("i");

  icon.className =
    action === "approved" ? "fa-solid fa-check" : "fa-solid fa-xmark";

  icon.setAttribute("aria-hidden", "true");

  const label = document.createTextNode(
    action === "approved" ? " Approve" : " Reject",
  );

  button.appendChild(icon);
  button.appendChild(label);

  return button;
}

/* ======================================================
   18. BORROWER INFORMATION
   ====================================================== */

function createInfoItem(iconClass, value) {
  const item = document.createElement("span");

  const icon = document.createElement("i");

  icon.className = iconClass;

  icon.setAttribute("aria-hidden", "true");

  item.appendChild(icon);

  item.appendChild(document.createTextNode(` ${safeText(value)}`));

  return item;
}

/* ======================================================
   19. REQUEST CARD
   ====================================================== */

function createRequestCard(request, highlightedId) {
  if (!request || typeof request !== "object") {
    return null;
  }

  const requestId = normalizeRequestId(request.id);

  if (!requestId) {
    return null;
  }

  const resource = {
    title: request.title,

    description: request.description,

    category: request.category,

    location: request.resource_location,

    image_url: request.image_url,

    available: request.available,
  };

  const borrower = {
    full_name: request.borrower_name,

    location: request.borrower_location,
  };

  const card = document.createElement("article");

  card.className = "incoming-request-card";

  card.dataset.requestId = requestId;

  card.setAttribute(
    "aria-label",
    `Borrow request for ${safeText(resource.title, "resource")}`,
  );

  /* ----------------------------------------------
       Highlight
       ---------------------------------------------- */

  if (highlightedId && highlightedId === requestId) {
    card.classList.add("highlighted-request");
  }

  /* ----------------------------------------------
       Image
       ---------------------------------------------- */

  card.appendChild(createResourceImage(resource));

  /* ----------------------------------------------
       Main content
       ---------------------------------------------- */

  const content = document.createElement("div");

  content.className = "incoming-request-content";

  /* Category */

  const category = document.createElement("span");

  category.className = "request-category";

  category.textContent = formatCategory(resource.category);

  content.appendChild(category);

  /* Title */

  const title = document.createElement("h3");

  title.textContent = safeText(resource.title, "Untitled resource");

  content.appendChild(title);

  /* Description */

  const description = document.createElement("p");

  description.className = "resource-description";

  description.textContent = safeText(
    resource.description,
    "No description provided.",
  );

  content.appendChild(description);

  /* ----------------------------------------------
       Borrower information
       ---------------------------------------------- */

  const borrowerInfo = document.createElement("div");

  borrowerInfo.className = "borrower-info";

  /* Borrower */

  borrowerInfo.appendChild(
    createInfoItem("fa-solid fa-user", borrower.full_name || "Unknown user"),
  );

  /* Location */

  if (safeText(borrower.location)) {
    borrowerInfo.appendChild(
      createInfoItem("fa-solid fa-location-dot", borrower.location),
    );
  }

  /* Date */

  borrowerInfo.appendChild(
    createInfoItem("fa-regular fa-calendar", formatDate(request.created_at)),
  );

  content.appendChild(borrowerInfo);

  /* ----------------------------------------------
       Borrower message
       ---------------------------------------------- */

  const messageContainer = document.createElement("div");

  messageContainer.className = "request-message";

  const messageHeading = document.createElement("strong");

  messageHeading.textContent = "Borrower's Message";

  const messageParagraph = document.createElement("p");

  messageParagraph.textContent = safeText(
    request.message,
    "No message provided.",
  );

  messageContainer.appendChild(messageHeading);

  messageContainer.appendChild(messageParagraph);

  content.appendChild(messageContainer);

  /* ----------------------------------------------
       Actions
       ---------------------------------------------- */

  if (normalizeStatus(request.status) === "pending") {
    const actions = document.createElement("div");

    actions.className = "incoming-request-actions";

    const approveButton = createActionButton("approved", requestId);

    const rejectButton = createActionButton("rejected", requestId);

    approveButton.addEventListener("click", () => {
      updateRequestStatus(requestId, "approved", card);
    });

    rejectButton.addEventListener("click", () => {
      updateRequestStatus(requestId, "rejected", card);
    });

    actions.appendChild(approveButton);

    actions.appendChild(rejectButton);

    content.appendChild(actions);
  }

  card.appendChild(content);

  /* ----------------------------------------------
       Status
       ---------------------------------------------- */

  card.appendChild(createStatusBadge(request.status));

  return card;
}

/* ======================================================
   20. DISPLAY REQUESTS
   ====================================================== */

function displayRequests(requests) {
  if (!requestsList) {
    return;
  }

  requestsList.replaceChildren();

  if (!Array.isArray(requests)) {
    showEmptyState(
      "When someone requests one of your resources, it will appear here.",
    );

    return;
  }

  let renderedCount = 0;
  let highlightedCard = null;

  const fragment = document.createDocumentFragment();

  for (const request of requests) {
    const card = createRequestCard(request, highlightedRequestId);

    if (!card) {
      continue;
    }

    renderedCount += 1;

    if (
      highlightedRequestId &&
      card.dataset.requestId === highlightedRequestId
    ) {
      highlightedCard = card;
    }

    fragment.appendChild(card);
  }

  if (renderedCount === 0) {
    showEmptyState(
      "When someone requests one of your resources, it will appear here.",
    );

    return;
  }

  requestsList.appendChild(fragment);

  requestsList.hidden = false;

  if (emptyRequests) {
    emptyRequests.hidden = true;
  }

  if (requestsCount) {
    requestsCount.textContent = `${renderedCount} request${
      renderedCount === 1 ? "" : "s"
    }`;
  }

  if (highlightedCard) {
    requestAnimationFrame(() => {
      highlightedCard.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }
}

/* ======================================================
   21. LOAD INCOMING REQUESTS
   ====================================================== */

let loadRequestSequence = 0;

async function loadIncomingRequests() {
  const currentLoad = ++loadRequestSequence;

  if (!supabaseClient) {
    showError("EcoShare could not connect to Supabase.");

    return;
  }

  const user = await getAuthenticatedUser();

  if (currentLoad !== loadRequestSequence) {
    return;
  }

  if (!user) {
    redirectToLogin();
    return;
  }

  showLoadingState();

  try {
    /*
     * IMPORTANT:
     *
     * Do not add borrower/owner filters here.
     *
     * incoming_request_listings is expected
     * to be owner-scoped by the database/RLS
     * architecture.
     */
    const { data: requests, error } = await supabaseClient
      .from("incoming_request_listings")
      .select(
        [
          "id",
          "resource_id",
          "borrower_id",
          "message",
          "status",
          "created_at",
          "updated_at",
          "title",
          "description",
          "category",
          "resource_location",
          "image_url",
          "available",
          "borrower_name",
          "borrower_location",
        ].join(", "),
      )
      .order("created_at", {
        ascending: false,
      });

    if (currentLoad !== loadRequestSequence) {
      return;
    }

    if (error) {
      console.error("EcoShare: Incoming requests error:", error);

      showError(
        "Unable to load incoming requests. Please refresh the page and try again.",
      );

      return;
    }

    if (!Array.isArray(requests) || requests.length === 0) {
      showEmptyState(
        "When someone requests one of your resources, it will appear here.",
      );

      return;
    }

    displayRequests(requests);
  } catch (error) {
    if (currentLoad !== loadRequestSequence) {
      return;
    }

    console.error("EcoShare: Failed to load incoming requests:", error);

    showError(
      "Unable to load incoming requests. Please refresh the page and try again.",
    );
  }
}

/* ======================================================
   22. SAFE ACTION ERROR MESSAGE
   ====================================================== */

function getSafeRequestErrorMessage(error, action) {
  const message = String(error?.message || "").toLowerCase();

  if (
    message.includes("authentication required") ||
    message.includes("not authenticated") ||
    message.includes("jwt") ||
    message.includes("session")
  ) {
    return "Your session has expired. Please log in again.";
  }

  if (
    message.includes("access denied") ||
    message.includes("not authorized") ||
    message.includes("permission denied")
  ) {
    return `You are not authorized to ${action} this request.`;
  }

  if (
    message.includes("request not found") ||
    message.includes("resource not found")
  ) {
    return "This request could not be found or is no longer available.";
  }

  if (message.includes("already") || message.includes("status")) {
    return "This request has already been processed or is no longer pending.";
  }

  return `Unable to ${action} the request. Please try again.`;
}

/* ======================================================
   23. ACTION BUTTON LOADING
   ====================================================== */

function setActionButtonLoading(button, loadingText) {
  if (!button) {
    return;
  }

  button.disabled = true;

  button.replaceChildren();

  const icon = document.createElement("i");

  icon.className = "fa-solid fa-spinner fa-spin";

  icon.setAttribute("aria-hidden", "true");

  button.appendChild(icon);

  button.appendChild(document.createTextNode(` ${loadingText}`));
}

/* ======================================================
   24. RESTORE ACTION BUTTONS
   ====================================================== */

function restoreActionButtons(approveButton, rejectButton) {
  if (approveButton) {
    approveButton.disabled = false;

    approveButton.replaceChildren();

    const icon = document.createElement("i");

    icon.className = "fa-solid fa-check";

    icon.setAttribute("aria-hidden", "true");

    approveButton.appendChild(icon);

    approveButton.appendChild(document.createTextNode(" Approve"));
  }

  if (rejectButton) {
    rejectButton.disabled = false;

    rejectButton.replaceChildren();

    const icon = document.createElement("i");

    icon.className = "fa-solid fa-xmark";

    icon.setAttribute("aria-hidden", "true");

    rejectButton.appendChild(icon);

    rejectButton.appendChild(document.createTextNode(" Reject"));
  }
}

/* ======================================================
   25. UPDATE REQUEST STATUS
   ====================================================== */

const requestsBeingUpdated = new Set();

async function updateRequestStatus(requestId, newStatus, card) {
  const normalizedId = normalizeRequestId(requestId);

  if (!normalizedId || !card) {
    return;
  }

  if (newStatus !== "approved" && newStatus !== "rejected") {
    return;
  }

  /*
   * Prevent double-click / duplicate RPC
   * requests for the same request.
   */
  if (requestsBeingUpdated.has(normalizedId)) {
    return;
  }

  const actionName = newStatus === "approved" ? "approve" : "reject";

  const confirmed = window.confirm(
    `Are you sure you want to ${actionName} this request?`,
  );

  if (!confirmed) {
    return;
  }

  if (!supabaseClient) {
    window.alert(
      "EcoShare could not connect to Supabase. Please refresh the page and try again.",
    );

    return;
  }

  const approveButton = card.querySelector(".approve-request-btn");

  const rejectButton = card.querySelector(".reject-request-btn");

  requestsBeingUpdated.add(normalizedId);

  if (approveButton) {
    approveButton.disabled = true;
  }

  if (rejectButton) {
    rejectButton.disabled = true;
  }

  const activeButton = newStatus === "approved" ? approveButton : rejectButton;

  setActionButtonLoading(
    activeButton,
    newStatus === "approved" ? "Approving..." : "Rejecting...",
  );

  try {
    /*
     * Verify the current session before
     * performing the privileged operation.
     */
    const user = await getAuthenticatedUser();

    if (!user) {
      redirectToLogin();
      return;
    }

    let rpcName;

    if (newStatus === "approved") {
      rpcName = "approve_borrow_request";
    } else {
      rpcName = "reject_borrow_request";
    }

    /*
     * The RPC is authoritative.
     *
     * Authorization, request ownership,
     * request status, resource availability,
     * and related business rules must be
     * enforced by the database function.
     */
    const { error } = await supabaseClient.rpc(rpcName, {
      request_id: normalizedId,
    });

    if (error) {
      console.error(`EcoShare: ${actionName} request error:`, error);

      restoreActionButtons(approveButton, rejectButton);

      window.alert(getSafeRequestErrorMessage(error, actionName));

      return;
    }

    /*
     * Reload from the database instead of
     * manually changing the card.
     *
     * This ensures the UI reflects the
     * authoritative database state.
     */
    await loadIncomingRequests();
  } catch (error) {
    console.error(`EcoShare: Failed to ${actionName} request:`, error);

    restoreActionButtons(approveButton, rejectButton);

    window.alert(getSafeRequestErrorMessage(error, actionName));
  } finally {
    requestsBeingUpdated.delete(normalizedId);
  }
}

/* ======================================================
   26. URL HIGHLIGHT REQUEST
   ====================================================== */

const urlParams = new URLSearchParams(window.location.search);

const highlightedRequestId = normalizeRequestId(urlParams.get("requestId"));

/* ======================================================
   27. AUTH STATE LISTENER
   ====================================================== */

let authListenerRegistered = false;

function registerAuthListener() {
  if (authListenerRegistered || !supabaseClient?.auth) {
    return;
  }

  authListenerRegistered = true;

  try {
    supabaseClient.auth.onAuthStateChange((event) => {
      /*
       * Ignore TOKEN_REFRESHED because
       * reloading the request list on every
       * token refresh is unnecessary.
       */
      if (event === "TOKEN_REFRESHED") {
        return;
      }

      updateAuthNavigation();

      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        loadIncomingRequests();
      }
    });
  } catch (error) {
    console.error("EcoShare: Unable to register auth listener:", error);
  }
}

/* ======================================================
   28. AUTH NAVIGATION
   ====================================================== */

let authNavigationRequestId = 0;

async function updateAuthNavigation() {
  const button = document.getElementById("authNavButton");

  if (!button || !supabaseClient) {
    return;
  }

  const requestId = ++authNavigationRequestId;

  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (requestId !== authNavigationRequestId) {
      return;
    }

    if (error) {
      console.error("EcoShare: Session error:", error);

      return;
    }

    const session = data?.session;

    button.replaceChildren();

    const icon = document.createElement("i");

    icon.setAttribute("aria-hidden", "true");

    if (session) {
      icon.className = "fa-solid fa-user";

      button.appendChild(icon);

      button.appendChild(document.createTextNode(" Profile"));

      button.href = "../Phase 1/profile.html";

      button.setAttribute("aria-label", "Open profile");
    } else {
      icon.className = "fa-solid fa-right-to-bracket";

      button.appendChild(icon);

      button.appendChild(document.createTextNode(" Login"));

      button.href = LOGIN_URL;

      button.setAttribute("aria-label", "Login");
    }
  } catch (error) {
    console.error("EcoShare: Authentication navigation error:", error);
  }
}

/* ======================================================
   29. INITIALIZATION
   ====================================================== */

let initialized = false;

async function initializeIncomingRequests() {
  if (initialized) {
    return;
  }

  initialized = true;

  if (!supabaseClient) {
    showError("EcoShare could not initialize its Supabase connection.");

    return;
  }

  registerAuthListener();

  await updateAuthNavigation();

  await loadIncomingRequests();
}

/* ======================================================
   30. START
   ====================================================== */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeIncomingRequests, {
    once: true,
  });
} else {
  initializeIncomingRequests();
}
