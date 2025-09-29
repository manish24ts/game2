// --- Module Aliases ---
const Engine = Matter.Engine,
      Render = Matter.Render,
      Runner = Matter.Runner,
      Bodies = Matter.Bodies,
      Composite = Matter.Composite,
      Events = Matter.Events,
      Query = Matter.Query,
      Mouse = Matter.Mouse;

// --- DOM Elements ---
const canvas = document.getElementById('game-canvas');
const startButton = document.getElementById('start-button');
const resetButton = document.getElementById('reset-button');
const waterLevelBar = document.getElementById('water-level-bar');
const messageContainer = document.getElementById('message-container');
const messageTitle = document.getElementById('message-title');
const messageText = document.getElementById('message-text');
const nextLevelButton = document.getElementById('next-level-button');

// --- Game Configuration ---
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const WATER_PARTICLE_SIZE = 5;
const DIRT_BLOCK_SIZE = 20;

// Educational Goalposts
const WATER_GOAL_MIN = 35; // %
const WATER_GOAL_MAX = 65; // %
const OVERWATER_LIMIT = 90; // %

// --- Game State ---
let engine, render, runner;
let dirtBlocks = [];
let waterParticles = [];
let waterInPot = 0;
let totalWaterNeeded = 200; // Arbitrary number of particles to fill the meter 100%
let isWaterFlowing = false;
let waterInterval;
let isDigging = false;
let gameEnded = false;
let plant; // **FIX:** Added a global reference for the plant object

// --- Main Game Setup ---
function setup() {
    // --- Engine Setup ---
    engine = Engine.create();
    engine.world.gravity.y = 1;

    // --- Renderer Setup ---
    render = Render.create({
        canvas: canvas,
        engine: engine,
        options: {
            width: GAME_WIDTH,
            height: GAME_HEIGHT,
            wireframes: false, // Render sprites, not outlines
            background: 'transparent' // Use CSS background
        }
    });

    // --- Runner ---
    runner = Runner.create();
    Runner.run(runner, engine);
    Render.run(render);
    
    // --- Mouse Controls for Digging ---
    const mouse = Mouse.create(render.canvas);
    canvas.addEventListener('mousedown', () => { if (!isWaterFlowing) isDigging = true; });
    canvas.addEventListener('mouseup', () => { isDigging = false; });
    canvas.addEventListener('mousemove', (event) => {
        if (isDigging && !isWaterFlowing) {
            // Find all dirt blocks under the mouse
            const bodies = Query.point(dirtBlocks, mouse.position);
            bodies.forEach(body => {
                // Remove from simulation and our tracking array
                Composite.remove(engine.world, body);
                dirtBlocks.splice(dirtBlocks.indexOf(body), 1);
            });
        }
    });

    // --- Initial Level ---
    loadLevel();
}

// --- Level Loading ---
function loadLevel() {
    // Clear previous level
    Composite.clear(engine.world, false);
    dirtBlocks = [];
    waterParticles = [];
    waterInPot = 0;
    isWaterFlowing = false;
    gameEnded = false;
    startButton.disabled = false;
    clearInterval(waterInterval);
    updateWaterMeter();

    // Create Ground and Walls
    const ground = Bodies.rectangle(GAME_WIDTH / 2, GAME_HEIGHT, GAME_WIDTH, 20, { isStatic: true, label: 'ground' });
    const leftWall = Bodies.rectangle(0, GAME_HEIGHT / 2, 20, GAME_HEIGHT, { isStatic: true });
    const rightWall = Bodies.rectangle(GAME_WIDTH, GAME_HEIGHT / 2, 20, GAME_HEIGHT, { isStatic: true });

    // Create the Plant Pot (as a sensor)
    const plantPotSensor = Bodies.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 50, 100, 20, {
        isStatic: true,
        isSensor: true, // Doesn't collide, just detects
        label: 'plant_pot_sensor'
    });

    // Visual Pot (static body)
    const potVisual = Bodies.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 30, 120, 60, { 
        isStatic: true,
        render: { sprite: { texture: 'plant_pot.jpg' } }
    });
    
    // **FIX:** Create the plant with changing states
    plant = Bodies.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 95, 128, 128, {
        isStatic: true,
        label: 'plant',
        render: { sprite: { texture: 'plant_wilting.jpg' } }
    });

    // Faucet
    const faucet = Bodies.rectangle(100, 50, 80, 50, {
        isStatic: true,
        render: { sprite: { texture: 'faucet.png' } }
    });

    Composite.add(engine.world, [ground, leftWall, rightWall, plantPotSensor, potVisual, faucet, plant]);
    
    // Create Dirt Grid
    for (let y = 0; y < 15; y++) {
        for (let x = 0; x < GAME_WIDTH / DIRT_BLOCK_SIZE; x++) {
            if (y > 5 && y < 25) {
                const dirt = Bodies.rectangle(
                    x * DIRT_BLOCK_SIZE + DIRT_BLOCK_SIZE / 2,
                    y * DIRT_BLOCK_SIZE + DIRT_BLOCK_SIZE / 2,
                    DIRT_BLOCK_SIZE, DIRT_BLOCK_SIZE,
                    { 
                        isStatic: true, 
                        label: 'dirt',
                        render: { sprite: { texture: 'dirt_block.png' } }
                    }
                );
                dirtBlocks.push(dirt);
                Composite.add(engine.world, dirt);
            }
        }
    }
}

