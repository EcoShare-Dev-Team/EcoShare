// ==================================================
// EcoShare — Notifications JavaScript
// ==================================================

"use strict";

// ==================================================
// STATE
// ==================================================

let currentUser = null;

let multiSelectMode = false;
let selectedNotificationIds = new Set();
// ==================================================
// DOM ELEMENTS
// ==================================================

const notificationsContainer = document.getElementById(
  "notificationsContainer",
);

const notificationsEmpty = document.getElementById("notificationsEmpty");

// ==================================================
// LOAD CURRENT USER
// ==================================================

async function loadCurrentUser() {
  const { data, error } = await supabaseClient.auth.getUser();

  if (error) {
    console.error("Error getting current user:", error);
    return false;
  }

  currentUser = data?.user || null;

  return Boolean(currentUser);
}

// ==================================================
// DELETE NOTIFICATION
// ==================================================

async function deleteNotification(notificationId, item) {
  const id = Number(notificationId);

  if (!id) {
    return;
  }

  const { error } = await supabaseClient.rpc("delete_my_notification", {
    notification_id: id,
  });

  if (error) {
    console.error("Error deleting notification:", error);

    return;
  }

  item.remove();

  if (notificationsContainer && notificationsContainer.children.length === 0) {
    if (notificationsEmpty) {
      notificationsEmpty.hidden = false;
    }
  }
}

function updateSelectionControls() {
  const selectionControls = document.getElementById(
    "notificationSelectionControls",
  );

  const selectedCount = document.getElementById("selectedNotificationCount");
  const selectAllContainer = document.getElementById("notificationSelectAll");

  const checkboxes = document.querySelectorAll(".notification-select-checkbox");

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
    return;
  }

  selectionControls.hidden = false;
  selectAllContainer.hidden = false;

  selectedCount.textContent = `${selectedNotificationIds.size} selected`;
}

// ==================================================
// DISPLAY NOTIFICATIONS
// ==================================================

