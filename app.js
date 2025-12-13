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
let myCash = 15000;
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

// --- NAVIGATION FUNCTIONS ---

function showCreate() {
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('create-screen').classList.remove('hidden');
}

function showJoin() {
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('join-screen').classList.remove('hidden');
}

function backToMenu() {
    document.getElementById('create-screen').classList.add('hidden');
    document.getElementById('join-screen').classList.add('hidden');
    document.getElementById('menu-screen').classList.remove('hidden');
}

// --- CORE GAME LOGIC ---

// 1. CREATE A NEW SESSION
function createGame() {
    const name = document.getElementById('c-name').value.toUpperCase().trim();
    const room = document.getElementById('c-room').value.toUpperCase().trim();
    const limit = parseInt(document.getElementById('c-limit').value);

    if (!name || !room || !limit) return alert("Please fill all fields!");

    // Set up the Game Settings FIRST
    const gameRef = db.ref(`games/${room}`);
    
    gameRef.once('value', snapshot => {
        if (snapshot.exists()) {
            alert("Room already exists! Please use Join or pick another code.");
        } else {
            // Pick a random number between 1 and Limit to be the Murderer
            const murdererIndex = Math.floor(Math.random() * limit) + 1;
            
            gameRef.child('settings').set({
                playerLimit: limit,
                murdererIndex: murdererIndex,
                playerCount: 0
            }).then(() => {
                // Now join the game as the creator
                enterGameLoop(name, room);
            });
        }
    });
}

// 2. JOIN EXISTING SESSION
function joinGame() {
    const name = document.getElementById('j-name').value.toUpperCase().trim();
    const room = document.getElementById('j-room').value.toUpperCase().trim();

    if (!name || !room) return alert("Fill in Name and Room!");

    db.ref(`games/${room}/settings`).once('value', snapshot => {
        if (!snapshot.exists()) {
            return alert("Room does not exist! Go back and Create it first.");
        }
        enterGameLoop(name, room);
    });
}

// 3. THE LOGIC TO ENTER/RESUME
function enterGameLoop(name, room) {
    myName = name;
    roomCode = room;
    // Use NAME as ID so re-joining works (Remove special chars to be safe)
    myId = myName.replace(/[^A-Z0-9]/g, ''); 

    const playerRef = db.ref(`games/${roomCode}/players/${myId}`);
    const settingsRef = db.ref(`games/${roomCode}/settings`);

    playerRef.once('value', snapshot => {
        if (snapshot.exists()) {
            // SCENARIO A: RESUMING GAME (Switch Device / Reload)
            console.log("Welcome back!");
            setupRealtimeListener();
            document.getElementById('create-screen').classList.add('hidden');
            document.getElementById('join-screen').classList.add('hidden');
            document.getElementById('game-screen').classList.remove('hidden');
        } else {
            // SCENARIO B: NEW PLAYER JOINING
            // We need a transaction to safely increment player count
            settingsRef.transaction(currentSettings => {
                if (currentSettings) {
                    if (currentSettings.playerCount < currentSettings.playerLimit) {
                        currentSettings.playerCount++;
                        return currentSettings;
                    } else {
                        // Game is full
                        return; // Abort transaction
                    }
                }
                return currentSettings;
            }, (error, committed, snapshot) => {
                if (error) {
                    alert("Error joining.");
                } else if (!committed) {
                    alert("Game is Full!");
                } else {
                    // Success! We reserved a spot. Now assign Role.
                    const newCount = snapshot.val().playerCount;
                    const murdererTarget = snapshot.val().murdererIndex;
                    
                    const assignedRole = (newCount === murdererTarget) ? "Murderer" : "Civilian";

                    // Save New Player Data
                    playerRef.set({
                        name: myName,
                        cash: 15000,
                        role: assignedRole,
                        lands: [],
                        powerCards: [],
                        joinOrder: newCount
                    });

                    setupRealtimeListener();
                    document.getElementById('create-screen').classList.add('hidden');
                    document.getElementById('join-screen').classList.add('hidden');
                    document.getElementById('game-screen').classList.remove('hidden');
                }
            });
        }
    });
}

function setupRealtimeListener() {
    // Listen to my own data
    db.ref(`games/${roomCode}/players/${myId}`).on('value', snapshot => {
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
}

// --- UI UPDATES & ACTIONS ---

function updateUI(data) {
    document.getElementById('player-name-display').innerText = data.name;
    document.getElementById('cash-display').innerText = `RM ${data.cash}`;
    document.getElementById('role-display').innerText = data.role;
    
    if (data.role === "Murderer") {
        document.getElementById('murderer-zone').classList.remove('hidden');
    }
}

function toggleRole() {
    const el = document.getElementById('role-display');
    el.classList.toggle('blur');
}

function openModal(type) {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    const title = document.getElementById('modal-title');
    overlay.classList.remove('hidden');
    content.innerHTML = '';

    if (type === 'pay') {
        title.innerText = "Pay Player";
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

function confirmPay() {
    const targetId = document.getElementById('pay-target').value;
    const amount = parseInt(document.getElementById('pay-amount').value);
    
    if (!targetId || !amount) return;

    db.ref(`games/${roomCode}/players/${myId}/cash`).set(myCash - amount);
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
    db.ref(`games/${roomCode}/players/${myId}/lands`).push(`Land #${landNum}`);
    logEvent(`${myName} claimed Land #${landNum}`);
    closeModal();
}

function drawCard(type) {
    const deck = type === 'chest' ? chestCards : powerCards;
    const card = deck[Math.floor(Math.random() * deck.length)];
    
    alert(`You drew: ${card}`);
    
    if (type === 'power') {
        db.ref(`games/${roomCode}/players/${myId}/powerCards`).push(card);
    } else {
        logEvent(`${myName} drew a Chest Card: ${card}`);
    }
}

function logEvent(msg) {
    db.ref(`games/${roomCode}/log`).push(msg);
}

function triggerHintSelection() {
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
            const ans = prompt(`Answer this for the public: ${opt.q} (${opt.a})`);
            if(ans) {
                logEvent(`🕵️ MURDERER HINT: "${opt.q}" - Answer: ${ans}`);
                container.classList.add('hidden');
            }
        };
        container.appendChild(btn);
    });
}