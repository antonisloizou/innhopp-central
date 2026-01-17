const STATUS_OPTIONS = ["draft", "planned", "scouted", "launched", "live", "past"];

const state = {
  seasons: [],
  participants: [],
  events: [],
  selectedEventId: null,
};

const flash = document.getElementById("flash");
const createForm = document.getElementById("create-form");
const editForm = document.getElementById("edit-form");
const eventList = document.getElementById("event-list");
const deleteButton = document.getElementById("delete-event");
const manageHint = document.getElementById("manage-hint");
const innhoppTemplate = document.getElementById("innhopp-row-template");

initialize().catch((error) => {
  console.error("Failed to initialise event manager", error);
  showMessage("error", error.message || "Failed to load event data.");
});

async function initialize() {
  populateStatusSelects();
  bindCreateForm();
  bindEditForm();

  await Promise.all([loadSeasons(), loadParticipants()]);
  renderParticipants(createForm, []);
  renderParticipants(editForm, []);

  await loadEvents();
}

function bindCreateForm() {
  if (!createForm) {
    return;
  }

  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = buildEventPayload(createForm);
      const created = await requestJSON("/api/events/events", { method: "POST", body: payload });
      upsertEvent(created);
      createForm.reset();
      renderParticipants(createForm, []);
      clearInnhopps(createForm);
      showMessage("success", `Created “${created.name}”.`);
    } catch (error) {
      console.error("Failed to create event", error);
      showMessage("error", error.message || "Could not create event.");
    }
  });

  createForm.addEventListener("reset", () => {
    window.requestAnimationFrame(() => {
      renderParticipants(createForm, []);
      clearInnhopps(createForm);
    });
  });

  createForm.addEventListener("click", handleInnhoppActions);
}

function bindEditForm() {
  if (!editForm) {
    return;
  }

  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const eventId = Number(editForm.dataset.eventId);
    if (!eventId) {
      return;
    }

    try {
      const payload = buildEventPayload(editForm);
      const updated = await requestJSON(`/api/events/events/${eventId}`, { method: "PUT", body: payload });
      upsertEvent(updated);
      selectEvent(updated.id);
      showMessage("success", `Saved changes to “${updated.name}”.`);
    } catch (error) {
      console.error("Failed to update event", error);
      showMessage("error", error.message || "Could not update event.");
    }
  });

  editForm.addEventListener("click", handleInnhoppActions);

  if (deleteButton) {
    deleteButton.addEventListener("click", async () => {
      const eventId = Number(editForm.dataset.eventId);
      if (!eventId) {
        return;
      }
      const event = state.events.find((entry) => entry.id === eventId);
      const confirmed = window.confirm(`Delete “${event?.name ?? "this event"}”? This cannot be undone.`);
      if (!confirmed) {
        return;
      }

      try {
        await requestJSON(`/api/events/events/${eventId}`, { method: "DELETE" });
        state.events = state.events.filter((entry) => entry.id !== eventId);
        state.selectedEventId = null;
        editForm.reset();
        editForm.hidden = true;
        renderParticipants(editForm, []);
        clearInnhopps(editForm);
        renderEventsList();
        manageHint.textContent = "Select an event from the list to review or update it.";
        showMessage("success", "Event deleted.");
      } catch (error) {
        console.error("Failed to delete event", error);
        showMessage("error", error.message || "Could not delete event.");
      }
    });
  }
}

function handleInnhoppActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const form = button.closest("form");
  if (!form) {
    return;
  }

  const container = form.querySelector('[data-role="innhopps"]');
  if (!container) {
    return;
  }

  const action = button.dataset.action;
  if (action === "add-innhopp") {
    event.preventDefault();
    addInnhoppRow(container);
  } else if (action === "remove-innhopp") {
    event.preventDefault();
    const row = button.closest(".innhopp-row");
    row?.remove();
  }
}

async function loadSeasons() {
  const seasons = await requestJSON("/api/events/seasons");
  state.seasons = Array.isArray(seasons) ? seasons : [];
  populateSeasonSelect(createForm, state.seasons);
  populateSeasonSelect(editForm, state.seasons);
}

async function loadParticipants() {
  const participants = await requestJSON("/api/participants/profiles");
  state.participants = Array.isArray(participants) ? participants : [];
}

async function loadEvents() {
  const events = await requestJSON("/api/events/events");
  state.events = Array.isArray(events) ? events : [];
  sortEvents();
  renderEventsList();
}

function populateStatusSelects() {
  document.querySelectorAll('select[name="status"]').forEach((select) => {
    select.innerHTML = "";
    STATUS_OPTIONS.forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = capitalize(status);
      select.append(option);
    });
    select.value = STATUS_OPTIONS[0];
  });
}

