import React, { useState, useEffect, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Box, Button, Chip } from '@mui/material';
import { Cloud, Plus, RefreshCw, Trash2, Edit, TestTube, Star, FileText } from 'lucide-react';
import Swal from 'sweetalert2';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import * as cloudStorageApi from '../../api/cloudStorage';
import CloudStorageFormModal from './CloudStorageFormModal';

const CloudStorageList = () => {
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedStorage, setSelectedStorage] = useState(null);

  const loadCloudStorages = async () => {
    setLoading(true);
    try {
      const data = await cloudStorageApi.getCloudStorages();
      setRowData(data);
    } catch (error) {
      Swal.fire('Hata', 'Cloud storage konfigürasyonları yüklenirken hata oluştu', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCloudStorages();
  }, []);

  const handleTestConnection = async (id, name) => {
    try {
      const result = await cloudStorageApi.testConnection(id);
      if (result.success) {
        Swal.fire(
          'Başarılı',
          `${name} bağlantısı başarılı! ${result.user ? `User: ${result.user}` : ''}`,
          'success'
        );
      } else {
        Swal.fire('Hata', `Bağlantı başarısız: ${result.message}`, 'error');
      }
    } catch (error) {
      Swal.fire('Hata', 'Bağlantı testi başarısız', 'error');
    }
  };

  const handleSetAsDefault = async (id, name) => {
    try {
      await cloudStorageApi.setAsDefault(id);
      Swal.fire('Başarılı', `${name} varsayılan olarak ayarlandı`, 'success');
      loadCloudStorages();
    } catch (error) {
      Swal.fire('Hata', 'Varsayılan ayarlama başarısız', 'error');
    }
  };

  const handleListFiles = async (id, name) => {
    try {
      const result = await cloudStorageApi.listFiles(id);
      if (result.success) {
        const fileList = result.backups || [];
        const html = `
          <div style="text-align: left; max-height: 400px; overflow-y: auto;">
            <p><strong>Toplam Dosya:</strong> ${result.count || 0}</p>
            ${
              fileList.length > 0
                ? `<ul style="list-style: none; padding: 0;">
                ${fileList
                  .map(
                    (file) => `
                  <li style="padding: 8px; border-bottom: 1px solid #eee;">
                    <strong>${file.name || file.key || 'Unknown'}</strong><br/>
                    <small>Boyut: ${formatBytes(file.size || file.Size || 0)}</small><br/>
                    <small>Tarih: ${new Date(file.createdTime || file.lastModified || file.LastModified).toLocaleString('tr-TR')}</small>
                  </li>
                `
                  )
                  .join('')}
              </ul>`
                : '<p>Hiç dosya bulunamadı.</p>'
            }
          </div>
        `;
        Swal.fire({
          title: `${name} - Dosyalar`,
          html,
          width: 600,
        });
      } else {
        Swal.fire('Hata', `Dosyalar listelenemedi: ${result.error}`, 'error');
      }
    } catch (error) {
      Swal.fire('Hata', 'Dosya listesi alınamadı', 'error');
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleEdit = (storage) => {
    setSelectedStorage(storage);
    setModalOpen(true);
  };

  const handleDelete = async (id, name) => {
    const result = await Swal.fire({
      title: 'Emin misiniz?',
      text: `"${name}" cloud storage konfigürasyonu silinecek. Bu işlem geri alınamaz.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Evet, sil',
      cancelButtonText: 'İptal',
    });

    if (result.isConfirmed) {
      try {
        await cloudStorageApi.deleteCloudStorage(id);
        Swal.fire('Silindi!', 'Cloud storage konfigürasyonu silindi.', 'success');
        loadCloudStorages();
      } catch (error) {
        Swal.fire('Hata', 'Silme işlemi başarısız', 'error');
      }
    }
  };

  const columnDefs = useMemo(
    () => [
      {
        headerName: 'Ad',
        field: 'name',
        filter: true,
        flex: 1,
        minWidth: 150,
      },
      {
        headerName: 'Tip',
        field: 'storageType',
        filter: true,
        width: 140,
        cellRenderer: (params) => {
          const colors = {
            s3: '#FF9900',
            google_drive: '#4285F4',
            azure: '#0078D4',
            ftp: '#666',
          };
          const labels = {
            s3: 'AWS S3',
            google_drive: 'Google Drive',
            azure: 'Azure Blob',
            ftp: 'FTP',
          };
          return (
            <Chip
              label={labels[params.value] || params.value?.toUpperCase()}
              size="small"
              style={{
                backgroundColor: colors[params.value] || '#666',
                color: 'white',
                fontWeight: 'bold',
              }}
            />
          );
        },
      },
      {
        headerName: 'S3 Bucket / Folder',
        field: 'details',
        flex: 1,
        minWidth: 150,
        valueGetter: (params) => {
          if (params.data.storageType === 's3') {
            return params.data.s3Bucket || '-';
          } else if (params.data.storageType === 'google_drive') {
            return params.data.gdFolderId || 'Root';
          }
          return '-';
        },
      },
      {
        headerName: 'Region / Email',
        field: 'extra',
        flex: 1,
        minWidth: 150,
        valueGetter: (params) => {
          if (params.data.storageType === 's3') {
            return params.data.s3Region || '-';
          }
          return '-';
        },
      },
      {
        headerName: 'Durum',
        field: 'isActive',
        width: 100,
        cellRenderer: (params) => {
          return (
            <Chip
              label={params.value ? 'Aktif' : 'Pasif'}
              size="small"
              color={params.value ? 'success' : 'default'}
            />
          );
        },
      },
      {
        headerName: 'Varsayılan',
        field: 'isDefault',
        width: 110,
        cellRenderer: (params) => {
          return params.value ? (
            <Chip icon={<Star size={14} />} label="Varsayılan" size="small" color="warning" />
          ) : null;
        },
      },
      {
        headerName: 'İşlemler',
        width: 300,
        cellRenderer: (params) => {
          return (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', height: '100%' }}>
              <Button
                size="small"
                variant="outlined"
                color="info"
                onClick={() => handleTestConnection(params.data.id, params.data.name)}
                title="Bağlantıyı Test Et"
              >
                <TestTube size={16} />
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="secondary"
                onClick={() => handleListFiles(params.data.id, params.data.name)}
                title="Dosyaları Listele"
              >
                <FileText size={16} />
              </Button>
              {!params.data.isDefault && (
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  onClick={() => handleSetAsDefault(params.data.id, params.data.name)}
                  title="Varsayılan Yap"
                >
                  <Star size={16} />
                </Button>
              )}
              <Button
                size="small"
                variant="outlined"
                color="primary"
                onClick={() => handleEdit(params.data)}
                title="Düzenle"
              >
                <Edit size={16} />
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={() => handleDelete(params.data.id, params.data.name)}
                title="Sil"
              >
                <Trash2 size={16} />
              </Button>
            </Box>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Cloud size={32} />
          <h2>Cloud Storage Yönetimi</h2>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshCw size={18} />}
            onClick={loadCloudStorages}
            disabled={loading}
          >
            Yenile
          </Button>
          <Button
            variant="contained"
            startIcon={<Plus size={18} />}
            onClick={() => {
              setSelectedStorage(null);
              setModalOpen(true);
            }}
          >
            Yeni Cloud Storage
          </Button>
        </Box>
      </Box>

      <div className="ag-theme-alpine" style={{ height: 500, width: '100%' }}>
        <AgGridReact
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={{
            sortable: true,
            resizable: true,
          }}
          pagination={true}
          paginationPageSize={20}
          loading={loading}
        />
      </div>

      <CloudStorageFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedStorage(null);
        }}
        storage={selectedStorage}
        onSuccess={loadCloudStorages}
      />
    </Box>
  );
};

export default CloudStorageList;
