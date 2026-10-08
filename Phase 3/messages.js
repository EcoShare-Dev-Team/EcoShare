"use strict";
const conversationList = document.getElementById("conversationList");
const conversationCount = document.getElementById("conversationCount");
const chatEmpty = document.getElementById("chatEmpty");
const chatContent = document.getElementById("chatContent");
const chatUserName = document.getElementById("chatUserName");
const chatResourceName = document.getElementById("chatResourceName");
const chatResourceImage = document.getElementById("chatResourceImage");
const chatResourceHeaderImage = document.getElementById(
  "chatResourceHeaderImage",
);
const chatMessages = document.getElementById("chatMessages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const sendMessageButton = document.getElementById("sendMessageButton");
const messageSelectionToolbar = document.getElementById(
  "messageSelectionToolbar",
);
const selectedMessageCount = document.getElementById("selectedMessageCount");
const cancelMessageSelectionButton = document.getElementById(
  "cancelMessageSelectionButton",
);
const deleteSelectedMessagesButton = document.getElementById(
  "deleteSelectedMessagesButton",
);
const deleteSelectedForEveryoneButton = document.getElementById(
  "deleteSelectedForEveryoneButton",
);
const menuBtn = document.getElementById("menu-btn");
const primaryNavigation = document.getElementById("primary-navigation");
const authNavButton = document.getElementById("authNavButton");
const messagesUnreadBadge = document.getElementById("messagesUnreadBadge");
const newConversationButton = document.getElementById("newConversationButton");
const emptyNewConversationButton = document.getElementById(
  "emptyNewConversationButton",
);
const conversationModal = document.getElementById("conversationModal");
const conversationModalOverlay = document.getElementById(
  "conversationModalOverlay",
);
const closeConversationModalButton = document.getElementById(
  "closeConversationModal",
);
const cancelConversationButton = document.getElementById(
  "cancelConversationButton",
);
const backToConversationsButton = document.getElementById(
  "backToConversationsButton",
);
const conversationForm = document.getElementById("conversationForm");
const resourceSelect = document.getElementById("resourceSelect");
const selectedResourceInfo = document.getElementById("selectedResourceInfo");
const selectedResourceImage = document.getElementById("selectedResourceImage");
const selectedResourceTitle = document.getElementById("selectedResourceTitle");
const selectedResourceOwner = document.getElementById("selectedResourceOwner");
const conversationFormMessage = document.getElementById(
  "conversationFormMessage",
);
const startConversationButton = document.getElementById(
  "startConversationButton",
);

let currentUser = null;
let conversations = [];
let availableResources = [];
let selectedConversation = null;

let selectedConversationIds = new Set();
let conversationSelectionMode = false;
let conversationSelectionToolbar = null;
let selectedConversationCount = null;
let selectAllConversationsButton = null;
let deleteSelectedConversationsButton = null;
let cancelConversationSelectionButton = null;

let conversationActionMenu = null;
let contextConversation = null;

let currentMessages = [];
let selectedMessageIds = new Set();
let messageSelectionMode = false;
let deletedForMeIds = new Set();

let replyingToMessage = null;

let messageActionMenu = null;
let contextMessage = null;

let longPressTimer = null;

let messagesRealtimeChannel = null;
let realtimeStarting = false;

let conversationsLoading = false;
let unreadCountsLoading = false;
let modalLoading = false;

let swipeMessage = null;
let swipeStartX = 0;
let swipeStartY = 0;
let swipeCurrentX = 0;
let swipeTracking = false;
let swipeDirectionLocked = false;

const SWIPE_REPLY_THRESHOLD = 70;
const SWIPE_MAX_DISTANCE = 110;
const SWIPE_DIRECTION_THRESHOLD = 10;

const RESOURCE_FALLBACK_IMAGE = "../assets/logo.png";
const MESSAGE_MAX_LENGTH = 2000;
const ACTION_MENU_WIDTH = 180;
const ACTION_MENU_GAP = 8;
const LONG_PRESS_DURATION = 500;

const PUBLIC_PROFILE_TABLE = "public_profiles";
const PUBLIC_PROFILE_FALLBACK_NAME = "EcoShare User";

function normalizeRpcData(data) {
  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
}

function getConversationById(conversationId) {
  return conversations.find(
    (conversation) => Number(conversation.id) === Number(conversationId),
  );
}

function isConversationSelected(conversationId) {
  return Boolean(
    selectedConversation &&
    Number(selectedConversation.id) === Number(conversationId),
  );
}

function getResourceImage(url) {
  return typeof url === "string" && url.trim()
    ? url.trim()
    : RESOURCE_FALLBACK_IMAGE;
}

function setImageWithFallback(image, url) {
  if (!image) {
    return;
  }

  const source = getResourceImage(url);

  image.src = source || "";

  image.onerror = () => {
    if (RESOURCE_FALLBACK_IMAGE && image.src !== RESOURCE_FALLBACK_IMAGE) {
      image.onerror = null;
      image.src = RESOURCE_FALLBACK_IMAGE;
    }
  };
}

function isConversationMarkedForBulkSelection(conversationId) {
  return selectedConversationIds.has(String(conversationId));
}

async function loadPublicProfiles(userIds) {
  const ids = [
    ...new Set(
      (Array.isArray(userIds) ? userIds : [])
        .filter(Boolean)
        .map((id) => String(id)),
    ),
  ];

  if (!ids.length) {
    return new Map();
  }

  try {
    const { data, error } = await supabaseClient
      .from(PUBLIC_PROFILE_TABLE)
      .select("id, full_name, avatar_url")
      .in("id", ids);

    if (error) {
      console.warn("EcoShare: Unable to load public profiles:", error);
      return new Map();
    }

    const map = new Map();

    (data || []).forEach((profile) => {
      if (!profile?.id) {
        return;
      }

      map.set(String(profile.id), {
        name:
          typeof profile.full_name === "string" && profile.full_name.trim()
            ? profile.full_name.trim()
            : PUBLIC_PROFILE_FALLBACK_NAME,
        avatar:
          typeof profile.avatar_url === "string"
            ? profile.avatar_url.trim()
            : "",
      });
    });

    return map;
  } catch (error) {
    console.warn("EcoShare: Unexpected public-profile lookup error:", error);
    return new Map();
  }
}

function getMessageById(messageId) {
  return currentMessages.find(
    (message) => Number(message.id) === Number(messageId),
  );
}

function upsertCurrentMessage(message) {
  if (!message?.id) {
    return;
  }

  const index = currentMessages.findIndex(
    (item) => Number(item.id) === Number(message.id),
  );

  if (index === -1) {
    currentMessages.push(message);
  } else {
    currentMessages[index] = {
      ...currentMessages[index],
      ...message,
    };
  }

  currentMessages.sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at),
  );
}

function removeCurrentMessage(messageId) {
  currentMessages = currentMessages.filter(
    (message) => Number(message.id) !== Number(messageId),
  );
}

async function checkAuthentication() {
  const {
    data: { session },
    error,
  } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Authentication error:", error);
    redirectToLogin();
    return false;
  }

  if (!session?.user) {
    redirectToLogin();
    return false;
  }

  currentUser = session.user;

  return true;
}

function redirectToLogin() {
  const returnUrl = `${window.location.pathname}${window.location.search}`;

  window.location.href = `../Phase 1/login.html?redirect=${encodeURIComponent(returnUrl)}`;
}

async function updateAuthNavigation() {
  if (!authNavButton) {
    return;
  }

  const {
    data: { session },
    error,
  } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Navigation auth error:", error);
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

    authNavButton.href = "../Phase 1/profile.html";
    authNavButton.setAttribute("aria-label", "Open profile");
  } else {
    authNavButton.innerHTML = `
      <i
        class="fa-solid fa-right-to-bracket"
        aria-hidden="true"
      ></i>
      Login
    `;

    authNavButton.href = "../Phase 1/login.html";
    authNavButton.setAttribute("aria-label", "Login");
  }
}

function updateMessagesUnreadBadge(totalUnread) {
  if (!messagesUnreadBadge) {
    return;
  }

  const safeCount = Math.max(0, Number(totalUnread) || 0);

  if (safeCount > 0) {
    messagesUnreadBadge.textContent =
      safeCount > 99 ? "99+" : String(safeCount);

    messagesUnreadBadge.hidden = false;

    messagesUnreadBadge.setAttribute(
      "aria-label",
      `${safeCount} unread ${safeCount === 1 ? "message" : "messages"}`,
    );
  } else {
    messagesUnreadBadge.hidden = true;
    messagesUnreadBadge.textContent = "";
    messagesUnreadBadge.removeAttribute("aria-label");
  }
}

