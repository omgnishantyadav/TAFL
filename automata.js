let nextStateId = 0;

function createState() {
  return nextStateId++;
}

function resetStateCounter() {
  nextStateId = 0;
}

function ensureTransition(map, from, symbol, to) {
  if (!map.has(from)) {
    map.set(from, new Map());
  }
  const fromMap = map.get(from);
  if (!fromMap.has(symbol)) {
    fromMap.set(symbol, new Set());
  }
  fromMap.get(symbol).add(to);
}

function isLiteral(ch) {
  return /[a-zA-Z0-9]/.test(ch) || ch === 'ε';
}

function addConcatOperators(regex) {
  let out = '';
  for (let i = 0; i < regex.length; i += 1) {
    const current = regex[i];
    const next = regex[i + 1];
    out += current;
    if (!next) continue;

    const currentCanConcat = isLiteral(current) || current === ')' || current === '*';
    const nextCanConcat = isLiteral(next) || next === '(';

    if (currentCanConcat && nextCanConcat) {
      out += '.';
    }
  }
  return out;
}

function toPostfix(regex) {
  const precedence = { '|': 1, '.': 2, '*': 3 };
  const output = [];
  const ops = [];

  for (const token of regex) {
    if (isLiteral(token)) {
      output.push(token);
      continue;
    }

    if (token === '(') {
      ops.push(token);
      continue;
    }

    if (token === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') {
        output.push(ops.pop());
      }
      if (!ops.length) {
        throw new Error('Mismatched parentheses in regex');
      }
      ops.pop();
      continue;
    }

    if (!(token in precedence)) {
      throw new Error(`Unsupported token: ${token}`);
    }

    while (
      ops.length &&
      ops[ops.length - 1] !== '(' &&
      precedence[ops[ops.length - 1]] >= precedence[token]
    ) {
      output.push(ops.pop());
    }
    ops.push(token);
  }

  while (ops.length) {
    const op = ops.pop();
    if (op === '(') throw new Error('Mismatched parentheses in regex');
    output.push(op);
  }

  return output;
}

export function buildENFAFromRegex(rawRegex) {
  const regex = rawRegex.trim();
  if (!regex) {
    throw new Error('Regex cannot be empty');
  }

  resetStateCounter();
  const withConcat = addConcatOperators(regex);
  const postfix = toPostfix(withConcat);
  const stack = [];
  const transitions = new Map();

  for (const token of postfix) {
    if (isLiteral(token)) {
      const start = createState();
      const accept = createState();
      const sym = token === 'ε' ? 'ε' : token;
      ensureTransition(transitions, start, sym, accept);
      stack.push({ start, accept });
      continue;
    }

    if (token === '.') {
      const b = stack.pop();
      const a = stack.pop();
      if (!a || !b) throw new Error('Invalid regex for concatenation');
      ensureTransition(transitions, a.accept, 'ε', b.start);
      stack.push({ start: a.start, accept: b.accept });
      continue;
    }

    if (token === '|') {
      const b = stack.pop();
      const a = stack.pop();
      if (!a || !b) throw new Error('Invalid regex for union');
      const start = createState();
      const accept = createState();
      ensureTransition(transitions, start, 'ε', a.start);
      ensureTransition(transitions, start, 'ε', b.start);
      ensureTransition(transitions, a.accept, 'ε', accept);
      ensureTransition(transitions, b.accept, 'ε', accept);
      stack.push({ start, accept });
      continue;
    }

    if (token === '*') {
      const a = stack.pop();
      if (!a) throw new Error('Invalid regex for Kleene star');
      const start = createState();
      const accept = createState();
      ensureTransition(transitions, start, 'ε', a.start);
      ensureTransition(transitions, start, 'ε', accept);
      ensureTransition(transitions, a.accept, 'ε', a.start);
      ensureTransition(transitions, a.accept, 'ε', accept);
      stack.push({ start, accept });
      continue;
    }
  }

  if (stack.length !== 1) {
    throw new Error('Invalid regex expression');
  }

  const fragment = stack[0];
  const states = new Set([fragment.start, fragment.accept]);
  for (const [from, symMap] of transitions) {
    states.add(from);
    for (const targets of symMap.values()) {
      for (const target of targets) {
        states.add(target);
      }
    }
  }

  const alphabet = new Set();
  for (const symMap of transitions.values()) {
    for (const sym of symMap.keys()) {
      if (sym !== 'ε') alphabet.add(sym);
    }
  }

  return {
    type: 'ENFA',
    start: fragment.start,
    acceptStates: new Set([fragment.accept]),
    states,
    transitions,
    alphabet,
  };
}

