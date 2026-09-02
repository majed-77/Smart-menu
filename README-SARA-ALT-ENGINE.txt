SARA EXPERIMENTAL VOICE ENGINE
==============================

Architecture:
Browser microphone/VAD -> ElevenLabs Scribe v2 STT -> DeepSeek V4 Flash -> Fish Audio S2.1 Pro Free TTS

The existing OpenAI Realtime engine remains available as a fallback.

Required Render environment variables:

DEEPSEEK_API_KEY=...
ELEVENLABS_API_KEY=...
FISH_AUDIO_API_KEY=...

Optional variables:

DEEPSEEK_MODEL=deepseek-v4-flash
ELEVENLABS_STT_MODEL=scribe_v2
FISH_AUDIO_MODEL=s2.1-pro-free
FISH_AUDIO_VOICE_ID=384051d27069462aa9b7a021ce541c8f

The default Fish Audio voice is the Saudi female voice selected for Sara.
No DEEPGRAM_API_KEY or ELEVENLABS_VOICE_ID is required by this experimental engine.

Render deploy:
Upload/commit server.js, smart-menu-ai-multilingual.html and package.json, then deploy.
Check /api/sara-alt-status after deployment. configured should be true.
