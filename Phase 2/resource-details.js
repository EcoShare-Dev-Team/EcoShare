"use strict";

/*
============================================================
  EcoShare — Resource Details

  Full cleaned page-specific JavaScript.

  Global functionality such as:
  - Navbar
  - Authentication UI
  - Profile dropdown
  - Avatar handling
  - Notifications
  - Logout
  - Mobile navigation

  is handled by page.js.

  This file handles only resource-details functionality.
============================================================
*/

/* ============================================================
   1. DOM ELEMENTS
   ============================================================ */

const detailsCard = document.getElementById("detailsCard");

const detailsImage = document.getElementById("detailsImage");

const detailsCategory = document.getElementById("detailsCategory");

const detailsTitle = document.getElementById("detailsTitle");

const detailsDescription = document.getElementById("detailsDescription");

const detailsOwner = document.getElementById("detailsOwner");

const detailsLocation = document.getElementById("detailsLocation");

const detailsAvailability = document.getElementById("detailsAvailability");

const detailsPriceHourItem = document.getElementById("detailsPriceHourItem");

const detailsPricePerHour = document.getElementById("detailsPricePerHour");

const detailsPriceDayItem = document.getElementById("detailsPriceDayItem");

const detailsPricePerDay = document.getElementById("detailsPricePerDay");

const detailsBuyPriceItem = document.getElementById("detailsBuyPriceItem");

const detailsBuyPrice = document.getElementById("detailsBuyPrice");

const breadcrumbTitle = document.getElementById("breadcrumbTitle");

const borrowBtn = document.getElementById("borrowBtn");

const buyBtn = document.getElementById("buyBtn");

const reportListingBtn = document.getElementById("reportListingBtn");

const detailsMessage = document.getElementById("detailsMessage");

const resourceNotFound = document.getElementById("resourceNotFound");

const averageRating = document.getElementById("averageRating");

const averageStars = document.getElementById("averageStars");

const reviewCount = document.getElementById("reviewCount");

const viewReviewsBtn = document.getElementById("viewReviewsBtn");

/* ============================================================
   2. CONFIGURATION
   ============================================================ */

/*
 * IMPORTANT:
 *
 * The EcoShare project uses the public.resources table.
 *
 * Do not change this back to "resource_listings" unless the
 * database schema is intentionally changed.
 */

const RESOURCE_TABLE = "resources";

const PUBLIC_PROFILE_TABLE = "public_profiles";

const RESOURCE_REVIEW_TABLE = "resource_reviews";

const RESOURCE_IMAGE_BUCKET = "resource-images";

const SUPABASE_PROJECT_ORIGIN =
  window.ECOSHARE_SUPABASE_URL || "https://cplbvftcbiwgqkeqmrbq.supabase.co";

const RESOURCE_IMAGE_PATH_PREFIX = `/storage/v1/object/public/${RESOURCE_IMAGE_BUCKET}/`;

const RESOURCE_DETAILS_PAGE = "resource-details.html";

const LOGIN_PAGE = "../Phase 1/login.html";

const BORROW_REQUEST_PAGE = "borrow-request.html";

const REVIEWS_PAGE = "../Phase 4/resource-reviews.html";

/* ============================================================
   3. RUNTIME STATE
   ============================================================ */

let currentResource = null;

let currentUser = null;

let resourceLoadRequestId = 0;

let authListenerRegistered = false;

/* ============================================================
   4. BASIC HELPERS
   ============================================================ */

function normalizeText(value, fallback = "") {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  return value.trim();
}

function normalizeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function hasPositivePrice(value) {
  return normalizeNumber(value, 0) > 0;
}