function displayNotifications(notificationList) {
  if (!notificationsContainer) {
    return;
  }

  notificationsContainer
    .querySelectorAll(".notification-item")
    .forEach((item) => item.remove());

  if (!Array.isArray(notificationList) || notificationList.length === 0) {
    if (notificationsEmpty) {
      notificationsEmpty.hidden = false;
      notificationsEmpty.style.display = "flex";
    }

    return;
  }

  if (notificationsEmpty) {
    notificationsEmpty.hidden = true;
    notificationsEmpty.style.display = "none";
  }

  const fragment = document.createDocumentFragment();

  notificationList.forEach((notification) => {
    // ==================================================
    // NOTIFICATION ITEM
    // ==================================================

    const item = document.createElement("article");

    item.className = "notification-item";
    item.dataset.notificationId = notification.id;
    item.style.cursor = "pointer";

    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";
    checkbox.className = "notification-select-checkbox";
    checkbox.checked = selectedNotificationIds.has(notification.id);

    checkbox.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    checkbox.addEventListener("change", (event) => {
      if (event.target.checked) {
        selectedNotificationIds.add(notification.id);
      } else {
        selectedNotificationIds.delete(notification.id);
      }

      updateSelectionControls();
      updateSelectAllCheckbox();
    });
    const menuButton = document.createElement("button");

    menuButton.className = "notification-menu-button";
    menuButton.type = "button";
    menuButton.setAttribute("aria-label", "Notification options");

    menuButton.innerHTML =
      '<i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>';
    menuButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const existingMenu = item.querySelector(".notification-action-menu");

      if (existingMenu) {
        existingMenu.remove();
        return;
      }

      // Close any other open notification menus
      document.querySelectorAll(".notification-action-menu").forEach((menu) => {
        menu.remove();
      });

      const actionMenu = document.createElement("div");

      actionMenu.className = "notification-action-menu";

      const selectAction = document.createElement("button");

      selectAction.type = "button";
      selectAction.className = "notification-action-select";

      selectAction.innerHTML =
        '<i class="fa-solid fa-check-square" aria-hidden="true"></i><span>Select</span>';

      selectAction.addEventListener("click", (selectEvent) => {
        selectEvent.stopPropagation();

        multiSelectMode = true;
        selectedNotificationIds.add(notification.id);

        const checkbox = item.querySelector(".notification-select-checkbox");

        if (checkbox) {
          checkbox.checked = true;
        }

        updateSelectionControls();
        updateSelectAllCheckbox();

        actionMenu.remove();
      });
      const deleteAction = document.createElement("button");

      deleteAction.type = "button";
      deleteAction.className = "notification-action-delete";

      deleteAction.innerHTML =
        '<i class="fa-solid fa-trash" aria-hidden="true"></i><span>Delete</span>';

      deleteAction.addEventListener("click", async (deleteEvent) => {
        deleteEvent.stopPropagation();

        await deleteNotification(notification.id, item);
      });

      actionMenu.appendChild(selectAction);
      actionMenu.appendChild(deleteAction);
      item.appendChild(actionMenu);
    });
    // ==================================================
    // NOTIFICATION CLICK / REDIRECT
    // ==================================================

    item.addEventListener("click", () => {
      if (multiSelectMode) {
        const checkbox = item.querySelector(".notification-select-checkbox");

        if (checkbox) {
          checkbox.checked = !checkbox.checked;

          if (checkbox.checked) {
            selectedNotificationIds.add(notification.id);
          } else {
            selectedNotificationIds.delete(notification.id);
          }

          updateSelectionControls();
        }

        return;
      }
      // ----------------------------------------------
      // MESSAGE
      // ----------------------------------------------

      if (notification.type === "message") {
        const conversationId = Number(notification.conversation_id);

        if (!conversationId) {
          return;
        }

        window.location.href = `../Phase 3/messages.html?conversation=${conversationId}`;

        return;
      }

      // ----------------------------------------------
      // BORROW REQUEST
      // ----------------------------------------------

      if (notification.type === "borrow_request") {
        const requestId = Number(notification.borrow_request_id);

        if (!requestId) {
          return;
        }

        window.location.href = `../Phase 2/incoming-requests.html?requestId=${requestId}`;

        return;
      }
    });

    // ==================================================
    // UNREAD
    // ==================================================

    if (!notification.is_read) {
      item.classList.add("notification-unread");
    }

    // ==================================================
    // ICON
    // ==================================================

    const iconWrapper = document.createElement("div");

    iconWrapper.className = "notification-icon";

    const icon = document.createElement("i");

    switch (notification.type) {
      case "borrow_request":
        icon.className = "fa-solid fa-hand-holding";
        break;

      case "request_approved":
        icon.className = "fa-solid fa-circle-check";
        break;

      case "request_rejected":
        icon.className = "fa-solid fa-circle-xmark";
        break;

      case "message":
        icon.className = "fa-solid fa-message";
        break;

      default:
        icon.className = "fa-solid fa-bell";
    }

    icon.setAttribute("aria-hidden", "true");

    iconWrapper.appendChild(icon);

    // ==================================================
    // CONTENT
    // ==================================================

    const content = document.createElement("div");

    content.className = "notification-content";

    const title = document.createElement("h3");

    title.textContent = notification.title || "";

    const message = document.createElement("p");

    message.textContent = notification.message || "";

    const time = document.createElement("span");

    time.className = "notification-time";

    time.textContent = new Date(notification.created_at).toLocaleString();

    content.appendChild(title);
    content.appendChild(message);
    content.appendChild(time);

    // ==================================================
    // NOTIFICATION SURFACE
    // ==================================================

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
  updateSelectAllCheckbox();
}

