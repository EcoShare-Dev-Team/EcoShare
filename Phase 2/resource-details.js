// ==========================================
// EcoShare — Resource Details JavaScript
// ==========================================

// ==========================================
// 1. GET ELEMENTS
// ==========================================

const detailsCard =
  document.getElementById("detailsCard");

const detailsImage =
  document.getElementById("detailsImage");

const detailsCategory =
  document.getElementById("detailsCategory");

const detailsTitle =
  document.getElementById("detailsTitle");

const detailsDescription =
  document.getElementById("detailsDescription");

const detailsOwner =
  document.getElementById("detailsOwner");

const detailsLocation =
  document.getElementById("detailsLocation");

const detailsAvailability =
  document.getElementById("detailsAvailability");

const breadcrumbTitle =
  document.getElementById("breadcrumbTitle");

const borrowBtn =
  document.getElementById("borrowBtn");

const detailsMessage =
  document.getElementById("detailsMessage");

const resourceNotFound =
  document.getElementById("resourceNotFound");

const menuBtn =
  document.getElementById("menu-btn");

const primaryNavigation =
  document.getElementById("primary-navigation");

const header =
  document.querySelector(".header");

const authNavButton =
  document.getElementById("authNavButton");

// ==========================================
// 2. FORMAT CATEGORY
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
// 3. SHOW MESSAGE
// ==========================================

function showMessage(
  text,
  type = "error",
) {
  if (!detailsMessage) {
    return;
  }

  detailsMessage.textContent = text;

  detailsMessage.style.color =
    type === "success"
      ? "var(--color-success)"
      : "var(--color-error)";
}

// ==========================================
// 4. GET RESOURCE ID
// ==========================================

function getResourceId() {
  const params =
    new URLSearchParams(
      window.location.search,
    );

  const id = Number(
    params.get("id"),
  );

  return Number.isInteger(id)
    ? id
    : null;
}

// ==========================================
// 5. LOAD RESOURCE FROM SUPABASE
// ==========================================

async function loadResource() {
  const resourceId =
    getResourceId();

  // ----------------------------------------
  // Invalid ID
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
  } = await supabaseClient
    .from("resources")
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
      created_at
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
  // Get owner name
  // ----------------------------------------

  let ownerName =
    "EcoShare User";

  const {
    data: ownerProfile,
    error: ownerError,
  } =
    await supabaseClient
      .from("profiles")
      .select("full_name")
      .eq("id", resource.owner_id)
      .maybeSingle();

  if (
    !ownerError &&
    ownerProfile?.full_name
  ) {
    ownerName =
      ownerProfile.full_name;
  }

  // ----------------------------------------
  // Convert database object
  // ----------------------------------------

  const formattedResource = {
    id: resource.id,

    title: resource.title,

    description:
      resource.description,

    category:
      resource.category,

    owner: ownerName,

    ownerId:
      resource.owner_id,

    location:
      resource.location ||
      "Not specified",

    available:
      resource.available,

    image:
      resource.image_url,

    createdAt:
      resource.created_at,
  };

  // ----------------------------------------
  // Display resource
  // ----------------------------------------

  displayResource(
    formattedResource,
  );
}

// ==========================================
// 6. DISPLAY RESOURCE IMAGE
// ==========================================

function displayResourceImage(resource) {
  if (!detailsImage) {
    return;
  }

  // ----------------------------------------
  // Clear previous content
  // ----------------------------------------

  detailsImage.innerHTML = "";

  // ----------------------------------------
  // No image
  // ----------------------------------------

  if (!resource.image) {
    detailsImage.innerHTML = `
      <i
        class="fa-solid fa-image"
        aria-hidden="true"
      ></i>
    `;

    return;
  }

  // ----------------------------------------
  // Create image
  // ----------------------------------------

  const image =
    document.createElement("img");

  image.src =
    resource.image;

  image.alt =
    resource.title;

  image.loading =
    "lazy";

  image.addEventListener(
    "error",
    () => {
      detailsImage.innerHTML = `
        <i
          class="fa-solid fa-image"
          aria-hidden="true"
        ></i>
      `;
    },
  );

  detailsImage.appendChild(
    image,
  );
}

// ==========================================
// 7. SETUP BORROW BUTTON
// ==========================================

async function setupBorrowButton(
  resource,
) {
  if (!borrowBtn) {
    return;
  }

  showMessage("");

  // ----------------------------------------
  // Reset button state
  // ----------------------------------------

  borrowBtn.disabled =
    false;

  borrowBtn.onclick =
    null;

  // ========================================
  // RESOURCE UNAVAILABLE
  // ========================================

  if (!resource.available) {
    borrowBtn.disabled =
      true;

    borrowBtn.innerHTML = `
      <i
        class="fa-solid fa-ban"
        aria-hidden="true"
      ></i>
      Currently Unavailable
    `;

    return;
  }

  // ========================================
  // CHECK CURRENT USER
  // ========================================

  const {
    data: { user },
    error,
  } =
    await supabaseClient.auth.getUser();

  if (error) {
    console.error(
      "User check error:",
      error,
    );
  }

  // ========================================
  // USER IS OWNER
  // ========================================

  if (
    user &&
    user.id === resource.ownerId
  ) {
    borrowBtn.disabled =
      true;

    borrowBtn.innerHTML = `
      <i
        class="fa-solid fa-user"
        aria-hidden="true"
      ></i>
      Your Resource
    `;

    return;
  }

  // ========================================
  // RESOURCE AVAILABLE
  // ========================================

  borrowBtn.disabled =
    false;

  borrowBtn.innerHTML = `
    <i
      class="fa-solid fa-hand-holding"
      aria-hidden="true"
    ></i>
    Borrow / Request
  `;

  borrowBtn.onclick = () => {
    handleBorrowRequest(
      resource,
    );
  };
}

