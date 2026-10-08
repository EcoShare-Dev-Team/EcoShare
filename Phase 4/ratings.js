// ==========================================
// EcoShare - Phase 5A
// Ratings & Reviews
// ==========================================

let currentUser = null;
let selectedTransaction = null;
let selectedRating = 0;

// ==========================================
// DOM ELEMENTS
// ==========================================

const currentUserName = document.getElementById("currentUserName");

const logoutBtn = document.getElementById("logoutBtn");

const refreshBtn = document.getElementById("refreshBtn");

const loadingState = document.getElementById("loadingState");

const emptyState = document.getElementById("emptyState");

const transactionsContainer = document.getElementById("transactionsContainer");

const ratingModal = document.getElementById("ratingModal");

const closeModalBtn = document.getElementById("closeModalBtn");

const revieweeName = document.getElementById("revieweeName");

const starSelector = document.getElementById("starSelector");

const ratingValue = document.getElementById("ratingValue");

const reviewText = document.getElementById("reviewText");

const characterCount = document.getElementById("characterCount");

const submitRatingBtn = document.getElementById("submitRatingBtn");

const formError = document.getElementById("formError");

const formSuccess = document.getElementById("formSuccess");

const averageRating = document.getElementById("averageRating");

const averageStars = document.getElementById("averageStars");

const reviewCount = document.getElementById("reviewCount");

// ==========================================
// INITIALIZE
// ==========================================

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  try {
    // Get current session first
    const {
      data: { session },
      error: sessionError,
    } = await supabaseClient.auth.getSession();

    if (sessionError) {
      console.error("Session error:", sessionError);

      return;
    }

    if (!session) {
      alert("Please login first.");

      return;
    }

    currentUser = session.user;

    await loadCurrentUser();

    await loadTransactions();

    await loadAverageRating();

    await loadReceivedReviews();

    await loadTrustSummary();
  } catch (error) {
    console.error("Initialization error:", error);
  }
}

// ==========================================
// CURRENT USER
// ==========================================

async function loadCurrentUser() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("full_name")
    .eq("id", currentUser.id)
    .single();

  if (error) {
    console.error("Profile error:", error);

    return;
  }

  currentUserName.textContent = data.full_name || "User";
}

// ==========================================
// LOAD TRANSACTIONS
// ==========================================

async function loadTransactions() {
  loadingState.classList.remove("hidden");

  emptyState.classList.add("hidden");

  transactionsContainer.innerHTML = "";

  const { data, error } = await supabaseClient
    .from("transactions")
    .select(
      `
            id,
            resource_id,
            lender_id,
            borrower_id,
            status,
            completed_at
        `,
    )
    .eq("status", "completed")
    .or(`lender_id.eq.${currentUser.id},borrower_id.eq.${currentUser.id}`)
    .order("completed_at", {
      ascending: false,
    });

  loadingState.classList.add("hidden");

  if (error) {
    console.error("Transaction error:", error);

    transactionsContainer.innerHTML = `
            <div class="error">
                Unable to load transactions.
                <br>
                ${escapeHtml(error.message)}
            </div>
        `;

    return;
  }

  if (!data || data.length === 0) {
    emptyState.classList.remove("hidden");

    return;
  }

  for (const transaction of data) {
    await createTransactionCard(transaction);
  }
}

// ==========================================
// CREATE TRANSACTION CARD
// ==========================================

async function createTransactionCard(transaction) {
  const isLender = transaction.lender_id === currentUser.id;

  const otherUserId = isLender
    ? transaction.borrower_id
    : transaction.lender_id;

  const otherUserName = await getUserName(otherUserId);

  const resourceName = await getResourceName(transaction.resource_id);

  const alreadyReviewed = await hasReviewed(transaction.id);

  const card = document.createElement("div");

  card.className = "transaction-card";

  const completedDate = transaction.completed_at
    ? new Date(transaction.completed_at).toLocaleDateString()
    : "Unknown";

  card.innerHTML = `

        <h3>
            Transaction #${transaction.id}
        </h3>

        <div class="transaction-info">

            <p>
                ${isLender ? "Borrower" : "Lender"}:

                <strong>
                    ${escapeHtml(otherUserName)}
                </strong>
            </p>

            <p>
                Resource:

                <strong>
                    ${escapeHtml(resourceName)}
                </strong>
            </p>

            <p>
                Completed:
                ${completedDate}
            </p>

        </div>

        <span class="completed-badge">
            Completed
        </span>

        ${
          alreadyReviewed
            ? `
                    <button
                        class="review-btn"
                        disabled>

                        ✓ Already Reviewed

                    </button>
                  `
            : `
                    <button
                        class="review-btn">

                        Rate ${escapeHtml(otherUserName)}

                    </button>
                  `
        }

    `;

  if (!alreadyReviewed) {
    card.querySelector(".review-btn").addEventListener("click", () => {
      openRatingModal({
        transactionId: transaction.id,

        revieweeId: otherUserId,

        revieweeName: otherUserName,
      });
    });
  }

  transactionsContainer.appendChild(card);
}