async function loadUnreadMessageCounts() {
  if (!currentUser || unreadCountsLoading) {
    return;
  }

  unreadCountsLoading = true;

  try {
    const [unreadResult, deletedResult] = await Promise.all([
      supabaseClient
        .from("messages")
        .select(
          `
              id,
              conversation_id,
              sender_id
            `,
        )
        .neq("sender_id", currentUser.id)
        .is("read_at", null),

      supabaseClient.rpc("get_my_deleted_message_ids"),
    ]);

    const { data: unreadData, error: unreadError } = unreadResult;
    const { data: deletedData, error: deletedError } = deletedResult;

    if (unreadError) {
      console.error("Error loading unread messages:", unreadError);
      return;
    }

    if (deletedError) {
      console.error("Error loading messages deleted for me:", deletedError);
    }

    deletedForMeIds = new Set(
      (deletedData || []).map((item) => Number(item.message_id)),
    );

    const visibleUnreadMessages = (unreadData || []).filter(
      (message) => !deletedForMeIds.has(Number(message.id)),
    );

    const unreadMap = new Map();

    visibleUnreadMessages.forEach((message) => {
      const conversationId = message.conversation_id;

      unreadMap.set(conversationId, (unreadMap.get(conversationId) || 0) + 1);
    });

    conversations.forEach((conversation) => {
      conversation.unread_count = unreadMap.get(conversation.id) || 0;
    });

    updateMessagesUnreadBadge(visibleUnreadMessages.length);

    displayConversations();
  } finally {
    unreadCountsLoading = false;
  }
}

async function loadConversations() {
  if (!conversationList || !currentUser || conversationsLoading) {
    return;
  }

  conversationsLoading = true;

  conversationList.innerHTML = `
    <div class="messages-loading">
      <i
        class="fa-solid fa-spinner fa-spin"
        aria-hidden="true"
      ></i>
      <p>Loading conversations...</p>
    </div>
  `;

  try {
    const { data, error } = await supabaseClient
      .from("conversations")
      .select(
        `
            id,
            resource_id,
            borrow_request_id,
            borrower_id,
            owner_id,
            created_at
          `,
      )
      .or(`borrower_id.eq.${currentUser.id},owner_id.eq.${currentUser.id}`)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error("Error loading conversations:", error);

      conversations = [];

      showConversationError();

      updateMessagesUnreadBadge(0);

      return;
    }

    conversations = data || [];

    await enrichConversations();

    displayConversations();

    await loadUnreadMessageCounts();
  } finally {
    conversationsLoading = false;
  }
}

async function enrichConversations() {
  if (!conversations.length) {
    return;
  }

  const resourceIds = [
    ...new Set(
      conversations
        .map((conversation) => conversation.resource_id)
        .filter(Boolean)
        .map((id) => Number(id)),
    ),
  ];

  const resourceMap = new Map();

  if (resourceIds.length) {
    const { data, error } = await supabaseClient
      .from("resource_listings")
      .select("id, title, owner_id, image_url, available")
      .in("id", resourceIds);

    if (error) {
      console.error("EcoShare: Error loading conversation resources:", error);
    } else {
      (data || []).forEach((resource) => {
        resourceMap.set(Number(resource.id), resource);
      });
    }
  }

  const profileIds = [
    ...conversations.flatMap((conversation) => [
      conversation.borrower_id,
      conversation.owner_id,
      resourceMap.get(Number(conversation.resource_id))?.owner_id,
    ]),
  ];

  const profileMap = await loadPublicProfiles(profileIds);

  conversations.forEach((conversation) => {
    const resource = resourceMap.get(Number(conversation.resource_id));

    conversation.resource_title = resource?.title || "Resource";

    conversation.resource_image_url = getResourceImage(resource?.image_url);

    conversation.resource_available = resource?.available ?? false;

    const isBorrower =
      String(conversation.borrower_id) === String(currentUser.id);

    conversation.other_user_id = isBorrower
      ? conversation.owner_id
      : conversation.borrower_id;

    const otherProfile = profileMap.get(String(conversation.other_user_id));

    conversation.other_user_name =
      otherProfile?.name || PUBLIC_PROFILE_FALLBACK_NAME;

    const ownerProfile = profileMap.get(
      String(resource?.owner_id || conversation.owner_id),
    );

    conversation.resource_owner_name =
      ownerProfile?.name || PUBLIC_PROFILE_FALLBACK_NAME;

    conversation.resource_owner_avatar = ownerProfile?.avatar || "";

    conversation.unread_count = Number(conversation.unread_count) || 0;
  });
}

function displayConversations() {
  if (!conversationList) {
    return;
  }

  conversationList.innerHTML = "";

  if (conversationCount) {
    conversationCount.textContent = `${conversations.length} ${
      conversations.length === 1 ? "conversation" : "conversations"
    }`;
  }

  if (conversations.length === 0) {
    const empty = document.createElement("div");

    empty.className = "conversations-empty";

    const icon = document.createElement("i");

    icon.className = "fa-regular fa-comments";

    icon.setAttribute("aria-hidden", "true");

    const text = document.createElement("p");

    text.textContent = "No conversations yet.";

    const button = document.createElement("button");

    button.type = "button";

    button.className = "conversation-empty-btn";

    button.textContent = "Start a conversation";

    button.addEventListener("click", openConversationModal);

    empty.append(icon, text, button);

    conversationList.appendChild(empty);

    updateConversationSelectionToolbar();

    return;
  }

  const fragment = document.createDocumentFragment();

  conversations.forEach((conversation) => {
    const item = document.createElement("button");

    item.type = "button";

    item.className = "conversation-item";

    item.dataset.conversationId = String(conversation.id);

    const unreadCount = Number(conversation.unread_count) || 0;

    const resourceTitle = conversation.resource_title || "Resource";

    const selected = isConversationMarkedForBulkSelection(conversation.id);

    if (isConversationSelected(conversation.id)) {
      item.classList.add("active");

      item.setAttribute("aria-current", "true");
    }

    if (selected) {
      item.classList.add("conversation-bulk-selected");
    }

    item.setAttribute(
      "aria-label",
      conversationSelectionMode
        ? `${
            selected ? "Deselect" : "Select"
          } conversation about ${resourceTitle}`
        : `Open conversation about ${resourceTitle}${
            unreadCount > 0
              ? `, ${unreadCount} unread ${
                  unreadCount === 1 ? "message" : "messages"
                }`
              : ""
          }`,
    );

    if (conversationSelectionMode) {
      const indicator = document.createElement("span");

      indicator.className = "conversation-selection-indicator";

      indicator.setAttribute("aria-hidden", "true");

      indicator.style.width = "25px";

      indicator.style.height = "25px";

      indicator.style.minWidth = "25px";

      indicator.style.maxWidth = "25px";

      indicator.style.flex = "0 0 25px";

      indicator.style.boxSizing = "border-box";

      indicator.style.borderRadius = "6px";

      indicator.style.display = "inline-flex";

      indicator.style.alignItems = "center";

      indicator.style.justifyContent = "center";

      indicator.style.marginRight = "10px";

      indicator.style.border = selected
        ? "2px solid #2e7d32"
        : "2px solid #9aa0a6";

      indicator.style.background = selected ? "#2e7d32" : "#ffffff";

      indicator.style.color = "#ffffff";

      indicator.style.fontSize = "13px";

      indicator.style.pointerEvents = "none";

      if (selected) {
        indicator.innerHTML =
          '<i class="fa-solid fa-check" aria-hidden="true"></i>';
      }

      item.appendChild(indicator);
    }

    const imageWrapper = document.createElement("div");

    imageWrapper.className = "conversation-resource-image";

    const image = document.createElement("img");

    setImageWithFallback(image, conversation.resource_image_url);

    image.alt = resourceTitle;

    image.loading = "lazy";

    image.decoding = "async";

    imageWrapper.appendChild(image);

    const info = document.createElement("div");

    info.className = "conversation-info";

    const userName = document.createElement("span");

    userName.className = "conversation-user";

    userName.textContent =
      conversation.other_user_name || PUBLIC_PROFILE_FALLBACK_NAME;

    const resourceName = document.createElement("span");

    resourceName.className = "conversation-resource";

    resourceName.textContent = resourceTitle;

    info.append(userName, resourceName);

    const rightSide = document.createElement("div");

    rightSide.className = "conversation-item-right";

    if (unreadCount > 0) {
      const badge = document.createElement("span");

      badge.className = "conversation-unread-badge";

      badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);

      rightSide.appendChild(badge);
    }

    const arrow = document.createElement("i");

    arrow.className = "fa-solid fa-chevron-right conversation-arrow";

    arrow.setAttribute("aria-hidden", "true");

    arrow.hidden = conversationSelectionMode;

    rightSide.appendChild(arrow);

    item.append(imageWrapper, info, rightSide);

    item.addEventListener("click", (event) => {
      event.preventDefault();

      if (conversationSelectionMode) {
        toggleConversationSelection(conversation.id);
      } else {
        openConversation(conversation.id);
      }
    });

    fragment.appendChild(item);
  });

  conversationList.appendChild(fragment);

  updateConversationSelectionToolbar();
}

