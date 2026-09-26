// ==================================================
// EcoShare — Messages JavaScript
// Cleaned, improved, and hardened version
// ==================================================

"use strict";

// ==================================================
// 1. GET HTML ELEMENTS
// ==================================================

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

// Navbar
const menuBtn = document.getElementById("menu-btn");
const primaryNavigation = document.getElementById("primary-navigation");
const authNavButton = document.getElementById("authNavButton");
const messagesUnreadBadge = document.getElementById("messagesUnreadBadge");

// New conversation
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

// ==================================================
// 2. APPLICATION STATE
// ==================================================

let currentUser = null;

let conversations = [];

let availableResources = [];

let selectedConversation = null;

let currentMessages = [];

let selectedMessageIds = new Set();

let messageSelectionMode = false;

// Message IDs deleted only for the current user.
let deletedForMeIds = new Set();

// ==================================================
// 3. REPLY STATE
// ==================================================

let replyingToMessage = null;

// ==================================================
// 4. MESSAGE ACTION MENU STATE
// ==================================================

let messageActionMenu = null;
let contextMessage = null;

// ==================================================
// 5. LONG PRESS STATE
// ==================================================

let longPressTimer = null;

// ==================================================
// 6. REALTIME STATE
// ==================================================

let messagesRealtimeChannel = null;
let realtimeStarting = false;

// ==================================================
// 7. LOADING STATE
// ==================================================

let conversationsLoading = false;
let unreadCountsLoading = false;
let modalLoading = false;

// ==================================================
// 8. SWIPE-TO-REPLY STATE
// ==================================================

let swipeMessage = null;

let swipeStartX = 0;
let swipeStartY = 0;
let swipeCurrentX = 0;

let swipeTracking = false;
let swipeDirectionLocked = false;

const SWIPE_REPLY_THRESHOLD = 70;
const SWIPE_MAX_DISTANCE = 110;
const SWIPE_DIRECTION_THRESHOLD = 10;

// ==================================================
// 9. CONSTANTS
// ==================================================

const RESOURCE_FALLBACK_IMAGE = "../assets/logo.png";

const MESSAGE_MAX_LENGTH = 2000;

const ACTION_MENU_WIDTH = 180;

const ACTION_MENU_GAP = 8;

const LONG_PRESS_DURATION = 500;

// ==================================================
// 10. SMALL HELPERS
// ==================================================

function normalizeRpcData(data) {
  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
}

// --------------------------------------------------

function getConversationById(conversationId) {
  return conversations.find(
    (conversation) => Number(conversation.id) === Number(conversationId),
  );
}

// --------------------------------------------------

function isConversationSelected(conversationId) {
  return Boolean(
    selectedConversation &&
    Number(selectedConversation.id) === Number(conversationId),
  );
}

// --------------------------------------------------

function getResourceImage(url) {
  return url || RESOURCE_FALLBACK_IMAGE;
}

// --------------------------------------------------

function getMessageById(messageId) {
  return currentMessages.find(
    (message) => Number(message.id) === Number(messageId),
  );
}

// --------------------------------------------------

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

// --------------------------------------------------

function removeCurrentMessage(messageId) {
  currentMessages = currentMessages.filter(
    (message) => Number(message.id) !== Number(messageId),
  );
}

// ==================================================
// 11. AUTHENTICATION
// ==================================================

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

// ==================================================
// 12. LOGIN REDIRECT
// ==================================================

function redirectToLogin() {
  const returnUrl = `${window.location.pathname}${window.location.search}`;

  window.location.href = `../Phase 1/login.html?redirect=${encodeURIComponent(returnUrl)}`;
}

// ==================================================
// 13. UPDATE AUTH NAVIGATION
// ==================================================

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

// ==================================================
// 14. UNREAD NAVBAR BADGE
// ==================================================

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

// ==================================================
// 15. LOAD UNREAD MESSAGE COUNTS
// ==================================================

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

// ==================================================
// 16. LOAD CONVERSATIONS
// ==================================================

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