// ==========================================
// GET USER NAME
// ==========================================

async function getUserName(userId) {
  const { data, error } = await supabaseClient.rpc("get_profile_name", {
    p_user_id: userId,
  });

  if (error) {
    console.error("User lookup error:", error);

    return "User";
  }

  return data || "User";
}

// ==========================================
// GET RESOURCE NAME
// ==========================================

async function getResourceName(resourceId) {
  const { data, error } = await supabaseClient
    .from("resources")
    .select("title")
    .eq("id", resourceId)
    .single();

  if (error) {
    console.error("Resource lookup error:", error);

    return `Resource #${resourceId}`;
  }

  return data?.title || `Resource #${resourceId}`;
}

// ==========================================
// CHECK REVIEW
// ==========================================

async function hasReviewed(transactionId) {
  const { data, error } = await supabaseClient
    .from("ratings")
    .select("id")
    .eq("transaction_id", transactionId)
    .eq("reviewer_id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Review check error:", error);

    return false;
  }

  return Boolean(data);
}

// ==========================================
// OPEN MODAL
// ==========================================

function openRatingModal(transaction) {
  selectedTransaction = transaction;

  selectedRating = 0;

  revieweeName.textContent = `Reviewing ${transaction.revieweeName}`;

  reviewText.value = "";

  characterCount.textContent = "0";

  clearMessages();

  resetStars();

  ratingModal.classList.remove("hidden");
}

// ==========================================
// CLOSE MODAL
// ==========================================

function closeRatingModal() {
  ratingModal.classList.add("hidden");

  selectedTransaction = null;

  selectedRating = 0;

  resetStars();

  clearMessages();
}

// ==========================================
// STAR SELECTOR
// ==========================================

starSelector.querySelectorAll("button").forEach((button) => {
  button.addEventListener("click", () => {
    selectedRating = Number(button.dataset.rating);

    updateStars();

    ratingValue.textContent = `${selectedRating} / 5`;
  });
});

function updateStars() {
  starSelector.querySelectorAll("button").forEach((button) => {
    const value = Number(button.dataset.rating);

    button.classList.toggle("active", value <= selectedRating);
  });
}

function resetStars() {
  starSelector.querySelectorAll("button").forEach((button) => {
    button.classList.remove("active");
  });

  ratingValue.textContent = "Select a rating";
}

// ==========================================
// CHARACTER COUNT
// ==========================================

reviewText.addEventListener("input", () => {
  characterCount.textContent = reviewText.value.length;
});

// ==========================================
// SUBMIT RATING
// ==========================================

submitRatingBtn.addEventListener("click", submitRating);

async function submitRating() {
  clearMessages();

  if (!selectedTransaction) {
    showError("No transaction selected.");

    return;
  }

  if (selectedRating < 1 || selectedRating > 5) {
    showError("Please select a rating from 1 to 5.");

    return;
  }

  const review = reviewText.value.trim();

  submitRatingBtn.disabled = true;

  submitRatingBtn.textContent = "Submitting...";

  try {
    const { data, error } = await supabaseClient.rpc("submit_rating", {
      p_transaction_id: selectedTransaction.transactionId,

      p_reviewee_id: selectedTransaction.revieweeId,

      p_rating: selectedRating,

      p_review: review || null,
    });

    if (error) {
      throw error;
    }

    console.log("Rating created:", data);

    showSuccess("Review submitted successfully! ⭐");

    setTimeout(async () => {
      closeRatingModal();

      await loadTransactions();

      await loadAverageRating();

      await loadReceivedReviews();
      await loadTrustSummary();
    }, 1000);
  } catch (error) {
    console.error("Rating submission error:", error);

    showError(error.message || "Unable to submit review.");
  } finally {
    submitRatingBtn.disabled = false;

    submitRatingBtn.textContent = "Submit Review";
  }
}

// ==========================================
// AVERAGE RATING
// ==========================================

async function loadAverageRating() {
  const { data: ratings, error } = await supabaseClient
    .from("ratings")
    .select("rating")
    .eq("reviewee_id", currentUser.id);

  if (error) {
    console.error("Error loading average rating:", error);

    return;
  }

  if (!ratings || ratings.length === 0) {
    averageRating.textContent = "0.0";

    averageStars.textContent = "☆☆☆☆☆";

    reviewCount.textContent = "0 reviews";

    return;
  }

  const total = ratings.reduce((sum, item) => sum + Number(item.rating), 0);

  const average = total / ratings.length;

  averageRating.textContent = average.toFixed(1);

  averageStars.textContent = createStars(average);

  reviewCount.textContent = `${ratings.length} review${
    ratings.length === 1 ? "" : "s"
  }`;
}

