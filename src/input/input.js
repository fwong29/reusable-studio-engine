export function createInput(target) {
  const state = {
    x: target.clientWidth / 2,
    y: target.clientHeight / 2,
  };

  target.addEventListener('mousemove', (event) => {
    const rect = target.getBoundingClientRect();
    state.x = event.clientX - rect.left;
    state.y = event.clientY - rect.top;
  });

  return state;
}
