/*
=========================================================
  EcoShare - User Dashboard

  File: user-dashboard.js

  Dashboard-specific functionality only.

  Global functionality:
    page.js

  Dashboard functionality:
    - Authentication
    - Profile
    - Statistics
    - Listings
    - Borrow Requests
    - Received Requests
    - Filters
    - Navigation

  Security:
    - UI checks are NOT authorization.
    - Supabase RLS must enforce access control.
    - No service-role credentials are used here.
=========================================================
*/

"use strict";

/* =========================================================
   1. SUPABASE
   ========================================================= */

const client = window.supabaseClient || null;

/* =========================================================
   2. ROUTES
   ========================================================= */

const ROUTES = Object.freeze({
  home: "../index.html",
  login: "../Phase 1/login.html",
  profile: "../Phase 1/profile.html",

  addResource: "../Phase 2/lend-resource.html",
  myListings: "../Phase 2/my-listings.html",
  myRequests: "../Phase 2/my-requests.html",
  incomingRequests: "../Phase 2/incoming-requests.html",
  resourceDetails: "../Phase 2/resource-details.html",
});

/* =========================================================
   3. FILTERS
   ========================================================= */

const RECEIVED_FILTERS = Object.freeze([
  "all",
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

const BORROWING_FILTERS = Object.freeze([
  "all",
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "returned",
]);

const RECEIVED_TABLE_COLS = 5;
const BORROWING_TABLE_COLS = 4;

/* =========================================================
   4. DOM HELPERS
   ========================================================= */

const $ = (id) => document.getElementById(id);

/* Profile */
const userName = $("userName");
const profileName = $("profileName");
const profileEmail = $("profileEmail");
const profileAvatar = $("profileAvatar");

/* Statistics */
const totalListings = $("totalListings");
const pendingRequests = $("pendingRequests");
const approvedRequests = $("approvedRequests");
const myBorrowRequests = $("myBorrowRequests");

/* Listings */
const listingsContainer = $("listingsContainer");

/* Requests */
const receivedRequestsBody = $("receivedRequestsBody");
const myRequestsBody = $("myRequestsBody");

/* Message */
const dashboardMessage = $("dashboardMessage");

/* Filters */
const receivedRequestFilters = $("receivedRequestFilters");
const myBorrowRequestFilters = $("myBorrowRequestFilters");

/* Stat navigation */
const myListingsStat = $("myListingsStat");
const pendingRequestsStat = $("pendingRequestsStat");
const approvedRequestsStat = $("approvedRequestsStat");
const myBorrowRequestsStat = $("myBorrowRequestsStat");

/* Add resource */
const addResourceBtn = $("addResourceBtn");

/* =========================================================
   5. STATE
   ========================================================= */

let currentUser = null;
let currentProfile = null;

let myListings = [];
let receivedRequests = [];
let borrowingRequests = [];

let receivedFilter = "all";
let borrowingFilter = "all";

let resourceTitleMap = new Map();
let borrowerNameMap = new Map();

let dashboardInitialized = false;
let authListenerRegistered = false;

let listingsRequestId = 0;
let receivedRequestsRequestId = 0;
let borrowingRequestsRequestId = 0;

/* =========================================================
   6. SECURITY / GENERAL HELPERS
   ========================================================= */

/*
 * Escape dynamic content before inserting HTML.
 */
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

/*
 * Get the shared avatar system.

 * page.js exposes EcoShareAvatar and is the source of truth
 * for:
 *   uploaded avatar
 *   gender avatar
 *   default avatar
 */
function getSharedAvatarURL(user, profile) {
  try {
    if (
      window.EcoShareAvatar &&
      typeof window.EcoShareAvatar.getAvatarURL === "function"
    ) {
      return window.EcoShareAvatar.getAvatarURL(user, profile);
    }
  } catch (error) {
    console.warn("[EcoShare Dashboard] Shared avatar lookup failed.", error);
  }

  /*
   * Do not fall back to a local /assets path.
   *
   * The HTML intentionally has no hardcoded avatar source.
   * page.js should normally populate the shared avatar.
   */
  return "";
}

/*
 * Only allow HTTP/HTTPS image URLs.
 */
function safeImageURL(url) {
  if (!url) {
    return "";
  }

  const value = String(url).trim();

  if (!value) {
    return "";
  }

  try {
    const parsed = new URL(value, window.location.href);

    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch (error) {
    return "";
  }

  return "";
}

/*
 * Safely set an avatar.

 * The shared page.js avatar system is preferred.
 * If it is unavailable, the image is simply cleared rather
 * than requesting the old local /assets/avatar-default.png.
 */
function setAvatar(imageElement, url) {
  if (!imageElement) {
    return;
  }

  imageElement.onerror = () => {
    imageElement.onerror = null;
    imageElement.removeAttribute("src");
  };

  const safeURL = safeImageURL(url);

  if (safeURL) {
    imageElement.src = safeURL;
  } else {
    imageElement.removeAttribute("src");
  }
}

/*
 * Normalize status values.
 */
function normalizeStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase();
}

/*
 * Convert database values into readable text.
 */
function formatCategory(value) {
  if (!value) {
    return "Other";
  }

  return String(value)
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/*
 * Format dates for India.
 */
function formatDate(value) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/*
 * Set a numeric UI value.
 */
function setCount(element, count) {
  if (!element) {
    return;
  }

  const numericCount = Number(count);

  const safeCount = Number.isFinite(numericCount) ? numericCount : 0;

  element.textContent = String(safeCount);
}

/*
 * Logging helper.
 */
function logError(message, error) {
  console.error(`[EcoShare Dashboard] ${message}`, error);
}

/* =========================================================
   7. DASHBOARD MESSAGES
   ========================================================= */

function showMessage(message, type = "error") {
  if (!dashboardMessage) {
    return;
  }

  dashboardMessage.textContent = String(message || "");
  dashboardMessage.hidden = false;

  dashboardMessage.classList.remove("message-success", "message-error");

  dashboardMessage.classList.add(
    type === "success" ? "message-success" : "message-error",
  );
}

function hideMessage() {
  if (!dashboardMessage) {
    return;
  }

  dashboardMessage.textContent = "";
  dashboardMessage.hidden = true;

  dashboardMessage.classList.remove("message-success", "message-error");
}

/* =========================================================
   8. TABLE HELPERS
   ========================================================= */

function setLoading(element, message, colspan = 1) {
  if (!element) {
    return;
  }

  const safeColspan = Math.max(1, Number(colspan) || 1);

  element.innerHTML = `
        <tr>
            <td
                colspan="${safeColspan}"
                class="loading-text"
            >
                ${escapeHTML(message)}
            </td>
        </tr>
    `;
}

function setTableMessage(element, message, colspan = 1) {
  if (!element) {
    return;
  }

  const safeColspan = Math.max(1, Number(colspan) || 1);

  element.innerHTML = `
        <tr>
            <td
                colspan="${safeColspan}"
                class="empty-state"
            >
                ${escapeHTML(message)}
            </td>
        </tr>
    `;
}

/* =========================================================
   9. STATUS HELPERS
   ========================================================= */

function getStatusClass(status) {
  const normalized = normalizeStatus(status);

  const validStatuses = [
    "pending",
    "approved",
    "rejected",
    "cancelled",
    "returned",
  ];

  return validStatuses.includes(normalized)
    ? `status-${normalized}`
    : "status-default";
}

function createStatusBadge(status) {
  const normalized = normalizeStatus(status);

  const label = normalized ? formatCategory(normalized) : "Unknown";

  return `
        <span class="status-badge ${getStatusClass(status)}">
            ${escapeHTML(label)}
        </span>
    `;
}

/* =========================================================
   10. RESOURCE HELPERS
   ========================================================= */

function getResourceTitle(resourceId) {
  const key = String(resourceId ?? "");

  const resource = myListings.find((item) => String(item.id) === key);

  return (
    resource?.title ||
    resourceTitleMap.get(key) ||
    `Resource #${key || "Unknown"}`
  );
}

function getResourceURL(resourceId) {
  const params = new URLSearchParams();

  params.set("id", String(resourceId ?? ""));

  return `${ROUTES.resourceDetails}?${params.toString()}`;
}

function isResourceAvailable(resource) {
  if (!resource) {
    return false;
  }

  if (typeof resource.available === "boolean") {
    return resource.available;
  }

  /*
   * Unknown availability is treated as unavailable.
   */
  return false;
}

/* =========================================================
   11. PROFILE
   ========================================================= */

function getProfileName(profile, user) {
  const metadata = user?.user_metadata || {};

  return (
    profile?.full_name ||
    metadata.full_name ||
    metadata.name ||
    metadata.username ||
    user?.email?.split("@")[0] ||
    "EcoShare Member"
  );
}

function updateDashboardProfile(user, profile) {
  const name = getProfileName(profile, user);

  const avatar = getSharedAvatarURL(user, profile);

  if (userName) {
    userName.textContent = name;
  }

  if (profileName) {
    profileName.textContent = name;
  }

  if (profileEmail) {
    profileEmail.textContent = user?.email || "—";
  }

  setAvatar(profileAvatar, avatar);
}

/* =========================================================
   12. NAVIGATION
   ========================================================= */

function navigateTo(url) {
  if (!url) {
    return;
  }

  window.location.assign(url);
}

function buildStatusURL(route, status, section) {
  const params = new URLSearchParams();

  const normalized = normalizeStatus(status);

  if (normalized && normalized !== "all") {
    params.set("status", normalized);
  }

  if (section) {
    params.set("section", section);
  }

  const query = params.toString();

  return query ? `${route}?${query}` : route;
}

function navigateToIncomingRequests(status = "all") {
  const normalized = normalizeStatus(status);

  const safeStatus = RECEIVED_FILTERS.includes(normalized) ? normalized : "all";

  navigateTo(buildStatusURL(ROUTES.incomingRequests, safeStatus, "received"));
}

function navigateToMyRequests(status = "all") {
  const normalized = normalizeStatus(status);

  const safeStatus = BORROWING_FILTERS.includes(normalized)
    ? normalized
    : "all";

  navigateTo(buildStatusURL(ROUTES.myRequests, safeStatus, "borrowing"));
}

/* =========================================================
   13. STATISTICS NAVIGATION
   ========================================================= */

function setupStatisticsNavigation() {
  if (myListingsStat) {
    myListingsStat.href = ROUTES.myListings;

    myListingsStat.addEventListener("click", (event) => {
      event.preventDefault();

      navigateTo(ROUTES.myListings);
    });
  }

  if (pendingRequestsStat) {
    pendingRequestsStat.href = buildStatusURL(
      ROUTES.incomingRequests,
      "pending",
      "received",
    );

    pendingRequestsStat.addEventListener("click", (event) => {
      event.preventDefault();

      navigateToIncomingRequests("pending");
    });
  }

  if (approvedRequestsStat) {
    approvedRequestsStat.href = buildStatusURL(
      ROUTES.incomingRequests,
      "approved",
      "received",
    );

    approvedRequestsStat.addEventListener("click", (event) => {
      event.preventDefault();

      navigateToIncomingRequests("approved");
    });
  }

  if (myBorrowRequestsStat) {
    myBorrowRequestsStat.href = buildStatusURL(
      ROUTES.myRequests,
      "all",
      "borrowing",
    );

    myBorrowRequestsStat.addEventListener("click", (event) => {
      event.preventDefault();

      navigateToMyRequests("all");
    });
  }

  if (addResourceBtn) {
    addResourceBtn.href = ROUTES.addResource;
  }
}

/* =========================================================
   14. LOAD MY LISTINGS
   ========================================================= */

async function loadMyListings(user) {
  if (!client) {
    throw new Error("Supabase client is unavailable.");
  }

  if (!user?.id) {
    throw new Error("Authenticated user is unavailable.");
  }

  const requestId = ++listingsRequestId;

  setLoading(listingsContainer, "Loading your listings...", 1);

  const { data, error } = await client
    .from("resource_listings")
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
latitude,
longitude,
price_per_hour,
price_per_day,
buy_price
        `,
    )
    .eq("owner_id", user.id)
    .order("created_at", {
      ascending: false,
    })
    .limit(100);

  if (requestId !== listingsRequestId) {
    return [];
  }

  if (error) {
    logError("Listings loading error:", error);

    myListings = [];

    renderMyListings();

    throw error;
  }

  myListings = Array.isArray(data) ? data : [];

  resourceTitleMap.clear();

  myListings.forEach((resource) => {
    if (resource?.id !== null && resource?.id !== undefined) {
      resourceTitleMap.set(
        String(resource.id),
        resource.title || `Resource #${resource.id}`,
      );
    }
  });

  setCount(totalListings, myListings.length);

  renderMyListings();

  return myListings;
}

