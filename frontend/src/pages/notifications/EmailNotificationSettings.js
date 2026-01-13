import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Grid,
  Alert,
  CircularProgress,
  Divider,
} from '@mui/material';
import {
  Email as EmailIcon,
  Send as SendIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { getNotificationSettings, updateNotificationSettings, testEmail } from '../../api/notification';

function EmailNotificationSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [alert, setAlert] = useState({ show: false, type: 'success', message: '' });

  const [settings, setSettings] = useState({
    emailEnabled: true,
    recipientEmail: '',
    notifyOnSuccess: true,
    notifyOnFailure: true,
    isActive: true,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await getNotificationSettings();
      setSettings(data);
    } catch (error) {
      showAlert('error', 'Ayarlar yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateNotificationSettings(settings);
      showAlert('success', 'Ayarlar başarıyla kaydedildi!');
    } catch (error) {
      showAlert('error', error.response?.data?.message || 'Ayarlar kaydedilirken hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    try {
      setTestingEmail(true);
      const result = await testEmail();
      showAlert('success', result.message || 'Test emaili başarıyla gönderildi!');
    } catch (error) {
      showAlert('error', error.response?.data?.message || 'Test emaili gönderilemedi');
    } finally {
      setTestingEmail(false);
    }
  };

  const showAlert = (type, message) => {
    setAlert({ show: true, type, message });
    setTimeout(() => {
      setAlert({ show: false, type: 'success', message: '' });
    }, 5000);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <EmailIcon /> Email Bildirim Ayarları
      </Typography>

      {alert.show && (
        <Alert severity={alert.type} sx={{ mb: 3 }} onClose={() => setAlert({ ...alert, show: false })}>
          {alert.message}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Email Notification Settings */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Email Bildirim Ayarları
              </Typography>

              <FormControlLabel
                control={<Switch checked={settings.emailEnabled} onChange={handleChange('emailEnabled')} />}
                label="Email bildirimlerini aktifleştir"
                sx={{ mb: 2, display: 'block' }}
              />

              <FormControlLabel
                control={<Switch checked={settings.notifyOnSuccess} onChange={handleChange('notifyOnSuccess')} />}
                label="Başarılı backup'larda bildir"
                sx={{ mb: 2, display: 'block' }}
              />

              <FormControlLabel
                control={<Switch checked={settings.notifyOnFailure} onChange={handleChange('notifyOnFailure')} />}
                label="Hatalı backup'larda bildir"
                sx={{ mb: 3, display: 'block' }}
              />

              <Divider sx={{ my: 2 }} />

              <TextField
                fullWidth
                label="Alıcı Email Adresi"
                value={settings.recipientEmail || ''}
                onChange={handleChange('recipientEmail')}
                placeholder="ornek@email.com"
                helperText="Bildirimlerin gönderileceği email adresi"
                required
                sx={{ mb: 2 }}
              />

              <Alert severity="info" sx={{ mt: 2 }}>
                📧 Sistem maili: <strong>{process.env.REACT_APP_SYSTEM_EMAIL || 'yguclu017@gmail.com'}</strong>
                <br />
                Bildirimler bu adresten gönderilecektir.
              </Alert>
            </CardContent>
          </Card>
        </Grid>

        {/* Actions */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  startIcon={testingEmail ? <CircularProgress size={20} /> : <SendIcon />}
                  onClick={handleTestEmail}
                  disabled={testingEmail || !settings.recipientEmail}
                >
                  Test Emaili Gönder
                </Button>
                <Button
                  variant="contained"
                  startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
                  onClick={handleSave}
                  disabled={saving}
                >
                  Kaydet
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

    </Box>
  );
}

export default EmailNotificationSettings;
