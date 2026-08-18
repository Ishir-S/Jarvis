/* =====================================================
   JARVIS - 3D VIEWER MODULE
   Real textures + live animation for every scene
===================================================== */

import * as THREE from "three";

import { GLTFLoader }
from "https://unpkg.com/three@0.165.0/examples/jsm/loaders/GLTFLoader.js";

import { OrbitControls }
from "https://unpkg.com/three@0.165.0/examples/jsm/controls/OrbitControls.js";

const TEX_BASE =
    "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/";

const textureLoader = new THREE.TextureLoader();
const clock = new THREE.Clock();

let renderer;
let scene;
let camera;
let controls;

let currentGroup = null;
let currentUpdate = null; // (elapsed, delta) => void, set per-scene
let initialized = false;

/* =====================================================
   INIT
===================================================== */

export function initViewer() {

    document
        .getElementById("loadSolar")
        ?.addEventListener("click", () => loadScene(buildSolarSystem));

    document
        .getElementById("loadEarth")
        ?.addEventListener("click", () => loadScene(buildEarth));

    document
        .getElementById("loadMolecule")
        ?.addEventListener("click", () => loadScene(buildMolecule));

    document
        .getElementById("loadNeural")
        ?.addEventListener("click", () => loadScene(buildNeuralNetwork));

    document
        .getElementById("loadCustom")
        ?.addEventListener("click", () => {

            document.getElementById("modelFile")?.click();
        });

    document
        .getElementById("modelFile")
        ?.addEventListener("change", handleFileImport);
}

function ensureRenderer() {

    if (initialized) return;

    initialized = true;

    const canvas =
        document.getElementById("viewerCanvas");

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
        60,
        (canvas.clientWidth || 1) / (canvas.clientHeight || 1),
        0.1,
        1000
    );

    camera.position.set(0, 2, 8);

    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true
    });

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, 2)
    );

    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const point = new THREE.PointLight(0x00ffff, 4, 100);
    point.position.set(5, 5, 5);
    scene.add(point);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    window.addEventListener("resize", resizeViewer);

    resizeViewer();

    clock.start();
    animateViewer();
}

function resizeViewer() {

    const canvas =
        document.getElementById("viewerCanvas");

    if (!canvas || !renderer) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (!width || !height) return;

    renderer.setSize(width, height, false);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}

function animateViewer() {

    requestAnimationFrame(animateViewer);

    const elapsed = clock.getElapsedTime();
    const delta = clock.getDelta();

    if (currentUpdate) {

        currentUpdate(elapsed, delta);

    } else if (currentGroup) {

        // fallback for imported models with no custom animation
        currentGroup.rotation.y += 0.002;
    }

    controls?.update();

    renderer?.render(scene, camera);
}

function clearScene() {

    if (currentGroup) {

        disposeGroup(currentGroup);
        scene.remove(currentGroup);
        currentGroup = null;
    }

    currentUpdate = null;
}

function disposeGroup(group) {

    group.traverse(obj => {

        if (obj.geometry) obj.geometry.dispose();

        if (obj.material) {

            const materials = Array.isArray(obj.material) ? obj.material : [obj.material];

            materials.forEach(mat => {

                Object.values(mat).forEach(value => {

                    if (value && value.isTexture) value.dispose();
                });

                mat.dispose();
            });
        }
    });
}

export function loadSceneByName(name) {

    const builders = {
        solar: buildSolarSystem,
        earth: buildEarth,
        molecule: buildMolecule,
        neural: buildNeuralNetwork
    };

    const builder = builders[name];
    if (!builder) return false;

    loadScene(builder);
    return true;
}

function loadScene(builder) {

    ensureRenderer();

    // canvas may have been hidden (display:none) when sized, resize again
    resizeViewer();

    clearScene();

    const result = builder();

    currentGroup = result.group;
    currentUpdate = result.update || null;

    scene.add(currentGroup);
}

/* =====================================================
   PROCEDURAL TEXTURE HELPERS
   (canvas-generated, so every planet/atom gets a real,
   unique surface instead of a flat solid color)
===================================================== */

function makeCanvas(size = 256) {

    const canvas = document.createElement("canvas");
    canvas.width = size * 2;
    canvas.height = size;

    return canvas;
}

