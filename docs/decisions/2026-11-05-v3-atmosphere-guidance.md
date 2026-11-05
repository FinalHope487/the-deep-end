# Decision: v3 light, sound, figure and guidance (2026-11-05)

Source: user answers Q27-Q32, Q41 in `docs/handoff/core-aspect-answers-2026-11-05.md`.

| ID | Decision |
|---|---|
| Q27 | Every sun beam has a visible source: window, skylight or other opening |
| Q28 | Near silence happens in some spaces. Ambient sound returns when the player leaves |
| Q29 | Music comes from deep inside a passage. No visible source object. User note: music direction has no link to the direction of the main regions |
| Q30 | User answered B+C. Both effects are allowed: local light dimming or weak visual oddness, and a very faint sound change. Do not force both at every figure |
| Q31 | Hint strength does not rise when the player is lost. Keep one fixed strength |
| Q41 | With sound off, find key places with door signs, symbols and directional light |
| Q32 | The pause menu shows visited regions and progress. No map |

## Conflict (Q29)

- `docs/spec.md` §2.3 (line 166) says the next region sends 3D music. This is replaced for v3: music may have a spatial direction, but it does not point to the next main region. Signs, symbols and light guide to it.
- Keep: directional music that is louder near and fades away.
- Keep: no chase, no harm, no jump scare for the figure (earlier decisions). Q28 does not remove the required ambient sound.
- Q31 replaces the earlier idea of hints that grow stronger.

## Cost to reverse

Changes how music, light and signs relate to the main line. Does not change the figure journey stages.