async function loadResourcesForConversation() {
  if (!resourceSelect || !currentUser) {
    return;
  }

  modalLoading = true;

  resourceSelect.disabled = true;

  resourceSelect.innerHTML = `<option value="">Loading resources...</option>`;

  try {
    const { data, error } = await supabaseClient
      .from("resource_listings")
      .select("id, title, owner_id, image_url, available")
      .eq("available", true)
      .neq("owner_id", currentUser.id)
      .order("title", {
        ascending: true,
      });

    if (error) {
      console.error("EcoShare: Error loading resources:", error);

      availableResources = [];

      resourceSelect.innerHTML = `<option value="">Unable to load resources</option>`;

      return;
    }

    const resources = data || [];

    const profileMap = await loadPublicProfiles(
      resources.map((resource) => resource.owner_id),
    );

    availableResources = resources.map((resource) => {
      const profile = profileMap.get(String(resource.owner_id));

      return {
        ...resource,
        owner_name: profile?.name || PUBLIC_PROFILE_FALLBACK_NAME,
        owner_avatar: profile?.avatar || "",
      };
    });

    resourceSelect.innerHTML = `<option value="">Select a resource</option>`;

    if (!availableResources.length) {
      resourceSelect.innerHTML = `<option value="">No available resources</option>`;

      return;
    }

    availableResources.forEach((resource) => {
      const option = document.createElement("option");

      option.value = String(resource.id);

      option.textContent = `${resource.title} — ${resource.owner_name}`;

      resourceSelect.appendChild(option);
    });

    resourceSelect.disabled = false;
  } catch (error) {
    console.error("EcoShare: Unexpected resource-load error:", error);

    availableResources = [];

    resourceSelect.innerHTML = `<option value="">Unable to load resources</option>`;
  } finally {
    modalLoading = false;
  }
}

function updateSelectedResourceInfo() {
  if (!resourceSelect || !selectedResourceInfo) {
    return;
  }

  const resourceId = Number(resourceSelect.value);

  const resource = availableResources.find(
    (item) => Number(item.id) === resourceId,
  );

  if (!resource) {
    selectedResourceInfo.hidden = true;

    return;
  }

  if (selectedResourceImage) {
    selectedResourceImage.src = getResourceImage(resource.image_url);

    selectedResourceImage.alt = resource.title || "Resource";
  }

  if (selectedResourceTitle) {
    selectedResourceTitle.textContent = resource.title || "Resource";
  }

  if (selectedResourceOwner) {
    selectedResourceOwner.textContent = resource.owner_name || "EcoShare User";
  }

  selectedResourceInfo.hidden = false;
}

async function openConversationModal() {
  if (!conversationModal) {
    return;
  }

  if (conversationFormMessage) {
    conversationFormMessage.textContent = "";

    conversationFormMessage.hidden = true;
  }

  conversationForm?.reset();

  if (selectedResourceInfo) {
    selectedResourceInfo.hidden = true;
  }

  conversationModal.hidden = false;

  document.body.classList.add("modal-open");

  await loadResourcesForConversation();
}

function closeConversationModal() {
  if (!conversationModal) {
    return;
  }

  conversationModal.hidden = true;

  document.body.classList.remove("modal-open");

  conversationForm?.reset();

  if (selectedResourceInfo) {
    selectedResourceInfo.hidden = true;
  }

  if (conversationFormMessage) {
    conversationFormMessage.textContent = "";

    conversationFormMessage.hidden = true;
  }

  if (resourceSelect) {
    resourceSelect.disabled = false;
  }
}

function showConversationError() {
  if (!conversationList) {
    return;
  }

  conversationList.innerHTML = `
    <div class="conversations-error">
      <i
        class="fa-solid fa-triangle-exclamation"
        aria-hidden="true"
      ></i>

      <p>
        Unable to load conversations.
      </p>

      <button
        type="button"
        class="conversation-retry-btn"
        id="conversationRetryButton"
      >
        Try again
      </button>
    </div>
  `;

  document
    .getElementById("conversationRetryButton")
    ?.addEventListener("click", loadConversations);
}

function createConversationSelectionToolbar() {
  if (conversationSelectionToolbar || !conversationList?.parentNode) {
    return conversationSelectionToolbar;
  }

  const toolbar = document.createElement("div");

  toolbar.className = "conversation-selection-toolbar";

  toolbar.hidden = true;

  toolbar.setAttribute("role", "toolbar");

  toolbar.setAttribute("aria-label", "Conversation selection controls");

  const info = document.createElement("div");

  info.className = "conversation-selection-info";

  const label = document.createElement("span");

  label.textContent = "Selected:";

  selectedConversationCount = document.createElement("strong");

  selectedConversationCount.textContent = "0";

  info.append(label, selectedConversationCount);

  const controls = document.createElement("div");

  controls.className = "conversation-selection-controls";

  selectAllConversationsButton = document.createElement("button");

  selectAllConversationsButton.type = "button";

  selectAllConversationsButton.className = "conversation-select-all-btn";

  selectAllConversationsButton.addEventListener(
    "click",
    selectAllConversations,
  );

  deleteSelectedConversationsButton = document.createElement("button");

  deleteSelectedConversationsButton.type = "button";

  deleteSelectedConversationsButton.className =
    "conversation-delete-selected-btn";

  deleteSelectedConversationsButton.addEventListener(
    "click",
    deleteSelectedConversations,
  );

  cancelConversationSelectionButton = document.createElement("button");

  cancelConversationSelectionButton.type = "button";

  cancelConversationSelectionButton.className =
    "conversation-selection-cancel-btn";

  cancelConversationSelectionButton.innerHTML = `
    <i
      class="fa-solid fa-xmark"
      aria-hidden="true"
    ></i>
    Cancel
  `;

  cancelConversationSelectionButton.addEventListener(
    "click",
    cancelConversationSelection,
  );

  controls.append(
    selectAllConversationsButton,
    deleteSelectedConversationsButton,
    cancelConversationSelectionButton,
  );

  toolbar.append(info, controls);

  conversationList.parentNode.insertBefore(toolbar, conversationList);

  conversationSelectionToolbar = toolbar;

  return toolbar;
}

function updateConversationSelectionToolbar() {
  const toolbar = createConversationSelectionToolbar();

  if (!toolbar) {
    return;
  }

  const count = selectedConversationIds.size;

  const active = conversationSelectionMode && count > 0;

  toolbar.hidden = !active;

  if (selectedConversationCount) {
    selectedConversationCount.textContent = active ? `${count} selected` : "";
  }

  if (selectAllConversationsButton) {
    const allSelected =
      conversations.length > 0 && count === conversations.length;

    selectAllConversationsButton.innerHTML = allSelected
      ? `
        <i
          class="fa-solid fa-square-minus"
          aria-hidden="true"
        ></i>
        Deselect All
      `
      : `
        <i
          class="fa-solid fa-check-double"
          aria-hidden="true"
        ></i>
        Select All
      `;

    selectAllConversationsButton.disabled = !active;
  }

  if (deleteSelectedConversationsButton) {
    deleteSelectedConversationsButton.disabled = !active;

    deleteSelectedConversationsButton.innerHTML = `
      <i
        class="fa-solid fa-trash"
        aria-hidden="true"
      ></i>
      Delete
    `;
  }
}

function enterConversationSelectionMode(conversationId = null) {
  if (!conversations.length) {
    return;
  }

  conversationSelectionMode = true;

  if (conversationId !== null && conversationId !== undefined) {
    selectedConversationIds.clear();

    selectedConversationIds.add(String(conversationId));
  }

  closeConversationActionMenu();

  updateConversationSelectionToolbar();

  displayConversations();
}

function toggleConversationSelection(conversationId) {
  const id = String(conversationId);

  if (!getConversationById(id)) {
    return;
  }

  if (selectedConversationIds.has(id)) {
    selectedConversationIds.delete(id);
  } else {
    selectedConversationIds.add(id);
  }

  conversationSelectionMode = selectedConversationIds.size > 0;

  updateConversationSelectionToolbar();

  displayConversations();
}

function selectAllConversations() {
  if (!conversations.length) {
    return;
  }

  const allSelected = selectedConversationIds.size === conversations.length;

  if (allSelected) {
    selectedConversationIds.clear();

    conversationSelectionMode = false;
  } else {
    selectedConversationIds = new Set(
      conversations.map((conversation) => String(conversation.id)),
    );

    conversationSelectionMode = true;
  }

  updateConversationSelectionToolbar();

  displayConversations();
}