// ==================================================
// 17. ENRICH CONVERSATIONS
// ==================================================

async function enrichConversations() {
  if (!conversations.length) {
    return;
  }

  const resourceIds = [
    ...new Set(
      conversations
        .map((conversation) => conversation.resource_id)
        .filter(Boolean),
    ),
  ];

  const resourceMap = new Map();

  if (resourceIds.length) {
    const { data: resourcesData, error: resourcesError } = await supabaseClient
      .from("resource_listings")
      .select(
        `
          id,
          title,
          owner_id,
          owner_name,
          image_url,
          available
        `,
      )
      .in("id", resourceIds);

    if (resourcesError) {
      console.error("Error loading conversation resources:", resourcesError);
    } else {
      (resourcesData || []).forEach((resource) => {
        resourceMap.set(resource.id, resource);
      });
    }
  }

  conversations.forEach((conversation) => {
    const resource = resourceMap.get(conversation.resource_id);

    conversation.resource_title = resource?.title || "Resource";

    conversation.resource_owner_name = resource?.owner_name || "EcoShare User";

    conversation.resource_image_url = getResourceImage(resource?.image_url);

    conversation.resource_available = resource?.available ?? false;

    const isBorrower = conversation.borrower_id === currentUser.id;

    conversation.other_user_id = isBorrower
      ? conversation.owner_id
      : conversation.borrower_id;

    conversation.other_user_name = isBorrower
      ? conversation.resource_owner_name
      : "Borrower";

    conversation.unread_count = Number(conversation.unread_count) || 0;
  });
}

// ==================================================
// 18. DISPLAY CONVERSATIONS
// ==================================================

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
    conversationList.innerHTML = `
      <div class="conversations-empty">
        <i
          class="fa-regular fa-comments"
          aria-hidden="true"
        ></i>

        <p>No conversations yet.</p>

        <button
          type="button"
          class="conversation-empty-btn"
          id="conversationEmptyButton"
        >
          Start a conversation
        </button>
      </div>
    `;

    document
      .getElementById("conversationEmptyButton")
      ?.addEventListener("click", openConversationModal);

    return;
  }

  const fragment = document.createDocumentFragment();

  conversations.forEach((conversation) => {
    const item = document.createElement("button");

    item.type = "button";

    item.className = "conversation-item";

    const unreadCount = Number(conversation.unread_count) || 0;

    item.setAttribute(
      "aria-label",
      `Open conversation about ${conversation.resource_title || "resource"}${
        unreadCount > 0
          ? `, ${unreadCount} unread ${
              unreadCount === 1 ? "message" : "messages"
            }`
          : ""
      }`,
    );

    if (isConversationSelected(conversation.id)) {
      item.classList.add("active");

      item.setAttribute("aria-current", "true");
    }

    const imageWrapper = document.createElement("div");

    imageWrapper.className = "conversation-resource-image";

    const image = document.createElement("img");

    image.src = getResourceImage(conversation.resource_image_url);

    image.alt = conversation.resource_title || "Resource";

    image.loading = "lazy";

    image.addEventListener("error", () => {
      if (image.src.endsWith(RESOURCE_FALLBACK_IMAGE)) {
        return;
      }

      image.src = RESOURCE_FALLBACK_IMAGE;
    });

    imageWrapper.appendChild(image);

    const info = document.createElement("div");

    info.className = "conversation-info";

    const userName = document.createElement("span");

    userName.className = "conversation-user";

    userName.textContent = conversation.other_user_name || "EcoShare User";

    const resourceName = document.createElement("span");

    resourceName.className = "conversation-resource";

    resourceName.textContent = conversation.resource_title || "Resource";

    info.appendChild(userName);

    info.appendChild(resourceName);

    const rightSide = document.createElement("div");

    rightSide.className = "conversation-item-right";

    if (unreadCount > 0) {
      const unreadBadge = document.createElement("span");

      unreadBadge.className = "conversation-unread-badge";

      unreadBadge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);

      rightSide.appendChild(unreadBadge);
    }

    const arrow = document.createElement("i");

    arrow.className = "fa-solid fa-chevron-right conversation-arrow";

    arrow.setAttribute("aria-hidden", "true");

    rightSide.appendChild(arrow);

    item.appendChild(imageWrapper);

    item.appendChild(info);

    item.appendChild(rightSide);

    item.addEventListener("click", () => {
      openConversation(conversation.id);
    });

    fragment.appendChild(item);
  });

  conversationList.appendChild(fragment);
}

