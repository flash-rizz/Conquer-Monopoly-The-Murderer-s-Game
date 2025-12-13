// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDUPm6XOTP2iQQmwC-QSQi9PDTa6ddd4uo",
    authDomain: "conquer-ff3a6.firebaseapp.com",
    databaseURL: "https://conquer-ff3a6-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "conquer-ff3a6",
    storageBucket: "conquer-ff3a6.firebasestorage.app",
    messagingSenderId: "172263193906",
    appId: "1:172263193906:web:f2c43b9b02cb421e0feb2b",
    measurementId: "G-D1GZTSP2SM"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- STATE ---
let myName = "";
let roomCode = "";
let myRole = "Civilian";
let myCash = 0;

// --- PAGE NAVIGATION ---
function navigateTo(viewId) {
    // 1. Hide all views by adding 'hidden' class AND setting display:none
    document.querySelectorAll('.app-view').forEach(el => {
        el.classList.add('hidden');
        el.style.display = 'none';
    });

    // 2. Show the target view
    const target = document.getElementById(viewId);
    if(target) {
        target.classList.remove('hidden');
        target.style.display = 'block';
    }
}

// --- LOGIC 1: CREATE GAME ---
function createGameSession() {
    const roomInput = document.getElementById('create-room').value.trim().toUpperCase();
    const limitInput = parseInt(document.getElementById('create-limit').value);

    if (!roomInput) return alert("Enter a Room Code");

    const roomRef = db.ref(`games/${roomInput}`);
    
    roomRef.once('value', snapshot => {
        if (snapshot.exists()) {
            alert("Room Code taken! Try another.");
        } else {
            // Randomly pick which slot is the murderer
            const killerSlot = Math.floor(Math.random() * limitInput);

            // Save Settings
            roomRef.child('settings').set({
                maxPlayers: limitInput,
                murdererSlot: killerSlot,
                currentCount: 0,
                status: "active"
            });

            // Auto-fill Join screen and move there
            document.getElementById('join-room').value = roomInput;
            navigateTo('view-join');
        }
    });
}

// --- LOGIC 2: JOIN GAME ---
function enterGame() {
    const nameInput = document.getElementById('join-name').value.trim().toUpperCase();
    const roomInput = document.getElementById('join-room').value.trim().toUpperCase();

    if (!nameInput || !roomInput) return alert("Fill in Name and Room");

    const roomRef = db.ref(`games/${roomInput}`);
    
    roomRef.child('settings').once('value', snapshot => {
        if (!snapshot.exists()) return alert("Room does not exist!");

        const settings = snapshot.val();
        
        // Use Name as ID
        const myId = nameInput; 
        const playerRef = roomRef.child(`players/${myId}`);

        // Check if Reconnecting or New
        playerRef.once('value', pSnap => {
            if (pSnap.exists()) {
                // RECONNECTING
                setupGameSession(nameInput, roomInput, pSnap.val().role);
            } else {
                // NEW JOIN - Check limits
                roomRef.child('settings').transaction(currentSettings => {
                    if (currentSettings.currentCount >= currentSettings.maxPlayers) {
                        return; // Abort if full
                    }
                    currentSettings.currentCount++;
                    return currentSettings;
                }, (error, committed, snap) => {
                    if (committed) {
                        // Success - Assign Role
                        const updatedSettings = snap.val();
                        const mySlot = updatedSettings.currentCount - 1;
                        
                        const assignedRole = (mySlot === settings.murdererSlot) ? "Murderer" : "Civilian";
                        
                        // Initialize Player
                        playerRef.set({
                            name: nameInput,
                            cash: 15000,
                            role: assignedRole,
                            lands: [],
                            alive: true
                        });

                        setupGameSession(nameInput, roomInput, assignedRole);
                    } else {
                        alert("Game is Full!");
                    }
                });
            }
        });
    });
}

function setupGameSession(name, room, role) {
    myName = name;
    roomCode = room;
    myRole = role;

    // Setup Listeners
    db.ref(`games/${room}/players/${name}`).on('value', snap => {
        const data = snap.val();
        if(data) updateDashboard(data);
    });

    db.ref(`games/${room}/log`).on('child_added', snap => {
        const li = document.createElement('li');
        li.innerText = snap.val();
        document.getElementById('game-log').prepend(li);
    });

    // Go to Game Screen
    navigateTo('view-game');
}

// --- DASHBOARD UI ---
function updateDashboard(data) {
    document.getElementById('display-name').innerText = data.name;
    document.getElementById('display-cash').innerText = `RM ${data.cash}`;
    document.getElementById('display-role').innerText = data.role;
    myCash = data.cash;

    if (data.role === "Murderer") {
        document.getElementById('murderer-ui').classList.remove('hidden');
        document.getElementById('murderer-ui').style.display = 'block';
        document.getElementById('display-role').style.color = "red";
    }
}

function toggleSecret() {
    document.getElementById('display-cash').classList.toggle('blur');
    document.getElementById('display-role').classList.toggle('blur');
}

// --- GAME ACTIONS ---

