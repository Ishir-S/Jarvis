/* =====================================================
   JARVIS - CONTINUOUS VOICE ENGINE & WAKEWORD LISTENER
   Provides 24/7 continuous speech recognition, wakeword
   detection ("Jarvis", "Hey Jarvis", "OK Jarvis"),
   direct command routing, AI conversation forwarding,
   and speech synthesis responses.
===================================================== */

import { addSystemLog, notify, setVoiceStatus } from "./ui.js";
import { runCommand, hasCommand } from "./commandBridge.js";
import { classifyAndExecuteIntent } from "./commander.js";
import { sendVoiceMessage } from "./chat.js";

const WAKEWORDS = ["jarvis", "hey jarvis", "ok jarvis", "hi jarvis", "hello jarvis", "computer"];

let recognition = null;
let isListening = false;
let isSpeaking = false;
let autoRestart = true;
let restartTimeout = null;
let wakewordActiveTimestamp = 0; // Timestamp when wakeword was primed
const WAKE_WINDOW_MS = 8000; // Time to keep listening for commands after wakeword

/* Speech Synthesis */
const synth = window.speechSynthesis;
let jarvisVoice = null;

function initVoices() {
    if (!synth) return;
    const load = () => {
        const voices = synth.getVoices();
        // Prefer natural, British/English or robotic sounding clear voice
        jarvisVoice = voices.find(v => v.name.includes("UK English Male") || v.name.includes("Oliver") || v.name.includes("George") || v.name.includes("Male") || (v.lang.startsWith("en-GB") && !v.name.includes("Female"))) 
            || voices.find(v => v.lang.startsWith("en") && !v.name.includes("Female") && !v.name.includes("Zira")) 
            || voices.find(v => v.lang.startsWith("en")) 
            || voices[0];
    };
    load();
    if (synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = load;
    }
}