// ==================================================
// 19. LOAD RESOURCES FOR NEW CONVERSATION
// ==================================================

async function loadResourcesForConversation() {
  if (!resourceSelect || !currentUser) {
    return;
  }

  modalLoading = true;

  resourceSelect.innerHTML = `
    <option value="">
      Loading resources...
    </option>
  `;

  resourceSelect.disabled = true;

  try {
    const { data, error } = await supabaseClient
      .from("resource_listings")
      .select(
        `
            id,
            title,
            owner_id,
            owner_name,
            image_url,
            available
          `,
      )
      .eq("available", true)
      .neq("owner_id", currentUser.id)
      .order("title", {
        ascending: true,
      });

    if (error) {
      console.error("Error loading resources:", error);

      availableResources = [];

      resourceSelect.innerHTML = `
        <option value="">
          Unable to load resources
        </option>
      `;

      return;
    }

    availableResources = data || [];

    resourceSelect.innerHTML = `
      <option value="">
        Select a resource
      </option>
    `;

    if (availableResources.length === 0) {
      resourceSelect.innerHTML = `
        <option value="">
          No available resources
        </option>
      `;

      return;
    }

    availableResources.forEach((resource) => {
      const option = document.createElement("option");

      option.value = String(resource.id);

      option.textContent = `${resource.title} — ${
        resource.owner_name || "EcoShare User"
      }`;

      resourceSelect.appendChild(option);
    });

    resourceSelect.disabled = false;
  } finally {
    modalLoading = false;
  }
}

// ==================================================
// 20. UPDATE SELECTED RESOURCE INFO
// ==================================================

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

// ==================================================
// 21. OPEN NEW CONVERSATION MODAL
// ==================================================

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

// ==================================================
// 22. CLOSE NEW CONVERSATION MODAL
// ==================================================

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

// ==================================================
// 23. SHOW CONVERSATION ERROR
// ==================================================

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

// ==================================================
// 24. OPEN CONVERSATION
// ==================================================

