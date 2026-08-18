import * as THREE
from "https://unpkg.com/three@0.165.0/build/three.module.js";

import { EffectComposer }
from "https://unpkg.com/three@0.165.0/examples/jsm/postprocessing/EffectComposer.js";

import { RenderPass }
from "https://unpkg.com/three@0.165.0/examples/jsm/postprocessing/RenderPass.js";

import { UnrealBloomPass }
from "https://unpkg.com/three@0.165.0/examples/jsm/postprocessing/UnrealBloomPass.js";

/* =====================================================
   CORE
===================================================== */

let scene;
let camera;
let renderer;
let composer;

let neuralGroup;
let nodeGroup;

let raycaster;
let mouse;

let animationClock;

let targetScale = 1;
const scaleVector = new THREE.Vector3();

let cameraHome;
let cameraFocus;

const clickableObjects = [];
const nodeEntries = []; // { key, label, mesh, callback }

let hoveredEntry = null;
let tooltipEl = null;

/* =====================================================
   NODE DEFINITIONS
   Every JARVIS feature lives here as a point on the
   sphere. Positions are spread evenly using a Fibonacci
   sphere distribution so they never overlap.
===================================================== */

const NODE_KEYS = [
    { key: "dashboard", label: "SYSTEM STATUS" },
    { key: "camera", label: "LIVE CAMERA" },
    { key: "voice", label: "VOICE ENGINE" },
    { key: "chat", label: "JARVIS" },
    { key: "viewer", label: "3D VIEWER" },
    { key: "map", label: "GLOBAL MAP" },
    { key: "research", label: "RESEARCH AGENT" },
    { key: "asa", label: "SOLUTION ARCHITECT" },
    { key: "physics", label: "PHYSICS LAB" },
    { key: "projects", label: "PROJECT ARCHIVE" }
];

/* =====================================================
   INIT
===================================================== */

export function initScene(canvas) {

    scene = new THREE.Scene();

    animationClock = new THREE.Clock();

    camera = new THREE.PerspectiveCamera(
        65,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    cameraHome = new THREE.Vector3(0, 0, 7);
    cameraFocus = cameraHome.clone();
    camera.position.copy(cameraHome);

    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true
    });

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, 2)
    );

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );

    renderer.outputColorSpace =
        THREE.SRGBColorSpace;

    createBloom();
    createLights();
    createNeuralSphere();
    createInteractiveNodes();
    createBackgroundParticles();
    createTooltip();

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("resize", handleResize);

    animate();
}

/* =====================================================
   BLOOM
===================================================== */

function createBloom() {

    composer = new EffectComposer(renderer);

    const renderPass =
        new RenderPass(scene, camera);

    composer.addPass(renderPass);

    const bloomPass =
        new UnrealBloomPass(
            new THREE.Vector2(
                window.innerWidth,
                window.innerHeight
            ),
            1.2,
            0.4,
            0.8
        );

    bloomPass.threshold = 0;
    bloomPass.strength = 1.6;
    bloomPass.radius = 0.5;

    composer.addPass(bloomPass);
}

/* =====================================================
   LIGHTS
===================================================== */

function createLights() {

    const ambient =
        new THREE.AmbientLight(
            0x00ffff,
            0.7
        );

    scene.add(ambient);

    const point =
        new THREE.PointLight(
            0x00ffff,
            8,
            50
        );

    point.position.set(
        0,
        0,
        8
    );

    scene.add(point);
}

/* =====================================================
   NEURAL SPHERE
===================================================== */