/* =========================================================
   15. RENDER MY LISTINGS
   ========================================================= */

function renderMyListings() {
  if (!listingsContainer) {
    return;
  }

  if (myListings.length === 0) {
    listingsContainer.innerHTML = `
            <div class="empty-state">
                <i
                    class="fa-solid fa-box-open"
                    aria-hidden="true"
                ></i>

                <h3>
                    No listings yet
                </h3>

                <p>
                    You haven't shared any
                    resources yet.
                </p>

                <p>
                    Add your first resource
                    and start sharing.
                </p>

                <a
                    href="${ROUTES.addResource}"
                    class="primary-btn"
                >
                    <i
                        class="fa-solid fa-plus"
                        aria-hidden="true"
                    ></i>

                    Add Your First Resource
                </a>
            </div>
        `;

    listingsContainer.setAttribute("aria-busy", "false");

    return;
  }

  listingsContainer.innerHTML = myListings
    .map((resource) => {
      const resourceId = escapeHTML(resource.id);

      const title = escapeHTML(resource.title || "Untitled Resource");

      const description = escapeHTML(
        resource.description || "No description available.",
      );

      const category = escapeHTML(formatCategory(resource.category));

      const location = escapeHTML(
        resource.location || "Location not specified",
      );

      const imageURL = safeImageURL(resource.image_url);

      const available = isResourceAvailable(resource);

      const availability = available
        ? `
                            <span
                                class="availability available"
                            >
                                <i
                                    class="fa-solid fa-circle-check"
                                    aria-hidden="true"
                                ></i>

                                Available
                            </span>
                        `
        : `
                            <span
                                class="availability unavailable"
                            >
                                <i
                                    class="fa-solid fa-circle-xmark"
                                    aria-hidden="true"
                                ></i>

                                Unavailable
                            </span>
                        `;

      const image = imageURL
        ? `
                            <img
                                class="listing-image"
                                src="${escapeHTML(imageURL)}"
                                alt="${title}"
                                loading="lazy"
                                decoding="async"
                            >
                        `
        : `
                            <div
                                class="
                                    listing-image
                                    listing-image-placeholder
                                "
                                aria-hidden="true"
                            >
                                <i
                                    class="
                                        fa-solid
                                        fa-box-open
                                    "
                                ></i>
                            </div>
                        `;

      return `
                    <article
                        class="
                            listing-card
                            resource-card
                        "
                        data-resource-id="${resourceId}"
                        tabindex="0"
                        role="link"
                        aria-label="
                            View details for ${title}
                        "
                    >

                        ${image}

                        <div class="listing-content">

                            <span class="listing-category">
                                ${category}
                            </span>

                            <h3>
                                ${title}
                            </h3>

                            <p>
                                ${description}
                            </p>

                            <div class="listing-location">

                                <i
                                    class="
                                        fa-solid
                                        fa-location-dot
                                    "
                                    aria-hidden="true"
                                ></i>

                                ${location}

                            </div>

                            ${availability}

                            <a
                                href="${getResourceURL(resource.id)}"
                                class="
                                    primary-btn
                                    listing-view-btn
                                "
                                data-resource-link
                            >
                                View Details

                                <i
                                    class="
                                        fa-solid
                                        fa-arrow-right
                                    "
                                    aria-hidden="true"
                                ></i>
                            </a>

                        </div>

                    </article>
                `;
    })
    .join("");

  /*
   * Broken image fallback.
   */
  listingsContainer.querySelectorAll("img.listing-image").forEach((image) => {
    image.addEventListener(
      "error",
      () => {
        const placeholder = document.createElement("div");

        placeholder.className = "listing-image listing-image-placeholder";

        placeholder.setAttribute("aria-hidden", "true");

        const icon = document.createElement("i");

        icon.className = "fa-solid fa-box-open";

        placeholder.appendChild(icon);

        image.replaceWith(placeholder);
      },
      {
        once: true,
      },
    );
  });

  listingsContainer.setAttribute("aria-busy", "false");

  setupListingCardNavigation();
}

