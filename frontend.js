let rooms = [];
let customers = [];
let bookings = [];
let services = [];
let dashboardStats = { rooms: 0, available: 0, customers: 0, bookings: 0 };
let currentBookingId = null;

async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, {
        credentials: "same-origin",
        ...options,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers
        }
    });
    const responseText = await response.text();
    let data;
    try {
        data = JSON.parse(responseText);
    } catch {
        const contentType = response.headers.get("content-type") || "unknown content type";
        if (/^\s*</.test(responseText) || contentType.includes("text/html")) {
            throw new Error(
                `API request ${path} returned an HTML page instead of JSON (HTTP ${response.status}). ` +
                "Stop the current server, then run `.\\.venv\\bin\\python.exe .\\backened\\app.py` " +
                "from the project folder and open http://127.0.0.1:5000."
            );
        }
        throw new Error(
            `API request ${path} returned invalid JSON (HTTP ${response.status}; ${contentType}).`
        );
    }
    if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

async function runAction(callback) {
    try {
        await callback();
    } catch (error) {
        alert(error.message);
    }
}

async function refreshData() {
    const [stats, roomRows, customerRows, bookingRows] = await Promise.all([
        api("/dashboard"),
        api("/rooms"),
        api("/customers"),
        api("/bookings")
    ]);
    dashboardStats = stats;
    rooms = roomRows;
    customers = customerRows;
    bookings = bookingRows;
    renderRooms();
    renderCustomers();
    renderBookings();
    updateBookingOptions();
    renderBillingOptions();
    updateDashboard();
}

function setAuthenticated(authenticated) {
    document.getElementById("loginPage").style.display = authenticated ? "none" : "flex";
    document.getElementById("mainSystem").style.display = authenticated ? "block" : "none";
}

async function login() {
    await runAction(async () => {
        const username = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value;
        if (!username || !password) {
            throw new Error("Enter both username and password");
        }
        await api("/login", {
            method: "POST",
            body: JSON.stringify({ username, password })
        });
        setAuthenticated(true);
        await refreshData();
        document.getElementById("password").value = "";
    });
}

async function logout() {
    await runAction(async () => {
        await api("/logout", { method: "POST" });
        setAuthenticated(false);
        rooms = [];
        customers = [];
        bookings = [];
        currentBookingId = null;
    });
}

async function showPage(pageId, button) {
    document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
    document.getElementById(pageId).classList.add("active");
    document.querySelectorAll(".nav-links button").forEach(navButton => {
        navButton.classList.remove("active");
    });
    if (button) button.classList.add("active");
    await runAction(async () => {
        if (["rooms", "customers", "bookings", "dashboard", "billing"].includes(pageId)) {
            await refreshData();
        }
        if (pageId === "billing") {
            if (currentBookingId) {
                await openBill(currentBookingId);
            } else {
                clearBill();
            }
        }
        if (pageId === "reports") await renderReports();
    });
}

async function addRoom() {
    await runAction(async () => {
        const roomNo = document.getElementById("roomNo").value.trim();
        const roomType = document.getElementById("roomType").value;
        const price = Number(document.getElementById("roomPrice").value);
        if (!roomNo || !Number.isFinite(price) || price <= 0) {
            throw new Error("Enter a room number and a positive price");
        }
        await api("/rooms", {
            method: "POST",
            body: JSON.stringify({ room_no: roomNo, room_type: roomType, price })
        });
        document.getElementById("roomNo").value = "";
        document.getElementById("roomPrice").value = "";
        await refreshData();
    });
}

function renderRooms() {
    document.getElementById("roomTable").innerHTML = rooms.map(room => {
        const statusClass = room.status === "Booked" ? "booked" :
            room.status === "Occupied" ? "occupied" : "";
        const action = room.status === "Available"
            ? `<button class="small-btn red" onclick="deleteRoom(${room.id})">Delete</button>`
            : "";
        return `<tr>
            <td>${escapeHtml(room.room_no)}</td>
            <td>${escapeHtml(room.room_type)}</td>
            <td>₹${escapeHtml(room.price)}</td>
            <td><span class="status ${statusClass}">${escapeHtml(room.status)}</span></td>
            <td>${action}</td>
        </tr>`;
    }).join("");
    updateDashboard();
}

async function deleteRoom(id) {
    if (!confirm("Delete this available room?")) return;
    await runAction(async () => {
        await api(`/rooms/${id}`, { method: "DELETE" });
        await refreshData();
    });
}

