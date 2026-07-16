import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEmail, publicErrorMessage, requiredText } from "../server/domain/validation.js";

test("las validaciones comunes informan el campo claramente en español", () => {
  assert.throws(
    () => requiredText("", "businessName"),
    (error) => error.message === "Completá razón social." && error.details.field === "businessName"
  );
  assert.throws(
    () => normalizeEmail("correo-invalido"),
    (error) => /email válido/i.test(error.message) && error.details.field === "email"
  );
});

test("los errores heredados en inglés no se muestran al usuario", () => {
  assert.equal(publicErrorMessage(new Error("Customer not found"), 404), "No encontramos el cliente.");
  assert.equal(publicErrorMessage(new Error("unexpected order validation message"), 400), "Revisá los datos ingresados e intentá nuevamente.");
});
