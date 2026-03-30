const todoList = document.getElementById("todoList");
const shoppingList = document.getElementById("shoppingList");
const stockList = document.getElementById("stockList");
const stockBox = document.getElementById("stockBox");
const trash = document.getElementById("trash");
const todoType = document.getElementById("todoType");
const shoppingType = document.getElementById("shoppingType");
const stockType = document.getElementById("stockType");
const todoFields = document.getElementById("todoFields");
const shoppingFields = document.getElementById("shoppingFields");
const deadline = document.getElementById("deadline");
const amount = document.getElementById("amount");
const monthlyBudget = document.getElementById("monthlyBudget");
const plannedExpense = document.getElementById("plannedExpense");
const remainingBudget = document.getElementById("remainingBudget");
const taskInput = document.getElementById("task");
const addBtn = document.getElementById("addBtn");
const hourHand = document.getElementById("hourHand");
const minuteHand = document.getElementById("minuteHand");
const secondHand = document.getElementById("secondHand");
const analogClock = document.querySelector(".clock");
const pigeonStage = document.getElementById("pigeonStage");
const fortuneResult = document.getElementById("fortuneResult");
const redFlash = document.getElementById("redFlash");
const digitalClock = document.getElementById("digitalClock");
const calendarDate = document.getElementById("calendarDate");
const saveBtn = document.getElementById("saveBtn");

const DB_NAME = "firstAppDB";
const DB_VERSION = 1;
const SNAPSHOT_STORE = "appSnapshots";
const SNAPSHOT_KEY = "main";

let plannedTotal = 0;
let draggedItem = null;
let wasOverBudget = false;
let dbPromise = null;
let suppressAutoSave = false;

function formatNumber(value) {
    return Number(value).toLocaleString("ja-JP");
}

function formatLocalDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function formatDateNoYear(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    return `${parts[1]}/${parts[2]}`;
}

function getSelectedType() {
    if (shoppingType.checked) return "shopping";
    if (stockType.checked) return "stock";
    return "todo";
}

function requestToPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function openAppDatabase() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
                db.createObjectStore(SNAPSHOT_STORE, { keyPath: "id" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    return dbPromise;
}

async function saveSnapshotToDatabase(payload = buildSavePayload()) {
    if (suppressAutoSave) return;
    try {
        const db = await openAppDatabase();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(SNAPSHOT_STORE, "readwrite");
            const store = tx.objectStore(SNAPSHOT_STORE);
            store.put({
                id: SNAPSHOT_KEY,
                savedAt: new Date().toISOString(),
                payload
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } catch (error) {
        console.error("DB保存に失敗しました:", error);
    }
}

async function loadSnapshotFromDatabase() {
    try {
        const db = await openAppDatabase();
        const tx = db.transaction(SNAPSHOT_STORE, "readonly");
        const store = tx.objectStore(SNAPSHOT_STORE);
        const snapshot = await requestToPromise(store.get(SNAPSHOT_KEY));
        return snapshot ? snapshot.payload : null;
    } catch (error) {
        console.error("DB読込に失敗しました:", error);
        return null;
    }
}

function updateBudgetSummary() {
    const budget = Number(monthlyBudget.value) || 0;
    const remaining = budget - plannedTotal;
    plannedExpense.textContent = formatNumber(plannedTotal);
    remainingBudget.textContent = formatNumber(remaining);
    remainingBudget.classList.toggle("danger", remaining < 0);
    taskInput.disabled = remaining < 0;
    addBtn.disabled = remaining < 0;

    if (remaining < 0 && !wasOverBudget) {
        alert("予算オーバーです。購入を見直しましょう");
    }
    wasOverBudget = remaining < 0;
}

function applyTodoCompletedState(item, completedDate = "") {
    if (item.classList.contains("done")) return;
    item.classList.add("done");
    item.classList.remove("due-soon");
    item.dataset.completedDate = completedDate || formatLocalDate(new Date());

    const mark = document.createElement("span");
    mark.className = "complete-mark";
    mark.textContent = "✓";
    item.prepend(mark);

    const dateSpan = document.createElement("span");
    dateSpan.className = "complete-date";
    dateSpan.textContent = `完了日: ${formatDateNoYear(item.dataset.completedDate)}`;
    item.appendChild(dateSpan);
}

function buildListText(record) {
    if (record.type === "todo") {
        return `${record.task} (期限: ${record.deadline ? formatDateNoYear(record.deadline) : "未設定"})`;
    }
    if (record.type === "shopping") {
        return `${record.task} (金額: ${record.amount ? `￥${formatNumber(record.amount)}` : "未入力"})`;
    }
    return `${record.task} (備蓄)`;
}

function updateStockDisplay(item) {
    let movedDate = item.querySelector(".moved-date");
    if (!item.dataset.purchaseDate) {
        if (movedDate) movedDate.remove();
        return;
    }
    if (!movedDate) {
        movedDate = document.createElement("span");
        movedDate.className = "moved-date";
        item.appendChild(movedDate);
    }
    movedDate.textContent = `購入日: ${formatDateNoYear(item.dataset.purchaseDate)}`;
}

function attachCommonDragEvents(item) {
    item.addEventListener("dragstart", () => {
        draggedItem = item;
    });

    item.addEventListener("dragend", () => {
        draggedItem = null;
    });
}

function attachTypeSpecificEvents(item) {
    if (item.dataset.type === "todo") {
        item.addEventListener("click", () => {
            if (item.classList.contains("done")) return;
            applyTodoCompletedState(item);
            saveSnapshotToDatabase();
        });
        return;
    }

    if (item.dataset.type === "shopping") {
        item.addEventListener("click", () => {
            moveShoppingToStock(item);
            saveSnapshotToDatabase();
        });
    }
}

function createItemElement(record) {
    const item = document.createElement("li");
    item.draggable = true;
    item.dataset.type = record.type;
    item.dataset.task = record.task;
    item.dataset.deadline = record.deadline || "";
    item.dataset.amount = String(Number(record.amount) || 0);
    item.dataset.purchaseDate = record.purchaseDate || "";
    item.dataset.completedDate = record.completedDate || "";
    item.textContent = buildListText(record);

    attachCommonDragEvents(item);
    attachTypeSpecificEvents(item);

    if (record.type === "stock") {
        updateStockDisplay(item);
    }
    if (record.done && record.type === "todo") {
        applyTodoCompletedState(item, record.completedDate);
    }
    return item;
}

function moveShoppingToStock(item) {
    if (!item || item.dataset.type !== "shopping") return;
    item.dataset.type = "stock";
    item.dataset.amount = "0";
    item.dataset.purchaseDate = formatLocalDate(new Date());
    item.textContent = `${item.dataset.task} (備蓄)`;
    updateStockDisplay(item);

    stockList.appendChild(item);
    attachTypeSpecificEvents(item);
    recomputePlannedTotal();
    updateBudgetSummary();
    updateStockAgeHighlight();
}

function extractItemRecord(item) {
    return {
        task: item.dataset.task || "",
        type: item.dataset.type || "",
        deadline: item.dataset.deadline || "",
        amount: Number(item.dataset.amount) || 0,
        purchaseDate: item.dataset.purchaseDate || "",
        done: item.classList.contains("done"),
        completedDate: item.dataset.completedDate || ""
    };
}

function serializeList(listElement) {
    return Array.from(listElement.querySelectorAll("li")).map((item) => extractItemRecord(item));
}

function recomputePlannedTotal() {
    plannedTotal = Array.from(shoppingList.querySelectorAll("li")).reduce((sum, item) => {
        return sum + (Number(item.dataset.amount) || 0);
    }, 0);
}

function buildSavePayload() {
    return {
        savedAt: new Date().toISOString(),
        budget: {
            monthly: Number(monthlyBudget.value) || 0,
            plannedTotal,
            remaining: (Number(monthlyBudget.value) || 0) - plannedTotal
        },
        form: {
            selectedType: getSelectedType(),
            task: taskInput.value.trim(),
            deadline: deadline.value || "",
            amount: Number(amount.value) || 0
        },
        lists: {
            todo: serializeList(todoList),
            shopping: serializeList(shoppingList),
            stock: serializeList(stockList)
        }
    };
}

function postToSendPage(payload) {
    const encoded = encodeURIComponent(JSON.stringify(payload));
    location.href = `send.html?payload=${encoded}`;
}

function updateTodoDeadlineAlerts() {
    const today = formatLocalDate(new Date());
    Array.from(todoList.querySelectorAll("li")).forEach((item) => {
        const target = item.dataset.deadline;
        if (!target || item.classList.contains("done")) {
            item.classList.remove("due-soon");
            return;
        }
        const dueDate = new Date(`${target}T00:00:00`);
        dueDate.setDate(dueDate.getDate() - 1);
        const isDueSoon = formatLocalDate(dueDate) === today;
        item.classList.toggle("due-soon", isDueSoon);
    });
}

function updateStockAgeHighlight() {
    const today = new Date(`${formatLocalDate(new Date())}T00:00:00`);
    Array.from(stockList.querySelectorAll("li")).forEach((item) => {
        const purchaseDate = item.dataset.purchaseDate;
        if (!purchaseDate) {
            item.classList.remove("stock-week-old");
            return;
        }
        const purchased = new Date(`${purchaseDate}T00:00:00`);
        const diffDays = Math.floor((today - purchased) / (1000 * 60 * 60 * 24));
        item.classList.toggle("stock-week-old", diffDays >= 7);
    });
}

function updateClock() {
    const now = new Date();
    const seconds = now.getSeconds();
    const minutes = now.getMinutes();
    const hours = now.getHours() % 12;
    const fullHours = String(now.getHours()).padStart(2, "0");
    const fullMinutes = String(minutes).padStart(2, "0");
    const fullSeconds = String(seconds).padStart(2, "0");
    const fullYear = now.getFullYear();
    const fullMonth = String(now.getMonth() + 1).padStart(2, "0");
    const fullDate = String(now.getDate()).padStart(2, "0");
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    const weekday = weekdays[now.getDay()];
    const secondDeg = seconds * 6;
    const minuteDeg = minutes * 6 + seconds * 0.1;
    const hourDeg = hours * 30 + minutes * 0.5;

    hourHand.style.transform = `translateX(-50%) rotate(${hourDeg}deg)`;
    minuteHand.style.transform = `translateX(-50%) rotate(${minuteDeg}deg)`;
    secondHand.style.transform = `translateX(-50%) rotate(${secondDeg}deg)`;
    digitalClock.textContent = `${fullHours}:${fullMinutes}:${fullSeconds}`;
    calendarDate.textContent = `${fullYear}-${fullMonth}-${fullDate} (${weekday})`;
}

function setType(type) {
    todoType.checked = type === "todo";
    shoppingType.checked = type === "shopping";
    stockType.checked = type === "stock";
    todoFields.style.display = type === "todo" ? "flex" : "none";
    shoppingFields.style.display = type === "shopping" ? "flex" : "none";
    if (type === "todo") {
        taskInput.placeholder = "やることを入力";
    } else if (type === "shopping") {
        taskInput.placeholder = "買いたいものを入力";
    } else {
        taskInput.placeholder = "備蓄するものを入力";
    }
}

function addRecordToList(record) {
    const item = createItemElement(record);
    if (record.type === "todo") {
        todoList.appendChild(item);
    } else if (record.type === "shopping") {
        shoppingList.appendChild(item);
    } else {
        stockList.appendChild(item);
    }
}

function launchPigeons() {
    const count = 9;
    let maxDuration = 0;
    for (let i = 0; i < count; i++) {
        const bird = document.createElement("span");
        const sx = `${Math.floor(Math.random() * 100)}vw`;
        const sy = `${Math.floor(Math.random() * 100)}vh`;
        const mx = `${Math.floor(Math.random() * 100)}vw`;
        const my = `${Math.floor(Math.random() * 100)}vh`;
        const ex = `${Math.floor(Math.random() * 100)}vw`;
        const ey = `${Math.floor(Math.random() * 100)}vh`;
        const dur = 4 + Math.random() * 4;
        if (dur > maxDuration) maxDuration = dur;

        bird.className = "flying-pigeon";
        bird.innerHTML = "<span class=\"wing left\"></span><span class=\"wing right\"></span><span class=\"pigeon-body\"></span>";
        bird.style.setProperty("--sx", sx);
        bird.style.setProperty("--sy", sy);
        bird.style.setProperty("--mx", mx);
        bird.style.setProperty("--my", my);
        bird.style.setProperty("--ex", ex);
        bird.style.setProperty("--ey", ey);
        bird.style.setProperty("--dur", `${dur}s`);
        pigeonStage.appendChild(bird);
        setTimeout(() => {
            bird.remove();
        }, dur * 1000);
    }

    const fortunes = [
        "末吉", "末吉", "末吉", "末吉", "末吉",
        "小吉", "小吉", "小吉", "小吉",
        "凶", "凶", "凶",
        "大吉", "大吉",
        "大凶"
    ];

    function showJumboBill() {
        const bill = document.createElement("span");
        bill.className = "bill-jumbo";
        bill.textContent = "💴";
        document.body.appendChild(bill);
        setTimeout(() => bill.remove(), 4000);
    }

    function flashRedScreen() {
        redFlash.classList.remove("show");
        void redFlash.offsetWidth;
        redFlash.classList.add("show");
    }

    setTimeout(() => {
        const result = fortunes[Math.floor(Math.random() * fortunes.length)];
        fortuneResult.textContent = `今日の運勢: ${result}`;
        fortuneResult.classList.remove("show");
        void fortuneResult.offsetWidth;
        fortuneResult.classList.add("show");
        if (result === "大吉") {
            showJumboBill();
        } else if (result === "大凶") {
            flashRedScreen();
        }
    }, maxDuration * 1000);
}

async function restoreFromDatabase() {
    const snapshot = await loadSnapshotFromDatabase();
    if (!snapshot) return;

    suppressAutoSave = true;
    try {
        todoList.innerHTML = "";
        shoppingList.innerHTML = "";
        stockList.innerHTML = "";

        (snapshot.lists?.todo || []).forEach((record) => addRecordToList(record));
        (snapshot.lists?.shopping || []).forEach((record) => addRecordToList(record));
        (snapshot.lists?.stock || []).forEach((record) => addRecordToList(record));

        monthlyBudget.value = Number(snapshot.budget?.monthly) || 0;
        taskInput.value = snapshot.form?.task || "";
        deadline.value = snapshot.form?.deadline || formatLocalDate(new Date());
        amount.value = snapshot.form?.amount ? String(snapshot.form.amount) : "";
        setType(snapshot.form?.selectedType || "todo");

        recomputePlannedTotal();
        updateBudgetSummary();
        updateTodoDeadlineAlerts();
        updateStockAgeHighlight();
    } finally {
        suppressAutoSave = false;
    }
}

deadline.value = formatLocalDate(new Date());
updateClock();
setType("todo");
updateBudgetSummary();
updateTodoDeadlineAlerts();
updateStockAgeHighlight();
setInterval(updateClock, 1000);
setInterval(updateTodoDeadlineAlerts, 1000);
setInterval(updateStockAgeHighlight, 60000);

restoreFromDatabase();

monthlyBudget.addEventListener("input", () => {
    updateBudgetSummary();
    saveSnapshotToDatabase();
});

todoType.addEventListener("change", () => {
    setType(todoType.checked ? "todo" : shoppingType.checked ? "shopping" : "stock");
    saveSnapshotToDatabase();
});

shoppingType.addEventListener("change", () => {
    setType(shoppingType.checked ? "shopping" : todoType.checked ? "todo" : "stock");
    saveSnapshotToDatabase();
});

stockType.addEventListener("change", () => {
    setType(stockType.checked ? "stock" : todoType.checked ? "todo" : "shopping");
    saveSnapshotToDatabase();
});

trash.addEventListener("dragover", (event) => {
    event.preventDefault();
    trash.classList.add("drag-over");
});

trash.addEventListener("dragleave", () => {
    trash.classList.remove("drag-over");
});

trash.addEventListener("drop", (event) => {
    event.preventDefault();
    trash.classList.remove("drag-over");
    if (draggedItem) {
        draggedItem.remove();
        draggedItem = null;
        recomputePlannedTotal();
        updateBudgetSummary();
        saveSnapshotToDatabase();
    }
});

stockBox.addEventListener("dragover", (event) => {
    event.preventDefault();
    stockBox.classList.add("drop-target");
});

stockBox.addEventListener("dragleave", () => {
    stockBox.classList.remove("drop-target");
});

stockBox.addEventListener("drop", (event) => {
    event.preventDefault();
    stockBox.classList.remove("drop-target");
    moveShoppingToStock(draggedItem);
    draggedItem = null;
    saveSnapshotToDatabase();
});

analogClock.addEventListener("click", launchPigeons);

addBtn.addEventListener("click", () => {
    if (addBtn.disabled) return;

    const taskText = taskInput.value.trim();
    if (!taskText) return;

    const type = getSelectedType();
    if (type === "todo" && deadline.value) {
        const today = formatLocalDate(new Date());
        if (deadline.value < today) {
            alert("過去の日付は指定できません");
            return;
        }
    }

    const record = {
        task: taskText,
        type,
        deadline: type === "todo" ? (deadline.value || "") : "",
        amount: type === "shopping" ? (Number(amount.value) || 0) : 0,
        purchaseDate: type === "stock" ? formatLocalDate(new Date()) : "",
        done: false,
        completedDate: ""
    };

    addRecordToList(record);
    recomputePlannedTotal();
    updateBudgetSummary();
    updateTodoDeadlineAlerts();
    updateStockAgeHighlight();

    taskInput.value = "";
    if (type === "shopping") amount.value = "";
    saveSnapshotToDatabase();
});

if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
        const payload = buildSavePayload();
        await saveSnapshotToDatabase(payload);
        postToSendPage(payload);
    });
}