async function addCustomer() {
    await runAction(async () => {
        const customer = {
            name: document.getElementById("customerName").value.trim(),
            phone: document.getElementById("customerPhone").value.trim(),
            email: document.getElementById("customerEmail").value.trim(),
            id_proof: document.getElementById("customerId").value.trim(),
            address: document.getElementById("customerAddress").value.trim()
        };
        if (!customer.name) throw new Error("Enter customer name");
        await api("/customers", { method: "POST", body: JSON.stringify(customer) });
        ["customerName", "customerPhone", "customerEmail", "customerId", "customerAddress"]
            .forEach(id => { document.getElementById(id).value = ""; });
        await refreshData();
    });
}

function renderCustomers() {
    document.getElementById("customerTable").innerHTML = customers.map(customer => `
        <tr>
            <td>${escapeHtml(customer.id)}</td>
            <td>${escapeHtml(customer.name)}</td>
            <td>${escapeHtml(customer.phone)}</td>
            <td>${escapeHtml(customer.email)}</td>
            <td>${escapeHtml(customer.id_proof)}</td>
            <td>${escapeHtml(customer.address)}</td>
        </tr>
    `).join("");
}

function updateBookingOptions() {
    const customerSelect = document.getElementById("bookingCustomer");
    const roomSelect = document.getElementById("bookingRoom");
    customerSelect.innerHTML = `<option value="">Select Customer</option>` +
        customers.map(customer =>
            `<option value="${customer.id}">${escapeHtml(customer.name)}</option>`
        ).join("");
    roomSelect.innerHTML = `<option value="">Select Available Room</option>` +
        rooms.filter(room => room.status === "Available").map(room =>
            `<option value="${room.id}">${escapeHtml(room.room_no)} - ` +
            `${escapeHtml(room.room_type)} - ₹${escapeHtml(room.price)}</option>`
        ).join("");
}

function renderBillingOptions() {
    const select = document.getElementById("billingBooking");
    select.innerHTML = `<option value="">Select Booking</option>` +
        bookings.map(booking =>
            `<option value="${booking.id}">#${booking.id} - ` +
            `${escapeHtml(booking.customer_name)} - Room ${escapeHtml(booking.room_no)}</option>`
        ).join("");
    select.value = currentBookingId || "";
}

async function addBooking() {
    await runAction(async () => {
        const booking = {
            customer_id: document.getElementById("bookingCustomer").value,
            room_id: document.getElementById("bookingRoom").value,
            check_in: document.getElementById("checkIn").value,
            check_out: document.getElementById("checkOut").value,
            guests: document.getElementById("guestCount").value
        };
        if (!booking.customer_id || !booking.room_id || !booking.check_in || !booking.check_out) {
            throw new Error("Please fill all booking details");
        }
        await api("/bookings", { method: "POST", body: JSON.stringify(booking) });
        await refreshData();
        alert("Booking created successfully");
    });
}

function renderBookings() {
    document.getElementById("bookingTable").innerHTML = bookings.map(booking => {
        let actions = "";
        if (booking.status === "Booked") {
            actions += `<button class="small-btn green" onclick="checkIn(${booking.id})">Check-In</button>`;
        } else if (booking.status === "Checked-in") {
            actions += `<button class="small-btn red" onclick="checkOut(${booking.id})">Check-Out</button>`;
        }
        actions += `<button class="small-btn gray" onclick="openBill(${booking.id})">Bill</button>`;
        return `<tr>
            <td>#${escapeHtml(booking.id)}</td>
            <td>${escapeHtml(booking.customer_name)}</td>
            <td>${escapeHtml(booking.room_no)}</td>
            <td>${escapeHtml(booking.check_in)}</td>
            <td>${escapeHtml(booking.check_out)}</td>
            <td>${escapeHtml(booking.guests)}</td>
            <td>${escapeHtml(booking.status)}</td>
            <td>${actions}</td>
        </tr>`;
    }).join("");
}

async function checkIn(id) {
    await runAction(async () => {
        await api(`/bookings/${id}/checkin`, { method: "POST" });
        await refreshData();
    });
}

async function checkOut(id) {
    await runAction(async () => {
        await api(`/bookings/${id}/checkout`, { method: "POST" });
        await refreshData();
        await openBill(id);
    });
}

async function openBill(id) {
    await runAction(async () => {
        const bill = await api(`/bookings/${id}/bill`);
        currentBookingId = id;
        document.getElementById("billingBooking").value = String(id);
        services = bill.services;
        document.getElementById("roomCharges").innerText = bill.room_charges;
        document.getElementById("serviceCharges").innerText = bill.service_charges;
        document.getElementById("grandTotal").innerText = bill.total;
        document.getElementById("paidAmount").value = bill.bill ? bill.bill.paid : 0;
        renderServices();
        showPageById("billing");
    });
}

