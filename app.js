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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- GAME STATE ---
let myName = "";
let roomCode = "";
let myRole = "Civilian";
let myCash = 15000; // Starting Amount
let myId = ""; 

// --- DATA LISTS ---
const chestCards = [
    "Steal Random Land", "Inheritance Found (+RM3000)", "Get Murderer Hint", 
    "Forced Re-Zoning (Swap Land)", "Everyone pays you RM500", 
    "Bad Investment (Roll % die to lose cash)", "Go to Start (No Salary)", 
    "Gambling is Haram (Lose % cash)"
];

const powerCards = [
    "Reverse Move by 1", "Just Say No", "Move Forward 2/3", 
    "Force Player to Buy Property", "Interest Time (Force Rent Pay)", 
    "Health +1", "Invisible Spell (Hide 1 Night)"
];

const murderQuestions = [
    {q: "Is the murderer wearing glasses?", a: "Yes/No"},
    {q: "Does the murderer own a red property?", a: "Yes/No"},
    {q: "Is the murderer sitting on the left side?", a: "Yes/No"},
    {q: "Has the murderer been to jail?", a: "Yes/No"},
    {q: "Does the murderer have more than 5k cash?", a: "Yes/No"}
];

// --- CORE FUNCTIONS ---

function joinGame() {
    myName = document.getElementById('username').value.toUpperCase();
    roomCode = document.getElementById('room-code').value.toUpperCase();

    if (!myName || !roomCode) return alert("Fill in all fields");

    myId = myName + "_" + Math.floor(Math.random() * 1000);

    // Create player entry in DB
    const playerRef = db.ref(`games/${roomCode}/players/${myId}`);
    playerRef.set({
        name: myName,
        cash: 15000,
        role: "Civilian", // Default, will change later
        lands: [],
        powerCards: []
    });

    // Listen to my own data changes
    playerRef.on('value', snapshot => {
        const data = snapshot.val();
        if (data) {
            myCash = data.cash;
            myRole = data.role;
            updateUI(data);
        }
    });

    // Listen to Public Log
    db.ref(`games/${roomCode}/log`).on('child_added', snapshot => {
        const msg = snapshot.val();
        const li = document.createElement('li');
        li.innerText = msg;
        document.getElementById('game-log').prepend(li);
    });

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    
    // Check if I am the first player (Host triggers role assignment later)
    checkForFirstPlayer();
}

function updateUI(data) {
    document.getElementById('player-name-display').innerText = data.name;
    document.getElementById('cash-display').innerText = `RM ${data.cash}`;
    document.getElementById('role-display').innerText = data.role;
    
    // Show Murderer controls if applicable
    if (data.role === "Murderer") {
        document.getElementById('murderer-zone').classList.remove('hidden');
    }
}

function toggleRole() {
    const el = document.getElementById('role-display');
    el.classList.toggle('blur');
}

// --- ACTIONS & MODALS ---

