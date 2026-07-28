# assets/sounds

Silent placeholder SFX for LifeDex's sound system (`src/utils/sound.ts`). Every
file here is a **valid but silent** PCM WAV (proper RIFF/WAVE header, all-zero
samples, ~0.2s) — they exist so the bundler has a real asset to `require()` and
the sound wiring can ship today. No file plays anything audible yet.

**To ship real audio:** replace each file below 1:1 by filename (same name,
same `.wav` extension) with the real SFX. No code changes needed — `sound.ts`
already requires these exact paths.

Suggested style: organic / naturalistic (soft foley, field-recording textures —
matches LifeDex's "discover, don't disturb" nature tone; avoid synthetic
8-bit/game-arcade tones). Rarity stingers should escalate in intensity: common
is a small, quiet chime; legendary is the biggest, most triumphant.

| File | Used by | What it should be |
|---|---|---|
| `shutter.wav` | `sound.shutter()` — CaptureScreen, on capture | Camera shutter click/snap |
| `reveal.wav` | `sound.reveal(rarity)` — ResultScreen, on card-flip completion | Base card-flip "whoosh"/reveal sound, plays on every catch regardless of rarity |
| `rarity-common.wav` | `sound.reveal('common')` | Smallest rarity stinger — a quiet, understated chime |
| `rarity-uncommon.wav` | `sound.reveal('uncommon')` | Slightly brighter/fuller chime than common |
| `rarity-rare.wav` | `sound.reveal('rare')` | Noticeably richer stinger — a small "moment" |
| `rarity-epic.wav` | `sound.reveal('epic')` | Bigger, more elaborate stinger — layered tones |
| `rarity-legendary.wav` | `sound.reveal('legendary')` | Biggest, most triumphant stinger — the top of the escalation |
| `levelup.wav` | `sound.levelUp()` — ResultScreen, when the level-up overlay appears | Short fanfare / achievement flourish |
| `ui-tap.wav` | `sound.uiTap()` — light UI feedback (e.g. Settings sound toggle) | Small, unobtrusive UI tick/tap |

`reveal.wav` and the matching `rarity-<tier>.wav` both play together on every
reveal (base whoosh + tier stinger layered) — see `sound.reveal()` in
`src/utils/sound.ts`.