/* =========================================================
   16. LISTING CARD NAVIGATION
   ========================================================= */

function setupListingCardNavigation() {
  if (!listingsContainer) {
    return;
  }

  listingsContainer.querySelectorAll(".resource-card").forEach((card) => {
    const resourceId = card.dataset.resourceId;

    if (!resourceId) {
      return;
    }

    const url = getResourceURL(resourceId);

    card.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) {
        return;
      }

      navigateTo(url);
    });

    card.addEventListener("keydown", (event) => {
      if (
        event.target !== card ||
        (event.key !== "Enter" && event.key !== " ")
      ) {
        return;
      }

      event.preventDefault();

      navigateTo(url);
    });
  });
}

/* =========================================================
   17. LOAD RECEIVED REQUESTS
   ========================================================= */

async function loadReceivedRequests(user, listings) {
  const requestId = ++receivedRequestsRequestId;

  receivedRequests = [];

  const resourceIds = (listings || [])
    .map((item) => item?.id)
    .filter((id) => id !== null && id !== undefined);

  if (resourceIds.length === 0) {
    setCount(pendingRequests, 0);

    setCount(approvedRequests, 0);

    setTableMessage(
      receivedRequestsBody,
      "No requests received yet.",
      RECEIVED_TABLE_COLS,
    );

    return [];
  }

  setLoading(
    receivedRequestsBody,
    "Loading received requests...",
    RECEIVED_TABLE_COLS,
  );

  const { data, error } = await client
    .from("borrow_requests")
    .select(
      `
            id,
            resource_id,
            borrower_id,
            message,
            status,
            created_at
        `,
    )
    .in("resource_id", resourceIds)
    .order("created_at", {
      ascending: false,
    })
    .limit(200);

  if (requestId !== receivedRequestsRequestId) {
    return [];
  }

  if (error) {
    logError("Received requests error:", error);

    setTableMessage(
      receivedRequestsBody,
      "Unable to load received requests. Please check your Supabase permissions.",
      RECEIVED_TABLE_COLS,
    );

    return [];
  }

  receivedRequests = Array.isArray(data) ? data : [];

  updateReceivedRequestStatistics();

  await loadBorrowerProfiles(receivedRequests);

  if (requestId !== receivedRequestsRequestId) {
    return [];
  }

  renderReceivedRequests();

  return receivedRequests;
}

