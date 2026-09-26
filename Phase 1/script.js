// ==========================================
// EcoShare Homepage JavaScript
// ==========================================

// ==========================================
// 1. GET HTML ELEMENTS
// ==========================================

const resourceGrid = document.getElementById("resourceGrid");
const resourceSearch = document.getElementById("resourceSearch");
const searchBtn = document.querySelector(".search-btn");
const categories = document.querySelectorAll(".category");

const menuBtn = document.getElementById("menu-btn");
const primaryNavigation = document.getElementById("primary-navigation");
const header = document.querySelector(".header");
const authNavButton = document.getElementById("authNavButton");
const messagesNavLink = document.getElementById("messagesNavLink");
const notificationsNavLink =
    document.getElementById("notificationsNavLink");
const notificationUnreadBadge =
    document.getElementById(
        "notificationUnreadBadge"
    );

// ==========================================
// 2. RESOURCE DATA
// ==========================================

let resources = [];
let selectedCategory = "all";

// ==========================================
// 3. AUTHENTICATION / NAVBAR
// ==========================================

async function updateAuthNavigation() {
    if (!authNavButton) {
        return;
    }

    const {
        data: { session },
    } = await supabaseClient.auth.getSession();

    // ==========================================
    // LOGGED-IN USER
    // ==========================================

    if (session) {
        authNavButton.innerHTML = `
            <i class="fa-solid fa-user" aria-hidden="true"></i>
            Profile
        `;

        authNavButton.href = "profile.html";

        authNavButton.setAttribute(
            "aria-label",
            "Open profile"
        );

        // Show Messages
        if (messagesNavLink) {
            messagesNavLink.hidden = false;
        }
        // Show Notifications
if (notificationsNavLink) {
    notificationsNavLink.hidden = false;
}
    }

    // ==========================================
    // GUEST USER
    // ==========================================

    else {
        authNavButton.innerHTML = `
            <i
                class="fa-solid fa-right-to-bracket"
                aria-hidden="true"
            ></i>
            Login
        `;

        authNavButton.href = "login.html";

        authNavButton.setAttribute(
            "aria-label",
            "Login"
        );

        // Hide Messages
        if (messagesNavLink) {
            messagesNavLink.hidden = true;
        }

        // Hide Notifications
if (notificationsNavLink) {
    notificationsNavLink.hidden = true;
}
    }
}


async function updateNotificationUnreadBadge() {
    if (!notificationUnreadBadge) {
        return;
    }

    const {
        data: { session },
    } = await supabaseClient.auth.getSession();

    if (!session) {
        notificationUnreadBadge.hidden = true;
        return;
    }

    const {
        count,
        error,
    } = await supabaseClient
        .from("notifications")
        .select("id", {
            count: "exact",
            head: true,
        })
        .eq("user_id", session.user.id)
        .eq("is_read", false);

    if (error) {
        console.error(
            "Error loading unread notification count:",
            error
        );

        notificationUnreadBadge.hidden = true;
        return;
    }

    const unreadCount = count || 0;

    if (unreadCount > 0) {
        notificationUnreadBadge.textContent =
            unreadCount > 99
                ? "99+"
                : String(unreadCount);

        notificationUnreadBadge.hidden = false;
    } else {
        notificationUnreadBadge.hidden = true;
    }
}

// ==========================================
// UPDATE NAVBAR WHEN AUTH STATE CHANGES
// ==========================================

supabaseClient.auth.onAuthStateChange(() => {
    updateAuthNavigation();
    updateNotificationUnreadBadge();
});

// ==========================================
// 4. FORMAT CATEGORY NAME
// ==========================================

function formatCategory(category) {
    if (!category) {
        return "Other";
    }

    return category.charAt(0).toUpperCase() + category.slice(1);
}

// ==========================================
// 5. LOAD RESOURCES FROM SUPABASE
// ==========================================

