import React, { useState, useEffect, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Box, Button, Chip } from '@mui/material';
import { Calendar, Plus, RefreshCw, Trash2, Edit, Play, Pause, History } from 'lucide-react';
import Swal from 'sweetalert2';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import * as backupApi from '../../api/backup';
import moment from 'moment';

const BackupJobsList = () => {
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadBackupJobs = async () => {
    setLoading(true);
    try {
      const data = await backupApi.getBackupJobs();
      setRowData(data);
    } catch (error) {
      Swal.fire('Hata', 'Backup job\'ları yüklenirken hata oluştu', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackupJobs();
  }, []);

  const handleRunBackup = async (jobId, jobName) => {
    const result = await Swal.fire({
      title: 'Manuel Backup',
      text: `"${jobName}" job'unu şimdi çalıştırmak istiyor musunuz?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Evet, Çalıştır',
      cancelButtonText: 'İptal',
    });

    if (result.isConfirmed) {
      try {
        Swal.fire({
          title: 'Backup Alınıyor...',
          text: 'Lütfen bekleyin',
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        const response = await backupApi.runBackupJob(jobId);

        Swal.fire({
          title: 'Backup Başlatıldı!',
          html: `
            <p>Backup işlemi agent'a gönderildi ve başlatıldı.</p>
            <p style="margin-top: 15px;">Backup durumunu takip etmek için <strong>Backup History</strong> sayfasına gidin.</p>
            <p style="color: #666; font-size: 14px; margin-top: 10px;">İşlem tamamlandığında history sayfasını yenileyerek sonucu görebilirsiniz.</p>
          `,
          icon: 'info',
        });

        loadBackupJobs();
      } catch (error) {
        const errorMessage = error.response?.data?.message || 'Backup alınırken hata oluştu';
        Swal.fire('Hata', errorMessage, 'error');
      }
    }
  };

  const handleToggleActive = async (jobId, currentStatus, jobName) => {
    const action = currentStatus ? 'durdurmak' : 'aktif etmek';
    const result = await Swal.fire({
      title: 'Emin misiniz?',
      text: `"${jobName}" job'unu ${action} istiyor musunuz?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: `Evet, ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      cancelButtonText: 'İptal',
    });

    if (result.isConfirmed) {
      try {
        await backupApi.updateBackupJob(jobId, { isActive: !currentStatus });
        Swal.fire('Başarılı', `Job ${!currentStatus ? 'aktif edildi' : 'durduruldu'}`, 'success');
        loadBackupJobs();
      } catch (error) {
        Swal.fire('Hata', 'İşlem başarısız', 'error');
      }
    }
  };

  const handleDelete = async (jobId, jobName) => {
    const result = await Swal.fire({
      title: 'Emin misiniz?',
      text: `"${jobName}" job'u silinecek. Bu işlem geri alınamaz.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Evet, sil',
      cancelButtonText: 'İptal',
    });

    if (result.isConfirmed) {
      try {
        await backupApi.deleteBackupJob(jobId);
        Swal.fire('Silindi!', 'Backup job silindi.', 'success');
        loadBackupJobs();
      } catch (error) {
        Swal.fire('Hata', 'Silme işlemi başarısız', 'error');
      }
    }
  };

  const scheduleTypeLabels = {
    manual: 'Manuel',
    hourly: 'Saatlik',
    daily: 'Günlük',
    weekly: 'Haftalık',
    monthly: 'Aylık',
    custom: 'Özel',
  };

  const storageTypeLabels = {
    local: 'Yerel',
    s3: 'AWS S3',
    ftp: 'FTP',
    azure: 'Azure',
  };

  const columnDefs = useMemo(() => [
    {
      headerName: 'Job Adı',
      field: 'name',
      filter: true,
      flex: 1,
      minWidth: 200,
    },
    {
      headerName: 'Veritabanı',
      field: 'database.database',
      filter: true,
      flex: 1,
      minWidth: 180,
      valueGetter: (params) => {
        const db = params.data?.database;
        if (!db) return 'N/A';
        // Show actual database name, with connection name in parentheses if different
        const actualDb = db.database || db.name;
        const connectionName = db.name;
        if (actualDb !== connectionName) {
          return `${actualDb} (${connectionName})`;
        }
        return actualDb;
      },
    },
    {
      headerName: 'Tip',
      field: 'database.type',
      width: 100,
      valueGetter: (params) => params.data?.database?.type?.toUpperCase() || 'N/A',
      cellRenderer: (params) => {
        const colors = {
          POSTGRESQL: '#336791',
          MYSQL: '#00758F',
          MONGODB: '#4DB33D',
          MSSQL: '#CC2927',
        };
        return (
          <Chip
            label={params.value}
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
      headerName: 'Zamanlama',
      field: 'scheduleType',
      filter: true,
      width: 120,
      valueGetter: (params) => scheduleTypeLabels[params.data?.scheduleType] || params.data?.scheduleType,
    },
    {
      headerName: 'Depolama',
      field: 'storageType',
      width: 100,
      valueGetter: (params) => storageTypeLabels[params.data?.storageType] || params.data?.storageType,
    },
    {
      headerName: 'Son Çalışma',
      field: 'lastRunAt',
      width: 150,
      valueGetter: (params) =>
        params.data?.lastRunAt ? moment(params.data.lastRunAt).format('DD.MM.YYYY HH:mm') : 'Henüz çalışmadı',
    },
    {
      headerName: 'Sonraki Çalışma',
      field: 'nextRunAt',
      width: 150,
      valueGetter: (params) =>
        params.data?.nextRunAt ? moment(params.data.nextRunAt).format('DD.MM.YYYY HH:mm') : '-',
    },
    {
      headerName: 'Durum',
      field: 'isActive',
      width: 100,
      cellRenderer: (params) => {
        return (
          <Chip label={params.value ? 'Aktif' : 'Pasif'} size="small" color={params.value ? 'success' : 'default'} />
        );
      },
    },
    {
      headerName: 'İşlemler',
      width: 200,
      cellRenderer: (params) => {
        return (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', height: '100%' }}>
            <Button
              size="small"
              variant="outlined"
              color="success"
              onClick={() => handleRunBackup(params.data.id, params.data.name)}
              title="Manuel Çalıştır"
            >
              <Play size={16} />
            </Button>
            <Button
              size="small"
              variant="outlined"
              color={params.data.isActive ? 'warning' : 'info'}
              onClick={() => handleToggleActive(params.data.id, params.data.isActive, params.data.name)}
              title={params.data.isActive ? 'Durdur' : 'Aktif Et'}
            >
              {params.data.isActive ? <Pause size={16} /> : <Play size={16} />}
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
  ], []);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Calendar size={32} />
          <h2>Backup Jobs</h2>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button variant="outlined" startIcon={<RefreshCw size={18} />} onClick={loadBackupJobs} disabled={loading}>
            Yenile
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
    </Box>
  );
};

export default BackupJobsList;
