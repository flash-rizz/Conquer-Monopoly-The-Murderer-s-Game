from flask import Flask, request, jsonify
import random

app = Flask(__name__)

# --- GLOBAL GAME STATE (SIMULATED DATABASE) ---
GAME_STATE = {
    "is_active": False,
    "players": {},  # Stores {id: {'cash', 'role', 'properties', 'cards', 'is_alive'}}
    "murderer_id": None,
    "round_number": 0,
    "PROPERTY_COSTS": {
        "Low_Value_Land": 1000,
        "Mid_Value_Land": 2000,
        "High_Value_Land": 3000,
        "Railroad": 2000,
        "Utility": 1500
    }
}
INITIAL_CASH = 5000
ACQUISITION_FINE = 500
HOUSE_COST = 800

# --- HELPER FUNCTIONS (Randomizers) ---

def roll_probability_die():
    """Simulates the 1-20 Probability Die roll."""
    return random.randint(1, 20)

def roll_percentage_die():
    """Simulates the 10-100 Percentage Die (multiples of 10)."""
    return random.choice([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])

def get_challenge_details():
    """Provides a random Challenge."""
    challenges = [
        {"name": "Dice Sum Challenge", "description": "Roll the Movement Die (1-6) exactly 3 times. The sum must be between 11 and 15.", "type": "Physical"},
        {"name": "Anagram Challenge", "description": "Opponent names a common 5-letter word. You must give a valid 5-letter anagram within 15 seconds.", "type": "Mental"},
        {"name": "Country Name Quiz", "description": "Name a country from A-to-M under a minute.", "type": "Mental"},
    ]
    return random.choice(challenges)

def get_chest_card_details():
    """Provides a random Chest Card action."""
    cards = [
        {"name": "Inheritance Found", "action": "Receive cash", "amount": 3000},
        {"name": "Get Murderer Hint", "action": "Trigger Hint", "amount": 0},
        {"name": "Bad Investment", "action": "Pay Percentage", "details": "Roll Percentage Die and pay that percentage of your cash."},
        {"name": "Stole Random Land", "action": "Swap Land", "details": "Steal a random land from a random player."},
    ]
    return random.choice(cards)

def get_murderer_questions():
    """Provides 3 sets of questions for the hint."""
    questions = [
        ("Am I wearing a HAT or not?", "I am wearing a HAT.", "I am not wearing a HAT."),
        ("Do I prefer COFFEE or TEA?", "I prefer COFFEE.", "I prefer TEA."),
        ("Am I the OLDEST or YOUNGEST player?", "I am the OLDEST.", "I am the YOUNGEST."),
    ]
    return random.sample(questions, 3)

# --- 1. SETUP & ROLES ENDPOINTS ---

@app.route('/game/start', methods=['POST'])
def start_game():
    """Initializes the game and assigns roles."""
    if GAME_STATE['is_active']:
        return jsonify({"error": "Game already active"}), 400
        
    player_names = request.json.get('players') # Expects a list of names
    if not player_names or len(player_names) < 3:
        return jsonify({"error": "Need at least 3 players"}), 400
        
    # Assign roles (Exactly one Murderer)
    murderer_name = random.choice(player_names)
    GAME_STATE['murderer_id'] = murderer_name
    GAME_STATE['players'] = {}

    for name in player_names:
        role = "Murderer" if name == murderer_name else "Civilian"
        GAME_STATE['players'][name] = {
            'role': role,
            'cash': INITIAL_CASH,
            'properties': [],
            'power_cards': [],
            'is_alive': True
        }
    
    GAME_STATE['is_active'] = True
    return jsonify({"message": "Game started. Players can now retrieve their private data."})

@app.route('/player/<player_id>/data', methods=['GET'])
def get_player_data(player_id):
    """Allows a player to retrieve their private data (Cash, Role, Inventory)."""
    player = GAME_STATE['players'].get(player_id)
    if not player:
        return jsonify({"error": "Player not found or game not active"}), 404
    # This is the primary endpoint for the player's private dashboard.
    return jsonify(player)

# --- 2. TRANSACTION ENDPOINTS ---

@app.route('/transaction/transfer', methods=['POST'])
def transfer_cash():
    """Handles cash transfers between any two parties (player/bank)."""
    data = request.json
    sender = data.get('sender')
    receiver = data.get('receiver')
    amount = int(data.get('amount'))

    if not all([sender, receiver, amount > 0]):
        return jsonify({"error": "Invalid transaction data"}), 400

    if sender not in GAME_STATE['players'] or receiver not in (GAME_STATE['players'] or ['Bank']):
        return jsonify({"error": "Invalid sender or receiver ID"}), 404

    if GAME_STATE['players'][sender]['cash'] < amount:
        # Player is bankrupt/eliminated. The app should handle this, but the backend prevents negative balance.
        return jsonify({"error": "Insufficient funds"}), 403

    GAME_STATE['players'][sender]['cash'] -= amount
    
    if receiver != 'Bank':
        GAME_STATE['players'][receiver]['cash'] += amount

    return jsonify({
        "message": f"Transfer of RM {amount} successful.",
        "sender_cash": GAME_STATE['players'][sender]['cash'],
        "receiver_cash": GAME_STATE['players'][receiver]['cash'] if receiver != 'Bank' else "Bank"
    })

