// Hide alert messages after 4 seconds

setTimeout(function () {

    const alerts =
        document.querySelectorAll(".alert");

    alerts.forEach(function (alert) {

        alert.style.display = "none";

    });

}, 4000);


// Set today's date in date fields

const dateInputs =
    document.querySelectorAll(
        'input[type="date"]'
    );

dateInputs.forEach(function (input) {

    if (!input.value) {

        input.value =
            new Date()
            .toISOString()
            .split("T")[0];

    }

});