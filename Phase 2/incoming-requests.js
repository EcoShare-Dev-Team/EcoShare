// ==========================================
// EcoShare — Incoming Requests JavaScript
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

// ==========================================
// 2. FORMAT CATEGORY
// ==========================================

function formatCategory(category) {
  if (!category) {
    return "Other";
  }

  return category.charAt(0).toUpperCase() + category.slice(1);
}

// ==========================================
// 3. FORMAT STATUS
// ==========================================

function formatStatus(status) {
  if (!status) {
    return "Unknown";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ==========================================
// 4. STATUS ICON
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

    default:
      return "fa-circle-question";
  }
}

// ==========================================
// 5. FORMAT DATE
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
// 6. UPDATE AUTH NAVIGATION
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
// 7. SHOW ERROR
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
        Unable to load incoming requests
      </h3>

      <p>
        ${message}
      </p>

    </div>
  `;
}

// ==========================================
// 8. GET AUTHENTICATED USER
// ==========================================

async function getAuthenticatedUser() {
  const {
    data: { user },
    error,
  } = await supabaseClient.auth.getUser();

  if (error) {
    console.error("Authentication error:", error);

    return null;
  }

  return user;
}

const urlParams = new URLSearchParams(window.location.search);

const highlightedRequestId = Number(urlParams.get("requestId")) || null;

// ==========================================
// 9. LOAD INCOMING REQUESTS
// ==========================================

async function loadIncomingRequests() {
  const user = await getAuthenticatedUser();

  // --------------------------------------
  // Not authenticated
  // --------------------------------------

  if (!user) {
    window.location.href =
      "../Phase 1/login.html?returnUrl=" +
      encodeURIComponent(window.location.pathname + window.location.search);

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
        Please wait while we load your incoming requests.
      </p>

    </div>
  `;

  // --------------------------------------
  // Fetch incoming requests
  // --------------------------------------

  const { data: requests, error: requestsError } = await supabaseClient
    .from("incoming_request_listings")
    .select(
      `
      id,
      resource_id,
      borrower_id,
      message,
      status,
      created_at,
      updated_at,
      title,
      description,
      category,
      resource_location,
      image_url,
      available,
      borrower_name,
      borrower_location
    `,
    )
    .order("created_at", {
      ascending: false,
    });

  // --------------------------------------
  // Handle error
  // --------------------------------------

  if (requestsError) {
    console.error("Incoming requests error:", requestsError);

    showError(
      "Unable to load incoming requests. Please refresh the page and try again.",
    );

    return;
  }

  // --------------------------------------
  // Empty state
  // --------------------------------------

  if (!requests || requests.length === 0) {
    showEmptyState(
      "When someone requests one of your resources, it will appear here.",
    );

    return;
  }

  // --------------------------------------
  // Display
  // --------------------------------------

  requestsList.hidden = false;

  if (emptyRequests) {
    emptyRequests.hidden = true;
  }

  if (requestsCount) {
    requestsCount.textContent =
      `${requests.length} request` + `${requests.length === 1 ? "" : "s"}`;
  }

  displayRequests(requests);
}

// ==========================================
// 10. EMPTY STATE
// ==========================================

function showEmptyState(message) {
  requestsList.innerHTML = "";

  requestsList.hidden = true;

  if (emptyRequests) {
    emptyRequests.hidden = false;

    const paragraph = emptyRequests.querySelector("p");

    if (paragraph) {
      paragraph.textContent = message;
    }
  }

  if (requestsCount) {
    requestsCount.textContent = "No requests";
  }
}

// ==========================================
// 11. DISPLAY REQUESTS
// ==========================================