function canvasToTexture(canvas) {

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;

    return tex;
}

/** Rocky, cratered surface — Mercury / Mars-style */
function createRockyTexture(baseColor, craterColor, craterCount = 90) {

    const canvas = makeCanvas();
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < craterCount; i++) {

        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const r = 2 + Math.random() * 10;

        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, craterColor);
        grad.addColorStop(1, "rgba(0,0,0,0)");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    return canvasToTexture(canvas);
}

/** Turbulent horizontal bands — gas giants / Venus */
function createBandedTexture(colors) {

    const canvas = makeCanvas();
    const ctx = canvas.getContext("2d");

    const bandHeight = canvas.height / colors.length;

    colors.forEach((color, i) => {

        ctx.fillStyle = color;
        ctx.fillRect(0, i * bandHeight, canvas.width, bandHeight + 1);
    });

    // turbulence: scribble semi-transparent arcs across the bands
    for (let i = 0; i < 40; i++) {

        const y = Math.random() * canvas.height;
        const amp = 4 + Math.random() * 14;
        const color = colors[Math.floor(Math.random() * colors.length)];

        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 1 + Math.random() * 3;

        ctx.beginPath();

        for (let x = 0; x <= canvas.width; x += 8) {

            const yy = y + Math.sin(x * 0.02 + i) * amp;

            if (x === 0) ctx.moveTo(x, yy);
            else ctx.lineTo(x, yy);
        }

        ctx.stroke();
    }

    ctx.globalAlpha = 1;

    return canvasToTexture(canvas);
}

/** Soft alpha cloud layer, used over Earth */
function createCloudTexture() {

    const canvas = makeCanvas();
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 140; i++) {

        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const r = 8 + Math.random() * 26;

        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, "rgba(255,255,255,0.65)");
        grad.addColorStop(1, "rgba(255,255,255,0)");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;

    return tex;
}

/** Soft radial glow, used as a sprite map for neural nodes / pulses */
function createGlowTexture(hex = "#00ffff") {

    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;

    const ctx = canvas.getContext("2d");

    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, hex);
    grad.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    return new THREE.CanvasTexture(canvas);
}

/** Saturn-style ring texture: concentric bands of varying opacity */
function createRingTexture() {

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 64;

    const ctx = canvas.getContext("2d");

    for (let x = 0; x < canvas.width; x++) {

        const t = x / canvas.width;
        const alpha = 0.15 + Math.abs(Math.sin(t * 40)) * 0.5 * (1 - Math.abs(t - 0.5) * 1.6);

        ctx.fillStyle = `rgba(210,190,150,${Math.max(0, alpha).toFixed(3)})`;
        ctx.fillRect(x, 0, 1, canvas.height);
    }

    return new THREE.CanvasTexture(canvas);
}

/* =====================================================
   SOLAR SYSTEM
===================================================== */

