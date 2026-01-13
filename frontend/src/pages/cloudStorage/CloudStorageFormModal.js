import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Box,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import { X, HelpCircle } from 'lucide-react';
import Swal from 'sweetalert2';
import * as cloudStorageApi from '../../api/cloudStorage';

const CloudStorageFormModal = ({ open, onClose, storage, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    storageType: 's3',
    isActive: true,
    isDefault: false,

    // S3 fields
    s3Region: '',
    s3Bucket: '',
    s3AccessKeyId: '',
    s3SecretAccessKey: '',
    s3Endpoint: '',

    // Google Drive fields
    gdRefreshToken: '',
    gdFolderId: '',
  });

  const [loading, setLoading] = useState(false);

  // Global message listener for Google Drive OAuth popup
  useEffect(() => {
    const messageHandler = (event) => {
      console.log('=== Global message received ===');
      console.log('Event origin:', event.origin);
      console.log('Event data:', event.data);
      console.log('Event type:', event.data?.type);

      if (!event.data || !event.data.type) {
        console.log('Ignoring message: no data or type');
        return;
      }

      // Google Drive Auth Success
      if (event.data.type === 'GOOGLE_DRIVE_AUTH_SUCCESS') {
        console.log('✅ SUCCESS! Received refresh token:', event.data.refreshToken);
        console.log('✅ Setting form data with token...');
        Swal.close();

        setFormData((prev) => {
          const newData = {
            ...prev,
            gdRefreshToken: event.data.refreshToken,
          };
          console.log('✅ Form data updated:', newData);
          return newData;
        });

        Swal.fire({
          title: 'Başarılı!',
          text: 'Google Drive bağlantısı kuruldu. Artık formu kaydedebilirsiniz.',
          icon: 'success',
          timer: 3000,
          showConfirmButton: false,
        });
      }
      // Google Drive Auth Failed
      else if (event.data.type === 'GOOGLE_DRIVE_AUTH_FAILED') {
        console.log('❌ FAILED! Error:', event.data.error);
        Swal.close();
        Swal.fire({
          title: 'Yetkilendirme Başarısız',
          text: event.data.error || 'Bir hata oluştu',
          icon: 'error',
        });
      }
    };

    // Always add listener (not just when modal opens)
    console.log('🎯 Adding global message listener...');
    window.addEventListener('message', messageHandler);

    // Cleanup on unmount
    return () => {
      console.log('🎯 Removing global message listener...');
      window.removeEventListener('message', messageHandler);
    };
  }, []);

  useEffect(() => {
    if (storage) {
      setFormData({
        name: storage.name || '',
        storageType: storage.storageType || 's3',
        isActive: storage.isActive !== undefined ? storage.isActive : true,
        isDefault: storage.isDefault || false,

        s3Region: storage.s3Region || '',
        s3Bucket: storage.s3Bucket || '',
        s3AccessKeyId: storage.s3AccessKeyId || '',
        s3SecretAccessKey: storage.s3SecretAccessKey || '',
        s3Endpoint: storage.s3Endpoint || '',

        gdRefreshToken: storage.gdRefreshToken || '',
        gdFolderId: storage.gdFolderId || '',
      });
    } else {
      setFormData({
        name: '',
        storageType: 's3',
        isActive: true,
        isDefault: false,
        s3Region: 'eu-central-1',
        s3Bucket: '',
        s3AccessKeyId: '',
        s3SecretAccessKey: '',
        s3Endpoint: '',
        gdRefreshToken: '',
        gdFolderId: '',
      });
    }
  }, [storage, open]);

  const handleChange = (e) => {
    const { name, value, checked, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleGetGoogleDriveToken = async () => {
    try {
      const result = await cloudStorageApi.getGoogleDriveAuthUrl();
      if (result.authUrl) {
        // Open popup window
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        const popup = window.open(
          result.authUrl,
          'Google Drive Authorization',
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
        );

        if (!popup) {
          Swal.fire({
            title: 'Popup Engellendi',
            text: 'Lütfen popup engelleyiciyi devre dışı bırakın ve tekrar deneyin.',
            icon: 'warning',
          });
          return;
        }

        // Show loading message
        Swal.fire({
          title: 'Google Drive Yetkilendirme',
          html: '<p>Popup penceresinde Google hesabınızla giriş yapın ve izinleri onaylayın.</p><p style="margin-top: 10px; color: #666;">Popup penceresi otomatik olarak kapanacaktır.</p>',
          icon: 'info',
          showConfirmButton: false,
          allowOutsideClick: false,
        });
      }
    } catch (error) {
      Swal.fire('Hata', 'OAuth URL alınamadı', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validation
      if (!formData.name) {
        Swal.fire('Hata', 'Lütfen bir ad girin', 'error');
        setLoading(false);
        return;
      }

      if (formData.storageType === 's3') {
        if (!formData.s3Region || !formData.s3Bucket || !formData.s3AccessKeyId || !formData.s3SecretAccessKey) {
          Swal.fire('Hata', 'S3 için tüm alanları doldurun', 'error');
          setLoading(false);
          return;
        }
      } else if (formData.storageType === 'google_drive') {
        if (!formData.gdRefreshToken) {
          Swal.fire('Hata', 'Google Drive için refresh token gerekli', 'error');
          setLoading(false);
          return;
        }
      }

      if (storage) {
        await cloudStorageApi.updateCloudStorage(storage.id, formData);
        Swal.fire('Başarılı', 'Cloud storage güncellendi', 'success');
      } else {
        await cloudStorageApi.createCloudStorage(formData);
        Swal.fire('Başarılı', 'Cloud storage oluşturuldu', 'success');
      }

      onSuccess();
      onClose();
    } catch (error) {
      Swal.fire('Hata', error.response?.data?.message || 'İşlem başarısız', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {storage ? 'Cloud Storage Düzenle' : 'Yeni Cloud Storage'}
          <IconButton onClick={onClose} size="small">
            <X size={20} />
          </IconButton>
        </Box>
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Basic Info */}
            <TextField
              label="Konfigürasyon Adı"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              fullWidth
              helperText="Örn: Production S3, Google Drive Backup"
            />

            <FormControl fullWidth required>
              <InputLabel>Storage Tipi</InputLabel>
              <Select name="storageType" value={formData.storageType} onChange={handleChange} label="Storage Tipi">
                <MenuItem value="s3">AWS S3 (ve uyumlu servisler)</MenuItem>
                <MenuItem value="google_drive">Google Drive</MenuItem>
              </Select>
            </FormControl>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControlLabel
                control={<Checkbox name="isActive" checked={formData.isActive} onChange={handleChange} />}
                label="Aktif"
              />
              <FormControlLabel
                control={<Checkbox name="isDefault" checked={formData.isDefault} onChange={handleChange} />}
                label="Varsayılan Olarak Ayarla"
              />
            </Box>

            {/* S3 Configuration */}
            {formData.storageType === 's3' && (
              <>
                <Alert severity="info" sx={{ mt: 2 }}>
                  AWS S3, MinIO, DigitalOcean Spaces ve diğer S3-uyumlu servisler desteklenmektedir.
                  <br />
                  <strong>Not:</strong> Bilgileriniz şifrelenmiş olarak saklanacaktır.
                </Alert>

                <TextField
                  label="Access Key ID"
                  name="s3AccessKeyId"
                  value={formData.s3AccessKeyId}
                  onChange={handleChange}
                  required
                  fullWidth
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                  helperText="AWS IAM kullanıcınızın Access Key ID'si"
                />

                <TextField
                  label="Secret Access Key"
                  name="s3SecretAccessKey"
                  value={formData.s3SecretAccessKey}
                  onChange={handleChange}
                  type="password"
                  required
                  fullWidth
                  placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                  helperText="AWS IAM kullanıcınızın Secret Access Key'i"
                />

                <FormControl fullWidth required>
                  <InputLabel>Region</InputLabel>
                  <Select name="s3Region" value={formData.s3Region} onChange={handleChange} label="Region">
                    <MenuItem value="us-east-1">US East (N. Virginia) - us-east-1</MenuItem>
                    <MenuItem value="us-west-1">US West (N. California) - us-west-1</MenuItem>
                    <MenuItem value="us-west-2">US West (Oregon) - us-west-2</MenuItem>
                    <MenuItem value="eu-west-1">EU (Ireland) - eu-west-1</MenuItem>
                    <MenuItem value="eu-central-1">EU (Frankfurt) - eu-central-1</MenuItem>
                    <MenuItem value="eu-west-2">EU (London) - eu-west-2</MenuItem>
                    <MenuItem value="ap-southeast-1">Asia Pacific (Singapore) - ap-southeast-1</MenuItem>
                    <MenuItem value="ap-northeast-1">Asia Pacific (Tokyo) - ap-northeast-1</MenuItem>
                    <MenuItem value="ap-south-1">Asia Pacific (Mumbai) - ap-south-1</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  label="Bucket Name"
                  name="s3Bucket"
                  value={formData.s3Bucket}
                  onChange={handleChange}
                  required
                  fullWidth
                  placeholder="my-backup-bucket"
                  helperText="S3 bucket adınız"
                />

                <TextField
                  label="Custom Endpoint (Opsiyonel)"
                  name="s3Endpoint"
                  value={formData.s3Endpoint}
                  onChange={handleChange}
                  fullWidth
                  placeholder="https://s3.example.com"
                  helperText="MinIO, DigitalOcean Spaces vb. için endpoint URL"
                />
              </>
            )}

            {/* Google Drive Configuration */}
            {formData.storageType === 'google_drive' && (
              <>
                <Alert severity="info" sx={{ mt: 2 }}>
                  Google Drive kullanmak için OAuth yetkilendirmesi gereklidir.
                </Alert>

                <Box>
                  <Button
                    variant="contained"
                    color={formData.gdRefreshToken ? 'success' : 'primary'}
                    onClick={handleGetGoogleDriveToken}
                    fullWidth
                    sx={{ mb: 2 }}
                  >
                    {formData.gdRefreshToken ? '✓ Google Drive Bağlı' : 'Google Drive\'a Bağlan'}
                  </Button>

                  {formData.gdRefreshToken && (
                    <Alert severity="success" sx={{ mb: 2 }}>
                      Google Drive hesabınız başarıyla bağlandı!
                    </Alert>
                  )}

                  {/* Hidden field for refresh token */}
                  <input type="hidden" name="gdRefreshToken" value={formData.gdRefreshToken} />
                </Box>

                <TextField
                  label="Folder ID (Opsiyonel)"
                  name="gdFolderId"
                  value={formData.gdFolderId}
                  onChange={handleChange}
                  fullWidth
                  helperText="Belirli bir klasöre yedek almak için folder ID girin. Boş bırakılırsa root'a kaydedilir."
                />

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                  <HelpCircle size={16} color="#666" />
                  <small style={{ color: '#666' }}>
                    Folder ID için: Google Drive'da klasöre gidin, URL'deki{' '}
                    <code>/folders/[FOLDER_ID]</code> kısmını kopyalayın.
                  </small>
                </Box>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>
            İptal
          </Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? 'Kaydediliyor...' : storage ? 'Güncelle' : 'Oluştur'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default CloudStorageFormModal;
