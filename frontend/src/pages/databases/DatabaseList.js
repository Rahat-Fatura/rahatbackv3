import React, { useState, useEffect, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Box, Button, Chip } from '@mui/material';
import { Database, Plus, RefreshCw, Trash2, Edit, TestTube, Clock } from 'lucide-react';
import Swal from 'sweetalert2';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import * as databaseApi from '../../api/database';
import * as agentApi from '../../api/agent';
import DatabaseFormModal from './DatabaseFormModal';
import BackupJobFormModal from './BackupJobFormModal';

const DatabaseList = () => {
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDatabase, setSelectedDatabase] = useState(null);
  const [backupJobModalOpen, setBackupJobModalOpen] = useState(false);
  const [selectedDatabaseForBackup, setSelectedDatabaseForBackup] = useState(null);

  const loadDatabases = async () => {
    setLoading(true);
    try {
      const data = await databaseApi.getDatabases();
      setRowData(data);
    } catch (error) {
      Swal.fire('Hata', 'Veritabanları yüklenirken hata oluştu', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDatabases();
  }, []);

  const handleTestConnection = async (id) => {
    try {
      const result = await databaseApi.testConnection(id);
      if (result.success) {
        Swal.fire('Başarılı', result.version ? `Bağlantı başarılı: ${result.version}` : 'Bağlantı başarılı', 'success');
      } else {
        Swal.fire('Hata', result.message ? `Bağlantı başarısız: ${result.message}` : 'Bağlantı başarısız', 'error');
      }
    } catch (error) {
      Swal.fire('Hata', 'Bağlantı testi başarısız', 'error');
    }
  };

  const handleEdit = (database) => {
    setSelectedDatabase(database);
    setModalOpen(true);
  };

  const handleDelete = async (id, name) => {
    const result = await Swal.fire({
      title: 'Emin misiniz?',
      text: `"${name}" veritabanı bağlantısı silinecek. Bu işlem geri alınamaz.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Evet, sil',
      cancelButtonText: 'İptal',
    });

    if (result.isConfirmed) {
      try {
        await databaseApi.deleteDatabase(id);
        Swal.fire('Silindi!', 'Veritabanı bağlantısı silindi.', 'success');
        loadDatabases();
      } catch (error) {
        Swal.fire('Hata', 'Silme işlemi başarısız', 'error');
      }
    }
  };

  const handleCreateBackup = (database) => {
    setSelectedDatabaseForBackup(database);
    setBackupJobModalOpen(true);
  };

  const handleAddDatabase = async () => {
    // Check if there's an online agent before opening the form
    const hasAgent = await agentApi.hasOnlineAgent();

    if (!hasAgent) {
      Swal.fire({
        icon: 'warning',
        title: 'Agent Bulunamadı',
        text: 'Veritabanı eklemek için önce desktop agent uygulamasını başlatmanız gerekiyor.',
        confirmButtonText: 'Tamam',
      });
      return;
    }

    setSelectedDatabase(null);
    setModalOpen(true);
  };

  const columnDefs = useMemo(() => [
    {
      headerName: 'Ad',
      field: 'name',
      filter: true,
      flex: 1,
      minWidth: 150,
    },
    {
      headerName: 'Tip',
      field: 'type',
      filter: true,
      width: 120,
      cellRenderer: (params) => {
        const colors = {
          postgresql: '#336791',
          mysql: '#00758F',
          mongodb: '#4DB33D',
          mssql: '#CC2927',
          mariadb: '#003545',
          sqlite: '#003B57',
        };
        return (
          <Chip
            label={params.value?.toUpperCase()}
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
      headerName: 'Host',
      field: 'host',
      filter: true,
      flex: 1,
      minWidth: 150,
    },
    {
      headerName: 'Port',
      field: 'port',
      width: 90,
    },
    {
      headerName: 'Veritabanı',
      field: 'database',
      filter: true,
      flex: 1,
      minWidth: 150,
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
      headerName: 'Yedek Sayısı',
      field: 'BackupJob',
      width: 120,
      valueGetter: (params) => params.data?.BackupJob?.length || 0,
    },
    {
      headerName: 'İşlemler',
      width: 230,
      cellRenderer: (params) => {
        return (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', height: '100%' }}>
            <Button
              size="small"
              variant="outlined"
              color="info"
              onClick={() => handleTestConnection(params.data.id)}
              title="Bağlantıyı Test Et"
            >
              <TestTube size={16} />
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="success"
              onClick={() => handleCreateBackup(params.data)}
              title="Backup Oluştur"
            >
              <Clock size={16} />
            </Button>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Database size={32} />
          <h2>Veritabanı Bağlantıları</h2>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshCw size={18} />}
            onClick={loadDatabases}
            disabled={loading}
          >
            Yenile
          </Button>
          <Button
            variant="contained"
            startIcon={<Plus size={18} />}
            onClick={handleAddDatabase}
          >
            Yeni Bağlantı
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

      <DatabaseFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedDatabase(null);
        }}
        database={selectedDatabase}
        onSuccess={loadDatabases}
      />

      <BackupJobFormModal
        open={backupJobModalOpen}
        onClose={() => {
          setBackupJobModalOpen(false);
          setSelectedDatabaseForBackup(null);
        }}
        database={selectedDatabaseForBackup}
        onSuccess={loadDatabases}
      />
    </Box>
  );
};

export default DatabaseList;
