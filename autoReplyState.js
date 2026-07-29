const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, '.data', 'auto-reply-state.json');

function loadAutoReplyEnabled() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return Boolean(data.enabled);
  } catch {
    return true;
  }
}

function saveAutoReplyEnabled(enabled) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify({ enabled }, null, 2), 'utf8');
}

module.exports = {
  loadAutoReplyEnabled,
  saveAutoReplyEnabled,
};
