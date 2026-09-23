const listeners = new Set();
let pending = 0;

export const subscribeToRequests = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getPendingRequests = () => pending;
const notify = () => listeners.forEach(listener => listener());

export function beginRequest() {
  let finished = false;
  pending += 1;
  notify();
  return () => {
    if (finished) return;
    finished = true;
    pending -= 1;
    notify();
  };
}