/* =========================================================
   18. RECEIVED REQUEST STATISTICS
   ========================================================= */

function updateReceivedRequestStatistics() {
  const pendingCount = receivedRequests.filter(
    (request) => normalizeStatus(request.status) === "pending",
  ).length;

  const approvedCount = receivedRequests.filter(
    (request) => normalizeStatus(request.status) === "approved",
  ).length;

  setCount(pendingRequests, pendingCount);

  setCount(approvedRequests, approvedCount);
}

/* =========================================================
   19. BORROWER PROFILES
   ========================================================= */

async function loadBorrowerProfiles(requests) {
  const borrowerIds = [
    ...new Set(
      requests
        .map((request) => request.borrower_id)
        .filter(Boolean)
        .map(String),
    ),
  ];

  borrowerNameMap = new Map();

  if (borrowerIds.length === 0) {
    return;
  }

  const { data, error } = await client
    .from("profiles")
    .select("id, full_name")
    .in("id", borrowerIds);

  if (error) {
    logError("Borrower profiles error:", error);

    return;
  }

  (data || []).forEach((profile) => {
    borrowerNameMap.set(
      String(profile.id),
      profile.full_name || "EcoShare Member",
    );
  });
}

/* =========================================================
   20. RENDER RECEIVED REQUESTS
   ========================================================= */

