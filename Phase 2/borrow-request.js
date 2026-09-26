// ==========================================
// EcoShare — Borrow Request JavaScript
// ==========================================

// ==========================================
// 1. GET ELEMENTS
// ==========================================

const borrowRequestCard =
  document.getElementById("borrowRequestCard");

const resourceNotFound =
  document.getElementById("resourceNotFound");

const resourceLink =
  document.getElementById("resourceLink");

const resourceImage =
  document.getElementById("resourceImage");

const resourceCategory =
  document.getElementById("resourceCategory");

const resourceTitle =
  document.getElementById("resourceTitle");

const resourceDescription =
  document.getElementById("resourceDescription");

const resourceOwner =
  document.getElementById("resourceOwner");

const resourceLocation =
  document.getElementById("resourceLocation");

const resourceAvailability =
  document.getElementById("resourceAvailability");

const borrowRequestForm =
  document.getElementById("borrowRequestForm");

const requestMessage =
  document.getElementById("requestMessage");

const characterCount =
  document.getElementById("characterCount");

const messageError =
  document.getElementById("messageError");

const requestBtn =
  document.getElementById("requestBtn");

const formMessage =
  document.getElementById("formMessage");

const backButton =
  document.getElementById("backButton");

const menuBtn =
  document.getElementById("menu-btn");

const primaryNavigation =
  document.getElementById("primary-navigation");

const header =
  document.querySelector(".header");

const authNavButton =
  document.getElementById("authNavButton");

// ==========================================
// 2. CURRENT RESOURCE
// ==========================================

let currentResource = null;

// ==========================================
// 3. FORMAT CATEGORY
// ==========================================

function formatCategory(category) {
  if (!category) {
    return "Other";
  }

  return (
    category.charAt(0).toUpperCase() +
    category.slice(1)
  );
}

// ==========================================
// 4. GET RESOURCE ID
// ==========================================

function getResourceId() {
  const params =
    new URLSearchParams(window.location.search);

  const id = Number(params.get("id"));

  return Number.isInteger(id) ? id : null;
}

// ==========================================
// 5. SHOW FORM MESSAGE
// ==========================================

function showFormMessage(
  text,
  type = "error",
) {
  if (!formMessage) {
    return;
  }

  formMessage.textContent = text;

  formMessage.className =
    `form-message ${type}`;
}

// ==========================================
// 6. SHOW FIELD ERROR
// ==========================================

function showFieldError(text) {
  if (!messageError) {
    return;
  }

  messageError.textContent = text;
}

// ==========================================
// 7. UPDATE CHARACTER COUNT
// ==========================================

function updateCharacterCount() {
  if (
    !requestMessage ||
    !characterCount
  ) {
    return;
  }

  const count =
    requestMessage.value.length;

  characterCount.textContent =
    `${count} / 500`;
}

// ==========================================
// 8. CHECK AUTHENTICATION
// ==========================================

async function getAuthenticatedUser() {
  const {
    data: { user },
    error,
  } =
    await supabaseClient.auth.getUser();

  if (error) {
    console.error(
      "Authentication error:",
      error,
    );

    return null;
  }

  return user;
}

// ==========================================
// 9. LOAD RESOURCE FROM SUPABASE
// ==========================================

