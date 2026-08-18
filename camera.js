/* =====================================================
   JARVIS - CAMERA MODULE
===================================================== */

let stream = null;

export async function initCamera() {

    const video =
        document.getElementById(
            "cameraFeed"
        );

    if (!video) return;

    if (stream) return; // already running

    try {

        stream =
            await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            });

        video.srcObject = stream;

        document.dispatchEvent(
            new CustomEvent(
                "camera-status",
                { detail: "Live" }
            )
        );

    } catch (err) {

        console.error(
            "Camera error:",
            err
        );

        document.dispatchEvent(
            new CustomEvent(
                "camera-status",
                { detail: "Access Denied" }
            )
        );
    }
}

export function stopCamera() {

    if (!stream) return;

    stream.getTracks()
        .forEach(track => track.stop());

    stream = null;

    const video =
        document.getElementById(
            "cameraFeed"
        );

    if (video) video.srcObject = null;

    document.dispatchEvent(
        new CustomEvent(
            "camera-status",
            { detail: "Offline" }
        )
    );
}