function buildSolarSystem() {

    const group = new THREE.Group();

    const lavaTex = textureLoader.load(TEX_BASE + "lava/lavatile.jpg");
    lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping;

    const sun = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 48, 48),
        new THREE.MeshBasicMaterial({ map: lavaTex, color: 0xffaa55 })
    );

    group.add(sun);

    const sunLight = new THREE.PointLight(0xffcc66, 3, 60);
    group.add(sunLight);

    const sunGlow = new THREE.Mesh(
        new THREE.SphereGeometry(0.72, 32, 32),
        new THREE.MeshBasicMaterial({
            color: 0xffaa33,
            transparent: true,
            opacity: 0.18,
            side: THREE.BackSide
        })
    );

    group.add(sunGlow);

    const planetDefs = [
        {
            name: "mercury",
            r: 0.1, dist: 1.15, speed: 1.6, spin: 0.4,
            texture: () => createRockyTexture("#9c9187", "#5a5148", 120)
        },
        {
            name: "venus",
            r: 0.15, dist: 1.7, speed: 1.1, spin: 0.3,
            texture: () => createBandedTexture(["#e8c887", "#d9a55f", "#f0d9a0", "#c98f4d"])
        },
        {
            name: "mars",
            r: 0.13, dist: 2.3, speed: 0.75, spin: 0.5,
            texture: () => createRockyTexture("#b3502f", "#7a2f18", 100)
        },
        {
            name: "jupiter",
            r: 0.32, dist: 3.1, speed: 0.4, spin: 1.1,
            texture: () => createBandedTexture(["#d8b48c", "#c99768", "#e8cba3", "#b9835a", "#f0dcc0"])
        }
    ];

    const planets = planetDefs.map(def => {

        const planet = new THREE.Mesh(
            new THREE.SphereGeometry(def.r, 32, 32),
            new THREE.MeshStandardMaterial({
                map: canvasToTexture(def.texture()),
                roughness: 0.9
            })
        );

        planet.position.x = def.dist;

        const pivot = new THREE.Group();
        pivot.add(planet);
        group.add(pivot);

        // orbit path
        const orbitPoints = [];

        for (let i = 0; i <= 96; i++) {

            const angle = (i / 96) * Math.PI * 2;

            orbitPoints.push(new THREE.Vector3(
                Math.cos(angle) * def.dist,
                0,
                Math.sin(angle) * def.dist
            ));
        }

        const orbit = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(orbitPoints),
            new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.25 })
        );

        group.add(orbit);

        return { ...def, mesh: planet, pivot };
    });

    // Saturn: same as above but with a ring
    const saturnTex = canvasToTexture(createBandedTexture(["#e4d2a3", "#d9c48b", "#f0e6c6", "#c8b378"]));

    const saturn = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 32, 32),
        new THREE.MeshStandardMaterial({ map: saturnTex, roughness: 0.9 })
    );

    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.38, 0.62, 64),
        new THREE.MeshBasicMaterial({
            map: createRingTexture(),
            transparent: true,
            side: THREE.DoubleSide
        })
    );

    ring.rotation.x = Math.PI / 2.4;

    const saturnPivot = new THREE.Group();
    const saturnDist = 4;

    saturn.position.x = saturnDist;
    ring.position.x = saturnDist;

    saturnPivot.add(saturn);
    saturnPivot.add(ring);
    group.add(saturnPivot);

    const saturnOrbitPoints = [];

    for (let i = 0; i <= 96; i++) {

        const angle = (i / 96) * Math.PI * 2;

        saturnOrbitPoints.push(new THREE.Vector3(
            Math.cos(angle) * saturnDist, 0, Math.sin(angle) * saturnDist
        ));
    }

    group.add(new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(saturnOrbitPoints),
        new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.25 })
    ));

    planets.push({ speed: 0.28, spin: 0.9, mesh: saturn, pivot: saturnPivot });

    // starfield backdrop
    group.add(buildStarfield());

    const update = (elapsed) => {

        sun.rotation.y = elapsed * 0.05;
        lavaTex.offset.x = elapsed * 0.02;

        sunGlow.scale.setScalar(1 + Math.sin(elapsed * 1.5) * 0.03);

        planets.forEach(p => {

            p.pivot.rotation.y = elapsed * p.speed * 0.3;
            p.mesh.rotation.y = elapsed * p.spin;
        });

        group.rotation.y += 0.0002;
    };

    return { group, update };
}

/* =====================================================
   EARTH (detailed, real satellite imagery)
===================================================== */