function clearBill() {
    currentBookingId = null;
    services = [];
    document.getElementById("roomCharges").innerText = "0";
    document.getElementById("serviceCharges").innerText = "0";
    document.getElementById("grandTotal").innerText = "0";
    document.getElementById("paidAmount").value = "0";
    renderServices();
}

async function addService() {
    await runAction(async () => {
        if (!currentBookingId) throw new Error("Choose a booking before adding a service");
        const name = document.getElementById("serviceName").value.trim();
        const amount = Number(document.getElementById("serviceAmount").value);
        if (!name || !Number.isFinite(amount) || amount <= 0) {
            throw new Error("Enter a service name and a positive amount");
        }
        const bill = await api(`/bookings/${currentBookingId}/services`, {
            method: "POST",
            body: JSON.stringify({ service_name: name, amount })
        });
        services = bill.services;
        document.getElementById("serviceName").value = "";
        document.getElementById("serviceAmount").value = "";
        document.getElementById("roomCharges").innerText = bill.room_charges;
        document.getElementById("serviceCharges").innerText = bill.service_charges;
        document.getElementById("grandTotal").innerText = bill.total;
        renderServices();
    });
}

function renderServices() {
    document.getElementById("serviceTable").innerHTML = services.map(service => `
        <tr>
            <td>${escapeHtml(service.service_name)}</td>
            <td>₹${escapeHtml(service.amount)}</td>
        </tr>
    `).join("");
}

async function saveBill() {
    await runAction(async () => {
        if (!currentBookingId) throw new Error("Choose a booking before saving its bill");
        const paid = Number(document.getElementById("paidAmount").value);
        if (!Number.isFinite(paid) || paid < 0) throw new Error("Enter a valid amount paid");
        const bill = await api(`/bookings/${currentBookingId}/bill`, {
            method: "POST",
            body: JSON.stringify({ paid })
        });
        document.getElementById("paidAmount").value = bill.bill.paid;
        alert(`Bill saved successfully!\nTotal: ₹${bill.total}\nPayment: ${bill.bill.payment_status}`);
    });
}

async function renderReports() {
    const reports = await api("/reports");
    document.getElementById("reportTable").innerHTML = reports.map(report => `
        <tr>
            <td>#${escapeHtml(report.id)}</td>
            <td>${escapeHtml(report.customer_name)}</td>
            <td>${escapeHtml(report.room_no)}</td>
            <td>${escapeHtml(report.check_in)}</td>
            <td>${escapeHtml(report.check_out)}</td>
            <td>${escapeHtml(report.status)}</td>
            <td>₹${escapeHtml(report.total)}</td>
            <td>${escapeHtml(report.payment_status)}</td>
        </tr>
    `).join("");
}

function updateDashboard() {
    document.getElementById("totalRooms").innerText = dashboardStats.rooms;
    document.getElementById("availableRooms").innerText = dashboardStats.available;
    document.getElementById("totalCustomers").innerText = dashboardStats.customers;
    document.getElementById("totalBookings").innerText = dashboardStats.bookings;
}

function showPageById(pageId) {
    document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
    document.getElementById(pageId).classList.add("active");
    document.querySelectorAll(".nav-links button").forEach(button => button.classList.remove("active"));
    if (pageId === "billing") document.getElementById("billingNav").classList.add("active");
}

document.addEventListener("DOMContentLoaded", () => {
    const toLocalDate = date => {
        const offset = date.getTimezoneOffset();
        return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
    };
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const checkIn = document.getElementById("checkIn");
    const checkOut = document.getElementById("checkOut");
    checkIn.min = toLocalDate(today);
    checkOut.min = toLocalDate(tomorrow);
    if (!checkIn.value) checkIn.value = toLocalDate(today);
    if (!checkOut.value) checkOut.value = toLocalDate(tomorrow);
    checkIn.addEventListener("change", () => {
        const nextDay = new Date(`${checkIn.value}T00:00:00`);
        nextDay.setDate(nextDay.getDate() + 1);
        const minimum = toLocalDate(nextDay);
        checkOut.min = minimum;
        if (checkOut.value < minimum) checkOut.value = minimum;
    });
    document.getElementById("password").addEventListener("keydown", event => {
        if (event.key === "Enter") login();
    });
    document.getElementById("billingBooking").addEventListener("change", event => {
        if (event.target.value) {
            openBill(Number(event.target.value));
        } else {
            clearBill();
        }
    });
    runAction(async () => {
        const auth = await api("/session");
        setAuthenticated(auth.authenticated);
        if (auth.authenticated) await refreshData();
    });
});