function createNeuralSphere() {

    neuralGroup = new THREE.Group();

    scene.add(neuralGroup);

    const material =
        new THREE.MeshBasicMaterial({
            color: 0x00ffff
        });

    const geometry =
        new THREE.SphereGeometry(
            0.035,
            8,
            8
        );

    const points = [];

    for (let i = 0; i < 500; i++) {

        const phi =
            Math.acos(
                -1 + (2 * i) / 500
            );

        const theta =
            Math.sqrt(
                800 * Math.PI
            ) * phi;

        const x =
            Math.cos(theta) *
            Math.sin(phi);

        const y =
            Math.sin(theta) *
            Math.sin(phi);

        const z =
            Math.cos(phi);

        const node =
            new THREE.Mesh(
                geometry,
                material
            );

        node.position.set(
            x * 2.2,
            y * 2.2,
            z * 2.2
        );

        neuralGroup.add(node);

        points.push(
            new THREE.Vector3(
                x * 2.2,
                y * 2.2,
                z * 2.2
            )
        );
    }

    createConnections(points);
}

/* =====================================================
   CONNECTIONS
===================================================== */

function createConnections(points) {

    const lineMaterial =
        new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.12
        });

    const maxDistance = 0.55;

    const positions = [];

    for (let i = 0; i < points.length; i++) {

        for (
            let j = i + 1;
            j < points.length;
            j++
        ) {

            const distance =
                points[i].distanceTo(
                    points[j]
                );

            if (distance < maxDistance) {

                positions.push(
                    points[i].x,
                    points[i].y,
                    points[i].z
                );

                positions.push(
                    points[j].x,
                    points[j].y,
                    points[j].z
                );
            }
        }
    }

    const geometry =
        new THREE.BufferGeometry();

    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
            positions,
            3
        )
    );

    const lines =
        new THREE.LineSegments(
            geometry,
            lineMaterial
        );

    neuralGroup.add(lines);
}

/* =====================================================
   INTERACTIVE NODES — one per feature, evenly spread
   on a Fibonacci sphere shell around the core.
===================================================== */

function createInteractiveNodes() {

    nodeGroup = new THREE.Group();
    neuralGroup.add(nodeGroup);

    const geometry = new THREE.SphereGeometry(0.18, 32, 32);
    const radius = 2.9;
    const count = NODE_KEYS.length;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    NODE_KEYS.forEach((def, i) => {

        // Fibonacci sphere point distribution
        const y = 1 - (i / (count - 1)) * 2;
        const radiusAtY = Math.sqrt(1 - y * y);
        const theta = goldenAngle * i;

        const x = Math.cos(theta) * radiusAtY;
        const z = Math.sin(theta) * radiusAtY;

        const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({ color: 0x00ffff })
        );

        mesh.position.set(x * radius, y * radius, z * radius);
        mesh.userData.phaseOffset = i * 0.7;

        nodeGroup.add(mesh);

        const ringGeometry = new THREE.RingGeometry(0.24, 0.27, 32);
        const ring = new THREE.Mesh(
            ringGeometry,
            new THREE.MeshBasicMaterial({
                color: 0x00ffff,
                transparent: true,
                opacity: 0.5,
                side: THREE.DoubleSide
            })
        );

        ring.position.copy(mesh.position);
        ring.lookAt(0, 0, 0);
        nodeGroup.add(ring);

        const entry = { key: def.key, label: def.label, mesh, callback: null };

        nodeEntries.push(entry);
        clickableObjects.push(mesh);
    });
}

/* =====================================================
   TOOLTIP (hover label)
===================================================== */

function createTooltip() {

    tooltipEl = document.createElement("div");
    tooltipEl.id = "sceneNodeTooltip";
    tooltipEl.style.display = "none";
    document.body.appendChild(tooltipEl);
}

function showTooltip(label, x, y) {

    if (!tooltipEl) return;

    tooltipEl.textContent = label;
    tooltipEl.style.left = `${x + 18}px`;
    tooltipEl.style.top = `${y - 12}px`;
    tooltipEl.style.display = "block";
}

function hideTooltip() {

    if (!tooltipEl) return;
    tooltipEl.style.display = "none";
}

/* =====================================================
   STARFIELD
===================================================== */