function populateSeasonSelect(form, seasons) {
  if (!form) {
    return;
  }
  const select = form.querySelector('select[name="season_id"]');
  if (!select) {
    return;
  }

  select.innerHTML = "";
  if (!seasons.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No seasons available";
    option.disabled = true;
    option.selected = true;
    select.append(option);
    select.disabled = true;
    return;
  }

  seasons.forEach((season) => {
    const option = document.createElement("option");
    option.value = String(season.id);
    const range = [formatDateOnly(season.starts_on), formatDateOnly(season.ends_on)]
      .filter(Boolean)
      .join(" → ");
    option.textContent = range ? `${season.name} (${range})` : season.name;
    select.append(option);
  });
  select.disabled = false;
}

function renderParticipants(form, selectedIds) {
  if (!form) {
    return;
  }
  const container = form.querySelector('[data-role="participants"]');
  if (!container) {
    return;
  }

  container.innerHTML = "";
  if (!state.participants.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No participant profiles available yet.";
    container.append(empty);
    return;
  }

  const selected = new Set(selectedIds ?? []);
  state.participants.forEach((participant) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "participant_ids";
    input.value = String(participant.id);
    if (selected.has(participant.id)) {
      input.checked = true;
    }
    const span = document.createElement("span");
    span.textContent = participant.full_name || participant.email || `Participant ${participant.id}`;
    label.append(input, span);
    container.append(label);
  });
}

function renderInnhopps(form, innhopps) {
  if (!form) {
    return;
  }
  const container = form.querySelector('[data-role="innhopps"]');
  if (!container) {
    return;
  }
  container.innerHTML = "";
  (innhopps ?? []).forEach((item) => addInnhoppRow(container, item));
}

function addInnhoppRow(container, data = {}) {
  if (!innhoppTemplate?.content) {
    return;
  }
  const row = innhoppTemplate.content.firstElementChild.cloneNode(true);
  const sequenceInput = row.querySelector(".innhopp-sequence");
  const nameInput = row.querySelector(".innhopp-name");
  const scheduledInput = row.querySelector(".innhopp-scheduled");
  const notesInput = row.querySelector(".innhopp-notes");

  if (sequenceInput && data.sequence) {
    sequenceInput.value = data.sequence;
  }
  if (nameInput && data.name) {
    nameInput.value = data.name;
  }
  if (scheduledInput && data.scheduled_at) {
    scheduledInput.value = toLocalInputValue(data.scheduled_at);
  }
  if (notesInput && data.notes) {
    notesInput.value = data.notes;
  }

  container.append(row);
}

function clearInnhopps(form) {
  const container = form.querySelector('[data-role="innhopps"]');
  if (container) {
    container.innerHTML = "";
  }
}

function renderEventsList() {
  eventList.innerHTML = "";
  if (!state.events.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No events scheduled yet.";
    eventList.append(empty);
    return;
  }

  state.events.forEach((event) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "event-row";
    if (event.id === state.selectedEventId) {
      button.classList.add("is-active");
    }

    const name = document.createElement("span");
    name.className = "event-row__name";
    name.textContent = event.name;

    const meta = document.createElement("span");
    meta.className = "event-row__meta";
    const formatted = formatDate(event.starts_at);
    meta.textContent = `${formatted} · ${capitalize(event.status)}`;

    button.append(name, meta);
    button.addEventListener("click", () => selectEvent(event.id));
    eventList.append(button);
  });
}

function selectEvent(eventId) {
  const event = state.events.find((entry) => entry.id === eventId);
  if (!event) {
    return;
  }

  state.selectedEventId = eventId;
  editForm.dataset.eventId = String(event.id);
  editForm.hidden = false;
  manageHint.textContent = `Editing “${event.name}”.`;

  const seasonSelect = editForm.querySelector('select[name="season_id"]');
  if (seasonSelect) {
    seasonSelect.value = String(event.season_id);
  }

  const nameInput = editForm.querySelector('input[name="name"]');
  if (nameInput) {
    nameInput.value = event.name;
  }

  const locationInput = editForm.querySelector('input[name="location"]');
  if (locationInput) {
    locationInput.value = event.location || "";
  }

  const statusSelect = editForm.querySelector('select[name="status"]');
  if (statusSelect) {
    statusSelect.value = event.status;
  }

  const startsInput = editForm.querySelector('input[name="starts_at"]');
  if (startsInput) {
    startsInput.value = toLocalInputValue(event.starts_at);
  }

  const endsInput = editForm.querySelector('input[name="ends_at"]');
  if (endsInput) {
    endsInput.value = event.ends_at ? toLocalInputValue(event.ends_at) : "";
  }

  renderParticipants(editForm, event.participant_ids ?? []);
  renderInnhopps(editForm, event.innhopps ?? []);
  renderEventsList();
}