function openModal(type) {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    const title = document.getElementById('modal-title');
    overlay.classList.remove('hidden');
    content.innerHTML = '';

    if (type === 'pay') {
        title.innerText = "Pay Player";
        // Fetch players to populate dropdown
        db.ref(`games/${roomCode}/players`).once('value', snap => {
            let html = `<select id="pay-target"><option value="">Select Player</option>`;
            snap.forEach(p => {
                if (p.key !== myId) html += `<option value="${p.key}">${p.val().name}</option>`;
            });
            html += `</select><input type="number" id="pay-amount" placeholder="Amount">`;
            html += `<button onclick="confirmPay()">Send Money</button>`;
            content.innerHTML = html;
        });
    } 
    else if (type === 'bank') {
        title.innerText = "Bank Transaction";
        content.innerHTML = `
            <input type="number" id="bank-amount" placeholder="Amount">
            <button style="background:#4caf50; color:white" onclick="updateBank(1)">Receive from Bank</button>
            <button style="background:#f44336; color:white" onclick="updateBank(-1)">Pay to Bank</button>
        `;
    }
    else if (type === 'land') {
        title.innerText = "Claim Land";
        content.innerHTML = `
            <input type="number" id="land-id" placeholder="Land Number (1-40)">
            <button onclick="confirmLand()">Claim Land</button>
        `;
    }
    else if (type === 'inventory') {
        title.innerText = "My Inventory";
        // Fetch current data
        db.ref(`games/${roomCode}/players/${myId}`).once('value', snap => {
            const p = snap.val();
            let lands = p.lands ? Object.values(p.lands).join(', ') : "None";
            let cards = p.powerCards ? Object.values(p.powerCards).join(', ') : "None";
            content.innerHTML = `<p><strong>Lands:</strong> ${lands}</p><p><strong>Power Cards:</strong> ${cards}</p>`;
        });
    }
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

// --- LOGIC FUNCTIONS ---

function confirmPay() {
    const targetId = document.getElementById('pay-target').value;
    const amount = parseInt(document.getElementById('pay-amount').value);
    
    if (!targetId || !amount) return;

    // Deduct from me
    db.ref(`games/${roomCode}/players/${myId}/cash`).set(myCash - amount);
    
    // Add to target
    db.ref(`games/${roomCode}/players/${targetId}/cash`).transaction(current => (current || 0) + amount);

    logEvent(`${myName} paid RM${amount} to another player.`);
    closeModal();
}

function updateBank(multiplier) {
    const amount = parseInt(document.getElementById('bank-amount').value);
    if (!amount) return;
    
    const finalAmount = amount * multiplier;
    db.ref(`games/${roomCode}/players/${myId}/cash`).set(myCash + finalAmount);
    
    logEvent(`${myName} ${multiplier > 0 ? 'received' : 'paid'} RM${amount} ${multiplier > 0 ? 'from' : 'to'} the Bank.`);
    closeModal();
}

function confirmLand() {
    const landNum = document.getElementById('land-id').value;
    // In a full app, we would check if land is taken globally. 
    // For honesty system, we just add it to player inventory.
    db.ref(`games/${roomCode}/players/${myId}/lands`).push(`Land #${landNum}`);
    logEvent(`${myName} claimed Land #${landNum}`);
    closeModal();
}

function drawCard(type) {
    const deck = type === 'chest' ? chestCards : powerCards;
    const card = deck[Math.floor(Math.random() * deck.length)];
    
    alert(`You drew: ${card}`);
    
    if (type === 'power') {
        // Save to inventory
        db.ref(`games/${roomCode}/players/${myId}/powerCards`).push(card);
    } else {
        // Chest cards usually act immediately
        logEvent(`${myName} drew a Chest Card: ${card}`);
    }
}

function logEvent(msg) {
    db.ref(`games/${roomCode}/log`).push(msg);
}

// --- MURDERER HINT LOGIC ---

function checkForFirstPlayer() {
    // A simple way to assign roles: First player adds a "Assign Roles" button to their UI
    db.ref(`games/${roomCode}/players`).once('value', snap => {
        if (Object.keys(snap.val()).length === 1) {
            const btn = document.createElement('button');
            btn.innerText = "ADMIN: Assign Roles";
            btn.style.background = "purple";
            btn.style.color = "white";
            btn.onclick = assignRoles;
            document.querySelector('.stats-bar').appendChild(btn);
        }
    });
}

function assignRoles() {
    db.ref(`games/${roomCode}/players`).once('value', snap => {
        const players = [];
        snap.forEach(child => players.push(child.key));
        
        // Randomly pick one murderer
        const murdererId = players[Math.floor(Math.random() * players.length)];
        
        players.forEach(pid => {
            const role = (pid === murdererId) ? "Murderer" : "Civilian";
            db.ref(`games/${roomCode}/players/${pid}/role`).set(role);
        });
        
        logEvent("ROLES HAVE BEEN ASSIGNED. Check your secret identity!");
    });
}

function triggerHintSelection() {
    // Get 3 random questions
    const options = [];
    while(options.length < 3) {
        const q = murderQuestions[Math.floor(Math.random() * murderQuestions.length)];
        if (!options.includes(q)) options.push(q);
    }

    const container = document.getElementById('hint-options');
    container.innerHTML = '';
    container.classList.remove('hidden');

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.innerText = opt.q;
        btn.onclick = () => {
            // Murderer selects this, prompt for Answer
            const ans = prompt(`Answer this for the public: ${opt.q} (${opt.a})`);
            if(ans) {
                logEvent(`🕵️ MURDERER HINT: "${opt.q}" - Answer: ${ans}`);
                container.classList.add('hidden');
            }
        };
        container.appendChild(btn);
    });
}