async function loadResources() {
    if (!resourceGrid) {
        return;
    }

    // --------------------------------------
    // Loading state
    // --------------------------------------

    resourceGrid.innerHTML = `
        <div class="no-resources">

            <i
                class="fa-solid fa-spinner fa-spin"
                aria-hidden="true"
            ></i>

            <h3>
                Loading resources...
            </h3>

            <p>
                Finding the latest resources shared by the community.
            </p>

        </div>
    `;

    // --------------------------------------
    // Fetch available resources
    // --------------------------------------

    const { data, error } = await supabaseClient
        .from("resource_listings")
        .select(`
            id,
            title,
            description,
            category,
            location,
            image_url,
            available,
            owner_name,
            created_at
        `)
        .eq("available", true)
        .order("created_at", {
            ascending: false,
        })
        .limit(6);

    // --------------------------------------
    // Handle error
    // --------------------------------------

    if (error) {
        console.error(
            "Error loading homepage resources:",
            error
        );

        resourceGrid.innerHTML = `
            <div class="no-resources">

                <i
                    class="fa-solid fa-triangle-exclamation"
                    aria-hidden="true"
                ></i>

                <h3>
                    Unable to load resources
                </h3>

                <p>
                    Please refresh the page and try again.
                </p>

            </div>
        `;

        return;
    }

    // --------------------------------------
    // Store resources
    // --------------------------------------

    resources = data || [];

    displayResources(resources);
}

// ==========================================
// 6. DISPLAY RESOURCES
// ==========================================

