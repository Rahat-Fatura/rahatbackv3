import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Box,
  CircularProgress,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import Swal from 'sweetalert2';
import * as databaseApi from '../../api/database';

const databaseTypes = [
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'mariadb', label: 'MariaDB' },
  { value: 'mongodb', label: 'MongoDB' },
  { value: 'mssql', label: 'MS SQL Server' },
  { value: 'sqlite', label: 'SQLite' },
];

const defaultPorts = {
  postgresql: 5432,
  mysql: 3306,
  mariadb: 3306,
  mongodb: 27017,
  mssql: 1433,
  sqlite: 0,
};

const DatabaseFormModal = ({ open, onClose, database, onSuccess }) => {
  const [saving, setSaving] = useState(false);
  const isEdit = !!database;

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: '',
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      username: '',
      password: '',
      database: '',
      connectionString: '',
      sslEnabled: false,
      isActive: true,
    },
  });

  const selectedType = watch('type');

  useEffect(() => {
    if (database) {
      reset({
        name: database.name || '',
        type: database.type || 'postgresql',
        host: database.host || 'localhost',
        port: database.port || 5432,
        username: database.username || '',
        password: '', // Don't pre-fill password for security
        database: database.database || '',
        connectionString: database.connectionString || '',
        sslEnabled: database.sslEnabled || false,
        isActive: database.isActive !== undefined ? database.isActive : true,
      });
    } else {
      reset({
        name: '',
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        username: '',
        password: '',
        database: '',
        connectionString: '',
        sslEnabled: false,
        isActive: true,
      });
    }
  }, [database, reset]);

  // Auto-update port when database type changes
  useEffect(() => {
    if (!isEdit) {
      setValue('port', defaultPorts[selectedType] || 5432);
    }
  }, [selectedType, isEdit, setValue]);

  const onSubmit = async (data) => {
    setSaving(true);
    try {
      if (isEdit) {
        // Remove type field when updating (type cannot be changed)
        const { type, ...updateData } = data;

        // Remove password if empty (user doesn't want to change it)
        if (!updateData.password || updateData.password.trim() === '') {
          delete updateData.password;
        }

        await databaseApi.updateDatabase(database.id, updateData);
        Swal.fire('Başarılı', 'Veritabanı güncellendi', 'success');
      } else {
        await databaseApi.createDatabase(data);
        Swal.fire('Başarılı', 'Veritabanı eklendi', 'success');
      }
      onSuccess();
      onClose();
    } catch (error) {
      Swal.fire('Hata', error.response?.data?.message || 'İşlem başarısız', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{isEdit ? 'Veritabanını Düzenle' : 'Yeni Veritabanı Ekle'}</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Controller
              name="name"
              control={control}
              rules={{ required: 'Ad zorunludur' }}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Bağlantı Adı"
                  fullWidth
                  error={!!errors.name}
                  helperText={errors.name?.message}
                  placeholder="Örn: Production Database"
                />
              )}
            />

            <Controller
              name="type"
              control={control}
              rules={{ required: 'Veritabanı tipi zorunludur' }}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Veritabanı Tipi"
                  fullWidth
                  disabled={isEdit}
                  helperText={isEdit ? 'Veritabanı tipi değiştirilemez' : ''}
                >
                  {databaseTypes.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />

            {selectedType !== 'mongodb' ? (
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Controller
                  name="host"
                  control={control}
                  rules={{ required: 'Host zorunludur' }}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Host"
                      fullWidth
                      error={!!errors.host}
                      helperText={errors.host?.message}
                    />
                  )}
                />
                <Controller
                  name="port"
                  control={control}
                  rules={{ required: 'Port zorunludur' }}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Port"
                      type="number"
                      sx={{ width: 120 }}
                      error={!!errors.port}
                      helperText={errors.port?.message}
                    />
                  )}
                />
              </Box>
            ) : (
              <Controller
                name="connectionString"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Connection String (Opsiyonel)"
                    fullWidth
                    placeholder="mongodb://username:password@host:port/database"
                    helperText="Boş bırakılırsa host, port, username bilgilerinden oluşturulur"
                  />
                )}
              />
            )}

            <Controller
              name="username"
              control={control}
              rules={{ required: 'Kullanıcı adı zorunludur' }}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Kullanıcı Adı"
                  fullWidth
                  error={!!errors.username}
                  helperText={errors.username?.message}
                />
              )}
            />

            <Controller
              name="password"
              control={control}
              rules={!isEdit ? { required: 'Şifre zorunludur' } : {}}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Şifre"
                  type="password"
                  fullWidth
                  error={!!errors.password}
                  helperText={errors.password?.message || (isEdit ? 'Değiştirmek için yeni şifre girin' : '')}
                />
              )}
            />

            <Controller
              name="database"
              control={control}
              rules={{ required: 'Veritabanı adı zorunludur' }}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Veritabanı Adı"
                  fullWidth
                  error={!!errors.database}
                  helperText={errors.database?.message}
                />
              )}
            />

            <Controller
              name="sslEnabled"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox {...field} checked={field.value} />}
                  label="SSL Bağlantısı Kullan"
                />
              )}
            />

            <Controller
              name="isActive"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox {...field} checked={field.value} />}
                  label="Aktif"
                />
              )}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>
            İptal
          </Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? <CircularProgress size={20} /> : isEdit ? 'Güncelle' : 'Ekle'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default DatabaseFormModal;