function createBackgroundParticles() {

    const count = 3000;

    const geometry =
        new THREE.BufferGeometry();

    const positions = [];

    for (let i = 0; i < count; i++) {

        positions.push(
            (Math.random() - 0.5) * 80,
            (Math.random() - 0.5) * 80,
            (Math.random() - 0.5) * 80
        );
    }

    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
            positions,
            3
        )
    );

    const material =
        new THREE.PointsMaterial({
            color: 0x00ffff,
            size: 0.03,
            transparent: true,
            opacity: 0.7
        });

    const stars =
        new THREE.Points(
            geometry,
            material
        );

    scene.add(stars);
}

/* =====================================================
   INTERACTION
===================================================== */

function updateMouseFromEvent(event) {

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function raycastNodes() {

    raycaster.setFromCamera(mouse, camera);

    const hits = raycaster.intersectObjects(clickableObjects);
    if (!hits.length) return null;

    return nodeEntries.find(entry => entry.mesh === hits[0].object) || null;
}

function handlePointerDown(event) {

    updateMouseFromEvent(event);

    const entry = raycastNodes();
    if (!entry) return;

    focusOnNode(entry);
}

function handlePointerMove(event) {

    updateMouseFromEvent(event);

    const entry = raycastNodes();

    if (entry !== hoveredEntry) {

        hoveredEntry = entry;
        document.body.style.cursor = entry ? "pointer" : "default";
    }

    if (entry) {
        showTooltip(entry.label, event.clientX, event.clientY);
    } else {
        hideTooltip();
    }
}

/* =====================================================
   FOCUS / ZOOM TO NODE
===================================================== */

function focusOnNode(entry) {

    // world-space direction of the node right now, so the swoop
    // heads toward wherever it currently is on the rotating sphere
    const worldPos = new THREE.Vector3();
    entry.mesh.getWorldPosition(worldPos);

    const dir = worldPos.clone().normalize();

    cameraFocus.set(dir.x * 2.2, dir.y * 2.2, 2.6 + dir.z * 0.6);

    targetScale = 6;

    window.setTimeout(() => {

        if (entry.callback) entry.callback();

    }, 480);
}

export function resetCameraFocus() {

    cameraFocus.copy(cameraHome);
    targetScale = 1;
}

/* =====================================================
   CALLBACKS
===================================================== */

export function setNodeCallback(key, fn) {

    const entry = nodeEntries.find(e => e.key === key);
    if (entry) entry.callback = fn;
}

/* =====================================================
   ZOOM (kept for compatibility with existing call sites)
===================================================== */

export function zoomIn() {
    targetScale = 8;
}

export function zoomOut() {
    resetCameraFocus();
}

/* =====================================================
   FPS
===================================================== */

let frameCounter = 0;
let lastFpsUpdate = performance.now();
let currentFPS = 0;

export function getFPS() {
    return currentFPS;
}

/* =====================================================
   ANIMATE
===================================================== */

function animate() {

    requestAnimationFrame(animate);

    const elapsed = animationClock.getElapsedTime();

    neuralGroup.rotation.y += 0.0016;
    neuralGroup.rotation.x += 0.0005;

    nodeEntries.forEach(entry => {

        entry.mesh.scale.setScalar(
            1 + Math.sin(elapsed * 3 + entry.mesh.userData.phaseOffset) * 0.15
        );
    });

    scaleVector.set(targetScale, targetScale, targetScale);
    neuralGroup.scale.lerp(scaleVector, 0.045);

    camera.position.lerp(cameraFocus, 0.055);
    camera.lookAt(0, 0, 0);

    frameCounter++;

    const now = performance.now();

    if (now - lastFpsUpdate > 1000) {

        currentFPS = frameCounter;
        frameCounter = 0;
        lastFpsUpdate = now;
    }

    composer.render();
}

/* =====================================================
   RESIZE
===================================================== */

function handleResize() {

    camera.aspect =
        window.innerWidth /
        window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );

    composer.setSize(
        window.innerWidth,
        window.innerHeight
    );
}