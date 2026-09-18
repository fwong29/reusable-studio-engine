const display = document.getElementById('display');
const tallyButton = document.getElementById('tally');
const tallyCountEl = document.getElementById('tallyCount');
const tallyMarksEl = document.getElementById('tallyMarks');
const keys = Array.from(document.querySelectorAll('[data-type]'));

const OPS = ['+', '−', '×', '÷'];
const isOp = (x) => OPS.includes(x);

let tokens = [];
let currentTally = 0;
let tallyTouched = false;

function renderMarks(count) {
  tallyMarksEl.innerHTML = '';
  const shown = Math.min(count, 40);
  for (let i = 0; i < shown; i++) {
    const mark = document.createElement('span');
    mark.className = 'mark';
    tallyMarksEl.appendChild(mark);
  }
}

function render() {
  tallyCountEl.textContent = String(currentTally);
  renderMarks(currentTally);

  const parts = tokens.slice();
  if (tallyTouched) parts.push(String(currentTally));
  display.textContent = parts.length ? parts.join(' ') : '0';
}

function evaluate(list) {
  const nums = [parseFloat(list[0])];
  const ops = [];
  for (let i = 1; i < list.length; i += 2) {
    ops.push(list[i]);
    nums.push(parseFloat(list[i + 1]));
  }

  const stackNums = [nums[0]];
  const stackOps = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i] === '×' || ops[i] === '÷') {
      const prev = stackNums.pop();
      stackNums.push(ops[i] === '×' ? prev * nums[i + 1] : prev / nums[i + 1]);
    } else {
      stackOps.push(ops[i]);
      stackNums.push(nums[i + 1]);
    }
  }

  let result = stackNums[0];
  for (let i = 0; i < stackOps.length; i++) {
    result = stackOps[i] === '+' ? result + stackNums[i + 1] : result - stackNums[i + 1];
  }
  return result;
}

function pressTally() {
  currentTally += 1;
  tallyTouched = true;
  render();
}

function pressOperator(op) {
  if (tokens.length === 0 && !tallyTouched) return;

  if (tallyTouched) {
    tokens.push(String(currentTally));
    currentTally = 0;
    tallyTouched = false;
  }

  if (isOp(tokens[tokens.length - 1])) {
    tokens[tokens.length - 1] = op;
  } else {
    tokens.push(op);
  }
  render();
}

function pressEquals() {
  if (tokens.length === 0 && !tallyTouched) return;

  if (tallyTouched) {
    tokens.push(String(currentTally));
    currentTally = 0;
    tallyTouched = false;
  }

  if (isOp(tokens[tokens.length - 1])) tokens.pop();
  if (tokens.length === 0) {
    render();
    return;
  }

  let result;
  try {
    result = evaluate(tokens);
    if (!isFinite(result)) throw new Error('divide by zero');
  } catch (e) {
    tokens = [];
    display.textContent = 'Error';
    return;
  }

  tokens = [String(Math.round(result * 1e10) / 1e10)];
  render();
}

function pressClear() {
  tokens = [];
  currentTally = 0;
  tallyTouched = false;
  render();
}

function pressBackspace() {
  if (currentTally > 0) {
    currentTally -= 1;
    tallyTouched = currentTally > 0;
  } else if (tokens.length > 0) {
    tokens.pop();
  }
  render();
}

tallyButton.addEventListener('click', pressTally);

keys.forEach((key) => {
  const type = key.dataset.type;
  key.addEventListener('click', () => {
    if (type === 'op') pressOperator(key.dataset.value);
    else if (type === 'control') {
      const value = key.dataset.value;
      if (value === 'C') pressClear();
      else if (value === '⌫') pressBackspace();
      else if (value === '=') pressEquals();
    }
  });
});

render();
