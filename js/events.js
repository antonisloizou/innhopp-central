const statusOptions = ["draft", "planned", "scouted", "launched", "live", "past"];

let seasons = [];
let participants = [];
let participantMap = new Map();
let editingEventId = null;

const messageBox = document.getElementById("message");
const createForm = document.getElementById("create-event-form");
const updateForm = document.getElementById("update-event-form");
const eventsTableBody = document.querySelector("#events-table tbody");
const updateSubmit = document.getElementById("update-submit");
const updateCancel = document.getElementById("update-cancel");
const updateHint = document.getElementById("update-hint");

const createParticipantsContainer = document.getElementById("create-participants");
const updateParticipantsContainer = document.getElementById("update-participants");
const createInnhoppContainer = document.getElementById("create-innhopp-list");
const updateInnhoppContainer = document.getElementById("update-innhopp-list");
const addButtons = document.querySelectorAll('button[data-action="add-innhopp"]');

const seasonSelects = [document.getElementById("create-season"), document.getElementById("update-season")];
const statusSelects = [document.getElementById("create-status"), document.getElementById("update-status")];

init();

async function init() {
  fillStatusOptions();
  setUpdateFormDisabled(true);
  attachEventListeners();

  try {
    await loadReferenceData();
    await refreshEvents();
  } catch (error) {
    displayMessage(error.message, "error");
  }
}

function attachEventListeners() {
  createForm.addEventListener("submit", handleCreateEvent);
  createForm.addEventListener("reset", () => {
    renderParticipantOptions(createParticipantsContainer, []);
    renderInnhoppsList(createInnhoppContainer, []);
    clearMessage();
  });

  updateForm.addEventListener("submit", handleUpdateEvent);

  updateCancel.addEventListener("click", () => {
    editingEventId = null;
    updateForm.reset();
    renderParticipantOptions(updateParticipantsContainer, []);
    renderInnhoppsList(updateInnhoppContainer, []);
    setUpdateFormDisabled(true);
    updateHint.textContent = "Select an event from the list to start editing.";
    clearMessage();
  });

  addButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.target);
      addInnhoppRow(target);
    });
  });
}

function fillStatusOptions() {
  statusSelects.forEach((select) => {
    select.innerHTML = "";
    statusOptions.forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status.charAt(0).toUpperCase() + status.slice(1);
      select.append(option);
    });
    select.value = statusOptions[0];
  });
}

async function loadReferenceData() {
  const [seasonData, participantData] = await Promise.all([
    apiRequest("/api/events/seasons"),
    apiRequest("/api/participants/profiles"),
  ]);

  seasons = seasonData;
  participants = participantData;
  participantMap = new Map(participants.map((p) => [p.id, p]));

  seasonSelects.forEach((select) => populateSeasonSelect(select, seasons));
  renderParticipantOptions(createParticipantsContainer, []);
  renderParticipantOptions(updateParticipantsContainer, []);

  if (!seasons || seasons.length === 0) {
    setFormDisabled(createForm, true);
    displayMessage("Create a season before scheduling events.", "error");
  } else {
    setFormDisabled(createForm, false);
    clearMessage();
  }
}

function populateSeasonSelect(select, seasonList) {
  select.innerHTML = "";
  if (!seasonList || seasonList.length === 0) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "No seasons available";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.append(placeholder);
    select.disabled = true;
    return;
  }

  select.disabled = false;
  seasonList
    .slice()
    .sort((a, b) => new Date(b.starts_on) - new Date(a.starts_on))
    .forEach((season) => {
      const option = document.createElement("option");
      option.value = String(season.id);
      option.textContent = `${season.name} (${season.starts_on})`;
      select.append(option);
    });
}

function renderParticipantOptions(container, selectedIds) {
  container.innerHTML = "";
  const selected = new Set(selectedIds || []);

  if (participants.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No participant profiles available yet.";
    container.append(empty);
    return;
  }

  participants
    .slice()
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .forEach((participant) => {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = String(participant.id);
      checkbox.checked = selected.has(participant.id);
      label.append(checkbox, document.createTextNode(participant.full_name));
      container.append(label);
    });
}

function renderInnhoppsList(container, innhopps) {
  container.innerHTML = "";
  (innhopps || []).forEach((innhopp) => addInnhoppRow(container, innhopp));
}

