// Counts what a mounted board holds on the page's globals, so the spec can prove destroy()
// gives all of it back. Classic script, before any module: everything after it is counted.
// Caveat: only what is counted here — window/document listeners come from CDP in the spec;
// a timeout chain, an IndexedDB connection or a listener on some other object is not seen.
(() => {
  const live = { mediaListeners: 0, resizeObservers: 0, workers: 0, intervals: 0, frames: 0 };
  const intervals = new Set();
  const frames = new Set();

  const mqAdd = MediaQueryList.prototype.addEventListener;
  const mqRemove = MediaQueryList.prototype.removeEventListener;
  const mqListeners = new Set();
  MediaQueryList.prototype.addEventListener = function (type, listener, options) {
    mqListeners.add(listener);
    live.mediaListeners = mqListeners.size;
    return mqAdd.call(this, type, listener, options);
  };
  MediaQueryList.prototype.removeEventListener = function (type, listener, options) {
    mqListeners.delete(listener);
    live.mediaListeners = mqListeners.size;
    return mqRemove.call(this, type, listener, options);
  };

  const observers = new Set();
  const NativeResizeObserver = window.ResizeObserver;
  window.ResizeObserver = class extends NativeResizeObserver {
    observe(...args) {
      observers.add(this);
      live.resizeObservers = observers.size;
      return super.observe(...args);
    }
    disconnect() {
      observers.delete(this);
      live.resizeObservers = observers.size;
      return super.disconnect();
    }
  };

  const NativeWorker = window.Worker;
  const workers = new Set();
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args);
      workers.add(this);
      live.workers = workers.size;
    }
    terminate() {
      workers.delete(this);
      live.workers = workers.size;
      return super.terminate();
    }
  };

  const setInt = window.setInterval.bind(window);
  const clearInt = window.clearInterval.bind(window);
  window.setInterval = (...args) => {
    const id = setInt(...args);
    intervals.add(id);
    live.intervals = intervals.size;
    return id;
  };
  window.clearInterval = (id) => {
    intervals.delete(id);
    live.intervals = intervals.size;
    return clearInt(id);
  };

  // Frames still requested: a render loop that outlives the board keeps this above zero.
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    const id = raf((time) => {
      frames.delete(id);
      live.frames = frames.size;
      callback(time);
    });
    frames.add(id);
    live.frames = frames.size;
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    frames.delete(id);
    live.frames = frames.size;
    return caf(id);
  };

  // Every CSP violation the page reports, the ones a console message may not show included.
  const violations = [];
  document.addEventListener(
    "securitypolicyviolation",
    (event) => violations.push(`${event.effectiveDirective}: ${event.blockedURI || "inline"}`),
    true,
  );
  window.__violations = violations;
  window.__live = live;
})();
