import {
  buildENFAFromRegex,
  convertENFAToDFA,
  renderAutomaton,
  serializeAutomaton,
  simulateDFA,
  simulateENFA,
} from './automata.js';

const regexInput = document.getElementById('regexInput');
const buildBtn = document.getElementById('buildBtn');
const dfaBtn = document.getElementById('dfaBtn');
const simulateBtn = document.getElementById('simulateBtn');
const testString = document.getElementById('testString');
const msg = document.getElementById('message');
const structureOutput = document.getElementById('structureOutput');
const simulationOutput = document.getElementById('simulationOutput');
const svg = document.getElementById('automatonSvg');

let currentMachine = null;

function formatStateList(states) {
  if (!states || states.length === 0) return '∅';
  return states.map((s) => `q${s}`).join(', ');
}

function formatSimulationSummary(input, result) {
  const lines = [`Input: "${input}"`, `Accepted: ${result.accepted}`];

  if (result.firstMismatch) {
    lines.push(
      `First mismatch: index ${result.firstMismatch.index}, symbol ${result.firstMismatch.symbol}`,
      `Reason: ${result.firstMismatch.reason}`,
    );
  } else {
    lines.push('First mismatch: none');
  }

  return lines;
}

function formatDFATrace(trace) {
  const lines = ['Character transitions:'];
  for (const step of trace) {
    if (step.step === 0) {
      lines.push(`  start -> q${step.to}`);
      continue;
    }
    lines.push(`  [${step.index}] '${step.symbol}': q${step.from} -> q${step.to}`);
  }
  return lines;
}

function formatENFATrace(trace) {
  const lines = ['Character transitions:'];
  for (const step of trace) {
    if (step.step === 0) {
      lines.push(`  ε-closure(start): {${formatStateList(step.after)}}`);
      continue;
    }
    lines.push(
      `  [${step.index}] '${step.symbol}': {${formatStateList(step.before)}} --${step.symbol}--> {${formatStateList(
        step.moved,
      )}} ; ε-closure => {${formatStateList(step.after)}}`,
    );
  }
  return lines;
}

function setMessage(text, isError = false) {
  msg.textContent = text;
  msg.classList.toggle('error', isError);
}

function loadMachine(machine, label) {
  currentMachine = machine;
  renderAutomaton(svg, machine);
  structureOutput.textContent = serializeAutomaton(machine);
  simulationOutput.textContent = `${label} loaded. Enter a test string and click Simulate.`;
}

buildBtn.addEventListener('click', () => {
  try {
    const enfa = buildENFAFromRegex(regexInput.value);
    loadMachine(enfa, 'ε-NFA');
    setMessage('Built ε-NFA using Thompson construction.');
  } catch (error) {
    setMessage(error.message, true);
  }
});

dfaBtn.addEventListener('click', () => {
  try {
    const enfa = buildENFAFromRegex(regexInput.value);
    const dfa = convertENFAToDFA(enfa);
    loadMachine(dfa, 'DFA');
    setMessage('Converted ε-NFA to DFA via subset construction.');
  } catch (error) {
    setMessage(error.message, true);
  }
});

simulateBtn.addEventListener('click', () => {
  if (!currentMachine) {
    setMessage('Build an automaton first.', true);
    return;
  }

  const input = testString.value;
  if (currentMachine.type === 'DFA') {
    const result = simulateDFA(currentMachine, input);
    simulationOutput.textContent = [
      ...formatSimulationSummary(input, result),
      `Halted at: q${result.haltedState}`,
      ...formatDFATrace(result.trace),
    ].join('\n');
  } else {
    const result = simulateENFA(currentMachine, input);
    simulationOutput.textContent = [
      ...formatSimulationSummary(input, result),
      `Current states: ${formatStateList([...result.currentStates].sort((a, b) => a - b))}`,
      ...formatENFATrace(result.trace),
    ].join('\n');
  }
});

buildBtn.click();
