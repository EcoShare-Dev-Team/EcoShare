(() => {
  "use strict";

  // =========================================================
  // DOM ELEMENTS
  // =========================================================

  const lendResourceForm = document.getElementById("lendResourceForm");

  const resourceTitle = document.getElementById("resourceTitle");
  const resourceDescription =
    document.getElementById("resourceDescription");
  const resourceCategory =
    document.getElementById("resourceCategory");
  const resourceLocation =
    document.getElementById("resourceLocation");

  const pricePerHour = document.getElementById("pricePerHour");
  const pricePerDay = document.getElementById("pricePerDay");
  const buyPrice = document.getElementById("buyPrice");

  const resourceImage = document.getElementById("resourceImage");
  const imageUploadArea =
    document.getElementById("imageUploadArea");
  const imagePreview =
    document.getElementById("imagePreview");
  const imagePreviewImg =
    document.getElementById("imagePreviewImg");
  const imageFileName =
    document.getElementById("imageFileName");
  const removeImageButton =
    document.getElementById("removeImageButton");

  const descriptionCount =
    document.getElementById("descriptionCount");

  const titleError =
    document.getElementById("titleError");
  const descriptionError =
    document.getElementById("descriptionError");
  const categoryError =
    document.getElementById("categoryError");
  const locationError =
    document.getElementById("locationError");
  const pricePerHourError =
    document.getElementById("pricePerHourError");
  const pricePerDayError =
    document.getElementById("pricePerDayError");
  const buyPriceError =
    document.getElementById("buyPriceError");
  const imageError =
    document.getElementById("imageError");

  const formMessage =
    document.getElementById("formMessage");

  const submitResourceBtn =
    document.getElementById("submitResourceBtn");

  const authNavButton =
    document.getElementById("authNavButton");

  // =========================================================
  // CONFIGURATION
  // =========================================================

  const SUPABASE_ORIGIN =
    window.ECOSHARE_SUPABASE_URL ||
    "https://cplbvftcbiwgqkeqmrbq.supabase.co";

  const STORAGE_BUCKET = "resource-images";
  const CREATE_RESOURCE_RPC = "create_resource";

  const LOGIN_URL = "../Phase 1/login.html";
  const LEND_RESOURCE_URL =
    "../Phase 2/lend-resource.html";
  const EXPLORE_URL = "explore.html";

  const GEOCODING_URL =
    "https://nominatim.openstreetmap.org/reverse";

  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

  const ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  const MAX_FILENAME_LENGTH = 255;

  const MIN_TITLE_LENGTH = 2;
  const MAX_TITLE_LENGTH = 150;

  const MIN_DESCRIPTION_LENGTH = 5;
  const MAX_DESCRIPTION_LENGTH = 2000;

  const MAX_CATEGORY_LENGTH = 100;
  const MAX_LOCATION_LENGTH = 300;

  const MAX_PRICE = 1000000000;

  // =========================================================
  // STATE
  // =========================================================

  let selectedImageFile = null;
  let previewObjectUrl = null;

  let currentLatitude = null;
  let currentLongitude = null;

  let isGettingLocation = false;
  let isSubmitting = false;

  // Set only from Supabase authentication.
  // Never taken from URL or user input.
  let verifiedUserId = null;

  // =========================================================
  // SUPABASE CLIENT
  // =========================================================

  function getSupabaseClient() {
    const client = window.supabaseClient;

    if (
      !client ||
      !client.auth ||
      !client.from ||
      !client.storage ||
      typeof client.rpc !== "function"
    ) {
      throw new Error(
        "Supabase is not initialized. Check supabase.js.",
      );
    }

    return client;
  }

  // =========================================================
  // INITIALIZATION
  // =========================================================

  document.addEventListener(
    "DOMContentLoaded",
    async () => {
      setupDescriptionCounter();
      setupImageUpload();
      setupLocationFeature();
      setupPricingFields();
      setupHeaderScroll();
      setupFormFieldListeners();

      const authenticated =
        await checkAuthentication();

      if (!authenticated) {
        return;
      }

      await updateAuthNavigation();
    },
  );

  // =========================================================
  // AUTHENTICATION
  // =========================================================

  async function checkAuthentication() {
    try {
      const supabase = getSupabaseClient();

      const {
        data,
        error,
      } = await supabase.auth.getUser();

      if (error || !data?.user?.id) {
        redirectToLogin();
        return false;
      }

      // Store the verified user ID immediately.
      // This removes the race condition that existed
      // with the previous second DOMContentLoaded auth call.
      verifiedUserId = data.user.id;

      return true;
    } catch (error) {
      console.error(
        "Authentication check failed:",
        error,
      );

      showFormMessage(
        "Unable to verify your login. Please refresh the page.",
        "error",
      );

      return false;
    }
  }

  function redirectToLogin() {
    window.location.href =
      `${LOGIN_URL}?redirect=${encodeURIComponent(
        LEND_RESOURCE_URL,
      )}`;
  }

  // =========================================================
  // NAVIGATION
  // =========================================================

  async function updateAuthNavigation() {
    if (!authNavButton) {
      return;
    }

    try {
      const supabase = getSupabaseClient();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      authNavButton.replaceChildren();

      const icon =
        document.createElement("i");

      icon.setAttribute(
        "aria-hidden",
        "true",
      );

      if (session) {
        icon.className =
          "fa-solid fa-user";

        authNavButton.appendChild(icon);

        authNavButton.appendChild(
          document.createTextNode(" Profile"),
        );

        authNavButton.href =
          "../Phase 1/profile.html";

        authNavButton.setAttribute(
          "aria-label",
          "Open profile",
        );
      } else {
        icon.className =
          "fa-solid fa-right-to-bracket";

        authNavButton.appendChild(icon);

        authNavButton.appendChild(
          document.createTextNode(" Login"),
        );

        authNavButton.href = LOGIN_URL;

        authNavButton.setAttribute(
          "aria-label",
          "Login",
        );
      }
    } catch (error) {
      console.error(
        "Navigation update failed:",
        error,
      );
    }
  }

  // =========================================================
  // DESCRIPTION COUNTER
  // =========================================================

  function setupDescriptionCounter() {
    if (
      !resourceDescription ||
      !descriptionCount
    ) {
      return;
    }

    function updateCount() {
      descriptionCount.textContent =
        resourceDescription.value.length;
    }

    resourceDescription.addEventListener(
      "input",
      updateCount,
    );

    updateCount();
  }

  // =========================================================
  // PRICING
  // =========================================================

  function setupPricingFields() {
    const fields = [
      pricePerHour,
      pricePerDay,
      buyPrice,
    ];

    fields.forEach((field) => {
      if (!field) {
        return;
      }

      field.addEventListener(
        "input",
        () => {
          clearPriceFieldError(field);

          if (
            field.value !== "" &&
            Number(field.value) < 0
          ) {
            field.value = "0";
          }
        },
      );

      field.addEventListener(
        "blur",
        () => {
          if (field.value === "") {
            field.value = "0";
          }

          const value =
            parsePriceValue(field.value);

          if (
            value !== null &&
            Number.isFinite(value)
          ) {
            field.value =
              formatInputPrice(value);
          }
        },
      );
    });
  }

  function setupFormFieldListeners() {
    if (resourceTitle) {
      resourceTitle.addEventListener(
        "input",
        () => {
          if (titleError) {
            titleError.textContent = "";
          }

          resourceTitle
            .closest(".form-group")
            ?.classList.remove(
              "has-error",
            );
        },
      );
    }

    if (resourceDescription) {
      resourceDescription.addEventListener(
        "input",
        () => {
          if (descriptionError) {
            descriptionError.textContent = "";
          }

          resourceDescription
            .closest(".form-group")
            ?.classList.remove(
              "has-error",
            );
        },
      );
    }

    if (resourceCategory) {
      resourceCategory.addEventListener(
        "change",
        () => {
          if (categoryError) {
            categoryError.textContent = "";
          }

          resourceCategory
            .closest(".form-group")
            ?.classList.remove(
              "has-error",
            );
        },
      );
    }

    if (resourceLocation) {
      resourceLocation.addEventListener(
        "input",
        () => {
          if (locationError) {
            locationError.textContent = "";
          }

          resourceLocation
            .closest(".form-group")
            ?.classList.remove(
              "has-error",
            );
        },
      );
    }
  }

  function parsePriceValue(value) {
    if (
      value === null ||
      value === undefined
    ) {
      return null;
    }

    const text =
      String(value).trim();

    if (!text) {
      return 0;
    }

    const number = Number(text);

    if (!Number.isFinite(number)) {
      return null;
    }

    return number;
  }

  function formatInputPrice(value) {
    return Number(value)
      .toFixed(2)
      .replace(/\.00$/, "")
      .replace(/(\.\d)0$/, "$1");
  }

  function validatePriceField(
    input,
    errorElement,
    label,
  ) {
    if (!input) {
      return {
        valid: true,
        value: 0,
      };
    }

    const rawValue =
      input.value.trim();

    if (!rawValue) {
      input.value = "0";

      return {
        valid: true,
        value: 0,
      };
    }

    const value =
      parsePriceValue(rawValue);

    if (
      value === null ||
      !Number.isFinite(value)
    ) {
      showFieldError(
        input,
        errorElement,
        `${label} must be a valid number.`,
      );

      return {
        valid: false,
        value: null,
      };
    }

    if (value < 0) {
      showFieldError(
        input,
        errorElement,
        `${label} cannot be negative.`,
      );

      return {
        valid: false,
        value: null,
      };
    }

    if (value > MAX_PRICE) {
      showFieldError(
        input,
        errorElement,
        `${label} is too high.`,
      );

      return {
        valid: false,
        value: null,
      };
    }

    return {
      valid: true,
      value,
    };
  }

  function clearPriceFieldError(input) {
    if (!input) {
      return;
    }

    const group =
      input.closest(".form-group");

    group?.classList.remove(
      "has-error",
    );

    const error =
      group?.querySelector(
        ".field-error",
      );

    if (error) {
      error.textContent = "";
    }
  }

  // =========================================================
  // IMAGE UPLOAD
  // =========================================================

  function setupImageUpload() {
    if (!resourceImage) {
      console.error(
        "EcoShare: #resourceImage was not found.",
      );
      return;
    }

    resourceImage.addEventListener(
      "change",
      handleImageSelection,
    );

    if (removeImageButton) {
      removeImageButton.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          removeSelectedImage();
        },
      );
    }

    if (imageUploadArea) {
      imageUploadArea.addEventListener(
        "click",
        (event) => {
          if (
            event.target === resourceImage
          ) {
            return;
          }

          resourceImage.click();
        },
      );

      imageUploadArea.addEventListener(
        "keydown",
        (event) => {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            resourceImage.click();
          }
        },
      );

      imageUploadArea.setAttribute(
        "role",
        "button",
      );

      imageUploadArea.setAttribute(
        "tabindex",
        "0",
      );
    }
  }

  function handleImageSelection(event) {
    clearImageError();

    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    if (
      !ALLOWED_IMAGE_TYPES.includes(
        file.type,
      )
    ) {
      showFieldError(
        resourceImage,
        imageError,
        "Please select a JPG, PNG, or WEBP image.",
      );

      resetImageInput();
      return;
    }

    if (
      !Number.isFinite(file.size) ||
      file.size <= 0 ||
      file.size > MAX_IMAGE_SIZE
    ) {
      showFieldError(
        resourceImage,
        imageError,
        "Image must be greater than 0 and no larger than 5 MB.",
      );

      resetImageInput();
      return;
    }

    if (
      !file.name ||
      file.name.length >
        MAX_FILENAME_LENGTH
    ) {
      showFieldError(
        resourceImage,
        imageError,
        "The image filename is invalid or too long.",
      );

      resetImageInput();
      return;
    }

    selectedImageFile = file;

    if (previewObjectUrl) {
      URL.revokeObjectURL(
        previewObjectUrl,
      );
    }

    previewObjectUrl =
      URL.createObjectURL(file);

    if (imagePreviewImg) {
      imagePreviewImg.src =
        previewObjectUrl;

      imagePreviewImg.alt =
        "Selected resource image preview";
    }

    if (imageFileName) {
      imageFileName.textContent =
        file.name;
    }

    if (imageUploadArea) {
      imageUploadArea.hidden = true;
    }

    if (imagePreview) {
      imagePreview.hidden = false;
    }
  }

  function removeSelectedImage() {
    selectedImageFile = null;

    if (previewObjectUrl) {
      URL.revokeObjectURL(
        previewObjectUrl,
      );

      previewObjectUrl = null;
    }

    if (resourceImage) {
      resourceImage.value = "";
    }

    if (imagePreviewImg) {
      imagePreviewImg.removeAttribute(
        "src",
      );
    }

    if (imageFileName) {
      imageFileName.textContent =
        "No image selected";
    }

    if (imagePreview) {
      imagePreview.hidden = true;
    }

    if (imageUploadArea) {
      imageUploadArea.hidden = false;
    }

    clearImageError();
  }

  function resetImageInput() {
    selectedImageFile = null;

    if (resourceImage) {
      resourceImage.value = "";
    }

    if (imagePreviewImg) {
      imagePreviewImg.removeAttribute(
        "src",
      );
    }

    if (imageFileName) {
      imageFileName.textContent =
        "No image selected";
    }

    if (imagePreview) {
      imagePreview.hidden = true;
    }

    if (imageUploadArea) {
      imageUploadArea.hidden = false;
    }

    if (previewObjectUrl) {
      URL.revokeObjectURL(
        previewObjectUrl,
      );

      previewObjectUrl = null;
    }
  }

  // =========================================================
  // LOCATION
  // =========================================================

  function setupLocationFeature() {
    if (!resourceLocation) {
      console.error(
        "EcoShare: #resourceLocation was not found.",
      );
      return;
    }

    let locationButton =
      document.getElementById(
        "useCurrentLocationBtn",
      );

    if (!locationButton) {
      locationButton =
        document.getElementById(
          "getCurrentLocationBtn",
        );
    }

    if (!locationButton) {
      console.error(
        "EcoShare: Current location button could not be found.",
      );
      return;
    }

    let locationStatus =
      document.getElementById(
        "locationStatus",
      );

    if (!locationStatus) {
      locationStatus =
        document.getElementById(
          "locationHelp",
        );
    }

    if (!locationStatus) {
      const locationGroup =
        resourceLocation.closest(
          ".form-group",
        );

      if (locationGroup) {
        locationStatus =
          document.createElement(
            "small",
          );

        locationStatus.id =
          "locationStatus";

        locationStatus.className =
          "field-help";

        locationGroup.appendChild(
          locationStatus,
        );
      }
    }

    setButtonContent(
      locationButton,
      "fa-solid fa-location-crosshairs",
      "Use My Current Location",
    );

    if (locationStatus) {
      locationStatus.textContent =
        "Enter your location manually or use GPS to detect it.";
    }

    if (
      locationButton.dataset.locationReady ===
      "true"
    ) {
      return;
    }

    locationButton.dataset.locationReady =
      "true";

    locationButton.addEventListener(
      "click",
      (event) => {
        event.preventDefault();

        getCurrentLocation(
          locationButton,
          locationStatus,
        );
      },
    );
  }

  function getCurrentLocation(
    locationButton,
    locationStatus,
  ) {
    if (isGettingLocation) {
      return;
    }

    if (!navigator.geolocation) {
      updateLocationStatus(
        locationStatus,
        "Your browser does not support location access.",
        "error",
      );

      return;
    }

    if (
      !window.isSecureContext &&
      location.hostname !== "localhost" &&
      location.hostname !== "127.0.0.1"
    ) {
      updateLocationStatus(
        locationStatus,
        "Location access requires HTTPS or localhost.",
        "error",
      );

      return;
    }

    isGettingLocation = true;

    locationButton.disabled = true;

    setButtonContent(
      locationButton,
      "fa-solid fa-spinner fa-spin",
      "Getting Your Location...",
    );

    updateLocationStatus(
      locationStatus,
      "Getting your location...",
      "info",
    );

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        isGettingLocation = false;

        const latitude =
          Number(
            position.coords.latitude,
          );

        const longitude =
          Number(
            position.coords.longitude,
          );

        if (
          !Number.isFinite(latitude) ||
          latitude < -90 ||
          latitude > 90
        ) {
          locationButton.disabled = false;

          resetLocationButton(
            locationButton,
          );

          updateLocationStatus(
            locationStatus,
            "Invalid latitude received. Please try again.",
            "error",
          );

          return;
        }

        if (
          !Number.isFinite(longitude) ||
          longitude < -180 ||
          longitude > 180
        ) {
          locationButton.disabled = false;

          resetLocationButton(
            locationButton,
          );

          updateLocationStatus(
            locationStatus,
            "Invalid longitude received. Please try again.",
            "error",
          );

          return;
        }

        currentLatitude = latitude;
        currentLongitude = longitude;

        updateLocationStatus(
          locationStatus,
          "Finding your location...",
          "info",
        );

        const readableLocation =
          await reverseGeocode(
            latitude,
            longitude,
          );

        const finalLocation =
          readableLocation ||
          `${latitude.toFixed(
            6,
          )}, ${longitude.toFixed(6)}`;

        resourceLocation.value =
          finalLocation;

        resourceLocation.dispatchEvent(
          new Event("input", {
            bubbles: true,
          }),
        );

        resourceLocation.dispatchEvent(
          new Event("change", {
            bubbles: true,
          }),
        );

        locationButton.disabled = false;

        setButtonContent(
          locationButton,
          "fa-solid fa-location-dot",
          "Location Captured",
        );

        if (readableLocation) {
          updateLocationStatus(
            locationStatus,
            `Location captured: ${readableLocation}`,
            "success",
          );
        } else {
          updateLocationStatus(
            locationStatus,
            `GPS location captured: ${latitude.toFixed(
              6,
            )}, ${longitude.toFixed(6)}`,
            "success",
          );
        }
      },
      (error) => {
        isGettingLocation = false;

        locationButton.disabled = false;

        resetLocationButton(
          locationButton,
        );

        let message =
          "Unable to get your location.";

        switch (error.code) {
          case error.PERMISSION_DENIED:
            message =
              "Location permission was denied. Allow location access in Chrome and try again.";
            break;

          case error.POSITION_UNAVAILABLE:
            message =
              "Your location is currently unavailable. Please try again.";
            break;

          case error.TIMEOUT:
            message =
              "Location request timed out. Please try again.";
            break;

          default:
            message =
              "Unable to get your location. Please try again.";
        }

        updateLocationStatus(
          locationStatus,
          message,
          "error",
        );

        console.error(
          "EcoShare: Geolocation error:",
          error,
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      },
    );
  }

  // =========================================================
  // REVERSE GEOCODING
  // =========================================================

  async function reverseGeocode(
    latitude,
    longitude,
  ) {
    try {
      const params =
        new URLSearchParams({
          format: "jsonv2",
          lat: latitude.toString(),
          lon: longitude.toString(),
          zoom: "18",
          addressdetails: "1",
          "accept-language": "en",
        });

      const response = await fetch(
        `${GEOCODING_URL}?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Accept:
              "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Reverse geocoding failed with status ${response.status}.`,
        );
      }

      const data =
        await response.json();

      if (
        !data ||
        typeof data !== "object"
      ) {
        return null;
      }

      const address =
        data.address || {};

      const locality =
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.suburb ||
        address.county ||
        "";

      const district =
        address.state_district ||
        address.district ||
        "";

      const state =
        address.state || "";

      const country =
        address.country || "";

      const parts = [];

      addUniqueLocationPart(
        parts,
        locality,
      );

      addUniqueLocationPart(
        parts,
        district,
      );

      addUniqueLocationPart(
        parts,
        state,
      );

      addUniqueLocationPart(
        parts,
        country,
      );

      if (parts.length === 0) {
        const displayName =
          typeof data.display_name ===
          "string"
            ? data.display_name.trim()
            : "";

        if (displayName) {
          return displayName
            .split(",")
            .map(
              (part) => part.trim(),
            )
            .filter(Boolean)
            .slice(0, 4)
            .join(", ");
        }

        return null;
      }

      return parts.join(", ");
    } catch (error) {
      console.warn(
        "EcoShare: Reverse geocoding failed:",
        error,
      );

      return null;
    }
  }

  function addUniqueLocationPart(
    parts,
    value,
  ) {
    if (
      typeof value !== "string"
    ) {
      return;
    }

    const cleaned =
      value.trim();

    if (!cleaned) {
      return;
    }

    const exists = parts.some(
      (part) =>
        part.toLowerCase() ===
        cleaned.toLowerCase(),
    );

    if (!exists) {
      parts.push(cleaned);
    }
  }

  function resetLocationButton(
    button,
  ) {
    setButtonContent(
      button,
      "fa-solid fa-location-crosshairs",
      "Try Location Again",
    );
  }

  function updateLocationStatus(
    element,
    message,
    type,
  ) {
    if (!element) {
      return;
    }

    element.textContent = message;

    if (type === "error") {
      element.style.color =
        "#c0392b";
    } else if (
      type === "success"
    ) {
      element.style.color =
        "#4d9220";
    } else {
      element.style.color = "";
    }
  }

  // =========================================================
  // FORM SUBMISSION
  // =========================================================

  if (lendResourceForm) {
    lendResourceForm.addEventListener(
      "submit",
      handleFormSubmit,
    );
  }

  async function handleFormSubmit(
    event,
  ) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    clearErrors();
    hideFormMessage();

    const title =
      resourceTitle?.value.trim() ||
      "";

    const description =
      resourceDescription?.value.trim() ||
      "";

    const category =
      resourceCategory?.value.trim() ||
      "";

    const locationText =
      resourceLocation?.value.trim() ||
      "";

    let valid = true;

    // ---------------------------------------------------------
    // TITLE
    // ---------------------------------------------------------

    if (
      title.length <
      MIN_TITLE_LENGTH
    ) {
      showFieldError(
        resourceTitle,
        titleError,
        "Resource title must contain at least 2 characters.",
      );

      valid = false;
    }

    if (
      title.length >
      MAX_TITLE_LENGTH
    ) {
      showFieldError(
        resourceTitle,
        titleError,
        "Resource title cannot exceed 150 characters.",
      );

      valid = false;
    }

    // ---------------------------------------------------------
    // DESCRIPTION
    // ---------------------------------------------------------

    if (
      description.length <
      MIN_DESCRIPTION_LENGTH
    ) {
      showFieldError(
        resourceDescription,
        descriptionError,
        "Resource description must contain at least 5 characters.",
      );

      valid = false;
    }

    if (
      description.length >
      MAX_DESCRIPTION_LENGTH
    ) {
      showFieldError(
        resourceDescription,
        descriptionError,
        "Resource description cannot exceed 2000 characters.",
      );

      valid = false;
    }

    // ---------------------------------------------------------
    // CATEGORY
    // ---------------------------------------------------------

    if (!category) {
      showFieldError(
        resourceCategory,
        categoryError,
        "Please select a resource category.",
      );

      valid = false;
    }

    if (
      category.length >
      MAX_CATEGORY_LENGTH
    ) {
      showFieldError(
        resourceCategory,
        categoryError,
        "Resource category is too long.",
      );

      valid = false;
    }

    // ---------------------------------------------------------
    // LOCATION
    // ---------------------------------------------------------

    if (
      locationText.length >
      MAX_LOCATION_LENGTH
    ) {
      showFieldError(
        resourceLocation,
        locationError,
        "Location cannot exceed 300 characters.",
      );

      valid = false;
    }

    // ---------------------------------------------------------
    // PRICING
    // ---------------------------------------------------------

    const hourlyPriceResult =
      validatePriceField(
        pricePerHour,
        pricePerHourError,
        "Price per hour",
      );

    const dailyPriceResult =
      validatePriceField(
        pricePerDay,
        pricePerDayError,
        "Price per day",
      );

    const purchasePriceResult =
      validatePriceField(
        buyPrice,
        buyPriceError,
        "Buy price",
      );

    if (!hourlyPriceResult.valid) {
      valid = false;
    }

    if (!dailyPriceResult.valid) {
      valid = false;
    }

    if (
      !purchasePriceResult.valid
    ) {
      valid = false;
    }

    const hourlyPrice =
      hourlyPriceResult.value ?? 0;

    const dailyPrice =
      dailyPriceResult.value ?? 0;

    const purchasePrice =
      purchasePriceResult.value ?? 0;

    // ---------------------------------------------------------
    // IMAGE
    // ---------------------------------------------------------

    if (!selectedImageFile) {
      showFieldError(
        resourceImage,
        imageError,
        "Please select an image.",
      );

      valid = false;
    }

    if (!valid) {
      return;
    }

    // ---------------------------------------------------------
    // SUPABASE
    // ---------------------------------------------------------

    let supabase;

    try {
      supabase =
        getSupabaseClient();
    } catch (error) {
      console.error(
        "Supabase client error:",
        error,
      );

      showFormMessage(
        "Supabase is not available. Please refresh the page.",
        "error",
      );

      return;
    }

    // ---------------------------------------------------------
    // GET AUTHENTICATED USER
    // ---------------------------------------------------------

    let user;

    try {
      const {
        data,
        error,
      } = await supabase.auth.getUser();

      if (
        error ||
        !data?.user?.id
      ) {
        redirectToLogin();
        return;
      }

      user = data.user;

      // Keep the verified ID synchronized
      // with the exact user performing submission.
      verifiedUserId = user.id;
    } catch (error) {
      console.error(
        "User lookup failed:",
        error,
      );

      showFormMessage(
        "Your session could not be verified. Please log in again.",
        "error",
      );

      return;
    }

    // ---------------------------------------------------------
    // START SUBMISSION
    // ---------------------------------------------------------

    isSubmitting = true;

    if (submitResourceBtn) {
      submitResourceBtn.disabled =
        true;

      setButtonContent(
        submitResourceBtn,
        "fa-solid fa-spinner fa-spin",
        "Uploading Image...",
      );
    }

    let uploadedFilePath = null;

    try {
      // -------------------------------------------------------
      // 1. CREATE STORAGE PATH
      // -------------------------------------------------------

      const extension =
        getFileExtension(
          selectedImageFile,
        );

      const randomId =
        generateRandomId();

      const filename =
        `${randomId}.${extension}`;

      uploadedFilePath =
        `${user.id}/${filename}`;

      // -------------------------------------------------------
      // 2. UPLOAD IMAGE
      // -------------------------------------------------------

      const {
        error: uploadError,
      } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(
          uploadedFilePath,
          selectedImageFile,
          {
            cacheControl: "3600",
            contentType:
              selectedImageFile.type,
            upsert: false,
          },
        );

      if (uploadError) {
        console.error(
          "EcoShare: Image upload failed:",
          uploadError,
        );

        throw new Error(
          "Unable to upload the image.",
        );
      }

      // -------------------------------------------------------
      // 3. GET PUBLIC URL
      // -------------------------------------------------------

      const {
        data: publicUrlData,
      } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(
          uploadedFilePath,
        );

      const imageUrl =
        publicUrlData?.publicUrl ||
        null;

      if (!imageUrl) {
        throw new Error(
          "Unable to create a valid image URL.",
        );
      }

      // -------------------------------------------------------
      // 4. VALIDATE IMAGE URL
      // -------------------------------------------------------

      if (
        !isSafeResourceImageUrl(
          imageUrl,
        )
      ) {
        throw new Error(
          "Unable to create a valid image URL.",
        );
      }

      // -------------------------------------------------------
      // 5. CREATE RESOURCE
      // -------------------------------------------------------

      if (submitResourceBtn) {
        setButtonContent(
          submitResourceBtn,
          "fa-solid fa-spinner fa-spin",
          "Saving Resource...",
        );
      }

      /*
       * Important:
       * Resource creation is handled by the secure
       * create_resource() RPC.
       *
       * The browser does not directly insert owner_id.
       * The RPC must use auth.uid() server-side.
       */

      const rpcPayload = {
        p_title: title,
        p_description: description,
        p_category: category,
        p_location:
          locationText || null,
        p_image_url: imageUrl,
        p_latitude:
          currentLatitude,
        p_longitude:
          currentLongitude,

        // =====================================================
        // PRICING
        // =====================================================

        p_price_per_hour:
          hourlyPrice,

        p_price_per_day:
          dailyPrice,

        p_buy_price:
          purchasePrice,
      };

      console.log(
        "EcoShare: Creating resource through RPC:",
        rpcPayload,
      );

      const {
        data: resourceId,
        error: resourceError,
      } = await supabase.rpc(
        CREATE_RESOURCE_RPC,
        rpcPayload,
      );

      if (resourceError) {
        console.error(
          "EcoShare: Resource creation failed:",
          resourceError,
        );

        throw new Error(
          getSafeResourceErrorMessage(
            resourceError,
          ),
        );
      }

      if (
        resourceId === null ||
        resourceId === undefined ||
        resourceId === ""
      ) {
        throw new Error(
          "Resource was not created successfully.",
        );
      }

      console.log(
        "EcoShare: Resource created:",
        resourceId,
      );

      // -------------------------------------------------------
      // SUCCESS
      // -------------------------------------------------------

      showFormMessage(
        "Your resource has been shared successfully!",
        "success",
      );

      if (submitResourceBtn) {
        setButtonContent(
          submitResourceBtn,
          "fa-solid fa-check",
          "Shared Successfully",
        );
      }

      // The image now belongs to the resource.
      uploadedFilePath = null;

      setTimeout(() => {
        window.location.href =
          EXPLORE_URL;
      }, 1000);
    } catch (error) {
      console.error(
        "EcoShare: Share resource error:",
        error,
      );

      // -------------------------------------------------------
      // CLEANUP IMAGE IF RPC/DB CREATION FAILED
      // -------------------------------------------------------

      if (uploadedFilePath) {
        try {
          const {
            error: cleanupError,
          } = await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([
              uploadedFilePath,
            ]);

          if (cleanupError) {
            console.error(
              "EcoShare: Image cleanup failed:",
              cleanupError,
            );
          }
        } catch (cleanupError) {
          console.error(
            "EcoShare: Storage cleanup error:",
            cleanupError,
          );
        }
      }

      showFormMessage(
        getSafeSubmitErrorMessage(
          error,
        ),
        "error",
      );

      resetSubmitButton();

      isSubmitting = false;
    }
  }

  // =========================================================
  // SAFE IMAGE URL VALIDATION
  // =========================================================

  function isSafeResourceImageUrl(
    imageUrl,
  ) {
    if (
      typeof imageUrl !== "string" ||
      !imageUrl.trim()
    ) {
      return false;
    }

    try {
      const url =
        new URL(imageUrl.trim());

      if (
        url.protocol !== "https:"
      ) {
        return false;
      }

      if (
        url.origin !==
        SUPABASE_ORIGIN
      ) {
        return false;
      }

      if (
        url.username ||
        url.password
      ) {
        return false;
      }

      if (
        url.search ||
        url.hash
      ) {
        return false;
      }

      const expectedPrefix =
        `/storage/v1/object/public/${STORAGE_BUCKET}/`;

      if (
        !url.pathname.startsWith(
          expectedPrefix,
        )
      ) {
        return false;
      }

      const objectPath =
        url.pathname.slice(
          expectedPrefix.length,
        );

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

      let decodedPath;

      try {
        decodedPath =
          decodeURIComponent(
            objectPath,
          );
      } catch {
        return false;
      }

      if (
        decodedPath.includes("..") ||
        decodedPath.includes("\\") ||
        decodedPath.includes("//")
      ) {
        return false;
      }

      const firstSlash =
        decodedPath.indexOf("/");

      if (firstSlash <= 0) {
        return false;
      }

      const ownerFolder =
        decodedPath.slice(
          0,
          firstSlash,
        );

      if (
        ownerFolder !==
        getAuthenticatedUserId()
      ) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  function getAuthenticatedUserId() {
    return verifiedUserId;
  }

  // =========================================================
  // FILE EXTENSION
  // =========================================================

  function getFileExtension(file) {
    switch (file.type) {
      case "image/jpeg":
        return "jpg";

      case "image/png":
        return "png";

      case "image/webp":
        return "webp";

      default:
        throw new Error(
          "Unsupported image type.",
        );
    }
  }

  // =========================================================
  // RANDOM FILE ID
  // =========================================================

  function generateRandomId() {
    if (
      window.crypto &&
      typeof window.crypto
        .randomUUID === "function"
    ) {
      return window.crypto.randomUUID();
    }

    return (
      Date.now().toString(36) +
      "-" +
      Math.random()
        .toString(36)
        .slice(2)
    );
  }

  // =========================================================
  // ERROR HANDLING
  // =========================================================

  function showFieldError(
    input,
    errorElement,
    message,
  ) {
    const formGroup =
      input?.closest(
        ".form-group",
      );

    if (formGroup) {
      formGroup.classList.add(
        "has-error",
      );
    }

    if (errorElement) {
      errorElement.textContent =
        message;
    }
  }

  function clearErrors() {
    document
      .querySelectorAll(
        ".form-group.has-error",
      )
      .forEach((group) => {
        group.classList.remove(
          "has-error",
        );
      });

    if (titleError) {
      titleError.textContent = "";
    }

    if (descriptionError) {
      descriptionError.textContent =
        "";
    }

    if (categoryError) {
      categoryError.textContent = "";
    }

    if (locationError) {
      locationError.textContent = "";
    }

    if (pricePerHourError) {
      pricePerHourError.textContent =
        "";
    }

    if (pricePerDayError) {
      pricePerDayError.textContent =
        "";
    }

    if (buyPriceError) {
      buyPriceError.textContent = "";
    }

    if (imageError) {
      imageError.textContent = "";
    }
  }

  function clearImageError() {
    if (imageError) {
      imageError.textContent = "";
    }

    if (resourceImage) {
      const formGroup =
        resourceImage.closest(
          ".form-group",
        );

      if (formGroup) {
        formGroup.classList.remove(
          "has-error",
        );
      }
    }
  }

  function showFormMessage(
    message,
    type,
  ) {
    if (!formMessage) {
      return;
    }

    const allowedTypes = [
      "success",
      "error",
      "info",
    ];

    const safeType =
      allowedTypes.includes(type)
        ? type
        : "info";

    formMessage.textContent =
      message;

    formMessage.className =
      `form-message ${safeType}`;
  }

  function hideFormMessage() {
    if (!formMessage) {
      return;
    }

    formMessage.textContent = "";

    formMessage.className =
      "form-message";
  }

  function getSafeResourceErrorMessage(
    error,
  ) {
    const message = String(
      error?.message ||
        error?.details ||
        error?.hint ||
        "",
    ).toLowerCase();

    if (
      message.includes(
        "row-level security",
      ) ||
      message.includes(
        "violates row-level security",
      ) ||
      message.includes(
        "permission denied",
      ) ||
      message.includes(
        "not authorized",
      )
    ) {
      return "You are not authorized to create this resource.";
    }

    if (
      message.includes(
        "foreign key",
      ) ||
      message.includes(
        "owner_id",
      ) ||
      message.includes(
        "profile",
      )
    ) {
      return "Your profile could not be verified. Please complete your profile and try again.";
    }

    if (
      message.includes(
        "latitude",
      ) ||
      message.includes(
        "longitude",
      ) ||
      message.includes(
        "location",
      )
    ) {
      return "The resource location could not be saved. Please check it and try again.";
    }

    if (
      message.includes("price") ||
      message.includes(
        "numeric",
      ) ||
      message.includes(
        "negative",
      )
    ) {
      return "One or more prices are invalid. Please check the pricing fields and try again.";
    }

    if (
      message.includes("bucket") ||
      message.includes("storage") ||
      message.includes("object")
    ) {
      return "The resource image could not be uploaded. Please try again.";
    }

    if (
      message.includes(
        "image url",
      ) ||
      message.includes("image")
    ) {
      return "The resource image could not be validated. Please try again.";
    }

    if (
      message.includes(
        "duplicate",
      )
    ) {
      return "This resource could not be created because a duplicate record was detected.";
    }

    if (
      message.includes(
        "function",
      ) &&
      message.includes(
        "create_resource",
      )
    ) {
      return "The resource creation backend is not updated yet. Please update the create_resource function in Supabase.";
    }

    return "Unable to save your resource. Please check your information and try again.";
  }

  function getSafeSubmitErrorMessage(
    error,
  ) {
    const message =
      String(
        error?.message || "",
      ).trim();

    if (!message) {
      return "Unable to share your resource right now. Please try again.";
    }

    const knownMessages = [
      "Unable to upload the image.",
      "Unable to create a valid image URL.",
      "Resource was not created successfully.",
    ];

    if (
      knownMessages.includes(
        message,
      )
    ) {
      return message;
    }

    return getSafeResourceErrorMessage(
      error,
    );
  }

  // =========================================================
  // SUBMIT BUTTON
  // =========================================================

  function resetSubmitButton() {
    if (!submitResourceBtn) {
      return;
    }

    submitResourceBtn.disabled =
      false;

    setButtonContent(
      submitResourceBtn,
      "fa-solid fa-hand-holding-heart",
      "Share Resource",
    );
  }

  function setButtonContent(
    button,
    iconClass,
    text,
  ) {
    if (!button) {
      return;
    }

    button.replaceChildren();

    if (iconClass) {
      const icon =
        document.createElement(
          "i",
        );

      icon.className = iconClass;

      icon.setAttribute(
        "aria-hidden",
        "true",
      );

      button.appendChild(icon);
    }

    button.appendChild(
      document.createTextNode(
        iconClass
          ? ` ${text}`
          : text,
      ),
    );
  }



  // =========================================================
  // HEADER SCROLL
  // =========================================================

  function setupHeaderScroll() {
    const header =
      document.querySelector(
        ".header",
      );

    if (!header) {
      return;
    }

    function updateHeader() {
      if (window.scrollY > 10) {
        header.classList.add(
          "scrolled",
        );
      } else {
        header.classList.remove(
          "scrolled",
        );
      }
    }

    window.addEventListener(
      "scroll",
      updateHeader,
      {
        passive: true,
      },
    );

    updateHeader();
  }

  // =========================================================
  // CLEANUP
  // =========================================================

  window.addEventListener(
    "beforeunload",
    () => {
      if (previewObjectUrl) {
        URL.revokeObjectURL(
          previewObjectUrl,
        );

        previewObjectUrl = null;
      }
    },
  );
})();