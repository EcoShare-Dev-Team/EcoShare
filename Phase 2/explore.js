"use strict";

/*
=========================================================
  ECOSHARE — EXPLORE RESOURCES

  File: explore.js

  Responsibilities:
  - Load approved resources
  - Load public owner information
  - Search resources
  - Filter by category
  - Filter by availability
  - Filter by distance
  - Calculate distance from user
  - Show resource images
  - Show owner avatars
  - Show hourly/daily pricing
  - Sort resources
  - Reset filters
  - Render resource cards
  - Navigate to resource details

  SECURITY:
  - Uses only the Supabase publishable client
  - No service-role / secret key
  - RLS remains the authorization boundary

  LOCATION:
  - Saved profile coordinates are preferred
  - Browser GPS is requested only when needed
  - Distance is calculated locally
  - Distance is never stored in the database

  STORAGE:
  - Resource images must belong to the current
    EcoShare Supabase project's resource-images bucket

  AVATAR:
  - Owner data comes from public_profiles
  - Avatar resolution is handled by page.js
=========================================================
*/

(() => {
  /* =========================================================
       1. CONFIGURATION
       ========================================================= */

  const RESOURCE_TABLE = "resource_listings";
  const PROFILE_TABLE = "public_profiles";
  const PRIVATE_PROFILE_TABLE = "profiles";

  const RESOURCE_DETAILS_PAGE = "resource-details.html";

  const RESOURCE_LIMIT = 100;
  const MAX_DISTANCE_KM = 30;

  const RESOURCE_STORAGE_BUCKET = "resource-images";
  const DEFAULT_CURRENCY = "₹";

  /* =========================================================
       2. STATE
       ========================================================= */

  let resources = [];
  let filteredResources = [];

  let currentUser = null;

  let userLatitude = null;
  let userLongitude = null;
  let locationSource = null;

  let locationRequestPromise = null;

  let isInitialized = false;
  let resourceLoadRequestId = 0;

  /* =========================================================
       3. DOM REFERENCES
       ========================================================= */

  let resourceSearch;
  let searchBtn;
  let categoryFilter;
  let availabilityFilter;
  let distanceFilter;
  let sortFilter;

  let resultsCount;
  let resourceGrid;
  let noResources;

  let resetFilters;

  let resourceLoading;
  let resourceError;
  let resourceErrorMessage;
  let retryResourcesBtn;

  /* =========================================================
       4. SUPABASE
       ========================================================= */

  function getSupabaseClient() {
    if (
      window.supabaseClient &&
      typeof window.supabaseClient.from === "function"
    ) {
      return window.supabaseClient;
    }

    if (
      typeof supabaseClient !== "undefined" &&
      supabaseClient &&
      typeof supabaseClient.from === "function"
    ) {
      return supabaseClient;
    }

    console.error("EcoShare: Supabase client is unavailable.");

    return null;
  }

  function getSupabaseProjectOrigin() {
    const configuredOrigin =
      typeof window.ECOSHARE_SUPABASE_URL === "string"
        ? window.ECOSHARE_SUPABASE_URL.trim()
        : "";

    if (!configuredOrigin) {
      return "";
    }

    try {
      return new URL(configuredOrigin).origin;
    } catch (error) {
      console.warn("EcoShare: Invalid Supabase project URL.", error);

      return "";
    }
  }

  /* =========================================================
       5. SHARED AVATAR SYSTEM
       ========================================================= */

  function getSharedAvatarAPI() {
    if (
      window.EcoShareAvatar &&
      typeof window.EcoShareAvatar.getAvatarURL === "function" &&
      typeof window.EcoShareAvatar.setImageSource === "function"
    ) {
      return window.EcoShareAvatar;
    }

    console.warn("EcoShare: Shared avatar system is unavailable.");

    return null;
  }

  function getOwnerAvatar(resource) {
    const avatarAPI = getSharedAvatarAPI();

    if (!avatarAPI) {
      return "";
    }

    try {
      return avatarAPI.getAvatarURL(null, {
        avatar_url: resource?.ownerAvatar || "",
        gender: resource?.ownerGender || "",
      });
    } catch (error) {
      console.warn("EcoShare: Unable to resolve owner avatar.", error);

      return "";
    }
  }

  function setOwnerAvatar(imageElement, resource) {
    if (!imageElement) {
      return;
    }

    const avatarAPI = getSharedAvatarAPI();

    if (!avatarAPI) {
      return;
    }

    try {
      const avatarURL = getOwnerAvatar(resource);

      avatarAPI.setImageSource(
        imageElement,
        avatarURL,
        resource?.ownerGender || "",
      );
    } catch (error) {
      console.warn("EcoShare: Unable to set owner avatar.", error);
    }
  }

  /* =========================================================
       6. DOM INITIALIZATION
       ========================================================= */

  function initializeDOM() {
    resourceSearch = document.getElementById("resourceSearch");

    searchBtn = document.getElementById("searchBtn");

    categoryFilter = document.getElementById("categoryFilter");

    availabilityFilter = document.getElementById("availabilityFilter");

    distanceFilter = document.getElementById("distanceFilter");

    sortFilter = document.getElementById("sortFilter");

    resultsCount = document.getElementById("resultsCount");

    resourceGrid = document.getElementById("resourceGrid");

    noResources = document.getElementById("noResources");

    resetFilters = document.getElementById("resetFilters");

    resourceLoading = document.getElementById("resourceLoading");

    resourceError = document.getElementById("resourceError");

    resourceErrorMessage = document.getElementById("resourceErrorMessage");

    retryResourcesBtn = document.getElementById("retryResourcesBtn");
  }

  /* =========================================================
       7. TEXT HELPERS
       ========================================================= */

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  function normalizeSearchText(value) {
    return normalizeText(value).toLowerCase();
  }

  function formatCategory(category) {
    const normalized = normalizeText(category);

    if (!normalized) {
      return "Other";
    }

    return normalized
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  /* =========================================================
       8. AVAILABILITY
       ========================================================= */

  function normalizeAvailability(value) {
    if (value === true || value === 1) {
      return true;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();

      if (["true", "1", "yes", "available", "active"].includes(normalized)) {
        return true;
      }

      if (
        [
          "false",
          "0",
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
       9. NUMERIC HELPERS
       ========================================================= */

  function parseNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    const number = Number(value);

    return Number.isFinite(number) ? number : fallback;
  }

  function parseCoordinate(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const number = Number(value);

    return Number.isFinite(number) ? number : null;
  }

  function isValidLatitude(value) {
    return Number.isFinite(value) && value >= -90 && value <= 90;
  }

  function isValidLongitude(value) {
    return Number.isFinite(value) && value >= -180 && value <= 180;
  }

  function hasCoordinates(resource) {
    return (
      isValidLatitude(resource?.latitude) &&
      isValidLongitude(resource?.longitude)
    );
  }

  function hasUserCoordinates() {
    return isValidLatitude(userLatitude) && isValidLongitude(userLongitude);
  }

  /* =========================================================
       10. PRICE HELPERS
       ========================================================= */

  function normalizePrice(value) {
    const number = parseNumber(value, 0);

    return number < 0 ? 0 : number;
  }

  function formatPrice(value) {
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(normalizePrice(value));
  }

  function hasHourlyPrice(resource) {
    return Number.isFinite(resource?.pricePerHour) && resource.pricePerHour > 0;
  }

  function hasDailyPrice(resource) {
    return Number.isFinite(resource?.pricePerDay) && resource.pricePerDay > 0;
  }

  /* =========================================================
       11. RESOURCE NORMALIZATION
       ========================================================= */

  function normalizeResource(resource) {
    return {
      id: resource?.id ?? "",

      ownerId: resource?.owner_id ?? "",

      owner: normalizeText(resource?.owner_name) || "EcoShare Member",

      ownerAvatar: normalizeText(resource?.owner_avatar),

      ownerGender: normalizeText(resource?.owner_gender),

      title: normalizeText(resource?.title) || "Untitled Resource",

      description:
        normalizeText(resource?.description) || "No description available.",

      category: normalizeText(resource?.category).toLowerCase() || "others",

      location: normalizeText(resource?.location) || "Location not specified",

      image: normalizeText(resource?.image_url),

      available: normalizeAvailability(resource?.available),

      createdAt: resource?.created_at || null,

      updatedAt: resource?.updated_at || null,

      latitude: parseCoordinate(resource?.latitude),

      longitude: parseCoordinate(resource?.longitude),

      pricePerHour: normalizePrice(resource?.price_per_hour),

      pricePerDay: normalizePrice(resource?.price_per_day),

      distance: null,
    };
  }

  /* =========================================================
       12. CURRENT USER
       ========================================================= */

  async function loadCurrentUser() {
    const client = getSupabaseClient();

    if (!client) {
      currentUser = null;
      return null;
    }

    try {
      const { data, error } = await client.auth.getUser();

      if (error) {
        currentUser = null;
        return null;
      }

      currentUser = data?.user || null;

      return currentUser;
    } catch (error) {
      console.warn("EcoShare: Unable to load current user.", error);

      currentUser = null;

      return null;
    }
  }

  /* =========================================================
       13. PROFILE LOCATION
       ========================================================= */

  async function getProfileLocation() {
    const client = getSupabaseClient();

    if (!client || !currentUser) {
      return false;
    }

    try {
      const { data, error } = await client
        .from(PRIVATE_PROFILE_TABLE)
        .select("id, location, latitude, longitude")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (error) {
        console.warn("EcoShare: Unable to load profile location.", error);

        return false;
      }

      if (!data) {
        return false;
      }

      const latitude = parseCoordinate(data.latitude);

      const longitude = parseCoordinate(data.longitude);

      if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
        return false;
      }

      userLatitude = latitude;
      userLongitude = longitude;
      locationSource = "profile";

      return true;
    } catch (error) {
      console.warn("EcoShare: Profile location error.", error);

      return false;
    }
  }

  /* =========================================================
       14. GPS LOCATION
       ========================================================= */

  function getGPSLocation() {
    if (locationRequestPromise) {
      return locationRequestPromise;
    }

    locationRequestPromise = new Promise((resolve) => {
      if (!navigator.geolocation) {
        console.info("EcoShare: Geolocation is not supported.");

        resolve(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latitude = parseCoordinate(position.coords.latitude);

          const longitude = parseCoordinate(position.coords.longitude);

          if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
            resolve(false);
            return;
          }

          userLatitude = latitude;
          userLongitude = longitude;
          locationSource = "gps";

          resolve(true);
        },

        (error) => {
          console.info(
            "EcoShare: GPS location unavailable.",
            error?.message || "",
          );

          resolve(false);
        },

        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000,
        },
      );
    }).finally(() => {
      locationRequestPromise = null;
    });

    return locationRequestPromise;
  }

  /* =========================================================
       15. BEST USER LOCATION
       ========================================================= */

  async function getUserLocation(options = {}) {
    const allowGPS = options.allowGPS !== false;

    await loadCurrentUser();

    /*
     * Saved profile coordinates are preferred.
     */

    const profileSuccess = await getProfileLocation();

    if (profileSuccess) {
      return true;
    }

    /*
     * GPS is only used when explicitly allowed.
     */

    if (allowGPS) {
      const gpsSuccess = await getGPSLocation();

      if (gpsSuccess) {
        return true;
      }
    }

    userLatitude = null;
    userLongitude = null;
    locationSource = null;

    return false;
  }

  /* =========================================================
       16. HAVERSINE DISTANCE
       ========================================================= */

  function calculateDistance(latitude1, longitude1, latitude2, longitude2) {
    if (
      !isValidLatitude(latitude1) ||
      !isValidLongitude(longitude1) ||
      !isValidLatitude(latitude2) ||
      !isValidLongitude(longitude2)
    ) {
      return null;
    }

    const earthRadiusKm = 6371;

    const toRadians = (degrees) => (degrees * Math.PI) / 180;

    const lat1 = toRadians(latitude1);

    const lat2 = toRadians(latitude2);

    const deltaLatitude = toRadians(latitude2 - latitude1);

    const deltaLongitude = toRadians(longitude2 - longitude1);

    const a =
      Math.sin(deltaLatitude / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLongitude / 2) ** 2;

    const safeA = Math.min(1, Math.max(0, a));

    const c = 2 * Math.atan2(Math.sqrt(safeA), Math.sqrt(1 - safeA));

    return earthRadiusKm * c;
  }

  function calculateResourceDistances() {
    if (!hasUserCoordinates()) {
      resources.forEach((resource) => {
        resource.distance = null;
      });

      return;
    }

    resources.forEach((resource) => {
      if (!hasCoordinates(resource)) {
        resource.distance = null;
        return;
      }

      resource.distance = calculateDistance(
        userLatitude,
        userLongitude,
        resource.latitude,
        resource.longitude,
      );
    });
  }

  function formatDistance(distanceKm) {
    if (!Number.isFinite(distanceKm)) {
      return "Distance unavailable";
    }

    if (distanceKm < 1) {
      const meters = Math.round(distanceKm * 1000);

      if (meters < 1) {
        return "Less than 1 m away";
      }

      return `${meters} m away`;
    }

    if (distanceKm < 10) {
      return `${distanceKm.toFixed(1)} km away`;
    }

    return `${Math.round(distanceKm)} km away`;
  }

  /* =========================================================
       17. RESOURCE IMAGE VALIDATION
       ========================================================= */

  function isValidImageUrl(url) {
    if (typeof url !== "string" || !url.trim()) {
      return false;
    }

    const projectOrigin = getSupabaseProjectOrigin();

    if (!projectOrigin) {
      return false;
    }

    try {
      const parsedUrl = new URL(url.trim(), window.location.href);

      if (parsedUrl.protocol !== "https:") {
        return false;
      }

      if (parsedUrl.origin !== projectOrigin) {
        return false;
      }

      const expectedPrefix = `/storage/v1/object/public/${RESOURCE_STORAGE_BUCKET}/`;

      if (!parsedUrl.pathname.startsWith(expectedPrefix)) {
        return false;
      }

      if (
        parsedUrl.username ||
        parsedUrl.password ||
        parsedUrl.search ||
        parsedUrl.hash
      ) {
        return false;
      }

      const objectPath = parsedUrl.pathname.slice(expectedPrefix.length);

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

      return true;
    } catch {
      return false;
    }
  }

  /* =========================================================
       18. LOAD OWNER PROFILES
       ========================================================= */

  async function loadOwnerProfiles(resourceRows) {
    const client = getSupabaseClient();

    if (!client) {
      return new Map();
    }

    const ownerIds = [
      ...new Set(
        resourceRows.map((resource) => resource?.owner_id).filter(Boolean),
      ),
    ];

    if (!ownerIds.length) {
      return new Map();
    }

    try {
      const { data, error } = await client
        .from(PROFILE_TABLE)
        .select("id, full_name, avatar_url, gender")
        .in("id", ownerIds);

      if (error) {
        console.warn("EcoShare: Unable to load resource owners.", error);

        return new Map();
      }

      const profileMap = new Map();

      if (Array.isArray(data)) {
        data.forEach((profile) => {
          if (!profile?.id) {
            return;
          }

          profileMap.set(String(profile.id), {
            name: normalizeText(profile.full_name) || "EcoShare Member",

            avatar: normalizeText(profile.avatar_url),

            gender: normalizeText(profile.gender),
          });
        });
      }

      return profileMap;
    } catch (error) {
      console.warn("EcoShare: Owner profile lookup failed.", error);

      return new Map();
    }
  }

  /* =========================================================
       19. UI STATES
       ========================================================= */

  function showLoadingState() {
    if (resourceLoading) {
      resourceLoading.hidden = false;
    }

    if (resourceError) {
      resourceError.hidden = true;
    }

    if (noResources) {
      noResources.hidden = true;
    }

    if (resourceGrid) {
      resourceGrid.hidden = true;
      resourceGrid.setAttribute("aria-busy", "true");
    }

    if (resultsCount) {
      resultsCount.textContent = "Loading resources...";
    }
  }

  function hideLoadingState() {
    if (resourceLoading) {
      resourceLoading.hidden = true;
    }

    if (resourceGrid) {
      resourceGrid.setAttribute("aria-busy", "false");
    }
  }

  function showErrorState(message) {
    hideLoadingState();

    if (resourceGrid) {
      resourceGrid.hidden = true;
    }

    if (noResources) {
      noResources.hidden = true;
    }

    if (resourceError) {
      resourceError.hidden = false;
    }

    if (resourceErrorMessage) {
      resourceErrorMessage.textContent =
        normalizeText(message) || "Unable to load resources.";
    }

    if (resultsCount) {
      resultsCount.textContent = "Unable to load resources";
    }
  }

  function hideErrorState() {
    if (resourceError) {
      resourceError.hidden = true;
    }
  }

  function showNoResourcesState() {
    hideLoadingState();
    hideErrorState();

    if (resourceGrid) {
      resourceGrid.hidden = true;
    }

    if (noResources) {
      noResources.hidden = false;
    }

    if (resultsCount) {
      resultsCount.textContent = "0 resources found";
    }
  }

  function showResourceGrid() {
    hideLoadingState();
    hideErrorState();

    if (noResources) {
      noResources.hidden = true;
    }

    if (resourceGrid) {
      resourceGrid.hidden = false;
    }
  }

  /* =========================================================
       20. RESOURCE QUERY
       ========================================================= */

  async function fetchResources() {
    const client = getSupabaseClient();

    if (!client) {
      throw new Error("Supabase client is not available.");
    }

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
                latitude,
                longitude,
                image_url,
                available,
                created_at,
                updated_at,
                price_per_hour,
                price_per_day
            `,
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(RESOURCE_LIMIT);

    if (error) {
      throw error;
    }

    return Array.isArray(data) ? data : [];
  }

  /* =========================================================
       21. LOAD RESOURCES
       ========================================================= */

  async function loadResources() {
    const requestId = ++resourceLoadRequestId;

    showLoadingState();

    try {
      /*
       * Load saved profile coordinates only.
       * GPS is intentionally not requested here.
       */

      await getUserLocation({
        allowGPS: false,
      });

      const rows = await fetchResources();

      if (requestId !== resourceLoadRequestId) {
        return;
      }

      const ownerProfiles = await loadOwnerProfiles(rows);

      if (requestId !== resourceLoadRequestId) {
        return;
      }

      resources = rows.map((row) => {
        const resource = normalizeResource(row);

        const ownerProfile = ownerProfiles.get(String(row?.owner_id || ""));

        if (ownerProfile) {
          resource.owner = ownerProfile.name || resource.owner;

          resource.ownerAvatar = ownerProfile.avatar || resource.ownerAvatar;

          resource.ownerGender = ownerProfile.gender || resource.ownerGender;
        }

        return resource;
      });

      calculateResourceDistances();
      applyFilters();
    } catch (error) {
      if (requestId !== resourceLoadRequestId) {
        return;
      }

      console.error("EcoShare: Failed to load resources.", error);

      resources = [];
      filteredResources = [];

      showErrorState(
        "We couldn't load the available resources. Please try again.",
      );
    }
  }

  /* =========================================================
       22. FILTER MATCHING
       ========================================================= */

  function matchesSearch(resource, searchTerm) {
    if (!searchTerm) {
      return true;
    }

    const searchableText = [
      resource.title,
      resource.description,
      resource.category,
      resource.location,
      resource.owner,
    ]
      .map(normalizeSearchText)
      .join(" ");

    return searchableText.includes(searchTerm);
  }

  function matchesCategory(resource, selectedCategory) {
    if (!selectedCategory || selectedCategory === "all") {
      return true;
    }

    return (
      normalizeSearchText(resource.category) ===
      normalizeSearchText(selectedCategory)
    );
  }

  function matchesAvailability(resource, selectedAvailability) {
    if (!selectedAvailability || selectedAvailability === "all") {
      return true;
    }

    if (selectedAvailability === "available") {
      return resource.available === true;
    }

    if (selectedAvailability === "unavailable") {
      return resource.available === false;
    }

    return true;
  }

  function getSelectedDistance() {
    return normalizeSearchText(distanceFilter?.value) || "all";
  }

  function getDistanceLimit() {
    const selected = getSelectedDistance();

    if (selected === "all" || selected === "") {
      return null;
    }

    const number = Number(selected.replace(/[^0-9.]/g, ""));

    if (!Number.isFinite(number) || number <= 0) {
      return null;
    }

    return Math.min(number, MAX_DISTANCE_KM);
  }

  function matchesDistance(resource, distanceLimit) {
    if (distanceLimit === null) {
      return true;
    }

    if (!Number.isFinite(resource.distance)) {
      return false;
    }

    return resource.distance <= distanceLimit;
  }

  /* =========================================================
       23. SORTING
       ========================================================= */

  function sortResources(resourceList) {
    const sortValue = normalizeSearchText(sortFilter?.value) || "newest";

    const sorted = [...resourceList];

    switch (sortValue) {
      case "oldest":
      case "oldest-first":
        sorted.sort((a, b) => {
          const timeA = Date.parse(a.createdAt || "") || 0;

          const timeB = Date.parse(b.createdAt || "") || 0;

          return timeA - timeB;
        });

        break;

      case "az":
      case "a-z":
      case "name-asc":
      case "title":
        sorted.sort((a, b) =>
          a.title.localeCompare(b.title, undefined, {
            sensitivity: "base",
          }),
        );

        break;

      case "za":
      case "z-a":
      case "name-desc":
        sorted.sort((a, b) =>
          b.title.localeCompare(a.title, undefined, {
            sensitivity: "base",
          }),
        );

        break;

      case "nearest":
      case "distance":
      case "distance-asc":
        sorted.sort((a, b) => {
          const distanceA = Number.isFinite(a.distance) ? a.distance : Infinity;

          const distanceB = Number.isFinite(b.distance) ? b.distance : Infinity;

          return distanceA - distanceB;
        });

        break;

      case "price":
      case "price-asc":
        sorted.sort((a, b) => {
          const priceA =
            a.pricePerHour > 0
              ? a.pricePerHour
              : a.pricePerDay > 0
                ? a.pricePerDay
                : Infinity;

          const priceB =
            b.pricePerHour > 0
              ? b.pricePerHour
              : b.pricePerDay > 0
                ? b.pricePerDay
                : Infinity;

          return priceA - priceB;
        });

        break;

      case "newest":
      default:
        sorted.sort((a, b) => {
          const timeA = Date.parse(a.createdAt || "") || 0;

          const timeB = Date.parse(b.createdAt || "") || 0;

          return timeB - timeA;
        });

        break;
    }

    return sorted;
  }

  /* =========================================================
       24. APPLY FILTERS
       ========================================================= */

  function applyFilters() {
    const searchTerm = normalizeSearchText(resourceSearch?.value);

    const selectedCategory =
      normalizeSearchText(categoryFilter?.value) || "all";

    const selectedAvailability =
      normalizeSearchText(availabilityFilter?.value) || "all";

    const distanceLimit = getDistanceLimit();

    let result = resources.filter(
      (resource) =>
        matchesSearch(resource, searchTerm) &&
        matchesCategory(resource, selectedCategory) &&
        matchesAvailability(resource, selectedAvailability) &&
        matchesDistance(resource, distanceLimit),
    );

    result = sortResources(result);

    filteredResources = result;

    renderResources(filteredResources);
  }

  /* =========================================================
       25. DATE FORMATTER
       ========================================================= */

  function formatDate(dateValue) {
    if (!dateValue) {
      return "";
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    try {
      return new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
    } catch {
      return date.toLocaleDateString();
    }
  }

  /* =========================================================
       26. RESOURCE IMAGE
       ========================================================= */

  function createPlaceholderIcon() {
    const icon = document.createElement("i");

    icon.className = "fa-solid fa-box-open";

    icon.setAttribute("aria-hidden", "true");

    return icon;
  }

  function createResourceImage(resource) {
    const imageContainer = document.createElement("div");

    imageContainer.className = "resource-card-image";

    const imageUrl = isValidImageUrl(resource.image) ? resource.image : null;

    if (!imageUrl) {
      imageContainer.classList.add("resource-card-image-placeholder");

      imageContainer.appendChild(createPlaceholderIcon());

      return imageContainer;
    }

    const image = document.createElement("img");

    image.src = imageUrl;
    image.alt = resource.title || "Resource image";

    image.loading = "lazy";
    image.decoding = "async";

    image.addEventListener(
      "error",
      () => {
        image.remove();

        imageContainer.classList.add("resource-card-image-placeholder");

        imageContainer.appendChild(createPlaceholderIcon());
      },
      {
        once: true,
      },
    );

    imageContainer.appendChild(image);

    return imageContainer;
  }

  /* =========================================================
       27. PRICING
       ========================================================= */

  function createPriceItem(iconClass, text, itemClass) {
    const item = document.createElement("span");

    item.className = itemClass;

    const icon = document.createElement("i");

    icon.className = iconClass;

    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");

    label.textContent = text;

    item.appendChild(icon);
    item.appendChild(label);

    return item;
  }

  function createResourcePricing(resource) {
    const pricing = document.createElement("div");

    pricing.className = "resource-pricing";

    const hasHourly = hasHourlyPrice(resource);

    const hasDaily = hasDailyPrice(resource);

    if (!hasHourly && !hasDaily) {
      const freeLabel = document.createElement("span");

      freeLabel.className = "resource-price-free";

      freeLabel.textContent = "Free";

      pricing.appendChild(freeLabel);

      return pricing;
    }

    if (hasHourly) {
      pricing.appendChild(
        createPriceItem(
          "fa-solid fa-clock",
          `${DEFAULT_CURRENCY}${formatPrice(resource.pricePerHour)}/hour`,
          "resource-price-hour",
        ),
      );
    }

    if (hasDaily) {
      pricing.appendChild(
        createPriceItem(
          "fa-solid fa-calendar-day",
          `${DEFAULT_CURRENCY}${formatPrice(resource.pricePerDay)}/day`,
          "resource-price-day",
        ),
      );
    }

    return pricing;
  }

  /* =========================================================
       28. RESOURCE CARD
       ========================================================= */

  function createResourceCard(resource) {
    const card = document.createElement("article");

    card.className = "resource-card";

    card.dataset.resourceId = String(resource.id);

    const imageContainer = createResourceImage(resource);

    const content = document.createElement("div");

    content.className = "resource-card-content";

    /* -----------------------------------------------------
           Top row
        ----------------------------------------------------- */

    const top = document.createElement("div");

    top.className = "resource-card-top";

    const category = document.createElement("span");

    category.className = "resource-category";

    category.textContent = formatCategory(resource.category);

    const availability = document.createElement("span");

    availability.className = `resource-availability ${
      resource.available ? "available" : "unavailable"
    }`;

    availability.textContent = resource.available ? "Available" : "Unavailable";

    top.appendChild(category);
    top.appendChild(availability);

    /* -----------------------------------------------------
           Title
        ----------------------------------------------------- */

    const title = document.createElement("h3");

    title.className = "resource-title";

    title.textContent = resource.title;

    /* -----------------------------------------------------
           Description
        ----------------------------------------------------- */

    const description = document.createElement("p");

    description.className = "resource-description";

    description.textContent = resource.description;

    /* -----------------------------------------------------
           Location
        ----------------------------------------------------- */

    const location = document.createElement("div");

    location.className = "resource-location";

    const locationRow = document.createElement("div");

    locationRow.className = "resource-location-row";

    const locationIcon = document.createElement("i");

    locationIcon.className = "fa-solid fa-location-dot";

    locationIcon.setAttribute("aria-hidden", "true");

    const locationText = document.createElement("span");

    locationText.textContent = resource.location;

    locationText.title = resource.location;

    locationRow.appendChild(locationIcon);

    locationRow.appendChild(locationText);

    const distanceRow = document.createElement("div");

    distanceRow.className = "resource-distance";

    const distanceIcon = document.createElement("i");

    distanceIcon.className = "fa-solid fa-location-arrow";

    distanceIcon.setAttribute("aria-hidden", "true");

    const distanceText = document.createElement("span");

    distanceText.textContent = formatDistance(resource.distance);

    distanceRow.appendChild(distanceIcon);

    distanceRow.appendChild(distanceText);

    location.appendChild(locationRow);

    location.appendChild(distanceRow);

    /* -----------------------------------------------------
           Pricing
        ----------------------------------------------------- */

    const pricing = createResourcePricing(resource);

    /* -----------------------------------------------------
           Footer
        ----------------------------------------------------- */

    const footer = document.createElement("div");

    footer.className = "resource-card-footer";

    /* Owner */

    const owner = document.createElement("div");

    owner.className = "resource-owner";

    const ownerAvatar = document.createElement("img");

    ownerAvatar.className = "resource-owner-avatar";

    ownerAvatar.alt = resource.owner || "Resource owner";

    ownerAvatar.loading = "lazy";

    ownerAvatar.decoding = "async";

    setOwnerAvatar(ownerAvatar, resource);

    const ownerInfo = document.createElement("div");

    ownerInfo.className = "resource-owner-info";

    const ownerLabel = document.createElement("span");

    ownerLabel.className = "resource-owner-label";

    ownerLabel.textContent = "Shared by";

    const ownerName = document.createElement("span");

    ownerName.className = "resource-owner-name";

    ownerName.textContent = resource.owner;

    ownerInfo.appendChild(ownerLabel);

    ownerInfo.appendChild(ownerName);

    owner.appendChild(ownerAvatar);

    owner.appendChild(ownerInfo);

    footer.appendChild(owner);

    /* Date */

    const createdDate = formatDate(resource.createdAt);

    if (createdDate) {
      const date = document.createElement("span");

      date.className = "resource-date";

      date.textContent = createdDate;

      footer.appendChild(date);
    }

    /* -----------------------------------------------------
           View Details Button
        ----------------------------------------------------- */

    const viewButton = document.createElement("button");

    viewButton.type = "button";

    viewButton.className = "resource-view-btn";

    viewButton.dataset.resourceId = String(resource.id);

    viewButton.setAttribute("aria-label", `View details for ${resource.title}`);

    const viewText = document.createElement("span");

    viewText.textContent = "View Details";

    const arrow = document.createElement("i");

    arrow.className = "fa-solid fa-arrow-right";

    arrow.setAttribute("aria-hidden", "true");

    viewButton.appendChild(viewText);

    viewButton.appendChild(arrow);

    viewButton.addEventListener("click", (event) => {
      event.stopPropagation();

      navigateToResource(resource.id);
    });

    /* -----------------------------------------------------
           Assemble
        ----------------------------------------------------- */

    content.appendChild(top);
    content.appendChild(title);
    content.appendChild(description);
    content.appendChild(location);
    content.appendChild(pricing);
    content.appendChild(footer);
    content.appendChild(viewButton);

    card.appendChild(imageContainer);

    card.appendChild(content);

    /* -----------------------------------------------------
           Card Navigation
        ----------------------------------------------------- */

    card.addEventListener("click", (event) => {
      if (event.target.closest(".resource-view-btn")) {
        return;
      }

      navigateToResource(resource.id);
    });

    card.tabIndex = 0;

    card.setAttribute("role", "link");

    card.setAttribute("aria-label", `View ${resource.title}`);

    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();

        navigateToResource(resource.id);
      }
    });

    return card;
  }

  /* =========================================================
       29. RENDER RESOURCES
       ========================================================= */

  function renderResources(resourceList) {
    if (!resourceGrid) {
      return;
    }

    resourceGrid.replaceChildren();

    const count = Array.isArray(resourceList) ? resourceList.length : 0;

    if (resultsCount) {
      resultsCount.textContent =
        count === 1 ? "1 resource found" : `${count} resources found`;
    }

    if (!count) {
      showNoResourcesState();
      return;
    }

    const fragment = document.createDocumentFragment();

    resourceList.forEach((resource) => {
      fragment.appendChild(createResourceCard(resource));
    });

    resourceGrid.appendChild(fragment);

    showResourceGrid();
  }

  /* =========================================================
       30. RESOURCE DETAILS NAVIGATION
       ========================================================= */

  function navigateToResource(resourceId) {
    const normalizedId = normalizeText(resourceId);

    if (!normalizedId) {
      return;
    }

    const separator = RESOURCE_DETAILS_PAGE.includes("?") ? "&" : "?";

    window.location.href = `${RESOURCE_DETAILS_PAGE}${separator}id=${encodeURIComponent(
      normalizedId,
    )}`;
  }

  /* =========================================================
       31. SEARCH
       ========================================================= */

  function initializeSearch() {
    if (!resourceSearch) {
      return;
    }

    resourceSearch.addEventListener("input", applyFilters);

    resourceSearch.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyFilters();
      }
    });
  }

  function initializeSearchButton() {
    if (!searchBtn) {
      return;
    }

    searchBtn.addEventListener("click", () => {
      applyFilters();

      resourceGrid?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  /* =========================================================
       32. CATEGORY FILTER
       ========================================================= */

  function initializeCategoryFilter() {
    if (!categoryFilter) {
      return;
    }

    categoryFilter.addEventListener("change", applyFilters);
  }

  /* =========================================================
       33. AVAILABILITY FILTER
       ========================================================= */

  function initializeAvailabilityFilter() {
    if (!availabilityFilter) {
      return;
    }

    availabilityFilter.addEventListener("change", applyFilters);
  }

  /* =========================================================
       34. DISTANCE FILTER
       ========================================================= */

  function initializeDistanceFilter() {
    if (!distanceFilter) {
      return;
    }

    distanceFilter.addEventListener("change", async () => {
      const selected = getSelectedDistance();

      /*
       * Any Distance requires no location.
       */

      if (selected === "all" || selected === "") {
        applyFilters();
        return;
      }

      /*
       * Existing coordinates can be reused.
       */

      if (hasUserCoordinates()) {
        calculateResourceDistances();
        applyFilters();
        return;
      }

      /*
       * Otherwise:
       * 1. Profile coordinates
       * 2. Browser GPS
       */

      const locationAvailable = await getUserLocation({
        allowGPS: true,
      });

      if (!locationAvailable) {
        console.info(
          "EcoShare: Distance filtering requires a usable location.",
        );

        distanceFilter.value = "all";

        applyFilters();
        return;
      }

      calculateResourceDistances();
      applyFilters();
    });
  }

  /* =========================================================
       35. SORT FILTER
       ========================================================= */

  function initializeSortFilter() {
    if (!sortFilter) {
      return;
    }

    sortFilter.addEventListener("change", applyFilters);
  }

  /* =========================================================
       36. RESET FILTERS
       ========================================================= */

  function initializeResetFilters() {
    if (!resetFilters) {
      return;
    }

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

      if (distanceFilter) {
        distanceFilter.value = "all";
      }

      if (sortFilter) {
        sortFilter.value = "newest";
      }

      applyFilters();

      resourceSearch?.focus();
    });
  }

  /* =========================================================
       37. RETRY
       ========================================================= */

  function initializeRetryButton() {
    if (!retryResourcesBtn) {
      return;
    }

    retryResourcesBtn.addEventListener("click", loadResources);
  }

  /* =========================================================
       38. INITIALIZE EXPLORE PAGE
       ========================================================= */

  async function initializeExplorePage() {
    if (isInitialized) {
      return;
    }

    initializeDOM();

    if (!resourceGrid) {
      console.warn("EcoShare: #resourceGrid was not found.");

      return;
    }

    isInitialized = true;

    initializeSearch();
    initializeSearchButton();
    initializeCategoryFilter();
    initializeAvailabilityFilter();
    initializeDistanceFilter();
    initializeSortFilter();
    initializeResetFilters();
    initializeRetryButton();

    /*
     * Load resources immediately.
     *
     * Saved profile coordinates are used when available.
     * Browser GPS is not requested automatically.
     */

    await loadResources();
  }

  /* =========================================================
       39. PUBLIC API
       ========================================================= */

  window.EcoShareExplore = {
    reload: loadResources,

    refresh: loadResources,

    getResources: () => {
      return [...resources];
    },

    getFilteredResources: () => {
      return [...filteredResources];
    },

    getUserLocation: async () => {
      const success = await getUserLocation({
        allowGPS: true,
      });

      if (success) {
        calculateResourceDistances();
        applyFilters();
      }

      return success;
    },

    calculateDistance,

    formatDistance,
  };

  /* =========================================================
       40. START
       ========================================================= */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeExplorePage, {
      once: true,
    });
  } else {
    initializeExplorePage();
  }
})();
