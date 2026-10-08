/* ==================================================
   EcoShare — Notifications JavaScript
   File: notifications.js

   Page-specific notification functionality.

   Global functionality such as:
   - Authentication navigation
   - Navbar
   - Mobile navigation
   - Profile dropdown
   - Logout
   - Shared avatar handling

   is handled by page.js.
   ================================================== */

"use strict";

/* ==================================================
   INITIALIZATION GUARD
   ================================================== */

if (window.EcoShareNotificationsInitialized) {
  console.info("EcoShare Notifications: already initialized.");
} else {
  window.EcoShareNotificationsInitialized = true;

  /* ==================================================
       STATE
       ================================================== */

  let currentUser = null;

  let multiSelectMode = false;

  const selectedNotificationIds = new Set();

  let initialized = false;

  let authListenerRegistered = false;

  /* ==================================================
       DOM ELEMENTS
       ================================================== */

  const notificationsContainer = document.getElementById(
    "notificationsContainer",
  );

  const notificationsEmpty = document.getElementById("notificationsEmpty");

  /* ==================================================
       HELPERS
       ================================================== */

  function getSupabaseClient() {
    if (!window.supabaseClient) {
      console.error("EcoShare Notifications: Supabase client is unavailable.");

      return null;
    }

    return window.supabaseClient;
  }

  function normalizeNotificationId(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const id = String(value).trim();

    if (!/^\d+$/.test(id)) {
      return null;
    }

    if (id === "0") {
      return null;
    }

    return id;
  }

  function getNotificationIdFromItem(item) {
    if (!item) {
      return null;
    }

    return normalizeNotificationId(item.dataset.notificationId);
  }

  function isValidNotification(notification) {
    if (!notification || typeof notification !== "object") {
      return false;
    }

    return Boolean(normalizeNotificationId(notification.id));
  }

  function getNotificationDate(value) {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  function formatNotificationTime(value) {
    const date = getNotificationDate(value);

    if (!date) {
      return "";
    }

    return date.toLocaleString();
  }

  function getNotificationType(notification) {
    return String(notification?.type || "")
      .trim()
      .toLowerCase();
  }

  function getNotificationRedirect(notification) {
    const type = getNotificationType(notification);

    if (type === "message") {
      const conversationId = normalizeNotificationId(
        notification?.conversation_id,
      );

      if (!conversationId) {
        return null;
      }

      return (
        "../Phase 3/messages.html" +
        `?conversation=${encodeURIComponent(conversationId)}`
      );
    }

    if (type === "borrow_request") {
      const requestId = normalizeNotificationId(
        notification?.borrow_request_id,
      );

      if (!requestId) {
        return null;
      }

      return (
        "../Phase 2/incoming-requests.html" +
        `?requestId=${encodeURIComponent(requestId)}`
      );
    }

    return null;
  }

  /* ==================================================
       CURRENT USER
       ================================================== */

  async function loadCurrentUser() {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return false;
    }

    try {
      const { data, error } = await supabase.auth.getUser();

      if (error) {
        console.error(
          "EcoShare Notifications: Error getting current user.",
          error,
        );

        currentUser = null;

        return false;
      }

      currentUser = data?.user || null;

      return Boolean(currentUser);
    } catch (error) {
      console.error(
        "EcoShare Notifications: Failed to load current user.",
        error,
      );

      currentUser = null;

      return false;
    }
  }

  /* ==================================================
       EMPTY STATE
       ================================================== */

  function showEmptyState(show = true) {
    if (!notificationsEmpty) {
      return;
    }

    notificationsEmpty.hidden = !show;

    notificationsEmpty.style.display = show ? "flex" : "none";
  }

  /* ==================================================
       SELECTION CONTROLS
       ================================================== */

  function ensureSelectionControls() {
    if (!notificationsContainer) {
      return null;
    }

    let controls = document.getElementById("notificationSelectionControls");

    if (controls) {
      return controls;
    }

    controls = document.createElement("div");

    controls.id = "notificationSelectionControls";

    controls.className = "notification-selection-controls";

    controls.hidden = true;

    const selectedCount = document.createElement("span");

    selectedCount.id = "selectedNotificationCount";

    selectedCount.textContent = "0 selected";

    const deleteButton = document.createElement("button");

    deleteButton.type = "button";

    deleteButton.id = "deleteSelectedNotifications";

    deleteButton.setAttribute("aria-label", "Delete selected notifications");

    const deleteIcon = document.createElement("i");

    deleteIcon.className = "fa-solid fa-trash";

    deleteIcon.setAttribute("aria-hidden", "true");

    const deleteText = document.createElement("span");

    deleteText.textContent = "Delete";

    deleteButton.appendChild(deleteIcon);

    deleteButton.appendChild(deleteText);

    controls.appendChild(selectedCount);

    controls.appendChild(deleteButton);

    const selectAll = document.getElementById("notificationSelectAll");

    if (selectAll?.parentNode) {
      selectAll.parentNode.insertBefore(controls, selectAll);
    } else {
      notificationsContainer.prepend(controls);
    }

    deleteButton.addEventListener("click", deleteSelectedNotifications);

    return controls;
  }

  function updateSelectionControls() {
    const selectionControls = ensureSelectionControls();

    const selectedCount = document.getElementById("selectedNotificationCount");

    const selectAllContainer = document.getElementById("notificationSelectAll");

    const deleteButton = document.getElementById("deleteSelectedNotifications");

    const checkboxes = document.querySelectorAll(
      ".notification-select-checkbox",
    );

    if (!selectionControls || !selectedCount || !selectAllContainer) {
      return;
    }

    checkboxes.forEach((checkbox) => {
      checkbox.style.display = multiSelectMode ? "block" : "none";
    });

    if (!multiSelectMode) {
      selectionControls.hidden = true;

      selectAllContainer.hidden = true;

      selectedCount.textContent = "0 selected";

      if (deleteButton) {
        deleteButton.disabled = true;
      }

      return;
    }

    selectionControls.hidden = false;

    selectAllContainer.hidden = false;

    selectedCount.textContent = `${selectedNotificationIds.size} selected`;

    if (deleteButton) {
      deleteButton.disabled = selectedNotificationIds.size === 0;
    }

    updateSelectAllCheckbox();
  }

  function enterMultiSelectMode(notificationId = null) {
    multiSelectMode = true;

    const normalizedId = normalizeNotificationId(notificationId);

    if (normalizedId) {
      selectedNotificationIds.add(normalizedId);
    }

    updateSelectionControls();
  }

  function exitMultiSelectMode() {
    multiSelectMode = false;

    selectedNotificationIds.clear();

    document
      .querySelectorAll(".notification-select-checkbox")
      .forEach((checkbox) => {
        checkbox.checked = false;
      });

    const selectAllCheckbox = document.getElementById("selectAllNotifications");

    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;

      selectAllCheckbox.indeterminate = false;
    }

    updateSelectionControls();
  }

  /* ==================================================
       DELETE SINGLE NOTIFICATION
       ================================================== */

  async function deleteNotification(notificationId, item) {
    const supabase = getSupabaseClient();

    if (!supabase || !currentUser) {
      return false;
    }

    const id = normalizeNotificationId(notificationId);

    if (!id) {
      return false;
    }

    try {
      const { error } = await supabase.rpc("delete_my_notification", {
        notification_id: id,
      });

      if (error) {
        console.error(
          "EcoShare Notifications: Error deleting notification.",
          error,
        );

        return false;
      }

      selectedNotificationIds.delete(id);

      if (item) {
        item.remove();
      }

      const remainingItems = notificationsContainer
        ? notificationsContainer.querySelectorAll(".notification-item").length
        : 0;

      if (remainingItems === 0) {
        showEmptyState(true);

        exitMultiSelectMode();
      } else {
        updateSelectionControls();
      }

      return true;
    } catch (error) {
      console.error(
        "EcoShare Notifications: Failed to delete notification.",
        error,
      );

      return false;
    }
  }

  /* ==================================================
       CREATE NOTIFICATION ACTION MENU
       ================================================== */

  function createNotificationActionMenu(notification, item) {
    const actionMenu = document.createElement("div");

    actionMenu.className = "notification-action-menu";

    /* --------------------------------------------------
           SELECT ACTION
           -------------------------------------------------- */

    const selectAction = document.createElement("button");

    selectAction.type = "button";

    selectAction.className = "notification-action-select";

    const selectIcon = document.createElement("i");

    selectIcon.className = "fa-solid fa-check-square";

    selectIcon.setAttribute("aria-hidden", "true");

    const selectText = document.createElement("span");

    selectText.textContent = "Select";

    selectAction.appendChild(selectIcon);

    selectAction.appendChild(selectText);

    selectAction.addEventListener("click", (event) => {
      event.stopPropagation();

      enterMultiSelectMode(notification.id);

      const checkbox = item.querySelector(".notification-select-checkbox");

      if (checkbox) {
        checkbox.checked = true;
      }

      updateSelectionControls();

      actionMenu.remove();
    });

    /* --------------------------------------------------
           DELETE ACTION
           -------------------------------------------------- */

    const deleteAction = document.createElement("button");

    deleteAction.type = "button";

    deleteAction.className = "notification-action-delete";

    const deleteIcon = document.createElement("i");

    deleteIcon.className = "fa-solid fa-trash";

    deleteIcon.setAttribute("aria-hidden", "true");

    const deleteText = document.createElement("span");

    deleteText.textContent = "Delete";

    deleteAction.appendChild(deleteIcon);

    deleteAction.appendChild(deleteText);

    deleteAction.addEventListener("click", async (event) => {
      event.stopPropagation();

      actionMenu.remove();

      await deleteNotification(notification.id, item);
    });

    actionMenu.appendChild(selectAction);

    actionMenu.appendChild(deleteAction);

    return actionMenu;
  }

  /* ==================================================
       NOTIFICATION ICON
       ================================================== */

  function getNotificationIconClass(notificationType) {
    switch (notificationType) {
      case "borrow_request":
        return "fa-solid fa-hand-holding";

      case "borrow_request_approved":
        return "fa-solid fa-circle-check";

      case "borrow_request_rejected":
        return "fa-solid fa-circle-xmark";

      case "message":
        return "fa-solid fa-message";

      default:
        return "fa-solid fa-bell";
    }
  }

  /* ==================================================
       DISPLAY NOTIFICATIONS
       ================================================== */

  function displayNotifications(notificationList) {
    if (!notificationsContainer) {
      return;
    }

    notificationsContainer
      .querySelectorAll(".notification-item")
      .forEach((item) => {
        item.remove();
      });

    if (!Array.isArray(notificationList) || notificationList.length === 0) {
      showEmptyState(true);

      updateSelectionControls();

      return;
    }

    showEmptyState(false);

    const validNotifications = notificationList.filter(isValidNotification);

    if (validNotifications.length === 0) {
      showEmptyState(true);

      updateSelectionControls();

      return;
    }

    /*
     * Remove selected IDs that no longer exist
     * in the current notification list.
     */

    const availableIds = new Set(
      validNotifications.map((notification) =>
        normalizeNotificationId(notification.id),
      ),
    );

    Array.from(selectedNotificationIds).forEach((id) => {
      if (!availableIds.has(id)) {
        selectedNotificationIds.delete(id);
      }
    });

    const fragment = document.createDocumentFragment();

    validNotifications.forEach((notification) => {
      const notificationId = normalizeNotificationId(notification.id);

      if (!notificationId) {
        return;
      }

      /* ------------------------------------------
                   NOTIFICATION ITEM
                   ------------------------------------------ */

      const item = document.createElement("article");

      item.className = "notification-item";

      item.dataset.notificationId = notificationId;

      item.style.cursor = "pointer";

      item.setAttribute("tabindex", "0");

      item.setAttribute("role", "article");

      /* ------------------------------------------
                   SELECTION CHECKBOX
                   ------------------------------------------ */

      const checkbox = document.createElement("input");

      checkbox.type = "checkbox";

      checkbox.className = "notification-select-checkbox";

      checkbox.checked = selectedNotificationIds.has(notificationId);

      checkbox.setAttribute("aria-label", "Select notification");

      checkbox.addEventListener("click", (event) => {
        event.stopPropagation();
      });

      checkbox.addEventListener("change", (event) => {
        if (event.target.checked) {
          selectedNotificationIds.add(notificationId);
        } else {
          selectedNotificationIds.delete(notificationId);
        }

        updateSelectionControls();
      });

      /* ------------------------------------------
                   THREE-DOT MENU
                   ------------------------------------------ */

      const menuButton = document.createElement("button");

      menuButton.type = "button";

      menuButton.className = "notification-menu-button";

      menuButton.setAttribute("aria-label", "Notification options");

      menuButton.setAttribute("aria-expanded", "false");

      const menuIcon = document.createElement("i");

      menuIcon.className = "fa-solid fa-ellipsis-vertical";

      menuIcon.setAttribute("aria-hidden", "true");

      menuButton.appendChild(menuIcon);

      menuButton.addEventListener("click", (event) => {
        event.stopPropagation();

        const existingMenu = item.querySelector(".notification-action-menu");

        if (existingMenu) {
          existingMenu.remove();

          menuButton.setAttribute("aria-expanded", "false");

          return;
        }

        document
          .querySelectorAll(".notification-action-menu")
          .forEach((menu) => {
            menu.remove();
          });

        document
          .querySelectorAll(".notification-menu-button")
          .forEach((button) => {
            button.setAttribute("aria-expanded", "false");
          });

        const actionMenu = createNotificationActionMenu(notification, item);

        item.appendChild(actionMenu);

        menuButton.setAttribute("aria-expanded", "true");
      });

      /* ------------------------------------------
                   NOTIFICATION CLICK / REDIRECT
                   ------------------------------------------ */

      function handleNotificationClick() {
        if (multiSelectMode) {
          checkbox.checked = !checkbox.checked;

          if (checkbox.checked) {
            selectedNotificationIds.add(notificationId);
          } else {
            selectedNotificationIds.delete(notificationId);
          }

          updateSelectionControls();

          return;
        }

        const redirect = getNotificationRedirect(notification);

        if (!redirect) {
          return;
        }

        window.location.href = redirect;
      }

      item.addEventListener("click", handleNotificationClick);

      item.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();

        handleNotificationClick();
      });

      /* ------------------------------------------
                   UNREAD STATE
                   ------------------------------------------ */

      if (!notification.is_read) {
        item.classList.add("notification-unread");
      }

      /* ------------------------------------------
                   ICON
                   ------------------------------------------ */

      const iconWrapper = document.createElement("div");

      iconWrapper.className = "notification-icon";

      const icon = document.createElement("i");

      icon.className = getNotificationIconClass(
        getNotificationType(notification),
      );

      icon.setAttribute("aria-hidden", "true");

      iconWrapper.appendChild(icon);

      /* ------------------------------------------
                   CONTENT
                   ------------------------------------------ */

      const content = document.createElement("div");

      content.className = "notification-content";

      const title = document.createElement("h3");

      title.textContent = String(notification.title || "");

      const message = document.createElement("p");

      message.textContent = String(notification.message || "");

      const time = document.createElement("span");

      time.className = "notification-time";

      time.textContent = formatNotificationTime(notification.created_at);

      content.appendChild(title);

      content.appendChild(message);

      content.appendChild(time);

      /* ------------------------------------------
                   NOTIFICATION SURFACE
                   ------------------------------------------ */

      const notificationSurface = document.createElement("div");

      notificationSurface.className = "notification-surface";

      notificationSurface.appendChild(checkbox);

      notificationSurface.appendChild(iconWrapper);

      notificationSurface.appendChild(content);

      item.appendChild(notificationSurface);

      item.appendChild(menuButton);

      fragment.appendChild(item);
    });

    notificationsContainer.appendChild(fragment);

    updateSelectionControls();
  }

  /* ==================================================
       CLOSE OPEN ACTION MENUS
       ================================================== */

  function closeNotificationMenus() {
    document.querySelectorAll(".notification-action-menu").forEach((menu) => {
      menu.remove();
    });

    document.querySelectorAll(".notification-menu-button").forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });
  }

  /* ==================================================
       DOCUMENT CLICK HANDLER
       ================================================== */

  function handleDocumentClick(event) {
    const clickedMenu = event.target.closest(".notification-action-menu");

    const clickedMenuButton = event.target.closest(".notification-menu-button");

    if (!clickedMenu && !clickedMenuButton) {
      closeNotificationMenus();
    }

    /*
     * Exit multi-select mode when clicking outside
     * the notification selection area.
     */

    if (
      multiSelectMode &&
      !event.target.closest(".notification-item") &&
      !event.target.closest("#notificationSelectionControls") &&
      !event.target.closest("#notificationSelectAll")
    ) {
      exitMultiSelectMode();
    }
  }

  /* ==================================================
       LOAD NOTIFICATIONS
       ================================================== */

  async function loadNotifications() {
    const supabase = getSupabaseClient();

    if (!supabase || !currentUser) {
      return false;
    }

    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        console.error(
          "EcoShare Notifications: Error loading notifications.",
          error,
        );

        return false;
      }

      displayNotifications(Array.isArray(data) ? data : []);

      return true;
    } catch (error) {
      console.error(
        "EcoShare Notifications: Failed to load notifications.",
        error,
      );

      return false;
    }
  }

  /* ==================================================
       MARK NOTIFICATIONS AS READ
       ================================================== */

  async function markNotificationsAsRead() {
    const supabase = getSupabaseClient();

    if (!supabase || !currentUser) {
      return false;
    }

    try {
      const { error } = await supabase
        .from("notifications")
        .update({
          is_read: true,
        })
        .eq("user_id", currentUser.id)
        .eq("is_read", false);

      if (error) {
        console.error(
          "EcoShare Notifications: Error marking notifications as read.",
          error,
        );

        return false;
      }

      console.log("EcoShare Notifications: Notifications marked as read.");

      return true;
    } catch (error) {
      console.error(
        "EcoShare Notifications: Failed to mark notifications as read.",
        error,
      );

      return false;
    }
  }

  /* ==================================================
       DELETE SELECTED NOTIFICATIONS
       ================================================== */

  async function deleteSelectedNotifications() {
    const supabase = getSupabaseClient();

    if (!supabase || !currentUser) {
      return;
    }

    const ids = Array.from(selectedNotificationIds);

    if (ids.length === 0) {
      return;
    }

    const deleteButton = document.getElementById("deleteSelectedNotifications");

    if (deleteButton) {
      deleteButton.disabled = true;
    }

    let failedCount = 0;

    try {
      for (const notificationId of ids) {
        const { error } = await supabase.rpc("delete_my_notification", {
          notification_id: notificationId,
        });

        if (error) {
          failedCount += 1;

          console.error(
            `EcoShare Notifications: Error deleting notification ${notificationId}.`,
            error,
          );

          continue;
        }

        const item = notificationsContainer?.querySelector(
          `.notification-item[data-notification-id="${CSS.escape(notificationId)}"]`,
        );

        if (item) {
          item.remove();
        }

        selectedNotificationIds.delete(notificationId);
      }

      if (failedCount > 0) {
        console.warn(
          `EcoShare Notifications: ${failedCount} notification(s) could not be deleted.`,
        );
      }

      selectedNotificationIds.clear();

      multiSelectMode = false;

      closeNotificationMenus();

      const remainingItems = notificationsContainer
        ? notificationsContainer.querySelectorAll(".notification-item").length
        : 0;

      if (remainingItems === 0) {
        showEmptyState(true);
      }

      updateSelectionControls();
    } catch (error) {
      console.error(
        "EcoShare Notifications: Failed to delete selected notifications.",
        error,
      );

      updateSelectionControls();
    }
  }

  /* ==================================================
       SELECT ALL CHECKBOX
       ================================================== */

  function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById("selectAllNotifications");

    if (!selectAllCheckbox) {
      return;
    }

    const notificationItems = document.querySelectorAll(".notification-item");

    const checkboxes = document.querySelectorAll(
      ".notification-select-checkbox",
    );

    if (notificationItems.length === 0 || checkboxes.length === 0) {
      selectAllCheckbox.checked = false;

      selectAllCheckbox.indeterminate = false;

      return;
    }

    const selectedCount = Array.from(checkboxes).filter(
      (checkbox) => checkbox.checked,
    ).length;

    selectAllCheckbox.checked = selectedCount === checkboxes.length;

    selectAllCheckbox.indeterminate =
      selectedCount > 0 && selectedCount < checkboxes.length;
  }

  function handleSelectAllChange(event) {
    const checkboxes = document.querySelectorAll(
      ".notification-select-checkbox",
    );

    const shouldSelect = Boolean(event.target.checked);

    checkboxes.forEach((checkbox) => {
      checkbox.checked = shouldSelect;

      const item = checkbox.closest(".notification-item");

      if (!item) {
        return;
      }

      const notificationId = getNotificationIdFromItem(item);

      if (!notificationId) {
        return;
      }

      if (shouldSelect) {
        selectedNotificationIds.add(notificationId);
      } else {
        selectedNotificationIds.delete(notificationId);
      }
    });

    if (shouldSelect) {
      multiSelectMode = true;
    }

    updateSelectionControls();
  }

  /* ==================================================
       AUTH STATE
       ================================================== */

  function registerAuthListener() {
    if (authListenerRegistered) {
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    authListenerRegistered = true;

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        currentUser = null;

        selectedNotificationIds.clear();

        multiSelectMode = false;

        closeNotificationMenus();

        if (window.location.pathname.endsWith("notifications.html")) {
          window.location.href = "../Phase 1/login.html";
        }

        return;
      }

      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        currentUser = session.user;
      }
    });
  }

  /* ==================================================
       CLEANUP
       ================================================== */

  function cleanupNotifications() {
    selectedNotificationIds.clear();

    multiSelectMode = false;

    closeNotificationMenus();
  }

  /* ==================================================
       INITIALIZE
       ================================================== */

  async function initializeNotifications() {
    if (initialized) {
      return;
    }

    if (!notificationsContainer) {
      console.error(
        "EcoShare Notifications: Notifications container was not found.",
      );

      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    initialized = true;

    ensureSelectionControls();

    registerAuthListener();

    document.addEventListener("click", handleDocumentClick);

    const selectAllNotifications = document.getElementById(
      "selectAllNotifications",
    );

    if (selectAllNotifications) {
      selectAllNotifications.addEventListener("change", handleSelectAllChange);
    }

    const isAuthenticated = await loadCurrentUser();

    if (!isAuthenticated) {
      cleanupNotifications();

      window.location.href = "../Phase 1/login.html";

      return;
    }

    await loadNotifications();

    /*
     * Mark currently unread notifications as read
     * after rendering them so the user can still see
     * the unread styling during this page load.
     */

    await markNotificationsAsRead();

    /*
     * Keep the navigation unread badge in sync
     * when page.js exposes its refresh method.
     */

    if (
      typeof window.EcoShareNotifications?.refreshUnreadCount === "function"
    ) {
      try {
        await window.EcoShareNotifications.refreshUnreadCount();
      } catch (error) {
        console.debug(
          "EcoShare Notifications: Unread badge refresh unavailable.",
          error,
        );
      }
    }

    console.log("EcoShare Notifications initialized successfully.");
  }

  /* ==================================================
       PAGE CLEANUP
       ================================================== */

  window.addEventListener("beforeunload", cleanupNotifications);

  /* ==================================================
       PUBLIC API
       ================================================== */

  window.EcoShareNotifications = Object.freeze({
    reload: loadNotifications,

    refresh: async () => {
      if (!currentUser) {
        return false;
      }

      return loadNotifications();
    },

    exitSelectionMode: exitMultiSelectMode,
  });

  /* ==================================================
       START
       ================================================== */

  initializeNotifications();
}