async function loadResource() {
  const resourceId =
    getResourceId();

  // ----------------------------------------
  // Invalid resource ID
  // ----------------------------------------

  if (!resourceId) {
    showResourceNotFound();

    return;
  }

  // ----------------------------------------
  // Fetch resource
  // ----------------------------------------

  const {
    data: resource,
    error,
  } =
    await supabaseClient
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
        owner_name
      `,
      )
      .eq("id", resourceId)
      .maybeSingle();

  // ----------------------------------------
  // Handle database error
  // ----------------------------------------

  if (error) {
    console.error(
      "Resource loading error:",
      error,
    );

    showFormMessage(
      "Unable to load this resource. Please try again.",
      "error",
    );

    showResourceNotFound();

    return;
  }

  // ----------------------------------------
  // Resource not found
  // ----------------------------------------

  if (!resource) {
    showResourceNotFound();

    return;
  }

  // ----------------------------------------
  // Store current resource
  // ----------------------------------------

  currentResource = resource;

  // ----------------------------------------
  // Display resource
  // ----------------------------------------

  displayResource(resource);
}

// ==========================================
// 10. DISPLAY RESOURCE IMAGE
// ==========================================

function displayResourceImage(resource) {
  if (!resourceImage) {
    return;
  }

  // ----------------------------------------
  // No image
  // ----------------------------------------

  if (!resource.image_url) {
    resourceImage.removeAttribute("src");

    resourceImage.alt = "";

    const imageContainer =
      resourceImage.parentElement;

    if (imageContainer) {
      imageContainer.innerHTML = `
        <i
          class="fa-solid fa-image"
          aria-hidden="true"
        ></i>
      `;
    }

    return;
  }

  // ----------------------------------------
  // Image
  // ----------------------------------------

  resourceImage.src =
    resource.image_url;

  resourceImage.alt =
    resource.title;

  resourceImage.onerror = () => {
    resourceImage.removeAttribute(
      "src",
    );

    resourceImage.alt = "";

    const imageContainer =
      resourceImage.parentElement;

    if (!imageContainer) {
      return;
    }

    imageContainer.innerHTML = `
      <i
        class="fa-solid fa-image"
        aria-hidden="true"
      ></i>
    `;
  };
}

// ==========================================
// 11. DISPLAY RESOURCE
// ==========================================

function displayResource(resource) {
  if (!resource) {
    showResourceNotFound();

    return;
  }

  // ----------------------------------------
  // Show page
  // ----------------------------------------

  if (borrowRequestCard) {
    borrowRequestCard.hidden = false;
  }

  if (resourceNotFound) {
    resourceNotFound.hidden = true;
  }

  // ----------------------------------------
  // Page title
  // ----------------------------------------

  document.title =
    `Borrow ${resource.title} | EcoShare`;

  // ----------------------------------------
  // Resource link
  // ----------------------------------------

  if (resourceLink) {
    resourceLink.textContent =
      resource.title;

    resourceLink.href =
      `resource-details.html?id=${encodeURIComponent(
        resource.id,
      )}`;
  }

  // ----------------------------------------
  // Category
  // ----------------------------------------

  if (resourceCategory) {
    resourceCategory.textContent =
      formatCategory(resource.category);
  }

  // ----------------------------------------
  // Title
  // ----------------------------------------

  if (resourceTitle) {
    resourceTitle.textContent =
      resource.title;
  }

  // ----------------------------------------
  // Description
  // ----------------------------------------

  if (resourceDescription) {
    resourceDescription.textContent =
      resource.description;
  }

  // ----------------------------------------
  // Owner
  // ----------------------------------------

  if (resourceOwner) {
    resourceOwner.textContent =
      resource.owner_name ||
      "EcoShare User";
  }

  // ----------------------------------------
  // Location
  // ----------------------------------------

  if (resourceLocation) {
    resourceLocation.textContent =
      resource.location ||
      "Not specified";
  }

  // ----------------------------------------
  // Availability
  // ----------------------------------------

  if (resourceAvailability) {
    resourceAvailability.classList.remove(
      "unavailable",
    );

    if (resource.available) {
      resourceAvailability.textContent =
        "Available";
    } else {
      resourceAvailability.textContent =
        "Currently Borrowed";

      resourceAvailability.classList.add(
        "unavailable",
      );
    }
  }

  // ----------------------------------------
  // Image
  // ----------------------------------------

  displayResourceImage(resource);

  // ----------------------------------------
  // Form state
  // ----------------------------------------

  setupRequestForm(resource);
}

// ==========================================
// 12. SETUP REQUEST FORM
// ==========================================

async function setupRequestForm(resource) {
  if (!borrowRequestForm) {
    return;
  }

  // ----------------------------------------
  // Reset form
  // ----------------------------------------

  borrowRequestForm.reset();

  updateCharacterCount();

  showFieldError("");

  showFormMessage("");

  // ----------------------------------------
  // Resource unavailable
  // ----------------------------------------

  if (!resource.available) {
    if (requestMessage) {
      requestMessage.disabled = true;
    }

    if (requestBtn) {
      requestBtn.disabled = true;

      requestBtn.innerHTML = `
        <i
          class="fa-solid fa-ban"
          aria-hidden="true"
        ></i>
        Currently Unavailable
      `;
    }

    return;
  }

  // ----------------------------------------
  // Get current user
  // ----------------------------------------

  const user =
    await getAuthenticatedUser();

  // ----------------------------------------
  // Not logged in
  // ----------------------------------------

  if (!user) {
    if (requestMessage) {
      requestMessage.disabled = true;
    }

    if (requestBtn) {
      requestBtn.disabled = false;

      requestBtn.innerHTML = `
        <i
          class="fa-solid fa-right-to-bracket"
          aria-hidden="true"
        ></i>
        Login to Request
      `;
    }

    return;
  }

  // ----------------------------------------
  // Owner cannot request own resource
  // ----------------------------------------

  if (
    user.id === resource.owner_id
  ) {
    if (requestMessage) {
      requestMessage.disabled = true;
    }

    if (requestBtn) {
      requestBtn.disabled = true;

      requestBtn.innerHTML = `
        <i
          class="fa-solid fa-user"
          aria-hidden="true"
        ></i>
        Your Resource
      `;
    }

    return;
  }

  // ----------------------------------------
  // Normal borrower
  // ----------------------------------------

  if (requestMessage) {
    requestMessage.disabled = false;
  }

  if (requestBtn) {
    requestBtn.disabled = false;

    requestBtn.innerHTML = `
      <i
        class="fa-solid fa-paper-plane"
        aria-hidden="true"
      ></i>
      Send Request
    `;
  }
}

// ==========================================
// 13. VALIDATE REQUEST MESSAGE
// ==========================================

function validateRequestMessage() {
  if (!requestMessage) {
    return false;
  }

  const message =
    requestMessage.value.trim();

  // ----------------------------------------
  // Empty message
  // ----------------------------------------

  if (!message) {
    showFieldError(
      "Please enter a message for the resource owner.",
    );

    requestMessage.focus();

    return false;
  }

  // ----------------------------------------
  // Minimum length
  // ----------------------------------------

  if (message.length < 10) {
    showFieldError(
      "Please enter at least 10 characters.",
    );

    requestMessage.focus();

    return false;
  }

  // ----------------------------------------
  // Maximum length
  // ----------------------------------------

  if (message.length > 500) {
    showFieldError(
      "Message cannot exceed 500 characters.",
    );

    requestMessage.focus();

    return false;
  }

  showFieldError("");

  return true;
}

// ==========================================
// 14. SUBMIT BORROW REQUEST
// ==========================================

async function handleRequestSubmission() {
  if (!currentResource) {
    return;
  }

  // ----------------------------------------
  // Check authentication
  // ----------------------------------------

  const user =
    await getAuthenticatedUser();

  if (!user) {
    const resourceId =
      currentResource.id;

    window.location.href =
      `../Phase 1/login.html?redirect=${encodeURIComponent(
        `../Phase 2/borrow-request.html?id=${resourceId}`,
      )}`;

    return;
  }

  // ----------------------------------------
  // Availability check
  // ----------------------------------------

  if (!currentResource.available) {
    showFormMessage(
      "This resource is currently unavailable.",
      "error",
    );

    return;
  }

  // ----------------------------------------
  // Self-borrow protection
  // ----------------------------------------

  if (
    user.id ===
    currentResource.owner_id
  ) {
    showFormMessage(
      "You cannot borrow your own resource.",
      "error",
    );

    return;
  }

  // ----------------------------------------
  // Validate message
  // ----------------------------------------

  if (!validateRequestMessage()) {
    return;
  }

  // ----------------------------------------
  // Disable button
  // ----------------------------------------

  if (requestBtn) {
    requestBtn.disabled = true;

    requestBtn.innerHTML = `
      <i
        class="fa-solid fa-spinner fa-spin"
        aria-hidden="true"
      ></i>
      Sending...
    `;
  }

  // ----------------------------------------
  // Insert request
  // ----------------------------------------

  const {
    data,
    error,
  } =
    await supabaseClient
      .from("borrow_requests")
      .insert({
        resource_id:
          currentResource.id,

        borrower_id:
          user.id,

        message:
          requestMessage.value.trim(),

        status: "pending",
      })
      .select()
      .single();

  // ----------------------------------------
  // Handle database error
  // ----------------------------------------

  if (error) {
    console.error(
      "Borrow request error:",
      error,
    );

    // --------------------------------------
    // Duplicate request
    // --------------------------------------

    if (error.code === "23505") {
      showFormMessage(
        "You have already submitted a request for this resource.",
        "error",
      );
    }

    // --------------------------------------
    // Other error
    // --------------------------------------

    else {
      showFormMessage(
        "Unable to send your request right now. Please try again.",
        "error",
      );
    }

    resetRequestButton();

    return;
  }

  // ----------------------------------------
  // Success
  // ----------------------------------------

  console.log(
    "Borrow request created:",
    data,
  );

  showFormMessage(
    "Your borrow request has been sent successfully!",
    "success",
  );

  // ----------------------------------------
  // Disable message field
  // ----------------------------------------

  if (requestMessage) {
    requestMessage.disabled = true;
  }

  // ----------------------------------------
  // Update button
  // ----------------------------------------

  if (requestBtn) {
    requestBtn.disabled = true;

    requestBtn.innerHTML = `
      <i
        class="fa-solid fa-check"
        aria-hidden="true"
      ></i>
      Request Sent
    `;
  }

  // ========================================
  // RETURN TO PREVIOUS PAGE
  // ========================================

  setTimeout(() => {
    if (window.history.length > 1) {
      window.history.back();

      return;
    }

    // --------------------------------------
    // Fallback
    // --------------------------------------

    window.location.href =
      `resource-details.html?id=${encodeURIComponent(
        currentResource.id,
      )}`;
  }, 1200);
}

// ==========================================
// 15. RESET REQUEST BUTTON
// ==========================================

function resetRequestButton() {
  if (!requestBtn) {
    return;
  }

  requestBtn.disabled = false;

  requestBtn.innerHTML = `
    <i
      class="fa-solid fa-paper-plane"
      aria-hidden="true"
    ></i>
    Send Request
  `;
}

// ==========================================
// 16. FORM SUBMISSION
// ==========================================

if (borrowRequestForm) {
  borrowRequestForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      await handleRequestSubmission();
    },
  );
}

// ==========================================
// 17. CHARACTER COUNT
// ==========================================

if (requestMessage) {
  requestMessage.addEventListener(
    "input",
    () => {
      updateCharacterCount();

      showFieldError("");

      if (formMessage) {
        formMessage.textContent = "";

        formMessage.className =
          "form-message";
      }
    },
  );
}

// ==========================================
// 18. BACK BUTTON
// ==========================================

if (backButton) {
  backButton.addEventListener(
    "click",
    () => {
      // ------------------------------------
      // Return to previous browser page
      // ------------------------------------

      if (window.history.length > 1) {
        window.history.back();

        return;
      }

      // ------------------------------------
      // Fallback
      // ------------------------------------

      if (currentResource) {
        window.location.href =
          `resource-details.html?id=${encodeURIComponent(
            currentResource.id,
          )}`;

        return;
      }

      window.location.href =
        "explore.html";
    },
  );
}

// ==========================================
// 19. MOBILE NAVIGATION
// ==========================================

if (
  menuBtn &&
  primaryNavigation
) {
  menuBtn.addEventListener(
    "click",
    () => {
      const isOpen =
        primaryNavigation.classList.toggle(
          "show",
        );

      menuBtn.setAttribute(
        "aria-expanded",
        String(isOpen),
      );

      menuBtn.setAttribute(
        "aria-label",
        isOpen
          ? "Close navigation menu"
          : "Open navigation menu",
      );

      const icon =
        menuBtn.querySelector("i");

      if (icon) {
        icon.classList.toggle(
          "fa-bars",
          !isOpen,
        );

        icon.classList.toggle(
          "fa-xmark",
          isOpen,
        );
      }
    },
  );

  const navigationLinks =
    primaryNavigation.querySelectorAll(
      "a",
    );

  navigationLinks.forEach(
    (link) => {
      link.addEventListener(
        "click",
        () => {
          primaryNavigation.classList.remove(
            "show",
          );

          menuBtn.setAttribute(
            "aria-expanded",
            "false",
          );

          menuBtn.setAttribute(
            "aria-label",
            "Open navigation menu",
          );

          const icon =
            menuBtn.querySelector("i");

          if (icon) {
            icon.classList.remove(
              "fa-xmark",
            );

            icon.classList.add(
              "fa-bars",
            );
          }
        },
      );
    },
  );
}

// ==========================================
// 20. HEADER SCROLL EFFECT
// ==========================================

window.addEventListener(
  "scroll",
  () => {
    if (!header) {
      return;
    }

    header.classList.toggle(
      "scrolled",
      window.scrollY > 30,
    );
  },
);

// ==========================================
// 21. AUTH NAVIGATION
// ==========================================

async function updateAuthNavigation() {
  if (!authNavButton) {
    return;
  }

  const {
    data: { session },
  } =
    await supabaseClient.auth.getSession();

  if (session) {
    authNavButton.innerHTML = `
      <i class="fa-solid fa-user"></i>
      Profile
    `;

    authNavButton.href =
      "../Phase 1/profile.html";
  } else {
    authNavButton.innerHTML = `
      <i class="fa-solid fa-right-to-bracket"></i>
      Login
    `;

    authNavButton.href =
      "../Phase 1/login.html";
  }
}

// ==========================================
// 22. RESOURCE NOT FOUND
// ==========================================

function showResourceNotFound() {
  if (borrowRequestCard) {
    borrowRequestCard.hidden = true;
  }

  if (resourceNotFound) {
    resourceNotFound.hidden = false;
  }

  document.title =
    "Resource Not Found | EcoShare";
}

// ==========================================
// 23. INITIALIZE
// ==========================================

document.addEventListener(
  "DOMContentLoaded",
  async () => {
    // --------------------------------------
    // Update navigation
    // --------------------------------------

    await updateAuthNavigation();

    // --------------------------------------
    // Check authentication
    // --------------------------------------

    const user =
      await getAuthenticatedUser();

    // --------------------------------------
    // Protect page
    // --------------------------------------

    if (!user) {
      const resourceId =
        getResourceId();

      const returnUrl = resourceId
        ? `../Phase 2/borrow-request.html?id=${encodeURIComponent(
            resourceId,
          )}`
        : "../Phase 2/borrow-request.html";

      window.location.href =
        `../Phase 1/login.html?redirect=${encodeURIComponent(
          returnUrl,
        )}`;

      return;
    }

    // --------------------------------------
    // Load resource
    // --------------------------------------

    await loadResource();
  },
);