// ==========================================
// TRUST & VERIFICATION
// ==========================================

async function loadTrustSummary() {
  const { data, error } = await supabaseClient.rpc("get_my_trust_summary");

  if (error) {
    console.error("Trust summary error:", error);

    return;
  }

  if (!data || data.length === 0) {
    return;
  }

  const summary = data[0];

  document.getElementById("trustScore").textContent = summary.trust_score;

  document.getElementById("completedCount").textContent =
    summary.completed_transactions;

  document.getElementById("receivedReviewCount").textContent =
    summary.received_reviews;

  document.getElementById("trustAverageRating").textContent = Number(
    summary.average_rating,
  ).toFixed(1);

  const verification = document.getElementById("verificationStatus");

  verification.textContent = summary.verification_status;
}

// ==========================================
// CREATE STARS
// ==========================================

function createStars(rating) {
  let stars = "";

  for (let i = 1; i <= 5; i++) {
    stars += i <= Math.round(rating) ? "★" : "☆";
  }

  return stars;
}

// ==========================================
// LOAD REVIEWS RECEIVED
// ==========================================

async function loadReceivedReviews() {
  const container = document.getElementById("reviewsContainer");

  if (!container || !currentUser) {
    return;
  }

  container.innerHTML = `
        <p class="loading-text">
            Loading reviews...
        </p>
    `;

  const { data: reviews, error } = await supabaseClient
    .from("ratings")
    .select(
      `
            id,
            reviewer_id,
            rating,
            review,
            created_at,
            transaction_id
        `,
    )
    .eq("reviewee_id", currentUser.id)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error("Error loading reviews:", error);

    container.innerHTML = `
            <p class="no-reviews">
                Unable to load reviews.
            </p>
        `;

    return;
  }

  if (!reviews || reviews.length === 0) {
    container.innerHTML = `
            <p class="no-reviews">
                No reviews received yet.
            </p>
        `;

    return;
  }

  // --------------------------------------
  // GET REVIEWER IDS
  // --------------------------------------

  const profileMap = {};

  for (const review of reviews) {
    const reviewerName = await getUserName(review.reviewer_id);

    profileMap[review.reviewer_id] = reviewerName;
  }

  // --------------------------------------
  // CREATE REVIEW CARDS
  // --------------------------------------

  container.innerHTML = reviews
    .map((review) => {
      const reviewerName = profileMap[review.reviewer_id] || "EcoShare User";

      const stars = createStars(review.rating);

      const date = new Date(review.created_at).toLocaleDateString();

      return `

                        <div class="review-card">

                            <div class="review-top">

                                <span class="reviewer-name">

                                    ${escapeHtml(reviewerName)}

                                </span>

                                <span class="review-stars">

                                    ${stars}

                                </span>

                            </div>

                            <p class="review-text">

                                ${
                                  review.review
                                    ? escapeHtml(review.review)
                                    : "No written review."
                                }

                            </p>

                            <div class="review-date">

                                ${date}

                            </div>

                        </div>

                    `;
    })
    .join("");
}

// ==========================================
// UI HELPERS
// ==========================================

function showError(message) {
  formError.textContent = message;

  formError.classList.remove("hidden");
}

function showSuccess(message) {
  formSuccess.textContent = message;

  formSuccess.classList.remove("hidden");
}

function clearMessages() {
  formError.textContent = "";

  formSuccess.textContent = "";

  formError.classList.add("hidden");

  formSuccess.classList.add("hidden");
}

// ==========================================
// REFRESH
// ==========================================

refreshBtn.addEventListener("click", async () => {
  await loadTransactions();

  await loadAverageRating();

  await loadReceivedReviews();

  await loadTrustSummary();
});

// ==========================================
// MODAL
// ==========================================

closeModalBtn.addEventListener("click", closeRatingModal);

ratingModal.addEventListener("click", (event) => {
  if (event.target === ratingModal) {
    closeRatingModal();
  }
});

// ==========================================
// LOGOUT
// ==========================================

logoutBtn.addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    console.error("Logout error:", error);

    return;
  }

  window.location.reload();
});

// ==========================================
// BASIC HTML ESCAPING
// ==========================================

function escapeHtml(value) {
  const div = document.createElement("div");

  div.textContent = String(value ?? "");

  return div.innerHTML;
}