function displayRequests(requests) {
  requestsList.innerHTML = "";

  requests.forEach((request) => {
    // ----------------------------------
    // Resource data from view
    // ----------------------------------

    const resource = {
      title: request.title,

      description: request.description,

      category: request.category,

      location: request.resource_location,

      image_url: request.image_url,

      available: request.available,
    };

    // ----------------------------------
    // Borrower data from view
    // ----------------------------------

    const borrower = {
      full_name: request.borrower_name,

      location: request.borrower_location,
    };

    // ----------------------------------
    // Create card
    // ----------------------------------

    const card = document.createElement("article");

    card.className = "incoming-request-card";

    card.dataset.requestId = String(request.id);

    if (highlightedRequestId === Number(request.id)) {
  card.classList.add("highlighted-request");
}

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
    // Action buttons
    // ----------------------------------

    const actionsHTML =
      request.status === "pending"
        ? `
          <div class="incoming-request-actions">

            <button
              type="button"
              class="approve-request-btn"
              data-request-id="${request.id}"
            >

              <i
                class="fa-solid fa-check"
                aria-hidden="true"
              ></i>

              Approve

            </button>


            <button
              type="button"
              class="reject-request-btn"
              data-request-id="${request.id}"
            >

              <i
                class="fa-solid fa-xmark"
                aria-hidden="true"
              ></i>

              Reject

            </button>

          </div>
        `
        : "";

    // ----------------------------------
    // Card HTML
    // ----------------------------------

    card.innerHTML = `

      <div class="incoming-request-image">

        ${imageHTML}

      </div>


      <div class="incoming-request-content">

        <span class="request-category">

          ${formatCategory(resource.category)}

        </span>


        <h3>

          ${resource.title}

        </h3>


        <p class="resource-description">

          ${resource.description}

        </p>


        <!-- Borrower information -->

        <div class="borrower-info">


          <!-- Borrower name -->

          <span>

            <i
              class="fa-solid fa-user"
              aria-hidden="true"
            ></i>

            ${borrower.full_name || "Unknown user"}

          </span>


          <!-- Borrower location -->

          ${
            borrower.location
              ? `
                <span>

                  <i
                    class="fa-solid fa-location-dot"
                    aria-hidden="true"
                  ></i>

                  ${borrower.location}

                </span>
              `
              : ""
          }


          <!-- Request date -->

          <span>

            <i
              class="fa-regular fa-calendar"
              aria-hidden="true"
            ></i>

            ${formatDate(request.created_at)}

          </span>


        </div>


        <!-- Borrower message -->

        <div class="request-message">

          <strong>
            Borrower's Message
          </strong>


          <p>
            ${request.message}
          </p>

        </div>


        <!-- Actions -->

        ${actionsHTML}


      </div>


      <!-- Status -->

      <div class="incoming-request-status">

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
        const container = card.querySelector(".incoming-request-image");

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
    // Approve button
    // ----------------------------------

    const approveButton = card.querySelector(".approve-request-btn");

    if (approveButton) {
      approveButton.addEventListener("click", () =>
        updateRequestStatus(request.id, "approved", card),
      );
    }

    // ----------------------------------
    // Reject button
    // ----------------------------------

    const rejectButton = card.querySelector(".reject-request-btn");

    if (rejectButton) {
      rejectButton.addEventListener("click", () =>
        updateRequestStatus(request.id, "rejected", card),
      );
    }

    requestsList.appendChild(card);

    if (highlightedRequestId === Number(request.id)) {
  requestAnimationFrame(() => {
    card.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  });
}
  });
}

// ==========================================
// 12. APPROVE / REJECT REQUEST
// ==========================================

async function updateRequestStatus(requestId, newStatus, card) {
  const actionName = newStatus === "approved" ? "approve" : "reject";

  // --------------------------------------
  // Confirmation
  // --------------------------------------

  const confirmed = window.confirm(
    `Are you sure you want to ${actionName} this request?`,
  );

  if (!confirmed) {
    return;
  }

  // --------------------------------------
  // Get buttons
  // --------------------------------------

  const approveButton = card.querySelector(".approve-request-btn");

  const rejectButton = card.querySelector(".reject-request-btn");

  // --------------------------------------
  // Disable buttons
  // --------------------------------------

  if (approveButton) {
    approveButton.disabled = true;
  }

  if (rejectButton) {
    rejectButton.disabled = true;
  }

  // --------------------------------------
  // Active button
  // --------------------------------------

  const activeButton = newStatus === "approved" ? approveButton : rejectButton;

  if (activeButton) {
    activeButton.innerHTML = `
      <i
        class="fa-solid fa-spinner fa-spin"
        aria-hidden="true"
      ></i>

      ${newStatus === "approved" ? "Approving..." : "Rejecting..."}
    `;
  }

  // ======================================
  // APPROVE USING DATABASE FUNCTION
  // ======================================

  if (newStatus === "approved") {
    const { error } = await supabaseClient.rpc("approve_borrow_request", {
      request_id: Number(requestId),
    });

    if (error) {
      console.error("Approve request error:", error);

      restoreActionButtons(approveButton, rejectButton);

      alert(
        error.message || "Unable to approve the request. Please try again.",
      );

      return;
    }

    // Database function handles:
    // 1. Approving the selected request
    // 2. Making the resource unavailable
    // 3. Rejecting other pending requests

    await loadIncomingRequests();

    return;
  }

  // ======================================
  // REJECT USING DATABASE FUNCTION
  // ======================================

  if (newStatus === "rejected") {
    const { error } = await supabaseClient.rpc("reject_borrow_request", {
      request_id: Number(requestId),
    });

    if (error) {
      console.error("Reject request error:", error);

      restoreActionButtons(approveButton, rejectButton);

      alert(error.message || "Unable to reject the request. Please try again.");

      return;
    }

    await loadIncomingRequests();
  }
}

// ==========================================
// 13. RESTORE ACTION BUTTONS
// ==========================================

function restoreActionButtons(approveButton, rejectButton) {
  if (approveButton) {
    approveButton.disabled = false;

    approveButton.innerHTML = `
      <i
        class="fa-solid fa-check"
        aria-hidden="true"
      ></i>

      Approve
    `;
  }

  if (rejectButton) {
    rejectButton.disabled = false;

    rejectButton.innerHTML = `
      <i
        class="fa-solid fa-xmark"
        aria-hidden="true"
      ></i>

      Reject
    `;
  }
}

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

  await loadIncomingRequests();
});
