const root = document.documentElement;
const clientId = root.dataset.googleClientId;
const signinContainer = document.getElementById("google-signin");
const profile = document.getElementById("profile");
const signOutButton = document.getElementById("signout");
const clientWarning = document.getElementById("client-warning");

const handleCredentialResponse = (response) => {
  try {
    const payload = decodeJwt(response.credential);
    populateProfile(payload);
  } catch (error) {
    console.error("Failed to parse Google credential", error);
    showToast("Could not decode Google credential. Check the browser console for details.");
  }
};

const populateProfile = ({ name, email, picture }) => {
  const avatar = document.getElementById("profile-picture");
  const nameNode = document.getElementById("profile-name");
  const emailNode = document.getElementById("profile-email");

  avatar.src = picture;
  avatar.referrerPolicy = "no-referrer";
  nameNode.textContent = name ?? "Unknown user";
  emailNode.textContent = email ?? "";

  profile.hidden = false;
  signOutButton.hidden = false;
};

const decodeJwt = (token) => {
  const [, payload] = token.split(".");
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const json = decodeURIComponent(
    atob(normalized)
      .split("")
      .map((c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`)
      .join("")
  );
  return JSON.parse(json);
};

const showToast = (message) => {
  const template = document.getElementById("error-template");
  const toast = template.content.firstElementChild.cloneNode(true);
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
};

const initialize = () => {
  if (!clientId || clientId.startsWith("YOUR_GOOGLE_CLIENT_ID")) {
    clientWarning.hidden = false;
    console.warn(
      "Set your Google OAuth client ID by replacing YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com on the <html> element."
    );
    return;
  }

  if (!window.google || !window.google.accounts || !window.google.accounts.id) {
    showToast("Google Identity Services failed to load.");
    return;
  }

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: handleCredentialResponse,
    auto_select: false,
    cancel_on_tap_outside: true,
  });

  window.google.accounts.id.renderButton(signinContainer, {
    theme: "outline",
    size: "large",
    type: "standard",
    shape: "pill",
    text: "signin_with",
  });

  window.google.accounts.id.prompt();
};

const awaitGoogleLibrary = () => {
  const googleScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');

  if (window.google?.accounts?.id) {
    initialize();
    return;
  }

  if (!googleScript) {
    showToast("Google Identity Services script tag is missing.");
    return;
  }

  googleScript.addEventListener("load", initialize, { once: true });
  googleScript.addEventListener(
    "error",
    () => showToast("Google Identity Services failed to load. Check your network connection."),
    { once: true }
  );
};

signOutButton.addEventListener("click", () => {
  window.google?.accounts.id.disableAutoSelect();
  profile.hidden = true;
  signOutButton.hidden = true;
});

window.addEventListener("DOMContentLoaded", awaitGoogleLibrary);