function cancelConversationSelection() {
  selectedConversationIds.clear();

  conversationSelectionMode = false;

  closeConversationActionMenu();

  updateConversationSelectionToolbar();

  displayConversations();
}

function closeConversationActionMenu() {
  if (conversationActionMenu) {
    conversationActionMenu.remove();

    conversationActionMenu = null;
  }

  contextConversation = null;
}

function positionConversationActionMenu(menu, x, y) {
  if (!menu) {
    return;
  }

  menu.style.position = "fixed";

  menu.style.zIndex = "9999";

  const rect = menu.getBoundingClientRect();

  const width = rect.width || 180;

  const height = rect.height || 140;

  let left = Number(x) || 0;

  let top = Number(y) || 0;

  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));

  top = Math.max(8, Math.min(top, window.innerHeight - height - 8));

  menu.style.left = `${left}px`;

  menu.style.top = `${top}px`;
}

function createConversationActionButton(icon, label) {
  const button = document.createElement("button");

  button.type = "button";

  button.className = "conversation-action-item";

  button.style.width = "100%";

  button.style.display = "flex";

  button.style.alignItems = "center";

  button.style.gap = "10px";

  button.style.padding = "10px 12px";

  button.style.border = "0";

  button.style.background = "transparent";

  button.style.cursor = "pointer";

  button.style.textAlign = "left";

  button.innerHTML = `
    <i
      class="${icon}"
      aria-hidden="true"
    ></i>
    <span>${label}</span>
  `;

  return button;
}

function openConversationActionMenu(conversation, x, y) {
  if (!conversation) {
    return;
  }

  closeConversationActionMenu();

  contextConversation = conversation;

  const menu = document.createElement("div");

  menu.className = "conversation-action-menu";

  menu.setAttribute("role", "menu");

  menu.style.position = "fixed";

  menu.style.minWidth = "180px";

  menu.style.padding = "6px";

  menu.style.background = "#ffffff";

  menu.style.border = "1px solid #e0e0e0";

  menu.style.borderRadius = "10px";

  menu.style.boxShadow = "0 10px 30px rgba(0,0,0,0.15)";

  const selectButton = createConversationActionButton(
    "fa-regular fa-square-check",
    "Select",
  );

  selectButton.addEventListener("click", () => {
    enterConversationSelectionMode(conversation.id);
  });

  const deleteButton = createConversationActionButton(
    "fa-solid fa-trash",
    "Delete",
  );

  deleteButton.addEventListener("click", async () => {
    closeConversationActionMenu();

    await deleteConversationsByIds([conversation.id], false);
  });

  const cancelButton = createConversationActionButton(
    "fa-solid fa-xmark",
    "Cancel",
  );

  cancelButton.addEventListener("click", closeConversationActionMenu);

  menu.append(selectButton, deleteButton, cancelButton);

  document.body.appendChild(menu);

  conversationActionMenu = menu;

  positionConversationActionMenu(menu, x, y);
}

async function deleteConversationsByIds(conversationIds, fromSelection = true) {
  const ids = [
    ...new Set(
      (Array.isArray(conversationIds) ? conversationIds : [])
        .filter(Boolean)
        .map((id) => String(id)),
    ),
  ];

  if (!ids.length || !currentUser) {
    return false;
  }

  const confirmed = window.confirm(
    `Delete ${ids.length} ${
      ids.length === 1 ? "conversation" : "conversations"
    }? This action cannot be undone.`,
  );

  if (!confirmed) {
    return false;
  }

  if (deleteSelectedConversationsButton) {
    deleteSelectedConversationsButton.disabled = true;

    deleteSelectedConversationsButton.innerHTML = `
      <i
        class="fa-solid fa-spinner fa-spin"
        aria-hidden="true"
      ></i>
      Deleting...
    `;
  }

  const activeWasDeleted =
    selectedConversation && ids.includes(String(selectedConversation.id));

  try {
    const { error } = await supabaseClient
      .from("conversations")
      .delete()
      .in("id", ids);

    if (error) {
      console.error("EcoShare: Unable to delete conversations:", error);

      alert(
        error.message ||
          "Unable to delete the selected conversation(s). Check your database permissions.",
      );

      return false;
    }

    conversations = conversations.filter(
      (conversation) => !ids.includes(String(conversation.id)),
    );

    selectedConversationIds.clear();

    conversationSelectionMode = false;

    if (activeWasDeleted) {
      closeCurrentConversation();
    } else {
      displayConversations();
    }

    updateConversationSelectionToolbar();

    await loadUnreadMessageCounts();

    return true;
  } catch (error) {
    console.error("EcoShare: Unexpected conversation-delete error:", error);

    alert("Something went wrong while deleting the conversation(s).");

    return false;
  } finally {
    if (deleteSelectedConversationsButton) {
      deleteSelectedConversationsButton.disabled = false;
    }

    updateConversationSelectionToolbar();
  }
}

async function deleteSelectedConversations() {
  if (!selectedConversationIds.size) {
    return;
  }

  await deleteConversationsByIds([...selectedConversationIds], true);
}

if (conversationList) {
  conversationList.addEventListener("contextmenu", (event) => {
    const item = event.target.closest(".conversation-item");

    if (!item || !conversationList.contains(item)) {
      return;
    }

    event.preventDefault();

    event.stopPropagation();

    if (conversationSelectionMode) {
      return;
    }

    const conversation = getConversationById(item.dataset.conversationId);

    if (!conversation) {
      return;
    }

    openConversationActionMenu(conversation, event.clientX, event.clientY);
  });
}

async function openConversation(conversationId) {
  const conversation = getConversationById(conversationId);

  if (!conversation) {
    return;
  }

  /*
   * Leaving conversation-selection mode
   * before opening a conversation.
   */
  selectedConversationIds.clear();

  conversationSelectionMode = false;

  updateConversationSelectionToolbar();

  closeConversationActionMenu();

  selectedConversation = conversation;

  currentMessages = [];

  deletedForMeIds = new Set();

  clearReplyState();

  closeMessageActionMenu();

  if (chatEmpty) {
    chatEmpty.hidden = true;
  }

  if (chatContent) {
    chatContent.hidden = false;
  }

  updateConversationHeader(conversation);

  displayConversations();

  await loadMessages(conversation.id);

  await markConversationAsRead(conversation.id);

  await loadUnreadMessageCounts();
}

function closeCurrentConversation() {
  selectedConversation = null;

  selectedConversationIds.clear();

  conversationSelectionMode = false;

  selectedMessageIds.clear();

  messageSelectionMode = false;

  currentMessages = [];

  replyingToMessage = null;

  closeMessageActionMenu();

  clearLongPressTimer();

  resetSwipeMessage();

  if (chatContent) {
    chatContent.hidden = true;
  }

  if (chatEmpty) {
    chatEmpty.hidden = false;
  }

  displayConversations();
}

if (backToConversationsButton) {
  backToConversationsButton.addEventListener("click", closeCurrentConversation);
}

function updateConversationHeader(conversation) {
  if (chatUserName) {
    chatUserName.textContent = conversation.other_user_name || "EcoShare User";
  }

  if (chatResourceName) {
    chatResourceName.textContent = conversation.resource_title || "Resource";
  }

  const imageUrl = getResourceImage(conversation.resource_image_url);

  if (chatResourceImage) {
    chatResourceImage.src = imageUrl;

    chatResourceImage.alt = conversation.resource_title || "Resource";
  }

  if (chatResourceHeaderImage) {
    chatResourceHeaderImage.src = imageUrl;

    chatResourceHeaderImage.alt = conversation.resource_title || "Resource";
  }
}

async function loadMessages(conversationId) {
  if (!chatMessages || !currentUser) {
    return;
  }

  chatMessages.innerHTML = `
    <div class="messages-loading">
      <i
        class="fa-solid fa-spinner fa-spin"
        aria-hidden="true"
      ></i>

      <p>Loading messages...</p>
    </div>
  `;

  const { data, error } = await supabaseClient
    .from("messages")
    .select(
      `
          id,
          conversation_id,
          sender_id,
          message,
          created_at,
          read_at,
          reply_to_message_id,
          is_pinned,
          deleted_at
        `,
    )
    .eq("conversation_id", conversationId)
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    console.error("Error loading messages:", error);

    chatMessages.innerHTML = `
      <div class="messages-error">
        <i
          class="fa-solid fa-triangle-exclamation"
          aria-hidden="true"
        ></i>

        <p>
          Unable to load messages.
        </p>
      </div>
    `;

    return;
  }

  const { data: deletedForMe, error: deletedForMeError } =
    await supabaseClient.rpc("get_my_deleted_message_ids");

  if (deletedForMeError) {
    console.error("Error loading messages deleted for me:", deletedForMeError);
  }

  deletedForMeIds = new Set(
    (deletedForMe || []).map((item) => Number(item.message_id)),
  );

  currentMessages = (data || []).filter(
    (message) => !deletedForMeIds.has(Number(message.id)),
  );

  displayMessages(currentMessages);
}