document.addEventListener("click", (event) => {
  const clickedMenu = event.target.closest(".notification-action-menu");

  const clickedMenuButton = event.target.closest(".notification-menu-button");

  const clickedNotification = event.target.closest(".notification-item");

  // Close open three-dot menus
  if (!clickedMenu && !clickedMenuButton) {
    document.querySelectorAll(".notification-action-menu").forEach((menu) => {
      menu.remove();
    });
  }

  // Exit multi-select mode when nothing is selected
  // Close selection mode when clicking outside
  // the notifications page
  if (
    multiSelectMode &&
    !event.target.closest(".notification-item") &&
    !event.target.closest("#notificationSelectionControls") &&
    !event.target.closest("#notificationSelectAll")
  ) {
    multiSelectMode = false;
    selectedNotificationIds.clear();

    document
      .querySelectorAll(".notification-select-checkbox")
      .forEach((checkbox) => {
        checkbox.checked = false;
      });

    updateSelectionControls();

    const selectAllCheckbox = document.getElementById("selectAllNotifications");

    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;
    }
  }
});

// ==================================================
// LOAD NOTIFICATIONS
// ==================================================

async function loadNotifications() {
  if (!currentUser) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("notifications")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error("Error loading notifications:", error);

    return;
  }

  displayNotifications(data);
}

// ==================================================
// MARK NOTIFICATIONS AS READ
// ==================================================

async function markNotificationsAsRead() {
  if (!currentUser) {
    return;
  }

  const { error } = await supabaseClient
    .from("notifications")
    .update({
      is_read: true,
    })
    .eq("user_id", currentUser.id)
    .eq("is_read", false);

  if (error) {
    console.error("Error marking notifications as read:", error);

    return;
  }

  console.log("Notifications marked as read.");
}

async function deleteSelectedNotifications() {
  if (selectedNotificationIds.size === 0) {
    return;
  }

  const ids = Array.from(selectedNotificationIds);

  for (const notificationId of ids) {
    const { error } = await supabaseClient.rpc("delete_my_notification", {
      notification_id: notificationId,
    });

    if (error) {
      console.error(`Error deleting notification ${notificationId}:`, error);

      return;
    }
  }

  selectedNotificationIds.clear();
  multiSelectMode = false;

  await loadNotifications();
  updateSelectionControls();
}

const deleteSelectedButton = document.getElementById(
  "deleteSelectedNotifications",
);

if (deleteSelectedButton) {
  deleteSelectedButton.addEventListener("click", async () => {
    await deleteSelectedNotifications();
  });
}

function updateSelectAllCheckbox() {
  const selectAllCheckbox = document.getElementById("selectAllNotifications");

  if (!selectAllCheckbox) {
    return;
  }

  const notificationItems = document.querySelectorAll(".notification-item");

  if (notificationItems.length === 0) {
    selectAllCheckbox.checked = false;
    return;
  }

  selectAllCheckbox.checked =
    selectedNotificationIds.size === notificationItems.length;
}

const selectAllNotifications = document.getElementById(
  "selectAllNotifications",
);

if (selectAllNotifications) {
  selectAllNotifications.addEventListener("change", (event) => {
    const checkboxes = document.querySelectorAll(
      ".notification-select-checkbox",
    );

    checkboxes.forEach((checkbox) => {
      checkbox.checked = event.target.checked;

      const item = checkbox.closest(".notification-item");

      if (!item) {
        return;
      }

      const notificationId = Number(item.dataset.notificationId);

      if (!notificationId) {
        return;
      }

      if (event.target.checked) {
        selectedNotificationIds.add(notificationId);
      } else {
        selectedNotificationIds.delete(notificationId);
      }
    });

    updateSelectionControls();
  });
}
// ==================================================
// INITIALIZE
// ==================================================

async function initializeNotifications() {
  if (!notificationsContainer) {
    return;
  }

  const isAuthenticated = await loadCurrentUser();

  if (!isAuthenticated) {
    window.location.href = "../Phase 1/login.html";

    return;
  }

  await loadNotifications();

  await markNotificationsAsRead();
}

// ==================================================
// START
// ==================================================

initializeNotifications();
