# Parameter sidebar for the workbench

Date: 2026-11-11. Status: user direction, built in Task 10.

## User words

"Can I have a simple interface to adjust parameters freely in the game view and compare the effect. It must be general: a new parameter needs only a very small change. At least it must group parameters. It need not be a whole engine; a simple side menu is enough."

User decision: no library (a GUI library such as lil-gui was rejected). Use plain HTML inputs.

## Decision

| Item | Rule |
|---|---|
| Parameter list | One table for each kind in `workbench/js/params.js`: light, water, material, feel. An entry has key, label, group, kind (range, colour, select, toggle), limits or options, default, level (common or advanced). |
| New parameter | ONE new entry plus the code that reads the value. Defaults are filled when a preset loads (`fillDefaults`), so the reading code has no `??`. |
| Panel | `workbench/js/panel.js`. Shown only with `?panel=1`. It is built from the tables and has no code for a key, a preset id or a room id (rule W-02). |
| Apply | One path: the viewer function `apply(kinds)` in `main.js` rebuilds only what depends on the kind. The scene loader uses the same `build`. |
| Preset list | `serve.mjs` answers `/presets.json` from the files in `looks/<kind>/`. |
| Save | "download JSON" writes the preset file. The user puts it in `looks/<kind>/`. No write endpoint. |
| Feel | The walker reads the live feel object. A change needs no rebuild. Feel stays strict: a preset file must name every key. |

## Why no library

The panel is about 200 lines. A library adds a dependency (a decision that needs the user), its own colour and range widgets that are hard to use by touch, and a second place that stores values. Native inputs work on a phone (rule W-10).

## Reverse cost

Delete `panel.js`, the `?panel=1` block in `main.js` and the `/presets.json` route. `params.js` and `build/apply` stay useful. To go back to the old loader, revert the commit that adds `params.js`.