// ==========================================
// 8. HANDLE BORROW REQUEST
// ==========================================

async function handleBorrowRequest(
  resource,
) {
  if (!resource) {
    return;
  }

  // ========================================
  // CHECK AVAILABILITY
  // ========================================

  if (!resource.available) {
    showMessage(
      "This resource is currently unavailable.",
    );

    return;
  }

  // ========================================
  // CHECK AUTHENTICATION
  // ========================================

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

    showMessage(
      "Unable to verify your account. Please try again.",
    );

    return;
  }

  // ========================================
  // NOT LOGGED IN
  // ========================================

  if (!user) {
    showMessage(
      "Please login to request this resource.",
      "success",
    );

    const returnUrl =
      `../Phase 2/resource-details.html?id=${encodeURIComponent(
        resource.id,
      )}`;

    const loginUrl =
      `../Phase 1/login.html?redirect=${encodeURIComponent(
        returnUrl,
      )}`;

    setTimeout(() => {
      window.location.href =
        loginUrl;
    }, 600);

    return;
  }

  // ========================================
  // OWNER SAFETY CHECK
  // ========================================

  if (
    user.id === resource.ownerId
  ) {
    showMessage(
      "You cannot borrow your own resource.",
    );

    return;
  }

  // ========================================
  // OPEN BORROW REQUEST PAGE
  // ========================================

  window.location.href =
    `borrow-request.html?id=${encodeURIComponent(
      resource.id,
    )}`;
}

// ==========================================
// 9. DISPLAY RESOURCE
// ==========================================

function displayResource(
  resource,
) {
  if (!resource) {
    showResourceNotFound();

    return;
  }

  // ========================================
  // SHOW DETAILS
  // ========================================

  if (detailsCard) {
    detailsCard.hidden =
      false;
  }

  if (resourceNotFound) {
    resourceNotFound.hidden =
      true;
  }

  // ========================================
  // PAGE TITLE
  // ========================================

  document.title =
    `${resource.title} | EcoShare`;

  // ========================================
  // BREADCRUMB
  // ========================================

  if (breadcrumbTitle) {
    breadcrumbTitle.textContent =
      resource.title;
  }

  // ========================================
  // CATEGORY
  // ========================================

  if (detailsCategory) {
    detailsCategory.textContent =
      formatCategory(
        resource.category,
      );
  }

  // ========================================
  // TITLE
  // ========================================

  if (detailsTitle) {
    detailsTitle.textContent =
      resource.title;
  }

  // ========================================
  // DESCRIPTION
  // ========================================

  if (detailsDescription) {
    detailsDescription.textContent =
      resource.description;
  }

  // ========================================
  // OWNER
  // ========================================

  if (detailsOwner) {
    detailsOwner.textContent =
      resource.owner;
  }

  // ========================================
  // LOCATION
  // ========================================

  if (detailsLocation) {
    detailsLocation.textContent =
      resource.location;
  }

  // ========================================
  // AVAILABILITY
  // ========================================

  if (detailsAvailability) {
    detailsAvailability.classList.remove(
      "available",
      "unavailable",
    );

    if (resource.available) {
      detailsAvailability.textContent =
        "Available";

      detailsAvailability.classList.add(
        "available",
      );
    } else {
      detailsAvailability.textContent =
        "Currently Borrowed";

      detailsAvailability.classList.add(
        "unavailable",
      );
    }
  }

  // ========================================
  // IMAGE
  // ========================================

  displayResourceImage(
    resource,
  );

  // ========================================
  // BORROW BUTTON
  // ========================================

  setupBorrowButton(
    resource,
  );
}

// ==========================================
// 10. RESOURCE NOT FOUND
// ==========================================

function showResourceNotFound() {
  if (detailsCard) {
    detailsCard.hidden =
      true;
  }

  if (resourceNotFound) {
    resourceNotFound.hidden =
      false;
  }

  document.title =
    "Resource Not Found | EcoShare";
}

// ==========================================
// 11. AUTH NAVIGATION
// ==========================================

async function updateAuthNavigation() {
  if (!authNavButton) {
    return;
  }

  const {
    data: { session },
    error,
  } =
    await supabaseClient.auth.getSession();

  if (error) {
    console.error(
      "Session error:",
      error,
    );

    return;
  }

  if (session) {
    authNavButton.innerHTML = `
      <i
        class="fa-solid fa-user"
        aria-hidden="true"
      ></i>
      Profile
    `;

    authNavButton.href =
      "../Phase 1/profile.html";
  } else {
    authNavButton.innerHTML = `
      <i
        class="fa-solid fa-right-to-bracket"
        aria-hidden="true"
      ></i>
      Login
    `;

    authNavButton.href =
      "../Phase 1/login.html";
  }
}

// ==========================================
// 12. MOBILE NAVIGATION
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
// 13. HEADER SCROLL EFFECT
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
// 14. INITIALIZE PAGE
// ==========================================

document.addEventListener(
  "DOMContentLoaded",
  async () => {
    await updateAuthNavigation();

    await loadResource();
  },
);