# --- 3. LAND ACQUISITION ENDPOINTS ---

@app.route('/land/acquire_check', methods=['POST'])
def check_acquisition():
    """Determines if the player must Challenge, Pay, or Fail."""
    roll = roll_probability_die()
    
    # 1-7: Challenge, 8-14: Money, 15-20: Failed
    if roll <= 7:
        action = "Challenge"
        details = get_challenge_details()
    elif roll <= 14:
        action = "Money"
        details = {"price": GAME_STATE['PROPERTY_COSTS'].get(request.json.get('property_type', 'Mid_Value_Land'))}
    else:
        action = "Failed"
        details = {}
        
    return jsonify({"action": action, "roll": roll, "details": details})

@app.route('/land/claim', methods=['POST'])
def claim_land():
    """Registers a property to a player after successful acquisition."""
    player_id = request.json.get('player_id')
    property_name = request.json.get('property_name')
    
    # Assume cash transaction handled prior to this (Buy button press)
    GAME_STATE['players'][player_id]['properties'].append({"name": property_name, "houses": 0})
    
    # Simple registry to prevent duplicate ownership
    GAME_STATE['properties'][property_name] = player_id 
    
    return jsonify({"message": f"{property_name} claimed by {player_id}"})


# --- 4. RANDOM EVENT ENDPOINTS (Chest/Challenge/Compete) ---

@app.route('/event/draw_chest', methods=['GET'])
def draw_chest():
    """Provides a random Chest Card, including any percentage die rolls needed."""
    card = get_chest_card_details()
    
    if card['action'] == "Pay Percentage":
        percentage = roll_percentage_die()
        card['percentage'] = percentage
        
    return jsonify(card)

# --- 5. MURDERER SYSTEM ENDPOINTS ---

@app.route('/murderer/hint_prompt', methods=['GET'])
def get_hint_prompt():
    """Provides the 3 questions only to the Murderer's app."""
    # The calling app must verify the player is the Murderer before displaying this.
    return jsonify({"questions": get_murderer_questions()})

@app.route('/murderer/hint_broadcast', methods=['POST'])
def broadcast_hint():
    """Broadcasts the final hint to all players (via their app updates)."""
    hint = request.json.get('hint')
    # In a real app, this would trigger a push notification or a WebSocket message to all clients.
    print(f"\n*** PUBLIC HINT BROADCAST ***: {hint}\n") 
    return jsonify({"message": "Hint successfully broadcasted."})

@app.route('/murderer/kill_player', methods=['POST'])
def kill_player():
    """Handles the automatic kill by the Murderer or a successful accusation."""
    target_id = request.json.get('target_id')
    reason = request.json.get('reason', 'Murderer Kill')
    
    if target_id not in GAME_STATE['players'] or not GAME_STATE['players'][target_id]['is_alive']:
        return jsonify({"error": "Target not found or already eliminated"}), 404

    # Target is eliminated
    GAME_STATE['players'][target_id]['is_alive'] = False
    GAME_STATE['players'][target_id]['cash'] = 0
    # Return all properties to the Bank
    for prop in GAME_STATE['players'][target_id]['properties']:
        if prop['name'] in GAME_STATE['properties']:
            del GAME_STATE['properties'][prop['name']]
    
    # In a real app, broadcast elimination.
    print(f"\n*** PLAYER ELIMINATED ***: {target_id} was eliminated by {reason}.\n")
    return jsonify({"message": f"{target_id} eliminated."})


# --- 6. ACCUSATION ENDPOINT ---

@app.route('/game/accuse', methods=['POST'])
def handle_accusation():
    """Checks if an accusation is correct, leading to elimination or game end."""
    accuser_id = request.json.get('accuser_id')
    accused_id = request.json.get('accused_id')

    if accused_id == GAME_STATE['murderer_id']:
        # Correct Guess - Game Over (Civilians Win)
        return jsonify({
            "status": "SUCCESS",
            "message": f"ACCUSATION SUCCESSFUL! The Murderer ({accused_id}) was caught! {accuser_id} and Civilians Win!"
        })
    else:
        # Incorrect Guess - Accuser is eliminated (self-kill)
        kill_result = kill_player(json={"target_id": accuser_id, "reason": "Failed Accusation"})
        return jsonify({
            "status": "FAILURE",
            "message": f"ACCUSATION FAILED! {accuser_id} has been eliminated (Self-Kill)."
        })


if __name__ == '__main__':
    # You would typically run this on a server accessible to all phones.
    # For local testing, use '0.0.0.0' to allow network access.
    app.run(host='0.0.0.0', port=5000, debug=True)

@app.route('/')
def home():
    return "Conquer Monopoly Server is running!"