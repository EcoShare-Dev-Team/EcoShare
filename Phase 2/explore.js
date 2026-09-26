// ==========================================
// EcoShare — Explore Resources JavaScript
// ==========================================

// ==========================================
// 1. RESOURCE DATA / STATE
// ==========================================

let resources = [];

let filteredResources = [];

// ==========================================
// 2. GET ELEMENTS
// ==========================================

const resourceSearch = document.getElementById("resourceSearch");

const searchBtn = document.getElementById("searchBtn");

const categoryFilter = document.getElementById("categoryFilter");

const availabilityFilter = document.getElementById("availabilityFilter");

const sortFilter = document.getElementById("sortFilter");

const resultsCount = document.getElementById("resultsCount");

const resourceGrid = document.getElementById("resourceGrid");

const noResources = document.getElementById("noResources");

const resetFilters = document.getElementById("resetFilters");

const menuBtn = document.getElementById("menu-btn");

const primaryNavigation = document.getElementById("primary-navigation");

const header = document.querySelector(".header");

const authNavButton = document.getElementById("authNavButton");

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
// 4. UPDATE RESULT COUNT
// ==========================================

function updateResultsCount(count) {
  if (!resultsCount) {
    return;
  }

  if (count === 0) {
    resultsCount.textContent = "No resources found";

    return;
  }

  resultsCount.textContent = `Showing ${count} resource${count === 1 ? "" : "s"}`;
}

// ==========================================
// 5. UPDATE AUTH NAVIGATION
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
// 6. LOAD RESOURCES FROM SUPABASE
// ==========================================

async function loadResources() {
  if (!resourceGrid) {
    return;
  }

  // ----------------------------------------
  // LOADING STATE
  // ----------------------------------------

  resourceGrid.hidden = false;

  resourceGrid.innerHTML = `
    <div class="no-resources">
      <div class="no-resources-icon">
        <i class="fa-solid fa-spinner fa-spin"></i>
      </div>

      <h3>
        Loading resources...
      </h3>

      <p>
        Please wait while we load
        community resources.
      </p>
    </div>
  `;

  // ----------------------------------------
  // FETCH FROM SUPABASE
  // ----------------------------------------

  const { data, error } = await supabaseClient
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
    .order("created_at", {
      ascending: false,
    });

    console.log("RESOURCE DATA FROM SUPABASE:", data);
console.log("RESOURCE ERROR FROM SUPABASE:", error);

  // ----------------------------------------
  // HANDLE ERROR
  // ----------------------------------------

  if (error) {
    console.error("Resource loading error:", error);

    resourceGrid.innerHTML = `
      <div class="no-resources">
        <div class="no-resources-icon">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>

        <h3>
          Unable to load resources
        </h3>

        <p>
          Please refresh the page and try again.
        </p>
      </div>
    `;

    updateResultsCount(0);

    return;
  }

  // ----------------------------------------
  // CONVERT DATABASE DATA
  // ----------------------------------------

  resources = (data || []).map((resource) => ({
    id: resource.id,

    ownerId: resource.owner_id,

    title: resource.title || "",

    description: resource.description || "",

    category: resource.category || "others",

    owner: resource.owner_name || "EcoShare Member",

    location: resource.location || "Location not specified",

    available: resource.available === true,

    image: resource.image_url || "",

    createdAt: resource.created_at,
  }));

  // ----------------------------------------
  // INITIAL FILTERED STATE
  // ----------------------------------------

  filteredResources = [...resources];

  // ----------------------------------------
  // DISPLAY
  // ----------------------------------------

  filterResources();
}

// ==========================================
// 7. DISPLAY RESOURCE CARDS
// ==========================================

