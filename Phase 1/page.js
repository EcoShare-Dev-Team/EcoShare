/*
=========================================================
ECOSHARE — GLOBAL PAGE / SHARED UI JAVASCRIPT

File: page.js

Responsibilities:
- Authentication state
- Profile information
- Shared navbar state
- Profile dropdown
- Mobile navigation
- Notification badge integration
- Admin / user navigation visibility
- Logout
- Shared route / asset resolution
- Navbar scroll state
- Shared UI helpers

IMPORTANT:
- This file handles UI state only.
- It does NOT provide authorization.
- Real authorization must be enforced by Supabase RLS.
- Never place a Supabase secret/service-role key here.

AVATAR SOURCE:
- Custom avatar: profiles.avatar_url
- Default avatars: Supabase Storage
- Bucket: profile-photos
- No local avatar files are used.
=========================================================
*/

"use strict";

(function () {
  /* =========================================================
       0. DUPLICATE INITIALIZATION PROTECTION
    ========================================================= */

  if (window.ecoSharePageInitialized) {
    return;
  }

  window.ecoSharePageInitialized = true;

  /* =========================================================
       1. DOM HELPERS
    ========================================================= */

  const $ = (id) => document.getElementById(id);

  const query = (selector) => document.querySelector(selector);

  /* =========================================================
       2. DOM REFERENCES
    ========================================================= */

  let authNavButton = null;
  let registerNavButton = null;

  let profileDropdown = null;
  let profileAvatarBtn = null;
  let profileMenu = null;
  let profileLogoutBtn = null;

  let navProfilePhoto = null;
  let menuProfilePhoto = null;
  let menuProfileName = null;
  let menuProfileEmail = null;

  let messagesNavLink = null;
  let notificationsNavLink = null;
  let notificationUnreadBadge = null;

  let menuBtn = null;
  let primaryNavigation = null;
  let header = null;

  let adminDashboardLink = null;
  let userDashboardLink = null;

  function cacheDOMReferences() {
    authNavButton = $("authNavButton");
    registerNavButton = $("registerNavButton");

    profileDropdown = $("profileDropdown");
    profileAvatarBtn = $("profileAvatarBtn");
    profileMenu = $("profileMenu");
    profileLogoutBtn = $("profileLogoutBtn");

    navProfilePhoto = $("navProfilePhoto");
    menuProfilePhoto = $("menuProfilePhoto");
    menuProfileName = $("menuProfileName");
    menuProfileEmail = $("menuProfileEmail");

    messagesNavLink = $("messagesNavLink");
    notificationsNavLink = $("notificationsNavLink");
    notificationUnreadBadge = $("notificationUnreadBadge");

    menuBtn = $("menu-btn");
    primaryNavigation = $("primary-navigation");

    header = query(".header");

    adminDashboardLink = $("adminDashboardLink");
    userDashboardLink = $("userDashboardLink");
  }

  /* =========================================================
       3. STATE
    ========================================================= */

  let currentUser = null;
  let currentProfile = null;

  let authSubscription = null;

  let isLoggingOut = false;
  let isInitialized = false;

  let profileRequestId = 0;
  let notificationRequestId = 0;

  let lastAuthUserId = null;

  /* =========================================================
       4. ROUTES / ASSETS
    ========================================================= */

  const pageScriptURL = document.currentScript?.src || "";

  let pageBaseURL;

  try {
    pageBaseURL = pageScriptURL
      ? new URL("./", pageScriptURL)
      : new URL("./", window.location.href);
  } catch (error) {
    console.warn("EcoShare: Unable to resolve page base URL.", error);

    pageBaseURL = new URL("./", window.location.href);
  }

  function getPhase1URL(fileName = "") {
    if (!fileName) {
      return pageBaseURL.href;
    }

    try {
      return new URL(fileName, pageBaseURL).href;
    } catch (error) {
      console.warn("EcoShare: Unable to resolve ../Phase 1 URL.", error);

      return pageBaseURL.href;
    }
  }

  function getAssetURL(fileName = "") {
    if (!fileName) {
      return "";
    }

    try {
      return new URL(`../assets/${fileName}`, pageBaseURL).href;
    } catch (error) {
      console.warn("EcoShare: Unable to resolve asset URL.", error);

      return "";
    }
  }

  const HOME_URL = window.ECOSHARE_ROUTES?.home || "../index.html";

  const LOGIN_URL = window.ECOSHARE_ROUTES?.login || getPhase1URL("login.html");

  const REGISTER_URL =
    window.ECOSHARE_ROUTES?.register || getPhase1URL("register.html");

  /* =========================================================
       5. SUPABASE AVATAR SYSTEM
    ========================================================= */

  /*
   * supabase.js is the single source of truth
   * for the current Supabase project URL.
   */

  const SUPABASE_PROJECT_ORIGIN = String(
    window.ECOSHARE_SUPABASE_URL || "",
  ).replace(/\/+$/, "");

  const PROFILE_PHOTOS_BUCKET = "profile-photos";

  const SUPABASE_PROFILE_PHOTO_BASE = SUPABASE_PROJECT_ORIGIN
    ? `${SUPABASE_PROJECT_ORIGIN}/storage/v1/object/public/${PROFILE_PHOTOS_BUCKET}`
    : "";

  const DEFAULT_AVATAR = SUPABASE_PROFILE_PHOTO_BASE
    ? `${SUPABASE_PROFILE_PHOTO_BASE}/avatar-default.png`
    : "";

  const GENDER_AVATARS = {
    male: SUPABASE_PROFILE_PHOTO_BASE
      ? `${SUPABASE_PROFILE_PHOTO_BASE}/avatar-male.png`
      : "",

    female: SUPABASE_PROFILE_PHOTO_BASE
      ? `${SUPABASE_PROFILE_PHOTO_BASE}/avatar-female.png`
      : "",

    other: DEFAULT_AVATAR,

    prefer_not_to_say: DEFAULT_AVATAR,
  };

  function normalizeAvatarGender(gender) {
    return String(gender || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }

  function getDefaultAvatar(gender = "") {
    const normalized = normalizeAvatarGender(gender);

    return GENDER_AVATARS[normalized] || DEFAULT_AVATAR;
  }

  function isValidSupabaseAvatarURL(value) {
    if (
      typeof value !== "string" ||
      !value.trim() ||
      !SUPABASE_PROJECT_ORIGIN
    ) {
      return false;
    }

    try {
      const url = new URL(value.trim());

      const expectedOrigin = new URL(SUPABASE_PROJECT_ORIGIN).origin;

      const expectedPrefix = `/storage/v1/object/public/${PROFILE_PHOTOS_BUCKET}/`;

      return (
        url.protocol === "https:" &&
        url.origin === expectedOrigin &&
        url.pathname.startsWith(expectedPrefix) &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }

  function getAvatarURL(user, profile = {}) {
    const uploadedAvatar = String(profile?.avatar_url || "").trim();

    if (isValidSupabaseAvatarURL(uploadedAvatar)) {
      return uploadedAvatar;
    }

    return getDefaultAvatar(
      profile?.gender || user?.user_metadata?.gender || "",
    );
  }

  function setAvatarSource(imageElement, imageURL, gender = "") {
    if (!imageElement) {
      return;
    }

    const fallback = getDefaultAvatar(gender);

    const safeURL = isValidSupabaseAvatarURL(imageURL) ? imageURL : fallback;

    imageElement.onerror = () => {
      imageElement.onerror = null;

      if (fallback && imageElement.src !== fallback) {
        imageElement.src = fallback;
      }
    };

    if (safeURL) {
      imageElement.src = safeURL;
    }
  }

  /*
   * Shared avatar API.
   */

  window.EcoShareAvatar = {
    PROJECT_ORIGIN: SUPABASE_PROJECT_ORIGIN,

    BUCKET: PROFILE_PHOTOS_BUCKET,

    BASE_URL: SUPABASE_PROFILE_PHOTO_BASE,

    DEFAULT_AVATAR,

    GENDER_AVATARS,

    normalizeGender: normalizeAvatarGender,

    getDefaultAvatar,

    getAvatarURL,

    isValidSupabaseAvatarURL,

    setImageSource: setAvatarSource,
  };

  /* =========================================================
       6. CONSTANTS
    ========================================================= */

  const ADMIN_ROLE = "admin";

  const SUPPORTED_AUTH_EVENTS = new Set([
    "SIGNED_IN",
    "SIGNED_OUT",
    "USER_UPDATED",
  ]);

  /* =========================================================
       7. SUPABASE CLIENT
    ========================================================= */

  function getSupabaseClient() {
    const client = window.supabaseClient;

    if (client && client.auth) {
      return client;
    }

    return null;
  }

  /* =========================================================
       8. GENERAL HELPERS
    ========================================================= */

  function normalizeStatus(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase();
  }

  function normalizeRole(value) {
    return normalizeStatus(value).replace(/[\s-]+/g, "_");
  }

  function isCurrentUser(userId) {
    return Boolean(currentUser && userId && currentUser.id === userId);
  }

  /* =========================================================
       9. ADMIN DETECTION
    ========================================================= */

  /*
   * UI visibility only.
   *
   * This does NOT grant authorization.
   * Supabase RLS remains the security boundary.
   */

  function isAdminUser(user, profile = {}) {
    if (!user?.id) {
      return false;
    }

    return normalizeRole(profile?.role) === ADMIN_ROLE;
  }

  /* =========================================================
       10. IMAGE HELPERS
    ========================================================= */

  function isValidImageURL(value) {
    if (typeof value !== "string" || !value.trim()) {
      return false;
    }

    const url = value.trim();

    if (url.startsWith("/") || url.startsWith("./") || url.startsWith("../")) {
      return true;
    }

    if (url.startsWith("data:image/")) {
      return true;
    }

    try {
      const parsedURL = new URL(url);

      return parsedURL.protocol === "https:";
    } catch {
      return false;
    }
  }

  function safeImageURL(value) {
    if (typeof value !== "string" || !value.trim()) {
      return "";
    }

    const url = value.trim();

    return isValidImageURL(url) ? url : "";
  }

  function setImageSource(imageElement, imageURL, fallbackImage = "") {
    if (!imageElement) {
      return;
    }

    const safeURL = safeImageURL(imageURL);

    imageElement.onerror = null;

    if (safeURL) {
      imageElement.onerror = () => {
        imageElement.onerror = null;

        if (fallbackImage && imageElement.src !== fallbackImage) {
          imageElement.src = fallbackImage;
        }
      };

      imageElement.src = safeURL;

      return;
    }

    if (fallbackImage) {
      imageElement.src = fallbackImage;
    }
  }

  /* =========================================================
       11. USER DISPLAY HELPERS
    ========================================================= */

  function getDisplayName(user, profile = {}) {
    const metadata = user?.user_metadata || {};

    const candidates = [
      profile.full_name,
      profile.username,
      profile.name,

      metadata.full_name,
      metadata.username,
      metadata.name,

      user?.email?.split("@")[0],
    ];

    const displayName = candidates.find(
      (value) => typeof value === "string" && value.trim().length > 0,
    );

    return displayName ? displayName.trim() : "EcoShare Member";
  }

  /* =========================================================
       12. PROFILE DROPDOWN
    ========================================================= */

  function openProfileMenu() {
    if (!profileMenu || !profileAvatarBtn) {
      return;
    }

    closeMobileMenu();

    profileMenu.hidden = false;

    profileAvatarBtn.setAttribute("aria-expanded", "true");

    profileDropdown?.classList.add("open");
  }

  function closeProfileMenu() {
    if (!profileMenu || !profileAvatarBtn) {
      return;
    }

    profileMenu.hidden = true;

    profileAvatarBtn.setAttribute("aria-expanded", "false");

    profileDropdown?.classList.remove("open");
  }

  function toggleProfileMenu() {
    if (!profileMenu) {
      return;
    }

    if (profileMenu.hidden) {
      openProfileMenu();
    } else {
      closeProfileMenu();
    }
  }

  function setupProfileDropdown() {
    if (!profileAvatarBtn || !profileMenu) {
      return;
    }

    profileAvatarBtn.setAttribute("aria-haspopup", "true");

    profileAvatarBtn.setAttribute("aria-expanded", "false");

    profileMenu.hidden = true;

    profileAvatarBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      toggleProfileMenu();
    });

    profileMenu.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    document.addEventListener("click", (event) => {
      if (profileDropdown && !profileDropdown.contains(event.target)) {
        closeProfileMenu();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && profileMenu && !profileMenu.hidden) {
        closeProfileMenu();
        profileAvatarBtn.focus();
      }
    });

    profileMenu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeProfileMenu);
    });
  }

  /* =========================================================
   ACTIVE NAVIGATION
   Automatically highlights the current page.
   ========================================================= */

  function setupActiveNavigation() {
    if (!primaryNavigation) {
      return;
    }

    const currentFile = window.location.pathname.split("/").pop().toLowerCase();

    const currentPage = currentFile || "index.html";

    primaryNavigation.querySelectorAll(".nav-link").forEach((link) => {
      const href = link.getAttribute("href");

      if (!href) {
        return;
      }

      let linkFile = "";

      try {
        const linkURL = new URL(href, window.location.href);

        linkFile = linkURL.pathname.split("/").pop().toLowerCase();
      } catch {
        return;
      }

      if (!linkFile) {
        linkFile = "index.html";
      }

      const isActive = currentPage === linkFile;

      link.classList.toggle("active", isActive);

      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }
  /* =========================================================
       13. MOBILE NAVIGATION
    ========================================================= */

  function setMobileMenuState(isOpen) {
    if (!menuBtn || !primaryNavigation) {
      return;
    }

    primaryNavigation.classList.toggle("show", isOpen);

    menuBtn.classList.toggle("active", isOpen);

    menuBtn.setAttribute("aria-expanded", String(isOpen));

    menuBtn.setAttribute(
      "aria-label",
      isOpen ? "Close navigation menu" : "Open navigation menu",
    );

    menuBtn.setAttribute("data-menu-state", isOpen ? "open" : "closed");
  }

  function closeMobileMenu() {
    setMobileMenuState(false);
  }

  function openMobileMenu() {
    closeProfileMenu();
    setMobileMenuState(true);
  }

  function setupMobileNavigation() {
    if (!menuBtn || !primaryNavigation) {
      return;
    }

    /* =====================================================
       RESPONSIVE BREAKPOINT
       Must match page.css
       ===================================================== */

    const MOBILE_BREAKPOINT = 800;

    const isMobile = () => {
      return window.innerWidth <= MOBILE_BREAKPOINT;
    };

    /* =====================================================
       SET MENU STATE
       ===================================================== */

    function setMenuState(isOpen) {
      /*
       * The hamburger menu is only active
       * on mobile/tablet screens.
       */

      if (!isMobile()) {
        isOpen = false;
      }

      primaryNavigation.classList.toggle("show", isOpen);

      menuBtn.classList.toggle("active", isOpen);

      menuBtn.setAttribute("aria-expanded", String(isOpen));

      menuBtn.setAttribute(
        "aria-label",
        isOpen ? "Close navigation menu" : "Open navigation menu",
      );

      menuBtn.setAttribute("data-menu-state", isOpen ? "open" : "closed");
    }

    /* =====================================================
       CLOSE MENU
       ===================================================== */

    function closeMobileMenu() {
      setMenuState(false);
    }

    /* =====================================================
       OPEN MENU
       ===================================================== */

    function openMobileMenu() {
      if (!isMobile()) {
        return;
      }

      closeProfileMenu();

      setMenuState(true);
    }

    /* =====================================================
       TOGGLE MENU
       ===================================================== */

    function toggleMobileMenu() {
      if (!isMobile()) {
        return;
      }

      const isOpen = primaryNavigation.classList.contains("show");

      if (isOpen) {
        closeMobileMenu();
      } else {
        openMobileMenu();
      }
    }

    /* =====================================================
       INITIAL BUTTON STATE
       ===================================================== */

    setMenuState(false);

    /* =====================================================
       HAMBURGER BUTTON
       ===================================================== */

    menuBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      toggleMobileMenu();
    });

    /* =====================================================
       NAVIGATION LINKS
       ===================================================== */

    primaryNavigation.querySelectorAll(".nav-link").forEach((link) => {
      link.addEventListener("click", () => {
        if (isMobile()) {
          closeMobileMenu();
        }
      });
    });

    /* =====================================================
       LOGIN / REGISTER
       ===================================================== */

    authNavButton?.addEventListener("click", closeMobileMenu);

    registerNavButton?.addEventListener("click", closeMobileMenu);

    /* =====================================================
       CLICK OUTSIDE
       ===================================================== */

    document.addEventListener("click", (event) => {
      if (!primaryNavigation.classList.contains("show")) {
        return;
      }

      const clickedInsideNavigation = primaryNavigation.contains(event.target);

      const clickedMenuButton = menuBtn.contains(event.target);

      if (!clickedInsideNavigation && !clickedMenuButton) {
        closeMobileMenu();
      }
    });

    /* =====================================================
       ESCAPE KEY
       ===================================================== */

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (!primaryNavigation.classList.contains("show")) {
        return;
      }

      closeMobileMenu();

      menuBtn.focus();
    });

    /* =====================================================
       RESIZE
       ===================================================== */

    const handleNavigationResize = () => {
      /*
       * When changing from mobile/tablet
       * to desktop, always close the mobile menu.
       */

      if (!isMobile()) {
        closeMobileMenu();
      }
    };

    window.addEventListener("resize", handleNavigationResize, {
      passive: true,
    });

    /* =====================================================
       PUBLIC API
       ===================================================== */

    window.ecoShareMobileNavigation = {
      open: openMobileMenu,
      close: closeMobileMenu,
      toggle: toggleMobileMenu,
    };
  }

  /* =========================================================
       14. NAVBAR PROFILE
    ========================================================= */

  function updateNavbarProfile(user, profile = {}) {
    if (!user) {
      return;
    }

    const displayName = getDisplayName(user, profile);

    const avatarURL = getAvatarURL(user, profile);

    const gender = profile?.gender || user?.user_metadata?.gender || "";

    const email = user.email || "EcoShare Member";

    setAvatarSource(navProfilePhoto, avatarURL, gender);

    setAvatarSource(menuProfilePhoto, avatarURL, gender);

    if (menuProfileName) {
      menuProfileName.textContent = displayName;
    }

    if (menuProfileEmail) {
      menuProfileEmail.textContent = email;
    }

    if (authNavButton) {
      authNavButton.hidden = true;
    }

    if (registerNavButton) {
      registerNavButton.hidden = true;
    }

    if (profileDropdown) {
      profileDropdown.hidden = false;
    }

    const isAdmin = isAdminUser(user, profile);

    if (adminDashboardLink) {
      adminDashboardLink.hidden = !isAdmin;
    }

    if (userDashboardLink) {
      userDashboardLink.hidden = isAdmin;
    }
  }

  /* =========================================================
       15. LOGGED-IN NAVIGATION
    ========================================================= */

  function showLoggedInNavigation() {
    if (authNavButton) {
      authNavButton.hidden = true;
    }

    if (registerNavButton) {
      registerNavButton.hidden = true;
    }

    if (profileDropdown) {
      profileDropdown.hidden = false;
    }

    if (messagesNavLink) {
      messagesNavLink.hidden = false;
    }

    if (notificationsNavLink) {
      notificationsNavLink.hidden = false;
    }
  }

  /* =========================================================
       16. NOTIFICATION BADGE
    ========================================================= */

  function setNotificationBadge(count) {
    if (!notificationUnreadBadge) {
      return;
    }

    let numericCount = Number(count);

    if (!Number.isFinite(numericCount) || numericCount < 0) {
      numericCount = 0;
    }

    numericCount = Math.floor(numericCount);

    notificationUnreadBadge.textContent =
      numericCount > 99 ? "99+" : String(numericCount);

    notificationUnreadBadge.hidden = numericCount <= 0;

    notificationUnreadBadge.setAttribute(
      "aria-label",
      numericCount > 0
        ? `${numericCount} unread notification${numericCount === 1 ? "" : "s"}`
        : "No unread notifications",
    );
  }

  async function updateNotificationBadge() {
    if (!currentUser?.id) {
      setNotificationBadge(0);
      return;
    }

    const client = getSupabaseClient();

    if (!client) {
      return;
    }

    const requestId = ++notificationRequestId;

    /*
     * script.js owns the actual
     * notification database query.
     */

    const updateFunction = window.updateNotificationUnreadBadge;

    /*
     * page.js may load before script.js.
     *
     * Do not incorrectly set the badge
     * to zero in that situation.
     */

    if (typeof updateFunction !== "function") {
      window.setTimeout(() => {
        if (
          isCurrentUser(currentUser?.id) &&
          typeof window.updateNotificationUnreadBadge === "function"
        ) {
          updateNotificationBadge();
        }
      }, 0);

      return;
    }

    try {
      const result = await updateFunction();

      if (requestId !== notificationRequestId) {
        return;
      }

      if (typeof result === "number") {
        setNotificationBadge(result);

        return;
      }

      if (result && typeof result === "object") {
        setNotificationBadge(result.unreadCount ?? result.count ?? 0);
      }
    } catch (error) {
      console.warn("EcoShare: Unable to update notification badge.", error);
    }
  }

  /* =========================================================
       17. LOGGED-OUT NAVIGATION
    ========================================================= */

  function showLoggedOutNavigation() {
    currentUser = null;
    currentProfile = null;

    profileRequestId++;
    notificationRequestId++;

    lastAuthUserId = null;

    if (adminDashboardLink) {
      adminDashboardLink.hidden = true;
    }

    if (userDashboardLink) {
      userDashboardLink.hidden = true;
    }

    if (authNavButton) {
      authNavButton.hidden = false;

      authNavButton.href = LOGIN_URL;

      authNavButton.setAttribute("aria-label", "Login");

      const icon = authNavButton.querySelector("i");

      const label = authNavButton.querySelector("span");

      if (icon) {
        icon.className = "fa-solid fa-right-to-bracket";

        icon.setAttribute("aria-hidden", "true");
      }

      if (label) {
        label.textContent = "Login";
      }
    }

    if (registerNavButton) {
      registerNavButton.hidden = false;

      registerNavButton.href = REGISTER_URL;

      registerNavButton.setAttribute("aria-label", "Register");

      const icon = registerNavButton.querySelector("i");

      const label = registerNavButton.querySelector("span");

      if (icon) {
        icon.className = "fa-solid fa-user-plus";

        icon.setAttribute("aria-hidden", "true");
      }

      if (label) {
        label.textContent = "Register";
      }
    }

    if (profileDropdown) {
      profileDropdown.hidden = true;
    }

    closeProfileMenu();

    if (messagesNavLink) {
      messagesNavLink.hidden = true;
    }

    if (notificationsNavLink) {
      notificationsNavLink.hidden = true;
    }

    setNotificationBadge(0);

    setAvatarSource(navProfilePhoto, DEFAULT_AVATAR);

    setAvatarSource(menuProfilePhoto, DEFAULT_AVATAR);

    if (menuProfileName) {
      menuProfileName.textContent = "EcoShare Member";
    }

    if (menuProfileEmail) {
      menuProfileEmail.textContent = "";
    }

    closeMobileMenu();
  }

  /* =========================================================
       18. LOAD USER PROFILE
    ========================================================= */

  async function loadUserProfile(user) {
    if (!user?.id) {
      return {};
    }

    const client = getSupabaseClient();

    if (!client) {
      return {};
    }

    const requestId = ++profileRequestId;

    /*
     * Show Auth metadata immediately.
     *
     * This prevents a blank navbar while
     * the profiles query is running.
     */

    updateNavbarProfile(user, {
      full_name: user.user_metadata?.full_name,

      gender: user.user_metadata?.gender,
    });

    try {
      const { data, error } = await client
        .from("profiles")
        .select("id, full_name, role, avatar_url, gender")
        .eq("id", user.id)
        .maybeSingle();

      /*
       * Ignore stale responses.
       */

      if (requestId !== profileRequestId) {
        return {};
      }

      if (!isCurrentUser(user.id)) {
        return {};
      }

      if (error) {
        console.warn("EcoShare: Unable to load user profile.", error);

        /*
         * Do not log the user out just
         * because the profile query failed.
         *
         * Auth remains valid.
         */

        currentProfile = null;

        updateNavbarProfile(user, {
          full_name: user.user_metadata?.full_name,

          gender: user.user_metadata?.gender,
        });

        return {};
      }

      currentProfile = data || null;

      updateNavbarProfile(
        user,
        data || {
          full_name: user.user_metadata?.full_name,

          gender: user.user_metadata?.gender,
        },
      );

      return data || {};
    } catch (error) {
      if (requestId !== profileRequestId) {
        return {};
      }

      console.warn("EcoShare: Profile loading failed.", error);

      currentProfile = null;

      updateNavbarProfile(user, {
        full_name: user.user_metadata?.full_name,

        gender: user.user_metadata?.gender,
      });

      return {};
    }
  }

  /* =========================================================
       19. AUTHENTICATION NAVIGATION
    ========================================================= */

  async function updateAuthNavigation() {
    const client = getSupabaseClient();

    if (!client) {
      console.warn("EcoShare: Supabase client is not initialized.");

      showLoggedOutNavigation();

      return;
    }

    try {
      const { data, error } = await client.auth.getSession();

      if (error) {
        throw error;
      }

      const user = data?.session?.user || null;

      currentUser = user;

      if (!user) {
        showLoggedOutNavigation();
        return;
      }

      lastAuthUserId = user.id;

      showLoggedInNavigation();

      updateNavbarProfile(user, {
        full_name: user.user_metadata?.full_name,

        gender: user.user_metadata?.gender,
      });

      await loadUserProfile(user);

      if (isCurrentUser(user.id)) {
        await updateNotificationBadge();
      }
    } catch (error) {
      console.error(
        "EcoShare: Error updating authentication navigation:",
        error,
      );

      currentUser = null;
      currentProfile = null;
      lastAuthUserId = null;

      profileRequestId++;
      notificationRequestId++;

      showLoggedOutNavigation();
    }
  }

  /* =========================================================
       20. LOGOUT
    ========================================================= */

  async function handleLogout(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (isLoggingOut) {
      return;
    }

    const client = getSupabaseClient();

    if (!client) {
      console.error("EcoShare: Supabase client is not initialized.");

      alert("Unable to log out. Please refresh and try again.");

      return;
    }

    isLoggingOut = true;

    if (profileLogoutBtn) {
      profileLogoutBtn.disabled = true;

      profileLogoutBtn.setAttribute("aria-busy", "true");
    }

    try {
      const { error } = await client.auth.signOut();

      if (error) {
        throw error;
      }

      currentUser = null;
      currentProfile = null;
      lastAuthUserId = null;

      profileRequestId++;
      notificationRequestId++;

      showLoggedOutNavigation();

      window.location.replace(HOME_URL);
    } catch (error) {
      console.error("EcoShare: Logout failed:", error);

      alert("Unable to log out. Please try again.");
    } finally {
      isLoggingOut = false;

      if (profileLogoutBtn) {
        profileLogoutBtn.disabled = false;

        profileLogoutBtn.removeAttribute("aria-busy");
      }
    }
  }

  function setupLogout() {
    if (!profileLogoutBtn) {
      return;
    }

    profileLogoutBtn.addEventListener("click", handleLogout);
  }

  /* =========================================================
       21. AUTH STATE LISTENER
    ========================================================= */

  function listenForAuthChanges() {
    const client = getSupabaseClient();

    if (!client || authSubscription) {
      return;
    }

    const { data, error } = client.auth.onAuthStateChange((event, session) => {
      if (!SUPPORTED_AUTH_EVENTS.has(event)) {
        return;
      }

      const user = session?.user || null;

      /*
       * SIGNED_OUT
       */

      if (!user) {
        showLoggedOutNavigation();
        return;
      }

      currentUser = user;

      lastAuthUserId = user.id;

      showLoggedInNavigation();

      /*
       * Update navbar immediately
       * from Auth metadata.
       */

      updateNavbarProfile(user, {
        full_name: user.user_metadata?.full_name,

        gender: user.user_metadata?.gender,
      });

      /*
       * Keep database work outside
       * the auth callback itself.
       */

      queueMicrotask(async () => {
        if (!isCurrentUser(user.id)) {
          return;
        }

        await loadUserProfile(user);

        if (!isCurrentUser(user.id)) {
          return;
        }

        await updateNotificationBadge();
      });
    });

    if (error) {
      console.error("EcoShare: Auth listener setup failed:", error);

      return;
    }

    authSubscription = data?.subscription || null;
  }

  /* =========================================================
       22. NAVBAR SCROLL
    ========================================================= */

  function updateNavbarOnScroll() {
    if (!header) {
      return;
    }

    header.classList.toggle("scrolled", window.scrollY > 50);
  }

  function setupNavbarScroll() {
    window.addEventListener("scroll", updateNavbarOnScroll, {
      passive: true,
    });

    updateNavbarOnScroll();
  }

  /* =========================================================
       23. GLOBAL UI HELPERS
    ========================================================= */

  const buttonOriginalChildren = new WeakMap();

  function setElementVisible(element, visible) {
    if (!element) {
      return;
    }

    element.hidden = !visible;
  }

  function setButtonLoading(button, isLoading, loadingText = "Loading...") {
    if (!button) {
      return;
    }

    if (isLoading) {
      if (!buttonOriginalChildren.has(button)) {
        buttonOriginalChildren.set(
          button,
          Array.from(button.childNodes).map((node) => node.cloneNode(true)),
        );
      }

      button.disabled = true;

      button.setAttribute("aria-busy", "true");

      button.textContent = loadingText;

      return;
    }

    button.disabled = false;

    button.removeAttribute("aria-busy");

    const originalChildren = buttonOriginalChildren.get(button);

    if (originalChildren) {
      button.replaceChildren(
        ...originalChildren.map((node) => node.cloneNode(true)),
      );

      buttonOriginalChildren.delete(button);
    }
  }

  function scrollToElement(elementOrSelector, options = {}) {
    const element =
      typeof elementOrSelector === "string"
        ? query(elementOrSelector)
        : elementOrSelector;

    if (!element) {
      return;
    }

    element.scrollIntoView({
      behavior: options.behavior || "smooth",

      block: options.block || "start",

      inline: options.inline || "nearest",
    });
  }

  /* =========================================================
       24. INITIALIZATION
    ========================================================= */

  async function initializePage() {
    if (isInitialized) {
      return;
    }

    isInitialized = true;

    cacheDOMReferences();

    /*
     * Establish a safe logged-out state
     * before checking authentication.
     */

    showLoggedOutNavigation();

    setupProfileDropdown();

    setupActiveNavigation();

    setupMobileNavigation();

    setupLogout();

    setupNavbarScroll();

    /*
     * Register the auth listener before
     * loading the current session.
     *
     * INITIAL_SESSION is intentionally
     * ignored because getSession()
     * handles initial state explicitly.
     */

    listenForAuthChanges();

    await updateAuthNavigation();
  }

  /* =========================================================
       25. PUBLIC ECOSHARE API
    ========================================================= */

  window.EcoSharePage = {
    /*
     * Profile menu
     */

    openProfileMenu,
    closeProfileMenu,
    toggleProfileMenu,

    /*
     * Mobile navigation
     */

    openMobileMenu,
    closeMobileMenu,

    /*
     * Authentication
     */

    refreshAuth: updateAuthNavigation,

    logout: handleLogout,

    /*
     * Profile
     */

    updateNavbarProfile,

    updateProfile: updateNavbarProfile,

    refreshProfile: async function () {
      if (!currentUser) {
        return {};
      }

      return loadUserProfile(currentUser);
    },

    /*
     * Notifications
     */

    refreshNotifications: updateNotificationBadge,

    setNotificationBadge,

    /*
     * Current state
     */

    getCurrentUser: function () {
      return currentUser;
    },

    getCurrentProfile: function () {
      return currentProfile;
    },

    isAdmin: function () {
      return isAdminUser(currentUser, currentProfile || {});
    },

    /*
     * UI helpers
     */

    setElementVisible,
    setButtonLoading,
    scrollToElement,

    /*
     * Image helpers
     */

    getDefaultAvatar,
    getAvatarURL,
    setImageSource,
    setAvatarSource,
    isValidSupabaseAvatarURL,

    /*
     * Routes
     */

    getLoginURL: function () {
      return LOGIN_URL;
    },

    getPhase1URL,
    getAssetURL,
  };

  /* =========================================================
       BACKWARD COMPATIBILITY
    ========================================================= */

  window.EcoShareNavbar = window.EcoSharePage;

  /* =========================================================
       26. DOM READY
    ========================================================= */

  function startEcoSharePage() {
    initializePage().catch((error) => {
      console.error("EcoShare: Page initialization failed:", error);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startEcoSharePage, {
      once: true,
    });
  } else {
    startEcoSharePage();
  }
})();