function formatMessageTime(timestamp) {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getReplyPreviewText(message) {
  if (!message) {
    return "";
  }

  if (message.deleted_at) {
    return "This message was deleted";
  }

  const text = String(message.message || "").trim();

  if (!text) {
    return "Message";
  }

  if (text.length <= 100) {
    return text;
  }

  return `${text.slice(0, 97)}...`;
}

function getRepliedMessage(message) {
  if (!message || !message.reply_to_message_id) {
    return null;
  }

  return getMessageById(message.reply_to_message_id);
}

function displayMessages(messageList) {
  if (!chatMessages) {
    return;
  }

  currentMessages = Array.isArray(messageList) ? messageList : [];

  chatMessages.innerHTML = "";

  if (currentMessages.length === 0) {
    chatMessages.innerHTML = `
      <div class="messages-empty">
        <i
          class="fa-regular fa-comments"
          aria-hidden="true"
        ></i>

        <p>No messages yet.</p>

        <span>
          Start the conversation.
        </span>
      </div>
    `;

    return;
  }

  const fragment = document.createDocumentFragment();

  currentMessages.forEach((message) => {
    const isSent = String(message.sender_id) === String(currentUser?.id);

    const row = document.createElement("div");

    row.className = `message-row ${isSent ? "sent" : "received"}`;

    row.dataset.messageId = String(message.id);

    if (messageSelectionMode) {
      const selectionCheckbox = document.createElement("button");

      const selected = selectedMessageIds.has(Number(message.id));

      selectionCheckbox.type = "button";

      selectionCheckbox.className = "message-selection-checkbox";

      selectionCheckbox.setAttribute(
        "aria-label",
        selected ? "Deselect message" : "Select message",
      );

      selectionCheckbox.style.width = "25px";

      selectionCheckbox.style.height = "25px";

      selectionCheckbox.style.minWidth = "25px";

      selectionCheckbox.style.maxWidth = "25px";

      selectionCheckbox.style.flex = "0 0 25px";

      selectionCheckbox.style.boxSizing = "border-box";

      selectionCheckbox.style.borderRadius = "6px";

      selectionCheckbox.style.display = "inline-flex";

      selectionCheckbox.style.alignItems = "center";

      selectionCheckbox.style.justifyContent = "center";

      selectionCheckbox.style.padding = "0";

      selectionCheckbox.style.margin = "0 8px";

      selectionCheckbox.style.cursor = "pointer";

      selectionCheckbox.style.background = selected ? "#2e7d32" : "#ffffff";

      selectionCheckbox.style.border = selected
        ? "2px solid #2e7d32"
        : "2px solid #9aa0a6";

      selectionCheckbox.style.color = "#ffffff";

      selectionCheckbox.style.fontSize = "13px";

      if (selected) {
        selectionCheckbox.innerHTML =
          '<i class="fa-solid fa-check" aria-hidden="true"></i>';

        row.classList.add("message-selected");
      } else {
        row.classList.remove("message-selected");
      }

      selectionCheckbox.addEventListener("click", (event) => {
        event.preventDefault();

        event.stopPropagation();

        toggleMessageSelection(message.id);
      });

      row.appendChild(selectionCheckbox);
    }

    row.dataset.messageText = message.deleted_at ? "" : message.message || "";

    const bubble = document.createElement("div");

    bubble.className = "message-bubble";

    const repliedMessage = getRepliedMessage(message);

    if (repliedMessage) {
      const replyQuote = document.createElement("div");

      replyQuote.className = "message-reply-quote";

      const replyIcon = document.createElement("i");

      replyIcon.className = "fa-solid fa-reply";

      replyIcon.setAttribute("aria-hidden", "true");

      const replyText = document.createElement("span");

      replyText.textContent = getReplyPreviewText(repliedMessage);

      replyQuote.appendChild(replyIcon);

      replyQuote.appendChild(replyText);

      bubble.appendChild(replyQuote);
    }

    const text = document.createElement("div");

    text.className = "message-text";

    if (message.deleted_at) {
      text.textContent = "This message was deleted";

      text.classList.add("message-deleted");
    } else {
      text.textContent = message.message || "";
    }

    bubble.appendChild(text);

    if (message.is_pinned) {
      const pinnedIndicator = document.createElement("span");

      pinnedIndicator.className = "message-pinned-indicator";

      pinnedIndicator.innerHTML = `
          <i
            class="fa-solid fa-thumbtack"
            aria-hidden="true"
          ></i>
          <span>Pinned</span>
        `;

      bubble.appendChild(pinnedIndicator);
    }

    const time = document.createElement("span");

    time.className = "message-time";

    time.textContent = formatMessageTime(message.created_at);

    bubble.appendChild(time);

    row.appendChild(bubble);

    fragment.appendChild(row);
  });

  chatMessages.appendChild(fragment);

  attachMessageActionHandlers();

  scrollMessagesToBottom();
}

function scrollMessagesToBottom() {
  if (!chatMessages) {
    return;
  }

  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

function clearReplyState() {
  replyingToMessage = null;

  updateReplyPreview();
}

function setReplyMessage(message) {
  if (!message?.id) {
    return;
  }

  replyingToMessage = message;

  updateReplyPreview();

  messageInput?.focus();
}

function updateReplyPreview() {
  const existingPreview = document.getElementById("messageReplyPreview");

  existingPreview?.remove();

  if (!replyingToMessage || !messageForm) {
    return;
  }

  const preview = document.createElement("div");

  preview.id = "messageReplyPreview";

  preview.className = "message-reply-preview";

  const content = document.createElement("div");

  content.className = "message-reply-preview-content";

  const title = document.createElement("span");

  title.className = "message-reply-preview-title";

  title.textContent = "Replying to";

  const text = document.createElement("span");

  text.className = "message-reply-preview-text";

  text.textContent = getReplyPreviewText(replyingToMessage);

  content.appendChild(title);

  content.appendChild(text);

  const close = document.createElement("button");

  close.type = "button";

  close.className = "message-reply-preview-close";

  close.setAttribute("aria-label", "Cancel reply");

  close.innerHTML = `
    <i
      class="fa-solid fa-xmark"
      aria-hidden="true"
    ></i>
  `;

  close.addEventListener("click", clearReplyState);

  preview.appendChild(content);

  preview.appendChild(close);

  messageForm.prepend(preview);
}

function closeMessageActionMenu() {
  if (messageActionMenu) {
    messageActionMenu.remove();

    messageActionMenu = null;
  }

  contextMessage = null;
}

function createActionButton(iconClass, label) {
  const button = document.createElement("button");

  button.type = "button";

  button.className = "message-action-item";

  button.setAttribute("role", "menuitem");

  button.innerHTML = `
    <i
      class="${iconClass}"
      aria-hidden="true"
    ></i>
    <span>${label}</span>
  `;

  return button;
}

function createMessageActionMenu(message) {
  closeMessageActionMenu();

  if (!message || !currentUser) {
    return null;
  }

  const menu = document.createElement("div");

  menu.className = "message-action-menu";

  menu.setAttribute("role", "menu");

  const replyButton = createActionButton("fa-solid fa-reply", "Reply");

  replyButton.addEventListener("click", () => {
    setReplyMessage(message);

    closeMessageActionMenu();
  });

  menu.appendChild(replyButton);

  if (!messageSelectionMode) {
    const selectButton = createActionButton(
      "fa-regular fa-square-check",
      "Select",
    );

    selectButton.addEventListener("click", () => {
      enterMessageSelectionMode(message);

      closeMessageActionMenu();
    });

    menu.appendChild(selectButton);
  }

  const copyButton = createActionButton("fa-solid fa-copy", "Copy");

  copyButton.addEventListener("click", async () => {
    try {
      if (!message.deleted_at && message.message) {
        await navigator.clipboard.writeText(message.message);
      }
    } catch (error) {
      console.error("Failed to copy message:", error);
    } finally {
      closeMessageActionMenu();
    }
  });

  menu.appendChild(copyButton);

  const pinButton = createActionButton(
    "fa-solid fa-thumbtack",
    message.is_pinned ? "Unpin" : "Pin",
  );

  pinButton.addEventListener("click", async () => {
    pinButton.disabled = true;

    try {
      const { data, error } = await supabaseClient.rpc("toggle_message_pin", {
        p_message_id: message.id,
      });

      if (error) {
        console.error("Error toggling pin:", error);

        alert(error.message || "Unable to update message pin.");

        return;
      }

      const updatedMessage = normalizeRpcData(data);

      if (!updatedMessage) {
        return;
      }

      upsertCurrentMessage(updatedMessage);

      displayMessages(currentMessages);
    } catch (error) {
      console.error("Unexpected pin error:", error);

      alert("Something went wrong while updating the message.");
    } finally {
      closeMessageActionMenu();
    }
  });

  menu.appendChild(pinButton);

  const infoButton = createActionButton("fa-solid fa-circle-info", "Info");

  infoButton.addEventListener("click", () => {
    const createdAt = message.created_at ? new Date(message.created_at) : null;

    const readAt = message.read_at ? new Date(message.read_at) : null;

    const sentText =
      createdAt && !Number.isNaN(createdAt.getTime())
        ? createdAt.toLocaleString()
        : "Unknown";

    const readText =
      readAt && !Number.isNaN(readAt.getTime())
        ? readAt.toLocaleString()
        : "Not read yet";

    alert(`Message Info\n\n` + `Sent: ${sentText}\n` + `Read: ${readText}`);

    closeMessageActionMenu();
  });

  menu.appendChild(infoButton);

  const deleteLabel = message.deleted_at
    ? "Delete"
    : String(message.sender_id) === String(currentUser.id)
      ? "Delete for me"
      : "Delete";

  const deleteForMeButton = createActionButton(
    "fa-solid fa-trash",
    deleteLabel,
  );

  deleteForMeButton.addEventListener("click", async () => {
    deleteForMeButton.disabled = true;

    try {
      const { data, error } = await supabaseClient.rpc(
        "delete_message_for_me",
        {
          p_message_id: message.id,
        },
      );

      if (error) {
        console.error("Error deleting message for me:", error);

        alert(error.message || "Unable to delete message.");

        return;
      }

      const deletedRecord = normalizeRpcData(data);

      if (!deletedRecord) {
        console.error("No deletion record returned.");

        return;
      }

      deletedForMeIds.add(Number(message.id));

      removeCurrentMessage(message.id);

      displayMessages(currentMessages);
    } catch (error) {
      console.error("Unexpected delete-for-me error:", error);

      alert("Something went wrong while deleting the message.");
    } finally {
      closeMessageActionMenu();
    }
  });

  menu.appendChild(deleteForMeButton);

  if (
    String(message.sender_id) === String(currentUser.id) &&
    !message.deleted_at
  ) {
    const deleteForEveryoneButton = createActionButton(
      "fa-solid fa-trash-can",
      "Delete for everyone",
    );

    deleteForEveryoneButton.addEventListener("click", async () => {
      deleteForEveryoneButton.disabled = true;

      try {
        const { data, error } = await supabaseClient.rpc(
          "delete_conversation_message",
          {
            p_message_id: message.id,
          },
        );

        if (error) {
          console.error("Error deleting message for everyone:", error);

          alert(error.message || "Unable to delete message for everyone.");

          return;
        }

        const deletedMessage = normalizeRpcData(data);

        if (!deletedMessage) {
          return;
        }

        upsertCurrentMessage(deletedMessage);

        displayMessages(currentMessages);
      } catch (error) {
        console.error("Unexpected delete-for-everyone error:", error);

        alert("Something went wrong while deleting the message.");
      } finally {
        closeMessageActionMenu();
      }
    });

    menu.appendChild(deleteForEveryoneButton);
  }

  return menu;
}

function positionMessageActionMenu(menu, x, y) {
  if (!menu) {
    return;
  }

  menu.style.position = "fixed";

  const rect = menu.getBoundingClientRect();

  const menuWidth = rect.width || ACTION_MENU_WIDTH;

  const menuHeight = rect.height || 250;

  let left = x;

  let top = y;

  if (left + menuWidth > window.innerWidth - 8) {
    left = window.innerWidth - menuWidth - 8;
  }

  if (left < 8) {
    left = 8;
  }

  if (top + menuHeight > window.innerHeight - 8) {
    top = window.innerHeight - menuHeight - 8;
  }

  if (top < 8) {
    top = 8;
  }

  menu.style.left = `${left}px`;

  menu.style.top = `${top}px`;
}

function openMessageActionMenu(message, x, y) {
  if (!message || !currentUser) {
    return;
  }

  closeMessageActionMenu();

  contextMessage = message;

  const menu = createMessageActionMenu(message);

  if (!menu) {
    return;
  }

  document.body.appendChild(menu);

  messageActionMenu = menu;

  const rect = chatMessages
    ?.querySelector(`[data-message-id="${message.id}"] .message-bubble`)
    ?.getBoundingClientRect();

  let menuX = x;
  let menuY = y;

  if (rect) {
    const isSent = String(message.sender_id) === String(currentUser.id);

    menuX = isSent
      ? rect.left - ACTION_MENU_WIDTH - ACTION_MENU_GAP
      : rect.right + ACTION_MENU_GAP;

    menuY = rect.top;
  }

  positionMessageActionMenu(menu, menuX, menuY);
}

function clearLongPressTimer() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);

    longPressTimer = null;
  }
}

