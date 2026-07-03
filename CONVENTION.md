# Code Convention (WB.5-13-26b2)

This convention is very easy to understand and follow, yet central for the good development of any project.
The Wass B. 5/13/2026 (WB.5-13-26) convention is detailed below.

## Files

### Files Structure

**It is crucial for the files to be well organized, so the following methods should be used:**
- information files *(e.g. PROJECT.md / CONVENTION.md / ...)* should be located at the root of the parent folder
- project's source code should be located in a sub-folder/sub-directory also at the root of the parent folder *(e.g. root/source/...)*
- if the source code is divided into multiple parts due to the project's complexity, then apply the same logic recursively *(e.g. cd root/source/ && ls : frontend/ backend/ ...)*
- concerning assets or other domain files, they should be located in appropriate sub-folders from the root as well
- concerning the save files, they should be located in *"root/saves/(e.g. psd)"*

### Files Name

**File names should be chosen considering those criteria:**
- programming language file naming convention
- uppercase for information files
- asset file names should be identical to their other variants and respect one and only one chosen format *(e.g. Logo.png / Logo No Background.png / Logo Full.png || logo.png / logo-no-background.png / logo-full.png )*

### Files Extension

**When a file extension is free to decide:**
- .md for information files
- .json for data according to this format
- .ini for config files

## Code

### Tech-Stack

The Tech-Stack should be clear and specified in the PROJECT.md or any other file explaining it.

### Code Convention

Two simple rules to follow. The first is to keep following the programming language naming convention.
The second is to balance the code between optimisation and readability. Which means expanded condition statements instead of one-line ones (unless really dispensable).
The rest should be easy to follow from there.

Those two rules are very important.

### Docstrings & Comments

One unified docstring style across the whole project. The goal is short, purposeful descriptions: enough to make intent clear, no more.

- **Python** — PEP 257 docstrings using triple double-quotes (`"""..."""`). One-line form when the summary fits; otherwise a one-line summary, a blank line, then a brief body. Mandatory on every module, public class, and public function. Local helpers get one when their purpose is not obvious from the name.
- **JavaScript / JSX** — JSDoc block comments (`/** ... */`) placed directly above the declaration. One-line form when it fits. Mandatory on every exported function, exported component, and named local helper whose purpose is not obvious.
- Describe **what the thing is for**, not how it is implemented. Do not restate the signature.
- Inline comments (`#`, `//`) are reserved for non-obvious *why*. They should never paraphrase the code.
- Decorative section banners are acceptable for grouping (e.g. `# ── Users ───`) but should stay short and rare.

### Dependencies

Third-party dependencies should be added only when necessary. Before adding one, consider whether the need can be reasonably covered by the existing stack. When a dependency is added, it should be justified and its scope limited to what is actually used.

### Testing

Testing is required. The extent depends on the project's complexity and is left to judgement, but core features and critical paths must be covered before being considered done.

## Documentation

Documentation should be welcoming to read and trustworthy. It explains **what something is for and how to use it**, not how it is implemented internally.

### Location

- The root `README.md` is the project's landing page, not its manual. It presents the project, links to the docs, and points to contributing — nothing heavy lives inside it.
- Full guides live in a dedicated `documentation/` folder inside the source tree. The README links out to them.
- Each relocatable sub-project (e.g. `agent/`) keeps its own lighter `README.md` covering only itself.

### Single source of truth

Each fact is owned by exactly one file. Other documents link to it instead of restating it. Never keep a "summary" copy that paraphrases a full document — a summary is a one-line pointer plus a link, never a parallel rewrite. Duplicated prose drifts.

### Structure

- The README presents the project in three parts: **Presentation** (header, what it is, the problem it solves, what makes it stand out, a quick start), **Documentation** (short pointers linking to the full guides), and **Contributing**.
- The Presentation must sell the project honestly: state plainly what it does, the problem it solves, and its real advantages — in plain words, up front.
- Documentation splits by audience: a **User guide** (approachable, never scary, the simple happy path first) and a **Technical guide** (enough depth for a self-hoster or contributor, no more).

### Safety floor

Friendliness never removes safety guidance. Any document, regardless of tone, keeps the warnings a reader needs to run the project safely (e.g. safe-by-default settings, what exposes them, where secrets live). A technical guide states the real security posture honestly rather than hiding it to look more polished.

### Examples and secrets

Every example secret (API key, token, address) is an obvious placeholder — never a real or real-shaped value. No sensitive data ever appears in a committed document, per the Security section.

## User Assistant

For any AI use during the project development.

### Skills

Make sure to use appropriate skills including the author's/company one (e.g. Wass B. Skills) if existing.

### Convention Complying

Make sure the AI complies with and correctly uses the provided information such as the convention.

### Human / AI balance

The human share of work in time should be around 20-35% of the total. The core of the project — its structure, key decisions, and direction — must be defined by the human. The AI handles execution and detail work from there.

### Protocol

**The work protocol is the following one:**
- well set-up Assistant
- clear, consistent and formal prompts
- LLM acts like an employee following the rules

## Security

### Confidentiality

Project confidentiality is important, everything should stay internal and any third-party service usage should be limited.

### Code Security

The code should be meticulously made to avoid any vulnerabilities. Security must be addressed before any feature is considered complete, not deferred indefinitely.

### Sensitive data

Any sensitive data such as API keys, database accesses, etc., should be strictly held inside environment files.
No sensitive data should be pushed into production or be open-sourced.

## Misc

### Writing

The writing should be uniform. The choice is up to the writer as long as they follow the average writing convention (how things are usually written).
If something is written in a certain syntax (spaces inside brackets, etc.) it should be the case everywhere.

### Unspecified

For any unspecified rules, they should be chosen sensibly considering all of the above.

## Convention Making

### Naming

We name the convention with the following format: chosen chars (e.g. initials) > dot (.) > MM-DD-YY (of the first creation).
For name updates, the date should stay the same as the creation date; the only modification should be an addition of "b" + (index of the version, e.g. "AB.MM-DD-YYb1").

The date only resets on a major change.

### Changelog

Any update to the convention should be briefly noted below with its version name and a short description of what changed.

| Version      | Changes                                                                                        |
|--------------|------------------------------------------------------------------------------------------------|
| WB.5-13-26   | Initial version                                                                                |
| WB.5-13-26b1 | Added unified docstring / comment style (PEP 257 + JSDoc)                                      |
| WB.5-13-26b2 | Added Documentation section (location, single source of truth, README structure, safety floor) |