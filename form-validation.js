(function setupKmFormValidation(global) {
  const FIELD_LABELS = {
    name: "nombre",
    firstName: "nombre",
    lastName: "apellido",
    businessName: "razón social o comercio",
    taxId: "CUIT",
    taxCondition: "condición fiscal",
    customerType: "tipo de cliente",
    industry: "rubro",
    city: "localidad",
    province: "provincia",
    postalCode: "código postal",
    address: "dirección",
    phone: "teléfono",
    whatsapp: "WhatsApp",
    contactPerson: "persona de contacto",
    email: "email",
    password: "contraseña",
    passwordConfirmation: "confirmación de contraseña",
    passwordConfirm: "confirmación de contraseña",
    portalPassword: "clave del vendedor",
    portalPasswordConfirmation: "confirmación de la clave",
    status: "estado",
    defaultCommission: "comisión general"
  };

  function fieldLabel(input) {
    return input?.dataset?.fieldLabel
      || FIELD_LABELS[input?.name]
      || input?.closest("label")?.querySelector(":scope > span")?.textContent?.trim().toLowerCase()
      || "campo";
  }

  function validationMessage(input) {
    const label = fieldLabel(input);
    const validity = input.validity;
    if (validity.customError) return input.validationMessage;
    if (validity.valueMissing) {
      if (input.type === "checkbox") return `Tenés que aceptar ${label}.`;
      if (input.tagName === "SELECT") return `Seleccioná ${label}.`;
      return `Completá ${label}.`;
    }
    if (validity.typeMismatch && input.type === "email") return "Ingresá un email válido, por ejemplo nombre@empresa.com.";
    if (validity.tooShort) return `${capitalize(label)} debe tener al menos ${input.minLength} caracteres.`;
    if (validity.tooLong) return `${capitalize(label)} puede tener como máximo ${input.maxLength} caracteres.`;
    if (validity.rangeUnderflow) return `${capitalize(label)} debe ser igual o mayor que ${input.min}.`;
    if (validity.rangeOverflow) return `${capitalize(label)} debe ser igual o menor que ${input.max}.`;
    if (validity.badInput) return `Ingresá un valor válido para ${label}.`;
    if (validity.stepMismatch) return `Revisá el valor ingresado en ${label}.`;
    if (validity.patternMismatch) return `Revisá el formato de ${label}.`;
    return `Revisá ${label}.`;
  }

  function capitalize(text) {
    return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "El campo";
  }

  function errorNode(input) {
    const container = input.closest("label") || input.parentElement;
    if (!container) return null;
    let node = container.querySelector(":scope > .field-error");
    if (!node) {
      node = document.createElement("small");
      node.className = "field-error";
      node.setAttribute("role", "alert");
      container.append(node);
    }
    return node;
  }

  function showFieldError(input, message) {
    if (!input) return;
    const node = errorNode(input);
    if (node) node.textContent = message;
    input.setAttribute("aria-invalid", "true");
    input.closest(".password-control, .password-input")?.classList.add("has-error");
  }

  function clearFieldError(input) {
    if (!input) return;
    const container = input.closest("label") || input.parentElement;
    container?.querySelector(":scope > .field-error")?.remove();
    input.removeAttribute("aria-invalid");
    input.closest(".password-control, .password-input")?.classList.remove("has-error");
    if (input.validity?.customError) input.setCustomValidity("");
  }

  function showApiError(form, error, messageNode) {
    const field = error?.details?.field;
    const input = field && form?.elements?.namedItem?.(field);
    const message = error?.message || "No se pudo completar la operación.";
    if (input instanceof HTMLElement) {
      showFieldError(input, message);
      input.focus({ preventScroll: true });
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (messageNode) {
      messageNode.textContent = message;
      messageNode.classList.add("is-error");
      messageNode.classList.remove("is-success");
    }
  }

  function setup(root = document) {
    let firstInvalid = null;
    root.addEventListener("invalid", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement)) return;
      event.preventDefault();
      showFieldError(input, validationMessage(input));
      if (!firstInvalid) {
        firstInvalid = input;
        queueMicrotask(() => {
          firstInvalid?.focus({ preventScroll: true });
          firstInvalid?.scrollIntoView({ behavior: "smooth", block: "center" });
          firstInvalid = null;
        });
      }
    }, true);
    ["input", "change"].forEach((eventName) => root.addEventListener(eventName, (event) => clearFieldError(event.target), true));
  }

  global.KMForms = { setup, showFieldError, clearFieldError, showApiError };
  setup();
})(window);