function epsilonClosure(enfa, stateSet) {
  const closure = new Set(stateSet);
  const stack = [...stateSet];

  while (stack.length) {
    const state = stack.pop();
    const symMap = enfa.transitions.get(state);
    const epsTargets = symMap?.get('ε');
    if (!epsTargets) continue;

    for (const target of epsTargets) {
      if (!closure.has(target)) {
        closure.add(target);
        stack.push(target);
      }
    }
  }

  return closure;
}

function move(enfa, stateSet, symbol) {
  const moved = new Set();
  for (const state of stateSet) {
    const symMap = enfa.transitions.get(state);
    const targets = symMap?.get(symbol);
    if (!targets) continue;
    for (const target of targets) moved.add(target);
  }
  return moved;
}

function keyOf(set) {
  return [...set].sort((a, b) => a - b).join(',');
}

function sortStates(set) {
  return [...set].sort((a, b) => a - b);
}

export function convertENFAToDFA(enfa) {
  const startClosure = epsilonClosure(enfa, new Set([enfa.start]));
  const dfaTransitions = new Map();
  const dfaStatesByKey = new Map();
  const queue = [];
  let dfaNextId = 0;

  const startKey = keyOf(startClosure);
  dfaStatesByKey.set(startKey, { id: dfaNextId++, nfaStates: startClosure });
  queue.push(startKey);

  const acceptStates = new Set();
  const allStates = new Set([0]);

  while (queue.length) {
    const currentKey = queue.shift();
    const current = dfaStatesByKey.get(currentKey);

    if ([...current.nfaStates].some((s) => enfa.acceptStates.has(s))) {
      acceptStates.add(current.id);
    }

    for (const symbol of enfa.alphabet) {
      const moved = move(enfa, current.nfaStates, symbol);
      const closure = epsilonClosure(enfa, moved);
      if (!closure.size) continue;
      const closureKey = keyOf(closure);

      if (!dfaStatesByKey.has(closureKey)) {
        dfaStatesByKey.set(closureKey, { id: dfaNextId++, nfaStates: closure });
        queue.push(closureKey);
        allStates.add(dfaNextId - 1);
      }

      const target = dfaStatesByKey.get(closureKey);
      ensureTransition(dfaTransitions, current.id, symbol, target.id);
    }
  }

  return {
    type: 'DFA',
    start: 0,
    acceptStates,
    states: allStates,
    transitions: dfaTransitions,
    alphabet: new Set(enfa.alphabet),
    stateLabelMap: new Map([...dfaStatesByKey.values()].map((v) => [v.id, keyOf(v.nfaStates)])),
  };
}

export function simulateENFA(enfa, input) {
  let current = epsilonClosure(enfa, new Set([enfa.start]));
  const trace = [
    {
      step: 0,
      symbol: 'ε-closure(start)',
      before: [enfa.start],
      moved: [enfa.start],
      after: sortStates(current),
    },
  ];

  let firstMismatch = null;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const before = sortStates(current);
    const moved = move(enfa, current, ch);
    const movedSorted = sortStates(moved);
    const afterClosure = epsilonClosure(enfa, moved);
    const after = sortStates(afterClosure);

    trace.push({
      step: i + 1,
      index: i,
      symbol: ch,
      before,
      moved: movedSorted,
      after,
    });

    if (!moved.size && !firstMismatch) {
      firstMismatch = {
        index: i,
        symbol: ch,
        reason: `No transition on '${ch}' from active ε-NFA states`,
      };
    }

    current = afterClosure;
  }

  const accepted = [...current].some((s) => enfa.acceptStates.has(s));
  if (!accepted && !firstMismatch) {
    firstMismatch = {
      index: input.length,
      symbol: '(end)',
      reason: 'Input consumed but no accepting state is reachable',
    };
  }

  return { accepted, currentStates: current, trace, firstMismatch };
}

export function simulateDFA(dfa, input) {
  let current = dfa.start;
  const trace = [{ step: 0, symbol: 'start', from: null, to: current }];

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = dfa.transitions.get(current)?.get(ch);
    if (!next || next.size === 0) {
      return {
        accepted: false,
        haltedState: current,
        trace,
        firstMismatch: {
          index: i,
          symbol: ch,
          reason: `No DFA transition from q${current} on '${ch}'`,
        },
      };
    }

    const target = [...next][0];
    trace.push({ step: i + 1, index: i, symbol: ch, from: current, to: target });
    current = target;
  }

  const accepted = dfa.acceptStates.has(current);
  return {
    accepted,
    haltedState: current,
    trace,
    firstMismatch: accepted
      ? null
      : {
          index: input.length,
          symbol: '(end)',
          reason: `Input consumed in non-accepting state q${current}`,
        },
  };
}