function renderReceivedRequests() {
  if (!receivedRequestsBody) {
    return;
  }

  const filteredRequests =
    receivedFilter === "all"
      ? receivedRequests
      : receivedRequests.filter(
          (request) => normalizeStatus(request.status) === receivedFilter,
        );

  if (filteredRequests.length === 0) {
    const message =
      receivedFilter === "all"
        ? "No requests received yet."
        : `No ${formatCategory(receivedFilter)} requests found.`;

    setTableMessage(receivedRequestsBody, message, RECEIVED_TABLE_COLS);

    return;
  }

  receivedRequestsBody.innerHTML = filteredRequests
    .map((request) => {
      const borrowerName =
        borrowerNameMap.get(String(request.borrower_id)) || "EcoShare Member";

      const resourceTitle = getResourceTitle(request.resource_id);

      return `
                    <tr
                        class="request-row"
                        data-request-id="${escapeHTML(request.id)}"
                        data-status="${escapeHTML(
                          normalizeStatus(request.status),
                        )}"
                    >

                        <td>
                            <a
                                href="${getResourceURL(request.resource_id)}"
                                class="table-resource-link"
                            >
                                ${escapeHTML(resourceTitle)}
                            </a>
                        </td>

                        <td>
                            ${escapeHTML(borrowerName)}
                        </td>

                        <td>
                            ${escapeHTML(request.message || "No message")}
                        </td>

                        <td>
                            ${createStatusBadge(request.status)}
                        </td>

                        <td>
                            ${escapeHTML(formatDate(request.created_at))}
                        </td>

                    </tr>
                `;
    })
    .join("");
}