function buildEarth() {

    const group = new THREE.Group();

    const earthGeom = new THREE.SphereGeometry(1.5, 64, 64);

    const earth = new THREE.Mesh(
        earthGeom,
        new THREE.MeshPhongMaterial({
            map: textureLoader.load(TEX_BASE + "planets/earth_atmos_2048.jpg"),
            specularMap: textureLoader.load(TEX_BASE + "planets/earth_specular_2048.jpg"),
            bumpMap: textureLoader.load(TEX_BASE + "planets/earth_normal_2048.jpg"),
            bumpScale: 0.04,
            emissiveMap: textureLoader.load(TEX_BASE + "planets/earth_lights_2048.png"),
            emissive: new THREE.Color(0xffffaa),
            emissiveIntensity: 1.4,
            specular: new THREE.Color(0x333333),
            shininess: 8
        })
    );

    earth.rotation.z = THREE.MathUtils.degToRad(23.4); // axial tilt
    group.add(earth);

    const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(1.52, 64, 64),
        new THREE.MeshLambertMaterial({
            map: canvasToTexture(createCloudTexture()),
            transparent: true,
            opacity: 0.55,
            depthWrite: false
        })
    );

    clouds.rotation.z = earth.rotation.z;
    group.add(clouds);

    const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(1.58, 48, 48),
        new THREE.MeshBasicMaterial({
            color: 0x00aaff,
            transparent: true,
            opacity: 0.12,
            side: THREE.BackSide
        })
    );

    group.add(atmosphere);

    // Moon, orbiting
    const moonPivot = new THREE.Group();

    const moon = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 32, 32),
        new THREE.MeshStandardMaterial({
            map: textureLoader.load(TEX_BASE + "planets/moon_1024.jpg"),
            roughness: 1
        })
    );

    moon.position.set(3.4, 0, 0);
    moonPivot.add(moon);
    group.add(moonPivot);

    const moonOrbitPoints = [];

    for (let i = 0; i <= 96; i++) {

        const angle = (i / 96) * Math.PI * 2;

        moonOrbitPoints.push(new THREE.Vector3(
            Math.cos(angle) * 3.4, 0, Math.sin(angle) * 3.4
        ));
    }

    group.add(new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(moonOrbitPoints),
        new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.2 })
    ));

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
    sunLight.position.set(6, 2, 4);
    group.add(sunLight);

    const update = (elapsed) => {

        earth.rotation.y = elapsed * 0.12;
        clouds.rotation.y = elapsed * 0.16;
        moonPivot.rotation.y = elapsed * 0.06;
        moon.rotation.y = elapsed * 0.05;
    };

    return { group, update };
}

/* =====================================================
   MOLECULE (gentle vibration, matcap-shaded atoms)
===================================================== */

function buildMolecule() {

    const group = new THREE.Group();

    const basePositions = [
        [0, 0, 0],
        [1, 0.5, 0],
        [-1, 0.5, 0],
        [0, -1, 0.6],
        [0, -1, -0.6]
    ];

    const matcap = textureLoader.load(TEX_BASE + "matcaps/matcap-porcelain-white.jpg");

    const atomColors = [0x00ffff, 0xffffff, 0xffffff, 0xff8844, 0xff8844];

    const atomGeom = new THREE.SphereGeometry(0.25, 32, 32);

    const atoms = basePositions.map((pos, i) => {

        const atom = new THREE.Mesh(
            atomGeom,
            new THREE.MeshMatcapMaterial({
                matcap,
                color: atomColors[i]
            })
        );

        atom.position.set(...pos);
        atom.userData.base = new THREE.Vector3(...pos);
        atom.userData.phase = Math.random() * Math.PI * 2;

        group.add(atom);

        return atom;
    });

    const bondMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
    const bonds = [];

    for (let i = 1; i < atoms.length; i++) {

        const geom = new THREE.BufferGeometry()
            .setFromPoints([atoms[0].position, atoms[i].position]);

        const line = new THREE.Line(geom, bondMat);

        group.add(line);
        bonds.push({ line, a: atoms[0], b: atoms[i] });
    }

    const update = (elapsed) => {

        atoms.forEach(atom => {

            const wobble = Math.sin(elapsed * 2 + atom.userData.phase) * 0.05;

            atom.position.copy(atom.userData.base);
            atom.position.x += wobble;
            atom.position.y += Math.cos(elapsed * 2.3 + atom.userData.phase) * 0.05;
        });

        bonds.forEach(bond => {

            const positions = bond.line.geometry.attributes.position;

            positions.setXYZ(0, bond.a.position.x, bond.a.position.y, bond.a.position.z);
            positions.setXYZ(1, bond.b.position.x, bond.b.position.y, bond.b.position.z);

            positions.needsUpdate = true;
        });

        group.rotation.y = elapsed * 0.15;
    };

    return { group, update };
}

/* =====================================================
   NEURAL NETWORK (glowing nodes + traveling signal pulses)
===================================================== */

