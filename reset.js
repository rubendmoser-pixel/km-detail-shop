const resetToken = new URLSearchParams(window.location.search).get("token");
const requestForm = document.querySelector("#requestResetForm");
const completeForm = document.querySelector("#completeResetForm");
const resetMessage = document.querySelector("#resetMessage");

document.querySelectorAll("[data-toggle-password]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.querySelector(button.dataset.togglePassword || "");
    if (!input) return;
    const willShow = input.type === "password";
    input.type = willShow ? "text" : "password";
    button.textContent = willShow ? "Ocultar" : "Ver";
    button.setAttribute("aria-label", willShow ? "Ocultar contraseña" : "Mostrar contraseña");
    button.setAttribute("aria-pressed", String(willShow));
  });
});

if (resetToken) {
  requestForm.hidden = true;
  completeForm.hidden = false;
  document.querySelector("#resetTitle").textContent = "Crear nueva contrasena";
}

requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(requestForm));
  setResetBusy(requestForm, true);
  try {
    await resetApi("/api/auth/forgot-password", { email: values.email });
    requestForm.reset();
    resetMessage.textContent = "Si la cuenta existe, enviamos un enlace de recuperacion.";
  } catch (error) {
    window.KMForms?.showApiError(requestForm, error, resetMessage);
  } finally {
    setResetBusy(requestForm, false);
  }
});

completeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(completeForm));
  completeForm.elements.passwordConfirmation.setCustomValidity("");
  if (values.password !== values.passwordConfirmation) {
    completeForm.elements.passwordConfirmation.setCustomValidity("Las contraseñas no coinciden.");
    completeForm.reportValidity();
    return;
  }
  setResetBusy(completeForm, true);
  try {
    await resetApi("/api/auth/reset-password", { token: resetToken, password: values.password });
    completeForm.hidden = true;
    resetMessage.innerHTML = `Contrasena actualizada. <a href="/">Ya podes ingresar</a>.`;
  } catch (error) {
    window.KMForms?.showApiError(completeForm, error, resetMessage);
  } finally {
    setResetBusy(completeForm, false);
  }
});

async function resetApi(url, body) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "No se pudo completar la operación.");
    error.status = response.status;
    error.details = payload.details || {};
    throw error;
  }
  return payload;
}

function setResetBusy(form, busy) {
  form.querySelectorAll("button,input").forEach((control) => { control.disabled = busy; });
}
