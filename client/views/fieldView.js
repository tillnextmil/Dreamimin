/* ============================================================
   Field and dialog views shared by the steps: an error message
   under a form field, and a confirm dialog that answers with a
   promise. Display only; the controllers decide what to show.
   ============================================================ */

(function (D) {
  "use strict";

  /* shows `message` under the field named `name` (or clears it with "") and marks the input */
  function showFieldError(form, name, message) {
    const error = document.getElementById(name + "-error");
    if (error) error.textContent = message;
    const input = form.elements[name];
    input.setAttribute("aria-invalid", message ? "true" : "false");
    input.closest(".field").classList.toggle("has-error", Boolean(message));
  }

  /* Opens a <dialog> whose buttons close it with value "confirm" or "cancel". Resolves to true
     only for "confirm"; Escape and a click on the dim area outside the box resolve to false. */
  function confirm(dialog) {
    if (!dialog.dataset.ready) {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();   // the dim area outside the box
      });
      dialog.dataset.ready = "true";
    }
    dialog.returnValue = "";
    dialog.showModal();
    return new Promise((resolve) => {
      dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
    });
  }

  D.views = D.views || {};
  D.views.fields = { showFieldError, confirm };
})(window.Dreamimin);
