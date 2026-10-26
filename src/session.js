const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSION_DIR_NAME = '.agent-tauri';
const SESSION_FILE_NAME = 'session.json';

function getSessionDir(projectRoot = process.cwd()) {
  const localDir = path.join(projectRoot, SESSION_DIR_NAME);
  return localDir;
}

function getSessionFilePath(projectRoot = process.cwd()) {
  return path.join(getSessionDir(projectRoot), SESSION_FILE_NAME);
}

function readSession(projectRoot = process.cwd()) {
  const filePath = getSessionFilePath(projectRoot);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function writeSession(data, projectRoot = process.cwd()) {
  const dir = getSessionDir(projectRoot);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = getSessionFilePath(projectRoot);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function removeSession(projectRoot = process.cwd()) {
  const filePath = getSessionFilePath(projectRoot);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      // ignore
    }
  }
}

module.exports = {
  getSessionDir,
  getSessionFilePath,
  readSession,
  writeSession,
  removeSession,
};