function displayResources(resourceList) {
  if (!resourceGrid) {
    return;
  }

  resourceGrid.innerHTML = "";

  // ----------------------------------------
  // EMPTY STATE
  // ----------------------------------------

  if (resourceList.length === 0) {
    resourceGrid.hidden = true;

    if (noResources) {
      noResources.hidden = false;
    }

    updateResultsCount(0);

    return;
  }

  resourceGrid.hidden = false;

  if (noResources) {
    noResources.hidden = true;
  }

  // ----------------------------------------
  // CREATE RESOURCE CARDS
  // ----------------------------------------

  resourceList.forEach((resource) => {
    const card = document.createElement("article");

    card.className = "resource-card";

    const availabilityText = resource.available
      ? "Available"
      : "Currently Borrowed";

    const availabilityClass = resource.available ? "available" : "unavailable";

    const imageHTML = resource.image
      ? `
              <img
                src="${resource.image}"
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

    card.innerHTML = `

        <div class="resource-image">

          ${imageHTML}

        </div>


        <div class="resource-content">

          <span class="resource-category">
            ${formatCategory(resource.category)}
          </span>


          <h3>
            ${resource.title}
          </h3>


          <p>
            ${resource.description}
          </p>


          <div class="resource-meta">

            <span>
              <i
                class="fa-solid fa-user"
                aria-hidden="true"
              ></i>

              ${resource.owner}
            </span>


            <span>
              <i
                class="fa-solid fa-location-dot"
                aria-hidden="true"
              ></i>

              ${resource.location}
            </span>

          </div>


          <div class="resource-footer">

            <span
              class="availability ${availabilityClass}"
            >
              ${availabilityText}
            </span>


            <button
              type="button"
              class="view-resource-btn"
              data-resource-id="${resource.id}"
            >
              View Details
            </button>

          </div>

        </div>
      `;

    // --------------------------------------
    // IMAGE FALLBACK
    // --------------------------------------

    const image = card.querySelector("img");

    if (image) {
      image.addEventListener("error", () => {
        const imageContainer = card.querySelector(".resource-image");

        if (!imageContainer) {
          return;
        }

        imageContainer.innerHTML = `
              <i
                class="fa-solid fa-image"
                aria-hidden="true"
              ></i>
            `;
      });
    }

    // --------------------------------------
    // VIEW DETAILS
    // --------------------------------------

    const viewButton = card.querySelector(".view-resource-btn");

    if (viewButton) {
      viewButton.addEventListener("click", () => {
        const resourceId = Number(viewButton.dataset.resourceId);

        viewResource(resourceId);
      });
    }

    resourceGrid.appendChild(card);
  });

  updateResultsCount(resourceList.length);
}

// ==========================================
// 8. FILTER RESOURCES
// ==========================================

function filterResources() {
  const searchText = resourceSearch
    ? resourceSearch.value.toLowerCase().trim()
    : "";

  const selectedCategory = categoryFilter ? categoryFilter.value : "all";

  const selectedAvailability = availabilityFilter
    ? availabilityFilter.value
    : "all";

  filteredResources = resources.filter((resource) => {
    // ----------------------------------
    // SEARCH
    // ----------------------------------

    const searchableText = [
      resource.title,

      resource.description,

      resource.category,

      resource.owner,

      resource.location,
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch = searchableText.includes(searchText);

    // ----------------------------------
    // CATEGORY
    // ----------------------------------

    const matchesCategory =
      selectedCategory === "all" || resource.category === selectedCategory;

    // ----------------------------------
    // AVAILABILITY
    // ----------------------------------

    const matchesAvailability =
      selectedAvailability === "all" ||
      (selectedAvailability === "available" && resource.available === true) ||
      (selectedAvailability === "unavailable" && resource.available === false);

    return matchesSearch && matchesCategory && matchesAvailability;
  });

  sortResources();
}

// ==========================================
// 9. SORT RESOURCES
// ==========================================

function sortResources() {
  const sortValue = sortFilter ? sortFilter.value : "newest";

  const sortedResources = [...filteredResources];

  switch (sortValue) {
    // --------------------------------------
    // NAME A-Z
    // --------------------------------------

    case "name-asc":
      sortedResources.sort((a, b) => a.title.localeCompare(b.title));

      break;

    // --------------------------------------
    // NAME Z-A
    // --------------------------------------

    case "name-desc":
      sortedResources.sort((a, b) => b.title.localeCompare(a.title));

      break;

    // --------------------------------------
    // NEWEST
    // --------------------------------------

    case "newest":

    default:
      sortedResources.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );

      break;
  }

  displayResources(sortedResources);
}

// ==========================================
// 10. VIEW RESOURCE
// ==========================================

function viewResource(resourceId) {
  const resource = resources.find((item) => item.id === resourceId);

  if (!resource) {
    return;
  }

  window.location.href = `resource-details.html?id=${encodeURIComponent(
    resource.id,
  )}`;
}

// ==========================================
// 11. SEARCH BUTTON
// ==========================================

if (searchBtn) {
  searchBtn.addEventListener("click", filterResources);
}

// ==========================================
// 12. LIVE SEARCH
// ==========================================

if (resourceSearch) {
  resourceSearch.addEventListener("input", filterResources);

  resourceSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();

      filterResources();
    }
  });
}

// ==========================================
// 13. CATEGORY FILTER
// ==========================================

if (categoryFilter) {
  categoryFilter.addEventListener("change", filterResources);
}

// ==========================================
// 14. AVAILABILITY FILTER
// ==========================================

if (availabilityFilter) {
  availabilityFilter.addEventListener("change", filterResources);
}

// ==========================================
// 15. SORT FILTER
// ==========================================

if (sortFilter) {
  sortFilter.addEventListener("change", sortResources);
}

// ==========================================
// 16. RESET FILTERS
// ==========================================

if (resetFilters) {
  resetFilters.addEventListener("click", () => {
    if (resourceSearch) {
      resourceSearch.value = "";
    }

    if (categoryFilter) {
      categoryFilter.value = "all";
    }

    if (availabilityFilter) {
      availabilityFilter.value = "all";
    }

    if (sortFilter) {
      sortFilter.value = "newest";
    }

    filteredResources = [...resources];

    sortResources();
  });
}

// ==========================================
// 17. MOBILE NAVIGATION
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

  const navigationLinks = primaryNavigation.querySelectorAll("a");

  navigationLinks.forEach((link) => {
    link.addEventListener("click", () => {
      primaryNavigation.classList.remove("show");

      menuBtn.setAttribute("aria-expanded", "false");

      menuBtn.setAttribute("aria-label", "Open navigation menu");

      const icon = menuBtn.querySelector("i");

      if (icon) {
        icon.classList.remove("fa-xmark");

        icon.classList.add("fa-bars");
      }
    });
  });
}

// ==========================================
// 18. HEADER SCROLL EFFECT
// ==========================================

window.addEventListener("scroll", () => {
  if (!header) {
    return;
  }

  header.classList.toggle("scrolled", window.scrollY > 30);
});

// ==========================================
// 19. AUTH STATE CHANGES
// ==========================================

supabaseClient.auth.onAuthStateChange(() => {
  updateAuthNavigation();
});

// ==========================================
// 20. INITIALIZE
// ==========================================

updateAuthNavigation();

loadResources();
