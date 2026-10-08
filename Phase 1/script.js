/*

 * EcoShare — Homepage JavaScript

 * File: script.js

 *

 * Public homepage resource discovery only.

 * Authentication/navigation belongs to page.js.

 * Supabase RLS remains the security boundary.

 */

"use strict";

(function () {
  if (window.ecoShareHomepageInitialized) return;

  window.ecoShareHomepageInitialized = true;

  const RESOURCE_TABLE =
    typeof window.ECOSHARE_RESOURCE_TABLE === "string" &&
    window.ECOSHARE_RESOURCE_TABLE.trim()
      ? window.ECOSHARE_RESOURCE_TABLE.trim()
      : "resource_listings";

  const PROFILE_TABLE = "public_profiles";

  const RESOURCE_LIMIT = 8;

  const RESOURCE_DETAILS_PAGE = "../Phase 2/resource-details.html";

  /*
   * Single source of truth.
   *
   * supabase.js exposes:
   * window.ECOSHARE_SUPABASE_URL
   */

  const SUPABASE_ORIGIN = String(window.ECOSHARE_SUPABASE_URL || "").replace(
    /\/+$/,
    "",
  );

  const RESOURCE_IMAGE_BUCKET = "resource-images";

  const PROFILE_IMAGE_BUCKET = "profile-photos";

  let resources = [];

  let selectedCategory = "all";

  let isLoadingResources = false;

  let isInitialized = false;

  let resourceLoadRequestId = 0;

  let resourceGrid = null;

  let resourceSearch = null;

  let searchBtn = null;

  let categories = [];

  let resourceRealtimeChannel = null;

  let refreshTimer = null;

  /* =========================================================
       SUPABASE CLIENT
       ========================================================= */

  function getSupabaseClient() {
    return window.supabaseClient &&
      typeof window.supabaseClient.from === "function"
      ? window.supabaseClient
      : null;
  }

  /* =========================================================
       DOM INITIALIZATION
       ========================================================= */

  function initializeDOM() {
    resourceGrid = document.getElementById("resourceGrid");

    resourceSearch = document.getElementById("resourceSearch");

    searchBtn = document.querySelector(".search-btn");

    categories = Array.from(document.querySelectorAll(".category"));

    return Boolean(resourceGrid);
  }

  /* =========================================================
       DOM HELPER
       ========================================================= */

  function createElement(tag, className = "", text = null) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (text !== null && text !== undefined) {
      element.textContent = String(text);
    }

    return element;
  }

  /* =========================================================
       TEXT HELPERS
       ========================================================= */

  function normalizeText(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase();
  }

  function normalizeCategory(value) {
    return normalizeText(value)
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatCategory(category = "") {
    const value = String(category).trim();

    if (!value) {
      return "Other";
    }

    return value
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  /* =========================================================
       AVAILABILITY
       ========================================================= */

  function normalizeAvailability(value) {
    if (typeof value === "boolean") {
      return value;
    }

    if (value === 1 || value === "1") {
      return true;
    }

    if (value === 0 || value === "0") {
      return false;
    }

    if (typeof value === "string") {
      const normalized = normalizeText(value);

      if (["true", "yes", "available", "active"].includes(normalized)) {
        return true;
      }

      if (
        [
          "false",
          "no",
          "unavailable",
          "borrowed",
          "lent",
          "reserved",
          "inactive",
        ].includes(normalized)
      ) {
        return false;
      }
    }

    return false;
  }

  /* =========================================================
       DATE FORMATTING
       ========================================================= */

  function formatDate(value) {
    if (!value) {
      return "";
    }

    try {
      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return "";
      }

      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
    } catch {
      return "";
    }
  }

  /* =========================================================
       RESOURCE NORMALIZATION
       ========================================================= */

  function normalizeResource(row) {
    if (!row || typeof row !== "object") {
      return null;
    }

    const id = row.id;

    if (id === null || id === undefined || String(id).trim() === "") {
      return null;
    }

    return {
      id,

      ownerId: row.owner_id ?? null,

      title: String(row.title ?? "").trim() || "Untitled Resource",

      description:
        String(row.description ?? "").trim() || "No description available.",

      category: String(row.category ?? "").trim() || "others",

      image: String(row.image_url ?? "").trim(),

      location: String(row.location ?? "").trim() || "Location not specified",

      owner:
        String(row.owner_name ?? row.owner_full_name ?? "").trim() ||
        "Community member",

      ownerAvatar: String(row.owner_avatar_url ?? "").trim(),

      ownerGender: String(row.owner_gender ?? "").trim(),

      available: normalizeAvailability(row.available),

      createdAt: row.created_at ?? null,
    };
  }

  /* =========================================================
       SUPABASE URL VALIDATION
       ========================================================= */

  function isSameSupabaseOrigin(url) {
    if (!SUPABASE_ORIGIN) {
      return false;
    }

    try {
      return new URL(url).origin === new URL(SUPABASE_ORIGIN).origin;
    } catch {
      return false;
    }
  }

  function isValidStorageImageUrl(value, bucket) {
    if (typeof value !== "string" || !value.trim()) {
      return false;
    }

    try {
      const url = new URL(value.trim());

      if (url.protocol !== "https:" || !isSameSupabaseOrigin(url.href)) {
        return false;
      }

      const prefix = `/storage/v1/object/public/${bucket}/`;

      if (!url.pathname.startsWith(prefix)) {
        return false;
      }

      if (url.search || url.hash) {
        return false;
      }

      const objectPath = url.pathname.slice(prefix.length);

      if (!objectPath) {
        return false;
      }

      if (
        objectPath.includes("..") ||
        objectPath.includes("\\") ||
        objectPath.includes("//")
      ) {
        return false;
      }

      const decodedPath = decodeURIComponent(objectPath);

      return !(
        decodedPath.includes("..") ||
        decodedPath.includes("\\") ||
        decodedPath.includes("//")
      );
    } catch {
      return false;
    }
  }

  function isValidResourceImageUrl(value) {
    return isValidStorageImageUrl(value, RESOURCE_IMAGE_BUCKET);
  }

  function isValidProfileImageUrl(value) {
    return isValidStorageImageUrl(value, PROFILE_IMAGE_BUCKET);
  }

  /* =========================================================
       DEFAULT AVATAR
       ========================================================= */

  function getDefaultAvatar(gender = "") {
    const normalizedGender = normalizeText(gender);

    let fileName = "avatar-default.png";

    if (normalizedGender === "male") {
      fileName = "avatar-male.png";
    } else if (normalizedGender === "female") {
      fileName = "avatar-female.png";
    }

    if (!SUPABASE_ORIGIN) {
      return "";
    }

    return (
      `${SUPABASE_ORIGIN}` +
      `/storage/v1/object/public/` +
      `${PROFILE_IMAGE_BUCKET}/` +
      `${fileName}`
    );
  }

  function getOwnerAvatar(resource) {
    if (resource && isValidProfileImageUrl(resource.ownerAvatar)) {
      return resource.ownerAvatar;
    }

    return getDefaultAvatar(resource?.ownerGender || "");
  }

  function setAvatarImage(image, resource) {
    if (!image) {
      return;
    }

    const defaultAvatar = getDefaultAvatar(resource?.ownerGender || "");

    const avatar = getOwnerAvatar(resource);

    image.onerror = function () {
      image.onerror = null;

      if (defaultAvatar) {
        image.src = defaultAvatar;
      }
    };

    if (avatar) {
      image.src = avatar;
    }
  }

  /* =========================================================
       LOADING STATE
       ========================================================= */

  function displayLoadingState() {
    if (!resourceGrid) {
      return;
    }

    const container = createElement("div", "no-resources");

    const icon = createElement("i", "fa-solid fa-spinner fa-spin");

    icon.setAttribute("aria-hidden", "true");

    container.append(
      icon,

      createElement("h3", "", "Loading resources..."),

      createElement("p", "", "Please wait while we load community resources."),
    );

    resourceGrid.replaceChildren(container);

    resourceGrid.setAttribute("aria-busy", "true");
  }

  /* =========================================================
       EMPTY STATE
       ========================================================= */

  function displayEmptyState() {
    if (!resourceGrid) {
      return;
    }

    const container = createElement("div", "no-resources");

    const icon = createElement("i", "fa-solid fa-box-open");

    icon.setAttribute("aria-hidden", "true");

    container.append(
      icon,

      createElement("h3", "", "No resources found"),

      createElement(
        "p",
        "",
        resources.length === 0
          ? "No approved resources are available to display right now."
          : "Try a different search or category.",
      ),
    );

    resourceGrid.replaceChildren(container);

    resourceGrid.setAttribute("aria-busy", "false");
  }

  /* =========================================================
       ERROR STATE
       ========================================================= */

  function displayResourceError(message) {
    if (!resourceGrid) {
      return;
    }

    const container = createElement("div", "no-resources");

    const icon = createElement("i", "fa-solid fa-triangle-exclamation");

    icon.setAttribute("aria-hidden", "true");

    const retryButton = createElement("button", "search-btn", "Try Again");

    retryButton.type = "button";

    retryButton.addEventListener("click", loadResources);

    container.append(
      icon,

      createElement("h3", "", "Unable to load resources"),

      createElement(
        "p",
        "",
        message || "Something went wrong while loading resources.",
      ),

      retryButton,
    );

    resourceGrid.replaceChildren(container);

    resourceGrid.setAttribute("aria-busy", "false");
  }

  /* =========================================================
       RESOURCE IMAGE
       ========================================================= */

  function createResourceImage(resource) {
    const imageContainer = createElement("div", "resource-card-image");

    if (!isValidResourceImageUrl(resource.image)) {
      imageContainer.classList.add("resource-card-image-placeholder");

      const placeholder = createElement("i", "fa-solid fa-box-open");

      placeholder.setAttribute("aria-hidden", "true");

      imageContainer.appendChild(placeholder);

      return imageContainer;
    }

    const image = document.createElement("img");

    image.src = resource.image;

    image.alt = resource.title || "Resource image";

    image.loading = "lazy";

    image.decoding = "async";

    image.addEventListener(
      "error",
      function () {
        imageContainer.className =
          "resource-card-image resource-card-image-placeholder";

        const placeholder = createElement("i", "fa-solid fa-box-open");

        placeholder.setAttribute("aria-hidden", "true");

        imageContainer.replaceChildren(placeholder);
      },
      {
        once: true,
      },
    );

    imageContainer.appendChild(image);

    return imageContainer;
  }

  /* =========================================================
       AVAILABILITY BADGE
       ========================================================= */

  function createAvailabilityBadge(resource) {
    return createElement(
      "span",
      `resource-availability ${
        resource.available ? "available" : "unavailable"
      }`,
      resource.available ? "Available" : "Unavailable",
    );
  }

  /* =========================================================
       LOCATION
       ========================================================= */

  function createLocationElement(resource) {
    const location = createElement("div", "resource-location");

    const icon = createElement("i", "fa-solid fa-location-dot");

    icon.setAttribute("aria-hidden", "true");

    location.append(
      icon,

      createElement("span", "", resource.location || "Location not specified"),
    );

    return location;
  }

  /* =========================================================
       OWNER
       ========================================================= */

  function createOwnerElement(resource) {
    const owner = createElement("div", "resource-owner");

    const avatar = document.createElement("img");

    avatar.className = "resource-owner-avatar";

    avatar.alt = resource.owner
      ? `${resource.owner} profile photo`
      : "Resource owner";

    avatar.loading = "lazy";

    avatar.decoding = "async";

    setAvatarImage(avatar, resource);

    const ownerInfo = createElement("div", "resource-owner-info");

    ownerInfo.append(
      createElement("span", "resource-owner-label", "Shared by"),

      createElement(
        "span",
        "resource-owner-name",
        resource.owner || "Community member",
      ),
    );

    owner.append(avatar, ownerInfo);

    return owner;
  }

  /* =========================================================
       DATE
       ========================================================= */

  function createDateElement(resource) {
    const dateText = formatDate(resource.createdAt);

    if (!dateText) {
      return null;
    }

    return createElement("span", "resource-date", dateText);
  }

  /* =========================================================
       VIEW BUTTON
       ========================================================= */

  function createViewButton(resource) {
    const button = createElement("button", "resource-view-btn");

    button.type = "button";

    button.dataset.resourceId = String(resource.id ?? "");

    button.setAttribute(
      "aria-label",
      `View details for ${resource.title || "resource"}`,
    );

    const arrow = createElement("i", "fa-solid fa-arrow-right");

    arrow.setAttribute("aria-hidden", "true");

    button.append(
      createElement("span", "", "View Details"),

      arrow,
    );

    button.addEventListener("click", function (event) {
      event.stopPropagation();

      viewResource(resource.id);
    });

    return button;
  }

  /* =========================================================
       RESOURCE CARD
       ========================================================= */

  function createResourceCard(resource) {
    const card = document.createElement("article");

    card.className = "resource-card";

    card.dataset.resourceId = String(resource.id ?? "");

    const content = createElement("div", "resource-card-content");

    const top = createElement("div", "resource-card-top");

    top.append(
      createElement(
        "span",
        "resource-category",
        formatCategory(resource.category),
      ),

      createAvailabilityBadge(resource),
    );

    const footer = createElement("div", "resource-card-footer");

    footer.appendChild(createOwnerElement(resource));

    const date = createDateElement(resource);

    if (date) {
      footer.appendChild(date);
    }

    content.append(
      top,

      createElement(
        "h3",
        "resource-title",
        resource.title || "Untitled Resource",
      ),

      createElement(
        "p",
        "resource-description",
        resource.description || "No description available.",
      ),

      createLocationElement(resource),

      footer,

      createViewButton(resource),
    );

    card.append(
      createResourceImage(resource),

      content,
    );

    card.addEventListener("click", function (event) {
      if (event.target.closest(".resource-view-btn")) {
        return;
      }

      viewResource(resource.id);
    });

    return card;
  }

  /* =========================================================
       DISPLAY RESOURCES
       ========================================================= */

  function displayResources(resourceList = []) {
    if (!resourceGrid) {
      return;
    }

    if (!Array.isArray(resourceList) || resourceList.length === 0) {
      displayEmptyState();
      return;
    }

    const fragment = document.createDocumentFragment();

    resourceList.forEach((resource) => {
      if (!resource) {
        return;
      }

      fragment.appendChild(createResourceCard(resource));
    });

    resourceGrid.replaceChildren(fragment);

    resourceGrid.setAttribute("aria-busy", "false");
  }

  /* =========================================================
       LOAD OWNER PROFILES
       ========================================================= */

  async function loadOwnerProfiles(client, resourceRows) {
    const ownerIds = [
      ...new Set(
        resourceRows
          .map((row) => row?.owner_id)
          .filter(Boolean)
          .map((id) => String(id)),
      ),
    ];

    if (!ownerIds.length) {
      return new Map();
    }

    const { data, error } = await client
      .from(PROFILE_TABLE)
      .select("id, full_name, avatar_url, gender")
      .in("id", ownerIds);

    if (error) {
      console.warn("EcoShare: Unable to load resource owner profiles:", error);

      return new Map();
    }

    const profileMap = new Map();

    if (Array.isArray(data)) {
      data.forEach((profile) => {
        if (!profile?.id) {
          return;
        }

        profileMap.set(String(profile.id), {
          name: String(profile.full_name ?? "").trim() || "Community member",

          avatar: String(profile.avatar_url ?? "").trim(),

          gender: String(profile.gender ?? "").trim(),
        });
      });
    }

    return profileMap;
  }

  /* =========================================================
       RESOURCE REALTIME / PAGE REFRESH
       ========================================================= */

  function scheduleResourceRefresh() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    refreshTimer = setTimeout(() => {
      refreshTimer = null;

      if (!isLoadingResources) {
        loadResources();
      }
    }, 150);
  }

  function subscribeToResourceChanges(client) {
    if (!client || typeof client.channel !== "function") {
      console.warn("EcoShare: Supabase Realtime is unavailable.");

      return;
    }

    if (resourceRealtimeChannel) {
      try {
        client.removeChannel(resourceRealtimeChannel);
      } catch (error) {
        console.warn(
          "EcoShare: Failed to remove previous resource channel:",
          error,
        );
      }

      resourceRealtimeChannel = null;
    }

    resourceRealtimeChannel = client
      .channel("ecoshare-homepage-resources")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: RESOURCE_TABLE,
        },
        function () {
          scheduleResourceRefresh();
        },
      )
      .subscribe(function (status) {
        if (status === "SUBSCRIBED") {
          console.log("EcoShare: Resource realtime subscription active.");
        }

        if (status === "CHANNEL_ERROR") {
          console.warn("EcoShare: Resource realtime subscription failed.");
        }

        if (status === "TIMED_OUT") {
          console.warn("EcoShare: Resource realtime subscription timed out.");
        }
      });
  }

  /*
   * When the user returns to the homepage after adding/editing
   * a resource on another page, fetch the current database state.
   */

  function initializeResourcePageRefresh() {
    window.addEventListener("pageshow", function () {
      scheduleResourceRefresh();
    });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        scheduleResourceRefresh();
      }
    });
  }

  /* =========================================================
       LOAD RESOURCES
       ========================================================= */

  async function loadResources() {
    if (!resourceGrid) {
      console.warn("EcoShare: Homepage resource grid was not found.");

      return;
    }

    if (isLoadingResources) {
      return;
    }

    const client = getSupabaseClient();

    if (!client) {
      console.error("EcoShare: Supabase client is unavailable.");

      displayResourceError(
        "The resource service is not configured. Please try again later.",
      );

      return;
    }

    isLoadingResources = true;

    const requestId = ++resourceLoadRequestId;

    displayLoadingState();

    try {
      const { data, error } = await client
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
                    created_at
                `,
        )
        .eq("available", true)
        .order("created_at", {
          ascending: false,
        })
        .limit(RESOURCE_LIMIT);

      if (requestId !== resourceLoadRequestId) {
        return;
      }

      if (error) {
        throw error;
      }

      if (!Array.isArray(data)) {
        throw new Error("Unexpected response while loading resources.");
      }

      const profileMap = await loadOwnerProfiles(client, data);

      if (requestId !== resourceLoadRequestId) {
        return;
      }

      resources = data
        .map((row) => {
          const resource = normalizeResource(row);

          if (!resource) {
            return null;
          }

          const profile = profileMap.get(String(row.owner_id || ""));

          if (profile) {
            resource.owner = profile.name;

            resource.ownerAvatar = profile.avatar;

            resource.ownerGender = profile.gender;
          }

          return resource;
        })
        .filter(Boolean)
        .filter((resource) => resource.available === true);

      filterResources();
    } catch (error) {
      if (requestId !== resourceLoadRequestId) {
        return;
      }

      console.error("EcoShare: Error loading homepage resources:", error);

      resources = [];

      displayResourceError(
        "We couldn't load resources. Check your connection and try again.",
      );
    } finally {
      if (requestId === resourceLoadRequestId) {
        isLoadingResources = false;
      }
    }
  }

  /* =========================================================
       FILTER RESOURCES
       ========================================================= */

  function filterResources() {
    if (!resourceGrid) {
      return;
    }

    const searchText = normalizeText(resourceSearch?.value);

    const activeCategory = normalizeCategory(selectedCategory);

    const filteredResources = resources.filter((resource) => {
      const resourceCategory = normalizeCategory(resource.category || "others");

      const categoryMatches =
        activeCategory === "all" || resourceCategory === activeCategory;

      const searchableText = [
        resource.title,
        resource.description,
        resource.category,
        resource.owner,
        resource.location,
      ]
        .filter(Boolean)
        .join(" ");

      const searchMatches = normalizeText(searchableText).includes(searchText);

      return categoryMatches && searchMatches;
    });

    displayResources(filteredResources);
  }

  /* =========================================================
       SEARCH INPUT
       ========================================================= */

  function initializeSearch() {
    if (!resourceSearch) {
      return;
    }

    resourceSearch.addEventListener("input", filterResources);

    resourceSearch.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();

        filterResources();
      }

      if (event.key === "Escape") {
        resourceSearch.value = "";

        filterResources();
      }
    });
  }

  /* =========================================================
       SEARCH BUTTON
       ========================================================= */

  function initializeSearchButton() {
    if (!searchBtn) {
      return;
    }

    searchBtn.addEventListener("click", function (event) {
      event.preventDefault();

      filterResources();

      if (resourceSearch) {
        resourceSearch.focus();
      }
    });
  }

  /* =========================================================
       CATEGORY FILTER
       ========================================================= */

  function initializeCategories() {
    categories.forEach((category) => {
      const isActive = category.classList.contains("active");

      category.setAttribute("aria-pressed", String(isActive));

      category.addEventListener("click", function (event) {
        if (category.tagName === "A") {
          event.preventDefault();
        }

        categories.forEach((item) => {
          item.classList.remove("active");

          item.setAttribute("aria-pressed", "false");
        });

        category.classList.add("active");

        category.setAttribute("aria-pressed", "true");

        selectedCategory = normalizeCategory(
          category.dataset.category || "all",
        );

        filterResources();
      });
    });

    const activeCategory = categories.find((category) =>
      category.classList.contains("active"),
    );

    if (activeCategory) {
      selectedCategory = normalizeCategory(
        activeCategory.dataset.category || "all",
      );
    }
  }

  /* =========================================================
       VIEW RESOURCE DETAILS
       ========================================================= */

  function viewResource(resourceId) {
    if (
      resourceId === undefined ||
      resourceId === null ||
      String(resourceId).trim() === ""
    ) {
      console.warn("EcoShare: Invalid resource ID:", resourceId);

      return;
    }

    const resource = resources.find(
      (item) => String(item.id) === String(resourceId),
    );

    if (!resource) {
      console.warn("EcoShare: Resource not found:", resourceId);

      return;
    }

    const detailsUrl = `${RESOURCE_DETAILS_PAGE}?id=${encodeURIComponent(
      String(resource.id),
    )}`;

    window.location.href = detailsUrl;
  }

  /* =========================================================
       PUBLIC API
       ========================================================= */

  window.EcoShareHomepage = {
    reloadResources: loadResources,

    refresh: loadResources,

    filterResources,

    viewResource,

    getResources: () => [...resources],

    getSelectedCategory: () => selectedCategory,

    getResourceTable: () => RESOURCE_TABLE,
  };

  /* =========================================================
       INITIALIZATION
       ========================================================= */

  function initializeHomepage() {
    if (isInitialized) {
      return;
    }

    isInitialized = true;

    if (!initializeDOM()) {
      console.warn("EcoShare: Homepage resource elements were not found.");

      return;
    }

    initializeSearch();

    initializeSearchButton();

    initializeCategories();

    initializeResourcePageRefresh();

    loadResources();

    subscribeToResourceChanges(getSupabaseClient());
  }

  /* =========================================================
       START
       ========================================================= */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeHomepage, {
      once: true,
    });
  } else {
    initializeHomepage();
  }
})();
