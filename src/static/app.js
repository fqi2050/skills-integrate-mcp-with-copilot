document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const signupContainer = document.getElementById("signup-container");
  const messageDiv = document.getElementById("message");
  const accountToggle = document.getElementById("account-toggle");
  const accountMenu = document.getElementById("account-menu");
  const accountStatus = document.getElementById("account-status");
  const accountError = document.getElementById("account-error");
  const loginOpen = document.getElementById("login-open");
  const loginDialog = document.getElementById("login-dialog");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const logoutButton = document.getElementById("logout-button");
  let teacher = null;
  let csrfToken = null;

  function showMessage(element, text, type) {
    element.textContent = text;
    element.className = `message ${type}`;
    element.classList.remove("hidden");
    setTimeout(() => element.classList.add("hidden"), 5000);
  }

  function renderAccount() {
    const signedIn = teacher !== null;
    accountStatus.textContent = signedIn
      ? `Signed in as ${teacher}`
      : "Not signed in";
    loginOpen.classList.toggle("hidden", signedIn);
    logoutButton.classList.toggle("hidden", !signedIn);
    signupContainer.classList.toggle("hidden", !signedIn);
  }

  async function refreshSession() {
    const response = await fetch("/auth/session");
    if (!response.ok) {
      throw new Error("Could not check teacher sign-in status");
    }
    const session = await response.json();
    teacher = session.authenticated ? session.username : null;
    csrfToken = session.authenticated ? session.csrf_token : null;
    renderAccount();
  }

  // Load activity data and build the cards with text nodes to keep values inert.
  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      if (!response.ok) {
        throw new Error("Could not load activities");
      }
      const activities = await response.json();

      activitiesList.innerHTML = "";
      activitySelect.replaceChildren(activitySelect.options[0]);

      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";
        const spotsLeft =
          details.max_participants - details.participants.length;
        const title = document.createElement("h4");
        title.textContent = name;
        activityCard.appendChild(title);

        const description = document.createElement("p");
        description.textContent = details.description;
        activityCard.appendChild(description);

        const schedule = document.createElement("p");
        const scheduleLabel = document.createElement("strong");
        scheduleLabel.textContent = "Schedule: ";
        schedule.append(scheduleLabel, document.createTextNode(details.schedule));
        activityCard.appendChild(schedule);

        const availability = document.createElement("p");
        const availabilityLabel = document.createElement("strong");
        availabilityLabel.textContent = "Availability: ";
        availability.append(
          availabilityLabel,
          document.createTextNode(`${spotsLeft} spots left`)
        );
        activityCard.appendChild(availability);

        const participantsContainer = document.createElement("div");
        participantsContainer.className = "participants-container";
        if (details.participants.length > 0) {
          const participantsSection = document.createElement("div");
          participantsSection.className = "participants-section";
          const participantsTitle = document.createElement("h5");
          participantsTitle.textContent = "Participants:";
          participantsSection.appendChild(participantsTitle);
          const participantsList = document.createElement("ul");
          participantsList.className = "participants-list";

          details.participants.forEach((email) => {
            const participant = document.createElement("li");
            const emailSpan = document.createElement("span");
            emailSpan.className = "participant-email";
            emailSpan.textContent = email;
            participant.appendChild(emailSpan);

            if (teacher) {
              const removeButton = document.createElement("button");
              removeButton.className = "delete-btn";
              removeButton.type = "button";
              removeButton.textContent = "Remove";
              removeButton.setAttribute(
                "aria-label",
                `Unregister ${email} from ${name}`
              );
              removeButton.addEventListener("click", () =>
                handleUnregister(name, email)
              );
              participant.appendChild(removeButton);
            }
            participantsList.appendChild(participant);
          });
          participantsSection.appendChild(participantsList);
          participantsContainer.appendChild(participantsSection);
        } else {
          const emptyMessage = document.createElement("p");
          const emptyText = document.createElement("em");
          emptyText.textContent = "No participants yet";
          emptyMessage.appendChild(emptyText);
          participantsContainer.appendChild(emptyMessage);
        }
        activityCard.appendChild(participantsContainer);
        activitiesList.appendChild(activityCard);

        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });
    } catch (error) {
      activitiesList.innerHTML =
        "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  async function handleUnregister(activity, email) {
    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/unregister?email=${encodeURIComponent(email)}`,
        {
          method: "DELETE",
          headers: { "X-CSRF-Token": csrfToken },
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(messageDiv, result.message, "success");
        await fetchActivities();
      } else {
        showMessage(messageDiv, result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage(messageDiv, "Failed to unregister. Please try again.", "error");
      console.error("Error unregistering:", error);
    }
  }

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const activity = document.getElementById("activity").value;

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/signup?email=${encodeURIComponent(email)}`,
        {
          method: "POST",
          headers: { "X-CSRF-Token": csrfToken },
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(messageDiv, result.message, "success");
        signupForm.reset();
        await fetchActivities();
      } else {
        showMessage(messageDiv, result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage(messageDiv, "Failed to sign up. Please try again.", "error");
      console.error("Error signing up:", error);
    }
  });

  accountToggle.addEventListener("click", () => {
    const isExpanded = accountToggle.getAttribute("aria-expanded") === "true";
    accountToggle.setAttribute("aria-expanded", String(!isExpanded));
    accountMenu.classList.toggle("hidden", isExpanded);
  });

  loginOpen.addEventListener("click", () => {
    accountMenu.classList.add("hidden");
    accountToggle.setAttribute("aria-expanded", "false");
    loginError.classList.add("hidden");
    loginForm.reset();
    loginDialog.showModal();
  });

  document.getElementById("login-cancel").addEventListener("click", () => {
    loginDialog.close();
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.classList.add("hidden");
    const formData = new FormData(loginForm);
    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: formData.get("username"),
          password: formData.get("password"),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || "Could not sign in");
      }
      teacher = result.username;
      csrfToken = result.csrf_token;
      loginDialog.close();
      renderAccount();
      await fetchActivities();
    } catch (error) {
      loginError.textContent = error.message || "Could not sign in";
      loginError.classList.remove("hidden");
    }
  });

  logoutButton.addEventListener("click", async () => {
    accountError.classList.add("hidden");
    try {
      const response = await fetch("/auth/logout", {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || "Could not sign out");
      }
      teacher = null;
      csrfToken = null;
      renderAccount();
      accountMenu.classList.add("hidden");
      accountToggle.setAttribute("aria-expanded", "false");
      await fetchActivities();
    } catch (error) {
      accountError.textContent = error.message || "Could not sign out";
      accountError.classList.remove("hidden");
    }
  });

  refreshSession()
    .catch((error) => {
      accountError.textContent = error.message;
      accountError.classList.remove("hidden");
    })
    .finally(fetchActivities);
});