/* =========================================================
   21. LOAD MY BORROW REQUESTS
   ========================================================= */

async function loadMyBorrowRequests(user) {
  if (!user?.id) {
    throw new Error("Authenticated user is unavailable.");
  }

  const requestId = ++borrowingRequestsRequestId;

  setLoading(
    myRequestsBody,
    "Loading your borrowing activity...",
    BORROWING_TABLE_COLS,
  );

  const { data, error } = await client
    .from("borrow_requests")
    .select(
      `
            id,
            resource_id,
            borrower_id,
            message,
            status,
            created_at
        `,
    )
    .eq("borrower_id", user.id)
    .order("created_at", {
      ascending: false,
    })
    .limit(200);

  if (requestId !== borrowingRequestsRequestId) {
    return [];
  }

  if (error) {
    logError("My borrowing requests error:", error);

    setTableMessage(
      myRequestsBody,
      "Unable to load your borrowing activity. Please check your Supabase permissions.",
      BORROWING_TABLE_COLS,
    );

    return [];
  }

  borrowingRequests = Array.isArray(data) ? data : [];

  setCount(myBorrowRequests, borrowingRequests.length);

  await loadBorrowedResourceTitles(borrowingRequests);

  if (requestId !== borrowingRequestsRequestId) {
    return [];
  }

  renderMyBorrowRequests();

  return borrowingRequests;
}

/* =========================================================
   22. LOAD RESOURCE TITLES
   ========================================================= */

async function loadBorrowedResourceTitles(requests) {
  const resourceIds = [
    ...new Set(
      requests
        .map((request) => request.resource_id)
        .filter((id) => id !== null && id !== undefined)
        .map(String),
    ),
  ];

  if (resourceIds.length === 0) {
    return;
  }

  const { data, error } = await client
    .from("resource_listings")
    .select("id, title")
    .in("id", resourceIds);

  if (error) {
    logError("Borrowed resource titles error:", error);

    return;
  }

  (data || []).forEach((resource) => {
    resourceTitleMap.set(
      String(resource.id),
      resource.title || `Resource #${resource.id}`,
    );
  });
}

