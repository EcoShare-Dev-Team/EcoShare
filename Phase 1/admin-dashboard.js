/*
=========================================================
  EcoShare - Admin Dashboard

  File: admin-dashboard.js

  Responsibilities:
  - Admin authentication and authorization
  - Dashboard statistics
  - Resource moderation
  - Resource removal
  - User management
  - User removal
  - Search and filtering
  - Section navigation
  - Refresh controls
  - Admin logout

  Security:
  - Client-side admin check is UX only.
  - Resource moderation is enforced by Supabase RPCs.
  - Resource deletion is enforced by admin_delete_resource().
  - User deletion is enforced by admin_delete_user().
  - Resources are loaded through an admin-only RPC.
  - Users are loaded through an admin-only RPC.
=========================================================
*/

(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", initializeAdminDashboard);

  /* =========================================================
       1. DOM HELPERS
       ========================================================= */

  const $ = (id) => document.getElementById(id);

  /* =========================================================
       2. DOM ELEMENTS
       ========================================================= */

  // Page
  const pageTitle = $("pageTitle");

  // Sections
  const overviewSection = $("overviewSection");
  const resourcesSection = $("resourcesSection");
  const usersSection = $("usersSection");

  // Statistics
  const totalUsers = $("totalUsers");
  const totalResources = $("totalResources");
  const totalAdmins = $("totalAdmins");

  // Admin profile
  const adminName = $("adminName");
  const welcomeAdminName = $("welcomeAdminName");
  const adminSidebarPhoto = $("adminSidebarPhoto");

  // Alerts / messages
  const adminAlert = $("adminAlert");
  const resourcesMessage = $("resourcesMessage");
  const usersMessage = $("usersMessage");

  // Tables
  const resourcesTableBody = $("resourcesTableBody");
  const usersTableBody = $("usersTableBody");

  // Search
  const resourceSearch = $("resourceSearch");
  const userSearch = $("userSearch");

  // Counts
  const resourceCount = $("resourceCount");
  const userCount = $("userCount");

  // Refresh
  const refreshDashboardBtn = $("refreshDashboardBtn");
  const refreshResourcesBtn = $("refreshResourcesBtn");
  const refreshUsersBtn = $("refreshUsersBtn");

  // Logout
  const logoutBtn = $("logoutBtn");
  const profileLogoutBtn = $("profileLogoutBtn");

  /* =========================================================
       3. STATE
       ========================================================= */

  let supabase = null;

  let currentAdmin = null;
  let currentAdminProfile = null;

  let allResources = [];
  let allUsers = [];

  let resourcesLoaded = false;
  let usersLoaded = false;

  let isDashboardLoading = false;
  let isResourcesLoading = false;
  let isUsersLoading = false;
  let isLoggingOut = false;

  let deletingResourceId = null;
  let deletingUserId = null;

  let activeSection = "overview";
  let isAuthenticated = false;
  let isInitialized = false;

  /* =========================================================
       4. CONFIGURATION
       ========================================================= */

  const LOGIN_URL = "../Phase 1/login.html";

  const HOME_URL = "../index.html";

  const SUPABASE_ORIGIN =
    window.ECOSHARE_SUPABASE_URL || "https://cplbvftcbiwgqkeqmrbq.supabase.co";

  const DEFAULT_AVATAR =
    window.ECOSHARE_ASSETS?.avatarDefault ||
    `${SUPABASE_ORIGIN}/storage/v1/object/public/profile-photos/avatar-default.png`;

  const DEFAULT_LOGO =
    window.ECOSHARE_ASSETS?.logo ||
    `${SUPABASE_ORIGIN}/storage/v1/object/public/site-assets/logo.png`;

  const RESOURCE_IMAGE_BUCKET = "resource-images";

  const RESOURCE_IMAGE_PREFIX = `/storage/v1/object/public/${RESOURCE_IMAGE_BUCKET}/`;

  const SECTION_TITLES = {
    overview: "Dashboard Overview",
    resources: "Resource Management",
    users: "User Management",
  };

  /*
   * Keep these values synchronized with the existing
   * admin-dashboard.html table structures.
   */
  const RESOURCE_COLUMNS = 10;
  const USER_COLUMNS = 3;

  /* =========================================================
       5. SUPABASE CLIENT
       ========================================================= */

  function getSupabaseClient() {
    if (window.supabaseClient && window.supabaseClient.auth) {
      return window.supabaseClient;
    }

    return null;
  }

  /* =========================================================
       6. SECURITY / FORMATTING HELPERS
       ========================================================= */

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeId(value) {
    const id = String(value ?? "").trim();

    return id || "";
  }

  function normalizeSearchValue(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase();
  }

  function getErrorMessage(error) {
    return (
      error?.message ||
      error?.details ||
      error?.hint ||
      "An unexpected error occurred."
    );
  }

  function formatDate(value) {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function setText(element, value) {
    if (!element) {
      return;
    }

    element.textContent = value ?? "";
  }

  function safeImageURL(value) {
    if (!value) {
      return "";
    }

    const url = String(value).trim();

    if (!url) {
      return "";
    }

    if (url.startsWith("/") || url.startsWith("./") || url.startsWith("../")) {
      return url;
    }

    try {
      const parsed = new URL(url);

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "";
      }

      return parsed.href;
    } catch {
      return "";
    }
  }

  function setImageSource(image, source) {
    if (!image) {
      return;
    }

    const safeSource = safeImageURL(source);

    image.onerror = () => {
      image.onerror = null;
      image.src = DEFAULT_AVATAR;
    };

    image.src = safeSource || DEFAULT_AVATAR;
  }

  /* =========================================================
       7. ADMIN DISPLAY
       ========================================================= */

  function getDisplayName(user, profile = {}) {
    const metadata = user?.user_metadata || {};

    return (
      profile.full_name ||
      metadata.full_name ||
      metadata.name ||
      metadata.username ||
      user?.email?.split("@")[0] ||
      "Administrator"
    );
  }

  function updateAdminProfile(user, profile = {}) {
    const name = getDisplayName(user, profile);

    const avatar =
      profile.avatar_url ||
      user?.user_metadata?.avatar_url ||
      user?.user_metadata?.picture ||
      DEFAULT_AVATAR;

    setText(adminName, name);

    setText(welcomeAdminName, name);

    setImageSource(adminSidebarPhoto, avatar);
  }

  /* =========================================================
       8. ALERTS
       ========================================================= */

  function showAdminAlert(message, type = "error") {
    if (!adminAlert) {
      console.error(message);
      return;
    }

    adminAlert.textContent = message || "";

    adminAlert.hidden = !message;

    adminAlert.classList.remove("alert-error", "alert-success", "alert-info");

    if (message) {
      adminAlert.classList.add(`alert-${type}`);
    }
  }

  function clearAdminAlert() {
    if (!adminAlert) {
      return;
    }

    adminAlert.textContent = "";
    adminAlert.hidden = true;

    adminAlert.classList.remove("alert-error", "alert-success", "alert-info");
  }

  /* =========================================================
       9. TABLE MESSAGES
       ========================================================= */

  function setResourceTableMessage(message, type = "info") {
    if (!resourcesMessage) {
      return;
    }

    resourcesMessage.textContent = message || "";

    resourcesMessage.classList.remove(
      "message-error",
      "message-success",
      "message-info",
    );

    if (message) {
      resourcesMessage.classList.add(`message-${type}`);
    }
  }

  function setUserTableMessage(message, type = "info") {
    if (!usersMessage) {
      return;
    }

    usersMessage.textContent = message || "";

    usersMessage.classList.remove(
      "message-error",
      "message-success",
      "message-info",
    );

    if (message) {
      usersMessage.classList.add(`message-${type}`);
    }
  }

  /* =========================================================
       10. BUTTON LOADING
       ========================================================= */

  function setButtonLoading(button, loading, loadingText = "Loading...") {
    if (!button) {
      return;
    }

    if (loading) {
      if (!button.dataset.originalHTML) {
        button.dataset.originalHTML = button.innerHTML;
      }

      button.disabled = true;

      button.setAttribute("aria-busy", "true");

      button.innerHTML = `
                <i
                    class="fa-solid fa-spinner fa-spin"
                    aria-hidden="true"
                ></i>
                <span>${escapeHTML(loadingText)}</span>
            `;
    } else {
      button.disabled = false;

      button.removeAttribute("aria-busy");

      if (button.dataset.originalHTML) {
        button.innerHTML = button.dataset.originalHTML;

        delete button.dataset.originalHTML;
      }
    }
  }

  /* =========================================================
       11. RESOURCE HELPERS
       ========================================================= */

  function isResourceAvailable(resource) {
    const value = resource?.available;

    if (typeof value === "boolean") {
      return value;
    }

    return Boolean(value);
  }

  function getResourceStatus(resource) {
    const status = String(resource?.moderation_status || resource?.status || "")
      .trim()
      .toLowerCase();

    if (status) {
      return status;
    }

    return isResourceAvailable(resource) ? "approved" : "pending";
  }

  function formatPrice(value) {
    if (value === null || value === undefined || value === "") {
      return "—";
    }

    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
      return "—";
    }

    return `₹${number.toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  }

  function getResourceImage(resource) {
    const imageURL = safeImageURL(resource?.image_url);

    return imageURL || DEFAULT_LOGO;
  }

  function getResourceOwner(resource) {
    return (
      resource?.owner_name ||
      resource?.owner_full_name ||
      resource?.full_name ||
      resource?.owner_id ||
      "Unknown"
    );
  }

  function getResourceDetailsText(resource) {
    const title = resource?.title || "Untitled Resource";

    return title;
  }

  /* =========================================================
       12. AUTHENTICATION
       ========================================================= */

  async function getAuthenticatedUser() {
    if (!supabase?.auth) {
      throw new Error("Supabase client is not available.");
    }

    const { data, error } = await supabase.auth.getUser();

    if (error) {
      throw error;
    }

    return data?.user || null;
  }

  async function getCurrentAdminProfile(userId) {
    if (!userId) {
      return null;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, avatar_url")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;
  }

  async function verifyAdminAccess() {
    const user = await getAuthenticatedUser();

    if (!user) {
      isAuthenticated = false;
      return false;
    }

    const profile = await getCurrentAdminProfile(user.id);

    if (!profile || String(profile.role).trim().toLowerCase() !== "admin") {
      isAuthenticated = false;
      return false;
    }

    currentAdmin = user;
    currentAdminProfile = profile;

    isAuthenticated = true;

    updateAdminProfile(user, profile);

    return true;
  }

  /* =========================================================
       13. SECTION NAVIGATION
       ========================================================= */

  function showSection(sectionName) {
    const requestedSection = SECTION_TITLES[sectionName]
      ? sectionName
      : "overview";

    activeSection = requestedSection;

    const sections = {
      overview: overviewSection,
      resources: resourcesSection,
      users: usersSection,
    };

    Object.entries(sections).forEach(([name, element]) => {
      if (!element) {
        return;
      }

      const visible = name === requestedSection;

      element.hidden = !visible;

      element.classList.toggle("active", visible);
    });

    setText(pageTitle, SECTION_TITLES[requestedSection]);

    document.querySelectorAll(".admin-nav-item").forEach((item) => {
      const isActive = item.dataset.section === requestedSection;

      item.classList.toggle("active", isActive);

      if (isActive) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });

    if (requestedSection === "resources" && !resourcesLoaded) {
      loadResources();
    }

    if (requestedSection === "users" && !usersLoaded) {
      loadUsers();
    }
  }

  /* =========================================================
       14. DASHBOARD STATISTICS
       ========================================================= */

  async function loadDashboardStats() {
    if (isDashboardLoading || !supabase) {
      return;
    }

    isDashboardLoading = true;

    setButtonLoading(refreshDashboardBtn, true, "Refreshing...");

    try {
      const { data, error } = await supabase.rpc("get_admin_dashboard_stats");

      if (error) {
        throw error;
      }

      const stats = Array.isArray(data) ? data[0] : data;

      setText(totalUsers, Number(stats?.total_users ?? 0).toLocaleString());

      setText(
        totalResources,
        Number(stats?.total_resources ?? 0).toLocaleString(),
      );

      setText(totalAdmins, Number(stats?.total_admins ?? 0).toLocaleString());
    } catch (error) {
      console.error("Failed to load dashboard statistics:", error);

      setText(totalUsers, "—");

      setText(totalResources, "—");

      setText(totalAdmins, "—");

      showAdminAlert(
        `Unable to load dashboard statistics: ${getErrorMessage(error)}`,
        "error",
      );
    } finally {
      isDashboardLoading = false;

      setButtonLoading(refreshDashboardBtn, false);
    }
  }

  /* =========================================================
       15. RESOURCE LOADING
       ========================================================= */

  async function loadResources() {
    if (isResourcesLoading || !supabase) {
      return;
    }

    isResourcesLoading = true;

    showResourceLoadingState();

    setResourceTableMessage("");

    setButtonLoading(refreshResourcesBtn, true, "Refreshing...");

    try {
      const { data, error } = await supabase.rpc(
        "get_resources_for_moderation",
      );

      if (error) {
        throw error;
      }

      allResources = Array.isArray(data) ? data : [];

      resourcesLoaded = true;

      renderResources(allResources);
    } catch (error) {
      console.error("Failed to load resources:", error);

      allResources = [];
      resourcesLoaded = false;

      showResourceEmptyState("Unable to load resources.");

      setResourceTableMessage(getErrorMessage(error), "error");
    } finally {
      isResourcesLoading = false;

      setButtonLoading(refreshResourcesBtn, false);
    }
  }

  /* =========================================================
       16. RESOURCE SEARCH
       ========================================================= */

  function filterResources(resources, query) {
    const normalized = normalizeSearchValue(query);

    if (!normalized) {
      return resources;
    }

    return resources.filter((resource) => {
      const searchable = [
        resource?.id,
        resource?.title,
        resource?.category,
        resource?.location,
        resource?.owner_id,
        resource?.owner_name,
        resource?.owner_full_name,
        resource?.moderation_status,
        resource?.status,
        resource?.available ? "available" : "unavailable",
      ]
        .map(normalizeSearchValue)
        .join(" ");

      return searchable.includes(normalized);
    });
  }

  /* =========================================================
       17. RESOURCE RENDERING
       ========================================================= */

  function renderResources(resources) {
    if (!resourcesTableBody) {
      return;
    }

    const filtered = filterResources(resources, resourceSearch?.value);

    setText(
      resourceCount,
      `${filtered.length} ${filtered.length === 1 ? "resource" : "resources"}`,
    );

    if (!filtered.length) {
      showResourceEmptyState(
        resources.length
          ? "No resources match your search."
          : "No resources were found.",
      );

      return;
    }

    resourcesTableBody.innerHTML = filtered.map(renderResourceRow).join("");
  }

  function renderResourceRow(resource) {
    const id = normalizeId(resource?.id);

    const title = resource?.title || "Untitled Resource";

    const owner = getResourceOwner(resource);

    const category = resource?.category || "—";

    const location = resource?.location || "—";

    const status = getResourceStatus(resource);

    const available = isResourceAvailable(resource);

    const image = getResourceImage(resource);

    const createdAt = formatDate(resource?.created_at);

    const hourlyPrice = formatPrice(resource?.price_per_hour);

    const dailyPrice = formatPrice(resource?.price_per_day);

    const buyPrice = formatPrice(resource?.buy_price);

    const availabilityText = available ? "Available" : "Unavailable";

    let moderationButtons = "";

    if (status === "pending") {
      moderationButtons = `
                <button
                    type="button"
                    class="moderation-action-btn"
                    data-resource-id="${escapeHTML(id)}"
                    data-moderation-status="approved"
                >
                    <i
                        class="fa-solid fa-check"
                        aria-hidden="true"
                    ></i>
                    <span>Approve</span>
                </button>

                <button
                    type="button"
                    class="moderation-action-btn"
                    data-resource-id="${escapeHTML(id)}"
                    data-moderation-status="rejected"
                >
                    <i
                        class="fa-solid fa-xmark"
                        aria-hidden="true"
                    ></i>
                    <span>Reject</span>
                </button>
            `;
    }

    /*
     * Existing admin-dashboard.html uses the following
     * 10-column order:
     *
     * 1. Resource ID
     * 2. Details
     * 3. Category
     * 4. Location
     * 5. Owner
     * 6. Availability
     * 7. Moderation
     * 8. Image
     * 9. Date Added
     * 10. Actions
     */

    return `
            <tr
                data-resource-id="${escapeHTML(id)}"
            >
                <!-- Resource ID -->
                <td>
                    <span
                        class="resource-id"
                        title="${escapeHTML(id)}"
                    >
                        ${escapeHTML(id)}
                    </span>
                </td>

                <!-- Details -->
                <td>
                    <div class="resource-details">
                        <strong>
                            ${escapeHTML(title)}
                        </strong>

                        <div class="resource-price-details">
                            <span>
                                Hour: ${escapeHTML(hourlyPrice)}
                            </span>

                            <span>
                                Day: ${escapeHTML(dailyPrice)}
                            </span>

                            <span>
                                Buy: ${escapeHTML(buyPrice)}
                            </span>
                        </div>
                    </div>
                </td>

                <!-- Category -->
                <td>
                    ${escapeHTML(category)}
                </td>

                <!-- Location -->
                <td>
                    ${escapeHTML(location)}
                </td>

                <!-- Owner -->
                <td>
                    ${escapeHTML(owner)}
                </td>

                <!-- Availability -->
                <td>
                    <span
                        class="resource-availability-badge ${
                          available ? "available" : "unavailable"
                        }"
                    >
                        ${escapeHTML(availabilityText)}
                    </span>
                </td>

                <!-- Moderation -->
                <td>
                    <span
                        class="resource-status-badge ${escapeHTML(status)}"
                    >
                        ${escapeHTML(status)}
                    </span>
                </td>

                <!-- Image -->
                <td>
                    <div class="resource-table-image">
                        <img
                            src="${escapeHTML(image)}"
                            alt=""
                            loading="lazy"
                            decoding="async"
                            onerror="this.onerror=null;this.src='${escapeHTML(
                              DEFAULT_LOGO,
                            )}'"
                        >
                    </div>
                </td>

                <!-- Date Added -->
                <td>
                    ${escapeHTML(createdAt)}
                </td>

                <!-- Actions -->
                <td>
                    <div
                        class="moderation-actions"
                    >
                        ${moderationButtons}

                        <button
                            type="button"
                            class="moderation-action-btn danger"
                            data-resource-id="${escapeHTML(id)}"
                            data-moderation-status="delete"
                        >
                            <i
                                class="fa-solid fa-trash"
                                aria-hidden="true"
                            ></i>
                            <span>Remove</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
  }

  /* =========================================================
       18. RESOURCE TABLE STATES
       ========================================================= */

  function showResourceLoadingState() {
    if (!resourcesTableBody) {
      return;
    }

    resourcesTableBody.innerHTML = `
            <tr>
                <td
                    colspan="${RESOURCE_COLUMNS}"
                >
                    <div class="table-loading">
                        <i
                            class="fa-solid fa-spinner fa-spin"
                            aria-hidden="true"
                        ></i>

                        <span>
                            Loading resources...
                        </span>
                    </div>
                </td>
            </tr>
        `;
  }

  function showResourceEmptyState(message = "No resources found.") {
    if (!resourcesTableBody) {
      return;
    }

    resourcesTableBody.innerHTML = `
            <tr>
                <td
                    colspan="${RESOURCE_COLUMNS}"
                >
                    <div class="table-empty">
                        <i
                            class="fa-solid fa-box-open"
                            aria-hidden="true"
                        ></i>

                        <span>
                            ${escapeHTML(message)}
                        </span>
                    </div>
                </td>
            </tr>
        `;
  }

  /* =========================================================
       19. RESOURCE MODERATION
       ========================================================= */

  async function moderateResource(resourceId, status, button) {
    const normalizedId = normalizeId(resourceId);

    if (!normalizedId || !supabase || deletingResourceId) {
      return;
    }

    const resource = allResources.find(
      (item) => normalizeId(item?.id) === normalizedId,
    );

    if (!resource) {
      showAdminAlert("Resource could not be found.", "error");

      return;
    }

    if (status === "delete") {
      await deleteResource(normalizedId, resource, button);

      return;
    }

    if (status !== "approved" && status !== "rejected") {
      return;
    }

    const actionLabel = status === "approved" ? "approve" : "reject";

    const confirmed = window.confirm(
      `Are you sure you want to ${actionLabel} "${resource.title || "this resource"}"?`,
    );

    if (!confirmed) {
      return;
    }

    const row = button?.closest("tr");

    const actionButtons = row?.querySelectorAll(".moderation-action-btn");

    actionButtons?.forEach((item) => {
      item.disabled = true;
    });

    setButtonLoading(
      button,
      true,
      status === "approved" ? "Approving..." : "Rejecting...",
    );

    try {
      const { error } = await supabase.rpc("moderate_resource", {
        p_resource_id: normalizedId,

        p_status: status,
      });

      if (error) {
        throw error;
      }

      resource.moderation_status = status;

      /*
       * Keep local availability consistent
       * with the moderation result.
       */
      if (status === "approved") {
        resource.available = true;
      }

      if (status === "rejected") {
        resource.available = false;
      }

      renderResources(allResources);

      showAdminAlert(
        `Resource "${resource.title || "Resource"}" has been ${actionLabel}d successfully.`,
        "success",
      );

      await loadDashboardStats();
    } catch (error) {
      console.error("Resource moderation failed:", error);

      showAdminAlert(
        `Unable to ${actionLabel} resource: ${getErrorMessage(error)}`,
        "error",
      );

      actionButtons?.forEach((item) => {
        item.disabled = false;
      });
    } finally {
      if (button?.isConnected) {
        setButtonLoading(button, false);
      }
    }
  }

  /* =========================================================
       20. RESOURCE DELETION
       ========================================================= */

  async function deleteResource(resourceId, resource, button) {
    if (deletingResourceId || !supabase) {
      return;
    }

    const normalizedId = normalizeId(resourceId);

    if (!normalizedId) {
      return;
    }

    const title = resource?.title || "this resource";

    /*
     * The backend is history-aware.
     *
     * A resource with historical records may be
     * deactivated instead of permanently deleted.
     */
    const confirmed = window.confirm(
      `Remove "${title}"?\n\nIf this resource has historical records, EcoShare will deactivate it instead of permanently deleting its history.`,
    );

    if (!confirmed) {
      return;
    }

    deletingResourceId = normalizedId;

    const row = button?.closest("tr");

    const actionButtons = row?.querySelectorAll(".moderation-action-btn");

    actionButtons?.forEach((item) => {
      item.disabled = true;
    });

    setButtonLoading(button, true, "Removing...");

    try {
      const { data, error } = await supabase.rpc("admin_delete_resource", {
        p_resource_id: normalizedId,
      });

      if (error) {
        throw error;
      }

      /*
       * Current admin_delete_resource() returns
       * an object such as:
       *
       * {
       *     action: "deleted",
       *     resource_id: "...",
       *     image_url: "..."
       * }
       *
       * or:
       *
       * {
       *     action: "deactivated",
       *     resource_id: "...",
       *     image_url: "..."
       * }
       */
      const result = Array.isArray(data) ? data[0] : data;

      const action = String(result?.action || "")
        .trim()
        .toLowerCase();

      if (action !== "deleted" && action !== "deactivated") {
        throw new Error("The resource removal response was invalid.");
      }

      /*
       * CASE 1:
       * Resource was permanently deleted.
       */
      if (action === "deleted") {
        const imageURL = result?.image_url || resource?.image_url || "";

        /*
         * Database deletion is authoritative.
         * Storage cleanup is best effort.
         */
        await deleteResourceStorageObject(imageURL);

        allResources = allResources.filter(
          (item) => normalizeId(item?.id) !== normalizedId,
        );

        renderResources(allResources);

        await loadDashboardStats();

        showAdminAlert(
          `Resource "${title}" was removed successfully.`,
          "success",
        );

        return;
      }

      /*
       * CASE 2:
       * Historical records exist.
       *
       * The backend preserved the resource
       * and deactivated it.
       */
      resource.available = false;

      if (Object.prototype.hasOwnProperty.call(resource, "moderation_status")) {
        resource.moderation_status = "deactivated";
      }

      if (Object.prototype.hasOwnProperty.call(resource, "status")) {
        resource.status = "deactivated";
      }

      renderResources(allResources);

      await loadDashboardStats();

      showAdminAlert(
        `Resource "${title}" was deactivated because its historical records must be preserved.`,
        "success",
      );
    } catch (error) {
      console.error("Resource removal failed:", error);

      showAdminAlert(
        `Unable to remove resource: ${getErrorMessage(error)}`,
        "error",
      );

      actionButtons?.forEach((item) => {
        item.disabled = false;
      });
    } finally {
      deletingResourceId = null;

      if (button?.isConnected) {
        setButtonLoading(button, false);
      }
    }
  }

  /* =========================================================
       21. RESOURCE STORAGE CLEANUP
       ========================================================= */

  async function deleteResourceStorageObject(imageURL) {
    if (!imageURL || !supabase) {
      return;
    }

    try {
      const url = new URL(String(imageURL));

      /*
       * Only touch objects belonging to
       * this EcoShare Supabase project.
       */
      if (url.origin !== SUPABASE_ORIGIN) {
        return;
      }

      const prefix = RESOURCE_IMAGE_PREFIX;

      const prefixIndex = url.pathname.indexOf(prefix);

      if (prefixIndex === -1) {
        return;
      }

      const encodedPath = url.pathname.slice(prefixIndex + prefix.length);

      const path = decodeURIComponent(encodedPath);

      /*
       * Prevent suspicious path traversal.
       */
      if (!path || path.includes("..")) {
        return;
      }

      const { error } = await supabase.storage
        .from(RESOURCE_IMAGE_BUCKET)
        .remove([path]);

      if (error) {
        console.warn("EcoShare: Resource image cleanup failed.", error);
      }
    } catch (error) {
      console.warn("EcoShare: Resource image cleanup failed.", error);
    }
  }

  /* =========================================================
       22. USER LOADING
       ========================================================= */

  async function loadUsers() {
    if (isUsersLoading || !supabase) {
      return;
    }

    isUsersLoading = true;

    showUserLoadingState();

    setUserTableMessage("");

    setButtonLoading(refreshUsersBtn, true, "Refreshing...");

    try {
      const { data, error } = await supabase.rpc("get_users_for_admin");

      if (error) {
        throw error;
      }

      allUsers = Array.isArray(data) ? data : [];

      usersLoaded = true;

      renderUsers(allUsers);
    } catch (error) {
      console.error("Failed to load users:", error);

      allUsers = [];
      usersLoaded = false;

      showUserEmptyState("Unable to load users.");

      setUserTableMessage(getErrorMessage(error), "error");
    } finally {
      isUsersLoading = false;

      setButtonLoading(refreshUsersBtn, false);
    }
  }

  /* =========================================================
       23. USER SEARCH
       ========================================================= */

  function filterUsers(users, query) {
    const normalized = normalizeSearchValue(query);

    if (!normalized) {
      return users;
    }

    return users.filter((user) => {
      const searchable = [user?.id, user?.full_name, user?.email, user?.role]
        .map(normalizeSearchValue)
        .join(" ");

      return searchable.includes(normalized);
    });
  }

  /* =========================================================
       24. USER RENDERING
       ========================================================= */

  function renderUsers(users) {
    if (!usersTableBody) {
      return;
    }

    const filtered = filterUsers(users, userSearch?.value);

    setText(
      userCount,
      `${filtered.length} ${filtered.length === 1 ? "user" : "users"}`,
    );

    if (!filtered.length) {
      showUserEmptyState(
        users.length
          ? "No users match your search."
          : "No registered users were found.",
      );

      return;
    }

    usersTableBody.innerHTML = filtered.map(renderUserRow).join("");
  }

  function renderUserRow(user) {
    const id = normalizeId(user?.id);

    const role = String(user?.role || "user").trim();

    const name = user?.full_name || "EcoShare User";

    const email = String(user?.email || "").trim();

    const isAdmin = role.toLowerCase() === "admin";

    return `
        <tr
            data-user-id="${escapeHTML(id)}"
        >
            <td>
                <div class="user-identity">
                    <span
                        class="user-id"
                        title="${escapeHTML(id)}"
                    >
                        ${escapeHTML(id)}
                    </span>

                    ${
                      email
                        ? `
                                <span
                                    class="user-email"
                                    title="${escapeHTML(email)}"
                                >
                                    ${escapeHTML(email)}
                                </span>
                            `
                        : `
                                <span
                                    class="user-email user-email-missing"
                                >
                                    Email unavailable
                                </span>
                            `
                    }
                </div>
            </td>

            <td>
                <span
                    class="user-role-badge ${escapeHTML(role.toLowerCase())}"
                >
                    ${escapeHTML(role)}
                </span>
            </td>

            <td>
                ${
                  isAdmin
                    ? `
                            <span
                                class="user-protected-label"
                            >
                                <i
                                    class="fa-solid fa-shield-halved"
                                    aria-hidden="true"
                                ></i>

                                Protected
                            </span>
                        `
                    : `
                            <button
                                type="button"
                                class="user-delete-btn"
                                data-user-id="${escapeHTML(id)}"
                                data-user-name="${escapeHTML(name)}"
                                aria-label="Remove ${escapeHTML(name)}"
                            >
                                <i
                                    class="fa-solid fa-trash"
                                    aria-hidden="true"
                                ></i>

                                <span>Remove</span>
                            </button>
                        `
                }
            </td>
        </tr>
    `;
  }

  /* =========================================================
       25. USER TABLE STATES
       ========================================================= */

  function showUserLoadingState() {
    if (!usersTableBody) {
      return;
    }

    usersTableBody.innerHTML = `
            <tr>
                <td
                    colspan="${USER_COLUMNS}"
                >
                    <div class="table-loading">
                        <i
                            class="fa-solid fa-spinner fa-spin"
                            aria-hidden="true"
                        ></i>

                        <span>
                            Loading users...
                        </span>
                    </div>
                </td>
            </tr>
        `;
  }

  function showUserEmptyState(message = "No registered users were found.") {
    if (!usersTableBody) {
      return;
    }

    usersTableBody.innerHTML = `
            <tr>
                <td
                    colspan="${USER_COLUMNS}"
                >
                    <div class="table-empty">
                        <i
                            class="fa-solid fa-users"
                            aria-hidden="true"
                        ></i>

                        <span>
                            ${escapeHTML(message)}
                        </span>
                    </div>
                </td>
            </tr>
        `;
  }

  /* =========================================================
       26. USER DELETION
       ========================================================= */

  async function deleteUser(userId, userName, button) {
    const targetId = normalizeId(userId);

    if (!targetId || !supabase || deletingUserId) {
      return;
    }

    /*
     * Never allow the current administrator
     * to delete their own account.
     */
    if (currentAdmin?.id && targetId === normalizeId(currentAdmin.id)) {
      showAdminAlert(
        "You cannot remove your own administrator account.",
        "error",
      );

      return;
    }

    const targetUser = allUsers.find(
      (user) => normalizeId(user?.id) === targetId,
    );

    const targetRole = String(targetUser?.role || "user")
      .trim()
      .toLowerCase();

    /*
     * Never expose admin deletion
     * through the normal user-management UI.
     */
    if (targetRole === "admin") {
      showAdminAlert(
        "Administrator accounts cannot be removed from User Management.",
        "error",
      );

      return;
    }

    const displayName = userName || targetUser?.full_name || "this user";

    const confirmed = window.confirm(
      `Remove ${displayName} permanently?\n\nThis action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    deletingUserId = targetId;

    const row = button?.closest("tr");

    const actionButtons = row?.querySelectorAll("button");

    actionButtons?.forEach((item) => {
      item.disabled = true;
    });

    setButtonLoading(button, true, "Removing...");

    try {
      const { error } = await supabase.rpc("admin_delete_user", {
        p_user_id: targetId,
      });

      if (error) {
        throw error;
      }

      allUsers = allUsers.filter((user) => normalizeId(user?.id) !== targetId);

      renderUsers(allUsers);

      await loadDashboardStats();

      showAdminAlert(`${displayName} was removed successfully.`, "success");
    } catch (error) {
      console.error("User removal failed:", error);

      showAdminAlert(
        `Unable to remove user: ${getErrorMessage(error)}`,
        "error",
      );

      actionButtons?.forEach((item) => {
        item.disabled = false;
      });
    } finally {
      deletingUserId = null;

      if (button?.isConnected) {
        setButtonLoading(button, false);
      }
    }
  }

  /* =========================================================
       27. EVENT HANDLERS
       ========================================================= */

  function setupNavigationEvents() {
    document
      .querySelectorAll(".admin-nav-item[data-section]")
      .forEach((item) => {
        item.addEventListener("click", (event) => {
          event.preventDefault();

          const section = item.dataset.section;

          if (section) {
            showSection(section);
          }
        });
      });

    document
      .querySelectorAll(".quick-action-card[data-section]")
      .forEach((card) => {
        card.addEventListener("click", () => {
          const section = card.dataset.section;

          if (section) {
            showSection(section);
          }
        });
      });
  }

  function setupSearchEvents() {
    if (resourceSearch) {
      resourceSearch.addEventListener("input", () => {
        renderResources(allResources);
      });
    }

    if (userSearch) {
      userSearch.addEventListener("input", () => {
        renderUsers(allUsers);
      });
    }
  }

  function setupRefreshEvents() {
    refreshDashboardBtn?.addEventListener("click", async () => {
      clearAdminAlert();

      await loadDashboardStats();
    });

    refreshResourcesBtn?.addEventListener("click", async () => {
      clearAdminAlert();

      resourcesLoaded = false;

      await loadResources();
    });

    refreshUsersBtn?.addEventListener("click", async () => {
      clearAdminAlert();

      usersLoaded = false;

      await loadUsers();
    });
  }

  function setupModerationEvents() {
    resourcesTableBody?.addEventListener("click", async (event) => {
      const target = event.target;

      const button = target?.closest(".moderation-action-btn");

      if (!button || !resourcesTableBody.contains(button)) {
        return;
      }

      event.preventDefault();

      if (button.disabled) {
        return;
      }

      const resourceId = button.dataset.resourceId;

      const status = button.dataset.moderationStatus;

      await moderateResource(resourceId, status, button);
    });
  }

  function setupUserManagementEvents() {
    usersTableBody?.addEventListener("click", async (event) => {
      const target = event.target;

      const button = target?.closest(".user-delete-btn");

      if (!button || !usersTableBody.contains(button)) {
        return;
      }

      event.preventDefault();

      if (button.disabled) {
        return;
      }

      await deleteUser(button.dataset.userId, button.dataset.userName, button);
    });
  }

  function setupLogoutEvents() {
    logoutBtn?.addEventListener("click", async (event) => {
      event.preventDefault();

      await logout();
    });

    profileLogoutBtn?.addEventListener("click", async (event) => {
      event.preventDefault();

      await logout();
    });
  }

  /* =========================================================
       28. LOGOUT
       ========================================================= */

  async function logout() {
    if (isLoggingOut || !supabase?.auth) {
      return;
    }

    isLoggingOut = true;

    setButtonLoading(logoutBtn, true, "Logging out...");

    setButtonLoading(profileLogoutBtn, true, "Logging out...");

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      window.location.href = LOGIN_URL;
    } catch (error) {
      console.error("Logout failed:", error);

      showAdminAlert(`Unable to log out: ${getErrorMessage(error)}`, "error");

      setButtonLoading(logoutBtn, false);

      setButtonLoading(profileLogoutBtn, false);

      isLoggingOut = false;
    }
  }

  /* =========================================================
       29. AUTH STATE LISTENER
       ========================================================= */

  function setupAuthListener() {
    if (!supabase?.auth) {
      return;
    }

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        if (!isLoggingOut) {
          window.location.href = LOGIN_URL;
        }
      }
    });
  }

  /* =========================================================
       30. INITIALIZATION
       ========================================================= */

  async function initializeAdminDashboard() {
    if (isInitialized) {
      return;
    }

    isInitialized = true;

    clearAdminAlert();

    supabase = getSupabaseClient();

    if (!supabase) {
      showAdminAlert(
        "Supabase is not available. Please reload the page.",
        "error",
      );

      return;
    }

    try {
      const hasAccess = await verifyAdminAccess();

      if (!hasAccess) {
        window.location.href = LOGIN_URL;

        return;
      }

      setupNavigationEvents();

      setupSearchEvents();

      setupRefreshEvents();

      setupModerationEvents();

      setupUserManagementEvents();

      setupLogoutEvents();

      setupAuthListener();

      showSection(activeSection);

      await loadDashboardStats();
    } catch (error) {
      console.error("Admin dashboard initialization failed:", error);

      isAuthenticated = false;

      showAdminAlert(getErrorMessage(error), "error");

      setTimeout(() => {
        window.location.href = LOGIN_URL;
      }, 1500);
    }
  }

  /* =========================================================
       31. PUBLIC API
       ========================================================= */

  window.EcoShareAdminDashboard = {
    refreshDashboard: loadDashboardStats,

    refreshResources: async () => {
      resourcesLoaded = false;

      await loadResources();
    },

    refreshUsers: async () => {
      usersLoaded = false;

      await loadUsers();
    },

    showSection,

    logout,
  };
})();
