/* =====================================================
   JARVIS - OLLAMA LOCAL LLM MODULE
===================================================== */

const SETTINGS_KEY = "jarvis_ollama_settings";

const DEFAULTS = {
    host: "http://localhost:11434",
    model: "qwen2.5"
};

let settings = loadSettings();
let statusListeners = [];

/* =====================================================
   SETTINGS
===================================================== */

function loadSettings() {

    try {

        const raw = localStorage.getItem(SETTINGS_KEY);

        return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };

    } catch {

        return { ...DEFAULTS };
    }
}

export function getSettings() {

    return { ...settings };
}

export function setSettings(next) {

    settings = { ...settings, ...next };

    localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify(settings)
    );
}

/* =====================================================
   CONNECTION STATUS
===================================================== */

export function onStatusChange(fn) {

    statusListeners.push(fn);
}

function emitStatus(status) {

    statusListeners.forEach(fn => fn(status));
}

export async function checkStatus(host = settings.host) {

    try {

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const res = await fetch(`${host}/api/tags`, {
            method: "GET",
            signal: controller.signal
        }).catch(() => null);

        clearTimeout(timeoutId);

        if (!res || !res.ok) {
            emitStatus({ connected: false, error: "Ollama offline", models: [] });
            return { connected: false, error: "Ollama offline", models: [] };
        }

        const data = await res.json();

        const models = (data.models || []).map(m => m.name);

        emitStatus({ connected: true, models });

        return { connected: true, models };

    } catch (err) {

        emitStatus({ connected: false, error: err.message, models: [] });

        return { connected: false, error: err.message, models: [] };
    }
}

/* =====================================================
   JSON GENERATION (for the Research Agent)
===================================================== */

export async function generateJSON(prompt, { model, host } = {}) {

    const useModel = model || settings.model;
    const useHost = host || settings.host;

    if (!useModel) {
        throw new Error("No Ollama model selected. Pick one from the dropdown.");
    }

    const res = await fetch(`${useHost}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: useModel,
            prompt,
            format: "json",
            stream: false
        })
    });

    if (!res.ok) {

        const text = await res.text().catch(() => "");

        throw new Error(`Ollama error ${res.status}: ${text || res.statusText}`);
    }

    const data = await res.json();

    try {

        return JSON.parse(data.response);

    } catch (err) {

        throw new Error("Model didn't return valid JSON. Try a larger/instruct-tuned model.");
    }
}

/* =====================================================
   STREAMING CHAT (for the AI Chat panel)
===================================================== */

export async function chatStream(messages, { model, host, onToken, onDone } = {}) {

    const useModel = model || settings.model;
    const useHost = host || settings.host;

    if (!useModel) {
        throw new Error("No Ollama model selected. Pick one from the dropdown.");
    }

    const res = await fetch(`${useHost}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: useModel,
            messages,
            stream: true
        })
    });

    if (!res.ok || !res.body) {

        const text = await res.text().catch(() => "");

        throw new Error(`Ollama error ${res.status}: ${text || res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let full = "";

    while (true) {

        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop(); // keep the last (possibly incomplete) line

        for (const line of lines) {

            if (!line.trim()) continue;

            try {

                const json = JSON.parse(line);
                const chunk = json.message?.content || "";

                if (chunk) {

                    full += chunk;
                    onToken?.(chunk, full);
                }

                if (json.done) {

                    onDone?.(full);
                }

            } catch {
                // ignore partial/malformed lines
            }
        }
    }

    return full;
}
