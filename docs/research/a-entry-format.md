# Part A entry format

Date: 2026-11-09. Applies to every `a-<n>-*.md` file. Spec: `00-spec.md` section 3.

## Files

| File | Section | Writer | Reviewer |
|---|---|---|---|
| `a-1-poolcore.md` | 1 | ChatGPT | Claude |
| `a-2-liminal.md` | 2 | ChatGPT | Claude |
| `a-3-dreamcore.md` | 3 | ChatGPT | Claude |
| `a-4-space.md` | 4 | Claude | ChatGPT |
| `a-5-calm.md` | 5 | Claude | ChatGPT |
| `a-6-analog.md` | 6 | ChatGPT | Claude |
| `a-7-nongame.md` | 7 | Claude | ChatGPT |

Write one entry per row of `a-candidates.md`. Keep the row order. A work with more than one tag has its entry in the file of its first section only.

## Entry template

```
### <Work title>

- Kind, creator, year: <kind>; <creator>; <year>
- Tags and basis: <tags>; <a|b|c>: <basis text>
- Status: <released | early access | unreleased | cancelled | ended | ongoing> (<date or note>)
- Theme: <text>
- Flow: <text; for non-game works: narrative or viewing structure>
- Content outline: <text>
- Art style and rendering: <text>
- Lighting and colour: <text>
- Camera and media texture: <lens, VHS, noise, materials such as tile, water, reflection>
- Space composition and scale: <room shapes, repetition, scale distortion, routes>
- Sources: <URL> (<O|R|M|C>); <URL> (<tier>)
- Images: <file names in work/research-img/ | author + URL | link only>
```

## Rules

1. English, ASD-STE100. Max 32 KiB per file.
2. A famous or deep work gets more text. A small work may get one line per field.
3. If no source shows a field, write `not shown in sources`. Do not guess.
4. Section 6 entries describe camera and media technique only. Do not describe aesthetic or lore.
5. Steam facts and screenshots: `work/steam-facts.json`, files `work/research-img/steam-<appid>-<n>.jpg`.