export function serializeAutomaton(machine) {
  const lines = [];
  lines.push(`Type: ${machine.type}`);
  lines.push(`States: ${[...machine.states].sort((a, b) => a - b).join(', ')}`);
  lines.push(`Start: q${machine.start}`);
  lines.push(`Accept: ${[...machine.acceptStates].sort((a, b) => a - b).map((s) => `q${s}`).join(', ')}`);
  lines.push('Transitions:');

  const sortedStates = [...machine.states].sort((a, b) => a - b);
  for (const state of sortedStates) {
    const symMap = machine.transitions.get(state);
    if (!symMap) continue;
    for (const [sym, targets] of symMap) {
      const targetList = [...targets].sort((a, b) => a - b).map((s) => `q${s}`).join(', ');
      lines.push(`  q${state} --${sym}--> ${targetList}`);
    }
  }

  if (machine.stateLabelMap) {
    lines.push('DFA state subsets:');
    for (const [state, label] of [...machine.stateLabelMap].sort((a, b) => a[0] - b[0])) {
      lines.push(`  q${state} = {${label}}`);
    }
  }

  return lines.join('\n');
}

export function renderAutomaton(svg, machine) {
  svg.innerHTML = '';
  const width = 1000;
  const height = 600;
  const states = [...machine.states].sort((a, b) => a - b);

  const cols = Math.ceil(Math.sqrt(states.length));
  const rows = Math.ceil(states.length / cols);
  const spacingX = width / (cols + 1);
  const spacingY = height / (rows + 1);

  const pos = new Map();
  states.forEach((state, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    pos.set(state, {
      x: spacingX * (col + 1),
      y: spacingY * (row + 1),
    });
  });

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L10,4 L0,8 z" fill="#cbd5e1" />
    </marker>`;
  svg.appendChild(defs);

  for (const [from, symMap] of machine.transitions) {
    for (const [sym, targets] of symMap) {
      for (const to of targets) {
        const p1 = pos.get(from);
        const p2 = pos.get(to);
        if (!p1 || !p2) continue;

        if (from === to) {
          const loop = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          loop.setAttribute('d', `M ${p1.x} ${p1.y - 26} C ${p1.x + 35} ${p1.y - 65}, ${p1.x - 35} ${p1.y - 65}, ${p1.x} ${p1.y - 26}`);
          loop.setAttribute('fill', 'none');
          loop.setAttribute('stroke', '#94a3b8');
          loop.setAttribute('stroke-width', '1.8');
          loop.setAttribute('marker-end', 'url(#arrow)');
          svg.appendChild(loop);

          const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          t.setAttribute('x', `${p1.x}`);
          t.setAttribute('y', `${p1.y - 72}`);
          t.setAttribute('text-anchor', 'middle');
          t.setAttribute('fill', '#f8fafc');
          t.textContent = sym;
          svg.appendChild(t);
          continue;
        }

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', `${p1.x}`);
        line.setAttribute('y1', `${p1.y}`);
        line.setAttribute('x2', `${p2.x}`);
        line.setAttribute('y2', `${p2.y}`);
        line.setAttribute('stroke', '#94a3b8');
        line.setAttribute('stroke-width', '1.8');
        line.setAttribute('marker-end', 'url(#arrow)');
        svg.appendChild(line);

        const tx = (p1.x + p2.x) / 2;
        const ty = (p1.y + p2.y) / 2 - 6;
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', `${tx}`);
        label.setAttribute('y', `${ty}`);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', '#f8fafc');
        label.textContent = sym;
        svg.appendChild(label);
      }
    }
  }

  const startPos = pos.get(machine.start);
  if (startPos) {
    const startArrow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    startArrow.setAttribute('x1', `${startPos.x - 55}`);
    startArrow.setAttribute('y1', `${startPos.y}`);
    startArrow.setAttribute('x2', `${startPos.x - 22}`);
    startArrow.setAttribute('y2', `${startPos.y}`);
    startArrow.setAttribute('stroke', '#22d3ee');
    startArrow.setAttribute('stroke-width', '2.2');
    startArrow.setAttribute('marker-end', 'url(#arrow)');
    svg.appendChild(startArrow);
  }

  for (const state of states) {
    const p = pos.get(state);
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', `${p.x}`);
    circle.setAttribute('cy', `${p.y}`);
    circle.setAttribute('r', '22');
    circle.setAttribute('fill', '#1e293b');
    circle.setAttribute('stroke', machine.acceptStates.has(state) ? '#34d399' : '#93c5fd');
    circle.setAttribute('stroke-width', '2.5');
    svg.appendChild(circle);

    if (machine.acceptStates.has(state)) {
      const inner = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      inner.setAttribute('cx', `${p.x}`);
      inner.setAttribute('cy', `${p.y}`);
      inner.setAttribute('r', '17');
      inner.setAttribute('fill', 'none');
      inner.setAttribute('stroke', '#34d399');
      inner.setAttribute('stroke-width', '2');
      svg.appendChild(inner);
    }

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', `${p.x}`);
    text.setAttribute('y', `${p.y + 5}`);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', '#e2e8f0');
    text.textContent = `q${state}`;
    svg.appendChild(text);
  }
}