function addInnhoppRow(container, innhopp = {}) {
  const row = document.createElement("div");
  row.className = "innhopp-row";

  const rowGrid = document.createElement("div");
  rowGrid.className = "row-grid";

  const nameField = document.createElement("div");
  nameField.className = "field";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "innhopp-name";
  nameInput.value = innhopp.name ? innhopp.name : "";
  nameField.append(nameLabel, nameInput);

  const scheduleField = document.createElement("div");
  scheduleField.className = "field";
  const scheduleLabel = document.createElement("label");
  scheduleLabel.textContent = "Scheduled";
  const scheduleInput = document.createElement("input");
  scheduleInput.type = "datetime-local";
  scheduleInput.className = "innhopp-scheduled";
  scheduleInput.value = innhopp.scheduled_at ? toLocalInputValue(innhopp.scheduled_at) : "";
  scheduleField.append(scheduleLabel, scheduleInput);

  rowGrid.append(nameField, scheduleField);

  const notesField = document.createElement("div");
  notesField.className = "field";
  const notesLabel = document.createElement("label");
  notesLabel.textContent = "Notes";
  const notesInput = document.createElement("textarea");
  notesInput.className = "innhopp-notes";
  notesInput.value = innhopp.notes ? innhopp.notes : "";
  notesField.append(notesLabel, notesInput);

  const actions = document.createElement("div");
  actions.className = "button-row";
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "ghost";
  removeButton.textContent = "Remove";
  removeButton.addEventListener("click", () => {
    row.remove();
  });
  actions.append(removeButton);

  row.append(rowGrid, notesField, actions);
  container.append(row);
}

async function handleCreateEvent(event) {
  event.preventDefault();

  try {
    const payload = collectEventPayload(createForm, createParticipantsContainer, createInnhoppContainer);
    const created = await apiRequest("/api/events/events", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    displayMessage(`Created event “${created.name}”.`, "success");
    createForm.reset();
    renderParticipantOptions(createParticipantsContainer, []);
    renderInnhoppsList(createInnhoppContainer, []);
    await refreshEvents();
  } catch (error) {
    displayMessage(error.message, "error");
  }
}

async function handleUpdateEvent(event) {
  event.preventDefault();
  if (!editingEventId) {
    displayMessage("Select an event to edit first.", "error");
    return;
  }

  try {
    const payload = collectEventPayload(updateForm, updateParticipantsContainer, updateInnhoppContainer);
    const updated = await apiRequest(`/api/events/events/${editingEventId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });

    displayMessage(`Updated event “${updated.name}”.`, "success");
    await refreshEvents();
    startEditingEvent(updated.id);
  } catch (error) {
    displayMessage(error.message, "error");
  }
}

function collectEventPayload(form, participantsContainer, innhoppContainer) {
  const data = new FormData(form);
  const seasonId = Number(data.get("season_id"));
  const name = data.get("name").trim();
  const location = data.get("location").trim();
  const status = data.get("status").trim();
  const startsAt = data.get("starts_at");
  const endsAt = data.get("ends_at");

  if (!seasonId) {
    throw new Error("Season is required");
  }
  if (!name) {
    throw new Error("Event name is required");
  }
  if (!startsAt) {
    throw new Error("A start time is required");
  }

  const participantIds = Array.from(
    participantsContainer.querySelectorAll("input[type='checkbox']:checked")
  ).map((checkbox) => Number(checkbox.value));

  const innhopps = collectInnhopps(innhoppContainer);

  return {
    season_id: seasonId,
    name,
    location,
    status,
    starts_at: toISOString(startsAt),
    ends_at: endsAt ? toISOString(endsAt) : "",
    participant_ids: participantIds,
    innhopps,
  };
}

function collectInnhopps(container) {
  const rows = Array.from(container.querySelectorAll(".innhopp-row"));
  return rows.map((row) => {
    const name = row.querySelector(".innhopp-name").value.trim();
    const scheduledValue = row.querySelector(".innhopp-scheduled").value;
    const notes = row.querySelector(".innhopp-notes").value.trim();

    if (!name) {
      throw new Error("All innhopps must have a name");
    }

    return {
      name,
      scheduled_at: scheduledValue ? toISOString(scheduledValue) : "",
      notes,
    };
  });
}

async function refreshEvents() {
  const eventData = await apiRequest("/api/events/events");
  renderEventsTable(eventData);
}

function renderEventsTable(eventList) {
  eventsTableBody.innerHTML = "";
  if (!eventList || eventList.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "No events scheduled yet.";
    row.append(cell);
    eventsTableBody.append(row);
    return;
  }

  eventList.forEach((event) => {
    const row = document.createElement("tr");

    const eventCell = document.createElement("td");
    const title = document.createElement("div");
    title.textContent = event.name;
    const statusTag = document.createElement("span");
    statusTag.className = "tag";
    statusTag.textContent = event.status;
    const location = document.createElement("div");
    location.textContent = event.location ? event.location : "—";
    eventCell.append(title, statusTag, location);

    const scheduleCell = document.createElement("td");
    scheduleCell.innerHTML = `${formatDateTime(event.starts_at)}<br />${event.ends_at ? formatDateTime(event.ends_at) : ""}`;

    const participantsCell = document.createElement("td");
    if (event.participant_ids && event.participant_ids.length > 0) {
      const list = document.createElement("ul");
      event.participant_ids.forEach((id) => {
        const item = document.createElement("li");
        const participant = participantMap.get(id);
        item.textContent = participant ? participant.full_name : `Participant #${id}`;
        list.append(item);
      });
      participantsCell.append(list);
    } else {
      participantsCell.textContent = "—";
    }

    const innhoppsCell = document.createElement("td");
    if (event.innhopps && event.innhopps.length > 0) {
      const list = document.createElement("ol");
      event.innhopps.forEach((innhopp) => {
        const item = document.createElement("li");
        const parts = [innhopp.name];
        if (innhopp.scheduled_at) {
          parts.push(formatDateTime(innhopp.scheduled_at));
        }
        if (innhopp.notes) {
          parts.push(innhopp.notes);
        }
        item.textContent = parts.join(" — ");
        list.append(item);
      });
      innhoppsCell.append(list);
    } else {
      innhoppsCell.textContent = "—";
    }

    const actionsCell = document.createElement("td");
    actionsCell.className = "actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "ghost";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => startEditingEvent(event.id));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "secondary";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => confirmDelete(event));

    actionsCell.append(editButton, deleteButton);

    row.append(eventCell, scheduleCell, participantsCell, innhoppsCell, actionsCell);
    eventsTableBody.append(row);
  });
}