function attachMessageActionHandlers() {
  if (!chatMessages) {
    return;
  }

  const rows = chatMessages.querySelectorAll(".message-row");

  rows.forEach((row) => {
    const messageId = Number(row.dataset.messageId);

    const message = getMessageById(messageId);

    if (!message) {
      return;
    }

    if (messageSelectionMode) {
      row.addEventListener("click", (event) => {
        if (event.target.closest(".message-action-menu")) {
          return;
        }

        toggleMessageSelection(message.id);
      });
    }

    row.addEventListener("contextmenu", (event) => {
      if (messageSelectionMode) {
        event.preventDefault();
        return;
      }

      event.preventDefault();

      const bubble = row.querySelector(".message-bubble");

      if (!bubble) {
        return;
      }

      const rect = bubble.getBoundingClientRect();

      const isSent = String(message.sender_id) === String(currentUser?.id);

      const x = isSent
        ? rect.left - ACTION_MENU_WIDTH - ACTION_MENU_GAP
        : rect.right + ACTION_MENU_GAP;

      openMessageActionMenu(message, x, rect.top);
    });

    row.addEventListener(
      "touchstart",
      (event) => {
        if (messageSelectionMode) {
          return;
        }

        if (!event.touches || event.touches.length !== 1) {
          return;
        }

        clearLongPressTimer();

        const touch = event.touches[0];

        longPressTimer = window.setTimeout(() => {
          openMessageActionMenu(message, touch.clientX, touch.clientY);
        }, LONG_PRESS_DURATION);
      },
      {
        passive: true,
      },
    );

    row.addEventListener("touchend", clearLongPressTimer, {
      passive: true,
    });

    row.addEventListener("touchmove", clearLongPressTimer, {
      passive: true,
    });

    row.addEventListener("touchcancel", clearLongPressTimer, {
      passive: true,
    });
  });
}

function toggleMessageSelection(messageId) {
  const id = Number(messageId);

  if (!id) {
    return;
  }

  const message = getMessageById(id);

  if (!message) {
    return;
  }

  if (selectedMessageIds.has(id)) {
    selectedMessageIds.delete(id);
  } else {
    selectedMessageIds.add(id);
  }

  /*
   * If nothing remains selected,
   * completely leave selection mode.
   */
  if (selectedMessageIds.size === 0) {
    messageSelectionMode = false;
  } else {
    messageSelectionMode = true;
  }

  displayMessages(currentMessages);

  updateMessageSelectionToolbar();
}

function enterMessageSelectionMode(message) {
  if (!message?.id) {
    return;
  }

  messageSelectionMode = true;

  selectedMessageIds.clear();

  selectedMessageIds.add(Number(message.id));

  closeMessageActionMenu();

  displayMessages(currentMessages);

  updateMessageSelectionToolbar();
}

function canDeleteSelectedForEveryone() {
  if (!currentUser || selectedMessageIds.size === 0) {
    return false;
  }

  const selectedMessages = currentMessages.filter((message) =>
    selectedMessageIds.has(Number(message.id)),
  );

  // Every selected message must actually exist.
  if (selectedMessages.length !== selectedMessageIds.size) {
    return false;
  }

  // EVERY selected message must:
  // 1. Be sent by the current user
  // 2. Not already be deleted
  return selectedMessages.every(
    (message) =>
      String(message.sender_id) === String(currentUser.id) &&
      !message.deleted_at,
  );
}

function cancelMessageSelection() {
  selectedMessageIds.clear();

  messageSelectionMode = false;

  displayMessages(currentMessages);

  updateMessageSelectionToolbar();
}