const chestCards = [
    { title: "Inheritance", desc: "Receive RM 3,000", action: "cash", val: 3000 },
    { title: "Tax Audit", desc: "Pay RM 2,000", action: "cash", val: -2000 },
    { title: "Re-Zoning", desc: "Swap lowest land with highest land of opponent.", action: "none" },
    { title: "Hint Time", desc: "Murderer must reveal a hint!", action: "hint" }
];

const challengeCards = [
    { title: "Dice Sum", desc: "Roll Move Die 3x. Sum must be 11-15." },
    { title: "Anagram", desc: "Opponent gives 5-letter word. Solve anagram in 15s." },
    { title: "Geography", desc: "Name country A-M in 60s." }
];

function drawCard(type) {
    let card;
    if(type === 'chest') {
        card = chestCards[Math.floor(Math.random() * chestCards.length)];
        logAction(`${myName} drew Chest: ${card.title}`);
        if(card.action === "cash") updateCash(card.val);
    } else {
        card = challengeCards[Math.floor(Math.random() * challengeCards.length)];
        logAction(`${myName} drew Challenge: ${card.title}`);
    }
    
    document.getElementById('card-title').innerText = card.title;
    document.getElementById('card-desc').innerText = card.desc;
    
    // Show Overlay
    const overlay = document.getElementById('card-overlay');
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
}

function openModal(type) {
    const modal = document.getElementById('action-modal');
    const body = document.getElementById('modal-body');
    const title = document.getElementById('modal-title');
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex'; // Force flex for centering
    body.innerHTML = '';

    if (type === 'pay') {
        title.innerText = "Pay Player";
        db.ref(`games/${roomCode}/players`).once('value', snap => {
            let html = `<select id="pay-target"><option>Select Player</option>`;
            snap.forEach(p => { if(p.key !== myName) html += `<option value="${p.key}">${p.key}</option>`; });
            html += `</select><input type="number" id="pay-amt" placeholder="Amount">`;
            html += `<button class="btn-action" onclick="payPlayer()">SEND</button>`;
            body.innerHTML = html;
        });
    } else if (type === 'bank') {
        title.innerText = "Bank Transaction";
        body.innerHTML = `
            <input type="number" id="bank-amt" placeholder="Amount">
            <button class="btn-action" style="background:#4caf50" onclick="updateCash(parseInt(document.getElementById('bank-amt').value))">GET FROM BANK</button>
            <button class="btn-action" style="background:#f44336" onclick="updateCash(-parseInt(document.getElementById('bank-amt').value))">PAY TO BANK</button>
        `;
    } else if (type === 'land') {
        title.innerText = "Claim Land";
        body.innerHTML = `
            <input type="number" id="land-num" placeholder="Land # (1-40)">
            <button class="btn-action" onclick="claimLand()">CLAIM</button>
        `;
    } else if (type === 'inventory') {
        title.innerText = "My Assets";
        db.ref(`games/${roomCode}/players/${myName}/lands`).once('value', snap => {
            const lands = snap.exists() ? Object.values(snap.val()).join(", ") : "None";
            body.innerHTML = `<p>${lands}</p>`;
        });
    }
}

function updateCash(amount) {
    if(!amount) return;
    const newTotal = myCash + amount;
    db.ref(`games/${roomCode}/players/${myName}/cash`).set(newTotal);
    closeModal();
}

function payPlayer() {
    const target = document.getElementById('pay-target').value;
    const amt = parseInt(document.getElementById('pay-amt').value);
    if(target && amt) {
        updateCash(-amt);
        db.ref(`games/${roomCode}/players/${target}/cash`).transaction(curr => (curr||0) + amt);
        logAction(`${myName} paid RM${amt} to ${target}`);
        closeModal();
    }
}

function claimLand() {
    const num = document.getElementById('land-num').value;
    if(num) {
        db.ref(`games/${roomCode}/players/${myName}/lands`).push(`Land ${num}`);
        logAction(`${myName} claimed Land #${num}`);
        closeModal();
    }
}

// --- MURDERER HINTS ---
const hints = [
    "Is the Murderer wearing glasses?",
    "Is the Murderer's cash > RM 10,000?",
    "Has the Murderer claimed a Blue property?"
];

function setupHint() {
    const modal = document.getElementById('action-modal');
    document.getElementById('modal-title').innerText = "Select Hint";
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    
    const body = document.getElementById('modal-body');
    body.innerHTML = "";
    
    hints.forEach(h => {
        const btn = document.createElement('button');
        btn.innerText = h;
        btn.className = "btn-action";
        btn.style.marginTop = "10px";
        btn.onclick = () => {
            const ans = prompt(`Your Answer for: "${h}"`);
            if(ans) {
                logAction(`🕵️ HINT: ${h} -> ${ans}`);
                closeModal();
            }
        };
        body.appendChild(btn);
    });
}

function logAction(msg) {
    db.ref(`games/${roomCode}/log`).push(msg);
}

function closeModal() {
    const modals = document.querySelectorAll('.overlay');
    modals.forEach(m => {
        m.classList.add('hidden');
        m.style.display = 'none';
    });
}