async function startEditingEvent(eventId) {
  try {
    const event = await apiRequest(`/api/events/events/${eventId}`);
    editingEventId = event.id;
    setUpdateFormDisabled(false);
    updateSubmit.disabled = false;
    updateCancel.disabled = false;
    updateHint.textContent = `Editing event “${event.name}”.`;

    document.getElementById("update-season").value = String(event.season_id);
    document.getElementById("update-name").value = event.name;
    document.getElementById("update-location").value = event.location || "";
    document.getElementById("update-status").value = event.status;
    document.getElementById("update-starts").value = toLocalInputValue(event.starts_at);
    document.getElementById("update-ends").value = event.ends_at ? toLocalInputValue(event.ends_at) : "";

    renderParticipantOptions(updateParticipantsContainer, event.participant_ids || []);
    renderInnhoppsList(updateInnhoppContainer, event.innhopps || []);

    clearMessage();
  } catch (error) {
    displayMessage(error.message, "error");
  }
}

async function confirmDelete(event) {
  const confirmed = window.confirm(`Delete event “${event.name}”? This cannot be undone.`);
  if (!confirmed) {
    return;
  }

  try {
    await apiRequest(`/api/events/events/${event.id}`, { method: "DELETE" });
    displayMessage(`Deleted event “${event.name}”.`, "success");
    if (editingEventId === event.id) {
      updateCancel.click();
    }
    await refreshEvents();
  } catch (error) {
    displayMessage(error.message, "error");
  }
}

function setUpdateFormDisabled(disabled) {
  setFormDisabled(updateForm, disabled);
  if (disabled) {
    updateSubmit.disabled = true;
    updateCancel.disabled = true;
  }
}

function setFormDisabled(form, disabled) {
  Array.from(form.elements).forEach((element) => {
    element.disabled = disabled;
  });
}

function toISOString(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date provided");
  }
  return date.toISOString();
}

function toLocalInputValue(isoString) {
  if (!isoString) {
    return "";
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTime(isoString) {
  if (!isoString) {
    return "";
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

async function apiRequest(url, options = {}) {
  const config = {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  };

  const response = await fetch(url, config);

  let payload = null;
  if (response.status !== 204) {
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }
  }

  if (!response.ok) {
    const message = payload && payload.error ? payload.error : response.statusText;
    throw new Error(message || "Request failed");
  }

  return payload;
}

function displayMessage(message, type) {
  if (!messageBox) {
    return;
  }
  messageBox.textContent = message;
  messageBox.className = type === "error" ? "error" : "success";
}

function clearMessage() {
  if (!messageBox) {
    return;
  }
  messageBox.textContent = "";
  messageBox.className = "";
}