function displayResources(resourceList) {
    if (!resourceGrid) {
        return;
    }

    // Clear existing resources
    resourceGrid.innerHTML = "";

    // --------------------------------------
    // No resources
    // --------------------------------------

    if (resourceList.length === 0) {
        resourceGrid.innerHTML = `
            <div class="no-resources">

                <i
                    class="fa-solid fa-box-open"
                    aria-hidden="true"
                ></i>

                <h3>
                    No resources available
                </h3>

                <p>
                    No available resources match your search.
                </p>

            </div>
        `;

        return;
    }

    // --------------------------------------
    // Create resource cards
    // --------------------------------------

    resourceList.forEach((resource) => {
        const card = document.createElement("div");

        card.classList.add("resource-card");

        card.innerHTML = `
            <div class="resource-image">

                ${
                    resource.image_url
                        ? `
                            <img
                                src="${resource.image_url}"
                                alt="${resource.title}"
                                loading="lazy"
                            >
                        `
                        : `
                            <i
                                class="fa-solid fa-box-open"
                                aria-hidden="true"
                            ></i>
                        `
                }

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

                <div class="resource-footer">

                    <span>
                        <i
                            class="fa-solid fa-location-dot"
                            aria-hidden="true"
                        ></i>

                        ${resource.location || "Location not specified"}
                    </span>

                    <button
                        class="view-resource-btn"
                        type="button"
                        data-resource-id="${resource.id}"
                    >
                        View
                    </button>

                </div>

            </div>
        `;

        // ==========================================
        // IMAGE ERROR HANDLING
        // ==========================================

        const image = card.querySelector("img");

        if (image) {
            image.addEventListener("error", () => {
                const imageContainer =
                    card.querySelector(".resource-image");

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

        // ==========================================
        // VIEW BUTTON
        // ==========================================

        const viewButton =
            card.querySelector(".view-resource-btn");

        if (viewButton) {
            viewButton.addEventListener("click", () => {
                viewResource(resource.id);
            });
        }

        resourceGrid.appendChild(card);
    });
}

// ==========================================
// 7. FILTER RESOURCES
// ==========================================

function filterResources() {
    const searchText = resourceSearch
        ? resourceSearch.value.toLowerCase().trim()
        : "";

    const filteredResources = resources.filter((resource) => {

        // ==========================================
        // CATEGORY MATCH
        // ==========================================

        const resourceCategory =
            (resource.category || "").toLowerCase();

        const matchesCategory =
            selectedCategory === "all" ||
            resourceCategory === selectedCategory;

        // ==========================================
        // SEARCH MATCH
        // ==========================================

        const matchesSearch =
            (resource.title || "")
                .toLowerCase()
                .includes(searchText) ||

            (resource.description || "")
                .toLowerCase()
                .includes(searchText) ||

            (resource.category || "")
                .toLowerCase()
                .includes(searchText) ||

            (resource.owner_name || "")
                .toLowerCase()
                .includes(searchText) ||

            (resource.location || "")
                .toLowerCase()
                .includes(searchText);

        return matchesCategory && matchesSearch;
    });

    displayResources(filteredResources);
}

// ==========================================
// 8. SEARCH INPUT
// ==========================================

if (resourceSearch) {
    resourceSearch.addEventListener(
        "input",
        filterResources
    );
}

// ==========================================
// 9. SEARCH BUTTON
// ==========================================

if (searchBtn) {
    searchBtn.addEventListener(
        "click",
        filterResources
    );
}

// ==========================================
// 10. CATEGORY FILTER
// ==========================================

categories.forEach((category) => {

    category.addEventListener("click", () => {

        // Remove active from all categories
        categories.forEach((item) => {
            item.classList.remove("active");
        });

        // Add active to selected category
        category.classList.add("active");

        // Update selected category
        selectedCategory =
            category.dataset.category.toLowerCase();

        // Apply filter
        filterResources();
    });
});

// ==========================================
// 11. VIEW RESOURCE
// ==========================================

function viewResource(resourceId) {
    const resource = resources.find(
        (item) => item.id === resourceId
    );

    if (!resource) {
        return;
    }

    window.location.href =
        `../Phase 2/resource-details.html?id=${encodeURIComponent(
            resource.id
        )}`;
}

// ==========================================
// 12. MOBILE NAVIGATION
// ==========================================

if (menuBtn && primaryNavigation) {

    menuBtn.addEventListener("click", () => {

        const isOpen =
            primaryNavigation.classList.toggle("show");

        menuBtn.setAttribute(
            "aria-expanded",
            String(isOpen)
        );

        menuBtn.setAttribute(
            "aria-label",
            isOpen
                ? "Close navigation menu"
                : "Open navigation menu"
        );

        // Change menu icon
        const icon = menuBtn.querySelector("i");

        if (icon) {
            icon.classList.toggle(
                "fa-bars",
                !isOpen
            );

            icon.classList.toggle(
                "fa-xmark",
                isOpen
            );
        }
    });

    // --------------------------------------
    // Close menu when nav link is clicked
    // --------------------------------------

    const navLinks =
        primaryNavigation.querySelectorAll("a");

    navLinks.forEach((link) => {

        link.addEventListener("click", () => {

            primaryNavigation.classList.remove("show");

            menuBtn.setAttribute(
                "aria-expanded",
                "false"
            );

            menuBtn.setAttribute(
                "aria-label",
                "Open navigation menu"
            );

            const icon = menuBtn.querySelector("i");

            if (icon) {
                icon.classList.add("fa-bars");
                icon.classList.remove("fa-xmark");
            }
        });
    });
}

// ==========================================
// 13. SMOOTH SCROLLING
// ==========================================

document
    .querySelectorAll('a[href^="#"]')
    .forEach((link) => {

        link.addEventListener("click", (event) => {

            const targetId =
                link.getAttribute("href");

            // Ignore empty "#"
            if (targetId === "#") {
                return;
            }

            const target =
                document.querySelector(targetId);

            if (target) {

                event.preventDefault();

                target.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                });
            }
        });
    });

// ==========================================
// 14. NAVBAR SCROLL EFFECT
// ==========================================

window.addEventListener("scroll", () => {

    if (!header) {
        return;
    }

    if (window.scrollY > 50) {
        header.classList.add("scrolled");
    } else {
        header.classList.remove("scrolled");
    }
});

// ==========================================
// 15. INITIAL LOAD
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {

    await updateAuthNavigation();

    await updateNotificationUnreadBadge();

    await loadResources();

});