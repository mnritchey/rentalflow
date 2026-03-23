// Generate beep sounds via Web Audio API
const ctx = () => new (window.AudioContext || window.webkitAudioContext)();

export function playSuccess() {
  const ac = ctx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain); gain.connect(ac.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ac.currentTime);
  osc.frequency.setValueAtTime(1200, ac.currentTime + 0.1);
  gain.gain.setValueAtTime(0.3, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3);
  osc.start(); osc.stop(ac.currentTime + 0.3);
}

export function playError() {
  const ac = ctx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain); gain.connect(ac.destination);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(300, ac.currentTime);
  osc.frequency.setValueAtTime(150, ac.currentTime + 0.15);
  gain.gain.setValueAtTime(0.3, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
  osc.start(); osc.stop(ac.currentTime + 0.4);
}

export function playWarning() {
  const ac = ctx();
  [440, 440, 440].forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.frequency.value = freq;
    const t = ac.currentTime + i * 0.15;
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.start(t); osc.stop(t + 0.1);
  });
}

export function playSound(type) {
  try {
    if (type === 'success') playSuccess();
    else if (type === 'error') playError();
    else if (type === 'warning') playWarning();
  } catch {}
}
