const machine = document.querySelector('.machine');
const display = document.getElementById('display');
const tallyButton = document.getElementById('tally');
const tallyCountEl = document.getElementById('tallyCount');
const tallyMarksEl = document.getElementById('tallyMarks');
const keys = Array.from(document.querySelectorAll('[data-type]'));

const OPS = ['+', '−', '×', '÷'];
const isOp = (x) => OPS.includes(x);
const MAX_MARKS = 40;

let tokens = [];
let currentTally = 0;
let tallyTouched = false;

function pulse(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

// Marks are grouped in fives, like a physical tally. Grouping keeps a long
// count countable and rhythmic instead of collapsing into a solid alarm bar.
const GROUP = 5;

function addMark(isNew) {
  let group = tallyMarksEl.lastElementChild;
  if (!group || group.childElementCount >= GROUP) {
    group = document.createElement('span');
    group.className = 'mark-group';
    tallyMarksEl.appendChild(group);
  }
  const mark = document.createElement('span');
  mark.className = isNew ? 'mark is-new' : 'mark';
  group.appendChild(mark);
}

function countMarks() {
  let n = 0;
  for (const g of tallyMarksEl.children) n += g.childElementCount;
  return n;
}

function renderMarks(count, tapped) {
  const shown = Math.min(count, MAX_MARKS);

  if (tapped && shown === countMarks() + 1) {
    addMark(true);
    return;
  }

  tallyMarksEl.innerHTML = '';
  for (let i = 0; i < shown; i++) addMark(false);
}

function render(fx = {}) {
  display.classList.remove('is-error');
  tallyCountEl.textContent = String(currentTally);
  renderMarks(currentTally, fx.tap);

  const parts = tokens.slice();
  if (tallyTouched) parts.push(String(currentTally));
  display.textContent = parts.length ? parts.join(' ') : '0';

  if (fx.tap) pulse(tallyCountEl, 'is-tick');
  if (fx.land) {
    pulse(tallyButton, 'is-landing');
    pulse(display, 'is-landing');
  }
  if (fx.result) pulse(display, 'is-result');
  if (fx.clear) pulse(machine, 'is-clearing');
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
  render({ tap: true });
}

function commitTally() {
  if (!tallyTouched) return false;
  tokens.push(String(currentTally));
  currentTally = 0;
  tallyTouched = false;
  return true;
}

function pressOperator(op) {
  if (tokens.length === 0 && !tallyTouched) return;

  const landed = commitTally();

  if (isOp(tokens[tokens.length - 1])) {
    tokens[tokens.length - 1] = op;
  } else {
    tokens.push(op);
  }
  render({ land: landed });
}

function pressEquals() {
  if (tokens.length === 0 && !tallyTouched) return;

  commitTally();

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
    render();
    display.textContent = 'Error';
    display.classList.add('is-error');
    return;
  }

  tokens = [String(Math.round(result * 1e10) / 1e10)];
  render({ result: true });
}

function pressClear() {
  tokens = [];
  currentTally = 0;
  tallyTouched = false;
  render({ clear: true });
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