export function speak(text, priority = false) {
    if (!synth || !text) return;
    if (priority) {
        synth.cancel();
    }
    const cleanText = text.replace(/[*_~`#\[\]\(\)\{\}]/g, "").trim();
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    if (jarvisVoice) utterance.voice = jarvisVoice;
    utterance.rate = 1.05;
    utterance.pitch = 0.95;

    utterance.onstart = () => {
        isSpeaking = true;
    };
    utterance.onend = () => {
        isSpeaking = false;
    };
    utterance.onerror = () => {
        isSpeaking = false;
    };

    synth.speak(utterance);
}

/* =====================================================
   CONTINUOUS RECOGNITION SETUP
===================================================== */

export function initVoiceEngine() {
    initVoices();

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        setVoiceStatus("Unsupported");
        addSystemLog("Voice Engine: Web Speech API not supported in this browser (Chrome or Edge recommended).");
        return;
    }

    try {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            isListening = true;
            setVoiceStatus("Listening (Wake: 'JARVIS')");
            document.dispatchEvent(new CustomEvent("voice-status", { detail: "Listening" }));
        };

        recognition.onresult = handleSpeechResult;

        recognition.onerror = (event) => {
            // Ignore non-fatal errors like 'no-speech' or 'aborted'
            if (event.error !== "no-speech" && event.error !== "aborted") {
                console.warn("Voice Engine event:", event.error);
            }
            if (event.error === "not-allowed") {
                setVoiceStatus("Mic Blocked");
                autoRestart = false;
                addSystemLog("Voice Engine: Microphone access denied. Allow mic permissions to enable continuous voice.");
            }
        };

        recognition.onend = () => {
            isListening = false;
            if (autoRestart) {
                clearTimeout(restartTimeout);
                // Immediately restart recognition so it remains active all the time
                restartTimeout = setTimeout(() => {
                    startRecognitionSafely();
                }, 200);
            } else {
                setVoiceStatus("Standby");
            }
        };

        startRecognitionSafely();
        addSystemLog("Continuous Voice Engine active with wakeword 'JARVIS'");

    } catch (err) {
        console.error("Failed to initialize Voice Engine:", err);
    }

    // Attach user gesture listener as backup in case browser restricts mic auto-start
    const resumeOnGesture = () => {
        if (!isListening && autoRestart) {
            startRecognitionSafely();
        }
        window.removeEventListener("pointerdown", resumeOnGesture);
        window.removeEventListener("keydown", resumeOnGesture);
    };
    window.addEventListener("pointerdown", resumeOnGesture, { once: true });
    window.addEventListener("keydown", resumeOnGesture, { once: true });
}

function startRecognitionSafely() {
    if (!recognition || isListening) return;
    try {
        recognition.start();
    } catch (e) {
        // Recognition might already be running or transitioning
    }
}

export function toggleVoice() {
    if (isListening) {
        autoRestart = false;
        recognition?.stop();
        setVoiceStatus("Standby");
        notify("Voice Engine Standby");
        addSystemLog("Voice Engine: Standby mode");
    } else {
        autoRestart = true;
        startRecognitionSafely();
        setVoiceStatus("Listening (Wake: 'JARVIS')");
        notify("Voice Engine Active — Wakeword 'JARVIS'");
        addSystemLog("Voice Engine: Activated");
    }
}

/* =====================================================
   SPEECH PROCESSING & WAKEWORD PARSER
===================================================== */

function handleSpeechResult(event) {
    let finalTranscript = "";
    let interimTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i];
        if (item.isFinal) {
            finalTranscript += item[0].transcript;
        } else {
            interimTranscript += item[0].transcript;
        }
    }

    const currentText = (finalTranscript || interimTranscript).trim().toLowerCase();
    if (!currentText) return;

    // Check if wakeword is present
    let matchedWakeword = null;
    for (const w of WAKEWORDS) {
        if (currentText.includes(w)) {
            matchedWakeword = w;
            break;
        }
    }

    const now = Date.now();
    const isWithinWakeWindow = (now - wakewordActiveTimestamp) < WAKE_WINDOW_MS;

    if (matchedWakeword || isWithinWakeWindow) {
        let commandBody = currentText;

        if (matchedWakeword) {
            wakewordActiveTimestamp = now;
            // Extract the command after the wakeword
            const idx = currentText.indexOf(matchedWakeword);
            commandBody = currentText.slice(idx + matchedWakeword.length).replace(/^[,\s.]+/, "").trim();
        }

        // Only process once we have a final result or a substantial command
        if (event.results[event.results.length - 1].isFinal) {
            if (!commandBody) {
                // User just said "Jarvis" or "Hey Jarvis"
                notify("JARVIS: Listening, sir...");
                speak("Yes, sir? I am listening.");
                addSystemLog("Voice: Wakeword detected. Awaiting command.");
            } else {
                executeVoiceCommand(commandBody);
            }
        }
    }
}

/* =====================================================
   DIRECT COMMAND ROUTING & CONVERSATION
===================================================== */

async function executeVoiceCommand(rawText) {
    const text = rawText.toLowerCase().trim();
    if (!text) return;

    addSystemLog(`Voice command: "${rawText}"`);
    notify(`Voice: "${rawText}"`);

    // Direct fast commands (instant responsiveness without waiting for LLM)
    if (matchAny(text, ["open camera", "show camera", "start camera", "camera on", "live camera"])) {
        runCommandSafely("open_camera");
        speak("Opening camera feed.");
        return;
    }

    if (matchAny(text, ["open dashboard", "show dashboard", "status", "system status", "show status"])) {
        runCommandSafely("open_dashboard");
        speak("Opening system dashboard.");
        return;
    }

    if (matchAny(text, ["open chat", "open ai", "chat panel", "talk to ai", "open console"])) {
        runCommandSafely("open_chat");
        speak("Chat console active.");
        return;
    }

    if (matchAny(text, ["open viewer", "3d viewer", "show 3d", "3d model", "open 3d"])) {
        runCommandSafely("open_viewer");
        speak("Opening 3D visualization viewer.");
        return;
    }

    if (matchAny(text, ["solar system", "show solar", "planets"])) {
        runCommandSafely("open_viewer", { scene: "solar" });
        speak("Displaying solar system simulation.");
        return;
    }

    if (matchAny(text, ["show earth", "globe 3d", "earth model"])) {
        runCommandSafely("open_viewer", { scene: "earth" });
        speak("Loading 3D Earth model.");
        return;
    }

    if (matchAny(text, ["molecule", "molecules", "show molecule"])) {
        runCommandSafely("open_viewer", { scene: "molecule" });
        speak("Displaying molecular structure.");
        return;
    }

    if (matchAny(text, ["neural network", "neural net", "neural model"])) {
        runCommandSafely("open_viewer", { scene: "neural" });
        speak("Displaying neural matrix visualization.");
        return;
    }

    if (matchAny(text, ["open map", "open globe", "show map", "world map", "globe"])) {
        runCommandSafely("open_map");
        speak("Opening interactive globe.");
        return;
    }

    if (matchAny(text, ["open research", "research agent", "research"])) {
        runCommandSafely("open_research");
        speak("Research agent online.");
        return;
    }

    if (matchAny(text, ["open architect", "open asa", "solution architect", "architect"])) {
        runCommandSafely("open_asa");
        speak("Solution Architect engaged.");
        return;
    }

    if (matchAny(text, ["open physics", "physics lab", "physics simulation", "physics"])) {
        runCommandSafely("open_physics");
        speak("Physics laboratory live.");
        return;
    }

    if (text.includes("spawn")) {
        let spawnType = "box";
        if (text.includes("car")) spawnType = "car";
        else if (text.includes("ball") || text.includes("sphere")) spawnType = "ball";
        else if (text.includes("cylinder")) spawnType = "cylinder";
        else if (text.includes("wall")) spawnType = "wall";
        else if (text.includes("ramp")) spawnType = "ramp";

        runCommandSafely("open_physics", { spawn: spawnType });
        speak(`Spawning ${spawnType} in physics simulation.`);
        return;
    }

    if (matchAny(text, ["open projects", "project manager", "projects archive", "projects"])) {
        runCommandSafely("open_projects");
        speak("Opening project archive.");
        return;
    }

    if (matchAny(text, ["close all", "close windows", "close window", "minimize", "hide windows", "clear screen"])) {
        runCommandSafely("close_all");
        speak("Closing all windows.");
        return;
    }

    if (matchAny(text, ["what time is it", "tell me the time", "current time", "time"])) {
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        speak(`The time is ${timeStr}, sir.`);
        notify(`Current Time: ${timeStr}`);
        return;
    }

    if (matchAny(text, ["what date is it", "what is today's date", "what is the date", "date"])) {
        const dateStr = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
        speak(`Today is ${dateStr}, sir.`);
        notify(`Current Date: ${dateStr}`);
        return;
    }

    if (matchAny(text, ["who are you", "what are you"])) {
        speak("I am JARVIS. Just A Rather Very Intelligent System, at your service.");
        return;
    }

    if (matchAny(text, ["quiet mode", "be quiet", "mute proactive", "silence", "stop talking unprompted"])) {
        try {
            const { setProactiveEnabled } = await import("./proactiveIntelligence.js");
            setProactiveEnabled(false);
            speak("Quiet mode engaged, sir. I shall only speak when addressed.");
        } catch {}
        return;
    }

    if (matchAny(text, ["speak freely", "enable proactive", "unmute proactive", "autonomous voice"])) {
        try {
            const { setProactiveEnabled } = await import("./proactiveIntelligence.js");
            setProactiveEnabled(true);
            speak("Proactive monitoring enabled, sir.");
        } catch {}
        return;
    }

    // Try LLM Intent Classification if available
    try {
        const intentResult = await classifyAndExecuteIntent(rawText);
        if (intentResult) {
            speak(`Executing ${intentResult.action.replace(/_/g, " ")}.`);
            return;
        }
    } catch {
        // Fall back to chat
    }

    // Route unhandled conversation or questions directly to AI Chat
    sendVoiceMessage(rawText, { speakBack: true });
}

function matchAny(text, phrases) {
    return phrases.some(p => text.includes(p));
}

function runCommandSafely(name, params = {}) {
    if (hasCommand(name)) {
        try {
            runCommand(name, params);
            addSystemLog(`JARVIS executed voice action: ${name}`);
        } catch (err) {
            console.error("Voice command execution failed:", err);
        }
    }
}
