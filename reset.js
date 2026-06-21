const resetToken = new URLSearchParams(window.location.search).get("token");
const requestForm = document.querySelector("#requestResetForm");
const completeForm = document.querySelector("#completeResetForm");
const resetMessage = document.querySelector("#resetMessage");

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
    resetMessage.textContent = error.message;
  } finally {
    setResetBusy(requestForm, false);
  }
});

completeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(completeForm));
  if (values.password !== values.passwordConfirmation) {
    resetMessage.textContent = "Las contrasenas no coinciden.";
    return;
  }
  setResetBusy(completeForm, true);
  try {
    await resetApi("/api/auth/reset-password", { token: resetToken, password: values.password });
    completeForm.hidden = true;
    resetMessage.innerHTML = `Contrasena actualizada. <a href="/">Ya podes ingresar</a>.`;
  } catch (error) {
    resetMessage.textContent = error.message;
  } finally {
    setResetBusy(completeForm, false);
  }
});

async function resetApi(url, body) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "No se pudo completar la operacion.");
  return payload;
}

function setResetBusy(form, busy) {
  form.querySelectorAll("button,input").forEach((control) => { control.disabled = busy; });
}