/* =========================================================
   23. RENDER MY BORROW REQUESTS
   ========================================================= */

function renderMyBorrowRequests() {
  if (!myRequestsBody) {
    return;
  }

  const filteredRequests =
    borrowingFilter === "all"
      ? borrowingRequests
      : borrowingRequests.filter(
          (request) => normalizeStatus(request.status) === borrowingFilter,
        );

  if (filteredRequests.length === 0) {
    const message =
      borrowingFilter === "all"
        ? "You haven't requested any resources yet."
        : `No ${formatCategory(borrowingFilter)} borrowing requests found.`;

    setTableMessage(myRequestsBody, message, BORROWING_TABLE_COLS);

    return;
  }

  myRequestsBody.innerHTML = filteredRequests
    .map((request) => {
      const resourceTitle =
        resourceTitleMap.get(String(request.resource_id)) ||
        `Resource #${request.resource_id}`;

      return `
                    <tr
                        class="request-row"
                        data-request-id="${escapeHTML(request.id)}"
                        data-status="${escapeHTML(
                          normalizeStatus(request.status),
                        )}"
                    >

                        <td>
                            <a
                                href="${getResourceURL(request.resource_id)}"
                                class="table-resource-link"
                            >
                                ${escapeHTML(resourceTitle)}
                            </a>
                        </td>

                        <td>
                            ${escapeHTML(request.message || "No message")}
                        </td>

                        <td>
                            ${createStatusBadge(request.status)}
                        </td>

                        <td>
                            ${escapeHTML(formatDate(request.created_at))}
                        </td>

                    </tr>
                `;
    })
    .join("");
}

/* =========================================================
   24. FILTER BUTTON HELPERS
   ========================================================= */

function updateActiveFilterButton(container, selector, activeButton) {
  if (!container) {
    return;
  }

  container.querySelectorAll(selector).forEach((button) => {
    const active = button === activeButton;

    button.classList.toggle("active", active);

    button.setAttribute("aria-pressed", String(active));
  });
}

/* =========================================================
   25. RECEIVED REQUEST FILTERS
   ========================================================= */

function setupReceivedRequestFilters() {
  if (!receivedRequestFilters) {
    return;
  }

  receivedRequestFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-request-filter]");

    if (!button || !receivedRequestFilters.contains(button)) {
      return;
    }

    const selectedFilter = normalizeStatus(button.dataset.requestFilter);

    if (!RECEIVED_FILTERS.includes(selectedFilter)) {
      return;
    }

    receivedFilter = selectedFilter;

    updateActiveFilterButton(
      receivedRequestFilters,
      "[data-request-filter]",
      button,
    );

    renderReceivedRequests();
  });
}

/* =========================================================
   26. BORROW REQUEST FILTERS
   ========================================================= */

function setupBorrowRequestFilters() {
  if (!myBorrowRequestFilters) {
    return;
  }

  myBorrowRequestFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-borrow-filter]");

    if (!button || !myBorrowRequestFilters.contains(button)) {
      return;
    }

    const selectedFilter = normalizeStatus(button.dataset.borrowFilter);

    if (!BORROWING_FILTERS.includes(selectedFilter)) {
      return;
    }

    borrowingFilter = selectedFilter;

    updateActiveFilterButton(
      myBorrowRequestFilters,
      "[data-borrow-filter]",
      button,
    );

    renderMyBorrowRequests();
  });
}

/* =========================================================
   27. URL FILTER SUPPORT
   ========================================================= */

