/**
 * 日志工具模块
 * 支持日志级别控制和文件输出
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// 日志级别
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

class Logger {
  constructor(options = {}) {
    this.level = options.level || (process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG);
    this.enableFileLog = options.enableFileLog !== false;
    this.logDir = options.logDir || path.join(app.getPath('userData'), 'logs');
    this.prefix = options.prefix || '';

    // 设置 Windows 控制台编码为 UTF-8
    if (process.platform === 'win32' && process.stdout && process.stdout.setDefaultEncoding) {
      try {
        process.stdout.setDefaultEncoding('utf8');
        process.stderr.setDefaultEncoding('utf8');
      } catch (e) {
        // 忽略错误
      }
    }

    if (this.enableFileLog) {
      this._ensureLogDir();
    }
  }

  _ensureLogDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (e) {
      console.error('创建日志目录失败：', e);
      this.enableFileLog = false;
    }
  }

  _getLogFile() {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logDir, `app-${date}.log`);
  }

  _writeToFile(message) {
    if (!this.enableFileLog) return;

    try {
      const logFile = this._getLogFile();
      fs.appendFileSync(logFile, message + '\n', 'utf8');
    } catch (e) {
      // 避免日志失败导致应用崩溃
      console.error('写入日志文件失败：', e);
    }
  }

  _formatMessage(level, ...args) {
    const timestamp = new Date().toISOString();
    const levelName = Object.keys(LogLevel).find(k => LogLevel[k] === level) || 'UNKNOWN';
    const prefix = this.prefix ? `[${this.prefix}] ` : '';
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    return `[${timestamp}] [${levelName}] ${prefix}${message}`;
  }

  _log(level, ...args) {
    if (level < this.level) return;

    const message = this._formatMessage(level, ...args);

    // 控制台输出
    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.ERROR:
        console.error(message);
        break;
    }

    // 文件输出
    this._writeToFile(message);
  }

  debug(...args) {
    this._log(LogLevel.DEBUG, ...args);
  }

  info(...args) {
    this._log(LogLevel.INFO, ...args);
  }

  warn(...args) {
    this._log(LogLevel.WARN, ...args);
  }

  error(...args) {
    this._log(LogLevel.ERROR, ...args);
  }

  setLevel(level) {
    this.level = level;
  }
}

// 默认实例
const defaultLogger = new Logger();

module.exports = {
  Logger,
  LogLevel,
  logger: defaultLogger
};