async function openConversation(conversationId) {
  const conversation = getConversationById(conversationId);

  if (!conversation) {
    return;
  }

  selectedConversation = conversation;
  sessionStorage.setItem(
    "ecoshare_active_conversation",
    String(conversation.id),
  );

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

  currentMessages = [];

  replyingToMessage = null;

  closeMessageActionMenu();

  clearLongPressTimer();

  resetSwipeMessage();

  sessionStorage.removeItem("ecoshare_active_conversation");

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
// ==================================================
// 25. UPDATE CONVERSATION HEADER
// ==================================================

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

// ==================================================
// 26. LOAD MESSAGES
// ==================================================

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

// ==================================================
// 27. FORMAT MESSAGE TIME
// ==================================================

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

// ==================================================
// 28. GET REPLY PREVIEW TEXT
// ==================================================

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

// ==================================================
// 29. FIND REPLIED MESSAGE
// ==================================================

function getRepliedMessage(message) {
  if (!message || !message.reply_to_message_id) {
    return null;
  }

  return getMessageById(message.reply_to_message_id);
}

// ==================================================
// 30. DISPLAY MESSAGES
// ==================================================

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
    const isSent = message.sender_id === currentUser?.id;

    const row = document.createElement("div");

    row.className = `message-row ${isSent ? "sent" : "received"}`;

    row.dataset.messageId = String(message.id);

    if (messageSelectionMode) {
      const selectionCheckbox = document.createElement("button");

      selectionCheckbox.type = "button";

      selectionCheckbox.className = "message-selection-checkbox";

      selectionCheckbox.setAttribute(
        "aria-label",
        selectedMessageIds.has(Number(message.id))
          ? "Deselect message"
          : "Select message",
      );

      if (selectedMessageIds.has(Number(message.id))) {
        selectionCheckbox.innerHTML =
          '<i class="fa-solid fa-check" aria-hidden="true"></i>';

        row.classList.add("message-selected");
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

    // ----------------------------------------
    // Reply quote
    // ----------------------------------------

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

    // ----------------------------------------
    // Message text
    // ----------------------------------------

    const text = document.createElement("div");

    text.className = "message-text";

    if (message.deleted_at) {
      text.textContent = "This message was deleted";

      text.classList.add("message-deleted");
    } else {
      text.textContent = message.message || "";
    }

    bubble.appendChild(text);

    // ----------------------------------------
    // Pinned indicator
    // ----------------------------------------

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

    // ----------------------------------------
    // Message time
    // ----------------------------------------

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

// ==================================================
// 31. SCROLL TO BOTTOM
// ==================================================

function scrollMessagesToBottom() {
  if (!chatMessages) {
    return;
  }

  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

// ==================================================
// 32. CLEAR REPLY STATE
// ==================================================

function clearReplyState() {
  replyingToMessage = null;

  updateReplyPreview();
}

// ==================================================
// 33. SET REPLY MESSAGE
// ==================================================

function setReplyMessage(message) {
  if (!message?.id) {
    return;
  }

  replyingToMessage = message;

  updateReplyPreview();

  messageInput?.focus();
}

// ==================================================
// 34. UPDATE REPLY PREVIEW
// ==================================================

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

// ==================================================
// 35. CLOSE MESSAGE ACTION MENU
// ==================================================

function closeMessageActionMenu() {
  if (messageActionMenu) {
    messageActionMenu.remove();

    messageActionMenu = null;
  }

  contextMessage = null;
}

// ==================================================
// 36. CREATE ACTION BUTTON
// ==================================================

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

// ==================================================
// 37. CREATE MESSAGE ACTION MENU
// ==================================================

function createMessageActionMenu(message) {
  closeMessageActionMenu();

  if (!message || !currentUser) {
    return null;
  }

  const menu = document.createElement("div");

  menu.className = "message-action-menu";

  menu.setAttribute("role", "menu");

  // ==================================================
  // REPLY
  // ==================================================

  const replyButton = createActionButton("fa-solid fa-reply", "Reply");

  replyButton.addEventListener("click", () => {
    setReplyMessage(message);

    closeMessageActionMenu();
  });

  menu.appendChild(replyButton);

  // ==================================================
  // SELECT MESSAGE
  // ==================================================

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
  // ==================================================
  // COPY
  // ==================================================

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

  // ==================================================
  // PIN / UNPIN
  // ==================================================

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

  // ==================================================
  // INFO
  // ==================================================

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

  // ==================================================
  // DELETE FOR ME
  // ==================================================

  const deleteLabel = message.deleted_at
    ? "Delete"
    : message.sender_id === currentUser.id
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

  // ==================================================
  // DELETE FOR EVERYONE
  // ==================================================

  if (message.sender_id === currentUser.id && !message.deleted_at) {
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

// ==================================================
// 38. POSITION ACTION MENU
// ==================================================

function positionMessageActionMenu(menu, x, y) {
  if (!menu) {
    return;
  }

  menu.style.position = "fixed";

  // Append first so dimensions are available.
  const rect = menu.getBoundingClientRect();

  const menuWidth = rect.width || ACTION_MENU_WIDTH;

  const menuHeight = rect.height || 250;

  let left = x;

  let top = y;

  // Keep horizontally inside viewport.
  if (left + menuWidth > window.innerWidth - 8) {
    left = window.innerWidth - menuWidth - 8;
  }

  if (left < 8) {
    left = 8;
  }

  // Keep vertically inside viewport.
  if (top + menuHeight > window.innerHeight - 8) {
    top = window.innerHeight - menuHeight - 8;
  }

  if (top < 8) {
    top = 8;
  }

  menu.style.left = `${left}px`;

  menu.style.top = `${top}px`;
}

// ==================================================
// 39. OPEN MESSAGE ACTION MENU
// ==================================================

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
    const isSent = message.sender_id === currentUser.id;

    menuX = isSent
      ? rect.left - ACTION_MENU_WIDTH - ACTION_MENU_GAP
      : rect.right + ACTION_MENU_GAP;

    menuY = rect.top;
  }

  positionMessageActionMenu(menu, menuX, menuY);
}

// ==================================================
// 40. CLEAR LONG PRESS TIMER
// ==================================================

function clearLongPressTimer() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);

    longPressTimer = null;
  }
}

// ==================================================
// 41. ATTACH MESSAGE ACTION HANDLERS
// ==================================================

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
    // ----------------------------------------
    // Desktop right click
    // ----------------------------------------

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

      const isSent = message.sender_id === currentUser?.id;

      const x = isSent
        ? rect.left - ACTION_MENU_WIDTH - ACTION_MENU_GAP
        : rect.right + ACTION_MENU_GAP;

      openMessageActionMenu(message, x, rect.top);
    });

    // ----------------------------------------
    // Mobile long press
    // ----------------------------------------

    row.addEventListener(
      "touchstart",
      (event) => {
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

  if (selectedMessageIds.has(id)) {
    selectedMessageIds.delete(id);
  } else {
    selectedMessageIds.add(id);
  }

  // Exit selection mode when nothing is selected.
  if (selectedMessageIds.size === 0) {
    messageSelectionMode = false;
  }

  displayMessages(currentMessages);

  updateMessageSelectionToolbar();
}

function canDeleteSelectedForEveryone() {
  if (selectedMessageIds.size === 0) {
    return false;
  }

  const selectedMessages = currentMessages.filter((message) =>
    selectedMessageIds.has(Number(message.id)),
  );

  if (selectedMessages.length !== selectedMessageIds.size) {
    return false;
  }

  return selectedMessages.every(
    (message) => message.sender_id === currentUser.id && !message.deleted_at,
  );
}

function cancelMessageSelection() {
  selectedMessageIds.clear();

  messageSelectionMode = false;

  displayMessages(currentMessages);

  updateMessageSelectionToolbar();
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
    console.error("Error deleting selected messages:", error);

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
      const { error } = await supabaseClient.rpc(
        "delete_conversation_message",
        {
          p_message_id: messageId,
        },
      );

      if (error) {
        throw error;
      }

      removeCurrentMessage(messageId);
    }

    selectedMessageIds.clear();

    messageSelectionMode = false;

    displayMessages(currentMessages);

    updateMessageSelectionToolbar();

    await loadUnreadMessageCounts();
  } catch (error) {
    console.error("Error deleting selected messages for everyone:", error);

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
function enterMessageSelectionMode(message) {
  if (!message?.id) {
    return;
  }

  messageSelectionMode = true;

  selectedMessageIds.clear();

  selectedMessageIds.add(Number(message.id));

  displayMessages(currentMessages);

  updateMessageSelectionToolbar();
}

// ==================================================
// UPDATE MESSAGE SELECTION TOOLBAR
// ==================================================

function updateMessageSelectionToolbar() {
  if (!messageSelectionToolbar) {
    return;
  }

  const count = selectedMessageIds.size;

  if (messageSelectionMode && count > 0) {
    messageSelectionToolbar.hidden = false;

    if (selectedMessageCount) {
      selectedMessageCount.textContent = `${count} ${
        count === 1 ? "message" : "messages"
      } selected`;
    }

    const allSent = canDeleteSelectedForEveryone();

    // Delete for everyone is available
    // only when every selected message
    // was sent by the current user.
    if (deleteSelectedForEveryoneButton) {
      deleteSelectedForEveryoneButton.hidden = !allSent;
    }

    // If all selected messages are sent,
    // normal Delete means Delete for me.
    //
    // If any received message is selected,
    // normal Delete means Delete.
    if (deleteSelectedMessagesButton) {
      deleteSelectedMessagesButton.innerHTML = allSent
        ? `
            <i
              class="fa-solid fa-trash"
              aria-hidden="true"
            ></i>
            Delete for me
          `
        : `
            <i
              class="fa-solid fa-trash"
              aria-hidden="true"
            ></i>
            Delete
          `;
    }
  } else {
    messageSelectionToolbar.hidden = true;

    if (selectedMessageCount) {
      selectedMessageCount.textContent = "";
    }

    if (deleteSelectedForEveryoneButton) {
      deleteSelectedForEveryoneButton.hidden = true;
    }
  }
}

// ==================================================
// 42. MARK CONVERSATION AS READ
// ==================================================

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

// ==================================================
// 43. SEND MESSAGE
// ==================================================

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

// ==================================================
// 44. MESSAGE FORM
// ==================================================

if (messageForm) {
  messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    await sendMessage();
  });
}

