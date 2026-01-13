import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
} from '@mui/material';
import { Clock, Calendar, AlertCircle } from 'lucide-react';

const AdvancedScheduleBuilder = ({ value, onChange }) => {
  const [scheduleConfig, setScheduleConfig] = useState({
    frequency: 'hourly', // 'hourly' | 'daily'
    interval: 24, // hours or minutes
    intervalUnit: 'hour', // 'hour' | 'min'
    startTime: '12:30', // HH:mm format
    runBetweenEnabled: false,
    runBetweenStart: '09:00',
    runBetweenEnd: '18:00',
    weekDays: [0, 1, 2, 3, 4, 5, 6], // 0=Sun, 1=Mon, ..., 6=Sat
    monthDays: [], // empty means all days, otherwise specific days [1,2,3,...,31,'last']
  });

  const [backupPlan, setBackupPlan] = useState([]);

  // Initialize from parent value
  useEffect(() => {
    if (value && typeof value === 'object') {
      setScheduleConfig((prev) => ({ ...prev, ...value }));
    }
  }, []);

  // Notify parent of changes
  useEffect(() => {
    onChange(scheduleConfig);
    calculateBackupPlan(scheduleConfig);
  }, [scheduleConfig]);

  const handleChange = (field, newValue) => {
    setScheduleConfig((prev) => ({
      ...prev,
      [field]: newValue,
    }));
  };

  const toggleWeekDay = (day) => {
    setScheduleConfig((prev) => {
      const weekDays = prev.weekDays.includes(day)
        ? prev.weekDays.filter((d) => d !== day)
        : [...prev.weekDays, day].sort((a, b) => a - b);
      return { ...prev, weekDays };
    });
  };

  const toggleMonthDay = (day) => {
    setScheduleConfig((prev) => {
      const monthDays = prev.monthDays.includes(day)
        ? prev.monthDays.filter((d) => d !== day)
        : [...prev.monthDays, day];
      return { ...prev, monthDays };
    });
  };

  const selectAllMonthDays = () => {
    const allDays = Array.from({ length: 31 }, (_, i) => i + 1);
    allDays.push('last');
    setScheduleConfig((prev) => ({ ...prev, monthDays: allDays }));
  };

  const selectNoMonthDays = () => {
    setScheduleConfig((prev) => ({ ...prev, monthDays: [] }));
  };

  const calculateBackupPlan = (config) => {
    const plan = [];
    const now = new Date();

    // Parse start time
    const [startHour, startMinute] = config.startTime.split(':').map(Number);

    // Start from next occurrence
    let currentDate = new Date(now);
    currentDate.setHours(startHour, startMinute, 0, 0);

    // If start time has passed today, start from tomorrow
    if (currentDate <= now) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const intervalMs = config.intervalUnit === 'hour'
      ? config.interval * 60 * 60 * 1000
      : config.interval * 60 * 1000;

    let attempts = 0;
    const maxAttempts = 10000; // Prevent infinite loops

    while (plan.length < 100 && attempts < maxAttempts) {
      attempts++;

      const dayOfWeek = currentDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      const dayOfMonth = currentDate.getDate();
      const isLastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate() === dayOfMonth;

      // Check if this date/time passes all filters
      let passes = true;

      // Check week days
      if (!config.weekDays.includes(dayOfWeek)) {
        passes = false;
      }

      // Check month days (if specified)
      if (config.monthDays.length > 0) {
        const matchesDay = config.monthDays.includes(dayOfMonth);
        const matchesLast = config.monthDays.includes('last') && isLastDayOfMonth;
        if (!matchesDay && !matchesLast) {
          passes = false;
        }
      }

      // Check run between hours
      if (config.runBetweenEnabled) {
        const [startH, startM] = config.runBetweenStart.split(':').map(Number);
        const [endH, endM] = config.runBetweenEnd.split(':').map(Number);
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
        plan.push({
          date: new Date(currentDate),
          type: 'Full',
        });
      }

      // Increment by interval
      currentDate = new Date(currentDate.getTime() + intervalMs);
    }

    setBackupPlan(plan);
  };

  const formatDateTime = (date) => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;

    return `${day}/${month}/${year} ${hour12}:${minutes} ${ampm}`;
  };

  const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekDayNamesFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <Grid container spacing={2}>
      {/* Sol taraf - Ayarlar */}
      <Grid item xs={12} md={6}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Frequency Settings */}
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Clock size={20} />
              <Typography variant="subtitle1" fontWeight="bold">
                Backup Frequency
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
              <Typography variant="body2">Every</Typography>
              <TextField
                type="number"
                size="small"
                value={scheduleConfig.interval}
                onChange={(e) => handleChange('interval', Math.max(1, parseInt(e.target.value) || 1))}
                inputProps={{ min: 1, max: 999 }}
                sx={{ width: 80 }}
              />
              <FormControl size="small" sx={{ minWidth: 80 }}>
                <Select
                  value={scheduleConfig.intervalUnit}
                  onChange={(e) => handleChange('intervalUnit', e.target.value)}
                >
                  <MenuItem value="hour">hr</MenuItem>
                  <MenuItem value="min">min</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
              <Typography variant="body2">Next start:</Typography>
              <TextField
                type="time"
                size="small"
                value={scheduleConfig.startTime}
                onChange={(e) => handleChange('startTime', e.target.value)}
                sx={{ width: 130 }}
              />
            </Box>

            {/* Run Between Hours */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <input
                type="checkbox"
                checked={scheduleConfig.runBetweenEnabled}
                onChange={(e) => handleChange('runBetweenEnabled', e.target.checked)}
              />
              <Typography variant="body2">Run between</Typography>
              <TextField
                type="time"
                size="small"
                value={scheduleConfig.runBetweenStart}
                onChange={(e) => handleChange('runBetweenStart', e.target.value)}
                disabled={!scheduleConfig.runBetweenEnabled}
                sx={{ width: 100 }}
              />
              <Typography variant="body2">—</Typography>
              <TextField
                type="time"
                size="small"
                value={scheduleConfig.runBetweenEnd}
                onChange={(e) => handleChange('runBetweenEnd', e.target.value)}
                disabled={!scheduleConfig.runBetweenEnabled}
                sx={{ width: 100 }}
              />
            </Box>
          </Paper>

          {/* Day Selection */}
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Calendar size={20} />
              <Typography variant="subtitle1" fontWeight="bold">
                Day Selection
              </Typography>
            </Box>

            {/* Week Days */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Run on:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {weekDayNames.map((day, index) => (
                  <Chip
                    key={index}
                    label={day}
                    onClick={() => toggleWeekDay(index)}
                    color={scheduleConfig.weekDays.includes(index) ? 'primary' : 'default'}
                    variant={scheduleConfig.weekDays.includes(index) ? 'filled' : 'outlined'}
                  />
                ))}
              </Box>
            </Box>

            {/* Month Days */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">Days of month:</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button size="small" onClick={selectAllMonthDays}>
                    all
                  </Button>
                  <Button size="small" onClick={selectNoMonthDays}>
                    none
                  </Button>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <Chip
                    key={day}
                    label={day.toString().padStart(2, '0')}
                    size="small"
                    onClick={() => toggleMonthDay(day)}
                    color={scheduleConfig.monthDays.includes(day) ? 'primary' : 'default'}
                    variant={scheduleConfig.monthDays.includes(day) ? 'filled' : 'outlined'}
                    sx={{ width: 40 }}
                  />
                ))}
                <Chip
                  label="Last"
                  size="small"
                  onClick={() => toggleMonthDay('last')}
                  color={scheduleConfig.monthDays.includes('last') ? 'primary' : 'default'}
                  variant={scheduleConfig.monthDays.includes('last') ? 'filled' : 'outlined'}
                />
              </Box>
              {scheduleConfig.monthDays.length === 0 && (
                <Alert severity="info" sx={{ mt: 1 }} icon={false}>
                  <Typography variant="caption">All days selected</Typography>
                </Alert>
              )}
            </Box>
          </Paper>
        </Box>
      </Grid>

      {/* Sağ taraf - Backup Plan Preview */}
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
            Estimated Backup Plan
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
            Time +03 (UTC+03) Istanbul
          </Typography>

          {backupPlan.length === 0 ? (
            <Alert severity="warning" icon={<AlertCircle size={20} />}>
              No backups will be scheduled with current settings. Please adjust your configuration.
            </Alert>
          ) : (
            <TableContainer sx={{ flexGrow: 1, maxHeight: 500 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Date & Time</TableCell>
                    <TableCell>Type</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {backupPlan.map((item, index) => (
                    <TableRow key={index} hover>
                      <TableCell>{formatDateTime(item.date)}</TableCell>
                      <TableCell>
                        <Chip label={item.type} size="small" color="primary" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Grid>
    </Grid>
  );
};

export default AdvancedScheduleBuilder;