function buildEventPayload(form) {
  const data = new FormData(form);
  const startsInput = form.querySelector('input[name="starts_at"]');
  const endsInput = form.querySelector('input[name="ends_at"]');
  const payload = {
    season_id: Number(data.get("season_id")),
    name: (data.get("name") || "").toString().trim(),
    location: (data.get("location") || "").toString().trim(),
    status: (data.get("status") || "").toString(),
    starts_at: toISOStringFromLocal(startsInput?.value ?? ""),
    participant_ids: Array.from(form.querySelectorAll('input[name="participant_ids"]:checked')).map((input) => Number(input.value)),
    innhopps: collectInnhopps(form.querySelector('[data-role="innhopps"]')),
  };

  const endsAt = toISOStringFromLocal(endsInput?.value ?? "");
  if (endsAt) {
    payload.ends_at = endsAt;
  }
  if (!payload.location) {
    delete payload.location;
  }

  return payload;
}

function collectInnhopps(container) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll(".innhopp-row"))
    .map((row) => {
      const sequenceInput = row.querySelector(".innhopp-sequence");
      const nameInput = row.querySelector(".innhopp-name");
      const scheduledInput = row.querySelector(".innhopp-scheduled");
      const notesInput = row.querySelector(".innhopp-notes");

      const entry = {
        name: nameInput?.value.trim() ?? "",
      };

    const sequenceValue = sequenceInput?.value.trim();
    if (sequenceValue) {
      entry.sequence = Number(sequenceValue);
    }

    const scheduledValue = scheduledInput?.value.trim();
    if (scheduledValue) {
      entry.scheduled_at = toISOStringFromLocal(scheduledValue);
    }

    const notesValue = notesInput?.value.trim();
    if (notesValue) {
      entry.notes = notesValue;
    }

      return entry;
    })
    .filter((entry) => entry.name);
}

function upsertEvent(event) {
  const index = state.events.findIndex((entry) => entry.id === event.id);
  if (index === -1) {
    state.events.push(event);
  } else {
    state.events[index] = event;
  }
  sortEvents();
  renderEventsList();
}

function sortEvents() {
  state.events.sort((a, b) => getEventLocalTime(b.starts_at) - getEventLocalTime(a.starts_at));
}

function showMessage(kind, message) {
  flash.textContent = message || "";
  flash.className = "flash";
  if (kind) {
    flash.classList.add(`flash--${kind}`);
  }
}

function formatDate(iso) {
  if (!iso) {
    return "Unscheduled";
  }
  const date = parseEventLocal(iso);
  if (!date) {
    return iso;
  }
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDateOnly(value) {
  if (!value) {
    return "";
  }
  const date = parseEventLocal(value);
  if (!date) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    dateStyle: "medium",
  }).format(date);
}

function toLocalInputValue(isoString) {
  if (!isoString) {
    return "";
  }
  return toEventLocalInput(isoString);
}

function toISOStringFromLocal(value) {
  if (!value) {
    return "";
  }
  return fromEventLocalInput(value);
}

function getEventLocalTime(value) {
  const date = parseEventLocal(value);
  return date ? date.getTime() : Number.NEGATIVE_INFINITY;
}

function parseEventLocal(value) {
  const parts = parseEventLocalParts(value);
  if (!parts) return null;
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseEventLocalParts(raw) {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/([+-]\d{2}:?\d{2}|Z)$/i, "");
  if (!trimmed) return null;
  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] || "0");
  const minute = Number(match[5] || "0");
  const second = Number(match[6] || "0");
  if ([year, month, day, hour, minute, second].some((v) => Number.isNaN(v))) return null;
  return { year, month, day, hour, minute, second };
}

function toEventLocalInput(value) {
  const date = parseEventLocal(value);
  if (!date) return "";
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function fromEventLocalInput(value) {
  const date = parseEventLocal(value);
  return date ? date.toISOString() : "";
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function capitalize(value) {
  if (!value) {
    return "";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function requestJSON(path, options = {}) {
  const config = {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {},
  };

  if (options.body !== undefined) {
    config.body = JSON.stringify(options.body);
    config.headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, config);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = text;
    }
  }

  if (!response.ok) {
    const message = typeof data === "object" && data !== null && "error" in data ? data.error : response.statusText;
    throw new Error(message || "Request failed");
  }

  return data;
}
