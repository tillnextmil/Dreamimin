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
     only for "confirm"; Escape and a click on the dim area outside the box resolve to false.
     It answers as soon as the dialog closes (its open attribute goes), not on the "close" event:
     browsers send that event with the next painted frame, so in a tab that isn't painting a late
     event could answer for the wrong opening. */
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
      const watch = new MutationObserver(() => {
        if (dialog.open) return;
        watch.disconnect();
        resolve(dialog.returnValue === "confirm");
      });
      watch.observe(dialog, { attributes: true, attributeFilter: ["open"] });
    });
  }

  D.views = D.views || {};
  D.views.fields = { showFieldError, confirm };
})(window.Dreamimin);