function updateMessageSelectionToolbar() {
  if (!messageSelectionToolbar) {
    return;
  }

  const count = selectedMessageIds.size;

  const active = messageSelectionMode && count > 0;

  if (!active) {
    messageSelectionToolbar.hidden = true;

    if (selectedMessageCount) {
      selectedMessageCount.textContent = "";
    }

    if (deleteSelectedMessagesButton) {
      deleteSelectedMessagesButton.disabled = true;
    }

    if (deleteSelectedForEveryoneButton) {
      deleteSelectedForEveryoneButton.hidden = true;
      deleteSelectedForEveryoneButton.disabled = true;
      deleteSelectedForEveryoneButton.style.display = "none";
    }

    return;
  }

  messageSelectionToolbar.hidden = false;

  if (selectedMessageCount) {
    selectedMessageCount.textContent = `${count} ${
      count === 1 ? "message" : "messages"
    } selected`;
  }

  /*
   * DELETE FOR ME
   * Always available when something is selected.
   */
  if (deleteSelectedMessagesButton) {
    deleteSelectedMessagesButton.disabled = false;

    deleteSelectedMessagesButton.innerHTML = `
      <i
        class="fa-solid fa-trash"
        aria-hidden="true"
      ></i>
      Delete for me
    `;
  }

  /*
   * DELETE FOR EVERYONE
   *
   * Only show when ALL selected messages:
   * - belong to current user
   * - are not already deleted
   */
  const canDeleteEveryone = canDeleteSelectedForEveryone();

  if (deleteSelectedForEveryoneButton) {
    deleteSelectedForEveryoneButton.hidden = !canDeleteEveryone;
    deleteSelectedForEveryoneButton.disabled = !canDeleteEveryone;

    deleteSelectedForEveryoneButton.style.display = canDeleteEveryone
      ? ""
      : "none";

    deleteSelectedForEveryoneButton.innerHTML = `
    <i
      class="fa-solid fa-trash-can"
      aria-hidden="true"
    ></i>
    Delete for everyone
  `;
  }
}

if (cancelMessageSelectionButton) {
  cancelMessageSelectionButton.addEventListener(
    "click",
    cancelMessageSelection,
  );
}

async function deleteSelectedMessages() {
  if (!currentUser || selectedMessageIds.size === 0) {
    return;
  }

  const selectedIds = [...selectedMessageIds];

  const confirmed = window.confirm(
    `Delete ${selectedIds.length} ${
      selectedIds.length === 1 ? "message" : "messages"
    } for you?`,
  );

  if (!confirmed) {
    return;
  }

  if (deleteSelectedMessagesButton) {
    deleteSelectedMessagesButton.disabled = true;
  }

  try {
    for (const messageId of selectedIds) {
      const { error } = await supabaseClient.rpc("delete_message_for_me", {
        p_message_id: messageId,
      });

      if (error) {
        throw error;
      }

      deletedForMeIds.add(Number(messageId));

      removeCurrentMessage(messageId);
    }

    selectedMessageIds.clear();

    messageSelectionMode = false;

    displayMessages(currentMessages);

    updateMessageSelectionToolbar();

    await loadUnreadMessageCounts();
  } catch (error) {
    console.error("EcoShare: Bulk delete-for-me failed:", error);

    alert(error.message || "Unable to delete selected messages.");
  } finally {
    if (deleteSelectedMessagesButton) {
      deleteSelectedMessagesButton.disabled = false;
    }
  }
}

async function deleteSelectedMessagesForEveryone() {
  if (!currentUser || selectedMessageIds.size === 0) {
    return;
  }

  if (!canDeleteSelectedForEveryone()) {
    updateMessageSelectionToolbar();

    return;
  }

  const selectedIds = [...selectedMessageIds];

  const confirmed = window.confirm(
    `Delete ${selectedIds.length} ${
      selectedIds.length === 1 ? "message" : "messages"
    } for everyone?`,
  );

  if (!confirmed) {
    return;
  }

  if (deleteSelectedForEveryoneButton) {
    deleteSelectedForEveryoneButton.disabled = true;
  }

  try {
    for (const messageId of selectedIds) {
      const { data, error } = await supabaseClient.rpc(
        "delete_conversation_message",
        {
          p_message_id: messageId,
        },
      );

      if (error) {
        throw error;
      }

      const deletedMessage = normalizeRpcData(data);

      if (deletedMessage) {
        upsertCurrentMessage(deletedMessage);
      } else {
        const existing = getMessageById(messageId);

        if (existing) {
          upsertCurrentMessage({
            ...existing,
            deleted_at: new Date().toISOString(),
          });
        }
      }
    }

    selectedMessageIds.clear();

    messageSelectionMode = false;

    displayMessages(currentMessages);

    updateMessageSelectionToolbar();

    await loadUnreadMessageCounts();
  } catch (error) {
    console.error("EcoShare: Bulk delete-for-everyone failed:", error);

    alert(error.message || "Unable to delete selected messages for everyone.");
  } finally {
    if (deleteSelectedForEveryoneButton) {
      deleteSelectedForEveryoneButton.disabled = false;
    }
  }
}

if (deleteSelectedMessagesButton) {
  deleteSelectedMessagesButton.addEventListener(
    "click",
    deleteSelectedMessages,
  );
}

if (deleteSelectedForEveryoneButton) {
  deleteSelectedForEveryoneButton.addEventListener(
    "click",
    deleteSelectedMessagesForEveryone,
  );
}

async function markConversationAsRead(conversationId) {
  if (!currentUser || !conversationId) {
    return;
  }

  const { error } = await supabaseClient.rpc(
    "mark_conversation_messages_read",
    {
      p_conversation_id: conversationId,
    },
  );

  if (error) {
    console.error("Error marking messages as read:", error);
  }
}

async function sendMessage() {
  if (!currentUser || !selectedConversation || !messageInput) {
    return;
  }

  const message = messageInput.value.trim();

  if (!message) {
    return;
  }

  if (message.length > MESSAGE_MAX_LENGTH) {
    alert(`Message cannot exceed ${MESSAGE_MAX_LENGTH} characters.`);

    return;
  }

  if (sendMessageButton) {
    sendMessageButton.disabled = true;
  }

  const replyToId = replyingToMessage ? replyingToMessage.id : null;

  try {
    const { data, error } = await supabaseClient.rpc(
      "send_conversation_message",
      {
        p_conversation_id: selectedConversation.id,

        p_message: message,

        p_reply_to_message_id: replyToId,
      },
    );

    if (error) {
      console.error("Error sending message:", error);

      alert(error.message || "Unable to send message.");

      return;
    }

    messageInput.value = "";

    clearReplyState();

    const newMessage = normalizeRpcData(data);

    if (newMessage) {
      upsertCurrentMessage(newMessage);

      displayMessages(currentMessages);
    }
  } catch (error) {
    console.error("Unexpected send-message error:", error);

    alert("Something went wrong while sending the message.");
  } finally {
    if (sendMessageButton) {
      sendMessageButton.disabled = false;
    }
  }
}

if (messageForm) {
  messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    await sendMessage();
  });
}

if (messageInput) {
  messageInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      await sendMessage();
    }
  });

  messageInput.addEventListener("input", () => {
    messageInput.style.height = "auto";

    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 130)}px`;
  });
}

if (resourceSelect) {
  resourceSelect.addEventListener("change", updateSelectedResourceInfo);
}

if (newConversationButton) {
  newConversationButton.addEventListener("click", openConversationModal);
}

if (emptyNewConversationButton) {
  emptyNewConversationButton.addEventListener("click", openConversationModal);
}

if (closeConversationModalButton) {
  closeConversationModalButton.addEventListener(
    "click",
    closeConversationModal,
  );
}

if (cancelConversationButton) {
  cancelConversationButton.addEventListener("click", closeConversationModal);
}

if (conversationModalOverlay) {
  conversationModalOverlay.addEventListener("click", closeConversationModal);
}

if (conversationForm) {
  conversationForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser) {
      return;
    }

    const resourceId = Number(resourceSelect?.value);

    if (!resourceId) {
      if (conversationFormMessage) {
        conversationFormMessage.textContent = "Please select a resource.";

        conversationFormMessage.hidden = false;
      }

      return;
    }

    const resource = availableResources.find(
      (item) => Number(item.id) === resourceId,
    );

    if (!resource) {
      return;
    }

    if (startConversationButton) {
      startConversationButton.disabled = true;
    }

    try {
      const { data, error } = await supabaseClient
        .from("conversations")
        .insert({
          resource_id: resource.id,

          borrower_id: currentUser.id,

          owner_id: resource.owner_id,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating conversation:", error);

        if (conversationFormMessage) {
          conversationFormMessage.textContent =
            error.code === "23505"
              ? "You already have a conversation about this resource."
              : error.message || "Unable to start conversation.";

          conversationFormMessage.hidden = false;
        }

        return;
      }

      closeConversationModal();

      await loadConversations();

      if (data?.id) {
        await openConversation(data.id);
      }
    } catch (error) {
      console.error("Unexpected conversation creation error:", error);

      if (conversationFormMessage) {
        conversationFormMessage.textContent =
          "Something went wrong while starting the conversation.";

        conversationFormMessage.hidden = false;
      }
    } finally {
      if (startConversationButton) {
        startConversationButton.disabled = false;
      }
    }
  });
}

async function startMessagesRealtime() {
  if (!currentUser || realtimeStarting || messagesRealtimeChannel) {
    return;
  }

  realtimeStarting = true;

  try {
    messagesRealtimeChannel = supabaseClient
      .channel(`messages-${currentUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        async (payload) => {
          await handleRealtimeNewMessage(payload.new);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
        },
        async (payload) => {
          await handleRealtimeMessageUpdate(payload.new);
        },
      )
      .subscribe((status) => {
        console.log("Messages realtime status:", status);
      });
  } catch (error) {
    console.error("Unable to start messages realtime:", error);

    messagesRealtimeChannel = null;
  } finally {
    realtimeStarting = false;
  }
}