// ==================================================
// 45. MESSAGE INPUT
// ==================================================

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

// ==================================================
// 46. NEW CONVERSATION CONTROLS
// ==================================================

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

// ==================================================
// 47. CREATE CONVERSATION
// ==================================================

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

// ==================================================
// 48. REALTIME — START
// ==================================================

async function startMessagesRealtime() {
  if (!currentUser || realtimeStarting || messagesRealtimeChannel) {
    return;
  }

  realtimeStarting = true;

  try {
    messagesRealtimeChannel = supabaseClient
      .channel(`messages-${currentUser.id}`)

      // ----------------------------------------
      // NEW MESSAGE
      // ----------------------------------------

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

      // ----------------------------------------
      // MESSAGE UPDATE
      // Handles:
      // - Pin
      // - Unpin
      // - Delete for everyone
      // ----------------------------------------

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

// ==================================================
// 49. REALTIME — NEW MESSAGE
// ==================================================

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

  // Ignore messages that this user
  // has already deleted for themselves.
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

      // If the message was sent by
      // the other participant, mark it read.
      if (newMessage.sender_id !== currentUser.id) {
        await markConversationAsRead(conversationId);
      }
    }

    return;
  }

  // Message belongs to another
  // conversation.
  if (newMessage.sender_id !== currentUser.id) {
    conversation.unread_count = (Number(conversation.unread_count) || 0) + 1;
  }

  displayConversations();

  await loadUnreadMessageCounts();
}

