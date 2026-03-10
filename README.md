# TAFL

Interactive web app for converting a regular expression into an equivalent finite automaton.

## Features

- Parses regular expressions with:
  - Union: `|`
  - Kleene star: `*`
  - Parentheses: `(...)`
  - Implicit concatenation (e.g. `(a|b)*abb`)
- Builds an **ε-NFA** via **Thompson's construction**.
- Optionally converts ε-NFA to a **DFA** using subset construction.
- Simulates input strings against the currently loaded automaton.
- Shows per-character transition traces and the first mismatch position/reason when a string is rejected.
- Renders the automaton as an SVG state graph in-browser.

## Run

This project is static HTML/CSS/JS. Serve it locally:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.