async function handleRealtimeNewMessage(newMessage) {
  if (!newMessage || !currentUser) {
    return;
  }

  const conversationId = newMessage.conversation_id;

  const conversation = getConversationById(conversationId);

  if (!conversation) {
    await loadConversations();

    return;
  }

  if (deletedForMeIds.has(Number(newMessage.id))) {
    return;
  }

  const isCurrentConversation =
    selectedConversation &&
    Number(selectedConversation.id) === Number(conversationId);

  if (isCurrentConversation) {
    const alreadyExists = currentMessages.some(
      (message) => Number(message.id) === Number(newMessage.id),
    );

    if (!alreadyExists) {
      upsertCurrentMessage(newMessage);

      displayMessages(currentMessages);

      if (String(newMessage.sender_id) !== String(currentUser.id)) {
        await markConversationAsRead(conversationId);
      }
    }

    return;
  }

  if (String(newMessage.sender_id) !== String(currentUser.id)) {
    conversation.unread_count = (Number(conversation.unread_count) || 0) + 1;
  }

  displayConversations();

  await loadUnreadMessageCounts();
}

async function handleRealtimeMessageUpdate(updatedMessage) {
  if (!updatedMessage || !currentUser) {
    return;
  }

  const conversation = getConversationById(updatedMessage.conversation_id);

  if (!conversation) {
    await loadConversations();

    return;
  }

  const messageId = Number(updatedMessage.id);

  if (deletedForMeIds.has(messageId)) {
    return;
  }

  const isCurrentConversation =
    selectedConversation &&
    Number(selectedConversation.id) === Number(updatedMessage.conversation_id);

  if (isCurrentConversation) {
    upsertCurrentMessage(updatedMessage);

    displayMessages(currentMessages);

    return;
  }

  await loadUnreadMessageCounts();
}

async function stopMessagesRealtime() {
  if (!messagesRealtimeChannel) {
    return;
  }

  try {
    await supabaseClient.removeChannel(messagesRealtimeChannel);
  } catch (error) {
    console.error("Error stopping messages realtime:", error);
  } finally {
    messagesRealtimeChannel = null;
  }
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  closeMessageActionMenu();

  closeConversationActionMenu();

  if (conversationModal && !conversationModal.hidden) {
    closeConversationModal();
  }

  if (replyingToMessage) {
    clearReplyState();
  }
});

document.addEventListener("click", (event) => {
  if (messageActionMenu && !messageActionMenu.contains(event.target)) {
    closeMessageActionMenu();
  }

  if (
    conversationActionMenu &&
    !conversationActionMenu.contains(event.target)
  ) {
    closeConversationActionMenu();
  }
});

document.addEventListener("contextmenu", (event) => {
  if (messageActionMenu && messageActionMenu.contains(event.target)) {
    event.preventDefault();
  }
});

window.addEventListener("blur", () => {
  clearLongPressTimer();

  closeMessageActionMenu();

  closeConversationActionMenu();

  resetSwipeMessage();
});

if (chatMessages) {
  chatMessages.addEventListener(
    "scroll",
    () => {
      closeMessageActionMenu();
    },
    {
      passive: true,
    },
  );
}

function initializeMessageInput() {
  if (!messageInput) {
    return;
  }

  messageInput.style.height = "auto";

  const maxHeight = 130;

  messageInput.style.height = `${Math.min(
    messageInput.scrollHeight,
    maxHeight,
  )}px`;
}

initializeMessageInput();

function handleSwipeStart(event) {
  if (event.pointerType !== "touch") {
    return;
  }

  const messageRow = event.target.closest(".message-row");

  if (!messageRow || !chatMessages?.contains(messageRow)) {
    return;
  }

  clearLongPressTimer();

  closeMessageActionMenu();

  swipeMessage = messageRow;

  swipeStartX = event.clientX;

  swipeStartY = event.clientY;

  swipeCurrentX = 0;

  swipeTracking = true;

  swipeDirectionLocked = false;

  messageRow.style.transition = "none";

  try {
    messageRow.setPointerCapture?.(event.pointerId);
  } catch {}
}

function handleSwipeMove(event) {
  if (event.pointerType !== "touch" || !swipeMessage || !swipeTracking) {
    return;
  }

  const deltaX = event.clientX - swipeStartX;

  const deltaY = event.clientY - swipeStartY;

  if (
    !swipeDirectionLocked &&
    Math.max(Math.abs(deltaX), Math.abs(deltaY)) < SWIPE_DIRECTION_THRESHOLD
  ) {
    return;
  }

  if (Math.abs(deltaY) > Math.abs(deltaX)) {
    resetSwipeMessage();

    return;
  }

  swipeDirectionLocked = true;

  if (deltaX <= 0) {
    swipeCurrentX = 0;

    swipeMessage.style.transform = "translateX(0)";

    return;
  }

  swipeCurrentX = Math.min(deltaX, SWIPE_MAX_DISTANCE);

  swipeMessage.style.transform = `translateX(${swipeCurrentX}px)`;

  event.preventDefault();
}

function handleSwipeEnd(event) {
  if (event.pointerType !== "touch" || !swipeMessage) {
    return;
  }

  const messageRow = swipeMessage;

  const shouldReply =
    swipeTracking &&
    swipeDirectionLocked &&
    swipeCurrentX >= SWIPE_REPLY_THRESHOLD;

  if (shouldReply) {
    const messageId = Number(messageRow.dataset.messageId);

    const message = getMessageById(messageId);

    if (message) {
      setReplyMessage(message);
    }
  }

  messageRow.style.transition = "transform 0.2s ease";

  messageRow.style.transform = "translateX(0)";

  window.setTimeout(() => {
    messageRow.style.transition = "";
  }, 200);

  clearSwipeState();
}

function resetSwipeMessage() {
  if (swipeMessage) {
    const messageRow = swipeMessage;

    messageRow.style.transition = "transform 0.2s ease";

    messageRow.style.transform = "translateX(0)";

    window.setTimeout(() => {
      messageRow.style.transition = "";
    }, 200);
  }

  clearSwipeState();
}

function clearSwipeState() {
  swipeMessage = null;

  swipeStartX = 0;

  swipeStartY = 0;

  swipeCurrentX = 0;

  swipeTracking = false;

  swipeDirectionLocked = false;
}

if (chatMessages) {
  chatMessages.addEventListener("pointerdown", handleSwipeStart, {
    passive: true,
  });

  chatMessages.addEventListener("pointermove", handleSwipeMove, {
    passive: false,
  });

  chatMessages.addEventListener("pointerup", handleSwipeEnd, {
    passive: true,
  });

  chatMessages.addEventListener("pointercancel", resetSwipeMessage, {
    passive: true,
  });
}

async function initializeMessages() {
  const authenticated = await checkAuthentication();

  if (!authenticated) {
    return;
  }

  selectedConversation = null;

  currentMessages = [];

  deletedForMeIds = new Set();

  clearReplyState();

  closeMessageActionMenu();

  clearLongPressTimer();

  resetSwipeMessage();

  if (chatEmpty) {
    chatEmpty.hidden = false;
  }

  if (chatContent) {
    chatContent.hidden = true;
  }

  await updateAuthNavigation();

  await loadConversations();

  await startMessagesRealtime();

  console.log("EcoShare Messages initialized successfully.");
}

window.addEventListener("beforeunload", () => {
  clearLongPressTimer();

  closeMessageActionMenu();

  closeConversationActionMenu();

  resetSwipeMessage();

  stopMessagesRealtime();
});

initializeMessages();
