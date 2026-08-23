const cfg = window.OGFN_CONFIG || {};

const $ = (selector) =>
  document.querySelector(selector);


/* YEAR */

$("#year").textContent =
  new Date().getFullYear();


/* PAYPAL */

$("#paypalBtn").addEventListener(
  "click",
  () => {

    if (
      !cfg.paypalUrl ||
      cfg.paypalUrl.includes("YOURNAME")
    ) {

      alert(
        "PayPal is not configured yet. " +
        "Edit config.js and set your public PayPal donation URL."
      );

      return;
    }

    window.open(
      cfg.paypalUrl,
      "_blank",
      "noopener,noreferrer"
    );
  }
);


/* MODAL */

const modal = $("#modal");


$("#manualBtn").addEventListener(
  "click",
  () => {

    modal.classList.remove("hidden");

  }
);


$("#closeModal").addEventListener(
  "click",
  () => {

    modal.classList.add("hidden");

  }
);


modal.addEventListener(
  "click",
  (event) => {

    if (event.target === modal) {

      modal.classList.add("hidden");

    }

  }
);


/* FORM */

$("#referenceForm").addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();

    const status =
      $("#formStatus");

    const formData =
      new FormData(event.target);

    const data =
      Object.fromEntries(
        formData.entries()
      );


    if (
      !cfg.workerUrl ||
      cfg.workerUrl.includes("YOUR-WORKER")
    ) {

      status.textContent =
        "The worker is not configured yet. " +
        "Set workerUrl in config.js.";

      return;
    }


    status.textContent =
      "Sending…";


    try {

      const response =
        await fetch(
          `${cfg.workerUrl.replace(/\/$/, "")}/api/donation-reference`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify(data)
          }
        );


      const result =
        await response.json();


      if (!response.ok) {

        throw new Error(
          result.error ||
          "Request failed"
        );

      }


      status.textContent =
        `Submitted successfully. Reference: ${result.id}`;


      event.target.reset();


    } catch (error) {

      status.textContent =
        error.message ||
        "Could not submit the reference.";

    }

  }
);