function buildNeuralNetwork() {

    const group = new THREE.Group();

    const layers = [4, 6, 6, 2];
    const layerSpacing = 1.8;

    const glowTex = createGlowTexture("#00ffff");

    const layerNodes = [];

    layers.forEach((count, li) => {

        const nodes = [];

        for (let i = 0; i < count; i++) {

            const position = new THREE.Vector3(
                li * layerSpacing - ((layers.length - 1) * layerSpacing) / 2,
                i - (count - 1) / 2,
                0
            );

            const core = new THREE.Mesh(
                new THREE.SphereGeometry(0.08, 16, 16),
                new THREE.MeshBasicMaterial({ color: 0x00ffff })
            );

            core.position.copy(position);
            group.add(core);

            const glow = new THREE.Sprite(
                new THREE.SpriteMaterial({
                    map: glowTex,
                    color: 0x00ffff,
                    transparent: true,
                    opacity: 0.8,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                })
            );

            glow.scale.setScalar(0.5);
            glow.position.copy(position);
            group.add(glow);

            nodes.push({ core, glow, position, phase: Math.random() * Math.PI * 2 });
        }

        layerNodes.push(nodes);
    });

    const lineMat = new THREE.LineBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.15
    });

    const edges = [];

    for (let l = 0; l < layerNodes.length - 1; l++) {

        layerNodes[l].forEach(a => {

            layerNodes[l + 1].forEach(b => {

                const geom = new THREE.BufferGeometry()
                    .setFromPoints([a.position, b.position]);

                group.add(new THREE.Line(geom, lineMat));

                edges.push([a.position, b.position]);
            });
        });
    }

    // traveling signal pulses along random edges
    const pulseTex = createGlowTexture("#ffffff");
    const pulseCount = 14;

    const pulses = Array.from({ length: pulseCount }, () => {

        const sprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: pulseTex,
                color: 0x66ffff,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        );

        sprite.scale.setScalar(0.18);
        group.add(sprite);

        return {
            sprite,
            edge: edges[Math.floor(Math.random() * edges.length)],
            t: Math.random(),
            speed: 0.4 + Math.random() * 0.5
        };
    });

    const allNodes = layerNodes.flat();

    const update = (elapsed, delta) => {

        allNodes.forEach(node => {

            const pulseScale = 1 + Math.sin(elapsed * 3 + node.phase) * 0.35;

            node.glow.scale.setScalar(0.5 * pulseScale);
            node.core.scale.setScalar(pulseScale);
        });

        pulses.forEach(pulse => {

            pulse.t += delta * pulse.speed;

            if (pulse.t >= 1) {

                pulse.t = 0;
                pulse.edge = edges[Math.floor(Math.random() * edges.length)];
            }

            pulse.sprite.position.lerpVectors(pulse.edge[0], pulse.edge[1], pulse.t);
        });

        group.rotation.y = Math.sin(elapsed * 0.15) * 0.15;
    };

    return { group, update };
}

/* =====================================================
   SHARED STARFIELD
===================================================== */

function buildStarfield() {

    const count = 1200;
    const positions = [];

    for (let i = 0; i < count; i++) {

        positions.push(
            (Math.random() - 0.5) * 40,
            (Math.random() - 0.5) * 40,
            (Math.random() - 0.5) * 40
        );
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

    return new THREE.Points(
        geom,
        new THREE.PointsMaterial({ color: 0xffffff, size: 0.02 })
    );
}

/* =====================================================
   CUSTOM MODEL IMPORT
===================================================== */

function handleFileImport(event) {

    const file = event.target.files[0];

    if (!file) return;

    ensureRenderer();
    resizeViewer();

    const url = URL.createObjectURL(file);
    const loader = new GLTFLoader();

    loader.load(
        url,
        (gltf) => {

            clearScene();

            currentGroup = new THREE.Group();
            currentGroup.add(gltf.scene);

            currentUpdate = (elapsed) => {
                currentGroup.rotation.y = elapsed * 0.2;
            };

            scene.add(currentGroup);

            URL.revokeObjectURL(url);
        },
        undefined,
        (error) => {

            console.error("Model load error:", error);

            alert("Failed to load model. Please check the file and try again.");

            URL.revokeObjectURL(url);
        }
    );
}