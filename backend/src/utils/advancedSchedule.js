const logger = require('../config/logger');

/**
 * Calculate next run time for advanced schedule configuration
 * @param {Object} scheduleConfig - Advanced schedule configuration
 * @param {Date} fromDate - Calculate from this date (default: now)
 * @returns {Date|null} - Next run time or null if no valid time found
 */
const getNextRunTime = (scheduleConfig, fromDate = new Date()) => {
  try {
    if (!scheduleConfig || typeof scheduleConfig !== 'object') {
      return null;
    }

    const {
      interval = 24,
      intervalUnit = 'hour',
      startTime = '00:00',
      runBetweenEnabled = false,
      runBetweenStart = '00:00',
      runBetweenEnd = '23:59',
      weekDays = [0, 1, 2, 3, 4, 5, 6],
      monthDays = [],
    } = scheduleConfig;

    // Parse start time
    const [startHour, startMinute] = startTime.split(':').map(Number);

    // Calculate interval in milliseconds
    const intervalMs = intervalUnit === 'hour' ? interval * 60 * 60 * 1000 : interval * 60 * 1000;

    // Start from the next possible occurrence
    let currentDate = new Date(fromDate);
    currentDate.setSeconds(0, 0);

    // If we're starting fresh (no previous run), calculate from start time
    const isFirstRun = !fromDate || fromDate.getTime() === new Date().getTime() || Math.abs(fromDate.getTime() - new Date().getTime()) < 1000;

    if (isFirstRun) {
      currentDate.setHours(startHour, startMinute, 0, 0);

      // If start time has passed today, add intervals until we get to a future time
      while (currentDate <= new Date()) {
        currentDate = new Date(currentDate.getTime() + intervalMs);
      }
    } else {
      // Continue from last run + interval
      currentDate = new Date(fromDate.getTime() + intervalMs);
    }

    // Try to find next valid date (max 10000 attempts to prevent infinite loop)
    let attempts = 0;
    const maxAttempts = 10000;

    while (attempts < maxAttempts) {
      attempts++;

      const dayOfWeek = currentDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      const dayOfMonth = currentDate.getDate();
      const isLastDayOfMonth =
        new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate() === dayOfMonth;

      let passes = true;

      // Check week days
      if (!weekDays.includes(dayOfWeek)) {
        passes = false;
      }

      // Check month days (if specified)
      if (monthDays.length > 0) {
        const matchesDay = monthDays.includes(dayOfMonth);
        const matchesLast = monthDays.includes('last') && isLastDayOfMonth;
        if (!matchesDay && !matchesLast) {
          passes = false;
        }
      }

      // Check run between hours
      if (runBetweenEnabled) {
        const [startH, startM] = runBetweenStart.split(':').map(Number);
        const [endH, endM] = runBetweenEnd.split(':').map(Number);
        const currentH = currentDate.getHours();
        const currentM = currentDate.getMinutes();

        const currentMinutes = currentH * 60 + currentM;
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
          passes = false;
        }
      }

      if (passes) {
        return currentDate;
      }

      // Increment by interval
      currentDate = new Date(currentDate.getTime() + intervalMs);
    }

    logger.warn('Could not find next run time within max attempts');
    return null;
  } catch (error) {
    logger.error(`Error calculating next run time: ${error.message}`);
    return null;
  }
};

/**
 * Check if a schedule config should run at a given time
 * @param {Object} scheduleConfig - Advanced schedule configuration
 * @param {Date} checkDate - Date to check
 * @returns {boolean} - True if schedule should run at this time
 */
const shouldRunAt = (scheduleConfig, checkDate = new Date()) => {
  try {
    if (!scheduleConfig || typeof scheduleConfig !== 'object') {
      return false;
    }

    const {
      runBetweenEnabled = false,
      runBetweenStart = '00:00',
      runBetweenEnd = '23:59',
      weekDays = [0, 1, 2, 3, 4, 5, 6],
      monthDays = [],
    } = scheduleConfig;

    const dayOfWeek = checkDate.getDay();
    const dayOfMonth = checkDate.getDate();
    const isLastDayOfMonth = new Date(checkDate.getFullYear(), checkDate.getMonth() + 1, 0).getDate() === dayOfMonth;

    // Check week days
    if (!weekDays.includes(dayOfWeek)) {
      return false;
    }

    // Check month days (if specified)
    if (monthDays.length > 0) {
      const matchesDay = monthDays.includes(dayOfMonth);
      const matchesLast = monthDays.includes('last') && isLastDayOfMonth;
      if (!matchesDay && !matchesLast) {
        return false;
      }
    }

    // Check run between hours
    if (runBetweenEnabled) {
      const [startH, startM] = runBetweenStart.split(':').map(Number);
      const [endH, endM] = runBetweenEnd.split(':').map(Number);
      const currentH = checkDate.getHours();
      const currentM = checkDate.getMinutes();

      const currentMinutes = currentH * 60 + currentM;
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error(`Error checking shouldRunAt: ${error.message}`);
    return false;
  }
};

/**
 * Validate advanced schedule configuration
 * @param {Object} scheduleConfig - Advanced schedule configuration
 * @returns {Object} - { valid: boolean, error: string|null }
 */
const validateScheduleConfig = (scheduleConfig) => {
  try {
    if (!scheduleConfig || typeof scheduleConfig !== 'object') {
      return { valid: false, error: 'Schedule configuration is required' };
    }

    const { interval, intervalUnit, weekDays, startTime } = scheduleConfig;

    if (!interval || interval < 1) {
      return { valid: false, error: 'Interval must be at least 1' };
    }

    if (!intervalUnit || !['hour', 'min'].includes(intervalUnit)) {
      return { valid: false, error: 'Interval unit must be "hour" or "min"' };
    }

    if (!Array.isArray(weekDays) || weekDays.length === 0) {
      return { valid: false, error: 'At least one week day must be selected' };
    }

    if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) {
      return { valid: false, error: 'Invalid start time format (expected HH:mm)' };
    }

    return { valid: true, error: null };
  } catch (error) {
    return { valid: false, error: error.message };
  }
};

module.exports = {
  getNextRunTime,
  shouldRunAt,
  validateScheduleConfig,
};
