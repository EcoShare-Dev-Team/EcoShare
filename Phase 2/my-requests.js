// ==========================================
// EcoShare — My Requests JavaScript
// ==========================================

// ==========================================
// 1. GET ELEMENTS
// ==========================================

const requestsList = document.getElementById("requestsList");

const emptyRequests = document.getElementById("emptyRequests");

const requestsCount = document.getElementById("requestsCount");

const menuBtn = document.getElementById("menu-btn");

const primaryNavigation = document.getElementById("primary-navigation");

const authNavButton = document.getElementById("authNavButton");

const header = document.querySelector(".header");

const requestFilters = document.querySelectorAll(".request-filter");

// ==========================================
// 2. REQUEST STATE
// ==========================================

let allRequests = [];

let currentFilter = "all";

// ==========================================
// 3. FORMAT CATEGORY
// ==========================================

function formatCategory(category) {
  if (!category) {
    return "Other";
  }

  return category.charAt(0).toUpperCase() + category.slice(1);
}

// ==========================================
// 4. FORMAT STATUS
// ==========================================

function formatStatus(status) {
  if (!status) {
    return "Unknown";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ==========================================
// 5. STATUS ICON
// ==========================================

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

// ==========================================
// 6. FORMAT DATE
// ==========================================

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

// ==========================================
// 7. UPDATE AUTH NAVIGATION
// ==========================================

async function updateAuthNavigation() {
  if (!authNavButton) {
    return;
  }

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (session) {
    authNavButton.innerHTML = `
      <i class="fa-solid fa-user"></i>
      Profile
    `;

    authNavButton.href = "../Phase 1/profile.html";

    authNavButton.setAttribute("aria-label", "Open profile");
  } else {
    authNavButton.innerHTML = `
      <i class="fa-solid fa-right-to-bracket"></i>
      Login
    `;

    authNavButton.href = "../Phase 1/login.html";

    authNavButton.setAttribute("aria-label", "Login");
  }
}

// ==========================================
// 8. SHOW ERROR
// ==========================================

function showError(message) {
  if (!requestsList) {
    return;
  }

  requestsList.hidden = false;

  requestsList.innerHTML = `
    <div class="requests-error">

      <i
        class="fa-solid fa-triangle-exclamation"
        aria-hidden="true"
      ></i>

      <h3>
        Unable to load your requests
      </h3>

      <p>
        ${message}
      </p>

    </div>
  `;
}

// ==========================================
// 9. CHECK FILTER
// ==========================================

function matchesFilter(request, filter) {
  if (filter === "all") {
    return true;
  }

  // Pending = waiting for owner approval
  if (filter === "pending") {
    return request.status === "pending";
  }

  // Active = currently approved / borrowed
  if (filter === "active") {
    return request.status === "approved";
  }

  // Completed = finished or closed requests
  if (filter === "completed") {
    return ["returned", "rejected", "cancelled"].includes(request.status);
  }

  return true;
}

// ==========================================
// 10. APPLY REQUEST FILTER
// ==========================================

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

  // --------------------------------------
  // No requests in selected filter
  // --------------------------------------

  if (filteredRequests.length === 0) {
    requestsList.innerHTML = `
      <div class="empty-requests">

        <div class="empty-requests-icon">
          <i
            class="fa-solid fa-filter"
            aria-hidden="true"
          ></i>
        </div>

        <h3>No requests found</h3>

        <p>
          ${
            currentFilter === "all"
              ? "You don't have any borrow requests yet."
              : `You don't have any ${currentFilter} requests.`
          }
        </p>

        ${
          currentFilter === "all"
            ? `
              <a href="explore.html" class="primary-btn">
                <i
                  class="fa-solid fa-magnifying-glass"
                  aria-hidden="true"
                ></i>
                Explore Resources
              </a>
            `
            : ""
        }

      </div>
    `;

    if (requestsCount) {
      requestsCount.textContent =
        currentFilter === "all"
          ? "No requests yet"
          : `No ${currentFilter} requests`;
    }

    return;
  }

  // --------------------------------------
  // Update count
  // --------------------------------------

  if (requestsCount) {
    requestsCount.textContent = `${filteredRequests.length} request${
      filteredRequests.length === 1 ? "" : "s"
    }`;
  }

  // --------------------------------------
  // Display filtered requests
  // --------------------------------------

  displayRequests(filteredRequests);
}

// ==========================================
// 11. LOAD MY REQUESTS
// ==========================================

async function loadMyRequests() {
  if (!requestsList) {
    return;
  }

  // --------------------------------------
  // Get authenticated user
  // --------------------------------------

  const {
    data: { user },
    error: authError,
  } = await supabaseClient.auth.getUser();

  if (authError) {
    console.error("Authentication error:", authError);

    window.location.href = "../Phase 1/login.html";

    return;
  }

  if (!user) {
    window.location.href = "../Phase 1/login.html";

    return;
  }

  // --------------------------------------
  // Loading state
  // --------------------------------------

  requestsList.hidden = false;

  requestsList.innerHTML = `
    <div class="requests-error">

      <i
        class="fa-solid fa-spinner fa-spin"
        aria-hidden="true"
      ></i>

      <h3>
        Loading requests...
      </h3>

      <p>
        Please wait while we load your borrow requests.
      </p>

    </div>
  `;

  // --------------------------------------
  // Fetch requests
  // --------------------------------------

  const { data: requests, error } = await supabaseClient
    .from("borrow_requests")
    .select(
      `
        id,
        resource_id,
        message,
        status,
        created_at,
        updated_at,
        resources (
          title,
          description,
          category,
          location,
          image_url,
          available,
          owner_id
        )
      `,
    )
    .eq("borrower_id", user.id)
    .order("created_at", {
      ascending: false,
    });

  // --------------------------------------
  // Handle error
  // --------------------------------------

  if (error) {
    console.error("My requests loading error:", error);

    showError("Please refresh the page and try again.");

    return;
  }

  // --------------------------------------
  // Store requests
  // --------------------------------------

  allRequests = requests || [];

  // --------------------------------------
  // Completely empty
  // --------------------------------------

  if (allRequests.length === 0) {
    requestsList.innerHTML = "";

    requestsList.hidden = true;

    if (emptyRequests) {
      emptyRequests.hidden = false;
    }

    if (requestsCount) {
      requestsCount.textContent = "No requests yet";
    }

    return;
  }

  // --------------------------------------
  // Show request list
  // --------------------------------------

  requestsList.hidden = false;

  if (emptyRequests) {
    emptyRequests.hidden = true;
  }

  // --------------------------------------
  // Apply current filter
  // --------------------------------------

  applyRequestFilter();
}

// ==========================================
// 12. DISPLAY REQUESTS
// ==========================================

function displayRequests(requests) {
  if (!requestsList) {
    return;
  }

  requestsList.innerHTML = "";

  requests.forEach((request) => {
    const resource = request.resources;

    if (!resource) {
      return;
    }

    const card = document.createElement("article");

    card.className = "request-card";

    // ----------------------------------
    // Image
    // ----------------------------------

    const imageHTML = resource.image_url
      ? `
        <img
          src="${resource.image_url}"
          alt="${resource.title}"
          loading="lazy"
        >
      `
      : `
        <i
          class="fa-solid fa-image"
          aria-hidden="true"
        ></i>
      `;

    // ----------------------------------
    // Status
    // ----------------------------------

    const statusClass = `status-${request.status}`;

    const statusIcon = getStatusIcon(request.status);

    // ----------------------------------
    // Withdraw button
    // ----------------------------------

    const withdrawButtonHTML =
      request.status === "pending"
        ? `
          <button
            type="button"
            class="withdraw-request-btn"
            data-request-id="${request.id}"
          >
            <i
              class="fa-solid fa-ban"
              aria-hidden="true"
            ></i>

            Withdraw Request
          </button>
        `
        : "";

    // ----------------------------------
    // Return button
    // ----------------------------------

    const returnButtonHTML =
      request.status === "approved"
        ? `
          <button
            type="button"
            class="return-resource-btn"
            data-request-id="${request.id}"
          >
            <i
              class="fa-solid fa-arrow-rotate-left"
              aria-hidden="true"
            ></i>

            Return Resource
          </button>
        `
        : "";

    // ----------------------------------
    // Card
    // ----------------------------------

    card.innerHTML = `
      <div class="request-image">

        ${imageHTML}

      </div>


      <div class="request-content">

        <span class="request-category">
          ${formatCategory(resource.category)}
        </span>


        <h3>
          ${resource.title}
        </h3>


        <p class="request-description">
          ${resource.description}
        </p>


        <div class="request-meta">

          <span>
            <i
              class="fa-solid fa-location-dot"
              aria-hidden="true"
            ></i>

            ${resource.location || "Location not specified"}
          </span>


          <span>
            <i
              class="fa-regular fa-calendar"
              aria-hidden="true"
            ></i>

            ${formatDate(request.created_at)}
          </span>

        </div>


        <div class="request-actions">

          <button
            type="button"
            class="view-request-btn"
            data-resource-id="${request.resource_id}"
          >
            <i
              class="fa-solid fa-eye"
              aria-hidden="true"
            ></i>

            View Resource
          </button>


          ${withdrawButtonHTML}

          ${returnButtonHTML}

        </div>

      </div>


      <div class="request-status">

        <span
          class="status-badge ${statusClass}"
        >

          <i
            class="fa-solid ${statusIcon}"
            aria-hidden="true"
          ></i>

          ${formatStatus(request.status)}

        </span>

      </div>
    `;

    // ----------------------------------
    // Image fallback
    // ----------------------------------

    const image = card.querySelector("img");

    if (image) {
      image.addEventListener("error", () => {
        const container = card.querySelector(".request-image");

        if (!container) {
          return;
        }

        container.innerHTML = `
          <i
            class="fa-solid fa-image"
            aria-hidden="true"
          ></i>
        `;
      });
    }

    // ----------------------------------
    // View resource
    // ----------------------------------

    const viewButton = card.querySelector(".view-request-btn");

    if (viewButton) {
      viewButton.addEventListener("click", () => {
        const resourceId = Number(viewButton.dataset.resourceId);

        window.location.href = `resource-details.html?id=${encodeURIComponent(resourceId)}`;
      });
    }

    // ----------------------------------
    // Withdraw request
    // ----------------------------------

    const withdrawButton = card.querySelector(".withdraw-request-btn");

    if (withdrawButton) {
      withdrawButton.addEventListener("click", async () => {
        const requestId = Number(withdrawButton.dataset.requestId);

        const confirmed = window.confirm(
          "Are you sure you want to withdraw this borrow request?",
        );

        if (!confirmed) {
          return;
        }

        // ----------------------------------
        // Loading state
        // ----------------------------------

        withdrawButton.disabled = true;

        withdrawButton.innerHTML = `
          <i
            class="fa-solid fa-spinner fa-spin"
            aria-hidden="true"
          ></i>

          Withdrawing...
        `;

        // ----------------------------------
        // Secure cancel RPC
        // ----------------------------------

        const { error } = await supabaseClient.rpc("cancel_borrow_request", {
          request_id: requestId,
        });

        // ----------------------------------
        // Handle error
        // ----------------------------------

        if (error) {
          console.error("Withdraw request error:", error);

          withdrawButton.disabled = false;

          withdrawButton.innerHTML = `
            <i
              class="fa-solid fa-ban"
              aria-hidden="true"
            ></i>

            Withdraw Request
          `;

          alert(
            error.message ||
              "Unable to withdraw the request. Please try again.",
          );

          return;
        }

        // ----------------------------------
        // Success
        // ----------------------------------

        await loadMyRequests();
      });
    }

    // ----------------------------------
    // Return resource
    // ----------------------------------

    const returnButton = card.querySelector(".return-resource-btn");

    if (returnButton) {
      returnButton.addEventListener("click", async () => {
        const requestId = Number(returnButton.dataset.requestId);

        const confirmed = window.confirm(
          "Are you sure you want to return this resource?",
        );

        if (!confirmed) {
          return;
        }

        // ----------------------------------
        // Loading state
        // ----------------------------------

        returnButton.disabled = true;

        returnButton.innerHTML = `
          <i
            class="fa-solid fa-spinner fa-spin"
            aria-hidden="true"
          ></i>

          Returning...
        `;

        // ----------------------------------
        // Secure return RPC
        // ----------------------------------

        const { error } = await supabaseClient.rpc("return_borrowed_resource", {
          request_id: requestId,
        });

        // ----------------------------------
        // Handle error
        // ----------------------------------

        if (error) {
          console.error("Return resource error:", error);

          returnButton.disabled = false;

          returnButton.innerHTML = `
            <i
              class="fa-solid fa-arrow-rotate-left"
              aria-hidden="true"
            ></i>

            Return Resource
          `;

          alert(
            error.message || "Unable to return the resource. Please try again.",
          );

          return;
        }

        // ----------------------------------
        // Success
        // ----------------------------------

        await loadMyRequests();
      });
    }

    // ----------------------------------
    // Add card
    // ----------------------------------

    requestsList.appendChild(card);
  });
}

// ==========================================
// 13. REQUEST FILTER BUTTONS
// ==========================================

requestFilters.forEach((filterButton) => {
  filterButton.addEventListener("click", () => {
    currentFilter = filterButton.dataset.filter;

    // ----------------------------------
    // Update active button
    // ----------------------------------

    requestFilters.forEach((button) => {
      button.classList.remove("active");
    });

    filterButton.classList.add("active");

    // ----------------------------------
    // Apply filter
    // ----------------------------------

    applyRequestFilter();
  });
});

// ==========================================
// 14. MOBILE NAVIGATION
// ==========================================

if (menuBtn && primaryNavigation) {
  menuBtn.addEventListener("click", () => {
    const isOpen = primaryNavigation.classList.toggle("show");

    menuBtn.setAttribute("aria-expanded", String(isOpen));

    menuBtn.setAttribute(
      "aria-label",
      isOpen ? "Close navigation menu" : "Open navigation menu",
    );

    const icon = menuBtn.querySelector("i");

    if (icon) {
      icon.classList.toggle("fa-bars", !isOpen);

      icon.classList.toggle("fa-xmark", isOpen);
    }
  });
}

// ==========================================
// 15. HEADER SCROLL
// ==========================================

window.addEventListener("scroll", () => {
  if (!header) {
    return;
  }

  header.classList.toggle("scrolled", window.scrollY > 30);
});

// ==========================================
// 16. INITIALIZE
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {
  await updateAuthNavigation();

  await loadMyRequests();
});
