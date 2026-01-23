import React, { useState, useEffect, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Box, Button, Chip, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { History, RefreshCw, Download, Trash2, RotateCcw, CheckCircle, FileText } from 'lucide-react';
import Swal from 'sweetalert2';
import moment from 'moment';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import * as backupApi from '../../api/backup';
import * as databaseApi from '../../api/database';
import websocketService from '../../services/websocket.service';

const BackupHistoryList = () => {
  const [rowData, setRowData] = useState([]);
  const [databases, setDatabases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    databaseId: '',
    status: '',
  });

  const loadBackupHistory = async () => {
    setLoading(true);
    try {
      const data = await backupApi.getBackupHistory(filters);
      setRowData(data.results || data);
    } catch (error) {
      Swal.fire('Hata', 'Yedekleme geçmişi yüklenirken hata oluştu', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadDatabases = async () => {
    try {
      const data = await databaseApi.getDatabases();
      setDatabases(data);
    } catch (error) {
      console.error('Veritabanları yüklenemedi:', error);
    }
  };

  useEffect(() => {
    loadDatabases();
    loadBackupHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadBackupHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.databaseId, filters.status]);

  // WebSocket listener for instant updates (when restore completes)
  useEffect(() => {
    const handleRestoreUpdate = () => {
      loadBackupHistory(); // Silently refresh data
    };

    websocketService.on('restore:completed', handleRestoreUpdate);
    websocketService.on('restore:failed', handleRestoreUpdate);

    return () => {
      websocketService.off('restore:completed', handleRestoreUpdate);
      websocketService.off('restore:failed', handleRestoreUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = async (historyId, fileName) => {
    try {
      Swal.fire({
        title: 'İndiriliyor...',
        text: 'Lütfen bekleyin',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      const blob = await backupApi.downloadBackup(historyId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      Swal.fire('Başarılı', 'Backup dosyası indirildi', 'success');
    } catch (error) {
      Swal.fire('Hata', 'Dosya indirilemedi', 'error');
    }
  };

  const handleRestore = async (historyId, fileName, databaseName) => {
    const result = await Swal.fire({
      title: 'Veritabanını Geri Yükle',
      html: `
        <p><strong>"${fileName}"</strong> dosyası <strong>"${databaseName}"</strong> veritabanına geri yüklenecek.</p>
        <p style="color: #d33; font-weight: bold; margin-top: 15px;">
          ⚠️ UYARI: Mevcut veritabanı verisi silinecek ve yedeğiyle değiştirilecektir!
        </p>
        <p style="margin-top: 10px;">Bu işlem geri alınamaz. Devam etmek istediğinizden emin misiniz?</p>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Evet, Geri Yükle',
      cancelButtonText: 'İptal',
    });

    if (result.isConfirmed) {
      try {
        // Initiate restore (backend will send to agent)
        await backupApi.restoreBackup(historyId);

        Swal.fire({
          title: 'Restore Başlatıldı!',
          html: `
            <p>Veritabanı geri yükleme işlemi başlatıldı.</p>
            <p><strong>"Son Restore Durumu"</strong> kolonundan ilerlemeyi takip edebilirsiniz.</p>
            <p style="margin-top: 10px; color: #666;">Durumu görmek için <strong>Yenile</strong> butonuna basın.</p>
          `,
          icon: 'info',
          timer: 3000,
          timerProgressBar: true,
        });

        // Immediate refresh to show "running" status
        setTimeout(() => loadBackupHistory(), 1500);

      } catch (error) {
        Swal.fire({
          title: 'Hata',
          text: error.response?.data?.message || 'Geri yükleme isteği gönderilemedi',
          icon: 'error',
        });
      }
    }
  };

  const handleDelete = async (historyId, fileName) => {
    const result = await Swal.fire({
      title: 'Emin misiniz?',
      text: `"${fileName}" yedek dosyası silinecek. Bu işlem geri alınamaz.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Evet, sil',
      cancelButtonText: 'İptal',
    });

    if (result.isConfirmed) {
      try {
        await backupApi.deleteBackup(historyId);
        Swal.fire('Silindi!', 'Yedek dosyası silindi.', 'success');
        loadBackupHistory();
      } catch (error) {
        Swal.fire('Hata', 'Silme işlemi başarısız', 'error');
      }
    }
  };

  const handleShowRestoreHistory = (restoreHistory, fileName) => {
    if (!restoreHistory || restoreHistory.length === 0) {
      Swal.fire({
        title: 'Restore Geçmişi',
        text: 'Bu backup için restore geçmişi bulunmuyor.',
        icon: 'info',
      });
      return;
    }

    const formatDurationForModal = (ms) => {
      if (!ms) return '-';
      const seconds = Math.round(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      if (hours > 0) {
        return `${hours}s ${minutes % 60}dk`;
      } else if (minutes > 0) {
        return `${minutes}dk ${seconds % 60}sn`;
      } else {
        return `${seconds}sn`;
      }
    };

    const tableRows = restoreHistory.map((restore) => {
      const statusConfig = {
        running: { label: '⏳ Çalışıyor', color: '#ff9800' },
        success: { label: '✅ Başarılı', color: '#4caf50' },
        failed: { label: '❌ Başarısız', color: '#f44336' },
      };
      const config = statusConfig[restore.status] || { label: restore.status, color: '#999' };

      return `
        <tr style="background-color: ${restore.id % 2 === 0 ? '#fff' : '#fafafa'};">
          <td style="padding: 8px; border: 1px solid #ddd; color: ${config.color}; font-weight: bold;">
            ${config.label}
          </td>
          <td style="padding: 8px; border: 1px solid #ddd;">
            ${moment(restore.startedAt).format('DD.MM.YYYY HH:mm:ss')}
          </td>
          <td style="padding: 8px; border: 1px solid #ddd;">
            ${restore.completedAt ? moment(restore.completedAt).format('DD.MM.YYYY HH:mm:ss') : '-'}
          </td>
          <td style="padding: 8px; border: 1px solid #ddd;">
            ${formatDurationForModal(restore.duration)}
          </td>
          <td style="padding: 8px; border: 1px solid #ddd; color: #f44336; font-size: 12px; max-width: 200px; overflow: hidden; text-overflow: ellipsis;">
            ${restore.errorMessage || '-'}
          </td>
        </tr>
      `;
    }).join('');

    Swal.fire({
      title: `📋 Restore Geçmişi`,
      html: `
        <div style="text-align: left; margin-bottom: 15px;">
          <strong>Dosya:</strong> ${fileName}<br/>
          <strong>Toplam Restore:</strong> ${restoreHistory.length}
        </div>
        <div style="max-height: 400px; overflow-y: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background-color: #e0e0e0; position: sticky; top: 0;">
                <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Durum</th>
                <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Başlangıç</th>
                <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Bitiş</th>
                <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Süre</th>
                <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Hata</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      `,
      width: '800px',
      confirmButtonText: 'Kapat',
    });
  };

  const handleVerify = async (historyId, fileName) => {
    // Setup WebSocket event listeners
    const handleVerificationStarted = (data) => {
      if (data.historyId === historyId || data.backupId === historyId) {
        console.log('🔍 Verification started:', data);
        // Keep loading modal
      }
    };

    // Progress handler removed - no need for real-time updates

    const handleVerificationCompleted = (data) => {
      if (data.historyId === historyId || data.backupId === historyId) {
        console.log('✅ Verification completed:', data);

        // Unsubscribe from events
        websocketService.off('verification:started', handleVerificationStarted);
        websocketService.off('verification:completed', handleVerificationCompleted);
        websocketService.off('verification:failed', handleVerificationFailed);

        const result = data.verificationResult || {};
        const passed = result.checks?.filter((c) => c.passed).length || 0;
        const failed = result.checks?.filter((c) => c.passed === false).length || 0;
        const total = result.checks?.length || 0;

        if (result.overallStatus === 'PASSED') {
          Swal.fire({
            title: 'Doğrulama Başarılı!',
            html: `
              <p><strong>"${fileName}"</strong> dosyası başarıyla doğrulandı.</p>
              <div style="margin-top: 15px; text-align: left; padding: 10px; background: #f0f0f0; border-radius: 5px;">
                <p><strong>Sonuç:</strong> ${passed}/${total} kontrol başarılı</p>
                ${result.checks
                  ?.map(
                    (check) =>
                      `<p style="margin: 5px 0;">
                        ${check.passed ? '✅' : '❌'} ${check.check}: ${check.message || check.error || 'OK'}
                      </p>`
                  )
                  .join('') || ''}
              </div>
            `,
            icon: 'success',
          });
        } else {
          Swal.fire({
            title: 'Doğrulama Başarısız',
            html: `
              <p style="color: #d33;"><strong>"${fileName}"</strong> dosyasında sorunlar tespit edildi.</p>
              <div style="margin-top: 15px; text-align: left; padding: 10px; background: #fff3cd; border-radius: 5px;">
                <p><strong>Sonuç:</strong> ${passed}/${total} kontrol başarılı, ${failed} başarısız</p>
                ${result.checks
                  ?.map(
                    (check) =>
                      `<p style="margin: 5px 0;">
                        ${check.passed ? '✅' : '❌'} ${check.check}: ${check.message || check.error || 'OK'}
                      </p>`
                  )
                  .join('') || ''}
              </div>
            `,
            icon: 'error',
          });
        }

        loadBackupHistory();
      }
    };

    const handleVerificationFailed = (data) => {
      if (data.historyId === historyId || data.backupId === historyId) {
        console.error('❌ Verification failed:', data);

        // Unsubscribe from events
        websocketService.off('verification:started', handleVerificationStarted);
        websocketService.off('verification:completed', handleVerificationCompleted);
        websocketService.off('verification:failed', handleVerificationFailed);

        Swal.fire({
          title: 'Hata',
          text: data.error || 'Doğrulama işlemi başarısız',
          icon: 'error',
        });

        loadBackupHistory();
      }
    };

    // Subscribe to WebSocket events
    websocketService.on('verification:started', handleVerificationStarted);
    websocketService.on('verification:completed', handleVerificationCompleted);
    websocketService.on('verification:failed', handleVerificationFailed);

    try {
      // Show simple loading modal (no progress bar)
      Swal.fire({
        title: 'Doğrulanıyor...',
        html: '<p>Backup dosyası doğrulanıyor. Bu işlem birkaç dakika sürebilir.</p>',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      // Initiate verification (backend will send to agent)
      await backupApi.verifyBackup(historyId, 'BASIC');

      // Don't close modal - wait for WebSocket events
      console.log('✅ Verification request sent to agent, waiting for progress updates...');

    } catch (error) {
      // Unsubscribe from events on error
      websocketService.off('verification:started', handleVerificationStarted);
      websocketService.off('verification:completed', handleVerificationCompleted);
      websocketService.off('verification:failed', handleVerificationFailed);

      Swal.fire({
        title: 'Hata',
        text: error.response?.data?.message || 'Doğrulama isteği gönderilemedi',
        icon: 'error',
      });
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === '0') return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const columnDefs = useMemo(
    () => [
      {
        headerName: 'Dosya Adı',
        field: 'fileName',
        filter: true,
        flex: 1,
        minWidth: 250,
      },
      {
        headerName: 'Veritabanı',
        field: 'database.database',
        filter: true,
        width: 180,
        valueGetter: (params) => {
          const db = params.data?.database;
          if (!db) return 'N/A';
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
        headerName: 'Job',
        field: 'backupJob.name',
        filter: true,
        width: 150,
        valueGetter: (params) => params.data?.backupJob?.name || 'Manuel',
      },
      {
        headerName: 'Backup Durumu',
        field: 'status',
        width: 140,
        cellRenderer: (params) => {
          const statusColors = {
            success: 'success',
            failed: 'error',
            running: 'warning',
            skipped: 'default',
          };
          const statusLabels = {
            success: 'Başarılı',
            failed: 'Hata',
            running: 'Çalışıyor',
            skipped: 'Atlandı',
          };
          return (
            <Chip
              label={statusLabels[params.value] || params.value}
              size="small"
              color={statusColors[params.value] || 'default'}
            />
          );
        },
      },
      {
        headerName: 'Son Restore Durumu',
        field: 'lastRestoreStatus',
        width: 170,
        cellRenderer: (params) => {
          const status = params.data?.lastRestoreStatus;
          if (!status) {
            return <Chip label="-" size="small" variant="outlined" />;
          }
          const statusColors = {
            success: 'success',
            failed: 'error',
            running: 'warning',
          };
          const statusLabels = {
            success: '✅ Başarılı',
            failed: '❌ Başarısız',
            running: '⏳ Çalışıyor',
          };
          return (
            <Chip
              label={statusLabels[status] || status}
              size="small"
              color={statusColors[status] || 'default'}
            />
          );
        },
      },
      {
        headerName: 'Boyut',
        field: 'fileSize',
        width: 100,
        valueGetter: (params) => formatFileSize(params.data?.fileSize),
      },
      {
        headerName: 'Süre',
        field: 'duration',
        width: 80,
        valueGetter: (params) => formatDuration(params.data?.duration),
      },
      {
        headerName: 'Başlangıç',
        field: 'startedAt',
        width: 150,
        valueGetter: (params) =>
          params.data?.startedAt ? moment(params.data.startedAt).format('DD.MM.YYYY HH:mm') : 'N/A',
      },
      {
        headerName: 'Bitiş',
        field: 'completedAt',
        width: 150,
        valueGetter: (params) =>
          params.data?.completedAt ? moment(params.data.completedAt).format('DD.MM.YYYY HH:mm') : '-',
      },
      {
        headerName: 'İşlemler',
        width: 300,
        cellRenderer: (params) => {
          const isSuccess = params.data.status === 'success';
          const hasRestoreHistory = params.data.restoreHistory && params.data.restoreHistory.length > 0;
          return (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', height: '100%' }}>
              <Button
                size="small"
                variant="outlined"
                color="secondary"
                onClick={() => handleShowRestoreHistory(params.data.restoreHistory, params.data.fileName)}
                title="Restore Geçmişi"
                disabled={!hasRestoreHistory}
              >
                <FileText size={16} />
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="info"
                onClick={() => handleVerify(params.data.id, params.data.fileName)}
                title="Doğrula"
                disabled={!isSuccess}
              >
                <CheckCircle size={16} />
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="success"
                onClick={() =>
                  handleRestore(params.data.id, params.data.fileName, params.data.database?.name)
                }
                title="Geri Yükle"
                disabled={!isSuccess}
              >
                <RotateCcw size={16} />
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="primary"
                onClick={() => handleDownload(params.data.id, params.data.fileName)}
                title="İndir"
                disabled={!isSuccess}
              >
                <Download size={16} />
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={() => handleDelete(params.data.id, params.data.fileName)}
                title="Sil"
              >
                <Trash2 size={16} />
              </Button>
            </Box>
          );
        },
      },
    ],
    []
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <History size={32} />
          <h2>Yedekleme Geçmişi</h2>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button variant="outlined" startIcon={<RefreshCw size={18} />} onClick={loadBackupHistory} disabled={loading}>
            Yenile
          </Button>
        </Box>
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Veritabanı</InputLabel>
          <Select
            value={filters.databaseId}
            onChange={(e) => setFilters({ ...filters, databaseId: e.target.value })}
            label="Veritabanı"
          >
            <MenuItem value="">Tümü</MenuItem>
            {databases.map((db) => (
              <MenuItem key={db.id} value={db.id}>
                {db.name} ({db.type})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 150 }}>
          <InputLabel>Durum</InputLabel>
          <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} label="Durum">
            <MenuItem value="">Tümü</MenuItem>
            <MenuItem value="success">Başarılı</MenuItem>
            <MenuItem value="failed">Hata</MenuItem>
            <MenuItem value="running">Çalışıyor</MenuItem>
            <MenuItem value="skipped">Atlandı</MenuItem>
          </Select>
        </FormControl>
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

export default BackupHistoryList;
