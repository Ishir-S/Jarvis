/* =====================================================
   JARVIS - INTENT COMMANDER
   Classifies what the user actually wants against a real,
   fixed set of app actions, then executes it for real
   through commandBridge.js. If nothing matches, JARVIS
   just replies conversationally — no action is forced.
===================================================== */

import { generateJSON, getSettings } from "./ollama.js";
import { runCommand, hasCommand } from "./commandBridge.js";
import { addSystemLog } from "./ui.js";

const ACTIONS = [
    { name: "open_dashboard", desc: "Open the system status dashboard (clock, voice/camera status, system feed).", params: "{}" },
    { name: "open_camera", desc: "Open and activate the live camera feed.", params: "{}" },
    { name: "toggle_voice", desc: "Toggle the voice engine between listening and standby.", params: "{}" },
    { name: "open_chat", desc: "Bring the chat window into focus (rarely needed, you're already talking here).", params: "{}" },
    { name: "open_viewer", desc: "Open the 3D viewer, optionally loading a scene.", params: `{"scene": "solar|earth|molecule|neural (optional)"}` },
    { name: "viewer_select_part", desc: "In the 3D viewer, select a named part (only meaningful if STL parts are loaded).", params: `{"name": "string"}` },
    { name: "viewer_hide_part", desc: "In the 3D viewer, hide a named part.", params: `{"name": "string"}` },
    { name: "viewer_show_part", desc: "In the 3D viewer, show a named part (or all parts).", params: `{"name": "string (optional, omit to show all)"}` },
    { name: "open_map", desc: "Open the interactive globe, optionally searching a route between two places.", params: `{"origin": "string (optional)", "destination": "string (optional)"}` },
    { name: "open_research", desc: "Open the Research Agent, optionally starting research on a topic immediately.", params: `{"topic": "string (optional)"}` },
    { name: "open_asa", desc: "Open the Autonomous Solution Architect, optionally beginning analysis of a stated goal immediately.", params: `{"goal": "string (optional)"}` },
    { name: "open_physics", desc: "Open the physics simulation, optionally spawning one object immediately (box, ball, cylinder, wall, ramp, or car).", params: `{"spawn": "box|ball|cylinder|wall|ramp|car (optional)"}` },
    { name: "open_projects", desc: "Open the Project Manager.", params: "{}" },
    { name: "set_gravity", desc: "Open physics and change the simulation's gravity vector.", params: `{"x": number, "y": number, "z": number}` },
    { name: "close_all", desc: "Close every open window/panel.", params: "{}" },
    { name: "none", desc: "No action applies — this is just conversation, a question, or something outside JARVIS's available actions.", params: "{}" }
];

function buildActionCatalog() {

    return ACTIONS.map(a => `- ${a.name}: ${a.desc} params: ${a.params}`).join("\n");
}

/**
 * Classifies the user's message against JARVIS's real available
 * actions and executes a match. Returns { action, params } if
 * something was executed, or null if this was just conversation
 * (or if classification/execution failed for any reason).
 */
export async function classifyAndExecuteIntent(userText) {

    const { model, host } = getSettings();
    if (!model) return null;

    const prompt = `You are the intent router for JARVIS, an AI assistant that can
actually control parts of its own interface. Decide whether this message from
the user is asking you to DO something JARVIS can really do, or whether it's
just conversation.

AVAILABLE ACTIONS:
${buildActionCatalog()}

USER MESSAGE:
"${userText}"

Respond with ONLY valid JSON:
{ "action": "one of the action names above, or \\"none\\"", "params": { ...only if relevant to that action, else {} } }

Only pick an action if the user is clearly asking for it. When in doubt, use "none".`;

    let data;

    try {

        data = await generateJSON(prompt, { model, host });

    } catch (err) {

        console.warn("Intent classification failed:", err.message);
        return null;
    }

    const action = data?.action;

    if (!action || action === "none" || !hasCommand(action)) {
        return null;
    }

    try {

        runCommand(action, data.params || {});
        addSystemLog(`JARVIS executed: ${action}`);

        return { action, params: data.params || {} };

    } catch (err) {

        console.warn("Command execution failed:", err.message);
        return null;
    }
}