// ==================================================
// 50. REALTIME — MESSAGE UPDATE
// ==================================================

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

  // ----------------------------------------
  // DELETE FOR ME
  // ----------------------------------------
  // Do not allow a realtime update to bring
  // back a message that this user deleted
  // only for themselves.
  if (deletedForMeIds.has(messageId)) {
    return;
  }

  const isCurrentConversation =
    selectedConversation &&
    Number(selectedConversation.id) === Number(updatedMessage.conversation_id);

  // ----------------------------------------
  // CURRENT CONVERSATION
  // ----------------------------------------

  if (isCurrentConversation) {
    upsertCurrentMessage(updatedMessage);

    displayMessages(currentMessages);

    return;
  }

  // ----------------------------------------
  // OTHER CONVERSATION
  // ----------------------------------------

  await loadUnreadMessageCounts();
}

// ==================================================
// 51. STOP REALTIME
// ==================================================

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

// ==================================================
// 52. MOBILE NAVIGATION
// ==================================================

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
}

// ==================================================
// 53. CLOSE MOBILE NAV ON LINK CLICK
// ==================================================

if (primaryNavigation) {
  primaryNavigation.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      if (window.innerWidth <= 768) {
        primaryNavigation.classList.remove("show");

        if (menuBtn) {
          menuBtn.setAttribute("aria-expanded", "false");

          menuBtn.setAttribute("aria-label", "Open navigation menu");

          const icon = menuBtn.querySelector("i");

          if (icon) {
            icon.classList.add("fa-bars");

            icon.classList.remove("fa-xmark");
          }
        }
      }
    });
  });
}