// --- Water Flow ---
function toggleWaterFlow() {
    if (gameEnded) return;
    isWaterFlowing = true;
    startButton.disabled = true; // Prevent multiple clicks
    
    waterInterval = setInterval(() => {
        const particle = Bodies.circle(100, 80, WATER_PARTICLE_SIZE, {
            restitution: 0.2,
            friction: 0.1,
            density: 0.002,
            label: 'water',
            render: { fillStyle: '#1e90ff' }
        });
        waterParticles.push(particle);
        Composite.add(engine.world, particle);
    }, 100);

    // **FIX:** Automatically stop the water and check the result after a delay
    setTimeout(() => {
        if (!gameEnded) {
            clearInterval(waterInterval);
            // Add a small delay for water to settle before checking the end condition
            setTimeout(checkEndCondition, 2000); 
        }
    }, 5000); // Water flows for 5 seconds
}

// --- Collision Detection ---
Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        if ((bodyA.label === 'water' && bodyB.label === 'plant_pot_sensor') ||
            (bodyB.label === 'water' && bodyA.label === 'plant_pot_sensor')) {
            const waterParticle = bodyA.label === 'water' ? bodyA : bodyB;
            
            waterInPot++;
            // Remove the particle so it can't be counted again
            Composite.remove(engine.world, waterParticle);
            updateWaterMeter();
        }
    });
});

// --- UI and Game State Updates ---
function updateWaterMeter() {
    const percentage = Math.min(100, (waterInPot / totalWaterNeeded) * 100);
    waterLevelBar.style.height = `${percentage}%`;

    // **FIX:** Update plant sprite based on water level
    if (percentage > OVERWATER_LIMIT) {
        waterLevelBar.style.backgroundColor = '#8B4513'; // Muddy brown
        plant.render.sprite.texture = 'plant_drowning.jpg';
    } else if (percentage >= WATER_GOAL_MIN) {
        plant.render.sprite.texture = 'plant_healthy.jpg';
        waterLevelBar.style.backgroundColor = '#1e90ff';
    } else {
        plant.render.sprite.texture = 'plant_wilting.jpg';
        waterLevelBar.style.backgroundColor = '#1e90ff';
    }
}

function checkEndCondition() {
    if (gameEnded) return;
    const percentage = (waterInPot / totalWaterNeeded) * 100;

    if (percentage >= WATER_GOAL_MIN && percentage <= WATER_GOAL_MAX) {
        endGame(true); // Win
    } else {
        endGame(false); // Lose
    }
}

function endGame(isWin) {
    gameEnded = true;
    isWaterFlowing = false;
    clearInterval(waterInterval);
    
    messageContainer.classList.remove('hidden');
    if (isWin) {
        messageTitle.innerText = 'Success!';
        messageText.innerText = 'Perfect irrigation! You gave the plant just what it needed. This conserves water and keeps the soil healthy.';
    } else {
        const percentage = (waterInPot / totalWaterNeeded) * 100;
        messageTitle.innerText = 'Try Again!';
        if (percentage > WATER_GOAL_MAX) {
            messageText.innerText = 'Over-irrigated! Too much water washes away vital nutrients and can harm plant roots. Precision is key!';
        } else {
            messageText.innerText = 'Not enough water! The plant is still thirsty. Try to guide the water more efficiently.';
        }
    }
}

// --- Event Listeners ---
startButton.addEventListener('click', toggleWaterFlow);
resetButton.addEventListener('click', () => {
    messageContainer.classList.add('hidden');
    loadLevel();
});
nextLevelButton.addEventListener('click', () => {
    messageContainer.classList.add('hidden');
    loadLevel(); // For now, this just reloads the same level
});

// --- Initialize Game ---
window.onload = setup;