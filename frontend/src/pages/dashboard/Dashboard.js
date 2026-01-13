import { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  LinearProgress,
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Storage as StorageIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material';
import { getBackupStats } from '../../api/backup';

const COLORS = ['#4caf50', '#f44336', '#ff9800', '#2196f3', '#9c27b0'];

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await getBackupStats();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === '0') return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success':
        return 'success';
      case 'failed':
        return 'error';
      case 'running':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'success':
        return 'Başarılı';
      case 'failed':
        return 'Hatalı';
      case 'running':
        return 'Çalışıyor';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="body2">
                    Toplam Backup
                  </Typography>
                  <Typography variant="h4">{stats.total}</Typography>
                </Box>
                <AssessmentIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.5 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="body2">
                    Başarılı
                  </Typography>
                  <Typography variant="h4" color="success.main">
                    {stats.successful}
                  </Typography>
                </Box>
                <SuccessIcon sx={{ fontSize: 48, color: 'success.main', opacity: 0.5 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="body2">
                    Hatalı
                  </Typography>
                  <Typography variant="h4" color="error.main">
                    {stats.failed}
                  </Typography>
                </Box>
                <ErrorIcon sx={{ fontSize: 48, color: 'error.main', opacity: 0.5 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="body2">
                    Toplam Boyut
                  </Typography>
                  <Typography variant="h5">{formatBytes(stats.totalSize)}</Typography>
                </Box>
                <StorageIcon sx={{ fontSize: 48, color: 'info.main', opacity: 0.5 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Success Rate */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Başarı Oranı
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ flexGrow: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={stats.successRate}
                    sx={{ height: 10, borderRadius: 5 }}
                    color={stats.successRate > 80 ? 'success' : stats.successRate > 50 ? 'warning' : 'error'}
                  />
                </Box>
                <Typography variant="h6" color="textSecondary">
                  {stats.successRate}%
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Database Distribution */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Veritabanı Dağılımı
              </Typography>
              {stats.backupsByDatabase.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={stats.backupsByDatabase}
                      dataKey="count"
                      nameKey="databaseName"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry) => `${entry.databaseName}: ${entry.count}`}
                    >
                      {stats.backupsByDatabase.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Typography color="textSecondary">Henüz backup yok</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Trend Chart */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Son 7 Gün Backup Trendi
              </Typography>
              {stats.trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={stats.trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="successful"
                      stroke="#4caf50"
                      name="Başarılı"
                      strokeWidth={2}
                    />
                    <Line type="monotone" dataKey="failed" stroke="#f44336" name="Hatalı" strokeWidth={2} />
                    <Line type="monotone" dataKey="total" stroke="#2196f3" name="Toplam" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <Typography color="textSecondary">Henüz veri yok</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recent Backups */}
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Son Backuplar
              </Typography>
              {stats.recentBackups && stats.recentBackups.length > 0 ? (
                <TableContainer component={Paper} variant="outlined">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Veritabanı</TableCell>
                        <TableCell>Job</TableCell>
                        <TableCell>Durum</TableCell>
                        <TableCell>Dosya Adı</TableCell>
                        <TableCell>Boyut</TableCell>
                        <TableCell>Tarih</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {stats.recentBackups.map((backup) => (
                        <TableRow key={backup.id}>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2">{backup.database?.name}</Typography>
                              <Chip label={backup.database?.type} size="small" variant="outlined" />
                            </Box>
                          </TableCell>
                          <TableCell>{backup.backupJob?.name || '-'}</TableCell>
                          <TableCell>
                            <Chip
                              label={getStatusText(backup.status)}
                              color={getStatusColor(backup.status)}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                              {backup.fileName || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>{formatBytes(backup.fileSize)}</TableCell>
                          <TableCell>{formatDate(backup.startedAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography color="textSecondary">Henüz backup yok</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Dashboard;