// ==================================================
// 54. WINDOW RESIZE
// ==================================================

window.addEventListener("resize", () => {
  closeMessageActionMenu();

  if (window.innerWidth > 768 && primaryNavigation) {
    primaryNavigation.classList.remove("show");

    if (menuBtn) {
      menuBtn.setAttribute("aria-expanded", "false");

      menuBtn.setAttribute("aria-label", "Open navigation menu");

      const icon = menuBtn.querySelector("i");

      if (icon) {
        icon.classList.add("fa-bars");

        icon.classList.remove("fa-xmark");
      }
    }
  }
});

// ==================================================
// 55. ESCAPE KEY
// ==================================================

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  closeMessageActionMenu();

  if (conversationModal && !conversationModal.hidden) {
    closeConversationModal();
  }

  if (replyingToMessage) {
    clearReplyState();
  }
});

// ==================================================
// 56. CLICK OUTSIDE ACTION MENU
// ==================================================

document.addEventListener("click", (event) => {
  if (!messageActionMenu) {
    return;
  }

  if (messageActionMenu.contains(event.target)) {
    return;
  }

  closeMessageActionMenu();
});

// ==================================================
// 57. PREVENT CONTEXT MENU INSIDE CUSTOM MENU
// ==================================================

document.addEventListener("contextmenu", (event) => {
  if (messageActionMenu && messageActionMenu.contains(event.target)) {
    event.preventDefault();
  }
});

// ==================================================
// 58. WINDOW BLUR CLEANUP
// ==================================================

window.addEventListener("blur", () => {
  clearLongPressTimer();

  closeMessageActionMenu();

  resetSwipeMessage();
});

// ==================================================
// 59. CHAT SCROLL CLEANUP
// ==================================================

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

// ==================================================
// 60. MESSAGE INPUT INITIALIZATION
// ==================================================

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

// ==================================================
// 61. SWIPE-TO-REPLY — START
// ==================================================

function handleSwipeStart(event) {
  // Touch only.
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
  } catch {
    // Ignore unsupported pointer capture.
  }
}

// ==================================================
// 62. SWIPE-TO-REPLY — MOVE
// ==================================================

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

  // Vertical movement means
  // normal page/chat scrolling.
  if (Math.abs(deltaY) > Math.abs(deltaX)) {
    resetSwipeMessage();

    return;
  }

  swipeDirectionLocked = true;

  // Only right swipe.
  if (deltaX <= 0) {
    swipeCurrentX = 0;

    swipeMessage.style.transform = "translateX(0)";

    return;
  }

  swipeCurrentX = Math.min(deltaX, SWIPE_MAX_DISTANCE);

  swipeMessage.style.transform = `translateX(${swipeCurrentX}px)`;

  event.preventDefault();
}

// ==================================================
// 63. SWIPE-TO-REPLY — END
// ==================================================

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

// ==================================================
// 64. SWIPE RESET
// ==================================================

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

// ==================================================
// 65. CLEAR SWIPE STATE
// ==================================================

function clearSwipeState() {
  swipeMessage = null;

  swipeStartX = 0;

  swipeStartY = 0;

  swipeCurrentX = 0;

  swipeTracking = false;

  swipeDirectionLocked = false;
}

// ==================================================
// 66. REGISTER SWIPE EVENTS
// ==================================================

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

// ==================================================
// 67. INITIALIZE APPLICATION
// ==================================================

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

  const savedConversationId = sessionStorage.getItem(
    "ecoshare_active_conversation",
  );

  if (savedConversationId) {
    await openConversation(Number(savedConversationId));
  }

  await startMessagesRealtime();

  console.log("EcoShare Messages initialized successfully.");
}

// ==================================================
// 68. PAGE UNLOAD CLEANUP
// ==================================================

window.addEventListener("beforeunload", () => {
  clearLongPressTimer();

  closeMessageActionMenu();

  resetSwipeMessage();

  stopMessagesRealtime();
});

// ==================================================
// 69. START APPLICATION
// ==================================================

initializeMessages();