function formatCurrency(value) {
  const price = normalizeNumber(value, 0);

  if (price <= 0) {
    return "—";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(price);
}

function formatCategory(category) {
  const value = normalizeText(category, "Other");

  return value.charAt(0).toUpperCase() + value.slice(1);
}

/* ============================================================
   5. MESSAGE HANDLING
   ============================================================ */

function showMessage(text, type = "error") {
  if (!detailsMessage) {
    return;
  }

  const allowedTypes = new Set(["error", "success", "info", "warning"]);

  const safeType = allowedTypes.has(type) ? type : "error";

  detailsMessage.textContent = text || "";

  detailsMessage.className = `details-message ${safeType}`;

  detailsMessage.hidden = !text;
}

function clearMessage() {
  if (!detailsMessage) {
    return;
  }

  detailsMessage.textContent = "";

  detailsMessage.hidden = true;

  detailsMessage.className = "details-message";
}

/* ============================================================
   6. RESOURCE ID
   ============================================================ */

function getResourceId() {
  const params = new URLSearchParams(window.location.search);

  const rawId = params.get("id");

  if (!rawId || typeof rawId !== "string") {
    return null;
  }

  const id = rawId.trim();

  /*
   * resources.id is BIGINT.
   *
   * Keep the ID as a string so very large PostgreSQL
   * BIGINT values are not corrupted by JavaScript Number.
   */

  if (!/^\d+$/.test(id)) {
    return null;
  }

  try {
    const numericId = BigInt(id);

    if (numericId <= 0n) {
      return null;
    }

    return id;
  } catch {
    return null;
  }
}

/* ============================================================
   7. SAFE RESOURCE IMAGE URL
   ============================================================ */

function getSafeResourceImageUrl(imageUrl) {
  if (typeof imageUrl !== "string" || !imageUrl.trim()) {
    return null;
  }

  try {
    const url = new URL(imageUrl.trim());

    /*
     * HTTPS only.
     */
    if (url.protocol !== "https:") {
      return null;
    }

    /*
     * Only the EcoShare Supabase project.
     */
    if (url.origin !== SUPABASE_PROJECT_ORIGIN) {
      return null;
    }

    /*
     * Reject embedded credentials.
     */
    if (url.username || url.password) {
      return null;
    }

    /*
     * Public storage URL should not contain
     * arbitrary query parameters or fragments.
     */
    if (url.search || url.hash) {
      return null;
    }

    /*
     * Resource images must come from the
     * resource-images bucket.
     */
    if (!url.pathname.startsWith(RESOURCE_IMAGE_PATH_PREFIX)) {
      return null;
    }

    const objectPath = url.pathname.slice(RESOURCE_IMAGE_PATH_PREFIX.length);

    if (!objectPath) {
      return null;
    }

    /*
     * Reject suspicious paths.
     */
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
    console.warn("Invalid resource image URL.");

    return null;
  }
}

/* ============================================================
   8. IMAGE PLACEHOLDER
   ============================================================ */

function createImagePlaceholder() {
  const wrapper = document.createElement("div");

  wrapper.className = "resource-image-placeholder";

  const icon = document.createElement("i");

  icon.className = "fa-solid fa-image";

  icon.setAttribute("aria-hidden", "true");

  wrapper.appendChild(icon);

  return wrapper;
}

/* ============================================================
   9. DISPLAY RESOURCE IMAGE
   ============================================================ */

function displayResourceImage(resource) {
  if (!detailsImage) {
    return;
  }

  detailsImage.replaceChildren();

  const safeImageUrl = getSafeResourceImageUrl(resource?.image);

  if (!safeImageUrl) {
    detailsImage.appendChild(createImagePlaceholder());

    return;
  }

  const image = document.createElement("img");

  image.src = safeImageUrl;

  image.alt = normalizeText(resource?.title, "Resource image");

  image.loading = "lazy";

  image.decoding = "async";

  image.referrerPolicy = "no-referrer";

  image.addEventListener(
    "error",
    () => {
      detailsImage.replaceChildren();

      detailsImage.appendChild(createImagePlaceholder());
    },
    { once: true },
  );

  detailsImage.appendChild(image);
}

/* ============================================================
   10. LOAD CURRENT USER
   ============================================================ */

async function loadCurrentUser() {
  if (
    typeof window.supabaseClient === "undefined" ||
    !window.supabaseClient?.auth
  ) {
    console.error("Supabase client is unavailable.");

    currentUser = null;

    return null;
  }

  try {
    const { data, error } = await window.supabaseClient.auth.getUser();

    if (error) {
      console.warn("Unable to get current user:", error);

      currentUser = null;

      return null;
    }

    currentUser = data?.user || null;

    /*
     * Keep compatibility with the global
     * EcoShare authentication system.
     */
    if (currentUser?.id) {
      window.EcoShareCurrentUserId = currentUser.id;
    } else {
      window.EcoShareCurrentUserId = null;
    }

    return currentUser;
  } catch (error) {
    console.error("Current user error:", error);

    currentUser = null;

    window.EcoShareCurrentUserId = null;

    return null;
  }
}

/* ============================================================
   11. LOAD OWNER PROFILE
   ============================================================ */

async function loadOwnerProfile(ownerId) {
  if (!ownerId) {
    return null;
  }

  try {
    const { data, error } = await window.supabaseClient
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

    if (error) {
      console.error("Owner profile loading error:", error);

      return null;
    }

    return data || null;
  } catch (error) {
    console.error("Owner profile error:", error);

    return null;
  }
}

/* ============================================================
   12. LOAD RESOURCE
   ============================================================ */

async function loadResource() {
  const requestId = ++resourceLoadRequestId;

  clearMessage();

  const resourceId = getResourceId();

  if (!resourceId) {
    showResourceNotFound();
    return;
  }

  if (typeof window.supabaseClient === "undefined" || !window.supabaseClient) {
    console.error("Supabase client is not initialized.");

    showMessage("Unable to connect to EcoShare. Please try again.", "error");

    return;
  }

  try {
    const { data: resource, error } = await window.supabaseClient
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
                    price_per_day,
                    buy_price
                `,
      )
      .eq("id", resourceId)
      .maybeSingle();

    if (requestId !== resourceLoadRequestId) {
      return;
    }

    if (error) {
      console.error("Resource loading error:", error);

      showMessage("Unable to load this resource. Please try again.", "error");

      return;
    }

    if (!resource) {
      showResourceNotFound();
      return;
    }

    const ownerProfile = await loadOwnerProfile(resource.owner_id);

    if (requestId !== resourceLoadRequestId) {
      return;
    }

    const formattedResource = {
      id: resource.id,

      ownerId: resource.owner_id || null,

      title: normalizeText(resource.title, "Untitled Resource"),

      description: normalizeText(
        resource.description,
        "No description available.",
      ),

      category: normalizeText(resource.category, "Other"),

      owner: normalizeText(ownerProfile?.full_name, "EcoShare User"),

      ownerAvatar: ownerProfile?.avatar_url || null,

      ownerGender: ownerProfile?.gender || "",

      location: normalizeText(resource.location, "Not specified"),

      available: resource.available === true,

      image: resource.image_url || null,

      createdAt: resource.created_at || null,

      updatedAt: resource.updated_at || null,

      pricePerHour: normalizeNumber(resource.price_per_hour, 0),

      pricePerDay: normalizeNumber(resource.price_per_day, 0),

      buyPrice: normalizeNumber(resource.buy_price, 0),
    };

    currentResource = formattedResource;

    displayResource(formattedResource);

    await loadResourceAverageRating(resourceId);
  } catch (error) {
    if (requestId !== resourceLoadRequestId) {
      return;
    }

    console.error("Unexpected resource loading error:", error);

    showMessage("Unable to load this resource. Please try again.", "error");
  }
}

/* ============================================================
   13. DISPLAY PRICE
   ============================================================ */

function displayPrice(element, container, value) {
  if (!element) {
    return;
  }

  const price = normalizeNumber(value, 0);

  if (hasPositivePrice(price)) {
    element.textContent = formatCurrency(price);

    if (container) {
      container.hidden = false;
    }

    return;
  }

  element.textContent = "Not specified";

  if (container) {
    container.hidden = true;
  }
}

/* ============================================================
   14. DISPLAY ALL PRICES
   ============================================================ */

function displayResourcePrices(resource) {
  displayPrice(
    detailsPricePerHour,
    detailsPriceHourItem,
    resource.pricePerHour,
  );

  displayPrice(detailsPricePerDay, detailsPriceDayItem, resource.pricePerDay);

  displayPrice(detailsBuyPrice, detailsBuyPriceItem, resource.buyPrice);
}

/* ============================================================
   15. SET BUTTON CONTENT
   ============================================================ */

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
    const label = document.createElement("span");

    label.textContent = text;

    button.appendChild(label);
  }
}

/* ============================================================
   16. SETUP BORROW BUTTON
   ============================================================ */

function setupBorrowButton(resource) {
  if (!borrowBtn) {
    return;
  }

  borrowBtn.disabled = false;

  borrowBtn.onclick = null;

  if (!resource.available) {
    borrowBtn.disabled = true;

    setButtonContent(borrowBtn, "fa-solid fa-ban", "Currently Unavailable");

    return;
  }

  /*
   * Owner cannot request their own resource.
   */
  if (
    currentUser?.id &&
    resource.ownerId &&
    currentUser.id === resource.ownerId
  ) {
    borrowBtn.disabled = true;

    setButtonContent(borrowBtn, "fa-solid fa-user-lock", "Your Resource");

    return;
  }

  /*
   * Free and paid resources use the same button.
   * The actual flow is decided inside handleBorrowRequest().
   */
  setButtonContent(borrowBtn, "fa-solid fa-hand-holding", "Borrow / Request");

  borrowBtn.onclick = () => {
    void handleBorrowRequest(resource);
  };
}

/* ============================================================
   17. SETUP BUY BUTTON
   ============================================================ */

function setupBuyButton(resource) {
  if (!buyBtn) {
    return;
  }

  buyBtn.onclick = null;

  buyBtn.hidden = true;

  buyBtn.disabled = false;

  const buyPrice = normalizeNumber(resource.buyPrice, 0);

  /*
   * No purchase price.
   */
  if (buyPrice <= 0) {
    return;
  }

  /*
   * Do not allow buying your own resource.
   */
  if (
    currentUser?.id &&
    resource.ownerId &&
    currentUser.id === resource.ownerId
  ) {
    return;
  }

  buyBtn.hidden = false;

  if (!resource.available) {
    buyBtn.disabled = true;

    setButtonContent(buyBtn, "fa-solid fa-ban", "Currently Unavailable");

    return;
  }

  setButtonContent(
    buyBtn,
    "fa-solid fa-cart-shopping",
    `Buy ${formatCurrency(buyPrice)}`,
  );

  buyBtn.onclick = () => {
    void handleBuyRequest(resource);
  };
}

function setupReportListingButton(resource) {
  if (!reportListingBtn) {
    return;
  }

  reportListingBtn.onclick = null;

  if (!resource?.id) {
    reportListingBtn.disabled = true;
    return;
  }

  // Owner cannot report their own listing
  if (
    currentUser?.id &&
    resource.ownerId &&
    currentUser.id === resource.ownerId
  ) {
    reportListingBtn.hidden = true;
    return;
  }

  reportListingBtn.hidden = false;
  reportListingBtn.disabled = false;

  reportListingBtn.onclick = () => {
    const reportUrl = `../Phase 4/community.html?type=listing&id=${encodeURIComponent(
      resource.id,
    )}`;

    window.location.href = reportUrl;
  };
}

/* ============================================================
   18. HANDLE BORROW REQUEST
   ============================================================ */

async function handleBorrowRequest(resource) {
  if (!resource) {
    return;
  }

  if (!resource.available) {
    showMessage("This resource is currently unavailable.", "warning");

    return;
  }

  /*
   * Always verify authentication from Supabase
   * immediately before performing an action.
   */
  const user = await loadCurrentUser();

  if (!user) {
    showMessage("Please login to request this resource.", "info");

    const returnUrl = `${RESOURCE_DETAILS_PAGE}?id=${encodeURIComponent(
      resource.id,
    )}`;

    const loginUrl = `${LOGIN_PAGE}?redirect=${encodeURIComponent(returnUrl)}`;

    window.setTimeout(() => {
      window.location.href = loginUrl;
    }, 600);

    return;
  }

  /*
   * Owner cannot request their own resource.
   */
  if (resource.ownerId && user.id === resource.ownerId) {
    showMessage("You cannot request your own resource.", "warning");

    return;
  }

  /*
   * A resource is considered FREE for borrowing only when
   * both rental prices are zero or not set.
   *
   * buyPrice is intentionally NOT checked here because
   * purchase price is separate from rental price.
   */
  const pricePerHour = normalizeNumber(resource.pricePerHour, 0);

  const pricePerDay = normalizeNumber(resource.pricePerDay, 0);

  const isFreeBorrow = pricePerHour <= 0 && pricePerDay <= 0;

  /*
   * ========================================================
   * FREE RESOURCE
   * ========================================================
   *
   * Create the borrow request directly through the secure
   * Supabase RPC.
   *
   * The database remains authoritative and independently
   * verifies that the resource is actually free.
   */

  if (isFreeBorrow) {
    if (!borrowBtn) {
      return;
    }

    borrowBtn.disabled = true;

    setButtonContent(
      borrowBtn,
      "fa-solid fa-spinner fa-spin",
      "Sending Request...",
    );

    clearMessage();

    try {
      const { data: requestId, error } = await window.supabaseClient.rpc(
        "create_borrow_request",
        {
          p_resource_id: resource.id,
          p_rental_type: null,
          p_rental_quantity: null,
        },
      );

      if (error) {
        console.error("Free borrow request error:", error);

        throw error;
      }

      if (requestId === null || requestId === undefined) {
        throw new Error("The borrow request was not created.");
      }

      /*
       * Request successfully created.
       *
       * The existing database notification trigger
       * automatically notifies the resource owner.
       */
      setButtonContent(borrowBtn, "fa-solid fa-check", "Request Sent");

      borrowBtn.disabled = true;

      showMessage(
        "Borrow request sent. The lender has been notified.",
        "success",
      );

      return;
    } catch (error) {
      console.error("Unable to create free borrow request:", error);

      borrowBtn.disabled = false;

      setButtonContent(
        borrowBtn,
        "fa-solid fa-hand-holding",
        "Borrow / Request",
      );

      const errorMessage =
        typeof error?.message === "string" ? error.message : "";

      const normalizedError = errorMessage.toLowerCase();

      /*
       * Known backend errors are converted into clean
       * user-facing messages.
       */
      if (normalizedError.includes("already submitted")) {
        showMessage(
          "You already have an active request for this resource.",
          "warning",
        );
      } else if (normalizedError.includes("currently unavailable")) {
        showMessage("This resource is currently unavailable.", "warning");
      } else if (normalizedError.includes("cannot request your own")) {
        showMessage("You cannot request your own resource.", "warning");
      } else {
        showMessage(
          "Unable to send the borrow request. Please try again.",
          "error",
        );
      }

      return;
    }
  }

  /*
   * ========================================================
   * PAID RESOURCE
   * ========================================================
   *
   * Paid resources continue through borrow-request.html.
   *
   * The user selects rental type and quantity there.
   *
   * No payment is performed by this redirect.
   */

  window.location.href = `${BORROW_REQUEST_PAGE}?id=${encodeURIComponent(
    resource.id,
  )}`;
}

/* ============================================================
   19. HANDLE BUY REQUEST
   ============================================================ */

async function handleBuyRequest(resource) {
  if (!resource) {
    return;
  }

  const buyPrice = normalizeNumber(resource.buyPrice, 0);

  if (buyPrice <= 0) {
    showMessage(
      "This resource is not currently available for purchase.",
      "warning",
    );

    return;
  }

  if (!resource.available) {
    showMessage("This resource is currently unavailable.", "warning");

    return;
  }

  /*
   * Always verify authentication from Supabase.
   */
  const user = await loadCurrentUser();

  if (!user) {
    showMessage("Please login to purchase this resource.", "info");

    const returnUrl = `${RESOURCE_DETAILS_PAGE}?id=${encodeURIComponent(
      resource.id,
    )}`;

    const loginUrl = `${LOGIN_PAGE}?redirect=${encodeURIComponent(returnUrl)}`;

    window.setTimeout(() => {
      window.location.href = loginUrl;
    }, 600);

    return;
  }

  if (resource.ownerId && user.id === resource.ownerId) {
    showMessage("You cannot purchase your own resource.", "warning");

    return;
  }

  /*
   * IMPORTANT:
   *
   * Do not pretend that payment succeeded here.
   *
   * The actual purchase transaction must be handled
   * by a secure backend/RPC/payment flow.
   */
  showMessage(
    `Purchase option selected. Price: ${formatCurrency(buyPrice)}.`,
    "info",
  );
}

/* ============================================================
   20. DISPLAY RESOURCE
   ============================================================ */

function displayResource(resource) {
  if (!resource) {
    showResourceNotFound();

    return;
  }

  if (detailsCard) {
    detailsCard.hidden = false;
  }

  if (resourceNotFound) {
    resourceNotFound.hidden = true;
  }

  clearMessage();

  const safeTitle = normalizeText(resource.title, "Resource");

  document.title = `${safeTitle} | EcoShare`;

  /*
   * Breadcrumb
   */

  if (breadcrumbTitle) {
    breadcrumbTitle.textContent = safeTitle;
  }

  /*
   * Category
   */

  if (detailsCategory) {
    detailsCategory.textContent = formatCategory(resource.category);
  }

  /*
   * Title
   */

  if (detailsTitle) {
    detailsTitle.textContent = resource.title;
  }

  /*
   * Description
   */

  if (detailsDescription) {
    detailsDescription.textContent = resource.description;
  }

  /*
   * Owner
   */

  if (detailsOwner) {
    detailsOwner.textContent = resource.owner;
  }

  /*
   * Location
   */

  if (detailsLocation) {
    detailsLocation.textContent = resource.location;
  }

  /*
   * Availability
   */

  if (detailsAvailability) {
    detailsAvailability.classList.remove("available", "unavailable");

    if (resource.available === true) {
      detailsAvailability.textContent = "Available";

      detailsAvailability.classList.add("available");
    } else {
      detailsAvailability.textContent = "Currently Borrowed";

      detailsAvailability.classList.add("unavailable");
    }
  }

  /*
   * Prices
   */

  displayResourcePrices(resource);

  /*
   * Image
   */

  displayResourceImage(resource);

  /*
   * Borrow
   */

  setupBorrowButton(resource);

  /*
   * Buy
   */

  setupBuyButton(resource);

  /*
   * Report Listing
   */

  setupReportListingButton(resource);
}

/* ============================================================
   21. RESOURCE NOT FOUND
   ============================================================ */

function showResourceNotFound() {
  currentResource = null;

  if (detailsCard) {
    detailsCard.hidden = true;
  }

  if (resourceNotFound) {
    resourceNotFound.hidden = false;
  }

  document.title = "Resource Not Found | EcoShare";
}

/* ============================================================
   22. LOAD RESOURCE AVERAGE RATING
   ============================================================ */

async function loadResourceAverageRating(resourceId) {
  if (averageRating) {
    averageRating.textContent = "0.0";
  }

  if (averageStars) {
    averageStars.textContent = "☆☆☆☆☆";

    averageStars.removeAttribute("aria-label");
  }

  if (reviewCount) {
    reviewCount.textContent = "0";
  }

  if (typeof resourceId !== "string" || !resourceId.trim()) {
    return;
  }

  if (typeof window.supabaseClient === "undefined" || !window.supabaseClient) {
    return;
  }

  try {
    const { data: reviews, error } = await window.supabaseClient
      .from(RESOURCE_REVIEW_TABLE)
      .select("rating")
      .eq("resource_id", resourceId);

    if (error) {
      console.error("Resource rating error:", error);

      return;
    }

    if (!Array.isArray(reviews) || reviews.length === 0) {
      return;
    }

    const validRatings = reviews
      .map((review) => Number(review?.rating))
      .filter(
        (rating) => Number.isFinite(rating) && rating >= 1 && rating <= 5,
      );

    if (validRatings.length === 0) {
      return;
    }

    const totalRating = validRatings.reduce((sum, rating) => sum + rating, 0);

    const average = totalRating / validRatings.length;

    if (averageRating) {
      averageRating.textContent = average.toFixed(1);
    }

    if (averageStars) {
      averageStars.textContent = createStars(average);

      averageStars.setAttribute(
        "aria-label",
        `Average rating ${average.toFixed(1)} out of 5`,
      );
    }

    if (reviewCount) {
      reviewCount.textContent = String(validRatings.length);
    }
  } catch (error) {
    console.error("Unexpected rating error:", error);
  }
}

/* ============================================================
   23. CREATE STAR DISPLAY
   ============================================================ */

function createStars(rating) {
  const safeRating = Number(rating);

  if (!Number.isFinite(safeRating)) {
    return "☆☆☆☆☆";
  }

  const rounded = Math.max(0, Math.min(5, Math.round(safeRating)));

  let stars = "";

  for (let i = 1; i <= 5; i++) {
    stars += i <= rounded ? "★" : "☆";
  }

  return stars;
}

/* ============================================================
   24. VIEW RESOURCE REVIEWS
   ============================================================ */

if (viewReviewsBtn) {
  viewReviewsBtn.addEventListener("click", (event) => {
    event.preventDefault();

    const resourceId = getResourceId();

    if (!resourceId) {
      showMessage("Invalid resource.", "error");

      return;
    }

    window.location.href = `${REVIEWS_PAGE}?id=${encodeURIComponent(
      resourceId,
    )}`;
  });
}

/* ============================================================
   25. AUTH STATE LISTENER
   ============================================================ */

function setupAuthStateListener() {
  if (
    authListenerRegistered ||
    typeof window.supabaseClient === "undefined" ||
    !window.supabaseClient?.auth
  ) {
    return;
  }

  authListenerRegistered = true;

  window.supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;

    if (currentUser?.id) {
      window.EcoShareCurrentUserId = currentUser.id;
    } else {
      window.EcoShareCurrentUserId = null;
    }

    /*
     * Reconfigure action buttons when
     * authentication changes.
     */
    if (currentResource) {
      setupBorrowButton(currentResource);

      setupBuyButton(currentResource);
    }
  });
}

/* ============================================================
   26. INITIALIZE PAGE
   ============================================================ */

async function initializeResourceDetails() {
  /*
   * page.js is responsible for:
   *
   * - Navbar
   * - Authentication UI
   * - Profile dropdown
   * - Avatar
   * - Notifications
   * - Logout
   * - Mobile navigation
   *
   * This file handles only resource-details functionality.
   */

  try {
    await loadCurrentUser();
  } catch (error) {
    console.warn("Initial authentication check failed:", error);
  }

  setupAuthStateListener();

  await loadResource();
}

/* ============================================================
   27. DOM READY
   ============================================================ */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeResourceDetails, {
    once: true,
  });
} else {
  void initializeResourceDetails();
}

/* ============================================================
   28. PUBLIC API
   ============================================================ */

window.EcoShareResourceDetails = {
  getResourceId,

  getCurrentResource: () =>
    currentResource
      ? {
          ...currentResource,
        }
      : null,

  reload: loadResource,

  refresh: loadResource,

  getCurrentUser: () =>
    currentUser
      ? {
          ...currentUser,
        }
      : null,
};
