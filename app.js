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
    simulationOutput.textContent = `Input: "${input}"\nAccepted: ${result.accepted}\nHalted at: q${result.haltedState}`;
  } else {
    const result = simulateENFA(currentMachine, input);
    simulationOutput.textContent = `Input: "${input}"\nAccepted: ${result.accepted}\nCurrent states: ${[
      ...result.currentStates,
    ]
      .sort((a, b) => a - b)
      .map((s) => `q${s}`)
      .join(', ')}`;
  }
});

buildBtn.click();