function applyDashboardURLFilter() {
  const params = new URLSearchParams(window.location.search);

  const status = normalizeStatus(params.get("status")) || "all";

  const section = normalizeStatus(params.get("section"));

  /*
   * Borrowing section.
   */
  if (section === "borrowing" && BORROWING_FILTERS.includes(status)) {
    borrowingFilter = status;

    const button = Array.from(
      myBorrowRequestFilters?.querySelectorAll("[data-borrow-filter]") || [],
    ).find((item) => item.dataset.borrowFilter === status);

    if (button) {
      updateActiveFilterButton(
        myBorrowRequestFilters,
        "[data-borrow-filter]",
        button,
      );
    }

    renderMyBorrowRequests();

    return;
  }

  /*
   * Received section.
   */
  if (section === "received" && RECEIVED_FILTERS.includes(status)) {
    receivedFilter = status;

    const button = Array.from(
      receivedRequestFilters?.querySelectorAll("[data-request-filter]") || [],
    ).find((item) => item.dataset.requestFilter === status);

    if (button) {
      updateActiveFilterButton(
        receivedRequestFilters,
        "[data-request-filter]",
        button,
      );
    }

    renderReceivedRequests();
  }
}

/* =========================================================
   28. AUTH LISTENER
   ========================================================= */

function setupAuthListener() {
  if (authListenerRegistered || !client?.auth) {
    return;
  }

  authListenerRegistered = true;

  client.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session?.user) {
      currentUser = null;
      currentProfile = null;

      listingsRequestId++;
      receivedRequestsRequestId++;
      borrowingRequestsRequestId++;

      myListings = [];
      receivedRequests = [];
      borrowingRequests = [];

      navigateTo(ROUTES.login);
    }
  });
}

/* =========================================================
   29. INITIALIZE DASHBOARD
   ========================================================= */

async function initializeDashboard() {
  if (dashboardInitialized) {
    return;
  }

  dashboardInitialized = true;

  hideMessage();

  /*
   * Local dashboard interactions.
   */
  setupStatisticsNavigation();
  setupReceivedRequestFilters();
  setupBorrowRequestFilters();

  /*
   * Supabase check.
   */
  if (!client || !client.auth) {
    showMessage("Supabase is not initialized. Please check supabase.js.");

    return;
  }

  setupAuthListener();

  try {
    /* -----------------------------------------
           STEP 1 — AUTH SESSION
           ----------------------------------------- */

    const { data, error } = await client.auth.getSession();

    if (error) {
      throw error;
    }

    currentUser = data?.session?.user || null;

    if (!currentUser) {
      navigateTo(ROUTES.login);

      return;
    }

    /* -----------------------------------------
           STEP 2 — LOAD PROFILE
           ----------------------------------------- */

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select(
        `
                id,
                full_name,
                role,
                avatar_url,
                gender
            `,
      )
      .eq("id", currentUser.id)
      .maybeSingle();

    if (profileError) {
      logError("Profile loading error:", profileError);

      showMessage("Unable to verify your account. Please try again.");

      return;
    }

    if (!profile) {
      showMessage(
        "Your account profile was not found. Please contact support.",
      );

      return;
    }

    currentProfile = profile;

    /* -----------------------------------------
           STEP 3 — ROLE CHECK
           ----------------------------------------- */

    const role = normalizeStatus(currentProfile.role);

    /*
         * The user dashboard is for normal users.

         * This is only a frontend navigation check.
         * Actual authorization must remain enforced
         * by Supabase RLS / backend rules.
         */
    if (role !== "user") {
      navigateTo(ROUTES.home);

      return;
    }

    /* -----------------------------------------
           STEP 4 — PROFILE UI
           ----------------------------------------- */

    updateDashboardProfile(currentUser, currentProfile);

    /* -----------------------------------------
           STEP 5 — LISTINGS
           ----------------------------------------- */

    const listings = await loadMyListings(currentUser);

    /* -----------------------------------------
           STEP 6 — REQUESTS
           ----------------------------------------- */

    await Promise.all([
      loadReceivedRequests(currentUser, listings),

      loadMyBorrowRequests(currentUser),
    ]);

    /* -----------------------------------------
           STEP 7 — URL FILTER
           ----------------------------------------- */

    applyDashboardURLFilter();
  } catch (error) {
    logError("Dashboard initialization failed:", error);

    showMessage("Unable to load your dashboard. Please refresh the page.");
  }
}

/* =========================================================
   30. START
   ========================================================= */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeDashboard, {
    once: true,
  });
} else {
  initializeDashboard();
}
